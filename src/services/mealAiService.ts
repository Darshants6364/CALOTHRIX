import { supabase } from '../lib/supabaseClient';
import {
  AiMealScanRecord,
  AnalyzedMealItem,
  MealAiAnalysisResult,
  MealCategory,
} from '../types';

export async function analyzeMealViaApi(params: {
  mode: 'photo' | 'voice' | 'text';
  mimeType?: string;
  mediaBase64?: string;
  promptText?: string;
  mealHint?: MealCategory;
}): Promise<MealAiAnalysisResult> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 28000);

  try {
    const res = await fetch('/api/ai/analyze-meal', {
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
        'Analysis timed out after 28 seconds. Please check your connection and try again.'
      );
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
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
