import {
  FoodItem,
  FoodLogEntry,
  MacroLogPersistedState,
  MealCategory,
  WeightEntry,
} from '../types';
import { addDaysToDateKey, getTodayDateKey } from '../utils/dateUtils';
import { calculateScaledNutrition } from '../utils/nutritionUtils';
import { DEFAULT_FOODS } from './defaultFoods';

export const DEMO_USER_ID = 'demo-user-01';

const DEMO_CUSTOM_FOODS: FoodItem[] = [
  {
    id: 'custom-protein-oats-bowl',
    userId: DEMO_USER_ID,
    name: 'Homemade Sprouted Moong Chilla',
    category: 'Custom',
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
    id: 'custom-greek-yogurt-bowl',
    userId: DEMO_USER_ID,
    name: 'Greek Yogurt Berry Bowl',
    category: 'Custom',
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

function makeEntry(
  id: string,
  date: string,
  mealType: MealCategory,
  food: FoodItem,
  quantityGrams: number
): FoodLogEntry {
  const scaled = calculateScaledNutrition(food, quantityGrams);
  const servingsCount =
    Math.round((quantityGrams / Math.max(1, food.servingWeightGrams)) * 100) / 100;
  return {
    id,
    userId: DEMO_USER_ID,
    date,
    mealType,
    foodId: food.id,
    foodName: food.name,
    quantityGrams,
    servingsCount,
    servingName: food.servingName,
    ...scaled,
    createdAt: `${date}T09:00:00.000Z`,
    updatedAt: `${date}T09:00:00.000Z`,
  };
}

export function createDemoState(): MacroLogPersistedState {
  const today = getTodayDateKey();
  const allFoods = [...DEFAULT_FOODS, ...DEMO_CUSTOM_FOODS];
  const byId = new Map(allFoods.map((f) => [f.id, f]));
  const f = (id: string) => byId.get(id)!;

  const foodEntries: FoodLogEntry[] = [];
  let seq = 1;
  const push = (date: string, meal: MealCategory, foodId: string, grams: number) => {
    foodEntries.push(makeEntry(`demo-entry-${seq++}`, date, meal, f(foodId), grams));
  };

  // Today's realistic intake (~1,640 kcal so user has room to log dinner or snacks immediately)
  push(today, 'breakfast', 'food-oats', 60);
  push(today, 'breakfast', 'food-milk', 250);
  push(today, 'breakfast', 'food-banana', 110);
  push(today, 'breakfast', 'food-almonds', 15);

  push(today, 'lunch', 'food-rice-cooked', 200);
  push(today, 'lunch', 'food-chicken-breast', 160);
  push(today, 'lunch', 'food-dal', 150);
  push(today, 'lunch', 'food-broccoli', 120);

  push(today, 'evening_snacks', 'food-whey-protein', 32);
  push(today, 'evening_snacks', 'food-apple', 150);

  // Past 25 days of realistic varied entries for Weekly & Monthly analytics
  for (let offset = 1; offset <= 25; offset++) {
    // Leave day offset 9 and 19 empty to make consistency score realistic
    if (offset === 9 || offset === 19) continue;
    const d = addDaysToDateKey(today, -offset);

    if (offset % 3 === 0) {
      push(d, 'breakfast', 'food-idli', 180);
      push(d, 'breakfast', 'food-eggs', 100);
      push(d, 'breakfast', 'food-milk', 200);
    } else if (offset % 3 === 1) {
      push(d, 'breakfast', 'food-oats', 70);
      push(d, 'breakfast', 'food-milk', 250);
      push(d, 'breakfast', 'food-banana', 120);
      push(d, 'breakfast', 'food-peanut-butter', 20);
    } else {
      push(d, 'breakfast', 'food-poha', 180);
      push(d, 'breakfast', 'custom-protein-oats-bowl', 160);
      push(d, 'breakfast', 'food-curd', 100);
    }

    if (offset % 2 === 0) {
      push(d, 'lunch', 'food-rice-cooked', 220);
      push(d, 'lunch', 'food-chicken-breast', 180);
      push(d, 'lunch', 'food-dal', 150);
      push(d, 'lunch', 'food-broccoli', 100);
    } else {
      push(d, 'lunch', 'food-roti', 120);
      push(d, 'lunch', 'food-paneer', 140);
      push(d, 'lunch', 'food-dal', 150);
      push(d, 'lunch', 'food-curd', 120);
    }

    push(d, 'evening_snacks', 'food-whey-protein', 32);
    if (offset % 2 === 0) {
      push(d, 'evening_snacks', 'food-almonds', 20);
      push(d, 'evening_snacks', 'food-apple', 140);
    } else {
      push(d, 'evening_snacks', 'custom-greek-yogurt-bowl', 180);
    }

    if (offset % 2 === 0) {
      push(d, 'dinner', 'food-roti', 120);
      push(d, 'dinner', 'food-fish', 160);
      push(d, 'dinner', 'food-potato', 120);
    } else {
      push(d, 'dinner', 'food-dosa', 180);
      push(d, 'dinner', 'food-egg-whites', 180);
      push(d, 'dinner', 'food-broccoli', 140);
    }
  }

  // Weight entries: 40-day realistic curve starting at 65.0 kg -> 62.95 kg (matching prompt example)
  const weightTimeline: { daysAgo: number; weightKg: number; notes?: string }[] = [
    { daysAgo: 42, weightKg: 65.0, notes: 'Starting baseline' },
    { daysAgo: 38, weightKg: 64.75, notes: 'Morning fasted' },
    { daysAgo: 35, weightKg: 64.6, notes: 'Morning' },
    { daysAgo: 31, weightKg: 64.35, notes: 'Morning' },
    { daysAgo: 28, weightKg: 64.15, notes: 'Morning fasted' },
    { daysAgo: 24, weightKg: 63.95, notes: 'Post cardio' },
    { daysAgo: 21, weightKg: 63.8, notes: 'Morning' },
    { daysAgo: 17, weightKg: 63.65, notes: 'Morning' },
    { daysAgo: 14, weightKg: 63.45, notes: 'Morning fasted' },
    { daysAgo: 10, weightKg: 63.3, notes: 'Morning' },
    { daysAgo: 6, weightKg: 63.25, notes: 'Morning' },
    { daysAgo: 4, weightKg: 63.1, notes: 'Morning' },
    { daysAgo: 2, weightKg: 63.05, notes: 'Morning' },
    { daysAgo: 1, weightKg: 63.15, notes: 'Higher carb dinner night before' },
    { daysAgo: 0, weightKg: 62.95, notes: 'Morning fasted' },
  ];

  const weightEntries: WeightEntry[] = weightTimeline.map((item, idx) => {
    const date = addDaysToDateKey(today, -item.daysAgo);
    return {
      id: `demo-weight-${idx + 1}`,
      userId: DEMO_USER_ID,
      weightKg: item.weightKg,
      date,
      notes: item.notes,
      createdAt: `${date}T07:15:00.000Z`,
      updatedAt: `${date}T07:15:00.000Z`,
    };
  });

  return {
    version: 1,
    isDemoData: true,
    profile: {
      id: DEMO_USER_ID,
      name: 'Aarav Mehta',
      email: 'aarav@calothrix.demo',
      avatarUrl: '/src/assets/images/avatar_athlete_1794833138441.jpg',
      age: 27,
      biologicalSex: 'male',
      heightCm: 175,
      currentWeightKg: 62.95,
      targetWeightKg: 64.0,
      dailyAverageSteps: 8500,
      activityLevel: 'moderate',
      workoutFrequencyPerWeek: 4,
      workoutIntensity: 'moderate',
      fitnessGoal: 'recomposition',
      goalSpeed: 'moderate',
      dietaryPreference: 'omnivore',
      foodRestrictions: [],
      accountRole: 'individual',
      roleSelected: true,
      isDemoProfile: true,
    },
    settings: {
      theme: 'dark',
      weightUnit: 'kg',
      foodUnit: 'g',
    },
    goals: {
      userId: DEMO_USER_ID,
      preset: 'maintenance',
      calories: 2500,
      protein: 140,
      carbs: 320,
      fat: 70,
      fibre: 30,
      targetWeightKg: 64.0,
      updatedAt: new Date().toISOString(),
    },
    weightGoal: {
      userId: DEMO_USER_ID,
      startingWeightKg: 65.0,
      targetWeightKg: 64.0,
      goalDirection: 'loss',
      updatedAt: new Date().toISOString(),
    },
    customFoods: DEMO_CUSTOM_FOODS,
    favoriteFoodIds: [
      'food-oats',
      'food-chicken-breast',
      'food-whey-protein',
      'food-paneer',
      'food-banana',
      'food-roti',
    ],
    recentFoodIds: [
      'food-whey-protein',
      'food-apple',
      'food-chicken-breast',
      'food-rice-cooked',
      'food-oats',
      'food-banana',
    ],
    foodEntries,
    weightEntries,
  };
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
