import type {
  ActivityLevel,
  BiologicalSex,
  FitnessGoalType,
  GoalSpeed,
  WorkoutIntensity,
} from '../types';

export interface FitnessCalculatorInput {
  age: number;
  biologicalSex: BiologicalSex;
  heightCm: number;
  currentWeightKg: number;
  targetWeightKg: number;
  dailyAverageSteps?: number;
  activityLevel: ActivityLevel;
  workoutFrequencyPerWeek: number;
  workoutIntensity?: WorkoutIntensity;
  fitnessGoal: FitnessGoalType;
  goalSpeed?: GoalSpeed;
  /** Optional override: Deficit pct for fat loss (10-25), surplus pct for muscle gain (5-15) */
  goalAdjustmentPct?: number;
  /** Protein grams per kg bodyweight (1.6-2.2) */
  proteinPerKg?: number;
  /** Fat percentage of daily calories (20-30) */
  fatCaloriesPct?: number;
}

export interface FitnessCalculationResult {
  bmi: number;
  bmiCategory: 'Underweight' | 'Normal' | 'Overweight' | 'Obesity';
  bmr: number;
  activityMultiplier: number;
  suggestedActivityLevel: ActivityLevel;
  estimatedTdee: number;
  recommendedCalories: number;
  calorieDelta: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fibreGrams: number;
  recommendedWaterMl: number;
  proteinCalories: number;
  carbsCalories: number;
  fatCalories: number;
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
  recommendedTargetWeightKg: number;
  goalSpeed: GoalSpeed;
  estimatedWeeks: number | null;
  projectedTargetDate: string | null;
  weeklyRateKg: number;
  safetyNote?: string;
  explanation: string[];
}

export const ACTIVITY_MULTIPLIERS: Record<
  ActivityLevel,
  { factor: number; label: string; shortLabel: string; summary: string }
> = {
  sedentary: {
    factor: 1.2,
    label: 'Sedentary',
    shortLabel: 'Sedentary',
    summary: 'Desk-based routine, under 5,000 steps/day, little or no structured exercise',
  },
  light: {
    factor: 1.375,
    label: 'Lightly Active',
    shortLabel: 'Lightly Active',
    summary: '5,000–7,500 daily steps or 1–3 light workouts/week',
  },
  moderate: {
    factor: 1.55,
    label: 'Moderately Active',
    shortLabel: 'Moderately Active',
    summary: '7,500–10,000 daily steps and/or 3–5 structured workouts/week',
  },
  active: {
    factor: 1.725,
    label: 'Very Active',
    shortLabel: 'Very Active',
    summary: '10,000–14,000+ daily steps and 5–6 intense workouts/week or physical work',
  },
  very_active: {
    factor: 1.9,
    label: 'Athlete / Extremely Active',
    shortLabel: 'Extremely Active',
    summary: 'Heavy physical occupation or twice-daily athletic training (>14,000 steps/day)',
  },
};

export const GOAL_SPEED_CONFIG: Record<
  GoalSpeed,
  {
    label: string;
    fatLossPct: number;
    muscleGainPct: number;
    recompPct: number;
    description: string;
  }
> = {
  slow: {
    label: 'Slow & Sustainable',
    fatLossPct: 10,
    muscleGainPct: 6,
    recompPct: 0,
    description: 'Gentle adjustment prioritizing energy, adherence, and lean mass retention',
  },
  moderate: {
    label: 'Moderate (Recommended)',
    fatLossPct: 17,
    muscleGainPct: 10,
    recompPct: -4,
    description: 'Evidence-based sweet spot balancing steady weekly progress and recovery',
  },
  aggressive: {
    label: 'Aggressive (Safely Capped)',
    fatLossPct: 23,
    muscleGainPct: 14,
    recompPct: -8,
    description: 'Faster pace bounded strictly by minimum safe calorie and protein floors',
  },
};

export function validateCalculatorInput(
  raw: Partial<FitnessCalculatorInput>
): { valid: boolean; errors: string[]; sanitized?: FitnessCalculatorInput } {
  const errors: string[] = [];

  const age = Number(raw.age);
  const heightCm = Number(raw.heightCm);
  const currentWeightKg = Number(raw.currentWeightKg);
  const targetWeightKg = Number(raw.targetWeightKg ?? raw.currentWeightKg);
  const workoutFrequencyPerWeek = Number(raw.workoutFrequencyPerWeek ?? 0);

  if (!Number.isFinite(age) || age < 14 || age > 100) {
    errors.push('Age must be between 14 and 100 years.');
  }
  if (!Number.isFinite(heightCm) || heightCm < 120 || heightCm > 240) {
    errors.push('Height must be between 120 cm and 240 cm.');
  }
  if (!Number.isFinite(currentWeightKg) || currentWeightKg < 30 || currentWeightKg > 300) {
    errors.push('Current weight must be between 30 kg and 300 kg.');
  }
  if (!Number.isFinite(targetWeightKg) || targetWeightKg < 30 || targetWeightKg > 300) {
    errors.push('Target weight must be between 30 kg and 300 kg.');
  }
  if (
    !Number.isFinite(workoutFrequencyPerWeek) ||
    workoutFrequencyPerWeek < 0 ||
    workoutFrequencyPerWeek > 14
  ) {
    errors.push('Workout frequency must be between 0 and 14 sessions per week.');
  }

  const biologicalSex: BiologicalSex = raw.biologicalSex === 'female' ? 'female' : 'male';
  const activityLevel: ActivityLevel =
    raw.activityLevel && raw.activityLevel in ACTIVITY_MULTIPLIERS
      ? raw.activityLevel
      : 'moderate';
  const fitnessGoal: FitnessGoalType =
    raw.fitnessGoal === 'fat_loss' ||
    raw.fitnessGoal === 'muscle_gain' ||
    raw.fitnessGoal === 'recomposition' ||
    raw.fitnessGoal === 'maintenance'
      ? raw.fitnessGoal
      : 'maintenance';
  const goalSpeed: GoalSpeed =
    raw.goalSpeed === 'slow' || raw.goalSpeed === 'aggressive' || raw.goalSpeed === 'moderate'
      ? raw.goalSpeed
      : 'moderate';

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    sanitized: {
      age: Math.round(age),
      biologicalSex,
      heightCm: Math.round(heightCm * 10) / 10,
      currentWeightKg: Math.round(currentWeightKg * 100) / 100,
      targetWeightKg: Math.round(targetWeightKg * 100) / 100,
      dailyAverageSteps: Number(raw.dailyAverageSteps) > 0 ? Number(raw.dailyAverageSteps) : 7500,
      activityLevel,
      workoutFrequencyPerWeek: Math.round(workoutFrequencyPerWeek),
      workoutIntensity: raw.workoutIntensity || 'moderate',
      fitnessGoal,
      goalSpeed,
      goalAdjustmentPct: raw.goalAdjustmentPct,
      proteinPerKg: raw.proteinPerKg,
      fatCaloriesPct: raw.fatCaloriesPct,
    },
  };
}

export function suggestActivityLevel(
  dailyAverageSteps: number,
  workoutFrequencyPerWeek: number,
  workoutIntensity: WorkoutIntensity = 'moderate'
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

export function calculateBmi(
  weightKg: number,
  heightCm: number
): { bmi: number; bmiCategory: FitnessCalculationResult['bmiCategory'] } {
  const heightM = Math.max(1.2, heightCm / 100);
  const bmi = Math.round((weightKg / (heightM * heightM)) * 10) / 10;
  let bmiCategory: FitnessCalculationResult['bmiCategory'] = 'Normal';
  if (bmi < 18.5) bmiCategory = 'Underweight';
  else if (bmi < 25) bmiCategory = 'Normal';
  else if (bmi < 30) bmiCategory = 'Overweight';
  else bmiCategory = 'Obesity';
  return { bmi, bmiCategory };
}

export function calculateSmartFitnessTargets(
  input: FitnessCalculatorInput
): FitnessCalculationResult {
  const safeWeight = Math.max(30, Math.min(300, input.currentWeightKg || 65));
  const safeHeight = Math.max(120, Math.min(240, input.heightCm || 170));
  const safeAge = Math.min(100, Math.max(14, input.age || 25));
  const goalSpeed: GoalSpeed = input.goalSpeed || 'moderate';
  const speedCfg = GOAL_SPEED_CONFIG[goalSpeed];

  const { bmi, bmiCategory } = calculateBmi(safeWeight, safeHeight);
  const bmr = calculateMifflinStJeorBmr(safeWeight, safeHeight, safeAge, input.biologicalSex);
  const suggestedActivityLevel = suggestActivityLevel(
    input.dailyAverageSteps ?? 7500,
    input.workoutFrequencyPerWeek,
    input.workoutIntensity || 'moderate'
  );

  const activityMultiplier = ACTIVITY_MULTIPLIERS[input.activityLevel].factor;
  const estimatedTdee = Math.round(bmr * activityMultiplier);

  let rawTargetCalories = estimatedTdee;
  const safetyNotes: string[] = [];

  if (input.fitnessGoal === 'fat_loss') {
    const deficitPct = Math.min(25, Math.max(8, input.goalAdjustmentPct ?? speedCfg.fatLossPct));
    const rawDeficit = Math.round(estimatedTdee * (deficitPct / 100));
    const cappedDeficit = Math.min(850, rawDeficit);
    if (rawDeficit > 850) {
      safetyNotes.push(
        `Daily deficit was safely capped at 850 kcal/day to prevent excessive metabolic slowdown and lean mass loss.`
      );
    }
    rawTargetCalories = estimatedTdee - cappedDeficit;
  } else if (input.fitnessGoal === 'muscle_gain') {
    const surplusPct = Math.min(15, Math.max(5, input.goalAdjustmentPct ?? speedCfg.muscleGainPct));
    const rawSurplus = Math.round(estimatedTdee * (surplusPct / 100));
    const cappedSurplus = Math.min(500, rawSurplus);
    if (rawSurplus > 500) {
      safetyNotes.push(
        `Daily surplus was capped at +500 kcal/day to prioritize lean muscle gain over excess fat storage.`
      );
    }
    rawTargetCalories = estimatedTdee + cappedSurplus;
  } else if (input.fitnessGoal === 'recomposition') {
    const recompOffsetPct = speedCfg.recompPct;
    rawTargetCalories = Math.round(estimatedTdee * (1 + recompOffsetPct / 100));
  } else {
    rawTargetCalories = estimatedTdee;
  }

  // Guard against dangerously low calorie targets
  const genderFloor = input.biologicalSex === 'male' ? 1500 : 1200;
  const bmrFloor = Math.round(bmr * 0.92);
  const safeFloor = Math.max(genderFloor, bmrFloor);
  if (rawTargetCalories < safeFloor) {
    rawTargetCalories = safeFloor;
    safetyNotes.push(
      `Target adjusted up to a safe minimum floor (${safeFloor.toLocaleString()} kcal/day) to protect hormonal health, recovery, and lean mass.`
    );
  }

  // Protein: 1.6 - 2.2 g/kg bodyweight (or adjusted reference weight if BMI >= 30 so protein isn't inflated)
  const effectiveProteinWeightKg =
    bmi >= 32
      ? Math.round((27 * Math.pow(safeHeight / 100, 2) + safeWeight) * 0.5)
      : safeWeight;

  const defaultProteinFactor =
    input.fitnessGoal === 'fat_loss'
      ? goalSpeed === 'aggressive'
        ? 2.1
        : 2.0
      : input.fitnessGoal === 'recomposition'
      ? 2.0
      : input.fitnessGoal === 'muscle_gain'
      ? 1.9
      : 1.7;

  const proteinPerKg = Math.min(2.2, Math.max(1.6, input.proteinPerKg ?? defaultProteinFactor));
  let proteinGrams = Math.round(effectiveProteinWeightKg * proteinPerKg);

  // Fat: 20 - 30% of daily calories
  const defaultFatPct =
    input.fitnessGoal === 'fat_loss' ? 25 : input.fitnessGoal === 'muscle_gain' ? 26 : 27;
  const fatCaloriesPct = Math.min(30, Math.max(20, input.fatCaloriesPct ?? defaultFatPct));
  let fatGrams = Math.round((rawTargetCalories * (fatCaloriesPct / 100)) / 9);

  // Protect minimum carbohydrate energy for training performance
  const minCarbCalories = Math.round(rawTargetCalories * 0.2);
  if (proteinGrams * 4 + fatGrams * 9 > rawTargetCalories - minCarbCalories) {
    const maxProtein = Math.round((rawTargetCalories * 0.42) / 4);
    proteinGrams = Math.min(proteinGrams, maxProtein);
    const remainingForFat = Math.max(0, rawTargetCalories - proteinGrams * 4 - minCarbCalories);
    fatGrams = Math.max(
      Math.round((rawTargetCalories * 0.2) / 9),
      Math.round(remainingForFat / 9)
    );
  }

  const remainingCarbCalories = Math.max(0, rawTargetCalories - proteinGrams * 4 - fatGrams * 9);
  const carbsGrams = Math.round(remainingCarbCalories / 4);

  const proteinCalories = proteinGrams * 4;
  const carbsCalories = carbsGrams * 4;
  const fatCalories = fatGrams * 9;
  const recommendedCalories = proteinCalories + carbsCalories + fatCalories;

  const proteinPct = Math.round((proteinCalories / Math.max(1, recommendedCalories)) * 100);
  const fatPct = Math.round((fatCalories / Math.max(1, recommendedCalories)) * 100);
  const carbsPct = Math.max(0, 100 - proteinPct - fatPct);

  // Fibre: ~14 g per 1,000 kcal
  const fibreGrams = Math.max(20, Math.round((recommendedCalories / 1000) * 14));

  // Recommended daily hydration (~35 ml/kg + activity boost, rounded to 250 ml)
  const activityHydrationBoost =
    input.activityLevel === 'active' || input.activityLevel === 'very_active' ? 500 : 250;
  const rawWaterMl = safeWeight * 35 + activityHydrationBoost;
  const recommendedWaterMl = Math.min(
    4500,
    Math.max(2000, Math.round(rawWaterMl / 250) * 250)
  );

  const recommendedTargetWeightKg =
    input.targetWeightKg > 0 ? input.targetWeightKg : safeWeight;
  const calorieDelta = recommendedCalories - estimatedTdee;
  const weeklyRateKg = Math.round(((calorieDelta * 7) / 7700) * 100) / 100;

  let estimatedWeeks: number | null = null;
  let projectedTargetDate: string | null = null;
  const weightDiff = recommendedTargetWeightKg - safeWeight;
  if (Math.abs(weightDiff) >= 0.3) {
    if (
      (weightDiff < 0 && weeklyRateKg < -0.05) ||
      (weightDiff > 0 && weeklyRateKg > 0.05)
    ) {
      estimatedWeeks = Math.max(1, Math.round(Math.abs(weightDiff / weeklyRateKg)));
      const targetDt = new Date();
      targetDt.setDate(targetDt.getDate() + estimatedWeeks * 7);
      projectedTargetDate = targetDt.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } else if (input.fitnessGoal === 'recomposition') {
      estimatedWeeks = 12;
      const targetDt = new Date();
      targetDt.setDate(targetDt.getDate() + 12 * 7);
      projectedTargetDate = targetDt.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } else if (input.fitnessGoal === 'fat_loss' && weightDiff > 0) {
      safetyNotes.push(
        `Your target weight (${recommendedTargetWeightKg} kg) is above your current weight (${safeWeight} kg) while "Lose Fat" is selected.`
      );
    } else if (input.fitnessGoal === 'muscle_gain' && weightDiff < 0) {
      safetyNotes.push(
        `Your target weight (${recommendedTargetWeightKg} kg) is below your current weight (${safeWeight} kg) while "Build Muscle" is selected.`
      );
    }
  }

  const paceSummary =
    calorieDelta < -40
      ? `${Math.abs(calorieDelta).toLocaleString()} kcal daily calorie deficit for steady fat loss`
      : calorieDelta > 40
      ? `${calorieDelta.toLocaleString()} kcal daily calorie surplus for lean muscle gain`
      : 'Balanced maintenance intake to keep energy and body weight steady';

  const explanation: string[] = [
    `Resting daily burn is ${bmr.toLocaleString()} kcal/day, rising to ${estimatedTdee.toLocaleString()} kcal/day with your ${ACTIVITY_MULTIPLIERS[input.activityLevel].shortLabel.toLowerCase()} routine (${input.workoutFrequencyPerWeek} workouts/week).`,
    `Daily target of ${recommendedCalories.toLocaleString()} kcal gives a ${paceSummary}.`,
    `Macro split: ${proteinGrams}g Protein (${proteinPct}%), ${carbsGrams}g Carbs (${carbsPct}%), ${fatGrams}g Fat (${fatPct}%), plus ${fibreGrams}g Fibre and ${(recommendedWaterMl / 1000).toFixed(2).replace(/\.?0+$/, '')} L water.`,
  ];

  return {
    bmi,
    bmiCategory,
    bmr,
    activityMultiplier,
    suggestedActivityLevel,
    estimatedTdee,
    recommendedCalories,
    calorieDelta,
    proteinGrams,
    carbsGrams,
    fatGrams,
    fibreGrams,
    recommendedWaterMl,
    proteinCalories,
    carbsCalories,
    fatCalories,
    proteinPct,
    carbsPct,
    fatPct,
    recommendedTargetWeightKg,
    goalSpeed,
    estimatedWeeks,
    projectedTargetDate,
    weeklyRateKg,
    safetyNote: safetyNotes.length > 0 ? safetyNotes.join(' ') : undefined,
    explanation,
  };
}
