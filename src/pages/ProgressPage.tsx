import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BarChart3,
  Calendar,
  Droplets,
  Flame,
  Plus,
  Scale,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { getWeeklyCalorieBankSummary } from '../utils/analyticsUtils';
import {
  addDaysToDateKey,
  formatShortDate,
  getLastNDates,
  getTodayDateKey,
} from '../utils/dateUtils';
import {
  convertWeightToDisplay,
  formatWeight,
  getEntriesForDate,
  round1,
  sortWeightEntriesChronological,
  sumMacros,
} from '../utils/nutritionUtils';

type TimeframeOption = 'daily' | 'weekly' | 'monthly' | 'yearly';
type ExplorerMetric = 'calories' | 'protein' | 'carbs' | 'fat' | 'weight' | 'water';

interface ChartPoint {
  key: string;
  label: string;
  loggedDays: number;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fibre: number | null;
  weight: number | null;
  water: number | null;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const name = MONTH_NAMES[(m || 1) - 1] || ym;
  return `${name} '${String(y || '').slice(-2)}`;
}

export const ProgressPage: React.FC = () => {
  const {
    state,
    resolvedTheme,
    waterIntakeMlByDate,
    dailyWaterGoalMl,
    openAddFoodModal,
    openWeightModal,
    setActiveTab,
  } = useMacroLogStore();

  const [timeframe, setTimeframe] = useState<TimeframeOption>('weekly');
  const [metric, setMetric] = useState<ExplorerMetric>('calories');

  const isDark = resolvedTheme === 'dark';
  const todayKey = getTodayDateKey();
  const { goals, settings, weightGoal } = state;

  // Group entries by date once
  const dailyTotalsByDate = useMemo(() => {
    const map = new Map<string, ReturnType<typeof sumMacros>>();
    const grouped = new Map<string, typeof state.foodEntries>();
    for (const entry of state.foodEntries) {
      const list = grouped.get(entry.date) || [];
      list.push(entry);
      grouped.set(entry.date, list);
    }
    grouped.forEach((entries, date) => {
      map.set(date, sumMacros(entries));
    });
    return map;
  }, [state.foodEntries]);

  const weightByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of sortWeightEntriesChronological(state.weightEntries)) {
      map.set(w.date, w.weightKg);
    }
    return map;
  }, [state.weightEntries]);

  // Build real-data series for the selected timeframe (NEVER zero-fill missing days)
  const chartData = useMemo<ChartPoint[]>(() => {
    if (timeframe === 'daily' || timeframe === 'weekly' || timeframe === 'monthly') {
      const daysCount = timeframe === 'daily' ? 7 : timeframe === 'weekly' ? 14 : 30;
      const dates = getLastNDates(daysCount, todayKey);
      return dates.map((d) => {
        const totals = dailyTotalsByDate.get(d);
        const wKg = weightByDate.get(d);
        const waterMl = waterIntakeMlByDate[d];
        return {
          key: d,
          label: formatShortDate(d),
          loggedDays: totals ? 1 : 0,
          calories: totals ? Math.round(totals.calories) : null,
          protein: totals ? round1(totals.protein) : null,
          carbs: totals ? round1(totals.carbs) : null,
          fat: totals ? round1(totals.fat) : null,
          fibre: totals ? round1(totals.fibre) : null,
          weight: wKg !== undefined ? convertWeightToDisplay(wKg, settings.weightUnit) : null,
          water: waterMl && waterMl > 0 ? Math.round(waterMl) : null,
        };
      });
    }

    // Yearly view: real monthly averages over the last 12 months
    const now = new Date(`${todayKey}T12:00:00`);
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
    }

    return months.map((ym) => {
      const foodDays: ReturnType<typeof sumMacros>[] = [];
      dailyTotalsByDate.forEach((totals, d) => {
        if (d.startsWith(ym)) foodDays.push(totals);
      });
      const weightVals: number[] = [];
      weightByDate.forEach((wKg, d) => {
        if (d.startsWith(ym)) weightVals.push(wKg);
      });
      const waterVals: number[] = [];
      Object.entries(waterIntakeMlByDate).forEach(([d, ml]) => {
        if (d.startsWith(ym) && ml > 0) waterVals.push(ml);
      });

      const avg = (arr: number[]) =>
        arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

      return {
        key: ym,
        label: formatMonthLabel(ym),
        loggedDays: foodDays.length,
        calories: foodDays.length > 0 ? Math.round(avg(foodDays.map((x) => x.calories))!) : null,
        protein: foodDays.length > 0 ? round1(avg(foodDays.map((x) => x.protein))!) : null,
        carbs: foodDays.length > 0 ? round1(avg(foodDays.map((x) => x.carbs))!) : null,
        fat: foodDays.length > 0 ? round1(avg(foodDays.map((x) => x.fat))!) : null,
        fibre: foodDays.length > 0 ? round1(avg(foodDays.map((x) => x.fibre))!) : null,
        weight:
          weightVals.length > 0
            ? convertWeightToDisplay(avg(weightVals)!, settings.weightUnit)
            : null,
        water: waterVals.length > 0 ? Math.round(avg(waterVals)!) : null,
      };
    });
  }, [dailyTotalsByDate, settings.weightUnit, timeframe, todayKey, waterIntakeMlByDate, weightByDate]);

  // Overview KPI calculations (strictly real logged data)
  const overviewStats = useMemo(() => {
    const loggedPoints = chartData.filter((p) => p.calories !== null);
    const avgCalories =
      loggedPoints.length > 0
        ? Math.round(loggedPoints.reduce((s, p) => s + (p.calories || 0), 0) / loggedPoints.length)
        : null;

    const avgProtein =
      loggedPoints.length > 0
        ? round1(loggedPoints.reduce((s, p) => s + (p.protein || 0), 0) / loggedPoints.length)
        : null;

    const proteinHitPoints =
      goals.protein > 0
        ? loggedPoints.filter((p) => (p.protein || 0) >= goals.protein * 0.9).length
        : 0;
    const proteinConsistencyPct =
      loggedPoints.length > 0 && goals.protein > 0
        ? Math.round((proteinHitPoints / loggedPoints.length) * 100)
        : null;

    const calorieAdherentPoints =
      goals.calories > 0
        ? loggedPoints.filter(
            (p) =>
              (p.calories || 0) >= goals.calories * 0.85 &&
              (p.calories || 0) <= goals.calories * 1.12
          ).length
        : 0;
    const calorieAdherencePct =
      loggedPoints.length > 0 && goals.calories > 0
        ? Math.round((calorieAdherentPoints / loggedPoints.length) * 100)
        : null;

    // 30-day real weight trend
    const thirtyDaysAgo = addDaysToDateKey(todayKey, -30);
    const recentWeights = sortWeightEntriesChronological(state.weightEntries).filter(
      (w) => w.date >= thirtyDaysAgo
    );
    const allSortedWeights = sortWeightEntriesChronological(state.weightEntries);
    const weightChange30dKg =
      recentWeights.length >= 2
        ? round1(recentWeights[recentWeights.length - 1].weightKg - recentWeights[0].weightKg)
        : null;

    // Weight goal completion %
    const latestWeight = allSortedWeights[allSortedWeights.length - 1];
    const startWeightKg = weightGoal.startingWeightKg || allSortedWeights[0]?.weightKg || 0;
    const targetWeightKg = weightGoal.targetWeightKg || goals.targetWeightKg || 0;
    let weightCompletionPct: number | null = null;
    if (latestWeight && startWeightKg > 0 && targetWeightKg > 0 && Math.abs(targetWeightKg - startWeightKg) >= 0.2) {
      const totalDist = targetWeightKg - startWeightKg;
      const doneDist = latestWeight.weightKg - startWeightKg;
      const ratio = doneDist / totalDist;
      weightCompletionPct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
    }

    // Water consistency over last 14 days (real logged days only)
    const last14 = getLastNDates(14, todayKey);
    const waterLoggedDays = last14.filter((d) => (waterIntakeMlByDate[d] || 0) > 0);
    const waterHitDays = waterLoggedDays.filter(
      (d) => (waterIntakeMlByDate[d] || 0) >= dailyWaterGoalMl * 0.85
    );
    const avgWaterMl =
      waterLoggedDays.length > 0
        ? Math.round(
            waterLoggedDays.reduce((s, d) => s + (waterIntakeMlByDate[d] || 0), 0) /
              waterLoggedDays.length
          )
        : null;

    return {
      loggedBuckets: loggedPoints.length,
      avgCalories,
      avgProtein,
      proteinConsistencyPct,
      calorieAdherencePct,
      weightChange30dKg,
      latestWeight,
      startWeightKg,
      targetWeightKg,
      weightCompletionPct,
      waterLoggedCount: waterLoggedDays.length,
      waterHitCount: waterHitDays.length,
      avgWaterMl,
    };
  }, [
    chartData,
    dailyWaterGoalMl,
    goals.calories,
    goals.protein,
    goals.targetWeightKg,
    state.weightEntries,
    todayKey,
    waterIntakeMlByDate,
    weightGoal.startingWeightKg,
    weightGoal.targetWeightKg,
  ]);

  const weeklyBank = useMemo(
    () =>
      getWeeklyCalorieBankSummary({
        foodEntries: state.foodEntries,
        goals,
        referenceDateKey: todayKey,
      }),
    [goals, state.foodEntries, todayKey]
  );

  // Personalized real-data insights (strictly truthful, explaining insufficient data clearly)
  const insights = useMemo(() => {
    const list: { title: string; body: string; tone: 'positive' | 'caution' | 'neutral' }[] = [];

    if (overviewStats.loggedBuckets < 3) {
      list.push({
        title: 'Build your baseline',
        body: `You have ${overviewStats.loggedBuckets} ${overviewStats.loggedBuckets === 1 ? 'period' : 'periods'} logged in this view. Log at least 3–5 days of meals so CALOTHRIX can identify calorie and macro trends accurately.`,
        tone: 'neutral',
      });
    } else if (overviewStats.avgCalories !== null && goals.calories > 0) {
      const diff = overviewStats.avgCalories - goals.calories;
      if (Math.abs(diff) <= goals.calories * 0.1) {
        list.push({
          title: 'Strong calorie consistency',
          body: `Your average intake is ${overviewStats.avgCalories.toLocaleString()} kcal/day against your ${goals.calories.toLocaleString()} kcal target (${overviewStats.calorieAdherencePct ?? 0}% adherence).`,
          tone: 'positive',
        });
      } else if (diff > 0) {
        list.push({
          title: `Averaging +${Math.round(diff)} kcal above target`,
          body: `Across logged periods you averaged ${overviewStats.avgCalories.toLocaleString()} kcal/day. Trimming 150–250 kcal from evening snacks or cooking oils can bring your weekly average right on target.`,
          tone: 'caution',
        });
      } else {
        list.push({
          title: `Averaging ${Math.abs(Math.round(diff))} kcal under target`,
          body: `Your average is ${overviewStats.avgCalories.toLocaleString()} kcal/day. Make sure you are logging every meal and getting enough protein to sustain energy and recovery.`,
          tone: 'neutral',
        });
      }
    }

    if (overviewStats.proteinConsistencyPct !== null && overviewStats.loggedBuckets >= 3) {
      if (overviewStats.proteinConsistencyPct >= 75) {
        list.push({
          title: 'Protein target on lock',
          body: `You hit at least 90% of your ${goals.protein}g protein goal on ${overviewStats.proteinConsistencyPct}% of logged days (avg ${overviewStats.avgProtein}g/day).`,
          tone: 'positive',
        });
      } else {
        list.push({
          title: 'Opportunity: boost daily protein',
          body: `Average protein is ${overviewStats.avgProtein}g/day vs your ${goals.protein}g target (${overviewStats.proteinConsistencyPct}% consistency). Adding eggs, paneer, Greek yogurt, dal, or lean chicken at breakfast helps close the gap.`,
          tone: 'caution',
        });
      }
    }

    if (overviewStats.weightChange30dKg !== null) {
      const dir =
        overviewStats.weightChange30dKg < -0.1
          ? `down ${Math.abs(overviewStats.weightChange30dKg)} kg`
          : overviewStats.weightChange30dKg > 0.1
          ? `up ${overviewStats.weightChange30dKg} kg`
          : 'stable';
      list.push({
        title: `30-day weight trend is ${dir}`,
        body:
          overviewStats.weightCompletionPct !== null
            ? `You are ${overviewStats.weightCompletionPct}% of the way toward your ${formatWeight(overviewStats.targetWeightKg, settings.weightUnit)} target.`
            : 'Keep weighing in 2–4 times per week under similar morning conditions for the clearest trend.',
        tone: 'positive',
      });
    } else {
      list.push({
        title: 'Not enough weigh-ins for a 30-day trend',
        body: 'Log at least 2 body weight entries within 30 days to see your real weight trend and goal completion pace.',
        tone: 'neutral',
      });
    }

    return list;
  }, [
    goals.calories,
    goals.protein,
    overviewStats,
    settings.weightUnit,
  ]);

  // Metric Explorer config
  const metricConfig = useMemo(() => {
    const configs: Record<
      ExplorerMetric,
      {
        label: string;
        unit: string;
        target: number | null;
        color: string;
        chartType: 'bar' | 'area';
      }
    > = {
      calories: {
        label: 'Calories',
        unit: 'kcal',
        target: goals.calories > 0 ? goals.calories : null,
        color: isDark ? '#C8FF00' : '#4E6800',
        chartType: 'bar',
      },
      protein: {
        label: 'Protein',
        unit: 'g',
        target: goals.protein > 0 ? goals.protein : null,
        color: '#22c55e',
        chartType: 'bar',
      },
      carbs: {
        label: 'Carbs',
        unit: 'g',
        target: goals.carbs > 0 ? goals.carbs : null,
        color: '#f59e0b',
        chartType: 'bar',
      },
      fat: {
        label: 'Fat',
        unit: 'g',
        target: goals.fat > 0 ? goals.fat : null,
        color: '#6366f1',
        chartType: 'bar',
      },
      weight: {
        label: 'Weight',
        unit: settings.weightUnit,
        target:
          overviewStats.targetWeightKg > 0
            ? convertWeightToDisplay(overviewStats.targetWeightKg, settings.weightUnit)
            : null,
        color: isDark ? '#C8FF00' : '#4E6800',
        chartType: 'area',
      },
      water: {
        label: 'Water',
        unit: 'ml',
        target: dailyWaterGoalMl > 0 ? dailyWaterGoalMl : null,
        color: '#0ea5e9',
        chartType: 'bar',
      },
    };
    return configs[metric];
  }, [
    dailyWaterGoalMl,
    goals.calories,
    goals.carbs,
    goals.fat,
    goals.protein,
    isDark,
    metric,
    overviewStats.targetWeightKg,
    settings.weightUnit,
  ]);

  const metricNonNullCount = useMemo(
    () => chartData.filter((d) => d[metric] !== null).length,
    [chartData, metric]
  );

  // Recent 14-day tracking history table (only real days with logs or water or weight)
  const trackingHistory = useMemo(() => {
    const dates = getLastNDates(14, todayKey).reverse();
    return dates
      .map((d) => {
        const totals = dailyTotalsByDate.get(d);
        const wKg = weightByDate.get(d);
        const waterMl = waterIntakeMlByDate[d] || 0;
        if (!totals && wKg === undefined && waterMl === 0) return null;
        return {
          date: d,
          label: formatShortDate(d),
          calories: totals ? Math.round(totals.calories) : null,
          protein: totals ? round1(totals.protein) : null,
          carbs: totals ? round1(totals.carbs) : null,
          fat: totals ? round1(totals.fat) : null,
          weightKg: wKg ?? null,
          waterMl: waterMl > 0 ? waterMl : null,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
  }, [dailyTotalsByDate, todayKey, waterIntakeMlByDate, weightByDate]);

  // 28-day Consistency Heatmap
  const consistencyGrid = useMemo(() => {
    const dates = getLastNDates(28, todayKey);
    return dates.map((d) => {
      const totals = dailyTotalsByDate.get(d);
      if (!totals) return { date: d, status: 'empty' as const, calories: 0 };
      if (goals.calories > 0) {
        const ratio = totals.calories / goals.calories;
        if (ratio >= 0.85 && ratio <= 1.12) {
          return { date: d, status: 'on_target' as const, calories: Math.round(totals.calories) };
        }
      }
      return { date: d, status: 'logged' as const, calories: Math.round(totals.calories) };
    });
  }, [dailyTotalsByDate, goals.calories, todayKey]);

  const timeframeTabs: { id: TimeframeOption; label: string; sub: string }[] = [
    { id: 'daily', label: 'Daily', sub: '7 days' },
    { id: 'weekly', label: 'Weekly', sub: '14 days' },
    { id: 'monthly', label: 'Monthly', sub: '30 days' },
    { id: 'yearly', label: 'Yearly', sub: '12 months' },
  ];

  const metricTabs: { id: ExplorerMetric; label: string }[] = [
    { id: 'calories', label: 'Calories' },
    { id: 'protein', label: 'Protein' },
    { id: 'carbs', label: 'Carbs' },
    { id: 'fat', label: 'Fat' },
    { id: 'weight', label: 'Weight' },
    { id: 'water', label: 'Water' },
  ];

  return (
    <div className="space-y-6">
      {/* Header + Timeframe Selector */}
      <section className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-data trends, adherence, weight progress &amp; hydration analytics
          </p>
          <h1 className="mt-0.5 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Progress
          </h1>
        </div>

        <div
          role="tablist"
          aria-label="Analytics timeframe"
          className="inline-flex items-center p-1 rounded-2xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 self-start sm:self-auto"
        >
          {timeframeTabs.map((t) => {
            const active = timeframe === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTimeframe(t.id)}
                className={`min-h-[38px] px-3 sm:px-3.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* 1. OVERVIEW KPI STRIP (4 Core Real-Data Metrics) */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Avg Calories</span>
            <Flame className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00]" />
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-bold font-mono-nums text-slate-900 dark:text-white">
            {overviewStats.avgCalories !== null
              ? `${overviewStats.avgCalories.toLocaleString()}`
              : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono-nums">
            {goals.calories > 0
              ? `Target ${goals.calories.toLocaleString()} kcal`
              : 'Set goal in Goals'}
          </div>
        </div>

        <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Protein Consistency</span>
            <Target className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-bold font-mono-nums text-slate-900 dark:text-white">
            {overviewStats.proteinConsistencyPct !== null
              ? `${overviewStats.proteinConsistencyPct}%`
              : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono-nums">
            {overviewStats.avgProtein !== null
              ? `Avg ${overviewStats.avgProtein}g / ${goals.protein}g`
              : 'No meal logs yet'}
          </div>
        </div>

        <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>30-Day Weight</span>
            <Scale className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00]" />
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-bold font-mono-nums text-slate-900 dark:text-white inline-flex items-center gap-1">
            {overviewStats.weightChange30dKg !== null ? (
              <>
                {overviewStats.weightChange30dKg < 0 ? (
                  <TrendingDown className="w-4 h-4 text-emerald-500" />
                ) : overviewStats.weightChange30dKg > 0 ? (
                  <TrendingUp className="w-4 h-4 text-amber-500" />
                ) : null}
                <span>
                  {overviewStats.weightChange30dKg > 0
                    ? `+${overviewStats.weightChange30dKg}`
                    : overviewStats.weightChange30dKg}{' '}
                  kg
                </span>
              </>
            ) : (
              '—'
            )}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono-nums">
            {overviewStats.weightCompletionPct !== null
              ? `${overviewStats.weightCompletionPct}% to goal`
              : overviewStats.latestWeight
              ? `Now ${formatWeight(overviewStats.latestWeight.weightKg, settings.weightUnit)}`
              : 'Log 2+ weigh-ins'}
          </div>
        </div>

        <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Goal Adherence</span>
            <Activity className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-2 text-xl sm:text-2xl font-bold font-mono-nums text-slate-900 dark:text-white">
            {overviewStats.calorieAdherencePct !== null
              ? `${overviewStats.calorieAdherencePct}%`
              : '—'}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {overviewStats.loggedBuckets > 0
              ? `${overviewStats.loggedBuckets} tracked ${timeframe === 'yearly' ? 'months' : 'days'}`
              : 'Start logging meals'}
          </div>
        </div>
      </section>

      {/* 2. INTERACTIVE METRIC EXPLORER CHART */}
      <section className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
              Interactive Metric Explorer
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {metricConfig.label} ({timeframe === 'yearly' ? 'monthly averages' : 'daily totals'}) · Missing days are left blank rather than shown as zero
            </p>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {metricTabs.map((m) => {
              const active = metric === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMetric(m.id)}
                  className={`min-h-[36px] px-3 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black'
                      : 'bg-[#F4F3EF] dark:bg-[#090A0C] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {metricNonNullCount === 0 ? (
          <div className="rounded-xl border border-dashed border-black/12 dark:border-white/15 p-8 text-center">
            <BarChart3 className="w-8 h-8 text-slate-400 mx-auto" />
            <h3 className="mt-2.5 text-sm font-bold text-slate-900 dark:text-slate-100">
              No {metricConfig.label.toLowerCase()} data recorded in this timeframe yet
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              CALOTHRIX only charts your real logged data. Add your first entry to unlock live trend analysis.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {metric === 'weight' ? (
                <button
                  type="button"
                  onClick={() => openWeightModal()}
                  className="min-h-[42px] px-4 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Log Body Weight
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => openAddFoodModal()}
                  className="min-h-[42px] px-4 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Log Food
                </button>
              )}
            </div>
          </div>
        ) : (
          <div
            className="h-64 sm:h-72 w-full"
            role="img"
            aria-label={`${metricConfig.label} chart across ${timeframe} timeframe showing ${metricNonNullCount} tracked data points`}
          >
            <ResponsiveContainer width="100%" height="100%">
              {metricConfig.chartType === 'area' ? (
                <AreaChart data={chartData} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="progressMetricGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={metricConfig.color} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={metricConfig.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: isDark ? '#9A9CA3' : '#52555E' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 11, fill: isDark ? '#9A9CA3' : '#52555E' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#111317' : '#ffffff',
                      borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
                      borderRadius: '12px',
                      fontSize: '12px',
                    }}
                    formatter={(value: unknown) =>
                      value === null || value === undefined
                        ? ['Not logged', metricConfig.label]
                        : [`${value} ${metricConfig.unit}`, metricConfig.label]
                    }
                  />
                  {metricConfig.target !== null && (
                    <ReferenceLine
                      y={metricConfig.target}
                      stroke={isDark ? '#C8FF00' : '#4E6800'}
                      strokeDasharray="4 4"
                      label={{
                        value: `Target ${metricConfig.target}`,
                        position: 'insideTopRight',
                        fill: isDark ? '#C8FF00' : '#4E6800',
                        fontSize: 11,
                      }}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey={metric}
                    connectNulls
                    stroke={metricConfig.color}
                    strokeWidth={2.5}
                    fill="url(#progressMetricGrad)"
                    dot={{ r: 3.5, fill: metricConfig.color }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              ) : (
                <BarChart data={chartData} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: isDark ? '#9A9CA3' : '#52555E' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: isDark ? '#9A9CA3' : '#52555E' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}
                    contentStyle={{
                      backgroundColor: isDark ? '#111317' : '#ffffff',
                      borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
                      borderRadius: '12px',
                      fontSize: '12px',
                    }}
                    formatter={(value: unknown) =>
                      value === null || value === undefined
                        ? ['Not logged', metricConfig.label]
                        : [`${Number(value).toLocaleString()} ${metricConfig.unit}`, metricConfig.label]
                    }
                  />
                  {metricConfig.target !== null && (
                    <ReferenceLine
                      y={metricConfig.target}
                      stroke={isDark ? '#9A9CA3' : '#52555E'}
                      strokeDasharray="4 4"
                      label={{
                        value: `Target ${metricConfig.target.toLocaleString()}`,
                        position: 'insideTopRight',
                        fill: isDark ? '#9A9CA3' : '#52555E',
                        fontSize: 11,
                      }}
                    />
                  )}
                  <Bar dataKey={metric} radius={[6, 6, 0, 0]} maxBarSize={32}>
                    {chartData.map((entry) => (
                      <Cell
                        key={entry.key}
                        fill={entry[metric] !== null ? metricConfig.color : 'transparent'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* 3. PERSONALIZED REAL-DATA INSIGHTS */}
      <section className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 sm:p-6 space-y-3.5">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00]" />
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Personalized Insights
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {insights.map((item, idx) => (
            <div
              key={idx}
              className="rounded-xl p-4 bg-[#F4F3EF]/80 dark:bg-[#090A0C] border border-black/8 dark:border-white/10 space-y-1.5"
            >
              <div className="flex items-center gap-1.5">
                {item.tone === 'caution' && <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {item.title}
                </h3>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 4. WEEKLY CALORIE BANK & WATER CONSISTENCY */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Weekly Calorie Bank */}
        <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Weekly Calorie Bank
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Monday–Sunday cumulative balance
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('goals')}
              className="text-xs font-semibold text-[#4E6800] dark:text-[#C8FF00] hover:underline"
            >
              Edit target
            </button>
          </div>

          {goals.calories === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
              Set a daily calorie target in Goals to track your weekly calorie bank.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2.5">
                <div className="p-3 rounded-xl bg-[#F4F3EF]/80 dark:bg-[#090A0C]">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Weekly Budget</div>
                  <div className="mt-0.5 text-base font-bold font-mono-nums text-slate-900 dark:text-white">
                    {weeklyBank.weeklyBudget.toLocaleString()}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#F4F3EF]/80 dark:bg-[#090A0C]">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Consumed</div>
                  <div className="mt-0.5 text-base font-bold font-mono-nums text-slate-900 dark:text-white">
                    {weeklyBank.consumedThisWeek.toLocaleString()}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#F4F3EF]/80 dark:bg-[#090A0C]">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Remaining</div>
                  <div className="mt-0.5 text-base font-bold font-mono-nums text-[#4E6800] dark:text-[#C8FF00]">
                    {weeklyBank.remainingWeeklyBudget.toLocaleString()}
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {weeklyBank.loggedDaysCount} of 7 days logged this week · Suggested remaining daily budget:{' '}
                <span className="font-semibold font-mono-nums text-slate-800 dark:text-slate-200">
                  {weeklyBank.recommendedPerRemainingDay.toLocaleString()} kcal/day
                </span>
              </p>
            </>
          )}
        </div>

        {/* Hydration Consistency */}
        <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Droplets className="w-4 h-4 text-sky-500" />
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Hydration Consistency (14 Days)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Daily goal: {(dailyWaterGoalMl / 1000).toFixed(2)} L
                </p>
              </div>
            </div>
          </div>

          {overviewStats.waterLoggedCount === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
              No water intake logged in the last 14 days yet. Use the quick +250 ml / +500 ml buttons on Home to track hydration.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2.5">
              <div className="p-3 rounded-xl bg-[#F4F3EF]/80 dark:bg-[#090A0C]">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Avg Intake</div>
                <div className="mt-0.5 text-base font-bold font-mono-nums text-sky-600 dark:text-sky-400">
                  {((overviewStats.avgWaterMl || 0) / 1000).toFixed(2)} L
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#F4F3EF]/80 dark:bg-[#090A0C]">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Days Tracked</div>
                <div className="mt-0.5 text-base font-bold font-mono-nums text-slate-900 dark:text-white">
                  {overviewStats.waterLoggedCount} / 14
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#F4F3EF]/80 dark:bg-[#090A0C]">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Goal Hit Rate</div>
                <div className="mt-0.5 text-base font-bold font-mono-nums text-slate-900 dark:text-white">
                  {Math.round((overviewStats.waterHitCount / overviewStats.waterLoggedCount) * 100)}%
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 5. 28-DAY CONSISTENCY CALENDAR & RECENT TRACKING HISTORY */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 28-Day Consistency Calendar */}
        <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00]" />
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                28-Day Logging Consistency
              </h2>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#4E6800] dark:bg-[#C8FF00]" />
                On target
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-400/70" />
                Logged
              </span>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {consistencyGrid.map((cell) => (
              <div
                key={cell.date}
                title={`${formatShortDate(cell.date)}: ${cell.calories > 0 ? `${cell.calories} kcal` : 'Not logged'}`}
                className={`h-9 rounded-lg flex flex-col items-center justify-center text-[10px] font-mono-nums ${
                  cell.status === 'on_target'
                    ? 'bg-[#C8FF00]/30 dark:bg-[#C8FF00]/25 text-[#364900] dark:text-[#C8FF00] font-bold border border-[#4E6800]/25 dark:border-[#C8FF00]/30'
                    : cell.status === 'logged'
                    ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 font-semibold border border-amber-500/25'
                    : 'bg-[#F4F3EF] dark:bg-[#090A0C] text-slate-400 border border-black/5 dark:border-white/5'
                }`}
              >
                {cell.date.slice(-2)}
              </div>
            ))}
          </div>
        </div>

        {/* Recent Daily Tracking History */}
        <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 space-y-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Recent Tracking History
          </h2>

          {trackingHistory.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-4">
              Your recent daily summaries will appear here once you log food, water, or body weight.
            </p>
          ) : (
            <div className="divide-y divide-black/6 dark:divide-white/8 max-h-64 overflow-y-auto pr-1">
              {trackingHistory.map((row) => (
                <div
                  key={row.date}
                  className="py-2.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {row.label}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-nums">
                      {row.protein !== null
                        ? `P ${row.protein}g · C ${row.carbs}g · F ${row.fat}g`
                        : 'No meals logged'}
                    </div>
                  </div>
                  <div className="text-right font-mono-nums shrink-0">
                    <div className="font-bold text-slate-900 dark:text-white">
                      {row.calories !== null ? `${row.calories.toLocaleString()} kcal` : '—'}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {row.weightKg !== null && formatWeight(row.weightKg, settings.weightUnit)}
                      {row.weightKg !== null && row.waterMl !== null && ' · '}
                      {row.waterMl !== null && `${(row.waterMl / 1000).toFixed(1)}L`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
