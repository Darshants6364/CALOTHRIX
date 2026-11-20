import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import {
  AccountRole,
  AppSettings,
  BiologicalSex,
  DietaryPreference,
  FoodCategory,
  FoodItem,
  FoodLogEntry,
  FoodRestriction,
  FoodSourceType,
  FoodState,
  MacroLogPersistedState,
  MeasurementBasis,
  Micronutrients,
  NutritionGoals,
  UserProfile,
  VerificationStatus,
  WeightEntry,
  WeightGoal,
  WorkoutIntensity,
} from '../types';

export interface DbMutationResult {
  ok: boolean;
  errorMessage?: string;
  needsSetup?: boolean;
}

export function isSchemaOrPermissionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string; status?: number };
  const msg = (err.message || '').toLowerCase();
  return (
    err.code === 'PGRST205' ||
    err.code === '42P01' ||
    err.code === '42501' ||
    err.status === 404 ||
    msg.includes('could not find the table') ||
    msg.includes('does not exist') ||
    msg.includes('permission denied')
  );
}

function isMissingColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string };
  const msg = (err.message || '').toLowerCase();
  return (
    err.code === 'PGRST204' ||
    err.code === '42703' ||
    msg.includes('could not find the') ||
    msg.includes('column')
  );
}

function formatDbError(error: unknown): DbMutationResult {
  if (!error) return { ok: true };
  const err = error as { code?: string; message?: string };
  return {
    ok: false,
    errorMessage: err.message || 'Database request failed',
    needsSetup: isSchemaOrPermissionError(error),
  };
}

/**
 * Extracts real display name, email, and avatar from Supabase Auth user metadata
 * (populated automatically by Google OAuth or Email sign-up).
 */
export function extractAuthDetails(user: User): {
  name: string;
  email: string;
  avatarUrl?: string;
  provider: string;
} {
  const meta = user.user_metadata || {};
  const email = user.email || '';
  const rawName =
    meta.full_name ||
    meta.name ||
    (email ? email.split('@')[0] : 'Athlete');
  const avatarUrl = meta.avatar_url || meta.picture || undefined;
  const provider =
    (user.app_metadata?.provider as string | undefined) ||
    user.identities?.[0]?.provider ||
    'email';

  return {
    name: String(rawName),
    email,
    avatarUrl: avatarUrl ? String(avatarUrl) : undefined,
    provider,
  };
}

/**
 * Brand-new authenticated user starts with ZERO user-specific usage:
 * 0 food entries, 0 weight entries, 0 custom foods, and 0 initial targets/body measurements
 * so every user defines their own profile and goals after logging in.
 */
export function createZeroUserState(
  user: User,
  themePreference: AppSettings['theme'] = 'dark'
): MacroLogPersistedState {
  const authInfo = extractAuthDetails(user);
  const now = new Date().toISOString();

  return {
    version: 1,
    isDemoData: false,
    profile: {
      id: user.id,
      name: authInfo.name,
      email: authInfo.email,
      avatarUrl: authInfo.avatarUrl,
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
      theme: themePreference,
      weightUnit: 'kg',
      foodUnit: 'g',
    },
    goals: {
      userId: user.id,
      preset: 'custom',
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fibre: 0,
      targetWeightKg: undefined,
      updatedAt: now,
    },
    weightGoal: {
      userId: user.id,
      startingWeightKg: 0,
      targetWeightKg: 0,
      goalDirection: 'maintain',
      updatedAt: now,
    },
    customFoods: [],
    favoriteFoodIds: [],
    recentFoodIds: [],
    foodEntries: [],
    weightEntries: [],
  };
}

export interface SupabaseLoadResult {
  state: MacroLogPersistedState;
  needsSchemaSetup: boolean;
  errorMessage?: string;
}

export async function loadUserStateFromSupabase(
  user: User,
  fallbackTheme: AppSettings['theme'] = 'dark'
): Promise<SupabaseLoadResult> {
  const baseZero = createZeroUserState(user, fallbackTheme);
  const authInfo = extractAuthDetails(user);

  const [
    profileRes,
    goalsRes,
    weightGoalRes,
    customFoodsRes,
    foodEntriesRes,
    weightEntriesRes,
    prefsRes,
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('nutrition_goals').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('weight_goals').select('*').eq('user_id', user.id).maybeSingle(),
    supabase
      .from('custom_foods')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('food_entries')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('weight_entries')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false }),
    supabase.from('user_food_preferences').select('*').eq('user_id', user.id).maybeSingle(),
  ]);

  const firstError = [
    profileRes.error,
    goalsRes.error,
    weightGoalRes.error,
    customFoodsRes.error,
    foodEntriesRes.error,
    weightEntriesRes.error,
    prefsRes.error,
  ].find(Boolean);

  if (firstError && isSchemaOrPermissionError(firstError)) {
    return {
      state: baseZero,
      needsSchemaSetup: true,
      errorMessage: firstError.message,
    };
  }

  // Provision initial zero-usage rows for first-time user in Supabase
  if (!profileRes.data) {
    const res = await upsertProfileAndSettings(user.id, baseZero.profile, baseZero.settings);
    if (!res.ok && res.needsSetup) {
      return { state: baseZero, needsSchemaSetup: true, errorMessage: res.errorMessage };
    }
  }
  if (!goalsRes.data) {
    await upsertNutritionGoals(user.id, baseZero.goals);
  }
  if (!weightGoalRes.data) {
    await upsertWeightGoal(user.id, baseZero.weightGoal);
  }

  const pRow = profileRes.data;
  const gRow = goalsRes.data;
  const wgRow = weightGoalRes.data;

  const hasExistingUserActivity = Boolean(
    (pRow && (Number(pRow.age || 0) > 0 || Number(pRow.height_cm || 0) > 0)) ||
      (gRow && Number(gRow.calories || 0) > 0) ||
      (foodEntriesRes.data && foodEntriesRes.data.length > 0) ||
      (weightEntriesRes.data && weightEntriesRes.data.length > 0)
  );

  const profile: UserProfile = pRow
    ? {
        id: user.id,
        name: pRow.name || authInfo.name,
        email: pRow.email || authInfo.email,
        avatarUrl: pRow.avatar_url || authInfo.avatarUrl,
        age: Number(pRow.age ?? 0),
        biologicalSex: (pRow.biological_sex as BiologicalSex) || 'male',
        heightCm: Number(pRow.height_cm ?? 0),
        currentWeightKg: Number(pRow.current_weight_kg ?? 0),
        targetWeightKg: Number(pRow.target_weight_kg ?? 0),
        dailyAverageSteps: Number(pRow.daily_average_steps ?? 7000),
        activityLevel: pRow.activity_level || 'moderate',
        workoutFrequencyPerWeek: Number(pRow.workout_frequency ?? 3),
        workoutIntensity: (pRow.workout_intensity as WorkoutIntensity) || 'moderate',
        fitnessGoal: pRow.fitness_goal || 'maintenance',
        goalSpeed: pRow.goal_speed || 'moderate',
        dietaryPreference: (pRow.dietary_preference as DietaryPreference) || 'omnivore',
        foodRestrictions: Array.isArray(pRow.food_restrictions)
          ? (pRow.food_restrictions as FoodRestriction[])
          : [],
        accountRole: (pRow.account_role as AccountRole) || 'individual',
        roleSelected:
          typeof pRow.role_selected === 'boolean'
            ? pRow.role_selected || hasExistingUserActivity
            : hasExistingUserActivity,
        isDemoProfile: false,
      }
    : baseZero.profile;

  const settings: AppSettings = pRow
    ? {
        theme: (pRow.theme as AppSettings['theme']) || fallbackTheme,
        weightUnit: (pRow.weight_unit as AppSettings['weightUnit']) || 'kg',
        foodUnit: (pRow.food_unit as AppSettings['foodUnit']) || 'g',
      }
    : baseZero.settings;

  const goals: NutritionGoals = gRow
    ? {
        userId: user.id,
        preset: gRow.preset || 'custom',
        calories: Number(gRow.calories ?? 0),
        protein: Number(gRow.protein ?? 0),
        carbs: Number(gRow.carbs ?? 0),
        fat: Number(gRow.fat ?? 0),
        fibre: Number(gRow.fibre ?? 0),
        targetWeightKg:
          gRow.target_weight_kg != null && Number(gRow.target_weight_kg) > 0
            ? Number(gRow.target_weight_kg)
            : undefined,
        estimatedBmr:
          gRow.estimated_bmr != null ? Number(gRow.estimated_bmr) : undefined,
        estimatedTdee:
          gRow.estimated_tdee != null ? Number(gRow.estimated_tdee) : undefined,
        bmi: gRow.bmi != null ? Number(gRow.bmi) : undefined,
        goalSpeed: gRow.goal_speed || undefined,
        estimatedWeeks:
          gRow.estimated_weeks != null ? Number(gRow.estimated_weeks) : undefined,
        updatedAt: gRow.updated_at || baseZero.goals.updatedAt,
      }
    : baseZero.goals;

  const weightGoal: WeightGoal = wgRow
    ? {
        userId: user.id,
        startingWeightKg: Number(wgRow.starting_weight_kg ?? 0),
        targetWeightKg: Number(wgRow.target_weight_kg ?? 0),
        goalDirection: wgRow.goal_direction || 'maintain',
        updatedAt: wgRow.updated_at || baseZero.weightGoal.updatedAt,
      }
    : baseZero.weightGoal;

  const customFoods: FoodItem[] = (customFoodsRes.data || []).map((row) => ({
    id: row.id,
    userId: user.id,
    name: row.name,
    brand: row.brand || undefined,
    category: (row.category as FoodCategory) || 'Homemade foods',
    servingName: row.serving_name,
    servingWeightGrams: Number(row.serving_weight_grams),
    calories: Number(row.calories),
    protein: Number(row.protein),
    carbs: Number(row.carbs),
    fat: Number(row.fat),
    fibre: Number(row.fibre ?? 0),
    isCustom: true,
    sourceType: (row.source_type as FoodSourceType) || 'personal_custom',
    sourceName: row.source_name || 'Personal Custom Food',
    sourceId: row.source_id || undefined,
    sourceUrl: row.source_url || undefined,
    foodState: (row.food_state as FoodState) || 'prepared',
    measurementBasis:
      (row.measurement_basis as MeasurementBasis) ||
      (Number(row.serving_weight_grams) === 100 ? 'per_100g' : 'per_serving'),
    verificationStatus:
      (row.verification_status as VerificationStatus) || 'user_provided',
    dataQuality: 'user_entered',
    micronutrients: (row.other_nutrients as Micronutrients) || undefined,
    createdAt: row.created_at,
  }));

  const foodEntries: FoodLogEntry[] = (foodEntriesRes.data || []).map((row) => ({
    id: row.id,
    userId: user.id,
    date: row.date,
    mealType: row.meal_type,
    foodId: row.food_id,
    foodName: row.food_name,
    quantityGrams: Number(row.quantity_grams),
    servingsCount: Number(row.servings_count),
    servingName: row.serving_name,
    calories: Number(row.calories),
    protein: Number(row.protein),
    carbs: Number(row.carbs),
    fat: Number(row.fat),
    fibre: Number(row.fibre ?? 0),
    sourceName: row.source_name || undefined,
    sourceType: (row.source_type as FoodSourceType) || undefined,
    unitLabel: row.unit_label || undefined,
    measurementBasis: (row.measurement_basis as MeasurementBasis) || undefined,
    verificationStatus: (row.verification_status as VerificationStatus) || undefined,
    foodState: (row.food_state as FoodState) || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  const weightEntries: WeightEntry[] = (weightEntriesRes.data || []).map((row) => ({
    id: row.id,
    userId: user.id,
    weightKg: Number(row.weight_kg),
    date: row.date,
    notes: row.notes || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  const favoriteFoodIds: string[] = prefsRes.data?.favorite_food_ids || [];
  const recentFoodIds: string[] = prefsRes.data?.recent_food_ids || [];

  return {
    state: {
      version: 1,
      isDemoData: false,
      profile,
      settings,
      goals,
      weightGoal,
      customFoods,
      favoriteFoodIds,
      recentFoodIds,
      foodEntries,
      weightEntries,
    },
    needsSchemaSetup: false,
  };
}

export async function upsertProfileAndSettings(
  userId: string,
  profile: UserProfile,
  settings: AppSettings
): Promise<DbMutationResult> {
  const corePayload = {
    user_id: userId,
    name: profile.name,
    email: profile.email || null,
    avatar_url: profile.avatarUrl || null,
    age: profile.age,
    height_cm: profile.heightCm,
    current_weight_kg: profile.currentWeightKg,
    target_weight_kg: profile.targetWeightKg,
    activity_level: profile.activityLevel,
    fitness_goal: profile.fitnessGoal,
    theme: settings.theme,
    weight_unit: settings.weightUnit,
    food_unit: settings.foodUnit,
    updated_at: new Date().toISOString(),
  };

  const extendedPayload = {
    ...corePayload,
    biological_sex: profile.biologicalSex,
    daily_average_steps: profile.dailyAverageSteps,
    workout_frequency: profile.workoutFrequencyPerWeek,
    workout_intensity: profile.workoutIntensity,
    goal_speed: profile.goalSpeed || 'moderate',
    dietary_preference: profile.dietaryPreference,
    food_restrictions: profile.foodRestrictions,
    account_role: profile.accountRole || 'individual',
    role_selected: Boolean(profile.roleSelected),
  };

  const { error } = await supabase.from('profiles').upsert(extendedPayload);
  if (error && isMissingColumnError(error)) {
    const fallback = await supabase.from('profiles').upsert(corePayload);
    return formatDbError(fallback.error);
  }
  return formatDbError(error);
}

export async function upsertNutritionGoals(
  userId: string,
  goals: NutritionGoals
): Promise<DbMutationResult> {
  const corePayload = {
    user_id: userId,
    preset: goals.preset,
    calories: goals.calories,
    protein: goals.protein,
    carbs: goals.carbs,
    fat: goals.fat,
    fibre: goals.fibre,
    target_weight_kg: goals.targetWeightKg ?? null,
    updated_at: goals.updatedAt,
  };

  const extendedPayload = {
    ...corePayload,
    estimated_bmr: goals.estimatedBmr ?? null,
    estimated_tdee: goals.estimatedTdee ?? null,
    bmi: goals.bmi ?? null,
    goal_speed: goals.goalSpeed ?? null,
    estimated_weeks: goals.estimatedWeeks ?? null,
  };

  const { error } = await supabase.from('nutrition_goals').upsert(extendedPayload);
  if (error && isMissingColumnError(error)) {
    const fallback = await supabase.from('nutrition_goals').upsert(corePayload);
    return formatDbError(fallback.error);
  }
  return formatDbError(error);
}

export async function upsertWeightGoal(
  userId: string,
  goal: WeightGoal
): Promise<DbMutationResult> {
  const { error } = await supabase.from('weight_goals').upsert({
    user_id: userId,
    starting_weight_kg: goal.startingWeightKg,
    target_weight_kg: goal.targetWeightKg,
    goal_direction: goal.goalDirection,
    updated_at: goal.updatedAt,
  });
  return formatDbError(error);
}

export async function insertFoodEntryDb(entry: FoodLogEntry): Promise<DbMutationResult> {
  const corePayload = {
    id: entry.id,
    user_id: entry.userId,
    date: entry.date,
    meal_type: entry.mealType,
    food_id: entry.foodId,
    food_name: entry.foodName,
    quantity_grams: entry.quantityGrams,
    servings_count: entry.servingsCount,
    serving_name: entry.servingName,
    calories: entry.calories,
    protein: entry.protein,
    carbs: entry.carbs,
    fat: entry.fat,
    fibre: entry.fibre,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  };

  const extendedPayload = {
    ...corePayload,
    source_name: entry.sourceName || null,
    source_type: entry.sourceType || null,
    unit_label: entry.unitLabel || null,
    measurement_basis: entry.measurementBasis || null,
    verification_status: entry.verificationStatus || null,
    food_state: entry.foodState || null,
  };

  const { error } = await supabase.from('food_entries').insert(extendedPayload);
  if (error && isMissingColumnError(error)) {
    const legacyExtended = {
      ...corePayload,
      source_name: entry.sourceName || null,
      source_type: entry.sourceType || null,
    };
    const fallback1 = await supabase.from('food_entries').insert(legacyExtended);
    if (fallback1.error && isMissingColumnError(fallback1.error)) {
      const fallback2 = await supabase.from('food_entries').insert(corePayload);
      return formatDbError(fallback2.error);
    }
    return formatDbError(fallback1.error);
  }
  return formatDbError(error);
}

export async function updateFoodEntryDb(entry: FoodLogEntry): Promise<DbMutationResult> {
  const coreUpdate = {
    date: entry.date,
    meal_type: entry.mealType,
    food_id: entry.foodId,
    food_name: entry.foodName,
    quantity_grams: entry.quantityGrams,
    servings_count: entry.servingsCount,
    serving_name: entry.servingName,
    calories: entry.calories,
    protein: entry.protein,
    carbs: entry.carbs,
    fat: entry.fat,
    fibre: entry.fibre,
    updated_at: entry.updatedAt,
  };

  const extendedUpdate = {
    ...coreUpdate,
    unit_label: entry.unitLabel || null,
    measurement_basis: entry.measurementBasis || null,
    verification_status: entry.verificationStatus || null,
    food_state: entry.foodState || null,
  };

  const { error } = await supabase
    .from('food_entries')
    .update(extendedUpdate)
    .eq('id', entry.id)
    .eq('user_id', entry.userId);
  if (error && isMissingColumnError(error)) {
    const fallback = await supabase
      .from('food_entries')
      .update(coreUpdate)
      .eq('id', entry.id)
      .eq('user_id', entry.userId);
    return formatDbError(fallback.error);
  }
  return formatDbError(error);
}

export async function deleteFoodEntryDb(
  userId: string,
  entryId: string
): Promise<DbMutationResult> {
  const { error } = await supabase
    .from('food_entries')
    .delete()
    .eq('id', entryId)
    .eq('user_id', userId);
  return formatDbError(error);
}

export async function insertCustomFoodDb(
  userId: string,
  food: FoodItem
): Promise<DbMutationResult> {
  const corePayload = {
    id: food.id,
    user_id: userId,
    name: food.name,
    category: food.category,
    serving_name: food.servingName,
    serving_weight_grams: food.servingWeightGrams,
    calories: food.calories,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    fibre: food.fibre,
    created_at: food.createdAt || new Date().toISOString(),
  };

  const extendedPayload = {
    ...corePayload,
    brand: food.brand || null,
    other_nutrients: food.micronutrients || {},
    food_state: food.foodState || 'prepared',
    measurement_basis: food.measurementBasis || 'per_serving',
    verification_status: food.verificationStatus || 'user_provided',
    source_name: food.sourceName || 'Personal Custom Food',
    source_id: food.sourceId || null,
    source_url: food.sourceUrl || null,
  };

  const { error } = await supabase.from('custom_foods').insert(extendedPayload);
  if (error && isMissingColumnError(error)) {
    const legacyExt = {
      ...corePayload,
      brand: food.brand || null,
      other_nutrients: food.micronutrients || {},
    };
    const fallback1 = await supabase.from('custom_foods').insert(legacyExt);
    if (fallback1.error && isMissingColumnError(fallback1.error)) {
      const fallback2 = await supabase.from('custom_foods').insert(corePayload);
      return formatDbError(fallback2.error);
    }
    return formatDbError(fallback1.error);
  }
  return formatDbError(error);
}

export async function updateCustomFoodDb(
  userId: string,
  foodId: string,
  updates: Partial<FoodItem>
): Promise<DbMutationResult> {
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.category !== undefined) payload.category = updates.category;
  if (updates.servingName !== undefined) payload.serving_name = updates.servingName;
  if (updates.servingWeightGrams !== undefined)
    payload.serving_weight_grams = updates.servingWeightGrams;
  if (updates.calories !== undefined) payload.calories = updates.calories;
  if (updates.protein !== undefined) payload.protein = updates.protein;
  if (updates.carbs !== undefined) payload.carbs = updates.carbs;
  if (updates.fat !== undefined) payload.fat = updates.fat;
  if (updates.fibre !== undefined) payload.fibre = updates.fibre;

  const extendedPayload: Record<string, unknown> = { ...payload };
  if (updates.brand !== undefined) extendedPayload.brand = updates.brand || null;
  if (updates.micronutrients !== undefined)
    extendedPayload.other_nutrients = updates.micronutrients || {};

  const { error } = await supabase
    .from('custom_foods')
    .update(extendedPayload)
    .eq('id', foodId)
    .eq('user_id', userId);

  if (error && isMissingColumnError(error)) {
    const fallback = await supabase
      .from('custom_foods')
      .update(payload)
      .eq('id', foodId)
      .eq('user_id', userId);
    return formatDbError(fallback.error);
  }
  return formatDbError(error);
}

export async function deleteCustomFoodDb(
  userId: string,
  foodId: string
): Promise<DbMutationResult> {
  const { error } = await supabase
    .from('custom_foods')
    .delete()
    .eq('id', foodId)
    .eq('user_id', userId);
  return formatDbError(error);
}

export async function upsertFoodPreferencesDb(
  userId: string,
  favoriteFoodIds: string[],
  recentFoodIds: string[]
): Promise<DbMutationResult> {
  const { error } = await supabase.from('user_food_preferences').upsert({
    user_id: userId,
    favorite_food_ids: favoriteFoodIds,
    recent_food_ids: recentFoodIds,
    updated_at: new Date().toISOString(),
  });
  return formatDbError(error);
}

export async function insertWeightEntryDb(entry: WeightEntry): Promise<DbMutationResult> {
  const { error } = await supabase.from('weight_entries').insert({
    id: entry.id,
    user_id: entry.userId,
    weight_kg: entry.weightKg,
    date: entry.date,
    notes: entry.notes || null,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  });
  return formatDbError(error);
}

export async function updateWeightEntryDb(entry: WeightEntry): Promise<DbMutationResult> {
  const { error } = await supabase
    .from('weight_entries')
    .update({
      weight_kg: entry.weightKg,
      date: entry.date,
      notes: entry.notes || null,
      updated_at: entry.updatedAt,
    })
    .eq('id', entry.id)
    .eq('user_id', entry.userId);
  return formatDbError(error);
}

export async function deleteWeightEntryDb(
  userId: string,
  entryId: string
): Promise<DbMutationResult> {
  const { error } = await supabase
    .from('weight_entries')
    .delete()
    .eq('id', entryId)
    .eq('user_id', userId);
  return formatDbError(error);
}

export async function syncLocalStateToSupabase(
  userId: string,
  state: MacroLogPersistedState
): Promise<DbMutationResult> {
  const resProfile = await upsertProfileAndSettings(userId, state.profile, state.settings);
  if (!resProfile.ok) return resProfile;

  await upsertNutritionGoals(userId, state.goals);
  await upsertWeightGoal(userId, state.weightGoal);
  await upsertFoodPreferencesDb(userId, state.favoriteFoodIds, state.recentFoodIds);

  if (state.customFoods.length > 0) {
    for (const f of state.customFoods) {
      await insertCustomFoodDb(userId, f);
    }
  }

  if (state.foodEntries.length > 0) {
    for (const e of state.foodEntries) {
      await insertFoodEntryDb(e);
    }
  }

  if (state.weightEntries.length > 0) {
    await supabase.from('weight_entries').upsert(
      state.weightEntries.map((w) => ({
        id: w.id,
        user_id: userId,
        weight_kg: w.weightKg,
        date: w.date,
        notes: w.notes || null,
        created_at: w.createdAt,
        updated_at: w.updatedAt,
      }))
    );
  }

  return { ok: true };
}

export async function saveRecipeToSupabase(
  userId: string,
  recipeId: string,
  calculation: {
    name: string;
    preparationStyle: 'homemade' | 'restaurant';
    rawTotalWeightGrams: number;
    cookingYieldFactor: number;
    finalCookedWeightGrams: number;
    servingsCount: number;
    asFoodItem: { category?: string };
  },
  ingredients: Array<{
    food: { id: string; name: string };
    rawWeightGrams: number;
    ediblePortionFactor?: number;
    retentionFactor?: number;
    isCookingFat?: boolean;
  }>
): Promise<DbMutationResult> {
  const now = new Date().toISOString();
  const { error: recipeErr } = await supabase.from('recipes').upsert({
    id: recipeId,
    user_id: userId,
    name: calculation.name,
    category: calculation.asFoodItem.category || 'Homemade foods',
    preparation_style: calculation.preparationStyle,
    raw_total_weight_g: calculation.rawTotalWeightGrams,
    cooking_yield_factor: calculation.cookingYieldFactor,
    final_cooked_weight_g: calculation.finalCookedWeightGrams,
    servings_count: calculation.servingsCount,
    verification_status: 'estimated',
    created_at: now,
    updated_at: now,
  });

  if (recipeErr) return formatDbError(recipeErr);

  const validIngs = ingredients.filter((i) => i.rawWeightGrams > 0);
  if (validIngs.length > 0) {
    await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
    const { error: ingErr } = await supabase.from('recipe_ingredients').insert(
      validIngs.map((ing, idx) => ({
        recipe_id: recipeId,
        food_id: ing.food.id,
        ingredient_name: ing.food.name,
        raw_weight_g: ing.rawWeightGrams,
        edible_portion_factor: ing.ediblePortionFactor ?? 1,
        retention_factor: ing.retentionFactor ?? 1,
        is_cooking_fat: Boolean(ing.isCookingFat),
        sort_order: idx,
      }))
    );
    if (ingErr) return formatDbError(ingErr);
  }

  return { ok: true };
}

export async function fetchUserRecipesFromSupabase(userId: string) {
  const { data, error } = await supabase
    .from('recipes')
    .select('*, recipe_ingredients(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    return { ok: false, recipes: [], errorMessage: error.message };
  }
  return { ok: true, recipes: data || [] };
}

