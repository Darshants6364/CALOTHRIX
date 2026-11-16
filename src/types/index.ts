export type MealCategory =
  | 'breakfast'
  | 'lunch'
  | 'evening_snacks'
  | 'dinner'
  | 'other';

export const MEAL_CATEGORIES: { id: MealCategory; label: string; shortLabel: string }[] = [
  { id: 'breakfast', label: 'Breakfast', shortLabel: 'Breakfast' },
  { id: 'lunch', label: 'Lunch', shortLabel: 'Lunch' },
  { id: 'evening_snacks', label: 'Evening Snacks', shortLabel: 'Snacks' },
  { id: 'dinner', label: 'Dinner', shortLabel: 'Dinner' },
  { id: 'other', label: 'Other / Custom', shortLabel: 'Other' },
];

export type FoodCategory =
  | 'Indian Staples'
  | 'Protein'
  | 'Grains & Carbs'
  | 'Dairy'
  | 'Fruits & Vegetables'
  | 'Nuts & Fats'
  | 'Supplements'
  | 'Custom';

export interface MacroNutrients {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
}

export interface FoodItem extends MacroNutrients {
  id: string;
  userId?: string;
  name: string;
  category: FoodCategory;
  servingName: string;
  servingWeightGrams: number;
  isCustom: boolean;
  createdAt?: string;
}

export interface FoodLogEntry extends MacroNutrients {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD in user's local timezone
  mealType: MealCategory;
  foodId: string;
  foodName: string;
  quantityGrams: number;
  servingsCount: number;
  servingName: string;
  createdAt: string;
  updatedAt: string;
}

export type GoalPreset = 'fat_loss' | 'maintenance' | 'muscle_gain' | 'custom';

export interface NutritionGoals {
  userId: string;
  preset: GoalPreset;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  targetWeightKg?: number;
  updatedAt: string;
}

export interface WeightEntry {
  id: string;
  userId: string;
  weightKg: number;
  date: string; // YYYY-MM-DD
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WeightGoal {
  userId: string;
  startingWeightKg: number;
  targetWeightKg: number;
  goalDirection: 'loss' | 'gain' | 'maintain';
  updatedAt: string;
}

export type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'active'
  | 'very_active';

export type FitnessGoalType = 'fat_loss' | 'maintenance' | 'muscle_gain' | 'recomposition';

export interface UserProfile {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  age: number;
  heightCm: number;
  currentWeightKg: number;
  targetWeightKg: number;
  activityLevel: ActivityLevel;
  fitnessGoal: FitnessGoalType;
  isDemoProfile: boolean;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  weightUnit: 'kg' | 'lbs';
  foodUnit: 'g' | 'oz';
}

export interface AuthSessionPlaceholder {
  provider: 'local_demo' | 'supabase_google';
  isAuthenticated: boolean;
  userId: string;
}

export interface MacroLogPersistedState {
  version: number;
  isDemoData: boolean;
  profile: UserProfile;
  settings: AppSettings;
  goals: NutritionGoals;
  weightGoal: WeightGoal;
  customFoods: FoodItem[];
  favoriteFoodIds: string[];
  recentFoodIds: string[];
  foodEntries: FoodLogEntry[];
  weightEntries: WeightEntry[];
}

export type NavTab =
  | 'home'
  | 'food-log'
  | 'food-database'
  | 'progress'
  | 'weight'
  | 'goals'
  | 'profile';

export interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'error';
  message: string;
}
