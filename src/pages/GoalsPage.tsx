import React, { useEffect, useMemo, useState } from 'react';
import { Check, Lock, Pencil, SlidersHorizontal } from 'lucide-react';
import { AdaptiveAssessmentCard } from '../components/goals/AdaptiveAssessmentCard';
import { TargetHistorySection } from '../components/goals/TargetHistorySection';
import { WeeklyNutritionProgressCard } from '../components/goals/WeeklyNutritionProgressCard';
import { WeightProgressCard } from '../components/goals/WeightProgressCard';
import { SmartCalorieTrackerPanel } from '../components/SmartCalorieTrackerPanel';
import { WeeklyAssessmentBanner } from '../components/WeeklyAssessmentBanner';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import {
  buildFourWeekNutritionReports,
  buildWeeklyNutritionReport,
  buildWeeklyWeightProgress,
} from '../utils/cycleAnalytics';
import { getGoalDisplayLabel } from '../utils/fitnessCalculator';
import {
  convertDisplayWeightToKg,
  convertWeightToDisplay,
  formatWeight,
} from '../utils/nutritionUtils';

type GoalsSubTab = 'goals' | 'calculator';

export const GoalsPage: React.FC = () => {
  const {
    state,
    resolvedTheme,
    latestWeightEntry,
    dailyWaterGoalMl,
    setDailyWaterGoalMl,
    updateGoals,
    weeklyAssessments,
    targetHistory,
    assessmentDueStatus,
    weeklyAssessmentModal,
    runWeeklyAssessment,
    openWeeklyAssessmentModal,
    applyWeeklyAssessment,
    dismissWeeklyAssessment,
    clearManualOverride,
    openWeightModal,
    setActiveTab,
  } = useMacroLogStore();

  const unit = state.settings.weightUnit;
  const { profile } = state;
  const isDark = resolvedTheme === 'dark';

  const [activeGoalsTab, setActiveGoalsTab] = useState<GoalsSubTab>('goals');
  const [nutritionWeekOffset, setNutritionWeekOffset] = useState(0);
  const [weightWeekOffset, setWeightWeekOffset] = useState(0);
  const [weightWindowWeeks, setWeightWindowWeeks] = useState<1 | 2 | 4>(2);

  const effectiveCurrentWeightKg =
    latestWeightEntry?.weightKg && latestWeightEntry.weightKg >= 30
      ? latestWeightEntry.weightKg
      : profile.currentWeightKg;

  const isProfileConfigured = Boolean(
    profile.onboardingCompleted ||
      (profile.age >= 14 &&
        profile.heightCm >= 120 &&
        effectiveCurrentWeightKg >= 30 &&
        state.goals.calories > 0)
  );

  const isCustomActive = Boolean(
    profile.manualOverrideActive || state.goals.manualOverrideActive || state.goals.preset === 'custom'
  );

  // Weekly Nutrition Report (Monday–Sunday, logged-days-only averages, historical targets)
  const weeklyNutritionReport = useMemo(
    () =>
      buildWeeklyNutritionReport({
        foodEntries: state.foodEntries,
        currentGoals: state.goals,
        targetHistory,
        weekOffset: nutritionWeekOffset,
      }),
    [state.foodEntries, state.goals, targetHistory, nutritionWeekOffset]
  );

  const fourWeekNutritionReports = useMemo(
    () =>
      buildFourWeekNutritionReports({
        foodEntries: state.foodEntries,
        currentGoals: state.goals,
        targetHistory,
        weekOffset: nutritionWeekOffset,
      }),
    [state.foodEntries, state.goals, targetHistory, nutritionWeekOffset]
  );

  // Weekly Weight Progress (separate chart, zero interpolation/fabrication)
  const weeklyWeightProgress = useMemo(
    () =>
      buildWeeklyWeightProgress({
        weightEntries: state.weightEntries,
        profile,
        goals: state.goals,
        weightGoal: state.weightGoal,
        weekOffset: weightWeekOffset,
        windowWeeks: weightWindowWeeks,
      }),
    [
      state.weightEntries,
      profile,
      state.goals,
      state.weightGoal,
      weightWeekOffset,
      weightWindowWeeks,
    ]
  );

  // Custom Targets / Custom Diet form state inside Smart Calc tab
  const [calories, setCalories] = useState(
    state.goals.calories > 0 ? String(state.goals.calories) : ''
  );
  const [protein, setProtein] = useState(
    state.goals.protein > 0 ? String(state.goals.protein) : ''
  );
  const [carbs, setCarbs] = useState(state.goals.carbs > 0 ? String(state.goals.carbs) : '');
  const [fat, setFat] = useState(state.goals.fat > 0 ? String(state.goals.fat) : '');
  const [fibre, setFibre] = useState(state.goals.fibre > 0 ? String(state.goals.fibre) : '');
  const [hydrationMl, setHydrationMl] = useState(
    dailyWaterGoalMl > 0 ? String(dailyWaterGoalMl) : '2500'
  );
  const [targetWeight, setTargetWeight] = useState(
    state.goals.targetWeightKg !== undefined && state.goals.targetWeightKg >= 30
      ? String(convertWeightToDisplay(state.goals.targetWeightKg, unit))
      : ''
  );
  const [manualError, setManualError] = useState('');
  const [customSavedNotice, setCustomSavedNotice] = useState(false);

  useEffect(() => {
    setCalories(state.goals.calories > 0 ? String(state.goals.calories) : '');
    setProtein(state.goals.protein > 0 ? String(state.goals.protein) : '');
    setCarbs(state.goals.carbs > 0 ? String(state.goals.carbs) : '');
    setFat(state.goals.fat > 0 ? String(state.goals.fat) : '');
    setFibre(state.goals.fibre > 0 ? String(state.goals.fibre) : '');
    setTargetWeight(
      state.goals.targetWeightKg !== undefined && state.goals.targetWeightKg >= 30
        ? String(convertWeightToDisplay(state.goals.targetWeightKg, unit))
        : ''
    );
  }, [state.goals, unit]);

  useEffect(() => {
    setHydrationMl(dailyWaterGoalMl > 0 ? String(dailyWaterGoalMl) : '2500');
  }, [dailyWaterGoalMl]);

  const editorMacroPcts = useMemo(() => {
    const pCal = (parseFloat(protein) || 0) * 4;
    const cCal = (parseFloat(carbs) || 0) * 4;
    const fCal = (parseFloat(fat) || 0) * 9;
    const total = pCal + cCal + fCal;
    if (total <= 0) return { proteinPct: 30, carbsPct: 45, fatPct: 25 };
    const pPct = Math.round((pCal / total) * 100);
    const fPct = Math.round((fCal / total) * 100);
    const cPct = Math.max(0, 100 - pPct - fPct);
    return { proteinPct: pPct, carbsPct: cPct, fatPct: fPct };
  }, [carbs, fat, protein]);

  const applyMacroRatios = (nextCal: number, pPct: number, fPct: number) => {
    if (!Number.isFinite(nextCal) || nextCal <= 0) return;
    const clampedP = Math.min(50, Math.max(15, pPct));
    const clampedF = Math.min(45, Math.max(15, fPct));
    const cPct = Math.max(10, 100 - clampedP - clampedF);
    const totalPct = clampedP + clampedF + cPct;
    const normP = clampedP / totalPct;
    const normF = clampedF / totalPct;
    const normC = cPct / totalPct;

    setCalories(String(nextCal));
    setProtein(String(Math.round((nextCal * normP) / 4)));
    setCarbs(String(Math.round((nextCal * normC) / 4)));
    setFat(String(Math.round((nextCal * normF) / 9)));
    setFibre(String(Math.max(20, Math.round((nextCal / 1000) * 14))));
  };

  const estimatedMacroCalories =
    (parseFloat(protein) || 0) * 4 +
    (parseFloat(carbs) || 0) * 4 +
    (parseFloat(fat) || 0) * 9;

  const handleManualSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cal = Math.round(parseFloat(calories));
    const pro = Math.round(parseFloat(protein));
    const carb = Math.round(parseFloat(carbs));
    const f = Math.round(parseFloat(fat));
    const fib = Math.round(parseFloat(fibre));
    const hyd = Math.round(parseFloat(hydrationMl));

    if ([cal, pro, carb, f, fib].some((v) => !Number.isFinite(v) || v <= 0)) {
      setManualError('All calorie, protein, carbs, fat, and fibre targets must be positive numbers.');
      return;
    }

    if (!Number.isFinite(hyd) || hyd < 500 || hyd > 10000) {
      setManualError('Hydration target must be between 500 ml and 10,000 ml.');
      return;
    }

    let targetWeightKg: number | undefined = undefined;
    if (targetWeight.trim() !== '') {
      const tw = parseFloat(targetWeight);
      if (!Number.isFinite(tw) || tw <= 0) {
        setManualError('Target weight must be a positive number.');
        return;
      }
      targetWeightKg = convertDisplayWeightToKg(tw, unit);
    }

    setManualError('');
    setDailyWaterGoalMl(hyd);
    updateGoals(
      {
        preset: 'custom',
        calories: cal,
        protein: pro,
        carbs: carb,
        fat: f,
        fibre: fib,
        targetWeightKg,
        estimatedBmr: state.goals.estimatedBmr,
        estimatedTdee: state.goals.estimatedTdee,
        adaptiveTdeeKcal: state.goals.adaptiveTdeeKcal,
        bmi: state.goals.bmi,
        goalSpeed: state.goals.goalSpeed,
        estimatedWeeks: state.goals.estimatedWeeks,
        macroFocus: state.goals.macroFocus,
        assessmentWeekNumber: state.goals.assessmentWeekNumber,
        initialCalculatedAt: state.goals.initialCalculatedAt,
        calculationVersion: state.goals.calculationVersion,
        manualOverrideActive: true,
      },
      {
        adjustmentType: 'manual',
        adjustmentReason: `Custom targets saved (${cal.toLocaleString()} kcal, ${pro}P/${carb}C/${f}F, ${hyd.toLocaleString()} ml water).`,
        manualOverrideActive: true,
      }
    );

    setCustomSavedNotice(true);
    setTimeout(() => setCustomSavedNotice(false), 3000);
  };

  const handleEditGoalInCalculator = () => {
    setActiveGoalsTab('calculator');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // First-time user experience: clean onboarding flow without dummy dashboard metrics
  if (!isProfileConfigured) {
    return (
      <div className="space-y-6 max-w-4xl">
        <section className="flex flex-col gap-1">
          <p className="text-xs text-[#52555E] dark:text-[#9A9CA3]">
            Personalized calorie, macro, hydration &amp; 14-day adaptive targets
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#111317] dark:text-[#F3F4F6]">
            Nutrition Goals
          </h1>
        </section>

        <SmartCalorieTrackerPanel compactHeader hideLegacyAssessmentSection />
      </div>
    );
  }

  const goalLabel = isCustomActive
    ? 'Custom Nutrition Plan'
    : getGoalDisplayLabel(profile.fitnessGoal);

  const displayedTargetWeightKg =
    state.goals.targetWeightKg && state.goals.targetWeightKg >= 30
      ? state.goals.targetWeightKg
      : profile.targetWeightKg >= 30
      ? profile.targetWeightKg
      : null;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <section className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-xs text-[#52555E] dark:text-[#9A9CA3]">
            Weekly intake averages, weight trend &amp; 14-day adaptive progress
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-[#111317] dark:text-[#F3F4F6]">
            Nutrition Goals
          </h1>
        </div>
      </section>

      {/* Main Segmented Toggle: Goals | Smart Calc */}
      <nav
        aria-label="Nutrition goals sections"
        className="grid grid-cols-2 p-1 rounded-2xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 max-w-sm"
      >
        <button
          type="button"
          onClick={() => setActiveGoalsTab('goals')}
          className={`min-h-[40px] px-4 rounded-xl text-xs sm:text-sm font-bold transition-colors whitespace-nowrap cursor-pointer ${
            activeGoalsTab === 'goals'
              ? 'bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          Goals
        </button>
        <button
          type="button"
          onClick={() => setActiveGoalsTab('calculator')}
          className={`min-h-[40px] px-4 rounded-xl text-xs sm:text-sm font-bold transition-colors whitespace-nowrap cursor-pointer ${
            activeGoalsTab === 'calculator'
              ? 'bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          Calculator
        </button>
      </nav>

      {activeGoalsTab === 'goals' ? (
        <div className="space-y-5">
          <WeeklyAssessmentBanner />

          {/* Section A: Compact Active Goal Summary */}
          {state.goals.calories > 0 && (
            <section
              aria-label="Active Goal Summary"
              className="rounded-2xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#111317] p-4 sm:p-5 space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#52555E] dark:text-[#9A9CA3]">
                    <span className="font-bold uppercase tracking-[0.08em]">Active Goal</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1 font-medium text-[#111317] dark:text-zinc-300">
                      {isCustomActive && <Lock className="w-3 h-3 text-sky-500" />}
                      {isCustomActive ? 'Custom targets' : 'Smart Calculator targets'}
                    </span>
                  </div>
                  <h2 className="mt-0.5 text-lg sm:text-xl font-bold text-[#111317] dark:text-white truncate">
                    {goalLabel}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={handleEditGoalInCalculator}
                  className="min-h-[44px] px-4 rounded-xl border border-black/15 dark:border-white/15 text-xs sm:text-sm font-bold text-[#111317] dark:text-white hover:bg-stone-100 dark:hover:bg-white/5 transition inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Edit Goal</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 pt-3 border-t border-black/8 dark:border-white/10">
                <div>
                  <div className="text-[11px] text-[#52555E] dark:text-[#9A9CA3]">Calories</div>
                  <div className="mt-0.5 text-base font-bold font-mono-nums tabular-nums text-[#4E6800] dark:text-[#C8FF00]">
                    {state.goals.calories.toLocaleString()}
                    <span className="text-[11px] font-normal text-[#52555E] dark:text-[#9A9CA3] ml-1">
                      kcal
                    </span>
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-[#52555E] dark:text-[#9A9CA3]">Protein</div>
                  <div className="mt-0.5 text-base font-bold font-mono-nums tabular-nums text-[#111317] dark:text-white">
                    {state.goals.protein}g
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-[#52555E] dark:text-[#9A9CA3]">Carbs</div>
                  <div className="mt-0.5 text-base font-bold font-mono-nums tabular-nums text-[#111317] dark:text-white">
                    {state.goals.carbs}g
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-[#52555E] dark:text-[#9A9CA3]">Fat</div>
                  <div className="mt-0.5 text-base font-bold font-mono-nums tabular-nums text-[#111317] dark:text-white">
                    {state.goals.fat}g
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-[#52555E] dark:text-[#9A9CA3]">Fibre</div>
                  <div className="mt-0.5 text-base font-bold font-mono-nums tabular-nums text-[#111317] dark:text-white">
                    {state.goals.fibre}g
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-[#52555E] dark:text-[#9A9CA3]">Hydration</div>
                  <div className="mt-0.5 text-base font-bold font-mono-nums tabular-nums text-sky-600 dark:text-sky-400">
                    {dailyWaterGoalMl.toLocaleString()} ml
                  </div>
                </div>

                <div>
                  <div className="text-[11px] text-[#52555E] dark:text-[#9A9CA3]">
                    Current → Target
                  </div>
                  <div className="mt-0.5 text-sm font-bold font-mono-nums tabular-nums text-[#111317] dark:text-white">
                    {effectiveCurrentWeightKg >= 30
                      ? formatWeight(effectiveCurrentWeightKg, unit)
                      : '—'}{' '}
                    → {displayedTargetWeightKg ? formatWeight(displayedTargetWeightKg, unit) : '—'}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Section B: Weekly Nutrition Progress (Monday–Sunday + 4-Week Averages) */}
          <WeeklyNutritionProgressCard
            report={weeklyNutritionReport}
            fourWeekReports={fourWeekNutritionReports}
            isDark={isDark}
            onPrevWeek={() => setNutritionWeekOffset((w) => w - 1)}
            onNextWeek={() => setNutritionWeekOffset((w) => Math.min(0, w + 1))}
            onResetCurrentWeek={() => setNutritionWeekOffset(0)}
            onSelectWeekOffset={(offset) => setNutritionWeekOffset(Math.min(0, offset))}
            onGoToFoodLog={() => setActiveTab('food-log')}
          />

          {/* Section C: Weight Progress (Dedicated Chart) */}
          <WeightProgressCard
            data={weeklyWeightProgress}
            unit={unit}
            isDark={isDark}
            windowWeeks={weightWindowWeeks}
            onChangeWindowWeeks={(w) => {
              setWeightWindowWeeks(w);
              setWeightWeekOffset(0);
            }}
            onPrevPeriod={() => setWeightWeekOffset((w) => w - 1)}
            onNextPeriod={() => setWeightWeekOffset((w) => Math.min(0, w + 1))}
            onResetCurrent={() => setWeightWeekOffset(0)}
            onOpenWeightModal={() => openWeightModal()}
          />

          {/* Section D: AI 14-Day Progress Review */}
          <AdaptiveAssessmentCard
            profile={profile}
            goals={state.goals}
            dueStatus={assessmentDueStatus}
            assessments={weeklyAssessments}
            unit={unit}
            loading={weeklyAssessmentModal.loading}
            onRunAssessment={() => void runWeeklyAssessment({ openModal: true })}
            onOpenModal={(a) => openWeeklyAssessmentModal(a)}
            onApplyAssessment={(a) => applyWeeklyAssessment(a)}
            onDismissAssessment={(a) => dismissWeeklyAssessment(a)}
            onClearManualOverride={clearManualOverride}
          />

          {/* Target History Timeline */}
          <TargetHistorySection targetHistory={targetHistory} />
        </div>
      ) : (
        /* SMART CALC TAB */
        <div className="space-y-6">
          <SmartCalorieTrackerPanel compactHeader />

          {/* Custom Targets / Custom Diet */}
          <section
            aria-label="Custom Targets"
            className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 sm:p-6 space-y-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-start gap-3">
                <SlidersHorizontal className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00] shrink-0 mt-1" />
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                    Custom Targets / Custom Diet
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Set exact calorie, macro, and hydration targets manually. Custom targets are
                    protected and never overwritten automatically.
                  </p>
                </div>
              </div>
              {isCustomActive && (
                <span className="text-xs font-semibold text-sky-600 dark:text-sky-400 inline-flex items-center gap-1 whitespace-nowrap">
                  <Lock className="w-3.5 h-3.5" />
                  Custom Plan Active
                </span>
              )}
            </div>

            <form onSubmit={handleManualSave} className="space-y-5">
              {/* Macro % Helper */}
              <div className="rounded-xl border border-black/10 dark:border-white/12 bg-stone-50/60 dark:bg-[#090A0C]/40 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    Macro % Split Helper (scales grams to your calorie target)
                  </span>
                  <span className="font-mono-nums text-slate-600 dark:text-slate-300">
                    {editorMacroPcts.proteinPct}% Protein · {editorMacroPcts.carbsPct}% Carbs ·{' '}
                    {editorMacroPcts.fatPct}% Fat
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 mb-1">
                      <span>Protein Share</span>
                      <span className="font-mono-nums font-semibold">
                        {editorMacroPcts.proteinPct}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="15"
                      max="50"
                      step="5"
                      value={Math.min(50, Math.max(15, Math.round(editorMacroPcts.proteinPct / 5) * 5))}
                      onChange={(e) => {
                        const baseCal = Math.max(
                          1200,
                          parseInt(calories, 10) || state.goals.calories || 0
                        );
                        if (baseCal > 0) {
                          applyMacroRatios(baseCal, Number(e.target.value), editorMacroPcts.fatPct);
                        }
                      }}
                      className="w-full accent-[#4E6800] dark:accent-[#C8FF00]"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 mb-1">
                      <span>Fat Share</span>
                      <span className="font-mono-nums font-semibold">
                        {editorMacroPcts.fatPct}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="15"
                      max="45"
                      step="5"
                      value={Math.min(45, Math.max(15, Math.round(editorMacroPcts.fatPct / 5) * 5))}
                      onChange={(e) => {
                        const baseCal = Math.max(
                          1200,
                          parseInt(calories, 10) || state.goals.calories || 0
                        );
                        if (baseCal > 0) {
                          applyMacroRatios(baseCal, editorMacroPcts.proteinPct, Number(e.target.value));
                        }
                      }}
                      className="w-full accent-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {manualError && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-xs font-medium">
                  {manualError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Daily Calories (kcal)
                  </label>
                  <input
                    type="number"
                    min="500"
                    max="10000"
                    value={calories}
                    onChange={(e) => setCalories(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Protein (g)
                  </label>
                  <input
                    type="number"
                    min="10"
                    value={protein}
                    onChange={(e) => setProtein(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Carbs (g)
                  </label>
                  <input
                    type="number"
                    min="10"
                    value={carbs}
                    onChange={(e) => setCarbs(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Fat (g)
                  </label>
                  <input
                    type="number"
                    min="10"
                    value={fat}
                    onChange={(e) => setFat(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Fibre (g)
                  </label>
                  <input
                    type="number"
                    min="5"
                    value={fibre}
                    onChange={(e) => setFibre(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Hydration (ml)
                  </label>
                  <input
                    type="number"
                    min="500"
                    max="10000"
                    step="100"
                    value={hydrationMl}
                    onChange={(e) => setHydrationMl(e.target.value)}
                    className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Target Weight ({unit}, optional)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    value={targetWeight}
                    onChange={(e) => setTargetWeight(e.target.value)}
                    placeholder={`e.g. ${unit === 'kg' ? '64.0' : '141.0'}`}
                    className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-stone-100 dark:border-white/12 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  Macro calorie total:{' '}
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {Math.round(estimatedMacroCalories).toLocaleString()} kcal
                  </span>{' '}
                  · P {editorMacroPcts.proteinPct}% / C {editorMacroPcts.carbsPct}% / F{' '}
                  {editorMacroPcts.fatPct}%
                </div>

                <button
                  type="submit"
                  className="min-h-[44px] px-6 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-sm font-bold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{customSavedNotice ? 'Custom Targets Saved' : 'Save Custom Targets'}</span>
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
};
