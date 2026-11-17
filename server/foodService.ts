import type {
  FoodCategory,
  FoodItem,
  FoodSourceType,
  Micronutrients,
  NutrientFieldKey,
} from '../src/types/index.ts';
import { GLOBAL_REFERENCE_FOODS } from '../src/data/globalReferenceFoods.ts';

interface CachedValue<T> {
  value: T;
  expiresAt: number;
}

const SEARCH_CACHE = new Map<string, CachedValue<GlobalSearchResponse>>();
const BARCODE_CACHE = new Map<string, CachedValue<FoodItem | null>>();
const CACHE_TTL_MS = 15 * 60 * 1000;

export interface GlobalSearchOptions {
  query: string;
  category?: string;
  country?: string;
  source?: string;
  barcode?: string;
  semantic?: boolean;
}

export interface SourceStatus {
  ifct2017: { active: boolean; count: number; license: string };
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
  return {
    ifct2017: {
      active: true,
      count: GLOBAL_REFERENCE_FOODS.length,
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
      edgeFunctionsAvailable: Boolean(process.env.VITE_SUPABASE_URL || 'https://zzncijlmoskbilxjgiua.supabase.co'),
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
  if (t.includes('milk') || t.includes('yogurt') || t.includes('yoghurt') || t.includes('cheese') || t.includes('dairy')) {
    return 'Dairy';
  }
  if (t.includes('chicken') || t.includes('beef') || t.includes('meat') || t.includes('poultry') || t.includes('egg')) {
    return 'Meat and poultry';
  }
  if (t.includes('fish') || t.includes('salmon') || t.includes('tuna') || t.includes('seafood')) {
    return 'Fish and seafood';
  }
  if (t.includes('rice') || t.includes('bread') || t.includes('oat') || t.includes('cereal') || t.includes('grain') || t.includes('wheat')) {
    return 'Grains and cereals';
  }
  if (t.includes('nut') || t.includes('almond') || t.includes('seed') || t.includes('peanut')) {
    return 'Nuts and seeds';
  }
  if (t.includes('beverage') || t.includes('drink') || t.includes('tea') || t.includes('coffee') || t.includes('juice')) {
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

function normalizeOpenFoodFactsProduct(raw: Record<string, unknown>): FoodItem | null {
  const name = String(raw.product_name || raw.product_name_en || raw.generic_name || '').trim();
  const code = String(raw.code || raw._id || '').trim();
  if (!name || !code) return null;

  const nutriments = (raw.nutriments || {}) as Record<string, unknown>;
  const missingFields: NutrientFieldKey[] = [];

  const kcalRaw =
    nutriments['energy-kcal_100g'] ??
    nutriments['energy-kcal'] ??
    (typeof nutriments['energy_100g'] === 'number'
      ? Number(nutriments['energy_100g']) / 4.184
      : undefined);

  const proteinRaw = nutriments['proteins_100g'];
  const carbsRaw = nutriments['carbohydrates_100g'];
  const fatRaw = nutriments['fat_100g'];
  const fibreRaw = nutriments['fiber_100g'];

  const parseNutrient = (v: unknown, key: NutrientFieldKey): number => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN;
    if (!Number.isFinite(n) || n < 0) {
      missingFields.push(key);
      return 0;
    }
    return key === 'calories' ? Math.round(n) : roundNum(n);
  };

  const calories = parseNutrient(kcalRaw, 'calories');
  const protein = parseNutrient(proteinRaw, 'protein');
  const carbs = parseNutrient(carbsRaw, 'carbs');
  const fat = parseNutrient(fatRaw, 'fat');
  const fibre = parseNutrient(fibreRaw, 'fibre');

  // Skip completely empty entries with zero nutrition info
  if (missingFields.length >= 4) return null;

  const brand = String(raw.brands || '').split(',')[0]?.trim() || undefined;
  const countries = String(raw.countries || raw.countries_tags_en || '')
    .replace(/en:/g, '')
    .split(',')[0]
    ?.trim() || undefined;
  const categoriesText = String(raw.categories || '');
  const ingredientsText = String(raw.ingredients_text || raw.ingredients_text_en || '').trim() || undefined;
  const servingQty = Number(raw.serving_quantity);
  const servingSizeStr = String(raw.serving_size || '').trim();
  const servingWeightGrams =
    Number.isFinite(servingQty) && servingQty > 0 ? Math.min(1000, servingQty) : 100;

  // OFF nutriments *_100g are per 100g; store per 100g as base serving so scaling is exact
  const micronutrients: Micronutrients = {
    sugarG:
      typeof nutriments['sugars_100g'] === 'number' ? roundNum(Number(nutriments['sugars_100g'])) : null,
    saturatedFatG:
      typeof nutriments['saturated-fat_100g'] === 'number'
        ? roundNum(Number(nutriments['saturated-fat_100g']))
        : null,
    sodiumMg:
      typeof nutriments['sodium_100g'] === 'number'
        ? Math.round(Number(nutriments['sodium_100g']) * 1000)
        : null,
    calciumMg:
      typeof nutriments['calcium_100g'] === 'number'
        ? Math.round(Number(nutriments['calcium_100g']) * 1000)
        : null,
    ironMg:
      typeof nutriments['iron_100g'] === 'number'
        ? roundNum(Number(nutriments['iron_100g']) * 1000)
        : null,
  };

  const isBranded = Boolean(brand);
  const sourceType: FoodSourceType = isBranded ? 'branded' : 'community';

  return {
    id: `off-${code}`,
    name: brand && !name.toLowerCase().includes(brand.toLowerCase()) ? `${name}` : name,
    brand,
    country: countries || 'International',
    barcode: code,
    ingredientsText,
    category: mapCategoryFromText(`${categoriesText} ${name}`),
    servingName: servingSizeStr ? `100 g (pkg serving: ${servingSizeStr})` : '100 g',
    servingWeightGrams: 100,
    calories,
    protein,
    carbs,
    fat,
    fibre,
    isCustom: false,
    sourceType,
    sourceName: 'Open Food Facts',
    sourceId: code,
    sourceUrl: `https://world.openfoodfacts.org/product/${encodeURIComponent(code)}`,
    license: 'ODbL (Open Database License)',
    dataQuality: missingFields.length === 0 ? 'moderate' : 'moderate',
    missingFields: missingFields.length > 0 ? missingFields : undefined,
    micronutrients,
  };
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
      'code,product_name,product_name_en,brands,countries,categories,ingredients_text,ingredients_text_en,serving_size,serving_quantity,nutriments'
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
      .map((item) =>
        isIndia && (!item.country || item.country === 'International')
          ? { ...item, country: 'India', sourceName: 'Open Food Facts India' }
          : item
      );
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
  const url = `${host}/api/v2/product/${encodeURIComponent(cleanCode)}.json?fields=code,product_name,product_name_en,brands,countries,categories,ingredients_text,ingredients_text_en,serving_size,serving_quantity,nutriments`;
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

export async function lookupBarcodeFromOpenFoodFacts(barcode: string): Promise<{
  item: FoodItem | null;
  error?: string;
}> {
  const cleanCode = barcode.replace(/\D/g, '').trim();
  if (!cleanCode) return { item: null, error: 'Invalid barcode' };

  const localMatch = GLOBAL_REFERENCE_FOODS.find((f) => f.barcode === cleanCode);
  if (localMatch) return { item: localMatch };

  const cached = BARCODE_CACHE.get(cleanCode);
  if (cached && cached.expiresAt > Date.now()) {
    return { item: cached.value };
  }

  const isIndianGs1 = cleanCode.startsWith('890');
  const hosts = isIndianGs1
    ? ['https://in.openfoodfacts.org', 'https://world.openfoodfacts.org']
    : ['https://world.openfoodfacts.org', 'https://in.openfoodfacts.org'];

  try {
    let lastError: string | undefined;
    for (const host of hosts) {
      const res = await fetchOpenFoodFactsProductFromHost(host, cleanCode);
      if (res.item) {
        BARCODE_CACHE.set(cleanCode, { value: res.item, expiresAt: Date.now() + CACHE_TTL_MS });
        return { item: res.item };
      }
      if (res.error) lastError = res.error;
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

      const brand = (f.brandName || f.brandOwner || '').trim() || undefined;
      const isBranded = f.dataType === 'Branded' || Boolean(brand);
      const sourceType: FoodSourceType = isBranded ? 'branded' : 'verified_reference';

      const micronutrients: Micronutrients = {
        sugarG: findUsdaNutrient(nuts, [2000]),
        sodiumMg: findUsdaNutrient(nuts, [1093]),
        potassiumMg: findUsdaNutrient(nuts, [1092]),
        calciumMg: findUsdaNutrient(nuts, [1087]),
        ironMg: findUsdaNutrient(nuts, [1089]),
        vitaminCMg: findUsdaNutrient(nuts, [1162]),
        zincMg: findUsdaNutrient(nuts, [1095]),
      };

      return {
        id: `usda-${f.fdcId}`,
        name: f.description,
        brand,
        country: 'United States',
        barcode: f.gtinUpc || undefined,
        ingredientsText: f.ingredients || undefined,
        category: mapCategoryFromText(`${f.foodCategory || ''} ${f.description}`),
        servingName: '100 g',
        servingWeightGrams: 100,
        calories: calRaw !== null ? Math.round(calRaw) : 0,
        protein: proRaw !== null ? roundNum(proRaw) : 0,
        carbs: carbRaw !== null ? roundNum(carbRaw) : 0,
        fat: fatRaw !== null ? roundNum(fatRaw) : 0,
        fibre: fibRaw !== null ? roundNum(fibRaw) : 0,
        isCustom: false,
        sourceType,
        sourceName: `USDA FoodData Central (${f.dataType || 'Reference'})`,
        sourceId: String(f.fdcId),
        sourceUrl: `https://fdc.nal.usda.gov/fdc-app.html#/food-details/${f.fdcId}/nutrients`,
        license: 'USDA Public Domain (CC0)',
        dataQuality: isBranded ? 'moderate' : 'high',
        missingFields: missingFields.length > 0 ? missingFields : undefined,
        micronutrients,
      };
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
  } ${(food.dietaryTags || []).join(' ')}`.toLowerCase();

  const words = q
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length >= 2 && !['for', 'with', 'rich', 'high', 'low', 'in', 'foods', 'food'].includes(w));

  for (const w of words) {
    if (haystack.includes(w)) score += 18;
  }

  // Attribute-based semantic intelligence
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
    else if (food.category === 'Meat and poultry' || food.category === 'Fish and seafood') score -= 60;
  }
  if (q.includes('vegan')) {
    if (food.dietaryTags?.includes('vegan')) score += 30;
    else score -= 45;
  }
  if (q.includes('indian')) {
    if (food.country === 'India' || food.category === 'Indian foods') score += 26;
  }
  if (q.includes('breakfast')) {
    if (
      /oats|idli|dosa|poha|upma|egg|milk|yoghurt|yogurt|bread|chilla|banana/i.test(food.name)
    ) {
      score += 24;
    }
  }
  if (q.includes('dinner') || q.includes('lunch')) {
    if (/chicken|fish|salmon|paneer|tofu|dal|sambar|rajma|roti|rice|broccoli|spinach/i.test(food.name)) {
      score += 18;
    }
  }

  return score;
}

export async function searchGlobalFoods(options: GlobalSearchOptions): Promise<GlobalSearchResponse> {
  const query = options.query.trim();
  const category = options.category?.trim();
  const country = options.country?.trim();
  const sourceFilter = options.source?.trim();
  const isBarcodeQuery = /^\d{8,14}$/.test(query) || Boolean(options.barcode);

  // Barcode direct lookup
  if (isBarcodeQuery) {
    const code = (options.barcode || query).replace(/\D/g, '');
    const { item, error } = await lookupBarcodeFromOpenFoodFacts(code);
    return {
      items: item ? [item] : [],
      sourceMeta: {
        ifctCount: item?.sourceName?.includes('IFCT') ? 1 : 0,
        offCount: item?.sourceName === 'Open Food Facts' ? 1 : 0,
        usdaCount: 0,
        offError: error,
        usdaConfigured: Boolean(getUsdaApiKey()),
      },
    };
  }

  const cacheKey = JSON.stringify({ query, category, country, sourceFilter, semantic: Boolean(options.semantic) });
  const cached = SEARCH_CACHE.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  // 1. Local IFCT 2017 & Verified Reference Foods
  let localMatches = GLOBAL_REFERENCE_FOODS.filter((food) => {
    if (category && category !== 'All' && food.category !== category) return false;
    if (country && country !== 'All' && food.country !== country) return false;
    if (sourceFilter && sourceFilter !== 'All' && food.sourceType !== sourceFilter) return false;
    if (!query) return true;
    if (options.semantic) {
      return scoreSemanticMatch(food, query) > 10;
    }
    const q = query.toLowerCase();
    return (
      food.name.toLowerCase().includes(q) ||
      (food.brand || '').toLowerCase().includes(q) ||
      (food.country || '').toLowerCase().includes(q) ||
      food.category.toLowerCase().includes(q) ||
      (food.ingredientsText || '').toLowerCase().includes(q) ||
      (food.sourceId || '').toLowerCase().includes(q)
    );
  });

  if (options.semantic && query) {
    localMatches = [...localMatches].sort(
      (a, b) => scoreSemanticMatch(b, query) - scoreSemanticMatch(a, query)
    );
  }

  // Only query external APIs when there's an explicit search term >= 2 chars
  const shouldQueryExternal = query.length >= 2 && (!sourceFilter || sourceFilter === 'All' || sourceFilter === 'branded' || sourceFilter === 'community' || sourceFilter === 'verified_reference');
  const externalQuery = options.semantic
    ? query.replace(/\b(high protein|low calorie|rich in fibre|vegetarian|vegan|indian|breakfast|dinner)\b/gi, '').trim() || query
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
        ? Promise.resolve({ items: [] as FoodItem[], configured: usdaConfigured, error: undefined })
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

  const merged = [...localMatches, ...filteredUsda, ...filteredOff];
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
