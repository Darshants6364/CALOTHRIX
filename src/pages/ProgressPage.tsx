import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
  formatReadableDate,
  formatShortDate,
  formatWeekdayShort,
  getCalendarMonthDates,
  getMondayToSundayWeek,
  getTodayDateKey,
} from '../utils/dateUtils';
import {
  getDailyGoalCompletionScore,
  getEntriesForDate,
  getMealBreakdown,
  isCalorieGoalAchieved,
  round1,
  roundCal,
  sumMacros,
} from '../utils/nutritionUtils';

type ProgressTab = 'daily' | 'weekly' | 'monthly';

export const ProgressPage: React.FC = () => {
  const { state, resolvedTheme, selectedDate } = useMacroLogStore();
  const isDark = resolvedTheme === 'dark';
  const gridStroke = isDark ? '#1e293b' : '#e7e5e4';
  const tickColor = isDark ? '#94a3b8' : '#64748b';
  const tooltipStyle = {
    backgroundColor: isDark ? '#0f172a' : '#ffffff',
    borderColor: isDark ? '#334155' : '#e7e5e4',
    color: isDark ? '#f8fafc' : '#0f172a',
    borderRadius: '10px',
    fontSize: '12px',
  };
  const [tab, setTab] = useState<ProgressTab>('weekly');
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);

  const { goals, foodEntries } = state;
  const today = getTodayDateKey();

  // DAILY ANALYTICS (using selectedDate)
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

  // WEEKLY ANALYTICS (Mon-Sun week based on today + weekOffset)
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
    const avgFibre =
      count > 0 ? round1(logged.reduce((s, r) => s + r.fibre, 0) / count) : 0;
    const achievedDays = logged.filter((r) => r.achieved).length;
    return { count, avgCalories, avgProtein, avgFibre, achievedDays };
  }, [weeklyRows]);

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
    // Only count days up to today if viewing current month for consistency denominator
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
      count > 0
        ? Math.round(logged.reduce((s, r) => s + r.score, 0) / count)
        : 0;
    const bestDay =
      logged.length > 0
        ? [...logged].sort((a, b) => b.score - a.score)[0]
        : null;
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
    <div className="space-y-6">
      {/* Header + Segmented Tabs */}
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Analytics from your logged entries
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Nutrition Progress
          </h1>
        </div>

        <div className="inline-flex items-center p-1 rounded-xl bg-stone-200/70 dark:bg-slate-800/90 self-start sm:self-auto">
          {(['daily', 'weekly', 'monthly'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`min-h-[38px] px-4 rounded-lg text-xs font-semibold capitalize transition-colors whitespace-nowrap ${
                tab === t
                  ? 'bg-white dark:bg-[#121821] text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      {/* DAILY VIEW */}
      {tab === 'daily' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {formatReadableDate(selectedDate)}
            </h2>
            <span className="text-xs font-medium text-lime-700 dark:text-lime-400 tabular-nums">
              Goal completion: {dailyScore}%
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Calories', val: `${dailyTotals.calories} kcal`, sub: `Target ${goals.calories}` },
              { label: 'Protein', val: `${dailyTotals.protein} g`, sub: `Target ${goals.protein} g` },
              { label: 'Carbs', val: `${dailyTotals.carbs} g`, sub: `Target ${goals.carbs} g` },
              { label: 'Fat', val: `${dailyTotals.fat} g`, sub: `Target ${goals.fat} g` },
              { label: 'Fibre', val: `${dailyTotals.fibre} g`, sub: `Target ${goals.fibre} g` },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-4"
              >
                <div className="text-xs text-slate-500 dark:text-slate-400">{kpi.label}</div>
                <div className="mt-1 text-lg font-bold font-mono-nums text-slate-900 dark:text-slate-50">
                  {kpi.val}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400 tabular-nums">{kpi.sub}</div>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
              Meal-wise Calorie Breakdown
            </h3>
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
                    <Bar dataKey="calories" name="Calories (kcal)" fill="#84cc16" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {/* WEEKLY VIEW */}
      {tab === 'weekly' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {formatShortDate(weekDates[0])} – {formatShortDate(weekDates[6])}
            </h2>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setWeekOffset((w) => w - 1)}
                aria-label="Previous week"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-[#121821] text-slate-600 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-800"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {weekOffset !== 0 && (
                <button
                  type="button"
                  onClick={() => setWeekOffset(0)}
                  className="min-h-[38px] px-3 rounded-xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-[#121821] text-xs font-medium text-slate-700 dark:text-slate-200"
                >
                  This Week
                </button>
              )}
              <button
                type="button"
                onClick={() => setWeekOffset((w) => Math.min(0, w + 1))}
                disabled={weekOffset === 0}
                aria-label="Next week"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-[#121821] text-slate-600 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-800 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Avg Daily Calories</div>
              <div className="mt-1 text-xl font-bold font-mono-nums text-slate-900 dark:text-slate-50">
                {weeklySummary.avgCalories.toLocaleString()} kcal
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                Across {weeklySummary.count} logged days
              </div>
            </div>
            <div className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Avg Daily Protein</div>
              <div className="mt-1 text-xl font-bold font-mono-nums text-lime-700 dark:text-lime-400">
                {weeklySummary.avgProtein} g
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">Target {goals.protein} g</div>
            </div>
            <div className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Avg Fibre Intake</div>
              <div className="mt-1 text-xl font-bold font-mono-nums text-teal-700 dark:text-teal-400">
                {weeklySummary.avgFibre} g
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">Target {goals.fibre} g</div>
            </div>
            <div className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Days Goal Achieved</div>
              <div className="mt-1 text-xl font-bold font-mono-nums text-slate-900 dark:text-slate-50">
                {weeklySummary.achievedDays} / 7
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">Within ±10% of target</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
                7-Day Calorie Intake
              </h3>
              <div className="h-64 w-full">
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
                    <ReferenceLine
                      y={goals.calories}
                      stroke="#84cc16"
                      strokeDasharray="4 4"
                      label={{ value: 'Goal', position: 'right', fontSize: 11, fill: '#84cc16' }}
                    />
                    <Bar dataKey="calories" fill="#84cc16" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
                Daily Protein Intake (g)
              </h3>
              <div className="h-64 w-full">
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
                    <ReferenceLine y={goals.protein} stroke="#22c55e" strokeDasharray="4 4" />
                    <Bar dataKey="protein" fill="#22c55e" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
                Carbohydrate & Fat Trends (g)
              </h3>
              <div className="h-64 w-full">
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

            <div className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
                Fibre Intake (g)
              </h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weeklyRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: tickColor }} stroke={gridStroke} />
                    <YAxis tick={{ fontSize: 12, fill: tickColor }} stroke={gridStroke} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(val) => [`${val} g`, 'Fibre']} />
                    <ReferenceLine y={goals.fibre} stroke="#14b8a6" strokeDasharray="4 4" />
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
          </div>
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
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-[#121821] text-slate-600 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-800"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {monthOffset !== 0 && (
                <button
                  type="button"
                  onClick={() => setMonthOffset(0)}
                  className="min-h-[38px] px-3 rounded-xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-[#121821] text-xs font-medium text-slate-700 dark:text-slate-200"
                >
                  This Month
                </button>
              )}
              <button
                type="button"
                onClick={() => setMonthOffset((m) => Math.min(0, m + 1))}
                disabled={monthOffset === 0}
                aria-label="Next month"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-[#121821] text-slate-600 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-800 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Goal Completion</div>
              <div className="mt-1 text-xl font-bold font-mono-nums text-lime-700 dark:text-lime-400">
                {monthlySummary.goalCompletionPct}%
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                Avg daily score ({monthlySummary.count} days)
              </div>
            </div>
            <div className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Consistency Score</div>
              <div className="mt-1 text-xl font-bold font-mono-nums text-slate-900 dark:text-slate-50">
                {monthlySummary.consistencyScore}%
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                {monthlySummary.count} of {monthlySummary.elapsedDays} days logged
              </div>
            </div>
            <div className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Avg Macro Intake</div>
              <div className="mt-1 text-sm font-bold font-mono-nums text-slate-900 dark:text-slate-50">
                P {monthlySummary.avgProtein}g · C {monthlySummary.avgCarbs}g
              </div>
              <div className="mt-1 text-xs font-mono-nums text-slate-500 dark:text-slate-400">
                F {monthlySummary.avgFat}g · Fibre {monthlySummary.avgFibre}g
              </div>
            </div>
            <div className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-4">
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

          <div className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Monthly Calorie Trend
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                Avg {monthlySummary.avgCalories.toLocaleString()} kcal / day
              </span>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyRows}>
                  <defs>
                    <linearGradient id="monthlyCalGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#84cc16" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#84cc16" stopOpacity={0} />
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
                  <ReferenceLine y={goals.calories} stroke="#84cc16" strokeDasharray="4 4" />
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
