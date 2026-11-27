import type {
  FoodItem,
  FoodLogEntry,
  MacroLogPersistedState,
  MealCategory,
  NutritionGoals,
  NutritionTargetHistoryRecord,
  SavedMealCombo,
  UserProfile,
  WeeklyAssessmentRecord,
  WeightEntry,
} from '../types/index.ts';
import { addDaysToDateKey, getTodayDateKey } from '../utils/dateUtils.ts';
import {
  CALCULATION_VERSION,
  calculateSmartFitnessTargets,
} from '../utils/fitnessCalculator.ts';
import { calculateScaledNutrition, round1, round2 } from '../utils/nutritionUtils.ts';
import { DEFAULT_FOODS } from './defaultFoods.ts';

export const DEMO_USER_ID = 'demo-user-01';

const DEMO_CUSTOM_FOODS: FoodItem[] = [
  {
    id: 'demo-custom-moong-chilla',
    userId: DEMO_USER_ID,
    name: 'Homemade Sprouted Moong Chilla',
    category: 'Homemade foods',
    servingName: '1 chilla (80 g)',
    servingWeightGrams: 80,
    calories: 142,
    protein: 8.6,
    carbs: 19.4,
    fat: 3.1,
    fibre: 4.2,
    isCustom: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'demo-custom-greek-yogurt-bowl',
    userId: DEMO_USER_ID,
    name: 'Greek Yogurt Berry Bowl',
    category: 'Homemade foods',
    servingName: '1 bowl (180 g)',
    servingWeightGrams: 180,
    calories: 185,
    protein: 16.5,
    carbs: 18.0,
    fat: 4.2,
    fibre: 3.0,
    isCustom: true,
    createdAt: new Date().toISOString(),
  },
];

// Deterministic integer hash so demo data is stable across reloads while looking natural
function seededHash(seed: number): number {
  let x = (seed ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

function seededUnit(seed: number): number {
  return (seededHash(seed) % 10000) / 10000;
}

function makeEntry(
  id: string,
  userId: string,
  date: string,
  mealType: MealCategory,
  food: FoodItem,
  quantityGrams: number
): FoodLogEntry {
  const scaled = calculateScaledNutrition(food, quantityGrams);
  const servingsCount =
    Math.round((quantityGrams / Math.max(1, food.servingWeightGrams)) * 100) / 100;
  const timestamp =
    mealType === 'breakfast'
      ? `${date}T08:30:00.000Z`
      : mealType === 'lunch'
      ? `${date}T13:15:00.000Z`
      : mealType === 'evening_snacks'
      ? `${date}T17:30:00.000Z`
      : `${date}T20:45:00.000Z`;
  return {
    id,
    userId,
    date,
    mealType,
    foodId: food.id,
    foodName: food.name,
    quantityGrams: Math.round(quantityGrams),
    servingsCount,
    servingName: food.servingName,
    ...scaled,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

interface MealItemTemplate {
  foodId: string;
  grams: number;
  scaleWithPhase?: boolean;
}

const BREAKFAST_MENUS: MealItemTemplate[][] = [
  [
    { foodId: 'food-oats', grams: 65, scaleWithPhase: true },
    { foodId: 'food-milk', grams: 250 },
    { foodId: 'food-banana', grams: 115 },
    { foodId: 'food-almonds', grams: 16 },
  ],
  [
    { foodId: 'food-idli', grams: 190, scaleWithPhase: true },
    { foodId: 'food-sambar', grams: 180 },
    { foodId: 'food-eggs', grams: 110 },
  ],
  [
    { foodId: 'food-poha', grams: 200, scaleWithPhase: true },
    { foodId: 'demo-custom-moong-chilla', grams: 160 },
    { foodId: 'food-curd', grams: 120 },
  ],
  [
    { foodId: 'food-whole-wheat-bread', grams: 90, scaleWithPhase: true },
    { foodId: 'food-eggs', grams: 150 },
    { foodId: 'food-peanut-butter', grams: 18 },
    { foodId: 'food-black-coffee', grams: 220 },
  ],
  [
    { foodId: 'food-upma', grams: 210, scaleWithPhase: true },
    { foodId: 'food-egg-whites', grams: 160 },
    { foodId: 'food-apple', grams: 150 },
  ],
  [
    { foodId: 'food-oats', grams: 60, scaleWithPhase: true },
    { foodId: 'food-whey-protein', grams: 32 },
    { foodId: 'food-milk', grams: 220 },
    { foodId: 'food-chia-seeds', grams: 12 },
  ],
];

const LUNCH_MENUS: MealItemTemplate[][] = [
  [
    { foodId: 'food-rice-cooked', grams: 230, scaleWithPhase: true },
    { foodId: 'food-chicken-breast', grams: 175 },
    { foodId: 'food-dal', grams: 160 },
    { foodId: 'food-broccoli', grams: 120 },
  ],
  [
    { foodId: 'food-roti', grams: 130, scaleWithPhase: true },
    { foodId: 'food-paneer', grams: 145 },
    { foodId: 'food-dal', grams: 150 },
    { foodId: 'food-curd', grams: 120 },
  ],
  [
    { foodId: 'food-rice-cooked', grams: 220, scaleWithPhase: true },
    { foodId: 'food-rajma', grams: 190 },
    { foodId: 'food-curd', grams: 140 },
    { foodId: 'food-spinach', grams: 100 },
  ],
  [
    { foodId: 'food-quinoa', grams: 200, scaleWithPhase: true },
    { foodId: 'food-chicken-breast', grams: 170 },
    { foodId: 'food-broccoli', grams: 130 },
    { foodId: 'food-almonds', grams: 12 },
  ],
  [
    { foodId: 'food-roti', grams: 125, scaleWithPhase: true },
    { foodId: 'food-chana', grams: 185 },
    { foodId: 'food-eggs', grams: 110 },
    { foodId: 'food-buttermilk', grams: 250 },
  ],
  [
    { foodId: 'food-rice-cooked', grams: 235, scaleWithPhase: true },
    { foodId: 'food-fish', grams: 175 },
    { foodId: 'food-sambar', grams: 170 },
    { foodId: 'food-spinach', grams: 110 },
  ],
];

const SNACK_MENUS: MealItemTemplate[][] = [
  [
    { foodId: 'food-whey-protein', grams: 32 },
    { foodId: 'food-apple', grams: 150 },
    { foodId: 'food-almonds', grams: 16 },
  ],
  [
    { foodId: 'demo-custom-greek-yogurt-bowl', grams: 190 },
    { foodId: 'food-banana', grams: 110 },
  ],
  [
    { foodId: 'food-whey-protein', grams: 32 },
    { foodId: 'food-peanut-butter', grams: 18 },
    { foodId: 'food-whole-wheat-bread', grams: 45, scaleWithPhase: true },
  ],
  [
    { foodId: 'food-greek-yoghurt', grams: 170 },
    { foodId: 'food-cashews', grams: 18 },
    { foodId: 'food-apple', grams: 140 },
  ],
];

const DINNER_MENUS: MealItemTemplate[][] = [
  [
    { foodId: 'food-roti', grams: 120, scaleWithPhase: true },
    { foodId: 'food-fish', grams: 165 },
    { foodId: 'food-potato', grams: 130, scaleWithPhase: true },
    { foodId: 'food-broccoli', grams: 120 },
  ],
  [
    { foodId: 'food-dosa', grams: 185, scaleWithPhase: true },
    { foodId: 'food-sambar', grams: 160 },
    { foodId: 'food-egg-whites', grams: 180 },
  ],
  [
    { foodId: 'food-rice-cooked', grams: 180, scaleWithPhase: true },
    { foodId: 'food-tofu', grams: 165 },
    { foodId: 'food-broccoli', grams: 140 },
    { foodId: 'food-dal', grams: 130 },
  ],
  [
    { foodId: 'food-roti', grams: 115, scaleWithPhase: true },
    { foodId: 'food-chicken-breast', grams: 165 },
    { foodId: 'food-spinach', grams: 130 },
  ],
  [
    { foodId: 'food-quinoa', grams: 175, scaleWithPhase: true },
    { foodId: 'food-salmon', grams: 150 },
    { foodId: 'food-broccoli', grams: 130 },
  ],
  [
    { foodId: 'food-ragi', grams: 65, scaleWithPhase: true },
    { foodId: 'food-paneer', grams: 135 },
    { foodId: 'food-curd', grams: 120 },
    { foodId: 'food-spinach', grams: 110 },
  ],
];

function computeDemoWeightKg(daysAgo: number): number {
  if (daysAgo === 0) return 64.45;
  if (daysAgo === 1) return 64.6;
  if (daysAgo === 364) return 73.8;

  // Days 364 -> 120: gradual fat loss from 73.8 kg down to 64.8 kg
  // Days 119 -> 0: lean recomposition stabilizing from 64.8 kg down to 64.45 kg
  let baseline: number;
  if (daysAgo >= 120) {
    const progress = (364 - daysAgo) / (364 - 120);
    // Slightly faster initial water/glycogen drop, then steady sustainable fat loss
    const curved = Math.pow(progress, 0.88);
    baseline = 73.8 - curved * (73.8 - 64.8);
  } else {
    const progress = (120 - daysAgo) / 120;
    baseline = 64.8 - progress * (64.8 - 64.45);
  }

  // Natural daily water/glycogen wave + deterministic jitter (±0.26 kg)
  const wave = Math.sin(daysAgo * 0.42) * 0.14 + Math.cos(daysAgo * 0.17) * 0.1;
  const jitter = (seededUnit(daysAgo * 31 + 17) - 0.5) * 0.24;
  return round2(Math.max(63.6, Math.min(74.4, baseline + wave + jitter)));
}

export interface DemoAuxiliaryData {
  waterLogs: Record<string, number>;
  waterGoalMl: number;
  activeBurnLogs: Record<string, number>;
  savedMeals: SavedMealCombo[];
  weeklyAssessments: WeeklyAssessmentRecord[];
  targetHistory: NutritionTargetHistoryRecord[];
}

export function createDemoState(
  actorId: string = DEMO_USER_ID,
  theme: 'light' | 'dark' | 'system' = 'dark'
): MacroLogPersistedState {
  const today = getTodayDateKey();
  const customFoods: FoodItem[] = DEMO_CUSTOM_FOODS.map((cf) => ({
    ...cf,
    userId: actorId,
  }));
  const allFoods = [...DEFAULT_FOODS, ...customFoods];
  const byId = new Map(allFoods.map((f) => [f.id, f]));

  const foodEntries: FoodLogEntry[] = [];
  let seq = 1;
  const push = (date: string, meal: MealCategory, foodId: string, grams: number) => {
    const food = byId.get(foodId);
    if (!food || grams <= 0) return;
    foodEntries.push(makeEntry(`demo-entry-${seq++}`, actorId, date, meal, food, grams));
  };

  // Today's realistic intake (~1,640 kcal so guest can log dinner or snacks immediately)
  push(today, 'breakfast', 'food-oats', 60);
  push(today, 'breakfast', 'food-milk', 250);
  push(today, 'breakfast', 'food-banana', 110);
  push(today, 'breakfast', 'food-almonds', 15);

  push(today, 'lunch', 'food-rice-cooked', 210);
  push(today, 'lunch', 'food-chicken-breast', 165);
  push(today, 'lunch', 'food-dal', 150);
  push(today, 'lunch', 'food-broccoli', 120);

  push(today, 'evening_snacks', 'food-whey-protein', 32);
  push(today, 'evening_snacks', 'food-apple', 150);

  // Past 364 days (full 1-year history: daysAgo = 1..364)
  // Keep days 1..21 100% logged so active streak is 22 days; sprinkle ~18 rest/unlogged days earlier in the year (~95% annual consistency)
  for (let offset = 1; offset <= 364; offset++) {
    if (offset > 21 && (offset * 7 + 3) % 19 === 0) continue;

    const d = addDaysToDateKey(today, -offset);
    const isCutPhase = offset >= 120;
    const isWeekend = offset % 7 === 5 || offset % 7 === 6;
    const dayNoise = (seededUnit(offset * 97 + 13) - 0.5) * 0.14; // ±7% natural appetite variance
    const phaseCarbMultiplier =
      (isCutPhase ? 0.87 : 1.03) + (isWeekend ? 0.08 : 0) + dayNoise;

    const breakfastMenu =
      BREAKFAST_MENUS[(offset + seededHash(offset * 3)) % BREAKFAST_MENUS.length];
    const lunchMenu =
      LUNCH_MENUS[(offset + seededHash(offset * 5 + 1)) % LUNCH_MENUS.length];
    const snackMenu =
      SNACK_MENUS[(offset + seededHash(offset * 11 + 2)) % SNACK_MENUS.length];
    const dinnerMenu =
      DINNER_MENUS[(offset + seededHash(offset * 13 + 3)) % DINNER_MENUS.length];

    for (const item of breakfastMenu) {
      const mult = item.scaleWithPhase ? phaseCarbMultiplier : 1 + dayNoise * 0.4;
      push(d, 'breakfast', item.foodId, item.grams * mult);
    }
    for (const item of lunchMenu) {
      const mult = item.scaleWithPhase ? phaseCarbMultiplier : 1 + dayNoise * 0.4;
      push(d, 'lunch', item.foodId, item.grams * mult);
    }
    // Skip snacks occasionally (~15% of days) for natural meal variance
    if (seededHash(offset * 19) % 7 !== 0) {
      for (const item of snackMenu) {
        const mult = item.scaleWithPhase ? phaseCarbMultiplier : 1;
        push(d, 'evening_snacks', item.foodId, item.grams * mult);
      }
    }
    for (const item of dinnerMenu) {
      const mult = item.scaleWithPhase ? phaseCarbMultiplier : 1 + dayNoise * 0.4;
      push(d, 'dinner', item.foodId, item.grams * mult);
    }
  }

  // Weight entries across all 365 days: daily for recent 14 days, ~5x/week for days 15..364
  const WEIGHT_NOTES = [
    'Morning fasted',
    'Morning',
    'Post workout',
    'Morning fasted',
    'Weekly check-in',
    'After higher carb dinner',
  ];
  const weightEntries: WeightEntry[] = [];
  let weightSeq = 1;
  for (let offset = 0; offset <= 364; offset++) {
    const shouldLog =
      offset <= 14 ||
      offset === 364 ||
      offset === 120 ||
      offset % 7 === 0 ||
      offset % 7 === 2 ||
      offset % 7 === 4 ||
      offset % 7 === 5 ||
      (offset % 7 === 1 && seededHash(offset * 41) % 3 === 0);

    if (!shouldLog) continue;

    const date = addDaysToDateKey(today, -offset);
    const weightKg = computeDemoWeightKg(offset);
    const note =
      offset === 364
        ? 'Day 1 baseline'
        : offset === 120
        ? 'Started recomposition phase'
        : offset === 0
        ? 'Morning fasted'
        : WEIGHT_NOTES[seededHash(offset * 29) % WEIGHT_NOTES.length];

    weightEntries.push({
      id: `demo-weight-${weightSeq++}`,
      userId: actorId,
      weightKg,
      date,
      notes: note,
      createdAt: `${date}T07:15:00.000Z`,
      updatedAt: `${date}T07:15:00.000Z`,
    });
  }

  const lastAnchorDate = addDaysToDateKey(today, -9);
  const startDate = addDaysToDateKey(today, -364);

  const calc = calculateSmartFitnessTargets({
    age: 27,
    biologicalSex: 'male',
    heightCm: 175,
    currentWeightKg: 64.45,
    targetWeightKg: 64.0,
    dailyAverageSteps: 8800,
    activityLevel: 'moderate',
    workoutFrequencyPerWeek: 4,
    workoutIntensity: 'moderate',
    fitnessGoal: 'recomposition',
    goalSpeed: 'moderate',
    macroFocus: 'high_protein',
    adaptiveTdeeKcal: 2560,
    useAdaptiveTdee: true,
  });

  const aux = createDemoAuxiliaryData(actorId, calc.recommendedWaterMl, {
    calories: calc.recommendedCalories,
    protein: calc.proteinGrams,
    carbs: calc.carbsGrams,
    fat: calc.fatGrams,
    fibre: calc.fibreGrams,
    estimatedBmr: calc.bmr,
    estimatedTdee: calc.estimatedTdeeKcal,
  });

  const profile: UserProfile = {
    id: actorId,
    name: 'Aarav Mehta',
    email: 'aarav@calothrix.demo',
    age: 27,
    biologicalSex: 'male',
    heightCm: 175,
    currentWeightKg: 64.45,
    targetWeightKg: 64.0,
    dailyAverageSteps: 8800,
    activityLevel: 'moderate',
    workoutFrequencyPerWeek: 4,
    workoutIntensity: 'moderate',
    fitnessGoal: 'recomposition',
    goalSpeed: 'moderate',
    macroFocus: 'high_protein',
    adaptiveTdeeKcal: 2560,
    lastWeeklyAssessmentAt: `${lastAnchorDate}T08:00:00.000Z`,
    adaptivePaused: false,
    manualOverrideActive: false,
    cycleAnchorDate: lastAnchorDate,
    onboardingCompleted: true,
    dietaryPreference: 'omnivore',
    foodRestrictions: [],
    accountRole: 'individual',
    roleSelected: true,
    isDemoProfile: true,
  };

  const goals: NutritionGoals = {
    userId: actorId,
    preset: 'recomposition',
    calories: calc.recommendedCalories,
    protein: calc.proteinGrams,
    carbs: calc.carbsGrams,
    fat: calc.fatGrams,
    fibre: calc.fibreGrams,
    targetWeightKg: 64.0,
    estimatedBmr: calc.bmr,
    estimatedTdee: calc.estimatedTdeeKcal,
    adaptiveTdeeKcal: 2560,
    macroFocus: 'high_protein',
    assessmentWeekNumber: aux.weeklyAssessments[0]?.assessmentWeekNumber ?? 12,
    initialCalculatedAt: `${startDate}T08:00:00.000Z`,
    calculationVersion: CALCULATION_VERSION,
    bmi: calc.bmi,
    goalSpeed: 'moderate',
    estimatedWeeks: calc.estimatedWeeks,
    manualOverrideActive: false,
    updatedAt: `${lastAnchorDate}T08:00:00.000Z`,
  };

  return {
    version: 1,
    isDemoData: true,
    profile,
    settings: {
      theme,
      weightUnit: 'kg',
      foodUnit: 'g',
    },
    goals,
    weightGoal: {
      userId: actorId,
      startingWeightKg: 73.8,
      targetWeightKg: 64.0,
      goalDirection: 'loss',
      updatedAt: `${startDate}T08:00:00.000Z`,
    },
    customFoods,
    favoriteFoodIds: [
      'food-oats',
      'food-chicken-breast',
      'food-whey-protein',
      'food-paneer',
      'food-banana',
      'food-roti',
      'food-eggs',
      'food-dal',
    ],
    recentFoodIds: [
      'food-whey-protein',
      'food-apple',
      'food-chicken-breast',
      'food-rice-cooked',
      'food-oats',
      'food-banana',
      'food-broccoli',
      'food-dal',
    ],
    foodEntries,
    weightEntries,
    weeklyAssessments: aux.weeklyAssessments,
    targetHistory: aux.targetHistory,
  };
}

export function createDemoAuxiliaryData(
  actorId: string = DEMO_USER_ID,
  waterGoalMl: number = 2750,
  currentTargets?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fibre: number;
    estimatedBmr: number;
    estimatedTdee: number;
  }
): DemoAuxiliaryData {
  const today = getTodayDateKey();
  const activeCalories = currentTargets?.calories ?? 2510;
  const activeProtein = currentTargets?.protein ?? 145;
  const activeCarbs = currentTargets?.carbs ?? 316;
  const activeFat = currentTargets?.fat ?? 74;
  const activeFibre = currentTargets?.fibre ?? 35;
  const estimatedBmr = currentTargets?.estimatedBmr ?? 1621;
  const estimatedTdee = currentTargets?.estimatedTdee ?? 2514;

  // 1. 365 days of hydration logs (today partially filled at 2000 ml so user can add water)
  const waterLogs: Record<string, number> = {
    [today]: 2000,
  };
  const activeBurnLogs: Record<string, number> = {};

  for (let offset = 1; offset <= 364; offset++) {
    const d = addDaysToDateKey(today, -offset);
    if (offset <= 21 || (offset * 7 + 3) % 19 !== 0) {
      const waterSteps = [2250, 2500, 2750, 3000, 3250];
      waterLogs[d] = waterSteps[seededHash(offset * 53) % waterSteps.length];
    }
    // ~4 workout sessions per week
    if (offset % 7 === 0 || offset % 7 === 2 || offset % 7 === 4 || offset % 7 === 5) {
      activeBurnLogs[d] = 320 + (seededHash(offset * 67) % 210);
    }
  }
  activeBurnLogs[today] = 390;

  // 2. Saved Meal Combos for 1-tap logging
  const allFoods = [...DEFAULT_FOODS, ...DEMO_CUSTOM_FOODS];
  const byId = new Map(allFoods.map((f) => [f.id, f]));
  const buildCombo = (
    id: string,
    name: string,
    mealType: MealCategory,
    itemsSpec: { foodId: string; grams: number; unitLabel?: string }[]
  ): SavedMealCombo => {
    const items = itemsSpec
      .map((spec) => {
        const food = byId.get(spec.foodId);
        if (!food) return null;
        const scaled = calculateScaledNutrition(food, spec.grams);
        return {
          foodId: food.id,
          foodName: food.name,
          quantityGrams: spec.grams,
          unitLabel: spec.unitLabel || `${spec.grams} g`,
          ...scaled,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    return {
      id,
      name,
      mealType,
      items,
      totalCalories: Math.round(items.reduce((s, i) => s + i.calories, 0)),
      totalProtein: round1(items.reduce((s, i) => s + i.protein, 0)),
      totalCarbs: round1(items.reduce((s, i) => s + i.carbs, 0)),
      totalFat: round1(items.reduce((s, i) => s + i.fat, 0)),
      totalFibre: round1(items.reduce((s, i) => s + i.fibre, 0)),
      createdAt: `${addDaysToDateKey(today, -30)}T09:00:00.000Z`,
    };
  };

  const savedMeals: SavedMealCombo[] = [
    buildCombo('demo-combo-1', 'High-Protein Oats Bowl', 'breakfast', [
      { foodId: 'food-oats', grams: 60 },
      { foodId: 'food-milk', grams: 250 },
      { foodId: 'food-banana', grams: 110 },
      { foodId: 'food-almonds', grams: 15 },
    ]),
    buildCombo('demo-combo-2', 'Chicken Rice & Dal Bowl', 'lunch', [
      { foodId: 'food-rice-cooked', grams: 220 },
      { foodId: 'food-chicken-breast', grams: 170 },
      { foodId: 'food-dal', grams: 150 },
      { foodId: 'food-broccoli', grams: 120 },
    ]),
    buildCombo('demo-combo-3', 'Post-Workout Whey & Apple', 'evening_snacks', [
      { foodId: 'food-whey-protein', grams: 32 },
      { foodId: 'food-apple', grams: 150 },
    ]),
    buildCombo('demo-combo-4', 'Paneer Roti Dinner', 'dinner', [
      { foodId: 'food-roti', grams: 120 },
      { foodId: 'food-paneer', grams: 140 },
      { foodId: 'food-curd', grams: 120 },
    ]),
  ];

  // 3. Target History across the 1-year timeline (newest first)
  const targetHistory: NutritionTargetHistoryRecord[] = [
    {
      id: 'demo-th-6',
      userId: actorId,
      previousCalories: 2460,
      previousProtein: 144,
      previousCarbs: 306,
      previousFat: 73,
      previousFibre: 34,
      newCalories: activeCalories,
      newProtein: activeProtein,
      newCarbs: activeCarbs,
      newFat: activeFat,
      newFibre: activeFibre,
      targetWeightKg: 64.0,
      effectiveDate: addDaysToDateKey(today, -9),
      adjustmentReason:
        '14-day adaptive calibration (+50 kcal): weight stabilized at 64.5 kg with 94% adherence while maintaining training volume.',
      assessmentId: 'demo-wa-12',
      applied: true,
      adjustmentType: 'adaptive',
      createdAt: `${addDaysToDateKey(today, -9)}T08:00:00.000Z`,
    },
    {
      id: 'demo-th-5',
      userId: actorId,
      previousCalories: 2380,
      previousProtein: 142,
      previousCarbs: 292,
      previousFat: 71,
      previousFibre: 33,
      newCalories: 2460,
      newProtein: 144,
      newCarbs: 306,
      newFat: 73,
      newFibre: 34,
      targetWeightKg: 64.0,
      effectiveDate: addDaysToDateKey(today, -65),
      adjustmentReason:
        '14-day adaptive update (+80 kcal): real-world TDEE trended higher during lean recomposition.',
      assessmentId: 'demo-wa-8',
      applied: true,
      adjustmentType: 'adaptive',
      createdAt: `${addDaysToDateKey(today, -65)}T08:00:00.000Z`,
    },
    {
      id: 'demo-th-4',
      userId: actorId,
      previousCalories: 2080,
      previousProtein: 146,
      previousCarbs: 218,
      previousFat: 66,
      previousFibre: 29,
      newCalories: 2380,
      newProtein: 142,
      newCarbs: 292,
      newFat: 71,
      newFibre: 33,
      targetWeightKg: 64.0,
      effectiveDate: addDaysToDateKey(today, -120),
      adjustmentReason:
        'Goal transitioned from Fat Loss (73.8 → 64.8 kg) to Body Recomposition near maintenance.',
      assessmentId: null,
      applied: true,
      adjustmentType: 'initial',
      createdAt: `${addDaysToDateKey(today, -120)}T08:00:00.000Z`,
    },
    {
      id: 'demo-th-3',
      userId: actorId,
      previousCalories: 2140,
      previousProtein: 148,
      previousCarbs: 228,
      previousFat: 68,
      previousFibre: 30,
      newCalories: 2080,
      newProtein: 146,
      newCarbs: 218,
      newFat: 66,
      newFibre: 29,
      targetWeightKg: 64.5,
      effectiveDate: addDaysToDateKey(today, -196),
      adjustmentReason:
        '14-day fat-loss calibration (-60 kcal) as body weight dropped below 68 kg.',
      assessmentId: null,
      applied: true,
      adjustmentType: 'adaptive',
      createdAt: `${addDaysToDateKey(today, -196)}T08:00:00.000Z`,
    },
    {
      id: 'demo-th-2',
      userId: actorId,
      previousCalories: 2220,
      previousProtein: 148,
      previousCarbs: 245,
      previousFat: 70,
      previousFibre: 31,
      newCalories: 2140,
      newProtein: 148,
      newCarbs: 228,
      newFat: 68,
      newFibre: 30,
      targetWeightKg: 64.5,
      effectiveDate: addDaysToDateKey(today, -280),
      adjustmentReason:
        '14-day fat-loss review (-80 kcal): keeping weekly reduction steady at ~0.3 kg/week.',
      assessmentId: null,
      applied: true,
      adjustmentType: 'adaptive',
      createdAt: `${addDaysToDateKey(today, -280)}T08:00:00.000Z`,
    },
    {
      id: 'demo-th-1',
      userId: actorId,
      previousCalories: null,
      previousProtein: null,
      previousCarbs: null,
      previousFat: null,
      previousFibre: null,
      newCalories: 2220,
      newProtein: 148,
      newCarbs: 245,
      newFat: 70,
      newFibre: 31,
      targetWeightKg: 64.5,
      effectiveDate: addDaysToDateKey(today, -364),
      adjustmentReason:
        'Initial personalized fat-loss nutrition targets calculated from baseline measurements (73.8 kg).',
      assessmentId: null,
      applied: true,
      adjustmentType: 'initial',
      createdAt: `${addDaysToDateKey(today, -364)}T08:00:00.000Z`,
    },
  ];

  // 4. 12 Historical 14-day Applied Assessments ending 9 days ago (newest first)
  const weeklyAssessments: WeeklyAssessmentRecord[] = [];
  for (let i = 0; i < 12; i++) {
    const cycleNumber = 12 - i;
    const endOffset = 9 + i * 14;
    const startOffset = endOffset + 13;
    const weekEndDate = addDaysToDateKey(today, -endOffset);
    const weekStartDate = addDaysToDateKey(today, -startOffset);
    const prevWeight = computeDemoWeightKg(startOffset);
    const currWeight = computeDemoWeightKg(endOffset);
    const weeklyDelta = round2((currWeight - prevWeight) / 2);
    const isInCut = endOffset >= 120;
    const prevCal = isInCut ? 2140 : i === 0 ? 2460 : i <= 4 ? activeCalories : 2380;
    const recCal = isInCut ? 2080 : i === 0 ? activeCalories : i <= 4 ? activeCalories : 2460;
    const calDelta = recCal - prevCal;

    weeklyAssessments.push({
      id: `demo-wa-${cycleNumber}`,
      userId: actorId,
      weekStartDate,
      weekEndDate,
      assessmentWeekNumber: cycleNumber,
      cycleDays: 14,
      previousWeightKg: prevWeight,
      assessedWeightKg: currWeight,
      previousTrendWeightKg: prevWeight,
      assessedTrendWeightKg: currWeight,
      current7dAvgWeightKg: currWeight,
      previous7dAvgWeightKg: prevWeight,
      weeklyWeightChangeKg: weeklyDelta,
      weeklyWeightChangePct: round2((weeklyDelta / Math.max(40, prevWeight)) * 100),
      avgDailyCalories: Math.round(recCal - 35 + (seededHash(cycleNumber * 17) % 70)),
      avgDailyProtein: Math.round(activeProtein - 4 + (seededHash(cycleNumber * 23) % 12)),
      avgDailyCarbs: activeCarbs,
      avgDailyFat: activeFat,
      avgDailyFibre: activeFibre,
      priorTdeeKcal: estimatedTdee,
      estimatedTdeeKcal: estimatedTdee,
      calibratedTdeeKcal: isInCut ? 2480 : 2560,
      previousRecommendedCalories: prevCal,
      recommendedCalories: recCal,
      previousRecommendedProtein: activeProtein,
      previousRecommendedCarbs: activeCarbs,
      previousRecommendedFat: activeFat,
      previousRecommendedFibre: activeFibre,
      recommendedProtein: activeProtein,
      recommendedCarbs: activeCarbs,
      recommendedFat: activeFat,
      recommendedFibre: activeFibre,
      recommendedHydrationMl: waterGoalMl,
      estimatedBmr,
      projectedWeeksToGoal: 4,
      foodLoggedDays: 13 + (cycleNumber % 2),
      weightLoggedDays: 10 + (cycleNumber % 4),
      loggingCompletenessPct: 93,
      adherencePercentage: 91 + (cycleNumber % 6),
      confidenceLevel: 'high',
      adjustmentType: calDelta > 0 ? 'increased' : calDelta < 0 ? 'decreased' : 'maintained',
      statusTag: calDelta !== 0 ? 'targets_updated' : 'on_track',
      calorieDeltaKcal: calDelta,
      adjustmentReason:
        calDelta > 0
          ? `Real-world expenditure tracked slightly higher (+${calDelta} kcal) while weight stayed locked near ${currWeight.toFixed(1)} kg.`
          : calDelta < 0
          ? `Tightened daily target by ${calDelta} kcal to preserve steady fat-loss pace.`
          : 'Weight trend and intake adherence remained tightly aligned with your goal.',
      goalCompleted: false,
      suggestedMaintenanceCalories: null,
      aiSummary: {
        headline:
          calDelta !== 0
            ? `Cycle #${cycleNumber}: Calibrated to ${recCal.toLocaleString()} kcal/day`
            : `Cycle #${cycleNumber}: On Track at ${recCal.toLocaleString()} kcal/day`,
        bodyChangeAnalysis: `Your 7-day rolling weight moved from ${prevWeight.toFixed(1)} kg to ${currWeight.toFixed(1)} kg across this 14-day window.`,
        calorieAdjustmentReason:
          calDelta !== 0
            ? `A conservative ${calDelta > 0 ? '+' : ''}${calDelta} kcal adjustment keeps performance and recovery dialed in.`
            : 'No calorie change needed — your current targets match real-world expenditure.',
        actionableTips: [
          `Maintain ~${activeProtein} g protein daily across 4 meals.`,
          'Keep morning fasted weigh-ins consistent 4–6 days per week.',
        ],
        confidenceExplanation: 'High confidence based on 13+ logged food days and regular weigh-ins.',
        provider: 'deterministic',
      },
      rationaleBullets: [
        `Logged ${13 + (cycleNumber % 2)}/14 food days with >90% adherence.`,
        `Trend weight moved ${prevWeight.toFixed(1)} kg → ${currWeight.toFixed(1)} kg.`,
      ],
      calculationVersion: CALCULATION_VERSION,
      status: 'applied',
      appliedAt: `${weekEndDate}T08:00:00.000Z`,
      createdAt: `${weekEndDate}T08:00:00.000Z`,
    });
  }

  return {
    waterLogs,
    waterGoalMl,
    activeBurnLogs,
    savedMeals,
    weeklyAssessments,
    targetHistory,
  };
}

export function seedDemoAuxiliaryCaches(
  actorId: string,
  demoState: MacroLogPersistedState
): void {
  if (typeof window === 'undefined') return;
  const aux = createDemoAuxiliaryData(actorId, 2750, {
    calories: demoState.goals.calories,
    protein: demoState.goals.protein,
    carbs: demoState.goals.carbs,
    fat: demoState.goals.fat,
    fibre: demoState.goals.fibre,
    estimatedBmr: demoState.goals.estimatedBmr || 1621,
    estimatedTdee: demoState.goals.estimatedTdee || 2514,
  });

  try {
    localStorage.setItem(
      `calothrix_water_${actorId}`,
      JSON.stringify({ logs: aux.waterLogs, goalMl: aux.waterGoalMl })
    );
    localStorage.setItem(`calothrix_burn_${actorId}`, JSON.stringify(aux.activeBurnLogs));
    localStorage.setItem(`calothrix_saved_meals_${actorId}`, JSON.stringify(aux.savedMeals));
    localStorage.setItem(
      `calothrix_weekly_assessments_${actorId}`,
      JSON.stringify(demoState.weeklyAssessments || aux.weeklyAssessments)
    );
    localStorage.setItem(
      `calothrix_target_history_${actorId}`,
      JSON.stringify(demoState.targetHistory || aux.targetHistory)
    );
  } catch {
    // Ignore localStorage quota errors
  }
}

export function createEmptyState(
  currentTheme: 'light' | 'dark' | 'system' = 'dark'
): MacroLogPersistedState {
  return {
    version: 1,
    isDemoData: false,
    profile: {
      id: '',
      name: '',
      age: 0,
      biologicalSex: 'male',
      heightCm: 0,
      currentWeightKg: 0,
      targetWeightKg: 0,
      dailyAverageSteps: 7000,
      activityLevel: 'moderate',
      workoutFrequencyPerWeek: 3,
      workoutIntensity: 'moderate',
      fitnessGoal: 'maintenance',
      goalSpeed: 'moderate',
      adaptivePaused: false,
      manualOverrideActive: false,
      cycleAnchorDate: null,
      onboardingCompleted: false,
      dietaryPreference: 'omnivore',
      foodRestrictions: [],
      accountRole: 'individual',
      roleSelected: false,
      isDemoProfile: false,
    },
    settings: {
      theme: currentTheme,
      weightUnit: 'kg',
      foodUnit: 'g',
    },
    goals: {
      userId: '',
      preset: 'custom',
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fibre: 0,
      targetWeightKg: undefined,
      manualOverrideActive: false,
      updatedAt: new Date().toISOString(),
    },
    weightGoal: {
      userId: '',
      startingWeightKg: 0,
      targetWeightKg: 0,
      goalDirection: 'maintain',
      updatedAt: new Date().toISOString(),
    },
    customFoods: [],
    favoriteFoodIds: [],
    recentFoodIds: [],
    foodEntries: [],
    weightEntries: [],
  };
}
