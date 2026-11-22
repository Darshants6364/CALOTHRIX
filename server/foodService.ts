import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  FoodCategory,
  FoodItem,
  FoodPortion,
  FoodResultGroup,
  FoodSourceType,
  FoodState,
  FoodValidationIssue,
  FoodVersionRecord,
  GroupedFoodResults,
  Micronutrients,
  NutrientFieldKey,
  RawNutrientValues,
  RegionalSearchSuggestion,
  VerificationStatus,
} from '../src/types/index.ts';
import { FOOD_FAMILIES } from '../src/data/foodFamilies.ts';
import { GLOBAL_REFERENCE_FOODS } from '../src/data/globalReferenceFoods.ts';
import {
  getCanonicalSourcePriority,
  groupSearchResultsByType,
  inferFoodResultGroup,
  scoreFoodMatch,
  searchFoodsIntelligent,
} from '../src/utils/foodSearchEngine.ts';
import { isFoodNutritionallyUsable } from '../src/utils/nutritionUtils.ts';
import {
  calculateAtwaterCaloriesPer100g,
  deriveVerificationStatus,
  getNutrientsPer100g,
  validateFoodRecord,
} from '../src/utils/foodValidationEngine.ts';
import { resolveRegionalFoodQueryWithGemini } from './foodAiQualityService.ts';

let cachedSupplementaryFct: FoodItem[] | null = null;
export function getSupplementaryFctFoods(): FoodItem[] {
  if (cachedSupplementaryFct) return cachedSupplementaryFct;
  try {
    const filePath = path.join(process.cwd(), 'server', 'data', 'supplementaryFctCatalog.json');
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      cachedSupplementaryFct = Array.isArray(parsed) ? (parsed as FoodItem[]) : [];
      return cachedSupplementaryFct;
    }
  } catch (err) {
    console.warn('[FoodService] Could not load supplementaryFctCatalog.json:', err);
  }
  cachedSupplementaryFct = [];
  return cachedSupplementaryFct;
}

let cachedFullServerCatalog: FoodItem[] | null = null;
export function getFullServerFoodCatalog(): FoodItem[] {
  if (!cachedFullServerCatalog) {
    const byId = new Map<string, FoodItem>();
    for (const f of GLOBAL_REFERENCE_FOODS) {
      byId.set(f.id, f);
    }
    for (const f of getSupplementaryFctFoods()) {
      if (!byId.has(f.id)) {
        byId.set(f.id, f);
      }
    }
    cachedFullServerCatalog = [...byId.values()];
    // Warm up the search corpus WeakMap once on initialization so even query #1 runs in <60ms
    searchFoodsIntelligent(cachedFullServerCatalog, 'rice', { limit: 1 });
  }
  return cachedFullServerCatalog;
}

export function getPendingValidationFoods(): FoodItem[] {
  return getFullServerFoodCatalog().filter(
    (f) => !f.canonicalFoodId && (f.qualityStatus === 'pending_validation' || !isFoodNutritionallyUsable(f))
  );
}

interface CachedValue<T> {
  value: T;
  expiresAt: number;
}

const SEARCH_CACHE = new Map<string, CachedValue<GlobalSearchResponse>>();
const BARCODE_CACHE = new Map<string, CachedValue<FoodItem | null>>();
let OVERRIDES_CACHE: CachedValue<FoodItem[]> | null = null;
let supabaseRpcBackoffUntil = 0;
const CACHE_TTL_MS = 15 * 60 * 1000;

function clearFoodCaches(): void {
  SEARCH_CACHE.clear();
  BARCODE_CACHE.clear();
  OVERRIDES_CACHE = null;
  supabaseRpcBackoffUntil = 0;
}

let serverSupabaseClient: SupabaseClient | null = null;
function getServerSupabase(userAccessToken?: string): SupabaseClient | null {
  const url = (
    process.env.VITE_SUPABASE_URL || 'https://zzncijlmoskbilxjgiua.supabase.co'
  ).trim();
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    'sb_publishable_1ga_OKeLe193hBppZQjr1Q_NVnAYHcF'
  ).trim();
  if (!url || !key) return null;

  if (userAccessToken && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${userAccessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  if (serverSupabaseClient) return serverSupabaseClient;
  serverSupabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serverSupabaseClient;
}

export interface GlobalSearchOptions {
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
  allowAiFallback?: boolean;
}

export interface SourceStatus {
  ifct2017: { active: boolean; count: number; totalReferenceCount: number; license: string };
  openFoodFacts: { active: boolean; apiVersion: string; license: string };
  usdaFdc: { configured: boolean; envVar: string; license: string };
  supabaseAi: { edgeFunctionsAvailable: boolean };
}

export interface GlobalSearchResponse {
  items: FoodItem[];
  grouped: GroupedFoodResults;
  totalCount: number;
  page: number;
  limit: number;
  hasMore: boolean;
  elapsedMs: number;
  regionalSuggestion?: RegionalSearchSuggestion | null;
  sourceMeta: {
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
}

function getUsdaApiKey(): string {
  return (process.env.USDA_FDC_API_KEY || '').trim();
}

export function getExternalFoodSourceStatus(): SourceStatus {
  const ifctOnlyCount = GLOBAL_REFERENCE_FOODS.filter(
    (f) => f.id.startsWith('ifct-') || f.sourceName === 'ICMR-NIN IFCT 2017'
  ).length;
  return {
    ifct2017: {
      active: true,
      count: ifctOnlyCount,
      totalReferenceCount: GLOBAL_REFERENCE_FOODS.length,
      license: 'ICMR-NIN IFCT 2017 Reference Attribution & USDA Public Domain',
    },
    openFoodFacts: {
      active: true,
      apiVersion: 'v2',
      license: 'Open Database License (ODbL)',
    },
    usdaFdc: {
      configured: Boolean(getUsdaApiKey()),
      envVar: 'USDA_FDC_API_KEY',
      license: 'USDA FoodData Central (CC0 / Public Domain)',
    },
    supabaseAi: {
      edgeFunctionsAvailable: Boolean(
        process.env.VITE_SUPABASE_URL || 'https://zzncijlmoskbilxjgiua.supabase.co'
      ),
    },
  };
}

function mapCategoryFromText(text: string): FoodCategory {
  const t = text.toLowerCase();
  if (t.includes('indian') || t.includes('dal') || t.includes('dosa') || t.includes('roti')) {
    return 'Indian foods';
  }
  if (t.includes('fruit') || t.includes('apple') || t.includes('banana') || t.includes('berry')) {
    return 'Fruits';
  }
  if (t.includes('vegetable') || t.includes('spinach') || t.includes('broccoli')) {
    return 'Vegetables';
  }
  if (
    t.includes('milk') ||
    t.includes('yogurt') ||
    t.includes('yoghurt') ||
    t.includes('cheese') ||
    t.includes('dairy')
  ) {
    return 'Dairy';
  }
  if (
    t.includes('chicken') ||
    t.includes('beef') ||
    t.includes('meat') ||
    t.includes('poultry') ||
    t.includes('egg')
  ) {
    return 'Meat and poultry';
  }
  if (t.includes('fish') || t.includes('salmon') || t.includes('tuna') || t.includes('seafood')) {
    return 'Fish and seafood';
  }
  if (
    t.includes('rice') ||
    t.includes('bread') ||
    t.includes('oat') ||
    t.includes('cereal') ||
    t.includes('grain') ||
    t.includes('wheat')
  ) {
    return 'Grains and cereals';
  }
  if (t.includes('nut') || t.includes('almond') || t.includes('seed') || t.includes('peanut')) {
    return 'Nuts and seeds';
  }
  if (
    t.includes('beverage') ||
    t.includes('drink') ||
    t.includes('tea') ||
    t.includes('coffee') ||
    t.includes('juice')
  ) {
    return 'Beverages';
  }
  if (t.includes('supplement') || t.includes('protein powder') || t.includes('whey')) {
    return 'Supplements';
  }
  if (t.includes('snack') || t.includes('biscuit') || t.includes('chocolate') || t.includes('packaged')) {
    return 'Packaged foods';
  }
  return 'International foods';
}

function roundNum(val: number, digits = 1): number {
  const factor = Math.pow(10, digits);
  return Math.round(val * factor) / factor;
}

function inferFoodStateFromText(name: string, categories = ''): FoodState {
  const text = `${name} ${categories}`.toLowerCase();
  if (/\braw\b|\buncooked\b/.test(text)) return 'raw';
  if (/\bdeep fried\b|\bfried\b/.test(text)) return 'fried';
  if (/\bgrilled\b|\bcharbroiled\b|\btandoor|\btikka\b/.test(text)) return 'grilled';
  if (/\broasted\b|\btoasted\b|\bbaked\b/.test(text)) return 'roasted';
  if (/\bboiled\b/.test(text)) return 'boiled';
  if (/\bsteamed\b/.test(text)) return 'steamed';
  if (/\bcooked\b|\bprepared\b/.test(text)) return 'cooked';
  if (/\bdried\b|\bdry\b|\bpowder\b/.test(text)) return 'dried';
  return 'prepared';
}

function inferLiquidDensity(name: string, categories = '', unit = ''): number | null {
  const t = `${name} ${categories} ${unit}`.toLowerCase();
  if (/\bmilk\b|\bbuttermilk\b|\bchaas\b/.test(t) && !/powder|chocolate|bar/.test(t)) return 1.03;
  if (/\bghee\b|\boil\b/.test(t) && !/oil-free/.test(t)) return 0.91;
  if (/\bjuice\b|\blassi\b|\bsoda\b|\bcola\b|\bsoft drink\b/.test(t)) return 1.04;
  if (/\bwater\b|\btea\b|\bcoffee\b|\bbeverage\b/.test(t) && !/beans|powder/.test(t)) return 1.0;
  return null;
}

function parseNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

function finalizeExternalValidation(food: FoodItem, extraIssues: FoodValidationIssue[] = []): FoodItem {
  const issues = [...validateFoodRecord(food), ...extraIssues];
  const per100 = getNutrientsPer100g(food);
  const inferredBasis =
    food.carbohydrateBasis ||
    ((food.sourceName || '').toLowerCase().includes('usda') ? 'total_by_difference' : 'available');
  const atwaterCalories = calculateAtwaterCaloriesPer100g(per100, inferredBasis);
  const verificationStatus = deriveVerificationStatus(food, issues);
  return {
    ...food,
    carbohydrateBasis: inferredBasis,
    atwaterCalories,
    verificationStatus,
    validationIssues: issues,
  };
}

function normalizeOpenFoodFactsProduct(raw: Record<string, unknown>): FoodItem | null {
  const name = String(raw.product_name || raw.product_name_en || raw.generic_name || '').trim();
  const code = String(raw.code || raw._id || '').trim();
  if (!name || !code) return null;

  const nutriments = (raw.nutriments || {}) as Record<string, unknown>;
  const missingFields: NutrientFieldKey[] = [];

  const energyKj100 = parseNullableNumber(nutriments['energy-kj_100g'] ?? nutriments['energy_100g']);
  const kcalRaw =
    parseNullableNumber(nutriments['energy-kcal_100g']) ??
    parseNullableNumber(nutriments['energy-kcal']) ??
    (energyKj100 !== null ? energyKj100 / 4.184 : null);

  const proteinRaw = parseNullableNumber(nutriments['proteins_100g']);
  const carbsRaw = parseNullableNumber(nutriments['carbohydrates_100g']);
  const fatRaw = parseNullableNumber(nutriments['fat_100g']);
  const fibreRaw = parseNullableNumber(nutriments['fiber_100g']);

  const extractMacro = (
    rawVal: number | null,
    key: NutrientFieldKey
  ): { display: number; rawVal: number | null } => {
    if (rawVal === null || rawVal < 0) {
      missingFields.push(key);
      return { display: 0, rawVal: null };
    }
    const rounded = key === 'calories' ? Math.round(rawVal) : roundNum(rawVal);
    return { display: rounded, rawVal: rounded };
  };

  const calParsed = extractMacro(kcalRaw, 'calories');
  const proParsed = extractMacro(proteinRaw, 'protein');
  const carbParsed = extractMacro(carbsRaw, 'carbs');
  const fatParsed = extractMacro(fatRaw, 'fat');
  const fibParsed = extractMacro(fibreRaw, 'fibre');

  // Skip entries with zero useful nutrition metrics
  if (missingFields.length >= 4) return null;

  const rawNutrients: RawNutrientValues = {
    energyKj: energyKj100 !== null ? roundNum(energyKj100) : null,
    calories: calParsed.rawVal,
    protein: proParsed.rawVal,
    carbs: carbParsed.rawVal,
    fat: fatParsed.rawVal,
    fibre: fibParsed.rawVal,
  };

  const brand = String(raw.brands || '').split(',')[0]?.trim() || undefined;
  const countries =
    String(raw.countries || raw.countries_tags_en || '')
      .replace(/en:/g, '')
      .split(',')[0]
      ?.trim() || undefined;
  const categoriesText = String(raw.categories || '');
  const ingredientsText =
    String(raw.ingredients_text || raw.ingredients_text_en || '').trim() || undefined;
  const servingQty = Number(raw.serving_quantity);
  const servingSizeStr = String(raw.serving_size || '').trim();

  const statesTags = Array.isArray(raw.states_tags) ? raw.states_tags.map(String) : [];
  const isDiscontinued =
    raw.obsolete === 1 ||
    raw.obsolete === true ||
    statesTags.some((t) => t.includes('obsolete') || t.includes('to-be-deleted'));

  // Validate per-100g vs per-serving consistency if both exist
  const extraIssues: FoodValidationIssue[] = [];
  const kcalServing = parseNullableNumber(nutriments['energy-kcal_serving']);
  if (
    calParsed.rawVal !== null &&
    kcalServing !== null &&
    Number.isFinite(servingQty) &&
    servingQty > 0
  ) {
    const expectedServingKcal = (calParsed.rawVal * servingQty) / 100;
    const diff = Math.abs(expectedServingKcal - kcalServing);
    if (diff > 20 && diff / Math.max(1, expectedServingKcal) > 0.25) {
      extraIssues.push({
        foodId: `off-${code}`,
        foodName: name,
        sourceName: 'Open Food Facts',
        code: 'serving_consistency_error',
        severity: 'warning',
        message: `Label per-serving kcal (${kcalServing}) differs from per-100g scaled (${Math.round(expectedServingKcal)}) for ${servingQty}g serving.`,
      });
    }
  }

  const micronutrients: Micronutrients = {
    sugarG:
      parseNullableNumber(nutriments['sugars_100g']) !== null
        ? roundNum(Number(nutriments['sugars_100g']))
        : null,
    saturatedFatG:
      parseNullableNumber(nutriments['saturated-fat_100g']) !== null
        ? roundNum(Number(nutriments['saturated-fat_100g']))
        : null,
    sodiumMg:
      parseNullableNumber(nutriments['sodium_100g']) !== null
        ? Math.round(Number(nutriments['sodium_100g']) * 1000)
        : null,
    calciumMg:
      parseNullableNumber(nutriments['calcium_100g']) !== null
        ? Math.round(Number(nutriments['calcium_100g']) * 1000)
        : null,
    ironMg:
      parseNullableNumber(nutriments['iron_100g']) !== null
        ? roundNum(Number(nutriments['iron_100g']) * 1000)
        : null,
  };

  const isBranded = Boolean(brand);
  const sourceType: FoodSourceType = isBranded ? 'branded' : 'community';
  const liquidDensity = inferLiquidDensity(name, categoriesText, String(raw.product_quantity_unit || ''));
  const lastModifiedSec = Number(raw.last_modified_t);
  const lastUpdated =
    Number.isFinite(lastModifiedSec) && lastModifiedSec > 0
      ? new Date(lastModifiedSec * 1000).toISOString().slice(0, 10)
      : undefined;

  const baseFood: FoodItem = {
    id: `off-${code}`,
    name,
    brand,
    country: countries || 'International',
    barcode: code,
    ingredientsText,
    category: mapCategoryFromText(`${categoriesText} ${name}`),
    foodState: inferFoodStateFromText(name, categoriesText),
    servingName: servingSizeStr ? `100 g (pkg serving: ${servingSizeStr})` : '100 g',
    servingWeightGrams: 100,
    measurementBasis: 'per_100g',
    ...(liquidDensity ? { liquidDensityGPerMl: liquidDensity } : {}),
    calories: calParsed.display,
    protein: proParsed.display,
    carbs: carbParsed.display,
    fat: fatParsed.display,
    fibre: fibParsed.display,
    energyKj: energyKj100 !== null ? roundNum(energyKj100) : null,
    rawNutrients,
    isCustom: false,
    isDiscontinued,
    sourceType,
    sourceName: 'Open Food Facts',
    sourceId: code,
    sourcePriority: 4,
    sourceUrl: `https://world.openfoodfacts.org/product/${encodeURIComponent(code)}`,
    license: 'ODbL (Open Database License)',
    dataQuality: missingFields.length === 0 ? 'moderate' : 'moderate',
    missingFields: missingFields.length > 0 ? missingFields : undefined,
    micronutrients,
    lastUpdated,
    portions:
      Number.isFinite(servingQty) && servingQty > 0 && servingQty !== 100
        ? [
            {
              id: `off-srv-${code}`,
              foodId: `off-${code}`,
              portionName: servingSizeStr || `1 package serving (${servingQty} g)`,
              sizeVariant: 'standard',
              gramOrMlWeight: Math.min(1000, servingQty),
              unitType: liquidDensity ? 'ml' : 'piece',
              measurementMethod: 'manufacturer_label_declaration',
              sourceReference: brand || 'Open Food Facts',
              confidenceLevel: 'moderate',
            },
          ]
        : undefined,
  };

  return finalizeExternalValidation(baseFood, extraIssues);
}

async function readBarcodeFromSupabaseCache(barcode: string): Promise<FoodItem | null> {
  const sb = getServerSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from('barcode_products')
      .select(
        'barcode, product_name, brand, country, source_name, source_url, serving_size_label, serving_weight_grams, nutrients_per_100g, verification_status, is_discontinued, raw_api_payload, last_validated_at'
      )
      .eq('barcode', barcode)
      .maybeSingle();
    if (error || !data) return null;

    const payload = data.raw_api_payload as Partial<FoodItem> | null;
    if (payload && payload.name && payload.id) {
      const restored = payload as FoodItem;
      if (data.is_discontinued) restored.isDiscontinued = true;
      return restored;
    }

    const nuts = (data.nutrients_per_100g || {}) as Record<string, number | null | undefined>;
    const cal = typeof nuts.calories === 'number' ? nuts.calories : 0;
    const pro = typeof nuts.protein === 'number' ? nuts.protein : 0;
    const carb = typeof nuts.carbs === 'number' ? nuts.carbs : 0;
    const fat = typeof nuts.fat === 'number' ? nuts.fat : 0;
    const fib = typeof nuts.fibre === 'number' ? nuts.fibre : 0;

    return finalizeExternalValidation({
      id: `off-${barcode}`,
      name: String(data.product_name),
      brand: data.brand || undefined,
      country: data.country || 'India',
      barcode,
      category: 'Packaged foods',
      foodState: 'prepared',
      servingName: String(data.serving_size_label || '100 g'),
      servingWeightGrams: Number(data.serving_weight_grams || 100),
      measurementBasis: 'per_100g',
      calories: cal,
      protein: pro,
      carbs: carb,
      fat,
      fibre: fib,
      isCustom: false,
      isDiscontinued: Boolean(data.is_discontinued),
      sourceType: data.brand ? 'branded' : 'community',
      sourceName: String(data.source_name || 'Open Food Facts'),
      sourceId: barcode,
      sourcePriority: String(data.source_name || '').toLowerCase().includes('open food facts')
        ? 4
        : data.brand
        ? 3
        : 4,
      sourceUrl: data.source_url || undefined,
      verificationStatus: (data.verification_status as FoodItem['verificationStatus']) || 'needs_review',
      lastUpdated: data.last_validated_at ? String(data.last_validated_at).slice(0, 10) : undefined,
    });
  } catch {
    return null;
  }
}

async function cacheBarcodeInSupabase(
  barcode: string,
  item: FoodItem,
  userAccessToken?: string
): Promise<void> {
  const sb = getServerSupabase(userAccessToken);
  if (!sb) return;
  try {
    const per100 = getNutrientsPer100g(item);
    await sb.from('barcode_products').upsert(
      {
        barcode,
        product_name: item.name,
        brand: item.brand || null,
        country: item.country || 'India',
        source_name: item.sourceName || 'Open Food Facts',
        source_url: item.sourceUrl || null,
        serving_size_label: item.servingName || '100 g',
        serving_weight_grams: item.servingWeightGrams || 100,
        nutrients_per_100g: per100,
        verification_status: item.verificationStatus || 'needs_review',
        is_discontinued: Boolean(item.isDiscontinued),
        validation_warnings: (item.validationIssues || []).map((i) => i.message),
        raw_api_payload: item,
        last_validated_at: new Date().toISOString(),
      },
      { onConflict: 'barcode' }
    );
  } catch {
    // Non-blocking fallback when unauthenticated anonymous request cannot write to authenticated-only cache
  }
}

async function searchOpenFoodFacts(query: string, country?: string): Promise<{
  items: FoodItem[];
  error?: string;
}> {
  try {
    const isIndia = country?.toLowerCase() === 'india';
    const baseDomain = isIndia
      ? 'https://in.openfoodfacts.org/api/v2/search'
      : 'https://world.openfoodfacts.org/api/v2/search';
    const url = new URL(baseDomain);
    url.searchParams.set('search_terms', query);
    url.searchParams.set('page_size', '14');
    url.searchParams.set(
      'fields',
      'code,product_name,product_name_en,brands,countries,categories,ingredients_text,ingredients_text_en,serving_size,serving_quantity,product_quantity_unit,states_tags,obsolete,last_modified_t,nutriments'
    );
    if (country && country !== 'All') {
      url.searchParams.set('countries_tags_en', country.toLowerCase());
    }

    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'CALOTHRIX-MacroLog/1.0 (nutrition-tracker)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(5500),
    });

    if (!res.ok) {
      return { items: [], error: `Open Food Facts returned HTTP ${res.status}` };
    }
    const json = (await res.json()) as { products?: Record<string, unknown>[] };
    const products = Array.isArray(json.products) ? json.products : [];
    const normalized = products
      .map(normalizeOpenFoodFactsProduct)
      .filter((x): x is FoodItem => x !== null)
      .map((item) => {
        if (isIndia && (!item.country || item.country === 'International')) {
          return { ...item, country: 'India', sourceName: 'Open Food Facts India' };
        }
        if (item.barcode?.startsWith('890')) {
          return { ...item, country: item.country || 'India', sourceName: 'Open Food Facts India' };
        }
        return item;
      });
    // Prioritize Indian 890 GS1 products first
    normalized.sort((a, b) => {
      const aIn = a.barcode?.startsWith('890') || a.country === 'India' ? 0 : 1;
      const bIn = b.barcode?.startsWith('890') || b.country === 'India' ? 0 : 1;
      return aIn - bIn;
    });
    return { items: normalized };
  } catch (err) {
    return {
      items: [],
      error: err instanceof Error ? err.message : 'Open Food Facts request timed out',
    };
  }
}

async function fetchOpenFoodFactsProductFromHost(
  host: string,
  cleanCode: string
): Promise<{ item: FoodItem | null; error?: string }> {
  const url = `${host}/api/v2/product/${encodeURIComponent(cleanCode)}.json?fields=code,product_name,product_name_en,brands,countries,categories,ingredients_text,ingredients_text_en,serving_size,serving_quantity,product_quantity_unit,states_tags,obsolete,last_modified_t,nutriments`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'CALOTHRIX-MacroLog/1.0 (nutrition-tracker)',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(5500),
  });
  if (!res.ok) {
    return { item: null, error: `Open Food Facts barcode lookup failed (${res.status})` };
  }
  const json = (await res.json()) as { status?: number; product?: Record<string, unknown> };
  if (json.status !== 1 || !json.product) {
    return { item: null };
  }
  const normalized = normalizeOpenFoodFactsProduct(json.product);
  if (normalized && host.includes('in.openfoodfacts.org')) {
    normalized.sourceName = 'Open Food Facts India';
    if (!normalized.country || normalized.country === 'International') {
      normalized.country = 'India';
    }
  }
  return { item: normalized };
}

export async function lookupBarcodeFromOpenFoodFacts(
  barcode: string,
  userAccessToken?: string
): Promise<{
  item: FoodItem | null;
  error?: string;
}> {
  const cleanCode = barcode.replace(/\D/g, '').trim();
  if (!cleanCode) return { item: null, error: 'Invalid barcode' };

  const candidates = [cleanCode];
  if (cleanCode.length === 13 && cleanCode.startsWith('0')) {
    candidates.push(cleanCode.slice(1));
  } else if (cleanCode.length === 12) {
    candidates.push(`0${cleanCode}`);
  }

  // 1. Verified local catalog (Manufacturer / IFCT)
  for (const code of candidates) {
    const localMatch = GLOBAL_REFERENCE_FOODS.find((f) => f.barcode === code);
    if (localMatch) return { item: localMatch };
  }

  // 2. Memory cache
  const cached = BARCODE_CACHE.get(cleanCode);
  if (cached && cached.expiresAt > Date.now()) {
    return { item: cached.value };
  }

  // 3. Supabase persistent barcode_products cache
  for (const code of candidates) {
    const dbCached = await readBarcodeFromSupabaseCache(code);
    if (dbCached) {
      BARCODE_CACHE.set(cleanCode, { value: dbCached, expiresAt: Date.now() + CACHE_TTL_MS });
      return { item: dbCached };
    }
  }

  // 4. Live Open Food Facts API (prioritizing India 890 GS1 barcodes)
  try {
    let lastError: string | undefined;
    for (const code of candidates) {
      const isIndianGs1 = code.startsWith('890');
      const hosts = isIndianGs1
        ? ['https://in.openfoodfacts.org', 'https://world.openfoodfacts.org']
        : ['https://world.openfoodfacts.org', 'https://in.openfoodfacts.org'];

      for (const host of hosts) {
        const res = await fetchOpenFoodFactsProductFromHost(host, code);
        if (res.item) {
          BARCODE_CACHE.set(cleanCode, { value: res.item, expiresAt: Date.now() + CACHE_TTL_MS });
          void cacheBarcodeInSupabase(code, res.item, userAccessToken);
          return { item: res.item };
        }
        if (res.error) lastError = res.error;
      }
    }

    BARCODE_CACHE.set(cleanCode, { value: null, expiresAt: Date.now() + CACHE_TTL_MS });
    return { item: null, error: lastError };
  } catch (err) {
    return {
      item: null,
      error: err instanceof Error ? err.message : 'Barcode lookup failed',
    };
  }
}

interface UsdaFoodNutrient {
  nutrientId?: number;
  nutrientName?: string;
  value?: number;
  unitName?: string;
}

interface UsdaFoodRaw {
  fdcId: number;
  description: string;
  dataType?: string;
  brandOwner?: string;
  brandName?: string;
  gtinUpc?: string;
  ingredients?: string;
  foodCategory?: string;
  publishedDate?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  foodNutrients?: UsdaFoodNutrient[];
}

function findUsdaNutrient(nutrients: UsdaFoodNutrient[], ids: number[]): number | null {
  for (const id of ids) {
    const found = nutrients.find((n) => n.nutrientId === id);
    if (found && typeof found.value === 'number' && Number.isFinite(found.value)) {
      return found.value;
    }
  }
  return null;
}

async function searchUsdaFoodDataCentral(query: string): Promise<{
  items: FoodItem[];
  error?: string;
  configured: boolean;
}> {
  const apiKey = getUsdaApiKey();
  if (!apiKey) {
    return { items: [], configured: false };
  }

  try {
    const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('query', query);
    url.searchParams.set('pageSize', '12');

    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5500),
    });

    if (!res.ok) {
      return {
        items: [],
        configured: true,
        error: `USDA FDC returned HTTP ${res.status}`,
      };
    }

    const json = (await res.json()) as { foods?: UsdaFoodRaw[] };
    const foods = Array.isArray(json.foods) ? json.foods : [];

    const normalized: FoodItem[] = foods.map((f) => {
      const nuts = Array.isArray(f.foodNutrients) ? f.foodNutrients : [];
      const missingFields: NutrientFieldKey[] = [];

      const calRaw = findUsdaNutrient(nuts, [1008, 2047, 2048]);
      const proRaw = findUsdaNutrient(nuts, [1003]);
      const carbRaw = findUsdaNutrient(nuts, [1005]);
      const fatRaw = findUsdaNutrient(nuts, [1004]);
      const fibRaw = findUsdaNutrient(nuts, [1079]);

      if (calRaw === null) missingFields.push('calories');
      if (proRaw === null) missingFields.push('protein');
      if (carbRaw === null) missingFields.push('carbs');
      if (fatRaw === null) missingFields.push('fat');
      if (fibRaw === null) missingFields.push('fibre');

      const rawNutrients: RawNutrientValues = {
        calories: calRaw !== null ? Math.round(calRaw) : null,
        protein: proRaw !== null ? roundNum(proRaw) : null,
        carbs: carbRaw !== null ? roundNum(carbRaw) : null,
        fat: fatRaw !== null ? roundNum(fatRaw) : null,
        fibre: fibRaw !== null ? roundNum(fibRaw) : null,
      };

      const brand = (f.brandName || f.brandOwner || '').trim() || undefined;
      const isBranded = f.dataType === 'Branded' || Boolean(brand);
      const sourceType: FoodSourceType = isBranded ? 'branded' : 'verified_reference';
      const liquidDensity = inferLiquidDensity(f.description, f.foodCategory || '', f.servingSizeUnit || '');

      const micronutrients: Micronutrients = {
        sugarG: findUsdaNutrient(nuts, [2000]),
        sodiumMg: findUsdaNutrient(nuts, [1093]),
        potassiumMg: findUsdaNutrient(nuts, [1092]),
        calciumMg: findUsdaNutrient(nuts, [1087]),
        ironMg: findUsdaNutrient(nuts, [1089]),
        vitaminCMg: findUsdaNutrient(nuts, [1162]),
        zincMg: findUsdaNutrient(nuts, [1095]),
      };

      const baseFood: FoodItem = {
        id: `usda-${f.fdcId}`,
        name: f.description,
        brand,
        country: 'United States',
        barcode: f.gtinUpc || undefined,
        ingredientsText: f.ingredients || undefined,
        category: mapCategoryFromText(`${f.foodCategory || ''} ${f.description}`),
        foodState: inferFoodStateFromText(f.description, f.foodCategory || ''),
        servingName: '100 g',
        servingWeightGrams: 100,
        measurementBasis: 'per_100g',
        ...(liquidDensity ? { liquidDensityGPerMl: liquidDensity } : {}),
        calories: rawNutrients.calories ?? 0,
        protein: rawNutrients.protein ?? 0,
        carbs: rawNutrients.carbs ?? 0,
        fat: rawNutrients.fat ?? 0,
        fibre: rawNutrients.fibre ?? 0,
        carbohydrateBasis: 'total_by_difference',
        rawNutrients,
        isCustom: false,
        sourceType,
        sourceName: `USDA FoodData Central (${f.dataType || 'Reference'})`,
        sourceId: String(f.fdcId),
        foodCode: String(f.fdcId),
        sourcePriority: isBranded ? 3 : 2,
        sourceUrl: `https://fdc.nal.usda.gov/fdc-app.html#/food-details/${f.fdcId}/nutrients`,
        license: 'USDA Public Domain (CC0)',
        dataQuality: isBranded ? 'moderate' : 'high',
        missingFields: missingFields.length > 0 ? missingFields : undefined,
        micronutrients,
        lastUpdated: f.publishedDate?.slice(0, 10),
      };

      return finalizeExternalValidation(baseFood);
    });

    return { items: normalized, configured: true };
  } catch (err) {
    return {
      items: [],
      configured: true,
      error: err instanceof Error ? err.message : 'USDA FDC request failed',
    };
  }
}

function mapSourceIdToSourceType(sourceId: string, sourceName: string, isCustom: boolean): FoodSourceType {
  if (isCustom || sourceId === 'user_custom') return 'personal_custom';
  if (
    sourceId === 'ifct_2017' ||
    sourceId === 'indb_2024' ||
    sourceId === 'ifct_cooked_verified' ||
    sourceId === 'calculated_recipe' ||
    sourceId === 'gemini_estimated' ||
    sourceId === 'uk_fct' ||
    sourceId === 'us_fct' ||
    sourceId === 'usda_fdc' ||
    sourceId === 'nccdb_clinical' ||
    sourceName.includes('IFCT') ||
    sourceName.includes('INDB') ||
    sourceName.includes('CoFID') ||
    sourceName.includes('USDA') ||
    sourceName.includes('NCCDB')
  ) {
    return 'verified_reference';
  }
  if (sourceId === 'manufacturer_verified') return 'branded';
  return 'community';
}

function mapSourceIdForFood(food: FoodItem): string {
  const name = (food.sourceName || '').toLowerCase();
  if (food.isCustom || food.sourceType === 'personal_custom') return 'user_custom';
  if (name.includes('ifct')) return 'ifct_2017';
  if (name.includes('indb') || name.includes('indian nutrient databank')) return 'indb_2024';
  if (name.includes('cofid') || name.includes('mccance') || name.includes('uk fct')) return 'uk_fct';
  if (name.includes('us fct')) return 'us_fct';
  if (name.includes('nccdb')) return 'nccdb_clinical';
  if (name.includes('usda')) return 'usda_fdc';
  if (food.qualityStatus === 'calculated' || name.includes('recipe calculation')) return 'calculated_recipe';
  if (food.qualityStatus === 'estimated' || name.includes('gemini')) return 'gemini_estimated';
  if (food.sourceType === 'verified_reference') return 'ifct_cooked_verified';
  if (food.sourceType === 'branded') return 'manufacturer_verified';
  return 'open_food_facts';
}

const CANONICAL_SOURCE_ROWS = [
  {
    id: 'ifct_2017',
    source_name: 'ICMR-NIN IFCT 2017',
    source_priority: 1,
    authority_level: 'scientific_reference',
    base_url: 'https://ifct2017.com/',
    license: 'ICMR-NIN Reference Attribution',
    notes: 'Tier 1: Indian raw agricultural ingredients & proximate composition master',
  },
  {
    id: 'indb_2024',
    source_name: 'INDB (Indian Nutrient Databank)',
    source_priority: 1,
    authority_level: 'scientific_reference',
    base_url: 'https://www.indb.org.in/',
    license: 'CC BY / Research Attribution',
    notes: 'Tier 1: Indian Nutrient Databank (INDB) per-100g recipe & food composition',
  },
  {
    id: 'ifct_cooked_verified',
    source_name: 'Calothrix Verified Indian Cooked Reference',
    source_priority: 1,
    authority_level: 'verified_cooked',
    base_url: null,
    license: 'ICMR-NIN IFCT 2017 Derived',
    notes: 'Tier 1: Verified cooked Indian & global dishes with yield and retention',
  },
  {
    id: 'uk_fct',
    source_name: 'UK CoFID (McCance and Widdowson 2021)',
    source_priority: 2,
    authority_level: 'scientific_reference',
    base_url: 'https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid',
    license: 'Open Government Licence',
    notes: 'Tier 2: UK Composition of Foods Integrated Dataset (CoFID 2021)',
  },
  {
    id: 'us_fct',
    source_name: 'US FCT / USDA FoodData Central',
    source_priority: 2,
    authority_level: 'usda_fdc',
    base_url: 'https://fdc.nal.usda.gov/',
    license: 'Public Domain (CC0)',
    notes: 'Tier 2: USDA FoodData Central / US FCT per-100g composition',
  },
  {
    id: 'calculated_recipe',
    source_name: 'Calorex Validated Recipe Calculation',
    source_priority: 2,
    authority_level: 'verified_cooked',
    base_url: null,
    license: 'Internal Nutrition Dataset',
    notes: 'Tier 2: Ingredient-weighted recipe calculation with cooking yield factors from IFCT/INDB',
  },
  {
    id: 'gemini_estimated',
    source_name: 'Calorex AI-Assisted Nutrition Estimate',
    source_priority: 3,
    authority_level: 'verified_cooked',
    base_url: null,
    license: 'Internal Nutrition Dataset',
    notes: 'Tier 3: Controlled Gemini-assisted nutritional estimate with traceable reference foods',
  },
  {
    id: 'usda_fdc',
    source_name: 'USDA FoodData Central',
    source_priority: 2,
    authority_level: 'usda_fdc',
    base_url: 'https://fdc.nal.usda.gov/',
    license: 'USDA Public Domain (CC0)',
    notes: 'Tier 2: USDA Foundation & SR Legacy reference foods',
  },
  {
    id: 'nccdb_clinical',
    source_name: 'NCCDB Clinical Reference',
    source_priority: 2,
    authority_level: 'nccdb_clinical',
    base_url: 'https://nutritiondata.self.com/',
    license: 'Clinical Nutrition Reference',
    notes: 'Tier 2: Clinical food composition database with complete micronutrient profiles',
  },
  {
    id: 'manufacturer_verified',
    source_name: 'Verified Manufacturer Nutrition Label',
    source_priority: 3,
    authority_level: 'manufacturer_label',
    base_url: null,
    license: 'Manufacturer Label Attribution',
    notes: 'Tier 3: Verified manufacturer & restaurant nutrition panels',
  },
  {
    id: 'open_food_facts',
    source_name: 'Open Food Facts',
    source_priority: 4,
    authority_level: 'community_open_data',
    base_url: 'https://in.openfoodfacts.org/',
    license: 'ODbL (Open Database License)',
    notes: 'Tier 4: Community packaged barcode database (890 GS1 India prioritized)',
  },
  {
    id: 'user_custom',
    source_name: 'Personal Custom Food',
    source_priority: 5,
    authority_level: 'user_provided',
    base_url: null,
    license: 'Private User Data',
    notes: 'Tier 5: User-created unverified custom foods',
  },
];

function mapMasterRowToFoodItem(row: Record<string, unknown>): FoodItem {
  const calRaw = parseNullableNumber(row.calories_kcal);
  const proRaw = parseNullableNumber(row.protein_g);
  const carbRaw = parseNullableNumber(row.carbohydrate_g);
  const fatRaw = parseNullableNumber(row.fat_g);
  const fibRaw = parseNullableNumber(row.total_dietary_fibre_g);
  const energyKjRaw = parseNullableNumber(row.energy_kj);
  const insFibRaw = parseNullableNumber(row.insoluble_fibre_g);
  const solFibRaw = parseNullableNumber(row.soluble_fibre_g);
  const waterRaw = parseNullableNumber(row.water_g);
  const ashRaw = parseNullableNumber(row.ash_g);

  const missingFields: NutrientFieldKey[] = [];
  if (calRaw === null) missingFields.push('calories');
  if (proRaw === null) missingFields.push('protein');
  if (carbRaw === null) missingFields.push('carbs');
  if (fatRaw === null) missingFields.push('fat');
  if (fibRaw === null) missingFields.push('fibre');

  const rawNutrients: RawNutrientValues = {
    energyKj: energyKjRaw,
    calories: calRaw,
    protein: proRaw,
    carbs: carbRaw,
    fat: fatRaw,
    fibre: fibRaw,
    insolubleFibre: insFibRaw,
    solubleFibre: solFibRaw,
    water: waterRaw,
    ash: ashRaw,
  };

  const sourceIdStr = String(row.source_id || 'ifct_cooked_verified');
  const sourceNameStr = String(row.source_name || 'Calothrix Master Catalog');
  const isCustom = Boolean(row.is_custom);
  const sourceType = mapSourceIdToSourceType(sourceIdStr, sourceNameStr, isCustom);

  const aliasesRaw = Array.isArray(row.aliases) ? row.aliases : [];
  const aliases = aliasesRaw.map(String).filter(Boolean);

  const portionsRaw = Array.isArray(row.portions) ? (row.portions as FoodPortion[]) : [];

  const baseFood: FoodItem = {
    id: String(row.id),
    name: String(row.food_name || ''),
    brand: row.brand ? String(row.brand) : undefined,
    country: row.country ? String(row.country) : 'India',
    barcode: row.barcode ? String(row.barcode) : undefined,
    ingredientsText: row.ingredients_text ? String(row.ingredients_text) : undefined,
    foodGroup: row.food_group ? String(row.food_group) : undefined,
    foodCode: row.original_source_code ? String(row.original_source_code) : undefined,
    sourceId: row.original_source_code ? String(row.original_source_code) : String(row.id),
    sourceName: sourceNameStr,
    sourceType,
    sourceUrl: row.source_url ? String(row.source_url) : undefined,
    license: row.license ? String(row.license) : undefined,
    sourcePriority:
      typeof row.source_priority === 'number'
        ? row.source_priority
        : getCanonicalSourcePriority({
            id: String(row.id),
            sourceType,
            sourceName: sourceNameStr,
            isCustom,
          } as FoodItem),
    category: (row.category as FoodCategory) || 'International foods',
    foodState: (row.food_state as FoodState) || 'prepared',
    canonicalFamily: row.canonical_family ? String(row.canonical_family) : undefined,
    foodFamilyId: row.food_family_id ? String(row.food_family_id) : (row.canonical_family ? String(row.canonical_family) : undefined),
    parentFoodId: row.parent_food_id ? String(row.parent_food_id) : undefined,
    resultGroup:
      row.result_group === 'basic_ingredient' ||
      row.result_group === 'cooked_food' ||
      row.result_group === 'prepared_dish'
        ? row.result_group
        : undefined,
    preparationStyle: row.preparation_style ? String(row.preparation_style) : undefined,
    qualityStatus:
      row.quality_status === 'verified' ||
      row.quality_status === 'calculated' ||
      row.quality_status === 'estimated' ||
      row.quality_status === 'pending_validation'
        ? row.quality_status
        : undefined,
    calculationMethod: row.calculation_method ? String(row.calculation_method) : undefined,
    confidenceScore: parseNullableNumber(row.confidence_score) ?? undefined,
    measurementBasis:
      row.measurement_basis === 'per_serving' || row.measurement_basis === 'per_100ml'
        ? row.measurement_basis
        : 'per_100g',
    servingName: row.serving_name ? String(row.serving_name) : '100 g',
    servingWeightGrams: parseNullableNumber(row.serving_weight_grams) ?? 100,
    liquidDensityGPerMl: parseNullableNumber(row.liquid_density_g_per_ml),
    dietaryTags: Array.isArray(row.dietary_tags) ? (row.dietary_tags as FoodItem['dietaryTags']) : undefined,
    calories: calRaw ?? 0,
    protein: proRaw ?? 0,
    carbs: carbRaw ?? 0,
    fat: fatRaw ?? 0,
    fibre: fibRaw ?? 0,
    energyKj: energyKjRaw,
    insolubleFibreG: insFibRaw,
    solubleFibreG: solFibRaw,
    waterG: waterRaw,
    ashG: ashRaw,
    carbohydrateBasis:
      row.carbohydrate_basis === 'available' ||
      row.carbohydrate_basis === 'total_by_difference' ||
      row.carbohydrate_basis === 'unknown'
        ? row.carbohydrate_basis
        : 'available',
    atwaterCalories: parseNullableNumber(row.atwater_calories_kcal),
    rawNutrients,
    missingFields: missingFields.length > 0 ? missingFields : undefined,
    micronutrients:
      row.micronutrients && typeof row.micronutrients === 'object'
        ? (row.micronutrients as Micronutrients)
        : undefined,
    aliases: aliases.length > 0 ? aliases : undefined,
    portions: portionsRaw.length > 0 ? portionsRaw : undefined,
    isCustom,
    isDiscontinued: Boolean(row.is_discontinued),
    verificationStatus: (row.verification_status as VerificationStatus) || 'verified',
    dataQuality: sourceType === 'verified_reference' ? 'high' : 'moderate',
    version: typeof row.version === 'number' ? row.version : 1,
    changeNotes: row.change_notes ? String(row.change_notes) : undefined,
    lastUpdated: row.last_updated ? String(row.last_updated).slice(0, 10) : undefined,
  };

  const issues = validateFoodRecord(baseFood);
  const per100 = getNutrientsPer100g(baseFood);
  return {
    ...baseFood,
    atwaterCalories:
      baseFood.atwaterCalories ??
      calculateAtwaterCaloriesPer100g(per100, baseFood.carbohydrateBasis || 'available'),
    validationIssues: issues,
  };
}

async function searchSupabaseFoodsMaster(
  options: GlobalSearchOptions,
  userAccessToken?: string
): Promise<FoodItem[]> {
  const sb = getServerSupabase(userAccessToken);
  if (!sb) return [];
  try {
    const { data, error } = await sb.rpc('search_foods_master', {
      search_query: options.query || '',
      filter_category: options.category && options.category !== 'All' ? options.category : null,
      filter_country: options.country && options.country !== 'All' ? options.country : null,
      max_results: 45,
    });
    if (error || !Array.isArray(data)) return [];
    return data.map((row) => mapMasterRowToFoodItem(row as Record<string, unknown>));
  } catch {
    return [];
  }
}

export async function fetchPublicFoodOverrides(userAccessToken?: string): Promise<FoodItem[]> {
  if (OVERRIDES_CACHE && OVERRIDES_CACHE.expiresAt > Date.now()) {
    return OVERRIDES_CACHE.value;
  }
  const sb = getServerSupabase(userAccessToken);
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from('foods')
      .select(
        `
        id, source_id, original_source_code, source_url, food_name, brand, country, barcode,
        food_group, category, food_state, canonical_family, measurement_basis, serving_name,
        serving_weight_grams, liquid_density_g_per_ml, dietary_tags, ingredients_text,
        verification_status, is_custom, is_discontinued, version, change_notes, last_updated,
        food_sources(source_name, source_priority, license),
        food_nutrients(energy_kj, calories_kcal, atwater_calories_kcal, protein_g, fat_g, carbohydrate_g, carbohydrate_basis, total_dietary_fibre_g, insoluble_fibre_g, soluble_fibre_g, water_g, ash_g, micronutrients),
        food_aliases(alias_name),
        food_portions(id, food_id, portion_name, size_variant, gram_or_ml_weight, unit_type, measurement_method, source_reference, confidence_level, is_default)
      `
      )
      .or('version.gt.1,is_discontinued.eq.true,approved_at.not.is.null')
      .limit(200);

    if (error || !Array.isArray(data)) return [];

    const mapped = data.map((raw: Record<string, unknown>) => {
      const src = (raw.food_sources || {}) as Record<string, unknown>;
      const nut = Array.isArray(raw.food_nutrients)
        ? ((raw.food_nutrients[0] || {}) as Record<string, unknown>)
        : ((raw.food_nutrients || {}) as Record<string, unknown>);
      const aliases = Array.isArray(raw.food_aliases)
        ? (raw.food_aliases as Array<{ alias_name?: string }>).map((a) => a.alias_name).filter(Boolean)
        : [];
      const portions = Array.isArray(raw.food_portions)
        ? (raw.food_portions as Array<Record<string, unknown>>).map((p) => ({
            id: String(p.id),
            foodId: String(p.food_id),
            portionName: String(p.portion_name),
            sizeVariant: p.size_variant as FoodPortion['sizeVariant'],
            gramOrMlWeight: Number(p.gram_or_ml_weight),
            unitType: p.unit_type as FoodPortion['unitType'],
            measurementMethod: String(p.measurement_method || 'standardized_indian_household'),
            sourceReference: String(p.source_reference || 'Calothrix Admin Curated'),
            confidenceLevel: (p.confidence_level as FoodPortion['confidenceLevel']) || 'high',
            isDefault: Boolean(p.is_default),
          }))
        : [];

      return mapMasterRowToFoodItem({
        ...raw,
        source_name: src.source_name,
        source_priority: src.source_priority,
        license: src.license,
        ...nut,
        aliases,
        portions,
      });
    });

    OVERRIDES_CACHE = { value: mapped, expiresAt: Date.now() + 60 * 1000 };
    return mapped;
  } catch {
    return [];
  }
}

export async function seedMasterFoodsToSupabase(userAccessToken?: string): Promise<{
  ok: boolean;
  seededFoods: number;
  skippedAdminEdited: number;
  error?: string;
}> {
  const sb = getServerSupabase(userAccessToken);
  if (!sb) {
    return { ok: false, seededFoods: 0, skippedAdminEdited: 0, error: 'Supabase client unavailable' };
  }

  try {
    const { error: srcErr } = await sb
      .from('food_sources')
      .upsert(CANONICAL_SOURCE_ROWS, { onConflict: 'id' });
    if (srcErr) {
      return { ok: false, seededFoods: 0, skippedAdminEdited: 0, error: srcErr.message };
    }

    // Seed food_families if migration table is present (non-blocking if not yet applied)
    try {
      await sb.from('food_families').upsert(
        FOOD_FAMILIES.map((ff) => ({
          id: ff.id,
          slug: ff.slug,
          display_name: ff.displayName,
          category: ff.category,
          aliases: ff.aliases,
          regional_names: ff.regionalNames,
          description: ff.description,
        })),
        { onConflict: 'id' }
      );
    } catch {
      // Older schema without food_families table; proceed with backward-compatible seed
    }

    // Preserve any food records already modified by admins in Supabase (version > 1)
    const { data: editedRows } = await sb.from('foods').select('id').gt('version', 1);
    const adminEditedIds = new Set(
      Array.isArray(editedRows) ? editedRows.map((r: { id: string }) => r.id) : []
    );

    const targets = getFullServerFoodCatalog().filter((f) => !adminEditedIds.has(f.id));
    const BATCH_SIZE = 100;
    let seededCount = 0;

    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE);
      const batchIds = batch.map((f) => f.id);

      const foodRows = batch.map((f) => ({
        id: f.id,
        source_id: mapSourceIdForFood(f),
        original_source_code: f.foodCode || f.sourceId || null,
        source_url: f.sourceUrl || null,
        food_name: f.name,
        brand: f.brand || null,
        country: f.country || 'India',
        barcode: f.barcode || null,
        food_group: f.foodGroup || null,
        category: f.category,
        food_state: f.foodState || 'prepared',
        canonical_family: f.canonicalFamily || f.foodFamilyId || null,
        food_family_id: f.foodFamilyId || null,
        parent_food_id: f.parentFoodId || null,
        result_group: inferFoodResultGroup(f),
        preparation_style: f.preparationStyle || null,
        quality_status: f.qualityStatus || 'verified',
        is_searchable: f.isSearchable !== false,
        canonical_food_id: f.canonicalFoodId || null,
        calculation_method: f.calculationMethod || null,
        source_reference_foods: f.sourceReferenceFoods || [],
        confidence_score: f.confidenceScore ?? null,
        original_source_values: f.originalSourceValues || {},
        measurement_basis: f.measurementBasis || 'per_100g',
        serving_name: f.servingName || '100 g',
        serving_weight_grams: f.servingWeightGrams || 100,
        liquid_density_g_per_ml: f.liquidDensityGPerMl ?? null,
        dietary_tags: f.dietaryTags || [],
        ingredients_text: f.ingredientsText || null,
        verification_status: f.verificationStatus || 'verified',
        is_custom: Boolean(f.isCustom),
        is_discontinued: Boolean(f.isDiscontinued),
        version: f.version || 1,
        raw_source_snapshot: {
          id: f.id,
          name: f.name,
          foodCode: f.foodCode || null,
          sourceName: f.sourceName || null,
          rawNutrients: f.rawNutrients || null,
        },
        last_updated: new Date().toISOString(),
      }));

      const { error: foodErr } = await sb.from('foods').upsert(foodRows, { onConflict: 'id' });
      if (foodErr) {
        return {
          ok: false,
          seededFoods: seededCount,
          skippedAdminEdited: adminEditedIds.size,
          error: foodErr.message,
        };
      }

      const nutrientRows = batch.map((f) => {
        const per100 = getNutrientsPer100g(f);
        const basis =
          f.carbohydrateBasis ||
          ((f.sourceName || '').toLowerCase().includes('usda') ? 'total_by_difference' : 'available');
        const atwater = calculateAtwaterCaloriesPer100g(per100, basis);
        return {
          food_id: f.id,
          energy_kj: f.rawNutrients?.energyKj ?? f.energyKj ?? null,
          calories_kcal: per100.calories,
          atwater_calories_kcal: atwater,
          protein_g: per100.protein,
          fat_g: per100.fat,
          carbohydrate_g: per100.carbs,
          available_carbohydrate_g: basis === 'available' ? per100.carbs : null,
          carbohydrate_basis: basis,
          total_dietary_fibre_g: per100.fibre,
          insoluble_fibre_g: f.rawNutrients?.insolubleFibre ?? f.insolubleFibreG ?? null,
          soluble_fibre_g: f.rawNutrients?.solubleFibre ?? f.solubleFibreG ?? null,
          water_g: f.rawNutrients?.water ?? f.waterG ?? null,
          ash_g: f.rawNutrients?.ash ?? f.ashG ?? null,
          micronutrients: f.micronutrients || {},
          updated_at: new Date().toISOString(),
        };
      });

      const { error: nutErr } = await sb
        .from('food_nutrients')
        .upsert(nutrientRows, { onConflict: 'food_id' });
      if (nutErr) {
        return {
          ok: false,
          seededFoods: seededCount,
          skippedAdminEdited: adminEditedIds.size,
          error: nutErr.message,
        };
      }

      // Replace aliases & portions cleanly for idempotency
      await sb.from('food_aliases').delete().in('food_id', batchIds);
      const aliasRows: Array<{
        food_id: string;
        alias_name: string;
        alias_type: string;
        language_region: string | null;
      }> = [];
      for (const f of batch) {
        const seen = new Set<string>();
        for (const rawAlias of f.aliases || []) {
          const clean = rawAlias.trim();
          if (!clean) continue;
          const lower = clean.toLowerCase();
          if (seen.has(lower)) continue;
          seen.add(lower);
          aliasRows.push({
            food_id: f.id,
            alias_name: clean,
            alias_type: 'common',
            language_region: f.country || null,
          });
        }
      }
      if (aliasRows.length > 0) {
        await sb.from('food_aliases').insert(aliasRows);
      }

      await sb.from('food_portions').delete().in('food_id', batchIds);
      const allowedUnits = new Set([
        'g',
        'ml',
        'piece',
        'cup',
        'bowl',
        'katori',
        'tbsp',
        'tsp',
        'glass',
        'plate',
        'scoop',
        'slice',
      ]);
      const portionRows: Array<Record<string, unknown>> = [];
      for (const f of batch) {
        for (const p of f.portions || []) {
          if (!Number.isFinite(p.gramOrMlWeight) || p.gramOrMlWeight <= 0) continue;
          portionRows.push({
            food_id: f.id,
            portion_name: p.portionName,
            size_variant:
              p.sizeVariant === 'small' ||
              p.sizeVariant === 'medium' ||
              p.sizeVariant === 'large' ||
              p.sizeVariant === 'standard'
                ? p.sizeVariant
                : 'standard',
            gram_or_ml_weight: p.gramOrMlWeight,
            unit_type: allowedUnits.has(p.unitType) ? p.unitType : 'g',
            measurement_method: p.measurementMethod || 'standardized_indian_household',
            source_reference: p.sourceReference || 'Calothrix Reference',
            confidence_level:
              p.confidenceLevel === 'high' || p.confidenceLevel === 'moderate' || p.confidenceLevel === 'low'
                ? p.confidenceLevel
                : 'high',
            is_default: Boolean(p.isDefault),
          });
        }
      }
      if (portionRows.length > 0) {
        await sb.from('food_portions').insert(portionRows);
      }

      seededCount += batch.length;
    }

    clearFoodCaches();
    return {
      ok: true,
      seededFoods: seededCount,
      skippedAdminEdited: adminEditedIds.size,
    };
  } catch (err) {
    return {
      ok: false,
      seededFoods: 0,
      skippedAdminEdited: 0,
      error: err instanceof Error ? err.message : 'Master seed failed',
    };
  }
}

export interface AdminVerifyFoodPayload {
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

export async function adminVerifyOrUpdateFood(
  foodId: string,
  payload: AdminVerifyFoodPayload,
  adminUserId?: string,
  userAccessToken?: string
): Promise<{ ok: boolean; item?: FoodItem; version?: number; error?: string }> {
  const sb = getServerSupabase(userAccessToken);
  if (!sb) return { ok: false, error: 'Supabase unavailable' };

  const localBase = GLOBAL_REFERENCE_FOODS.find((f) => f.id === foodId);

  // Check if food already exists in DB
  const { data: dbRow } = await sb
    .from('foods')
    .select(
      `
      id, source_id, original_source_code, source_url, food_name, brand, country, barcode,
      food_group, category, food_state, canonical_family, measurement_basis, serving_name,
      serving_weight_grams, liquid_density_g_per_ml, dietary_tags, ingredients_text,
      verification_status, is_custom, is_discontinued, version, change_notes, last_updated,
      food_sources(source_name, source_priority, license),
      food_nutrients(energy_kj, calories_kcal, atwater_calories_kcal, protein_g, fat_g, carbohydrate_g, carbohydrate_basis, total_dietary_fibre_g, insoluble_fibre_g, soluble_fibre_g, water_g, ash_g, micronutrients),
      food_aliases(alias_name),
      food_portions(id, food_id, portion_name, size_variant, gram_or_ml_weight, unit_type, measurement_method, source_reference, confidence_level, is_default)
    `
    )
    .eq('id', foodId)
    .maybeSingle();

  let currentFood: FoodItem | undefined = localBase;
  if (dbRow) {
    const raw = dbRow as Record<string, unknown>;
    const src = (raw.food_sources || {}) as Record<string, unknown>;
    const nut = Array.isArray(raw.food_nutrients)
      ? ((raw.food_nutrients[0] || {}) as Record<string, unknown>)
      : ((raw.food_nutrients || {}) as Record<string, unknown>);
    const aliases = Array.isArray(raw.food_aliases)
      ? (raw.food_aliases as Array<{ alias_name?: string }>).map((a) => a.alias_name).filter(Boolean)
      : [];
    currentFood = mapMasterRowToFoodItem({
      ...raw,
      source_name: src.source_name,
      source_priority: src.source_priority,
      license: src.license,
      ...nut,
      aliases,
      portions: [],
    });
  }

  if (!currentFood) {
    return { ok: false, error: `Food '${foodId}' not found in reference catalog or Postgres` };
  }

  const nextVersion = (currentFood.version || 1) + 1;
  const nowIso = new Date().toISOString();
  const prevPer100 = getNutrientsPer100g(currentFood);

  const nextCalories = payload.nutrients ? payload.nutrients.calories : prevPer100.calories;
  const nextProtein = payload.nutrients ? payload.nutrients.protein : prevPer100.protein;
  const nextCarbs = payload.nutrients ? payload.nutrients.carbs : prevPer100.carbs;
  const nextFat = payload.nutrients ? payload.nutrients.fat : prevPer100.fat;
  const nextFibre = payload.nutrients ? payload.nutrients.fibre : prevPer100.fibre;
  const nextEnergyKj =
    payload.nutrients && payload.nutrients.energyKj !== undefined
      ? payload.nutrients.energyKj
      : currentFood.rawNutrients?.energyKj ?? currentFood.energyKj ?? null;

  const missingFields: NutrientFieldKey[] = [];
  if (nextCalories === null) missingFields.push('calories');
  if (nextProtein === null) missingFields.push('protein');
  if (nextCarbs === null) missingFields.push('carbs');
  if (nextFat === null) missingFields.push('fat');
  if (nextFibre === null) missingFields.push('fibre');

  const basis =
    currentFood.carbohydrateBasis ||
    ((currentFood.sourceName || '').toLowerCase().includes('usda')
      ? 'total_by_difference'
      : 'available');

  const nextRawNutrients: RawNutrientValues = {
    ...(currentFood.rawNutrients || {}),
    energyKj: nextEnergyKj,
    calories: nextCalories,
    protein: nextProtein,
    carbs: nextCarbs,
    fat: nextFat,
    fibre: nextFibre,
  };

  const atwater = calculateAtwaterCaloriesPer100g(
    {
      protein: nextProtein,
      carbs: nextCarbs,
      fat: nextFat,
      fibre: nextFibre,
    },
    basis
  );

  const nextFoodState = payload.foodState || currentFood.foodState || 'prepared';
  const nextCanonicalFamily =
    payload.canonicalFamily !== undefined
      ? payload.canonicalFamily || undefined
      : currentFood.canonicalFamily;
  const nextIsDiscontinued =
    payload.isDiscontinued !== undefined
      ? payload.isDiscontinued
      : Boolean(currentFood.isDiscontinued);

  const updatedFood: FoodItem = {
    ...currentFood,
    foodState: nextFoodState,
    canonicalFamily: nextCanonicalFamily,
    verificationStatus: payload.verificationStatus,
    isDiscontinued: nextIsDiscontinued,
    version: nextVersion,
    approvedBy: adminUserId,
    approvedAt: nowIso,
    changeNotes: payload.changeNotes || currentFood.changeNotes,
    lastUpdated: nowIso.slice(0, 10),
    measurementBasis: payload.nutrients ? 'per_100g' : currentFood.measurementBasis,
    servingName: payload.nutrients ? '100 g' : currentFood.servingName,
    servingWeightGrams: payload.nutrients ? 100 : currentFood.servingWeightGrams,
    calories: nextCalories ?? 0,
    protein: nextProtein ?? 0,
    carbs: nextCarbs ?? 0,
    fat: nextFat ?? 0,
    fibre: nextFibre ?? 0,
    energyKj: nextEnergyKj,
    atwaterCalories: atwater,
    rawNutrients: nextRawNutrients,
    missingFields: missingFields.length > 0 ? missingFields : undefined,
  };
  updatedFood.validationIssues = validateFoodRecord(updatedFood);

  try {
    const sourceRowId = mapSourceIdForFood(updatedFood);
    await sb
      .from('food_sources')
      .upsert(CANONICAL_SOURCE_ROWS.filter((s) => s.id === sourceRowId), { onConflict: 'id' });

    const { error: foodUpsertErr } = await sb.from('foods').upsert(
      {
        id: updatedFood.id,
        source_id: sourceRowId,
        original_source_code: updatedFood.foodCode || updatedFood.sourceId || null,
        source_url: updatedFood.sourceUrl || null,
        food_name: updatedFood.name,
        brand: updatedFood.brand || null,
        country: updatedFood.country || 'India',
        barcode: updatedFood.barcode || null,
        food_group: updatedFood.foodGroup || null,
        category: updatedFood.category,
        food_state: updatedFood.foodState,
        canonical_family: updatedFood.canonicalFamily || null,
        measurement_basis: updatedFood.measurementBasis || 'per_100g',
        serving_name: updatedFood.servingName || '100 g',
        serving_weight_grams: updatedFood.servingWeightGrams || 100,
        liquid_density_g_per_ml: updatedFood.liquidDensityGPerMl ?? null,
        dietary_tags: updatedFood.dietaryTags || [],
        ingredients_text: updatedFood.ingredientsText || null,
        verification_status: updatedFood.verificationStatus,
        is_custom: Boolean(updatedFood.isCustom),
        is_discontinued: Boolean(updatedFood.isDiscontinued),
        version: nextVersion,
        approved_by: adminUserId || null,
        approved_at: nowIso,
        change_notes: payload.changeNotes || null,
        last_updated: nowIso,
      },
      { onConflict: 'id' }
    );

    if (foodUpsertErr) {
      return { ok: false, error: foodUpsertErr.message };
    }

    const { error: nutErr } = await sb.from('food_nutrients').upsert(
      {
        food_id: updatedFood.id,
        energy_kj: nextEnergyKj,
        calories_kcal: nextCalories,
        atwater_calories_kcal: atwater,
        protein_g: nextProtein,
        fat_g: nextFat,
        carbohydrate_g: nextCarbs,
        available_carbohydrate_g: basis === 'available' ? nextCarbs : null,
        carbohydrate_basis: basis,
        total_dietary_fibre_g: nextFibre,
        insoluble_fibre_g: updatedFood.insolubleFibreG ?? null,
        soluble_fibre_g: updatedFood.solubleFibreG ?? null,
        water_g: updatedFood.waterG ?? null,
        ash_g: updatedFood.ashG ?? null,
        micronutrients: updatedFood.micronutrients || {},
        updated_at: nowIso,
      },
      { onConflict: 'food_id' }
    );

    if (nutErr) {
      return { ok: false, error: nutErr.message };
    }

    await sb.from('food_versions').insert({
      food_id: updatedFood.id,
      version: nextVersion,
      verification_status: updatedFood.verificationStatus || 'verified',
      food_state: updatedFood.foodState || 'prepared',
      change_notes: payload.changeNotes || `Admin updated status to ${updatedFood.verificationStatus}`,
      changed_by: adminUserId || null,
      food_snapshot: updatedFood,
      nutrients_snapshot: nextRawNutrients,
      portions_snapshot: updatedFood.portions || [],
    });

    await sb.from('food_validation_logs').insert({
      food_id: updatedFood.id,
      check_code: 'admin_verification_action',
      severity: payload.verificationStatus === 'needs_review' ? 'warning' : 'info',
      message:
        payload.changeNotes ||
        `Admin set status=${payload.verificationStatus}, state=${nextFoodState}, v${nextVersion}`,
      details: {
        version: nextVersion,
        isDiscontinued: nextIsDiscontinued,
        canonicalFamily: nextCanonicalFamily || null,
        missingFields,
      },
      resolved: payload.verificationStatus === 'verified' || payload.verificationStatus === 'enriched',
    });

    clearFoodCaches();
    return { ok: true, item: updatedFood, version: nextVersion };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to verify food',
    };
  }
}

export async function getFoodVersionHistory(
  foodId: string,
  userAccessToken?: string
): Promise<{ ok: boolean; versions: FoodVersionRecord[]; error?: string }> {
  const sb = getServerSupabase(userAccessToken);
  if (!sb) return { ok: false, versions: [], error: 'Supabase unavailable' };
  try {
    const { data, error } = await sb
      .from('food_versions')
      .select(
        'id, food_id, version, verification_status, food_state, change_notes, changed_by, created_at, nutrients_snapshot'
      )
      .eq('food_id', foodId)
      .order('version', { ascending: false })
      .limit(25);
    if (error) return { ok: false, versions: [], error: error.message };
    const versions: FoodVersionRecord[] = (data || []).map((row: Record<string, unknown>) => ({
      id: String(row.id),
      foodId: String(row.food_id),
      version: Number(row.version || 1),
      verificationStatus: row.verification_status as VerificationStatus,
      foodState: row.food_state as FoodState,
      changeNotes: row.change_notes ? String(row.change_notes) : undefined,
      changedBy: row.changed_by ? String(row.changed_by) : undefined,
      createdAt: String(row.created_at),
      nutrientsSnapshot: (row.nutrients_snapshot || {}) as Record<string, unknown>,
    }));
    return { ok: true, versions };
  } catch (err) {
    return {
      ok: false,
      versions: [],
      error: err instanceof Error ? err.message : 'Failed to load version history',
    };
  }
}

export function scoreSemanticMatch(food: FoodItem, query: string): number {
  const q = query.toLowerCase();
  let score = 0;

  const haystack = `${food.name} ${food.brand || ''} ${food.country || ''} ${food.category} ${
    food.ingredientsText || ''
  } ${(food.aliases || []).join(' ')} ${(food.dietaryTags || []).join(' ')} ${food.foodState || ''}`.toLowerCase();

  const words = q
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter(
      (w) =>
        w.length >= 2 &&
        !['for', 'with', 'rich', 'high', 'low', 'in', 'foods', 'food'].includes(w)
    );

  for (const w of words) {
    if (haystack.includes(w)) score += 18;
  }

  if (q.includes('high protein') || q.includes('protein rich') || q.includes('protein source')) {
    const per100CalProtein = food.calories > 0 ? (food.protein / food.calories) * 100 : 0;
    if (food.protein >= 10 || per100CalProtein >= 8) score += 35;
    if (food.protein < 4) score -= 15;
  }
  if (q.includes('low calorie') || q.includes('light') || q.includes('fat loss')) {
    const calPer100g = (food.calories / Math.max(1, food.servingWeightGrams)) * 100;
    if (calPer100g <= 150) score += 28;
    if (calPer100g > 300) score -= 18;
  }
  if (q.includes('fibre') || q.includes('fiber')) {
    if (food.fibre >= 3) score += 34;
    if (food.fibre < 1) score -= 15;
  }
  if (q.includes('vegetarian') || q.includes('veg')) {
    if (food.dietaryTags?.includes('vegetarian')) score += 25;
    else if (food.category === 'Meat and poultry' || food.category === 'Fish and seafood')
      score -= 60;
  }
  if (q.includes('vegan')) {
    if (food.dietaryTags?.includes('vegan')) score += 30;
    else score -= 45;
  }
  if (q.includes('indian')) {
    if (food.country === 'India' || food.category === 'Indian foods') score += 26;
  }
  if (q.includes('breakfast')) {
    if (/oats|idli|dosa|poha|upma|egg|milk|yoghurt|yogurt|bread|chilla|banana|rotti|mudde/i.test(food.name)) {
      score += 24;
    }
  }
  if (q.includes('dinner') || q.includes('lunch')) {
    if (
      /chicken|fish|salmon|paneer|tofu|dal|sambar|rasam|rajma|roti|rice|bisibele|curry/i.test(
        food.name
      )
    ) {
      score += 18;
    }
  }

  return score;
}

function normalizeDedupKey(food: FoodItem): string {
  if (food.barcode && /^\d{6,14}$/.test(food.barcode.trim())) {
    return `barcode:${food.barcode.trim()}`;
  }
  const cleanName = food.name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const cleanBrand = (food.brand || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const state = (food.foodState || 'unknown').toLowerCase();
  return `name:${cleanName}|brand:${cleanBrand}|state:${state}`;
}

function computeMacroCompleteness(food: FoodItem): number {
  let score = 0;
  if (food.calories > 0 && !food.missingFields?.includes('calories')) score += 20;
  if (food.protein >= 0 && !food.missingFields?.includes('protein')) score += 12;
  if (food.carbs >= 0 && !food.missingFields?.includes('carbs')) score += 12;
  if (food.fat >= 0 && !food.missingFields?.includes('fat')) score += 12;
  if (food.fibre > 0 || !food.missingFields?.includes('fibre')) score += 6;
  if (food.verificationStatus === 'verified') score += 18;
  if (food.verificationStatus === 'needs_review') score -= 22;
  const isZeroCalDrink = /water|black coffee|green tea|black tea|americano|zero/i.test(food.name);
  if (food.calories === 0 && food.protein === 0 && food.carbs === 0 && food.fat === 0 && !isZeroCalDrink) {
    score -= 80;
  }
  return score;
}

export function dedupeAndRankGlobalFoods(
  candidates: FoodItem[],
  query: string,
  country?: string,
  semantic?: boolean
): FoodItem[] {
  // Merge exact IDs first so DB-edited / discontinued rows override static rows
  const byId = new Map<string, FoodItem>();
  for (const food of candidates) {
    const existing = byId.get(food.id);
    if (!existing) {
      byId.set(food.id, food);
      continue;
    }
    const existingVer = existing.version || 1;
    const nextVer = food.version || 1;
    if (nextVer > existingVer || (food.isDiscontinued && !existing.isDiscontinued)) {
      byId.set(food.id, food);
    }
  }

  const dedupMap = new Map<string, FoodItem>();

  for (const food of byId.values()) {
    if (food.isDiscontinued) continue;
    const key = normalizeDedupKey(food);
    const existing = dedupMap.get(key);
    if (!existing) {
      dedupMap.set(key, food);
      continue;
    }
    const existingPriority = getCanonicalSourcePriority(existing);
    const nextPriority = getCanonicalSourcePriority(food);
    const existingComp = computeMacroCompleteness(existing);
    const nextComp = computeMacroCompleteness(food);
    if (nextPriority < existingPriority || (nextPriority === existingPriority && nextComp > existingComp)) {
      dedupMap.set(key, food);
    }
  }

  const unique = [...dedupMap.values()];
  if (!query) return unique;

  const preferredCountry = country && country !== 'All' ? country.toLowerCase() : null;

  const scored = unique.map((food) => {
    const baseMatch = semantic
      ? scoreSemanticMatch(food, query)
      : scoreFoodMatch(food, query)?.score ?? 0;

    const completeness = computeMacroCompleteness(food);
    const priority = getCanonicalSourcePriority(food);
    const priorityBonus = Math.max(0, 6 - priority) * 10;
    const countryBonus =
      preferredCountry && food.country?.toLowerCase() === preferredCountry
        ? 18
        : !preferredCountry && food.country === 'India' && !food.isCustom && priority <= 2
        ? 6
        : 0;

    return {
      food,
      totalScore: baseMatch + completeness + priorityBonus + countryBonus,
      priority,
    };
  });

  scored.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.food.name.localeCompare(b.food.name);
  });

  return scored.map((s) => s.food);
}

export async function searchGlobalFoods(
  options: GlobalSearchOptions,
  userAccessToken?: string
): Promise<GlobalSearchResponse> {
  const t0 = performance.now();
  const query = options.query.trim();
  const category = options.category?.trim();
  const country = options.country?.trim();
  const sourceFilter = options.source?.trim();
  const groupFilter = options.group && options.group !== 'all' ? options.group : undefined;
  const familyFilter = options.familyId?.trim() || undefined;
  const page = Math.max(1, Number(options.page || 1));
  const limit = Math.min(100, Math.max(1, Number(options.limit || 40)));
  const isBarcodeQuery = /^\d{8,14}$/.test(query) || Boolean(options.barcode);

  if (isBarcodeQuery) {
    const code = (options.barcode || query).replace(/\D/g, '');
    const { item, error } = await lookupBarcodeFromOpenFoodFacts(code, userAccessToken);
    const items = item && !item.isDiscontinued ? [item] : [];
    return {
      items,
      grouped: groupSearchResultsByType(items),
      totalCount: items.length,
      page: 1,
      limit,
      hasMore: false,
      elapsedMs: Math.round((performance.now() - t0) * 100) / 100,
      sourceMeta: {
        ifctCount: item?.sourceName?.includes('IFCT') ? 1 : 0,
        dbCount: 0,
        offCount: item?.sourceName?.includes('Open Food Facts') ? 1 : 0,
        usdaCount: 0,
        offError: error,
        usdaConfigured: Boolean(getUsdaApiKey()),
        externalFallbackUsed: true,
        geminiFallbackUsed: false,
      },
    };
  }

  const cacheKey = JSON.stringify({
    query: query.toLowerCase(),
    category,
    country,
    sourceFilter,
    groupFilter,
    familyFilter,
    page,
    limit,
    semantic: Boolean(options.semantic),
    includeExternal: Boolean(options.includeExternal),
  });
  const cached = SEARCH_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      ...cached.value,
      elapsedMs: Math.round((performance.now() - t0) * 100) / 100,
    };
  }

  // 1. Fast DB-First Search: Local Indexed Master Catalog (IFCT + INDB + Karnataka + UK/US FCT)
  //    + Supabase Postgres Master RPC (bounded with tight timeout + circuit breaker so searches stay well under 200ms)
  const fullCatalog = getFullServerFoodCatalog();
  const nowMs = Date.now();
  let overrides: FoodItem[] = OVERRIDES_CACHE && OVERRIDES_CACHE.expiresAt > nowMs ? OVERRIDES_CACHE.value : [];
  let dbItems: FoodItem[] = [];

  if (nowMs >= supabaseRpcBackoffUntil) {
    const timedOut = Symbol('timeout');
    const [ovRes, dbRes] = await Promise.all([
      overrides.length > 0
        ? Promise.resolve(overrides)
        : Promise.race([
            fetchPublicFoodOverrides(userAccessToken),
            new Promise<typeof timedOut>((resolve) => setTimeout(() => resolve(timedOut), 50)),
          ]),
      Promise.race([
        searchSupabaseFoodsMaster(options, userAccessToken),
        new Promise<typeof timedOut>((resolve) => setTimeout(() => resolve(timedOut), 55)),
      ]),
    ]);

    if (ovRes === timedOut || dbRes === timedOut) {
      // Back off remote RPC for 60s when Supabase is slow/unmigrated so searches run in <20ms
      supabaseRpcBackoffUntil = Date.now() + 60_000;
    }
    if (ovRes !== timedOut) overrides = ovRes;
    if (dbRes !== timedOut) dbItems = dbRes;
  }

  const overrideById = new Map(overrides.map((f) => [f.id, f]));

  const preFiltered = fullCatalog
    .map((f) => overrideById.get(f.id) || f)
    .filter((food) => {
      if (!isFoodNutritionallyUsable(food)) return false;
      if (category && category !== 'All' && food.category !== category) return false;
      if (country && country !== 'All' && food.country !== country) return false;
      if (sourceFilter && sourceFilter !== 'All' && food.sourceType !== sourceFilter) return false;
      if (groupFilter && inferFoodResultGroup(food) !== groupFilter) return false;
      if (familyFilter && (food.foodFamilyId || food.canonicalFamily) !== familyFilter) return false;
      return true;
    });

  let localMatches: FoodItem[];
  if (!query) {
    localMatches = preFiltered;
  } else if (options.semantic) {
    localMatches = preFiltered
      .filter((food) => scoreSemanticMatch(food, query) > 10)
      .sort((a, b) => scoreSemanticMatch(b, query) - scoreSemanticMatch(a, query));
  } else {
    localMatches = searchFoodsIntelligent(preFiltered, query, {
      group: groupFilter || 'all',
      familyId: familyFilter,
    });
  }

  const applyPostFilters = (list: FoodItem[]) =>
    list.filter((food) => {
      if (!isFoodNutritionallyUsable(food)) return false;
      if (category && category !== 'All' && food.category !== category) return false;
      if (country && country !== 'All' && food.country !== country) return false;
      if (sourceFilter && sourceFilter !== 'All' && food.sourceType !== sourceFilter) return false;
      if (groupFilter && inferFoodResultGroup(food) !== groupFilter) return false;
      if (familyFilter && (food.foodFamilyId || food.canonicalFamily) !== familyFilter) return false;
      return true;
    });

  const filteredDb = applyPostFilters(dbItems);
  const primaryMerged = dedupeAndRankGlobalFoods(
    [...filteredDb, ...localMatches],
    query,
    country,
    Boolean(options.semantic)
  );

  // 2. Fallback-ONLY External API calls (USDA / Open Food Facts)
  //    Normal searches NEVER wait for external APIs when local/Supabase DB already has >= 3 relevant matches!
  let filteredOff: FoodItem[] = [];
  let filteredUsda: FoodItem[] = [];
  let offError: string | undefined;
  let usdaError: string | undefined;
  let externalFallbackUsed = false;
  const usdaConfigured = Boolean(getUsdaApiKey());

  const shouldFallbackToExternal =
    query.length >= 2 &&
    (Boolean(options.includeExternal) || primaryMerged.length === 0) &&
    (!sourceFilter ||
      sourceFilter === 'All' ||
      sourceFilter === 'branded' ||
      sourceFilter === 'community' ||
      sourceFilter === 'verified_reference');

  if (shouldFallbackToExternal) {
    externalFallbackUsed = true;
    const externalQuery = options.semantic
      ? query
          .replace(
            /\b(high protein|low calorie|rich in fibre|vegetarian|vegan|indian|breakfast|dinner)\b/gi,
            ''
          )
          .trim() || query
      : query;

    const [offRes, usdaRes] = await Promise.all([
      sourceFilter !== 'verified_reference'
        ? searchOpenFoodFacts(externalQuery, country)
        : Promise.resolve({ items: [] as FoodItem[], error: undefined }),
      sourceFilter !== 'community'
        ? searchUsdaFoodDataCentral(externalQuery)
        : Promise.resolve({
            items: [] as FoodItem[],
            configured: usdaConfigured,
            error: undefined,
          }),
    ]);

    filteredOff = applyPostFilters(offRes.items);
    offError = offRes.error;
    filteredUsda = applyPostFilters(usdaRes.items);
    usdaError = usdaRes.error;
  }

  const allMerged =
    filteredOff.length > 0 || filteredUsda.length > 0
      ? dedupeAndRankGlobalFoods(
          [...primaryMerged, ...filteredUsda, ...filteredOff],
          query,
          country,
          Boolean(options.semantic)
        )
      : primaryMerged;

  // 3. Fallback-ONLY Gemini Regional Query Resolver
  //    NEVER invoked on normal searches with matches; ONLY when DB + external returns 0 matches!
  let regionalSuggestion: RegionalSearchSuggestion | null = null;
  let geminiFallbackUsed = false;
  if (allMerged.length === 0 && query.length >= 3 && options.allowAiFallback !== false) {
    geminiFallbackUsed = true;
    regionalSuggestion = await resolveRegionalFoodQueryWithGemini(query, preFiltered);
  }

  const totalCount = allMerged.length;
  const offset = (page - 1) * limit;
  const pageItems = allMerged.slice(offset, offset + limit);
  const grouped = groupSearchResultsByType(pageItems);

  const response: GlobalSearchResponse = {
    items: pageItems,
    grouped,
    totalCount,
    page,
    limit,
    hasMore: offset + limit < totalCount,
    elapsedMs: Math.round((performance.now() - t0) * 100) / 100,
    ...(regionalSuggestion ? { regionalSuggestion } : {}),
    sourceMeta: {
      ifctCount: localMatches.length,
      dbCount: filteredDb.length,
      offCount: filteredOff.length,
      usdaCount: filteredUsda.length,
      offError,
      usdaError,
      usdaConfigured,
      externalFallbackUsed,
      geminiFallbackUsed,
    },
  };

  SEARCH_CACHE.set(cacheKey, { value: response, expiresAt: Date.now() + CACHE_TTL_MS });
  return response;
}
