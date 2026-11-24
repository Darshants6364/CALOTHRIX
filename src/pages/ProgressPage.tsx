import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Flame } from 'lucide-react';
import {
  DedicatedMacroCharts,
  TopMacroOverview,
} from '../components/progress/ProgressMacroCharts';
import { WeekRibbonCalendar } from '../components/progress/WeekRibbonCalendar';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { MEAL_CATEGORIES, type MealCategory } from '../types';
import {
  addDaysToDateKey,
  formatShortDate,
  getMondayToSundayWeek,
  getTodayDateKey,
  parseLocalDateKey,
} from '../utils/dateUtils';
import { round1 } from '../utils/nutritionUtils';
import {
  buildDailyAggregateMap,
  buildDatesInclusive,
  computeNutritionAnalytics,
  type ResolvedDateRange,
} from '../utils/progressAnalytics';

type ProgressWindow = '7d' | '30d';

const ProgressSkeleton: React.FC = () => (
  <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Loading progress">
    <div className="h-12 rounded-2xl bg-black/[0.06] dark:bg-white/[0.06]" />
    <div className="h-24 rounded-2xl bg-black/[0.06] dark:bg-white/[0.06]" />
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      <div className="lg:col-span-5 h-56 rounded-2xl bg-black/[0.06] dark:bg-white/[0.06]" />
      <div className="lg:col-span-7 grid grid-cols-2 gap-3">
        <div className="h-26 rounded-2xl bg-black/[0.06] dark:bg-white/[0.06]" />
        <div className="h-26 rounded-2xl bg-black/[0.06] dark:bg-white/[0.06]" />
        <div className="h-26 rounded-2xl bg-black/[0.06] dark:bg-white/[0.06]" />
        <div className="h-26 rounded-2xl bg-black/[0.06] dark:bg-white/[0.06]" />
      </div>
    </div>
  </div>
);

export const ProgressPage: React.FC = () => {
  const {
    state,
    syncingDb,
    resolvedTheme,
    waterIntakeMlByDate,
    dailyWaterGoalMl,
    openAddFoodModal,
    setActiveTab,
  } = useMacroLogStore();

  const todayKey = getTodayDateKey();
  const isDark = resolvedTheme === 'dark';
  const { goals } = state;

  // Current calendar week (Mon -> Sun, e.g. Nov 16-22, Nov 23-29)
  const currentWeekDates = useMemo(() => getMondayToSundayWeek(todayKey, 0), [todayKey]);
  const currentWeekStart = currentWeekDates[0];

  // ONLY two window modes: 7 Days (calendar week) and 30 Days
  const [windowMode, setWindowMode] = useState<ProgressWindow>('7d');
  const [selectedWeekStart, setSelectedWeekStart] = useState<string>(currentWeekStart);
  const [thirtyDayEnd, setThirtyDayEnd] = useState<string>(todayKey);
  const [monthExpanded, setMonthExpanded] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<{ year: number; month: number }>(() => {
    const dt = parseLocalDateKey(todayKey);
    return { year: dt.getFullYear(), month: dt.getMonth() };
  });

  // Single O(N) daily aggregation map
  const dailyMap = useMemo(
    () =>
      buildDailyAggregateMap({
        foodEntries: state.foodEntries,
        weightEntries: state.weightEntries,
        waterIntakeMlByDate,
      }),
    [state.foodEntries, state.weightEntries, waterIntakeMlByDate]
  );

  // Real logging streak (consecutive logged days up to today/yesterday)
  const currentStreak = useMemo(() => {
    let streak = 0;
    let cursor = todayKey;
    if (!dailyMap.get(cursor)?.hasFood) {
      cursor = addDaysToDateKey(todayKey, -1);
    }
    while (dailyMap.get(cursor)?.hasFood && streak < 730) {
      streak += 1;
      cursor = addDaysToDateKey(cursor, -1);
    }
    return streak;
  }, [dailyMap, todayKey]);

  // Selected 7-day calendar week dates (Mon -> Sun)
  const selectedWeekDates = useMemo(
    () => getMondayToSundayWeek(selectedWeekStart, 0),
    [selectedWeekStart]
  );

  // Single-source-of-truth active range for ALL charts & summaries
  const activeRange = useMemo<ResolvedDateRange>(() => {
    if (windowMode === '7d') {
      const startDate = selectedWeekDates[0];
      const endDate = selectedWeekDates[6];
      const prevEndDate = addDaysToDateKey(startDate, -1);
      const prevStartDate = addDaysToDateKey(prevEndDate, -6);
      return {
        preset: '7d',
        startDate,
        endDate,
        dates: selectedWeekDates,
        prevStartDate,
        prevEndDate,
        prevDates: buildDatesInclusive(prevStartDate, prevEndDate),
        label: `${formatShortDate(startDate)} – ${formatShortDate(endDate)}`,
        dayCount: 7,
      };
    }

    const endDate = thirtyDayEnd;
    const startDate = addDaysToDateKey(endDate, -29);
    const prevEndDate = addDaysToDateKey(startDate, -1);
    const prevStartDate = addDaysToDateKey(prevEndDate, -29);
    return {
      preset: '30d',
      startDate,
      endDate,
      dates: buildDatesInclusive(startDate, endDate),
      prevStartDate,
      prevEndDate,
      prevDates: buildDatesInclusive(prevStartDate, prevEndDate),
      label: `${formatShortDate(startDate)} – ${formatShortDate(endDate)}`,
      dayCount: 30,
    };
  }, [selectedWeekDates, thirtyDayEnd, windowMode]);

  // Core nutrition analytics (averages per logged day, Atwater macro distribution, daily chart series)
  const nutritionAnalytics = useMemo(
    () =>
      computeNutritionAnalytics({
        range: activeRange,
        dailyMap,
        goals,
        dailyWaterGoalMl,
        selectedMetric: 'calories',
      }),
    [activeRange, dailyMap, dailyWaterGoalMl, goals]
  );

  // Nutritionist Metric 1: Meal-by-Meal Calorie Split (Breakfast / Lunch / Snacks / Dinner)
  const mealSplit = useMemo(() => {
    const start = activeRange.startDate;
    const end = activeRange.endDate;
    const totalsByMeal: Record<MealCategory, number> = {
      breakfast: 0,
      lunch: 0,
      evening_snacks: 0,
      dinner: 0,
      other: 0,
    };
    let grandTotal = 0;

    for (const entry of state.foodEntries) {
      if (entry.date >= start && entry.date <= end && entry.calories > 0) {
        const key: MealCategory = entry.mealType in totalsByMeal ? entry.mealType : 'other';
        totalsByMeal[key] += entry.calories;
        grandTotal += entry.calories;
      }
    }

    const loggedDays = Math.max(1, nutritionAnalytics.overview.calories.loggedDays);
    const rows = MEAL_CATEGORIES.filter((m) => m.id !== 'other' || totalsByMeal.other > 0).map(
      (m) => {
        const total = Math.round(totalsByMeal[m.id]);
        const pct = grandTotal > 0 ? Math.round((total / grandTotal) * 100) : 0;
        const avgPerDay = grandTotal > 0 ? Math.round(total / loggedDays) : 0;
        return {
          id: m.id,
          label: m.shortLabel,
          pct,
          avgPerDay,
        };
      }
    );

    return { hasData: grandTotal > 0, rows };
  }, [activeRange.endDate, activeRange.startDate, nutritionAnalytics.overview.calories.loggedDays, state.foodEntries]);

  // Nutritionist Metric 2: Coach Quality & Calorie Budget Snapshot
  const coachMetrics = useMemo(() => {
    const cal = nutritionAnalytics.overview.calories;
    const pro = nutritionAnalytics.overview.protein;
    const water = nutritionAnalytics.overview.water;

    const avgCal = cal.avgPerLoggedDay ?? 0;
    const avgPro = pro.avgPerLoggedDay ?? 0;
    const proteinPer1000Kcal = avgCal > 0 ? round1((avgPro / avgCal) * 1000) : null;

    const periodBudget = goals.calories > 0 ? goals.calories * activeRange.dayCount : 0;
    const periodRemaining = periodBudget > 0 ? periodBudget - cal.totalForPeriod : 0;

    return {
      proteinPer1000Kcal,
      periodBudget,
      periodConsumed: cal.totalForPeriod,
      periodRemaining,
      avgWaterLiters: water.avgPerLoggedDay !== null ? (water.avgPerLoggedDay / 1000).toFixed(2) : null,
      loggedDays: cal.loggedDays,
      totalDays: activeRange.dayCount,
    };
  }, [activeRange.dayCount, goals.calories, nutritionAnalytics.overview]);

  // Navigation Handlers
  const handleStepWeek = (delta: number) => {
    const candidate = addDaysToDateKey(selectedWeekStart, delta * 7);
    const clamped = candidate > currentWeekStart ? currentWeekStart : candidate;
    setSelectedWeekStart(clamped);
    const mid = parseLocalDateKey(addDaysToDateKey(clamped, 3));
    setCalendarMonth({ year: mid.getFullYear(), month: mid.getMonth() });
  };

  const handleStepMonth = (delta: number) => {
    const next = new Date(calendarMonth.year, calendarMonth.month + delta, 1, 12, 0, 0);
    setCalendarMonth({ year: next.getFullYear(), month: next.getMonth() });
  };

  const handleSelectWeekByDate = (dateKey: string) => {
    const weekMon = getMondayToSundayWeek(dateKey, 0)[0];
    const clamped = weekMon > currentWeekStart ? currentWeekStart : weekMon;
    setSelectedWeekStart(clamped);
    const dt = parseLocalDateKey(dateKey);
    setCalendarMonth({ year: dt.getFullYear(), month: dt.getMonth() });
    setMonthExpanded(false);
  };

  const handleJumpCurrentWeek = () => {
    setSelectedWeekStart(currentWeekStart);
    const dt = parseLocalDateKey(todayKey);
    setCalendarMonth({ year: dt.getFullYear(), month: dt.getMonth() });
    setMonthExpanded(false);
  };

  const handleStep30Days = (delta: -1 | 1) => {
    const candidate = addDaysToDateKey(thirtyDayEnd, delta * 30);
    setThirtyDayEnd(candidate > todayKey ? todayKey : candidate);
  };

  if (syncingDb && state.foodEntries.length === 0) {
    return <ProgressSkeleton />;
  }

  return (
    <div className="space-y-4 sm:space-y-5 overflow-x-clip">
      {/* HEADER: Title + Streak with Flame Icon on left, 7 Days / 30 Days toggle on right corner */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 leading-tight">
              Progress
            </h1>
            <p className="text-xs font-mono-nums text-slate-500 dark:text-slate-400">
              {activeRange.label}
            </p>
          </div>

          <div
            aria-label={`Current streak: ${currentStreak} days`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/12 dark:bg-[#C8FF00]/12 border border-amber-500/20 dark:border-[#C8FF00]/25 shrink-0"
          >
            <Flame className="w-4 h-4 text-amber-500 dark:text-[#C8FF00] fill-amber-500/25 dark:fill-[#C8FF00]/25" />
            <span className="text-sm font-bold font-mono-nums text-slate-900 dark:text-[#C8FF00]">
              {currentStreak}
            </span>
          </div>
        </div>

        {/* Right-Corner 7 Days / 30 Days Toggle (ONLY these two options) */}
        <div
          role="tablist"
          aria-label="Progress timeframe"
          className="inline-flex items-center p-1 rounded-xl bg-white dark:bg-[#111317] border border-black/8 dark:border-white/10 shrink-0 ml-auto"
        >
          <button
            type="button"
            role="tab"
            aria-selected={windowMode === '7d'}
            onClick={() => setWindowMode('7d')}
            className={`min-h-[38px] px-3.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              windowMode === '7d'
                ? 'bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            7 Days
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={windowMode === '30d'}
            onClick={() => setWindowMode('30d')}
            className={`min-h-[38px] px-3.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              windowMode === '30d'
                ? 'bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            30 Days
          </button>
        </div>
      </header>

      {/* COMPACT SPACE-SAVING CALENDAR RIBBON (7-day week mover + optional month expand, or 30-day bar) */}
      {windowMode === '7d' ? (
        <WeekRibbonCalendar
          weekDates={selectedWeekDates}
          todayKey={todayKey}
          calendarMonth={calendarMonth}
          dailyMap={dailyMap}
          goals={goals}
          monthExpanded={monthExpanded}
          onToggleMonth={() => setMonthExpanded((v) => !v)}
          onStepWeek={handleStepWeek}
          onStepMonth={handleStepMonth}
          onSelectWeekByDate={handleSelectWeekByDate}
          onJumpCurrentWeek={handleJumpCurrentWeek}
          isCurrentWeek={selectedWeekStart === currentWeekStart}
        />
      ) : (
        <section
          aria-label="30-day window navigation"
          className="bg-white dark:bg-[#111317] border border-black/8 dark:border-white/10 rounded-2xl px-3 py-2 flex items-center justify-between gap-2"
        >
          <button
            type="button"
            onClick={() => handleStep30Days(-1)}
            aria-label="Previous 30 days"
            className="h-9 w-9 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/8"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="text-center font-mono-nums">
            <div className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100">
              {activeRange.label}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {nutritionAnalytics.overview.calories.loggedDays} of 30 days logged
              {thirtyDayEnd < todayKey && (
                <>
                  {' '}·{' '}
                  <button
                    type="button"
                    onClick={() => setThirtyDayEnd(todayKey)}
                    className="font-semibold text-[#4E6800] dark:text-[#C8FF00] hover:underline"
                  >
                    Latest
                  </button>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleStep30Days(1)}
            disabled={thirtyDayEnd >= todayKey}
            aria-label="Next 30 days"
            className="h-9 w-9 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/8 disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </section>
      )}

      {/* 1. MACRO DISTRIBUTION AT THE TOP + 4 CORE AVERAGE METRICS */}
      <TopMacroOverview
        macroDistribution={nutritionAnalytics.macroDistribution}
        overview={nutritionAnalytics.overview}
        periodLabel={windowMode === '7d' ? 'Weekly avg' : '30-day avg'}
        isDark={isDark}
      />

      {/* 2. DEDICATED CHARTS: CALORIES | PROTEIN | CARBS & FAT COMBINED | FIBER */}
      <DedicatedMacroCharts
        chartSeries={nutritionAnalytics.chartSeries}
        overview={nutritionAnalytics.overview}
        isDark={isDark}
        onLogFood={() => openAddFoodModal({ date: todayKey })}
      />

      {/* 3. NUTRITIONIST & COACH PERFORMANCE SNAPSHOT (Meal Timing Split + Protein Density & Budget) */}
      <section
        aria-label="Meal timing and coaching metrics"
        className="grid grid-cols-1 lg:grid-cols-2 gap-4"
      >
        {/* Meal Calorie Distribution */}
        <div className="bg-white dark:bg-[#111317] border border-black/8 dark:border-white/10 rounded-2xl p-4 sm:p-5 space-y-3.5">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
              Meal Calorie Split
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Where your daily calories come from across meals
            </p>
          </div>

          {!mealSplit.hasData ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
              Log meals to see how your energy is spread between breakfast, lunch, snacks, and dinner.
            </p>
          ) : (
            <div className="space-y-2.5">
              {mealSplit.rows.map((row) => (
                <div key={row.id} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {row.label}
                    </span>
                    <span className="font-mono-nums text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {row.pct}%
                      </span>{' '}
                      · {row.avgPerDay.toLocaleString()} kcal/d
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-black/[0.06] dark:bg-white/[0.07] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#4E6800] dark:bg-[#C8FF00]"
                      style={{ width: `${Math.max(row.pct > 0 ? 4 : 0, row.pct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Nutritionist Quality & Calorie Budget Card */}
        <div className="bg-white dark:bg-[#111317] border border-black/8 dark:border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-4">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                {windowMode === '7d' ? 'Weekly' : '30-Day'} Coach Snapshot
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Budget adherence, protein density &amp; hydration
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('goals')}
              className="text-xs font-semibold text-[#4E6800] dark:text-[#C8FF00] hover:underline whitespace-nowrap"
            >
              Edit goals
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="border-t border-black/6 dark:border-white/8 pt-2.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Protein Density
              </div>
              <div className="mt-0.5 text-base font-bold font-mono-nums text-slate-900 dark:text-white">
                {coachMetrics.proteinPer1000Kcal !== null
                  ? `${coachMetrics.proteinPer1000Kcal} g`
                  : '—'}
              </div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500">
                per 1,000 kcal (ideal 65–90g)
              </div>
            </div>

            <div className="border-t border-black/6 dark:border-white/8 pt-2.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {windowMode === '7d' ? 'Weekly' : '30-Day'} Calorie Bank
              </div>
              <div
                className={`mt-0.5 text-base font-bold font-mono-nums ${
                  coachMetrics.periodBudget === 0
                    ? 'text-slate-900 dark:text-white'
                    : coachMetrics.periodRemaining >= 0
                    ? 'text-[#4E6800] dark:text-[#C8FF00]'
                    : 'text-red-500 dark:text-red-400'
                }`}
              >
                {coachMetrics.periodBudget > 0
                  ? `${coachMetrics.periodRemaining >= 0 ? '' : '-'}${Math.abs(
                      coachMetrics.periodRemaining
                    ).toLocaleString()} kcal`
                  : '—'}
              </div>
              <div className="text-[10px] font-mono-nums text-slate-400 dark:text-slate-500">
                {coachMetrics.periodBudget > 0
                  ? `${coachMetrics.periodConsumed.toLocaleString()} / ${coachMetrics.periodBudget.toLocaleString()} eaten`
                  : 'Set calorie goal'}
              </div>
            </div>

            <div className="border-t border-black/6 dark:border-white/8 pt-2.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Logging Rate
              </div>
              <div className="mt-0.5 text-base font-bold font-mono-nums text-slate-900 dark:text-white">
                {coachMetrics.loggedDays}/{coachMetrics.totalDays} days
              </div>
              <div className="text-[10px] font-mono-nums text-slate-400 dark:text-slate-500">
                {Math.round((coachMetrics.loggedDays / coachMetrics.totalDays) * 100)}% of period
              </div>
            </div>

            <div className="border-t border-black/6 dark:border-white/8 pt-2.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Avg Hydration
              </div>
              <div className="mt-0.5 text-base font-bold font-mono-nums text-slate-900 dark:text-white">
                {coachMetrics.avgWaterLiters ? `${coachMetrics.avgWaterLiters} L/d` : '—'}
              </div>
              <div className="text-[10px] font-mono-nums text-slate-400 dark:text-slate-500">
                Goal {(dailyWaterGoalMl / 1000).toFixed(1)} L/day
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
