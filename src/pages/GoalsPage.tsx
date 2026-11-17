import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, Check, Info, Sparkles } from 'lucide-react';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import {
  ActivityLevel,
  BiologicalSex,
  FitnessGoalType,
  GoalPreset,
  WorkoutIntensity,
} from '../types';
import {
  ACTIVITY_MULTIPLIERS,
  calculateSmartFitnessTargets,
  suggestActivityLevel,
} from '../utils/fitnessCalculator';
import { convertDisplayWeightToKg, convertWeightToDisplay } from '../utils/nutritionUtils';

const GOAL_PRESETS: {
  id: GoalPreset;
  label: string;
  description: string;
  targets?: { calories: number; protein: number; carbs: number; fat: number; fibre: number };
}[] = [
  {
    id: 'fat_loss',
    label: 'Fat Loss',
    description: 'High protein, moderate deficit (~1,950 kcal)',
    targets: { calories: 1950, protein: 155, carbs: 195, fat: 58, fibre: 32 },
  },
  {
    id: 'maintenance',
    label: 'Maintenance',
    description: 'Balanced daily energy & steady recovery (~2,500 kcal)',
    targets: { calories: 2500, protein: 140, carbs: 320, fat: 70, fibre: 30 },
  },
  {
    id: 'muscle_gain',
    label: 'Muscle Gain',
    description: 'Lean surplus for strength & hypertrophy (~2,900 kcal)',
    targets: { calories: 2900, protein: 175, carbs: 380, fat: 75, fibre: 35 },
  },
  {
    id: 'recomposition',
    label: 'Body Recomp',
    description: 'Near-maintenance high protein (~2,350 kcal)',
    targets: { calories: 2350, protein: 165, carbs: 265, fat: 66, fibre: 33 },
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Set every nutrition target manually',
  },
];

export const GoalsPage: React.FC = () => {
  const { state, updateGoals, updateProfile } = useMacroLogStore();
  const unit = state.settings.weightUnit;
  const { profile } = state;

  // Smart Fitness Calculator state (Module 2)
  const [showCalculator, setShowCalculator] = useState(state.goals.calories === 0);
  const [calcAge, setCalcAge] = useState(profile.age > 0 ? String(profile.age) : '26');
  const [calcSex, setCalcSex] = useState<BiologicalSex>(profile.biologicalSex || 'male');
  const [calcHeight, setCalcHeight] = useState(
    profile.heightCm > 0 ? String(profile.heightCm) : '173'
  );
  const [calcCurrentWeight, setCalcCurrentWeight] = useState(
    profile.currentWeightKg > 0
      ? String(convertWeightToDisplay(profile.currentWeightKg, unit))
      : String(convertWeightToDisplay(70, unit))
  );
  const [calcTargetWeight, setCalcTargetWeight] = useState(
    profile.targetWeightKg > 0
      ? String(convertWeightToDisplay(profile.targetWeightKg, unit))
      : String(convertWeightToDisplay(66, unit))
  );
  const [calcSteps, setCalcSteps] = useState(String(profile.dailyAverageSteps || 7500));
  const [calcWorkouts, setCalcWorkouts] = useState(
    String(profile.workoutFrequencyPerWeek ?? 3)
  );
  const [calcIntensity, setCalcIntensity] = useState<WorkoutIntensity>(
    profile.workoutIntensity || 'moderate'
  );
  const [calcActivity, setCalcActivity] = useState<ActivityLevel>(
    profile.activityLevel || 'moderate'
  );
  const [calcGoal, setCalcGoal] = useState<FitnessGoalType>(
    profile.fitnessGoal || 'maintenance'
  );
  const [calcAdjustmentPct, setCalcAdjustmentPct] = useState(
    profile.fitnessGoal === 'muscle_gain' ? '7.5' : '15'
  );
  const [calcProteinPerKg, setCalcProteinPerKg] = useState('1.9');
  const [calcFatPct, setCalcFatPct] = useState('26');
  const [showConfirmationCard, setShowConfirmationCard] = useState(false);

  // Editable Nutrition Goal Targets state
  const [preset, setPreset] = useState<GoalPreset>(state.goals.preset);
  const [calories, setCalories] = useState(String(state.goals.calories));
  const [protein, setProtein] = useState(String(state.goals.protein));
  const [carbs, setCarbs] = useState(String(state.goals.carbs));
  const [fat, setFat] = useState(String(state.goals.fat));
  const [fibre, setFibre] = useState(String(state.goals.fibre));
  const [targetWeight, setTargetWeight] = useState(
    state.goals.targetWeightKg !== undefined
      ? String(convertWeightToDisplay(state.goals.targetWeightKg, unit))
      : ''
  );
  const [estimatedBmrMeta, setEstimatedBmrMeta] = useState<number | undefined>(
    state.goals.estimatedBmr
  );
  const [estimatedTdeeMeta, setEstimatedTdeeMeta] = useState<number | undefined>(
    state.goals.estimatedTdee
  );
  const [error, setError] = useState('');

  useEffect(() => {
    setPreset(state.goals.preset);
    setCalories(String(state.goals.calories));
    setProtein(String(state.goals.protein));
    setCarbs(String(state.goals.carbs));
    setFat(String(state.goals.fat));
    setFibre(String(state.goals.fibre));
    setTargetWeight(
      state.goals.targetWeightKg !== undefined
        ? String(convertWeightToDisplay(state.goals.targetWeightKg, unit))
        : ''
    );
    setEstimatedBmrMeta(state.goals.estimatedBmr);
    setEstimatedTdeeMeta(state.goals.estimatedTdee);
  }, [state.goals, unit]);

  const parsedCurrentWeightKg = useMemo(() => {
    const val = parseFloat(calcCurrentWeight);
    return Number.isFinite(val) && val > 0 ? convertDisplayWeightToKg(val, unit) : 70;
  }, [calcCurrentWeight, unit]);

  const parsedTargetWeightKg = useMemo(() => {
    const val = parseFloat(calcTargetWeight);
    return Number.isFinite(val) && val > 0 ? convertDisplayWeightToKg(val, unit) : parsedCurrentWeightKg;
  }, [calcTargetWeight, parsedCurrentWeightKg, unit]);

  const suggestedTier = useMemo(
    () =>
      suggestActivityLevel(
        parseInt(calcSteps, 10) || 7000,
        parseInt(calcWorkouts, 10) || 0,
        calcIntensity
      ),
    [calcIntensity, calcSteps, calcWorkouts]
  );

  const calculationResult = useMemo(
    () =>
      calculateSmartFitnessTargets({
        age: parseInt(calcAge, 10) || 26,
        biologicalSex: calcSex,
        heightCm: parseFloat(calcHeight) || 170,
        currentWeightKg: parsedCurrentWeightKg,
        targetWeightKg: parsedTargetWeightKg,
        dailyAverageSteps: parseInt(calcSteps, 10) || 7000,
        activityLevel: calcActivity,
        workoutFrequencyPerWeek: parseInt(calcWorkouts, 10) || 0,
        workoutIntensity: calcIntensity,
        fitnessGoal: calcGoal,
        goalAdjustmentPct: parseFloat(calcAdjustmentPct) || undefined,
        proteinPerKg: parseFloat(calcProteinPerKg) || 1.9,
        fatCaloriesPct: parseFloat(calcFatPct) || 26,
      }),
    [
      calcActivity,
      calcAdjustmentPct,
      calcAge,
      calcFatPct,
      calcGoal,
      calcHeight,
      calcIntensity,
      calcProteinPerKg,
      calcSex,
      calcSteps,
      calcWorkouts,
      parsedCurrentWeightKg,
      parsedTargetWeightKg,
    ]
  );

  const applyCalculatorToEditor = () => {
    setPreset(calcGoal);
    setCalories(String(calculationResult.recommendedCalories));
    setProtein(String(calculationResult.proteinGrams));
    setCarbs(String(calculationResult.carbsGrams));
    setFat(String(calculationResult.fatGrams));
    setFibre(String(calculationResult.fibreGrams));
    setTargetWeight(
      String(convertWeightToDisplay(calculationResult.recommendedTargetWeightKg, unit))
    );
    setEstimatedBmrMeta(calculationResult.bmr);
    setEstimatedTdeeMeta(calculationResult.estimatedTdee);
    setShowConfirmationCard(true);
    setError('');
  };

  const applyPreset = (id: GoalPreset) => {
    setPreset(id);
    const found = GOAL_PRESETS.find((p) => p.id === id);
    if (found?.targets) {
      setCalories(String(found.targets.calories));
      setProtein(String(found.targets.protein));
      setCarbs(String(found.targets.carbs));
      setFat(String(found.targets.fat));
      setFibre(String(found.targets.fibre));
    }
  };

  const estimatedMacroCalories =
    (parseFloat(protein) || 0) * 4 +
    (parseFloat(carbs) || 0) * 4 +
    (parseFloat(fat) || 0) * 9;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cal = Math.round(parseFloat(calories));
    const pro = Math.round(parseFloat(protein));
    const carb = Math.round(parseFloat(carbs));
    const f = Math.round(parseFloat(fat));
    const fib = Math.round(parseFloat(fibre));

    if ([cal, pro, carb, f, fib].some((v) => !Number.isFinite(v) || v <= 0)) {
      setError('All calorie and macro targets must be positive numbers.');
      return;
    }

    let targetWeightKg: number | undefined = undefined;
    if (targetWeight.trim() !== '') {
      const tw = parseFloat(targetWeight);
      if (!Number.isFinite(tw) || tw <= 0) {
        setError('Target weight must be a positive number.');
        return;
      }
      targetWeightKg = convertDisplayWeightToKg(tw, unit);
    }

    setError('');

    // If user used the Smart Calculator, also persist body/activity profile metadata
    if (showConfirmationCard) {
      updateProfile({
        age: parseInt(calcAge, 10) || profile.age,
        biologicalSex: calcSex,
        heightCm: parseFloat(calcHeight) || profile.heightCm,
        currentWeightKg: parsedCurrentWeightKg,
        targetWeightKg: targetWeightKg ?? parsedTargetWeightKg,
        dailyAverageSteps: parseInt(calcSteps, 10) || profile.dailyAverageSteps,
        activityLevel: calcActivity,
        workoutFrequencyPerWeek: parseInt(calcWorkouts, 10) || 0,
        workoutIntensity: calcIntensity,
        fitnessGoal: calcGoal,
      });
    }

    updateGoals({
      preset,
      calories: cal,
      protein: pro,
      carbs: carb,
      fat: f,
      fibre: fib,
      targetWeightKg,
      estimatedBmr: estimatedBmrMeta,
      estimatedTdee: estimatedTdeeMeta,
    });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Mifflin-St Jeor target calculator & customizable daily nutrition goals
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Nutrition Goals
          </h1>
        </div>

        <button
          type="button"
          onClick={() => setShowCalculator((v) => !v)}
          className={`min-h-[44px] px-4 rounded-xl border text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors ${
            showCalculator
              ? 'bg-lime-50 dark:bg-lime-950/50 border-lime-500 text-lime-800 dark:text-lime-300'
              : 'bg-white dark:bg-[#121821] border-stone-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-slate-800'
          }`}
        >
          <Calculator className="w-4 h-4" />
          {showCalculator ? 'Hide Smart Calculator' : 'Smart Fitness Calculator'}
        </button>
      </section>

      {/* MODULE 2: SMART FITNESS GOAL CALCULATOR */}
      {showCalculator && (
        <section className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-lime-600 dark:text-lime-400" />
                Smart Fitness Goal Calculator
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Calculates Mifflin-St Jeor BMR, estimated maintenance TDEE, and balanced 4/4/9 macro targets.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Age (years)
              </label>
              <input
                type="number"
                min="14"
                max="100"
                value={calcAge}
                onChange={(e) => setCalcAge(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm font-mono-nums text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Biological Sex (BMR formula)
              </label>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-stone-100 dark:bg-slate-900 h-11">
                {(['male', 'female'] as const).map((sex) => (
                  <button
                    key={sex}
                    type="button"
                    onClick={() => setCalcSex(sex)}
                    className={`rounded-lg text-xs font-semibold capitalize transition-colors ${
                      calcSex === sex
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {sex}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Height (cm)
              </label>
              <input
                type="number"
                min="120"
                max="240"
                value={calcHeight}
                onChange={(e) => setCalcHeight(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm font-mono-nums text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Current Weight ({unit})
              </label>
              <input
                type="number"
                step="0.1"
                min="25"
                value={calcCurrentWeight}
                onChange={(e) => setCalcCurrentWeight(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm font-mono-nums text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Target Weight ({unit})
              </label>
              <input
                type="number"
                step="0.1"
                min="25"
                value={calcTargetWeight}
                onChange={(e) => setCalcTargetWeight(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm font-mono-nums text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Daily Average Steps
              </label>
              <input
                type="number"
                min="500"
                max="40000"
                step="500"
                value={calcSteps}
                onChange={(e) => setCalcSteps(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm font-mono-nums text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Workouts / Week (0–7)
              </label>
              <input
                type="number"
                min="0"
                max="14"
                value={calcWorkouts}
                onChange={(e) => setCalcWorkouts(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm font-mono-nums text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Workout Intensity
              </label>
              <select
                value={calcIntensity}
                onChange={(e) => setCalcIntensity(e.target.value as WorkoutIntensity)}
                className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="light">Light (walking, mobility)</option>
                <option value="moderate">Moderate (hypertrophy, steady cardio)</option>
                <option value="vigorous">Vigorous (heavy lifting, HIIT, sport)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Fitness Goal
              </label>
              <select
                value={calcGoal}
                onChange={(e) => {
                  const next = e.target.value as FitnessGoalType;
                  setCalcGoal(next);
                  if (next === 'fat_loss') setCalcAdjustmentPct('15');
                  else if (next === 'muscle_gain') setCalcAdjustmentPct('7.5');
                }}
                className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="fat_loss">Lose Fat (10–20% deficit)</option>
                <option value="maintenance">Maintain Weight</option>
                <option value="muscle_gain">Build Muscle (5–10% surplus)</option>
                <option value="recomposition">Body Recomposition</option>
              </select>
            </div>
          </div>

          {/* Activity Level Helper */}
          <div className="rounded-xl border border-stone-200/80 dark:border-slate-800 bg-stone-50/70 dark:bg-slate-900/70 p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Lifestyle Activity Multiplier (includes workouts — no double-counting)
              </label>
              {suggestedTier !== calcActivity && (
                <button
                  type="button"
                  onClick={() => setCalcActivity(suggestedTier)}
                  className="text-xs font-semibold text-lime-700 dark:text-lime-400 hover:underline"
                >
                  Apply suggested: {ACTIVITY_MULTIPLIERS[suggestedTier].label}
                </button>
              )}
            </div>
            <select
              value={calcActivity}
              onChange={(e) => setCalcActivity(e.target.value as ActivityLevel)}
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
            >
              {(Object.keys(ACTIVITY_MULTIPLIERS) as ActivityLevel[]).map((tier) => (
                <option key={tier} value={tier}>
                  {ACTIVITY_MULTIPLIERS[tier].label} — {ACTIVITY_MULTIPLIERS[tier].summary}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Based on {parseInt(calcSteps, 10) || 0} daily steps and {calcWorkouts} workouts/week, we suggest{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {ACTIVITY_MULTIPLIERS[suggestedTier].label}
              </span>
              . Avoid adding extra workout calories on top of TDEE to prevent double-counting.
            </p>
          </div>

          {/* Fine-tune ratios */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {(calcGoal === 'fat_loss' || calcGoal === 'muscle_gain') && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  {calcGoal === 'fat_loss' ? 'Deficit % (10–20%)' : 'Surplus % (5–10%)'}
                </label>
                <input
                  type="number"
                  step="0.5"
                  min={calcGoal === 'fat_loss' ? 10 : 5}
                  max={calcGoal === 'fat_loss' ? 20 : 10}
                  value={calcAdjustmentPct}
                  onChange={(e) => setCalcAdjustmentPct(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm font-mono-nums text-slate-900 dark:text-slate-100"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Protein Target (1.6–2.2 g/kg)
              </label>
              <input
                type="number"
                step="0.1"
                min="1.6"
                max="2.2"
                value={calcProteinPerKg}
                onChange={(e) => setCalcProteinPerKg(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm font-mono-nums text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Fat Energy Share (20–35%)
              </label>
              <input
                type="number"
                step="1"
                min="20"
                max="35"
                value={calcFatPct}
                onChange={(e) => setCalcFatPct(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm font-mono-nums text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              Live Preview: BMR{' '}
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {calculationResult.bmr.toLocaleString()} kcal
              </span>{' '}
              · TDEE{' '}
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {calculationResult.estimatedTdee.toLocaleString()} kcal
              </span>{' '}
              · Recommended{' '}
              <span className="font-semibold text-lime-700 dark:text-lime-400">
                {calculationResult.recommendedCalories.toLocaleString()} kcal
              </span>
            </div>

            <button
              type="button"
              onClick={applyCalculatorToEditor}
              className="min-h-[44px] px-5 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-xs font-semibold hover:opacity-90 transition-opacity"
            >
              Calculate & Review Targets
            </button>
          </div>

          {/* Goal Confirmation Results Screen */}
          {showConfirmationCard && (
            <div className="rounded-2xl border border-lime-500/60 bg-lime-50/50 dark:bg-lime-950/20 p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Goal Confirmation Summary (Editable Below)
                </h3>
                {calculationResult.estimatedWeeks && (
                  <span className="text-xs font-medium text-lime-700 dark:text-lime-400 tabular-nums">
                    Estimated timeline: ~{calculationResult.estimatedWeeks} weeks ({calculationResult.weeklyRateKg > 0 ? '+' : ''}
                    {convertWeightToDisplay(calculationResult.weeklyRateKg, unit)} {unit}/wk)
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl bg-white dark:bg-[#121821] border border-stone-200/80 dark:border-slate-800 p-3">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Estimated BMR</div>
                  <div className="text-base font-bold font-mono-nums text-slate-900 dark:text-slate-100 mt-0.5">
                    {calculationResult.bmr.toLocaleString()} kcal
                  </div>
                </div>
                <div className="rounded-xl bg-white dark:bg-[#121821] border border-stone-200/80 dark:border-slate-800 p-3">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Maintenance TDEE</div>
                  <div className="text-base font-bold font-mono-nums text-slate-900 dark:text-slate-100 mt-0.5">
                    {calculationResult.estimatedTdee.toLocaleString()} kcal
                  </div>
                </div>
                <div className="rounded-xl bg-white dark:bg-[#121821] border border-stone-200/80 dark:border-slate-800 p-3">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Daily Target</div>
                  <div className="text-base font-bold font-mono-nums text-lime-700 dark:text-lime-400 mt-0.5">
                    {calculationResult.recommendedCalories.toLocaleString()} kcal
                  </div>
                </div>
                <div className="rounded-xl bg-white dark:bg-[#121821] border border-stone-200/80 dark:border-slate-800 p-3">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Macro Split</div>
                  <div className="text-xs font-bold font-mono-nums text-slate-900 dark:text-slate-100 mt-1">
                    P {calculationResult.proteinGrams}g · C {calculationResult.carbsGrams}g · F {calculationResult.fatGrams}g · Fib {calculationResult.fibreGrams}g
                  </div>
                </div>
              </div>

              {calculationResult.safetyNote && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{calculationResult.safetyNote}</span>
                </div>
              )}

              <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {calculationResult.explanation.map((line, i) => (
                  <li key={i}>• {line}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Presets */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Quick Goal Presets
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {GOAL_PRESETS.map((p) => {
            const active = preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={`p-4 rounded-2xl border text-left transition-colors ${
                  active
                    ? 'bg-lime-50 dark:bg-lime-950/40 border-lime-500 dark:border-lime-500'
                    : 'bg-white dark:bg-[#121821] border-stone-200 dark:border-slate-800 hover:border-stone-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {p.label}
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {p.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Editable Target Form */}
      <form
        onSubmit={handleSave}
        className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Daily Calorie & Macro Targets
          </h2>
          {estimatedBmrMeta && estimatedTdeeMeta && (
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              Saved BMR {estimatedBmrMeta.toLocaleString()} kcal · Maintenance ~{estimatedTdeeMeta.toLocaleString()} kcal
            </span>
          )}
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-xs font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Daily Calorie Target (kcal)
            </label>
            <input
              type="number"
              min="500"
              max="10000"
              value={calories}
              onChange={(e) => {
                setCalories(e.target.value);
                setPreset('custom');
              }}
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Target Body Weight ({unit}, optional)
            </label>
            <input
              type="number"
              step="0.05"
              value={targetWeight}
              onChange={(e) => setTargetWeight(e.target.value)}
              placeholder={`e.g. ${unit === 'kg' ? '64.0' : '141.0'}`}
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Protein Target (g)
            </label>
            <input
              type="number"
              min="10"
              value={protein}
              onChange={(e) => {
                setProtein(e.target.value);
                setPreset('custom');
              }}
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Carbohydrate Target (g)
            </label>
            <input
              type="number"
              min="10"
              value={carbs}
              onChange={(e) => {
                setCarbs(e.target.value);
                setPreset('custom');
              }}
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Fat Target (g)
            </label>
            <input
              type="number"
              min="10"
              value={fat}
              onChange={(e) => {
                setFat(e.target.value);
                setPreset('custom');
              }}
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Fibre Target (g)
            </label>
            <input
              type="number"
              min="5"
              value={fibre}
              onChange={(e) => {
                setFibre(e.target.value);
                setPreset('custom');
              }}
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
            />
          </div>
        </div>

        <div className="pt-2 border-t border-stone-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Macro energy estimate:{' '}
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {Math.round(estimatedMacroCalories).toLocaleString()} kcal
            </span>{' '}
            (4 kcal/g protein & carbs · 9 kcal/g fat)
          </div>

          <button
            type="submit"
            className="min-h-[46px] px-6 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-sm font-semibold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Check className="w-4 h-4" />
            {showConfirmationCard ? 'Confirm & Save Goals' : 'Save Goals'}
          </button>
        </div>
      </form>
    </div>
  );
};
