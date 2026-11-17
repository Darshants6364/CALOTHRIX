import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
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
import { fetchWeeklyAiSummaryApi } from '../services/globalFoodApiService';
import { MEAL_CATEGORIES, WeeklySummaryResult } from '../types';
import {
  buildDeterministicWeeklySummary,
  evaluateAdaptiveCalorieAdjustment,
  getMultiWeekProgressSeries,
} from '../utils/analyticsUtils';
import {
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

export const ProgressPage: React.FC = () => {
  const { state, resolvedTheme, selectedDate, updateGoals } = useMacroLogStore();
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

  const { goals, foodEntries, weightEntries, profile, settings } = state;
  const unit = settings.weightUnit;
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

  // 4-Week Average Weight + Nutrition Trend (Module 3)
  const multiWeekSeries = useMemo(
    () => getMultiWeekProgressSeries(foodEntries, weightEntries, today, 4),
    [foodEntries, today, weightEntries]
  );

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

  // Weekly AI Summary (Module 4.3)
  const deterministicWeeklyFallback = useMemo(
    () =>
      buildDeterministicWeeklySummary({
        weekLabel,
        avgCalories: weeklySummary.avgCalories,
        targetCalories: goals.calories,
        avgProtein: weeklySummary.avgProtein,
        targetProtein: goals.protein,
        avgCarbs: weeklySummary.avgCarbs,
        avgFat: weeklySummary.avgFat,
        avgFibre: weeklySummary.avgFibre,
        targetFibre: goals.fibre,
        loggedDays: weeklySummary.count,
        weightEntries,
        weekDates,
        consistencyPct: Math.round((weeklySummary.count / 7) * 100),
      }),
    [
      goals.calories,
      goals.fibre,
      goals.protein,
      weekDates,
      weekLabel,
      weeklySummary,
      weightEntries,
    ]
  );

  const [aiWeeklySummary, setAiWeeklySummary] = useState<WeeklySummaryResult>(
    deterministicWeeklyFallback
  );
  const [aiLoading, setAiLoading] = useState(false);

  const refreshWeeklyAiSummary = async () => {
    setAiLoading(true);
    try {
      const sortedWeekWeights = sortWeightEntriesChronological(
        weightEntries.filter((w) => w.date >= weekDates[0] && w.date <= weekDates[6]),
        'asc'
      );
      const weightChangeKg =
        sortedWeekWeights.length >= 2
          ? round2(
              sortedWeekWeights[sortedWeekWeights.length - 1].weightKg -
                sortedWeekWeights[0].weightKg
            )
          : null;

      const remote = await fetchWeeklyAiSummaryApi({
        weekLabel,
        avgCalories: weeklySummary.avgCalories,
        targetCalories: goals.calories,
        avgProtein: weeklySummary.avgProtein,
        targetProtein: goals.protein,
        avgCarbs: weeklySummary.avgCarbs,
        avgFat: weeklySummary.avgFat,
        avgFibre: weeklySummary.avgFibre,
        targetFibre: goals.fibre,
        loggedDays: weeklySummary.count,
        weightChangeKg,
        consistencyPct: Math.round((weeklySummary.count / 7) * 100),
      });
      setAiWeeklySummary(remote ?? deterministicWeeklyFallback);
    } catch {
      setAiWeeklySummary(deterministicWeeklyFallback);
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    setAiWeeklySummary(deterministicWeeklyFallback);
  }, [deterministicWeeklyFallback]);

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
  };

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
            Target vs actual adherence, weekly weight trends, and smart insights
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
              {
                label: 'Calories',
                val: `${dailyTotals.calories} kcal`,
                sub: `Target ${goals.calories}`,
                pct: goals.calories > 0 ? Math.min(100, Math.round((dailyTotals.calories / goals.calories) * 100)) : 0,
              },
              {
                label: 'Protein',
                val: `${dailyTotals.protein} g`,
                sub: `Target ${goals.protein} g`,
                pct: goals.protein > 0 ? Math.min(100, Math.round((dailyTotals.protein / goals.protein) * 100)) : 0,
              },
              {
                label: 'Carbs',
                val: `${dailyTotals.carbs} g`,
                sub: `Target ${goals.carbs} g`,
                pct: goals.carbs > 0 ? Math.min(100, Math.round((dailyTotals.carbs / goals.carbs) * 100)) : 0,
              },
              {
                label: 'Fat',
                val: `${dailyTotals.fat} g`,
                sub: `Target ${goals.fat} g`,
                pct: goals.fat > 0 ? Math.min(100, Math.round((dailyTotals.fat / goals.fat) * 100)) : 0,
              },
              {
                label: 'Fibre',
                val: `${dailyTotals.fibre} g`,
                sub: `Target ${goals.fibre} g`,
                pct: goals.fibre > 0 ? Math.min(100, Math.round((dailyTotals.fibre / goals.fibre) * 100)) : 0,
              },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-4"
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
              {weekLabel}
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
                Target {goals.calories.toLocaleString()} · {weeklySummary.count} logged days
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

          {/* Weekly AI Progress Summary + Optional 2-4 Week Adaptive Adjustment */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Weekly AI Progress Summary (Module 4.3) */}
            <div className="lg:col-span-7 bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-lime-600 dark:text-lime-400" />
                    Weekly Progress Summary
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {aiWeeklySummary.provider === 'supabase_ai'
                      ? 'Generated via Supabase AI Edge Function'
                      : 'Deterministic analytics from your logged intake & weight'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void refreshWeeklyAiSummary()}
                  disabled={aiLoading}
                  className="min-h-[34px] px-3 rounded-xl border border-stone-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${aiLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {aiWeeklySummary.headline}
              </div>

              {aiWeeklySummary.highlights.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-lime-700 dark:text-lime-400 mb-1">
                    Highlights
                  </div>
                  <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    {aiWeeklySummary.highlights.map((item, idx) => (
                      <li key={idx}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {aiWeeklySummary.areasToImprove.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-1">
                    Areas to Improve
                  </div>
                  <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    {aiWeeklySummary.areasToImprove.map((item, idx) => (
                      <li key={idx}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {aiWeeklySummary.practicalSuggestions.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                    Practical Suggestions
                  </div>
                  <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    {aiWeeklySummary.practicalSuggestions.map((item, idx) => (
                      <li key={idx}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* 2–4 Week Optional Calorie Adjustment Advisor (Module 3) */}
            <div className="lg:col-span-5 bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 flex flex-col justify-between gap-4">
              <div className="space-y-2.5">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-lime-600 dark:text-lime-400" />
                  2–4 Week Adaptive Review
                </h3>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {adaptiveSuggestion.headline}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {adaptiveSuggestion.rationale}
                </p>

                {adaptiveSuggestion.hasSufficientData && adaptiveSuggestion.observedTdee && (
                  <div className="pt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-slate-900 border border-stone-200/70 dark:border-slate-800">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                        Observed Maintenance
                      </span>
                      <span className="font-mono-nums font-bold text-slate-900 dark:text-slate-100">
                        {adaptiveSuggestion.observedTdee.toLocaleString()} kcal
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-slate-900 border border-stone-200/70 dark:border-slate-800">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                        Avg Weight Trend
                      </span>
                      <span className="font-mono-nums font-bold text-slate-900 dark:text-slate-100">
                        {adaptiveSuggestion.avgWeeklyWeightChangeKg !== null
                          ? `${adaptiveSuggestion.avgWeeklyWeightChangeKg > 0 ? '+' : ''}${convertWeightToDisplay(
                              adaptiveSuggestion.avgWeeklyWeightChangeKg,
                              unit
                            )} ${unit}/wk`
                          : '—'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {adaptiveSuggestion.suggestedTargetCalories ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleApplyAdaptiveTarget}
                    className="w-full min-h-[42px] px-4 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-xs font-semibold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    Apply {adaptiveSuggestion.suggestedTargetCalories.toLocaleString()} kcal Target
                  </button>
                  <p className="text-[11px] text-slate-400 text-center">
                    Targets only change when you confirm.
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400">
                  Targets are never modified automatically without your confirmation.
                </p>
              )}
            </div>
          </div>

          {/* 4-Week Weekly Average Weight & Calorie Table */}
          <div className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                4-Week Progress Overview (Weekly Average Weight & Intake)
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Smooths daily weigh-in fluctuations
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {multiWeekSeries.map((wk) => (
                <div
                  key={wk.weekStart}
                  className="p-3.5 rounded-xl bg-stone-50/80 dark:bg-slate-900/80 border border-stone-200/70 dark:border-slate-800"
                >
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Wk of {wk.label}
                  </div>
                  <div className="mt-1 text-base font-bold font-mono-nums text-slate-900 dark:text-slate-100">
                    {wk.avgWeightKg !== null ? formatWeight(wk.avgWeightKg, unit) : 'No weigh-ins'}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400 tabular-nums">
                    {wk.loggedFoodDays > 0
                      ? `${wk.avgCalories.toLocaleString()} kcal/d · ${wk.avgProtein}g P`
                      : '0 food days'}
                  </div>
                </div>
              ))}
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
                    {goals.calories > 0 && (
                      <ReferenceLine
                        y={goals.calories}
                        stroke="#84cc16"
                        strokeDasharray="4 4"
                        label={{ value: 'Goal', position: 'right', fontSize: 11, fill: '#84cc16' }}
                      />
                    )}
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
                    {goals.protein > 0 && (
                      <ReferenceLine y={goals.protein} stroke="#22c55e" strokeDasharray="4 4" />
                    )}
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
                  {goals.calories > 0 && (
                    <ReferenceLine y={goals.calories} stroke="#84cc16" strokeDasharray="4 4" />
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
