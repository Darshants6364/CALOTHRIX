/**
 * CALOTHRIX — 14-Day Adaptive Assessment Engine (Deterministic Core)
 *
 * Pure, unit-testable TypeScript module shared by client and server.
 * Zero Gemini dependency: Gemini only explains outputs computed here.
 *
 * Weight Smoothing Algorithm:
 *   Exponentially Weighted Moving Average (EWMA) with alpha = 0.28 across daily
 *   averaged weigh-ins (up to 45 days historical window), paired with 7-day rolling
 *   averages so short-term water/sodium/glycogen noise never triggers knee-jerk calorie shifts.
 *
 * Distinct Operations:
 *   1. Weight-based recalculation (BMR, formula TDEE, protein/carbs/fat/fibre/hydration)
 *   2. Maintenance calibration (bounded confidence-weighted Adaptive TDEE)
 *   3. Calorie target adjustment (evidence-gated, adherence-gated, safety-bounded)
 */

import type {
  AdaptiveAiStructuredOutput,
  AdaptiveAssessmentStatusTag,
  AssessmentConfidenceLevel,
  DailyNutritionSummary,
  GoalSpeed,
  NutritionGoals,
  SmartFitnessGoalType,
  UserProfile,
  WeeklyAdjustmentType,
  WeeklyAssessmentAiExplanation,
  WeeklyAssessmentDueStatus,
  WeeklyAssessmentRecord,
  WeightEntry,
} from '../types/index.ts';
import {
  allocateMacrosForCalories,
  CALCULATION_VERSION,
  calculateBmi,
  calculateSmartFitnessTargets,
  estimateHydrationMl,
  normalizeFitnessGoal,
  normalizeMacroFocus,
  SMART_FITNESS_GOAL_META,
} from './fitnessCalculator.ts';
import { addDaysToDateKey, getTodayDateKey, parseLocalDateKey } from './dateUtils.ts';

export const ASSESSMENT_CYCLE_DAYS = 14;
export const EWMA_ALPHA = 0.28;
export const MAX_WEEKLY_TDEE_SHIFT_KCAL = 150;
export const MIN_FOOD_DAYS_FOR_TUNING = 9;
export const MIN_WEIGHT_DAYS_FOR_TUNING = 5;
export const MIN_ADHERENCE_PCT_FOR_TUNING = 75;

export interface WeightTrendAnalysis {
  latestMeasuredWeightKg: number;
  previousMeasuredWeightKg: number;
  current7dAvgWeightKg: number;
  previous7dAvgWeightKg: number;
  assessedTrendWeightKg: number;
  previousTrendWeightKg: number;
  cycleWeightChangeKg: number;
  weeklyWeightChangeKg: number;
  weeklyWeightChangePct: number;
  multiWeekWeeklyRateKg: number | null;
  weightLoggedDaysCurrentWeek: number;
  weightLoggedDaysPreviousWeek: number;
  totalDaysInHistory: number;
  hasMultiWeekHistory: boolean;
  algorithm: 'ewma_alpha_0.28';
}

export interface DeterministicWeeklyAssessmentInput {
  userId: string;
  profile: UserProfile;
  goals: NutritionGoals;
  weightEntries: WeightEntry[];
  dailyNutrition: DailyNutritionSummary[];
  previousAssessments?: WeeklyAssessmentRecord[];
  referenceDateKey?: string; // Defaults to today (YYYY-MM-DD)
  assessmentWeekNumber?: number; // Cycle number (1, 2, 3...)
}

export interface DeterministicWeeklyAssessmentOutput {
  weekStartDate: string;
  weekEndDate: string;
  assessmentWeekNumber: number;
  cycleDays: number;
  weightAnalysis: WeightTrendAnalysis;
  foodLoggedDays: number;
  weightLoggedDays: number;
  loggingCompletenessPct: number;
  adherencePercentage: number;
  avgDailyCalories: number;
  avgDailyProtein: number;
  avgDailyCarbs: number;
  avgDailyFat: number;
  avgDailyFibre: number;
  confidenceLevel: AssessmentConfidenceLevel;
  confidenceReasons: string[];
  estimatedBmr: number;
  estimatedTdeeKcal: number;
  priorTdeeKcal: number;
  calibratedTdeeKcal: number;
  inferredTdeeKcal: number | null;
  previousRecommendedCalories: number;
  recommendedCalories: number;
  calorieDeltaKcal: number;
  previousRecommendedProtein: number;
  previousRecommendedCarbs: number;
  previousRecommendedFat: number;
  previousRecommendedFibre: number;
  recommendedProtein: number;
  recommendedCarbs: number;
  recommendedFat: number;
  recommendedFibre: number;
  recommendedHydrationMl: number;
  projectedWeeksToGoal: number | null;
  adjustmentType: WeeklyAdjustmentType;
  statusTag: AdaptiveAssessmentStatusTag;
  adjustmentReason: string;
  goalCompleted: boolean;
  suggestedMaintenanceCalories: number | null;
  rationaleBullets: string[];
  fallbackAiSummary: WeeklyAssessmentAiExplanation;
  calculationVersion: string;
  normalizedGoal: SmartFitnessGoalType;
  goalSpeed: GoalSpeed;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function daysBetweenDateKeys(startKey: string, endKey: string): number {
  const start = parseLocalDateKey(startKey).getTime();
  const end = parseLocalDateKey(endKey).getTime();
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
}

/**
 * Collapses multiple weigh-ins on the same date into a single daily mean, sorted oldest -> newest.
 */
export function aggregateDailyWeights(entries: WeightEntry[]): { date: string; weightKg: number }[] {
  const map = new Map<string, number[]>();
  for (const e of entries) {
    if (!e.date || !Number.isFinite(e.weightKg) || e.weightKg < 25 || e.weightKg > 350) continue;
    const list = map.get(e.date) || [];
    list.push(e.weightKg);
    map.set(e.date, list);
  }
  return Array.from(map.entries())
    .map(([date, vals]) => ({
      date,
      weightKg: round2(vals.reduce((s, v) => s + v, 0) / vals.length),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Computes EWMA trend series and rolling 7-day averages across the 14-day cycle while separating measured vs smoothed weight.
 */
export function analyzeWeightTrend(
  weightEntries: WeightEntry[],
  cycleStartDate: string,
  cycleEndDate: string,
  fallbackWeightKg: number,
  priorAssessment?: WeeklyAssessmentRecord | null
): WeightTrendAnalysis {
  const daily = aggregateDailyWeights(weightEntries).filter((d) => d.date <= cycleEndDate);
  const window45Start = addDaysToDateKey(cycleEndDate, -44);
  const current7dStart = addDaysToDateKey(cycleEndDate, -6);
  const prevCycleStart = addDaysToDateKey(cycleStartDate, -ASSESSMENT_CYCLE_DAYS);
  const prevCycleEnd = addDaysToDateKey(cycleStartDate, -1);

  const recent45 = daily.filter((d) => d.date >= window45Start);
  const currentCycleEntries = daily.filter(
    (d) => d.date >= cycleStartDate && d.date <= cycleEndDate
  );
  const prevCycleEntries = daily.filter(
    (d) => d.date >= prevCycleStart && d.date <= prevCycleEnd
  );

  // Rolling 7-day averages: last 7 days vs earlier portion / prior cycle
  const current7dEntries = daily.filter(
    (d) => d.date >= current7dStart && d.date <= cycleEndDate
  );
  const earlyCycleEntries = daily.filter(
    (d) => d.date >= cycleStartDate && d.date < current7dStart
  );
  const prevWindow7dStart = addDaysToDateKey(current7dStart, -7);
  const prevWindow7dEnd = addDaysToDateKey(current7dStart, -1);
  const prev7dEntries = daily.filter(
    (d) => d.date >= prevWindow7dStart && d.date <= prevWindow7dEnd
  );

  const safeFallback = fallbackWeightKg > 25 ? fallbackWeightKg : 65;

  // Build EWMA over the 45-day window (or all available entries up to cycleEndDate)
  const seriesSource = recent45.length > 0 ? recent45 : daily;
  const ewmaPoints: { date: string; measured: number; trend: number }[] = [];

  for (const pt of seriesSource) {
    if (ewmaPoints.length === 0) {
      ewmaPoints.push({ date: pt.date, measured: pt.weightKg, trend: pt.weightKg });
    } else {
      const prevTrend = ewmaPoints[ewmaPoints.length - 1].trend;
      const nextTrend = EWMA_ALPHA * pt.weightKg + (1 - EWMA_ALPHA) * prevTrend;
      ewmaPoints.push({ date: pt.date, measured: pt.weightKg, trend: round2(nextTrend) });
    }
  }

  const latestMeasuredWeightKg =
    currentCycleEntries.length > 0
      ? currentCycleEntries[currentCycleEntries.length - 1].weightKg
      : daily.length > 0
      ? daily[daily.length - 1].weightKg
      : safeFallback;

  const current7dAvgWeightKg =
    current7dEntries.length > 0
      ? round2(
          current7dEntries.reduce((s, d) => s + d.weightKg, 0) / current7dEntries.length
        )
      : currentCycleEntries.length > 0
      ? round2(
          currentCycleEntries.reduce((s, d) => s + d.weightKg, 0) / currentCycleEntries.length
        )
      : latestMeasuredWeightKg;

  const previous7dAvgWeightKg =
    priorAssessment?.current7dAvgWeightKg && prevCycleEntries.length === 0
      ? priorAssessment.current7dAvgWeightKg
      : prev7dEntries.length > 0
      ? round2(prev7dEntries.reduce((s, d) => s + d.weightKg, 0) / prev7dEntries.length)
      : earlyCycleEntries.length > 0
      ? round2(earlyCycleEntries.reduce((s, d) => s + d.weightKg, 0) / earlyCycleEntries.length)
      : priorAssessment?.assessedWeightKg ??
        (currentCycleEntries.length >= 2 ? currentCycleEntries[0].weightKg : safeFallback);

  const previousMeasuredWeightKg =
    priorAssessment?.assessedWeightKg ??
    (prevCycleEntries.length > 0
      ? prevCycleEntries[prevCycleEntries.length - 1].weightKg
      : currentCycleEntries.length >= 2
      ? currentCycleEntries[0].weightKg
      : safeFallback);

  const assessedTrendWeightKg =
    ewmaPoints.length > 0 ? ewmaPoints[ewmaPoints.length - 1].trend : latestMeasuredWeightKg;

  const priorEwmaPoints = ewmaPoints.filter((p) => p.date <= prevCycleEnd);
  const previousTrendWeightKg =
    priorAssessment?.assessedTrendWeightKg ??
    (priorEwmaPoints.length > 0
      ? priorEwmaPoints[priorEwmaPoints.length - 1].trend
      : ewmaPoints.length >= 2
      ? ewmaPoints[0].trend
      : previousMeasuredWeightKg);

  const cycleWeightChangeKg = round2(assessedTrendWeightKg - previousTrendWeightKg);

  // Normalize weekly rate over the actual elapsed span of this cycle (~13–14 days)
  let weeklySpanDays = 14;
  if (priorEwmaPoints.length > 0 && ewmaPoints.length > 0) {
    const anchorDate = priorEwmaPoints[priorEwmaPoints.length - 1].date;
    const endDate = ewmaPoints[ewmaPoints.length - 1].date;
    weeklySpanDays = Math.max(7, Math.min(21, daysBetweenDateKeys(anchorDate, endDate)));
  } else if (ewmaPoints.length >= 2) {
    const first = ewmaPoints[0];
    const last = ewmaPoints[ewmaPoints.length - 1];
    weeklySpanDays = Math.max(7, Math.min(21, daysBetweenDateKeys(first.date, last.date)));
  }

  const weeklyWeightChangeKg = round2((cycleWeightChangeKg / weeklySpanDays) * 7);
  const weeklyWeightChangePct =
    previousTrendWeightKg > 0
      ? round2((weeklyWeightChangeKg / previousTrendWeightKg) * 100)
      : 0;

  // Compute multi-week rate (14–45 days) when available for plateau / trend confidence
  let multiWeekWeeklyRateKg: number | null = null;
  let totalDaysInHistory = 0;
  if (ewmaPoints.length >= 2) {
    const first = ewmaPoints[0];
    const last = ewmaPoints[ewmaPoints.length - 1];
    totalDaysInHistory = Math.max(0, daysBetweenDateKeys(first.date, last.date));
    if (totalDaysInHistory >= 12) {
      multiWeekWeeklyRateKg = round2(((last.trend - first.trend) / totalDaysInHistory) * 7);
    }
  }

  return {
    latestMeasuredWeightKg: round2(latestMeasuredWeightKg),
    previousMeasuredWeightKg: round2(previousMeasuredWeightKg),
    current7dAvgWeightKg,
    previous7dAvgWeightKg,
    assessedTrendWeightKg: round2(assessedTrendWeightKg),
    previousTrendWeightKg: round2(previousTrendWeightKg),
    cycleWeightChangeKg,
    weeklyWeightChangeKg,
    weeklyWeightChangePct,
    multiWeekWeeklyRateKg,
    weightLoggedDaysCurrentWeek: currentCycleEntries.length,
    weightLoggedDaysPreviousWeek: prevCycleEntries.length,
    totalDaysInHistory,
    hasMultiWeekHistory:
      totalDaysInHistory >= 14 && (prevCycleEntries.length >= 2 || Boolean(priorAssessment)),
    algorithm: 'ewma_alpha_0.28',
  };
}

/**
 * Helper to aggregate FoodLogEntry[] into DailyNutritionSummary[] cleanly.
 */
export function buildDailyNutritionSummaries(
  entries: Array<{
    date: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fibre: number;
  }>,
  startDate: string,
  endDate: string
): DailyNutritionSummary[] {
  const byDate = new Map<string, DailyNutritionSummary>();
  for (const e of entries) {
    if (!e.date || e.date < startDate || e.date > endDate) continue;
    const existing = byDate.get(e.date) || {
      date: e.date,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fibre: 0,
      entryCount: 0,
    };
    existing.calories += Number(e.calories) || 0;
    existing.protein += Number(e.protein) || 0;
    existing.carbs += Number(e.carbs) || 0;
    existing.fat += Number(e.fat) || 0;
    existing.fibre += Number(e.fibre) || 0;
    existing.entryCount += 1;
    byDate.set(e.date, existing);
  }
  return Array.from(byDate.values())
    .map((d) => ({
      ...d,
      calories: Math.round(d.calories),
      protein: round1(d.protein),
      carbs: round1(d.carbs),
      fat: round1(d.fat),
      fibre: round1(d.fibre),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function deriveAssessmentStatusTag(
  adjustmentType: WeeklyAdjustmentType,
  confidenceLevel: AssessmentConfidenceLevel,
  calorieDeltaKcal: number,
  adherencePercentage: number
): AdaptiveAssessmentStatusTag {
  if (confidenceLevel === 'low' || adjustmentType === 'insufficient_data') {
    return 'insufficient_data';
  }
  if (calorieDeltaKcal !== 0 || adjustmentType === 'goal_completed_maintenance') {
    return 'targets_updated';
  }
  if (adherencePercentage < MIN_ADHERENCE_PCT_FOR_TUNING || adjustmentType === 'safety_guarded') {
    return 'needs_attention';
  }
  return 'on_track';
}

/**
 * Deterministic fallback explanation when Gemini is unavailable, times out, or fails schema validation.
 * Never invents numbers; strictly narrates the deterministic engine's outputs.
 */
export function buildDeterministicWeeklyExplanation(
  out: Omit<DeterministicWeeklyAssessmentOutput, 'fallbackAiSummary'>,
  profile: UserProfile
): WeeklyAssessmentAiExplanation {
  const goalLabel = SMART_FITNESS_GOAL_META[out.normalizedGoal].label;
  const cycleNum = out.assessmentWeekNumber;
  const deltaKg = out.weightAnalysis.cycleWeightChangeKg;
  const deltaSign = deltaKg > 0 ? '+' : '';
  const weightDir =
    Math.abs(deltaKg) < 0.08
      ? 'remained steady'
      : deltaKg > 0
      ? `increased by ${deltaSign}${deltaKg.toFixed(2)} kg (smoothed trend)`
      : `decreased by ${Math.abs(deltaKg).toFixed(2)} kg (smoothed trend)`;

  let headline = `Cycle ${cycleNum} (14-Day) Check-In: Weight ${out.weightAnalysis.latestMeasuredWeightKg.toFixed(1)} kg — Targets Reviewed`;
  if (out.goalCompleted) {
    headline = `Goal Weight Reached (${out.weightAnalysis.latestMeasuredWeightKg.toFixed(1)} kg) — Maintenance Transition Ready`;
  } else if (out.confidenceLevel === 'low') {
    headline = `Cycle ${cycleNum} Review: More Tracking Needed — Keeping Current Targets`;
  } else if (out.calorieDeltaKcal > 0) {
    headline = `Your 14-Day Progress Review: +${out.calorieDeltaKcal} kcal Update for ${goalLabel}`;
  } else if (out.calorieDeltaKcal < 0) {
    headline = `Your 14-Day Progress Review: ${out.calorieDeltaKcal} kcal Adjustment for ${goalLabel}`;
  } else {
    headline = `Your 14-Day Progress Review: Weight ${out.weightAnalysis.latestMeasuredWeightKg.toFixed(1)} kg — On Track`;
  }

  const bodyChangeAnalysis =
    `Your 7-day average weight moved from ${out.weightAnalysis.previous7dAvgWeightKg.toFixed(1)} kg to ${out.weightAnalysis.current7dAvgWeightKg.toFixed(1)} kg (latest weigh-in ${out.weightAnalysis.latestMeasuredWeightKg.toFixed(1)} kg), ` +
    `while your smoothed trend ${weightDir} (${out.weightAnalysis.previousTrendWeightKg.toFixed(1)} → ${out.weightAnalysis.assessedTrendWeightKg.toFixed(1)} kg). ` +
    `Day-to-day scale shifts naturally reflect water and meal timing alongside real progress.`;

  const calorieAdjustmentReason = out.adjustmentReason;

  const isVeg = profile.dietaryPreference === 'vegetarian' || profile.dietaryPreference === 'vegan';
  const proteinFoods = isVeg
    ? 'paneer/tofu bhurji, Greek yogurt/hung curd, roasted chana, moong dal chilla, or soy chunks'
    : 'grilled chicken breast, boiled eggs, fish curry, paneer tikka, or Greek yogurt';
  const carbFoods =
    out.normalizedGoal === 'fat_gain' || out.normalizedGoal === 'build_muscle'
      ? 'oats with banana & peanut butter, cooked rice with dal, whole-wheat roti, or ragi malt'
      : 'whole-wheat roti, dal with measured rice, millets (jowar/ragi), and high-fibre vegetables';

  const actionableTips: string[] = [];
  if (out.confidenceLevel === 'low') {
    actionableTips.push(
      `Log meals on at least ${MIN_FOOD_DAYS_FOR_TUNING} of ${ASSESSMENT_CYCLE_DAYS} days so your intake average reflects true consumption.`
    );
    actionableTips.push(
      `Record at least ${MIN_WEIGHT_DAYS_FOR_TUNING} morning weigh-ins across the ${ASSESSMENT_CYCLE_DAYS}-day window under consistent conditions.`
    );
    actionableTips.push(
      `Aim for ~${out.recommendedProtein} g daily protein using staples like ${proteinFoods}.`
    );
  } else if (out.goalCompleted) {
    actionableTips.push(
      `Transition to your estimated maintenance target of ${out.calibratedTdeeKcal.toLocaleString()} kcal/day for 2–4 weeks to stabilize.`
    );
    actionableTips.push(
      `Keep protein steady near ${out.recommendedProtein} g/day (${proteinFoods}) while keeping resistance training consistent.`
    );
    actionableTips.push(
      `Once weight stabilizes, select your next phase—such as Body Recomposition, Build Muscle, or Maintain Weight.`
    );
  } else {
    if (out.avgDailyProtein < out.recommendedProtein * 0.88) {
      actionableTips.push(
        `Your 14-day protein averaged ${Math.round(out.avgDailyProtein)} g vs ${out.recommendedProtein} g target—add 25–30 g protein per meal with ${proteinFoods}.`
      );
    } else {
      actionableTips.push(
        `Protein consistency is solid (${Math.round(out.avgDailyProtein)} g/day)—keep meals anchored around ${proteinFoods} to hit ${out.recommendedProtein} g/day.`
      );
    }
    actionableTips.push(
      `Center energy around ${out.recommendedCalories.toLocaleString()} kcal/day using ${carbFoods} and ~${out.recommendedFibre} g fibre.`
    );
    actionableTips.push(
      `Keep logging weigh-ins 3+ times per week so your next 14-day review stays sharp and accurate.`
    );
  }

  const confidenceExplanation =
    `Data confidence is ${out.confidenceLevel.toUpperCase()} based on ${out.foodLoggedDays}/${ASSESSMENT_CYCLE_DAYS} logged food days, ` +
    `${out.weightLoggedDays}/${ASSESSMENT_CYCLE_DAYS} weigh-ins, and ${Math.round(out.adherencePercentage)}% target consistency` +
    (out.weightAnalysis.hasMultiWeekHistory
      ? ` across ${out.weightAnalysis.totalDaysInHistory} days of weight history.`
      : ' (early 14-day baseline; subsequent reviews increase calibration precision).');

  const calorieAction: AdaptiveAiStructuredOutput['calorie_action'] =
    out.adjustmentType === 'insufficient_data'
      ? 'preserve'
      : out.calorieDeltaKcal > 0
      ? 'increase'
      : out.calorieDeltaKcal < 0
      ? 'decrease'
      : 'maintain';

  const conciseSummary =
    out.confidenceLevel === 'low'
      ? `Logged ${out.foodLoggedDays}/${ASSESSMENT_CYCLE_DAYS} food days and ${out.weightLoggedDays} weigh-ins. Targets are held at ${out.recommendedCalories.toLocaleString()} kcal until more data is logged.`
      : out.calorieDeltaKcal === 0
      ? `7-day average weight is ${out.weightAnalysis.current7dAvgWeightKg.toFixed(1)} kg (${deltaSign}${deltaKg.toFixed(2)} kg smoothed). Staying at ${out.recommendedCalories.toLocaleString()} kcal/day keeps you aligned with ${goalLabel}.`
      : `7-day average weight is ${out.weightAnalysis.current7dAvgWeightKg.toFixed(1)} kg (${deltaSign}${deltaKg.toFixed(2)} kg smoothed) with ${Math.round(out.adherencePercentage)}% adherence. Adjusting target to ${out.recommendedCalories.toLocaleString()} kcal/day (${out.calorieDeltaKcal > 0 ? '+' : ''}${out.calorieDeltaKcal} kcal).`;

  const structured: AdaptiveAiStructuredOutput = {
    status: out.statusTag,
    summary: conciseSummary,
    weight_change_kg: deltaKg,
    calorie_action: calorieAction,
    previous_calories: out.previousRecommendedCalories,
    recommended_calories: out.recommendedCalories,
    protein_g: out.recommendedProtein,
    carbs_g: out.recommendedCarbs,
    fat_g: out.recommendedFat,
    reason: out.adjustmentReason,
    confidence: out.confidenceLevel,
  };

  return {
    headline,
    bodyChangeAnalysis,
    calorieAdjustmentReason,
    actionableTips: actionableTips.slice(0, 3),
    confidenceExplanation,
    provider: 'deterministic',
    structured,
  };
}

/**
 * Core 14-Day Deterministic Adaptive Assessment Engine.
 */
export function runDeterministicWeeklyAssessment(
  input: DeterministicWeeklyAssessmentInput
): DeterministicWeeklyAssessmentOutput {
  const weekEndDate = input.referenceDateKey || getTodayDateKey();
  const weekStartDate = addDaysToDateKey(weekEndDate, -(ASSESSMENT_CYCLE_DAYS - 1));

  const sortedPrevious = [...(input.previousAssessments || [])]
    .filter((a) => a.status === 'applied')
    .sort((a, b) => b.weekEndDate.localeCompare(a.weekEndDate));
  const lastApplied = sortedPrevious[0] || null;

  const assessmentWeekNumber =
    input.assessmentWeekNumber ??
    Math.max(1, (input.goals.assessmentWeekNumber || sortedPrevious.length || 0) + 1);

  const normalizedGoal = normalizeFitnessGoal(input.profile.fitnessGoal);
  const goalSpeed: GoalSpeed = input.profile.goalSpeed || input.goals.goalSpeed || 'moderate';
  const macroFocus = normalizeMacroFocus(input.profile.macroFocus || input.goals.macroFocus);

  const baselineWeightKg =
    input.profile.currentWeightKg > 25 ? input.profile.currentWeightKg : 65;

  // 1. Analyze measured vs trend weight across 14-day window (with up to 45d history)
  const weightAnalysis = analyzeWeightTrend(
    input.weightEntries,
    weekStartDate,
    weekEndDate,
    baselineWeightKg,
    lastApplied
  );

  // 2. Analyze food logging completeness vs calorie adherence (strictly separate!)
  const cycleNutrition = input.dailyNutrition.filter(
    (d) => d.date >= weekStartDate && d.date <= weekEndDate && d.calories > 0
  );
  const foodLoggedDays = cycleNutrition.length;
  const weightLoggedDays = weightAnalysis.weightLoggedDaysCurrentWeek;
  const loggingCompletenessPct = Math.round((foodLoggedDays / ASSESSMENT_CYCLE_DAYS) * 100);

  const avgDailyCalories =
    foodLoggedDays > 0
      ? Math.round(cycleNutrition.reduce((s, d) => s + d.calories, 0) / foodLoggedDays)
      : 0;
  const avgDailyProtein =
    foodLoggedDays > 0
      ? round1(cycleNutrition.reduce((s, d) => s + d.protein, 0) / foodLoggedDays)
      : 0;
  const avgDailyCarbs =
    foodLoggedDays > 0
      ? round1(cycleNutrition.reduce((s, d) => s + d.carbs, 0) / foodLoggedDays)
      : 0;
  const avgDailyFat =
    foodLoggedDays > 0
      ? round1(cycleNutrition.reduce((s, d) => s + d.fat, 0) / foodLoggedDays)
      : 0;
  const avgDailyFibre =
    foodLoggedDays > 0
      ? round1(cycleNutrition.reduce((s, d) => s + (d.fibre || 0), 0) / foodLoggedDays)
      : 0;

  // Previous targets
  const initialCalc = calculateSmartFitnessTargets({
    age: input.profile.age || 25,
    biologicalSex: input.profile.biologicalSex || 'male',
    heightCm: input.profile.heightCm || 170,
    currentWeightKg: weightAnalysis.previousMeasuredWeightKg || baselineWeightKg,
    targetWeightKg: input.profile.targetWeightKg || input.goals.targetWeightKg || baselineWeightKg,
    dailyAverageSteps: input.profile.dailyAverageSteps ?? 7500,
    activityLevel: input.profile.activityLevel || 'moderate',
    workoutFrequencyPerWeek: input.profile.workoutFrequencyPerWeek ?? 3,
    workoutIntensity: input.profile.workoutIntensity || 'moderate',
    fitnessGoal: normalizedGoal,
    goalSpeed,
    macroFocus,
    bodyFatPct: input.profile.bodyFatPct,
    isPregnantOrBreastfeeding: input.profile.isPregnantOrBreastfeeding,
  });

  const previousRecommendedCalories =
    input.goals.calories > 0 ? Math.round(input.goals.calories) : initialCalc.recommendedCalories;
  const previousRecommendedProtein =
    input.goals.protein > 0 ? Math.round(input.goals.protein) : initialCalc.proteinGrams;
  const previousRecommendedCarbs =
    input.goals.carbs > 0 ? Math.round(input.goals.carbs) : initialCalc.carbsGrams;
  const previousRecommendedFat =
    input.goals.fat > 0 ? Math.round(input.goals.fat) : initialCalc.fatGrams;
  const previousRecommendedFibre =
    input.goals.fibre > 0 ? Math.round(input.goals.fibre) : initialCalc.fibreGrams;

  // Calorie adherence: closeness of each logged day to previousRecommendedCalories
  const adherencePercentage =
    foodLoggedDays > 0 && previousRecommendedCalories > 0
      ? round1(
          cycleNutrition.reduce((sum, day) => {
            const devPct =
              Math.abs(day.calories - previousRecommendedCalories) / previousRecommendedCalories;
            return sum + Math.max(0, 100 - Math.min(100, devPct * 100));
          }, 0) / foodLoggedDays
        )
      : 0;

  // 3. Data Quality Gate (14-day window thresholds)
  const confidenceReasons: string[] = [];
  if (foodLoggedDays < MIN_FOOD_DAYS_FOR_TUNING) {
    confidenceReasons.push(
      `Only ${foodLoggedDays}/${ASSESSMENT_CYCLE_DAYS} food days logged (need at least ${MIN_FOOD_DAYS_FOR_TUNING} days).`
    );
  }
  if (weightLoggedDays < MIN_WEIGHT_DAYS_FOR_TUNING) {
    confidenceReasons.push(
      `Only ${weightLoggedDays}/${ASSESSMENT_CYCLE_DAYS} weigh-ins recorded (need at least ${MIN_WEIGHT_DAYS_FOR_TUNING} distributed check-ins).`
    );
  }
  if (avgDailyCalories <= 0) {
    confidenceReasons.push(`Missing daily calorie intake data for this ${ASSESSMENT_CYCLE_DAYS}-day cycle.`);
  }
  if (adherencePercentage < MIN_ADHERENCE_PCT_FOR_TUNING && foodLoggedDays >= MIN_FOOD_DAYS_FOR_TUNING) {
    confidenceReasons.push(
      `Target consistency was ${Math.round(adherencePercentage)}% (adjustments work best at ~${MIN_ADHERENCE_PCT_FOR_TUNING}%+ consistency).`
    );
  }

  let confidenceLevel: AssessmentConfidenceLevel = 'low';
  const hasMinimumData =
    foodLoggedDays >= MIN_FOOD_DAYS_FOR_TUNING &&
    weightLoggedDays >= MIN_WEIGHT_DAYS_FOR_TUNING &&
    avgDailyCalories > 0;

  if (!hasMinimumData) {
    confidenceLevel = 'low';
  } else if (
    foodLoggedDays >= 11 &&
    weightLoggedDays >= 7 &&
    adherencePercentage >= 80 &&
    (weightAnalysis.hasMultiWeekHistory || assessmentWeekNumber >= 2)
  ) {
    confidenceLevel = 'high';
  } else {
    confidenceLevel = 'moderate';
  }

  // 4. Operation #1 — Weight-based Recalculation using latest reliable weight
  const reliableWeightKg =
    weightLoggedDays >= MIN_WEIGHT_DAYS_FOR_TUNING
      ? weightAnalysis.assessedTrendWeightKg
      : weightAnalysis.latestMeasuredWeightKg;

  const targetWeightKg =
    input.profile.targetWeightKg > 0
      ? input.profile.targetWeightKg
      : input.goals.targetWeightKg && input.goals.targetWeightKg > 0
      ? input.goals.targetWeightKg
      : reliableWeightKg;

  const recalculated = calculateSmartFitnessTargets({
    age: input.profile.age || 25,
    biologicalSex: input.profile.biologicalSex || 'male',
    heightCm: input.profile.heightCm || 170,
    currentWeightKg: reliableWeightKg,
    targetWeightKg,
    dailyAverageSteps: input.profile.dailyAverageSteps ?? 7500,
    activityLevel: input.profile.activityLevel || 'moderate',
    workoutFrequencyPerWeek: input.profile.workoutFrequencyPerWeek ?? 3,
    workoutIntensity: input.profile.workoutIntensity || 'moderate',
    fitnessGoal: normalizedGoal,
    goalSpeed,
    macroFocus,
    bodyFatPct: input.profile.bodyFatPct,
    isPregnantOrBreastfeeding: input.profile.isPregnantOrBreastfeeding,
  });

  const estimatedBmr = recalculated.bmr;
  const estimatedTdeeKcal = recalculated.estimatedTdeeKcal;
  const priorTdeeKcal =
    input.goals.adaptiveTdeeKcal ||
    input.profile.adaptiveTdeeKcal ||
    input.goals.estimatedTdee ||
    estimatedTdeeKcal;

  // 5. Operation #2 — Maintenance Calibration (Adaptive TDEE)
  let inferredTdeeKcal: number | null = null;
  let calibratedTdeeKcal = estimatedTdeeKcal;

  if (confidenceLevel !== 'low' && avgDailyCalories > 0) {
    const weeklyTrendDeltaKg =
      weightAnalysis.multiWeekWeeklyRateKg !== null
        ? weightAnalysis.multiWeekWeeklyRateKg
        : weightAnalysis.weeklyWeightChangeKg;
    const approxDailyEnergyChange = (weeklyTrendDeltaKg * 7700) / 7;
    const rawInferred = Math.round(avgDailyCalories - approxDailyEnergyChange);

    // Sanity check inferred TDEE to ignore physiological outliers
    if (
      rawInferred >= Math.round(estimatedTdeeKcal * 0.65) &&
      rawInferred <= Math.round(estimatedTdeeKcal * 1.4)
    ) {
      inferredTdeeKcal = rawInferred;
    }

    // Cycle 1 rule: stay anchored to formula TDEE as primary starting estimate unless strong multi-week history exists
    if (assessmentWeekNumber <= 1 && !weightAnalysis.hasMultiWeekHistory) {
      calibratedTdeeKcal = estimatedTdeeKcal;
    } else if (inferredTdeeKcal !== null) {
      const blendWeight = confidenceLevel === 'high' ? 0.35 : 0.22;
      const blended = Math.round(priorTdeeKcal * (1 - blendWeight) + inferredTdeeKcal * blendWeight);
      const clampedShift = Math.max(
        -MAX_WEEKLY_TDEE_SHIFT_KCAL,
        Math.min(MAX_WEEKLY_TDEE_SHIFT_KCAL, blended - priorTdeeKcal)
      );
      calibratedTdeeKcal = Math.max(1150, priorTdeeKcal + clampedShift);
    } else {
      calibratedTdeeKcal = priorTdeeKcal;
    }
  } else {
    calibratedTdeeKcal = priorTdeeKcal;
  }

  // 6. Goal Completion Detection (Loss or Gain)
  const hadLossGoal = normalizedGoal === 'lose_weight';
  const hadGainGoal = normalizedGoal === 'fat_gain' || normalizedGoal === 'build_muscle';
  const startedAboveTarget =
    weightAnalysis.previousTrendWeightKg > targetWeightKg + 0.1 ||
    baselineWeightKg > targetWeightKg + 0.1;
  const startedBelowTarget =
    weightAnalysis.previousTrendWeightKg < targetWeightKg - 0.1 ||
    baselineWeightKg < targetWeightKg - 0.1;

  const reachedLossTarget =
    hadLossGoal &&
    targetWeightKg > 0 &&
    (startedAboveTarget || Math.abs(weightAnalysis.latestMeasuredWeightKg - targetWeightKg) <= 0.25) &&
    weightAnalysis.assessedTrendWeightKg <= targetWeightKg + 0.25 &&
    weightAnalysis.latestMeasuredWeightKg <= targetWeightKg + 0.35;

  const reachedGainTarget =
    hadGainGoal &&
    targetWeightKg > 0 &&
    (startedBelowTarget || Math.abs(weightAnalysis.latestMeasuredWeightKg - targetWeightKg) <= 0.25) &&
    weightAnalysis.assessedTrendWeightKg >= targetWeightKg - 0.25 &&
    weightAnalysis.latestMeasuredWeightKg >= targetWeightKg - 0.35;

  const goalCompleted = Boolean(reachedLossTarget || reachedGainTarget);

  // 7. Operation #3 — Evidence-Gated Calorie Target Adjustment
  let targetCaloriesNext = previousRecommendedCalories;
  let adjustmentType: WeeklyAdjustmentType = 'maintained';
  let adjustmentReason = '';
  let suggestedMaintenanceCalories: number | null = null;
  const rationaleBullets: string[] = [];

  if (recalculated.pathway !== 'adult' && recalculated.deficitBlocked) {
    targetCaloriesNext = recalculated.recommendedCalories;
    adjustmentType = 'safety_guarded';
    adjustmentReason =
      recalculated.safetyNote ||
      'Safety pathway active: automatic calorie deficits are disabled and maintenance-anchored targets are preserved.';
    rationaleBullets.push(adjustmentReason);
  } else if (confidenceLevel === 'low') {
    targetCaloriesNext = previousRecommendedCalories;
    adjustmentType = 'insufficient_data';
    adjustmentReason = `Insufficient tracking data (${foodLoggedDays}/${ASSESSMENT_CYCLE_DAYS} food days, ${weightLoggedDays}/${ASSESSMENT_CYCLE_DAYS} weigh-ins). Calorie targets were kept unchanged at ${previousRecommendedCalories.toLocaleString()} kcal/day until at least ${MIN_FOOD_DAYS_FOR_TUNING} food days and ${MIN_WEIGHT_DAYS_FOR_TUNING} weigh-ins are logged.`;
    rationaleBullets.push(...confidenceReasons);
    rationaleBullets.push('Existing daily calorie and macro targets preserved to avoid noise-driven changes.');
  } else if (goalCompleted) {
    suggestedMaintenanceCalories = calibratedTdeeKcal;
    targetCaloriesNext = calibratedTdeeKcal;
    adjustmentType = 'goal_completed_maintenance';
    adjustmentReason = `Target weight (${targetWeightKg.toFixed(1)} kg) has been reached (measured ${weightAnalysis.latestMeasuredWeightKg.toFixed(1)} kg, trend ${weightAnalysis.assessedTrendWeightKg.toFixed(1)} kg). Stopping the previous ${hadLossGoal ? 'deficit' : 'surplus'} and recommending a transition to estimated maintenance (~${calibratedTdeeKcal.toLocaleString()} kcal/day).`;
    rationaleBullets.push(`Goal weight of ${targetWeightKg.toFixed(1)} kg achieved.`);
    rationaleBullets.push(
      `Previous ${hadLossGoal ? 'fat-loss deficit' : 'weight-gain surplus'} automatically halted.`
    );
    rationaleBullets.push(
      `Recommended maintenance transition: ${calibratedTdeeKcal.toLocaleString()} kcal/day (or select a new goal).`
    );
  } else if (adherencePercentage < MIN_ADHERENCE_PCT_FOR_TUNING) {
    targetCaloriesNext = previousRecommendedCalories;
    adjustmentType = 'maintained';
    adjustmentReason = `Macros were refreshed for ${reliableWeightKg.toFixed(1)} kg, while daily calories stay at ${previousRecommendedCalories.toLocaleString()} kcal because 14-day intake consistency was ${Math.round(adherencePercentage)}% (below the ~${MIN_ADHERENCE_PCT_FOR_TUNING}% threshold for calorie changes).`;
    rationaleBullets.push(
      `Logged ${foodLoggedDays} of ${ASSESSMENT_CYCLE_DAYS} days with ${Math.round(adherencePercentage)}% target consistency.`
    );
    rationaleBullets.push(
      'Holding daily calories steady until intake consistently tracks near your active target.'
    );
  } else {
    const trendChangeKg = weightAnalysis.weeklyWeightChangeKg;
    const trendChangePct = weightAnalysis.weeklyWeightChangePct;
    const multiWeekRate = weightAnalysis.multiWeekWeeklyRateKg;

    if (normalizedGoal === 'build_muscle') {
      const expectedMin = goalSpeed === 'slow' ? 0.08 : goalSpeed === 'aggressive' ? 0.2 : 0.12;
      const expectedMax = goalSpeed === 'slow' ? 0.25 : goalSpeed === 'aggressive' ? 0.45 : 0.35;
      const effectiveRate = multiWeekRate !== null ? multiWeekRate : trendChangeKg;

      if (effectiveRate < expectedMin) {
        const delta = effectiveRate <= 0 ? 150 : 100;
        targetCaloriesNext = previousRecommendedCalories + delta;
        adjustmentType = 'increased';
        adjustmentReason = `14-day weight trend (${trendChangeKg >= 0 ? '+' : ''}${trendChangeKg.toFixed(2)} kg/wk) is below your ${goalSpeed} Build Muscle pace (+${expectedMin.toFixed(2)}–${expectedMax.toFixed(2)} kg/wk) with ${Math.round(adherencePercentage)}% consistency. Adding +${delta} kcal/day to support steady lean gain.`;
      } else if (effectiveRate > expectedMax * 1.45 && (weightAnalysis.hasMultiWeekHistory || effectiveRate > 0.55)) {
        const delta = -100;
        targetCaloriesNext = Math.max(calibratedTdeeKcal + 100, previousRecommendedCalories + delta);
        adjustmentType = 'decreased';
        adjustmentReason = `Weight is climbing faster than ideal (+${effectiveRate.toFixed(2)} kg/wk) for lean muscle gain. Trimming by ${Math.abs(targetCaloriesNext - previousRecommendedCalories)} kcal/day to minimize excess fat gain.`;
      } else {
        targetCaloriesNext = previousRecommendedCalories;
        adjustmentType = 'maintained';
        adjustmentReason = `Progress is right on target for Build Muscle (${trendChangeKg >= 0 ? '+' : ''}${trendChangeKg.toFixed(2)} kg/wk). Keeping daily calories steady at ${previousRecommendedCalories.toLocaleString()} kcal with macros synced to ${reliableWeightKg.toFixed(1)} kg.`;
      }
    } else if (normalizedGoal === 'fat_gain') {
      const expectedMin = goalSpeed === 'slow' ? 0.15 : goalSpeed === 'aggressive' ? 0.32 : 0.22;
      const expectedMax = goalSpeed === 'slow' ? 0.35 : goalSpeed === 'aggressive' ? 0.6 : 0.48;
      const effectiveRate = multiWeekRate !== null ? multiWeekRate : trendChangeKg;

      if (effectiveRate < expectedMin) {
        const delta = effectiveRate <= 0.05 ? 150 : 100;
        targetCaloriesNext = previousRecommendedCalories + delta;
        adjustmentType = 'increased';
        adjustmentReason = `14-day weight gain (${trendChangeKg >= 0 ? '+' : ''}${trendChangeKg.toFixed(2)} kg/wk) is slower than your Healthy Weight Gain pace (+${expectedMin.toFixed(2)}–${expectedMax.toFixed(2)} kg/wk) with ${Math.round(adherencePercentage)}% consistency. Increasing daily intake by +${delta} kcal/day.`;
      } else if (effectiveRate > expectedMax * 1.45 && (weightAnalysis.hasMultiWeekHistory || effectiveRate > 0.7)) {
        targetCaloriesNext = Math.max(calibratedTdeeKcal + 150, previousRecommendedCalories - 100);
        adjustmentType = 'decreased';
        adjustmentReason = `Sustained weight gain (+${effectiveRate.toFixed(2)} kg/wk) is outpacing your target gain rate. Moderating intake by ${Math.abs(targetCaloriesNext - previousRecommendedCalories)} kcal/day.`;
      } else {
        targetCaloriesNext = previousRecommendedCalories;
        adjustmentType = 'maintained';
        adjustmentReason = `Healthy Weight Gain is progressing on track (${trendChangeKg >= 0 ? '+' : ''}${trendChangeKg.toFixed(2)} kg/wk; latest ${weightAnalysis.latestMeasuredWeightKg.toFixed(1)} kg). Calorie target stays at ${previousRecommendedCalories.toLocaleString()} kcal/day.`;
      }
    } else if (normalizedGoal === 'lose_weight') {
      const lossRatePct = -trendChangePct;
      const multiWeekLossPct =
        multiWeekRate !== null && weightAnalysis.previousTrendWeightKg > 0
          ? (-multiWeekRate / weightAnalysis.previousTrendWeightKg) * 100
          : null;

      const maxHealthyLossPct = goalSpeed === 'slow' ? 0.7 : goalSpeed === 'moderate' ? 1.0 : 1.15;
      const hasConfirmedPlateau =
        lossRatePct < 0.15 &&
        ((multiWeekLossPct !== null && multiWeekLossPct < 0.2) ||
          (lastApplied !== null && (lastApplied.weeklyWeightChangeKg ?? -0.3) > -0.1) ||
          weightAnalysis.totalDaysInHistory >= 13);

      if (lossRatePct > maxHealthyLossPct) {
        const delta = lossRatePct > 1.35 ? 150 : 100;
        targetCaloriesNext = Math.min(calibratedTdeeKcal - 150, previousRecommendedCalories + delta);
        adjustmentType = 'increased';
        adjustmentReason = `Weight loss pace (${lossRatePct.toFixed(2)}% of body weight/wk) is faster than ideal for preserving muscle. Increasing daily intake by +${Math.max(0, targetCaloriesNext - previousRecommendedCalories)} kcal/day.`;
      } else if (hasConfirmedPlateau) {
        const sexFloor = input.profile.biologicalSex === 'female' ? 1200 : 1500;
        const minSafeCalories = Math.max(
          sexFloor,
          Math.round(calibratedTdeeKcal * 0.75),
          recalculated.recommendedCalories - 150
        );
        const proposed = Math.max(minSafeCalories, previousRecommendedCalories - 125);
        if (proposed < previousRecommendedCalories) {
          targetCaloriesNext = proposed;
          adjustmentType = 'decreased';
          adjustmentReason = `14-day trend shows a weight-loss plateau (${lossRatePct.toFixed(2)}%/wk) despite ${Math.round(adherencePercentage)}% consistency. Trimming -${previousRecommendedCalories - proposed} kcal/day safely and refreshing macros.`;
        } else {
          targetCaloriesNext = previousRecommendedCalories;
          adjustmentType = 'safety_guarded';
          adjustmentReason = `Weight loss has slowed, and daily calories are already near your safe minimum (${minSafeCalories.toLocaleString()} kcal/day). Keeping calories steady and focusing on daily steps, protein, and sleep.`;
        }
      } else if (lossRatePct < 0.15) {
        targetCaloriesNext = previousRecommendedCalories;
        adjustmentType = 'maintained';
        adjustmentReason = `Short-term scale movement slowed (${lossRatePct.toFixed(2)}%/wk) without a confirmed multi-week plateau. Keeping calories at ${previousRecommendedCalories.toLocaleString()} kcal/day while monitoring trend.`;
      } else {
        targetCaloriesNext = previousRecommendedCalories;
        adjustmentType = 'maintained';
        adjustmentReason = `Fat loss is progressing cleanly at ${lossRatePct.toFixed(2)}% body weight/week (${trendChangeKg.toFixed(2)} kg/wk trend). Holding calories at ${previousRecommendedCalories.toLocaleString()} kcal/day with macros tuned for ${reliableWeightKg.toFixed(1)} kg.`;
      }
    } else if (normalizedGoal === 'recomposition') {
      const driftFromMaintenance = Math.abs(previousRecommendedCalories - calibratedTdeeKcal);
      if (driftFromMaintenance > 220 && assessmentWeekNumber >= 2) {
        const direction = calibratedTdeeKcal > previousRecommendedCalories ? 1 : -1;
        targetCaloriesNext = previousRecommendedCalories + direction * 75;
        adjustmentType = direction > 0 ? 'increased' : 'decreased';
        adjustmentReason = `Nudging recomposition intake (${direction > 0 ? '+' : ''}75 kcal/day) closer to your observed maintenance (${calibratedTdeeKcal.toLocaleString()} kcal/day) while updating macros for ${reliableWeightKg.toFixed(1)} kg.`;
      } else {
        targetCaloriesNext = previousRecommendedCalories;
        adjustmentType = 'maintained';
        adjustmentReason = `Keeping Body Recomposition calories near maintenance (${previousRecommendedCalories.toLocaleString()} kcal/day) with protein and macros updated for ${reliableWeightKg.toFixed(1)} kg.`;
      }
    } else {
      // maintain_weight
      const effectiveRate = multiWeekRate !== null ? multiWeekRate : trendChangeKg;
      if (Math.abs(effectiveRate) > 0.35 && weightAnalysis.hasMultiWeekHistory) {
        const delta = effectiveRate > 0 ? -100 : 100;
        targetCaloriesNext = previousRecommendedCalories + delta;
        adjustmentType = delta > 0 ? 'increased' : 'decreased';
        adjustmentReason = `Noticeable weight drift (${effectiveRate >= 0 ? '+' : ''}${effectiveRate.toFixed(2)} kg/wk) detected during maintenance. Adjusting by ${delta > 0 ? '+' : ''}${delta} kcal/day to keep weight steady.`;
      } else {
        targetCaloriesNext = previousRecommendedCalories;
        adjustmentType = 'maintained';
        adjustmentReason = `Weight is holding steady around maintenance (${trendChangeKg >= 0 ? '+' : ''}${trendChangeKg.toFixed(2)} kg/wk). Calories stay at ${previousRecommendedCalories.toLocaleString()} kcal/day with macros refreshed for ${reliableWeightKg.toFixed(1)} kg.`;
      }
    }

    rationaleBullets.push(
      `7-day avg weight: ${weightAnalysis.previous7dAvgWeightKg.toFixed(1)} → ${weightAnalysis.current7dAvgWeightKg.toFixed(1)} kg · Smoothed trend: ${weightAnalysis.assessedTrendWeightKg.toFixed(1)} kg (${trendChangeKg >= 0 ? '+' : ''}${trendChangeKg.toFixed(2)} kg/wk).`
    );
    rationaleBullets.push(
      `Estimated maintenance: ${calibratedTdeeKcal.toLocaleString()} kcal/day based on your intake and weight trend.`
    );
    rationaleBullets.push(
      `14-day consistency: ${foodLoggedDays}/${ASSESSMENT_CYCLE_DAYS} food days (${loggingCompletenessPct}%), ${weightLoggedDays}/${ASSESSMENT_CYCLE_DAYS} weigh-ins, ${Math.round(adherencePercentage)}% target consistency.`
    );
  }

  // 8. Final Macro Allocation (strictly synchronized with calorie target)
  let recommendedCalories = previousRecommendedCalories;
  let recommendedProtein = previousRecommendedProtein;
  let recommendedCarbs = previousRecommendedCarbs;
  let recommendedFat = previousRecommendedFat;
  let recommendedFibre = previousRecommendedFibre;
  const recommendedHydrationMl = estimateHydrationMl(
    reliableWeightKg,
    input.profile.activityLevel || 'moderate',
    input.profile.workoutFrequencyPerWeek ?? 3
  );

  if (confidenceLevel === 'low' && input.goals.calories > 0) {
    recommendedCalories = previousRecommendedCalories;
    recommendedProtein = previousRecommendedProtein;
    recommendedCarbs = previousRecommendedCarbs;
    recommendedFat = previousRecommendedFat;
    recommendedFibre = previousRecommendedFibre;
  } else {
    const { bmi } = calculateBmi(reliableWeightKg, input.profile.heightCm || 170);
    const effectiveGoalForMacros: SmartFitnessGoalType = goalCompleted
      ? 'maintain_weight'
      : normalizedGoal;

    const finalMacros = allocateMacrosForCalories({
      targetCalories: targetCaloriesNext,
      weightKg: reliableWeightKg,
      heightCm: input.profile.heightCm || 170,
      bmi,
      normalizedGoal: effectiveGoalForMacros,
      goalSpeed,
      macroFocus,
      bodyFatPct: input.profile.bodyFatPct,
    });

    recommendedCalories = finalMacros.recommendedCalories;
    recommendedProtein = finalMacros.proteinGrams;
    recommendedCarbs = finalMacros.carbsGrams;
    recommendedFat = finalMacros.fatGrams;
    recommendedFibre = finalMacros.fibreGrams;
  }

  const calorieDeltaKcal = recommendedCalories - previousRecommendedCalories;
  const statusTag = deriveAssessmentStatusTag(
    adjustmentType,
    confidenceLevel,
    calorieDeltaKcal,
    adherencePercentage
  );

  // Projected weeks remaining at updated calorie delta
  const remainingDiffKg = round2(targetWeightKg - reliableWeightKg);
  const projectedWeeklyRate = ((recommendedCalories - calibratedTdeeKcal) * 7) / 7700;
  let projectedWeeksToGoal: number | null = null;
  if (!goalCompleted && Math.abs(remainingDiffKg) >= 0.3) {
    if (
      (remainingDiffKg < 0 && projectedWeeklyRate < -0.05) ||
      (remainingDiffKg > 0 && projectedWeeklyRate > 0.05)
    ) {
      projectedWeeksToGoal = Math.max(1, Math.round(Math.abs(remainingDiffKg / projectedWeeklyRate)));
    }
  }

  const partialResult: Omit<DeterministicWeeklyAssessmentOutput, 'fallbackAiSummary'> = {
    weekStartDate,
    weekEndDate,
    assessmentWeekNumber,
    cycleDays: ASSESSMENT_CYCLE_DAYS,
    weightAnalysis,
    foodLoggedDays,
    weightLoggedDays,
    loggingCompletenessPct,
    adherencePercentage,
    avgDailyCalories,
    avgDailyProtein,
    avgDailyCarbs,
    avgDailyFat,
    avgDailyFibre,
    confidenceLevel,
    confidenceReasons,
    estimatedBmr,
    estimatedTdeeKcal,
    priorTdeeKcal,
    calibratedTdeeKcal,
    inferredTdeeKcal,
    previousRecommendedCalories,
    recommendedCalories,
    calorieDeltaKcal,
    previousRecommendedProtein,
    previousRecommendedCarbs,
    previousRecommendedFat,
    previousRecommendedFibre,
    recommendedProtein,
    recommendedCarbs,
    recommendedFat,
    recommendedFibre,
    recommendedHydrationMl,
    projectedWeeksToGoal,
    adjustmentType,
    statusTag,
    adjustmentReason,
    goalCompleted,
    suggestedMaintenanceCalories,
    rationaleBullets,
    calculationVersion: CALCULATION_VERSION,
    normalizedGoal,
    goalSpeed,
  };

  const fallbackAiSummary = buildDeterministicWeeklyExplanation(partialResult, input.profile);

  return {
    ...partialResult,
    fallbackAiSummary,
  };
}

/**
 * Deterministic 14-Day Due-Check & Cycle Advancement Evaluator.
 * Prevents duplicate cycle assessments for the same 14-day period, respects adaptive pause
 * and custom target protection, and advances cleanly after missed cycles.
 */
export function evaluateWeeklyAssessmentDueStatus(params: {
  profile: UserProfile;
  goals: NutritionGoals;
  weightEntries: WeightEntry[];
  foodEntries: Array<{
    date: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fibre: number;
  }>;
  weeklyAssessments: WeeklyAssessmentRecord[];
  todayDateKey?: string;
}): WeeklyAssessmentDueStatus {
  const today = params.todayDateKey || getTodayDateKey();

  const sortedAssessments = [...params.weeklyAssessments].sort((a, b) =>
    b.weekEndDate.localeCompare(a.weekEndDate)
  );
  const latestAssessment = sortedAssessments[0] || null;

  // Determine anchor date: last assessment's weekEndDate -> profile.cycleAnchorDate -> goals.initialCalculatedAt -> earliest log/weight date
  let anchorDateKey: string | null = null;
  if (latestAssessment) {
    anchorDateKey = latestAssessment.weekEndDate;
  } else if (params.profile.cycleAnchorDate) {
    anchorDateKey = params.profile.cycleAnchorDate.slice(0, 10);
  } else if (params.profile.lastWeeklyAssessmentAt) {
    anchorDateKey = params.profile.lastWeeklyAssessmentAt.slice(0, 10);
  } else if (params.goals.initialCalculatedAt) {
    anchorDateKey = params.goals.initialCalculatedAt.slice(0, 10);
  } else {
    const earliestFood = params.foodEntries
      .map((e) => e.date)
      .filter(Boolean)
      .sort()[0];
    const earliestWeight = params.weightEntries
      .map((w) => w.date)
      .filter(Boolean)
      .sort()[0];
    const candidates = [earliestFood, earliestWeight].filter(Boolean) as string[];
    anchorDateKey = candidates.sort()[0] || today;
  }

  const daysSinceLastAnchor = Math.max(0, daysBetweenDateKeys(anchorDateKey, today));
  const daysRemaining = Math.max(0, ASSESSMENT_CYCLE_DAYS - daysSinceLastAnchor);
  const daysCompleted = Math.min(ASSESSMENT_CYCLE_DAYS, daysSinceLastAnchor);
  const nextAssessmentDate = addDaysToDateKey(anchorDateKey, ASSESSMENT_CYCLE_DAYS);

  // Current active cycle window:
  // If we're still within the 14-day window from anchorDateKey, anchor the cycle start nicely;
  // when due (day >= 14), the assessment window covers the last 14 days ending today.
  const weekEndDate = daysSinceLastAnchor >= ASSESSMENT_CYCLE_DAYS ? today : nextAssessmentDate;
  const weekStartDate =
    daysSinceLastAnchor >= ASSESSMENT_CYCLE_DAYS
      ? addDaysToDateKey(today, -(ASSESSMENT_CYCLE_DAYS - 1))
      : anchorDateKey;

  const existingForCurrentPeriod =
    sortedAssessments.find(
      (a) =>
        (a.weekStartDate === addDaysToDateKey(today, -(ASSESSMENT_CYCLE_DAYS - 1)) &&
          a.weekEndDate === today) ||
        daysBetweenDateKeys(a.weekEndDate, today) < ASSESSMENT_CYCLE_DAYS
    ) || null;

  const evalEnd = today;
  const evalStart =
    daysSinceLastAnchor < ASSESSMENT_CYCLE_DAYS
      ? anchorDateKey
      : addDaysToDateKey(today, -(ASSESSMENT_CYCLE_DAYS - 1));

  const dailySummary = buildDailyNutritionSummaries(params.foodEntries, evalStart, evalEnd);
  const foodLoggedDays = dailySummary.filter((d) => d.calories > 0).length;

  const weightAnalysis = analyzeWeightTrend(
    params.weightEntries,
    evalStart,
    evalEnd,
    params.profile.currentWeightKg || 0,
    latestAssessment?.status === 'applied' ? latestAssessment : null
  );
  const weightLoggedDays = weightAnalysis.weightLoggedDaysCurrentWeek;

  const completedCount = sortedAssessments.filter((a) => a.status === 'applied').length;
  const currentWeekNumber = Math.max(1, completedCount + 1);

  const hasMinimumData =
    foodLoggedDays >= MIN_FOOD_DAYS_FOR_TUNING && weightLoggedDays >= MIN_WEIGHT_DAYS_FOR_TUNING;
  const confidenceLevel: AssessmentConfidenceLevel = !hasMinimumData
    ? 'low'
    : foodLoggedDays >= 11 && weightLoggedDays >= 7
    ? 'high'
    : 'moderate';

  const normalizedGoal = normalizeFitnessGoal(params.profile.fitnessGoal);
  const targetWeight = params.profile.targetWeightKg || params.goals.targetWeightKg || 0;
  const latestWeight =
    params.weightEntries.length > 0
      ? weightAnalysis.latestMeasuredWeightKg
      : params.profile.currentWeightKg > 0
      ? params.profile.currentWeightKg
      : null;

  const goalCompleted = Boolean(
    targetWeight > 0 &&
      latestWeight !== null &&
      ((normalizedGoal === 'lose_weight' &&
        weightAnalysis.assessedTrendWeightKg <= targetWeight + 0.25 &&
        latestWeight <= targetWeight + 0.35) ||
        ((normalizedGoal === 'fat_gain' || normalizedGoal === 'build_muscle') &&
          weightAnalysis.assessedTrendWeightKg >= targetWeight - 0.25 &&
          latestWeight >= targetWeight - 0.35))
  );

  const adaptivePaused = Boolean(params.profile.adaptivePaused);
  const manualOverrideActive = Boolean(
    params.profile.manualOverrideActive ||
      params.goals.manualOverrideActive ||
      params.goals.preset === 'custom'
  );

  const isDueBySchedule = daysSinceLastAnchor >= ASSESSMENT_CYCLE_DAYS && !existingForCurrentPeriod;
  const hasPendingExisting = existingForCurrentPeriod?.status === 'pending';
  const wasDismissedForPeriod = existingForCurrentPeriod?.status === 'dismissed';
  const wasAppliedForPeriod = existingForCurrentPeriod?.status === 'applied';

  const isDue =
    !adaptivePaused &&
    !manualOverrideActive &&
    (isDueBySchedule || hasPendingExisting) &&
    !wasDismissedForPeriod &&
    !wasAppliedForPeriod;

  let statusLabel: WeeklyAssessmentDueStatus['statusLabel'] = 'Assessment in progress';
  let readinessMessage = '';

  if (adaptivePaused) {
    statusLabel = 'Adaptive paused';
    readinessMessage =
      'Automatic 14-day target updates are paused. Resume anytime to receive review recommendations.';
  } else if (manualOverrideActive) {
    statusLabel = 'Custom targets active';
    readinessMessage =
      'Your custom targets are protected from automatic updates. You can still run a manual 14-day progress review anytime.';
  } else if (wasAppliedForPeriod) {
    statusLabel = 'Assessment completed';
    readinessMessage = `Review #${existingForCurrentPeriod.assessmentWeekNumber} applied. Next 14-day review opens ${addDaysToDateKey(existingForCurrentPeriod.weekEndDate, ASSESSMENT_CYCLE_DAYS)}.`;
  } else if (wasDismissedForPeriod) {
    statusLabel = 'Assessment in progress';
    readinessMessage = `Current 14-day review kept on existing targets. Next review opens ${addDaysToDateKey(existingForCurrentPeriod.weekEndDate, ASSESSMENT_CYCLE_DAYS)}.`;
  } else if (isDue && !hasMinimumData) {
    statusLabel = 'Low data confidence';
    readinessMessage = `14 days complete, but at least ${MIN_FOOD_DAYS_FOR_TUNING} food days (${foodLoggedDays}/${ASSESSMENT_CYCLE_DAYS}) and ${MIN_WEIGHT_DAYS_FOR_TUNING} weigh-ins (${weightLoggedDays}/${ASSESSMENT_CYCLE_DAYS}) are needed before suggesting target changes.`;
  } else if (isDue) {
    statusLabel = 'Assessment ready';
    readinessMessage = goalCompleted
      ? `Goal weight reached (${latestWeight?.toFixed(1)} kg)! Review your maintenance targets.`
      : `14 days complete with ${foodLoggedDays}/${ASSESSMENT_CYCLE_DAYS} food logs and ${weightLoggedDays} weigh-ins. Your 14-day progress review is ready!`;
  } else {
    statusLabel = 'Assessment in progress';
    readinessMessage = `Day ${Math.min(ASSESSMENT_CYCLE_DAYS, daysSinceLastAnchor + 1)} of ${ASSESSMENT_CYCLE_DAYS} — ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} until your next 14-day review (${nextAssessmentDate}).`;
  }

  return {
    isDue,
    statusLabel,
    currentWeekNumber,
    cycleDays: ASSESSMENT_CYCLE_DAYS,
    daysCompleted,
    cycleStartDate: evalStart,
    cycleEndDate: weekEndDate,
    weekStartDate,
    weekEndDate: today,
    nextAssessmentDate:
      existingForCurrentPeriod
        ? addDaysToDateKey(existingForCurrentPeriod.weekEndDate, ASSESSMENT_CYCLE_DAYS)
        : nextAssessmentDate,
    daysSinceLastAnchor,
    daysRemaining,
    foodLoggedDays,
    weightLoggedDays,
    confidenceLevel,
    hasExistingForPeriod: Boolean(existingForCurrentPeriod),
    existingAssessment: existingForCurrentPeriod,
    latestWeightKg: latestWeight,
    weeklyDeltaKg: params.weightEntries.length >= 2 ? weightAnalysis.weeklyWeightChangeKg : null,
    goalCompleted,
    adaptivePaused,
    manualOverrideActive,
    readinessMessage,
  };
}
