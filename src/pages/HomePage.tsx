import React, { useMemo } from 'react';
import { ArrowRight, Plus, Scale, TrendingDown, TrendingUp } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts';
import { CalorieRing } from '../components/CalorieRing';
import { DateStrip } from '../components/DateStrip';
import { MacroCard } from '../components/MacroCard';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { MEAL_CATEGORIES } from '../types';
import { formatReadableDate, formatShortDate, getTimeOfDayGreeting } from '../utils/dateUtils';
import {
  convertWeightToDisplay,
  formatWeight,
  getMacroCalorieSplit,
  getMealBreakdown,
  round2,
  sortWeightEntriesChronological,
} from '../utils/nutritionUtils';

export const HomePage: React.FC = () => {
  const {
    state,
    resolvedTheme,
    selectedDate,
    setSelectedDate,
    selectedDateEntries,
    selectedDateTotals,
    latestWeightEntry,
    previousWeightEntry,
    openAddFoodModal,
    openWeightModal,
    setActiveTab,
  } = useMacroLogStore();

  const isDark = resolvedTheme === 'dark';

  const { goals, settings, profile, weightGoal } = state;
  const greeting = getTimeOfDayGreeting();
  const firstName = profile.name.split(' ')[0] || 'there';

  const macroSplit = useMemo(
    () => getMacroCalorieSplit(selectedDateTotals),
    [selectedDateTotals]
  );

  const mealBreakdown = useMemo(
    () => getMealBreakdown(selectedDateEntries),
    [selectedDateEntries]
  );

  // Mini weight trend data (last 10 recorded measurements)
  const weightTrendData = useMemo(() => {
    const sorted = sortWeightEntriesChronological(state.weightEntries, 'asc').slice(-10);
    return sorted.map((w) => ({
      date: formatShortDate(w.date),
      weight: convertWeightToDisplay(w.weightKg, settings.weightUnit),
    }));
  }, [settings.weightUnit, state.weightEntries]);

  const currentWeightKg = latestWeightEntry?.weightKg ?? profile.currentWeightKg;
  const prevDiffKg =
    latestWeightEntry && previousWeightEntry
      ? round2(latestWeightEntry.weightKg - previousWeightEntry.weightKg)
      : null;

  return (
    <div className="space-y-6">
      {/* Top Greeting & Primary Action */}
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>{formatReadableDate(selectedDate)}</span>
            {state.isDemoData && (
              <>
                <span aria-hidden="true">·</span>
                <span>Demo dataset active</span>
              </>
            )}
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            {greeting}, {firstName}
          </h1>
        </div>

        <button
          type="button"
          onClick={() => openAddFoodModal({ date: selectedDate })}
          className="min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-sm font-semibold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Food
        </button>
      </section>

      {/* Date Strip */}
      <DateStrip selectedDate={selectedDate} onSelectDate={setSelectedDate} />

      {/* Main Focal Section: Calorie Ring + Daily Nutrition Summary */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-7 bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-7 flex flex-col justify-center">
          <div className="flex items-center justify-between gap-2 mb-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Daily Calorie Balance
            </h2>
            <button
              type="button"
              onClick={() => setActiveTab('goals')}
              className="text-xs font-medium text-lime-700 dark:text-lime-400 hover:underline whitespace-nowrap"
            >
              Adjust targets
            </button>
          </div>
          <CalorieRing consumed={selectedDateTotals.calories} goal={goals.calories} />
        </div>

        {/* Daily Nutrition Summary + Macro Split */}
        <div className="lg:col-span-5 bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 flex flex-col justify-between gap-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Daily Nutrition Summary
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {selectedDateEntries.length} {selectedDateEntries.length === 1 ? 'item' : 'items'}
              </span>
            </div>

            {/* Macro calorie distribution bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
                <span>Calorie distribution</span>
                <span className="tabular-nums">
                  {selectedDateTotals.calories > 0
                    ? `${macroSplit.proteinPct}% P · ${macroSplit.carbsPct}% C · ${macroSplit.fatPct}% F`
                    : 'No intake logged'}
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-stone-100 dark:bg-slate-800 overflow-hidden flex">
                {selectedDateTotals.calories > 0 && (
                  <>
                    <div
                      className="bg-lime-500 dark:bg-lime-400 h-full transition-all duration-300"
                      style={{ width: `${macroSplit.proteinPct}%` }}
                      title={`Protein: ${macroSplit.proteinPct}%`}
                    />
                    <div
                      className="bg-amber-500 dark:bg-amber-400 h-full transition-all duration-300"
                      style={{ width: `${macroSplit.carbsPct}%` }}
                      title={`Carbs: ${macroSplit.carbsPct}%`}
                    />
                    <div
                      className="bg-indigo-500 dark:bg-indigo-400 h-full transition-all duration-300"
                      style={{ width: `${macroSplit.fatPct}%` }}
                      title={`Fat: ${macroSplit.fatPct}%`}
                    />
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Meal calorie summary list */}
          <div className="divide-y divide-stone-100 dark:divide-slate-800/80">
            {MEAL_CATEGORIES.slice(0, 4).map((meal) => {
              const data = mealBreakdown[meal.id];
              return (
                <div
                  key={meal.id}
                  className="py-2.5 flex items-center justify-between gap-3 text-sm"
                >
                  <button
                    type="button"
                    onClick={() => openAddFoodModal({ meal: meal.id, date: selectedDate })}
                    className="text-left font-medium text-slate-700 dark:text-slate-200 hover:text-lime-700 dark:hover:text-lime-400 transition-colors"
                  >
                    {meal.label}
                  </button>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 tabular-nums">
                      {data.items.length} {data.items.length === 1 ? 'item' : 'items'}
                    </span>
                    <span className="font-mono-nums font-semibold text-slate-900 dark:text-slate-100 min-w-[68px] text-right">
                      {data.totals.calories} kcal
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('food-log')}
            className="w-full min-h-[40px] px-4 rounded-xl border border-stone-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center justify-center gap-1.5"
          >
            Open Full Food Log
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </section>

      {/* Four Macro Cards */}
      <section aria-label="Macronutrient progress">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
          <MacroCard
            name="Protein"
            consumed={selectedDateTotals.protein}
            target={goals.protein}
            tone="protein"
          />
          <MacroCard
            name="Carbs"
            consumed={selectedDateTotals.carbs}
            target={goals.carbs}
            tone="carbs"
          />
          <MacroCard
            name="Fat"
            consumed={selectedDateTotals.fat}
            target={goals.fat}
            tone="fat"
          />
          <MacroCard
            name="Fibre"
            consumed={selectedDateTotals.fibre}
            target={goals.fibre}
            tone="fibre"
          />
        </div>
      </section>

      {/* Compact Weight Progress Card (Independent from Calorie Tracking) */}
      <section className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-stone-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Weight Progress
                </h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('weight')}
                  className="text-xs font-medium text-lime-700 dark:text-lime-400 hover:underline"
                >
                  Details
                </button>
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                <span className="text-xl font-bold font-mono-nums text-slate-900 dark:text-slate-50">
                  {formatWeight(currentWeightKg, settings.weightUnit)}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  Target: {formatWeight(weightGoal.targetWeightKg, settings.weightUnit)}
                </span>
                {prevDiffKg !== null && (
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-medium tabular-nums ${
                      prevDiffKg <= 0
                        ? 'text-lime-700 dark:text-lime-400'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {prevDiffKg <= 0 ? (
                      <TrendingDown className="w-3.5 h-3.5" />
                    ) : (
                      <TrendingUp className="w-3.5 h-3.5" />
                    )}
                    {prevDiffKg > 0 ? '+' : ''}
                    {convertWeightToDisplay(prevDiffKg, settings.weightUnit)} {settings.weightUnit}{' '}
                    vs previous
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {weightTrendData.length >= 2 && (
              <div className="w-36 h-12 hidden sm:block">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weightTrendData}>
                    <defs>
                      <linearGradient id="miniWeightGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#84cc16" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#84cc16" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Tooltip
                      contentStyle={{
                        fontSize: '11px',
                        borderRadius: '8px',
                        backgroundColor: isDark ? '#0f172a' : '#ffffff',
                        border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                        color: isDark ? '#f8fafc' : '#0f172a',
                      }}
                      formatter={(value) => [`${value} ${settings.weightUnit}`, 'Weight']}
                    />
                    <Area
                      type="monotone"
                      dataKey="weight"
                      stroke="#65a30d"
                      strokeWidth={2}
                      fill="url(#miniWeightGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            <button
              type="button"
              onClick={() => openWeightModal()}
              className="min-h-[42px] px-4 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800/80 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-stone-100 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Log Weight
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
