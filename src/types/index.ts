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

export type FoodState =
  | 'raw'
  | 'cooked'
  | 'boiled'
  | 'fried'
  | 'roasted'
  | 'steamed'
  | 'dry'
  | 'parboiled'
  | 'tender'
  | 'fresh'
  | 'ripe'
  | 'dried'
  | 'puffed'
  | 'mature'
  | 'fermented'
  | 'prepared'
  | string;

export type MeasurementBasis = 'per_100g' | 'per_serving' | 'per_100ml';

export type VerificationStatus =
  | 'verified'
  | 'enriched'
  | 'estimated'
  | 'user_provided'
  | 'needs_review';

export type CarbohydrateBasis = 'available' | 'total_by_difference' | 'unknown';

export type PortionUnitType =
  | 'g'
  | 'ml'
  | 'piece'
  | 'cup'
  | 'bowl'
  | 'katori'
  | 'tbsp'
  | 'tsp'
  | 'glass'
  | 'plate'
  | 'scoop'
  | 'slice';

export interface FoodPortion {
  id: string;
  foodId?: string;
  portionName: string;
  sizeVariant?: 'small' | 'medium' | 'large' | 'standard';
  gramOrMlWeight: number;
  unitType: PortionUnitType;
  measurementMethod: string;
  sourceReference: string;
  confidenceLevel: 'high' | 'moderate' | 'low';
  isDefault?: boolean;
}

export interface RawNutrientValues {
  energyKj?: number | null;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  fibre?: number | null;
  insolubleFibre?: number | null;
  solubleFibre?: number | null;
  water?: number | null;
  ash?: number | null;
}

export interface EnrichedNutrientRecord {
  value: number;
  sourceName: string;
  sourceId?: string;
  notes?: string;
}

export type ValidationSeverity = 'info' | 'warning' | 'error';

export type ValidationCheckCode =
  | 'duplicate_code'
  | 'duplicate_food_record'
  | 'missing_nutrient'
  | 'negative_value'
  | 'unit_range_error'
  | 'proximate_sum_anomaly'
  | 'energy_inconsistency'
  | 'serving_consistency_error'
  | 'raw_cooked_unspecified'
  | 'source_unverified'
  | 'discontinued_product';

export interface FoodValidationIssue {
  foodId: string;
  foodName: string;
  sourceName: string;
  code: ValidationCheckCode;
  severity: ValidationSeverity;
  message: string;
  details?: Record<string, string | number | boolean | null>;
}

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
  // Enhanced nutrition intelligence metadata
  foodCode?: string;
  foodGroup?: string;
  foodState?: FoodState;
  measurementBasis?: MeasurementBasis;
  liquidDensityGPerMl?: number | null;
  verificationStatus?: VerificationStatus;
  sourcePriority?: number;
  lastUpdated?: string;
  energyKj?: number | null;
  atwaterCalories?: number | null;
  waterG?: number | null;
  ashG?: number | null;
  insolubleFibreG?: number | null;
  solubleFibreG?: number | null;
  carbohydrateBasis?: CarbohydrateBasis;
  rawNutrients?: RawNutrientValues;
  enrichedNutrients?: Partial<Record<NutrientFieldKey, EnrichedNutrientRecord>>;
  aliases?: string[];
  regionalNames?: string[];
  portions?: FoodPortion[];
  isDiscontinued?: boolean;
  validationIssues?: FoodValidationIssue[];
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
  unitLabel?: string;
  measurementBasis?: MeasurementBasis;
  verificationStatus?: VerificationStatus;
  foodState?: FoodState;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeIngredientInput {
  food: FoodItem;
  rawWeightGrams: number;
  ediblePortionFactor?: number; // default 1.0 (e.g., 0.72 for bone-in chicken, 0.85 for peeled veg)
  retentionFactor?: number; // default 1.0 (macro retention during cooking)
  isCookingFat?: boolean;
}

export interface RecipeCalculationOptions {
  name: string;
  category?: FoodCategory;
  preparationStyle: 'homemade' | 'restaurant';
  ingredients: RecipeIngredientInput[];
  cookingYieldFactor?: number; // e.g., 2.5 for boiled rice/dal, 0.82 for curry evaporation
  finalCookedWeightGrams?: number; // explicit cooked weight overrides yieldFactor * rawEdibleWeight
  servingsCount?: number;
  notes?: string;
}

export interface CalculatedRecipeResult {
  name: string;
  preparationStyle: 'homemade' | 'restaurant';
  rawTotalWeightGrams: number;
  rawEdibleWeightGrams: number;
  finalCookedWeightGrams: number;
  cookingYieldFactor: number;
  servingsCount: number;
  per100g: MacroNutrients & {
    insolubleFibreG: number | null;
    solubleFibreG: number | null;
    missingFields: NutrientFieldKey[];
  };
  totalBatch: MacroNutrients;
  asFoodItem: FoodItem;
}

export interface DatabaseQualitySummary {
  totalRecords: number;
  ifctCount: number;
  usdaCount: number;
  openFoodFactsCount: number;
  brandedCount: number;
  customCount: number;
  verifiedCount: number;
  enrichedCount: number;
  estimatedCount: number;
  userProvidedCount: number;
  needsReviewCount: number;
  missingProteinCount: number;
  missingCarbsCount: number;
  missingFatCount: number;
  missingFibreCount: number;
  duplicateCount: number;
  inconsistentEnergyCount: number;
  issues: FoodValidationIssue[];
}

export type GoalPreset = 'fat_loss' | 'maintenance' | 'muscle_gain' | 'recomposition' | 'custom';
export type GoalSpeed = 'slow' | 'moderate' | 'aggressive';

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
  bmi?: number;
  goalSpeed?: GoalSpeed;
  estimatedWeeks?: number | null;
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
  goalSpeed?: GoalSpeed;
  dietaryPreference: DietaryPreference;
  foodRestrictions: FoodRestriction[];
  accountRole: AccountRole;
  roleSelected?: boolean;
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
  | 'profile'
  | 'admin-quality';

export type TrainerNavTab =
  | 'overview'
  | 'clients'
  | 'client-detail'
  | 'analytics'
  | 'settings';

export interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'error';
  message: string;
}

// Trainer Portal Enabled
export const ENABLE_TRAINER_PORTAL = true;

export type TrainerSubscriptionTier = 'free' | 'pro' | 'premium';

export const TRAINER_SUBSCRIPTION_PLANS: Record<
  TrainerSubscriptionTier,
  {
    id: TrainerSubscriptionTier;
    name: string;
    maxClients: number | null; // null = unlimited
    maxAnalyticsDays: number;
    tagline: string;
    features: string[];
  }
> = {
  free: {
    id: 'free',
    name: 'Starter Coach (Free)',
    maxClients: 5,
    maxAnalyticsDays: 30,
    tagline: 'Core client coaching & 30-day compliance tracking',
    features: [
      'Up to 5 active clients',
      'Email & shareable invite links',
      '7-day & 30-day client nutrition charts',
      'Private coach notes & target proposals',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro Coach',
    maxClients: 25,
    maxAnalyticsDays: 90,
    tagline: 'Extended 90-day analytics & structured weekly check-ins',
    features: [
      'Up to 25 active clients',
      '90-day & custom date-range analytics',
      'Weekly check-in feedback workflow',
      'Multi-client compliance comparison',
    ],
  },
  premium: {
    id: 'premium',
    name: 'Studio & Elite (Premium)',
    maxClients: null,
    maxAnalyticsDays: 365,
    tagline: 'Unlimited coaching roster & full-year client telemetry',
    features: [
      'Unlimited active clients',
      'Full historical & custom date-range analytics',
      'Cohort adherence benchmarking',
      'Ready for team & billing integrations',
    ],
  },
};

export interface TrainerProfile {
  userId: string;
  displayName: string;
  bio: string;
  specialties: string[];
  certifications: string[];
  acceptingClients: boolean;
  subscriptionTier: TrainerSubscriptionTier;
  maxClients: number;
  createdAt: string;
}

export interface TrainerClientRelationship {
  id: string;
  trainerId: string;
  clientId: string;
  status: 'pending' | 'active' | 'revoked';
  canViewProfile: boolean;
  canViewNutrition: boolean;
  canViewWeight: boolean;
  canViewGoals: boolean;
  canAddNotes: boolean;
  canManageGoals: boolean;
  isArchived: boolean;
  authorizedAt?: string;
  createdAt: string;
  trainerProfile?: Partial<TrainerProfile>;
}

export interface ClientInvitation {
  id: string;
  trainerId: string;
  clientEmail: string;
  clientName?: string;
  inviteToken: string;
  message?: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  expiresAt: string;
  createdAt: string;
  trainerName?: string;
  trainerBio?: string;
  trainerSpecialties?: string[];
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

export interface TargetRecommendation {
  id: string;
  trainerId: string;
  clientId: string;
  trainerName?: string;
  recommendedCalories: number;
  recommendedProtein: number;
  recommendedCarbs: number;
  recommendedFat: number;
  recommendedFibre: number;
  recommendedTargetWeightKg?: number;
  rationale: string;
  status: 'pending' | 'approved' | 'declined';
  reviewedAt?: string;
  createdAt: string;
}

export interface MealGuidelineItem {
  mealType: MealCategory;
  targetCalories: number;
  targetProtein: number;
  guidance: string;
}

export interface TrainerClientPlan {
  id: string;
  trainerId: string;
  clientId: string;
  trainerName?: string;
  phaseTitle: string;
  coachSummary: string;
  dailyWaterGoalMl: number;
  dailyStepsTarget: number;
  mealGuidelines: MealGuidelineItem[];
  actionItems: string[];
  updatedAt: string;
  createdAt: string;
}

export interface AnalyzedMealItem {
  name: string;
  estimatedQuantityDescription: string;
  estimatedGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  notes?: string;
}

export interface MealAiAnalysisResult {
  mealTitle: string;
  detectedDescription: string;
  suggestedMealType: MealCategory;
  confidence: 'high' | 'moderate' | 'low';
  items: AnalyzedMealItem[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalFibre: number;
  nutritionTip: string;
}

export interface AiMealScanRecord {
  id: string;
  userId: string;
  inputMode: 'photo' | 'voice' | 'text';
  mealType: MealCategory;
  mealTitle: string;
  transcriptOrNotes?: string;
  detectedItems: AnalyzedMealItem[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalFibre: number;
  confidence: 'high' | 'moderate' | 'low';
  nutritionTip?: string;
  imageStoragePath?: string;
  loggedToDiary: boolean;
  createdAt: string;
}

export interface TrainerClientSnapshot {
  relationship: TrainerClientRelationship;
  profile: {
    userId: string;
    name: string;
    email?: string;
    avatarUrl?: string;
    age: number;
    heightCm: number;
    currentWeightKg: number;
    targetWeightKg: number;
    fitnessGoal: FitnessGoalType;
    goalSpeed?: GoalSpeed;
  } | null;
  goals: NutritionGoals | null;
  foodEntries: FoodLogEntry[];
  weightEntries: WeightEntry[];
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
