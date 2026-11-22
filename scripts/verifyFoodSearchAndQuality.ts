import { GLOBAL_REFERENCE_FOODS } from '../src/data/globalReferenceFoods';
import { FOOD_FAMILIES } from '../src/data/foodFamilies';
import {
  clearFoodSearchCache,
  getNonEmptyResultGroups,
  searchFoodsIntelligent,
  searchFoodsPaginated,
} from '../src/utils/foodSearchEngine';
import { formatNutrientValue, isFoodNutritionallyUsable } from '../src/utils/nutritionUtils';
import {
  getFullServerFoodCatalog,
  getPendingValidationFoods,
  searchGlobalFoods,
} from '../server/foodService';
import {
  completePendingFoodWithGemini,
  getGeminiFoodSearchCallCount,
} from '../server/foodAiQualityService';
import type { FoodItem } from '../src/types';

const PRIMARY_QUERIES = [
  'Paneer',
  'Rice',
  'Cooked Rice',
  'Basmati',
  'Lemon Rice',
  'Chicken',
  'Chicken Breast',
  'Egg',
  'Boiled Egg',
  'Dal',
  'Toor Dal',
  'Chapati',
  'Akki Rotti',
  'Ragi Mudde',
  'Dosa',
  'Idli',
  'Curd Rice',
  'Sambar',
  'Biryani',
];

const TYPO_QUERIES = ['Panner', 'Chiken', 'Chapatti', 'Idly'];

const KARNATAKA_QUERIES = [
  'Chitranna',
  'Mosaranna',
  'Obbattu',
  'Puliyogare',
  'Vangi Bath',
  'Bisi Bele Bath',
  'Neer Dosa',
  'Jolada Rotti',
  'Kosambari',
  'Saaru',
  'Huli',
  'Maddur Vada',
  'Avarekalu',
  'Ragi Ganji',
  'Mysore Pak',
];

const failures: string[] = [];
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures.push(`FAIL: ${msg}`);
    console.error(`  [FAIL] ${msg}`);
  } else {
    console.log(`  [PASS] ${msg}`);
  }
}

async function run() {
  const fullCatalog = getFullServerFoodCatalog();
  const pendingFoods = getPendingValidationFoods();
  const searchableCatalog = fullCatalog.filter(isFoodNutritionallyUsable);

  console.log('=== CATALOG SUMMARY ===');
  console.log(`GLOBAL_REFERENCE_FOODS: ${GLOBAL_REFERENCE_FOODS.length}`);
  console.log(`Full Server Catalog (incl. UK/US FCT): ${fullCatalog.length}`);
  console.log(`Searchable Usable Foods: ${searchableCatalog.length}`);
  console.log(`Quarantined Pending Validation: ${pendingFoods.length}`);
  console.log(`Seeded Food Families: ${FOOD_FAMILIES.length}`);

  console.log('\n=== 1. PRIMARY & SPELLING QUERY BENCHMARK (DB-FIRST) ===');
  clearFoodSearchCache();
  const initialGeminiCalls = getGeminiFoodSearchCallCount();
  const latencies: number[] = [];
  let unavailableViolations = 0;

  for (const q of [...PRIMARY_QUERIES, ...TYPO_QUERIES]) {
    const t0 = performance.now();
    const res = await searchGlobalFoods({
      query: q,
      page: 1,
      limit: 20,
      includeExternal: false,
    });
    const elapsed = Math.round((performance.now() - t0) * 100) / 100;
    latencies.push(elapsed);

    const groups = getNonEmptyResultGroups(res.items);
    const groupSummary = groups.map((g) => `${g.label}:${g.items.length}`).join(', ');
    const top3 = res.items.slice(0, 3).map((f) => `${f.name} [${f.foodState || '-'}|${f.calories}kcal]`);
    console.log(`  "${q}" (${elapsed}ms, total=${res.totalCount}, groups=[${groupSummary}]) -> Top 3: ${top3.join(' | ')}`);

    assert(res.items.length > 0, `Query "${q}" returned ${res.items.length} results`);
    assert(elapsed < 200, `Query "${q}" latency ${elapsed}ms < 200ms`);
    assert(!res.sourceMeta.externalFallbackUsed, `Query "${q}" did NOT wait on external APIs`);

    for (const item of res.items) {
      const formatted = [
        formatNutrientValue(item, 'calories'),
        formatNutrientValue(item, 'protein', 'g'),
        formatNutrientValue(item, 'carbs', 'g'),
        formatNutrientValue(item, 'fat', 'g'),
        formatNutrientValue(item, 'fibre', 'g'),
      ].join(' ');
      if (/unavailable|n\/a|unknown|nan/i.test(formatted) || !isFoodNutritionallyUsable(item)) {
        unavailableViolations++;
      }
    }
  }

  console.log('\n=== 2. KARNATAKA & REGIONAL ALIASES ===');
  for (const q of KARNATAKA_QUERIES) {
    const items = searchFoodsIntelligent(fullCatalog, q, { limit: 10 });
    const top1 = items[0] ? `${items[0].name} (${items[0].calories} kcal, ${items[0].qualityStatus})` : 'NONE';
    console.log(`  "${q}" -> ${items.length} matches | #1: ${top1}`);
    assert(items.length > 0, `Regional query "${q}" matched existing catalog entry`);
  }

  console.log('\n=== 3. SPECIFICITY & RANKING RULES ===');
  const paneerRes = searchFoodsIntelligent(fullCatalog, 'Paneer', { limit: 25 });
  assert(
    /paneer/i.test(paneerRes[0]?.name || '') && !/masala|tikka|bhurji|curry/i.test(paneerRes[0]?.name || ''),
    `"Paneer" #1 is base Paneer (got: ${paneerRes[0]?.name})`
  );
  assert(
    paneerRes.some((f) => /tikka/i.test(f.name)) &&
      paneerRes.some((f) => /bhurji/i.test(f.name)) &&
      paneerRes.some((f) => /butter masala/i.test(f.name)),
    `"Paneer" includes family dishes (tikka, bhurji, butter masala)`
  );

  const paneerTikkaRes = searchFoodsIntelligent(fullCatalog, 'Paneer Tikka', { limit: 15 });
  assert(
    /paneer tikka/i.test(paneerTikkaRes[0]?.name || ''),
    `"Paneer Tikka" #1 is Paneer Tikka (got: ${paneerTikkaRes[0]?.name})`
  );
  const nonTikkaInTop5 = paneerTikkaRes.slice(0, 5).filter((f) => !/tikka/i.test(f.name));
  assert(
    nonTikkaInTop5.length === 0,
    `"Paneer Tikka" top results do NOT flood with non-tikka paneer dishes (count=${paneerTikkaRes.length}, non-tikka in top 5=${nonTikkaInTop5.length})`
  );

  const cookedRiceRes = searchFoodsIntelligent(fullCatalog, 'Cooked Rice', { limit: 15 });
  assert(
    cookedRiceRes[0]?.foodState === 'cooked' && /rice/i.test(cookedRiceRes[0]?.name || ''),
    `"Cooked Rice" #1 is cooked rice, not raw (got: ${cookedRiceRes[0]?.name} [${cookedRiceRes[0]?.foodState}])`
  );
  assert(
    cookedRiceRes.slice(0, 3).every((f) => f.foodState !== 'raw'),
    `"Cooked Rice" top 3 contain no raw rice (got: ${cookedRiceRes.slice(0, 3).map((f) => `${f.name}[${f.foodState}]`).join(', ')})`
  );

  const chickenBreastRes = searchFoodsIntelligent(fullCatalog, 'Chicken Breast', { limit: 15 });
  assert(
    /chicken breast/i.test(chickenBreastRes[0]?.name || ''),
    `"Chicken Breast" #1 is Chicken Breast (got: ${chickenBreastRes[0]?.name})`
  );

  const boiledEggRes = searchFoodsIntelligent(fullCatalog, 'Boiled Egg', { limit: 15 });
  assert(
    /boiled egg|egg.*boiled/i.test(boiledEggRes[0]?.name || ''),
    `"Boiled Egg" #1 is Boiled Egg (got: ${boiledEggRes[0]?.name})`
  );

  const chickenMushroom = fullCatalog.find((f) => f.id === 'ifct-J002' || /chicken mushroom/i.test(f.name));
  assert(
    Boolean(chickenMushroom) && chickenMushroom?.foodFamilyId === 'vegetables',
    `Chicken mushroom is in "vegetables" family, NOT "chicken" (got: ${chickenMushroom?.foodFamilyId})`
  );
  const oysterMushroom = fullCatalog.find((f) => /oyster mushroom/i.test(f.name));
  if (oysterMushroom) {
    assert(
      oysterMushroom.foodFamilyId === 'vegetables',
      `Oyster mushroom is in "vegetables" family, NOT "fish_seafood" (got: ${oysterMushroom.foodFamilyId})`
    );
  }

  console.log('\n=== 4. ACCEPTANCE CRITERIA G.1 - G.10 ===');
  // G.1: Zero Unavailable/N/A/Unknown/NaN in search results
  assert(unavailableViolations === 0, `G.1 Zero Unavailable/N/A/Unknown/NaN macros across all search results (violations=${unavailableViolations})`);

  // G.2: Missing values are NOT coerced to 0 (preserved as null in rawNutrients & quarantined)
  const missingSourceRecords = pendingFoods.filter((f) => (f.missingFields?.length || 0) > 0);
  const allMissingPreservedAsNull =
    missingSourceRecords.length >= 40 &&
    missingSourceRecords.every(
      (f) =>
        f.qualityStatus === 'pending_validation' &&
        f.isSearchable === false &&
        f.missingFields!.every((k) => f.rawNutrients?.[k] === null)
    ) &&
    pendingFoods.every((f) => f.qualityStatus === 'pending_validation' && f.isSearchable === false);
  assert(
    allMissingPreservedAsNull,
    `G.2 Missing source values preserved as NULL (not coerced to 0) and quarantined as pending_validation (${pendingFoods.length} total pending, ${missingSourceRecords.length} with explicit NULL source macros)`
  );

  // G.3: Genuine zero values display as 0g
  const basePaneer = fullCatalog.find((f) => f.id === 'food-paneer');
  const baseChickenBreast = fullCatalog.find((f) => f.id === 'food-chicken-breast');
  const baseBoiledEgg = fullCatalog.find((f) => f.id === 'food-eggs');
  assert(
    Boolean(basePaneer) &&
      formatNutrientValue(basePaneer!, 'fibre', 'g') === '0g' &&
      Boolean(baseChickenBreast) &&
      formatNutrientValue(baseChickenBreast!, 'carbs', 'g') === '0g' &&
      formatNutrientValue(baseChickenBreast!, 'fibre', 'g') === '0g' &&
      Boolean(baseBoiledEgg) &&
      formatNutrientValue(baseBoiledEgg!, 'fibre', 'g') === '0g',
    `G.3 Genuine zero values display cleanly as 0g (Paneer fibre=${basePaneer?.fibre}g, Chicken carbs=${baseChickenBreast?.carbs}g/fibre=${baseChickenBreast?.fibre}g, Boiled Egg fibre=${baseBoiledEgg?.fibre}g)`
  );

  // G.4: Quarantined pending foods never appear in normal search
  const samplePending = pendingFoods[0];
  const pendingSearchHits = samplePending
    ? searchFoodsIntelligent(fullCatalog, samplePending.name, { limit: 50 }).filter(
        (f) => f.id === samplePending.id
      )
    : [];
  assert(
    pendingSearchHits.length === 0,
    `G.4 Quarantined pending_validation food "${samplePending?.name}" excluded from normal search`
  );

  // G.5: Placeholder food rejected by controlled AI completion workflow
  const placeholderFood: FoodItem = {
    id: 'test-placeholder',
    name: 'unknown',
    category: 'Custom',
    servingName: '100 g',
    servingWeightGrams: 100,
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fibre: 0,
    isCustom: false,
    qualityStatus: 'pending_validation',
    missingFields: ['calories', 'protein'],
  };
  const g5 = await completePendingFoodWithGemini(placeholderFood, fullCatalog);
  assert(
    g5.status === 'kept_pending_insufficient_data' && g5.updatedFood == null,
    `G.5 Generic placeholder food rejected cleanly without fabricating macros (status=${g5.status})`
  );

  // G.6: Verified food is NEVER overwritten by AI completion workflow
  const g6 = await completePendingFoodWithGemini(basePaneer!, fullCatalog);
  assert(
    g6.status === 'skipped_already_verified',
    `G.6 Verified food "${basePaneer?.name}" protected from AI overwrite (status=${g6.status})`
  );

  // G.7: Food family parent-child relationships exist
  const requiredFamilies = [
    'paneer',
    'rice',
    'chicken',
    'egg',
    'dal',
    'wheat_roti',
    'ragi',
    'dosa',
    'idli',
    'sambar_rasam',
  ];
  const familyCounts = requiredFamilies.map((fid) => ({
    fid,
    count: searchableCatalog.filter((f) => f.foodFamilyId === fid).length,
    children: searchableCatalog.filter((f) => f.foodFamilyId === fid && f.parentFoodId).length,
  }));
  assert(
    familyCounts.every((fc) => fc.count >= 2),
    `G.7 All 10 core food families populated (${familyCounts.map((c) => `${c.fid}:${c.count}(${c.children}ch)`).join(', ')})`
  );

  // G.8: Regional aliases resolve cleanly without duplicate IDs
  const chitranna = searchFoodsIntelligent(fullCatalog, 'Chitranna', { limit: 10 });
  const mosaranna = searchFoodsIntelligent(fullCatalog, 'Mosaranna', { limit: 10 });
  const chapatti = searchFoodsIntelligent(fullCatalog, 'Chapatti', { limit: 10 });
  const idly = searchFoodsIntelligent(fullCatalog, 'Idly', { limit: 10 });
  assert(
    /lemon rice/i.test(chitranna[0]?.name || '') &&
      /curd rice/i.test(mosaranna[0]?.name || '') &&
      /chapati|roti/i.test(chapatti[0]?.name || '') &&
      /idli/i.test(idly[0]?.name || ''),
    `G.8 Regional & typo aliases resolve accurately (Chitranna->${chitranna[0]?.name}, Mosaranna->${mosaranna[0]?.name}, Chapatti->${chapatti[0]?.name}, Idly->${idly[0]?.name})`
  );

  // G.9: Legacy/historical IDs preserved intact
  const legacyIds = ['food-rice-cooked', 'food-paneer', 'pop-ind-paneer-tikka', 'ifct-L003', 'food-chicken-breast'];
  const allLegacyExist = legacyIds.every((id) => GLOBAL_REFERENCE_FOODS.some((f) => f.id === id));
  const legacyDupHidden = GLOBAL_REFERENCE_FOODS.find((f) => f.id === 'ifct-L003')?.isSearchable === false;
  assert(
    allLegacyExist && legacyDupHidden,
    `G.9 All historical food IDs preserved intact while duplicate canonical redirect (ifct-L003 -> food-paneer) is hidden from search`
  );

  // G.10: Zero Gemini calls during normal searches + pagination test
  const finalGeminiCalls = getGeminiFoodSearchCallCount();
  assert(
    finalGeminiCalls === initialGeminiCalls,
    `G.10 Zero Gemini calls triggered during 23 normal searches (calls=${finalGeminiCalls - initialGeminiCalls})`
  );

  const page1 = searchFoodsPaginated(fullCatalog, 'Rice', { page: 1, pageSize: 10 });
  const page2 = searchFoodsPaginated(fullCatalog, 'Rice', { page: 2, pageSize: 10 });
  const p1Ids = new Set(page1.items.map((f) => f.id));
  const overlap = page2.items.filter((f) => p1Ids.has(f.id)).length;
  assert(
    page1.items.length === 10 && page2.items.length > 0 && overlap === 0 && page1.hasMore,
    `Pagination works cleanly for "Rice" (total=${page1.totalCount}, page1=10, page2=${page2.items.length}, overlap=${overlap})`
  );

  const avgMs = Math.round((latencies.reduce((a, b) => a + b, 0) / latencies.length) * 100) / 100;
  const maxMs = Math.max(...latencies);
  console.log(`\n=== PERFORMANCE SUMMARY ===`);
  console.log(`Queries tested: ${latencies.length} | Avg latency: ${avgMs}ms | Max latency: ${maxMs}ms (Target: <200ms)`);

  if (failures.length > 0) {
    console.error(`\nTOTAL FAILURES: ${failures.length}`);
    for (const f of failures) console.error(f);
    process.exit(1);
  } else {
    console.log('\nALL VERIFICATION CHECKS PASSED (0 FAILURES)!');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
