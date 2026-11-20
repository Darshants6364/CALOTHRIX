import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  FoodCategory,
  FoodItem,
  FoodSourceType,
  FoodState,
  FoodValidationIssue,
  Micronutrients,
  NutrientFieldKey,
  RawNutrientValues,
} from '../src/types/index.ts';
import { GLOBAL_REFERENCE_FOODS } from '../src/data/globalReferenceFoods.ts';
import { scoreFoodMatch, searchFoodsIntelligent } from '../src/utils/foodSearchEngine.ts';
import {
  calculateAtwaterCaloriesPer100g,
  deriveVerificationStatus,
  getNutrientsPer100g,
  validateFoodRecord,
} from '../src/utils/foodValidationEngine.ts';

interface CachedValue<T> {
  value: T;
  expiresAt: number;
}

const SEARCH_CACHE = new Map<string, CachedValue<GlobalSearchResponse>>();
const BARCODE_CACHE = new Map<string, CachedValue<FoodItem | null>>();
const CACHE_TTL_MS = 15 * 60 * 1000;

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
}

export interface SourceStatus {
  ifct2017: { active: boolean; count: number; totalReferenceCount: number; license: string };
  openFoodFacts: { active: boolean; apiVersion: string; license: string };
  usdaFdc: { configured: boolean; envVar: string; license: string };
  supabaseAi: { edgeFunctionsAvailable: boolean };
}

export interface GlobalSearchResponse {
  items: FoodItem[];
  sourceMeta: {
    ifctCount: number;
    offCount: number;
    usdaCount: number;
    offError?: string;
    usdaError?: string;
    usdaConfigured: boolean;
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
  if (/\broasted\b|\btoasted\b|\bbaked\b|\bgrilled\b/.test(text)) return 'roasted';
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
    sourcePriority: 5,
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
      sourcePriority: 5,
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
        sourcePriority: isBranded ? 4 : 3,
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
  if (food.calories > 0) score += 20;
  if (food.protein >= 0 && !food.missingFields?.includes('protein')) score += 12;
  if (food.carbs >= 0 && !food.missingFields?.includes('carbs')) score += 12;
  if (food.fat >= 0 && !food.missingFields?.includes('fat')) score += 12;
  if (food.fibre > 0 || !food.missingFields?.includes('fibre')) score += 6;
  if (food.verificationStatus === 'verified') score += 18;
  if (food.verificationStatus === 'needs_review') score -= 22;
  // Penalize sparse 0-calorie external junk unless it's water/tea/black coffee
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
  const dedupMap = new Map<string, FoodItem>();

  for (const food of candidates) {
    const key = normalizeDedupKey(food);
    const existing = dedupMap.get(key);
    if (!existing) {
      dedupMap.set(key, food);
      continue;
    }
    const existingPriority = existing.sourcePriority ?? 6;
    const nextPriority = food.sourcePriority ?? 6;
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
    const priority = food.sourcePriority ?? 6;
    const priorityBonus = Math.max(0, 7 - priority) * 8;
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
  options: GlobalSearchOptions
): Promise<GlobalSearchResponse> {
  const query = options.query.trim();
  const category = options.category?.trim();
  const country = options.country?.trim();
  const sourceFilter = options.source?.trim();
  const isBarcodeQuery = /^\d{8,14}$/.test(query) || Boolean(options.barcode);

  if (isBarcodeQuery) {
    const code = (options.barcode || query).replace(/\D/g, '');
    const { item, error } = await lookupBarcodeFromOpenFoodFacts(code);
    return {
      items: item ? [item] : [],
      sourceMeta: {
        ifctCount: item?.sourceName?.includes('IFCT') ? 1 : 0,
        offCount: item?.sourceName?.includes('Open Food Facts') ? 1 : 0,
        usdaCount: 0,
        offError: error,
        usdaConfigured: Boolean(getUsdaApiKey()),
      },
    };
  }

  const cacheKey = JSON.stringify({
    query,
    category,
    country,
    sourceFilter,
    semantic: Boolean(options.semantic),
  });
  const cached = SEARCH_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  // 1. Local Verified DB using intelligent identification engine (alias, regional, fuzzy typo, state distinction, strict source hierarchy)
  const preFiltered = GLOBAL_REFERENCE_FOODS.filter((food) => {
    if (category && category !== 'All' && food.category !== category) return false;
    if (country && country !== 'All' && food.country !== country) return false;
    if (sourceFilter && sourceFilter !== 'All' && food.sourceType !== sourceFilter) return false;
    return true;
  });

  let localMatches: FoodItem[];
  if (!query) {
    localMatches = preFiltered.slice(0, 60);
  } else if (options.semantic) {
    localMatches = preFiltered
      .filter((food) => scoreSemanticMatch(food, query) > 10)
      .sort((a, b) => scoreSemanticMatch(b, query) - scoreSemanticMatch(a, query));
  } else {
    localMatches = searchFoodsIntelligent(preFiltered, query, { limit: 45 });
  }

  // 2. External APIs (only queried after local verified DB when query >= 2 chars)
  const shouldQueryExternal =
    query.length >= 2 &&
    (!sourceFilter ||
      sourceFilter === 'All' ||
      sourceFilter === 'branded' ||
      sourceFilter === 'community' ||
      sourceFilter === 'verified_reference');
  const externalQuery = options.semantic
    ? query
        .replace(
          /\b(high protein|low calorie|rich in fibre|vegetarian|vegan|indian|breakfast|dinner)\b/gi,
          ''
        )
        .trim() || query
    : query;

  let offItems: FoodItem[] = [];
  let offError: string | undefined;
  let usdaItems: FoodItem[] = [];
  let usdaError: string | undefined;
  const usdaConfigured = Boolean(getUsdaApiKey());

  if (shouldQueryExternal) {
    const [offRes, usdaRes] = await Promise.all([
      sourceFilter === 'verified_reference'
        ? Promise.resolve({ items: [] as FoodItem[], error: undefined })
        : searchOpenFoodFacts(externalQuery, country),
      sourceFilter === 'community'
        ? Promise.resolve({
            items: [] as FoodItem[],
            configured: usdaConfigured,
            error: undefined,
          })
        : searchUsdaFoodDataCentral(externalQuery),
    ]);

    offItems = offRes.items;
    offError = offRes.error;
    usdaItems = usdaRes.items;
    usdaError = usdaRes.error;
  }

  const applyPostFilters = (list: FoodItem[]) =>
    list.filter((food) => {
      if (category && category !== 'All' && food.category !== category) return false;
      if (sourceFilter && sourceFilter !== 'All' && food.sourceType !== sourceFilter) return false;
      return true;
    });

  const filteredUsda = applyPostFilters(usdaItems);
  const filteredOff = applyPostFilters(offItems);

  // Unified cross-source relevance re-ranking & deduplication while enforcing source priority & completeness
  const merged = dedupeAndRankGlobalFoods(
    [...localMatches, ...filteredUsda, ...filteredOff],
    query,
    country,
    Boolean(options.semantic)
  );
  const response: GlobalSearchResponse = {
    items: merged,
    sourceMeta: {
      ifctCount: localMatches.length,
      offCount: filteredOff.length,
      usdaCount: filteredUsda.length,
      offError,
      usdaError,
      usdaConfigured,
    },
  };

  SEARCH_CACHE.set(cacheKey, { value: response, expiresAt: Date.now() + CACHE_TTL_MS });
  return response;
}
