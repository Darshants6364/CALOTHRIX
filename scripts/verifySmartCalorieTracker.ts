/**
 * Comprehensive Verification Suite for CALOTHRIX Smart Calorie Tracker,
 * Scientific Nutrition Engine, and 7-Day AI Adaptive Assessment (Scenarios A–J).
 *
 * Run with: npx tsx scripts/verifySmartCalorieTracker.ts
 */

import assert from 'node:assert/strict';
import {
  buildWhatIfGoalComparisons,
  calculateActivityBreakdown,
  calculateBmi,
  calculateCalibratedActivityFactor,
  calculateHydrationEstimate,
  calculateKatchMcArdleBmr,
  calculateMifflinStJeorBmr,
  calculateMifflinStJeorBmrExact,
  calculateSchofieldAdolescentBmrExact,
  calculateSmartFitnessTargets,
  CALCULATION_VERSION,
  validateCalculatorInput,
} from '../src/utils/fitnessCalculator';
import {
  analyzeWeightTrend,
  buildDailyNutritionSummaries,
  evaluateWeeklyAssessmentDueStatus,
  MAX_WEEKLY_TDEE_SHIFT_KCAL,
  runDeterministicWeeklyAssessment,
} from '../src/utils/weeklyAssessmentEngine';
import { validateWeeklyAssessmentAiExplanation } from '../server/mealAiService';
import { addDaysToDateKey } from '../src/utils/dateUtils';
import type {
  DailyNutritionSummary,
  GoalSpeed,
  MacroFocusType,
  NutritionGoals,
  SmartFitnessGoalType,
  UserProfile,
  WeeklyAssessmentAiExplanation,
  WeeklyAssessmentRecord,
  WeightEntry,
} from '../src/types';

let passed = 0;
let failed = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL  ${name}`);
    console.error('       ', err instanceof Error ? err.message : err);
  }
}

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'test-user-1',
    name: 'Test Athlete',
    age: 25,
    biologicalSex: 'male',
    heightCm: 175,
    currentWeightKg: 70,
    targetWeightKg: 70,
    activityLevel: 'moderate',
    dailyAverageSteps: 8000,
    workoutFrequencyPerWeek: 4,
    workoutIntensity: 'moderate',
    fitnessGoal: 'maintain_weight',
    goalSpeed: 'moderate',
    macroFocus: 'high_protein',
    dietaryPreference: 'omnivore',
    foodRestrictions: [],
    accountRole: 'individual',
    roleSelected: true,
    isDemoProfile: false,
    ...overrides,
  };
}

function makeGoalsFromCalc(
  calc: ReturnType<typeof calculateSmartFitnessTargets>,
  extra: Partial<NutritionGoals> = {}
): NutritionGoals {
  return {
    userId: 'test-user-1',
    preset: calc.normalizedGoal,
    calories: calc.recommendedCalories,
    protein: calc.proteinGrams,
    carbs: calc.carbsGrams,
    fat: calc.fatGrams,
    fibre: calc.fibreGrams,
    targetWeightKg: calc.recommendedTargetWeightKg,
    estimatedBmr: calc.bmr,
    estimatedTdee: calc.estimatedTdeeKcal,
    adaptiveTdeeKcal: calc.adaptiveTdeeKcal ?? undefined,
    bmi: calc.bmi,
    goalSpeed: calc.goalSpeed,
    estimatedWeeks: calc.estimatedWeeks ?? undefined,
    macroFocus: calc.macroFocus,
    assessmentWeekNumber: 0,
    initialCalculatedAt: '2026-10-01T08:00:00.000Z',
    calculationVersion: CALCULATION_VERSION,
    updatedAt: '2026-10-01T08:00:00.000Z',
    ...extra,
  };
}

function makeWeightSeries(
  startDate: string,
  weights: Array<{ dayOffset: number; weightKg: number }>
): WeightEntry[] {
  return weights.map((w, idx) => {
    const date = addDaysToDateKey(startDate, w.dayOffset);
    return {
      id: `w-${idx}-${w.dayOffset}`,
      userId: 'test-user-1',
      date,
      weightKg: w.weightKg,
      createdAt: `${date}T07:00:00.000Z`,
      updatedAt: `${date}T07:00:00.000Z`,
    };
  });
}

function makeDailyNutrition(
  startDate: string,
  days: Array<{
    dayOffset: number;
    calories: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    fibre?: number;
    entryCount?: number;
  }>
): DailyNutritionSummary[] {
  return days.map((d) => ({
    date: addDaysToDateKey(startDate, d.dayOffset),
    calories: d.calories,
    protein: d.protein ?? Math.round((d.calories * 0.25) / 4),
    carbs: d.carbs ?? Math.round((d.calories * 0.5) / 4),
    fat: d.fat ?? Math.round((d.calories * 0.25) / 9),
    fibre: d.fibre ?? 30,
    entryCount: d.entryCount ?? (d.calories > 0 ? 3 : 0),
  }));
}

console.log('\n=== CALOTHRIX Smart Calorie Tracker & 7-Day Adaptive Engine Verification ===\n');

// ---------------------------------------------------------------------------
// SCENARIO A: Healthy Weight Gain (50 kg -> 70 kg)
// ---------------------------------------------------------------------------
console.log('Scenario A: Healthy Weight Gain (50 kg -> 70 kg)');
runTest('A1: Initial calculation for 50kg -> 70kg fat_gain is scientifically sound & macro-consistent', () => {
  const calc = calculateSmartFitnessTargets({
    age: 24,
    biologicalSex: 'male',
    heightCm: 175,
    currentWeightKg: 50,
    targetWeightKg: 70,
    activityLevel: 'moderate',
    dailyAverageSteps: 7500,
    workoutFrequencyPerWeek: 3,
    fitnessGoal: 'fat_gain',
    goalSpeed: 'moderate',
    macroFocus: 'balanced',
  });

  // Mifflin-St Jeor for 50kg, 175cm, 24yo male: 10*50 + 6.25*175 - 5*24 + 5 = 1478.75 -> 1479
  assert.equal(calc.bmr, 1479, `Expected BMR 1479, got ${calc.bmr}`);
  assert.equal(calc.bmrEquation, 'mifflin_st_jeor');
  assert.ok(calc.estimatedTdeeKcal > calc.bmr * 1.3 && calc.estimatedTdeeKcal < calc.bmr * 1.75);
  assert.ok(calc.calorieDelta > 200 && calc.calorieDelta <= 550, `Expected healthy surplus, got ${calc.calorieDelta}`);
  assert.equal(calc.recommendedCalories, calc.proteinGrams * 4 + calc.carbsGrams * 4 + calc.fatGrams * 9);
  assert.ok(calc.proteinGrams >= 70 && calc.proteinGrams <= 115, `Expected reasonable protein for 50kg, got ${calc.proteinGrams}`);
  assert.equal(calc.bmiCategory, 'Underweight');
  assert.ok(calc.estimatedWeeks !== null && calc.estimatedWeeks > 20);
});

runTest('A2: 7-day progression 50kg -> 51kg updates weight-dependent targets without treating +1kg as pure tissue gain', () => {
  const start = '2026-10-01';
  const initialCalc = calculateSmartFitnessTargets({
    age: 24,
    biologicalSex: 'male',
    heightCm: 175,
    currentWeightKg: 50,
    targetWeightKg: 70,
    activityLevel: 'moderate',
    dailyAverageSteps: 7500,
    workoutFrequencyPerWeek: 3,
    fitnessGoal: 'fat_gain',
    goalSpeed: 'moderate',
    macroFocus: 'balanced',
  });

  const profile = makeProfile({
    age: 24,
    biologicalSex: 'male',
    heightCm: 175,
    currentWeightKg: 51,
    targetWeightKg: 70,
    activityLevel: 'moderate',
    dailyAverageSteps: 7500,
    workoutFrequencyPerWeek: 3,
    fitnessGoal: 'fat_gain',
    goalSpeed: 'moderate',
    macroFocus: 'balanced',
  });

  const goals = makeGoalsFromCalc(initialCalc);
  // Week 1 weigh-ins rising smoothly from 50.0 -> 51.0 (part water/glycogen)
  const weights = makeWeightSeries(start, [
    { dayOffset: 0, weightKg: 50.0 },
    { dayOffset: 1, weightKg: 50.2 },
    { dayOffset: 2, weightKg: 50.3 },
    { dayOffset: 3, weightKg: 50.5 },
    { dayOffset: 4, weightKg: 50.7 },
    { dayOffset: 5, weightKg: 50.8 },
    { dayOffset: 6, weightKg: 51.0 },
  ]);
  const nutrition = makeDailyNutrition(
    start,
    Array.from({ length: 7 }, (_, i) => ({ dayOffset: i, calories: initialCalc.recommendedCalories }))
  );

  const assessment = runDeterministicWeeklyAssessment({
    userId: 'u-gain',
    profile,
    goals,
    weightEntries: weights,
    dailyNutrition: nutrition,
    referenceDateKey: addDaysToDateKey(start, 6),
    assessmentWeekNumber: 1,
  });

  // Measured vs EWMA trend separation
  assert.equal(assessment.weightAnalysis.latestMeasuredWeightKg, 51);
  assert.ok(
    assessment.weightAnalysis.assessedTrendWeightKg < 51,
    `EWMA (${assessment.weightAnalysis.assessedTrendWeightKg}) should smooth below raw 51kg jump`
  );
  // Week 1 stays anchored to formula TDEE (no overreaction to +1kg scale jump = 7700 kcal fallacy)
  assert.equal(
    Math.abs(assessment.calibratedTdeeKcal - assessment.estimatedTdeeKcal),
    0,
    'Week 1 should remain anchored to formula TDEE rather than overreacting to 1-week water/glycogen gain'
  );
  // Calorie adjustment must NOT plummet just because scale bumped +1kg in Week 1
  assert.ok(
    Math.abs(assessment.calorieDeltaKcal) <= 100,
    `Expected bounded delta in Week 1, got ${assessment.calorieDeltaKcal}`
  );
  // Macro math exactness
  assert.equal(
    assessment.recommendedCalories,
    assessment.recommendedProtein * 4 + assessment.recommendedCarbs * 4 + assessment.recommendedFat * 9
  );
});

// ---------------------------------------------------------------------------
// SCENARIO B: Weight Loss (80 kg -> 70 kg, Obesity Protein Ref, Plateau, Fast Loss)
// ---------------------------------------------------------------------------
console.log('\nScenario B: Weight Loss, Obesity Protein Ref, Plateau & Excessive Loss');
runTest('B1: 80kg -> 70kg lose_weight deficit, progression to 79kg, and updated BMR/TDEE/macros', () => {
  const calc80 = calculateSmartFitnessTargets({
    age: 30,
    biologicalSex: 'male',
    heightCm: 175,
    currentWeightKg: 80,
    targetWeightKg: 70,
    activityLevel: 'moderate',
    dailyAverageSteps: 8000,
    workoutFrequencyPerWeek: 4,
    fitnessGoal: 'lose_weight',
    goalSpeed: 'moderate',
    macroFocus: 'high_protein',
  });

  const calc79 = calculateSmartFitnessTargets({
    age: 30,
    biologicalSex: 'male',
    heightCm: 175,
    currentWeightKg: 79,
    targetWeightKg: 70,
    activityLevel: 'moderate',
    dailyAverageSteps: 8000,
    workoutFrequencyPerWeek: 4,
    fitnessGoal: 'lose_weight',
    goalSpeed: 'moderate',
    macroFocus: 'high_protein',
  });

  assert.ok(calc80.recommendedCalories < calc80.estimatedTdeeKcal, 'Lose weight must be in a deficit');
  assert.ok(calc79.bmr < calc80.bmr, 'Lower weight reduces resting BMR');
  assert.ok(calc79.estimatedTdeeKcal <= calc80.estimatedTdeeKcal, 'Lower weight reduces TDEE');
  assert.equal(calc80.recommendedCalories, calc80.proteinGrams * 4 + calc80.carbsGrams * 4 + calc80.fatGrams * 9);
});

runTest('B2: Obesity BMI >= 30 uses adjusted protein reference weight (not raw weight)', () => {
  const calcObese = calculateSmartFitnessTargets({
    age: 35,
    biologicalSex: 'male',
    heightCm: 170,
    currentWeightKg: 115, // BMI ~39.8
    targetWeightKg: 85,
    activityLevel: 'light',
    workoutFrequencyPerWeek: 2,
    fitnessGoal: 'lose_weight',
    goalSpeed: 'moderate',
    macroFocus: 'high_protein',
  });

  assert.ok(calcObese.bmi >= 30, `Expected BMI >= 30, got ${calcObese.bmi}`);
  assert.equal(calcObese.usedAdjustedProteinWeight, true);
  assert.ok(
    calcObese.proteinReferenceWeightKg < 115,
    `Adjusted protein reference (${calcObese.proteinReferenceWeightKg}kg) must be below raw 115kg`
  );
  // Raw 115 * 2.1 would be 242g; adjusted keeps protein practical & safe
  assert.ok(calcObese.proteinGrams < 200, `Expected practical protein target, got ${calcObese.proteinGrams}g`);
});

runTest('B3: Multi-week weight-loss plateau triggers bounded downward calorie adjustment', () => {
  const start = '2026-09-10';
  const profile = makeProfile({
    age: 30,
    biologicalSex: 'male',
    heightCm: 175,
    currentWeightKg: 79.0,
    targetWeightKg: 70.0,
    activityLevel: 'moderate',
    fitnessGoal: 'lose_weight',
    goalSpeed: 'moderate',
    macroFocus: 'high_protein',
  });
  const baseCalc = calculateSmartFitnessTargets({
    age: 30,
    biologicalSex: 'male',
    heightCm: 175,
    currentWeightKg: 79.0,
    targetWeightKg: 70.0,
    activityLevel: 'moderate',
    dailyAverageSteps: 8000,
    workoutFrequencyPerWeek: 4,
    fitnessGoal: 'lose_weight',
    goalSpeed: 'moderate',
    macroFocus: 'high_protein',
  });
  const goals = makeGoalsFromCalc(baseCalc, { assessmentWeekNumber: 2 });

  // 21 days stuck flat at 79.0 kg while eating at target calories
  const weights = makeWeightSeries(
    start,
    Array.from({ length: 21 }, (_, i) => ({ dayOffset: i, weightKg: 79.0 }))
  );
  const nutrition = makeDailyNutrition(
    start,
    Array.from({ length: 21 }, (_, i) => ({ dayOffset: i, calories: baseCalc.recommendedCalories }))
  );

  const assessment = runDeterministicWeeklyAssessment({
    userId: 'u-plateau',
    profile,
    goals,
    weightEntries: weights,
    dailyNutrition: nutrition,
    referenceDateKey: addDaysToDateKey(start, 20),
    assessmentWeekNumber: 3,
  });

  assert.ok(assessment.confidenceLevel !== 'low', `Expected medium/high confidence, got ${assessment.confidenceLevel}`);
  assert.ok(assessment.calorieDeltaKcal < 0, `Expected modest downward adjustment on plateau, got ${assessment.calorieDeltaKcal}`);
  assert.ok(
    Math.abs(assessment.calibratedTdeeKcal - assessment.priorTdeeKcal) <= MAX_WEEKLY_TDEE_SHIFT_KCAL,
    'Adaptive TDEE shift must be clamped to ±125 kcal/wk'
  );
});

runTest('B4: Excessively fast weight loss (>1.15%/wk) raises calories to protect lean mass', () => {
  const start = '2026-09-10';
  const profile = makeProfile({
    age: 30,
    biologicalSex: 'male',
    heightCm: 175,
    currentWeightKg: 76.2,
    targetWeightKg: 70.0,
    activityLevel: 'moderate',
    fitnessGoal: 'lose_weight',
    goalSpeed: 'moderate',
    macroFocus: 'high_protein',
  });
  const baseCalc = calculateSmartFitnessTargets({
    age: 30,
    biologicalSex: 'male',
    heightCm: 175,
    currentWeightKg: 80.0,
    targetWeightKg: 70.0,
    activityLevel: 'moderate',
    dailyAverageSteps: 8000,
    workoutFrequencyPerWeek: 4,
    fitnessGoal: 'lose_weight',
    goalSpeed: 'moderate',
    macroFocus: 'high_protein',
  });
  const goals = makeGoalsFromCalc(baseCalc, { assessmentWeekNumber: 2 });

  // Dropping ~1.3 kg/week (~1.6%/week) across 3 weeks
  const weights = makeWeightSeries(
    start,
    Array.from({ length: 21 }, (_, i) => ({
      dayOffset: i,
      weightKg: Math.round((80.0 - i * 0.19) * 100) / 100,
    }))
  );
  const nutrition = makeDailyNutrition(
    start,
    Array.from({ length: 21 }, (_, i) => ({ dayOffset: i, calories: baseCalc.recommendedCalories }))
  );

  const assessment = runDeterministicWeeklyAssessment({
    userId: 'u-fastloss',
    profile,
    goals,
    weightEntries: weights,
    dailyNutrition: nutrition,
    referenceDateKey: addDaysToDateKey(start, 20),
    assessmentWeekNumber: 3,
  });

  assert.equal(assessment.adjustmentType, 'increased');
  assert.ok(assessment.calorieDeltaKcal > 0, `Expected calories increased on excessive loss, got ${assessment.calorieDeltaKcal}`);
});

// ---------------------------------------------------------------------------
// SCENARIO C: Build Muscle (Lean Surplus, High Protein, On-Target Hold)
// ---------------------------------------------------------------------------
console.log('\nScenario C: Build Muscle (Lean Gain)');
runTest('C1: Build Muscle uses lean 5-10% surplus, strong protein (1.6-2.0+ g/kg), and holds steady when on pace', () => {
  const calc = calculateSmartFitnessTargets({
    age: 26,
    biologicalSex: 'male',
    heightCm: 178,
    currentWeightKg: 72,
    targetWeightKg: 78,
    activityLevel: 'active',
    dailyAverageSteps: 9000,
    workoutFrequencyPerWeek: 5,
    fitnessGoal: 'build_muscle',
    goalSpeed: 'moderate',
    macroFocus: 'athletic',
  });

  const surplusPct = calc.calorieDelta / calc.estimatedTdeeKcal;
  assert.ok(surplusPct >= 0.04 && surplusPct <= 0.14, `Expected lean surplus ~5-12%, got ${(surplusPct * 100).toFixed(1)}%`);
  const proteinPerKg = calc.proteinGrams / 72;
  assert.ok(proteinPerKg >= 1.6 && proteinPerKg <= 2.2, `Expected 1.6-2.2 g/kg protein, got ${proteinPerKg.toFixed(2)}`);

  // Simulate on-target lean gain (+0.20 kg/wk across 21 days) -> should NOT unnecessarily push calories up
  const start = '2026-09-10';
  const weights = makeWeightSeries(
    start,
    Array.from({ length: 21 }, (_, i) => ({
      dayOffset: i,
      weightKg: Math.round((72.0 + i * (0.2 / 7)) * 100) / 100,
    }))
  );
  const nutrition = makeDailyNutrition(
    start,
    Array.from({ length: 21 }, (_, i) => ({ dayOffset: i, calories: calc.recommendedCalories }))
  );
  const assessment = runDeterministicWeeklyAssessment({
    userId: 'u-muscle',
    profile: makeProfile({
      age: 26,
      heightCm: 178,
      currentWeightKg: 72.6,
      targetWeightKg: 78,
      activityLevel: 'active',
      dailyAverageSteps: 9000,
      workoutFrequencyPerWeek: 5,
      fitnessGoal: 'build_muscle',
      goalSpeed: 'moderate',
      macroFocus: 'athletic',
    }),
    goals: makeGoalsFromCalc(calc, { assessmentWeekNumber: 2 }),
    weightEntries: weights,
    dailyNutrition: nutrition,
    referenceDateKey: addDaysToDateKey(start, 20),
    assessmentWeekNumber: 3,
  });

  assert.ok(
    Math.abs(assessment.calorieDeltaKcal) <= 75,
    `On-pace lean bulk should avoid unnecessary calorie jumps, got ${assessment.calorieDeltaKcal}`
  );
});

// ---------------------------------------------------------------------------
// SCENARIO D: Body Recomposition
// ---------------------------------------------------------------------------
console.log('\nScenario D: Body Recomposition');
runTest('D1: Body Recomposition stays near maintenance with high protein (1.8-2.2 g/kg) and no aggressive deficit', () => {
  const calc = calculateSmartFitnessTargets({
    age: 28,
    biologicalSex: 'female',
    heightCm: 165,
    currentWeightKg: 62,
    targetWeightKg: 60,
    activityLevel: 'moderate',
    dailyAverageSteps: 8500,
    workoutFrequencyPerWeek: 4,
    fitnessGoal: 'recomposition',
    goalSpeed: 'moderate',
    macroFocus: 'high_protein',
  });

  const deltaPct = calc.calorieDelta / calc.estimatedTdeeKcal;
  assert.ok(deltaPct >= -0.10 && deltaPct <= 0.02, `Recomp must stay near maintenance (-10%..+2%), got ${(deltaPct * 100).toFixed(1)}%`);
  const proteinPerKg = calc.proteinGrams / 62;
  assert.ok(proteinPerKg >= 1.8 && proteinPerKg <= 2.35, `Recomp protein should be 1.8-2.3 g/kg, got ${proteinPerKg.toFixed(2)}`);
  assert.equal(calc.recommendedCalories, calc.proteinGrams * 4 + calc.carbsGrams * 4 + calc.fatGrams * 9);
});

// ---------------------------------------------------------------------------
// SCENARIO E: Weight Fluctuation (Single-Day Water Spike)
// ---------------------------------------------------------------------------
console.log('\nScenario E: Weight Fluctuation & EWMA Smoothing');
runTest('E1: Single-day +1.6kg water spike is damped by EWMA and causes zero excessive calorie adjustment', () => {
  const start = '2026-09-10';
  const calc = calculateSmartFitnessTargets({
    age: 29,
    biologicalSex: 'male',
    heightCm: 176,
    currentWeightKg: 75,
    targetWeightKg: 75,
    activityLevel: 'moderate',
    dailyAverageSteps: 8000,
    workoutFrequencyPerWeek: 4,
    fitnessGoal: 'maintain_weight',
    goalSpeed: 'moderate',
    macroFocus: 'balanced',
  });

  // 20 stable days at 75.0 kg, then day 21 spikes to 76.6 kg (salty dinner / water retention)
  const weights = makeWeightSeries(
    start,
    Array.from({ length: 21 }, (_, i) => ({
      dayOffset: i,
      weightKg: i === 20 ? 76.6 : 75.0,
    }))
  );
  const nutrition = makeDailyNutrition(
    start,
    Array.from({ length: 21 }, (_, i) => ({ dayOffset: i, calories: calc.recommendedCalories }))
  );

  const trend = analyzeWeightTrend(weights, addDaysToDateKey(start, 14), addDaysToDateKey(start, 20), 76.6);
  assert.equal(trend.latestMeasuredWeightKg, 76.6);
  assert.ok(
    trend.assessedTrendWeightKg < 75.6,
    `EWMA (${trend.assessedTrendWeightKg}) should heavily damp a single-day +1.6kg spike`
  );

  const assessment = runDeterministicWeeklyAssessment({
    userId: 'u-spike',
    profile: makeProfile({
      age: 29,
      heightCm: 176,
      currentWeightKg: 76.6,
      targetWeightKg: 75,
      fitnessGoal: 'maintain_weight',
      macroFocus: 'balanced',
    }),
    goals: makeGoalsFromCalc(calc, { assessmentWeekNumber: 2 }),
    weightEntries: weights,
    dailyNutrition: nutrition,
    referenceDateKey: addDaysToDateKey(start, 20),
    assessmentWeekNumber: 3,
  });

  assert.ok(
    Math.abs(assessment.calorieDeltaKcal) <= 75,
    `Water spike should not trigger excessive calorie adjustment, got ${assessment.calorieDeltaKcal}`
  );
});

// ---------------------------------------------------------------------------
// SCENARIO F: Insufficient Data Gate & Distinct Logging vs Adherence
// ---------------------------------------------------------------------------
console.log('\nScenario F: Insufficient Data & Logging Completeness vs Adherence');
runTest('F1: <5 food days & <4 weigh-ins triggers low confidence and preserves existing calorie target', () => {
  const start = '2026-10-01';
  const calc = calculateSmartFitnessTargets({
    age: 27,
    biologicalSex: 'male',
    heightCm: 175,
    currentWeightKg: 78,
    targetWeightKg: 72,
    activityLevel: 'moderate',
    workoutFrequencyPerWeek: 3,
    fitnessGoal: 'lose_weight',
    goalSpeed: 'moderate',
    macroFocus: 'high_protein',
  });
  const goals = makeGoalsFromCalc(calc, { assessmentWeekNumber: 2 });

  // Only 2 weigh-ins and 3 logged food days (way below gate)
  const weights = makeWeightSeries(start, [
    { dayOffset: 0, weightKg: 78.0 },
    { dayOffset: 6, weightKg: 78.8 },
  ]);
  // 3 logged days, all right on calorie target -> logging completeness = 43%, calorie adherence = 100%
  const nutrition = makeDailyNutrition(start, [
    { dayOffset: 0, calories: calc.recommendedCalories },
    { dayOffset: 2, calories: calc.recommendedCalories },
    { dayOffset: 5, calories: calc.recommendedCalories },
  ]);

  const assessment = runDeterministicWeeklyAssessment({
    userId: 'u-sparse',
    profile: makeProfile({
      age: 27,
      currentWeightKg: 78.8,
      targetWeightKg: 72,
      fitnessGoal: 'lose_weight',
      macroFocus: 'high_protein',
    }),
    goals,
    weightEntries: weights,
    dailyNutrition: nutrition,
    referenceDateKey: addDaysToDateKey(start, 6),
    assessmentWeekNumber: 3,
  });

  assert.equal(assessment.confidenceLevel, 'low');
  assert.equal(assessment.adjustmentType, 'insufficient_data');
  assert.equal(assessment.recommendedCalories, goals.calories, 'Must preserve existing calorie targets on insufficient data');
  assert.equal(assessment.calorieDeltaKcal, 0);
  // Logging completeness (~43%) is distinct from calorie adherence on logged days (100%)
  assert.ok(assessment.loggingCompletenessPct < 50, `Expected logging completeness <50%, got ${assessment.loggingCompletenessPct}`);
  assert.ok(assessment.adherencePercentage >= 95, `Expected adherence on logged days >=95%, got ${assessment.adherencePercentage}`);
});

// ---------------------------------------------------------------------------
// SCENARIO G: Macro Consistency Across All 5 Goals x 4 Macro Focuses x 3 Paces
// ---------------------------------------------------------------------------
console.log('\nScenario G: Universal Macro Math Consistency (5 x 4 x 3 = 60 permutations)');
runTest('G1: Calories = P*4 + C*4 + F*9 across all 60 goal/macro/pace combinations & fibre excluded from kcal', () => {
  const allGoals: SmartFitnessGoalType[] = [
    'build_muscle',
    'fat_gain',
    'lose_weight',
    'recomposition',
    'maintain_weight',
  ];
  const allFocuses: MacroFocusType[] = ['high_protein', 'balanced', 'lower_carb', 'athletic'];
  const allPaces: GoalSpeed[] = ['slow', 'moderate', 'aggressive'];

  let checked = 0;
  for (const fitnessGoal of allGoals) {
    for (const macroFocus of allFocuses) {
      for (const goalSpeed of allPaces) {
        const targetWeightKg =
          fitnessGoal === 'lose_weight' ? 66 : fitnessGoal === 'maintain_weight' ? 74 : 80;
        const res = calculateSmartFitnessTargets({
          age: 28,
          biologicalSex: 'male',
          heightCm: 176,
          currentWeightKg: 74,
          targetWeightKg,
          activityLevel: 'moderate',
          dailyAverageSteps: 8000,
          workoutFrequencyPerWeek: 4,
          fitnessGoal,
          goalSpeed,
          macroFocus,
        });

        const sumKcal = res.proteinGrams * 4 + res.carbsGrams * 4 + res.fatGrams * 9;
        assert.equal(
          res.recommendedCalories,
          sumKcal,
          `Mismatch for ${fitnessGoal}/${macroFocus}/${goalSpeed}: recommended=${res.recommendedCalories}, sum=${sumKcal}`
        );
        assert.ok(res.fibreGrams >= 20 && res.fibreGrams <= 50, `Fibre out of bounds: ${res.fibreGrams}`);
        // Confirm fibre is NOT added to kcal
        assert.notEqual(res.recommendedCalories, sumKcal + res.fibreGrams * 2);
        checked += 1;
      }
    }
  }
  assert.equal(checked, 60);

  // Also verify What-If comparison covers all 5 distinct goals
  const whatIf = buildWhatIfGoalComparisons({
    age: 28,
    biologicalSex: 'male',
    heightCm: 176,
    currentWeightKg: 74,
    targetWeightKg: 70,
    activityLevel: 'moderate',
    dailyAverageSteps: 8000,
    workoutFrequencyPerWeek: 4,
    fitnessGoal: 'lose_weight',
    goalSpeed: 'moderate',
    macroFocus: 'high_protein',
  });
  assert.equal(whatIf.length, 5);
});

runTest('G2: Optional Katch-McArdle BMR activates only when valid bodyFatPct is provided', () => {
  const withoutBf = calculateSmartFitnessTargets({
    age: 28,
    biologicalSex: 'male',
    heightCm: 176,
    currentWeightKg: 74,
    targetWeightKg: 74,
    activityLevel: 'moderate',
    workoutFrequencyPerWeek: 4,
    fitnessGoal: 'maintain_weight',
    goalSpeed: 'moderate',
  });
  const withBf = calculateSmartFitnessTargets({
    age: 28,
    biologicalSex: 'male',
    heightCm: 176,
    currentWeightKg: 74,
    targetWeightKg: 74,
    activityLevel: 'moderate',
    workoutFrequencyPerWeek: 4,
    fitnessGoal: 'maintain_weight',
    goalSpeed: 'moderate',
    bodyFatPct: 14,
  });

  assert.equal(withoutBf.bmrEquation, 'mifflin_st_jeor');
  assert.equal(withBf.bmrEquation, 'katch_mcardle');
  assert.equal(withBf.bmr, calculateKatchMcArdleBmr(74, 14));
  assert.equal(withoutBf.bmr, calculateMifflinStJeorBmr(74, 176, 28, 'male'));

  // Unified activity factor stays cleanly bounded (no double-counting)
  const palHigh = calculateCalibratedActivityFactor('very_active', 18000, 10, 'vigorous');
  assert.ok(palHigh <= 1.95 && palHigh >= 1.2);
});

// ---------------------------------------------------------------------------
// SCENARIO H: Goal Completion & Maintenance Transition
// ---------------------------------------------------------------------------
console.log('\nScenario H: Goal Completion & Maintenance Transition');
runTest('H1: Loss goal reached (80 -> 70 kg) stops deficit and recommends maintenance transition', () => {
  const start = '2026-10-01';
  const initialCalc = calculateSmartFitnessTargets({
    age: 30,
    biologicalSex: 'male',
    heightCm: 175,
    currentWeightKg: 71,
    targetWeightKg: 70,
    activityLevel: 'moderate',
    workoutFrequencyPerWeek: 4,
    fitnessGoal: 'lose_weight',
    goalSpeed: 'moderate',
    macroFocus: 'high_protein',
  });
  const weights = makeWeightSeries(start, [
    { dayOffset: 0, weightKg: 70.4 },
    { dayOffset: 1, weightKg: 70.2 },
    { dayOffset: 2, weightKg: 70.1 },
    { dayOffset: 3, weightKg: 70.0 },
    { dayOffset: 4, weightKg: 69.9 },
    { dayOffset: 5, weightKg: 69.9 },
    { dayOffset: 6, weightKg: 69.8 },
  ]);
  const nutrition = makeDailyNutrition(
    start,
    Array.from({ length: 7 }, (_, i) => ({ dayOffset: i, calories: initialCalc.recommendedCalories }))
  );

  const assessment = runDeterministicWeeklyAssessment({
    userId: 'u-done-loss',
    profile: makeProfile({
      age: 30,
      currentWeightKg: 69.8,
      targetWeightKg: 70.0,
      fitnessGoal: 'lose_weight',
      macroFocus: 'high_protein',
    }),
    goals: makeGoalsFromCalc(initialCalc, { assessmentWeekNumber: 4 }),
    weightEntries: weights,
    dailyNutrition: nutrition,
    referenceDateKey: addDaysToDateKey(start, 6),
    assessmentWeekNumber: 5,
  });

  assert.equal(assessment.goalCompleted, true);
  assert.equal(assessment.adjustmentType, 'goal_completed_maintenance');
  assert.ok(assessment.suggestedMaintenanceCalories !== null);
  assert.ok(
    assessment.recommendedCalories >= assessment.calibratedTdeeKcal - 50,
    `Deficit must stop upon goal completion: rec=${assessment.recommendedCalories}, tdee=${assessment.calibratedTdeeKcal}`
  );
});

runTest('H2: Gain goal reached (50 -> 70 kg) stops surplus and recommends maintenance transition', () => {
  const start = '2026-10-01';
  const initialCalc = calculateSmartFitnessTargets({
    age: 24,
    biologicalSex: 'male',
    heightCm: 175,
    currentWeightKg: 69.5,
    targetWeightKg: 70,
    activityLevel: 'moderate',
    workoutFrequencyPerWeek: 3,
    fitnessGoal: 'fat_gain',
    goalSpeed: 'moderate',
    macroFocus: 'balanced',
  });
  const weights = makeWeightSeries(start, [
    { dayOffset: 0, weightKg: 69.7 },
    { dayOffset: 1, weightKg: 69.9 },
    { dayOffset: 2, weightKg: 70.0 },
    { dayOffset: 3, weightKg: 70.1 },
    { dayOffset: 4, weightKg: 70.1 },
    { dayOffset: 5, weightKg: 70.2 },
    { dayOffset: 6, weightKg: 70.2 },
  ]);
  const nutrition = makeDailyNutrition(
    start,
    Array.from({ length: 7 }, (_, i) => ({ dayOffset: i, calories: initialCalc.recommendedCalories }))
  );

  const assessment = runDeterministicWeeklyAssessment({
    userId: 'u-done-gain',
    profile: makeProfile({
      age: 24,
      currentWeightKg: 70.2,
      targetWeightKg: 70.0,
      fitnessGoal: 'fat_gain',
      macroFocus: 'balanced',
    }),
    goals: makeGoalsFromCalc(initialCalc, { assessmentWeekNumber: 8 }),
    weightEntries: weights,
    dailyNutrition: nutrition,
    referenceDateKey: addDaysToDateKey(start, 6),
    assessmentWeekNumber: 9,
  });

  assert.equal(assessment.goalCompleted, true);
  assert.equal(assessment.adjustmentType, 'goal_completed_maintenance');
  assert.ok(assessment.suggestedMaintenanceCalories !== null);
  assert.ok(
    assessment.recommendedCalories <= assessment.calibratedTdeeKcal + 50,
    `Surplus must stop upon goal completion: rec=${assessment.recommendedCalories}, tdee=${assessment.calibratedTdeeKcal}`
  );
});

// ---------------------------------------------------------------------------
// SCENARIO I: Safety Pathways, Input Validation & AI Fallback Validation
// ---------------------------------------------------------------------------
console.log('\nScenario I: Safety Pathways, Validation & AI Schema Enforcement');
runTest('I1: Adolescent (age 16) blocks automatic calorie deficit', () => {
  const calc = calculateSmartFitnessTargets({
    age: 16,
    biologicalSex: 'female',
    heightCm: 162,
    currentWeightKg: 68,
    targetWeightKg: 58,
    activityLevel: 'moderate',
    workoutFrequencyPerWeek: 3,
    fitnessGoal: 'lose_weight',
    goalSpeed: 'aggressive',
  });

  assert.equal(calc.pathway, 'adolescent');
  assert.equal(calc.deficitBlocked, true);
  assert.ok(calc.recommendedCalories >= calc.estimatedTdeeKcal - 20, 'Adolescent deficit must be blocked');
  assert.ok(calc.safetyNote && calc.safetyNote.toLowerCase().includes('adolescent'));
});

runTest('I2: Pregnancy / breastfeeding blocks automatic calorie deficit', () => {
  const calc = calculateSmartFitnessTargets({
    age: 29,
    biologicalSex: 'female',
    heightCm: 164,
    currentWeightKg: 72,
    targetWeightKg: 62,
    activityLevel: 'light',
    workoutFrequencyPerWeek: 2,
    fitnessGoal: 'lose_weight',
    goalSpeed: 'moderate',
    isPregnantOrBreastfeeding: true,
  });

  assert.equal(calc.pathway, 'pregnancy_or_breastfeeding');
  assert.equal(calc.deficitBlocked, true);
  assert.ok(calc.recommendedCalories >= calc.estimatedTdeeKcal - 20, 'Pregnancy/breastfeeding deficit must be blocked');
  assert.ok(calc.safetyNote && calc.safetyNote.toLowerCase().includes('pregnan'));
});

runTest('I3: Invalid calculator inputs are rejected cleanly', () => {
  assert.equal(validateCalculatorInput({ age: 10, heightCm: 170, currentWeightKg: 70, targetWeightKg: 65 }).valid, false);
  assert.equal(validateCalculatorInput({ age: 25, heightCm: 50, currentWeightKg: 70, targetWeightKg: 65 }).valid, false);
  assert.equal(validateCalculatorInput({ age: 25, heightCm: 170, currentWeightKg: 10, targetWeightKg: 65 }).valid, false);
  assert.equal(validateCalculatorInput({ age: 25, heightCm: 170, currentWeightKg: 70, targetWeightKg: 65, bodyFatPct: 90 }).valid, false);
  assert.equal(calculateBmi(70, 175).bmiCategory, 'Normal');
});

runTest('I4: AI response validator rejects malformed/empty payloads and falls back deterministically', () => {
  const fallback: WeeklyAssessmentAiExplanation = {
    headline: 'Week 2 check-in complete',
    bodyChangeAnalysis: 'Your smoothed weight trend stayed steady this week.',
    calorieAdjustmentReason: 'Maintaining current daily targets while gathering more trend data.',
    actionableTips: ['Keep logging at least 5 full days of meals.', 'Weigh in consistently in the morning.'],
    confidenceExplanation: 'Moderate confidence based on current logs.',
    provider: 'deterministic',
  };

  assert.equal(validateWeeklyAssessmentAiExplanation(null, fallback).valid, false);
  assert.equal(validateWeeklyAssessmentAiExplanation({}, fallback).valid, false);
  assert.equal(validateWeeklyAssessmentAiExplanation({ headline: 'short' }, fallback).valid, false);

  const validRes = validateWeeklyAssessmentAiExplanation(
    {
      headline: 'Steady fat loss progress this week',
      bodyChangeAnalysis: 'Your EWMA smoothed weight trend dropped steadily by 0.4 kg this week.',
      calorieAdjustmentReason: 'We recalculated macros at your updated weight while keeping protein high.',
      actionableTips: [
        'Keep morning weigh-ins consistent after waking up.',
        'Include dal, paneer, curd, or eggs to hit your protein target.',
      ],
      confidenceExplanation: 'High confidence from 7 logged food days and 6 weigh-ins.',
    },
    fallback
  );
  assert.equal(validRes.valid, true);
  assert.equal(validRes.explanation.provider, 'gemini');
  assert.equal(validRes.explanation.actionableTips.length, 2);
});

// ---------------------------------------------------------------------------
// SCENARIO J: Scheduling, Due-Check, Idempotency & Duplicate Prevention
// ---------------------------------------------------------------------------
console.log('\nScenario J: 7-Day Scheduling, Due-Check & Duplicate Prevention');
runTest('J1: Due-check respects 7-day cadence, prevents duplicate prompts after applied/dismissed, and advances after missed week', () => {
  const profile = makeProfile({
    currentWeightKg: 78,
    targetWeightKg: 72,
    fitnessGoal: 'lose_weight',
  });
  const baseCalc = calculateSmartFitnessTargets({
    age: 25,
    biologicalSex: 'male',
    heightCm: 175,
    currentWeightKg: 78,
    targetWeightKg: 72,
    activityLevel: 'moderate',
    workoutFrequencyPerWeek: 4,
    fitnessGoal: 'lose_weight',
    goalSpeed: 'moderate',
  });
  const goals = makeGoalsFromCalc(baseCalc, { initialCalculatedAt: '2026-10-01T08:00:00.000Z' });
  const weights = makeWeightSeries('2026-10-01', [
    { dayOffset: 0, weightKg: 78 },
    { dayOffset: 2, weightKg: 77.8 },
    { dayOffset: 4, weightKg: 77.6 },
    { dayOffset: 6, weightKg: 77.5 },
    { dayOffset: 7, weightKg: 77.4 },
  ]);
  const foodEntries = Array.from({ length: 8 }, (_, i) => ({
    date: addDaysToDateKey('2026-10-01', i),
    calories: baseCalc.recommendedCalories,
    protein: baseCalc.proteinGrams,
    carbs: baseCalc.carbsGrams,
    fat: baseCalc.fatGrams,
    fibre: baseCalc.fibreGrams,
  }));

  // Day 4 -> NOT yet due (3 days remaining)
  const day4 = evaluateWeeklyAssessmentDueStatus({
    profile,
    goals,
    weightEntries: weights,
    foodEntries,
    weeklyAssessments: [],
    todayDateKey: '2026-10-05',
  });
  assert.equal(day4.isDue, false);
  assert.equal(day4.daysRemaining, 3);

  // Day 8 (7 days since Oct 1) -> DUE
  const day8 = evaluateWeeklyAssessmentDueStatus({
    profile,
    goals,
    weightEntries: weights,
    foodEntries,
    weeklyAssessments: [],
    todayDateKey: '2026-10-08',
  });
  assert.equal(day8.isDue, true);
  assert.equal(day8.daysRemaining, 0);

  // Once applied or dismissed for Oct 2..Oct 8, same-day & next-day checks must NOT prompt again
  const dismissedRecord: WeeklyAssessmentRecord = {
    id: 'wa-1',
    userId: 'u-1',
    assessmentWeekNumber: 1,
    weekStartDate: '2026-10-02',
    weekEndDate: '2026-10-08',
    previousWeightKg: 78,
    assessedWeightKg: 77.4,
    previousTrendWeightKg: 78,
    assessedTrendWeightKg: 77.6,
    weeklyWeightChangeKg: -0.4,
    avgDailyCalories: baseCalc.recommendedCalories,
    avgDailyProtein: baseCalc.proteinGrams,
    avgDailyCarbs: baseCalc.carbsGrams,
    avgDailyFat: baseCalc.fatGrams,
    foodLoggedDays: 7,
    weightLoggedDays: 4,
    loggingCompletenessPct: 100,
    adherencePercentage: 100,
    priorTdeeKcal: baseCalc.estimatedTdeeKcal,
    estimatedTdeeKcal: baseCalc.estimatedTdeeKcal,
    calibratedTdeeKcal: baseCalc.estimatedTdeeKcal,
    previousRecommendedCalories: baseCalc.recommendedCalories,
    recommendedCalories: baseCalc.recommendedCalories,
    recommendedProtein: baseCalc.proteinGrams,
    recommendedCarbs: baseCalc.carbsGrams,
    recommendedFat: baseCalc.fatGrams,
    recommendedFibre: baseCalc.fibreGrams,
    calorieDeltaKcal: 0,
    adjustmentType: 'maintained',
    adjustmentReason: 'On track',
    confidenceLevel: 'high',
    goalCompleted: false,
    aiSummary: {
      headline: 'On track',
      bodyChangeAnalysis: 'Weight trend shifted -0.4 kg.',
      calorieAdjustmentReason: 'Keeping calories steady.',
      actionableTips: ['Stay consistent.'],
      confidenceExplanation: 'High confidence.',
      provider: 'deterministic',
    },
    rationaleBullets: ['On track'],
    calculationVersion: CALCULATION_VERSION,
    status: 'dismissed',
    createdAt: '2026-10-08T10:00:00.000Z',
  };

  const day8AfterDismiss = evaluateWeeklyAssessmentDueStatus({
    profile,
    goals,
    weightEntries: weights,
    foodEntries,
    weeklyAssessments: [dismissedRecord],
    todayDateKey: '2026-10-08',
  });
  assert.equal(day8AfterDismiss.isDue, false, 'Dismissed period must suppress repeat prompt');

  // Missed week: 14 days later (Oct 22) -> cleanly due again for next window
  const day22 = evaluateWeeklyAssessmentDueStatus({
    profile,
    goals,
    weightEntries: weights,
    foodEntries,
    weeklyAssessments: [dismissedRecord],
    todayDateKey: '2026-10-22',
  });
  assert.equal(day22.isDue, true, 'Missed week should advance cleanly and become due again');
  assert.equal(day22.weekEndDate, '2026-10-22');

  // Confirm buildDailyNutritionSummaries fills exact 7 days
  const daily = buildDailyNutritionSummaries(foodEntries, '2026-10-02', '2026-10-08');
  assert.equal(daily.length, 7);
});

// ---------------------------------------------------------------------------
// SCENARIO K: Final Calculation Breakdown Corrections (calothrix-smart-v2.2)
// ---------------------------------------------------------------------------
console.log('\nScenario K: Final Calculation Breakdown Corrections (v2.2)');

runTest('K1: Custom calibrated PAL estimate metadata, exact unrounded BMR->TDEE math & no double-counting', () => {
  assert.equal(CALCULATION_VERSION, 'calothrix-smart-v2.2');
  const bmrExact = calculateMifflinStJeorBmrExact(50, 175, 24, 'male');
  assert.equal(bmrExact, 1478.75);

  const calc = calculateSmartFitnessTargets({
    age: 24,
    biologicalSex: 'male',
    heightCm: 175,
    currentWeightKg: 50,
    targetWeightKg: 60,
    activityLevel: 'moderate',
    dailyAverageSteps: 9000,
    workoutFrequencyPerWeek: 4,
    workoutIntensity: 'moderate',
    fitnessGoal: 'maintain_weight',
  });

  const breakdown = calculateActivityBreakdown('moderate', 9000, 4, 'moderate');
  assert.equal(breakdown.modelType, 'custom_calibrated_pal_estimate');
  assert.equal(breakdown.isValidatedScientificFormula, false);
  assert.equal(breakdown.conventionalTierMultiplier, 1.55);
  assert.equal(breakdown.tierWeight, 0.65);
  assert.equal(breakdown.behavioralWeight, 0.35);
  assert.equal(calc.activityMultiplier, breakdown.appliedMultiplier);
  assert.equal(calc.activityMultiplierExact, breakdown.appliedMultiplierExact);
  assert.equal(calc.bmrExact, 1478.75);
  assert.equal(calc.bmr, 1479);
  // TDEE uses exact unrounded BMR × exact unrounded PAL multiplier (round only for presentation)
  assert.ok(Math.abs(calc.estimatedTdeeExact - bmrExact * breakdown.appliedMultiplierExact) < 0.01);
  assert.equal(calc.estimatedTdeeKcal, Math.round(bmrExact * breakdown.appliedMultiplierExact));
  assert.ok(breakdown.calibrationBasis.toLowerCase().includes('custom calibrated'));
  assert.ok(breakdown.modelExplanation.toLowerCase().includes('estimate'));
  assert.ok(breakdown.modelExplanation.includes(breakdown.appliedMultiplierExact.toFixed(4)));
  assert.ok(breakdown.appliedMultiplier >= 1.2 && breakdown.appliedMultiplier <= 1.95);
});

runTest('K2: Ages 14-17 block ordinary adult deficits AND bulking surpluses; pregnancy/breastfeeding clinical exclusion', () => {
  const teenLoss = calculateSmartFitnessTargets({
    age: 16,
    biologicalSex: 'male',
    heightCm: 170,
    currentWeightKg: 62,
    targetWeightKg: 56,
    activityLevel: 'moderate',
    dailyAverageSteps: 8500,
    workoutFrequencyPerWeek: 3,
    fitnessGoal: 'lose_weight',
    goalSpeed: 'aggressive',
    bodyFatPct: 18, // Must NOT bypass adolescent Schofield safety pathway
  });

  const expectedSchofield = calculateSchofieldAdolescentBmrExact(62, 170, 'male');
  assert.equal(teenLoss.pathway, 'adolescent');
  assert.equal(teenLoss.bmrEquation, 'schofield_adolescent');
  assert.equal(teenLoss.bmr, Math.round(expectedSchofield));
  assert.equal(teenLoss.deficitBlocked, true);
  assert.equal(teenLoss.adultPrescriptionBlocked, true);
  assert.equal(teenLoss.bmiBasis, 'pediatric_cdc_percentile');
  assert.ok(teenLoss.bmiPercentile !== null && teenLoss.bmiPercentile > 1 && teenLoss.bmiPercentile < 99);
  assert.ok(teenLoss.bodyStatusLabel.includes('%ile'), `Expected percentile label, got ${teenLoss.bodyStatusLabel}`);
  assert.equal(teenLoss.estimatedWeeks, null);
  assert.equal(teenLoss.estimatedWeeksRange, null);

  // Also verify under-18 blocks ordinary adult bulking surplus prescriptions
  const teenBulk = calculateSmartFitnessTargets({
    age: 16,
    biologicalSex: 'male',
    heightCm: 170,
    currentWeightKg: 62,
    targetWeightKg: 70,
    activityLevel: 'moderate',
    dailyAverageSteps: 8500,
    workoutFrequencyPerWeek: 4,
    fitnessGoal: 'build_muscle',
    goalSpeed: 'aggressive',
  });
  assert.equal(teenBulk.pathway, 'adolescent');
  assert.equal(teenBulk.adultPrescriptionBlocked, true);
  assert.equal(teenBulk.rawStrategyDeltaExact, 0);
  assert.ok(Math.abs(teenBulk.calorieDelta) <= 20, `Teen bulk should stay at maintenance estimate, got delta ${teenBulk.calorieDelta}`);
  assert.equal(teenBulk.estimatedWeeks, null);

  // Pregnancy / breastfeeding blocks ordinary adult prescriptions & automated timelines
  const pregnantBulk = calculateSmartFitnessTargets({
    age: 29,
    biologicalSex: 'female',
    heightCm: 164,
    currentWeightKg: 66,
    targetWeightKg: 72,
    activityLevel: 'light',
    workoutFrequencyPerWeek: 2,
    fitnessGoal: 'build_muscle',
    goalSpeed: 'moderate',
    isPregnantOrBreastfeeding: true,
  });
  assert.equal(pregnantBulk.pathway, 'pregnancy_or_breastfeeding');
  assert.equal(pregnantBulk.adultPrescriptionBlocked, true);
  assert.equal(pregnantBulk.rawStrategyDeltaExact, 0);
  assert.equal(pregnantBulk.estimatedWeeks, null);
  assert.ok(pregnantBulk.safetyNote && pregnantBulk.safetyNote.toLowerCase().includes('ob-gyn'));
});

runTest('K3: Consistent calorie surplus/deficit math, exact displayed percentage reconciliation & resistance check', () => {
  const buildMuscleNoLift = calculateSmartFitnessTargets({
    age: 26,
    biologicalSex: 'male',
    heightCm: 176,
    currentWeightKg: 70,
    targetWeightKg: 76,
    activityLevel: 'moderate',
    dailyAverageSteps: 8000,
    workoutFrequencyPerWeek: 1,
    doesResistanceTraining: false,
    fitnessGoal: 'build_muscle',
    goalSpeed: 'slow',
    macroFocus: 'balanced',
  });
  // Exact mathematical reconciliation of maintenance + delta = target & displayed percentage
  assert.equal(
    buildMuscleNoLift.activeMaintenanceKcal + buildMuscleNoLift.calorieDelta,
    buildMuscleNoLift.recommendedCalories
  );
  const expectedPct =
    Math.round((buildMuscleNoLift.calorieDelta / buildMuscleNoLift.activeMaintenanceKcal) * 10000) / 100;
  assert.equal(buildMuscleNoLift.actualCalorieDeltaPct, expectedPct);
  assert.ok(
    buildMuscleNoLift.actualCalorieDeltaPct >= 4.5 && buildMuscleNoLift.actualCalorieDeltaPct <= 10.5,
    `Build Muscle slow surplus expected ~5-10%, got ${buildMuscleNoLift.actualCalorieDeltaPct}%`
  );
  assert.ok(
    buildMuscleNoLift.calculationBreakdown.calorieStrategy.includes(
      `${buildMuscleNoLift.activeMaintenanceKcal.toLocaleString()} kcal`
    ) &&
      buildMuscleNoLift.calculationBreakdown.calorieStrategy.includes(
        `${buildMuscleNoLift.recommendedCalories.toLocaleString()} kcal`
      ),
    'Calorie strategy breakdown must show reconciled maintenance, delta, percentage, and final target'
  );
  assert.ok(
    buildMuscleNoLift.resistanceTrainingNote &&
      buildMuscleNoLift.resistanceTrainingNote.toLowerCase().includes('resistance training'),
    'Build Muscle without resistance training must surface a clear recommendation'
  );

  const buildMuscleWithLift = calculateSmartFitnessTargets({
    age: 26,
    biologicalSex: 'male',
    heightCm: 176,
    currentWeightKg: 70,
    targetWeightKg: 76,
    activityLevel: 'moderate',
    dailyAverageSteps: 8000,
    workoutFrequencyPerWeek: 4,
    doesResistanceTraining: true,
    fitnessGoal: 'build_muscle',
    goalSpeed: 'aggressive',
    macroFocus: 'athletic',
  });
  assert.equal(buildMuscleWithLift.resistanceTrainingNote, undefined);
  assert.equal(
    buildMuscleWithLift.activeMaintenanceKcal + buildMuscleWithLift.calorieDelta,
    buildMuscleWithLift.recommendedCalories
  );
  assert.equal(
    buildMuscleWithLift.actualCalorieDeltaPct,
    Math.round((buildMuscleWithLift.calorieDelta / buildMuscleWithLift.activeMaintenanceKcal) * 10000) / 100
  );

  const recompSameWeight = calculateSmartFitnessTargets({
    age: 28,
    biologicalSex: 'female',
    heightCm: 165,
    currentWeightKg: 62,
    targetWeightKg: 62,
    activityLevel: 'moderate',
    workoutFrequencyPerWeek: 4,
    fitnessGoal: 'recomposition',
    goalSpeed: 'slow',
  });
  assert.equal(recompSameWeight.estimatedWeeks, null, 'Recomposition must NOT hardcode a 12-week timeline');
  assert.equal(recompSameWeight.estimatedWeeksRange, null);
});

runTest('K4: Factor-dependent hydration (duration, sweat, climate, steps) with exact reconciliation & no universal +450 ml', () => {
  // Zero workouts + <=6000 steps -> 0 activity allowance, exact 35 ml/kg base
  const hydRest = calculateHydrationEstimate(68.4, 'sedentary', 0, {
    avgWorkoutDurationMin: 0,
    workoutIntensity: 'light',
    sweatRateLevel: 'moderate',
    climateLevel: 'temperate',
    dailyAverageSteps: 5000,
  });
  assert.equal(hydRest.baseWaterMlExact, 68.4 * 35);
  assert.equal(hydRest.baseWaterMl, Math.round(68.4 * 35));
  assert.equal(hydRest.activityAddMl, 0);
  assert.equal(hydRest.totalWaterMl, hydRest.baseWaterMl);

  // Same body weight & activity tier, different exercise duration / sweat rate / climate must produce different allowances
  const calcLowSweatShort = calculateSmartFitnessTargets({
    age: 30,
    biologicalSex: 'male',
    heightCm: 178,
    currentWeightKg: 75,
    targetWeightKg: 70,
    activityLevel: 'active',
    dailyAverageSteps: 6000,
    workoutFrequencyPerWeek: 3,
    workoutIntensity: 'light',
    avgWorkoutDurationMin: 30,
    sweatRateLevel: 'low',
    climateLevel: 'temperate',
    fitnessGoal: 'lose_weight',
    goalSpeed: 'moderate',
  });

  const calcHighSweatLongHot = calculateSmartFitnessTargets({
    age: 30,
    biologicalSex: 'male',
    heightCm: 178,
    currentWeightKg: 75,
    targetWeightKg: 70,
    activityLevel: 'active',
    dailyAverageSteps: 12000,
    workoutFrequencyPerWeek: 5,
    workoutIntensity: 'vigorous',
    avgWorkoutDurationMin: 75,
    sweatRateLevel: 'high',
    climateLevel: 'warm_humid',
    fitnessGoal: 'lose_weight',
    goalSpeed: 'moderate',
  });

  assert.equal(calcLowSweatShort.hydrationBaseMl, 75 * 35);
  assert.equal(calcHighSweatLongHot.hydrationBaseMl, 75 * 35);
  // Exact reconciliation: base + activityAdd === total
  assert.equal(
    calcLowSweatShort.hydrationBaseMl + calcLowSweatShort.hydrationActivityAddMl,
    calcLowSweatShort.recommendedWaterMl
  );
  assert.equal(
    calcHighSweatLongHot.hydrationBaseMl + calcHighSweatLongHot.hydrationActivityAddMl,
    calcHighSweatLongHot.recommendedWaterMl
  );
  assert.ok(
    calcHighSweatLongHot.hydrationActivityAddMl > calcLowSweatShort.hydrationActivityAddMl + 300,
    `Expected high-sweat/long/warm-humid allowance (${calcHighSweatLongHot.hydrationActivityAddMl}ml) to significantly exceed low-sweat/short/temperate (${calcLowSweatShort.hydrationActivityAddMl}ml)`
  );
  assert.notEqual(calcLowSweatShort.hydrationActivityAddMl, 450, 'Must not apply a fixed 450 ml allowance to everyone');
  assert.equal(calcHighSweatLongHot.hydrationIsEstimate, true);
  assert.ok(calcHighSweatLongHot.hydrationDisclaimer.toLowerCase().includes('estimate'));
  assert.equal(calcHighSweatLongHot.fibreIsEstimate, true);
  assert.equal(
    calcHighSweatLongHot.fibreGrams,
    Math.round((calcHighSweatLongHot.recommendedCalories / 1000) * 14)
  );
});

runTest('K5: Theoretical 7,700 kcal/kg pace vs adaptive timeline range, exact unrounded transparency & validation', () => {
  const calc = calculateSmartFitnessTargets({
    age: 31,
    biologicalSex: 'male',
    heightCm: 175,
    currentWeightKg: 82,
    targetWeightKg: 74,
    activityLevel: 'moderate',
    dailyAverageSteps: 8000,
    workoutFrequencyPerWeek: 4,
    fitnessGoal: 'lose_weight',
    goalSpeed: 'moderate',
    macroFocus: 'high_protein',
  });

  assert.equal(calc.bmiBasis, 'adult_who');
  assert.equal(calc.bmiPercentile, null);
  assert.ok(calc.bmiDisclaimer.toLowerCase().includes('does not directly measure body fat'));
  assert.ok(calc.theoreticalWeeklyRateKg < 0, 'Loss goal should have negative theoretical weekly rate');
  assert.ok(calc.theoreticalWeeksExact !== null && calc.theoreticalWeeksExact > 0);
  assert.ok(calc.estimatedWeeks !== null && calc.estimatedWeeksRange !== null);
  // Adaptive uncertainty window extends asymmetrically beyond static 7,700 kcal/kg reference
  assert.ok(
    calc.estimatedWeeksRange.min <= calc.estimatedWeeks &&
      calc.estimatedWeeksRange.max > calc.estimatedWeeks,
    `Adaptive range ${calc.estimatedWeeksRange.min}-${calc.estimatedWeeksRange.max} should bracket and extend beyond theoretical ${calc.estimatedWeeks} wks`
  );
  assert.ok(calc.timelineDisclaimer.toLowerCase().includes('not an exact prediction'));
  assert.ok(calc.timelineDisclaimer.toLowerCase().includes('metabolic adaptation'));

  // All 7 transparency breakdown entries populated and display exact unrounded internal figures
  const b = calc.calculationBreakdown;
  assert.ok(b.bmr.includes(calc.bmrExact.toFixed(2)), 'BMR breakdown should show exact unrounded value');
  assert.ok(b.activity.includes(calc.activityMultiplierExact.toFixed(4)), 'Activity breakdown should show exact unrounded multiplier');
  assert.ok(b.tdee.includes(calc.estimatedTdeeExact.toFixed(2)), 'TDEE breakdown should show exact unrounded value');
  assert.ok(b.calorieStrategy.includes(`${calc.actualCalorieDeltaPct.toFixed(2)}%`), 'Calorie strategy should show exact reconciled percentage');
  assert.ok(b.macros.includes(`${calc.recommendedCalories.toLocaleString()} kcal`));
  assert.ok(b.fibreAndHydration.includes(`${calc.recommendedWaterMl.toLocaleString()} ml`));
  assert.ok(
    b.timeline.toLowerCase().includes('theoretical') &&
      b.timeline.toLowerCase().includes('actual estimated timeline range')
  );

  // Zero / negative / NaN / out-of-range validation rejections
  assert.equal(validateCalculatorInput({ age: 0, heightCm: 170, currentWeightKg: 70, targetWeightKg: 65 }).valid, false);
  assert.equal(validateCalculatorInput({ age: 25, heightCm: -170, currentWeightKg: 70, targetWeightKg: 65 }).valid, false);
  assert.equal(validateCalculatorInput({ age: 25, heightCm: 170, currentWeightKg: 0, targetWeightKg: 65 }).valid, false);
  assert.equal(validateCalculatorInput({ age: 25, heightCm: 170, currentWeightKg: 70, targetWeightKg: -5 }).valid, false);
  assert.equal(validateCalculatorInput({ age: 25, heightCm: 170, currentWeightKg: 70, targetWeightKg: 65, dailyAverageSteps: -100 }).valid, false);
  assert.equal(validateCalculatorInput({ age: 25, heightCm: 170, currentWeightKg: 70, targetWeightKg: 65, workoutFrequencyPerWeek: -1 }).valid, false);
  assert.equal(validateCalculatorInput({ age: 25, heightCm: 170, currentWeightKg: 70, targetWeightKg: 65, avgWorkoutDurationMin: -10 }).valid, false);
  assert.equal(validateCalculatorInput({ age: 25, heightCm: 170, currentWeightKg: 70, targetWeightKg: 65, avgWorkoutDurationMin: 300 }).valid, false);
});

console.log(`\n=== Summary: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) {
  process.exit(1);
}
