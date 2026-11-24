import { supabase } from '../lib/supabaseClient';
import {
  AiMealScanRecord,
  AiPerformanceInsightsResponse,
  AiTrainingEvent,
  AiTrainingInputMode,
  AiTrainingPayloadSnapshot,
  AiTrainingRun,
  AnalyzedMealItem,
  CoachAdviceResult,
  MealAiAnalysisResult,
  MealCategory,
  NutritionLabelOcrResult,
} from '../types';

export type MealPrepStyle = 'homemade_low_oil' | 'standard' | 'restaurant_rich';

export async function analyzeMealViaApi(params: {
  mode: 'photo' | 'voice' | 'text';
  mimeType?: string;
  mediaBase64?: string;
  promptText?: string;
  mealHint?: MealCategory;
  prepStyle?: MealPrepStyle;
}): Promise<MealAiAnalysisResult> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 45000);

  try {
    const res = await fetchWithFreshAuth('/api/ai/analyze-meal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    const data = (await res.json().catch(() => ({}))) as MealAiAnalysisResult & {
      error?: string;
    };

    if (!res.ok) {
      throw new Error(data.error || `Meal analysis failed (${res.status})`);
    }

    return data;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        'Analysis timed out after 45 seconds. Please check your connection and try again.'
      );
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function scanNutritionLabelViaApi(params: {
  mimeType?: string;
  mediaBase64: string;
}): Promise<NutritionLabelOcrResult> {
  const res = await fetchWithFreshAuth('/api/ai/scan-label', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = (await res.json().catch(() => ({}))) as NutritionLabelOcrResult & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || `Label scan failed (${res.status})`);
  }
  return data;
}

export async function askNutritionCoachViaApi(params: {
  prompt: string;
  remainingCalories: number;
  remainingProtein: number;
  remainingCarbs: number;
  remainingFat: number;
  goalCalories: number;
  goalProtein: number;
  dietaryPreference?: string;
  restrictions?: string[];
}): Promise<CoachAdviceResult> {
  const res = await fetchWithFreshAuth('/api/ai/coach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = (await res.json().catch(() => ({}))) as CoachAdviceResult & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || `Coach request failed (${res.status})`);
  }
  return data;
}

export async function uploadMealPhotoToSupabase(params: {
  userId: string;
  blob: Blob;
}): Promise<string | null> {
  try {
    const ext = params.blob.type.includes('png') ? 'png' : 'jpg';
    const path = `${params.userId}/meal_${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('meal-photos')
      .upload(path, params.blob, {
        contentType: params.blob.type || 'image/jpeg',
        upsert: false,
      });
    if (error) return null;
    return path;
  } catch {
    return null;
  }
}

export async function saveMealScanToSupabase(params: {
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
  imageStoragePath?: string | null;
  loggedToDiary: boolean;
}): Promise<AiMealScanRecord | null> {
  try {
    const { data, error } = await supabase
      .from('ai_meal_scans')
      .insert({
        user_id: params.userId,
        input_mode: params.inputMode,
        meal_type: params.mealType,
        meal_title: params.mealTitle,
        transcript_or_notes: params.transcriptOrNotes || null,
        detected_items: params.detectedItems,
        total_calories: Math.round(params.totalCalories),
        total_protein: params.totalProtein,
        total_carbs: params.totalCarbs,
        total_fat: params.totalFat,
        total_fibre: params.totalFibre,
        confidence: params.confidence,
        nutrition_tip: params.nutritionTip || null,
        image_storage_path: params.imageStoragePath || null,
        logged_to_diary: params.loggedToDiary,
      })
      .select('*')
      .single();

    if (error || !data) return null;
    return mapScanRow(data);
  } catch {
    return null;
  }
}

export async function fetchRecentMealScansFromSupabase(
  userId: string,
  limit = 10
): Promise<AiMealScanRecord[]> {
  try {
    const { data, error } = await supabase
      .from('ai_meal_scans')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data.map((row) => mapScanRow(row));
  } catch {
    return [];
  }
}

function mapScanRow(row: Record<string, unknown>): AiMealScanRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    inputMode: (row.input_mode as AiMealScanRecord['inputMode']) || 'photo',
    mealType: (row.meal_type as MealCategory) || 'lunch',
    mealTitle: String(row.meal_title || 'Meal Scan'),
    transcriptOrNotes: row.transcript_or_notes ? String(row.transcript_or_notes) : undefined,
    detectedItems: Array.isArray(row.detected_items)
      ? (row.detected_items as AnalyzedMealItem[])
      : [],
    totalCalories: Number(row.total_calories || 0),
    totalProtein: Number(row.total_protein || 0),
    totalCarbs: Number(row.total_carbs || 0),
    totalFat: Number(row.total_fat || 0),
    totalFibre: Number(row.total_fibre || 0),
    confidence: (row.confidence as AiMealScanRecord['confidence']) || 'moderate',
    nutritionTip: row.nutrition_tip ? String(row.nutrition_tip) : undefined,
    imageStoragePath: row.image_storage_path ? String(row.image_storage_path) : undefined,
    loggedToDiary: Boolean(row.logged_to_diary),
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

async function getAccessTokenHeader(forceRefresh = false): Promise<Record<string, string>> {
  try {
    if (!forceRefresh) {
      const { data } = await supabase.auth.getSession();
      const session = data?.session;
      const expiresAtMs = (session?.expires_at || 0) * 1000;
      const isExpiringSoon = !expiresAtMs || expiresAtMs < Date.now() + 60_000;
      if (session?.access_token && !isExpiringSoon) {
        return { Authorization: `Bearer ${session.access_token}` };
      }
    }

    const { data: refreshed } = await supabase.auth.refreshSession();
    const freshToken = refreshed?.session?.access_token;
    if (freshToken) {
      return { Authorization: `Bearer ${freshToken}` };
    }

    const { data: fallback } = await supabase.auth.getSession();
    if (fallback?.session?.access_token) {
      return { Authorization: `Bearer ${fallback.session.access_token}` };
    }
  } catch {
    // Ignore session lookup errors for guest mode
  }
  return {};
}

async function fetchWithFreshAuth(url: string, init: RequestInit = {}): Promise<Response> {
  const firstHeaders = await getAccessTokenHeader(false);
  const firstRes = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...firstHeaders,
    },
  });

  if (firstRes.status !== 401) {
    return firstRes;
  }

  const retryHeaders = await getAccessTokenHeader(true);
  if (!retryHeaders.Authorization) {
    return firstRes;
  }

  return fetch(url, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...retryHeaders,
    },
  });
}

export async function recordAiTrainingEventApi(params: {
  inputMode: AiTrainingInputMode;
  prepStyle?: string;
  userInputText?: string;
  imageStoragePath?: string;
  aiDescription: string;
  aiRawOutput: AiTrainingPayloadSnapshot;
  userFinalOutput: AiTrainingPayloadSnapshot;
  userFeedbackNote?: string;
}): Promise<{ ok: boolean; event?: AiTrainingEvent } | null> {
  try {
    const res = await fetchWithFreshAuth('/api/ai/training-event', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });
    if (!res.ok) return null;
    return (await res.json()) as { ok: boolean; event?: AiTrainingEvent };
  } catch {
    return null;
  }
}

export async function fetchAdminAiInsightsApi(): Promise<AiPerformanceInsightsResponse> {
  const res = await fetchWithFreshAuth('/api/admin/ai/insights');
  const data = (await res.json().catch(() => ({}))) as AiPerformanceInsightsResponse & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || `Failed to load AI insights (${res.status})`);
  }
  return data;
}

export async function triggerAdminAiTrainingApi(): Promise<{
  ok: boolean;
  run: AiTrainingRun;
  priorsUpdated: number;
}> {
  const res = await fetchWithFreshAuth('/api/admin/ai/train', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok: boolean;
    run: AiTrainingRun;
    priorsUpdated: number;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || `Reinforcement training failed (${res.status})`);
  }
  return data;
}

export async function verifyAdminAiEventApi(
  eventId: string,
  verified: boolean
): Promise<{ ok: boolean; event?: AiTrainingEvent }> {
  const res = await fetchWithFreshAuth(`/api/admin/ai/events/${encodeURIComponent(eventId)}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ verified }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok: boolean;
    event?: AiTrainingEvent;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || `Failed to verify event (${res.status})`);
  }
  return data;
}

export async function toggleAdminAiPriorShareApi(
  priorId: string,
  isVerifiedShared: boolean
): Promise<{ ok: boolean }> {
  const res = await fetchWithFreshAuth(`/api/admin/ai/priors/${encodeURIComponent(priorId)}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isVerifiedShared }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok: boolean;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || `Failed to update shared status (${res.status})`);
  }
  return data;
}
