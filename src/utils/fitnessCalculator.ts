import type {
  ActivityLevel,
  BiologicalSex,
  FitnessGoalType,
  WorkoutIntensity,
} from '../types';

export interface FitnessCalculatorInput {
  age: number;
  biologicalSex: BiologicalSex;
  heightCm: number;
  currentWeightKg: number;
  targetWeightKg: number;
  dailyAverageSteps: number;
  activityLevel: ActivityLevel;
  workoutFrequencyPerWeek: number;
  workoutIntensity: WorkoutIntensity;
  fitnessGoal: FitnessGoalType;
  /** Deficit pct for fat loss (10-20), surplus pct for muscle gain (5-10) */
  goalAdjustmentPct?: number;
  /** Protein grams per kg bodyweight (1.6-2.2) */
  proteinPerKg?: number;
  /** Fat percentage of daily calories (20-35) */
  fatCaloriesPct?: number;
}

export interface FitnessCalculationResult {
  bmr: number;
  activityMultiplier: number;
  suggestedActivityLevel: ActivityLevel;
  estimatedTdee: number;
  recommendedCalories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fibreGrams: number;
  recommendedTargetWeightKg: number;
  estimatedWeeks: number | null;
  weeklyRateKg: number;
  safetyNote?: string;
  explanation: string[];
}

export const ACTIVITY_MULTIPLIERS: Record<
  ActivityLevel,
  { factor: number; label: string; summary: string }
> = {
  sedentary: {
    factor: 1.2,
    label: 'Sedentary (1.2×)',
    summary: 'Desk-based routine, under 5,000 steps/day, little or no structured training',
  },
  light: {
    factor: 1.375,
    label: 'Lightly Active (1.375×)',
    summary: '5,000–7,500 daily steps or 1–3 moderate workouts/week',
  },
  moderate: {
    factor: 1.55,
    label: 'Moderately Active (1.55×)',
    summary: '7,500–10,000 daily steps and/or 3–5 structured workouts/week',
  },
  active: {
    factor: 1.725,
    label: 'Very Active (1.725×)',
    summary: '10,000–14,000+ daily steps and 5–6 intense workouts/week or physical work',
  },
  very_active: {
    factor: 1.9,
    label: 'Extremely Active (1.9×)',
    summary: 'Heavy physical occupation or twice-daily athletic training (>14,000 steps/day)',
  },
};

/**
 * Helps suggest an initial activity tier using daily steps + workout frequency + intensity
 * while avoiding double-counting individual workout calories on top of TDEE.
 */
export function suggestActivityLevel(
  dailyAverageSteps: number,
  workoutFrequencyPerWeek: number,
  workoutIntensity: WorkoutIntensity
): ActivityLevel {
  let score = 0;
  if (dailyAverageSteps >= 14000) score += 4;
  else if (dailyAverageSteps >= 10000) score += 3;
  else if (dailyAverageSteps >= 7500) score += 2;
  else if (dailyAverageSteps >= 5000) score += 1;

  const intensityWeight =
    workoutIntensity === 'vigorous' ? 1.35 : workoutIntensity === 'moderate' ? 1.0 : 0.65;
  const effectiveSessions = workoutFrequencyPerWeek * intensityWeight;

  if (effectiveSessions >= 7) score += 3;
  else if (effectiveSessions >= 4.5) score += 2;
  else if (effectiveSessions >= 1.5) score += 1;

  if (score <= 1) return 'sedentary';
  if (score <= 2) return 'light';
  if (score <= 4) return 'moderate';
  if (score <= 5) return 'active';
  return 'very_active';
}

export function calculateMifflinStJeorBmr(
  weightKg: number,
  heightCm: number,
  age: number,
  biologicalSex: BiologicalSex
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(biologicalSex === 'male' ? base + 5 : base - 161);
}

export function calculateSmartFitnessTargets(
  input: FitnessCalculatorInput
): FitnessCalculationResult {
  const safeWeight = Math.max(30, input.currentWeightKg || 65);
  const safeHeight = Math.max(120, input.heightCm || 170);
  const safeAge = Math.min(100, Math.max(14, input.age || 25));

  const bmr = calculateMifflinStJeorBmr(safeWeight, safeHeight, safeAge, input.biologicalSex);
  const suggestedActivityLevel = suggestActivityLevel(
    input.dailyAverageSteps,
    input.workoutFrequencyPerWeek,
    input.workoutIntensity
  );

  const activityMultiplier = ACTIVITY_MULTIPLIERS[input.activityLevel].factor;
  const estimatedTdee = Math.round(bmr * activityMultiplier);

  let rawTargetCalories = estimatedTdee;
  let safetyNote: string | undefined;

  if (input.fitnessGoal === 'fat_loss') {
    const deficitPct = Math.min(20, Math.max(10, input.goalAdjustmentPct ?? 15));
    rawTargetCalories = Math.round(estimatedTdee * (1 - deficitPct / 100));
  } else if (input.fitnessGoal === 'muscle_gain') {
    const surplusPct = Math.min(10, Math.max(5, input.goalAdjustmentPct ?? 7.5));
    rawTargetCalories = Math.round(estimatedTdee * (1 + surplusPct / 100));
  } else if (input.fitnessGoal === 'recomposition') {
    rawTargetCalories = Math.round(estimatedTdee * 0.98);
  } else {
    rawTargetCalories = estimatedTdee;
  }

  // Guard against extreme deficits or unsafe calorie floors
  const safeFloor = input.biologicalSex === 'male' ? Math.max(1400, Math.round(bmr * 0.92)) : Math.max(1200, Math.round(bmr * 0.92));
  if (rawTargetCalories < safeFloor) {
    rawTargetCalories = safeFloor;
    safetyNote = `Target raised to a safe minimum floor (${safeFloor} kcal) to protect lean tissue and recovery.`;
  }

  // Protein: 1.6 - 2.2 g/kg (configurable)
  const defaultProteinFactor =
    input.fitnessGoal === 'fat_loss' || input.fitnessGoal === 'recomposition'
      ? 2.0
      : input.fitnessGoal === 'muscle_gain'
      ? 1.9
      : 1.7;
  const proteinPerKg = Math.min(2.2, Math.max(1.6, input.proteinPerKg ?? defaultProteinFactor));
  let proteinGrams = Math.round(safeWeight * proteinPerKg);

  // Fat: 20 - 35% of daily calories
  const fatCaloriesPct = Math.min(35, Math.max(20, input.fatCaloriesPct ?? 26));
  let fatGrams = Math.round((rawTargetCalories * (fatCaloriesPct / 100)) / 9);

  // Ensure protein + fat never leave negative carbs
  const minCarbCalories = Math.round(rawTargetCalories * 0.2);
  if (proteinGrams * 4 + fatGrams * 9 > rawTargetCalories - minCarbCalories) {
    const maxProtein = Math.round((rawTargetCalories * 0.4) / 4);
    proteinGrams = Math.min(proteinGrams, maxProtein);
    const remainingForFat = Math.max(0, rawTargetCalories - proteinGrams * 4 - minCarbCalories);
    fatGrams = Math.max(Math.round((rawTargetCalories * 0.2) / 9), Math.round(remainingForFat / 9));
  }

  const remainingCarbCalories = Math.max(0, rawTargetCalories - proteinGrams * 4 - fatGrams * 9);
  const carbsGrams = Math.round(remainingCarbCalories / 4);

  // Re-sync exact calorie total so Protein*4 + Carbs*4 + Fat*9 matches displayed target
  const recommendedCalories = proteinGrams * 4 + carbsGrams * 4 + fatGrams * 9;

  // Fibre: ~14 g per 1,000 kcal with age/sex reference guidance
  const rawFibre = Math.round((recommendedCalories / 1000) * 14);
  const sexMinFibre =
    input.biologicalSex === 'female' ? (safeAge > 50 ? 21 : 25) : safeAge > 50 ? 30 : 34;
  const fibreGrams = Math.max(rawFibre, Math.min(sexMinFibre, rawFibre + 4));

  // Recommended target weight & timeline
  const recommendedTargetWeightKg =
    input.targetWeightKg > 0 ? input.targetWeightKg : safeWeight;
  const calorieDeltaPerDay = recommendedCalories - estimatedTdee;
  const weeklyRateKg = Math.round(((calorieDeltaPerDay * 7) / 7700) * 100) / 100;

  let estimatedWeeks: number | null = null;
  const weightDiff = recommendedTargetWeightKg - safeWeight;
  if (Math.abs(weightDiff) >= 0.3) {
    if (
      (weightDiff < 0 && weeklyRateKg < -0.05) ||
      (weightDiff > 0 && weeklyRateKg > 0.05)
    ) {
      estimatedWeeks = Math.max(1, Math.round(Math.abs(weightDiff / weeklyRateKg)));
    } else if (input.fitnessGoal === 'recomposition') {
      estimatedWeeks = 12;
    }
  }

  const explanation: string[] = [
    `Mifflin-St Jeor BMR (${input.biologicalSex}): ${bmr.toLocaleString()} kcal/day for ${safeWeight} kg, ${safeHeight} cm, age ${safeAge}.`,
    `Estimated TDEE: ${bmr.toLocaleString()} × ${activityMultiplier} (${ACTIVITY_MULTIPLIERS[input.activityLevel].label}) = ${estimatedTdee.toLocaleString()} kcal/day. Workout calories are already included in this activity factor—no separate workout add-back needed.`,
    `Macro split (${proteinGrams}g P × 4 + ${carbsGrams}g C × 4 + ${fatGrams}g F × 9 = ${recommendedCalories.toLocaleString()} kcal): ${proteinPerKg.toFixed(1)} g/kg protein, ${fatCaloriesPct}% fat calories, remaining energy allocated to carbs, and ${fibreGrams}g fibre (~14 g per 1,000 kcal).`,
    `Note: Formulas provide an evidence-based starting estimate; real maintenance varies slightly across individuals and can be refined after 2–4 weeks of tracking.`,
  ];

  return {
    bmr,
    activityMultiplier,
    suggestedActivityLevel,
    estimatedTdee,
    recommendedCalories,
    proteinGrams,
    carbsGrams,
    fatGrams,
    fibreGrams,
    recommendedTargetWeightKg,
    estimatedWeeks,
    weeklyRateKg,
    safetyNote,
    explanation,
  };
}
