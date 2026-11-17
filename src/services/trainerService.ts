import { supabase } from '../lib/supabaseClient';
import {
  ClientInvitation,
  FitnessGoalType,
  FoodLogEntry,
  FoodSourceType,
  GoalSpeed,
  MealGuidelineItem,
  NutritionGoals,
  TargetRecommendation,
  TRAINER_SUBSCRIPTION_PLANS,
  TrainerClientPlan,
  TrainerClientRelationship,
  TrainerClientSnapshot,
  TrainerNote,
  TrainerProfile,
  TrainerSubscriptionTier,
  WeightEntry,
  WeeklyClientCheckin,
} from '../types';

export interface ServiceResult<T = void> {
  ok: boolean;
  data?: T;
  error?: string;
}

function mapTrainerProfile(row: Record<string, unknown>): TrainerProfile {
  const tier = ((row.subscription_tier as string) || 'free') as TrainerSubscriptionTier;
  return {
    userId: String(row.user_id),
    displayName: String(row.display_name || 'Fitness Coach'),
    bio: String(row.bio || ''),
    specialties: Array.isArray(row.specialties) ? (row.specialties as string[]) : [],
    certifications: Array.isArray(row.certifications) ? (row.certifications as string[]) : [],
    acceptingClients: Boolean(row.accepting_clients ?? true),
    subscriptionTier: tier in TRAINER_SUBSCRIPTION_PLANS ? tier : 'free',
    maxClients: Number(row.max_clients ?? 5),
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

function mapRelationship(row: Record<string, unknown>): TrainerClientRelationship {
  return {
    id: String(row.id),
    trainerId: String(row.trainer_id),
    clientId: String(row.client_id),
    status: (row.status as TrainerClientRelationship['status']) || 'pending',
    canViewProfile: row.can_view_profile !== false,
    canViewNutrition: Boolean(row.can_view_nutrition),
    canViewWeight: Boolean(row.can_view_weight),
    canViewGoals: Boolean(row.can_view_goals),
    canAddNotes: Boolean(row.can_add_notes),
    canManageGoals: row.can_manage_goals !== false,
    isArchived: Boolean(row.is_archived),
    authorizedAt: row.authorized_at ? String(row.authorized_at) : undefined,
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

function mapInvitation(row: Record<string, unknown>): ClientInvitation {
  return {
    id: String(row.id),
    trainerId: String(row.trainer_id),
    clientEmail: String(row.client_email || ''),
    clientName: row.client_name ? String(row.client_name) : undefined,
    inviteToken: String(row.invite_token || ''),
    message: row.message ? String(row.message) : undefined,
    status: (row.status as ClientInvitation['status']) || 'pending',
    expiresAt: String(row.expires_at || ''),
    createdAt: String(row.created_at || new Date().toISOString()),
    trainerName: row.trainer_name ? String(row.trainer_name) : undefined,
    trainerBio: row.trainer_bio ? String(row.trainer_bio) : undefined,
    trainerSpecialties: Array.isArray(row.trainer_specialties)
      ? (row.trainer_specialties as string[])
      : undefined,
  };
}

function mapRecommendation(row: Record<string, unknown>): TargetRecommendation {
  return {
    id: String(row.id),
    trainerId: String(row.trainer_id),
    clientId: String(row.client_id),
    trainerName: row.trainer_name ? String(row.trainer_name) : undefined,
    recommendedCalories: Number(row.recommended_calories || 0),
    recommendedProtein: Number(row.recommended_protein || 0),
    recommendedCarbs: Number(row.recommended_carbs || 0),
    recommendedFat: Number(row.recommended_fat || 0),
    recommendedFibre: Number(row.recommended_fibre || 28),
    recommendedTargetWeightKg:
      row.recommended_target_weight_kg != null
        ? Number(row.recommended_target_weight_kg)
        : undefined,
    rationale: String(row.rationale || ''),
    status: (row.status as TargetRecommendation['status']) || 'pending',
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : undefined,
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

// ---------- Trainer Profile & Subscription ----------

export async function fetchTrainerProfile(
  userId: string
): Promise<ServiceResult<TrainerProfile | null>> {
  const { data, error } = await supabase
    .from('trainer_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data ? mapTrainerProfile(data) : null };
}

export async function upsertTrainerProfile(params: {
  userId: string;
  displayName: string;
  bio: string;
  specialties: string[];
  certifications: string[];
  acceptingClients: boolean;
  subscriptionTier?: TrainerSubscriptionTier;
}): Promise<ServiceResult<TrainerProfile>> {
  const tier = params.subscriptionTier || 'free';
  const maxClients = TRAINER_SUBSCRIPTION_PLANS[tier].maxClients ?? 9999;

  const { data, error } = await supabase
    .from('trainer_profiles')
    .upsert({
      user_id: params.userId,
      display_name: params.displayName.trim() || 'Fitness Coach',
      bio: params.bio.trim(),
      specialties: params.specialties,
      certifications: params.certifications,
      accepting_clients: params.acceptingClients,
      subscription_tier: tier,
      max_clients: maxClients,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error || !data) return { ok: false, error: error?.message || 'Failed to save trainer profile' };
  return { ok: true, data: mapTrainerProfile(data) };
}

// ---------- Invitations (Trainer & Client) ----------

export async function fetchTrainerInvitations(
  trainerId: string
): Promise<ServiceResult<ClientInvitation[]>> {
  const { data, error } = await supabase
    .from('client_invitations')
    .select('*')
    .eq('trainer_id', trainerId)
    .order('created_at', { ascending: false });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data || []).map((r) => mapInvitation(r)) };
}

export async function createClientInvitation(params: {
  trainerId: string;
  clientEmail?: string;
  clientName?: string;
  message?: string;
}): Promise<ServiceResult<ClientInvitation>> {
  const cleanEmail = (params.clientEmail || '').trim().toLowerCase();

  // Check trainer capacity before creating new invite
  const [{ data: tp }, { count: activeCount }] = await Promise.all([
    supabase
      .from('trainer_profiles')
      .select('max_clients, subscription_tier')
      .eq('user_id', params.trainerId)
      .maybeSingle(),
    supabase
      .from('trainer_clients')
      .select('id', { count: 'exact', head: true })
      .eq('trainer_id', params.trainerId)
      .eq('status', 'active')
      .eq('is_archived', false),
  ]);

  const maxClients = Number(tp?.max_clients ?? 5);
  if ((activeCount ?? 0) >= maxClients) {
    return {
      ok: false,
      error: `Your current plan supports up to ${maxClients} active clients. Upgrade or archive inactive clients before inviting more.`,
    };
  }

  const { data, error } = await supabase
    .from('client_invitations')
    .insert({
      trainer_id: params.trainerId,
      client_email: cleanEmail,
      client_name: params.clientName?.trim() || null,
      message: params.message?.trim() || null,
      status: 'pending',
    })
    .select('*')
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message || 'Could not create invitation' };
  }
  return { ok: true, data: mapInvitation(data) };
}

export async function deleteTrainerInvitation(
  trainerId: string,
  invitationId: string
): Promise<ServiceResult> {
  const { error } = await supabase
    .from('client_invitations')
    .delete()
    .eq('id', invitationId)
    .eq('trainer_id', trainerId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function lookupInvitationByToken(
  token: string
): Promise<ServiceResult<ClientInvitation | null>> {
  const { data, error } = await supabase.rpc('get_invitation_by_token', {
    p_token: token.trim(),
  });
  if (error) return { ok: false, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: true, data: null };
  return {
    ok: true,
    data: mapInvitation({
      ...row,
      invite_token: token.trim(),
    }),
  };
}

export async function fetchMyPendingInvitations(): Promise<ServiceResult<ClientInvitation[]>> {
  const { data, error } = await supabase
    .from('client_invitations')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) return { ok: false, error: error.message };
  const rows = data || [];
  if (rows.length === 0) return { ok: true, data: [] };

  const trainerIds = Array.from(new Set(rows.map((r) => String(r.trainer_id))));
  const { data: trainerProfiles } = await supabase
    .from('trainer_profiles')
    .select('user_id, display_name, bio, specialties')
    .in('user_id', trainerIds);

  const tpMap = new Map(
    (trainerProfiles || []).map((tp) => [String(tp.user_id), tp])
  );

  return {
    ok: true,
    data: rows.map((r) => {
      const tp = tpMap.get(String(r.trainer_id));
      return mapInvitation({
        ...r,
        trainer_name: tp?.display_name,
        trainer_bio: tp?.bio,
        trainer_specialties: tp?.specialties,
      });
    }),
  };
}

export async function respondToTrainerInvitation(params: {
  invitationId?: string;
  inviteToken?: string;
  accept: boolean;
  permissions?: {
    canViewProfile: boolean;
    canViewNutrition: boolean;
    canViewWeight: boolean;
    canViewGoals: boolean;
    canAddNotes: boolean;
    canManageGoals?: boolean;
  };
}): Promise<ServiceResult> {
  const perms = params.permissions || {
    canViewProfile: true,
    canViewNutrition: true,
    canViewWeight: true,
    canViewGoals: true,
    canAddNotes: true,
    canManageGoals: true,
  };

  let { data, error } = await supabase.rpc('respond_to_trainer_invitation', {
    p_invitation_id: params.invitationId || null,
    p_invite_token: params.inviteToken || null,
    p_accept: params.accept,
    p_can_view_profile: perms.canViewProfile,
    p_can_view_nutrition: perms.canViewNutrition,
    p_can_view_weight: perms.canViewWeight,
    p_can_view_goals: perms.canViewGoals,
    p_can_add_notes: perms.canAddNotes,
    p_can_manage_goals: perms.canManageGoals ?? true,
  });

  // Backwards-compatible fallback if older 8-param RPC is still deployed
  if (error && error.message?.toLowerCase().includes('function')) {
    const fallback = await supabase.rpc('respond_to_trainer_invitation', {
      p_invitation_id: params.invitationId || null,
      p_invite_token: params.inviteToken || null,
      p_accept: params.accept,
      p_can_view_profile: perms.canViewProfile,
      p_can_view_nutrition: perms.canViewNutrition,
      p_can_view_weight: perms.canViewWeight,
      p_can_view_goals: perms.canViewGoals,
      p_can_add_notes: perms.canAddNotes,
    });
    data = fallback.data;
    error = fallback.error;
  }

  if (error) return { ok: false, error: error.message };
  const result = data as { ok?: boolean; error?: string } | null;
  if (result && result.ok === false) {
    return { ok: false, error: result.error || 'Could not process invitation' };
  }
  return { ok: true };
}

// ---------- Trainer Roster & Authorized Client Data ----------

export async function fetchTrainerClientsAndSnapshots(
  trainerId: string
): Promise<ServiceResult<TrainerClientSnapshot[]>> {
  const { data: relRows, error: relErr } = await supabase
    .from('trainer_clients')
    .select('*')
    .eq('trainer_id', trainerId)
    .in('status', ['active', 'pending'])
    .order('authorized_at', { ascending: false, nullsFirst: false });

  if (relErr) return { ok: false, error: relErr.message };
  const relationships = (relRows || []).map((r) => mapRelationship(r));
  const activeClientIds = relationships
    .filter((r) => r.status === 'active')
    .map((r) => r.clientId);

  if (activeClientIds.length === 0) {
    return {
      ok: true,
      data: relationships.map((relationship) => ({
        relationship,
        profile: null,
        goals: null,
        foodEntries: [],
        weightEntries: [],
      })),
    };
  }

  // Fetch authorized client tables (RLS strictly enforces client consent flags)
  const [profilesRes, goalsRes, foodRes, weightRes] = await Promise.all([
    supabase.from('profiles').select('*').in('user_id', activeClientIds),
    supabase.from('nutrition_goals').select('*').in('user_id', activeClientIds),
    supabase
      .from('food_entries')
      .select('*')
      .in('user_id', activeClientIds)
      .order('date', { ascending: false })
      .limit(2500),
    supabase
      .from('weight_entries')
      .select('*')
      .in('user_id', activeClientIds)
      .order('date', { ascending: false })
      .limit(1000),
  ]);

  const profileMap = new Map((profilesRes.data || []).map((p) => [String(p.user_id), p]));
  const goalMap = new Map((goalsRes.data || []).map((g) => [String(g.user_id), g]));

  const foodByClient = new Map<string, FoodLogEntry[]>();
  for (const row of foodRes.data || []) {
    const uid = String(row.user_id);
    const list = foodByClient.get(uid) || [];
    list.push({
      id: String(row.id),
      userId: uid,
      date: String(row.date),
      mealType: row.meal_type,
      foodId: String(row.food_id),
      foodName: String(row.food_name),
      quantityGrams: Number(row.quantity_grams),
      servingsCount: Number(row.servings_count),
      servingName: String(row.serving_name),
      calories: Number(row.calories),
      protein: Number(row.protein),
      carbs: Number(row.carbs),
      fat: Number(row.fat),
      fibre: Number(row.fibre ?? 0),
      sourceName: row.source_name || undefined,
      sourceType: (row.source_type as FoodSourceType) || undefined,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    });
    foodByClient.set(uid, list);
  }

  const weightByClient = new Map<string, WeightEntry[]>();
  for (const row of weightRes.data || []) {
    const uid = String(row.user_id);
    const list = weightByClient.get(uid) || [];
    list.push({
      id: String(row.id),
      userId: uid,
      weightKg: Number(row.weight_kg),
      date: String(row.date),
      notes: row.notes || undefined,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    });
    weightByClient.set(uid, list);
  }

  const snapshots: TrainerClientSnapshot[] = relationships.map((relationship) => {
    const p = relationship.canViewProfile ? profileMap.get(relationship.clientId) : undefined;
    const g = relationship.canViewGoals ? goalMap.get(relationship.clientId) : undefined;

    return {
      relationship,
      profile: p
        ? {
            userId: String(p.user_id),
            name: String(p.name || 'Client'),
            email: p.email ? String(p.email) : undefined,
            avatarUrl: p.avatar_url ? String(p.avatar_url) : undefined,
            age: Number(p.age ?? 0),
            heightCm: Number(p.height_cm ?? 0),
            currentWeightKg: Number(p.current_weight_kg ?? 0),
            targetWeightKg: Number(p.target_weight_kg ?? 0),
            fitnessGoal: (p.fitness_goal as FitnessGoalType) || 'maintenance',
            goalSpeed: (p.goal_speed as GoalSpeed) || 'moderate',
          }
        : null,
      goals: g
        ? ({
            userId: String(g.user_id),
            preset: g.preset || 'custom',
            calories: Number(g.calories ?? 0),
            protein: Number(g.protein ?? 0),
            carbs: Number(g.carbs ?? 0),
            fat: Number(g.fat ?? 0),
            fibre: Number(g.fibre ?? 0),
            targetWeightKg:
              g.target_weight_kg != null && Number(g.target_weight_kg) > 0
                ? Number(g.target_weight_kg)
                : undefined,
            estimatedBmr: g.estimated_bmr != null ? Number(g.estimated_bmr) : undefined,
            estimatedTdee: g.estimated_tdee != null ? Number(g.estimated_tdee) : undefined,
            bmi: g.bmi != null ? Number(g.bmi) : undefined,
            goalSpeed: (g.goal_speed as GoalSpeed) || undefined,
            updatedAt: String(g.updated_at || new Date().toISOString()),
          } satisfies NutritionGoals)
        : null,
      foodEntries: relationship.canViewNutrition
        ? foodByClient.get(relationship.clientId) || []
        : [],
      weightEntries: relationship.canViewWeight
        ? weightByClient.get(relationship.clientId) || []
        : [],
    };
  });

  return { ok: true, data: snapshots };
}

export async function manageTrainerClientConnection(
  relationshipId: string,
  action: 'archive' | 'restore' | 'remove'
): Promise<ServiceResult> {
  const { data, error } = await supabase.rpc('trainer_manage_client_connection', {
    p_relationship_id: relationshipId,
    p_action: action,
  });
  if (error) return { ok: false, error: error.message };
  const result = data as { ok?: boolean; error?: string } | null;
  if (result && result.ok === false) {
    return { ok: false, error: result.error || 'Action failed' };
  }
  return { ok: true };
}

// ---------- Trainer Private Notes ----------

export async function fetchTrainerNotesForClient(
  trainerId: string,
  clientId: string
): Promise<ServiceResult<TrainerNote[]>> {
  const { data, error } = await supabase
    .from('trainer_notes')
    .select('*')
    .eq('trainer_id', trainerId)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data || []).map((r) => ({
      id: String(r.id),
      trainerId: String(r.trainer_id),
      clientId: String(r.client_id),
      category: (r.category as TrainerNote['category']) || 'general',
      note: String(r.note),
      createdAt: String(r.created_at),
    })),
  };
}

export async function addTrainerNote(params: {
  trainerId: string;
  clientId: string;
  category: TrainerNote['category'];
  note: string;
}): Promise<ServiceResult<TrainerNote>> {
  const { data, error } = await supabase
    .from('trainer_notes')
    .insert({
      trainer_id: params.trainerId,
      client_id: params.clientId,
      category: params.category,
      note: params.note.trim(),
    })
    .select('*')
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message || 'Could not add note' };
  }
  return {
    ok: true,
    data: {
      id: String(data.id),
      trainerId: String(data.trainer_id),
      clientId: String(data.client_id),
      category: (data.category as TrainerNote['category']) || 'general',
      note: String(data.note),
      createdAt: String(data.created_at),
    },
  };
}

export async function deleteTrainerNote(
  trainerId: string,
  noteId: string
): Promise<ServiceResult> {
  const { error } = await supabase
    .from('trainer_notes')
    .delete()
    .eq('id', noteId)
    .eq('trainer_id', trainerId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ---------- Weekly Client Check-Ins ----------

export async function fetchClientCheckinsForTrainer(
  trainerId: string,
  clientId?: string
): Promise<ServiceResult<WeeklyClientCheckin[]>> {
  let query = supabase
    .from('weekly_client_checkins')
    .select('*')
    .eq('trainer_id', trainerId)
    .order('created_at', { ascending: false });

  if (clientId) {
    query = query.eq('client_id', clientId);
  }

  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: (data || []).map((r) => ({
      id: String(r.id),
      clientId: String(r.client_id),
      trainerId: String(r.trainer_id),
      weekStartDate: String(r.week_start_date),
      avgCalories: Number(r.avg_calories || 0),
      avgProtein: Number(r.avg_protein || 0),
      avgWeightKg: r.avg_weight_kg != null ? Number(r.avg_weight_kg) : undefined,
      clientNotes: r.client_notes ? String(r.client_notes) : undefined,
      trainerFeedback: r.trainer_feedback ? String(r.trainer_feedback) : undefined,
      status: (r.status as WeeklyClientCheckin['status']) || 'submitted',
      createdAt: String(r.created_at),
    })),
  };
}

export async function reviewClientCheckin(params: {
  trainerId: string;
  checkinId: string;
  trainerFeedback: string;
}): Promise<ServiceResult> {
  const { error } = await supabase
    .from('weekly_client_checkins')
    .update({
      trainer_feedback: params.trainerFeedback.trim(),
      status: 'reviewed',
    })
    .eq('id', params.checkinId)
    .eq('trainer_id', params.trainerId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function submitClientCheckin(params: {
  clientId: string;
  trainerId: string;
  weekStartDate: string;
  avgCalories: number;
  avgProtein: number;
  avgWeightKg?: number;
  clientNotes?: string;
}): Promise<ServiceResult> {
  const { error } = await supabase.from('weekly_client_checkins').insert({
    client_id: params.clientId,
    trainer_id: params.trainerId,
    week_start_date: params.weekStartDate,
    avg_calories: Math.round(params.avgCalories),
    avg_protein: Math.round(params.avgProtein),
    avg_weight_kg: params.avgWeightKg ?? null,
    client_notes: params.clientNotes?.trim() || null,
    status: 'submitted',
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ---------- Target Recommendations (Trainer -> Client Approval) ----------

export async function fetchTargetRecommendationsForTrainer(
  trainerId: string,
  clientId: string
): Promise<ServiceResult<TargetRecommendation[]>> {
  const { data, error } = await supabase
    .from('target_recommendations')
    .select('*')
    .eq('trainer_id', trainerId)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data || []).map((r) => mapRecommendation(r)) };
}

export async function createTargetRecommendation(params: {
  trainerId: string;
  clientId: string;
  recommendedCalories: number;
  recommendedProtein: number;
  recommendedCarbs: number;
  recommendedFat: number;
  recommendedFibre: number;
  recommendedTargetWeightKg?: number;
  rationale: string;
}): Promise<ServiceResult<TargetRecommendation>> {
  const { data, error } = await supabase
    .from('target_recommendations')
    .insert({
      trainer_id: params.trainerId,
      client_id: params.clientId,
      recommended_calories: Math.round(params.recommendedCalories),
      recommended_protein: Math.round(params.recommendedProtein),
      recommended_carbs: Math.round(params.recommendedCarbs),
      recommended_fat: Math.round(params.recommendedFat),
      recommended_fibre: Math.round(params.recommendedFibre),
      recommended_target_weight_kg: params.recommendedTargetWeightKg ?? null,
      rationale: params.rationale.trim(),
      status: 'pending',
    })
    .select('*')
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message || 'Could not send recommendation' };
  }
  return { ok: true, data: mapRecommendation(data) };
}

export async function fetchClientTargetRecommendations(
  clientId: string
): Promise<ServiceResult<TargetRecommendation[]>> {
  const { data, error } = await supabase
    .from('target_recommendations')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) return { ok: false, error: error.message };
  const rows = data || [];
  if (rows.length === 0) return { ok: true, data: [] };

  const trainerIds = Array.from(new Set(rows.map((r) => String(r.trainer_id))));
  const { data: trainers } = await supabase
    .from('trainer_profiles')
    .select('user_id, display_name')
    .in('user_id', trainerIds);
  const nameMap = new Map((trainers || []).map((t) => [String(t.user_id), String(t.display_name)]));

  return {
    ok: true,
    data: rows.map((r) =>
      mapRecommendation({
        ...r,
        trainer_name: nameMap.get(String(r.trainer_id)) || 'Your Trainer',
      })
    ),
  };
}

export async function respondToTargetRecommendation(
  clientId: string,
  recommendationId: string,
  approve: boolean
): Promise<ServiceResult> {
  const { error } = await supabase
    .from('target_recommendations')
    .update({
      status: approve ? 'approved' : 'declined',
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', recommendationId)
    .eq('client_id', clientId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ---------- Client-Side Coaching & Privacy Controls ----------

export async function fetchClientTrainerConnections(
  clientId: string
): Promise<ServiceResult<TrainerClientRelationship[]>> {
  const { data, error } = await supabase
    .from('trainer_clients')
    .select('*')
    .eq('client_id', clientId)
    .neq('status', 'revoked')
    .order('created_at', { ascending: false });

  if (error) return { ok: false, error: error.message };
  const rels = (data || []).map((r) => mapRelationship(r));
  if (rels.length === 0) return { ok: true, data: [] };

  const trainerIds = Array.from(new Set(rels.map((r) => r.trainerId)));
  const { data: trainers } = await supabase
    .from('trainer_profiles')
    .select('user_id, display_name, bio, specialties, certifications')
    .in('user_id', trainerIds);

  const tpMap = new Map((trainers || []).map((t) => [String(t.user_id), t]));
  return {
    ok: true,
    data: rels.map((r) => {
      const tp = tpMap.get(r.trainerId);
      return {
        ...r,
        trainerProfile: tp
          ? {
              userId: String(tp.user_id),
              displayName: String(tp.display_name || 'Fitness Coach'),
              bio: String(tp.bio || ''),
              specialties: Array.isArray(tp.specialties) ? (tp.specialties as string[]) : [],
              certifications: Array.isArray(tp.certifications)
                ? (tp.certifications as string[])
                : [],
            }
          : undefined,
      };
    }),
  };
}

export async function updateClientTrainerPermissions(
  clientId: string,
  relationshipId: string,
  updates: Partial<{
    canViewProfile: boolean;
    canViewNutrition: boolean;
    canViewWeight: boolean;
    canViewGoals: boolean;
    canAddNotes: boolean;
    canManageGoals: boolean;
  }>
): Promise<ServiceResult> {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (updates.canViewProfile !== undefined) payload.can_view_profile = updates.canViewProfile;
  if (updates.canViewNutrition !== undefined) payload.can_view_nutrition = updates.canViewNutrition;
  if (updates.canViewWeight !== undefined) payload.can_view_weight = updates.canViewWeight;
  if (updates.canViewGoals !== undefined) payload.can_view_goals = updates.canViewGoals;
  if (updates.canAddNotes !== undefined) payload.can_add_notes = updates.canAddNotes;
  if (updates.canManageGoals !== undefined) payload.can_manage_goals = updates.canManageGoals;

  const { error } = await supabase
    .from('trainer_clients')
    .update(payload)
    .eq('id', relationshipId)
    .eq('client_id', clientId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function revokeClientTrainerAccess(
  clientId: string,
  relationshipId: string
): Promise<ServiceResult> {
  const { error } = await supabase
    .from('trainer_clients')
    .update({
      status: 'revoked',
      can_view_profile: false,
      can_view_nutrition: false,
      can_view_weight: false,
      can_view_goals: false,
      can_add_notes: false,
      can_manage_goals: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', relationshipId)
    .eq('client_id', clientId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ---------- Direct Trainer Goal Editing & Client Coaching Blueprint ----------

export async function trainerUpdateClientGoals(params: {
  clientId: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  targetWeightKg?: number;
  preset?: string;
  fitnessGoal?: FitnessGoalType;
  goalSpeed?: GoalSpeed;
}): Promise<ServiceResult> {
  const { data, error } = await supabase.rpc('trainer_update_client_goals', {
    p_client_id: params.clientId,
    p_calories: Math.round(params.calories),
    p_protein: Math.round(params.protein),
    p_carbs: Math.round(params.carbs),
    p_fat: Math.round(params.fat),
    p_fibre: Math.round(params.fibre),
    p_target_weight_kg: params.targetWeightKg ?? null,
    p_preset: params.preset || 'custom',
    p_fitness_goal: params.fitnessGoal ?? null,
    p_goal_speed: params.goalSpeed ?? null,
  });

  if (error) {
    const msg = error.message || '';
    if (
      msg.includes('trainer_update_client_goals') ||
      msg.toLowerCase().includes('schema cache') ||
      msg.toLowerCase().includes('could not find the function')
    ) {
      return {
        ok: false,
        error:
          'Database update needed: function public.trainer_update_client_goals is missing in Supabase. Run the latest SQL migration in Supabase SQL Editor and retry.',
      };
    }
    return { ok: false, error: msg };
  }
  const result = data as { ok?: boolean; error?: string } | null;
  if (result && result.ok === false) {
    return { ok: false, error: result.error || 'Could not update client goals' };
  }
  return { ok: true };
}

function mapTrainerClientPlan(row: Record<string, unknown>): TrainerClientPlan {
  return {
    id: String(row.id),
    trainerId: String(row.trainer_id),
    clientId: String(row.client_id),
    trainerName: row.trainer_name ? String(row.trainer_name) : undefined,
    phaseTitle: String(row.phase_title || 'Custom Nutrition Phase'),
    coachSummary: String(row.coach_summary || ''),
    dailyWaterGoalMl: Number(row.daily_water_goal_ml || 2500),
    dailyStepsTarget: Number(row.daily_steps_target || 8000),
    mealGuidelines: Array.isArray(row.meal_guidelines)
      ? (row.meal_guidelines as MealGuidelineItem[])
      : [],
    actionItems: Array.isArray(row.action_items)
      ? (row.action_items as string[])
      : [],
    updatedAt: String(row.updated_at || new Date().toISOString()),
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

export async function fetchTrainerClientPlan(
  trainerId: string,
  clientId: string
): Promise<ServiceResult<TrainerClientPlan | null>> {
  const { data, error } = await supabase
    .from('trainer_client_plans')
    .select('*')
    .eq('trainer_id', trainerId)
    .eq('client_id', clientId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data ? mapTrainerClientPlan(data) : null };
}

export async function upsertTrainerClientPlan(params: {
  trainerId: string;
  clientId: string;
  phaseTitle: string;
  coachSummary: string;
  dailyWaterGoalMl: number;
  dailyStepsTarget: number;
  mealGuidelines: MealGuidelineItem[];
  actionItems: string[];
}): Promise<ServiceResult<TrainerClientPlan>> {
  const { data, error } = await supabase
    .from('trainer_client_plans')
    .upsert(
      {
        trainer_id: params.trainerId,
        client_id: params.clientId,
        phase_title: params.phaseTitle.trim() || 'Custom Nutrition Phase',
        coach_summary: params.coachSummary.trim(),
        daily_water_goal_ml: Math.max(1000, Math.min(6000, Math.round(params.dailyWaterGoalMl))),
        daily_steps_target: Math.max(1000, Math.min(30000, Math.round(params.dailyStepsTarget))),
        meal_guidelines: params.mealGuidelines,
        action_items: params.actionItems.map((item) => item.trim()).filter(Boolean),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'trainer_id,client_id' }
    )
    .select('*')
    .single();

  if (error || !data) {
    const msg = error?.message || '';
    if (msg.includes('trainer_client_plans')) {
      return {
        ok: false,
        error:
          'Database update needed: table public.trainer_client_plans is missing in Supabase. Run the latest SQL migration in Supabase SQL Editor and retry.',
      };
    }
    return { ok: false, error: msg || 'Could not save client plan' };
  }
  return { ok: true, data: mapTrainerClientPlan(data) };
}

export async function fetchClientActiveCoachPlans(
  clientId: string
): Promise<ServiceResult<TrainerClientPlan[]>> {
  const { data, error } = await supabase
    .from('trainer_client_plans')
    .select('*')
    .eq('client_id', clientId)
    .order('updated_at', { ascending: false });

  if (error) return { ok: false, error: error.message };
  const rows = data || [];
  if (rows.length === 0) return { ok: true, data: [] };

  const trainerIds = Array.from(new Set(rows.map((r) => String(r.trainer_id))));
  const { data: trainers } = await supabase
    .from('trainer_profiles')
    .select('user_id, display_name')
    .in('user_id', trainerIds);

  const nameMap = new Map(
    (trainers || []).map((t) => [String(t.user_id), String(t.display_name || 'Your Trainer')])
  );

  return {
    ok: true,
    data: rows.map((r) =>
      mapTrainerClientPlan({
        ...r,
        trainer_name: nameMap.get(String(r.trainer_id)) || 'Your Trainer',
      })
    ),
  };
}
