import { supabase } from '../lib/supabaseClient';
import type {
  FoodItem,
  FoodResultGroup,
  FoodState,
  FoodVersionRecord,
  GroupedFoodResults,
  RegionalSearchSuggestion,
  VerificationStatus,
  WeeklySummaryResult,
} from '../types';

export interface GlobalFoodSearchResult {
  items: FoodItem[];
  grouped?: GroupedFoodResults;
  totalCount?: number;
  page?: number;
  limit?: number;
  hasMore?: boolean;
  elapsedMs?: number;
  regionalSuggestion?: RegionalSearchSuggestion | null;
  sourceMeta?: {
    ifctCount: number;
    dbCount?: number;
    offCount: number;
    usdaCount: number;
    offError?: string;
    usdaError?: string;
    usdaConfigured: boolean;
    externalFallbackUsed?: boolean;
    geminiFallbackUsed?: boolean;
  };
  error?: string;
}

export interface ExternalSourceStatus {
  ifct2017: { active: boolean; count: number; totalReferenceCount?: number; license: string };
  openFoodFacts: { active: boolean; apiVersion: string; license: string };
  usdaFdc: { configured: boolean; envVar: string; license: string };
  supabaseAi: { edgeFunctionsAvailable: boolean };
}

async function getAccessTokenHeader(): Promise<Record<string, string>> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const expiresAtMs = (session?.expires_at || 0) * 1000;
    const isExpiringSoon = !expiresAtMs || expiresAtMs < Date.now() + 60_000;
    if (session?.access_token && !isExpiringSoon) {
      return { Authorization: `Bearer ${session.access_token}` };
    }
    if (session) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (refreshed?.session?.access_token) {
        return { Authorization: `Bearer ${refreshed.session.access_token}` };
      }
    }
    if (session?.access_token) {
      return { Authorization: `Bearer ${session.access_token}` };
    }
  } catch {
    // Ignore session lookup errors
  }
  return {};
}

export async function fetchExternalSourceStatus(): Promise<ExternalSourceStatus | null> {
  try {
    const res = await fetch('/api/foods/status');
    if (!res.ok) return null;
    return (await res.json()) as ExternalSourceStatus;
  } catch {
    return null;
  }
}

export async function searchGlobalFoodsApi(params: {
  query: string;
  category?: string;
  country?: string;
  source?: string;
  barcode?: string;
  semantic?: boolean;
  page?: number;
  limit?: number;
  group?: FoodResultGroup | 'all';
  familyId?: string;
  includeExternal?: boolean;
}): Promise<GlobalFoodSearchResult> {
  try {
    const url = new URL('/api/foods/search', window.location.origin);
    if (params.query) url.searchParams.set('q', params.query);
    if (params.category) url.searchParams.set('category', params.category);
    if (params.country) url.searchParams.set('country', params.country);
    if (params.source) url.searchParams.set('source', params.source);
    if (params.barcode) url.searchParams.set('barcode', params.barcode);
    if (params.semantic) url.searchParams.set('semantic', 'true');
    if (params.page) url.searchParams.set('page', String(params.page));
    if (params.limit) url.searchParams.set('limit', String(params.limit));
    if (params.group && params.group !== 'all') url.searchParams.set('group', params.group);
    if (params.familyId) url.searchParams.set('familyId', params.familyId);
    if (params.includeExternal) url.searchParams.set('includeExternal', 'true');

    const res = await fetch(url.toString());
    if (!res.ok) {
      return { items: [], error: `Global search returned HTTP ${res.status}` };
    }
    return (await res.json()) as GlobalFoodSearchResult;
  } catch (err) {
    return {
      items: [],
      error: err instanceof Error ? err.message : 'Unable to reach global food search service',
    };
  }
}

export async function lookupBarcodeApi(barcode: string): Promise<{
  item: FoodItem | null;
  error?: string;
}> {
  try {
    const authHeaders = await getAccessTokenHeader();
    const res = await fetch(`/api/foods/barcode/${encodeURIComponent(barcode.trim())}`, {
      headers: authHeaders,
    });
    if (!res.ok) {
      return { item: null, error: `Barcode lookup returned HTTP ${res.status}` };
    }
    return (await res.json()) as { item: FoodItem | null; error?: string };
  } catch (err) {
    return {
      item: null,
      error: err instanceof Error ? err.message : 'Barcode lookup failed',
    };
  }
}

export async function readBarcodeImageApi(dataUrl: string): Promise<{
  barcode: string | null;
  error?: string;
}> {
  try {
    const mimeMatch = dataUrl.match(/^data:([^;]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const res = await fetch('/api/foods/read-barcode-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mimeType,
        mediaBase64: dataUrl,
      }),
    });
    const json = (await res.json()) as { barcode?: string | null; error?: string };
    if (!res.ok) {
      return { barcode: null, error: json.error || `HTTP ${res.status}` };
    }
    return { barcode: json.barcode || null, error: json.error };
  } catch (err) {
    return {
      barcode: null,
      error: err instanceof Error ? err.message : 'Unable to read barcode image',
    };
  }
}

export async function semanticFoodSearchApi(query: string): Promise<{
  provider: 'supabase_ai' | 'deterministic_semantic';
  items: FoodItem[];
}> {
  try {
    const authHeaders = await getAccessTokenHeader();
    const res = await fetch('/api/ai/food-search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) {
      return { provider: 'deterministic_semantic', items: [] };
    }
    return (await res.json()) as {
      provider: 'supabase_ai' | 'deterministic_semantic';
      items: FoodItem[];
    };
  } catch {
    return { provider: 'deterministic_semantic', items: [] };
  }
}

export async function fetchWeeklyAiSummaryApi(payload: {
  weekLabel: string;
  avgCalories: number;
  targetCalories: number;
  avgProtein: number;
  targetProtein: number;
  avgCarbs: number;
  avgFat: number;
  avgFibre: number;
  targetFibre: number;
  loggedDays: number;
  weightChangeKg: number | null;
  consistencyPct: number;
}): Promise<WeeklySummaryResult | null> {
  try {
    const authHeaders = await getAccessTokenHeader();
    const res = await fetch('/api/ai/weekly-summary', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    return (await res.json()) as WeeklySummaryResult;
  } catch {
    return null;
  }
}

export async function fetchFoodOverridesApi(): Promise<FoodItem[]> {
  try {
    const authHeaders = await getAccessTokenHeader();
    const res = await fetch('/api/foods/overrides', { headers: authHeaders });
    if (!res.ok) return [];
    const json = (await res.json()) as { items?: FoodItem[] };
    return Array.isArray(json.items) ? json.items : [];
  } catch {
    return [];
  }
}

export async function seedMasterFoodsApi(): Promise<{
  ok: boolean;
  seededFoods: number;
  skippedAdminEdited: number;
  error?: string;
}> {
  try {
    const authHeaders = await getAccessTokenHeader();
    const res = await fetch('/api/admin/seed-foods', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
    });
    const json = (await res.json()) as {
      ok?: boolean;
      seededFoods?: number;
      skippedAdminEdited?: number;
      error?: string;
    };
    return {
      ok: res.ok && Boolean(json.ok),
      seededFoods: json.seededFoods ?? 0,
      skippedAdminEdited: json.skippedAdminEdited ?? 0,
      error: json.error,
    };
  } catch (err) {
    return {
      ok: false,
      seededFoods: 0,
      skippedAdminEdited: 0,
      error: err instanceof Error ? err.message : 'Seed request failed',
    };
  }
}

export interface VerifyFoodRequestPayload {
  verificationStatus: VerificationStatus;
  foodState?: FoodState;
  canonicalFamily?: string | null;
  isDiscontinued?: boolean;
  changeNotes?: string;
  nutrients?: {
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
    fibre: number | null;
    energyKj?: number | null;
  };
}

export async function verifyAdminFoodApi(
  foodId: string,
  payload: VerifyFoodRequestPayload
): Promise<{ ok: boolean; item?: FoodItem; version?: number; error?: string }> {
  try {
    const authHeaders = await getAccessTokenHeader();
    const res = await fetch(`/api/admin/foods/${encodeURIComponent(foodId)}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as {
      ok?: boolean;
      item?: FoodItem;
      version?: number;
      error?: string;
    };
    return {
      ok: res.ok && Boolean(json.ok),
      item: json.item,
      version: json.version,
      error: json.error,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Verification request failed',
    };
  }
}

export async function fetchFoodVersionsApi(
  foodId: string
): Promise<{ ok: boolean; versions: FoodVersionRecord[]; error?: string }> {
  try {
    const authHeaders = await getAccessTokenHeader();
    const res = await fetch(`/api/admin/foods/${encodeURIComponent(foodId)}/versions`, {
      headers: authHeaders,
    });
    const json = (await res.json()) as {
      ok?: boolean;
      versions?: FoodVersionRecord[];
      error?: string;
    };
    return {
      ok: res.ok && Boolean(json.ok),
      versions: Array.isArray(json.versions) ? json.versions : [],
      error: json.error,
    };
  } catch (err) {
    return {
      ok: false,
      versions: [],
      error: err instanceof Error ? err.message : 'Failed to load version history',
    };
  }
}

export async function fetchPendingValidationFoodsApi(): Promise<{
  totalPending: number;
  items: FoodItem[];
  error?: string;
}> {
  try {
    const authHeaders = await getAccessTokenHeader();
    const res = await fetch('/api/admin/foods/pending-validation', { headers: authHeaders });
    const json = (await res.json()) as { totalPending?: number; items?: FoodItem[]; error?: string };
    if (!res.ok) {
      return { totalPending: 0, items: [], error: json.error || `HTTP ${res.status}` };
    }
    return { totalPending: json.totalPending ?? 0, items: json.items || [] };
  } catch (err) {
    return {
      totalPending: 0,
      items: [],
      error: err instanceof Error ? err.message : 'Failed to load pending foods',
    };
  }
}

export async function runAdminAiFoodCompletionApi(foodIds?: string[]): Promise<{
  processed: number;
  updated: number;
  skippedVerified: number;
  keptPending: number;
  error?: string;
}> {
  try {
    const authHeaders = await getAccessTokenHeader();
    const res = await fetch('/api/admin/foods/ai-complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ foodIds: foodIds || [] }),
    });
    const json = (await res.json()) as {
      processed?: number;
      updated?: number;
      skippedVerified?: number;
      keptPending?: number;
      error?: string;
    };
    if (!res.ok) {
      return {
        processed: 0,
        updated: 0,
        skippedVerified: 0,
        keptPending: 0,
        error: json.error || `HTTP ${res.status}`,
      };
    }
    return {
      processed: json.processed ?? 0,
      updated: json.updated ?? 0,
      skippedVerified: json.skippedVerified ?? 0,
      keptPending: json.keptPending ?? 0,
    };
  } catch (err) {
    return {
      processed: 0,
      updated: 0,
      skippedVerified: 0,
      keptPending: 0,
      error: err instanceof Error ? err.message : 'AI completion failed',
    };
  }
}

