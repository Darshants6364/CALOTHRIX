import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  Droplets,
  Dumbbell,
  Flame,
  History,
  Info,
  Scale,
  ShieldAlert,
  Sparkles,
  Target,
} from 'lucide-react';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import type {
  ActivityLevel,
  BiologicalSex,
  GoalSpeed,
  MacroFocusType,
  SmartFitnessGoalType,
  WorkoutIntensity,
} from '../types';
import {
  ACTIVITY_MULTIPLIERS,
  buildWhatIfGoalComparisons,
  calculateSmartFitnessTargets,
  CALCULATION_VERSION,
  ClimateLevel,
  getGoalDirectionForStrategy,
  GOAL_SPEED_CONFIG,
  MACRO_FOCUS_META,
  normalizeFitnessGoal,
  normalizeMacroFocus,
  SMART_FITNESS_GOAL_META,
  SweatRateLevel,
  validateCalculatorInput,
} from '../utils/fitnessCalculator';
import { formatWeightDisplay, kgToLbs, lbsToKg } from '../utils/nutritionUtils';

interface SmartCalorieTrackerPanelProps {
  compactHeader?: boolean;
  onApplied?: () => void;
}

const ORDERED_GOALS: SmartFitnessGoalType[] = [
  'build_muscle',
  'fat_gain',
  'lose_weight',
  'recomposition',
  'maintain_weight',
];

const ORDERED_MACRO_FOCUS: MacroFocusType[] = [
  'balanced',
  'high_protein',
  'lower_carb',
  'athletic',
];

export const SmartCalorieTrackerPanel: React.FC<SmartCalorieTrackerPanelProps> = ({
  compactHeader = false,
  onApplied,
}) => {
  const {
    state,
    latestWeightEntry,
    updateProfile,
    updateGoals,
    updateWeightGoal,
    setDailyWaterGoalMl,
    notify,
    weeklyAssessments,
    assessmentDueStatus,
    runWeeklyAssessment,
    openWeeklyAssessmentModal,
    weeklyAssessmentModal,
  } = useMacroLogStore();

  const unit = state.settings.weightUnit;
  const initialWeightKg =
    latestWeightEntry?.weightKg && latestWeightEntry.weightKg >= 30
      ? latestWeightEntry.weightKg
      : state.profile.currentWeightKg >= 30
      ? state.profile.currentWeightKg
      : 70;
  const initialTargetKg =
    state.profile.targetWeightKg >= 30
      ? state.profile.targetWeightKg
      : state.goals.targetWeightKg && state.goals.targetWeightKg >= 30
      ? state.goals.targetWeightKg
      : initialWeightKg;

  // Draft calculator inputs (live recalculation without mutating active goals until explicit confirmation)
  const [age, setAge] = useState<string>(String(state.profile.age >= 14 ? state.profile.age : 26));
  const [biologicalSex, setBiologicalSex] = useState<BiologicalSex>(
    state.profile.biologicalSex || 'male'
  );
  const [heightCm, setHeightCm] = useState<string>(
    String(state.profile.heightCm >= 120 ? state.profile.heightCm : 172)
  );
  const [currentWeightDisplay, setCurrentWeightDisplay] = useState<string>(
    String(unit === 'lbs' ? kgToLbs(initialWeightKg) : Math.round(initialWeightKg * 10) / 10)
  );
  const [targetWeightDisplay, setTargetWeightDisplay] = useState<string>(
    String(unit === 'lbs' ? kgToLbs(initialTargetKg) : Math.round(initialTargetKg * 10) / 10)
  );
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(
    state.profile.activityLevel || 'moderate'
  );
  const [dailyAverageSteps, setDailyAverageSteps] = useState<string>(
    String(state.profile.dailyAverageSteps || 8000)
  );
  const [workoutFrequency, setWorkoutFrequency] = useState<string>(
    String(state.profile.workoutFrequencyPerWeek ?? 4)
  );
  const [workoutIntensity, setWorkoutIntensity] = useState<WorkoutIntensity>(
    state.profile.workoutIntensity || 'moderate'
  );
  const [fitnessGoal, setFitnessGoal] = useState<SmartFitnessGoalType>(
    normalizeFitnessGoal(state.profile.fitnessGoal)
  );
  const [goalSpeed, setGoalSpeed] = useState<GoalSpeed>(
    state.profile.goalSpeed || state.goals.goalSpeed || 'moderate'
  );
  const [macroFocus, setMacroFocus] = useState<MacroFocusType>(
    normalizeMacroFocus(state.profile.macroFocus || state.goals.macroFocus)
  );
  const [bodyFatPct, setBodyFatPct] = useState<string>(
    state.profile.bodyFatPct != null ? String(state.profile.bodyFatPct) : ''
  );
  const [isPregnantOrBreastfeeding, setIsPregnantOrBreastfeeding] = useState<boolean>(
    Boolean(state.profile.isPregnantOrBreastfeeding)
  );
  const [doesResistanceTraining, setDoesResistanceTraining] = useState<boolean>(
    (state.profile.workoutFrequencyPerWeek ?? 4) >= 2
  );
  const [avgWorkoutDurationMin, setAvgWorkoutDurationMin] = useState<string>(
    (state.profile.workoutFrequencyPerWeek ?? 4) > 0 ? '45' : '0'
  );
  const [sweatRateLevel, setSweatRateLevel] = useState<SweatRateLevel>('moderate');
  const [climateLevel, setClimateLevel] = useState<ClimateLevel>('temperate');
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [showWhatIf, setShowWhatIf] = useState<boolean>(true);
  const [showTransparency, setShowTransparency] = useState<boolean>(false);
  const [justApplied, setJustApplied] = useState<boolean>(false);

  const parsedWeightKg = useMemo(() => {
    const val = Number(currentWeightDisplay);
    if (!Number.isFinite(val) || val <= 0) return 0;
    return unit === 'lbs' ? lbsToKg(val) : val;
  }, [currentWeightDisplay, unit]);

  const parsedTargetWeightKg = useMemo(() => {
    const val = Number(targetWeightDisplay);
    if (!Number.isFinite(val) || val <= 0) return parsedWeightKg;
    return unit === 'lbs' ? lbsToKg(val) : val;
  }, [targetWeightDisplay, unit, parsedWeightKg]);

  const validation = useMemo(
    () =>
      validateCalculatorInput({
        age: Number(age),
        biologicalSex,
        heightCm: Number(heightCm),
        currentWeightKg: parsedWeightKg,
        targetWeightKg: parsedTargetWeightKg,
        dailyAverageSteps: Number(dailyAverageSteps),
        activityLevel,
        workoutFrequencyPerWeek: Number(workoutFrequency),
        workoutIntensity,
        avgWorkoutDurationMin: Number(avgWorkoutDurationMin),
        sweatRateLevel,
        climateLevel,
        doesResistanceTraining,
        fitnessGoal,
        goalSpeed,
        macroFocus,
        bodyFatPct: bodyFatPct.trim() === '' ? null : Number(bodyFatPct),
        isPregnantOrBreastfeeding,
        adaptiveTdeeKcal: state.profile.adaptiveTdeeKcal ?? state.goals.adaptiveTdeeKcal ?? null,
        useAdaptiveTdee: Boolean(state.profile.adaptiveTdeeKcal ?? state.goals.adaptiveTdeeKcal),
      }),
    [
      age,
      biologicalSex,
      heightCm,
      parsedWeightKg,
      parsedTargetWeightKg,
      dailyAverageSteps,
      activityLevel,
      workoutFrequency,
      workoutIntensity,
      avgWorkoutDurationMin,
      sweatRateLevel,
      climateLevel,
      doesResistanceTraining,
      fitnessGoal,
      goalSpeed,
      macroFocus,
      bodyFatPct,
      isPregnantOrBreastfeeding,
      state.profile.adaptiveTdeeKcal,
      state.goals.adaptiveTdeeKcal,
    ]
  );

  const calculation = useMemo(() => {
    if (!validation.valid || !validation.sanitized) return null;
    return calculateSmartFitnessTargets(validation.sanitized);
  }, [validation]);

  const whatIfComparisons = useMemo(() => {
    if (!validation.valid || !validation.sanitized) return [];
    return buildWhatIfGoalComparisons(validation.sanitized);
  }, [validation]);

  const handleApplyToGoals = () => {
    if (!validation.valid || !validation.sanitized || !calculation) {
      notify(validation.errors[0] || 'Please fix highlighted inputs first.', 'error');
      return;
    }

    const sanitized = validation.sanitized;
    const now = new Date().toISOString();

    updateProfile({
      age: sanitized.age,
      biologicalSex: sanitized.biologicalSex,
      heightCm: sanitized.heightCm,
      currentWeightKg: sanitized.currentWeightKg,
      targetWeightKg: sanitized.targetWeightKg,
      dailyAverageSteps: sanitized.dailyAverageSteps ?? 7500,
      activityLevel: sanitized.activityLevel,
      workoutFrequencyPerWeek: sanitized.workoutFrequencyPerWeek,
      workoutIntensity: sanitized.workoutIntensity || 'moderate',
      fitnessGoal: calculation.normalizedGoal,
      goalSpeed: calculation.goalSpeed,
      macroFocus: calculation.macroFocus,
      bodyFatPct: sanitized.bodyFatPct ?? null,
      isPregnantOrBreastfeeding: Boolean(sanitized.isPregnantOrBreastfeeding),
    });

    updateGoals({
      preset: calculation.normalizedGoal,
      calories: calculation.recommendedCalories,
      protein: calculation.proteinGrams,
      carbs: calculation.carbsGrams,
      fat: calculation.fatGrams,
      fibre: calculation.fibreGrams,
      targetWeightKg: sanitized.targetWeightKg,
      estimatedBmr: calculation.bmr,
      estimatedTdee: calculation.estimatedTdeeKcal,
      adaptiveTdeeKcal: calculation.adaptiveTdeeKcal,
      macroFocus: calculation.macroFocus,
      assessmentWeekNumber: state.goals.assessmentWeekNumber ?? 0,
      initialCalculatedAt: state.goals.initialCalculatedAt || now,
      calculationVersion: calculation.calculationVersion,
      bmi: calculation.bmi,
      goalSpeed: calculation.goalSpeed,
      estimatedWeeks: calculation.estimatedWeeks,
    });

    updateWeightGoal({
      startingWeightKg:
        state.weightGoal.startingWeightKg > 0
          ? state.weightGoal.startingWeightKg
          : sanitized.currentWeightKg,
      targetWeightKg: sanitized.targetWeightKg,
      goalDirection: getGoalDirectionForStrategy(
        calculation.normalizedGoal,
        sanitized.currentWeightKg,
        sanitized.targetWeightKg
      ),
    });

    setDailyWaterGoalMl(calculation.recommendedWaterMl);
    setJustApplied(true);
    setTimeout(() => setJustApplied(false), 3000);
    notify(
      `Applied Smart Calorie Tracker plan: ${calculation.recommendedCalories.toLocaleString()} kcal/day`
    );
    onApplied?.();
  };

  const latestAppliedAssessment = useMemo(
    () => weeklyAssessments.find((a) => a.status === 'applied') || null,
    [weeklyAssessments]
  );

  return (
    <div className="space-y-4 min-w-0">
      {/* Header */}
      {!compactHeader && (
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-[#C8FF00]">
              Scientific Nutrition Engine
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
              Smart Calorie Tracker
            </h2>
            <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 mt-0.5">
              Live BMR, calibrated maintenance TDEE, goal-specific macros, and 7-day adaptive check-ins.
            </p>
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Predicted values are evidence-based estimates · Active goals only change when you tap Apply
          </div>
        </div>
      )}

      {/* Main Responsive Layout: Single Unified Input Box Left + Live Results Right on Desktop, Stacked on Mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT COLUMN: Single Unified Calculator Input Box */}
        <section className="lg:col-span-7 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#111317] p-4 sm:p-5 space-y-5 min-w-0">
          {/* 1. Body Measurements */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-zinc-600 dark:text-zinc-300">
                <Scale className="w-4 h-4 text-zinc-700 dark:text-[#C8FF00]" />
                <span>Body Measurements</span>
              </div>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Units: cm · {unit}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                  Age (14–100)
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={14}
                  max={100}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-zinc-200 dark:border-white/12 bg-zinc-50 dark:bg-[#090A0C] text-sm font-mono-nums tabular-nums text-zinc-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-[#C8FF00]"
                />
              </label>

              <div className="space-y-1">
                <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 block">
                  Biological Sex
                </span>
                <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-[#090A0C] border border-zinc-200 dark:border-white/10 min-h-[44px]">
                  {(['male', 'female'] as const).map((sex) => (
                    <button
                      key={sex}
                      type="button"
                      onClick={() => setBiologicalSex(sex)}
                      className={`rounded-lg text-xs font-semibold capitalize transition cursor-pointer ${
                        biologicalSex === sex
                          ? 'bg-zinc-950 text-white dark:bg-[#C8FF00] dark:text-[#090A0C]'
                          : 'text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      {sex}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block space-y-1 col-span-2 sm:col-span-1">
                <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                  Height (cm)
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={120}
                  max={240}
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-zinc-200 dark:border-white/12 bg-zinc-50 dark:bg-[#090A0C] text-sm font-mono-nums tabular-nums text-zinc-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-[#C8FF00]"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                  Current Weight ({unit})
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={currentWeightDisplay}
                  onChange={(e) => setCurrentWeightDisplay(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-zinc-200 dark:border-white/12 bg-zinc-50 dark:bg-[#090A0C] text-sm font-mono-nums tabular-nums text-zinc-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-[#C8FF00]"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                  Target Weight ({unit})
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={targetWeightDisplay}
                  onChange={(e) => setTargetWeightDisplay(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-zinc-200 dark:border-white/12 bg-zinc-50 dark:bg-[#090A0C] text-sm font-mono-nums tabular-nums text-zinc-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-[#C8FF00]"
                />
              </label>

              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="col-span-2 sm:col-span-1 self-end min-h-[44px] px-3 rounded-xl border border-dashed border-zinc-300 dark:border-white/15 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>{showAdvanced ? 'Hide Optional' : 'Optional BF% / Sweat / Safety'}</span>
                {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>

            {showAdvanced && (
              <div className="pt-2.5 border-t border-zinc-200/70 dark:border-white/8 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                      Body-Fat % (Optional · enables Katch-McArdle for 18+)
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={4}
                      max={60}
                      step="0.5"
                      placeholder="Leave blank for standard equation"
                      value={bodyFatPct}
                      onChange={(e) => setBodyFatPct(e.target.value)}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-zinc-200 dark:border-white/12 bg-zinc-50 dark:bg-[#090A0C] text-sm font-mono-nums tabular-nums text-zinc-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-[#C8FF00]"
                    />
                  </label>

                  <label className="flex items-center gap-3 min-h-[44px] px-3 py-2 rounded-xl border border-zinc-200 dark:border-white/12 bg-zinc-50 dark:bg-[#090A0C] cursor-pointer self-end">
                    <input
                      type="checkbox"
                      checked={isPregnantOrBreastfeeding}
                      onChange={(e) => setIsPregnantOrBreastfeeding(e.target.checked)}
                      className="w-4 h-4 accent-zinc-950 dark:accent-[#C8FF00]"
                    />
                    <span className="text-xs text-zinc-700 dark:text-zinc-300 leading-tight">
                      Pregnant or breastfeeding (excludes automated calorie deficits/prescriptions)
                    </span>
                  </label>
                </div>

                {/* Factor-Dependent Hydration Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <label className="block space-y-1">
                    <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                      Avg Workout Duration (min)
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={240}
                      step={5}
                      value={avgWorkoutDurationMin}
                      onChange={(e) => setAvgWorkoutDurationMin(e.target.value)}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-zinc-200 dark:border-white/12 bg-zinc-50 dark:bg-[#090A0C] text-sm font-mono-nums tabular-nums text-zinc-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-[#C8FF00]"
                    />
                  </label>

                  <div className="space-y-1">
                    <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 block">
                      Sweat Rate
                    </span>
                    <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-[#090A0C] border border-zinc-200 dark:border-white/10 min-h-[44px]">
                      {(['low', 'moderate', 'high'] as const).map((level) => (
                        <button
                          key={level}
                          type="button"
                          onClick={() => setSweatRateLevel(level)}
                          className={`rounded-lg text-[11px] font-semibold capitalize transition cursor-pointer ${
                            sweatRateLevel === level
                              ? 'bg-zinc-950 text-white dark:bg-[#C8FF00] dark:text-[#090A0C]'
                              : 'text-zinc-600 dark:text-zinc-400'
                          }`}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 block">
                      Climate
                    </span>
                    <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-[#090A0C] border border-zinc-200 dark:border-white/10 min-h-[44px]">
                      {[
                        { id: 'temperate' as const, label: 'Mild' },
                        { id: 'warm_humid' as const, label: 'Hot/Humid' },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setClimateLevel(opt.id)}
                          className={`rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                            climateLevel === opt.id
                              ? 'bg-zinc-950 text-white dark:bg-[#C8FF00] dark:text-[#090A0C]'
                              : 'text-zinc-600 dark:text-zinc-400'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 2. Activity & Training (Custom Calibrated Non-Overlapping PAL Estimate) */}
          <div className="pt-4 border-t border-zinc-200/80 dark:border-white/10 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-zinc-600 dark:text-zinc-300">
                <Activity className="w-4 h-4 text-zinc-700 dark:text-[#C8FF00]" />
                <span>Activity & Training</span>
              </div>
              {calculation && (
                <span className="text-[11px] font-mono-nums tabular-nums text-zinc-500 dark:text-zinc-400">
                  Custom PAL Est. ×{calculation.activityMultiplier.toFixed(2)} (Std. ×
                  {calculation.activityBreakdown.conventionalTierMultiplier})
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              {(Object.keys(ACTIVITY_MULTIPLIERS) as ActivityLevel[]).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setActivityLevel(level)}
                  className={`min-h-[44px] px-2.5 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer text-center ${
                    activityLevel === level
                      ? 'border-zinc-950 bg-zinc-950 text-white dark:border-[#C8FF00] dark:bg-[#C8FF00]/15 dark:text-[#C8FF00]'
                      : 'border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5'
                  }`}
                >
                  {ACTIVITY_MULTIPLIERS[level].shortLabel}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                  Avg Daily Steps
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={50000}
                  step={500}
                  value={dailyAverageSteps}
                  onChange={(e) => setDailyAverageSteps(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-zinc-200 dark:border-white/12 bg-zinc-50 dark:bg-[#090A0C] text-sm font-mono-nums tabular-nums text-zinc-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-[#C8FF00]"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                  Workouts / Week (0–14)
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={14}
                  value={workoutFrequency}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setWorkoutFrequency(nextVal);
                    if (Number(nextVal) === 0) setDoesResistanceTraining(false);
                  }}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-zinc-200 dark:border-white/12 bg-zinc-50 dark:bg-[#090A0C] text-sm font-mono-nums tabular-nums text-zinc-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-[#C8FF00]"
                />
              </label>

              <div className="space-y-1 col-span-2 sm:col-span-1">
                <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 block">
                  Workout Intensity
                </span>
                <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-[#090A0C] border border-zinc-200 dark:border-white/10 min-h-[44px]">
                  {(['light', 'moderate', 'vigorous'] as const).map((intensity) => (
                    <button
                      key={intensity}
                      type="button"
                      onClick={() => setWorkoutIntensity(intensity)}
                      className={`rounded-lg text-[11px] font-semibold capitalize transition cursor-pointer ${
                        workoutIntensity === intensity
                          ? 'bg-zinc-950 text-white dark:bg-[#C8FF00] dark:text-[#090A0C]'
                          : 'text-zinc-600 dark:text-zinc-400'
                      }`}
                    >
                      {intensity}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
              Custom calibrated estimate (65% tier + 35% steps/workouts) — avoids double-counting exercise, steps, or TEF.
            </p>
          </div>

          {/* 3. Goal Strategy, Pace & Independent Macro Preference */}
          <div className="pt-4 border-t border-zinc-200/80 dark:border-white/10 space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-zinc-600 dark:text-zinc-300">
              <Target className="w-4 h-4 text-zinc-700 dark:text-[#C8FF00]" />
              <span>Goal Strategy, Pace & Macro Preference</span>
            </div>

            {/* 5 Distinct Fitness Goals */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                Fitness Goal (determines calorie strategy)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ORDERED_GOALS.map((g) => {
                  const meta = SMART_FITNESS_GOAL_META[g];
                  const selected = fitnessGoal === g;
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setFitnessGoal(g)}
                      className={`min-h-[52px] p-3 rounded-xl border text-left transition cursor-pointer ${
                        selected
                          ? 'border-zinc-950 bg-zinc-950 text-white dark:border-[#C8FF00] dark:bg-[#C8FF00]/12 dark:text-white'
                          : 'border-zinc-200 dark:border-white/10 bg-zinc-50/60 dark:bg-white/[0.02] text-zinc-900 dark:text-zinc-200 hover:bg-zinc-100/70 dark:hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs sm:text-sm font-bold">{meta.label}</span>
                        {selected && (
                          <Check className="w-4 h-4 text-white dark:text-[#C8FF00] shrink-0" />
                        )}
                      </div>
                      <p
                        className={`text-[11px] mt-0.5 leading-snug ${
                          selected ? 'text-zinc-300 dark:text-zinc-300' : 'text-zinc-500 dark:text-zinc-400'
                        }`}
                      >
                        {meta.summary}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Resistance Training Check for Build Muscle */}
            {fitnessGoal === 'build_muscle' && (
              <label className="flex items-center gap-3 min-h-[44px] px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-white/12 bg-zinc-50 dark:bg-[#090A0C] cursor-pointer">
                <input
                  type="checkbox"
                  checked={doesResistanceTraining}
                  onChange={(e) => setDoesResistanceTraining(e.target.checked)}
                  className="w-4 h-4 accent-zinc-950 dark:accent-[#C8FF00]"
                />
                <span className="text-xs text-zinc-700 dark:text-zinc-300 leading-snug">
                  I include progressive resistance / strength training (recommended 2–4+ sessions/week for lean muscle gain)
                </span>
              </label>
            )}

            {/* Preferred Pace */}
            {fitnessGoal !== 'maintain_weight' && (
              <div className="space-y-1.5">
                <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                  Preferred Pace
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['slow', 'moderate', 'aggressive'] as const).map((speed) => (
                    <button
                      key={speed}
                      type="button"
                      onClick={() => setGoalSpeed(speed)}
                      className={`min-h-[44px] px-2.5 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                        goalSpeed === speed
                          ? 'border-zinc-950 bg-zinc-950 text-white dark:border-[#C8FF00] dark:bg-[#C8FF00]/15 dark:text-[#C8FF00]'
                          : 'border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      {speed === 'slow'
                        ? 'Slow'
                        : speed === 'moderate'
                        ? 'Moderate'
                        : 'Faster'}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {GOAL_SPEED_CONFIG[goalSpeed].description}
                </p>
              </div>
            )}

            {/* Independent Macro Preference */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                Macro Preference (independent of goal)
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {ORDERED_MACRO_FOCUS.map((focus) => (
                  <button
                    key={focus}
                    type="button"
                    onClick={() => setMacroFocus(focus)}
                    className={`min-h-[44px] px-2.5 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                      macroFocus === focus
                        ? 'border-zinc-950 bg-zinc-950 text-white dark:border-[#C8FF00] dark:bg-[#C8FF00]/15 dark:text-[#C8FF00]'
                        : 'border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    {MACRO_FOCUS_META[focus].shortLabel}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {MACRO_FOCUS_META[macroFocus].description}
              </p>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: Live Results, Explicit Apply Button, Weekly Check-In Card */}
        <div className="lg:col-span-5 space-y-4 min-w-0">
          {!validation.valid || !calculation ? (
            <div className="rounded-2xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase text-red-700 dark:text-red-300">
                <AlertTriangle className="w-4 h-4" />
                Check Calculator Inputs
              </div>
              <ul className="space-y-1 text-xs text-red-700 dark:text-red-200">
                {validation.errors.map((err, i) => (
                  <li key={i}>• {err}</li>
                ))}
              </ul>
            </div>
          ) : (
            <section className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#111317] p-4 sm:p-5 space-y-4">
              {/* Target Calories Hero */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500 dark:text-zinc-400">
                    Recommended Daily Target (Estimate)
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-3xl sm:text-4xl font-extrabold tracking-tight font-mono-nums tabular-nums text-zinc-950 dark:text-[#C8FF00]">
                      {calculation.recommendedCalories.toLocaleString()}
                    </span>
                    <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
                      kcal/day
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300 font-mono-nums tabular-nums">
                    Maint. {calculation.activeMaintenanceKcal.toLocaleString()} kcal ·{' '}
                    {calculation.calorieDelta > 0
                      ? `+${calculation.calorieDelta} kcal (+${calculation.actualCalorieDeltaPct.toFixed(1)}%)`
                      : calculation.calorieDelta < 0
                      ? `${calculation.calorieDelta} kcal (${calculation.actualCalorieDeltaPct.toFixed(1)}%)`
                      : '0 kcal (0%)'}{' '}
                    · {SMART_FITNESS_GOAL_META[calculation.normalizedGoal].label}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {calculation.bmiBasis === 'pediatric_cdc_percentile'
                      ? 'BMI-for-Age (14–17)'
                      : 'BMI Screening'}
                  </div>
                  <div className="text-base font-bold font-mono-nums tabular-nums text-zinc-950 dark:text-white">
                    {calculation.bmi}
                  </div>
                  <div className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                    {calculation.bodyStatusLabel}
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug -mt-1.5">
                {calculation.bmiDisclaimer}
              </p>

              {/* Safety Notice if triggered */}
              {calculation.safetyNote && (
                <div className="rounded-xl border border-amber-300/70 dark:border-amber-500/35 bg-amber-50 dark:bg-amber-500/10 p-3 flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-300" />
                  <span>{calculation.safetyNote}</span>
                </div>
              )}

              {/* Resistance Training Recommendation for Build Muscle */}
              {calculation.resistanceTrainingNote && (
                <div className="rounded-xl border border-sky-300/70 dark:border-sky-500/35 bg-sky-50 dark:bg-sky-500/10 p-3 flex items-start gap-2 text-xs text-sky-900 dark:text-sky-200 leading-relaxed">
                  <Dumbbell className="w-4 h-4 shrink-0 mt-0.5 text-sky-700 dark:text-sky-300" />
                  <span>{calculation.resistanceTrainingNote}</span>
                </div>
              )}

              {/* Energy Breakdown: BMR + Estimated TDEE + Adaptive TDEE */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl bg-zinc-50 dark:bg-[#090A0C] border border-zinc-200/80 dark:border-white/8 p-3">
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Est. Resting Burn (BMR)
                  </div>
                  <div className="mt-0.5 text-base font-bold font-mono-nums tabular-nums text-zinc-950 dark:text-white">
                    {calculation.bmr.toLocaleString()} kcal
                  </div>
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                    {calculation.bmrEquation === 'katch_mcardle'
                      ? 'Katch-McArdle (BF%)'
                      : calculation.bmrEquation === 'schofield_adolescent'
                      ? 'Schofield Adolescent (14–17)'
                      : 'Mifflin-St Jeor (Adult)'}
                  </div>
                </div>

                <div className="rounded-xl bg-zinc-50 dark:bg-[#090A0C] border border-zinc-200/80 dark:border-white/8 p-3">
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {calculation.adaptiveTdeeKcal
                      ? 'Calibrated Adaptive TDEE'
                      : 'Est. Maintenance (TDEE)'}
                  </div>
                  <div className="mt-0.5 text-base font-bold font-mono-nums tabular-nums text-zinc-950 dark:text-white">
                    {calculation.activeMaintenanceKcal.toLocaleString()} kcal
                  </div>
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono-nums tabular-nums">
                    {calculation.adaptiveTdeeKcal
                      ? `Formula: ${calculation.estimatedTdeeKcal.toLocaleString()} (×${calculation.activityMultiplier.toFixed(2)})`
                      : `Custom PAL Est. ×${calculation.activityMultiplier.toFixed(2)}`}
                  </div>
                </div>
              </div>

              {/* Macros Grid */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-zinc-50 dark:bg-[#090A0C] border border-zinc-200/80 dark:border-white/8 p-3 text-center">
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Protein</div>
                  <div className="text-lg font-extrabold font-mono-nums tabular-nums text-zinc-950 dark:text-white">
                    {calculation.proteinGrams}g
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono-nums tabular-nums">
                    {calculation.proteinPct}% · {calculation.proteinPerKgUsed}g/kg
                  </div>
                </div>

                <div className="rounded-xl bg-zinc-50 dark:bg-[#090A0C] border border-zinc-200/80 dark:border-white/8 p-3 text-center">
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Carbs</div>
                  <div className="text-lg font-extrabold font-mono-nums tabular-nums text-zinc-950 dark:text-white">
                    {calculation.carbsGrams}g
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono-nums tabular-nums">
                    {calculation.carbsPct}%
                  </div>
                </div>

                <div className="rounded-xl bg-zinc-50 dark:bg-[#090A0C] border border-zinc-200/80 dark:border-white/8 p-3 text-center">
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Fat</div>
                  <div className="text-lg font-extrabold font-mono-nums tabular-nums text-zinc-950 dark:text-white">
                    {calculation.fatGrams}g
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono-nums tabular-nums">
                    {calculation.fatPct}%
                  </div>
                </div>
              </div>

              {/* Fibre Estimate, Hydration Estimate & Approximate Timeline */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-xl bg-zinc-50 dark:bg-[#090A0C] border border-zinc-200/80 dark:border-white/8 p-2.5">
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Fibre (Est.)</div>
                  <div className="mt-0.5 font-bold font-mono-nums tabular-nums text-zinc-950 dark:text-white">
                    ~{calculation.fibreGrams} g/day
                  </div>
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                    ~14g / 1k kcal
                  </div>
                </div>
                <div className="rounded-xl bg-zinc-50 dark:bg-[#090A0C] border border-zinc-200/80 dark:border-white/8 p-2.5">
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                    <Droplets className="w-3 h-3 text-sky-500 shrink-0" />
                    Hydration (Est.)
                  </div>
                  <div className="mt-0.5 font-bold font-mono-nums tabular-nums text-zinc-950 dark:text-white">
                    {(calculation.recommendedWaterMl / 1000).toFixed(2).replace(/\.?0+$/, '')} L/day
                  </div>
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono-nums tabular-nums truncate">
                    {calculation.hydrationBaseMl}+{calculation.hydrationActivityAddMl}ml
                  </div>
                </div>
                <div className="rounded-xl bg-zinc-50 dark:bg-[#090A0C] border border-zinc-200/80 dark:border-white/8 p-2.5">
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Est. Timeline</div>
                  <div className="mt-0.5 font-bold font-mono-nums tabular-nums text-zinc-950 dark:text-white truncate">
                    {calculation.estimatedWeeksRange
                      ? `~${calculation.estimatedWeeksRange.min}–${calculation.estimatedWeeksRange.max} wks`
                      : calculation.adultPrescriptionBlocked
                      ? 'Safety mode'
                      : 'Steady'}
                  </div>
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
                    {calculation.theoreticalWeeksExact
                      ? `Linear ref ~${calculation.theoreticalWeeksExact.toFixed(0)}w`
                      : 'Adaptive est.'}
                  </div>
                </div>
              </div>

              <div className="space-y-1 text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                {calculation.theoreticalWeeksExact !== null && calculation.estimatedWeeksRange && (
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 font-mono-nums tabular-nums">
                    <span>
                      Theoretical initial pace: {calculation.theoreticalWeeklyRateKg > 0 ? '+' : ''}
                      {calculation.theoreticalWeeklyRateKg.toFixed(2)} kg/wk
                    </span>
                    <span>
                      Adaptive range: ~{calculation.estimatedWeeksRange.min}–
                      {calculation.estimatedWeeksRange.max} wks
                    </span>
                  </div>
                )}
                <p>{calculation.timelineDisclaimer}</p>
                <p>{calculation.hydrationDisclaimer}</p>
              </div>

              {/* Explicit Confirmation CTA */}
              <button
                type="button"
                onClick={handleApplyToGoals}
                className="w-full min-h-[48px] px-4 rounded-xl bg-zinc-950 dark:bg-[#C8FF00] text-white dark:text-[#090A0C] text-sm font-bold tracking-tight hover:opacity-95 active:scale-[0.99] transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {justApplied ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Applied to Your Daily Goals</span>
                  </>
                ) : (
                  <>
                    <Flame className="w-4 h-4" />
                    <span>Apply to My Daily Goals</span>
                  </>
                )}
              </button>
            </section>
          )}

          {/* Weekly AI Check-In Status Card */}
          <section className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#111317] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-zinc-700 dark:text-zinc-200">
                <CalendarClock className="w-4 h-4 text-zinc-700 dark:text-[#C8FF00]" />
                <span>Weekly AI Check-In</span>
              </div>
              <span
                className={`text-[11px] font-bold ${
                  assessmentDueStatus.statusLabel === 'Assessment ready'
                    ? 'text-emerald-600 dark:text-[#C8FF00]'
                    : assessmentDueStatus.statusLabel === 'Low data confidence'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                {assessmentDueStatus.statusLabel}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center font-mono-nums tabular-nums">
              <div className="rounded-xl bg-zinc-50 dark:bg-[#090A0C] border border-zinc-200/80 dark:border-white/8 p-2.5">
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Week</div>
                <div className="text-sm font-bold text-zinc-950 dark:text-white">
                  #{assessmentDueStatus.currentWeekNumber}
                </div>
              </div>
              <div className="rounded-xl bg-zinc-50 dark:bg-[#090A0C] border border-zinc-200/80 dark:border-white/8 p-2.5">
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Food Logs</div>
                <div className="text-sm font-bold text-zinc-950 dark:text-white">
                  {assessmentDueStatus.foodLoggedDays}/7 d
                </div>
              </div>
              <div className="rounded-xl bg-zinc-50 dark:bg-[#090A0C] border border-zinc-200/80 dark:border-white/8 p-2.5">
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Weigh-Ins</div>
                <div className="text-sm font-bold text-zinc-950 dark:text-white">
                  {assessmentDueStatus.weightLoggedDays}/7 d
                </div>
              </div>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {assessmentDueStatus.readinessMessage}
            </p>

            <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 font-mono-nums tabular-nums">
              <span>Next scheduled: {assessmentDueStatus.nextAssessmentDate}</span>
              <span className="capitalize">Confidence: {assessmentDueStatus.confidenceLevel}</span>
            </div>

            <button
              type="button"
              disabled={weeklyAssessmentModal.loading}
              onClick={() => void runWeeklyAssessment({ openModal: true })}
              className="w-full min-h-[44px] px-4 rounded-xl border border-zinc-950 dark:border-[#C8FF00]/50 text-zinc-950 dark:text-[#C8FF00] text-xs sm:text-sm font-bold hover:bg-zinc-950 hover:text-white dark:hover:bg-[#C8FF00]/10 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {weeklyAssessmentModal.loading ? 'Running Check-In...' : 'Run 7-Day AI Assessment'}
              </span>
            </button>
          </section>
        </div>
      </div>

      {/* What-If Goal Comparison Table */}
      {whatIfComparisons.length > 0 && (
        <section className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#111317] overflow-hidden">
          <button
            type="button"
            onClick={() => setShowWhatIf((v) => !v)}
            className="w-full min-h-[48px] px-4 py-3 flex items-center justify-between gap-2 text-left hover:bg-zinc-50 dark:hover:bg-white/[0.02] cursor-pointer"
          >
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.08em] text-zinc-700 dark:text-zinc-200">
                What-If Goal Comparison
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Tap any goal row to preview it above — active goals stay untouched until applied
              </div>
            </div>
            {showWhatIf ? (
              <ChevronUp className="w-4 h-4 text-zinc-500 shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
            )}
          </button>

          {showWhatIf && (
            <div className="border-t border-zinc-200 dark:border-white/10 divide-y divide-zinc-200/80 dark:divide-white/8">
              {whatIfComparisons.map((row) => {
                const isSelected = row.goal === fitnessGoal;
                return (
                  <button
                    key={row.goal}
                    type="button"
                    onClick={() => setFitnessGoal(row.goal)}
                    className={`w-full px-4 py-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 text-left transition cursor-pointer ${
                      isSelected
                        ? 'bg-zinc-950/[0.04] dark:bg-[#C8FF00]/[0.07]'
                        : 'hover:bg-zinc-50 dark:hover:bg-white/[0.02]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm font-bold text-zinc-950 dark:text-white">
                          {row.label}
                        </span>
                        {isSelected && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-700 dark:text-[#C8FF00]">
                            Selected
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono-nums tabular-nums">
                        {row.proteinGrams}g P · {row.carbsGrams}g C · {row.fatGrams}g F · {row.fibreGrams}g Fib
                      </div>
                    </div>

                    <div className="text-right font-mono-nums tabular-nums shrink-0">
                      <div className="text-sm font-extrabold text-zinc-950 dark:text-white">
                        {row.recommendedCalories.toLocaleString()} kcal
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {row.calorieDelta > 0
                          ? `+${row.calorieDelta} kcal`
                          : row.calorieDelta < 0
                          ? `${row.calorieDelta} kcal`
                          : 'Maintenance'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Calculation Transparency & Weekly Assessment History */}
      <section className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#111317] overflow-hidden">
        <button
          type="button"
          onClick={() => setShowTransparency((v) => !v)}
          className="w-full min-h-[48px] px-4 py-3 flex items-center justify-between gap-2 text-left hover:bg-zinc-50 dark:hover:bg-white/[0.02] cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-zinc-600 dark:text-[#C8FF00] shrink-0" />
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.08em] text-zinc-700 dark:text-zinc-200">
                Calculation Transparency & Assessment History
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {weeklyAssessments.length}{' '}
                {weeklyAssessments.length === 1 ? 'check-in' : 'check-ins'} recorded · Engine{' '}
                {state.goals.calculationVersion || CALCULATION_VERSION}
              </div>
            </div>
          </div>
          {showTransparency ? (
            <ChevronUp className="w-4 h-4 text-zinc-500 shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
          )}
        </button>

        {showTransparency && (
          <div className="border-t border-zinc-200 dark:border-white/10 p-4 space-y-4">
            {/* Active Saved Target Audit Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="rounded-xl bg-zinc-50 dark:bg-[#090A0C] border border-zinc-200/80 dark:border-white/8 p-2.5">
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Initial Calculation</div>
                <div className="mt-0.5 font-semibold font-mono-nums tabular-nums text-zinc-900 dark:text-white">
                  {state.goals.initialCalculatedAt
                    ? state.goals.initialCalculatedAt.slice(0, 10)
                    : 'Not applied yet'}
                </div>
              </div>
              <div className="rounded-xl bg-zinc-50 dark:bg-[#090A0C] border border-zinc-200/80 dark:border-white/8 p-2.5">
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Latest Update</div>
                <div className="mt-0.5 font-semibold font-mono-nums tabular-nums text-zinc-900 dark:text-white">
                  {state.goals.updatedAt ? state.goals.updatedAt.slice(0, 10) : '—'}
                </div>
              </div>
              <div className="rounded-xl bg-zinc-50 dark:bg-[#090A0C] border border-zinc-200/80 dark:border-white/8 p-2.5">
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Measured / Trend Wt</div>
                <div className="mt-0.5 font-semibold font-mono-nums tabular-nums text-zinc-900 dark:text-white">
                  {formatWeightDisplay(state.profile.currentWeightKg || 0, unit)}
                  {latestAppliedAssessment
                    ? ` · ${formatWeightDisplay(latestAppliedAssessment.assessedTrendWeightKg, unit)}`
                    : ''}
                </div>
              </div>
              <div className="rounded-xl bg-zinc-50 dark:bg-[#090A0C] border border-zinc-200/80 dark:border-white/8 p-2.5">
                <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Formula vs Adaptive</div>
                <div className="mt-0.5 font-semibold font-mono-nums tabular-nums text-zinc-900 dark:text-white">
                  {state.goals.estimatedTdee ? `${state.goals.estimatedTdee}` : '—'} /{' '}
                  {state.goals.adaptiveTdeeKcal ? `${state.goals.adaptiveTdeeKcal}` : 'Calibrating'}
                </div>
              </div>
            </div>

            {calculation && (
              <div className="rounded-xl bg-zinc-50 dark:bg-[#090A0C] border border-zinc-200/80 dark:border-white/8 p-3.5 space-y-2.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5" />
                  Calculation Transparency Breakdown (Estimates Only)
                </div>
                <dl className="space-y-2 text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  {[
                    { label: 'BMR', text: calculation.calculationBreakdown.bmr },
                    { label: 'Activity Multiplier', text: calculation.calculationBreakdown.activity },
                    { label: 'Maintenance TDEE', text: calculation.calculationBreakdown.tdee },
                    { label: 'Calorie Strategy', text: calculation.calculationBreakdown.calorieStrategy },
                    { label: 'Macros (4/4/9)', text: calculation.calculationBreakdown.macros },
                    { label: 'Fibre & Hydration', text: calculation.calculationBreakdown.fibreAndHydration },
                    { label: 'Estimated Timeline', text: calculation.calculationBreakdown.timeline },
                  ].map((item) => (
                    <div key={item.label} className="grid grid-cols-1 sm:grid-cols-12 gap-0.5 sm:gap-2">
                      <dt className="sm:col-span-3 font-semibold text-zinc-800 dark:text-zinc-100">
                        {item.label}
                      </dt>
                      <dd className="sm:col-span-9">{item.text}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {/* Assessment History List */}
            {weeklyAssessments.length === 0 ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                No weekly check-ins completed yet. Log meals and weigh-ins for 7 days, or tap "Run 7-Day AI Assessment" above to review your first adaptive summary.
              </p>
            ) : (
              <div className="space-y-2">
                {weeklyAssessments.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openWeeklyAssessmentModal(item)}
                    className="w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50/70 dark:bg-[#090A0C] p-3 text-left hover:border-zinc-400 dark:hover:border-[#C8FF00]/40 transition cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-zinc-950 dark:text-white">
                        Week {item.assessmentWeekNumber} · {item.weekStartDate} → {item.weekEndDate}
                      </span>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-600 dark:text-[#C8FF00]">
                        {item.status}
                      </span>
                    </div>
                    <div className="mt-1 text-xs font-mono-nums tabular-nums text-zinc-700 dark:text-zinc-300">
                      {item.previousRecommendedCalories.toLocaleString()} →{' '}
                      {item.recommendedCalories.toLocaleString()} kcal ·{' '}
                      {formatWeightDisplay(item.previousWeightKg, unit)} →{' '}
                      {formatWeightDisplay(item.assessedWeightKg, unit)} ·{' '}
                      {item.confidenceLevel} confidence
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2">
                      {item.adjustmentReason}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
