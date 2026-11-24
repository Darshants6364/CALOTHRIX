import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Barcode,
  Calculator,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Copy,
  Droplets,
  Flame,
  Mic,
  Minus,
  Pencil,
  Plus,
  Scale,
  Search,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Trophy,
  X,
} from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts';
import { CalorieRing } from '../components/CalorieRing';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DailyQuestArena } from '../components/DailyQuestArena';
import { DateStrip } from '../components/DateStrip';
import { SmartCalorieTrackerPanel } from '../components/SmartCalorieTrackerPanel';
import { WeeklyAssessmentBanner } from '../components/WeeklyAssessmentBanner';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import { FoodLogEntry, MEAL_CATEGORIES, MealCategory } from '../types';
import { getSmartFoodRecommendations } from '../utils/analyticsUtils';
import {
  addDaysToDateKey,
  formatReadableDate,
  formatShortDate,
  getTimeOfDayGreeting,
  getTodayDateKey,
} from '../utils/dateUtils';
import {
  convertWeightToDisplay,
  formatFoodQuantity,
  formatWeight,
  getEntriesForDate,
  getMealBreakdown,
  round1,
  sortWeightEntriesChronological,
} from '../utils/nutritionUtils';

const HOME_MEALS: MealCategory[] = ['breakfast', 'lunch', 'evening_snacks', 'dinner'];

export const HomePage: React.FC = () => {
  const {
    state,
    allFoods,
    authDetails,
    resolvedTheme,
    selectedDate,
    setSelectedDate,
    selectedDateEntries,
    selectedDateTotals,
    latestWeightEntry,
    previousWeightEntry,
    openAddFoodModal,
    openEditFoodModal,
    deleteFoodEntry,
    openMealScannerModal,
    openBarcodeScannerModal,
    openWeightModal,
    setActiveTab,
    pendingInvitations,
    pendingRecommendations,
    approveTargetRecommendation,
    declineTargetRecommendation,
    waterIntakeMlByDate,
    dailyWaterGoalMl,
    addWaterMl,
    setDailyWaterGoalMl,
    copyMealFromPreviousDay,
    showQuestsOnHome,
    setShowQuestsOnHome,
    notify,
  } = useMacroLogStore();

  const [calculatorModalOpen, setCalculatorModalOpen] = useState(false);
  const [pendingDeleteEntry, setPendingDeleteEntry] = useState<FoodLogEntry | null>(null);
  const [editingWaterGoal, setEditingWaterGoal] = useState(false);

  const calculatorDialogRef = useRef<HTMLDivElement | null>(null);
  useModalFocusTrap(calculatorDialogRef, calculatorModalOpen, () =>
    setCalculatorModalOpen(false)
  );

  const isDark = resolvedTheme === 'dark';
  const todayKey = getTodayDateKey();
  const yesterdayKey = useMemo(() => addDaysToDateKey(selectedDate, -1), [selectedDate]);
  const { goals, settings, profile, weightGoal } = state;

  const greeting = getTimeOfDayGreeting();
  const firstName = (authDetails?.name || profile.name || 'there').split(' ')[0];

  const mealBreakdown = useMemo(
    () => getMealBreakdown(selectedDateEntries),
    [selectedDateEntries]
  );

  const yesterdayMealBreakdown = useMemo(
    () => getMealBreakdown(getEntriesForDate(state.foodEntries, yesterdayKey)),
    [state.foodEntries, yesterdayKey]
  );

  // Real logging streak computed from actual entries
  const loggingStreak = useMemo(() => {
    const loggedDates = new Set(state.foodEntries.map((e) => e.date));
    let streak = 0;
    let cursor = loggedDates.has(todayKey) ? todayKey : addDaysToDateKey(todayKey, -1);
    while (loggedDates.has(cursor) && streak < 365) {
      streak += 1;
      cursor = addDaysToDateKey(cursor, -1);
    }
    return streak;
  }, [state.foodEntries, todayKey]);

  // Weight mini sparkline (last 10 real entries)
  const weightTrendData = useMemo(() => {
    const sorted = sortWeightEntriesChronological(state.weightEntries).slice(-10);
    return sorted.map((w) => ({
      dateLabel: formatShortDate(w.date),
      weight: convertWeightToDisplay(w.weightKg, settings.weightUnit),
    }));
  }, [settings.weightUnit, state.weightEntries]);

  const weightDeltaKg =
    latestWeightEntry && previousWeightEntry
      ? round1(latestWeightEntry.weightKg - previousWeightEntry.weightKg)
      : null;

  // Water metrics for selected date
  const waterTodayMl = waterIntakeMlByDate[selectedDate] || 0;
  const waterPct =
    dailyWaterGoalMl > 0 ? Math.min(100, Math.round((waterTodayMl / dailyWaterGoalMl) * 100)) : 0;

  // Calorie & macro calculations
  const hasGoal = goals.calories > 0;
  const remainingCalories = goals.calories - selectedDateTotals.calories;
  const macroItems = [
    {
      label: 'Protein',
      consumed: round1(selectedDateTotals.protein),
      target: goals.protein,
      barClass: 'bg-[#4E6800] dark:bg-[#C8FF00]',
      textClass: 'text-[#4E6800] dark:text-[#C8FF00]',
    },
    {
      label: 'Carbs',
      consumed: round1(selectedDateTotals.carbs),
      target: goals.carbs,
      barClass: 'bg-amber-500',
      textClass: 'text-amber-700 dark:text-amber-400',
    },
    {
      label: 'Fat',
      consumed: round1(selectedDateTotals.fat),
      target: goals.fat,
      barClass: 'bg-indigo-500',
      textClass: 'text-indigo-700 dark:text-indigo-400',
    },
    {
      label: 'Fibre',
      consumed: round1(selectedDateTotals.fibre),
      target: goals.fibre,
      barClass: 'bg-teal-500',
      textClass: 'text-teal-700 dark:text-teal-400',
    },
  ];

  // Actionable daily insight built strictly from real numbers
  const dailyInsight = useMemo(() => {
    if (!hasGoal) {
      return {
        title: 'Set your daily calorie target',
        detail:
          'Use the Smart Calorie Calculator to calculate a personalized calorie, macro, and hydration plan based on your stats.',
        actionLabel: 'Open Calculator',
        onAction: () => setCalculatorModalOpen(true),
      };
    }
    if (selectedDateEntries.length === 0) {
      return {
        title: 'Ready to log your first meal',
        detail: `You have ${goals.calories.toLocaleString()} kcal and ${goals.protein}g protein budgeted for ${formatReadableDate(selectedDate)}.`,
        actionLabel: 'Add Food',
        onAction: () => openAddFoodModal({ date: selectedDate }),
      };
    }
    const proteinRemaining = Math.max(0, round1(goals.protein - selectedDateTotals.protein));
    const fibreRemaining = Math.max(0, round1(goals.fibre - selectedDateTotals.fibre));
    if (remainingCalories < -150) {
      return {
        title: `${Math.abs(Math.round(remainingCalories))} kcal above daily target`,
        detail:
          'One higher-calorie day will not derail your progress. Check your weekly average in Progress to stay balanced.',
        actionLabel: 'View Progress',
        onAction: () => setActiveTab('progress'),
      };
    }
    if (proteinRemaining >= 25 && remainingCalories >= 150) {
      return {
        title: `${Math.round(proteinRemaining)}g protein left for today`,
        detail: `Prioritize lean protein options like paneer, eggs, dal, curd, or chicken within your ${Math.round(remainingCalories)} kcal remaining.`,
        actionLabel: 'Log High-Protein Food',
        onAction: () => openAddFoodModal({ date: selectedDate }),
      };
    }
    if (fibreRemaining >= 8 && remainingCalories >= 100) {
      return {
        title: `Add ${Math.round(fibreRemaining)}g more fibre today`,
        detail: 'Vegetables, dal, oats, fruits, or whole-wheat roti will help hit your fibre target and improve satiety.',
        actionLabel: 'Add Food',
        onAction: () => openAddFoodModal({ date: selectedDate }),
      };
    }
    return {
      title: 'On track with today’s nutrition plan',
      detail: `${Math.round(selectedDateTotals.calories).toLocaleString()} / ${goals.calories.toLocaleString()} kcal logged with ${round1(selectedDateTotals.protein)}g protein so far.`,
      actionLabel: 'View Analytics',
      onAction: () => setActiveTab('progress'),
    };
  }, [
    goals.calories,
    goals.fibre,
    goals.protein,
    hasGoal,
    openAddFoodModal,
    remainingCalories,
    selectedDate,
    selectedDateEntries.length,
    selectedDateTotals.calories,
    selectedDateTotals.fibre,
    selectedDateTotals.protein,
    setActiveTab,
  ]);

  const smartRecommendations = useMemo(() => {
    if (!hasGoal || remainingCalories < 120) return [];
    return getSmartFoodRecommendations({
      foods: allFoods,
      goals,
      consumedToday: selectedDateTotals,
      dietaryPreference: profile.dietaryPreference || 'omnivore',
      foodRestrictions: profile.foodRestrictions || [],
      limit: 3,
    });
  }, [
    allFoods,
    goals,
    hasGoal,
    profile.dietaryPreference,
    profile.foodRestrictions,
    remainingCalories,
    selectedDateTotals,
  ]);

  return (
    <div className="space-y-5">
      {/* Compact Header + Smart Calorie Calculator Trigger */}
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>{formatReadableDate(selectedDate)}</span>
            {loggingStreak > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 font-semibold text-[#4E6800] dark:text-[#C8FF00]">
                  <Flame className="w-3.5 h-3.5" />
                  {loggingStreak}-day streak
                </span>
              </>
            )}
          </div>
          <h1 className="mt-0.5 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 truncate">
            {greeting}, {firstName}
          </h1>
        </div>

        <button
          type="button"
          onClick={() => setCalculatorModalOpen(true)}
          className="min-h-[44px] px-4 rounded-xl border border-[#4E6800]/30 dark:border-[#C8FF00]/35 bg-[#C8FF00]/15 dark:bg-[#C8FF00]/10 text-[#3B5000] dark:text-[#C8FF00] text-xs sm:text-sm font-bold hover:bg-[#C8FF00]/25 transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap self-start sm:self-auto"
        >
          <Calculator className="w-4 h-4 shrink-0" />
          <span>Smart Calorie Calculator</span>
        </button>
      </section>

      {/* Date Navigation */}
      <DateStrip selectedDate={selectedDate} onSelectDate={setSelectedDate} />

      {/* Contextual Adaptive Assessment & Coaching Alerts (only when active) */}
      <WeeklyAssessmentBanner />

      {(pendingRecommendations.length > 0 || pendingInvitations.length > 0) && (
        <section className="space-y-2.5">
          {pendingRecommendations.map((rec) => (
            <div
              key={rec.id}
              className="rounded-2xl border border-[#4E6800]/30 dark:border-[#C8FF00]/30 bg-white dark:bg-[#111317] p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[#4E6800] dark:text-[#C8FF00] inline-flex items-center gap-1.5">
                  <ClipboardCheck className="w-3.5 h-3.5" />
                  Coach Target Update
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100 font-mono-nums">
                  {rec.recommendedCalories} kcal · P {rec.recommendedProtein}g · C {rec.recommendedCarbs}g · F {rec.recommendedFat}g
                </p>
                {rec.rationale && (
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{rec.rationale}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void approveTargetRecommendation(rec)}
                  className="min-h-[40px] px-3.5 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Apply
                </button>
                <button
                  type="button"
                  onClick={() => void declineTargetRecommendation(rec.id)}
                  className="min-h-[40px] px-3 rounded-xl border border-black/10 dark:border-white/15 text-xs font-semibold text-slate-600 dark:text-slate-300"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* 1. TODAY'S CALORIE TARGET, CONSUMED & REMAINING + 2. MACRO PROGRESS */}
      <section className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          {/* Calorie Ring */}
          <div className="flex flex-col items-center justify-center shrink-0">
            <CalorieRing
              consumed={selectedDateTotals.calories}
              goal={goals.calories}
            />
          </div>

          {/* Right Column: Target / Consumed / Remaining + Protein, Carbs, Fat, Fibre */}
          <div className="flex-1 min-w-0 space-y-5">
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
              <div className="rounded-xl bg-[#F4F3EF]/80 dark:bg-[#090A0C] border border-black/8 dark:border-white/10 p-3">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Target
                </div>
                <div className="mt-0.5 text-base sm:text-lg font-bold font-mono-nums text-slate-900 dark:text-white">
                  {hasGoal ? goals.calories.toLocaleString() : '—'}
                </div>
                <div className="text-[10px] text-slate-400">kcal</div>
              </div>

              <div className="rounded-xl bg-[#F4F3EF]/80 dark:bg-[#090A0C] border border-black/8 dark:border-white/10 p-3">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Consumed
                </div>
                <div className="mt-0.5 text-base sm:text-lg font-bold font-mono-nums text-slate-900 dark:text-white">
                  {Math.round(selectedDateTotals.calories).toLocaleString()}
                </div>
                <div className="text-[10px] text-slate-400">kcal</div>
              </div>

              <div className="rounded-xl bg-[#F4F3EF]/80 dark:bg-[#090A0C] border border-black/8 dark:border-white/10 p-3">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {remainingCalories >= 0 ? 'Remaining' : 'Over'}
                </div>
                <div
                  className={`mt-0.5 text-base sm:text-lg font-bold font-mono-nums ${
                    !hasGoal
                      ? 'text-slate-400'
                      : remainingCalories >= 0
                      ? 'text-[#4E6800] dark:text-[#C8FF00]'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {hasGoal ? Math.abs(Math.round(remainingCalories)).toLocaleString() : '—'}
                </div>
                <div className="text-[10px] text-slate-400">kcal</div>
              </div>
            </div>

            {/* 2. Protein, Carbs, Fat (+ Fibre) Progress Bars */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {macroItems.map((macro) => {
                const pct =
                  macro.target > 0 ? Math.min(100, Math.round((macro.consumed / macro.target) * 100)) : 0;
                return (
                  <div key={macro.label} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                        {macro.label}
                      </span>
                      <span className={`text-xs font-bold font-mono-nums ${macro.textClass}`}>
                        {macro.consumed}g
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-black/8 dark:bg-white/10 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${macro.barClass}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono-nums">
                      <span>{macro.target > 0 ? `${pct}%` : 'No target'}</span>
                      <span>/ {macro.target}g</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* 3. QUICK ACTIONS TO ADD FOOD (One-handed mobile friendly) */}
      <section aria-label="Quick add food">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <button
            type="button"
            onClick={() => openAddFoodModal({ date: selectedDate })}
            className="min-h-[54px] px-3.5 py-2.5 rounded-2xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black font-bold text-sm hover:opacity-95 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
          >
            <Search className="w-4 h-4 shrink-0" />
            <span>Search Food</span>
          </button>

          <button
            type="button"
            onClick={() => openMealScannerModal({ mode: 'photo', date: selectedDate })}
            className="min-h-[54px] px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 text-slate-900 dark:text-slate-100 font-semibold text-sm hover:border-[#4E6800] dark:hover:border-[#C8FF00] active:scale-[0.99] transition-all flex items-center justify-center gap-2"
          >
            <Camera className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00] shrink-0" />
            <span>Photo Scan</span>
          </button>

          <button
            type="button"
            onClick={() => openMealScannerModal({ mode: 'voice', date: selectedDate })}
            className="min-h-[54px] px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 text-slate-900 dark:text-slate-100 font-semibold text-sm hover:border-[#4E6800] dark:hover:border-[#C8FF00] active:scale-[0.99] transition-all flex items-center justify-center gap-2"
          >
            <Mic className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00] shrink-0" />
            <span>Voice Log</span>
          </button>

          <button
            type="button"
            onClick={() => openBarcodeScannerModal({ date: selectedDate })}
            className="min-h-[54px] px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 text-slate-900 dark:text-slate-100 font-semibold text-sm hover:border-[#4E6800] dark:hover:border-[#C8FF00] active:scale-[0.99] transition-all flex items-center justify-center gap-2"
          >
            <Barcode className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00] shrink-0" />
            <span>Barcode</span>
          </button>
        </div>
      </section>

      {/* 4. TODAY'S MEALS WITH EASY EDITING & DELETION */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
            Today&apos;s Meals
          </h2>
          <button
            type="button"
            onClick={() => setActiveTab('food-log')}
            className="min-h-[36px] px-2 text-xs font-semibold text-[#4E6800] dark:text-[#C8FF00] inline-flex items-center gap-1 hover:underline"
          >
            <span>Open full log</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {HOME_MEALS.map((mealId) => {
            const mealMeta = MEAL_CATEGORIES.find((m) => m.id === mealId)!;
            const { items, totals } = mealBreakdown[mealId];
            const yesterdayCount = yesterdayMealBreakdown[mealId].items.length;

            return (
              <div
                key={mealId}
                className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl overflow-hidden flex flex-col"
              >
                <div className="px-4 py-3 border-b border-black/8 dark:border-white/10 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {mealMeta.label}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-nums">
                      {totals.calories} kcal · P {totals.protein}g · C {totals.carbs}g · F {totals.fat}g
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openAddFoodModal({ meal: mealId, date: selectedDate })}
                    aria-label={`Add food to ${mealMeta.label}`}
                    className="min-h-[40px] min-w-[40px] px-3 rounded-xl bg-[#F4F3EF] dark:bg-[#181B22] text-slate-800 dark:text-slate-100 text-xs font-bold hover:border-[#C8FF00] border border-black/8 dark:border-white/12 inline-flex items-center justify-center gap-1 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>

                {items.length === 0 ? (
                  <div className="px-4 py-3.5 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>No items logged</span>
                    {yesterdayCount > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const count = copyMealFromPreviousDay(mealId, selectedDate);
                          if (count === 0) notify('No items to copy from yesterday', 'info');
                        }}
                        className="min-h-[34px] px-2.5 rounded-lg border border-black/10 dark:border-white/12 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        Copy yesterday
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-black/6 dark:divide-white/8">
                    {items.map((entry) => (
                      <div
                        key={entry.id}
                        className="px-4 py-2.5 flex items-center justify-between gap-2 hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                      >
                        <button
                          type="button"
                          onClick={() => openEditFoodModal(entry)}
                          className="min-w-0 flex-1 text-left py-1"
                        >
                          <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                            {entry.foodName}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono-nums">
                            {formatFoodQuantity(entry.quantityGrams, settings.foodUnit)} · P {entry.protein}g · C {entry.carbs}g · F {entry.fat}g
                          </div>
                        </button>

                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-xs font-bold font-mono-nums text-slate-900 dark:text-slate-100 mr-1">
                            {entry.calories} kcal
                          </span>
                          <button
                            type="button"
                            onClick={() => openEditFoodModal(entry)}
                            aria-label={`Edit ${entry.foodName}`}
                            className="min-h-[40px] min-w-[40px] rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDeleteEntry(entry)}
                            aria-label={`Delete ${entry.foodName}`}
                            className="min-h-[40px] min-w-[40px] rounded-lg flex items-center justify-center text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. WATER INTAKE & WEIGHT TRACKING */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Water Intake Card */}
        <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400 flex items-center justify-center">
                  <Droplets className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Water Intake
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-nums">
                    {(waterTodayMl / 1000).toFixed(2)} L / {(dailyWaterGoalMl / 1000).toFixed(2)} L ({waterPct}%)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingWaterGoal((v) => !v)}
                className="min-h-[36px] px-2.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5"
              >
                {editingWaterGoal ? 'Done' : 'Goal'}
              </button>
            </div>

            <div className="mt-3 h-2.5 rounded-full bg-black/8 dark:bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-sky-500 transition-all duration-300"
                style={{ width: `${waterPct}%` }}
              />
            </div>

            {editingWaterGoal && (
              <div className="mt-3 flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#F4F3EF] dark:bg-[#090A0C]">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Daily Target
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDailyWaterGoalMl(dailyWaterGoalMl - 250)}
                    aria-label="Decrease water goal"
                    className="min-h-[36px] min-w-[36px] rounded-lg border border-black/10 dark:border-white/15 flex items-center justify-center"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs font-bold font-mono-nums min-w-[54px] text-center">
                    {(dailyWaterGoalMl / 1000).toFixed(2)} L
                  </span>
                  <button
                    type="button"
                    onClick={() => setDailyWaterGoalMl(dailyWaterGoalMl + 250)}
                    aria-label="Increase water goal"
                    className="min-h-[36px] min-w-[36px] rounded-lg border border-black/10 dark:border-white/15 flex items-center justify-center"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => addWaterMl(selectedDate, -250)}
              disabled={waterTodayMl === 0}
              className="min-h-[44px] rounded-xl border border-black/10 dark:border-white/12 text-xs font-semibold text-slate-600 dark:text-slate-300 disabled:opacity-40 inline-flex items-center justify-center gap-1"
            >
              <Minus className="w-3.5 h-3.5" />
              250 ml
            </button>
            <button
              type="button"
              onClick={() => addWaterMl(selectedDate, 250)}
              className="min-h-[44px] rounded-xl bg-sky-500/15 text-sky-700 dark:text-sky-300 text-xs font-bold hover:bg-sky-500/25 inline-flex items-center justify-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              250 ml
            </button>
            <button
              type="button"
              onClick={() => addWaterMl(selectedDate, 500)}
              className="min-h-[44px] rounded-xl bg-sky-600 text-white text-xs font-bold hover:bg-sky-500 inline-flex items-center justify-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              500 ml
            </button>
          </div>
        </div>

        {/* Weight Tracking Card */}
        <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-[#C8FF00]/20 text-[#4E6800] dark:text-[#C8FF00] flex items-center justify-center">
                <Scale className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Body Weight
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {latestWeightEntry
                    ? `Updated ${formatShortDate(latestWeightEntry.date)}`
                    : 'No weigh-ins yet'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openWeightModal()}
              className="min-h-[40px] px-3 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-xs font-bold inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Log Weight
            </button>
          </div>

          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-2xl font-bold font-mono-nums text-slate-900 dark:text-white">
                {latestWeightEntry
                  ? formatWeight(latestWeightEntry.weightKg, settings.weightUnit)
                  : '—'}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono-nums">
                {weightDeltaKg !== null && (
                  <span className="inline-flex items-center gap-0.5 font-semibold text-slate-700 dark:text-slate-200">
                    {weightDeltaKg < 0 ? (
                      <TrendingDown className="w-3.5 h-3.5 text-emerald-500" />
                    ) : weightDeltaKg > 0 ? (
                      <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
                    ) : null}
                    {weightDeltaKg > 0 ? `+${weightDeltaKg}` : weightDeltaKg} kg
                  </span>
                )}
                {weightGoal.targetWeightKg > 0 && (
                  <span>
                    Target: {formatWeight(weightGoal.targetWeightKg, settings.weightUnit)}
                  </span>
                )}
              </div>
            </div>

            {weightTrendData.length >= 2 && (
              <div className="w-32 h-14 shrink-0" aria-label="Recent weight trend">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={weightTrendData}>
                    <defs>
                      <linearGradient id="homeWeightGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={isDark ? '#C8FF00' : '#4E6800'} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={isDark ? '#C8FF00' : '#4E6800'} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: isDark ? '#111317' : '#ffffff',
                        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)',
                        borderRadius: '10px',
                        fontSize: '11px',
                      }}
                      formatter={(val: unknown) => [`${val} ${settings.weightUnit}`, 'Weight']}
                    />
                    <Area
                      type="monotone"
                      dataKey="weight"
                      stroke={isDark ? '#C8FF00' : '#4E6800'}
                      strokeWidth={2}
                      fill="url(#homeWeightGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 6. USEFUL DAILY INSIGHTS & OPTIONAL CHALLENGES */}
      <section className="space-y-4">
        <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#C8FF00]/20 text-[#4E6800] dark:text-[#C8FF00] flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[#4E6800] dark:text-[#C8FF00]">
                Daily Insight
              </div>
              <h3 className="mt-0.5 text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                {dailyInsight.title}
              </h3>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                {dailyInsight.detail}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={dailyInsight.onAction}
            className="min-h-[42px] px-4 rounded-xl border border-black/12 dark:border-white/15 text-xs font-bold text-slate-800 dark:text-slate-100 hover:border-[#4E6800] dark:hover:border-[#C8FF00] whitespace-nowrap shrink-0 self-start sm:self-center"
          >
            {dailyInsight.actionLabel}
          </button>
        </div>

        {/* Remaining Macro Food Suggestions (only when helpful) */}
        {smartRecommendations.length > 0 && (
          <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Suggested Foods for Remaining Macros
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Matched to your remaining calories and protein
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {smartRecommendations.map((rec) => (
                <div
                  key={rec.food.id}
                  className="p-3.5 rounded-xl bg-[#F4F3EF]/70 dark:bg-[#090A0C] border border-black/8 dark:border-white/10 flex flex-col justify-between gap-2.5"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {rec.food.name}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-mono-nums mt-0.5">
                      {rec.suggestedServingsLabel} · {rec.projectedMacros.calories} kcal · P {rec.projectedMacros.protein}g
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openAddFoodModal({ food: rec.food, date: selectedDate })}
                    className="w-full min-h-[40px] rounded-xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/15 text-xs font-bold text-slate-800 dark:text-slate-100 hover:border-[#4E6800] dark:hover:border-[#C8FF00] inline-flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Quick Add
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Optional Daily Challenges Drawer (Collapsed by default so Home stays calm & focused) */}
        <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowQuestsOnHome(!showQuestsOnHome)}
            aria-expanded={showQuestsOnHome}
            className="w-full min-h-[52px] px-5 py-3 flex items-center justify-between gap-3 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
          >
            <div className="flex items-center gap-2.5">
              <Trophy className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00]" />
              <div>
                <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Daily Challenges
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Optional habit milestones and XP streaks
                </div>
              </div>
            </div>
            {showQuestsOnHome ? (
              <ChevronUp className="w-4 h-4 text-slate-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-500" />
            )}
          </button>

          {showQuestsOnHome && (
            <div className="p-4 pt-0 border-t border-black/8 dark:border-white/10">
              <div className="pt-4">
                <DailyQuestArena />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Button-Triggered Smart Calorie Calculator Modal */}
      {calculatorModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="home-smart-calculator-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCalculatorModalOpen(false);
          }}
        >
          <div
            ref={calculatorDialogRef}
            className="relative w-full max-w-5xl max-h-[92dvh] sm:max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[#F5F6F8] dark:bg-[#0B0C0F] border border-black/10 dark:border-white/12 shadow-2xl overflow-hidden"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-b border-black/10 dark:border-white/10 bg-white/95 dark:bg-[#111317]/95 backdrop-blur-md">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#C8FF00]/20 dark:bg-[#C8FF00]/15 flex items-center justify-center shrink-0">
                  <Calculator className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00]" />
                </div>
                <div className="min-w-0">
                  <h2
                    id="home-smart-calculator-modal-title"
                    className="text-sm sm:text-base font-bold text-[#111317] dark:text-white truncate"
                  >
                    Smart Calorie Calculator
                  </h2>
                  <p className="text-[11px] text-[#52555E] dark:text-[#9A9CA3] truncate">
                    Calculate targets, macros, hydration &amp; timeline estimates
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCalculatorModalOpen(false)}
                aria-label="Close Smart Calorie Calculator"
                className="min-h-[44px] min-w-[44px] rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-[#090A0C] text-[#111317] dark:text-white hover:border-[#C8FF00] transition-colors inline-flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto overscroll-contain p-3 sm:p-6">
              <SmartCalorieTrackerPanel
                compactHeader
                onApplied={() => setCalculatorModalOpen(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={pendingDeleteEntry !== null}
        title="Delete food entry?"
        description={
          pendingDeleteEntry
            ? `Remove ${pendingDeleteEntry.foodName} (${pendingDeleteEntry.calories} kcal) from your diary?`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={() => {
          if (pendingDeleteEntry) {
            deleteFoodEntry(pendingDeleteEntry.id);
            setPendingDeleteEntry(null);
          }
        }}
        onCancel={() => setPendingDeleteEntry(null)}
      />
    </div>
  );
};
