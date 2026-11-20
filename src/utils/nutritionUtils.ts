import {
  FoodItem,
  FoodLogEntry,
  MacroNutrients,
  MealCategory,
  MEAL_CATEGORIES,
  NutritionGoals,
  WeightEntry,
} from '../types';
import { getMondayToSundayWeek, parseLocalDateKey } from './dateUtils';
import { searchFoodsIntelligent } from './foodSearchEngine';

export function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

export function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

export function roundCal(val: number): number {
  return Math.round(val);
}

export function calculateScaledNutrition(
  food: MacroNutrients & { servingWeightGrams: number; missingFields?: FoodItem['missingFields'] },
  quantityGrams: number
): MacroNutrients {
  const baseWeight = food.servingWeightGrams > 0 ? food.servingWeightGrams : 100;
  const factor = Math.max(0, quantityGrams) / baseWeight;
  const missing = food.missingFields || [];
  return {
    calories: missing.includes('calories') ? 0 : roundCal(food.calories * factor),
    protein: missing.includes('protein') ? 0 : round1(food.protein * factor),
    carbs: missing.includes('carbs') ? 0 : round1(food.carbs * factor),
    fat: missing.includes('fat') ? 0 : round1(food.fat * factor),
    fibre: missing.includes('fibre') ? 0 : round1(food.fibre * factor),
  };
}

export function calculateScaledNutritionDetailed(
  food: FoodItem,
  quantityGrams: number
): MacroNutrients & {
  insolubleFibreG: number | null;
  solubleFibreG: number | null;
  missingFields: NonNullable<FoodItem['missingFields']>;
} {
  const baseWeight = food.servingWeightGrams > 0 ? food.servingWeightGrams : 100;
  const factor = Math.max(0, quantityGrams) / baseWeight;
  const missing = food.missingFields || [];
  return {
    calories: missing.includes('calories') ? 0 : roundCal(food.calories * factor),
    protein: missing.includes('protein') ? 0 : round1(food.protein * factor),
    carbs: missing.includes('carbs') ? 0 : round1(food.carbs * factor),
    fat: missing.includes('fat') ? 0 : round1(food.fat * factor),
    fibre: missing.includes('fibre') ? 0 : round1(food.fibre * factor),
    insolubleFibreG:
      typeof food.insolubleFibreG === 'number' ? round1(food.insolubleFibreG * factor) : null,
    solubleFibreG:
      typeof food.solubleFibreG === 'number' ? round1(food.solubleFibreG * factor) : null,
    missingFields: missing,
  };
}

export function sumMacros(entries: MacroNutrients[]): MacroNutrients {
  return entries.reduce<MacroNutrients>(
    (acc, item) => ({
      calories: roundCal(acc.calories + item.calories),
      protein: round1(acc.protein + item.protein),
      carbs: round1(acc.carbs + item.carbs),
      fat: round1(acc.fat + item.fat),
      fibre: round1(acc.fibre + item.fibre),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 }
  );
}

export function getEntriesForDate(entries: FoodLogEntry[], dateKey: string): FoodLogEntry[] {
  return entries.filter((e) => e.date === dateKey);
}

export function getMealBreakdown(
  entries: FoodLogEntry[]
): Record<MealCategory, { items: FoodLogEntry[]; totals: MacroNutrients }> {
  const result = {} as Record<MealCategory, { items: FoodLogEntry[]; totals: MacroNutrients }>;
  for (const meal of MEAL_CATEGORIES) {
    const items = entries.filter((e) => e.mealType === meal.id);
    result[meal.id] = {
      items,
      totals: sumMacros(items),
    };
  }
  return result;
}

export function getMacroCalorieSplit(totals: MacroNutrients): {
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
} {
  const pCal = totals.protein * 4;
  const cCal = totals.carbs * 4;
  const fCal = totals.fat * 9;
  const total = pCal + cCal + fCal;
  if (total <= 0) {
    return { proteinPct: 0, carbsPct: 0, fatPct: 0 };
  }
  const proteinPct = Math.round((pCal / total) * 100);
  const carbsPct = Math.round((cCal / total) * 100);
  const fatPct = Math.max(0, 100 - proteinPct - carbsPct);
  return { proteinPct, carbsPct, fatPct };
}

export function isCalorieGoalAchieved(calories: number, target: number): boolean {
  if (calories <= 0 || target <= 0) return false;
  // Within +/- 10% of target calories counts as achieved
  const ratio = calories / target;
  return ratio >= 0.85 && ratio <= 1.1;
}

export function getDailyGoalCompletionScore(
  totals: MacroNutrients,
  goals: NutritionGoals
): number {
  if (totals.calories <= 0 || goals.calories <= 0) return 0;
  const scores = [
    Math.min(1, totals.calories / Math.max(1, goals.calories)),
    Math.min(1, totals.protein / Math.max(1, goals.protein)),
    Math.min(1, totals.carbs / Math.max(1, goals.carbs)),
    Math.min(1, totals.fat / Math.max(1, goals.fat)),
    Math.min(1, totals.fibre / Math.max(1, goals.fibre)),
  ];
  // Penalize large calorie overshoot gently
  const overRatio = totals.calories > goals.calories ? (totals.calories - goals.calories) / goals.calories : 0;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.max(0, Math.min(100, Math.round((avg - overRatio * 0.35) * 100)));
}

export function formatWeight(kg: number, unit: 'kg' | 'lbs'): string {
  if (unit === 'lbs') {
    return `${round1(kg * 2.20462)} lbs`;
  }
  return `${round2(kg)} kg`;
}

export function convertWeightToDisplay(kg: number, unit: 'kg' | 'lbs'): number {
  return unit === 'lbs' ? round1(kg * 2.20462) : round2(kg);
}

export function convertDisplayWeightToKg(val: number, unit: 'kg' | 'lbs'): number {
  return unit === 'lbs' ? round2(val / 2.20462) : round2(val);
}

export function formatFoodQuantity(grams: number, unit: 'g' | 'oz'): string {
  if (unit === 'oz') {
    return `${round1(grams * 0.035274)} oz`;
  }
  return `${Math.round(grams * 10) / 10} g`;
}

export function sortWeightEntriesChronological(
  entries: WeightEntry[],
  order: 'asc' | 'desc' = 'asc'
): WeightEntry[] {
  return [...entries].sort((a, b) => {
    const cmp = a.date.localeCompare(b.date);
    if (cmp !== 0) return order === 'asc' ? cmp : -cmp;
    return order === 'asc'
      ? a.createdAt.localeCompare(b.createdAt)
      : b.createdAt.localeCompare(a.createdAt);
  });
}

export function getWeeklyWeightBreakdown(
  entries: WeightEntry[],
  referenceDateKey: string,
  weekOffset = 0
): {
  days: { date: string; weekday: string; weightKg: number | null; entry?: WeightEntry }[];
  averageKg: number | null;
  recordedDaysCount: number;
} {
  const weekDates = getMondayToSundayWeek(referenceDateKey, weekOffset);
  const byDate = new Map<string, WeightEntry>();
  for (const e of sortWeightEntriesChronological(entries, 'asc')) {
    byDate.set(e.date, e);
  }

  const days = weekDates.map((date) => {
    const entry = byDate.get(date);
    const weekday = parseLocalDateKey(date).toLocaleDateString('en-US', { weekday: 'long' });
    return {
      date,
      weekday,
      weightKg: entry ? entry.weightKg : null,
      entry,
    };
  });

  const recorded = days.filter((d) => d.weightKg !== null) as {
    date: string;
    weekday: string;
    weightKg: number;
  }[];

  const averageKg =
    recorded.length > 0
      ? round2(recorded.reduce((sum, d) => sum + d.weightKg, 0) / recorded.length)
      : null;

  return {
    days,
    averageKg,
    recordedDaysCount: recorded.length,
  };
}

export function formatNutrientValue(
  food: FoodItem,
  field: 'calories' | 'protein' | 'carbs' | 'fat' | 'fibre',
  unitSuffix = ''
): string {
  if (food.missingFields?.includes(field)) {
    return 'Unavailable';
  }
  const value = food[field];
  return `${value}${unitSuffix}`;
}

export function normalizeLegacyCategory(cat: string): string {
  switch (cat) {
    case 'Indian Staples':
      return 'Indian foods';
    case 'Protein':
      return 'Meat and poultry';
    case 'Grains & Carbs':
      return 'Grains and cereals';
    case 'Fruits & Vegetables':
      return 'Fruits';
    case 'Nuts & Fats':
      return 'Nuts and seeds';
    default:
      return cat;
  }
}

export function searchFoods(
  foods: FoodItem[],
  query: string,
  category: string,
  favoriteIds: string[],
  recentIds: string[]
): FoodItem[] {
  return searchFoodsIntelligent(foods, query, {
    category: category === 'My Custom Foods' ? 'Custom' : category,
    favoriteIds,
    recentIds,
  });
}
