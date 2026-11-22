import { FOOD_FAMILIES } from '../data/foodFamilies.ts';
import type { FoodItem, FoodResultGroup, GroupedFoodResults } from '../types/index.ts';
import { isFoodNutritionallyUsable } from './nutritionUtils.ts';

/**
 * Regional, Indian, Transliteration & Spelling-Variant Alias Map
 * Maps common queries, Kannada/Hindi/South Indian names, and common typos -> canonical search terms.
 * Respects dish specificity: plain dosa !== masala dosa; cooked rice !== raw rice.
 */
const ALIAS_EXPANSIONS: Record<string, string[]> = {
  // Common spelling variations & typos
  panner: ['paneer', 'cottage cheese'],
  paner: ['paneer', 'cottage cheese'],
  panir: ['paneer', 'cottage cheese'],
  paneer: ['paneer', 'cottage cheese', 'fresh paneer'],
  chiken: ['chicken', 'chicken breast'],
  chikken: ['chicken', 'chicken breast'],
  chkn: ['chicken'],
  chapatti: ['chapati', 'roti', 'phulka', 'whole wheat roti'],
  chappati: ['chapati', 'roti', 'phulka'],
  chapati: ['chapati', 'roti', 'phulka', 'whole wheat roti'],
  roti: ['roti', 'chapati', 'phulka', 'whole wheat roti'],
  phulka: ['roti', 'chapati', 'whole wheat roti'],
  idly: ['idli', 'steamed idli'],
  idli: ['idli', 'idly', 'steamed idli'],
  sambhar: ['sambar', 'huli'],
  sambar: ['sambar', 'sambhar', 'huli'],
  biriyani: ['biryani'],
  briyani: ['biryani'],
  biryani: ['biryani', 'biriyani'],
  parantha: ['paratha'],
  paratha: ['paratha', 'parantha'],
  omlet: ['omelette'],
  omelette: ['omelette', 'omlet'],
  daal: ['dal', 'lentil'],
  dhal: ['dal', 'lentil'],

  // Karnataka regional dishes & Kannada names
  'akki rotti': ['akki rotti', 'akki roti', 'rice roti'],
  'akki roti': ['akki rotti', 'rice roti'],
  'rice roti': ['akki rotti', 'akki roti'],
  'ragi mudde': ['ragi mudde', 'ragi ball', 'finger millet ball', 'ragi sankati'],
  'ragi ball': ['ragi mudde', 'finger millet ball'],
  'ragi rotti': ['ragi rotti', 'ragi roti', 'finger millet flatbread'],
  'ragi roti': ['ragi rotti'],
  'jolada rotti': ['jolada rotti', 'jowar roti', 'jowar bhakri', 'sorghum'],
  'jowar roti': ['jolada rotti', 'jowar bhakri'],
  'neer dosa': ['neer dosa', 'neer dose', 'water dosa'],
  'set dosa': ['set dosa', 'set dose', 'sponge dosa'],
  'mysore masala dosa': ['mysore masala dosa', 'mysuru masala dose', 'mysore dosa'],
  'maddur vada': ['maddur vada', 'maddur vade'],
  'bisi bele bath': ['bisibele bath', 'bisi bele bath', 'bisibelebath'],
  'bisibele bath': ['bisibele bath', 'bisi bele bath'],
  puliyogare: ['puliyogare', 'tamarind rice', 'pulihora'],
  'tamarind rice': ['puliyogare', 'pulihora'],
  'vangi bath': ['vangi bath', 'vangibath', 'brinjal rice'],
  'brinjal rice': ['vangi bath', 'vangibath'],
  chitranna: ['lemon rice', 'chitranna'],
  'lemon rice': ['lemon rice', 'chitranna', 'elumichai sadam'],
  mosaranna: ['curd rice', 'mosaranna', 'dahi chawal', 'thayir sadam'],
  'curd rice': ['curd rice', 'mosaranna', 'dahi chawal', 'thayir sadam', 'dahi bhaat'],
  'thayir sadam': ['curd rice', 'mosaranna'],
  'dahi chawal': ['curd rice', 'mosaranna'],
  'perugu annam': ['curd rice', 'mosaranna'],
  kosambari: ['kosambari', 'moong dal salad'],
  saaru: ['saaru', 'rasam', 'tili saaru', 'tomato rasam'],
  rasam: ['rasam', 'saaru', 'tomato rasam'],
  huli: ['huli', 'karnataka sambar', 'sambar'],
  avarekalu: ['avarekalu', 'hyacinth bean', 'field bean'],
  'ragi ganji': ['ragi ganji', 'ragi malt', 'ragi porridge'],
  'ragi malt': ['ragi ganji', 'ragi malt'],
  holige: ['holige', 'obbattu', 'puran poli'],
  obbattu: ['obbattu', 'holige', 'puran poli'],
  'puran poli': ['holige', 'obbattu', 'puranpoli'],
  'mysore pak': ['mysore pak', 'mysuru pak'],
  uppittu: ['upma', 'suji upma', 'rava upma'],
  upma: ['upma', 'uppittu', 'suji upma', 'rava upma'],
  avalakki: ['poha', 'kanda poha', 'rice flakes'],
  poha: ['poha', 'kanda poha', 'avalakki', 'flattened rice'],
  'kanda poha': ['kanda poha', 'poha', 'avalakki'],
  majjige: ['buttermilk', 'chaas', 'majjige'],
  chaas: ['buttermilk', 'chaas', 'majjige'],

  // Everyday Indian food translations & regional terms
  'ghee roti': ['ghee roti', 'thuppa roti', 'butter chapati'],
  'thuppa roti': ['ghee roti', 'ghee chapati'],
  'thuppa dosa': ['thuppa dosa', 'ghee dosa', 'ghee roast dosa', 'tuppa dosa'],
  'ghee dosa': ['thuppa dosa', 'ghee roast dosa'],
  'masala dosa': ['masala dosa', 'mysore masala dosa'],
  'plain dosa': ['plain dosa', 'sada dosa'],
  dose: ['dosa'],
  dosai: ['dosa'],
  chawal: ['cooked rice', 'white rice', 'rice'],
  anna: ['cooked rice', 'sona masoori rice', 'white rice'],
  sadam: ['cooked rice', 'white rice'],
  basmati: ['basmati rice', 'cooked basmati rice', 'basmati'],
  'cooked rice': ['cooked rice', 'white rice cooked', 'steamed rice', 'boiled rice', 'basmati rice cooked'],
  'chicken breast': ['chicken breast', 'boiled chicken breast', 'grilled chicken breast'],
  'boiled chicken': ['boiled chicken', 'boiled chicken breast', 'poached chicken'],
  'grilled chicken': ['grilled chicken', 'grilled chicken breast', 'chicken tikka'],
  'chicken curry': ['chicken curry', 'murgh curry', 'homestyle chicken curry'],
  'boiled egg': ['boiled egg', 'whole eggs boiled', 'hard boiled egg'],
  'egg bhurji': ['egg bhurji', 'anda bhurji', 'scrambled egg'],
  'anda bhurji': ['egg bhurji'],
  'fried egg': ['fried egg', 'egg fry', 'sunny side up'],
  'paneer tikka': ['paneer tikka'],
  'paneer bhurji': ['paneer bhurji'],
  'paneer butter masala': ['paneer butter masala', 'paneer makhani'],
  'low fat paneer': ['low fat paneer', 'low-fat paneer', 'high protein paneer'],
  'toor dal': ['toor dal', 'red gram dal', 'arhar dal', 'togari bele'],
  'togari bele': ['toor dal', 'red gram dal'],
  toor: ['toor dal', 'red gram', 'arhar'],
  arhar: ['toor dal', 'red gram'],
  moong: ['moong dal', 'green gram', 'mung'],
  mung: ['moong dal', 'green gram'],
  urad: ['urad dal', 'black gram', 'uddina'],
  chana: ['chana', 'bengal gram', 'chickpea', 'kabuli chana'],
  garbanzo: ['chickpeas', 'kabuli chana', 'chana'],
  besan: ['besan', 'bengal gram flour', 'chickpea flour'],
  palak: ['palak', 'spinach'],
  dahi: ['curd', 'dahi', 'yogurt'],
  curd: ['curd', 'dahi', 'mosaru', 'yogurt'],
  mosaru: ['curd', 'dahi'],
  bhindi: ['bhindi', 'ladies finger', 'okra'],
  baingan: ['brinjal', 'eggplant'],
  aloo: ['potato', 'aloo'],
  alu: ['potato', 'aloo'],
  atta: ['whole wheat', 'wheat flour', 'atta'],
  maida: ['refined wheat flour', 'maida'],
  ragi: ['ragi', 'finger millet', 'nachni'],
  nachni: ['ragi', 'finger millet'],
  bajra: ['bajra', 'pearl millet', 'sajje'],
  jowar: ['jowar', 'sorghum', 'jolada'],
  quail: ['quail', 'quial'],
  skyr: ['skyr', 'icelandic yogurt', 'greek yoghurt'],
};

// Map normalized family root tokens to family IDs for single-concept family expansion
const FAMILY_QUERY_MAP = new Map<string, string>();
for (const fam of FOOD_FAMILIES) {
  FAMILY_QUERY_MAP.set(fam.id.toLowerCase(), fam.id);
  FAMILY_QUERY_MAP.set(fam.slug.toLowerCase(), fam.id);
  for (const al of fam.aliases) {
    const clean = al.toLowerCase().trim();
    if (!clean.includes(' ') && !FAMILY_QUERY_MAP.has(clean)) {
      FAMILY_QUERY_MAP.set(clean, fam.id);
    }
  }
}

const STRICT_MODIFIER_TOKENS = [
  'ghee',
  'thuppa',
  'tuppa',
  'masala',
  'butter',
  'cheese',
  'tikka',
  'bhurji',
  'biryani',
  'pulao',
  'curry',
  'paratha',
  'sandwich',
  'roll',
  'lemon',
  'curd',
  'basmati',
  'brown',
  'fried',
  'boiled',
  'raw',
  'cooked',
  'roasted',
  'grilled',
  'parboiled',
  'steamed',
  'dry',
  'dried',
  'breast',
  'white',
  'whites',
  'low',
  'toor',
  'moong',
  'masoor',
  'chana',
  'urad',
  'neer',
  'set',
  'mysore',
  'maddur',
  'akki',
  'ragi',
  'jolada',
];

const STOP_WORDS = new Set(['of', 'the', 'and', 'with', 'in', 'a', 'an', 'for', 'style', 'dish']);

export const RESULT_GROUP_META: Array<{
  key: FoodResultGroup;
  label: string;
  description: string;
}> = [
  {
    key: 'basic_ingredient',
    label: 'Basic Ingredients',
    description: 'Raw, fresh, or single-ingredient staples (per 100g)',
  },
  {
    key: 'cooked_food',
    label: 'Cooked Foods',
    description: 'Plain boiled, steamed, grilled, or cooked staples',
  },
  {
    key: 'prepared_dish',
    label: 'Prepared Dishes',
    description: 'Indian recipes, regional dishes, curries & meals',
  },
];

export function getCanonicalSourcePriority(food: FoodItem): number {
  if (food.isCustom || food.sourceType === 'personal_custom') return 5;
  const src = (food.sourceName || '').toLowerCase();
  if (
    src.includes('ifct') ||
    src.includes('indb') ||
    src.includes('calothrix verified') ||
    src.includes('calorex validated') ||
    food.id.startsWith('ifct-') ||
    food.id.startsWith('indb-')
  ) {
    return 1;
  }
  if (src.includes('usda') || src.includes('nccdb') || src.includes('uk cofid') || src.includes('us fct')) {
    return food.sourceType === 'branded' ? 3 : 2;
  }
  if (
    food.sourceType === 'branded' ||
    src.includes('manufacturer') ||
    src.includes('restaurant') ||
    src.includes('supplement')
  ) {
    return 3;
  }
  if (src.includes('open food facts') || food.sourceType === 'community') {
    return 4;
  }
  if (typeof food.sourcePriority === 'number' && food.sourcePriority >= 1 && food.sourcePriority <= 5) {
    return food.sourcePriority;
  }
  return food.sourceType === 'verified_reference' ? 2 : 4;
}

export function inferFoodResultGroup(food: FoodItem): FoodResultGroup {
  if (food.resultGroup) return food.resultGroup;
  const n = food.name.toLowerCase();
  const st = (food.foodState || '').toLowerCase();
  if (['raw', 'dry', 'dried', 'fresh', 'ripe', 'tender', 'mature'].includes(st)) {
    return 'basic_ingredient';
  }
  if (
    ['boiled', 'steamed', 'grilled', 'poached'].includes(st) &&
    !/\b(curry|masala|biryani|sambar|dosa|idli|paratha|roti|vada|tikka|bhurji)\b/.test(n)
  ) {
    return 'cooked_food';
  }
  if (/^(white rice|brown rice|basmati rice|sona masoori|boiled|steamed|grilled|cooked\s+\w+\s*)$/i.test(n)) {
    return 'cooked_food';
  }
  return 'prepared_dish';
}

export function groupSearchResultsByType(items: FoodItem[]): GroupedFoodResults {
  const grouped: GroupedFoodResults = {
    basic_ingredient: [],
    cooked_food: [],
    prepared_dish: [],
  };
  for (const item of items) {
    const g = inferFoodResultGroup(item);
    grouped[g].push(item);
  }
  return grouped;
}

export function getNonEmptyResultGroups(items: FoodItem[]): Array<{
  key: FoodResultGroup;
  label: string;
  description: string;
  items: FoodItem[];
}> {
  const grouped = groupSearchResultsByType(items);
  return RESULT_GROUP_META.map((meta) => ({
    ...meta,
    items: grouped[meta.key],
  })).filter((g) => g.items.length > 0);
}

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[,()/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const MAX_DP_LEN = 64;
let dpPrev2 = new Int32Array(MAX_DP_LEN + 1);
let dpPrev1 = new Int32Array(MAX_DP_LEN + 1);
let dpCurr = new Int32Array(MAX_DP_LEN + 1);

function damerauLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  if (Math.abs(m - n) > 2) return 99;
  if (n > MAX_DP_LEN || m > MAX_DP_LEN) return 99;

  for (let j = 0; j <= n; j++) dpPrev1[j] = j;

  for (let i = 1; i <= m; i++) {
    dpCurr[0] = i;
    const ai = a.charCodeAt(i - 1);
    const aiPrev = i > 1 ? a.charCodeAt(i - 2) : 0;
    for (let j = 1; j <= n; j++) {
      const bj = b.charCodeAt(j - 1);
      const cost = ai === bj ? 0 : 1;
      let best = dpPrev1[j] + 1;
      const ins = dpCurr[j - 1] + 1;
      const sub = dpPrev1[j - 1] + cost;
      if (ins < best) best = ins;
      if (sub < best) best = sub;
      if (i > 1 && j > 1 && ai === b.charCodeAt(j - 2) && aiPrev === bj) {
        const trans = dpPrev2[j - 2] + 1;
        if (trans < best) best = trans;
      }
      dpCurr[j] = best;
    }
    const tmp = dpPrev2;
    dpPrev2 = dpPrev1;
    dpPrev1 = dpCurr;
    dpCurr = tmp;
  }
  return dpPrev1[n];
}

function getQueryVariants(normalizedQuery: string): string[] {
  const direct = ALIAS_EXPANSIONS[normalizedQuery];
  const tokens = normalizedQuery.split(' ').filter(Boolean);
  let hasTokenExp = false;
  for (let i = 0; i < tokens.length; i++) {
    if (ALIAS_EXPANSIONS[tokens[i]]) {
      hasTokenExp = true;
      break;
    }
  }
  if (!direct && !hasTokenExp) {
    return [normalizedQuery];
  }

  const variants = new Set<string>([normalizedQuery]);
  if (direct) {
    for (let i = 0; i < direct.length; i++) variants.add(normalizeText(direct[i]));
  }
  if (hasTokenExp) {
    for (const t of tokens) {
      const exp = ALIAS_EXPANSIONS[t];
      if (exp) {
        for (let i = 0; i < exp.length; i++) {
          variants.add(normalizeText(normalizedQuery.replace(t, exp[i])));
        }
      }
    }
  }
  return [...variants];
}

function resolveTargetFamilyId(normalizedQuery: string): string | null {
  const tokens = normalizedQuery.split(' ').filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
  if (tokens.length !== 1) return null;
  const tok = tokens[0];
  if (FAMILY_QUERY_MAP.has(tok)) return FAMILY_QUERY_MAP.get(tok)!;
  const direct = ALIAS_EXPANSIONS[tok];
  if (direct) {
    for (const d of direct) {
      const dClean = normalizeText(d).split(' ')[0];
      if (FAMILY_QUERY_MAP.has(dClean)) return FAMILY_QUERY_MAP.get(dClean)!;
    }
  }
  // Typo fallback for single-token family queries (e.g., panner, chiken, chapatti)
  if (tok.length >= 4) {
    for (const [aliasKey, famId] of FAMILY_QUERY_MAP.entries()) {
      if (Math.abs(aliasKey.length - tok.length) <= 1 && damerauLevenshtein(tok, aliasKey) === 1) {
        return famId;
      }
    }
  }
  return null;
}

interface SearchableCorpus {
  nameNorm: string;
  nameMainNorm: string;
  nameWords: string[];
  aliasesNorm: string[];
  brandNorm: string;
  codeLower: string;
  sourceIdLower: string;
  stateNorm: string;
  familyId: string;
  tokens: string[];
}

const CORPUS_CACHE = new WeakMap<FoodItem, SearchableCorpus>();

function getSearchableCorpus(food: FoodItem): SearchableCorpus {
  const cached = CORPUS_CACHE.get(food);
  if (cached) return cached;

  const nameNorm = normalizeText(food.name);
  const nameMainNorm = normalizeText(food.name.replace(/\([^)]*\)/g, ' '));
  const nameWords = nameNorm.split(' ').filter((w) => w.length >= 2);
  const aliasesNorm = [
    ...(food.aliases || []),
    ...(food.regionalNames || []),
  ]
    .map(normalizeText)
    .filter(Boolean);
  const brandNorm = normalizeText(food.brand || '');
  const codeLower = (food.foodCode || '').toLowerCase();
  const sourceIdLower = (food.sourceId || '').toLowerCase();
  const stateNorm = normalizeText(food.foodState || '');
  const familyId = (food.foodFamilyId || food.canonicalFamily || '').toLowerCase();
  const allText = `${nameNorm} ${aliasesNorm.join(' ')} ${brandNorm} ${stateNorm}`;
  const tokens = [...new Set(allText.split(' ').filter((w) => w.length >= 2))];

  const corpus: SearchableCorpus = {
    nameNorm,
    nameMainNorm,
    nameWords,
    aliasesNorm,
    brandNorm,
    codeLower,
    sourceIdLower,
    stateNorm,
    familyId,
    tokens,
  };
  CORPUS_CACHE.set(food, corpus);
  return corpus;
}

function hasWordBoundaryMatch(text: string, token: string): boolean {
  if (!text.includes(token)) return false;
  const words = text.split(' ');
  return words.some((w) => w === token || w.startsWith(token));
}

export interface ScoredFoodMatch {
  food: FoodItem;
  score: number;
  matchReason: string;
}

export function scoreFoodMatch(food: FoodItem, rawQuery: string): ScoredFoodMatch | null {
  const qNorm = normalizeText(rawQuery);
  if (!qNorm) return { food, score: 1, matchReason: 'all' };

  const corpus = getSearchableCorpus(food);

  // Barcode / exact source code match
  const cleanDigits = rawQuery.replace(/\D/g, '');
  if (cleanDigits.length >= 6 && food.barcode === cleanDigits) {
    return { food, score: 1200, matchReason: 'barcode_exact' };
  }
  if (corpus.codeLower === qNorm || corpus.sourceIdLower === qNorm) {
    return { food, score: 1100, matchReason: 'code_exact' };
  }

  const variants = getQueryVariants(qNorm);
  const queryTokens = qNorm.split(' ').filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
  const isMultiToken = queryTokens.length >= 2;
  const targetFamilyId = resolveTargetFamilyId(qNorm);

  let bestScore = 0;
  let matchReason = '';

  // 1. Direct exact, alias, prefix, and phrase matching across query + expanded variants
  for (const v of variants) {
    const isOrig = v === qNorm;
    if (corpus.nameNorm === v || corpus.nameMainNorm === v) {
      bestScore = Math.max(bestScore, isOrig ? 640 : 540);
      matchReason = isOrig ? 'exact_name' : 'alias_exact';
    } else if (corpus.aliasesNorm.some((a) => a === v)) {
      bestScore = Math.max(bestScore, isOrig ? 560 : 500);
      matchReason = 'alias_regional';
    } else if (corpus.nameNorm.startsWith(v + ' ') || corpus.nameMainNorm.startsWith(v + ' ')) {
      bestScore = Math.max(bestScore, isOrig ? 420 : 370);
      matchReason = 'name_prefix';
    } else if (corpus.nameNorm.startsWith(v)) {
      bestScore = Math.max(bestScore, isOrig ? 360 : 320);
      matchReason = 'name_prefix';
    } else if (hasWordBoundaryMatch(corpus.nameNorm, v) || corpus.nameNorm.includes(' ' + v + ' ') || corpus.nameNorm.endsWith(' ' + v)) {
      bestScore = Math.max(bestScore, isOrig ? 310 : 280);
      matchReason = 'name_phrase';
    } else if (corpus.aliasesNorm.some((a) => a.startsWith(v) || a.includes(' ' + v))) {
      bestScore = Math.max(bestScore, isOrig ? 285 : 255);
      matchReason = 'alias_phrase';
    } else if (corpus.brandNorm && (corpus.brandNorm === v || corpus.brandNorm.startsWith(v))) {
      bestScore = Math.max(bestScore, 220);
      matchReason = 'brand_match';
    }
  }

  // 2. Token-level & typo-tolerant matching
  let matchedTokenCount = 0;
  let tokenScore = 0;

  if (queryTokens.length > 0) {
    for (const qt of queryTokens) {
      const qtExp = ALIAS_EXPANSIONS[qt];
      let tokenBest = 0;

      if (hasWordBoundaryMatch(corpus.nameNorm, qt)) {
        tokenBest = 110;
      } else if (corpus.aliasesNorm.some((a) => hasWordBoundaryMatch(a, qt))) {
        tokenBest = 92;
      } else if (corpus.stateNorm === qt || corpus.stateNorm.startsWith(qt)) {
        tokenBest = 70;
      } else if (corpus.brandNorm.includes(qt)) {
        tokenBest = 55;
      }

      if (tokenBest < 90 && qtExp) {
        for (let i = 0; i < qtExp.length; i++) {
          const qtv = normalizeText(qtExp[i]);
          const subTokens = qtv.split(' ').filter(Boolean);
          if (subTokens.every((st) => hasWordBoundaryMatch(corpus.nameNorm, st))) {
            tokenBest = Math.max(tokenBest, 96);
          } else if (subTokens.every((st) => corpus.aliasesNorm.some((a) => hasWordBoundaryMatch(a, st)))) {
            tokenBest = Math.max(tokenBest, 86);
          } else if (subTokens.every((st) => corpus.stateNorm.includes(st))) {
            tokenBest = Math.max(tokenBest, 65);
          }
        }
      }

      // Fast typo tolerance (Damerau-Levenshtein) for unmatched tokens >= 4 chars
      if (tokenBest === 0 && qt.length >= 4) {
        const qtLen = qt.length;
        const maxAllowedDist = qtLen >= 6 ? 2 : 1;
        const qt0 = qt.charCodeAt(0);
        const qt1 = qt.charCodeAt(1);
        for (let i = 0; i < corpus.tokens.length; i++) {
          const ft = corpus.tokens[i];
          if (
            Math.abs(ft.length - qtLen) <= maxAllowedDist &&
            !(qt === 'butter' && ft === 'batter') &&
            !(qt === 'rice' && ft === 'rich')
          ) {
            if (ft.charCodeAt(0) !== qt0 && ft.charCodeAt(0) !== qt1 && ft.charCodeAt(1) !== qt0) {
              continue;
            }
            const dist = damerauLevenshtein(qt, ft);
            if (dist <= maxAllowedDist) {
              tokenBest = dist === 1 ? 62 : 38;
              if (!matchReason) matchReason = 'fuzzy_typo';
              break;
            }
          }
        }
      }

      if (tokenBest > 0) {
        matchedTokenCount++;
        tokenScore += tokenBest;
      }
    }

    if (matchedTokenCount === queryTokens.length) {
      bestScore = Math.max(bestScore, 220 + tokenScore);
      if (!matchReason) matchReason = 'all_tokens';
    } else if (isMultiToken) {
      // Strict multi-token relevance guard:
      // Searching "Paneer Tikka" or "Cooked Rice" or "Chicken Breast" should NOT flood with items missing the qualifying token!
      if (bestScore < 250) {
        return null;
      }
    }
  }

  // 3. Controlled Food-Family expansion ONLY for single-concept family queries (e.g., "Paneer", "Rice", "Chicken", "Egg", "Dal")
  if (targetFamilyId && !isMultiToken && corpus.familyId === targetFamilyId) {
    if (bestScore === 0) {
      bestScore = 135;
      matchReason = 'family_member';
    } else {
      bestScore += 45;
    }
    // Boost canonical parent foods within the family
    if (!food.parentFoodId) {
      bestScore += 28;
    }
  }

  if (bestScore <= 0) return null;

  // 4. Modifier & Specificity Preservation
  for (const mod of STRICT_MODIFIER_TOKENS) {
    const queryHasMod = queryTokens.includes(mod) || qNorm.includes(' ' + mod) || qNorm.startsWith(mod + ' ');
    const foodHasMod =
      hasWordBoundaryMatch(corpus.nameNorm, mod) ||
      corpus.aliasesNorm.some((a) => hasWordBoundaryMatch(a, mod)) ||
      corpus.stateNorm === mod;

    if (queryHasMod && foodHasMod) {
      bestScore += 65;
    } else if (queryHasMod && !foodHasMod) {
      // Strongly demote items lacking an explicitly requested dish modifier (e.g. "tikka", "breast", "lemon", "curd", "basmati")
      bestScore -= 140;
    } else if (!queryHasMod && foodHasMod && ['ghee', 'masala', 'fried', 'thuppa', 'butter', 'sandwich', 'roll', 'soup'].includes(mod)) {
      // Gently prefer simpler base foods ahead of heavily modified dishes when user queried the root food
      bestScore -= 18;
    }
  }

  // 5. Raw vs Cooked Collision Guard
  const queryAsksRaw = /\b(raw|dry|uncooked|flour|atta|grain|powder|seed)\b/i.test(qNorm);
  const queryAsksCooked = /\b(cooked|boiled|steamed|grilled|roasted|fried|prepared|curry|tikka|biryani|masala|bhurji|dosa|roti|rotti|chapati|idli|sambar|mudde|upma|poha|chitranna|puliyogare)\b/i.test(
    qNorm
  );
  const foodIsRaw = corpus.stateNorm === 'raw' || corpus.stateNorm === 'dry' || corpus.stateNorm === 'dried';
  const foodIsCooked = ['cooked', 'boiled', 'steamed', 'grilled', 'roasted', 'fried', 'prepared', 'fermented'].includes(
    corpus.stateNorm
  );

  if (queryAsksRaw) {
    if (foodIsRaw) bestScore += 110;
    else if (foodIsCooked) bestScore -= 110;
  } else if (queryAsksCooked) {
    if (foodIsCooked) bestScore += 115;
    else if (foodIsRaw) bestScore -= 160;
  } else {
    // Ambiguous everyday query (e.g., "Rice", "Chicken", "Egg", "Dal"):
    // Prefer ready-to-eat / cooked / fresh items over raw agricultural commodities while still showing raw in Basic Ingredients!
    if (foodIsCooked || corpus.stateNorm === 'fresh') bestScore += 50;
    else if (foodIsRaw) bestScore -= 30;
  }

  // 6. Conciseness & Exact Core Item Boost (ignore descriptive parentheticals like "(Tandoori Grilled Cottage Cheese)")
  const coreTitleWords = normalizeText(food.name.split('(')[0]).split(' ').filter(Boolean);
  const extraWords = Math.max(0, coreTitleWords.length - queryTokens.length);
  bestScore -= Math.min(36, extraWords * 4);

  // 7. Source Priority & Indian-First Tie-Breaker
  const priority = getCanonicalSourcePriority(food);
  bestScore += Math.max(0, 6 - priority) * 6;
  if (food.country === 'India') bestScore += 8;
  if (food.qualityStatus === 'verified') bestScore += 6;
  else if (food.qualityStatus === 'calculated') bestScore += 4;
  if (food.isDiscontinued) bestScore -= 400;

  // Strict final relevance floor so unrelated results never pad the list
  const minThreshold = isMultiToken ? 160 : 100;
  if (bestScore < minThreshold) return null;

  return { food, score: bestScore, matchReason };
}

// Fast in-memory LRU cache for repeated queries (<1ms)
const SEARCH_CACHE = new Map<string, FoodItem[]>();
const MAX_CACHE_ENTRIES = 120;

export function clearFoodSearchCache(): void {
  SEARCH_CACHE.clear();
}

export function searchFoodsIntelligent(
  foods: FoodItem[],
  query: string,
  options?: {
    category?: string;
    favoriteIds?: string[];
    recentIds?: string[];
    limit?: number;
    offset?: number;
    group?: FoodResultGroup | 'all';
    familyId?: string;
    includeDiscontinued?: boolean;
    includePendingValidation?: boolean;
  }
): FoodItem[] {
  const category = options?.category || 'All';
  const includeDiscontinued = Boolean(options?.includeDiscontinued);
  const includePending = Boolean(options?.includePendingValidation);
  const groupFilter = options?.group && options.group !== 'all' ? options.group : null;
  const familyFilter = options?.familyId || null;
  const favoriteSet = options?.favoriteIds?.length ? new Set(options.favoriteIds) : null;
  const recentSet = options?.recentIds?.length ? new Set(options.recentIds) : null;

  const q = query.trim();
  const canUseCache =
    !favoriteSet && !recentSet && !includeDiscontinued && !includePending && !options?.offset;
  const cacheKey = canUseCache
    ? `${foods.length}|${category}|${groupFilter || ''}|${familyFilter || ''}|${q.toLowerCase()}`
    : '';

  if (canUseCache && SEARCH_CACHE.has(cacheKey)) {
    const cached = SEARCH_CACHE.get(cacheKey)!;
    return options?.limit ? cached.slice(0, options.limit) : cached;
  }

  const eligible = foods.filter((food) => {
    if (!includeDiscontinued && food.isDiscontinued) return false;
    if (!includePending && !isFoodNutritionallyUsable(food)) return false;
    if (groupFilter && inferFoodResultGroup(food) !== groupFilter) return false;
    if (familyFilter && (food.foodFamilyId || food.canonicalFamily) !== familyFilter) return false;

    if (category === 'All') return true;
    if (category === 'Favorites') return favoriteSet ? favoriteSet.has(food.id) : false;
    if (category === 'Recent') return recentSet ? recentSet.has(food.id) : false;
    if (category === 'My Custom Foods' || category === 'Custom') return food.isCustom;
    return food.category === category;
  });

  if (!q) {
    const start = options?.offset || 0;
    return options?.limit ? eligible.slice(start, start + options.limit) : eligible.slice(start);
  }

  const scored: ScoredFoodMatch[] = [];
  for (let i = 0; i < eligible.length; i++) {
    const res = scoreFoodMatch(eligible[i], q);
    if (res) {
      scored.push(res);
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const pa = getCanonicalSourcePriority(a.food);
    const pb = getCanonicalSourcePriority(b.food);
    if (pa !== pb) return pa - pb;
    return a.food.name.length - b.food.name.length;
  });

  const allMatches = scored.map((s) => s.food);

  if (canUseCache) {
    if (SEARCH_CACHE.size >= MAX_CACHE_ENTRIES) {
      const firstKey = SEARCH_CACHE.keys().next().value;
      if (firstKey) SEARCH_CACHE.delete(firstKey);
    }
    SEARCH_CACHE.set(cacheKey, allMatches);
  }

  const start = options?.offset || 0;
  return options?.limit ? allMatches.slice(start, start + options.limit) : allMatches.slice(start);
}

export function searchFoodsPaginated(
  foods: FoodItem[],
  query: string,
  options?: {
    category?: string;
    favoriteIds?: string[];
    recentIds?: string[];
    page?: number;
    pageSize?: number;
    group?: FoodResultGroup | 'all';
    familyId?: string;
  }
): {
  items: FoodItem[];
  grouped: GroupedFoodResults;
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  elapsedMs: number;
} {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const page = Math.max(1, options?.page || 1);
  const pageSize = Math.min(100, Math.max(1, options?.pageSize || 30));
  const allMatches = searchFoodsIntelligent(foods, query, {
    category: options?.category,
    favoriteIds: options?.favoriteIds,
    recentIds: options?.recentIds,
    group: options?.group,
    familyId: options?.familyId,
  });

  const offset = (page - 1) * pageSize;
  const pageItems = allMatches.slice(offset, offset + pageSize);
  const grouped = groupSearchResultsByType(pageItems);
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();

  return {
    items: pageItems,
    grouped,
    totalCount: allMatches.length,
    page,
    pageSize,
    hasMore: offset + pageSize < allMatches.length,
    elapsedMs: Math.round((t1 - t0) * 100) / 100,
  };
}
