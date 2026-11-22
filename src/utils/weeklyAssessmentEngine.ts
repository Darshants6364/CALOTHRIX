/**
 * CALOTHRIX — 7-Day Adaptive Assessment Engine (Deterministic Core)
 *
 * Pure, unit-testable TypeScript module shared by client and server.
 * Zero Gemini dependency: Gemini only explains outputs computed here.
 *
 * Weight Smoothing Algorithm:
 *   Exponentially Weighted Moving Average (EWMA) with alpha = 0.28 across daily
 *   averaged weigh-ins (up to 28 days historical window), paired with 7-day rolling
 *   averages so short-term water/sodium/glycogen noise never triggers knee-jerk calorie shifts.
 *
 * Distinct Operations:
 *   1. Weight-based recalculation (BMR, formula TDEE, protein/carbs/fat/fibre/hydration)
 *   2. Maintenance calibration (bounded confidence-weighted Adaptive TDEE)
 *   3. Calorie target adjustment (evidence-gated, adherence-gated, safety-bounded)
 */

import type {
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

export const EWMA_ALPHA = 0.28;
export const MAX_WEEKLY_TDEE_SHIFT_KCAL = 125;
export const MIN_FOOD_DAYS_FOR_TUNING = 5;
export const MIN_WEIGHT_DAYS_FOR_TUNING = 4;
export const MIN_ADHERENCE_PCT_FOR_TUNING = 78;

export interface WeightTrendAnalysis {
  latestMeasuredWeightKg: number;
  previousMeasuredWeightKg: number;
  current7dAvgWeightKg: number;
  previous7dAvgWeightKg: number;
  assessedTrendWeightKg: number;
  previousTrendWeightKg: number;
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
  assessmentWeekNumber?: number;
}

export interface DeterministicWeeklyAssessmentOutput {
  weekStartDate: string;
  weekEndDate: string;
  assessmentWeekNumber: number;
  weightAnalysis: WeightTrendAnalysis;
  foodLoggedDays: number;
  weightLoggedDays: number;
  loggingCompletenessPct: number;
  adherencePercentage: number;
  avgDailyCalories: number;
  avgDailyProtein: number;
  avgDailyCarbs: number;
  avgDailyFat: number;
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
function aggregateDailyWeights(entries: WeightEntry[]): { date: string; weightKg: number }[] {
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
 * Computes EWMA trend series and rolling 7-day averages while separating measured vs smoothed weight.
 */
export function analyzeWeightTrend(
  weightEntries: WeightEntry[],
  weekStartDate: string,
  weekEndDate: string,
  fallbackWeightKg: number,
  priorAssessment?: WeeklyAssessmentRecord | null
): WeightTrendAnalysis {
  const daily = aggregateDailyWeights(weightEntries).filter((d) => d.date <= weekEndDate);
  const window28Start = addDaysToDateKey(weekEndDate, -27);
  const prevWeekStart = addDaysToDateKey(weekStartDate, -7);
  const prevWeekEnd = addDaysToDateKey(weekStartDate, -1);

  const recent28 = daily.filter((d) => d.date >= window28Start);
  const currentWeekEntries = daily.filter((d) => d.date >= weekStartDate && d.date <= weekEndDate);
  const prevWeekEntries = daily.filter((d) => d.date >= prevWeekStart && d.date <= prevWeekEnd);

  const safeFallback = fallbackWeightKg > 25 ? fallbackWeightKg : 65;

  // Build EWMA over the 28-day window (or all available entries up to weekEndDate)
  const seriesSource = recent28.length > 0 ? recent28 : daily;
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
    currentWeekEntries.length > 0
      ? currentWeekEntries[currentWeekEntries.length - 1].weightKg
      : daily.length > 0
      ? daily[daily.length - 1].weightKg
      : safeFallback;

  const current7dAvgWeightKg =
    currentWeekEntries.length > 0
      ? round2(
          currentWeekEntries.reduce((s, d) => s + d.weightKg, 0) / currentWeekEntries.length
        )
      : latestMeasuredWeightKg;

  const previous7dAvgWeightKg =
    prevWeekEntries.length > 0
      ? round2(prevWeekEntries.reduce((s, d) => s + d.weightKg, 0) / prevWeekEntries.length)
      : priorAssessment?.assessedWeightKg ??
        (currentWeekEntries.length >= 2 ? currentWeekEntries[0].weightKg : safeFallback);

  const previousMeasuredWeightKg =
    priorAssessment?.assessedWeightKg ??
    (prevWeekEntries.length > 0
      ? prevWeekEntries[prevWeekEntries.length - 1].weightKg
      : currentWeekEntries.length >= 2
      ? currentWeekEntries[0].weightKg
      : safeFallback);

  const assessedTrendWeightKg =
    ewmaPoints.length > 0 ? ewmaPoints[ewmaPoints.length - 1].trend : latestMeasuredWeightKg;

  // Find EWMA point at or before prevWeekEnd
  const priorEwmaPoints = ewmaPoints.filter((p) => p.date <= prevWeekEnd);
  const previousTrendWeightKg =
    priorAssessment?.assessedTrendWeightKg ??
    (priorEwmaPoints.length > 0
      ? priorEwmaPoints[priorEwmaPoints.length - 1].trend
      : ewmaPoints.length >= 2
      ? ewmaPoints[0].trend
      : previousMeasuredWeightKg);

  const weeklyWeightChangeKg = round2(assessedTrendWeightKg - previousTrendWeightKg);
  const weeklyWeightChangePct =
    previousTrendWeightKg > 0
      ? round2((weeklyWeightChangeKg / previousTrendWeightKg) * 100)
      : 0;

  // Compute multi-week rate (14–28 days) when available for genuine plateau detection
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
    weeklyWeightChangeKg,
    weeklyWeightChangePct,
    multiWeekWeeklyRateKg,
    weightLoggedDaysCurrentWeek: currentWeekEntries.length,
    weightLoggedDaysPreviousWeek: prevWeekEntries.length,
    totalDaysInHistory,
    hasMultiWeekHistory: totalDaysInHistory >= 12 && prevWeekEntries.length >= 2,
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

/**
 * Deterministic fallback explanation when Gemini is unavailable, times out, or fails schema validation.
 * Never invents numbers; strictly narrates the deterministic engine's outputs.
 */
export function buildDeterministicWeeklyExplanation(
  out: Omit<DeterministicWeeklyAssessmentOutput, 'fallbackAiSummary'>,
  profile: UserProfile
): WeeklyAssessmentAiExplanation {
  const goalLabel = SMART_FITNESS_GOAL_META[out.normalizedGoal].label;
  const deltaSign = out.weightAnalysis.weeklyWeightChangeKg > 0 ? '+' : '';
  const weightDir =
    Math.abs(out.weightAnalysis.weeklyWeightChangeKg) < 0.08
      ? 'remained steady'
      : out.weightAnalysis.weeklyWeightChangeKg > 0
      ? `increased by ${deltaSign}${out.weightAnalysis.weeklyWeightChangeKg.toFixed(2)} kg (smoothed trend)`
      : `decreased by ${Math.abs(out.weightAnalysis.weeklyWeightChangeKg).toFixed(2)} kg (smoothed trend)`;

  let headline = `Week ${out.assessmentWeekNumber} Check-In: Weight ${out.weightAnalysis.latestMeasuredWeightKg.toFixed(1)} kg — Targets Reviewed`;
  if (out.goalCompleted) {
    headline = `Goal Weight Reached (${out.weightAnalysis.latestMeasuredWeightKg.toFixed(1)} kg) — Maintenance Transition Ready`;
  } else if (out.confidenceLevel === 'low') {
    headline = `Week ${out.assessmentWeekNumber} Check-In: Low Data Confidence — Existing Targets Preserved`;
  } else if (out.calorieDeltaKcal > 0) {
    headline = `Week ${out.assessmentWeekNumber} Check-In: +${out.calorieDeltaKcal} kcal Target Update for ${goalLabel}`;
  } else if (out.calorieDeltaKcal < 0) {
    headline = `Week ${out.assessmentWeekNumber} Check-In: ${out.calorieDeltaKcal} kcal Target Tuning for ${goalLabel}`;
  } else {
    headline = `Week ${out.assessmentWeekNumber} Check-In: Weight ${out.weightAnalysis.latestMeasuredWeightKg.toFixed(1)} kg — Macros Recalibrated`;
  }

  const bodyChangeAnalysis =
    `Your latest measured weight is ${out.weightAnalysis.latestMeasuredWeightKg.toFixed(1)} kg (7-day average ${out.weightAnalysis.current7dAvgWeightKg.toFixed(1)} kg), ` +
    `while your EWMA smoothed trend weight ${weightDir} from ${out.weightAnalysis.previousTrendWeightKg.toFixed(1)} kg to ${out.weightAnalysis.assessedTrendWeightKg.toFixed(1)} kg. ` +
    `Short-term scale shifts always include water, sodium, and glycogen variance rather than pure muscle or fat tissue change.`;

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
      `Log all meals on at least ${MIN_FOOD_DAYS_FOR_TUNING} of 7 days next week so your average intake reflects true consumption.`
    );
    actionableTips.push(
      `Step on the scale ${MIN_WEIGHT_DAYS_FOR_TUNING}+ mornings under consistent conditions (fasted, after waking) to build a reliable trend line.`
    );
    actionableTips.push(
      `Aim for ~${out.recommendedProtein} g daily protein using staples like ${proteinFoods}.`
    );
  } else if (out.goalCompleted) {
    actionableTips.push(
      `Transition to your estimated maintenance target of ${out.calibratedTdeeKcal.toLocaleString()} kcal/day for 2–4 weeks to stabilize at your new weight.`
    );
    actionableTips.push(
      `Keep protein steady near ${out.recommendedProtein} g/day (${proteinFoods}) while keeping resistance training consistent.`
    );
    actionableTips.push(
      `Once weight stabilizes at maintenance, choose your next goal—such as Body Recomposition, Build Muscle, or Maintain Weight.`
    );
  } else {
    if (out.avgDailyProtein < out.recommendedProtein * 0.88) {
      actionableTips.push(
        `Your weekly protein averaged ${Math.round(out.avgDailyProtein)} g vs ${out.recommendedProtein} g target—add 25–30 g protein per meal with ${proteinFoods}.`
      );
    } else {
      actionableTips.push(
        `Protein consistency is solid (${Math.round(out.avgDailyProtein)} g/day)—anchor meals around ${proteinFoods} to hit ${out.recommendedProtein} g/day.`
      );
    }
    actionableTips.push(
      `Center energy around ${out.recommendedCalories.toLocaleString()} kcal/day using ${carbFoods} and at least ${out.recommendedFibre} g fibre.`
    );
    actionableTips.push(
      `Continue 4+ morning weigh-ins per week so Week ${out.assessmentWeekNumber + 1} refines your calibrated maintenance estimate (${out.calibratedTdeeKcal.toLocaleString()} kcal/day).`
    );
  }

  const confidenceExplanation =
    `Data confidence is ${out.confidenceLevel.toUpperCase()} based on ${out.foodLoggedDays}/7 logged food days, ` +
    `${out.weightLoggedDays}/7 weight check-ins, and ${Math.round(out.adherencePercentage)}% calorie adherence` +
    (out.weightAnalysis.hasMultiWeekHistory
      ? ` across ${out.weightAnalysis.totalDaysInHistory} days of weight history.`
      : ' (early tracking window; longer history increases calibration precision).');

  return {
    headline,
    bodyChangeAnalysis,
    calorieAdjustmentReason,
    actionableTips: actionableTips.slice(0, 3),
    confidenceExplanation,
    provider: 'deterministic',
  };
}

/**
 * Core 7-Day Deterministic Adaptive Assessment Engine.
 */
export function runDeterministicWeeklyAssessment(
  input: DeterministicWeeklyAssessmentInput
): DeterministicWeeklyAssessmentOutput {
  const weekEndDate = input.referenceDateKey || getTodayDateKey();
  const weekStartDate = addDaysToDateKey(weekEndDate, -6);

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

  // 1. Analyze measured vs trend weight
  const weightAnalysis = analyzeWeightTrend(
    input.weightEntries,
    weekStartDate,
    weekEndDate,
    baselineWeightKg,
    lastApplied
  );

  // 2. Analyze food logging completeness vs calorie adherence (strictly separate!)
  const weekNutrition = input.dailyNutrition.filter(
    (d) => d.date >= weekStartDate && d.date <= weekEndDate && d.calories > 0
  );
  const foodLoggedDays = weekNutrition.length;
  const weightLoggedDays = weightAnalysis.weightLoggedDaysCurrentWeek;
  const loggingCompletenessPct = Math.round((foodLoggedDays / 7) * 100);

  const avgDailyCalories =
    foodLoggedDays > 0
      ? Math.round(weekNutrition.reduce((s, d) => s + d.calories, 0) / foodLoggedDays)
      : 0;
  const avgDailyProtein =
    foodLoggedDays > 0
      ? round1(weekNutrition.reduce((s, d) => s + d.protein, 0) / foodLoggedDays)
      : 0;
  const avgDailyCarbs =
    foodLoggedDays > 0
      ? round1(weekNutrition.reduce((s, d) => s + d.carbs, 0) / foodLoggedDays)
      : 0;
  const avgDailyFat =
    foodLoggedDays > 0
      ? round1(weekNutrition.reduce((s, d) => s + d.fat, 0) / foodLoggedDays)
      : 0;

  // Previous targets
  const initialCalc = calculateSmartFitnessTargets({
    age: input.profile.age || 25,
    biologicalSex: input.profile.biologicalSex || 'male',
    heightCm: input.profile.heightCm || 170,
    currentWeightKg: weightAnalysis.previousMeasuredWeightKg || baselineWeightKg,
    targetWeightKg: input.profile.targetWeightKg || input.goals.targetWeightKg || baselineWeightKg,
    dailyAverageSteps: input.profile.dailyAverageSteps || 7500,
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

  // Calorie adherence: average closeness of each logged day to previousRecommendedCalories
  const adherencePercentage =
    foodLoggedDays > 0 && previousRecommendedCalories > 0
      ? round1(
          weekNutrition.reduce((sum, day) => {
            const devPct =
              Math.abs(day.calories - previousRecommendedCalories) / previousRecommendedCalories;
            return sum + Math.max(0, 100 - Math.min(100, devPct * 100));
          }, 0) / foodLoggedDays
        )
      : 0;

  // 3. Data Quality Gate
  const confidenceReasons: string[] = [];
  if (foodLoggedDays < MIN_FOOD_DAYS_FOR_TUNING) {
    confidenceReasons.push(
      `Only ${foodLoggedDays}/7 food days logged (need at least ${MIN_FOOD_DAYS_FOR_TUNING} days).`
    );
  }
  if (weightLoggedDays < MIN_WEIGHT_DAYS_FOR_TUNING) {
    confidenceReasons.push(
      `Only ${weightLoggedDays}/7 weigh-ins recorded (need at least ${MIN_WEIGHT_DAYS_FOR_TUNING} distributed check-ins).`
    );
  }
  if (avgDailyCalories <= 0) {
    confidenceReasons.push('Missing daily calorie intake data for this 7-day window.');
  }
  if (adherencePercentage < MIN_ADHERENCE_PCT_FOR_TUNING && foodLoggedDays >= MIN_FOOD_DAYS_FOR_TUNING) {
    confidenceReasons.push(
      `Calorie adherence was ${Math.round(adherencePercentage)}% (auto calorie tuning requires ~80%+ adherence).`
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
    foodLoggedDays >= 6 &&
    weightLoggedDays >= 5 &&
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
    dailyAverageSteps: input.profile.dailyAverageSteps || 7500,
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
    // Use multi-week trend when available for stability, else 7-day EWMA trend
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

    // Week 1 rule: stay anchored to formula TDEE as primary starting estimate
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
    adjustmentReason = `Insufficient tracking data (${foodLoggedDays}/7 food days, ${weightLoggedDays}/7 weigh-ins). Calorie targets were kept unchanged at ${previousRecommendedCalories.toLocaleString()} kcal/day until at least ${MIN_FOOD_DAYS_FOR_TUNING} food days and ${MIN_WEIGHT_DAYS_FOR_TUNING} weigh-ins are logged.`;
    rationaleBullets.push(...confidenceReasons);
    rationaleBullets.push('Existing daily calorie and macro targets preserved to avoid noise-driven changes.');
  } else if (goalCompleted) {
    suggestedMaintenanceCalories = calibratedTdeeKcal;
    targetCaloriesNext = calibratedTdeeKcal;
    adjustmentType = 'goal_completed_maintenance';
    adjustmentReason = `Target weight (${targetWeightKg.toFixed(1)} kg) has been reached (measured ${weightAnalysis.latestMeasuredWeightKg.toFixed(1)} kg, trend ${weightAnalysis.assessedTrendWeightKg.toFixed(1)} kg). Stopping the previous ${hadLossGoal ? 'deficit' : 'surplus'} and offering a transition to estimated maintenance (~${calibratedTdeeKcal.toLocaleString()} kcal/day).`;
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
    adjustmentReason = `Weight-dependent macros were recalculated for ${reliableWeightKg.toFixed(1)} kg, while calories remain at ${previousRecommendedCalories.toLocaleString()} kcal/day because weekly calorie adherence was ${Math.round(adherencePercentage)}% (below the ~80% threshold for calorie adjustments).`;
    rationaleBullets.push(
      `Food logging completeness (${loggingCompletenessPct}%) is tracked separately from calorie adherence (${Math.round(adherencePercentage)}%).`
    );
    rationaleBullets.push(
      'Holding daily calories steady until intake consistently tracks near the existing target.'
    );
  } else {
    // High/Moderate confidence AND >= 78% adherence -> evaluate goal-specific progression
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
        adjustmentReason = `Smoothed weight trend (${trendChangeKg >= 0 ? '+' : ''}${trendChangeKg.toFixed(2)} kg/wk) is below your ${goalSpeed} Build Muscle target pace (+${expectedMin.toFixed(2)}–${expectedMax.toFixed(2)} kg/wk) with ${Math.round(adherencePercentage)}% adherence. Adding +${delta} kcal/day and recalculating macros for ${reliableWeightKg.toFixed(1)} kg.`;
      } else if (effectiveRate > expectedMax * 1.45 && (weightAnalysis.hasMultiWeekHistory || effectiveRate > 0.55)) {
        const delta = -100;
        targetCaloriesNext = Math.max(calibratedTdeeKcal + 100, previousRecommendedCalories + delta);
        adjustmentType = 'decreased';
        adjustmentReason = `Smoothed weight gain (+${effectiveRate.toFixed(2)} kg/wk) is trending faster than ideal for lean muscle development. Trimming by ${Math.abs(targetCaloriesNext - previousRecommendedCalories)} kcal/day to minimize excess fat gain while updating macros for ${reliableWeightKg.toFixed(1)} kg.`;
      } else {
        targetCaloriesNext = previousRecommendedCalories;
        adjustmentType = 'maintained';
        adjustmentReason = `Progress is right on target for Build Muscle (trend ${trendChangeKg >= 0 ? '+' : ''}${trendChangeKg.toFixed(2)} kg/wk). Calories remain unchanged at ${previousRecommendedCalories.toLocaleString()} kcal/day while weight-dependent macros are updated for ${reliableWeightKg.toFixed(1)} kg.`;
      }
    } else if (normalizedGoal === 'fat_gain') {
      const expectedMin = goalSpeed === 'slow' ? 0.15 : goalSpeed === 'aggressive' ? 0.32 : 0.22;
      const expectedMax = goalSpeed === 'slow' ? 0.35 : goalSpeed === 'aggressive' ? 0.6 : 0.48;
      const effectiveRate = multiWeekRate !== null ? multiWeekRate : trendChangeKg;

      if (effectiveRate < expectedMin) {
        const delta = effectiveRate <= 0.05 ? 150 : 100;
        targetCaloriesNext = previousRecommendedCalories + delta;
        adjustmentType = 'increased';
        adjustmentReason = `Smoothed gain (${trendChangeKg >= 0 ? '+' : ''}${trendChangeKg.toFixed(2)} kg/wk) is slower than your Healthy Weight Gain pace (+${expectedMin.toFixed(2)}–${expectedMax.toFixed(2)} kg/wk) despite ${Math.round(adherencePercentage)}% adherence. Increasing daily intake by +${delta} kcal/day and updating macros for ${reliableWeightKg.toFixed(1)} kg.`;
      } else if (effectiveRate > expectedMax * 1.45 && (weightAnalysis.hasMultiWeekHistory || effectiveRate > 0.7)) {
        targetCaloriesNext = Math.max(calibratedTdeeKcal + 150, previousRecommendedCalories - 100);
        adjustmentType = 'decreased';
        adjustmentReason = `Sustained weight gain (+${effectiveRate.toFixed(2)} kg/wk) is exceeding your healthy gain cap. Moderating intake by ${Math.abs(targetCaloriesNext - previousRecommendedCalories)} kcal/day while recalculating macros for ${reliableWeightKg.toFixed(1)} kg.`;
      } else {
        targetCaloriesNext = previousRecommendedCalories;
        adjustmentType = 'maintained';
        adjustmentReason = `Healthy Weight Gain is progressing on track (trend ${trendChangeKg >= 0 ? '+' : ''}${trendChangeKg.toFixed(2)} kg/wk; measured ${weightAnalysis.latestMeasuredWeightKg.toFixed(1)} kg). Calorie target stays at ${previousRecommendedCalories.toLocaleString()} kcal/day while protein, carbs, fat, and hydration are updated for ${reliableWeightKg.toFixed(1)} kg.`;
      }
    } else if (normalizedGoal === 'lose_weight') {
      const lossRatePct = -trendChangePct; // positive number means weight loss %
      const multiWeekLossPct =
        multiWeekRate !== null && weightAnalysis.previousTrendWeightKg > 0
          ? (-multiWeekRate / weightAnalysis.previousTrendWeightKg) * 100
          : null;

      const maxHealthyLossPct = goalSpeed === 'slow' ? 0.7 : goalSpeed === 'moderate' ? 1.0 : 1.15;
      const hasConfirmedPlateau =
        lossRatePct < 0.15 &&
        ((multiWeekLossPct !== null && multiWeekLossPct < 0.2) ||
          (lastApplied !== null && (lastApplied.weeklyWeightChangeKg ?? -0.3) > -0.1));

      if (lossRatePct > maxHealthyLossPct) {
        const delta = lossRatePct > 1.35 ? 150 : 100;
        targetCaloriesNext = Math.min(calibratedTdeeKcal - 150, previousRecommendedCalories + delta);
        adjustmentType = 'increased';
        adjustmentReason = `Weekly weight loss (${lossRatePct.toFixed(2)}% of body weight/wk) is faster than recommended for lean mass preservation. Increasing calories by +${Math.max(0, targetCaloriesNext - previousRecommendedCalories)} kcal/day and recalculating macros for ${reliableWeightKg.toFixed(1)} kg.`;
      } else if (hasConfirmedPlateau) {
        const minSafeCalories = Math.max(
          1050,
          Math.round(calibratedTdeeKcal * 0.75),
          recalculated.recommendedCalories - 150
        );
        const proposed = Math.max(minSafeCalories, previousRecommendedCalories - 125);
        if (proposed < previousRecommendedCalories) {
          targetCaloriesNext = proposed;
          adjustmentType = 'decreased';
          adjustmentReason = `Multi-week trend confirms a genuine plateau (${lossRatePct.toFixed(2)}%/wk) with ${Math.round(adherencePercentage)}% adherence. Applying a conservative -${previousRecommendedCalories - proposed} kcal/day adjustment within safety bounds and updating macros for ${reliableWeightKg.toFixed(1)} kg.`;
        } else {
          targetCaloriesNext = previousRecommendedCalories;
          adjustmentType = 'safety_guarded';
          adjustmentReason = `Weight loss has slowed, but daily calories are already near your individualized safety floor (${minSafeCalories.toLocaleString()} kcal/day). Keeping calories unchanged and focusing on daily steps, protein, and recovery.`;
        }
      } else if (lossRatePct < 0.15) {
        targetCaloriesNext = previousRecommendedCalories;
        adjustmentType = 'maintained';
        adjustmentReason = `Short-term scale movement slowed (${lossRatePct.toFixed(2)}%/wk), but a single 7-day window does not confirm a true plateau. Keeping calories at ${previousRecommendedCalories.toLocaleString()} kcal/day and monitoring next week's trend.`;
      } else {
        targetCaloriesNext = previousRecommendedCalories;
        adjustmentType = 'maintained';
        adjustmentReason = `Fat loss is progressing cleanly at ${lossRatePct.toFixed(2)}% body weight/week (${trendChangeKg.toFixed(2)} kg trend). Holding calories at ${previousRecommendedCalories.toLocaleString()} kcal/day while updating weight-dependent macros for ${reliableWeightKg.toFixed(1)} kg.`;
      }
    } else if (normalizedGoal === 'recomposition') {
      const driftFromMaintenance = Math.abs(previousRecommendedCalories - calibratedTdeeKcal);
      if (driftFromMaintenance > 220 && assessmentWeekNumber >= 2) {
        const direction = calibratedTdeeKcal > previousRecommendedCalories ? 1 : -1;
        targetCaloriesNext = previousRecommendedCalories + direction * 75;
        adjustmentType = direction > 0 ? 'increased' : 'decreased';
        adjustmentReason = `Re-anchoring recomposition intake slightly (${direction > 0 ? '+' : ''}75 kcal/day) toward your calibrated maintenance (${calibratedTdeeKcal.toLocaleString()} kcal/day) while updating protein & macros for ${reliableWeightKg.toFixed(1)} kg.`;
      } else {
        targetCaloriesNext = previousRecommendedCalories;
        adjustmentType = 'maintained';
        adjustmentReason = `Keeping Body Recomposition calories near maintenance (${previousRecommendedCalories.toLocaleString()} kcal/day) while updating weight-dependent protein and macro targets for ${reliableWeightKg.toFixed(1)} kg.`;
      }
    } else {
      // maintain_weight
      const effectiveRate = multiWeekRate !== null ? multiWeekRate : trendChangeKg;
      if (Math.abs(effectiveRate) > 0.35 && weightAnalysis.hasMultiWeekHistory) {
        const delta = effectiveRate > 0 ? -100 : 100;
        targetCaloriesNext = previousRecommendedCalories + delta;
        adjustmentType = delta > 0 ? 'increased' : 'decreased';
        adjustmentReason = `Sustained trend drift (${effectiveRate >= 0 ? '+' : ''}${effectiveRate.toFixed(2)} kg/wk) detected during maintenance. Adjusting by ${delta > 0 ? '+' : ''}${delta} kcal/day toward calibrated maintenance (${calibratedTdeeKcal.toLocaleString()} kcal/day).`;
      } else {
        targetCaloriesNext = previousRecommendedCalories;
        adjustmentType = 'maintained';
        adjustmentReason = `Weight trend is stable around maintenance (${trendChangeKg >= 0 ? '+' : ''}${trendChangeKg.toFixed(2)} kg/wk). Calories stay at ${previousRecommendedCalories.toLocaleString()} kcal/day with macros refreshed for ${reliableWeightKg.toFixed(1)} kg.`;
      }
    }

    rationaleBullets.push(
      `Measured weight: ${weightAnalysis.latestMeasuredWeightKg.toFixed(1)} kg · Smoothed EWMA trend: ${weightAnalysis.assessedTrendWeightKg.toFixed(1)} kg (${trendChangeKg >= 0 ? '+' : ''}${trendChangeKg.toFixed(2)} kg/wk).`
    );
    rationaleBullets.push(
      `Maintenance: Formula TDEE ${estimatedTdeeKcal.toLocaleString()} kcal/day · Calibrated TDEE ${calibratedTdeeKcal.toLocaleString()} kcal/day.`
    );
    rationaleBullets.push(
      `Logging & adherence: ${foodLoggedDays}/7 food days (${loggingCompletenessPct}%), ${weightLoggedDays}/7 weigh-ins, ${Math.round(adherencePercentage)}% calorie adherence.`
    );
  }

  // 8. Final Macro Allocation
  let recommendedCalories = previousRecommendedCalories;
  let recommendedProtein = previousRecommendedProtein;
  let recommendedCarbs = previousRecommendedCarbs;
  let recommendedFat = previousRecommendedFat;
  let recommendedFibre = previousRecommendedFibre;
  let recommendedHydrationMl = estimateHydrationMl(
    reliableWeightKg,
    input.profile.activityLevel || 'moderate',
    input.profile.workoutFrequencyPerWeek ?? 3
  );

  if (confidenceLevel === 'low' && input.goals.calories > 0) {
    // Strictly preserve existing targets on insufficient data
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
    weightAnalysis,
    foodLoggedDays,
    weightLoggedDays,
    loggingCompletenessPct,
    adherencePercentage,
    avgDailyCalories,
    avgDailyProtein,
    avgDailyCarbs,
    avgDailyFat,
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
 * Deterministic Due-Check & Period Advancement Evaluator.
 * Prevents duplicate weekly assessments for the same period and handles missed weeks cleanly.
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
  const weekEndDate = today;
  const weekStartDate = addDaysToDateKey(today, -6);

  const sortedAssessments = [...params.weeklyAssessments].sort((a, b) =>
    b.weekEndDate.localeCompare(a.weekEndDate)
  );
  const latestAssessment = sortedAssessments[0] || null;

  // Check if an assessment already exists covering today's period (or overlapping within 6 days)
  const existingForCurrentPeriod =
    sortedAssessments.find(
      (a) =>
        (a.weekStartDate === weekStartDate && a.weekEndDate === weekEndDate) ||
        daysBetweenDateKeys(a.weekEndDate, today) < 7
    ) || null;

  // Determine anchor date: last assessment's weekEndDate -> profile.lastWeeklyAssessmentAt -> goals.initialCalculatedAt -> earliest log/weight date
  let anchorDateKey: string | null = null;
  if (latestAssessment) {
    anchorDateKey = latestAssessment.weekEndDate;
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
  const daysRemaining = Math.max(0, 7 - daysSinceLastAnchor);
  const nextAssessmentDate = addDaysToDateKey(anchorDateKey, 7);

  const dailySummary = buildDailyNutritionSummaries(params.foodEntries, weekStartDate, weekEndDate);
  const foodLoggedDays = dailySummary.filter((d) => d.calories > 0).length;

  const weightAnalysis = analyzeWeightTrend(
    params.weightEntries,
    weekStartDate,
    weekEndDate,
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
    : foodLoggedDays >= 6 && weightLoggedDays >= 5
    ? 'high'
    : 'moderate';

  // Check if user has already reached target weight
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

  const isDueBySchedule = daysSinceLastAnchor >= 7 && !existingForCurrentPeriod;
  const hasPendingExisting = existingForCurrentPeriod?.status === 'pending';
  const wasDismissedForPeriod = existingForCurrentPeriod?.status === 'dismissed';
  const wasAppliedForPeriod = existingForCurrentPeriod?.status === 'applied';

  const isDue = (isDueBySchedule || hasPendingExisting) && !wasDismissedForPeriod && !wasAppliedForPeriod;

  let statusLabel: WeeklyAssessmentDueStatus['statusLabel'] = 'Assessment in progress';
  let readinessMessage = '';

  if (wasAppliedForPeriod) {
    statusLabel = 'Assessment completed';
    readinessMessage = `Week ${existingForCurrentPeriod.assessmentWeekNumber} assessment applied. Next check-in opens ${addDaysToDateKey(existingForCurrentPeriod.weekEndDate, 7)}.`;
  } else if (wasDismissedForPeriod) {
    statusLabel = 'Assessment in progress';
    readinessMessage = `Current period check-in dismissed. Next automatic check-in opens ${addDaysToDateKey(existingForCurrentPeriod.weekEndDate, 7)}.`;
  } else if (isDue && !hasMinimumData) {
    statusLabel = 'Low data confidence';
    readinessMessage = `7-day check-in window reached, but needs ${MIN_FOOD_DAYS_FOR_TUNING}+ food days (${foodLoggedDays}/7) and ${MIN_WEIGHT_DAYS_FOR_TUNING}+ weigh-ins (${weightLoggedDays}/7) before automatic calorie tuning.`;
  } else if (isDue) {
    statusLabel = 'Assessment ready';
    readinessMessage = goalCompleted
      ? `Target weight reached (${latestWeight?.toFixed(1)} kg)! Review your maintenance transition.`
      : `7 days complete with ${foodLoggedDays}/7 food logs and ${weightLoggedDays}/7 weigh-ins. Ready to calibrate targets.`;
  } else {
    statusLabel = hasMinimumData ? 'Assessment in progress' : 'Assessment in progress';
    readinessMessage = `Day ${Math.min(7, daysSinceLastAnchor + 1)} of 7 — ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} until your next scheduled check-in (${nextAssessmentDate}).`;
  }

  return {
    isDue,
    statusLabel,
    currentWeekNumber,
    weekStartDate,
    weekEndDate,
    nextAssessmentDate:
      existingForCurrentPeriod
        ? addDaysToDateKey(existingForCurrentPeriod.weekEndDate, 7)
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
    readinessMessage,
  };
}
