import type {
  ActivityLevel,
  BiologicalSex,
  FitnessGoalType,
  GoalPreset,
  GoalSpeed,
  MacroFocusType,
  SmartFitnessGoalType,
  WorkoutIntensity,
} from '../types';

export const CALCULATION_VERSION = 'calothrix-smart-v2.2';

export type CalculationPathway = 'adult' | 'adolescent' | 'pregnancy_or_breastfeeding';
export type BmrEquationType = 'mifflin_st_jeor' | 'katch_mcardle' | 'schofield_adolescent';
export type BmiBasisType = 'adult_who' | 'pediatric_cdc_percentile';
export type SweatRateLevel = 'low' | 'moderate' | 'high';
export type ClimateLevel = 'temperate' | 'warm_humid';

export interface ActivityCalculationBreakdown {
  modelType: 'custom_calibrated_pal_estimate';
  isValidatedScientificFormula: false;
  selectedTier: ActivityLevel;
  /** Conventional standard activity multiplier (e.g. 1.2, 1.375, 1.55, 1.725, 1.9) */
  conventionalTierMultiplier: number;
  selectedTierFactor: number;
  dailyAverageSteps: number;
  workoutFrequencyPerWeek: number;
  workoutIntensity: WorkoutIntensity;
  stepContributionExact: number;
  stepContribution: number;
  workoutContributionExact: number;
  workoutContribution: number;
  behavioralPalExact: number;
  behavioralPal: number;
  tierWeight: number;
  behavioralWeight: number;
  appliedMultiplierExact: number;
  appliedMultiplier: number;
  calibrationBasis: string;
  modelExplanation: string;
}

export interface CalculationTransparencyBreakdown {
  bmr: string;
  activity: string;
  tdee: string;
  calorieStrategy: string;
  macros: string;
  fibreAndHydration: string;
  timeline: string;
}

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
  /** Optional average workout duration in minutes (0–240) used for factor-dependent hydration estimates */
  avgWorkoutDurationMin?: number;
  /** Optional individual sweat rate level for factor-dependent hydration estimates */
  sweatRateLevel?: SweatRateLevel;
  /** Optional ambient climate for factor-dependent hydration estimates */
  climateLevel?: ClimateLevel;
  /** Optional explicit flag for resistance/strength training (used for Build Muscle guidance) */
  doesResistanceTraining?: boolean;
  fitnessGoal: FitnessGoalType;
  goalSpeed?: GoalSpeed;
  macroFocus?: MacroFocusType;
  /** Optional user-provided body-fat percentage (4–60%). Never invented if omitted. */
  bodyFatPct?: number | null;
  /** Optional safety flag: blocks automatic calorie-deficit prescriptions */
  isPregnantOrBreastfeeding?: boolean;
  /** Optional real-world calibrated maintenance TDEE from 7-day assessments */
  adaptiveTdeeKcal?: number | null;
  /** When true and adaptiveTdeeKcal is valid, strategy offsets apply to adaptiveTdeeKcal while still reporting formula estimatedTdee separately */
  useAdaptiveTdee?: boolean;
  /** Optional override: Deficit pct for fat loss (10-20), surplus pct for build muscle (5-10) or gain (8-15) */
  goalAdjustmentPct?: number;
  /** Optional override: Protein grams per kg reference bodyweight (1.4-2.2) */
  proteinPerKg?: number;
  /** Optional override: Fat percentage of daily calories (20-35) */
  fatCaloriesPct?: number;
}

export interface FitnessCalculationResult {
  calculationVersion: string;
  pathway: CalculationPathway;
  bmrEquation: BmrEquationType;
  normalizedGoal: SmartFitnessGoalType;
  macroFocus: MacroFocusType;
  isEstimate: true;
  deficitBlocked: boolean;
  adultPrescriptionBlocked: boolean;
  bmi: number;
  bmiExact: number;
  bmiBasis: BmiBasisType;
  bmiPercentile: number | null;
  bmiCategory: 'Underweight' | 'Normal' | 'Overweight' | 'Obesity';
  bodyStatusLabel: string;
  bmiDisclaimer: string;
  bmr: number;
  bmrExact: number;
  activityMultiplier: number;
  activityMultiplierExact: number;
  activityBreakdown: ActivityCalculationBreakdown;
  suggestedActivityLevel: ActivityLevel;
  /** Formula-based maintenance estimate (never confused with adaptiveTdeeKcal) */
  estimatedTdee: number;
  estimatedTdeeExact: number;
  estimatedTdeeKcal: number;
  /** Real-world calibrated maintenance estimate when available */
  adaptiveTdeeKcal: number | null;
  /** The maintenance reference used to compute recommendedCalories */
  activeMaintenanceExact: number;
  activeMaintenanceKcal: number;
  rawStrategyDeltaExact: number;
  rawTargetCaloriesExact: number;
  targetStrategyPctConfigured: number;
  recommendedCalories: number;
  /** Exact integer difference: recommendedCalories - activeMaintenanceKcal */
  calorieDelta: number;
  /** Exact percentage matching calorieDelta / activeMaintenanceKcal * 100 (rounded to 2 decimals) */
  actualCalorieDeltaPct: number;
  proteinReferenceWeightKg: number;
  usedAdjustedProteinWeight: boolean;
  proteinPerKgUsed: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fibreGrams: number;
  fibreIsEstimate: true;
  hydrationBaseMlExact: number;
  hydrationBaseMl: number;
  hydrationExerciseAddMlExact: number;
  hydrationStepsAddMlExact: number;
  hydrationActivityAddMl: number;
  hydrationWeightUsedKg: number;
  hydrationFactorsUsed: {
    avgWorkoutDurationMin: number;
    workoutFrequencyPerWeek: number;
    workoutIntensity: WorkoutIntensity;
    sweatRateLevel: SweatRateLevel;
    climateLevel: ClimateLevel;
    dailyAverageSteps: number;
  };
  recommendedWaterMlExact: number;
  recommendedWaterMl: number;
  hydrationIsEstimate: true;
  hydrationDisclaimer: string;
  proteinCalories: number;
  carbsCalories: number;
  fatCalories: number;
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
  recommendedTargetWeightKg: number;
  remainingWeightDiffKg: number;
  goalSpeed: GoalSpeed;
  /** Theoretical initial weekly rate from simplified 7,700 kcal/kg energy-balance model */
  theoreticalWeeklyRateKg: number;
  /** Theoretical linear weeks at static 7,700 kcal/kg (reference only, not a prediction) */
  theoreticalWeeksExact: number | null;
  estimatedWeeks: number | null;
  estimatedWeeksRange: { min: number; max: number } | null;
  projectedTargetDate: string | null;
  weeklyRateKg: number;
  timelineDisclaimer: string;
  resistanceTrainingNote?: string;
  safetyNote?: string;
  calculationBreakdown: CalculationTransparencyBreakdown;
  explanation: string[];
}

export interface WhatIfGoalComparison {
  goal: SmartFitnessGoalType;
  label: string;
  shortLabel: string;
  recommendedCalories: number;
  calorieDelta: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fibreGrams: number;
  weeklyRateKg: number;
  estimatedWeeks: number | null;
  deficitBlocked: boolean;
}

export const SMART_FITNESS_GOAL_META: Record<
  SmartFitnessGoalType,
  {
    id: SmartFitnessGoalType;
    label: string;
    shortLabel: string;
    legacyAlias: 'muscle_gain' | 'fat_loss' | 'recomposition' | 'maintenance';
    summary: string;
  }
> = {
  build_muscle: {
    id: 'build_muscle',
    label: 'Build Muscle',
    shortLabel: 'Build Muscle',
    legacyAlias: 'muscle_gain',
    summary: 'Conservative 5–10% lean surplus paired with resistance training & high protein',
  },
  fat_gain: {
    id: 'fat_gain',
    label: 'Healthy Weight Gain',
    shortLabel: 'Weight Gain',
    legacyAlias: 'muscle_gain',
    summary: 'Modest 8–15% surplus for steady, healthy overall mass gain',
  },
  lose_weight: {
    id: 'lose_weight',
    label: 'Lose Fat / Lose Weight',
    shortLabel: 'Lose Weight',
    legacyAlias: 'fat_loss',
    summary: 'Moderate 10–20% deficit prioritizing lean mass retention and sustainable pace',
  },
  recomposition: {
    id: 'recomposition',
    label: 'Body Recomposition',
    shortLabel: 'Recomp',
    legacyAlias: 'recomposition',
    summary: 'Near-maintenance intake with higher protein to gradually improve body composition',
  },
  maintain_weight: {
    id: 'maintain_weight',
    label: 'Maintain Weight',
    shortLabel: 'Maintain',
    legacyAlias: 'maintenance',
    summary: 'Balanced intake near estimated maintenance to hold weight and fuel daily recovery',
  },
};

export const MACRO_FOCUS_META: Record<
  MacroFocusType,
  {
    id: MacroFocusType;
    label: string;
    shortLabel: string;
    description: string;
    fatPctDefault: number;
    proteinBias: number;
    minCarbPct: number;
  }
> = {
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    shortLabel: 'Balanced',
    description: 'Steady split of protein, complex carbs, and healthy fats (~27% fat)',
    fatPctDefault: 27,
    proteinBias: 0,
    minCarbPct: 22,
  },
  high_protein: {
    id: 'high_protein',
    label: 'High Protein',
    shortLabel: 'High Protein',
    description: 'Upper end of protein target for satiety and lean tissue support (~24% fat)',
    fatPctDefault: 24,
    proteinBias: 0.15,
    minCarbPct: 20,
  },
  lower_carb: {
    id: 'lower_carb',
    label: 'Lower Carb',
    shortLabel: 'Lower Carb',
    description: 'Higher healthy fat (~33%) & protein allocation with moderated carbs',
    fatPctDefault: 33,
    proteinBias: 0.1,
    minCarbPct: 15,
  },
  athletic: {
    id: 'athletic',
    label: 'Athletic / Higher Carb',
    shortLabel: 'Athletic',
    description: 'Lower fat (~22%) to maximize glycogen-replenishing carbohydrates',
    fatPctDefault: 22,
    proteinBias: 0,
    minCarbPct: 30,
  },
};

export function normalizeFitnessGoal(
  goal?: FitnessGoalType | GoalPreset | string | null
): SmartFitnessGoalType {
  switch (goal) {
    case 'build_muscle':
    case 'muscle_gain':
      return 'build_muscle';
    case 'fat_gain':
      return 'fat_gain';
    case 'lose_weight':
    case 'fat_loss':
      return 'lose_weight';
    case 'recomposition':
      return 'recomposition';
    case 'maintain_weight':
    case 'maintenance':
    default:
      return 'maintain_weight';
  }
}

export function normalizeMacroFocus(focus?: MacroFocusType | string | null): MacroFocusType {
  if (
    focus === 'high_protein' ||
    focus === 'balanced' ||
    focus === 'lower_carb' ||
    focus === 'athletic'
  ) {
    return focus;
  }
  return 'balanced';
}

export function getGoalDisplayLabel(goal?: FitnessGoalType | GoalPreset | string | null): string {
  return SMART_FITNESS_GOAL_META[normalizeFitnessGoal(goal)].label;
}

export function getGoalDirectionForStrategy(
  goal: FitnessGoalType | GoalPreset,
  currentWeightKg: number,
  targetWeightKg: number
): 'loss' | 'gain' | 'maintain' {
  const normalized = normalizeFitnessGoal(goal);
  if (normalized === 'lose_weight') return 'loss';
  if (normalized === 'build_muscle' || normalized === 'fat_gain') return 'gain';
  if (normalized === 'maintain_weight') return 'maintain';
  if (targetWeightKg > 0 && currentWeightKg > 0) {
    if (targetWeightKg < currentWeightKg - 0.4) return 'loss';
    if (targetWeightKg > currentWeightKg + 0.4) return 'gain';
  }
  return 'maintain';
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
    fatGainPct: number;
    recompPct: number;
    description: string;
  }
> = {
  slow: {
    label: 'Slow & Sustainable',
    fatLossPct: 10,
    muscleGainPct: 5,
    fatGainPct: 8,
    recompPct: 0,
    description: 'Gentle adjustment prioritizing energy, adherence, and lean mass retention',
  },
  moderate: {
    label: 'Moderate (Recommended)',
    fatLossPct: 15,
    muscleGainPct: 7.5,
    fatGainPct: 11.5,
    recompPct: -3,
    description: 'Evidence-based sweet spot balancing steady weekly progress and recovery',
  },
  aggressive: {
    label: 'Faster (Safely Capped)',
    fatLossPct: 20,
    muscleGainPct: 10,
    fatGainPct: 15,
    recompPct: -5,
    description: 'Upper evidence-informed pace bounded strictly by relative safety caps',
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
  const dailyAverageSteps =
    raw.dailyAverageSteps !== undefined && raw.dailyAverageSteps !== null
      ? Number(raw.dailyAverageSteps)
      : 7500;

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
  if (!Number.isFinite(dailyAverageSteps) || dailyAverageSteps < 0 || dailyAverageSteps > 50000) {
    errors.push('Daily average steps must be between 0 and 50,000.');
  }

  let sanitizedBodyFatPct: number | null = null;
  if (
    raw.bodyFatPct !== undefined &&
    raw.bodyFatPct !== null &&
    String(raw.bodyFatPct).trim() !== ''
  ) {
    const bf = Number(raw.bodyFatPct);
    if (!Number.isFinite(bf) || bf < 4 || bf > 60) {
      errors.push('Body-fat percentage must be between 4% and 60% when provided.');
    } else {
      sanitizedBodyFatPct = Math.round(bf * 10) / 10;
    }
  }

  const biologicalSex: BiologicalSex = raw.biologicalSex === 'female' ? 'female' : 'male';
  const activityLevel: ActivityLevel =
    raw.activityLevel && raw.activityLevel in ACTIVITY_MULTIPLIERS
      ? raw.activityLevel
      : 'moderate';
  const workoutIntensity: WorkoutIntensity =
    raw.workoutIntensity === 'light' ||
    raw.workoutIntensity === 'vigorous' ||
    raw.workoutIntensity === 'moderate'
      ? raw.workoutIntensity
      : 'moderate';

  const validGoals: FitnessGoalType[] = [
    'fat_loss',
    'maintenance',
    'muscle_gain',
    'recomposition',
    'build_muscle',
    'fat_gain',
    'lose_weight',
    'maintain_weight',
  ];
  const fitnessGoal: FitnessGoalType =
    raw.fitnessGoal && validGoals.includes(raw.fitnessGoal)
      ? raw.fitnessGoal
      : 'maintain_weight';

  const goalSpeed: GoalSpeed =
    raw.goalSpeed === 'slow' || raw.goalSpeed === 'aggressive' || raw.goalSpeed === 'moderate'
      ? raw.goalSpeed
      : 'moderate';
  const macroFocus = normalizeMacroFocus(raw.macroFocus);

  const adaptiveTdeeKcal =
    raw.adaptiveTdeeKcal !== undefined &&
    raw.adaptiveTdeeKcal !== null &&
    Number.isFinite(Number(raw.adaptiveTdeeKcal)) &&
    Number(raw.adaptiveTdeeKcal) >= 1000 &&
    Number(raw.adaptiveTdeeKcal) <= 7500
      ? Math.round(Number(raw.adaptiveTdeeKcal))
      : null;

  let avgWorkoutDurationMin = Math.round(workoutFrequencyPerWeek) > 0 ? 45 : 0;
  if (
    raw.avgWorkoutDurationMin !== undefined &&
    raw.avgWorkoutDurationMin !== null &&
    String(raw.avgWorkoutDurationMin).trim() !== ''
  ) {
    const dur = Number(raw.avgWorkoutDurationMin);
    if (!Number.isFinite(dur) || dur < 0 || dur > 240) {
      errors.push('Average workout duration must be between 0 and 240 minutes.');
    } else {
      avgWorkoutDurationMin = Math.round(dur);
    }
  }
  const sweatRateLevel: SweatRateLevel =
    raw.sweatRateLevel === 'low' || raw.sweatRateLevel === 'high' || raw.sweatRateLevel === 'moderate'
      ? raw.sweatRateLevel
      : 'moderate';
  const climateLevel: ClimateLevel =
    raw.climateLevel === 'warm_humid' || raw.climateLevel === 'temperate'
      ? raw.climateLevel
      : 'temperate';

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
      dailyAverageSteps: Math.round(dailyAverageSteps),
      activityLevel,
      workoutFrequencyPerWeek: Math.round(workoutFrequencyPerWeek),
      workoutIntensity,
      avgWorkoutDurationMin,
      sweatRateLevel,
      climateLevel,
      doesResistanceTraining:
        typeof raw.doesResistanceTraining === 'boolean'
          ? raw.doesResistanceTraining
          : Math.round(workoutFrequencyPerWeek) >= 2,
      fitnessGoal,
      goalSpeed,
      macroFocus,
      bodyFatPct: sanitizedBodyFatPct,
      isPregnantOrBreastfeeding: Boolean(raw.isPregnantOrBreastfeeding),
      adaptiveTdeeKcal,
      useAdaptiveTdee: Boolean(raw.useAdaptiveTdee && adaptiveTdeeKcal),
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

/**
 * Custom Calibrated Physical Activity Level (PAL) Estimate (non-overlapping heuristic model).
 * NOTE: This weighted blend (65% conventional activity tier + 35% movement calibration from steps & workouts)
 * is a custom heuristic calibration designed to avoid double-counting steps, workouts, daily activity, and TEF —
 * it is NOT a universally validated clinical formula. Conventional standard tier multipliers are also exposed
 * alongside it so users see both the standard tier and the calibrated estimate transparently.
 */
export function calculateActivityBreakdown(
  activityLevel: ActivityLevel,
  dailyAverageSteps = 7500,
  workoutFrequencyPerWeek = 3,
  workoutIntensity: WorkoutIntensity = 'moderate'
): ActivityCalculationBreakdown {
  const selectedTierFactor = ACTIVITY_MULTIPLIERS[activityLevel].factor;

  const clampedSteps = Math.max(0, Math.min(25000, dailyAverageSteps));
  const stepContributionExact = Math.min(
    0.42,
    Math.max(0, ((clampedSteps - 2500) / 15000) * 0.42)
  );

  const intensityScale =
    workoutIntensity === 'vigorous' ? 0.055 : workoutIntensity === 'moderate' ? 0.04 : 0.025;
  const clampedWorkouts = Math.max(0, Math.min(14, workoutFrequencyPerWeek));
  const workoutContributionExact = Math.min(0.36, clampedWorkouts * intensityScale);

  const behavioralPalExact = Math.min(
    1.95,
    Math.max(1.2, 1.18 + stepContributionExact + workoutContributionExact)
  );

  const tierWeight = 0.65;
  const behavioralWeight = 0.35;
  const blendedExact = selectedTierFactor * tierWeight + behavioralPalExact * behavioralWeight;
  const appliedMultiplierExact = Math.min(1.95, Math.max(1.2, blendedExact));
  const appliedMultiplier = Math.round(appliedMultiplierExact * 1000) / 1000;

  const calibrationBasis =
    'Custom calibrated PAL estimate (heuristic model, not a universally validated clinical formula): weights 65% conventional activity tier + 35% movement estimate (1.18 baseline + steps scaled 0–0.42 across 2,500–17,500 steps/day + workouts × intensity factor 0.025/0.040/0.055 capped at 0.36; bounded 1.20–1.95). Built into a single PAL factor so exercise, steps, NEAT, and TEF are never double-counted.';

  const modelExplanation = `Custom calibrated PAL estimate: 65% × ${selectedTierFactor.toFixed(
    3
  )} (${ACTIVITY_MULTIPLIERS[activityLevel].shortLabel} conventional tier) + 35% × ${behavioralPalExact.toFixed(
    4
  )} (movement factor = 1.18 + ${stepContributionExact.toFixed(4)} steps + ${workoutContributionExact.toFixed(
    4
  )} workouts from ${Math.round(
    clampedSteps
  ).toLocaleString()} steps/day & ${clampedWorkouts} ${workoutIntensity} sessions/wk) = ${appliedMultiplierExact.toFixed(
    4
  )} (displayed ×${appliedMultiplier.toFixed(
    2
  )}). Heuristic estimate — not a universally validated formula; steps, exercise, and TEF are never added twice.`;

  return {
    modelType: 'custom_calibrated_pal_estimate',
    isValidatedScientificFormula: false,
    selectedTier: activityLevel,
    conventionalTierMultiplier: selectedTierFactor,
    selectedTierFactor,
    dailyAverageSteps: Math.round(clampedSteps),
    workoutFrequencyPerWeek: clampedWorkouts,
    workoutIntensity,
    stepContributionExact,
    stepContribution: Math.round(stepContributionExact * 1000) / 1000,
    workoutContributionExact,
    workoutContribution: Math.round(workoutContributionExact * 1000) / 1000,
    behavioralPalExact,
    behavioralPal: Math.round(behavioralPalExact * 1000) / 1000,
    tierWeight,
    behavioralWeight,
    appliedMultiplierExact,
    appliedMultiplier,
    calibrationBasis,
    modelExplanation,
  };
}

export function calculateCalibratedActivityFactor(
  activityLevel: ActivityLevel,
  dailyAverageSteps = 7500,
  workoutFrequencyPerWeek = 3,
  workoutIntensity: WorkoutIntensity = 'moderate'
): number {
  return calculateActivityBreakdown(
    activityLevel,
    dailyAverageSteps,
    workoutFrequencyPerWeek,
    workoutIntensity
  ).appliedMultiplier;
}

/** Exact unrounded Mifflin-St Jeor BMR (adults 18+ years) */
export function calculateMifflinStJeorBmrExact(
  weightKg: number,
  heightCm: number,
  age: number,
  biologicalSex: BiologicalSex
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return biologicalSex === 'male' ? base + 5 : base - 161;
}

export function calculateMifflinStJeorBmr(
  weightKg: number,
  heightCm: number,
  age: number,
  biologicalSex: BiologicalSex
): number {
  return Math.round(calculateMifflinStJeorBmrExact(weightKg, heightCm, age, biologicalSex));
}

/** Exact unrounded Katch-McArdle BMR (adults with valid body-fat %) */
export function calculateKatchMcArdleBmrExact(weightKg: number, bodyFatPct: number): number {
  const clampedBf = Math.min(60, Math.max(4, bodyFatPct));
  const leanBodyMassKg = weightKg * (1 - clampedBf / 100);
  return 370 + 21.6 * leanBodyMassKg;
}

export function calculateKatchMcArdleBmr(weightKg: number, bodyFatPct: number): number {
  return Math.round(calculateKatchMcArdleBmrExact(weightKg, bodyFatPct));
}

/**
 * Exact unrounded FAO/WHO/UNU Schofield (1985) adolescent BMR equation (ages 10–18 years,
 * weight + height form). Used for users aged 14–17 instead of the adult Mifflin-St Jeor equation.
 */
export function calculateSchofieldAdolescentBmrExact(
  weightKg: number,
  heightCm: number,
  biologicalSex: BiologicalSex
): number {
  if (biologicalSex === 'male') {
    return 16.25 * weightKg + 1.372 * heightCm + 515.5;
  }
  return 8.365 * weightKg + 4.65 * heightCm + 200.0;
}

export function calculateSchofieldAdolescentBmr(
  weightKg: number,
  heightCm: number,
  biologicalSex: BiologicalSex
): number {
  return Math.round(calculateSchofieldAdolescentBmrExact(weightKg, heightCm, biologicalSex));
}

/**
 * Standard normal CDF (Abramowitz & Stegun 7.1.26, max error < 1.5e-7)
 * used to convert pediatric BMI-for-age Box-Cox z-scores into percentiles.
 */
function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
    t;
  const erf = 1 - poly * Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

/**
 * CDC 2000 BMI-for-age LMS reference parameters (midpoint of each year of age: 14.5–17.5y)
 * for adolescent screening (ages 14–17).
 */
const CDC_ADOLESCENT_BMI_LMS: Record<
  BiologicalSex,
  Record<14 | 15 | 16 | 17, { L: number; M: number; S: number }>
> = {
  male: {
    14: { L: -2.23, M: 19.45, S: 0.13 },
    15: { L: -2.14, M: 20.13, S: 0.131 },
    16: { L: -2.01, M: 20.8, S: 0.132 },
    17: { L: -1.85, M: 21.46, S: 0.133 },
  },
  female: {
    14: { L: -1.94, M: 19.63, S: 0.141 },
    15: { L: -1.97, M: 20.16, S: 0.143 },
    16: { L: -2.0, M: 20.61, S: 0.145 },
    17: { L: -2.02, M: 20.99, S: 0.148 },
  },
};

export const BMI_SCREENING_DISCLAIMER =
  'BMI is a general screening metric and does not directly measure body fat or muscle mass.';

export function calculateBmi(
  weightKg: number,
  heightCm: number,
  age?: number,
  biologicalSex: BiologicalSex = 'male'
): {
  bmi: number;
  bmiExact: number;
  bmiBasis: BmiBasisType;
  bmiPercentile: number | null;
  bmiCategory: FitnessCalculationResult['bmiCategory'];
  bodyStatusLabel: string;
  bmiDisclaimer: string;
} {
  const heightM = Math.max(1.2, heightCm / 100);
  const bmiExact = weightKg / (heightM * heightM);
  const bmi = Math.round(bmiExact * 10) / 10;

  // Under-18 pathway: CDC age- and sex-specific BMI-for-age percentiles
  if (age !== undefined && Number.isFinite(age) && age >= 14 && age < 18) {
    const ageKey = Math.min(17, Math.max(14, Math.floor(age))) as 14 | 15 | 16 | 17;
    const { L, M, S } = CDC_ADOLESCENT_BMI_LMS[biologicalSex][ageKey];
    const zScore = (Math.pow(bmiExact / M, L) - 1) / (L * S);
    const rawPercentile = normalCdf(zScore) * 100;
    const bmiPercentile = Math.min(99.9, Math.max(0.1, Math.round(rawPercentile * 10) / 10));

    let bmiCategory: FitnessCalculationResult['bmiCategory'] = 'Normal';
    let rangeLabel = 'Healthy weight';
    if (bmiPercentile < 5) {
      bmiCategory = 'Underweight';
      rangeLabel = 'Underweight';
    } else if (bmiPercentile < 85) {
      bmiCategory = 'Normal';
      rangeLabel = 'Healthy BMI-for-age';
    } else if (bmiPercentile < 95) {
      bmiCategory = 'Overweight';
      rangeLabel = 'Overweight';
    } else {
      bmiCategory = 'Obesity';
      rangeLabel = 'Obesity';
    }

    const roundedPct = Math.round(bmiPercentile);
    return {
      bmi,
      bmiExact,
      bmiBasis: 'pediatric_cdc_percentile',
      bmiPercentile,
      bmiCategory,
      bodyStatusLabel: `${rangeLabel} (~${roundedPct}th %ile)`,
      bmiDisclaimer:
        'For ages 14–17, BMI is screened using age- and sex-specific percentiles rather than adult cutoffs. BMI does not directly measure body fat or muscle mass.',
    };
  }

  // Adult WHO BMI categories
  let bmiCategory: FitnessCalculationResult['bmiCategory'] = 'Normal';
  let bodyStatusLabel = 'Healthy BMI range';
  if (bmiExact < 18.5) {
    bmiCategory = 'Underweight';
    bodyStatusLabel = 'Underweight';
  } else if (bmiExact < 25) {
    bmiCategory = 'Normal';
    bodyStatusLabel = 'Healthy BMI range';
  } else if (bmiExact < 30) {
    bmiCategory = 'Overweight';
    bodyStatusLabel = 'Overweight';
  } else {
    bmiCategory = 'Obesity';
    bodyStatusLabel = 'Obesity';
  }

  return {
    bmi,
    bmiExact,
    bmiBasis: 'adult_who',
    bmiPercentile: null,
    bmiCategory,
    bodyStatusLabel,
    bmiDisclaimer: BMI_SCREENING_DISCLAIMER,
  };
}

/**
 * Computes adjusted reference weight for protein scaling when BMI >= 30 (adult obesity)
 * so protein targets reflect lean tissue demand rather than scaling blindly with excess adiposity.
 */
export function computeProteinReferenceWeight(
  weightKg: number,
  heightCm: number,
  bmi: number,
  bodyFatPct?: number | null
): { referenceWeightKg: number; usedAdjustedWeight: boolean } {
  if (bodyFatPct !== undefined && bodyFatPct !== null && bodyFatPct >= 4 && bodyFatPct <= 60) {
    if (bmi >= 30) {
      const lbm = weightKg * (1 - bodyFatPct / 100);
      const refWeight = Math.round((lbm / 0.78) * 10) / 10;
      return {
        referenceWeightKg: Math.min(weightKg, Math.max(45, refWeight)),
        usedAdjustedWeight: true,
      };
    }
  }
  if (bmi >= 30) {
    const heightM = Math.max(1.2, heightCm / 100);
    const referenceHealthyWeight = 24 * heightM * heightM;
    const adjusted = referenceHealthyWeight + 0.4 * (weightKg - referenceHealthyWeight);
    return {
      referenceWeightKg: Math.round(adjusted * 10) / 10,
      usedAdjustedWeight: true,
    };
  }
  return { referenceWeightKg: weightKg, usedAdjustedWeight: false };
}

/**
 * Pure macro allocation given a target calorie level, reference bodyweight, goal, and macro focus.
 * Guarantees Calories = (Protein * 4) + (Carbs * 4) + (Fat * 9) and never adds fibre on top of kcal.
 * Macro preferences (Balanced, High Protein, Lower Carb, Athletic) remain independent of fitness goals.
 */
export function allocateMacrosForCalories(params: {
  targetCalories: number;
  weightKg: number;
  heightCm: number;
  bmi: number;
  normalizedGoal: SmartFitnessGoalType;
  goalSpeed: GoalSpeed;
  macroFocus: MacroFocusType;
  bodyFatPct?: number | null;
  proteinPerKgOverride?: number;
  fatCaloriesPctOverride?: number;
}): {
  proteinReferenceWeightKg: number;
  usedAdjustedProteinWeight: boolean;
  proteinPerKgUsed: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fibreGrams: number;
  proteinCalories: number;
  carbsCalories: number;
  fatCalories: number;
  recommendedCalories: number;
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
} {
  const {
    targetCalories,
    weightKg,
    heightCm,
    bmi,
    normalizedGoal,
    goalSpeed,
    macroFocus,
    bodyFatPct,
    proteinPerKgOverride,
    fatCaloriesPctOverride,
  } = params;

  const focusCfg = MACRO_FOCUS_META[macroFocus];
  const { referenceWeightKg, usedAdjustedWeight } = computeProteinReferenceWeight(
    weightKg,
    heightCm,
    bmi,
    bodyFatPct
  );

  // Evidence-informed starting protein ranges (g/kg reference weight)
  let baseProteinPerKg = 1.7;
  let minProteinPerKg = 1.5;
  let maxProteinPerKg = 2.0;

  if (normalizedGoal === 'build_muscle' || normalizedGoal === 'fat_gain') {
    baseProteinPerKg = 1.8;
    minProteinPerKg = 1.6;
    maxProteinPerKg = 2.0;
  } else if (normalizedGoal === 'lose_weight' || normalizedGoal === 'recomposition') {
    baseProteinPerKg = goalSpeed === 'aggressive' ? 2.1 : 1.95;
    minProteinPerKg = 1.8;
    maxProteinPerKg = 2.2;
  } else {
    baseProteinPerKg = 1.7;
    minProteinPerKg = 1.5;
    maxProteinPerKg = 2.0;
  }

  const desiredProteinPerKg =
    proteinPerKgOverride !== undefined
      ? Math.min(2.2, Math.max(1.4, proteinPerKgOverride))
      : Math.min(
          maxProteinPerKg,
          Math.max(minProteinPerKg, baseProteinPerKg + focusCfg.proteinBias)
        );

  let proteinGrams = Math.round(referenceWeightKg * desiredProteinPerKg);

  // Dietary fat: configurable 20–35% of daily calories driven by independent macroFocus
  const desiredFatPct =
    fatCaloriesPctOverride !== undefined
      ? Math.min(35, Math.max(20, fatCaloriesPctOverride))
      : focusCfg.fatPctDefault;

  const minFatGrams = Math.max(
    Math.round((targetCalories * 0.2) / 9),
    Math.round(referenceWeightKg * 0.55)
  );
  const maxFatGrams = Math.round((targetCalories * 0.35) / 9);
  let fatGrams = Math.min(
    Math.max(minFatGrams, maxFatGrams),
    Math.max(minFatGrams, Math.round((targetCalories * (desiredFatPct / 100)) / 9))
  );

  // Protect carbohydrate floor based on macro focus
  const minCarbCalories = Math.round(targetCalories * (focusCfg.minCarbPct / 100));
  if (proteinGrams * 4 + fatGrams * 9 > targetCalories - minCarbCalories) {
    const maxProtein = Math.round((targetCalories * 0.42) / 4);
    proteinGrams = Math.min(proteinGrams, maxProtein);
    const remainingForFat = Math.max(0, targetCalories - proteinGrams * 4 - minCarbCalories);
    fatGrams = Math.max(
      Math.round((targetCalories * 0.2) / 9),
      Math.min(fatGrams, Math.round(remainingForFat / 9))
    );
  }

  const remainingCarbCalories = Math.max(0, targetCalories - proteinGrams * 4 - fatGrams * 9);
  const carbsGrams = Math.round(remainingCarbCalories / 4);

  const proteinCalories = proteinGrams * 4;
  const carbsCalories = carbsGrams * 4;
  const fatCalories = fatGrams * 9;
  const recommendedCalories = proteinCalories + carbsCalories + fatCalories;

  const proteinPct = Math.round((proteinCalories / Math.max(1, recommendedCalories)) * 100);
  const fatPct = Math.round((fatCalories / Math.max(1, recommendedCalories)) * 100);
  const carbsPct = Math.max(0, 100 - proteinPct - fatPct);

  // Fibre: ~14 g per 1,000 kcal (estimated starting target, bounded 20–50 g), NOT added to kcal equation
  const fibreGrams = Math.min(50, Math.max(20, Math.round((recommendedCalories / 1000) * 14)));

  return {
    proteinReferenceWeightKg: referenceWeightKg,
    usedAdjustedProteinWeight: usedAdjustedWeight,
    proteinPerKgUsed: Math.round((proteinGrams / Math.max(1, referenceWeightKg)) * 100) / 100,
    proteinGrams,
    carbsGrams,
    fatGrams,
    fibreGrams,
    proteinCalories,
    carbsCalories,
    fatCalories,
    recommendedCalories,
    proteinPct,
    carbsPct,
    fatPct,
  };
}

export const HYDRATION_DISCLAIMER =
  'Estimated daily fluid intake only. Individual hydration varies meaningfully with exercise duration, sweat rate, ambient heat/humidity, food moisture, and health status.';

/**
 * Factor-dependent hydration estimate:
 * - Documented base: 35 ml/kg × current body weight (unrounded internally)
 * - Exercise sweat-loss allowance (daily average): derived from weekly workout frequency,
 *   average session duration, workout intensity, individual sweat rate, and climate
 *   (NEVER a fixed universal allowance like +450 ml for everyone).
 * - Daily steps movement allowance: modest adjustment above 6,000 steps/day scaled by climate.
 * Rounded only at presentation so baseWaterMl + activityAddMl === totalWaterMl exactly.
 */
export function calculateHydrationEstimate(
  weightKg: number,
  activityLevel: ActivityLevel,
  workoutFrequencyPerWeek: number,
  options?: {
    workoutIntensity?: WorkoutIntensity;
    avgWorkoutDurationMin?: number;
    sweatRateLevel?: SweatRateLevel;
    climateLevel?: ClimateLevel;
    dailyAverageSteps?: number;
  }
): {
  weightUsedKg: number;
  baseWaterMlExact: number;
  baseWaterMl: number;
  exerciseAddMlExact: number;
  stepsAddMlExact: number;
  activityAddMlExact: number;
  activityAddMl: number;
  totalWaterMlExact: number;
  totalWaterMl: number;
  factorsUsed: {
    avgWorkoutDurationMin: number;
    workoutFrequencyPerWeek: number;
    workoutIntensity: WorkoutIntensity;
    sweatRateLevel: SweatRateLevel;
    climateLevel: ClimateLevel;
    dailyAverageSteps: number;
  };
  disclaimer: string;
} {
  const safeWeightKg = Math.max(30, Math.min(300, weightKg));
  const clampedWorkouts = Math.max(0, Math.min(14, Math.round(workoutFrequencyPerWeek)));
  const workoutIntensity: WorkoutIntensity = options?.workoutIntensity || 'moderate';
  const avgWorkoutDurationMin =
    options?.avgWorkoutDurationMin !== undefined
      ? Math.max(0, Math.min(240, options.avgWorkoutDurationMin))
      : clampedWorkouts > 0
      ? 45
      : 0;
  const sweatRateLevel: SweatRateLevel = options?.sweatRateLevel || 'moderate';
  const climateLevel: ClimateLevel = options?.climateLevel || 'temperate';
  const dailyAverageSteps =
    options?.dailyAverageSteps !== undefined
      ? Math.max(0, Math.min(50000, options.dailyAverageSteps))
      : activityLevel === 'very_active'
      ? 14000
      : activityLevel === 'active'
      ? 10500
      : activityLevel === 'moderate'
      ? 8000
      : activityLevel === 'light'
      ? 6000
      : 4000;

  // 1. Documented base: exact 35 ml/kg × current body weight
  const baseWaterMlExact = safeWeightKg * 35;

  // 2. Exercise sweat-loss adjustment (daily average based on sessions/wk, duration, intensity, sweat rate, climate)
  const baseHourlySweatMl =
    workoutIntensity === 'vigorous' ? 850 : workoutIntensity === 'moderate' ? 600 : 400;
  const sweatMultiplier =
    sweatRateLevel === 'high' ? 1.3 : sweatRateLevel === 'low' ? 0.75 : 1.0;
  const climateMultiplier = climateLevel === 'warm_humid' ? 1.25 : 1.0;

  const perSessionFluidMl =
    (avgWorkoutDurationMin / 60) * baseHourlySweatMl * sweatMultiplier * climateMultiplier;
  const exerciseAddMlExact = Math.min(1800, (clampedWorkouts / 7) * perSessionFluidMl);

  // 3. Daily walking / NEAT movement fluid allowance above 6,000 steps/day
  const extraSteps = Math.max(0, dailyAverageSteps - 6000);
  const stepsAddMlExact = Math.min(350, (extraSteps / 1000) * 15 * climateMultiplier);

  const activityAddMlExact = exerciseAddMlExact + stepsAddMlExact;
  const totalWaterMlExact = Math.min(6000, Math.max(1400, baseWaterMlExact + activityAddMlExact));

  const baseWaterMl = Math.round(baseWaterMlExact);
  const totalWaterMl = Math.round(totalWaterMlExact);
  const activityAddMl = Math.max(0, totalWaterMl - baseWaterMl);

  return {
    weightUsedKg: safeWeightKg,
    baseWaterMlExact,
    baseWaterMl,
    exerciseAddMlExact,
    stepsAddMlExact,
    activityAddMlExact,
    activityAddMl,
    totalWaterMlExact,
    totalWaterMl,
    factorsUsed: {
      avgWorkoutDurationMin,
      workoutFrequencyPerWeek: clampedWorkouts,
      workoutIntensity,
      sweatRateLevel,
      climateLevel,
      dailyAverageSteps,
    },
    disclaimer: HYDRATION_DISCLAIMER,
  };
}

export function estimateHydrationMl(
  weightKg: number,
  activityLevel: ActivityLevel,
  workoutFrequencyPerWeek: number
): number {
  return calculateHydrationEstimate(weightKg, activityLevel, workoutFrequencyPerWeek).totalWaterMl;
}

export function calculateSmartFitnessTargets(
  input: FitnessCalculatorInput
): FitnessCalculationResult {
  const safeWeight = Math.max(30, Math.min(300, input.currentWeightKg || 65));
  const safeHeight = Math.max(120, Math.min(240, input.heightCm || 170));
  const safeAge = Math.min(100, Math.max(14, input.age || 25));
  const goalSpeed: GoalSpeed = input.goalSpeed || 'moderate';
  const speedCfg = GOAL_SPEED_CONFIG[goalSpeed];
  const normalizedGoal = normalizeFitnessGoal(input.fitnessGoal);
  const macroFocus = normalizeMacroFocus(input.macroFocus);
  const workoutIntensity: WorkoutIntensity = input.workoutIntensity || 'moderate';
  const dailySteps = input.dailyAverageSteps ?? 7500;
  const workoutsPerWeek = Math.max(0, Math.min(14, Math.round(input.workoutFrequencyPerWeek ?? 0)));
  const avgWorkoutDurationMin =
    input.avgWorkoutDurationMin !== undefined
      ? Math.max(0, Math.min(240, input.avgWorkoutDurationMin))
      : workoutsPerWeek > 0
      ? 45
      : 0;
  const sweatRateLevel: SweatRateLevel = input.sweatRateLevel || 'moderate';
  const climateLevel: ClimateLevel = input.climateLevel || 'temperate';
  const doesResistanceTraining =
    typeof input.doesResistanceTraining === 'boolean'
      ? input.doesResistanceTraining
      : workoutsPerWeek >= 2;

  const bmiInfo = calculateBmi(safeWeight, safeHeight, safeAge, input.biologicalSex);
  const { bmi, bmiExact, bmiBasis, bmiPercentile, bmiCategory, bodyStatusLabel, bmiDisclaimer } =
    bmiInfo;

  // 1. Pathway & safety routing (checked BEFORE any equation or surplus/deficit)
  const isMinor = safeAge < 18;
  const isPregnantOrNursing = Boolean(input.isPregnantOrBreastfeeding);
  let pathway: CalculationPathway = 'adult';
  if (isMinor) {
    pathway = 'adolescent';
  } else if (isPregnantOrNursing) {
    pathway = 'pregnancy_or_breastfeeding';
  }

  // 2. BMR Calculation (full precision internally; rounded only at display/output)
  // - Ages 14–17: Schofield adolescent equation (never adult Mifflin-St Jeor or Katch-McArdle)
  // - Adults 18+: Mifflin-St Jeor default, or Katch-McArdle when valid body-fat % supplied
  const hasValidBodyFat =
    input.bodyFatPct !== undefined &&
    input.bodyFatPct !== null &&
    Number.isFinite(input.bodyFatPct) &&
    input.bodyFatPct >= 4 &&
    input.bodyFatPct <= 60;

  let bmrEquation: BmrEquationType = 'mifflin_st_jeor';
  let bmrExact: number;

  if (isMinor) {
    bmrEquation = 'schofield_adolescent';
    bmrExact = calculateSchofieldAdolescentBmrExact(safeWeight, safeHeight, input.biologicalSex);
  } else if (hasValidBodyFat) {
    bmrEquation = 'katch_mcardle';
    bmrExact = calculateKatchMcArdleBmrExact(safeWeight, input.bodyFatPct as number);
  } else {
    bmrEquation = 'mifflin_st_jeor';
    bmrExact = calculateMifflinStJeorBmrExact(safeWeight, safeHeight, safeAge, input.biologicalSex);
  }

  const bmr = Math.round(bmrExact);

  // 3. Single non-overlapping custom calibrated PAL estimate (unrounded internally)
  const suggestedActivityLevel = suggestActivityLevel(
    dailySteps,
    workoutsPerWeek,
    workoutIntensity
  );
  const activityBreakdown = calculateActivityBreakdown(
    input.activityLevel,
    dailySteps,
    workoutsPerWeek,
    workoutIntensity
  );
  const activityMultiplierExact = activityBreakdown.appliedMultiplierExact;
  const activityMultiplier = activityBreakdown.appliedMultiplier;

  // Compute TDEE using full-precision unrounded bmrExact * appliedMultiplierExact; round only for display
  const estimatedTdeeExact = bmrExact * activityMultiplierExact;
  const estimatedTdee = Math.round(estimatedTdeeExact);

  const adaptiveTdeeKcal =
    input.adaptiveTdeeKcal && input.adaptiveTdeeKcal >= 1000 && input.adaptiveTdeeKcal <= 7500
      ? Math.round(input.adaptiveTdeeKcal)
      : null;

  const activeMaintenanceExact =
    input.useAdaptiveTdee && adaptiveTdeeKcal ? adaptiveTdeeKcal : estimatedTdeeExact;
  const activeMaintenanceKcal = Math.round(activeMaintenanceExact);

  // 4. Calorie Target Strategy (one consistent method, safety-gated FIRST)
  let rawStrategyDeltaExact = 0;
  let targetStrategyPctConfigured = 0;
  const safetyNotes: string[] = [];
  let deficitBlocked = false;
  let adultPrescriptionBlocked = false;
  let capNote = '';

  if (isMinor) {
    // Under-18 safety exclusion: NEVER apply ordinary adult calorie prescriptions (deficits OR bulking surpluses)
    adultPrescriptionBlocked = true;
    deficitBlocked = normalizedGoal === 'lose_weight' || normalizedGoal === 'recomposition';
    rawStrategyDeltaExact = 0;
    targetStrategyPctConfigured = 0;
    safetyNotes.push(
      'Adolescent Safety Pathway (ages 14–17): Ordinary adult calorie deficits and bulking surpluses are disabled to protect healthy growth and development. Estimates use the adolescent Schofield equation and age/sex BMI percentiles anchored at estimated maintenance—please consult a pediatrician or registered dietitian for individualized nutrition guidance.'
    );
    if (isPregnantOrNursing) {
      safetyNotes.push(
        'Pregnancy / Breastfeeding Clinical Exclusion: Adolescent pregnancy or lactation requires direct medical and registered dietitian supervision; automated calorie prescriptions are disabled.'
      );
    }
  } else if (isPregnantOrNursing) {
    // Pregnancy / breastfeeding exclusion: disable automated weight-loss deficits and standard adult cutting/bulking targets
    adultPrescriptionBlocked = true;
    deficitBlocked = normalizedGoal === 'lose_weight' || normalizedGoal === 'recomposition';
    rawStrategyDeltaExact = 0;
    targetStrategyPctConfigured = 0;
    safetyNotes.push(
      'Pregnancy / Breastfeeding Exclusion: Automated calorie deficits and standard adult weight-manipulation prescriptions are excluded. Energy, protein, and micronutrient requirements vary significantly by trimester and lactation stage—please work with your OB-GYN or registered dietitian.'
    );
  } else {
    // Adult strategy routing (single consistent percentage-of-maintenance model)
    if (normalizedGoal === 'lose_weight') {
      const deficitPct = Math.min(20, Math.max(10, input.goalAdjustmentPct ?? speedCfg.fatLossPct));
      targetStrategyPctConfigured = -deficitPct;
      const rawDeficitExact = activeMaintenanceExact * (deficitPct / 100);
      const maxRateDeficit = (safeWeight * 0.01 * 7700) / 7;
      const maxPctDeficit = activeMaintenanceExact * 0.25;
      const safeCapDeficit = Math.max(250, Math.min(maxRateDeficit, maxPctDeficit, 850));
      const appliedDeficitExact = Math.min(rawDeficitExact, safeCapDeficit);
      if (rawDeficitExact > safeCapDeficit + 1) {
        capNote = ` (configured -${deficitPct}%, safely capped at -${Math.round(
          safeCapDeficit
        )} kcal/day to stay ≤1.0% body weight/wk)`;
        safetyNotes.push(
          `Daily deficit was safely capped at ${Math.round(
            safeCapDeficit
          ).toLocaleString()} kcal/day (≤1.0% body weight/week) to support lean mass retention.`
        );
      }
      rawStrategyDeltaExact = -appliedDeficitExact;
    } else if (normalizedGoal === 'build_muscle') {
      const surplusPct = Math.min(
        10,
        Math.max(5, input.goalAdjustmentPct ?? speedCfg.muscleGainPct)
      );
      targetStrategyPctConfigured = surplusPct;
      const rawSurplusExact = activeMaintenanceExact * (surplusPct / 100);
      const boundedSurplusExact = Math.min(400, Math.max(100, rawSurplusExact));
      if (rawSurplusExact > 400 + 0.5) {
        capNote = ` (configured +${surplusPct}%, capped at +400 kcal/day for lean gain)`;
        safetyNotes.push(
          'Lean muscle surplus was capped at +400 kcal/day to prioritize muscle accrual while limiting excess fat gain.'
        );
      }
      rawStrategyDeltaExact = boundedSurplusExact;
    } else if (normalizedGoal === 'fat_gain') {
      const surplusPct = Math.min(15, Math.max(8, input.goalAdjustmentPct ?? speedCfg.fatGainPct));
      targetStrategyPctConfigured = surplusPct;
      const rawSurplusExact = activeMaintenanceExact * (surplusPct / 100);
      const boundedSurplusExact = Math.min(500, Math.max(180, rawSurplusExact));
      if (rawSurplusExact > 500 + 0.5) {
        capNote = ` (configured +${surplusPct}%, moderated to +500 kcal/day)`;
        safetyNotes.push(
          'Healthy weight-gain surplus was moderated to +500 kcal/day for steady, sustainable mass gain.'
        );
      }
      rawStrategyDeltaExact = boundedSurplusExact;
    } else if (normalizedGoal === 'recomposition') {
      const recompOffsetPct = speedCfg.recompPct;
      targetStrategyPctConfigured = recompOffsetPct;
      rawStrategyDeltaExact = activeMaintenanceExact * (recompOffsetPct / 100);
    } else {
      targetStrategyPctConfigured = 0;
      rawStrategyDeltaExact = 0;
    }

    let candidateTargetExact = activeMaintenanceExact + rawStrategyDeltaExact;

    // Individualized nutritional sufficiency guard (no universal BMR/fixed floor)
    const { referenceWeightKg } = computeProteinReferenceWeight(
      safeWeight,
      safeHeight,
      bmi,
      input.bodyFatPct
    );
    const minEssentialProteinKcal = Math.round(referenceWeightKg * 1.4) * 4;
    const minEssentialFatKcal = Math.round(referenceWeightKg * 0.55) * 9;
    const minEssentialCarbKcal = 100 * 4;
    const individualizedMinFloor = Math.max(
      1050,
      Math.min(
        Math.round(activeMaintenanceExact * 0.75),
        minEssentialProteinKcal + minEssentialFatKcal + minEssentialCarbKcal
      )
    );

    if (candidateTargetExact < individualizedMinFloor) {
      candidateTargetExact = individualizedMinFloor;
      rawStrategyDeltaExact = candidateTargetExact - activeMaintenanceExact;
      capNote = ` (raised to individualized sufficiency floor of ${individualizedMinFloor.toLocaleString()} kcal/day)`;
      safetyNotes.push(
        `Target raised to an individualized nutritional sufficiency floor (${individualizedMinFloor.toLocaleString()} kcal/day) to protect protein, essential fat, and daily recovery needs.`
      );
    }
  }

  const rawTargetCaloriesExact = activeMaintenanceExact + rawStrategyDeltaExact;

  // Resistance training check for Build Muscle
  let resistanceTrainingNote: string | undefined;
  if (normalizedGoal === 'build_muscle' && (!doesResistanceTraining || workoutsPerWeek < 2)) {
    resistanceTrainingNote =
      'Resistance training recommended: A calorie surplus alone does not build muscle and is mostly stored as body fat. Pair this surplus with at least 2–4 progressive resistance training sessions per week.';
  }

  // 5. Macro Allocation (exact kcal consistency: P*4 + C*4 + F*9 = recommendedCalories)
  const macros = allocateMacrosForCalories({
    targetCalories: Math.round(rawTargetCaloriesExact),
    weightKg: safeWeight,
    heightCm: safeHeight,
    bmi,
    normalizedGoal,
    goalSpeed,
    macroFocus,
    bodyFatPct: input.bodyFatPct,
    proteinPerKgOverride: input.proteinPerKg,
    fatCaloriesPctOverride: input.fatCaloriesPct,
  });

  // Exact reconciled calorie delta & matching percentage
  const calorieDelta = macros.recommendedCalories - activeMaintenanceKcal;
  const actualCalorieDeltaPct =
    Math.round(((calorieDelta / Math.max(1, activeMaintenanceKcal)) * 100) * 100) / 100;

  // 6. Factor-Dependent Hydration Estimate
  const hydration = calculateHydrationEstimate(safeWeight, input.activityLevel, workoutsPerWeek, {
    workoutIntensity,
    avgWorkoutDurationMin,
    sweatRateLevel,
    climateLevel,
    dailyAverageSteps: dailySteps,
  });

  // 7. Estimated Timeline (simplified 7,700 kcal/kg theoretical initial rate vs adaptive uncertain range)
  const recommendedTargetWeightKg =
    input.targetWeightKg > 0 ? input.targetWeightKg : safeWeight;
  const remainingWeightDiffKg = Math.round((recommendedTargetWeightKg - safeWeight) * 100) / 100;
  const exactTheoreticalWeeklyRateKg = (calorieDelta * 7) / 7700;
  const theoreticalWeeklyRateKg = Math.round(exactTheoreticalWeeklyRateKg * 100) / 100;
  const weeklyRateKg = theoreticalWeeklyRateKg;

  let theoreticalWeeksExact: number | null = null;
  let estimatedWeeks: number | null = null;
  let estimatedWeeksRange: { min: number; max: number } | null = null;
  let projectedTargetDate: string | null = null;
  let timelineDetailText = 'Holding near current weight — no weight-change countdown applies.';

  if (adultPrescriptionBlocked) {
    timelineDetailText =
      'Automated weight-change timelines are disabled under safety exclusions (under-18 growth stage or pregnancy/breastfeeding). Discuss individualized goals with a qualified healthcare professional.';
  } else if (Math.abs(remainingWeightDiffKg) < 0.3) {
    timelineDetailText =
      'Current weight is already within 0.3 kg of your target weight; focus on maintenance and performance consistency.';
  } else if (
    (remainingWeightDiffKg < 0 && exactTheoreticalWeeklyRateKg < -0.05) ||
    (remainingWeightDiffKg > 0 && exactTheoreticalWeeklyRateKg > 0.05)
  ) {
    theoreticalWeeksExact = Math.abs(remainingWeightDiffKg / exactTheoreticalWeeklyRateKg);
    // Asymmetric uncertainty window (0.90x to 1.35x theoretical linear time) accounting for metabolic
    // adaptation, changing body mass / TDEE, tissue composition differences, and adherence drift.
    const minWks = Math.max(1, Math.floor(theoreticalWeeksExact * 0.9));
    const maxWks = Math.max(minWks + 2, Math.ceil(theoreticalWeeksExact * 1.35));
    estimatedWeeksRange = { min: minWks, max: maxWks };
    estimatedWeeks = Math.round((minWks + maxWks) / 2);

    const targetDt = new Date();
    targetDt.setDate(targetDt.getDate() + estimatedWeeks * 7);
    projectedTargetDate = targetDt.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    timelineDetailText = `Theoretical initial energy-balance reference (~7,700 kcal/kg): ${Math.abs(
      remainingWeightDiffKg
    ).toFixed(1)} kg ${remainingWeightDiffKg < 0 ? 'loss' : 'gain'} at ${
      theoreticalWeeklyRateKg > 0 ? '+' : ''
    }${theoreticalWeeklyRateKg.toFixed(2)} kg/wk (${
      calorieDelta > 0 ? '+' : ''
    }${calorieDelta} kcal/day) = ${theoreticalWeeksExact.toFixed(
      1
    )} linear weeks. Actual estimated timeline range: ~${minWks}–${maxWks} weeks (wider upper bound accounts for metabolic adaptation, shifting TDEE as weight changes, lean/fat tissue composition, and real-world weight trends).`;
  } else if (normalizedGoal === 'recomposition') {
    timelineDetailText =
      'Body recomposition targets near-maintenance calories, so scale weight shifts slowly or stays steady while body composition improves gradually over months.';
  } else if (normalizedGoal === 'maintain_weight') {
    timelineDetailText =
      'Maintain Weight sets calories near estimated maintenance, so weight is expected to remain stable around your current weight.';
  } else if (normalizedGoal === 'lose_weight' && remainingWeightDiffKg > 0) {
    safetyNotes.push(
      `Your target weight (${recommendedTargetWeightKg} kg) is above your current weight (${safeWeight} kg) while "Lose Fat / Lose Weight" is selected.`
    );
    timelineDetailText =
      'Target weight is above current weight while a weight-loss goal is selected — update either your target weight or fitness goal to estimate a timeline.';
  } else if (
    (normalizedGoal === 'build_muscle' || normalizedGoal === 'fat_gain') &&
    remainingWeightDiffKg < 0
  ) {
    safetyNotes.push(
      `Your target weight (${recommendedTargetWeightKg} kg) is below your current weight (${safeWeight} kg) while "${SMART_FITNESS_GOAL_META[normalizedGoal].label}" is selected.`
    );
    timelineDetailText =
      'Target weight is below current weight while a weight-gain goal is selected — update either your target weight or fitness goal to estimate a timeline.';
  }

  const timelineDisclaimer =
    'Simplified initial energy-balance estimate only (7,700 kcal/kg is NOT an exact prediction). Actual progress shifts with metabolic adaptation, changing body weight, training, water balance, and 7-day trend updates.';

  // 8. Structured Calculation Transparency Breakdown (exact unrounded internal values + reconciled display values)
  const bmrFormulaText =
    bmrEquation === 'schofield_adolescent'
      ? `Schofield adolescent equation (ages 10–18, ${input.biologicalSex}): ${
          input.biologicalSex === 'male'
            ? `16.25×${safeWeight} + 1.372×${safeHeight} + 515.5`
            : `8.365×${safeWeight} + 4.65×${safeHeight} + 200`
        } = ${bmrExact.toFixed(2)} kcal/day (internal unrounded) → displayed ${bmr.toLocaleString()} kcal/day.`
      : bmrEquation === 'katch_mcardle'
      ? `Katch-McArdle (body fat ${input.bodyFatPct}%): LBM ${(
          safeWeight *
          (1 - (input.bodyFatPct as number) / 100)
        ).toFixed(2)} kg → 370 + 21.6×LBM = ${bmrExact.toFixed(
          2
        )} kcal/day (internal unrounded) → displayed ${bmr.toLocaleString()} kcal/day.`
      : `Mifflin-St Jeor (adult ${input.biologicalSex}): 10×${safeWeight} + 6.25×${safeHeight} − 5×${safeAge} ${
          input.biologicalSex === 'male' ? '+ 5' : '− 161'
        } = ${bmrExact.toFixed(2)} kcal/day (internal unrounded) → displayed ${bmr.toLocaleString()} kcal/day.`;

  const tdeeFormulaText =
    adaptiveTdeeKcal && input.useAdaptiveTdee
      ? `Formula TDEE estimate = ${bmrExact.toFixed(2)} (unrounded BMR) × ${activityMultiplierExact.toFixed(
          4
        )} (unrounded PAL) = ${estimatedTdeeExact.toFixed(2)} → ${estimatedTdee.toLocaleString()} kcal/day. Active target uses your 7-day calibrated Adaptive TDEE of ${adaptiveTdeeKcal.toLocaleString()} kcal/day.`
      : `Estimated Maintenance (TDEE) = ${bmrExact.toFixed(
          2
        )} (unrounded BMR) × ${activityMultiplierExact.toFixed(
          4
        )} (unrounded custom PAL) = ${estimatedTdeeExact.toFixed(
          2
        )} kcal/day → displayed ${estimatedTdee.toLocaleString()} kcal/day (conventional "${
          ACTIVITY_MULTIPLIERS[input.activityLevel].shortLabel
        }" tier alone would be ${Math.round(
          bmrExact * activityBreakdown.conventionalTierMultiplier
        ).toLocaleString()} kcal/day).`;

  const signStr = calorieDelta > 0 ? '+' : '';
  const pctSignStr = actualCalorieDeltaPct > 0 ? '+' : '';
  const rawDeltaSign = rawStrategyDeltaExact > 0 ? '+' : '';
  const calorieStrategyText = `Maintenance ${activeMaintenanceKcal.toLocaleString()} kcal (internal ${activeMaintenanceExact.toFixed(
    2
  )}) ${rawDeltaSign}${rawStrategyDeltaExact.toFixed(2)} kcal${capNote} = ${rawTargetCaloriesExact.toFixed(
    2
  )} kcal raw → reconciled whole-gram target ${macros.recommendedCalories.toLocaleString()} kcal/day. Actual adjustment: ${signStr}${calorieDelta} kcal (${pctSignStr}${actualCalorieDeltaPct.toFixed(
    2
  )}% of ${activeMaintenanceKcal.toLocaleString()} kcal maintenance).`;

  const macrosFormulaText = `Protein: ${macros.proteinPerKgUsed} g/kg × ${
    macros.proteinReferenceWeightKg
  } kg ${
    macros.usedAdjustedProteinWeight ? '(adjusted reference weight for BMI ≥ 30)' : '(current weight)'
  } = ${macros.proteinGrams}g (${macros.proteinCalories} kcal, ${macros.proteinPct}%). Fat (${
    MACRO_FOCUS_META[macroFocus].label
  }): ${macros.fatGrams}g (${macros.fatCalories} kcal, ${
    macros.fatPct
  }%). Carbs: remaining calories ÷ 4 = ${macros.carbsGrams}g (${macros.carbsCalories} kcal, ${
    macros.carbsPct
  }%). Exact sum: ${macros.proteinGrams}×4 + ${macros.carbsGrams}×4 + ${
    macros.fatGrams
  }×9 = ${macros.recommendedCalories.toLocaleString()} kcal.`;

  const fibreAndHydrationText = `Estimated Fibre: ~14 g per 1,000 kcal → ~${macros.fibreGrams} g/day (starting estimate, excluded from calorie sum). Estimated Hydration: Base 35 ml/kg × ${
    hydration.weightUsedKg
  } kg = ${hydration.baseWaterMlExact.toFixed(
    1
  )} ml (${hydration.baseWaterMl.toLocaleString()} ml) + factor-dependent activity allowance ${hydration.activityAddMlExact.toFixed(
    1
  )} ml (${hydration.exerciseAddMlExact.toFixed(1)} ml daily avg from ${
    hydration.factorsUsed.workoutFrequencyPerWeek
  }×${hydration.factorsUsed.avgWorkoutDurationMin}m ${
    hydration.factorsUsed.workoutIntensity
  } sessions, ${hydration.factorsUsed.sweatRateLevel} sweat, ${
    hydration.factorsUsed.climateLevel === 'warm_humid' ? 'warm/humid' : 'temperate'
  } climate + ${hydration.stepsAddMlExact.toFixed(
    1
  )} ml from ${hydration.factorsUsed.dailyAverageSteps.toLocaleString()} steps/day) = ${hydration.totalWaterMlExact.toFixed(
    1
  )} ml → displayed ${hydration.totalWaterMl.toLocaleString()} ml/day (${hydration.baseWaterMl.toLocaleString()} + ${hydration.activityAddMl.toLocaleString()} ml). ${HYDRATION_DISCLAIMER}`;

  const calculationBreakdown: CalculationTransparencyBreakdown = {
    bmr: bmrFormulaText,
    activity: activityBreakdown.modelExplanation,
    tdee: tdeeFormulaText,
    calorieStrategy: calorieStrategyText,
    macros: macrosFormulaText,
    fibreAndHydration: fibreAndHydrationText,
    timeline: `${timelineDetailText} ${timelineDisclaimer}`,
  };

  const explanation: string[] = [
    bmrFormulaText,
    activityBreakdown.modelExplanation,
    tdeeFormulaText,
    calorieStrategyText,
    macrosFormulaText,
    fibreAndHydrationText,
    timelineDetailText,
  ];

  return {
    calculationVersion: CALCULATION_VERSION,
    pathway,
    bmrEquation,
    normalizedGoal,
    macroFocus,
    isEstimate: true,
    deficitBlocked,
    adultPrescriptionBlocked,
    bmi,
    bmiExact: Math.round(bmiExact * 10000) / 10000,
    bmiBasis,
    bmiPercentile,
    bmiCategory,
    bodyStatusLabel,
    bmiDisclaimer,
    bmr,
    bmrExact: Math.round(bmrExact * 10000) / 10000,
    activityMultiplier,
    activityMultiplierExact: Math.round(activityMultiplierExact * 10000) / 10000,
    activityBreakdown,
    suggestedActivityLevel,
    estimatedTdee,
    estimatedTdeeExact: Math.round(estimatedTdeeExact * 100) / 100,
    estimatedTdeeKcal: estimatedTdee,
    adaptiveTdeeKcal,
    activeMaintenanceExact: Math.round(activeMaintenanceExact * 100) / 100,
    activeMaintenanceKcal,
    rawStrategyDeltaExact: Math.round(rawStrategyDeltaExact * 100) / 100,
    rawTargetCaloriesExact: Math.round(rawTargetCaloriesExact * 100) / 100,
    targetStrategyPctConfigured,
    recommendedCalories: macros.recommendedCalories,
    calorieDelta,
    actualCalorieDeltaPct,
    proteinReferenceWeightKg: macros.proteinReferenceWeightKg,
    usedAdjustedProteinWeight: macros.usedAdjustedProteinWeight,
    proteinPerKgUsed: macros.proteinPerKgUsed,
    proteinGrams: macros.proteinGrams,
    carbsGrams: macros.carbsGrams,
    fatGrams: macros.fatGrams,
    fibreGrams: macros.fibreGrams,
    fibreIsEstimate: true,
    hydrationBaseMlExact: Math.round(hydration.baseWaterMlExact * 10) / 10,
    hydrationBaseMl: hydration.baseWaterMl,
    hydrationExerciseAddMlExact: Math.round(hydration.exerciseAddMlExact * 10) / 10,
    hydrationStepsAddMlExact: Math.round(hydration.stepsAddMlExact * 10) / 10,
    hydrationActivityAddMl: hydration.activityAddMl,
    hydrationWeightUsedKg: hydration.weightUsedKg,
    hydrationFactorsUsed: hydration.factorsUsed,
    recommendedWaterMlExact: Math.round(hydration.totalWaterMlExact * 10) / 10,
    recommendedWaterMl: hydration.totalWaterMl,
    hydrationIsEstimate: true,
    hydrationDisclaimer: hydration.disclaimer,
    proteinCalories: macros.proteinCalories,
    carbsCalories: macros.carbsCalories,
    fatCalories: macros.fatCalories,
    proteinPct: macros.proteinPct,
    carbsPct: macros.carbsPct,
    fatPct: macros.fatPct,
    recommendedTargetWeightKg,
    remainingWeightDiffKg,
    goalSpeed,
    theoreticalWeeklyRateKg,
    theoreticalWeeksExact:
      theoreticalWeeksExact !== null ? Math.round(theoreticalWeeksExact * 100) / 100 : null,
    estimatedWeeks,
    estimatedWeeksRange,
    projectedTargetDate,
    weeklyRateKg,
    timelineDisclaimer,
    resistanceTrainingNote,
    safetyNote: safetyNotes.length > 0 ? safetyNotes.join(' ') : undefined,
    calculationBreakdown,
    explanation,
  };
}

/**
 * Generates side-by-side What-If comparisons across all 5 canonical fitness goals
 * using the exact same deterministic calculator engine.
 */
export function buildWhatIfGoalComparisons(
  input: FitnessCalculatorInput
): WhatIfGoalComparison[] {
  const orderedGoals: SmartFitnessGoalType[] = [
    'build_muscle',
    'fat_gain',
    'lose_weight',
    'recomposition',
    'maintain_weight',
  ];

  return orderedGoals.map((goal) => {
    const res = calculateSmartFitnessTargets({
      ...input,
      fitnessGoal: goal,
    });
    return {
      goal,
      label: SMART_FITNESS_GOAL_META[goal].label,
      shortLabel: SMART_FITNESS_GOAL_META[goal].shortLabel,
      recommendedCalories: res.recommendedCalories,
      calorieDelta: res.calorieDelta,
      proteinGrams: res.proteinGrams,
      carbsGrams: res.carbsGrams,
      fatGrams: res.fatGrams,
      fibreGrams: res.fibreGrams,
      weeklyRateKg: res.weeklyRateKg,
      estimatedWeeks: res.estimatedWeeks,
      deficitBlocked: res.deficitBlocked,
    };
  });
}
