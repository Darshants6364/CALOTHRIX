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

export const GLOBAL_FOOD_CATEGORIES = [
  'Indian foods',
  'International foods',
  'Fruits',
  'Vegetables',
  'Dairy',
  'Meat and poultry',
  'Fish and seafood',
  'Grains and cereals',
  'Nuts and seeds',
  'Beverages',
  'Packaged foods',
  'Supplements',
  'Homemade foods',
] as const;

export type GlobalFoodCategory = (typeof GLOBAL_FOOD_CATEGORIES)[number];

export type LegacyFoodCategory =
  | 'Indian Staples'
  | 'Protein'
  | 'Grains & Carbs'
  | 'Fruits & Vegetables'
  | 'Nuts & Fats'
  | 'Custom';

export type FoodCategory = GlobalFoodCategory | LegacyFoodCategory;

export type FoodSourceType =
  | 'verified_reference'
  | 'branded'
  | 'community'
  | 'personal_custom';

export type NutrientFieldKey = 'calories' | 'protein' | 'carbs' | 'fat' | 'fibre';

export interface Micronutrients {
  sugarG?: number | null;
  saturatedFatG?: number | null;
  sodiumMg?: number | null;
  potassiumMg?: number | null;
  calciumMg?: number | null;
  ironMg?: number | null;
  vitaminCMg?: number | null;
  zincMg?: number | null;
}

export interface MacroNutrients {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
}

export type DietaryTag =
  | 'vegetarian'
  | 'vegan'
  | 'eggetarian'
  | 'dairy_free'
  | 'gluten_free'
  | 'nut_free'
  | 'high_protein'
  | 'high_fibre';

export interface FoodItem extends MacroNutrients {
  id: string;
  userId?: string;
  name: string;
  brand?: string;
  country?: string;
  barcode?: string;
  ingredientsText?: string;
  category: FoodCategory;
  servingName: string;
  servingWeightGrams: number;
  isCustom: boolean;
  sourceType?: FoodSourceType;
  sourceName?: string;
  sourceId?: string;
  sourceUrl?: string;
  license?: string;
  dataQuality?: 'high' | 'moderate' | 'user_entered';
  missingFields?: NutrientFieldKey[];
  micronutrients?: Micronutrients;
  dietaryTags?: DietaryTag[];
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
  sourceName?: string;
  sourceType?: FoodSourceType;
  createdAt: string;
  updatedAt: string;
}

export type GoalPreset = 'fat_loss' | 'maintenance' | 'muscle_gain' | 'recomposition' | 'custom';

export interface NutritionGoals {
  userId: string;
  preset: GoalPreset;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  targetWeightKg?: number;
  estimatedBmr?: number;
  estimatedTdee?: number;
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

export type BiologicalSex = 'male' | 'female';
export type WorkoutIntensity = 'light' | 'moderate' | 'vigorous';
export type FitnessGoalType = 'fat_loss' | 'maintenance' | 'muscle_gain' | 'recomposition';
export type AccountRole = 'individual' | 'trainer' | 'admin';

export type DietaryPreference =
  | 'omnivore'
  | 'eggetarian'
  | 'vegetarian'
  | 'vegan';

export type FoodRestriction =
  | 'dairy_free'
  | 'gluten_free'
  | 'nut_free';

export interface UserProfile {
  id: string;
  name: string;
  email?: string;
  avatarUrl?: string;
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
  dietaryPreference: DietaryPreference;
  foodRestrictions: FoodRestriction[];
  accountRole: AccountRole;
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

// Future-ready Trainer Architecture Types (Feature flag disabled until separate launch)
export const ENABLE_TRAINER_PORTAL = false;

export interface TrainerProfile {
  userId: string;
  displayName: string;
  bio: string;
  specialties: string[];
  certifications: string[];
  acceptingClients: boolean;
  createdAt: string;
}

export interface TrainerClientRelationship {
  id: string;
  trainerId: string;
  clientId: string;
  status: 'pending' | 'active' | 'revoked';
  canViewNutrition: boolean;
  canViewWeight: boolean;
  canViewGoals: boolean;
  canAddNotes: boolean;
  authorizedAt?: string;
  createdAt: string;
}

export interface ClientInvitation {
  id: string;
  trainerId: string;
  clientEmail: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  expiresAt: string;
  createdAt: string;
}

export interface TrainerNote {
  id: string;
  trainerId: string;
  clientId: string;
  category: 'nutrition' | 'training' | 'recovery' | 'general';
  note: string;
  createdAt: string;
}

export interface WeeklyClientCheckin {
  id: string;
  clientId: string;
  trainerId: string;
  weekStartDate: string;
  avgCalories: number;
  avgProtein: number;
  avgWeightKg?: number;
  clientNotes?: string;
  trainerFeedback?: string;
  status: 'submitted' | 'reviewed';
  createdAt: string;
}

export interface WeeklySummaryResult {
  provider: 'supabase_ai' | 'deterministic_analytics';
  weekLabel: string;
  avgCalories: number;
  avgProtein: number;
  avgCarbs: number;
  avgFat: number;
  avgFibre: number;
  loggedDays: number;
  weightChangeKg: number | null;
  consistencyPct: number;
  headline: string;
  highlights: string[];
  areasToImprove: string[];
  practicalSuggestions: string[];
  rateLimitNote?: string;
}
