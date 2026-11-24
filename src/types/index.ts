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
  | 'grilled'
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

export type FoodResultGroup = 'basic_ingredient' | 'cooked_food' | 'prepared_dish';

export type FoodQualityStatus =
  | 'verified'
  | 'calculated'
  | 'estimated'
  | 'pending_validation';

export interface GroupedFoodResults {
  basic_ingredient: FoodItem[];
  cooked_food: FoodItem[];
  prepared_dish: FoodItem[];
}

export interface RegionalSearchSuggestion {
  detectedFood: string;
  canonicalEnglishName: string;
  matchedFoodIds: string[];
  reasoning?: string;
}

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
  canonicalFamily?: string;
  version?: number;
  approvedBy?: string;
  approvedAt?: string;
  changeNotes?: string;
  // Additive food-family, grouping, quality & provenance metadata
  foodFamilyId?: string;
  parentFoodId?: string;
  resultGroup?: FoodResultGroup;
  preparationStyle?: string;
  qualityStatus?: FoodQualityStatus;
  isSearchable?: boolean;
  canonicalFoodId?: string;
  calculationMethod?: string;
  sourceReferenceFoods?: string[];
  confidenceScore?: number;
  originalSourceValues?: Record<string, string | number | null>;
}

export interface FoodVersionRecord {
  id: string;
  foodId: string;
  version: number;
  verificationStatus: VerificationStatus;
  foodState: FoodState;
  changeNotes?: string | null;
  changedBy?: string | null;
  foodSnapshot?: Record<string, unknown>;
  nutrientsSnapshot?: Record<string, unknown>;
  createdAt: string;
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
  nccdbCount?: number;
  discontinuedCount?: number;
  rawCookedMismatchCount?: number;
  issues: FoodValidationIssue[];
}

export type SmartFitnessGoalType =
  | 'build_muscle'
  | 'fat_gain'
  | 'lose_weight'
  | 'recomposition'
  | 'maintain_weight';

export type MacroFocusType =
  | 'high_protein'
  | 'balanced'
  | 'lower_carb'
  | 'athletic';

export type GoalPreset =
  | 'fat_loss'
  | 'maintenance'
  | 'muscle_gain'
  | 'recomposition'
  | 'build_muscle'
  | 'fat_gain'
  | 'lose_weight'
  | 'maintain_weight'
  | 'custom';

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
  adaptiveTdeeKcal?: number | null;
  macroFocus?: MacroFocusType;
  assessmentWeekNumber?: number;
  initialCalculatedAt?: string;
  calculationVersion?: string;
  bmi?: number;
  goalSpeed?: GoalSpeed;
  estimatedWeeks?: number | null;
  manualOverrideActive?: boolean;
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
export type FitnessGoalType =
  | 'fat_loss'
  | 'maintenance'
  | 'muscle_gain'
  | 'recomposition'
  | 'build_muscle'
  | 'fat_gain'
  | 'lose_weight'
  | 'maintain_weight';
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
  macroFocus?: MacroFocusType;
  bodyFatPct?: number | null;
  isPregnantOrBreastfeeding?: boolean;
  adaptiveTdeeKcal?: number | null;
  lastWeeklyAssessmentAt?: string | null;
  adaptivePaused?: boolean;
  manualOverrideActive?: boolean;
  cycleAnchorDate?: string | null;
  onboardingCompleted?: boolean;
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

export interface NutritionTargetHistoryRecord {
  id: string;
  userId: string;
  previousCalories: number | null;
  previousProtein: number | null;
  previousCarbs: number | null;
  previousFat: number | null;
  previousFibre: number | null;
  newCalories: number;
  newProtein: number;
  newCarbs: number;
  newFat: number;
  newFibre: number;
  targetWeightKg?: number | null;
  effectiveDate: string;
  adjustmentReason: string;
  assessmentId?: string | null;
  applied: boolean;
  adjustmentType: 'initial' | 'manual' | 'adaptive';
  createdAt: string;
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
  weeklyAssessments?: WeeklyAssessmentRecord[];
  targetHistory?: NutritionTargetHistoryRecord[];
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

export interface SavedMealComboItem {
  foodId: string;
  foodName: string;
  quantityGrams: number;
  unitLabel?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
}

export interface SavedMealCombo {
  id: string;
  name: string;
  mealType?: MealCategory;
  items: SavedMealComboItem[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalFibre: number;
  createdAt: string;
}

export interface NutritionLabelOcrResult {
  name: string;
  brand?: string;
  servingName: string;
  servingWeightGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  sugarG?: number;
  sodiumMg?: number;
  confidence: 'high' | 'moderate' | 'low';
}

export interface CoachSuggestionItem {
  title: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  reason: string;
}

export interface CoachAdviceResult {
  reply: string;
  suggestions: CoachSuggestionItem[];
  provider: 'gemini' | 'deterministic';
}

export type AiTrainingInputMode =
  | 'photo'
  | 'voice'
  | 'text'
  | 'quick_parse'
  | 'label_ocr';

export interface AiTrainingItemSnapshot {
  name: string;
  estimatedQuantityDescription?: string;
  estimatedGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
}

export interface AiTrainingPayloadSnapshot {
  mealTitle: string;
  detectedDescription: string;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalFibre: number;
  items: AiTrainingItemSnapshot[];
}

export interface AiItemCorrectionDiff {
  aiName: string;
  userName: string;
  aiGrams: number;
  userGrams: number;
  aiCalories: number;
  userCalories: number;
  kcalDelta: number;
  gramsDelta: number;
  changedFields: string[];
}

export interface AiEditDiffSummary {
  kcalDelta: number;
  kcalDeltaPct: number;
  gramsDelta: number;
  proteinDelta: number;
  carbsDelta: number;
  fatDelta: number;
  editedItemCount: number;
  totalItemCount: number;
  editedFields: string[];
  itemCorrections: AiItemCorrectionDiff[];
}

export interface AiTrainingEvent {
  id: string;
  userId?: string | null;
  inputMode: AiTrainingInputMode;
  prepStyle: string;
  userInputText?: string;
  imageStoragePath?: string;
  aiDescription: string;
  aiRawOutput: AiTrainingPayloadSnapshot;
  userFinalOutput: AiTrainingPayloadSnapshot;
  userChanged: boolean;
  editDiffSummary: AiEditDiffSummary;
  rewardScore: number;
  userFeedbackNote?: string;
  verifiedForTraining: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
  createdAt: string;
}

export interface AiLearnedPrior {
  id: string;
  foodKey: string;
  displayName: string;
  inputMode: string;
  canonicalDescription: string;
  avgServingGrams: number;
  avgCalories: number;
  avgProtein: number;
  avgCarbs: number;
  avgFat: number;
  avgFibre: number;
  correctionPattern?: string;
  sampleCount: number;
  avgRewardScore: number;
  confidenceWeight: number;
  isVerifiedShared: boolean;
  updatedAt: string;
  createdAt: string;
}

export interface AiTrainingRun {
  id: string;
  runType: 'auto_daily' | 'auto_feedback' | 'manual_admin' | 'reinforcement_calibration';
  eventsProcessed: number;
  verifiedEventsCount: number;
  editedEventsCount: number;
  priorsUpdatedCount: number;
  meanRewardScore: number;
  meanCalorieMae: number;
  acceptanceRatePct: number;
  notes?: string;
  triggeredBy?: string;
  createdAt: string;
}

export interface AiDailyMetricPoint {
  date: string;
  totalEvents: number;
  editedEvents: number;
  acceptanceRatePct: number;
  meanRewardScore: number;
  meanCalorieMae: number;
}

export interface AiPerformanceInsightsResponse {
  summary: {
    totalEvents: number;
    editedEvents: number;
    acceptedUneditedEvents: number;
    verifiedEvents: number;
    acceptanceRatePct: number;
    editRatePct: number;
    meanRewardScore: number;
    meanCalorieMae: number;
    meanCalorieMapePct: number;
    verifiedPriorsCount: number;
    totalTrainingRuns: number;
    lastRunAt?: string;
    modeBreakdown: Record<AiTrainingInputMode, { total: number; edited: number; acceptancePct: number }>;
    storageBackend: 'supabase' | 'hybrid_fallback';
  };
  dailyTrend: AiDailyMetricPoint[];
  events: AiTrainingEvent[];
  priors: AiLearnedPrior[];
  runs: AiTrainingRun[];
}

// ============================================================================
// SMART CALORIE TRACKER & 14-DAY AI ADAPTIVE ASSESSMENT TYPES
// ============================================================================

export type AssessmentConfidenceLevel = 'high' | 'moderate' | 'low';
export type WeeklyAssessmentStatus = 'pending' | 'applied' | 'dismissed';
export type WeeklyAdjustmentType =
  | 'maintained'
  | 'increased'
  | 'decreased'
  | 'insufficient_data'
  | 'goal_completed_maintenance'
  | 'safety_guarded';

export type AdaptiveAssessmentStatusTag =
  | 'on_track'
  | 'needs_attention'
  | 'targets_updated'
  | 'insufficient_data';

export interface AdaptiveAiStructuredOutput {
  status: AdaptiveAssessmentStatusTag;
  summary: string;
  weight_change_kg: number;
  calorie_action: 'increase' | 'decrease' | 'maintain' | 'preserve';
  previous_calories: number;
  recommended_calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  reason: string;
  confidence: AssessmentConfidenceLevel;
}

export interface WeeklyAssessmentAiExplanation {
  headline: string;
  bodyChangeAnalysis: string;
  calorieAdjustmentReason: string;
  actionableTips: string[];
  confidenceExplanation: string;
  provider?: 'gemini' | 'deterministic';
  structured?: AdaptiveAiStructuredOutput;
}

export interface DailyNutritionSummary {
  date: string; // YYYY-MM-DD
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  entryCount: number;
}

export interface WeeklyAssessmentRecord {
  id: string;
  userId: string;
  weekStartDate: string; // YYYY-MM-DD (14-day cycle start)
  weekEndDate: string; // YYYY-MM-DD (14-day cycle end)
  assessmentWeekNumber: number; // Cycle number (1, 2, 3...)
  cycleDays?: number;
  previousWeightKg: number;
  assessedWeightKg: number;
  previousTrendWeightKg: number;
  assessedTrendWeightKg: number;
  current7dAvgWeightKg?: number;
  previous7dAvgWeightKg?: number;
  weeklyWeightChangeKg?: number;
  weeklyWeightChangePct?: number;
  avgDailyCalories: number;
  avgDailyProtein: number;
  avgDailyCarbs?: number;
  avgDailyFat?: number;
  avgDailyFibre?: number;
  priorTdeeKcal: number;
  estimatedTdeeKcal?: number;
  calibratedTdeeKcal: number;
  previousRecommendedCalories: number;
  recommendedCalories: number;
  previousRecommendedProtein?: number;
  previousRecommendedCarbs?: number;
  previousRecommendedFat?: number;
  previousRecommendedFibre?: number;
  recommendedProtein: number;
  recommendedCarbs: number;
  recommendedFat: number;
  recommendedFibre: number;
  recommendedHydrationMl?: number;
  estimatedBmr?: number;
  projectedWeeksToGoal?: number | null;
  foodLoggedDays: number;
  weightLoggedDays: number;
  loggingCompletenessPct?: number;
  adherencePercentage: number;
  confidenceLevel: AssessmentConfidenceLevel;
  adjustmentType: WeeklyAdjustmentType;
  statusTag?: AdaptiveAssessmentStatusTag;
  calorieDeltaKcal?: number;
  adjustmentReason: string;
  goalCompleted: boolean;
  suggestedMaintenanceCalories?: number | null;
  aiSummary: WeeklyAssessmentAiExplanation;
  rationaleBullets: string[];
  calculationVersion: string;
  status: WeeklyAssessmentStatus;
  appliedAt?: string | null;
  createdAt: string;
}

export interface WeeklyAssessmentDueStatus {
  isDue: boolean;
  statusLabel:
    | 'Assessment in progress'
    | 'Assessment ready'
    | 'Low data confidence'
    | 'Assessment completed'
    | 'Adaptive paused'
    | 'Custom targets active';
  currentWeekNumber: number;
  cycleDays: number;
  daysCompleted: number;
  cycleStartDate: string;
  cycleEndDate: string;
  weekStartDate: string;
  weekEndDate: string;
  nextAssessmentDate: string;
  daysSinceLastAnchor: number;
  daysRemaining: number;
  foodLoggedDays: number;
  weightLoggedDays: number;
  confidenceLevel: AssessmentConfidenceLevel;
  hasExistingForPeriod: boolean;
  existingAssessment?: WeeklyAssessmentRecord | null;
  latestWeightKg: number | null;
  weeklyDeltaKg: number | null;
  goalCompleted: boolean;
  adaptivePaused?: boolean;
  manualOverrideActive?: boolean;
  readinessMessage: string;
}



