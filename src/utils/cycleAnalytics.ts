/**
 * Pure analytics builder for the Goals & Smart Calculator 14-day cycle dashboard,
 * Monday-Sunday weekly nutrition reports (with historical target accuracy & missing-day exclusion),
 * and dedicated weight progress charts (no fabricated weigh-in data).
 */

import type {
  FoodLogEntry,
  NutritionGoals,
  NutritionTargetHistoryRecord,
  SmartFitnessGoalType,
  UserProfile,
  WeeklyAssessmentDueStatus,
  WeeklyAssessmentRecord,
  WeightEntry,
  WeightGoal,
} from '../types/index.ts';
import {
  addDaysToDateKey,
  formatShortDate,
  formatWeekdayShort,
  getMondayToSundayWeek,
  getTodayDateKey,
  parseLocalDateKey,
} from './dateUtils.ts';
import { normalizeFitnessGoal } from './fitnessCalculator.ts';
import {
  aggregateDailyWeights,
  ASSESSMENT_CYCLE_DAYS,
  buildDailyNutritionSummaries,
  EWMA_ALPHA,
} from './weeklyAssessmentEngine.ts';

export type NutritionDayStatus = 'below' | 'within' | 'above' | 'no_log';

export interface CycleWeightChartPoint {
  date: string;
  label: string;
  dailyWeightKg: number | null;
  rolling7dAvgKg: number | null;
  startWeightKg: number | null;
  targetWeightKg: number | null;
}

export interface CycleNutritionChartPoint {
  date: string;
  label: string;
  calories: number | null;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  targetCalories: number;
  status: NutritionDayStatus;
}

export interface CyclePeriodStats {
  startDate: string;
  endDate: string;
  avgWeightKg: number | null;
  weightChangeKg: number | null;
  avgCalories: number | null;
  avgProtein: number | null;
  avgCarbs: number | null;
  avgFat: number | null;
  avgFibre: number | null;
  adherencePct: number | null;
  foodLoggedDays: number;
  weightLoggedDays: number;
}

export interface CycleComparisonRow {
  key:
    | 'avg_weight'
    | 'weight_change'
    | 'avg_calories'
    | 'avg_protein'
    | 'avg_carbs'
    | 'avg_fat'
    | 'adherence';
  label: string;
  previousDisplay: string;
  currentDisplay: string;
  deltaDisplay: string;
  status: 'positive' | 'neutral' | 'attention';
  statusLabel: string;
}

export interface Cycle15DayDashboardData {
  cycleNumber: number;
  cycleStartDate: string;
  cycleEndDate: string;
  daysCompleted: number;
  daysRemaining: number;
  activeCalories: number;
  previousCalories: number | null;
  startingWeightKg: number | null;
  latestWeightKg: number | null;
  cycleWeightChangeKg: number | null;
  summary: {
    avgDailyCalories: number | null;
    avgDailyProtein: number | null;
    avgDailyCarbs: number | null;
    avgDailyFat: number | null;
    avgDailyFibre: number | null;
    weightChangeKg: number | null;
    adherencePct: number | null;
    foodLoggedDays: number;
    weightLoggedDays: number;
  };
  weightSeries: CycleWeightChartPoint[];
  nutritionSeries: CycleNutritionChartPoint[];
  comparison: {
    hasPreviousCycleData: boolean;
    previousLabel: string;
    currentLabel: string;
    previousCycle: CyclePeriodStats;
    currentCycle: CyclePeriodStats;
    rows: CycleComparisonRow[];
    summaryStatement: string;
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function classifyCalories(calories: number | null, target: number): NutritionDayStatus {
  if (calories === null || calories <= 0) return 'no_log';
  if (target <= 0) return 'within';
  const tolerance = Math.max(100, Math.round(target * 0.08));
  if (calories < target - tolerance) return 'below';
  if (calories > target + tolerance) return 'above';
  return 'within';
}

function computeCycleStats(params: {
  startDate: string;
  endDate: string;
  foodEntries: FoodLogEntry[];
  dailyWeights: Array<{ date: string; weightKg: number }>;
  targetCalories: number;
}): CyclePeriodStats {
  const { startDate, endDate, foodEntries, dailyWeights, targetCalories } = params;
  const nutritionDays = buildDailyNutritionSummaries(foodEntries, startDate, endDate).filter(
    (d) => d.calories > 0
  );
  const weightDays = dailyWeights.filter((w) => w.date >= startDate && w.date <= endDate);

  const foodLoggedDays = nutritionDays.length;
  const weightLoggedDays = weightDays.length;

  const avgCalories =
    foodLoggedDays > 0
      ? Math.round(nutritionDays.reduce((s, d) => s + d.calories, 0) / foodLoggedDays)
      : null;
  const avgProtein =
    foodLoggedDays > 0
      ? round1(nutritionDays.reduce((s, d) => s + d.protein, 0) / foodLoggedDays)
      : null;
  const avgCarbs =
    foodLoggedDays > 0
      ? round1(nutritionDays.reduce((s, d) => s + d.carbs, 0) / foodLoggedDays)
      : null;
  const avgFat =
    foodLoggedDays > 0
      ? round1(nutritionDays.reduce((s, d) => s + d.fat, 0) / foodLoggedDays)
      : null;
  const avgFibre =
    foodLoggedDays > 0
      ? round1(nutritionDays.reduce((s, d) => s + (d.fibre || 0), 0) / foodLoggedDays)
      : null;

  const adherencePct =
    foodLoggedDays > 0 && targetCalories > 0
      ? round1(
          nutritionDays.reduce((sum, day) => {
            const devPct = Math.abs(day.calories - targetCalories) / targetCalories;
            return sum + Math.max(0, 100 - Math.min(100, devPct * 100));
          }, 0) / foodLoggedDays
        )
      : null;

  const avgWeightKg =
    weightLoggedDays > 0
      ? round2(weightDays.reduce((s, w) => s + w.weightKg, 0) / weightLoggedDays)
      : null;

  const weightChangeKg =
    weightLoggedDays >= 2
      ? round2(weightDays[weightDays.length - 1].weightKg - weightDays[0].weightKg)
      : null;

  return {
    startDate,
    endDate,
    avgWeightKg,
    weightChangeKg,
    avgCalories,
    avgProtein,
    avgCarbs,
    avgFat,
    avgFibre,
    adherencePct,
    foodLoggedDays,
    weightLoggedDays,
  };
}

function buildGoalWeightDeltaStatus(
  goal: SmartFitnessGoalType,
  changeKg: number | null
): { status: 'positive' | 'neutral' | 'attention'; label: string } {
  if (changeKg === null) return { status: 'neutral', label: 'Awaiting logs' };
  if (goal === 'lose_weight') {
    if (changeKg <= -0.15) return { status: 'positive', label: 'Trending down' };
    if (changeKg >= 0.35) return { status: 'attention', label: 'Trending up' };
    return { status: 'neutral', label: 'Steady' };
  }
  if (goal === 'build_muscle' || goal === 'fat_gain') {
    if (changeKg >= 0.1 && changeKg <= 1.2) return { status: 'positive', label: 'Steady gain' };
    if (changeKg > 1.2) return { status: 'attention', label: 'Fast gain' };
    if (changeKg < -0.15) return { status: 'attention', label: 'Slight drop' };
    return { status: 'neutral', label: 'Holding steady' };
  }
  if (Math.abs(changeKg) <= 0.45) return { status: 'positive', label: 'Weight stable' };
  return { status: 'attention', label: 'Drifting' };
}

export function build15DayCycleDashboardData(params: {
  profile: UserProfile;
  goals: NutritionGoals;
  weightGoal: WeightGoal;
  foodEntries: FoodLogEntry[];
  weightEntries: WeightEntry[];
  weeklyAssessments: WeeklyAssessmentRecord[];
  targetHistory: NutritionTargetHistoryRecord[];
  dueStatus: WeeklyAssessmentDueStatus;
  todayDateKey?: string;
}): Cycle15DayDashboardData {
  const today = params.todayDateKey || getTodayDateKey();
  const cycleStartDate = params.dueStatus.cycleStartDate || addDaysToDateKey(today, -(ASSESSMENT_CYCLE_DAYS - 1));
  const cycleEndDate = addDaysToDateKey(cycleStartDate, ASSESSMENT_CYCLE_DAYS - 1);

  const prevStartDate = addDaysToDateKey(cycleStartDate, -ASSESSMENT_CYCLE_DAYS);
  const prevEndDate = addDaysToDateKey(cycleStartDate, -1);

  const dailyWeights = aggregateDailyWeights(params.weightEntries);
  const weightByDate = new Map(dailyWeights.map((w) => [w.date, w.weightKg]));

  const currentWindowEnd = today < cycleEndDate ? today : cycleEndDate;
  const activeCalories = Math.max(0, Math.round(params.goals.calories || 0));

  const latestHistoryWithPrev = params.targetHistory.find(
    (h) => h.previousCalories !== null && h.previousCalories > 0 && h.newCalories === activeCalories
  );
  const latestAppliedAssessment = params.weeklyAssessments.find((a) => a.status === 'applied');
  const previousCalories =
    latestHistoryWithPrev?.previousCalories ??
    latestAppliedAssessment?.previousRecommendedCalories ??
    null;

  const targetWeightKg =
    params.goals.targetWeightKg && params.goals.targetWeightKg > 0
      ? params.goals.targetWeightKg
      : params.profile.targetWeightKg > 0
      ? params.profile.targetWeightKg
      : null;

  // Determine starting weight for this cycle
  const cycleWeights = dailyWeights.filter(
    (w) => w.date >= cycleStartDate && w.date <= currentWindowEnd
  );
  const preCycleWeight = [...dailyWeights]
    .reverse()
    .find((w) => w.date < cycleStartDate)?.weightKg;

  const startingWeightKg =
    cycleWeights[0]?.weightKg ??
    preCycleWeight ??
    (params.weightGoal.startingWeightKg > 0 ? params.weightGoal.startingWeightKg : null) ??
    (params.profile.currentWeightKg > 0 ? params.profile.currentWeightKg : null);

  const latestWeightKg =
    cycleWeights.length > 0
      ? cycleWeights[cycleWeights.length - 1].weightKg
      : dailyWeights.length > 0
      ? dailyWeights[dailyWeights.length - 1].weightKg
      : params.profile.currentWeightKg > 0
      ? params.profile.currentWeightKg
      : null;

  const cycleWeightChangeKg =
    startingWeightKg !== null && latestWeightKg !== null && dailyWeights.length >= 1
      ? round2(latestWeightKg - startingWeightKg)
      : null;

  // Build 14-day series (never fabricate missing weigh-ins!)
  const dailyFoodSummaries = buildDailyNutritionSummaries(
    params.foodEntries,
    cycleStartDate,
    cycleEndDate
  );
  const foodByDate = new Map(dailyFoodSummaries.map((d) => [d.date, d]));

  const weightSeries: CycleWeightChartPoint[] = [];
  const nutritionSeries: CycleNutritionChartPoint[] = [];

  for (let i = 0; i < ASSESSMENT_CYCLE_DAYS; i++) {
    const dateKey = addDaysToDateKey(cycleStartDate, i);
    const label = formatShortDate(dateKey);

    // Measured weight strictly null when not logged
    const measured = weightByDate.get(dateKey) ?? null;

    // 7-day rolling average across actual logged weigh-ins within [dateKey-6, dateKey]
    let rolling7dAvgKg: number | null = null;
    if (dateKey <= today) {
      const rStart = addDaysToDateKey(dateKey, -6);
      const rVals = dailyWeights.filter((w) => w.date >= rStart && w.date <= dateKey);
      if (rVals.length > 0 && (measured !== null || i === 0 || dateKey === today)) {
        rolling7dAvgKg = round2(rVals.reduce((s, w) => s + w.weightKg, 0) / rVals.length);
      }
    }

    weightSeries.push({
      date: dateKey,
      label,
      dailyWeightKg: measured,
      rolling7dAvgKg,
      startWeightKg: startingWeightKg,
      targetWeightKg,
    });

    const food = foodByDate.get(dateKey);
    const cals = food && food.calories > 0 ? food.calories : null;
    nutritionSeries.push({
      date: dateKey,
      label,
      calories: cals,
      protein: food ? food.protein : 0,
      carbs: food ? food.carbs : 0,
      fat: food ? food.fat : 0,
      fibre: food ? food.fibre : 0,
      targetCalories: activeCalories,
      status: classifyCalories(cals, activeCalories),
    });
  }

  const currentStats = computeCycleStats({
    startDate: cycleStartDate,
    endDate: currentWindowEnd,
    foodEntries: params.foodEntries,
    dailyWeights,
    targetCalories: activeCalories,
  });

  const previousStats = computeCycleStats({
    startDate: prevStartDate,
    endDate: prevEndDate,
    foodEntries: params.foodEntries,
    dailyWeights,
    targetCalories: previousCalories || activeCalories,
  });

  const hasPreviousCycleData =
    previousStats.foodLoggedDays > 0 || previousStats.weightLoggedDays > 0;

  const normalizedGoal = normalizeFitnessGoal(params.profile.fitnessGoal);
  const weightStatus = buildGoalWeightDeltaStatus(normalizedGoal, currentStats.weightChangeKg);

  const fmtKg = (v: number | null) => (v !== null ? `${v.toFixed(1)} kg` : '—');
  const fmtSignedKg = (v: number | null) =>
    v !== null ? `${v > 0 ? '+' : ''}${v.toFixed(2)} kg` : '—';
  const fmtKcal = (v: number | null) => (v !== null ? `${v.toLocaleString()} kcal` : '—');
  const fmtGrams = (v: number | null) => (v !== null ? `${Math.round(v)} g` : '—');
  const fmtPct = (v: number | null) => (v !== null ? `${Math.round(v)}%` : '—');

  const numDelta = (prev: number | null, curr: number | null, unit: string, decimals = 0) => {
    if (prev === null || curr === null) return '—';
    const diff = curr - prev;
    const sign = diff > 0 ? '+' : '';
    const formatted = decimals > 0 ? diff.toFixed(decimals) : Math.round(diff).toLocaleString();
    return `${sign}${formatted}${unit}`;
  };

  const rows: CycleComparisonRow[] = [
    {
      key: 'avg_weight',
      label: 'Average Weight',
      previousDisplay: fmtKg(previousStats.avgWeightKg),
      currentDisplay: fmtKg(currentStats.avgWeightKg),
      deltaDisplay: numDelta(previousStats.avgWeightKg, currentStats.avgWeightKg, ' kg', 2),
      status: weightStatus.status,
      statusLabel: weightStatus.label,
    },
    {
      key: 'weight_change',
      label: 'Weight Change',
      previousDisplay: fmtSignedKg(previousStats.weightChangeKg),
      currentDisplay: fmtSignedKg(currentStats.weightChangeKg),
      deltaDisplay: numDelta(previousStats.weightChangeKg, currentStats.weightChangeKg, ' kg', 2),
      status: weightStatus.status,
      statusLabel: weightStatus.label,
    },
    {
      key: 'avg_calories',
      label: 'Average Calories',
      previousDisplay: fmtKcal(previousStats.avgCalories),
      currentDisplay: fmtKcal(currentStats.avgCalories),
      deltaDisplay: numDelta(previousStats.avgCalories, currentStats.avgCalories, ' kcal'),
      status:
        currentStats.avgCalories !== null && activeCalories > 0
          ? Math.abs(currentStats.avgCalories - activeCalories) <= Math.max(120, activeCalories * 0.1)
            ? 'positive'
            : 'attention'
          : 'neutral',
      statusLabel:
        currentStats.avgCalories !== null && activeCalories > 0
          ? Math.abs(currentStats.avgCalories - activeCalories) <= Math.max(120, activeCalories * 0.1)
            ? 'On target'
            : currentStats.avgCalories > activeCalories
            ? 'Above target'
            : 'Under target'
          : 'Awaiting logs',
    },
    {
      key: 'avg_protein',
      label: 'Average Protein',
      previousDisplay: fmtGrams(previousStats.avgProtein),
      currentDisplay: fmtGrams(currentStats.avgProtein),
      deltaDisplay: numDelta(previousStats.avgProtein, currentStats.avgProtein, ' g'),
      status:
        currentStats.avgProtein !== null && params.goals.protein > 0
          ? currentStats.avgProtein >= params.goals.protein * 0.88
            ? 'positive'
            : 'attention'
          : 'neutral',
      statusLabel:
        currentStats.avgProtein !== null && params.goals.protein > 0
          ? currentStats.avgProtein >= params.goals.protein * 0.88
            ? 'Strong protein'
            : 'Needs protein'
          : 'Awaiting logs',
    },
    {
      key: 'avg_carbs',
      label: 'Average Carbs',
      previousDisplay: fmtGrams(previousStats.avgCarbs),
      currentDisplay: fmtGrams(currentStats.avgCarbs),
      deltaDisplay: numDelta(previousStats.avgCarbs, currentStats.avgCarbs, ' g'),
      status: 'neutral',
      statusLabel: 'Tracked',
    },
    {
      key: 'avg_fat',
      label: 'Average Fat',
      previousDisplay: fmtGrams(previousStats.avgFat),
      currentDisplay: fmtGrams(currentStats.avgFat),
      deltaDisplay: numDelta(previousStats.avgFat, currentStats.avgFat, ' g'),
      status: 'neutral',
      statusLabel: 'Tracked',
    },
    {
      key: 'adherence',
      label: 'Goal Adherence',
      previousDisplay: fmtPct(previousStats.adherencePct),
      currentDisplay: fmtPct(currentStats.adherencePct),
      deltaDisplay: numDelta(previousStats.adherencePct, currentStats.adherencePct, '%'),
      status:
        currentStats.adherencePct !== null
          ? currentStats.adherencePct >= 80
            ? 'positive'
            : currentStats.adherencePct >= 65
            ? 'neutral'
            : 'attention'
          : 'neutral',
      statusLabel:
        currentStats.adherencePct !== null
          ? currentStats.adherencePct >= 80
            ? 'Consistent'
            : 'Building habit'
          : 'Awaiting logs',
    },
  ];

  let summaryStatement =
    'Cycle 1 is underway. Keep logging daily meals and weigh-ins to unlock full 14-day comparisons.';
  if (hasPreviousCycleData) {
    const calDiff =
      currentStats.avgCalories !== null && previousStats.avgCalories !== null
        ? currentStats.avgCalories - previousStats.avgCalories
        : null;
    const adherenceText =
      currentStats.adherencePct !== null
        ? `${Math.round(currentStats.adherencePct)}% target consistency`
        : 'active logging';
    const wtText =
      currentStats.weightChangeKg !== null
        ? `weight shifted ${currentStats.weightChangeKg > 0 ? '+' : ''}${currentStats.weightChangeKg.toFixed(2)} kg`
        : 'building weigh-in trend';
    summaryStatement =
      calDiff !== null
        ? `Average intake is ${calDiff >= 0 ? '+' : ''}${calDiff} kcal/day vs your previous 14-day cycle with ${adherenceText}; ${wtText}.`
        : `Maintaining ${adherenceText} in the current 14-day cycle; ${wtText}.`;
  } else if (currentStats.foodLoggedDays > 0) {
    summaryStatement = `Logged ${currentStats.foodLoggedDays} food ${currentStats.foodLoggedDays === 1 ? 'day' : 'days'} and ${currentStats.weightLoggedDays} weigh-${currentStats.weightLoggedDays === 1 ? 'in' : 'ins'} so far in Cycle ${params.dueStatus.currentWeekNumber} (${currentStats.adherencePct !== null ? `${Math.round(currentStats.adherencePct)}% calorie consistency` : 'tracking active'}).`;
  }

  return {
    cycleNumber: params.dueStatus.currentWeekNumber,
    cycleStartDate,
    cycleEndDate,
    daysCompleted: params.dueStatus.daysCompleted,
    daysRemaining: params.dueStatus.daysRemaining,
    activeCalories,
    previousCalories,
    startingWeightKg,
    latestWeightKg,
    cycleWeightChangeKg: cycleWeightChangeKg ?? currentStats.weightChangeKg,
    summary: {
      avgDailyCalories: currentStats.avgCalories,
      avgDailyProtein: currentStats.avgProtein,
      avgDailyCarbs: currentStats.avgCarbs,
      avgDailyFat: currentStats.avgFat,
      avgDailyFibre: currentStats.avgFibre,
      weightChangeKg: cycleWeightChangeKg ?? currentStats.weightChangeKg,
      adherencePct: currentStats.adherencePct,
      foodLoggedDays: currentStats.foodLoggedDays,
      weightLoggedDays: currentStats.weightLoggedDays,
    },
    weightSeries,
    nutritionSeries,
    comparison: {
      hasPreviousCycleData,
      previousLabel: `${formatShortDate(prevStartDate)} – ${formatShortDate(prevEndDate)}`,
      currentLabel: `${formatShortDate(cycleStartDate)} – ${formatShortDate(cycleEndDate)}`,
      previousCycle: previousStats,
      currentCycle: currentStats,
      rows,
      summaryStatement,
    },
  };
}

export const build14DayCycleDashboardData = build15DayCycleDashboardData;

// ============================================================================
// MONDAY–SUNDAY WEEKLY NUTRITION PROGRESS & HISTORICAL TARGET RESOLUTION
// ============================================================================

export interface ResolvedDailyTarget {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  source: 'historical' | 'current';
}

export interface WeeklyNutritionDayPoint {
  date: string;
  dayLabel: string;
  shortDate: string;
  logged: boolean;
  calories: number | null;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  targetCalories: number;
  status: NutritionDayStatus;
}

export type WeeklyCompletenessStatus =
  | 'complete'
  | 'incomplete'
  | 'in_progress'
  | 'empty'
  | 'future';

export interface WeeklyNutritionReport {
  weekStartDate: string; // Monday YYYY-MM-DD
  weekEndDate: string; // Sunday YYYY-MM-DD
  weekLabel: string; // e.g., "Nov 16–22" or "Nov 30–Dec 6"
  weekOffset: number;
  isCurrentWeek: boolean;
  canGoNext: boolean;
  loggedDays: number; // 0..7 (only days with logged nutrition)
  totalDays: number; // 7
  isCompleteWeek: boolean;
  weekStatus: WeeklyCompletenessStatus;
  averages: {
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
    fibre: number | null;
  };
  targets: ResolvedDailyTarget;
  pctAchieved: {
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
    fibre: number | null;
  };
  dailySeries: WeeklyNutritionDayPoint[];
}

export function formatMondayToSundayLabel(mondayKey: string, sundayKey: string): string {
  const mon = parseLocalDateKey(mondayKey);
  const sun = parseLocalDateKey(sundayKey);
  const monMonth = mon.toLocaleDateString('en-US', { month: 'short' });
  const sunMonth = sun.toLocaleDateString('en-US', { month: 'short' });
  const monDay = mon.getDate();
  const sunDay = sun.getDate();
  if (mon.getFullYear() === sun.getFullYear() && monMonth === sunMonth) {
    return `${monMonth} ${monDay}–${sunDay}`;
  }
  return `${monMonth} ${monDay}–${sunMonth} ${sunDay}`;
}

/**
 * Resolves the active daily nutrition targets on a specific calendar date using targetHistory,
 * guaranteeing that updating current targets never retroactively alters past weekly reports.
 */
export function getEffectiveTargetsForDate(
  dateKey: string,
  currentGoals: NutritionGoals,
  targetHistory: NutritionTargetHistoryRecord[]
): ResolvedDailyTarget {
  const appliedChronological = [...targetHistory]
    .filter((h) => h.applied && h.newCalories > 0 && Boolean(h.effectiveDate))
    .sort((a, b) => {
      const dateCmp = a.effectiveDate.localeCompare(b.effectiveDate);
      if (dateCmp !== 0) return dateCmp;
      return a.createdAt.localeCompare(b.createdAt);
    });

  if (appliedChronological.length === 0) {
    return {
      calories: Math.max(0, Math.round(currentGoals.calories || 0)),
      protein: Math.max(0, Math.round(currentGoals.protein || 0)),
      carbs: Math.max(0, Math.round(currentGoals.carbs || 0)),
      fat: Math.max(0, Math.round(currentGoals.fat || 0)),
      fibre: Math.max(0, Math.round(currentGoals.fibre || 0)),
      source: 'current',
    };
  }

  let matchedOnOrBefore: NutritionTargetHistoryRecord | null = null;
  let earliestAfter: NutritionTargetHistoryRecord | null = null;

  for (const h of appliedChronological) {
    if (h.effectiveDate <= dateKey) {
      matchedOnOrBefore = h;
    } else if (!earliestAfter) {
      earliestAfter = h;
    }
  }

  if (matchedOnOrBefore) {
    return {
      calories: Math.round(matchedOnOrBefore.newCalories),
      protein: Math.round(matchedOnOrBefore.newProtein),
      carbs: Math.round(matchedOnOrBefore.newCarbs),
      fat: Math.round(matchedOnOrBefore.newFat),
      fibre: Math.round(matchedOnOrBefore.newFibre),
      source: 'historical',
    };
  }

  if (earliestAfter && earliestAfter.previousCalories && earliestAfter.previousCalories > 0) {
    return {
      calories: Math.round(earliestAfter.previousCalories),
      protein: Math.round(earliestAfter.previousProtein ?? currentGoals.protein ?? 0),
      carbs: Math.round(earliestAfter.previousCarbs ?? currentGoals.carbs ?? 0),
      fat: Math.round(earliestAfter.previousFat ?? currentGoals.fat ?? 0),
      fibre: Math.round(earliestAfter.previousFibre ?? currentGoals.fibre ?? 0),
      source: 'historical',
    };
  }

  return {
    calories: Math.max(0, Math.round(currentGoals.calories || 0)),
    protein: Math.max(0, Math.round(currentGoals.protein || 0)),
    carbs: Math.max(0, Math.round(currentGoals.carbs || 0)),
    fat: Math.max(0, Math.round(currentGoals.fat || 0)),
    fibre: Math.max(0, Math.round(currentGoals.fibre || 0)),
    source: 'current',
  };
}

/**
 * Resolves the comparison target for a Monday–Sunday week.
 * If targets changed mid-week, averages across the active days; otherwise returns the exact active target.
 */
export function getHistoricalTargetsForWeek(
  weekStartDate: string,
  weekEndDate: string,
  loggedDates: string[],
  currentGoals: NutritionGoals,
  targetHistory: NutritionTargetHistoryRecord[]
): ResolvedDailyTarget {
  const sampleDates = loggedDates.length > 0 ? loggedDates : [weekEndDate];
  const resolvedList = sampleDates.map((d) =>
    getEffectiveTargetsForDate(d, currentGoals, targetHistory)
  );
  const count = resolvedList.length;
  const anyHistorical = resolvedList.some((r) => r.source === 'historical');

  return {
    calories: Math.round(resolvedList.reduce((s, r) => s + r.calories, 0) / count),
    protein: Math.round(resolvedList.reduce((s, r) => s + r.protein, 0) / count),
    carbs: Math.round(resolvedList.reduce((s, r) => s + r.carbs, 0) / count),
    fat: Math.round(resolvedList.reduce((s, r) => s + r.fat, 0) / count),
    fibre: Math.round(resolvedList.reduce((s, r) => s + r.fibre, 0) / count),
    source: anyHistorical ? 'historical' : 'current',
  };
}

/**
 * Builds a Monday–Sunday weekly nutrition report.
 * Strictly averages ONLY across days with logged food (missing days are NEVER counted as 0).
 */
export function buildWeeklyNutritionReport(params: {
  foodEntries: Array<{
    date: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fibre: number;
  }>;
  currentGoals: NutritionGoals;
  targetHistory: NutritionTargetHistoryRecord[];
  referenceDateKey?: string;
  weekOffset?: number;
}): WeeklyNutritionReport {
  const today = params.referenceDateKey || getTodayDateKey();
  const weekOffset = params.weekOffset ?? 0;
  const weekDates = getMondayToSundayWeek(today, weekOffset);
  const weekStartDate = weekDates[0];
  const weekEndDate = weekDates[6];
  const weekLabel = formatMondayToSundayLabel(weekStartDate, weekEndDate);

  const dailySummaries = buildDailyNutritionSummaries(
    params.foodEntries,
    weekStartDate,
    weekEndDate
  );
  const byDate = new Map(dailySummaries.map((d) => [d.date, d]));
  const loggedSummaries = dailySummaries.filter((d) => d.calories > 0);
  const loggedDays = loggedSummaries.length;
  const loggedDates = loggedSummaries.map((d) => d.date);

  const targets = getHistoricalTargetsForWeek(
    weekStartDate,
    weekEndDate,
    loggedDates,
    params.currentGoals,
    params.targetHistory
  );

  const averages = {
    calories:
      loggedDays > 0
        ? Math.round(loggedSummaries.reduce((s, d) => s + d.calories, 0) / loggedDays)
        : null,
    protein:
      loggedDays > 0
        ? round1(loggedSummaries.reduce((s, d) => s + d.protein, 0) / loggedDays)
        : null,
    carbs:
      loggedDays > 0
        ? round1(loggedSummaries.reduce((s, d) => s + d.carbs, 0) / loggedDays)
        : null,
    fat:
      loggedDays > 0
        ? round1(loggedSummaries.reduce((s, d) => s + d.fat, 0) / loggedDays)
        : null,
    fibre:
      loggedDays > 0
        ? round1(loggedSummaries.reduce((s, d) => s + (d.fibre || 0), 0) / loggedDays)
        : null,
  };

  const pct = (avg: number | null, target: number): number | null =>
    avg !== null && target > 0 ? Math.round((avg / target) * 100) : null;

  const pctAchieved = {
    calories: pct(averages.calories, targets.calories),
    protein: pct(averages.protein, targets.protein),
    carbs: pct(averages.carbs, targets.carbs),
    fat: pct(averages.fat, targets.fat),
    fibre: pct(averages.fibre, targets.fibre),
  };

  const isCurrentWeek = weekStartDate <= today && today <= weekEndDate;
  const isFutureWeek = weekStartDate > today;
  const isCompleteWeek = weekEndDate < today && loggedDays === 7;

  let weekStatus: WeeklyCompletenessStatus = 'empty';
  if (isFutureWeek) {
    weekStatus = 'future';
  } else if (isCurrentWeek) {
    weekStatus = loggedDays > 0 ? 'in_progress' : 'empty';
  } else if (loggedDays === 7) {
    weekStatus = 'complete';
  } else if (loggedDays > 0) {
    weekStatus = 'incomplete';
  } else {
    weekStatus = 'empty';
  }

  const dailySeries: WeeklyNutritionDayPoint[] = weekDates.map((date) => {
    const entry = byDate.get(date);
    const dayTarget = getEffectiveTargetsForDate(date, params.currentGoals, params.targetHistory);
    const logged = Boolean(entry && entry.calories > 0);
    const calories = logged && entry ? Math.round(entry.calories) : null;
    return {
      date,
      dayLabel: formatWeekdayShort(date),
      shortDate: formatShortDate(date),
      logged,
      calories,
      protein: logged && entry ? entry.protein : 0,
      carbs: logged && entry ? entry.carbs : 0,
      fat: logged && entry ? entry.fat : 0,
      fibre: logged && entry ? entry.fibre : 0,
      targetCalories: dayTarget.calories || targets.calories,
      status: classifyCalories(calories, dayTarget.calories || targets.calories),
    };
  });

  return {
    weekStartDate,
    weekEndDate,
    weekLabel,
    weekOffset,
    isCurrentWeek,
    canGoNext: weekOffset < 0,
    loggedDays,
    totalDays: 7,
    isCompleteWeek,
    weekStatus,
    averages,
    targets,
    pctAchieved,
    dailySeries,
  };
}

/**
 * Returns 4 consecutive Monday–Sunday weekly nutrition reports (a 4-week / ~1-month view)
 * aligned to 4-week blocks so selecting or clicking any bar within the 4 weeks keeps all
 * 4 weeks visible side-by-side.
 */
export function buildFourWeekNutritionReports(params: {
  foodEntries: Array<{
    date: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fibre: number;
  }>;
  currentGoals: NutritionGoals;
  targetHistory: NutritionTargetHistoryRecord[];
  referenceDateKey?: string;
  weekOffset?: number;
}): WeeklyNutritionReport[] {
  const safeOffset = Math.min(0, params.weekOffset ?? 0);
  const blockIndex = Math.floor(Math.abs(safeOffset) / 4);
  const blockEndOffset = -blockIndex * 4;
  return [blockEndOffset - 3, blockEndOffset - 2, blockEndOffset - 1, blockEndOffset].map(
    (offset) =>
      buildWeeklyNutritionReport({
        foodEntries: params.foodEntries,
        currentGoals: params.currentGoals,
        targetHistory: params.targetHistory,
        referenceDateKey: params.referenceDateKey,
        weekOffset: offset,
      })
  );
}

// ============================================================================
// WEEKLY WEIGHT PROGRESS ANALYTICS (ZERO DATA FABRICATION / INTERPOLATION)
// ============================================================================

export interface WeightProgressChartPoint {
  date: string;
  label: string;
  dailyWeightKg: number | null; // Strictly null when no weigh-in exists
  smoothedWeightKg: number | null; // EWMA computed only on days with real weigh-ins
  logged: boolean;
}

export interface WeeklyWeightProgressData {
  startDate: string;
  endDate: string;
  rangeLabel: string;
  weekOffset: number;
  windowWeeks: 1 | 2 | 4;
  canGoNext: boolean;
  loggedDaysInWindow: number;
  totalLoggedEntries: number;
  startingWeightKg: number | null;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  totalWeightChangeKg: number | null; // current - starting
  windowWeightChangeKg: number | null; // delta across actual weigh-ins inside window
  remainingToTargetKg: number | null;
  progressPct: number | null;
  goalDirection: 'loss' | 'gain' | 'maintain';
  series: WeightProgressChartPoint[];
}

export function buildWeeklyWeightProgress(params: {
  weightEntries: WeightEntry[];
  profile: UserProfile;
  goals: NutritionGoals;
  weightGoal: WeightGoal;
  referenceDateKey?: string;
  weekOffset?: number;
  windowWeeks?: 1 | 2 | 4;
}): WeeklyWeightProgressData {
  const today = params.referenceDateKey || getTodayDateKey();
  const weekOffset = params.weekOffset ?? 0;
  const windowWeeks = params.windowWeeks ?? 2;

  const weekDates = getMondayToSundayWeek(today, weekOffset);
  const endDate = weekDates[6];
  const startDate =
    windowWeeks === 1 ? weekDates[0] : addDaysToDateKey(endDate, -(windowWeeks * 7 - 1));
  const rangeLabel = formatMondayToSundayLabel(startDate, endDate);

  const dailyWeights = aggregateDailyWeights(params.weightEntries);

  // Compute EWMA across chronological real weigh-ins without inventing any points for unlogged dates
  const ewmaByDate = new Map<string, number>();
  let runningEwma: number | null = null;
  for (const pt of dailyWeights) {
    runningEwma =
      runningEwma === null ? pt.weightKg : EWMA_ALPHA * pt.weightKg + (1 - EWMA_ALPHA) * runningEwma;
    ewmaByDate.set(pt.date, round2(runningEwma));
  }
  const weightByDate = new Map(dailyWeights.map((w) => [w.date, w.weightKg]));

  const totalDays = windowWeeks * 7;
  const series: WeightProgressChartPoint[] = [];
  for (let i = 0; i < totalDays; i++) {
    const date = addDaysToDateKey(startDate, i);
    const measured = weightByDate.get(date) ?? null;
    const smoothed = measured !== null ? ewmaByDate.get(date) ?? null : null;
    series.push({
      date,
      label: windowWeeks === 1 ? formatWeekdayShort(date) : formatShortDate(date),
      dailyWeightKg: measured,
      smoothedWeightKg: smoothed,
      logged: measured !== null,
    });
  }

  const windowReal = dailyWeights.filter((w) => w.date >= startDate && w.date <= endDate);
  const loggedDaysInWindow = windowReal.length;

  const startingWeightKg =
    params.weightGoal.startingWeightKg > 0
      ? round2(params.weightGoal.startingWeightKg)
      : dailyWeights[0]?.weightKg ??
        (params.profile.currentWeightKg > 0 ? round2(params.profile.currentWeightKg) : null);

  const currentWeightKg =
    dailyWeights.length > 0
      ? dailyWeights[dailyWeights.length - 1].weightKg
      : params.profile.currentWeightKg > 0
      ? round2(params.profile.currentWeightKg)
      : null;

  const targetWeightKg =
    params.goals.targetWeightKg && params.goals.targetWeightKg > 0
      ? round2(params.goals.targetWeightKg)
      : params.profile.targetWeightKg > 0
      ? round2(params.profile.targetWeightKg)
      : params.weightGoal.targetWeightKg > 0
      ? round2(params.weightGoal.targetWeightKg)
      : null;

  const totalWeightChangeKg =
    startingWeightKg !== null && currentWeightKg !== null && dailyWeights.length >= 1
      ? round2(currentWeightKg - startingWeightKg)
      : null;

  const windowWeightChangeKg =
    windowReal.length >= 2
      ? round2(windowReal[windowReal.length - 1].weightKg - windowReal[0].weightKg)
      : null;

  const normalizedGoal = normalizeFitnessGoal(params.profile.fitnessGoal);
  const goalDirection: 'loss' | 'gain' | 'maintain' =
    normalizedGoal === 'lose_weight'
      ? 'loss'
      : normalizedGoal === 'build_muscle' || normalizedGoal === 'fat_gain'
      ? 'gain'
      : targetWeightKg !== null && startingWeightKg !== null && targetWeightKg < startingWeightKg - 0.5
      ? 'loss'
      : targetWeightKg !== null && startingWeightKg !== null && targetWeightKg > startingWeightKg + 0.5
      ? 'gain'
      : 'maintain';

  let remainingToTargetKg: number | null = null;
  let progressPct: number | null = null;

  if (currentWeightKg !== null && targetWeightKg !== null) {
    remainingToTargetKg = round2(targetWeightKg - currentWeightKg);
    if (startingWeightKg !== null) {
      const totalSpan = Math.abs(targetWeightKg - startingWeightKg);
      if (totalSpan >= 0.25) {
        const covered =
          goalDirection === 'loss'
            ? startingWeightKg - currentWeightKg
            : currentWeightKg - startingWeightKg;
        progressPct = Math.max(0, Math.min(100, Math.round((covered / totalSpan) * 100)));
      } else {
        progressPct = Math.abs(currentWeightKg - targetWeightKg) <= 0.5 ? 100 : 50;
      }
    }
  }

  return {
    startDate,
    endDate,
    rangeLabel,
    weekOffset,
    windowWeeks,
    canGoNext: weekOffset < 0,
    loggedDaysInWindow,
    totalLoggedEntries: dailyWeights.length,
    startingWeightKg,
    currentWeightKg,
    targetWeightKg,
    totalWeightChangeKg,
    windowWeightChangeKg,
    remainingToTargetKg,
    progressPct,
    goalDirection,
    series,
  };
}
