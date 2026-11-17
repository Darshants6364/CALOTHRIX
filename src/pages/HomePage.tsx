import React, { useMemo } from 'react';
import {
  ArrowRight,
  Barcode,
  Calculator,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Droplets,
  Flame,
  Mic,
  Minus,
  Plus,
  Scale,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts';
import { CalorieRing } from '../components/CalorieRing';
import { DateStrip } from '../components/DateStrip';
import { MacroCard } from '../components/MacroCard';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { MEAL_CATEGORIES, MealCategory } from '../types';
import { getSmartFoodRecommendations } from '../utils/analyticsUtils';
import {
  addDaysToDateKey,
  formatReadableDate,
  formatShortDate,
  getMondayToSundayWeek,
  getTimeOfDayGreeting,
  getTodayDateKey,
} from '../utils/dateUtils';
import {
  convertWeightToDisplay,
  formatWeight,
  getDailyGoalCompletionScore,
  getEntriesForDate,
  getMacroCalorieSplit,
  getMealBreakdown,
  isCalorieGoalAchieved,
  round1,
  round2,
  sortWeightEntriesChronological,
  sumMacros,
} from '../utils/nutritionUtils';

const MEAL_CALORIE_SHARE: Record<MealCategory, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  evening_snacks: 0.15,
  dinner: 0.25,
  other: 0,
};

export const HomePage: React.FC = () => {
  const {
    state,
    allFoods,
    authMode,
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
    openMealScannerModal,
    openBarcodeScannerModal,
    openWeightModal,
    setActiveTab,
    pendingInvitations,
    pendingRecommendations,
    coachPlans,
    approveTargetRecommendation,
    declineTargetRecommendation,
    waterIntakeMlByDate,
    dailyWaterGoalMl,
    addWaterMl,
    setDailyWaterGoalMl,
    copyMealFromPreviousDay,
  } = useMacroLogStore();

  const isDark = resolvedTheme === 'dark';
  const todayKey = getTodayDateKey();
  const yesterdayKey = useMemo(() => addDaysToDateKey(selectedDate, -1), [selectedDate]);

  const { goals, settings, profile, weightGoal } = state;
  const greeting = getTimeOfDayGreeting();
  const firstName = (authDetails?.name || profile.name).split(' ')[0] || 'there';

  const macroSplit = useMemo(
    () => getMacroCalorieSplit(selectedDateTotals),
    [selectedDateTotals]
  );

  const targetMacroSplit = useMemo(
    () =>
      getMacroCalorieSplit({
        calories: goals.calories,
        protein: goals.protein,
        carbs: goals.carbs,
        fat: goals.fat,
        fibre: goals.fibre,
      }),
    [goals]
  );

  const mealBreakdown = useMemo(
    () => getMealBreakdown(selectedDateEntries),
    [selectedDateEntries]
  );

  const yesterdayMealBreakdown = useMemo(
    () => getMealBreakdown(getEntriesForDate(state.foodEntries, yesterdayKey)),
    [state.foodEntries, yesterdayKey]
  );

  // Real logging streak & weekly consistency computed from actual food entries
  const momentumStats = useMemo(() => {
    const loggedDates = new Set(state.foodEntries.map((e) => e.date));
    let streak = 0;
    let cursor = loggedDates.has(todayKey) ? todayKey : addDaysToDateKey(todayKey, -1);
    while (loggedDates.has(cursor) && streak < 365) {
      streak += 1;
      cursor = addDaysToDateKey(cursor, -1);
    }

    const weekDates = getMondayToSundayWeek(todayKey, 0);
    let weekLoggedDays = 0;
    let weekOnTargetDays = 0;
    for (const d of weekDates) {
      const entries = getEntriesForDate(state.foodEntries, d);
      if (entries.length > 0) {
        weekLoggedDays += 1;
        const totals = sumMacros(entries);
        if (isCalorieGoalAchieved(totals.calories, goals.calories)) {
          weekOnTargetDays += 1;
        }
      }
    }

    const dailyScore = getDailyGoalCompletionScore(selectedDateTotals, goals);
    return { streak, weekLoggedDays, weekOnTargetDays, dailyScore };
  }, [goals, selectedDateTotals, state.foodEntries, todayKey]);

  // Aggregate real micronutrients from today's logged items when food metadata provides them
  const loggedMicronutrients = useMemo(() => {
    const foodById = new Map(allFoods.map((f) => [f.id, f]));
    let sugarG = 0;
    let sodiumMg = 0;
    let saturatedFatG = 0;
    let potassiumMg = 0;
    let ironMg = 0;
    let calciumMg = 0;
    let vitaminCMg = 0;
    let hasAny = false;

    for (const entry of selectedDateEntries) {
      const food = foodById.get(entry.foodId);
      if (!food?.micronutrients) continue;
      const baseWeight = food.servingWeightGrams > 0 ? food.servingWeightGrams : 100;
      const ratio = Math.max(0, entry.quantityGrams) / baseWeight;
      const m = food.micronutrients;
      if (m.sugarG != null) {
        sugarG += m.sugarG * ratio;
        hasAny = true;
      }
      if (m.sodiumMg != null) {
        sodiumMg += m.sodiumMg * ratio;
        hasAny = true;
      }
      if (m.saturatedFatG != null) {
        saturatedFatG += m.saturatedFatG * ratio;
        hasAny = true;
      }
      if (m.potassiumMg != null) {
        potassiumMg += m.potassiumMg * ratio;
        hasAny = true;
      }
      if (m.ironMg != null) {
        ironMg += m.ironMg * ratio;
        hasAny = true;
      }
      if (m.calciumMg != null) {
        calciumMg += m.calciumMg * ratio;
        hasAny = true;
      }
      if (m.vitaminCMg != null) {
        vitaminCMg += m.vitaminCMg * ratio;
        hasAny = true;
      }
    }

    return {
      hasAny,
      sugarG: round1(sugarG),
      sodiumMg: Math.round(sodiumMg),
      saturatedFatG: round1(saturatedFatG),
      potassiumMg: Math.round(potassiumMg),
      ironMg: round1(ironMg),
      calciumMg: Math.round(calciumMg),
      vitaminCMg: round1(vitaminCMg),
    };
  }, [allFoods, selectedDateEntries]);

  // Quick-log recent & favorite foods
  const quickLogFoods = useMemo(() => {
    const foodById = new Map(allFoods.map((f) => [f.id, f]));
    const orderedIds = Array.from(
      new Set([...state.favoriteFoodIds, ...state.recentFoodIds])
    );
    return orderedIds
      .map((id) => foodById.get(id))
      .filter((f): f is NonNullable<typeof f> => Boolean(f))
      .slice(0, 6);
  }, [allFoods, state.favoriteFoodIds, state.recentFoodIds]);

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

  const remainingToGoalKg =
    currentWeightKg > 0 && weightGoal.targetWeightKg > 0
      ? round2(weightGoal.targetWeightKg - currentWeightKg)
      : null;

  const waterMl = waterIntakeMlByDate[selectedDate] || 0;
  const waterPct = Math.min(100, Math.round((waterMl / Math.max(1, dailyWaterGoalMl)) * 100));
  const glassesLogged = Math.round((waterMl / 250) * 10) / 10;
  const glassesGoal = Math.round(dailyWaterGoalMl / 250);

  const smartRecommendations = useMemo(
    () =>
      getSmartFoodRecommendations({
        foods: allFoods,
        goals,
        consumedToday: selectedDateTotals,
        dietaryPreference: profile.dietaryPreference || 'omnivore',
        foodRestrictions: profile.foodRestrictions || [],
        limit: 4,
      }),
    [allFoods, goals, profile.dietaryPreference, profile.foodRestrictions, selectedDateTotals]
  );

  const goalSummaryLabel =
    profile.fitnessGoal === 'fat_loss'
      ? 'Fat Loss Plan'
      : profile.fitnessGoal === 'muscle_gain'
      ? 'Muscle Gain Plan'
      : profile.fitnessGoal === 'recomposition'
      ? 'Body Recomposition'
      : 'Maintenance Plan';

  return (
    <div className="space-y-6">
      {/* Top Greeting, Consistency Metrics & Primary Action */}
      <section className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>{formatReadableDate(selectedDate)}</span>
            {authMode === 'authenticated' && authDetails?.email ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{authDetails.email}</span>
              </>
            ) : null}
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            {greeting}, {firstName}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-300 tabular-nums">
            <span className="inline-flex items-center gap-1 font-medium">
              <Flame className="w-3.5 h-3.5 text-lime-600 dark:text-lime-400" />
              {momentumStats.streak} {momentumStats.streak === 1 ? 'day' : 'days'} streak
            </span>
            <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
            <span>This week: {momentumStats.weekLoggedDays} / 7 days logged</span>
            {goals.calories > 0 && (
              <>
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                <span>{momentumStats.weekOnTargetDays} days on calorie target</span>
                {selectedDateTotals.calories > 0 && (
                  <>
                    <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                    <span className="font-semibold text-lime-700 dark:text-lime-400">
                      Daily score: {momentumStats.dailyScore}%
                    </span>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => openBarcodeScannerModal({ date: selectedDate })}
            className="min-h-[44px] px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-[#121821] text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-semibold hover:border-lime-500 transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
          >
            <Barcode className="w-4 h-4 text-lime-600 dark:text-lime-400" />
            <span>Barcode</span>
          </button>

          <button
            type="button"
            onClick={() => openMealScannerModal({ mode: 'photo', date: selectedDate })}
            className="min-h-[44px] px-4 py-2.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-[#121821] text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-semibold hover:border-lime-500 transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
          >
            <Camera className="w-4 h-4 text-lime-600 dark:text-lime-400" />
            <Mic className="w-3.5 h-3.5 text-lime-600 dark:text-lime-400 -ml-1" />
            <span>Photo / Voice AI</span>
          </button>

          <button
            type="button"
            onClick={() => openAddFoodModal({ date: selectedDate })}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-sm font-semibold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Add Food
          </button>
        </div>
      </section>

      {/* Pending Coaching Alerts (Invites & Trainer Target Proposals) */}
      {(pendingRecommendations.length > 0 || pendingInvitations.length > 0) && (
        <section className="rounded-2xl border border-lime-500/50 bg-lime-50/60 dark:bg-lime-950/20 p-4 space-y-3">
          {pendingRecommendations.map((rec) => (
            <div
              key={rec.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              <div>
                <div className="text-xs font-semibold text-lime-800 dark:text-lime-300">
                  Target Recommendation from {rec.trainerName || 'Your Trainer'}
                </div>
                <div className="text-xs text-slate-700 dark:text-slate-200 mt-0.5 font-mono-nums">
                  Suggested: {rec.recommendedCalories} kcal · P {rec.recommendedProtein}g · C{' '}
                  {rec.recommendedCarbs}g · F {rec.recommendedFat}g
                  {rec.rationale ? ` — ${rec.rationale}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void declineTargetRecommendation(rec.id)}
                  className="min-h-[36px] px-3 rounded-xl border border-stone-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap"
                >
                  Decline
                </button>
                <button
                  type="button"
                  onClick={() => void approveTargetRecommendation(rec)}
                  className="min-h-[36px] px-3.5 rounded-xl bg-lime-500 hover:bg-lime-400 text-slate-950 text-xs font-bold whitespace-nowrap"
                >
                  Approve & Apply
                </button>
              </div>
            </div>
          ))}

          {pendingInvitations.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-1">
              <div className="text-xs text-slate-700 dark:text-slate-200">
                You have <span className="font-bold">{pendingInvitations.length}</span> pending
                trainer {pendingInvitations.length === 1 ? 'invitation' : 'invitations'}.
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                className="min-h-[34px] px-3.5 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-xs font-bold self-start sm:self-auto whitespace-nowrap"
              >
                Review in Settings →
              </button>
            </div>
          )}
        </section>
      )}

      {/* Active Trainer Blueprint & Plan (defined by connected Coach) */}
      {coachPlans.length > 0 && (
        <section className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
          {coachPlans.slice(0, 1).map((plan) => (
            <div key={plan.id} className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-lime-100 dark:bg-lime-950/60 text-lime-700 dark:text-lime-400 flex items-center justify-center shrink-0">
                    <ClipboardCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-lime-700 dark:text-lime-400">
                      Coach Blueprint · {plan.trainerName || 'Your Trainer'}
                    </div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                      {plan.phaseTitle}
                    </h2>
                    {plan.coachSummary && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed max-w-3xl">
                        {plan.coachSummary}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs font-mono-nums text-slate-600 dark:text-slate-300">
                  <span className="px-2.5 py-1 rounded-lg bg-stone-50 dark:bg-slate-900 border border-stone-200/80 dark:border-slate-800">
                    Water {plan.dailyWaterGoalMl.toLocaleString()} ml
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-stone-50 dark:bg-slate-900 border border-stone-200/80 dark:border-slate-800">
                    Steps {plan.dailyStepsTarget.toLocaleString()}/d
                  </span>
                </div>
              </div>

              {plan.mealGuidelines.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                  {plan.mealGuidelines.map((mg) => {
                    const label =
                      MEAL_CATEGORIES.find((m) => m.id === mg.mealType)?.shortLabel || mg.mealType;
                    return (
                      <div
                        key={mg.mealType}
                        className="p-3 rounded-xl bg-stone-50/70 dark:bg-slate-900/60 border border-stone-200/70 dark:border-slate-800"
                      >
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-900 dark:text-slate-100">
                          <span>{label}</span>
                          <span className="font-mono-nums text-lime-700 dark:text-lime-400">
                            {mg.targetCalories} kcal
                          </span>
                        </div>
                        <div className="text-[11px] font-mono-nums text-slate-500 dark:text-slate-400 mt-0.5">
                          Target Protein: {mg.targetProtein}g
                        </div>
                        {mg.guidance && (
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 leading-snug">
                            {mg.guidance}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {plan.actionItems.length > 0 && (
                <div className="flex flex-wrap gap-x-5 gap-y-1.5 pt-2 border-t border-stone-100 dark:border-slate-800/80">
                  {plan.actionItems.map((item, idx) => (
                    <span
                      key={idx}
                      className="text-xs text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-lime-600 dark:text-lime-400 shrink-0" />
                      <span>{item}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Date Strip */}
      <DateStrip selectedDate={selectedDate} onSelectDate={setSelectedDate} />

      {/* Main Focal Section: Calorie Ring + Macro Ratio Comparison */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-7 bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-7 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Daily Calorie Balance
              </h2>
              {goals.calories > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {goalSummaryLabel}
                  {goals.estimatedWeeks
                    ? ` · Est. ${goals.estimatedWeeks} weeks to target`
                    : ''}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('goals')}
              className="text-xs font-medium text-lime-700 dark:text-lime-400 hover:underline whitespace-nowrap shrink-0"
            >
              {goals.calories > 0 ? 'Edit goals' : 'Set daily goals →'}
            </button>
          </div>
          <CalorieRing consumed={selectedDateTotals.calories} goal={goals.calories} />
        </div>

        {/* Daily Macro Split & Target Alignment (MyFitnessPal Nutrition Style) */}
        <div className="lg:col-span-5 bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 flex flex-col justify-between gap-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Macro Energy Split
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {selectedDateEntries.length}{' '}
                {selectedDateEntries.length === 1 ? 'food logged' : 'foods logged'}
              </span>
            </div>

            {/* Today's Actual Split */}
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                <span>Logged Today</span>
                <span className="font-mono-nums font-medium text-slate-800 dark:text-slate-200">
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

            {/* Target Split for Comparison */}
            {goals.calories > 0 && (
              <div>
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                  <span>Your Target Ratio</span>
                  <span className="font-mono-nums">
                    {targetMacroSplit.proteinPct}% P · {targetMacroSplit.carbsPct}% C ·{' '}
                    {targetMacroSplit.fatPct}% F
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-stone-100 dark:bg-slate-800 overflow-hidden flex opacity-75">
                  <div
                    className="bg-lime-500 dark:bg-lime-400 h-full"
                    style={{ width: `${targetMacroSplit.proteinPct}%` }}
                  />
                  <div
                    className="bg-amber-500 dark:bg-amber-400 h-full"
                    style={{ width: `${targetMacroSplit.carbsPct}%` }}
                  />
                  <div
                    className="bg-indigo-500 dark:bg-indigo-400 h-full"
                    style={{ width: `${targetMacroSplit.fatPct}%` }}
                  />
                </div>
              </div>
            )}

            {/* Compact Macro Legend & Grams Summary */}
            <div className="pt-2 border-t border-stone-100 dark:border-slate-800/80 divide-y divide-stone-100 dark:divide-slate-800/70 text-xs">
              <div className="py-2 flex items-center justify-between">
                <span className="font-medium text-lime-700 dark:text-lime-400">Protein (4 kcal/g)</span>
                <span className="font-mono-nums text-slate-800 dark:text-slate-200">
                  {round1(selectedDateTotals.protein)}g
                  {goals.protein > 0 ? ` / ${goals.protein}g` : ''}
                </span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="font-medium text-amber-700 dark:text-amber-400">
                  Carbohydrates (4 kcal/g)
                </span>
                <span className="font-mono-nums text-slate-800 dark:text-slate-200">
                  {round1(selectedDateTotals.carbs)}g
                  {goals.carbs > 0 ? ` / ${goals.carbs}g` : ''}
                </span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="font-medium text-indigo-700 dark:text-indigo-400">Fat (9 kcal/g)</span>
                <span className="font-mono-nums text-slate-800 dark:text-slate-200">
                  {round1(selectedDateTotals.fat)}g
                  {goals.fat > 0 ? ` / ${goals.fat}g` : ''}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab('food-log')}
            className="w-full min-h-[40px] px-4 rounded-xl border border-stone-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            Open Full Food Diary
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

      {/* Interactive Meal Diary & Recommended Meal Budgets (HealthifyMe & MFP Style) */}
      <section className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Today&apos;s Meals
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Log directly into any meal or reuse yesterday&apos;s entries in one tap
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('food-log')}
            className="text-xs font-medium text-lime-700 dark:text-lime-400 hover:underline whitespace-nowrap"
          >
            Manage all meals →
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {MEAL_CATEGORIES.slice(0, 4).map((meal) => {
            const data = mealBreakdown[meal.id];
            const yesterdayCount = yesterdayMealBreakdown[meal.id].items.length;
            const share = MEAL_CALORIE_SHARE[meal.id];
            const mealBudget = goals.calories > 0 ? Math.round(goals.calories * share) : 0;
            const mealPct =
              mealBudget > 0
                ? Math.min(100, Math.round((data.totals.calories / mealBudget) * 100))
                : 0;
            const isOverMeal = mealBudget > 0 && data.totals.calories > mealBudget * 1.15;

            return (
              <div
                key={meal.id}
                className="rounded-xl border border-stone-200/80 dark:border-slate-800 p-4 flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {meal.label}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                        P {data.totals.protein}g · C {data.totals.carbs}g · F {data.totals.fat}g
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold font-mono-nums text-slate-900 dark:text-slate-100">
                        {data.totals.calories.toLocaleString()}
                        {mealBudget > 0 && (
                          <span className="text-xs font-normal text-slate-400">
                            {' '}
                            / {mealBudget.toLocaleString()}
                          </span>
                        )}{' '}
                        <span className="text-xs font-normal text-slate-500">kcal</span>
                      </div>
                      {mealBudget > 0 && (
                        <div className="text-[11px] text-slate-400 tabular-nums">
                          {Math.round(share * 100)}% daily share
                        </div>
                      )}
                    </div>
                  </div>

                  {mealBudget > 0 && (
                    <div className="mt-2.5 h-1.5 w-full rounded-full bg-stone-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isOverMeal
                            ? 'bg-amber-500 dark:bg-amber-400'
                            : 'bg-lime-500 dark:bg-lime-400'
                        }`}
                        style={{ width: `${mealPct}%` }}
                      />
                    </div>
                  )}

                  {data.items.length > 0 ? (
                    <div className="mt-3 space-y-1">
                      {data.items.slice(0, 3).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => openEditFoodModal(item)}
                          className="w-full flex items-center justify-between gap-2 text-xs text-left py-1 rounded-md hover:bg-stone-50 dark:hover:bg-slate-800/50 px-1.5 -mx-1.5 transition-colors"
                        >
                          <span className="text-slate-700 dark:text-slate-300 truncate">
                            {item.foodName}
                          </span>
                          <span className="font-mono-nums text-slate-500 dark:text-slate-400 shrink-0">
                            {item.calories} kcal
                          </span>
                        </button>
                      ))}
                      {data.items.length > 3 && (
                        <div className="text-[11px] text-slate-400 pt-0.5">
                          +{data.items.length - 3} more in Food Log
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 text-xs text-slate-400 dark:text-slate-500">
                      Nothing logged yet
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-100 dark:border-slate-800/80">
                  {data.items.length === 0 && yesterdayCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => copyMealFromPreviousDay(meal.id, selectedDate)}
                      className="min-h-[34px] px-2.5 rounded-lg border border-stone-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy yesterday ({yesterdayCount})
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-400 tabular-nums">
                      {data.items.length} {data.items.length === 1 ? 'entry' : 'entries'}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => openAddFoodModal({ meal: meal.id, date: selectedDate })}
                    className="min-h-[34px] px-3 rounded-lg bg-stone-100 dark:bg-slate-800 hover:bg-stone-200/80 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add to {meal.shortLabel}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Hydration & Weight Progress Split Row */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Daily Water Tracker (HealthifyMe & MFP Staple) */}
        <div className="lg:col-span-6 bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                  <Droplets className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Water Intake
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {glassesLogged} of {glassesGoal} glasses (250 ml each)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <span>Goal:</span>
                <button
                  type="button"
                  onClick={() => setDailyWaterGoalMl(dailyWaterGoalMl - 250)}
                  aria-label="Decrease water goal"
                  className="w-6 h-6 rounded-md border border-stone-200 dark:border-slate-700 flex items-center justify-center hover:bg-stone-100 dark:hover:bg-slate-800"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="font-mono-nums font-semibold text-slate-800 dark:text-slate-200 min-w-[54px] text-center">
                  {dailyWaterGoalMl.toLocaleString()} ml
                </span>
                <button
                  type="button"
                  onClick={() => setDailyWaterGoalMl(dailyWaterGoalMl + 250)}
                  aria-label="Increase water goal"
                  className="w-6 h-6 rounded-md border border-stone-200 dark:border-slate-700 flex items-center justify-center hover:bg-stone-100 dark:hover:bg-slate-800"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="mt-4 flex items-baseline justify-between gap-2">
              <div className="text-2xl font-bold font-mono-nums text-slate-900 dark:text-slate-50">
                {waterMl.toLocaleString()}{' '}
                <span className="text-xs font-normal text-slate-500">
                  / {dailyWaterGoalMl.toLocaleString()} ml
                </span>
              </div>
              <span className="text-xs font-semibold font-mono-nums text-sky-600 dark:text-sky-400">
                {waterPct}%
              </span>
            </div>

            <div className="mt-2 h-2.5 w-full rounded-full bg-sky-100 dark:bg-sky-950/60 overflow-hidden">
              <div
                className="h-full rounded-full bg-sky-500 dark:bg-sky-400 transition-all duration-300"
                style={{ width: `${waterPct}%` }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => addWaterMl(selectedDate, -250)}
              disabled={waterMl <= 0}
              className="min-h-[38px] px-3 rounded-xl border border-stone-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-800 disabled:opacity-40 inline-flex items-center gap-1 whitespace-nowrap"
            >
              <Minus className="w-3.5 h-3.5" />
              250 ml
            </button>
            <button
              type="button"
              onClick={() => addWaterMl(selectedDate, 250)}
              className="min-h-[38px] px-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              1 Glass (250 ml)
            </button>
            <button
              type="button"
              onClick={() => addWaterMl(selectedDate, 500)}
              className="min-h-[38px] px-3.5 rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50/70 dark:bg-sky-950/30 text-xs font-semibold text-sky-800 dark:text-sky-300 hover:bg-sky-100/80 dark:hover:bg-sky-950/50 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Bottle (500 ml)
            </button>
          </div>
        </div>

        {/* Weight Progress Card */}
        <div className="lg:col-span-6 bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 flex flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
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
                    History
                  </button>
                </div>

                <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="text-2xl font-bold font-mono-nums text-slate-900 dark:text-slate-50">
                    {currentWeightKg > 0
                      ? formatWeight(currentWeightKg, settings.weightUnit)
                      : 'Not logged'}
                  </span>
                  {weightGoal.targetWeightKg > 0 && (
                    <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      Goal: {formatWeight(weightGoal.targetWeightKg, settings.weightUnit)}
                    </span>
                  )}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
                  {prevDiffKg !== null && (
                    <span
                      className={`inline-flex items-center gap-1 font-medium ${
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
                      since last entry
                    </span>
                  )}
                  {remainingToGoalKg !== null && Math.abs(remainingToGoalKg) >= 0.1 && (
                    <span className="text-slate-500 dark:text-slate-400">
                      {Math.abs(convertWeightToDisplay(remainingToGoalKg, settings.weightUnit))}{' '}
                      {settings.weightUnit} {remainingToGoalKg < 0 ? 'to lose' : 'to gain'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => openWeightModal()}
              className="min-h-[38px] px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800/80 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-stone-100 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Log Weight
            </button>
          </div>

          {weightTrendData.length >= 2 ? (
            <div className="h-20 w-full">
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
          ) : (
            <div className="text-xs text-slate-400 dark:text-slate-500 pt-2 border-t border-stone-100 dark:border-slate-800/80">
              Log at least 2 weight check-ins to display your trend chart.
            </div>
          )}
        </div>
      </section>

      {/* Real Logged Micronutrients & Sugar Summary (shown when logged foods contain nutrient data) */}
      {loggedMicronutrients.hasAny && (
        <section className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Daily Nutrients & Sugar Watch
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Calculated from micronutrient data on your logged foods today
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            {[
              { label: 'Sugar', value: `${loggedMicronutrients.sugarG} g`, note: 'Ref: <50 g' },
              {
                label: 'Sat. Fat',
                value: `${loggedMicronutrients.saturatedFatG} g`,
                note: 'Ref: <20 g',
              },
              {
                label: 'Sodium',
                value: `${loggedMicronutrients.sodiumMg.toLocaleString()} mg`,
                note: 'Ref: <2,300 mg',
              },
              {
                label: 'Potassium',
                value: `${loggedMicronutrients.potassiumMg.toLocaleString()} mg`,
                note: 'Ref: 3,400 mg',
              },
              { label: 'Calcium', value: `${loggedMicronutrients.calciumMg} mg`, note: 'Ref: 1,000 mg' },
              { label: 'Iron', value: `${loggedMicronutrients.ironMg} mg`, note: 'Ref: 8–18 mg' },
              { label: 'Vitamin C', value: `${loggedMicronutrients.vitaminCMg} mg`, note: 'Ref: 90 mg' },
            ].map((item) => (
              <div
                key={item.label}
                className="p-3 rounded-xl bg-stone-50/70 dark:bg-slate-900/60 border border-stone-200/70 dark:border-slate-800"
              >
                <div className="text-[11px] text-slate-500 dark:text-slate-400">{item.label}</div>
                <div className="mt-1 text-base font-bold font-mono-nums text-slate-900 dark:text-slate-100">
                  {item.value}
                </div>
                <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 tabular-nums">
                  {item.note}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Setup CTA when targets are still 0 */}
      {goals.calories === 0 && (
        <section className="bg-lime-50/70 dark:bg-lime-950/20 border border-lime-500/50 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-lime-500/20 text-lime-700 dark:text-lime-400 flex items-center justify-center shrink-0">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Set Your Daily Calorie & Macro Targets
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                Answer a few quick questions about your body and routine to get personalized calorie, protein, carbs, fat, and fibre goals.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('goals')}
            className="min-h-[42px] px-4 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-xs font-semibold whitespace-nowrap shrink-0"
          >
            Calculate My Goals →
          </button>
        </section>
      )}

      {/* Quick Log from Favorites & Recent Foods */}
      {quickLogFoods.length > 0 && (
        <section className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Quick Log Recent & Favorite Foods
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Log your everyday staples faster
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('food-database')}
              className="text-xs font-medium text-lime-700 dark:text-lime-400 hover:underline whitespace-nowrap"
            >
              Search all foods →
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {quickLogFoods.map((food) => (
              <button
                key={food.id}
                type="button"
                onClick={() => openAddFoodModal({ food, date: selectedDate })}
                className="p-3 rounded-xl border border-stone-200/80 dark:border-slate-800 hover:border-lime-500 bg-stone-50/50 dark:bg-slate-900/50 text-left flex items-center justify-between gap-3 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {food.name}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                    {food.servingName} · {food.calories} kcal · P {food.protein}g
                  </div>
                </div>
                <span className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 shrink-0">
                  <Plus className="w-3.5 h-3.5" />
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Rule-Based Smart Meal Suggestions */}
      {smartRecommendations.length > 0 && (
        <section className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-lime-600 dark:text-lime-400" />
                Smart Food Suggestions
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Matched to your remaining macros and {profile.dietaryPreference || 'omnivore'} preferences
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('food-database')}
              className="text-xs font-medium text-lime-700 dark:text-lime-400 hover:underline whitespace-nowrap"
            >
              Explore Global Database →
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {smartRecommendations.map((rec) => (
              <div
                key={rec.food.id}
                className="p-3.5 rounded-xl bg-stone-50/70 dark:bg-slate-900/70 border border-stone-200/70 dark:border-slate-800 flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 line-clamp-1">
                    {rec.food.name}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                    {rec.suggestedServingsLabel} · {rec.projectedMacros.calories} kcal
                  </div>
                  <div className="text-xs font-medium text-lime-700 dark:text-lime-400 mt-1.5">
                    {rec.reason}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => openAddFoodModal({ food: rec.food, date: selectedDate })}
                  className="w-full min-h-[36px] px-3 rounded-lg bg-white dark:bg-[#121821] border border-stone-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:border-lime-500 inline-flex items-center justify-center gap-1 whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Quick Log
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
