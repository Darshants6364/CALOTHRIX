import { supabase } from '../lib/supabaseClient';
import type { FoodItem, WeeklySummaryResult } from '../types';

export interface GlobalFoodSearchResult {
  items: FoodItem[];
  sourceMeta?: {
    ifctCount: number;
    offCount: number;
    usdaCount: number;
    offError?: string;
    usdaError?: string;
    usdaConfigured: boolean;
  };
  error?: string;
}

export interface ExternalSourceStatus {
  ifct2017: { active: boolean; count: number; license: string };
  openFoodFacts: { active: boolean; apiVersion: string; license: string };
  usdaFdc: { configured: boolean; envVar: string; license: string };
  supabaseAi: { edgeFunctionsAvailable: boolean };
}

async function getAccessTokenHeader(): Promise<Record<string, string>> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
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
}): Promise<GlobalFoodSearchResult> {
  try {
    const url = new URL('/api/foods/search', window.location.origin);
    if (params.query) url.searchParams.set('q', params.query);
    if (params.category) url.searchParams.set('category', params.category);
    if (params.country) url.searchParams.set('country', params.country);
    if (params.source) url.searchParams.set('source', params.source);
    if (params.barcode) url.searchParams.set('barcode', params.barcode);
    if (params.semantic) url.searchParams.set('semantic', 'true');

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
    const res = await fetch(`/api/foods/barcode/${encodeURIComponent(barcode.trim())}`);
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
