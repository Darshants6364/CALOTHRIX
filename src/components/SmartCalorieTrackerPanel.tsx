import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Droplets,
  Dumbbell,
  Flame,
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
import { getTodayDateKey } from '../utils/dateUtils';
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
import { kgToLbs, lbsToKg } from '../utils/nutritionUtils';

interface SmartCalorieTrackerPanelProps {
  compactHeader?: boolean;
  hideLegacyAssessmentSection?: boolean;
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

const ONBOARDING_STEPS = [
  { id: 'welcome', title: 'Welcome' },
  { id: 'measurements', title: 'Measurements' },
  { id: 'activity', title: 'Activity' },
  { id: 'goal', title: 'Goal' },
  { id: 'macros', title: 'Macros' },
  { id: 'preview', title: 'Targets' },
] as const;

function formatWeightInput(kg: number, unit: 'kg' | 'lbs'): string {
  if (!Number.isFinite(kg) || kg < 30) return '';
  return unit === 'lbs' ? String(kgToLbs(kg)) : String(Math.round(kg * 10) / 10);
}

function parseOptionalNonNegNumber(raw: string): number {
  if (raw.trim() === '') return NaN;
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

export const SmartCalorieTrackerPanel: React.FC<SmartCalorieTrackerPanelProps> = ({
  compactHeader = false,
  hideLegacyAssessmentSection = false,
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
  } = useMacroLogStore();

  const unit = state.settings.weightUnit;
  const effectiveWeightKg =
    latestWeightEntry?.weightKg && latestWeightEntry.weightKg >= 30
      ? latestWeightEntry.weightKg
      : state.profile.currentWeightKg >= 30
      ? state.profile.currentWeightKg
      : 0;
  const effectiveTargetKg =
    state.profile.targetWeightKg >= 30
      ? state.profile.targetWeightKg
      : state.goals.targetWeightKg && state.goals.targetWeightKg >= 30
      ? state.goals.targetWeightKg
      : 0;

  const isConfigured = Boolean(
    state.profile.onboardingCompleted ||
      (state.profile.age >= 14 &&
        state.profile.heightCm >= 120 &&
        effectiveWeightKg >= 30 &&
        state.goals.calories > 0)
  );

  // Onboarding wizard step (used only while !isConfigured)
  const [onboardingStep, setOnboardingStep] = useState<number>(0);
  const [stepError, setStepError] = useState<string>('');

  // Draft calculator inputs — strictly empty for unconfigured personal measurements
  const [age, setAge] = useState<string>(
    state.profile.age >= 14 ? String(state.profile.age) : ''
  );
  const [biologicalSex, setBiologicalSex] = useState<BiologicalSex | ''>(
    isConfigured && state.profile.biologicalSex ? state.profile.biologicalSex : ''
  );
  const [heightCm, setHeightCm] = useState<string>(
    state.profile.heightCm >= 120 ? String(state.profile.heightCm) : ''
  );
  const [currentWeightDisplay, setCurrentWeightDisplay] = useState<string>(
    formatWeightInput(effectiveWeightKg, unit)
  );
  const [targetWeightDisplay, setTargetWeightDisplay] = useState<string>(
    formatWeightInput(effectiveTargetKg, unit)
  );
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(
    state.profile.activityLevel || 'moderate'
  );
  const [dailyAverageSteps, setDailyAverageSteps] = useState<string>(
    state.profile.dailyAverageSteps > 0 || isConfigured
      ? String(state.profile.dailyAverageSteps ?? 7000)
      : '7000'
  );
  const [workoutFrequency, setWorkoutFrequency] = useState<string>(
    isConfigured ? String(state.profile.workoutFrequencyPerWeek ?? 3) : '3'
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
    (state.profile.workoutFrequencyPerWeek ?? 3) >= 2
  );
  const [avgWorkoutDurationMin, setAvgWorkoutDurationMin] = useState<string>(
    (state.profile.workoutFrequencyPerWeek ?? 3) > 0 ? '45' : '0'
  );
  const [sweatRateLevel, setSweatRateLevel] = useState<SweatRateLevel>('moderate');
  const [climateLevel, setClimateLevel] = useState<ClimateLevel>('temperate');
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [showWhatIf, setShowWhatIf] = useState<boolean>(false);
  const [showTransparency, setShowTransparency] = useState<boolean>(false);
  const [justApplied, setJustApplied] = useState<boolean>(false);

  // Sync draft state whenever saved profile/goals/latestWeight/unit changes externally
  const syncSignature = useMemo(
    () =>
      JSON.stringify({
        isConfigured,
        age: state.profile.age,
        sex: state.profile.biologicalSex,
        heightCm: state.profile.heightCm,
        effectiveWeightKg,
        effectiveTargetKg,
        steps: state.profile.dailyAverageSteps,
        activity: state.profile.activityLevel,
        workouts: state.profile.workoutFrequencyPerWeek,
        intensity: state.profile.workoutIntensity,
        goal: state.profile.fitnessGoal,
        speed: state.profile.goalSpeed || state.goals.goalSpeed,
        macroFocus: state.profile.macroFocus || state.goals.macroFocus,
        bf: state.profile.bodyFatPct ?? null,
        preg: Boolean(state.profile.isPregnantOrBreastfeeding),
        unit,
      }),
    [
      isConfigured,
      state.profile,
      state.goals.goalSpeed,
      state.goals.macroFocus,
      effectiveWeightKg,
      effectiveTargetKg,
      unit,
    ]
  );

  const lastSyncRef = useRef<string>(syncSignature);
  useEffect(() => {
    if (lastSyncRef.current === syncSignature) return;
    lastSyncRef.current = syncSignature;

    setAge(state.profile.age >= 14 ? String(state.profile.age) : '');
    setBiologicalSex(
      isConfigured && state.profile.biologicalSex ? state.profile.biologicalSex : ''
    );
    setHeightCm(state.profile.heightCm >= 120 ? String(state.profile.heightCm) : '');
    setCurrentWeightDisplay(formatWeightInput(effectiveWeightKg, unit));
    setTargetWeightDisplay(formatWeightInput(effectiveTargetKg, unit));
    setActivityLevel(state.profile.activityLevel || 'moderate');
    setDailyAverageSteps(
      state.profile.dailyAverageSteps > 0 || isConfigured
        ? String(state.profile.dailyAverageSteps ?? 7000)
        : '7000'
    );
    setWorkoutFrequency(
      isConfigured ? String(state.profile.workoutFrequencyPerWeek ?? 3) : '3'
    );
    setWorkoutIntensity(state.profile.workoutIntensity || 'moderate');
    setFitnessGoal(normalizeFitnessGoal(state.profile.fitnessGoal));
    setGoalSpeed(state.profile.goalSpeed || state.goals.goalSpeed || 'moderate');
    setMacroFocus(normalizeMacroFocus(state.profile.macroFocus || state.goals.macroFocus));
    setBodyFatPct(state.profile.bodyFatPct != null ? String(state.profile.bodyFatPct) : '');
    setIsPregnantOrBreastfeeding(Boolean(state.profile.isPregnantOrBreastfeeding));
  }, [syncSignature, isConfigured, state.profile, state.goals, effectiveWeightKg, effectiveTargetKg, unit]);

  const parsedWeightKg = useMemo(() => {
    if (currentWeightDisplay.trim() === '') return 0;
    const val = Number(currentWeightDisplay);
    if (!Number.isFinite(val) || val <= 0) return 0;
    return unit === 'lbs' ? lbsToKg(val) : val;
  }, [currentWeightDisplay, unit]);

  const parsedTargetWeightKg = useMemo(() => {
    if (targetWeightDisplay.trim() === '') return parsedWeightKg;
    const val = Number(targetWeightDisplay);
    if (!Number.isFinite(val) || val <= 0) return 0;
    return unit === 'lbs' ? lbsToKg(val) : val;
  }, [targetWeightDisplay, unit, parsedWeightKg]);

  const hasRequiredMeasurements = useMemo(() => {
    const parsedAge = parseOptionalNonNegNumber(age);
    const parsedHeight = parseOptionalNonNegNumber(heightCm);
    const parsedSteps = parseOptionalNonNegNumber(dailyAverageSteps);
    const parsedWorkouts = parseOptionalNonNegNumber(workoutFrequency);
    return (
      Boolean(biologicalSex) &&
      Number.isFinite(parsedAge) &&
      Number.isFinite(parsedHeight) &&
      parsedWeightKg > 0 &&
      Number.isFinite(parsedSteps) &&
      Number.isFinite(parsedWorkouts)
    );
  }, [age, biologicalSex, heightCm, parsedWeightKg, dailyAverageSteps, workoutFrequency]);

  const validation = useMemo(() => {
    const missingErrors: string[] = [];
    const parsedAge = parseOptionalNonNegNumber(age);
    const parsedHeight = parseOptionalNonNegNumber(heightCm);
    const parsedSteps = parseOptionalNonNegNumber(dailyAverageSteps);
    const parsedWorkouts = parseOptionalNonNegNumber(workoutFrequency);
    const parsedDuration =
      avgWorkoutDurationMin.trim() === '' ? 45 : parseOptionalNonNegNumber(avgWorkoutDurationMin);

    if (age.trim() === '') missingErrors.push('Please enter your age (14–100).');
    if (!biologicalSex) missingErrors.push('Please select your biological sex.');
    if (heightCm.trim() === '') missingErrors.push('Please enter your height in cm.');
    if (currentWeightDisplay.trim() === '') {
      missingErrors.push(`Please enter your current weight (${unit}).`);
    }
    if (dailyAverageSteps.trim() === '') {
      missingErrors.push('Please enter your average daily steps (enter 0 if minimal).');
    }
    if (workoutFrequency.trim() === '') {
      missingErrors.push('Please enter workouts per week (enter 0 if none).');
    }

    if (missingErrors.length > 0) {
      return { valid: false, errors: missingErrors, sanitized: undefined };
    }

    return validateCalculatorInput({
      age: parsedAge,
      biologicalSex: biologicalSex as BiologicalSex,
      heightCm: parsedHeight,
      currentWeightKg: parsedWeightKg,
      targetWeightKg: parsedTargetWeightKg,
      dailyAverageSteps: parsedSteps,
      activityLevel,
      workoutFrequencyPerWeek: parsedWorkouts,
      workoutIntensity,
      avgWorkoutDurationMin: Number.isFinite(parsedDuration) ? parsedDuration : 45,
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
    });
  }, [
    age,
    biologicalSex,
    heightCm,
    currentWeightDisplay,
    unit,
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
  ]);

  const calculation = useMemo(() => {
    if (!validation.valid || !validation.sanitized) return null;
    return calculateSmartFitnessTargets(validation.sanitized);
  }, [validation]);

  const whatIfComparisons = useMemo(() => {
    if (!validation.valid || !validation.sanitized) return [];
    return buildWhatIfGoalComparisons(validation.sanitized);
  }, [validation]);

  const activeCalories = state.goals.calories;
  const activeDeltaFromRecommended = useMemo(() => {
    if (!calculation || activeCalories <= 0) return null;
    return calculation.recommendedCalories - activeCalories;
  }, [calculation, activeCalories]);

  const handleApplyToGoals = () => {
    if (!validation.valid || !validation.sanitized || !calculation) {
      notify(validation.errors[0] || 'Please fix highlighted inputs first.', 'error');
      return;
    }

    const sanitized = validation.sanitized;
    const now = new Date().toISOString();
    const todayKey = getTodayDateKey();

    updateProfile({
      age: sanitized.age,
      biologicalSex: sanitized.biologicalSex,
      heightCm: sanitized.heightCm,
      currentWeightKg: sanitized.currentWeightKg,
      targetWeightKg: sanitized.targetWeightKg,
      dailyAverageSteps: sanitized.dailyAverageSteps ?? 0,
      activityLevel: sanitized.activityLevel,
      workoutFrequencyPerWeek: sanitized.workoutFrequencyPerWeek,
      workoutIntensity: sanitized.workoutIntensity || 'moderate',
      fitnessGoal: calculation.normalizedGoal,
      goalSpeed: calculation.goalSpeed,
      macroFocus: calculation.macroFocus,
      bodyFatPct: sanitized.bodyFatPct ?? null,
      isPregnantOrBreastfeeding: Boolean(sanitized.isPregnantOrBreastfeeding),
      onboardingCompleted: true,
      manualOverrideActive: false,
      cycleAnchorDate: state.profile.cycleAnchorDate || todayKey,
    });

    updateGoals(
      {
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
        manualOverrideActive: false,
      },
      {
        adjustmentType: state.goals.calories === 0 ? 'initial' : 'initial',
        adjustmentReason:
          state.goals.calories === 0
            ? 'Initial personalized targets calculated and applied during onboarding.'
            : 'Recalculated personalized targets applied from Smart Calculator.',
        manualOverrideActive: false,
      }
    );

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
      `Applied personalized targets: ${calculation.recommendedCalories.toLocaleString()} kcal/day`
    );
    onApplied?.();
  };

  // Step-level validation for Onboarding Wizard
  const validateStepAndAdvance = (nextStep: number) => {
    setStepError('');
    if (onboardingStep === 1) {
      const pAge = parseOptionalNonNegNumber(age);
      const pHeight = parseOptionalNonNegNumber(heightCm);
      const pWeight = parsedWeightKg;
      const errors: string[] = [];
      if (age.trim() === '' || !Number.isFinite(pAge) || pAge < 14 || pAge > 100) {
        errors.push('Enter a valid age between 14 and 100.');
      }
      if (!biologicalSex) {
        errors.push('Select your biological sex.');
      }
      if (heightCm.trim() === '' || !Number.isFinite(pHeight) || pHeight < 120 || pHeight > 240) {
        errors.push('Enter a valid height between 120 and 240 cm.');
      }
      if (currentWeightDisplay.trim() === '' || pWeight < 30 || pWeight > 350) {
        errors.push(`Enter a valid current weight (${unit === 'lbs' ? '66–770 lbs' : '30–350 kg'}).`);
      }
      if (targetWeightDisplay.trim() !== '' && (parsedTargetWeightKg < 30 || parsedTargetWeightKg > 350)) {
        errors.push(`Target weight must be between ${unit === 'lbs' ? '66 and 770 lbs' : '30 and 350 kg'}.`);
      }
      if (errors.length > 0) {
        setStepError(errors[0]);
        return;
      }
    } else if (onboardingStep === 2) {
      const pSteps = parseOptionalNonNegNumber(dailyAverageSteps);
      const pWorkouts = parseOptionalNonNegNumber(workoutFrequency);
      if (dailyAverageSteps.trim() === '' || !Number.isFinite(pSteps) || pSteps < 0 || pSteps > 50000) {
        setStepError('Enter average daily steps (0–50,000).');
        return;
      }
      if (
        workoutFrequency.trim() === '' ||
        !Number.isFinite(pWorkouts) ||
        pWorkouts < 0 ||
        pWorkouts > 14
      ) {
        setStepError('Enter workouts per week (0–14).');
        return;
      }
      if (bodyFatPct.trim() !== '') {
        const bf = Number(bodyFatPct);
        if (!Number.isFinite(bf) || bf < 4 || bf > 60) {
          setStepError('Body-fat % must be between 4% and 60%, or left blank.');
          return;
        }
      }
    } else if (nextStep === 5 && (!validation.valid || !calculation)) {
      setStepError(validation.errors[0] || 'Please review your measurements and activity inputs.');
      return;
    }

    setOnboardingStep(nextStep);
  };

  // ============================================================================
  // 1. FIRST-TIME USER ONBOARDING FLOW (when !isConfigured)
  // ============================================================================
  if (!isConfigured) {
    return (
      <div className="space-y-5 min-w-0">
        {/* Progress Stepper */}
        <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#111317] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#4E6800] dark:text-[#C8FF00]">
              Calorex Adaptive Setup · Step {onboardingStep + 1} of {ONBOARDING_STEPS.length}
            </span>
            <span className="text-xs font-mono-nums tabular-nums text-zinc-500 dark:text-zinc-400">
              {Math.round(((onboardingStep + 1) / ONBOARDING_STEPS.length) * 100)}%
            </span>
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {ONBOARDING_STEPS.map((st, idx) => (
              <div key={st.id} className="space-y-1">
                <div
                  className={`h-1.5 rounded-full transition-colors ${
                    idx <= onboardingStep
                      ? 'bg-zinc-950 dark:bg-[#C8FF00]'
                      : 'bg-zinc-200 dark:bg-white/10'
                  }`}
                />
                <div
                  className={`text-[10px] font-medium truncate ${
                    idx === onboardingStep
                      ? 'text-zinc-950 dark:text-white font-semibold'
                      : 'text-zinc-400 dark:text-zinc-500'
                  }`}
                >
                  {st.title}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <section className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#111317] p-5 sm:p-7 space-y-5">
          {onboardingStep === 0 && (
            <div className="space-y-5 max-w-2xl">
              <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#4E6800] dark:text-[#C8FF00]">
                <Sparkles className="w-4 h-4" />
                <span>Welcome to Calorex</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 dark:text-white">
                Set up your personalized nutrition targets
              </h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
                We start with a clean slate — no guessed body measurements. Enter your stats once to
                calculate science-backed daily calories, protein, carbs, fat, fibre, and hydration,
                then Calorex monitors your food logs and weight trends over 14-day adaptive cycles.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                {[
                  {
                    title: 'Science-Backed Baseline',
                    desc: 'Mifflin-St Jeor BMR and calibrated non-overlapping activity estimation.',
                  },
                  {
                    title: '14-Day Adaptive AI',
                    desc: 'Evaluates your weight trend & food logs every 14 days.',
                  },
                  {
                    title: 'You Stay in Control',
                    desc: 'Targets only update when you review and accept recommendations.',
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#090A0C] p-3.5 space-y-1"
                  >
                    <div className="text-xs font-bold text-zinc-950 dark:text-white">
                      {item.title}
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-snug">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {onboardingStep === 1 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-zinc-950 dark:text-white">
                  Your Body Measurements
                </h2>
                <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                  All fields start blank so your calculations reflect your actual metrics.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Age (14–100) *
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={14}
                    max={100}
                    placeholder="e.g. 28"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    className="w-full min-h-[46px] px-3.5 rounded-xl border border-zinc-200 dark:border-white/15 bg-zinc-50 dark:bg-[#090A0C] text-sm font-mono-nums tabular-nums text-zinc-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-[#C8FF00]"
                  />
                </label>

                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block">
                    Biological Sex *
                  </span>
                  <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-zinc-100 dark:bg-[#090A0C] border border-zinc-200 dark:border-white/15 min-h-[46px]">
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

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Height (cm) *
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={120}
                    max={240}
                    placeholder="e.g. 175"
                    value={heightCm}
                    onChange={(e) => setHeightCm(e.target.value)}
                    className="w-full min-h-[46px] px-3.5 rounded-xl border border-zinc-200 dark:border-white/15 bg-zinc-50 dark:bg-[#090A0C] text-sm font-mono-nums tabular-nums text-zinc-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-[#C8FF00]"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Current Weight ({unit}) *
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    placeholder={unit === 'lbs' ? 'e.g. 160' : 'e.g. 72.5'}
                    value={currentWeightDisplay}
                    onChange={(e) => setCurrentWeightDisplay(e.target.value)}
                    className="w-full min-h-[46px] px-3.5 rounded-xl border border-zinc-200 dark:border-white/15 bg-zinc-50 dark:bg-[#090A0C] text-sm font-mono-nums tabular-nums text-zinc-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-[#C8FF00]"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Target Weight ({unit})
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    placeholder="Optional (defaults to current)"
                    value={targetWeightDisplay}
                    onChange={(e) => setTargetWeightDisplay(e.target.value)}
                    className="w-full min-h-[46px] px-3.5 rounded-xl border border-zinc-200 dark:border-white/15 bg-zinc-50 dark:bg-[#090A0C] text-sm font-mono-nums tabular-nums text-zinc-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-[#C8FF00]"
                  />
                </label>
              </div>
            </div>
          )}

          {onboardingStep === 2 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-zinc-950 dark:text-white">
                  Activity Level &amp; Training Habits
                </h2>
                <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Calorex blends your lifestyle tier (65%) with steps and weekly workouts (35%) without double-counting.
                </p>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  Daily Lifestyle Activity Tier
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {(Object.keys(ACTIVITY_MULTIPLIERS) as ActivityLevel[]).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setActivityLevel(level)}
                      className={`min-h-[46px] px-3 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer text-center ${
                        activityLevel === level
                          ? 'border-zinc-950 bg-zinc-950 text-white dark:border-[#C8FF00] dark:bg-[#C8FF00]/15 dark:text-[#C8FF00]'
                          : 'border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      {ACTIVITY_MULTIPLIERS[level].shortLabel}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Average Daily Steps *
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={50000}
                    step={500}
                    value={dailyAverageSteps}
                    onChange={(e) => setDailyAverageSteps(e.target.value)}
                    className="w-full min-h-[46px] px-3.5 rounded-xl border border-zinc-200 dark:border-white/15 bg-zinc-50 dark:bg-[#090A0C] text-sm font-mono-nums tabular-nums text-zinc-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-[#C8FF00]"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Workouts / Week (0–14) *
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
                    className="w-full min-h-[46px] px-3.5 rounded-xl border border-zinc-200 dark:border-white/15 bg-zinc-50 dark:bg-[#090A0C] text-sm font-mono-nums tabular-nums text-zinc-950 dark:text-white focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-[#C8FF00]"
                  />
                </label>

                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block">
                    Workout Intensity
                  </span>
                  <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-zinc-100 dark:bg-[#090A0C] border border-zinc-200 dark:border-white/15 min-h-[46px]">
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

              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:underline cursor-pointer"
              >
                {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                {showAdvanced ? 'Hide optional body-fat & hydration settings' : 'Optional: Body-fat %, hydration & safety'}
              </button>

              {showAdvanced && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-zinc-200 dark:border-white/10">
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      Body-Fat % (Optional · enables Katch-McArdle for 18+)
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={4}
                      max={60}
                      step="0.5"
                      placeholder="Leave blank if unknown"
                      value={bodyFatPct}
                      onChange={(e) => setBodyFatPct(e.target.value)}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-zinc-200 dark:border-white/12 bg-zinc-50 dark:bg-[#090A0C] text-sm font-mono-nums tabular-nums text-zinc-950 dark:text-white"
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
                      Pregnant or breastfeeding (safe maintenance guidance)
                    </span>
                  </label>
                </div>
              )}
            </div>
          )}

          {onboardingStep === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-zinc-950 dark:text-white">
                  Choose Your Fitness Goal
                </h2>
                <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Determines your evidence-based calorie surplus, deficit, or maintenance strategy.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {ORDERED_GOALS.map((g) => {
                  const meta = SMART_FITNESS_GOAL_META[g];
                  const selected = fitnessGoal === g;
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setFitnessGoal(g)}
                      className={`min-h-[56px] p-3.5 rounded-xl border text-left transition cursor-pointer ${
                        selected
                          ? 'border-zinc-950 bg-zinc-950 text-white dark:border-[#C8FF00] dark:bg-[#C8FF00]/12 dark:text-white'
                          : 'border-zinc-200 dark:border-white/10 bg-zinc-50/60 dark:bg-white/[0.02] text-zinc-900 dark:text-zinc-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold">{meta.label}</span>
                        {selected && <Check className="w-4 h-4 text-white dark:text-[#C8FF00]" />}
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5 leading-snug">{meta.summary}</p>
                    </button>
                  );
                })}
              </div>

              {fitnessGoal === 'build_muscle' && (
                <label className="flex items-center gap-3 min-h-[44px] px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-white/12 bg-zinc-50 dark:bg-[#090A0C] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={doesResistanceTraining}
                    onChange={(e) => setDoesResistanceTraining(e.target.checked)}
                    className="w-4 h-4 accent-zinc-950 dark:accent-[#C8FF00]"
                  />
                  <span className="text-xs text-zinc-700 dark:text-zinc-300">
                    I include progressive resistance training (2–4+ sessions/week)
                  </span>
                </label>
              )}

              {fitnessGoal !== 'maintain_weight' && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                    Preferred Pace
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {(['slow', 'moderate', 'aggressive'] as const).map((speed) => (
                      <button
                        key={speed}
                        type="button"
                        onClick={() => setGoalSpeed(speed)}
                        className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                          goalSpeed === speed
                            ? 'border-zinc-950 bg-zinc-950 text-white dark:border-[#C8FF00] dark:bg-[#C8FF00]/15 dark:text-[#C8FF00]'
                            : 'border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300'
                        }`}
                      >
                        {speed === 'slow' ? 'Slow' : speed === 'moderate' ? 'Moderate' : 'Faster'}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {GOAL_SPEED_CONFIG[goalSpeed].description}
                  </p>
                </div>
              )}
            </div>
          )}

          {onboardingStep === 4 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-zinc-950 dark:text-white">
                  Select Macro Preference
                </h2>
                <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Shapes your daily protein, carbohydrate, and fat balance independently of your goal.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {ORDERED_MACRO_FOCUS.map((focus) => {
                  const meta = MACRO_FOCUS_META[focus];
                  const selected = macroFocus === focus;
                  return (
                    <button
                      key={focus}
                      type="button"
                      onClick={() => setMacroFocus(focus)}
                      className={`min-h-[68px] p-4 rounded-xl border text-left transition cursor-pointer ${
                        selected
                          ? 'border-zinc-950 bg-zinc-950 text-white dark:border-[#C8FF00] dark:bg-[#C8FF00]/12 dark:text-white'
                          : 'border-zinc-200 dark:border-white/10 bg-zinc-50/60 dark:bg-white/[0.02] text-zinc-900 dark:text-zinc-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold">{meta.shortLabel}</span>
                        {selected && <Check className="w-4 h-4 text-white dark:text-[#C8FF00]" />}
                      </div>
                      <p className="text-xs text-zinc-400 mt-1 leading-snug">{meta.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {onboardingStep === 5 && calculation && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#4E6800] dark:text-[#C8FF00]">
                    Personalized Daily Plan Ready
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-4xl font-extrabold font-mono-nums tabular-nums text-zinc-950 dark:text-[#C8FF00]">
                      {calculation.recommendedCalories.toLocaleString()}
                    </span>
                    <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
                      kcal / day
                    </span>
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-1 font-mono-nums tabular-nums">
                    BMR {calculation.bmr.toLocaleString()} kcal · Maintenance TDEE{' '}
                    {calculation.estimatedTdeeKcal.toLocaleString()} kcal ·{' '}
                    {SMART_FITNESS_GOAL_META[calculation.normalizedGoal].label}
                  </p>
                </div>
                <div className="text-left sm:text-right font-mono-nums tabular-nums">
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">BMI Screening</div>
                  <div className="text-lg font-bold text-zinc-950 dark:text-white">
                    {calculation.bmi} · {calculation.bodyStatusLabel}
                  </div>
                </div>
              </div>

              {calculation.safetyNote && (
                <div className="rounded-xl border border-amber-300/70 dark:border-amber-500/35 bg-amber-50 dark:bg-amber-500/10 p-3 flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{calculation.safetyNote}</span>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                {[
                  { label: 'Protein', val: `${calculation.proteinGrams}g`, sub: `${calculation.proteinPct}%` },
                  { label: 'Carbs', val: `${calculation.carbsGrams}g`, sub: `${calculation.carbsPct}%` },
                  { label: 'Fat', val: `${calculation.fatGrams}g`, sub: `${calculation.fatPct}%` },
                  { label: 'Fibre', val: `~${calculation.fibreGrams}g`, sub: 'Daily est.' },
                  {
                    label: 'Hydration',
                    val: `${(calculation.recommendedWaterMl / 1000).toFixed(2).replace(/\.?0+$/, '')} L`,
                    sub: calculation.estimatedWeeksRange
                      ? `~${calculation.estimatedWeeksRange.min}–${calculation.estimatedWeeksRange.max} wks`
                      : 'Steady',
                  },
                ].map((m) => (
                  <div
                    key={m.label}
                    className="rounded-xl bg-zinc-50 dark:bg-[#090A0C] border border-zinc-200/80 dark:border-white/10 p-3 text-center"
                  >
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{m.label}</div>
                    <div className="text-lg font-extrabold font-mono-nums tabular-nums text-zinc-950 dark:text-white mt-0.5">
                      {m.val}
                    </div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono-nums tabular-nums">
                      {m.sub}
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Setting this goal starts your first <strong>14-day adaptive cycle</strong>. You
                can edit measurements, switch goals, or adjust targets anytime.
              </p>
            </div>
          )}

          {stepError && (
            <div className="rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-3 flex items-center gap-2 text-xs font-medium text-red-700 dark:text-red-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{stepError}</span>
            </div>
          )}

          {/* Wizard Navigation Footer */}
          <div className="pt-3 border-t border-zinc-200 dark:border-white/10 flex items-center justify-between gap-3">
            {onboardingStep > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setStepError('');
                  setOnboardingStep((s) => Math.max(0, s - 1));
                }}
                className="min-h-[44px] px-4 rounded-xl border border-zinc-300 dark:border-white/15 text-xs sm:text-sm font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            ) : (
              <div />
            )}

            {onboardingStep < ONBOARDING_STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => validateStepAndAdvance(onboardingStep + 1)}
                className="min-h-[46px] px-6 rounded-xl bg-zinc-950 dark:bg-[#C8FF00] text-white dark:text-[#090A0C] text-sm font-bold hover:opacity-95 transition inline-flex items-center gap-2 cursor-pointer"
              >
                <span>{onboardingStep === 0 ? 'Get Started' : 'Continue'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleApplyToGoals}
                disabled={!hasRequiredMeasurements || !calculation}
                className="min-h-[48px] px-6 rounded-xl bg-zinc-950 dark:bg-[#C8FF00] text-white dark:text-[#090A0C] text-sm font-bold hover:opacity-95 transition inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Flame className="w-4 h-4" />
                <span>Set as My Goal</span>
              </button>
            )}
          </div>
        </section>
      </div>
    );
  }

  // ============================================================================
  // 2. CONFIGURED CALCULATOR VIEW (Live Recalculation + Active vs Recommended)
  // ============================================================================
  return (
    <div className="space-y-4 min-w-0">
      {!compactHeader && (
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-[#C8FF00]">
              Scientific Nutrition Engine
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
              Smart Calorie Calculator
            </h2>
            <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 mt-0.5">
              Personalize your body stats, activity level, and goal — active targets stay untouched until you tap Set as My Goal.
            </p>
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
            14-day adaptive ready
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT COLUMN: Unified Calculator Inputs */}
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
                <span>{showAdvanced ? 'Hide Optional' : 'Optional BF% / Sweat'}</span>
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
                      Pregnant or breastfeeding (excludes automated deficits)
                    </span>
                  </label>
                </div>

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

          {/* 2. Activity & Training */}
          <div className="pt-4 border-t border-zinc-200/80 dark:border-white/10 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-zinc-600 dark:text-zinc-300">
                <Activity className="w-4 h-4 text-zinc-700 dark:text-[#C8FF00]" />
                <span>Activity &amp; Training</span>
              </div>
              {calculation && (
                <span className="text-[11px] font-mono-nums tabular-nums text-zinc-500 dark:text-zinc-400">
                  Custom PAL ×{calculation.activityMultiplier.toFixed(2)}
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
              65% lifestyle tier + 35% steps/workouts — prevents double-counting exercise, steps, or TEF.
            </p>
          </div>

          {/* 3. Goal Strategy, Pace & Macro Preference */}
          <div className="pt-4 border-t border-zinc-200/80 dark:border-white/10 space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-zinc-600 dark:text-zinc-300">
              <Target className="w-4 h-4 text-zinc-700 dark:text-[#C8FF00]" />
              <span>Goal Strategy, Pace &amp; Macro Preference</span>
            </div>

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
                        selected ? 'text-zinc-300' : 'text-zinc-500 dark:text-zinc-400'
                      }`}
                    >
                      {meta.summary}
                    </p>
                  </button>
                );
              })}
            </div>

            {fitnessGoal === 'build_muscle' && (
              <label className="flex items-center gap-3 min-h-[44px] px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-white/12 bg-zinc-50 dark:bg-[#090A0C] cursor-pointer">
                <input
                  type="checkbox"
                  checked={doesResistanceTraining}
                  onChange={(e) => setDoesResistanceTraining(e.target.checked)}
                  className="w-4 h-4 accent-zinc-950 dark:accent-[#C8FF00]"
                />
                <span className="text-xs text-zinc-700 dark:text-zinc-300 leading-snug">
                  I include progressive resistance training (2–4+ sessions/week)
                </span>
              </label>
            )}

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
                      {speed === 'slow' ? 'Slow' : speed === 'moderate' ? 'Moderate' : 'Faster'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                Macro Preference
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
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: Recommended vs Active Target & Explicit Apply */}
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
              {/* Active vs Recommended Clarity Box */}
              {activeCalories > 0 && (
                <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#090A0C] p-3 grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Currently Active Saved
                    </div>
                    <div className="text-base font-extrabold font-mono-nums tabular-nums text-zinc-950 dark:text-white mt-0.5">
                      {activeCalories.toLocaleString()} kcal
                    </div>
                    <div className="text-[11px] font-mono-nums tabular-nums text-zinc-500 dark:text-zinc-400">
                      {state.goals.protein}P · {state.goals.carbs}C · {state.goals.fat}F
                    </div>
                  </div>
                  <div className="border-l border-zinc-200 dark:border-white/10 pl-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#4E6800] dark:text-[#C8FF00]">
                      Recommended Preview
                    </div>
                    <div className="text-base font-extrabold font-mono-nums tabular-nums text-[#4E6800] dark:text-[#C8FF00] mt-0.5">
                      {calculation.recommendedCalories.toLocaleString()} kcal
                    </div>
                    <div className="text-[11px] font-mono-nums tabular-nums text-zinc-500 dark:text-zinc-400">
                      {activeDeltaFromRecommended === 0
                        ? 'Synced with active'
                        : state.goals.manualOverrideActive || state.profile.manualOverrideActive
                        ? `Manual (${activeDeltaFromRecommended! > 0 ? '+' : ''}${activeDeltaFromRecommended} diff)`
                        : `${activeDeltaFromRecommended! > 0 ? '+' : ''}${activeDeltaFromRecommended} kcal diff`}
                    </div>
                  </div>
                </div>
              )}

              {/* Recommended Target Hero */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500 dark:text-zinc-400">
                    Recommended Daily Target
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

              {calculation.safetyNote && (
                <div className="rounded-xl border border-amber-300/70 dark:border-amber-500/35 bg-amber-50 dark:bg-amber-500/10 p-3 flex items-start gap-2 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-700 dark:text-amber-300" />
                  <span>{calculation.safetyNote}</span>
                </div>
              )}

              {calculation.resistanceTrainingNote && (
                <div className="rounded-xl border border-sky-300/70 dark:border-sky-500/35 bg-sky-50 dark:bg-sky-500/10 p-3 flex items-start gap-2 text-xs text-sky-900 dark:text-sky-200 leading-relaxed">
                  <Dumbbell className="w-4 h-4 shrink-0 mt-0.5 text-sky-700 dark:text-sky-300" />
                  <span>{calculation.resistanceTrainingNote}</span>
                </div>
              )}

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
                      ? 'Schofield (14–17)'
                      : 'Mifflin-St Jeor'}
                  </div>
                </div>

                <div className="rounded-xl bg-zinc-50 dark:bg-[#090A0C] border border-zinc-200/80 dark:border-white/8 p-3">
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {calculation.adaptiveTdeeKcal ? 'Adaptive TDEE' : 'Est. Maintenance (TDEE)'}
                  </div>
                  <div className="mt-0.5 text-base font-bold font-mono-nums tabular-nums text-zinc-950 dark:text-white">
                    {calculation.activeMaintenanceKcal.toLocaleString()} kcal
                  </div>
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono-nums tabular-nums">
                    {calculation.adaptiveTdeeKcal
                      ? `Formula ${calculation.estimatedTdeeKcal.toLocaleString()}`
                      : `PAL ×${calculation.activityMultiplier.toFixed(2)}`}
                  </div>
                </div>
              </div>

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

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-xl bg-zinc-50 dark:bg-[#090A0C] border border-zinc-200/80 dark:border-white/8 p-2.5">
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Fibre</div>
                  <div className="mt-0.5 font-bold font-mono-nums tabular-nums text-zinc-950 dark:text-white">
                    ~{calculation.fibreGrams} g/day
                  </div>
                </div>
                <div className="rounded-xl bg-zinc-50 dark:bg-[#090A0C] border border-zinc-200/80 dark:border-white/8 p-2.5">
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                    <Droplets className="w-3 h-3 text-sky-500 shrink-0" />
                    Hydration
                  </div>
                  <div className="mt-0.5 font-bold font-mono-nums tabular-nums text-zinc-950 dark:text-white">
                    {(calculation.recommendedWaterMl / 1000).toFixed(2).replace(/\.?0+$/, '')} L/day
                  </div>
                </div>
                <div className="rounded-xl bg-zinc-50 dark:bg-[#090A0C] border border-zinc-200/80 dark:border-white/8 p-2.5">
                  <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Est. Timeline</div>
                  <div className="mt-0.5 font-bold font-mono-nums tabular-nums text-zinc-950 dark:text-white truncate">
                    {calculation.estimatedWeeksRange
                      ? `~${calculation.estimatedWeeksRange.min}–${calculation.estimatedWeeksRange.max} wks`
                      : 'Steady'}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleApplyToGoals}
                className="w-full min-h-[48px] px-4 rounded-xl bg-zinc-950 dark:bg-[#C8FF00] text-white dark:text-[#090A0C] text-sm font-bold tracking-tight hover:opacity-95 active:scale-[0.99] transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {justApplied ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Goal Saved &amp; Applied</span>
                  </>
                ) : (
                  <>
                    <Flame className="w-4 h-4" />
                    <span>
                      {activeDeltaFromRecommended === 0
                        ? 'Set as My Goal (Re-Save)'
                        : 'Set as My Goal'}
                    </span>
                  </>
                )}
              </button>
            </section>
          )}
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
                Preview calorie and macro shifts across goals — active goals stay untouched until applied
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

      {/* Calculation Methodology Transparency */}
      {!hideLegacyAssessmentSection && calculation && (
        <section className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#111317] overflow-hidden">
          <button
            type="button"
            onClick={() => setShowTransparency((v) => !v)}
            className="w-full min-h-[48px] px-4 py-3 flex items-center justify-between gap-2 text-left hover:bg-zinc-50 dark:hover:bg-white/[0.02] cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-zinc-600 dark:text-[#C8FF00] shrink-0" />
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.08em] text-zinc-700 dark:text-zinc-200">
                  Calculation Methodology
                </div>
                <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  Engine {state.goals.calculationVersion || CALCULATION_VERSION}
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
            <div className="border-t border-zinc-200 dark:border-white/10 p-4">
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
        </section>
      )}
    </div>
  );
};
