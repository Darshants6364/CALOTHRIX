import type { FoodItem } from '../types/index.ts';

/**
 * Regional, Indian & Spelling-Variant Alias Map
 * Maps common queries/regional names/spelling variants -> canonical search terms and dish signatures.
 * Strictly respects dish variants: plain dosa !== masala dosa !== thuppa dosa; plain roti !== ghee roti.
 */
const ALIAS_EXPANSIONS: Record<string, string[]> = {
  'akki rotti': ['akki roti', 'rice roti', 'rice flatbread', 'akki rotti'],
  'akki roti': ['akki rotti', 'rice roti'],
  'rice roti': ['akki rotti', 'akki roti'],
  'ragi mudde': ['ragi ball', 'finger millet ball', 'ragi sankati', 'ragi mudde'],
  'ragi ball': ['ragi mudde', 'finger millet ball', 'ragi sankati'],
  chapati: ['roti', 'phulka', 'whole wheat roti', 'chapatti'],
  chapatti: ['roti', 'chapati', 'phulka'],
  roti: ['chapati', 'phulka', 'whole wheat roti'],
  phulka: ['roti', 'chapati', 'whole wheat roti'],
  'ghee roti': ['thuppa roti', 'butter chapati', 'ghee chapati', 'ghee roti'],
  'thuppa roti': ['ghee roti', 'ghee chapati'],
  'thuppa dosa': ['ghee dosa', 'ghee roast dosa', 'tuppa dosa', 'thuppa dosa'],
  'ghee dosa': ['thuppa dosa', 'ghee roast dosa', 'tuppa dosa'],
  'masala dosa': ['masala dosa', 'potato palya dosa', 'mysore masala dosa'],
  'plain dosa': ['plain dosa', 'sada dosa'],
  idli: ['idly', 'steamed rice cake', 'idli'],
  idly: ['idli'],
  sambar: ['sambhar', 'toor dal tamarind', 'sambar'],
  sambhar: ['sambar'],
  rasam: ['saaru', 'charu', 'tomato pepper rasam', 'rasam'],
  saaru: ['rasam'],
  'curd rice': ['thayir sadam', 'dahi chawal', 'mosaranna', 'perugu annam', 'curd rice'],
  'thayir sadam': ['curd rice', 'mosaranna'],
  'dahi chawal': ['curd rice', 'mosaranna'],
  mosaranna: ['curd rice', 'thayir sadam', 'dahi chawal'],
  'perugu annam': ['curd rice', 'mosaranna'],
  chawal: ['white rice cooked', 'steamed rice', 'cooked rice', 'rice'],
  'lemon rice': ['chitranna', 'elumichai sadam', 'nimmakaya pulihora', 'lemon rice'],
  chitranna: ['lemon rice'],
  'bisibele bath': ['bisi bele bath', 'bisibelebath', 'bisi bele bhath', 'sambar rice'],
  'bisi bele bath': ['bisibele bath'],
  'chicken curry': ['kodi kura', 'murgh curry', 'homestyle chicken curry', 'chicken curry'],
  'grilled chicken': ['chicken tikka', 'grilled chicken breast', 'roasted chicken'],
  'chicken tikka': ['grilled chicken', 'tandoori chicken'],
  'egg bhurji': ['anda bhurji', 'scrambled egg masala', 'egg bhurji'],
  'anda bhurji': ['egg bhurji'],
  'paneer bhurji': ['scrambled cottage cheese', 'paneer bhurji'],
  'boiled egg': ['whole eggs boiled', 'hard boiled egg'],
  'fried egg': ['egg fry', 'sunny side up', 'omelette', 'omlet'],
  omelette: ['omlet', 'fried egg'],
  omlet: ['omelette'],
  quail: ['quial'],
  toor: ['red gram', 'arhar', 'tur dal', 'toor dal'],
  arhar: ['red gram', 'toor dal'],
  moong: ['green gram', 'mung'],
  mung: ['green gram', 'moong'],
  urad: ['black gram', 'uddina'],
  chana: ['bengal gram', 'chickpea', 'kabuli', 'garbanzo'],
  garbanzo: ['chickpeas', 'kabuli chana', 'chana', 'bengal gram'],
  'garbanzo beans': ['garbanzo', 'chickpeas cooked', 'boiled chickpeas'],
  skyr: ['icelandic skyr', 'icelandic yogurt', 'greek yoghurt', 'high protein yogurt'],
  'icelandic skyr': ['skyr', 'icelandic yogurt'],
  besan: ['bengal gram flour', 'chickpea flour'],
  palak: ['spinach'],
  dahi: ['curd', 'yogurt', 'yoghurt'],
  curd: ['dahi', 'yogurt', 'yoghurt'],
  paneer: ['cottage cheese'],
  bhindi: ['ladies finger', 'okra'],
  baingan: ['brinjal', 'eggplant'],
  alu: ['potato', 'aloo'],
  aloo: ['potato'],
  atta: ['whole wheat', 'wheat flour'],
  maida: ['refined wheat flour'],
  poha: ['kanda poha', 'rice flakes', 'flattened rice', 'avalakki'],
  'kanda poha': ['poha', 'avalakki', 'flattened rice cooked'],
  avalakki: ['poha', 'kanda poha', 'rice flakes'],
  upma: ['uppittu', 'rava upma', 'suji upma'],
  uppittu: ['upma'],
  khichdi: ['khichuri', 'pongal'],
  ragi: ['finger millet', 'nachni'],
  nachni: ['ragi', 'finger millet'],
  bajra: ['pearl millet', 'kambu', 'sajje'],
  jowar: ['sorghum', 'jola'],
};

// Variants where modifiers MUST NOT collapse into plain counterparts
const STRICT_MODIFIER_TOKENS = [
  'ghee',
  'thuppa',
  'tuppa',
  'masala',
  'butter',
  'cheese',
  'paneer',
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
  'egg',
  'chicken',
  'mutton',
  'fish',
];

/**
 * Canonical 5-tier source priority:
 * 1: IFCT 2017 / Verified Cooked Reference
 * 2: USDA FDC / NCCDB Clinical Reference
 * 3: Verified Manufacturer / Branded Labels
 * 4: Community Open Food Facts (ODbL)
 * 5: Personal Custom Foods
 */
export function getCanonicalSourcePriority(food: FoodItem): number {
  if (food.isCustom || food.sourceType === 'personal_custom') return 5;
  const src = (food.sourceName || '').toLowerCase();
  if (
    src.includes('ifct') ||
    src.includes('calothrix verified') ||
    food.id.startsWith('ifct-')
  ) {
    return 1;
  }
  if (src.includes('usda') || src.includes('nccdb')) {
    return food.sourceType === 'branded' ? 3 : 2;
  }
  if (food.sourceType === 'branded' || src.includes('manufacturer') || src.includes('restaurant') || src.includes('supplement')) {
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

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[,()/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Reusable flat DP rows to avoid allocating nested arrays on every keystroke
const MAX_DP_LEN = 64;
let dpPrev2 = new Int32Array(MAX_DP_LEN + 1);
let dpPrev1 = new Int32Array(MAX_DP_LEN + 1);
let dpCurr = new Int32Array(MAX_DP_LEN + 1);

function damerauLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  if (Math.abs(m - n) > 3) return 99;
  if (n > MAX_DP_LEN || m > MAX_DP_LEN) {
    // Rare very long token fallback
    const p2 = new Int32Array(n + 1);
    const p1 = new Int32Array(n + 1);
    const cur = new Int32Array(n + 1);
    for (let j = 0; j <= n; j++) p1[j] = j;
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      const ai = a.charCodeAt(i - 1);
      for (let j = 1; j <= n; j++) {
        const bj = b.charCodeAt(j - 1);
        const cost = ai === bj ? 0 : 1;
        let best = Math.min(p1[j] + 1, cur[j - 1] + 1, p1[j - 1] + cost);
        if (i > 1 && j > 1 && ai === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === bj) {
          const trans = p2[j - 2] + 1;
          if (trans < best) best = trans;
        }
        cur[j] = best;
      }
      p2.set(p1);
      p1.set(cur);
    }
    return p1[n];
  }

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
    for (let i = 0; i < direct.length; i++) variants.add(direct[i]);
  }
  if (hasTokenExp) {
    for (const t of tokens) {
      const exp = ALIAS_EXPANSIONS[t];
      if (exp) {
        for (let i = 0; i < exp.length; i++) {
          variants.add(normalizedQuery.replace(t, exp[i]));
        }
      }
    }
  }
  return [...variants];
}

interface SearchableCorpus {
  nameNorm: string;
  aliasesNorm: string[];
  ingredientsNorm: string;
  brandNorm: string;
  codeLower: string;
  sourceIdLower: string;
  stateNorm: string;
  tokens: string[];
}

const CORPUS_CACHE = new WeakMap<FoodItem, SearchableCorpus>();

function getSearchableCorpus(food: FoodItem): SearchableCorpus {
  const cached = CORPUS_CACHE.get(food);
  if (cached) return cached;

  const nameNorm = normalizeText(food.name);
  const aliasesNorm = [
    ...(food.aliases || []),
    ...(food.regionalNames || []),
  ].map(normalizeText);
  const ingredientsNorm = normalizeText(food.ingredientsText || '');
  const brandNorm = normalizeText(food.brand || '');
  const codeLower = (food.foodCode || '').toLowerCase();
  const sourceIdLower = (food.sourceId || '').toLowerCase();
  const stateNorm = normalizeText(food.foodState || '');
  const allText = `${nameNorm} ${aliasesNorm.join(' ')} ${brandNorm} ${ingredientsNorm} ${stateNorm}`;
  const tokens = [...new Set(allText.split(' ').filter((w) => w.length >= 2))];

  const corpus: SearchableCorpus = {
    nameNorm,
    aliasesNorm,
    ingredientsNorm,
    brandNorm,
    codeLower,
    sourceIdLower,
    stateNorm,
    tokens,
  };
  CORPUS_CACHE.set(food, corpus);
  return corpus;
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
    return { food, score: 1000, matchReason: 'barcode_exact' };
  }
  if (corpus.codeLower === qNorm || corpus.sourceIdLower === qNorm) {
    return { food, score: 950, matchReason: 'code_exact' };
  }

  let bestScore = 0;
  let matchReason = '';

  const variants = getQueryVariants(qNorm);

  for (const v of variants) {
    // 1. Exact food name match
    if (corpus.nameNorm === v) {
      bestScore = Math.max(bestScore, v === qNorm ? 500 : 420);
      matchReason = v === qNorm ? 'exact_name' : 'alias_exact';
    }
    // 2. Exact alias / regional name match
    else if (corpus.aliasesNorm.some((a) => a === v)) {
      bestScore = Math.max(bestScore, 440);
      matchReason = 'alias_regional';
    }
    // 3. Name starts with query or contains full phrase
    else if (corpus.nameNorm.startsWith(v)) {
      bestScore = Math.max(bestScore, 340);
      matchReason = 'name_prefix';
    } else if (corpus.nameNorm.includes(v)) {
      bestScore = Math.max(bestScore, 280);
      matchReason = 'name_phrase';
    } else if (corpus.aliasesNorm.some((a) => a.includes(v))) {
      bestScore = Math.max(bestScore, 260);
      matchReason = 'alias_phrase';
    } else if (corpus.brandNorm.includes(v)) {
      bestScore = Math.max(bestScore, 210);
      matchReason = 'brand_match';
    }
  }

  // 4. Token-level & typo-tolerant matching
  const queryTokens = qNorm.split(' ').filter((w) => w.length >= 2);
  if (queryTokens.length > 0) {
    let matchedTokenCount = 0;
    let tokenScore = 0;

    for (const qt of queryTokens) {
      const qtExp = ALIAS_EXPANSIONS[qt];
      let tokenBest = 0;

      // First check exact token & alias token substrings (zero DP cost)
      if (corpus.nameNorm.includes(qt)) {
        tokenBest = 95;
      } else if (corpus.aliasesNorm.some((a) => a.includes(qt))) {
        tokenBest = 74;
      } else if (corpus.ingredientsNorm.includes(qt)) {
        tokenBest = 38;
      } else if (corpus.stateNorm.includes(qt)) {
        tokenBest = 45;
      }

      if (tokenBest < 74 && qtExp) {
        for (let i = 0; i < qtExp.length; i++) {
          const qtv = normalizeText(qtExp[i]);
          const subTokens = qtv.split(' ').filter(Boolean);
          if (subTokens.every((st) => corpus.nameNorm.includes(st))) {
            tokenBest = Math.max(tokenBest, 68);
          } else if (subTokens.every((st) => corpus.aliasesNorm.some((a) => a.includes(st)))) {
            tokenBest = Math.max(tokenBest, 74);
          } else if (subTokens.every((st) => corpus.ingredientsNorm.includes(st))) {
            tokenBest = Math.max(tokenBest, 38);
          } else if (subTokens.every((st) => corpus.stateNorm.includes(st))) {
            tokenBest = Math.max(tokenBest, 45);
          }
        }
      }

      // Only run Damerau-Levenshtein typo tolerance once per unmatched token >= 4 chars
      if (tokenBest === 0 && qt.length >= 4) {
        const qtLen = qt.length;
        const maxAllowedDist = qtLen >= 6 ? 2 : 1;
        const qt0 = qt.charCodeAt(0);
        const qt1 = qt.charCodeAt(1);
        for (let i = 0; i < corpus.tokens.length; i++) {
          const ft = corpus.tokens[i];
          if (Math.abs(ft.length - qtLen) <= maxAllowedDist && !(qt === 'butter' && ft === 'batter')) {
            // Fast 2-char prefix/overlap pre-filter for edit distance <= 2
            if (ft.charCodeAt(0) !== qt0 && ft.charCodeAt(0) !== qt1 && ft.charCodeAt(1) !== qt0) {
              continue;
            }
            const dist = damerauLevenshtein(qt, ft);
            if (dist <= maxAllowedDist) {
              tokenBest = dist === 1 ? 30 : 20;
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
      bestScore = Math.max(bestScore, 160 + tokenScore);
      if (!matchReason) matchReason = 'all_tokens';
    } else if (queryTokens.length > 1 && matchedTokenCount >= Math.ceil(queryTokens.length * 0.6)) {
      bestScore = Math.max(bestScore, 75 + tokenScore);
      if (!matchReason) matchReason = 'partial_tokens';
    }
  }

  if (bestScore <= 0) return null;

  // 5. Modifier preservation: never confuse Plain Dosa with Masala Dosa / Ghee Dosa, Raw Rice with Cooked Rice, Boiled Egg with Fried Egg
  for (const mod of STRICT_MODIFIER_TOKENS) {
    const queryHasMod = qNorm.includes(mod);
    const foodHasMod = corpus.nameNorm.includes(mod) || corpus.stateNorm.includes(mod);
    if (queryHasMod && foodHasMod) {
      bestScore += 55;
    } else if (queryHasMod && !foodHasMod) {
      bestScore -= 25;
    } else if (!queryHasMod && foodHasMod && ['ghee', 'masala', 'fried', 'thuppa'].includes(mod)) {
      // Gently prefer plain variants when user didn't ask for ghee/masala/fried, while still returning both
      bestScore -= 12;
    }
  }

  // 6. Raw vs cooked collision guard:
  // If user didn't explicitly ask for raw/dry/uncooked/flour, prioritize cooked/prepared foods over raw agricultural ingredients
  const queryAsksRawOrDry = /\b(raw|dry|uncooked|flour|atta|grain|powder|whole|seed)\b/i.test(qNorm);
  const queryAsksPrepared = /\b(cooked|boiled|steamed|grilled|roasted|fried|prepared|curry|tikka|biryani|masala|porridge|oatmeal|bhurji|dosa|roti|idli|sambar)\b/i.test(
    qNorm
  );
  const foodIsRawOrDry = corpus.stateNorm === 'raw' || corpus.stateNorm === 'dry' || corpus.stateNorm === 'dried';
  const foodIsPrepared = [
    'cooked',
    'boiled',
    'steamed',
    'grilled',
    'roasted',
    'fried',
    'prepared',
    'fermented',
  ].includes(corpus.stateNorm);

  if (queryAsksRawOrDry) {
    if (foodIsRawOrDry) bestScore += 80;
    else if (foodIsPrepared) bestScore -= 55;
  } else if (queryAsksPrepared) {
    if (foodIsPrepared) bestScore += 75;
    else if (foodIsRawOrDry) bestScore -= 65;
  } else {
    // Ambiguous everyday queries (e.g. "rice", "chicken", "oats", "dal", "chana"):
    // Rank prepared/cooked staples ahead of raw IFCT agricultural commodities while keeping raw available below
    if (foodIsPrepared) bestScore += 60;
    else if (foodIsRawOrDry) bestScore -= 55;
  }

  // 7. Strict 5-Tier Source Priority Bonus (IFCT/Cooked Ref > USDA/NCCDB > Branded > OFF > Custom)
  const priority = getCanonicalSourcePriority(food);
  bestScore += Math.max(0, 6 - priority) * 5;

  // Penalize needs_review slightly relative to verified when identical match
  if (food.verificationStatus === 'needs_review') bestScore -= 6;
  if (food.isDiscontinued) bestScore -= 250;

  return { food, score: bestScore, matchReason };
}

export function searchFoodsIntelligent(
  foods: FoodItem[],
  query: string,
  options?: {
    category?: string;
    favoriteIds?: string[];
    recentIds?: string[];
    limit?: number;
    includeDiscontinued?: boolean;
  }
): FoodItem[] {
  const category = options?.category || 'All';
  const includeDiscontinued = Boolean(options?.includeDiscontinued);
  const favoriteSet = options?.favoriteIds?.length ? new Set(options.favoriteIds) : null;
  const recentSet = options?.recentIds?.length ? new Set(options.recentIds) : null;

  const categoryFiltered = foods.filter((food) => {
    if (!includeDiscontinued && food.isDiscontinued) return false;
    if (category === 'All') return true;
    if (category === 'Favorites') return favoriteSet ? favoriteSet.has(food.id) : false;
    if (category === 'Recent') return recentSet ? recentSet.has(food.id) : false;
    if (category === 'My Custom Foods' || category === 'Custom') return food.isCustom;
    return food.category === category;
  });

  const q = query.trim();
  if (!q) {
    return options?.limit ? categoryFiltered.slice(0, options.limit) : categoryFiltered;
  }

  const scored: ScoredFoodMatch[] = [];
  for (const food of categoryFiltered) {
    const res = scoreFoodMatch(food, q);
    if (res && res.score > 20) {
      scored.push(res);
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const pa = getCanonicalSourcePriority(a.food);
    const pb = getCanonicalSourcePriority(b.food);
    if (pa !== pb) return pa - pb;
    return a.food.name.localeCompare(b.food.name);
  });

  const results = scored.map((s) => s.food);
  return options?.limit ? results.slice(0, options.limit) : results;
}
