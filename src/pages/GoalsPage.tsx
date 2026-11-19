import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Calculator,
  CalendarClock,
  Check,
  Droplets,
  Flame,
  Loader2,
  Scale,
  Sparkles,
} from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import {
  ActivityLevel,
  BiologicalSex,
  FitnessGoalType,
  GoalPreset,
  GoalSpeed,
} from '../types';
import {
  ACTIVITY_MULTIPLIERS,
  calculateSmartFitnessTargets,
  FitnessCalculationResult,
  GOAL_SPEED_CONFIG,
} from '../utils/fitnessCalculator';
import {
  convertDisplayWeightToKg,
  convertWeightToDisplay,
  formatWeight,
} from '../utils/nutritionUtils';

type MacroStyleId = 'high_protein' | 'balanced' | 'lower_carb' | 'athletic';

const MACRO_STYLES: {
  id: MacroStyleId;
  label: string;
  subtitle: string;
  proteinPerKg: number;
  fatCaloriesPct: number;
}[] = [
  {
    id: 'high_protein',
    label: 'High Protein',
    subtitle: 'Preserves lean muscle & keeps you full longer',
    proteinPerKg: 2.0,
    fatCaloriesPct: 25,
  },
  {
    id: 'balanced',
    label: 'Balanced Everyday',
    subtitle: 'Steady blend of protein, carbs, and healthy fats',
    proteinPerKg: 1.7,
    fatCaloriesPct: 27,
  },
  {
    id: 'lower_carb',
    label: 'Lower Carb Cut',
    subtitle: 'Higher protein & fat with controlled carbs',
    proteinPerKg: 2.1,
    fatCaloriesPct: 30,
  },
  {
    id: 'athletic',
    label: 'Performance / High Carb',
    subtitle: 'Extra carbohydrate energy for frequent workouts',
    proteinPerKg: 1.8,
    fatCaloriesPct: 22,
  },
];

const GOAL_PRESETS: {
  id: GoalPreset;
  label: string;
  description: string;
  targets?: { calories: number; protein: number; carbs: number; fat: number; fibre: number };
}[] = [
  {
    id: 'fat_loss',
    label: 'Fat Loss',
    description: 'High protein, steady deficit (~1,950 kcal)',
    targets: { calories: 1950, protein: 155, carbs: 195, fat: 58, fibre: 30 },
  },
  {
    id: 'maintenance',
    label: 'Maintenance',
    description: 'Balanced daily energy (~2,500 kcal)',
    targets: { calories: 2500, protein: 145, carbs: 315, fat: 70, fibre: 32 },
  },
  {
    id: 'muscle_gain',
    label: 'Muscle Gain',
    description: 'Lean surplus for strength (~2,900 kcal)',
    targets: { calories: 2900, protein: 175, carbs: 380, fat: 75, fibre: 36 },
  },
  {
    id: 'recomposition',
    label: 'Body Recomp',
    description: 'Near-maintenance high protein (~2,350 kcal)',
    targets: { calories: 2350, protein: 165, carbs: 265, fat: 66, fibre: 33 },
  },
  {
    id: 'custom',
    label: 'Custom Split',
    description: 'Customize calories and macro percentages',
  },
];

const MACRO_COLORS = {
  protein: '#C8FF00', // lime-500
  carbs: '#f59e0b', // amber-500
  fat: '#6366f1', // indigo-500
};

export const GoalsPage: React.FC = () => {
  const {
    state,
    dailyWaterGoalMl,
    setDailyWaterGoalMl,
    updateGoals,
    updateProfile,
    updateWeightGoal,
    notify,
  } = useMacroLogStore();
  const unit = state.settings.weightUnit;
  const { profile } = state;

  // Personalized Fitness Goal & Macro Calculator (9 standardized inputs + Macro Style)
  const [calcAge, setCalcAge] = useState(profile.age > 0 ? String(profile.age) : '26');
  const [calcGender, setCalcGender] = useState<BiologicalSex>(profile.biologicalSex || 'male');
  const [calcHeightCm, setCalcHeightCm] = useState(
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
  const [calcActivity, setCalcActivity] = useState<ActivityLevel>(
    profile.activityLevel || 'moderate'
  );
  const [calcWorkoutsPerWeek, setCalcWorkoutsPerWeek] = useState(
    String(profile.workoutFrequencyPerWeek ?? 4)
  );
  const [calcFitnessGoal, setCalcFitnessGoal] = useState<FitnessGoalType>(
    profile.fitnessGoal || 'fat_loss'
  );
  const [calcGoalSpeed, setCalcGoalSpeed] = useState<GoalSpeed>(
    profile.goalSpeed || 'moderate'
  );
  const [macroStyle, setMacroStyle] = useState<MacroStyleId>('high_protein');

  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState('');
  const [calcResult, setCalcResult] = useState<FitnessCalculationResult | null>(() => {
    if (profile.age > 0 && profile.heightCm > 0 && profile.currentWeightKg > 0) {
      return calculateSmartFitnessTargets({
        age: profile.age,
        biologicalSex: profile.biologicalSex || 'male',
        heightCm: profile.heightCm,
        currentWeightKg: profile.currentWeightKg,
        targetWeightKg: profile.targetWeightKg || profile.currentWeightKg,
        activityLevel: profile.activityLevel || 'moderate',
        workoutFrequencyPerWeek: profile.workoutFrequencyPerWeek ?? 3,
        fitnessGoal: profile.fitnessGoal || 'maintenance',
        goalSpeed: profile.goalSpeed || 'moderate',
      });
    }
    return null;
  });

  // Editable Targets & Interactive % Ratio Builder (MFP-inspired)
  const [preset, setPreset] = useState<GoalPreset>(state.goals.preset);
  const [calories, setCalories] = useState(String(state.goals.calories || 2200));
  const [protein, setProtein] = useState(String(state.goals.protein || 140));
  const [carbs, setCarbs] = useState(String(state.goals.carbs || 245));
  const [fat, setFat] = useState(String(state.goals.fat || 73));
  const [fibre, setFibre] = useState(String(state.goals.fibre || 30));
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
  const [manualError, setManualError] = useState('');

  useEffect(() => {
    setPreset(state.goals.preset);
    if (state.goals.calories > 0) {
      setCalories(String(state.goals.calories));
      setProtein(String(state.goals.protein));
      setCarbs(String(state.goals.carbs));
      setFat(String(state.goals.fat));
      setFibre(String(state.goals.fibre));
    }
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
    return Number.isFinite(val) && val > 0 ? convertDisplayWeightToKg(val, unit) : 0;
  }, [calcCurrentWeight, unit]);

  const parsedTargetWeightKg = useMemo(() => {
    const val = parseFloat(calcTargetWeight);
    return Number.isFinite(val) && val > 0 ? convertDisplayWeightToKg(val, unit) : 0;
  }, [calcTargetWeight, unit]);

  // Compute current % shares of manual editor inputs
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
    setPreset('custom');
  };

  const handleCalculateGoals = async (e: React.FormEvent) => {
    e.preventDefault();
    setCalcError('');

    const ageNum = parseInt(calcAge, 10);
    const heightNum = parseFloat(calcHeightCm);
    const workoutsNum = parseInt(calcWorkoutsPerWeek, 10);

    if (!Number.isFinite(ageNum) || ageNum < 14 || ageNum > 100) {
      setCalcError('Please enter a valid age between 14 and 100.');
      return;
    }
    if (!Number.isFinite(heightNum) || heightNum < 120 || heightNum > 240) {
      setCalcError('Please enter a valid height between 120 cm and 240 cm.');
      return;
    }
    if (parsedCurrentWeightKg < 30 || parsedCurrentWeightKg > 300) {
      setCalcError(
        `Please enter a valid current weight (${unit === 'kg' ? '30–300 kg' : '66–660 lbs'}).`
      );
      return;
    }
    if (parsedTargetWeightKg < 30 || parsedTargetWeightKg > 300) {
      setCalcError(
        `Please enter a valid target weight (${unit === 'kg' ? '30–300 kg' : '66–660 lbs'}).`
      );
      return;
    }
    if (!Number.isFinite(workoutsNum) || workoutsNum < 0 || workoutsNum > 14) {
      setCalcError('Workouts per week must be between 0 and 14.');
      return;
    }

    const chosenStyle = MACRO_STYLES.find((s) => s.id === macroStyle) || MACRO_STYLES[0];

    const payload = {
      age: ageNum,
      biologicalSex: calcGender,
      heightCm: heightNum,
      currentWeightKg: parsedCurrentWeightKg,
      targetWeightKg: parsedTargetWeightKg,
      activityLevel: calcActivity,
      workoutFrequencyPerWeek: workoutsNum,
      fitnessGoal: calcFitnessGoal,
      goalSpeed: calcGoalSpeed,
      proteinPerKg: chosenStyle.proteinPerKg,
      fatCaloriesPct: chosenStyle.fatCaloriesPct,
    };

    setCalculating(true);
    try {
      const response = await fetch('/api/goals/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        setCalcError(data?.error || 'Could not calculate targets with those inputs.');
        return;
      }

      const result = data as FitnessCalculationResult;
      setCalcResult(result);

      setPreset(calcFitnessGoal);
      setCalories(String(result.recommendedCalories));
      setProtein(String(result.proteinGrams));
      setCarbs(String(result.carbsGrams));
      setFat(String(result.fatGrams));
      setFibre(String(result.fibreGrams));
      setTargetWeight(String(convertWeightToDisplay(result.recommendedTargetWeightKg, unit)));
      setEstimatedBmrMeta(result.bmr);
      setEstimatedTdeeMeta(result.estimatedTdee);
    } catch {
      setCalcError('Failed to reach calculation service. Please check your connection and try again.');
    } finally {
      setCalculating(false);
    }
  };

  const handleSaveCalculatedGoals = () => {
    if (!calcResult) return;

    const goalDirection: 'loss' | 'gain' | 'maintain' =
      calcResult.recommendedTargetWeightKg < parsedCurrentWeightKg - 0.2
        ? 'loss'
        : calcResult.recommendedTargetWeightKg > parsedCurrentWeightKg + 0.2
        ? 'gain'
        : 'maintain';

    updateProfile({
      age: parseInt(calcAge, 10) || profile.age,
      biologicalSex: calcGender,
      heightCm: parseFloat(calcHeightCm) || profile.heightCm,
      currentWeightKg: parsedCurrentWeightKg,
      targetWeightKg: calcResult.recommendedTargetWeightKg,
      activityLevel: calcActivity,
      workoutFrequencyPerWeek: parseInt(calcWorkoutsPerWeek, 10) || 0,
      fitnessGoal: calcFitnessGoal,
      goalSpeed: calcGoalSpeed,
    });

    updateWeightGoal({
      startingWeightKg:
        state.weightGoal.startingWeightKg > 0
          ? state.weightGoal.startingWeightKg
          : parsedCurrentWeightKg,
      targetWeightKg: calcResult.recommendedTargetWeightKg,
      goalDirection,
    });

    updateGoals({
      preset: calcFitnessGoal,
      calories: calcResult.recommendedCalories,
      protein: calcResult.proteinGrams,
      carbs: calcResult.carbsGrams,
      fat: calcResult.fatGrams,
      fibre: calcResult.fibreGrams,
      targetWeightKg: calcResult.recommendedTargetWeightKg,
      estimatedBmr: calcResult.bmr,
      estimatedTdee: calcResult.estimatedTdee,
      bmi: calcResult.bmi,
      goalSpeed: calcResult.goalSpeed,
      estimatedWeeks: calcResult.estimatedWeeks,
    });

    setDailyWaterGoalMl(calcResult.recommendedWaterMl);
    notify('Personalized goals saved & dashboard updated');
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

  const handleManualSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cal = Math.round(parseFloat(calories));
    const pro = Math.round(parseFloat(protein));
    const carb = Math.round(parseFloat(carbs));
    const f = Math.round(parseFloat(fat));
    const fib = Math.round(parseFloat(fibre));

    if ([cal, pro, carb, f, fib].some((v) => !Number.isFinite(v) || v <= 0)) {
      setManualError('All calorie and macro targets must be positive numbers.');
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
      bmi: state.goals.bmi,
      goalSpeed: state.goals.goalSpeed,
      estimatedWeeks: state.goals.estimatedWeeks,
    });
  };

  const macroChartData = calcResult
    ? [
        {
          name: 'Protein',
          grams: calcResult.proteinGrams,
          value: calcResult.proteinCalories,
          color: MACRO_COLORS.protein,
        },
        {
          name: 'Carbs',
          grams: calcResult.carbsGrams,
          value: calcResult.carbsCalories,
          color: MACRO_COLORS.carbs,
        },
        {
          name: 'Fat',
          grams: calcResult.fatGrams,
          value: calcResult.fatCalories,
          color: MACRO_COLORS.fat,
        },
      ]
    : [];

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <section className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Personalized daily calorie, macro, meal-budget, and hydration plan
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Fitness Goals & Macro Planner
          </h1>
        </div>
      </section>

      {/* Active Saved Goal Overview Banner (when user already has active goals) */}
      {state.goals.calories > 0 && (
        <section className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Active Calorie Goal</div>
            <div className="mt-1 text-xl font-bold font-mono-nums text-lime-700 dark:text-lime-400">
              {state.goals.calories.toLocaleString()}{' '}
              <span className="text-xs font-normal text-slate-500">kcal/day</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Daily Macro Targets</div>
            <div className="mt-1 text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100">
              P {state.goals.protein}g · C {state.goals.carbs}g · F {state.goals.fat}g
            </div>
            <div className="text-[11px] text-slate-400 tabular-nums mt-0.5">
              Fibre {state.goals.fibre}g/day
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Weight Goal</div>
            <div className="mt-1 text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100">
              {profile.currentWeightKg > 0
                ? formatWeight(profile.currentWeightKg, unit)
                : '—'}{' '}
              →{' '}
              {state.goals.targetWeightKg
                ? formatWeight(state.goals.targetWeightKg, unit)
                : profile.targetWeightKg > 0
                ? formatWeight(profile.targetWeightKg, unit)
                : '—'}
            </div>
            {state.goals.estimatedWeeks && (
              <div className="text-[11px] text-slate-400 tabular-nums mt-0.5">
                Est. ~{state.goals.estimatedWeeks} weeks
              </div>
            )}
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Daily Water Goal</div>
            <div className="mt-1 text-sm font-semibold font-mono-nums text-sky-600 dark:text-sky-400">
              {dailyWaterGoalMl.toLocaleString()} ml
            </div>
            <div className="text-[11px] text-slate-400 tabular-nums mt-0.5">
              {Math.round(dailyWaterGoalMl / 250)} glasses/day
            </div>
          </div>
        </section>
      )}

      {/* USER INPUT FORM */}
      <form
        onSubmit={handleCalculateGoals}
        className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 sm:p-6 space-y-5"
      >
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Calculator className="w-4 h-4 text-lime-600 dark:text-lime-400" />
            Tell Us About Yourself
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Fill in your stats, routine, and desired pace to build a sustainable calorie and macro plan.
          </p>
        </div>

        {calcError && (
          <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-xs font-medium text-red-700 dark:text-red-300">
            {calcError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 1. Age */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Age (years)
            </label>
            <input
              type="number"
              min="14"
              max="100"
              required
              value={calcAge}
              onChange={(e) => setCalcAge(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
            />
          </div>

          {/* 2. Gender */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Biological Sex
            </label>
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-stone-100 dark:bg-[#090A0C] h-11">
              {(['male', 'female'] as const).map((sex) => (
                <button
                  key={sex}
                  type="button"
                  onClick={() => setCalcGender(sex)}
                  className={`rounded-lg text-xs font-semibold capitalize transition-colors ${
                    calcGender === sex
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {sex}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Height (cm) */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Height (cm)
            </label>
            <input
              type="number"
              min="120"
              max="240"
              step="0.5"
              required
              value={calcHeightCm}
              onChange={(e) => setCalcHeightCm(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
            />
          </div>

          {/* 4. Current Weight */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Current Weight ({unit})
            </label>
            <input
              type="number"
              step="0.1"
              min="30"
              required
              value={calcCurrentWeight}
              onChange={(e) => setCalcCurrentWeight(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
            />
          </div>

          {/* 5. Target Weight */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Target Weight ({unit})
            </label>
            <input
              type="number"
              step="0.1"
              min="30"
              required
              value={calcTargetWeight}
              onChange={(e) => setCalcTargetWeight(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
            />
          </div>

          {/* 6. Workout Frequency / Week */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Workouts per Week
            </label>
            <input
              type="number"
              min="0"
              max="14"
              required
              value={calcWorkoutsPerWeek}
              onChange={(e) => setCalcWorkoutsPerWeek(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
            />
          </div>

          {/* 7. Activity Level */}
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Daily Activity Level
            </label>
            <select
              value={calcActivity}
              onChange={(e) => setCalcActivity(e.target.value as ActivityLevel)}
              className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
            >
              {(Object.keys(ACTIVITY_MULTIPLIERS) as ActivityLevel[]).map((tier) => (
                <option key={tier} value={tier}>
                  {ACTIVITY_MULTIPLIERS[tier].label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {ACTIVITY_MULTIPLIERS[calcActivity].summary}
            </p>
          </div>

          {/* 8. Primary Fitness Goal */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Primary Fitness Goal
            </label>
            <select
              value={calcFitnessGoal}
              onChange={(e) => setCalcFitnessGoal(e.target.value as FitnessGoalType)}
              className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
            >
              <option value="fat_loss">Lose Fat</option>
              <option value="muscle_gain">Build Muscle</option>
              <option value="recomposition">Body Recomposition</option>
              <option value="maintenance">Maintain Weight</option>
            </select>
          </div>

          {/* 9. Preferred Goal Pace */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Preferred Goal Pace
            </label>
            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-stone-100 dark:bg-[#090A0C] h-11">
              {(['slow', 'moderate', 'aggressive'] as GoalSpeed[]).map((spd) => (
                <button
                  key={spd}
                  type="button"
                  onClick={() => setCalcGoalSpeed(spd)}
                  className={`rounded-lg text-xs font-semibold capitalize transition-colors ${
                    calcGoalSpeed === spd
                      ? 'bg-white dark:bg-[#14161C] text-[#111317] dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {spd === 'slow' ? 'Steady' : spd === 'moderate' ? 'Moderate' : 'Fast'}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {GOAL_SPEED_CONFIG[calcGoalSpeed].description}
            </p>
          </div>
        </div>

        {/* Nutrition / Macro Focus Style */}
        <div className="pt-2 border-t border-stone-100 dark:border-white/12">
          <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
            Macro Focus Style
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {MACRO_STYLES.map((style) => {
              const active = macroStyle === style.id;
              return (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setMacroStyle(style.id)}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    active
                      ? 'border-lime-500 bg-lime-50/70 dark:bg-lime-950/30'
                      : 'border-black/10 dark:border-white/12 hover:border-stone-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {style.label}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                    {style.subtitle}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Includes safe minimum calorie & protein safeguards automatically.
          </p>
          <button
            type="submit"
            disabled={calculating}
            className="min-h-[46px] px-6 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-sm font-semibold hover:opacity-90 transition-opacity inline-flex items-center gap-2 disabled:opacity-60 whitespace-nowrap"
          >
            {calculating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Calculating...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Calculate My Goals</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* RESULTS DASHBOARD */}
      {calcResult && (
        <section className="bg-white dark:bg-[#111317] border border-lime-500/50 dark:border-lime-500/40 rounded-2xl p-5 sm:p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-stone-100 dark:border-white/12 pb-4">
            <div>
              <span className="text-xs font-semibold text-lime-700 dark:text-lime-400">
                Your Personalized Plan
              </span>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 mt-0.5">
                Daily Calorie, Macro & Timeline Targets
              </h2>
            </div>

            <button
              type="button"
              onClick={handleSaveCalculatedGoals}
              className="min-h-[46px] px-6 rounded-xl bg-lime-500 hover:bg-lime-400 text-slate-950 text-sm font-bold transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
            >
              <Check className="w-4 h-4" />
              Save My Goals
            </button>
          </div>

          {calcResult.safetyNote && (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5 leading-relaxed">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <span>{calcResult.safetyNote}</span>
            </div>
          )}

          {/* Top Energy & Body Metrics — User-friendly labels, zero multiplier jargon */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="rounded-xl border border-lime-400/60 dark:border-lime-500/50 bg-lime-50/70 dark:bg-lime-950/30 p-3.5">
              <div className="text-[11px] font-semibold text-lime-800 dark:text-lime-300">
                Daily Calorie Target
              </div>
              <div className="mt-1 text-xl font-bold font-mono-nums text-lime-700 dark:text-lime-400">
                {calcResult.recommendedCalories.toLocaleString()}
              </div>
              <div className="text-[11px] text-lime-800/80 dark:text-lime-300/80 mt-0.5 tabular-nums">
                {calcResult.calorieDelta < -25
                  ? `${Math.abs(calcResult.calorieDelta)} kcal daily deficit`
                  : calcResult.calorieDelta > 25
                  ? `+${calcResult.calorieDelta} kcal daily surplus`
                  : 'Maintenance pace'}
              </div>
            </div>

            <div className="rounded-xl border border-black/10 dark:border-white/12 bg-stone-50/70 dark:bg-[#090A0C]/60 p-3.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5" />
                Daily Maintenance
              </div>
              <div className="mt-1 text-xl font-bold font-mono-nums text-slate-900 dark:text-slate-50">
                {calcResult.estimatedTdee.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                kcal burned per day
              </div>
            </div>

            <div className="rounded-xl border border-black/10 dark:border-white/12 bg-stone-50/70 dark:bg-[#090A0C]/60 p-3.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" />
                Resting Burn
              </div>
              <div className="mt-1 text-xl font-bold font-mono-nums text-slate-900 dark:text-slate-50">
                {calcResult.bmr.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                kcal at rest
              </div>
            </div>

            <div className="rounded-xl border border-black/10 dark:border-white/12 bg-stone-50/70 dark:bg-[#090A0C]/60 p-3.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5" />
                Body Mass Score
              </div>
              <div className="mt-1 text-xl font-bold font-mono-nums text-slate-900 dark:text-slate-50">
                {calcResult.bmi}
              </div>
              <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                {calcResult.bmiCategory} range
              </div>
            </div>

            <div className="col-span-2 sm:col-span-1 rounded-xl border border-black/10 dark:border-white/12 bg-stone-50/70 dark:bg-[#090A0C]/60 p-3.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5" />
                Target Timeline
              </div>
              <div className="mt-1 text-lg font-bold font-mono-nums text-slate-900 dark:text-slate-50">
                {calcResult.projectedTargetDate || (calcResult.estimatedWeeks ? `~${calcResult.estimatedWeeks} wks` : 'Steady')}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                {calcResult.estimatedWeeks && calcResult.weeklyRateKg !== 0
                  ? `~${calcResult.estimatedWeeks} wks · ${calcResult.weeklyRateKg > 0 ? '+' : ''}${convertWeightToDisplay(calcResult.weeklyRateKg, unit)} ${unit}/wk`
                  : 'Maintain current weight'}
              </div>
            </div>
          </div>

          {/* Macro Breakdown Chart + Macro Targets */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
            <div className="lg:col-span-5 h-56 flex items-center justify-center rounded-xl border border-black/10 dark:border-white/12 bg-stone-50/50 dark:bg-[#090A0C]/40 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={macroChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={80}
                    paddingAngle={3}
                    strokeWidth={0}
                  >
                    {macroChartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(
                      val: unknown,
                      _name: unknown,
                      props: { payload?: { name: string; grams: number } }
                    ) => [
                      `${props.payload?.grams ?? 0}g (${Number(val).toLocaleString()} kcal)`,
                      props.payload?.name || '',
                    ]}
                    contentStyle={{
                      backgroundColor: '#14161C',
                      border: '1px solid rgba(255,255,255,0.14)',
                      borderRadius: '10px',
                      color: '#F3F4F6',
                      fontSize: '12px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="rounded-xl border border-black/10 dark:border-white/12 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Daily Protein
                  </span>
                  <span className="text-xs font-mono-nums text-lime-700 dark:text-lime-400 font-semibold">
                    {calcResult.proteinPct}%
                  </span>
                </div>
                <div className="text-2xl font-bold font-mono-nums text-slate-900 dark:text-slate-50">
                  {calcResult.proteinGrams}g
                </div>
                <div className="h-2 rounded-full bg-stone-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-lime-500"
                    style={{ width: `${Math.min(100, calcResult.proteinPct)}%` }}
                  />
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  {calcResult.proteinCalories} kcal/day · lean muscle & fullness
                </div>
              </div>

              <div className="rounded-xl border border-black/10 dark:border-white/12 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Daily Carbohydrates
                  </span>
                  <span className="text-xs font-mono-nums text-amber-600 dark:text-amber-400 font-semibold">
                    {calcResult.carbsPct}%
                  </span>
                </div>
                <div className="text-2xl font-bold font-mono-nums text-slate-900 dark:text-slate-50">
                  {calcResult.carbsGrams}g
                </div>
                <div className="h-2 rounded-full bg-stone-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-500"
                    style={{ width: `${Math.min(100, calcResult.carbsPct)}%` }}
                  />
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  {calcResult.carbsCalories} kcal/day · workouts & daily energy
                </div>
              </div>

              <div className="rounded-xl border border-black/10 dark:border-white/12 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Daily Healthy Fat
                  </span>
                  <span className="text-xs font-mono-nums text-indigo-600 dark:text-indigo-400 font-semibold">
                    {calcResult.fatPct}%
                  </span>
                </div>
                <div className="text-2xl font-bold font-mono-nums text-slate-900 dark:text-slate-50">
                  {calcResult.fatGrams}g
                </div>
                <div className="h-2 rounded-full bg-stone-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-500"
                    style={{ width: `${Math.min(100, calcResult.fatPct)}%` }}
                  />
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  {calcResult.fatCalories} kcal/day · hormones & nutrient absorption
                </div>
              </div>

              <div className="rounded-xl border border-black/10 dark:border-white/12 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Daily Fibre & Water
                  </span>
                  <span className="text-xs font-mono-nums text-sky-600 dark:text-sky-400 font-semibold inline-flex items-center gap-1">
                    <Droplets className="w-3 h-3" />
                    {(calcResult.recommendedWaterMl / 1000).toFixed(2).replace(/\.?0+$/, '')} L
                  </span>
                </div>
                <div className="text-2xl font-bold font-mono-nums text-slate-900 dark:text-slate-50">
                  {calcResult.fibreGrams}g{' '}
                  <span className="text-xs font-normal text-slate-500">fibre</span>
                </div>
                <div className="h-2 rounded-full bg-stone-100 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full rounded-full bg-teal-500" style={{ width: '75%' }} />
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  {calcResult.recommendedWaterMl.toLocaleString()} ml water (
                  {Math.round(calcResult.recommendedWaterMl / 250)} glasses/day)
                </div>
              </div>
            </div>
          </div>

          {/* Suggested Daily Meal Distribution (HealthifyMe-style) */}
          <div className="rounded-xl border border-black/10 dark:border-white/12 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Suggested Meal Calorie Guide
              </h3>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Balanced across 4 daily meals
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {[
                { label: 'Breakfast (25%)', share: 0.25 },
                { label: 'Lunch (35%)', share: 0.35 },
                { label: 'Snacks (15%)', share: 0.15 },
                { label: 'Dinner (25%)', share: 0.25 },
              ].map((slot) => (
                <div
                  key={slot.label}
                  className="p-2.5 rounded-lg bg-stone-50 dark:bg-[#090A0C]/60 border border-black/8 dark:border-white/12"
                >
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{slot.label}</div>
                  <div className="mt-0.5 text-sm font-bold font-mono-nums text-slate-900 dark:text-slate-100">
                    ~{Math.round(calcResult.recommendedCalories * slot.share).toLocaleString()} kcal
                  </div>
                </div>
              ))}
            </div>
          </div>

          <ul className="rounded-xl bg-stone-50/80 dark:bg-[#090A0C]/70 border border-black/10 dark:border-white/12 p-4 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
            {calcResult.explanation.map((line, idx) => (
              <li key={idx} className="leading-relaxed">
                • {line}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Custom Macro Ratio & Target Editor (MyFitnessPal-Inspired) */}
      <form
        onSubmit={handleManualSave}
        className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 sm:p-6 space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Customize Calorie & Macro Split
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Pick a quick preset, adjust macro percentages, or enter exact daily gram targets
            </p>
          </div>
          {estimatedBmrMeta && estimatedTdeeMeta && (
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              Maintenance burn ~{estimatedTdeeMeta.toLocaleString()} kcal/day
            </span>
          )}
        </div>

        {/* Presets */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {GOAL_PRESETS.map((p) => {
            const active = preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={`p-3.5 rounded-xl border text-left transition-colors ${
                  active
                    ? 'bg-lime-50 dark:bg-lime-950/40 border-lime-500'
                    : 'bg-stone-50/50 dark:bg-[#090A0C]/40 border-black/10 dark:border-white/12 hover:border-stone-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {p.label}
                </div>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                  {p.description}
                </p>
              </button>
            );
          })}
        </div>

        {/* Interactive Macro % Quick Sliders (MFP Style) */}
        <div className="rounded-xl border border-black/10 dark:border-white/12 bg-stone-50/60 dark:bg-[#090A0C]/40 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Interactive Macro % Ratio (Auto-scales grams to Calories)
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
                <span className="font-mono-nums font-semibold">{editorMacroPcts.proteinPct}%</span>
              </div>
              <input
                type="range"
                min="15"
                max="50"
                step="5"
                value={Math.min(50, Math.max(15, Math.round(editorMacroPcts.proteinPct / 5) * 5))}
                onChange={(e) =>
                  applyMacroRatios(
                    Math.max(1200, parseInt(calories, 10) || 2200),
                    Number(e.target.value),
                    editorMacroPcts.fatPct
                  )
                }
                className="w-full accent-lime-500"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 mb-1">
                <span>Fat Share</span>
                <span className="font-mono-nums font-semibold">{editorMacroPcts.fatPct}%</span>
              </div>
              <input
                type="range"
                min="15"
                max="45"
                step="5"
                value={Math.min(45, Math.max(15, Math.round(editorMacroPcts.fatPct / 5) * 5))}
                onChange={(e) =>
                  applyMacroRatios(
                    Math.max(1200, parseInt(calories, 10) || 2200),
                    editorMacroPcts.proteinPct,
                    Number(e.target.value)
                  )
                }
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
              className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100"
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
              className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100"
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
              className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100"
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
              className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100"
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
              className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100"
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
              className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        <div className="pt-2 border-t border-stone-100 dark:border-white/12 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
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
            className="min-h-[44px] px-6 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-sm font-semibold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Check className="w-4 h-4" />
            Save Custom Targets
          </button>
        </div>
      </form>
    </div>
  );
};
