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
  'thayir sadam': ['curd rice'],
  'dahi chawal': ['curd rice'],
  mosaranna: ['curd rice'],
  'lemon rice': ['chitranna', 'elumichai sadam', 'nimmakaya pulihora', 'lemon rice'],
  chitranna: ['lemon rice'],
  'bisibele bath': ['bisi bele bath', 'bisibelebath', 'bisi bele bhath', 'sambar rice'],
  'bisi bele bath': ['bisibele bath'],
  'chicken curry': ['kodi kura', 'murgh curry', 'homestyle chicken curry', 'chicken curry'],
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
  chana: ['bengal gram', 'chickpea', 'kabuli'],
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
  poha: ['rice flakes', 'flattened rice', 'avalakki'],
  avalakki: ['poha', 'rice flakes'],
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
  'parboiled',
  'steamed',
  'dry',
  'dried',
  'egg',
  'chicken',
  'mutton',
  'fish',
];

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[,()/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function damerauLevenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  if (Math.abs(m - n) > 3) return 99;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[m][n];
}

function getQueryVariants(normalizedQuery: string): string[] {
  const variants = new Set<string>([normalizedQuery]);
  if (ALIAS_EXPANSIONS[normalizedQuery]) {
    ALIAS_EXPANSIONS[normalizedQuery].forEach((v) => variants.add(v));
  }
  const tokens = normalizedQuery.split(' ').filter(Boolean);
  for (const t of tokens) {
    const exp = ALIAS_EXPANSIONS[t];
    if (exp) {
      exp.forEach((e) => {
        variants.add(normalizedQuery.replace(t, e));
      });
    }
  }
  return [...variants];
}

function getSearchableCorpus(food: FoodItem): {
  nameNorm: string;
  aliasesNorm: string[];
  ingredientsNorm: string;
  brandNorm: string;
  codeNorm: string;
  stateNorm: string;
  tokens: string[];
} {
  const nameNorm = normalizeText(food.name);
  const aliasesNorm = [
    ...(food.aliases || []),
    ...(food.regionalNames || []),
  ].map(normalizeText);
  const ingredientsNorm = normalizeText(food.ingredientsText || '');
  const brandNorm = normalizeText(food.brand || '');
  const codeNorm = normalizeText(`${food.foodCode || ''} ${food.sourceId || ''} ${food.barcode || ''}`);
  const stateNorm = normalizeText(food.foodState || '');
  const allText = `${nameNorm} ${aliasesNorm.join(' ')} ${brandNorm} ${ingredientsNorm} ${stateNorm}`;
  const tokens = [...new Set(allText.split(' ').filter((w) => w.length >= 2))];
  return {
    nameNorm,
    aliasesNorm,
    ingredientsNorm,
    brandNorm,
    codeNorm,
    stateNorm,
    tokens,
  };
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
  if (
    food.foodCode?.toLowerCase() === qNorm ||
    food.sourceId?.toLowerCase() === qNorm
  ) {
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
      const qtVariants = [qt, ...(ALIAS_EXPANSIONS[qt] || []).map(normalizeText)];
      let tokenBest = 0;

      for (const qtv of qtVariants) {
        const subTokens = qtv.split(' ').filter(Boolean);
        if (subTokens.every((st) => corpus.nameNorm.includes(st))) {
          tokenBest = Math.max(tokenBest, qtv === qt ? 95 : 68);
        } else if (subTokens.every((st) => corpus.aliasesNorm.some((a) => a.includes(st)))) {
          tokenBest = Math.max(tokenBest, 74);
        } else if (subTokens.every((st) => corpus.ingredientsNorm.includes(st))) {
          tokenBest = Math.max(tokenBest, 38);
        } else if (subTokens.every((st) => corpus.stateNorm.includes(st))) {
          tokenBest = Math.max(tokenBest, 45);
        } else if (qt.length >= 4) {
          // Typo tolerance against food tokens (exclude ambiguous modifier false positives like butter<->batter)
          for (const ft of corpus.tokens) {
            if (Math.abs(ft.length - qt.length) <= 2 && !(qt === 'butter' && ft === 'batter')) {
              const dist = damerauLevenshtein(qt, ft);
              if (dist === 1 || (qt.length >= 6 && dist <= 2)) {
                tokenBest = Math.max(tokenBest, dist === 1 ? 30 : 20);
                if (!matchReason) matchReason = 'fuzzy_typo';
                break;
              }
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

  // 6. Strict Source Priority Bonus (IFCT > Verified Cooked > USDA > Branded > OFF > Custom)
  const priority = food.sourcePriority ?? (food.isCustom ? 6 : food.sourceType === 'verified_reference' ? 2 : 5);
  bestScore += Math.max(0, 7 - priority) * 4;

  // Penalize needs_review slightly relative to verified when identical match
  if (food.verificationStatus === 'needs_review') bestScore -= 6;

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
  }
): FoodItem[] {
  const category = options?.category || 'All';
  const favoriteIds = options?.favoriteIds || [];
  const recentIds = options?.recentIds || [];

  const categoryFiltered = foods.filter((food) => {
    if (category === 'All') return true;
    if (category === 'Favorites') return favoriteIds.includes(food.id);
    if (category === 'Recent') return recentIds.includes(food.id);
    if (category === 'My Custom Foods' || category === 'Custom') return food.isCustom;
    return food.category === category;
  });

  const q = query.trim();
  if (!q) {
    return categoryFiltered;
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
    const pa = a.food.sourcePriority ?? 6;
    const pb = b.food.sourcePriority ?? 6;
    if (pa !== pb) return pa - pb;
    return a.food.name.localeCompare(b.food.name);
  });

  const results = scored.map((s) => s.food);
  return options?.limit ? results.slice(0, options.limit) : results;
}
