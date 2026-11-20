import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Award,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flame,
  Pencil,
  SlidersHorizontal,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { MEAL_CATEGORIES } from '../types';
import {
  evaluateAdaptiveCalorieAdjustment,
  getMultiWeekProgressSeries,
  getWeeklyCalorieBankSummary,
} from '../utils/analyticsUtils';
import {
  addDaysToDateKey,
  formatReadableDate,
  formatShortDate,
  formatWeekdayShort,
  getCalendarMonthDates,
  getMondayToSundayWeek,
  getTodayDateKey,
} from '../utils/dateUtils';
import {
  convertWeightToDisplay,
  formatWeight,
  getDailyGoalCompletionScore,
  getEntriesForDate,
  getMealBreakdown,
  isCalorieGoalAchieved,
  round1,
  round2,
  roundCal,
  sortWeightEntriesChronological,
  sumMacros,
} from '../utils/nutritionUtils';

type ProgressTab = 'daily' | 'weekly' | 'monthly';

type GraphId =
  | 'calories'
  | 'protein'
  | 'weightVsIntake'
  | 'carbsFat'
  | 'fibre'
  | 'mealTiming'
  | 'heatmap';

type GraphStatus = 'good' | 'modify' | 'neutral';

const GRAPH_VISIBILITY_KEY = 'calothrix_progress_graphs_v1';

const DEFAULT_VISIBLE_GRAPHS: Record<GraphId, boolean> = {
  calories: true,
  protein: true,
  weightVsIntake: true,
  carbsFat: true,
  fibre: false,
  mealTiming: false,
  heatmap: false,
};

const GRAPH_META: { id: GraphId; label: string }[] = [
  { id: 'calories', label: 'Calories vs Goal' },
  { id: 'protein', label: 'Protein Target' },
  { id: 'weightVsIntake', label: 'Weight vs Intake' },
  { id: 'carbsFat', label: 'Carbs & Fats' },
  { id: 'fibre', label: 'Fibre Intake' },
  { id: 'mealTiming', label: 'Meal Timing' },
  { id: 'heatmap', label: '28-Day Streak' },
];

function StatusPill({ status, label }: { status: GraphStatus; label: string }) {
  if (status === 'good') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-lime-100 dark:bg-lime-950/60 text-lime-800 dark:text-lime-300 text-[11px] font-semibold whitespace-nowrap shrink-0">
        <CheckCircle2 className="w-3 h-3" />
        {label}
      </span>
    );
  }
  if (status === 'modify') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[11px] font-semibold whitespace-nowrap shrink-0">
        <AlertCircle className="w-3 h-3" />
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-stone-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-medium whitespace-nowrap shrink-0">
      {label}
    </span>
  );
}

export const ProgressPage: React.FC = () => {
  const { state, resolvedTheme, selectedDate, updateGoals, notify } = useMacroLogStore();
  const isDark = resolvedTheme === 'dark';
  const gridStroke = isDark ? 'rgba(255,255,255,0.08)' : '#e7e5e4';
  const tickColor = isDark ? '#9A9CA3' : '#52555E';
  const tooltipStyle = {
    backgroundColor: isDark ? '#14161C' : '#ffffff',
    borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)',
    color: isDark ? '#F3F4F6' : '#111317',
    borderRadius: '10px',
    fontSize: '12px',
  };

  const [tab, setTab] = useState<ProgressTab>('weekly');
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [showCustomize, setShowCustomize] = useState(false);

  // Graph visibility state
  const [visibleGraphs, setVisibleGraphs] = useState<Record<GraphId, boolean>>(() => {
    try {
      const saved = localStorage.getItem(GRAPH_VISIBILITY_KEY);
      if (saved) {
        return { ...DEFAULT_VISIBLE_GRAPHS, ...(JSON.parse(saved) as Partial<Record<GraphId, boolean>>) };
      }
    } catch {
      // Ignore storage errors
    }
    return DEFAULT_VISIBLE_GRAPHS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(GRAPH_VISIBILITY_KEY, JSON.stringify(visibleGraphs));
    } catch {
      // Ignore storage errors
    }
  }, [visibleGraphs]);

  // Inline quick target editor right on top of any graph
  const [editingTargetField, setEditingTargetField] = useState<
    null | 'calories' | 'protein' | 'carbs' | 'fat' | 'fibre'
  >(null);
  const [targetDraft, setTargetDraft] = useState('');

  const { goals, foodEntries, weightEntries, profile, settings } = state;
  const unit = settings.weightUnit;
  const today = getTodayDateKey();

  const openInlineTargetEdit = (
    field: 'calories' | 'protein' | 'carbs' | 'fat' | 'fibre'
  ) => {
    setEditingTargetField(field);
    setTargetDraft(String(goals[field] || ''));
  };

  const saveInlineTargetEdit = (
    field: 'calories' | 'protein' | 'carbs' | 'fat' | 'fibre'
  ) => {
    const val = Math.round(Number(targetDraft));
    if (!Number.isFinite(val) || val <= 0) {
      notify('Enter a valid positive target value.', 'error');
      return;
    }
    if (field === 'calories' && (val < 1000 || val > 8000)) {
      notify('Calorie target must be between 1,000 and 8,000 kcal.', 'error');
      return;
    }

    updateGoals({
      ...goals,
      preset: 'custom',
      [field]: val,
    });
    setEditingTargetField(null);
    notify(`Updated ${field} target to ${val}${field === 'calories' ? ' kcal' : ' g'}.`);
  };

  // DAILY ANALYTICS
  const dailyEntries = useMemo(
    () => getEntriesForDate(foodEntries, selectedDate),
    [foodEntries, selectedDate]
  );
  const dailyTotals = useMemo(() => sumMacros(dailyEntries), [dailyEntries]);
  const dailyScore = useMemo(
    () => getDailyGoalCompletionScore(dailyTotals, goals),
    [dailyTotals, goals]
  );
  const dailyMealBreakdown = useMemo(() => getMealBreakdown(dailyEntries), [dailyEntries]);
  const dailyMealChartData = useMemo(
    () =>
      MEAL_CATEGORIES.map((m) => ({
        meal: m.shortLabel,
        calories: dailyMealBreakdown[m.id].totals.calories,
        protein: dailyMealBreakdown[m.id].totals.protein,
        carbs: dailyMealBreakdown[m.id].totals.carbs,
        fat: dailyMealBreakdown[m.id].totals.fat,
      })),
    [dailyMealBreakdown]
  );

  // WEEKLY ANALYTICS
  const weekDates = useMemo(
    () => getMondayToSundayWeek(today, weekOffset),
    [today, weekOffset]
  );

  const weeklyRows = useMemo(() => {
    return weekDates.map((d) => {
      const entries = getEntriesForDate(foodEntries, d);
      const totals = sumMacros(entries);
      return {
        date: d,
        label: formatWeekdayShort(d),
        shortDate: formatShortDate(d),
        ...totals,
        hasEntries: entries.length > 0,
        achieved: isCalorieGoalAchieved(totals.calories, goals.calories),
      };
    });
  }, [foodEntries, goals.calories, weekDates]);

  const weeklySummary = useMemo(() => {
    const logged = weeklyRows.filter((r) => r.hasEntries);
    const count = logged.length;
    const avgCalories =
      count > 0 ? roundCal(logged.reduce((s, r) => s + r.calories, 0) / count) : 0;
    const avgProtein =
      count > 0 ? round1(logged.reduce((s, r) => s + r.protein, 0) / count) : 0;
    const avgCarbs =
      count > 0 ? round1(logged.reduce((s, r) => s + r.carbs, 0) / count) : 0;
    const avgFat =
      count > 0 ? round1(logged.reduce((s, r) => s + r.fat, 0) / count) : 0;
    const avgFibre =
      count > 0 ? round1(logged.reduce((s, r) => s + r.fibre, 0) / count) : 0;
    const achievedDays = logged.filter((r) => r.achieved).length;
    return { count, avgCalories, avgProtein, avgCarbs, avgFat, avgFibre, achievedDays };
  }, [weeklyRows]);

  const weekLabel = `${formatShortDate(weekDates[0])} – ${formatShortDate(weekDates[6])}`;

  // 4-Week Weight + Nutrition Trend
  const multiWeekSeries = useMemo(
    () => getMultiWeekProgressSeries(foodEntries, weightEntries, today, 4),
    [foodEntries, today, weightEntries]
  );

  const intakeVsWeightChartData = useMemo(
    () =>
      multiWeekSeries.map((wk) => ({
        label: `Wk ${wk.label}`,
        avgCalories: wk.loggedFoodDays > 0 ? wk.avgCalories : null,
        avgWeight:
          wk.avgWeightKg !== null ? convertWeightToDisplay(wk.avgWeightKg, unit) : null,
      })),
    [multiWeekSeries, unit]
  );

  // 28-Day Consistency Heatmap & Longest Streak
  const heatmapData = useMemo(() => {
    const days = Array.from({ length: 28 }, (_, i) => {
      const date = addDaysToDateKey(today, -(27 - i));
      const entries = getEntriesForDate(foodEntries, date);
      const totals = sumMacros(entries);
      const hasEntries = entries.length > 0;
      const onTarget =
        hasEntries &&
        (goals.calories > 0
          ? totals.calories >= goals.calories * 0.85 && totals.calories <= goals.calories * 1.15
          : totals.calories > 0);
      const status: 'on_target' | 'logged' | 'unlogged' = !hasEntries
        ? 'unlogged'
        : onTarget
        ? 'on_target'
        : 'logged';
      return {
        date,
        shortDate: formatShortDate(date),
        weekday: formatWeekdayShort(date),
        dayNum: date.slice(-2),
        calories: totals.calories,
        protein: totals.protein,
        hasEntries,
        status,
      };
    });

    let currentRun = 0;
    let longestStreak = 0;
    let loggedCount = 0;
    let onTargetCount = 0;
    for (const d of days) {
      if (d.hasEntries) {
        loggedCount += 1;
        currentRun += 1;
        if (currentRun > longestStreak) longestStreak = currentRun;
      } else {
        currentRun = 0;
      }
      if (d.status === 'on_target') onTargetCount += 1;
    }

    return { days, longestStreak, loggedCount, onTargetCount };
  }, [foodEntries, goals.calories, today]);

  // 4-Week Meal Timing
  const mealTiming28Days = useMemo(() => {
    const start28 = addDaysToDateKey(today, -27);
    const windowEntries = foodEntries.filter((e) => e.date >= start28 && e.date <= today);
    const loggedDates = new Set(windowEntries.map((e) => e.date));
    const dayCount = Math.max(1, loggedDates.size);

    return {
      hasData: loggedDates.size > 0,
      loggedDays: loggedDates.size,
      rows: MEAL_CATEGORIES.map((cat) => {
        const items = windowEntries.filter((e) => e.mealType === cat.id);
        const totals = sumMacros(items);
        return {
          meal: cat.shortLabel,
          avgCalories: roundCal(totals.calories / dayCount),
          avgProtein: round1(totals.protein / dayCount),
        };
      }),
    };
  }, [foodEntries, today]);

  // Top Calorie & Protein Contributors (Last 30 Days)
  const topFoodContributors = useMemo(() => {
    const start30 = addDaysToDateKey(today, -29);
    const map = new Map<
      string,
      { name: string; logs: number; calories: number; protein: number }
    >();
    for (const e of foodEntries) {
      if (e.date < start30 || e.date > today) continue;
      const key = e.foodName.trim().toLowerCase();
      if (!key) continue;
      const existing = map.get(key) || {
        name: e.foodName.trim(),
        logs: 0,
        calories: 0,
        protein: 0,
      };
      existing.logs += 1;
      existing.calories += e.calories;
      existing.protein += e.protein;
      map.set(key, existing);
    }
    const all = Array.from(map.values()).map((item) => ({
      ...item,
      calories: roundCal(item.calories),
      protein: round1(item.protein),
    }));
    const byCalories = [...all].sort((a, b) => b.calories - a.calories).slice(0, 4);
    const byProtein = [...all].sort((a, b) => b.protein - a.protein).slice(0, 4);
    return { byCalories, byProtein, hasData: all.length > 0 };
  }, [foodEntries, today]);

  const adaptiveSuggestion = useMemo(
    () =>
      evaluateAdaptiveCalorieAdjustment({
        foodEntries,
        weightEntries,
        goals,
        profile,
        todayKey: today,
      }),
    [foodEntries, goals, profile, today, weightEntries]
  );

  const weeklyBank = useMemo(
    () =>
      getWeeklyCalorieBankSummary({
        foodEntries,
        goals,
        referenceDateKey: today,
      }),
    [foodEntries, goals, today]
  );

  const handleApplyAdaptiveTarget = () => {
    if (!adaptiveSuggestion.suggestedTargetCalories) return;
    const newCal = adaptiveSuggestion.suggestedTargetCalories;
    const proteinCals = goals.protein * 4;
    const fatCals = goals.fat * 9;
    const newCarbs = Math.max(40, Math.round((newCal - proteinCals - fatCals) / 4));
    const syncedCalories = goals.protein * 4 + newCarbs * 4 + goals.fat * 9;
    updateGoals({
      preset: goals.preset,
      calories: syncedCalories,
      protein: goals.protein,
      carbs: newCarbs,
      fat: goals.fat,
      fibre: goals.fibre,
      targetWeightKg: goals.targetWeightKg,
      estimatedBmr: goals.estimatedBmr,
      estimatedTdee: adaptiveSuggestion.observedTdee ?? goals.estimatedTdee,
    });
    notify(`Updated daily calorie target to ${syncedCalories.toLocaleString()} kcal.`);
  };

  // Clear per-graph health status & plain-English explanation
  const graphInsights = useMemo(() => {
    const loggedDays = weeklySummary.count;

    // 1. Calories
    let calStatus: GraphStatus = 'neutral';
    let calBadge = 'No Data Yet';
    let calHint = 'Log meals this week to compare intake with your calorie goal.';
    if (loggedDays > 0 && goals.calories > 0) {
      const ratio = weeklySummary.avgCalories / goals.calories;
      if (ratio >= 0.88 && ratio <= 1.12) {
        calStatus = 'good';
        calBadge = 'Good';
        calHint = `Averaging ${weeklySummary.avgCalories.toLocaleString()} kcal/day (${Math.round(ratio * 100)}% of ${goals.calories.toLocaleString()} kcal goal).`;
      } else if (ratio > 1.12) {
        calStatus = 'modify';
        calBadge = 'High — Modify';
        calHint = `Averaging ${Math.round(weeklySummary.avgCalories - goals.calories)} kcal/day over goal. Lower intake or raise calorie target.`;
      } else {
        calStatus = 'modify';
        calBadge = 'Low — Modify';
        calHint = `Averaging ${Math.round(goals.calories - weeklySummary.avgCalories)} kcal/day below goal. Eat more or adjust your target.`;
      }
    }

    // 2. Protein
    let proStatus: GraphStatus = 'neutral';
    let proBadge = 'No Data Yet';
    let proHint = 'Log meals to track daily protein consistency.';
    if (loggedDays > 0 && goals.protein > 0) {
      const ratio = weeklySummary.avgProtein / goals.protein;
      if (ratio >= 0.85) {
        proStatus = 'good';
        proBadge = 'Good';
        proHint = `Averaging ${weeklySummary.avgProtein}g/day (${Math.round(ratio * 100)}% of ${goals.protein}g goal) — strong muscle & satiety support.`;
      } else {
        proStatus = 'modify';
        proBadge = 'Low — Modify';
        proHint = `${round1(goals.protein - weeklySummary.avgProtein)}g short of your ${goals.protein}g goal. Add lean protein or adjust target.`;
      }
    }

    // 3. Weight vs Intake
    const weighInWeeks = multiWeekSeries.filter((w) => w.avgWeightKg !== null);
    let wtStatus: GraphStatus = 'neutral';
    let wtBadge = 'Need 2 Weeks';
    let wtHint = 'Log weigh-ins across 2+ weeks to confirm how your calories affect weight.';
    if (weighInWeeks.length >= 2) {
      const firstWt = weighInWeeks[0].avgWeightKg!;
      const lastWt = weighInWeeks[weighInWeeks.length - 1].avgWeightKg!;
      const deltaKg = round2(lastWt - firstWt);
      const goalType = profile.fitnessGoal || 'maintenance';
      const aligned =
        (goalType === 'fat_loss' && deltaKg <= -0.1) ||
        (goalType === 'muscle_gain' && deltaKg >= 0.1) ||
        ((goalType === 'maintenance' || goalType === 'recomposition') && Math.abs(deltaKg) <= 0.6);

      if (aligned) {
        wtStatus = 'good';
        wtBadge = 'Good Trend';
        wtHint = `Weight shifted ${deltaKg > 0 ? '+' : ''}${convertWeightToDisplay(deltaKg, unit)} ${unit} over recent weeks — aligned with your plan.`;
      } else {
        wtStatus = 'modify';
        wtBadge = 'Adjust Goal';
        wtHint = `Weight moved ${deltaKg > 0 ? '+' : ''}${convertWeightToDisplay(deltaKg, unit)} ${unit}. Consider adjusting calories slightly.`;
      }
    }

    // 4. Carbs & Fats
    let cfStatus: GraphStatus = 'neutral';
    let cfBadge = 'No Data Yet';
    let cfHint = 'Daily balance of energy carbs and healthy fats.';
    if (loggedDays > 0 && goals.carbs > 0 && goals.fat > 0) {
      const carbRatio = weeklySummary.avgCarbs / goals.carbs;
      const fatRatio = weeklySummary.avgFat / goals.fat;
      if (carbRatio >= 0.75 && carbRatio <= 1.25 && fatRatio >= 0.75 && fatRatio <= 1.25) {
        cfStatus = 'good';
        cfBadge = 'Balanced';
        cfHint = `Carbs (${weeklySummary.avgCarbs}g) and fats (${weeklySummary.avgFat}g) are well balanced around your targets.`;
      } else {
        cfStatus = 'modify';
        cfBadge = 'Rebalance';
        cfHint = `Avg ${weeklySummary.avgCarbs}g carbs / ${weeklySummary.avgFat}g fat vs ${goals.carbs}g / ${goals.fat}g targets.`;
      }
    }

    // 5. Fibre
    let fibStatus: GraphStatus = 'neutral';
    let fibBadge = 'No Data Yet';
    let fibHint = 'Daily digestive fibre intake against your target.';
    if (loggedDays > 0 && goals.fibre > 0) {
      const ratio = weeklySummary.avgFibre / goals.fibre;
      if (ratio >= 0.8) {
        fibStatus = 'good';
        fibBadge = 'Good';
        fibHint = `Averaging ${weeklySummary.avgFibre}g/day — solid gut health and digestion support.`;
      } else {
        fibStatus = 'modify';
        fibBadge = 'Low — Add Fibre';
        fibHint = `Averaging ${weeklySummary.avgFibre}g vs ${goals.fibre}g goal. Add vegetables, dal, oats, or fruit.`;
      }
    }

    // 6. Meal Timing
    const mealTimingStatus: GraphStatus = mealTiming28Days.hasData ? 'good' : 'neutral';
    const mealTimingBadge = mealTiming28Days.hasData ? 'Tracked' : 'No Data Yet';
    const mealTimingHint = mealTiming28Days.hasData
      ? `Shows which meals deliver most of your calories & protein across ${mealTiming28Days.loggedDays} days.`
      : 'Log meals for a few days to see your meal timing split.';

    // 7. 28-Day Streak
    const heatmapStatus: GraphStatus =
      heatmapData.loggedCount >= 14 ? 'good' : heatmapData.loggedCount > 0 ? 'modify' : 'neutral';
    const heatmapBadge =
      heatmapData.loggedCount >= 14 ? 'Consistent' : heatmapData.loggedCount > 0 ? 'Build Streak' : 'Start Today';
    const heatmapHint = `${heatmapData.onTargetCount} on-target days out of ${heatmapData.loggedCount} logged days in the past 4 weeks.`;

    const visibleSummaryStatuses = [
      visibleGraphs.calories ? calStatus : null,
      visibleGraphs.protein ? proStatus : null,
      visibleGraphs.weightVsIntake ? wtStatus : null,
      visibleGraphs.carbsFat ? cfStatus : null,
      visibleGraphs.fibre ? fibStatus : null,
      visibleGraphs.mealTiming ? mealTimingStatus : null,
      visibleGraphs.heatmap ? heatmapStatus : null,
    ].filter(Boolean) as GraphStatus[];

    const goodCount = visibleSummaryStatuses.filter((s) => s === 'good').length;
    const modifyCount = visibleSummaryStatuses.filter((s) => s === 'modify').length;

    // Single crisp 1-line summary for top of Progress page
    let oneLineText = 'Log meals this week to unlock live graph status and personalized insights.';
    let oneLineHealthy = true;
    if (loggedDays > 0) {
      if (modifyCount === 0 && goodCount > 0) {
        oneLineText = `On track this week — ${weeklySummary.avgCalories.toLocaleString()} kcal/day avg (${weeklySummary.avgProtein}g protein), ${weeklySummary.achievedDays}/7 days on goal.`;
        oneLineHealthy = true;
      } else {
        const issues: string[] = [];
        if (calStatus === 'modify') issues.push('calories');
        if (proStatus === 'modify') issues.push('protein');
        if (wtStatus === 'modify') issues.push('weight pace');
        if (cfStatus === 'modify') issues.push('carbs/fats');
        const issueLabel = issues.length > 0 ? issues.join(' & ') : 'consistency';
        oneLineText = `This week: ${weeklySummary.avgCalories.toLocaleString()} kcal/day & ${weeklySummary.avgProtein}g protein avg — check ${issueLabel} graphs below to fine-tune.`;
        oneLineHealthy = false;
      }
    }

    return {
      calStatus,
      calBadge,
      calHint,
      proStatus,
      proBadge,
      proHint,
      wtStatus,
      wtBadge,
      wtHint,
      cfStatus,
      cfBadge,
      cfHint,
      fibStatus,
      fibBadge,
      fibHint,
      mealTimingStatus,
      mealTimingBadge,
      mealTimingHint,
      heatmapStatus,
      heatmapBadge,
      heatmapHint,
      goodCount,
      modifyCount,
      oneLineText,
      oneLineHealthy,
    };
  }, [
    goals.calories,
    goals.carbs,
    goals.fat,
    goals.fibre,
    goals.protein,
    heatmapData.loggedCount,
    heatmapData.onTargetCount,
    mealTiming28Days.hasData,
    mealTiming28Days.loggedDays,
    multiWeekSeries,
    profile.fitnessGoal,
    unit,
    visibleGraphs,
    weeklySummary.achievedDays,
    weeklySummary.avgCalories,
    weeklySummary.avgCarbs,
    weeklySummary.avgFat,
    weeklySummary.avgFibre,
    weeklySummary.avgProtein,
    weeklySummary.count,
  ]);

  // MONTHLY ANALYTICS
  const monthInfo = useMemo(() => getCalendarMonthDates(monthOffset), [monthOffset]);

  const monthlyRows = useMemo(() => {
    return monthInfo.dates.map((d) => {
      const entries = getEntriesForDate(foodEntries, d);
      const totals = sumMacros(entries);
      const score = getDailyGoalCompletionScore(totals, goals);
      return {
        date: d,
        dayLabel: d.slice(-2),
        shortDate: formatShortDate(d),
        ...totals,
        hasEntries: entries.length > 0,
        score,
        achieved: isCalorieGoalAchieved(totals.calories, goals.calories),
      };
    });
  }, [foodEntries, goals, monthInfo.dates]);

  const monthlySummary = useMemo(() => {
    const elapsedDays = monthInfo.dates.filter((d) => d <= today).length;
    const logged = monthlyRows.filter((r) => r.hasEntries);
    const count = logged.length;
    const avgCalories =
      count > 0 ? roundCal(logged.reduce((s, r) => s + r.calories, 0) / count) : 0;
    const avgProtein =
      count > 0 ? round1(logged.reduce((s, r) => s + r.protein, 0) / count) : 0;
    const avgCarbs =
      count > 0 ? round1(logged.reduce((s, r) => s + r.carbs, 0) / count) : 0;
    const avgFat =
      count > 0 ? round1(logged.reduce((s, r) => s + r.fat, 0) / count) : 0;
    const avgFibre =
      count > 0 ? round1(logged.reduce((s, r) => s + r.fibre, 0) / count) : 0;
    const goalCompletionPct =
      count > 0 ? Math.round(logged.reduce((s, r) => s + r.score, 0) / count) : 0;
    const bestDay =
      logged.length > 0 ? [...logged].sort((a, b) => b.score - a.score)[0] : null;
    const consistencyScore =
      elapsedDays > 0 ? Math.min(100, Math.round((count / elapsedDays) * 100)) : 0;

    return {
      count,
      elapsedDays,
      avgCalories,
      avgProtein,
      avgCarbs,
      avgFat,
      avgFibre,
      goalCompletionPct,
      bestDay,
      consistencyScore,
    };
  }, [monthInfo.dates, monthlyRows, today]);

  return (
    <div className="space-y-5">
      {/* Header + Segmented Tabs */}
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Visual progress graphs &amp; live target health checks
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Progress Dashboard
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          <div className="inline-flex items-center p-1 rounded-xl bg-black/5 dark:bg-[#14161C] border border-black/8 dark:border-white/10">
            {(['daily', 'weekly', 'monthly'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`min-h-[38px] px-4 rounded-lg text-xs font-semibold capitalize transition-colors whitespace-nowrap ${
                  tab === t
                    ? 'bg-white dark:bg-[#090A0C] text-[#111317] dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-[#111317] dark:hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* DAILY VIEW */}
      {tab === 'daily' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl px-4 py-3">
            <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 font-medium">
              {formatReadableDate(selectedDate)} ·{' '}
              <span className="font-semibold text-lime-700 dark:text-lime-400">
                {dailyScore}% goal match
              </span>{' '}
              ({dailyTotals.calories.toLocaleString()} / {goals.calories.toLocaleString()} kcal)
            </div>
            <StatusPill
              status={dailyScore >= 80 ? 'good' : dailyTotals.calories > 0 ? 'modify' : 'neutral'}
              label={dailyScore >= 80 ? 'Good Day' : dailyTotals.calories > 0 ? 'In Progress' : 'No Meals Yet'}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              {
                label: 'Calories',
                val: `${dailyTotals.calories} kcal`,
                sub: `Target ${goals.calories}`,
                pct:
                  goals.calories > 0
                    ? Math.min(100, Math.round((dailyTotals.calories / goals.calories) * 100))
                    : 0,
              },
              {
                label: 'Protein',
                val: `${dailyTotals.protein} g`,
                sub: `Target ${goals.protein} g`,
                pct:
                  goals.protein > 0
                    ? Math.min(100, Math.round((dailyTotals.protein / goals.protein) * 100))
                    : 0,
              },
              {
                label: 'Carbs',
                val: `${dailyTotals.carbs} g`,
                sub: `Target ${goals.carbs} g`,
                pct:
                  goals.carbs > 0
                    ? Math.min(100, Math.round((dailyTotals.carbs / goals.carbs) * 100))
                    : 0,
              },
              {
                label: 'Fat',
                val: `${dailyTotals.fat} g`,
                sub: `Target ${goals.fat} g`,
                pct:
                  goals.fat > 0
                    ? Math.min(100, Math.round((dailyTotals.fat / goals.fat) * 100))
                    : 0,
              },
              {
                label: 'Fibre',
                val: `${dailyTotals.fibre} g`,
                sub: `Target ${goals.fibre} g`,
                pct:
                  goals.fibre > 0
                    ? Math.min(100, Math.round((dailyTotals.fibre / goals.fibre) * 100))
                    : 0,
              },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4"
              >
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>{kpi.label}</span>
                  <span className="tabular-nums">{kpi.pct}%</span>
                </div>
                <div className="mt-1 text-lg font-bold font-mono-nums text-slate-900 dark:text-slate-50">
                  {kpi.val}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400 tabular-nums">{kpi.sub}</div>
                <div className="mt-2 h-1.5 rounded-full bg-stone-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-lime-500 rounded-full transition-all"
                    style={{ width: `${kpi.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Meal-wise Calorie Breakdown
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  How today&apos;s energy is distributed across breakfast, lunch, snacks, and dinner
                </p>
              </div>
            </div>
            {dailyTotals.calories === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
                No food entries logged on {formatReadableDate(selectedDate)}.
              </p>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyMealChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis dataKey="meal" tick={{ fontSize: 12, fill: tickColor }} stroke={gridStroke} />
                    <YAxis tick={{ fontSize: 12, fill: tickColor }} stroke={gridStroke} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="calories" name="Calories (kcal)" fill="#C8FF00" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {/* WEEKLY VIEW (Default Dashboard) */}
      {tab === 'weekly' && (
        <div className="space-y-5">
          {/* Week Switcher + Crisp One-Line Top Summary */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {weekLabel}
            </h2>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setWeekOffset((w) => w - 1)}
                aria-label="Previous week"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#111317] text-slate-600 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-800"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {weekOffset !== 0 && (
                <button
                  type="button"
                  onClick={() => setWeekOffset(0)}
                  className="min-h-[38px] px-3 rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#111317] text-xs font-medium text-slate-700 dark:text-slate-200"
                >
                  This Week
                </button>
              )}
              <button
                type="button"
                onClick={() => setWeekOffset((w) => Math.min(0, w + 1))}
                disabled={weekOffset === 0}
                aria-label="Next week"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#111317] text-slate-600 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-800 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Concise One-Line Weekly Summary Bar */}
          <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl px-4 py-3 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  weeklySummary.count === 0
                    ? 'bg-slate-400'
                    : graphInsights.oneLineHealthy
                    ? 'bg-lime-500'
                    : 'bg-amber-500'
                }`}
              />
              <p className="text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                {graphInsights.oneLineText}
              </p>
            </div>

            {adaptiveSuggestion.suggestedTargetCalories && (
              <button
                type="button"
                onClick={handleApplyAdaptiveTarget}
                className="min-h-[32px] px-3 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-[11px] font-semibold whitespace-nowrap shrink-0 inline-flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" />
                Modify Goal to {adaptiveSuggestion.suggestedTargetCalories.toLocaleString()} kcal
              </button>
            )}
          </div>

          {/* 4 Compact Dashboard KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Avg Daily Calories</div>
              <div className="mt-1 text-xl font-bold font-mono-nums text-slate-900 dark:text-slate-50">
                {weeklySummary.avgCalories.toLocaleString()} kcal
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                Target {goals.calories.toLocaleString()} · {weeklySummary.count}/7 days logged
              </div>
            </div>
            <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Avg Daily Protein</div>
              <div className="mt-1 text-xl font-bold font-mono-nums text-lime-700 dark:text-lime-400">
                {weeklySummary.avgProtein} g
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">Target {goals.protein} g</div>
            </div>
            <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Days Goal Hit</div>
              <div className="mt-1 text-xl font-bold font-mono-nums text-slate-900 dark:text-slate-50">
                {weeklySummary.achievedDays} / 7
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">Within ±10% of target</div>
            </div>
            <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-amber-500" />
                28-Day Streak
              </div>
              <div className="mt-1 text-xl font-bold font-mono-nums text-slate-900 dark:text-slate-50">
                {heatmapData.longestStreak} days
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                {heatmapData.loggedCount}/28 days active
              </div>
            </div>
          </div>

          {/* Weekly Calorie Bank & Adaptive TDEE Intelligence */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Weekly Calorie Bank &amp; Flex Adherence
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Rolling Mon–Sun energy budget + protein-first consistency
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-lime-500/15 text-[#4E6800] dark:text-[#C8FF00] text-xs font-bold font-mono-nums shrink-0">
                  {weeklyBank.proteinTargetDaysHit}/7d Protein ≥85%
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2.5 text-xs">
                <div className="p-2.5 rounded-xl bg-stone-50/70 dark:bg-[#090A0C]/70 border border-black/8 dark:border-white/10">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Weekly Bank Left</div>
                  <div className="text-sm font-bold font-mono-nums text-slate-900 dark:text-slate-100 mt-0.5">
                    {weeklyBank.remainingWeeklyBudget.toLocaleString()} kcal
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-stone-50/70 dark:bg-[#090A0C]/70 border border-black/8 dark:border-white/10">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    Next {weeklyBank.daysRemaining}d Target
                  </div>
                  <div className="text-sm font-bold font-mono-nums text-lime-700 dark:text-lime-400 mt-0.5">
                    {weeklyBank.recommendedPerRemainingDay > 0
                      ? `${weeklyBank.recommendedPerRemainingDay.toLocaleString()} kcal/d`
                      : '—'}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-stone-50/70 dark:bg-[#090A0C]/70 border border-black/8 dark:border-white/10">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">Daily Flex Band</div>
                  <div className="text-sm font-bold font-mono-nums text-slate-900 dark:text-slate-100 mt-0.5">
                    {weeklyBank.dailyTarget > 0
                      ? `${weeklyBank.flexRangeLow.toLocaleString()}–${weeklyBank.flexRangeHigh.toLocaleString()}`
                      : '—'}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 flex flex-col justify-between gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Adaptive TDEE &amp; Calorie Coach
                  </h3>
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-200 mt-0.5">
                    {adaptiveSuggestion.headline}
                  </p>
                </div>
                {adaptiveSuggestion.observedTdee && (
                  <span className="px-2.5 py-1 rounded-lg bg-stone-100 dark:bg-slate-800 text-xs font-bold font-mono-nums text-slate-900 dark:text-slate-100 shrink-0">
                    Est. TDEE: {adaptiveSuggestion.observedTdee.toLocaleString()} kcal
                  </span>
                )}
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {adaptiveSuggestion.rationale}
              </p>

              {adaptiveSuggestion.suggestedTargetCalories && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleApplyAdaptiveTarget}
                    className="min-h-[34px] px-3.5 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Apply Suggested Target ({adaptiveSuggestion.suggestedTargetCalories.toLocaleString()} kcal)
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Graph Dashboard Controls: Shows Good vs Modify counts + Customize Graphs */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                Your Progress Graphs
              </h3>
              {weeklySummary.count > 0 && (
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="px-2 py-0.5 rounded-lg bg-lime-100 dark:bg-lime-950/60 text-lime-800 dark:text-lime-300 font-semibold">
                    {graphInsights.goodCount} Good
                  </span>
                  {graphInsights.modifyCount > 0 && (
                    <span className="px-2 py-0.5 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-semibold">
                      {graphInsights.modifyCount} Can Modify
                    </span>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowCustomize((s) => !s)}
              className={`min-h-[36px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                showCustomize
                  ? 'border-lime-500 bg-lime-50 dark:bg-lime-950/40 text-lime-800 dark:text-lime-300'
                  : 'border-black/10 dark:border-white/12 bg-white dark:bg-[#111317] text-slate-700 dark:text-slate-200 hover:border-lime-500'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Customize Graphs</span>
            </button>
          </div>

          {showCustomize && (
            <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4 space-y-2.5">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Choose which graphs appear on your dashboard:
              </div>
              <div className="flex flex-wrap gap-2">
                {GRAPH_META.map((g) => {
                  const active = visibleGraphs[g.id];
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() =>
                        setVisibleGraphs((prev) => ({ ...prev, [g.id]: !prev[g.id] }))
                      }
                      className={`min-h-[34px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                        active
                          ? 'bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 border-slate-900 dark:border-lime-500'
                          : 'bg-stone-50 dark:bg-[#090A0C] border-black/10 dark:border-white/15 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {active && <Check className="w-3.5 h-3.5" />}
                      <span>{g.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* MAIN PROGRESS GRAPHS GRID */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Graph 1: 7-Day Calorie Intake */}
            {visibleGraphs.calories && (
              <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      7-Day Calorie Intake vs Goal
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {graphInsights.calHint}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <StatusPill status={graphInsights.calStatus} label={graphInsights.calBadge} />
                    <button
                      type="button"
                      onClick={() => openInlineTargetEdit('calories')}
                      className="px-2 py-1 rounded-lg border border-black/10 dark:border-white/15 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:border-lime-500 inline-flex items-center gap-1"
                    >
                      <Pencil className="w-3 h-3" />
                      Target
                    </button>
                  </div>
                </div>

                {editingTargetField === 'calories' && (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-stone-50 dark:bg-[#090A0C] border border-black/10 dark:border-white/12">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      New Goal (kcal):
                    </span>
                    <input
                      type="number"
                      value={targetDraft}
                      onChange={(e) => setTargetDraft(e.target.value)}
                      className="w-24 h-8 px-2.5 rounded-lg border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] text-xs font-mono-nums"
                    />
                    <button
                      type="button"
                      onClick={() => saveInlineTargetEdit('calories')}
                      className="h-8 px-3 rounded-lg bg-lime-500 text-slate-950 text-xs font-semibold"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingTargetField(null)}
                      className="h-8 px-2 text-xs text-slate-500"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyRows}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 12, fill: tickColor }} stroke={gridStroke} />
                      <YAxis tick={{ fontSize: 12, fill: tickColor }} stroke={gridStroke} />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(val) => [`${val} kcal`, 'Calories']}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.shortDate || ''}
                      />
                      {goals.calories > 0 && (
                        <ReferenceLine
                          y={goals.calories}
                          stroke="#C8FF00"
                          strokeDasharray="4 4"
                          label={{ value: 'Goal', position: 'right', fontSize: 11, fill: '#C8FF00' }}
                        />
                      )}
                      <Bar dataKey="calories" fill="#C8FF00" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Graph 2: Daily Protein Intake */}
            {visibleGraphs.protein && (
              <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Daily Protein Intake (g)
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {graphInsights.proHint}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <StatusPill status={graphInsights.proStatus} label={graphInsights.proBadge} />
                    <button
                      type="button"
                      onClick={() => openInlineTargetEdit('protein')}
                      className="px-2 py-1 rounded-lg border border-black/10 dark:border-white/15 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:border-lime-500 inline-flex items-center gap-1"
                    >
                      <Pencil className="w-3 h-3" />
                      Target
                    </button>
                  </div>
                </div>

                {editingTargetField === 'protein' && (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-stone-50 dark:bg-[#090A0C] border border-black/10 dark:border-white/12">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      New Protein (g):
                    </span>
                    <input
                      type="number"
                      value={targetDraft}
                      onChange={(e) => setTargetDraft(e.target.value)}
                      className="w-24 h-8 px-2.5 rounded-lg border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] text-xs font-mono-nums"
                    />
                    <button
                      type="button"
                      onClick={() => saveInlineTargetEdit('protein')}
                      className="h-8 px-3 rounded-lg bg-lime-500 text-slate-950 text-xs font-semibold"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingTargetField(null)}
                      className="h-8 px-2 text-xs text-slate-500"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weeklyRows}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 12, fill: tickColor }} stroke={gridStroke} />
                      <YAxis tick={{ fontSize: 12, fill: tickColor }} stroke={gridStroke} />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(val) => [`${val} g`, 'Protein']}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.shortDate || ''}
                      />
                      {goals.protein > 0 && (
                        <ReferenceLine y={goals.protein} stroke="#22c55e" strokeDasharray="4 4" />
                      )}
                      <Bar dataKey="protein" fill="#22c55e" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Graph 3: 4-Week Weight vs Energy Intake */}
            {visibleGraphs.weightVsIntake && (
              <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-lime-600 dark:text-lime-400" />
                      4-Week Weight vs Calorie Trend
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {graphInsights.wtHint}
                    </p>
                  </div>
                  <StatusPill status={graphInsights.wtStatus} label={graphInsights.wtBadge} />
                </div>

                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={intakeVsWeightChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 12, fill: tickColor }} stroke={gridStroke} />
                      <YAxis
                        yAxisId="cal"
                        tick={{ fontSize: 11, fill: tickColor }}
                        stroke={gridStroke}
                        width={46}
                      />
                      <YAxis
                        yAxisId="wt"
                        orientation="right"
                        domain={['auto', 'auto']}
                        tick={{ fontSize: 11, fill: tickColor }}
                        stroke={gridStroke}
                        width={44}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                      <Line
                        yAxisId="cal"
                        type="monotone"
                        dataKey="avgCalories"
                        name="Avg Intake (kcal)"
                        stroke="#C8FF00"
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                        connectNulls
                      />
                      <Line
                        yAxisId="wt"
                        type="monotone"
                        dataKey="avgWeight"
                        name={`Avg Weight (${unit})`}
                        stroke="#38bdf8"
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Graph 4: Carbs & Fats */}
            {visibleGraphs.carbsFat && (
              <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Carbohydrate &amp; Fat Trends (g)
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {graphInsights.cfHint}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <StatusPill status={graphInsights.cfStatus} label={graphInsights.cfBadge} />
                    <button
                      type="button"
                      onClick={() => openInlineTargetEdit('carbs')}
                      className="px-2 py-1 rounded-lg border border-black/10 dark:border-white/15 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:border-lime-500 inline-flex items-center gap-1"
                    >
                      <Pencil className="w-3 h-3" />
                      Carbs
                    </button>
                  </div>
                </div>

                {editingTargetField === 'carbs' && (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-stone-50 dark:bg-[#090A0C] border border-black/10 dark:border-white/12">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      New Carbs (g):
                    </span>
                    <input
                      type="number"
                      value={targetDraft}
                      onChange={(e) => setTargetDraft(e.target.value)}
                      className="w-24 h-8 px-2.5 rounded-lg border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] text-xs font-mono-nums"
                    />
                    <button
                      type="button"
                      onClick={() => saveInlineTargetEdit('carbs')}
                      className="h-8 px-3 rounded-lg bg-lime-500 text-slate-950 text-xs font-semibold"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingTargetField(null)}
                      className="h-8 px-2 text-xs text-slate-500"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weeklyRows}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 12, fill: tickColor }} stroke={gridStroke} />
                      <YAxis tick={{ fontSize: 12, fill: tickColor }} stroke={gridStroke} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="carbs"
                        name="Carbs (g)"
                        stroke="#f59e0b"
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="fat"
                        name="Fat (g)"
                        stroke="#6366f1"
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Graph 5: Fibre Intake (Toggleable) */}
            {visibleGraphs.fibre && (
              <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Fibre Intake (g)
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {graphInsights.fibHint}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <StatusPill status={graphInsights.fibStatus} label={graphInsights.fibBadge} />
                    <button
                      type="button"
                      onClick={() => openInlineTargetEdit('fibre')}
                      className="px-2 py-1 rounded-lg border border-black/10 dark:border-white/15 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:border-lime-500 inline-flex items-center gap-1"
                    >
                      <Pencil className="w-3 h-3" />
                      Target
                    </button>
                  </div>
                </div>

                {editingTargetField === 'fibre' && (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-stone-50 dark:bg-[#090A0C] border border-black/10 dark:border-white/12">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                      New Fibre (g):
                    </span>
                    <input
                      type="number"
                      value={targetDraft}
                      onChange={(e) => setTargetDraft(e.target.value)}
                      className="w-24 h-8 px-2.5 rounded-lg border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] text-xs font-mono-nums"
                    />
                    <button
                      type="button"
                      onClick={() => saveInlineTargetEdit('fibre')}
                      className="h-8 px-3 rounded-lg bg-lime-500 text-slate-950 text-xs font-semibold"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingTargetField(null)}
                      className="h-8 px-2 text-xs text-slate-500"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={weeklyRows}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 12, fill: tickColor }} stroke={gridStroke} />
                      <YAxis tick={{ fontSize: 12, fill: tickColor }} stroke={gridStroke} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(val) => [`${val} g`, 'Fibre']} />
                      {goals.fibre > 0 && (
                        <ReferenceLine y={goals.fibre} stroke="#14b8a6" strokeDasharray="4 4" />
                      )}
                      <Area
                        type="monotone"
                        dataKey="fibre"
                        stroke="#14b8a6"
                        strokeWidth={2.5}
                        fill="#14b8a6"
                        fillOpacity={0.18}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Graph 6: Meal Timing & Protein Split (Toggleable) */}
            {visibleGraphs.mealTiming && (
              <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      4-Week Meal Timing &amp; Protein Split
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {graphInsights.mealTimingHint}
                    </p>
                  </div>
                  <StatusPill
                    status={graphInsights.mealTimingStatus}
                    label={graphInsights.mealTimingBadge}
                  />
                </div>
                {!mealTiming28Days.hasData ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-10 text-center">
                    Log meals across a few days to reveal your meal distribution pattern.
                  </p>
                ) : (
                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={mealTiming28Days.rows}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                        <XAxis dataKey="meal" tick={{ fontSize: 12, fill: tickColor }} stroke={gridStroke} />
                        <YAxis
                          yAxisId="kcal"
                          tick={{ fontSize: 11, fill: tickColor }}
                          stroke={gridStroke}
                          width={42}
                        />
                        <YAxis
                          yAxisId="pro"
                          orientation="right"
                          tick={{ fontSize: 11, fill: tickColor }}
                          stroke={gridStroke}
                          width={36}
                        />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Legend />
                        <Bar
                          yAxisId="kcal"
                          dataKey="avgCalories"
                          name="Avg Calories (kcal)"
                          fill="#C8FF00"
                          radius={[6, 6, 0, 0]}
                        />
                        <Bar
                          yAxisId="pro"
                          dataKey="avgProtein"
                          name="Avg Protein (g)"
                          fill="#14b8a6"
                          radius={[6, 6, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            {/* Graph 7: 28-Day Consistency Heatmap (Toggleable) */}
            {visibleGraphs.heatmap && (
              <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      28-Day Consistency Calendar
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {graphInsights.heatmapHint}
                    </p>
                  </div>
                  <StatusPill
                    status={graphInsights.heatmapStatus}
                    label={graphInsights.heatmapBadge}
                  />
                </div>

                <div className="grid grid-cols-7 gap-2">
                  {heatmapData.days.map((d) => {
                    const bg =
                      d.status === 'on_target'
                        ? 'bg-lime-500 text-slate-950 border-lime-500'
                        : d.status === 'logged'
                        ? 'bg-amber-400/90 text-slate-950 border-amber-400'
                        : 'bg-stone-100 dark:bg-[#090A0C] text-slate-400 dark:text-slate-500 border-black/10 dark:border-white/12';
                    return (
                      <div
                        key={d.date}
                        title={`${d.shortDate} (${d.weekday}): ${
                          d.hasEntries
                            ? `${d.calories.toLocaleString()} kcal · ${d.protein}g protein`
                            : 'No entries logged'
                        }`}
                        className={`rounded-xl border p-2 text-center ${bg}`}
                      >
                        <div className="text-[10px] font-medium opacity-80">{d.weekday.slice(0, 2)}</div>
                        <div className="text-xs font-bold font-mono-nums">{d.dayNum}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Compact Top Food Contributors (only when logged) */}
          {topFoodContributors.hasData && (
            <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Award className="w-4 h-4 text-lime-600 dark:text-lime-400" />
                  Top Food Contributors (Last 30 Days)
                </h3>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Most logged calories &amp; protein staples
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl bg-stone-50/70 dark:bg-[#090A0C]/60 border border-black/10 dark:border-white/12 p-3.5 space-y-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Top Calorie Sources
                  </div>
                  {topFoodContributors.byCalories.map((food, idx) => (
                    <div key={food.name} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-slate-800 dark:text-slate-200 font-medium">
                        {idx + 1}. {food.name} ({food.logs}×)
                      </span>
                      <span className="font-mono-nums font-semibold text-slate-900 dark:text-slate-100 shrink-0">
                        {food.calories.toLocaleString()} kcal
                      </span>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl bg-stone-50/70 dark:bg-[#090A0C]/60 border border-black/10 dark:border-white/12 p-3.5 space-y-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-lime-700 dark:text-lime-400">
                    Top Protein Sources
                  </div>
                  {topFoodContributors.byProtein.map((food, idx) => (
                    <div key={food.name} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-slate-800 dark:text-slate-200 font-medium">
                        {idx + 1}. {food.name} ({food.logs}×)
                      </span>
                      <span className="font-mono-nums font-semibold text-lime-700 dark:text-lime-400 shrink-0">
                        {food.protein} g
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MONTHLY VIEW */}
      {tab === 'monthly' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {monthInfo.label}
            </h2>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setMonthOffset((m) => m - 1)}
                aria-label="Previous month"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#111317] text-slate-600 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-800"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {monthOffset !== 0 && (
                <button
                  type="button"
                  onClick={() => setMonthOffset(0)}
                  className="min-h-[38px] px-3 rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#111317] text-xs font-medium text-slate-700 dark:text-slate-200"
                >
                  This Month
                </button>
              )}
              <button
                type="button"
                onClick={() => setMonthOffset((m) => Math.min(0, m + 1))}
                disabled={monthOffset === 0}
                aria-label="Next month"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#111317] text-slate-600 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-800 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Goal Completion</div>
              <div className="mt-1 text-xl font-bold font-mono-nums text-lime-700 dark:text-lime-400">
                {monthlySummary.goalCompletionPct}%
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                Avg daily score ({monthlySummary.count} days)
              </div>
            </div>
            <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Consistency Score</div>
              <div className="mt-1 text-xl font-bold font-mono-nums text-slate-900 dark:text-slate-50">
                {monthlySummary.consistencyScore}%
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                {monthlySummary.count} of {monthlySummary.elapsedDays} days logged
              </div>
            </div>
            <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Avg Macro Intake</div>
              <div className="mt-1 text-sm font-bold font-mono-nums text-slate-900 dark:text-slate-50">
                P {monthlySummary.avgProtein}g · C {monthlySummary.avgCarbs}g
              </div>
              <div className="mt-1 text-xs font-mono-nums text-slate-500 dark:text-slate-400">
                F {monthlySummary.avgFat}g · Fibre {monthlySummary.avgFibre}g
              </div>
            </div>
            <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Best Nutrition Day</div>
              <div className="mt-1 text-base font-bold text-slate-900 dark:text-slate-50">
                {monthlySummary.bestDay ? monthlySummary.bestDay.shortDate : '—'}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400 tabular-nums">
                {monthlySummary.bestDay
                  ? `${monthlySummary.bestDay.calories} kcal (${monthlySummary.bestDay.score}% match)`
                  : 'No entries logged'}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5">
            <div className="flex items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Monthly Calorie Trend
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Avg {monthlySummary.avgCalories.toLocaleString()} kcal / day vs {goals.calories.toLocaleString()} kcal goal
                </p>
              </div>
              <StatusPill
                status={
                  monthlySummary.count === 0
                    ? 'neutral'
                    : monthlySummary.goalCompletionPct >= 75
                    ? 'good'
                    : 'modify'
                }
                label={
                  monthlySummary.count === 0
                    ? 'No Data'
                    : monthlySummary.goalCompletionPct >= 75
                    ? 'Good Month'
                    : 'Can Improve'
                }
              />
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyRows}>
                  <defs>
                    <linearGradient id="monthlyCalGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#C8FF00" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#C8FF00" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="dayLabel" tick={{ fontSize: 11, fill: tickColor }} stroke={gridStroke} />
                  <YAxis tick={{ fontSize: 12, fill: tickColor }} stroke={gridStroke} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(val) => [`${val} kcal`, 'Calories']}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.shortDate || ''}
                  />
                  {goals.calories > 0 && (
                    <ReferenceLine y={goals.calories} stroke="#C8FF00" strokeDasharray="4 4" />
                  )}
                  <Area
                    type="monotone"
                    dataKey="calories"
                    stroke="#65a30d"
                    strokeWidth={2.5}
                    fill="url(#monthlyCalGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
