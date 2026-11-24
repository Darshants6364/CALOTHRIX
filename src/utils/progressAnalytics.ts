import type {
  FoodLogEntry,
  NutritionGoals,
  WeightEntry,
  WeightGoal,
} from '../types';
import {
  addDaysToDateKey,
  formatShortDate,
  parseLocalDateKey,
  toLocalDateKey,
} from './dateUtils';
import {
  convertWeightToDisplay,
  round1,
  sortWeightEntriesChronological,
  sumMacros,
} from './nutritionUtils';

export type DateRangePreset = '7d' | '30d' | '90d' | 'custom';
export type WeightRangePreset = '7d' | '30d' | '90d';
export type NutritionMetricKey = 'calories' | 'protein' | 'carbs' | 'fat' | 'fibre' | 'water';
export type CalorieDayStatus = 'on_target' | 'below' | 'above' | 'unlogged';

export interface DailyAggregate {
  date: string;
  hasFood: boolean;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  waterMl: number;
  weightKg: number | null;
}

export interface ResolvedDateRange {
  preset: DateRangePreset;
  startDate: string;
  endDate: string;
  dates: string[];
  prevStartDate: string;
  prevEndDate: string;
  prevDates: string[];
  label: string;
  dayCount: number;
}

export interface MetricSummary {
  key: 'calories' | 'protein' | 'carbs' | 'fat' | 'fibre' | 'water';
  label: string;
  unit: string;
  avgPerLoggedDay: number | null;
  totalForPeriod: number;
  target: number;
  diffFromTarget: number | null;
  progressPct: number;
  achievementPct: number | null;
  qualifyingDays: number;
  loggedDays: number;
  status: 'on_target' | 'below' | 'above' | 'no_data';
  statusText: string;
}

export interface MacroEnergyDistribution {
  hasData: boolean;
  totalMacroCalories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  proteinKcal: number;
  carbsKcal: number;
  fatKcal: number;
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
}

export interface NutritionChartDatum {
  date: string;
  axisLabel: string;
  fullLabel: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fibre: number | null;
  water: number | null;
  trend: number | null;
  calorieStatus: CalorieDayStatus;
}

export interface WeightChartDatum {
  date: string;
  axisLabel: string;
  fullLabel: string;
  actual: number | null;
  movingAvg: number | null;
}

export interface WeightAnalyticsSummary {
  latestWeightKg: number | null;
  startingWeightKg: number | null;
  goalWeightKg: number | null;
  totalChangeKg: number | null;
  remainingToGoalKg: number | null;
  weeklyAvgWeightKg: number | null;
  priorWeeklyAvgWeightKg: number | null;
  weighInCountInRange: number;
  points: WeightChartDatum[];
}

export interface ConsistencyHeatmapCell {
  date: string;
  dayNum: number;
  isToday: boolean;
  isFuture: boolean;
  status: CalorieDayStatus;
  calories: number;
}

export interface ConsistencySummary {
  daysLogged: number;
  totalDaysInPeriod: number;
  daysOnCalorieTarget: number;
  daysOnProteinTarget: number;
  currentStreak: number;
  bestStreak: number;
  monthlyConsistencyPct: number;
  monthlyLoggedDays: number;
  monthlyElapsedDays: number;
  heatmapCells: ConsistencyHeatmapCell[];
}

export interface FactualInsight {
  id: string;
  text: string;
  tone: 'positive' | 'caution' | 'neutral';
}

export interface CalendarCell {
  date: string;
  dayNum: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
  status: CalorieDayStatus;
  hasFood: boolean;
  calories: number;
}

const SHORT_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const FULL_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function buildDatesInclusive(startDate: string, endDate: string): string[] {
  const safeStart = startDate <= endDate ? startDate : endDate;
  const safeEnd = startDate <= endDate ? endDate : startDate;
  const dates: string[] = [];
  let cursor = safeStart;
  let guard = 0;
  while (cursor <= safeEnd && guard < 366) {
    dates.push(cursor);
    cursor = addDaysToDateKey(cursor, 1);
    guard += 1;
  }
  return dates;
}

export function resolveDateRange(params: {
  preset: DateRangePreset;
  endDate: string;
  customStart?: string;
  customEnd?: string;
}): ResolvedDateRange {
  const { preset, endDate, customStart, customEnd } = params;
  let startDate = endDate;
  let resolvedEnd = endDate;

  if (preset === '7d') {
    startDate = addDaysToDateKey(endDate, -6);
  } else if (preset === '30d') {
    startDate = addDaysToDateKey(endDate, -29);
  } else if (preset === '90d') {
    startDate = addDaysToDateKey(endDate, -89);
  } else {
    const cStart = customStart || addDaysToDateKey(endDate, -13);
    const cEnd = customEnd || endDate;
    startDate = cStart <= cEnd ? cStart : cEnd;
    resolvedEnd = cStart <= cEnd ? cEnd : cStart;
  }

  const dates = buildDatesInclusive(startDate, resolvedEnd);
  const dayCount = dates.length;
  const prevEndDate = addDaysToDateKey(startDate, -1);
  const prevStartDate = addDaysToDateKey(prevEndDate, -(dayCount - 1));
  const prevDates = buildDatesInclusive(prevStartDate, prevEndDate);

  const label = `${formatShortDate(startDate)} – ${formatShortDate(resolvedEnd)}`;

  return {
    preset,
    startDate,
    endDate: resolvedEnd,
    dates,
    prevStartDate,
    prevEndDate,
    prevDates,
    label,
    dayCount,
  };
}

export function buildDailyAggregateMap(params: {
  foodEntries: FoodLogEntry[];
  weightEntries: WeightEntry[];
  waterIntakeMlByDate: Record<string, number>;
}): Map<string, DailyAggregate> {
  const map = new Map<string, DailyAggregate>();
  const foodByDate = new Map<string, FoodLogEntry[]>();

  for (const entry of params.foodEntries) {
    const list = foodByDate.get(entry.date) || [];
    list.push(entry);
    foodByDate.set(entry.date, list);
  }

  const ensure = (date: string): DailyAggregate => {
    let existing = map.get(date);
    if (!existing) {
      existing = {
        date,
        hasFood: false,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fibre: 0,
        waterMl: 0,
        weightKg: null,
      };
      map.set(date, existing);
    }
    return existing;
  };

  foodByDate.forEach((entries, date) => {
    const totals = sumMacros(entries);
    const rec = ensure(date);
    rec.hasFood = entries.length > 0 && totals.calories > 0;
    rec.calories = Math.round(totals.calories);
    rec.protein = round1(totals.protein);
    rec.carbs = round1(totals.carbs);
    rec.fat = round1(totals.fat);
    rec.fibre = round1(totals.fibre);
  });

  for (const w of sortWeightEntriesChronological(params.weightEntries)) {
    const rec = ensure(w.date);
    rec.weightKg = w.weightKg;
  }

  Object.entries(params.waterIntakeMlByDate).forEach(([date, ml]) => {
    if (ml > 0) {
      const rec = ensure(date);
      rec.waterMl = Math.round(ml);
    }
  });

  return map;
}

export function classifyCalorieStatus(calories: number | null, goalCalories: number): CalorieDayStatus {
  if (calories === null || calories <= 0) return 'unlogged';
  if (goalCalories <= 0) return 'on_target';
  const ratio = calories / goalCalories;
  if (ratio >= 0.85 && ratio <= 1.12) return 'on_target';
  if (ratio < 0.85) return 'below';
  return 'above';
}

function buildMetricSummary(params: {
  key: MetricSummary['key'];
  label: string;
  unit: string;
  values: number[];
  target: number;
  decimals?: 0 | 1;
  qualifyFn: (val: number, target: number) => boolean;
}): MetricSummary {
  const { key, label, unit, values, target, decimals = 0, qualifyFn } = params;
  const loggedDays = values.length;
  const totalRaw = values.reduce((s, v) => s + v, 0);
  const totalForPeriod = decimals === 1 ? round1(totalRaw) : Math.round(totalRaw);

  if (loggedDays === 0) {
    return {
      key,
      label,
      unit,
      avgPerLoggedDay: null,
      totalForPeriod: 0,
      target,
      diffFromTarget: null,
      progressPct: 0,
      achievementPct: null,
      qualifyingDays: 0,
      loggedDays: 0,
      status: 'no_data',
      statusText: 'No logs in period',
    };
  }

  const rawAvg = totalRaw / loggedDays;
  const avgPerLoggedDay = decimals === 1 ? round1(rawAvg) : Math.round(rawAvg);
  const diffRaw = target > 0 ? rawAvg - target : null;
  const diffFromTarget =
    diffRaw === null ? null : decimals === 1 ? round1(diffRaw) : Math.round(diffRaw);

  const progressPct = target > 0 ? Math.min(130, Math.round((rawAvg / target) * 100)) : 0;
  const qualifyingDays = target > 0 ? values.filter((v) => qualifyFn(v, target)).length : loggedDays;
  const achievementPct = target > 0 ? Math.round((qualifyingDays / loggedDays) * 100) : null;

  let status: MetricSummary['status'] = 'on_target';
  let statusText = 'No target set';

  if (target > 0 && diffFromTarget !== null) {
    const absDiff = Math.abs(diffFromTarget);
    const formattedDiff = decimals === 1 ? absDiff.toFixed(1) : absDiff.toLocaleString();
    const ratio = rawAvg / target;

    if (key === 'protein' || key === 'fibre' || key === 'water') {
      if (ratio >= 0.9) {
        status = 'on_target';
        statusText =
          diffFromTarget >= 0
            ? `${formattedDiff} ${unit} above target`
            : `${formattedDiff} ${unit} from target`;
      } else {
        status = 'below';
        statusText = `${formattedDiff} ${unit} below target`;
      }
    } else if (ratio >= 0.88 && ratio <= 1.1) {
      status = 'on_target';
      statusText =
        absDiff === 0
          ? 'Right on target'
          : diffFromTarget < 0
          ? `${formattedDiff} ${unit} below target`
          : `${formattedDiff} ${unit} above target`;
    } else if (ratio < 0.88) {
      status = 'below';
      statusText = `${formattedDiff} ${unit} below target`;
    } else {
      status = 'above';
      statusText = `${formattedDiff} ${unit} above target`;
    }
  }

  return {
    key,
    label,
    unit,
    avgPerLoggedDay,
    totalForPeriod,
    target,
    diffFromTarget,
    progressPct,
    achievementPct,
    qualifyingDays,
    loggedDays,
    status,
    statusText,
  };
}

export function computeNutritionAnalytics(params: {
  range: ResolvedDateRange;
  dailyMap: Map<string, DailyAggregate>;
  goals: NutritionGoals;
  dailyWaterGoalMl: number;
  selectedMetric: NutritionMetricKey;
}): {
  overview: {
    calories: MetricSummary;
    protein: MetricSummary;
    carbs: MetricSummary;
    fat: MetricSummary;
    fibre: MetricSummary;
    water: MetricSummary;
  };
  macroDistribution: MacroEnergyDistribution;
  chartSeries: NutritionChartDatum[];
} {
  const { range, dailyMap, goals, dailyWaterGoalMl, selectedMetric } = params;

  const calVals: number[] = [];
  const proVals: number[] = [];
  const carbVals: number[] = [];
  const fatVals: number[] = [];
  const fibVals: number[] = [];
  const waterVals: number[] = [];

  const rawSeries = range.dates.map((date) => {
    const rec = dailyMap.get(date);
    const hasFood = Boolean(rec?.hasFood);
    const dt = parseLocalDateKey(date);
    const axisLabel =
      range.dayCount <= 7
        ? SHORT_WEEKDAYS[(dt.getDay() + 6) % 7]
        : `${SHORT_MONTHS[dt.getMonth()]} ${dt.getDate()}`;

    if (hasFood && rec) {
      calVals.push(rec.calories);
      proVals.push(rec.protein);
      carbVals.push(rec.carbs);
      fatVals.push(rec.fat);
      fibVals.push(rec.fibre);
    }
    if (rec && rec.waterMl > 0) {
      waterVals.push(rec.waterMl);
    }

    return {
      date,
      axisLabel,
      fullLabel: formatShortDate(date),
      calories: hasFood && rec ? rec.calories : null,
      protein: hasFood && rec ? rec.protein : null,
      carbs: hasFood && rec ? rec.carbs : null,
      fat: hasFood && rec ? rec.fat : null,
      fibre: hasFood && rec ? rec.fibre : null,
      water: rec && rec.waterMl > 0 ? rec.waterMl : null,
      calorieStatus: classifyCalorieStatus(hasFood && rec ? rec.calories : null, goals.calories),
    };
  });

  // Compute rolling 3-logged-point trend for selectedMetric (never zero-fills missing days)
  const rollingWindow: number[] = [];
  const chartSeries: NutritionChartDatum[] = rawSeries.map((pt) => {
    const val = pt[selectedMetric];
    let trend: number | null = null;
    if (val !== null) {
      rollingWindow.push(val);
      const slice = rollingWindow.slice(-3);
      const avg = slice.reduce((s, v) => s + v, 0) / slice.length;
      trend = selectedMetric === 'calories' || selectedMetric === 'water' ? Math.round(avg) : round1(avg);
    }
    return { ...pt, trend };
  });

  const overview = {
    calories: buildMetricSummary({
      key: 'calories',
      label: 'Calories',
      unit: 'kcal',
      values: calVals,
      target: goals.calories,
      decimals: 0,
      qualifyFn: (v, t) => v >= t * 0.85 && v <= t * 1.12,
    }),
    protein: buildMetricSummary({
      key: 'protein',
      label: 'Protein',
      unit: 'g',
      values: proVals,
      target: goals.protein,
      decimals: 1,
      qualifyFn: (v, t) => v >= t * 0.9,
    }),
    carbs: buildMetricSummary({
      key: 'carbs',
      label: 'Carbs',
      unit: 'g',
      values: carbVals,
      target: goals.carbs,
      decimals: 1,
      qualifyFn: (v, t) => v >= t * 0.8 && v <= t * 1.15,
    }),
    fat: buildMetricSummary({
      key: 'fat',
      label: 'Fat',
      unit: 'g',
      values: fatVals,
      target: goals.fat,
      decimals: 1,
      qualifyFn: (v, t) => v >= t * 0.75 && v <= t * 1.15,
    }),
    fibre: buildMetricSummary({
      key: 'fibre',
      label: 'Fiber',
      unit: 'g',
      values: fibVals,
      target: goals.fibre || 30,
      decimals: 1,
      qualifyFn: (v, t) => v >= t * 0.85,
    }),
    water: buildMetricSummary({
      key: 'water',
      label: 'Water',
      unit: 'ml',
      values: waterVals,
      target: dailyWaterGoalMl,
      decimals: 0,
      qualifyFn: (v, t) => v >= t * 0.85,
    }),
  };

  // Macro energy distribution using exact Atwater factors (P*4, C*4, F*9)
  const avgP = overview.protein.avgPerLoggedDay ?? 0;
  const avgC = overview.carbs.avgPerLoggedDay ?? 0;
  const avgF = overview.fat.avgPerLoggedDay ?? 0;
  const proteinKcal = Math.round(avgP * 4);
  const carbsKcal = Math.round(avgC * 4);
  const fatKcal = Math.round(avgF * 9);
  const totalMacroCalories = proteinKcal + carbsKcal + fatKcal;

  const macroDistribution: MacroEnergyDistribution =
    totalMacroCalories > 0
      ? {
          hasData: true,
          totalMacroCalories,
          proteinGrams: avgP,
          carbsGrams: avgC,
          fatGrams: avgF,
          proteinKcal,
          carbsKcal,
          fatKcal,
          proteinPct: Math.round((proteinKcal / totalMacroCalories) * 100),
          carbsPct: Math.round((carbsKcal / totalMacroCalories) * 100),
          fatPct: Math.max(
            0,
            100 -
              Math.round((proteinKcal / totalMacroCalories) * 100) -
              Math.round((carbsKcal / totalMacroCalories) * 100)
          ),
        }
      : {
          hasData: false,
          totalMacroCalories: 0,
          proteinGrams: 0,
          carbsGrams: 0,
          fatGrams: 0,
          proteinKcal: 0,
          carbsKcal: 0,
          fatKcal: 0,
          proteinPct: 0,
          carbsPct: 0,
          fatPct: 0,
        };

  return { overview, macroDistribution, chartSeries };
}

export function computeWeightAnalytics(params: {
  weightEntries: WeightEntry[];
  weightGoal: WeightGoal;
  goals: NutritionGoals;
  weightUnit: 'kg' | 'lbs';
  weightRange: WeightRangePreset;
  endDate: string;
}): WeightAnalyticsSummary {
  const { weightEntries, weightGoal, goals, weightUnit, weightRange, endDate } = params;
  const sorted = sortWeightEntriesChronological(weightEntries);

  const latestEntry = sorted.length > 0 ? sorted[sorted.length - 1] : null;
  const startingWeightKg =
    weightGoal.startingWeightKg && weightGoal.startingWeightKg > 0
      ? weightGoal.startingWeightKg
      : sorted[0]?.weightKg ?? null;
  const goalWeightKg =
    weightGoal.targetWeightKg && weightGoal.targetWeightKg > 0
      ? weightGoal.targetWeightKg
      : goals.targetWeightKg && goals.targetWeightKg > 0
      ? goals.targetWeightKg
      : null;

  const latestWeightKg = latestEntry?.weightKg ?? null;
  const totalChangeKg =
    latestWeightKg !== null && startingWeightKg !== null
      ? round1(latestWeightKg - startingWeightKg)
      : null;
  const remainingToGoalKg =
    latestWeightKg !== null && goalWeightKg !== null
      ? round1(latestWeightKg - goalWeightKg)
      : null;

  // Weekly average weight (last 7 days ending endDate) & prior 7-day average
  const weekStart = addDaysToDateKey(endDate, -6);
  const priorEnd = addDaysToDateKey(weekStart, -1);
  const priorStart = addDaysToDateKey(priorEnd, -6);

  const curWeekEntries = sorted.filter((w) => w.date >= weekStart && w.date <= endDate);
  const priorWeekEntries = sorted.filter((w) => w.date >= priorStart && w.date <= priorEnd);

  const weeklyAvgWeightKg =
    curWeekEntries.length > 0
      ? round1(curWeekEntries.reduce((s, w) => s + w.weightKg, 0) / curWeekEntries.length)
      : null;
  const priorWeeklyAvgWeightKg =
    priorWeekEntries.length > 0
      ? round1(priorWeekEntries.reduce((s, w) => s + w.weightKg, 0) / priorWeekEntries.length)
      : null;

  // Chart range
  const days = weightRange === '7d' ? 7 : weightRange === '30d' ? 30 : 90;
  const startDate = addDaysToDateKey(endDate, -(days - 1));
  const dates = buildDatesInclusive(startDate, endDate);

  const weightByDate = new Map<string, number>();
  for (const w of sorted) {
    weightByDate.set(w.date, w.weightKg);
  }

  let weighInCountInRange = 0;
  const points: WeightChartDatum[] = dates.map((date) => {
    const dt = parseLocalDateKey(date);
    const axisLabel =
      days <= 7
        ? SHORT_WEEKDAYS[(dt.getDay() + 6) % 7]
        : `${SHORT_MONTHS[dt.getMonth()]} ${dt.getDate()}`;

    const rawKg = weightByDate.get(date);
    if (rawKg !== undefined) weighInCountInRange += 1;

    // 7-day trailing moving average over actual measurements (null if no measurements in 7-day window)
    const winStart = addDaysToDateKey(date, -6);
    const windowVals = sorted.filter((w) => w.date >= winStart && w.date <= date);
    const movingAvgKg =
      windowVals.length > 0 && rawKg !== undefined
        ? windowVals.reduce((s, w) => s + w.weightKg, 0) / windowVals.length
        : null;

    return {
      date,
      axisLabel,
      fullLabel: formatShortDate(date),
      actual: rawKg !== undefined ? convertWeightToDisplay(rawKg, weightUnit) : null,
      movingAvg:
        movingAvgKg !== null ? convertWeightToDisplay(round1(movingAvgKg), weightUnit) : null,
    };
  });

  return {
    latestWeightKg,
    startingWeightKg,
    goalWeightKg,
    totalChangeKg,
    remainingToGoalKg,
    weeklyAvgWeightKg,
    priorWeeklyAvgWeightKg,
    weighInCountInRange,
    points,
  };
}

export function computeConsistencyAnalytics(params: {
  range: ResolvedDateRange;
  dailyMap: Map<string, DailyAggregate>;
  goals: NutritionGoals;
  todayKey: string;
}): ConsistencySummary {
  const { range, dailyMap, goals, todayKey } = params;

  let daysLogged = 0;
  let daysOnCalorieTarget = 0;
  let daysOnProteinTarget = 0;

  for (const date of range.dates) {
    const rec = dailyMap.get(date);
    if (!rec?.hasFood) continue;
    daysLogged += 1;
    if (classifyCalorieStatus(rec.calories, goals.calories) === 'on_target') {
      daysOnCalorieTarget += 1;
    }
    if (goals.protein > 0 && rec.protein >= goals.protein * 0.9) {
      daysOnProteinTarget += 1;
    }
  }

  // Current streak (count backwards from today; allow today unlogged if yesterday logged)
  let currentStreak = 0;
  let cursor = todayKey;
  if (!dailyMap.get(cursor)?.hasFood) {
    cursor = addDaysToDateKey(todayKey, -1);
  }
  while (dailyMap.get(cursor)?.hasFood && currentStreak < 730) {
    currentStreak += 1;
    cursor = addDaysToDateKey(cursor, -1);
  }

  // Best all-time streak across actual logged dates
  const loggedDateList = Array.from(dailyMap.values())
    .filter((d) => d.hasFood)
    .map((d) => d.date)
    .sort();

  let bestStreak = 0;
  let run = 0;
  for (let i = 0; i < loggedDateList.length; i++) {
    if (i === 0 || addDaysToDateKey(loggedDateList[i - 1], 1) === loggedDateList[i]) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > bestStreak) bestStreak = run;
  }

  // Monthly consistency % (current calendar month up to today)
  const todayDt = parseLocalDateKey(todayKey);
  const monthStart = toLocalDateKey(new Date(todayDt.getFullYear(), todayDt.getMonth(), 1, 12, 0, 0));
  const monthDates = buildDatesInclusive(monthStart, todayKey);
  const monthlyElapsedDays = monthDates.length;
  const monthlyLoggedDays = monthDates.filter((d) => dailyMap.get(d)?.hasFood).length;
  const monthlyConsistencyPct =
    monthlyElapsedDays > 0 ? Math.round((monthlyLoggedDays / monthlyElapsedDays) * 100) : 0;

  // 35-day Mon–Sun aligned consistency heatmap ending on Sunday of endDate's week
  const endDt = parseLocalDateKey(range.endDate);
  const endMonOffset = (endDt.getDay() + 6) % 7;
  const endSunday = addDaysToDateKey(range.endDate, 6 - endMonOffset);
  const heatmapStart = addDaysToDateKey(endSunday, -34);

  const heatmapCells: ConsistencyHeatmapCell[] = [];
  for (let i = 0; i < 35; i++) {
    const date = addDaysToDateKey(heatmapStart, i);
    const dt = parseLocalDateKey(date);
    const isFuture = date > todayKey;
    const rec = dailyMap.get(date);
    const status: CalorieDayStatus =
      isFuture || !rec?.hasFood ? 'unlogged' : classifyCalorieStatus(rec.calories, goals.calories);

    heatmapCells.push({
      date,
      dayNum: dt.getDate(),
      isToday: date === todayKey,
      isFuture,
      status,
      calories: rec?.hasFood ? rec.calories : 0,
    });
  }

  return {
    daysLogged,
    totalDaysInPeriod: range.dayCount,
    daysOnCalorieTarget,
    daysOnProteinTarget,
    currentStreak,
    bestStreak,
    monthlyConsistencyPct,
    monthlyLoggedDays,
    monthlyElapsedDays,
    heatmapCells,
  };
}

export function computeFactualInsights(params: {
  range: ResolvedDateRange;
  dailyMap: Map<string, DailyAggregate>;
  goals: NutritionGoals;
  weightSummary: WeightAnalyticsSummary;
  weightUnit: 'kg' | 'lbs';
}): FactualInsight[] {
  const { range, dailyMap, goals, weightSummary, weightUnit } = params;
  const insights: FactualInsight[] = [];

  const curLogged = range.dates
    .map((d) => dailyMap.get(d))
    .filter((r): r is DailyAggregate => Boolean(r?.hasFood));

  const prevLogged = range.prevDates
    .map((d) => dailyMap.get(d))
    .filter((r): r is DailyAggregate => Boolean(r?.hasFood));

  // 1. Calorie target hit count (needs at least 2 logged days)
  if (curLogged.length >= 2 && goals.calories > 0) {
    const hits = curLogged.filter(
      (r) => classifyCalorieStatus(r.calories, goals.calories) === 'on_target'
    ).length;
    insights.push({
      id: 'cal-hits',
      text: `You achieved your calorie target on ${hits} out of ${curLogged.length} logged days.`,
      tone: hits / curLogged.length >= 0.7 ? 'positive' : 'neutral',
    });
  }

  // 2. Protein change vs previous period (needs >= 2 logged days in both periods)
  if (curLogged.length >= 2 && prevLogged.length >= 2) {
    const curAvgPro = curLogged.reduce((s, r) => s + r.protein, 0) / curLogged.length;
    const prevAvgPro = prevLogged.reduce((s, r) => s + r.protein, 0) / prevLogged.length;
    if (prevAvgPro > 5) {
      const pctDelta = Math.round(((curAvgPro - prevAvgPro) / prevAvgPro) * 100);
      if (Math.abs(pctDelta) >= 3) {
        insights.push({
          id: 'pro-delta',
          text: `Your average protein intake ${pctDelta > 0 ? 'increased' : 'decreased'} by ${Math.abs(pctDelta)}% compared with the prior ${range.dayCount}-day period.`,
          tone: pctDelta > 0 ? 'positive' : 'caution',
        });
      }
    }
  }

  // 3. Weekday vs weekend calorie consistency (needs >= 2 weekdays and >= 1 weekend day)
  if (curLogged.length >= 4 && goals.calories > 0) {
    const weekdays = curLogged.filter((r) => {
      const d = parseLocalDateKey(r.date).getDay();
      return d >= 1 && d <= 5;
    });
    const weekends = curLogged.filter((r) => {
      const d = parseLocalDateKey(r.date).getDay();
      return d === 0 || d === 6;
    });

    if (weekdays.length >= 2 && weekends.length >= 1) {
      const wdRate =
        weekdays.filter((r) => classifyCalorieStatus(r.calories, goals.calories) === 'on_target')
          .length / weekdays.length;
      const weRate =
        weekends.filter((r) => classifyCalorieStatus(r.calories, goals.calories) === 'on_target')
          .length / weekends.length;
      if (wdRate - weRate >= 0.2) {
        insights.push({
          id: 'weekday-consistency',
          text: 'Your calorie intake was most consistent on weekdays compared with weekends.',
          tone: 'neutral',
        });
      } else if (weRate - wdRate >= 0.2) {
        insights.push({
          id: 'weekend-consistency',
          text: 'Your calorie intake was most consistent on weekends during this period.',
          tone: 'neutral',
        });
      }
    }
  }

  // 4. Fiber gap check (needs >= 3 logged days)
  const fibreTarget = goals.fibre > 0 ? goals.fibre : 30;
  if (curLogged.length >= 3 && fibreTarget > 0) {
    const avgFib = round1(curLogged.reduce((s, r) => s + r.fibre, 0) / curLogged.length);
    const hitCount = curLogged.filter((r) => r.fibre >= fibreTarget * 0.85).length;
    if (hitCount / curLogged.length < 0.5) {
      insights.push({
        id: 'fiber-gap',
        text: `You averaged ${avgFib}g fiber against your ${fibreTarget}g daily goal—adding legumes, oats, or vegetables can close the gap.`,
        tone: 'caution',
      });
    }
  }

  // 5. Weekly average weight change
  if (
    weightSummary.weeklyAvgWeightKg !== null &&
    weightSummary.priorWeeklyAvgWeightKg !== null
  ) {
    const deltaKg = round1(weightSummary.weeklyAvgWeightKg - weightSummary.priorWeeklyAvgWeightKg);
    const displayDelta =
      weightUnit === 'lbs' ? round1(deltaKg * 2.20462) : deltaKg;
    if (Math.abs(displayDelta) >= 0.1) {
      insights.push({
        id: 'weight-weekly',
        text: `Your weekly average weight ${displayDelta > 0 ? 'increased' : 'decreased'} by ${Math.abs(displayDelta)} ${weightUnit} compared with the prior week.`,
        tone: 'neutral',
      });
    }
  }

  return insights.slice(0, 4);
}

export function buildCompactMonthGrid(params: {
  year: number;
  month: number;
  dailyMap: Map<string, DailyAggregate>;
  goals: NutritionGoals;
  todayKey: string;
}): {
  monthTitle: string;
  weeks: CalendarCell[][];
} {
  const { year, month, dailyMap, goals, todayKey } = params;
  const firstDt = new Date(year, month, 1, 12, 0, 0);
  const daysInMonth = new Date(year, month + 1, 0, 12, 0, 0).getDate();
  const leadPad = (firstDt.getDay() + 6) % 7; // Mon=0 .. Sun=6
  const totalCells = Math.ceil((leadPad + daysInMonth) / 7) * 7;

  const flat: CalendarCell[] = [];
  for (let i = 0; i < totalCells; i++) {
    const dayOffset = i - leadPad + 1;
    const cellDt = new Date(year, month, dayOffset, 12, 0, 0);
    const date = toLocalDateKey(cellDt);
    const inCurrentMonth = cellDt.getMonth() === month;
    const isFuture = date > todayKey;
    const rec = dailyMap.get(date);
    const hasFood = Boolean(!isFuture && rec?.hasFood);
    const status: CalorieDayStatus = hasFood && rec ? classifyCalorieStatus(rec.calories, goals.calories) : 'unlogged';

    flat.push({
      date,
      dayNum: cellDt.getDate(),
      inCurrentMonth,
      isToday: date === todayKey,
      isFuture,
      status,
      hasFood,
      calories: hasFood && rec ? rec.calories : 0,
    });
  }

  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < flat.length; i += 7) {
    weeks.push(flat.slice(i, i + 7));
  }

  return {
    monthTitle: `${FULL_MONTHS[month]} ${year}`,
    weeks,
  };
}
