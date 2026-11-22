import type {
  DatabaseQualitySummary,
  FoodItem,
  FoodValidationIssue,
  NutrientFieldKey,
  VerificationStatus,
} from '../types/index.ts';

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function getNutrientsPer100g(food: FoodItem): {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fibre: number | null;
  water: number | null;
  ash: number | null;
} {
  const baseWeight = food.servingWeightGrams > 0 ? food.servingWeightGrams : 100;
  const factor = 100 / baseWeight;
  const missing = new Set(food.missingFields || []);
  const raw = food.rawNutrients;

  const valOrNull = (key: NutrientFieldKey, numericVal: number): number | null => {
    if (raw && raw[key] === null) return null;
    if (missing.has(key)) return null;
    if (!Number.isFinite(numericVal)) return null;
    return key === 'calories' ? round1(numericVal * factor) : round1(numericVal * factor);
  };

  return {
    calories: valOrNull('calories', food.calories),
    protein: valOrNull('protein', food.protein),
    carbs: valOrNull('carbs', food.carbs),
    fat: valOrNull('fat', food.fat),
    fibre: valOrNull('fibre', food.fibre),
    water:
      raw?.water !== undefined
        ? raw.water
        : food.waterG !== undefined
        ? food.waterG
        : null,
    ash:
      raw?.ash !== undefined
        ? raw.ash
        : food.ashG !== undefined
        ? food.ashG
        : null,
  };
}

export function calculateAtwaterCaloriesPer100g(
  per100: {
    protein: number | null;
    carbs: number | null;
    fat: number | null;
    fibre: number | null;
  },
  carbohydrateBasis: FoodItem['carbohydrateBasis'] = 'available'
): number {
  const p = per100.protein ?? 0;
  const c = per100.carbs ?? 0;
  const f = per100.fat ?? 0;
  const fib = per100.fibre ?? 0;
  // Never double-count fibre when source reports total carbohydrate by difference (e.g., USDA)
  const netAvailableCarbs =
    carbohydrateBasis === 'total_by_difference' ? Math.max(0, c - fib) : c;
  // Standard Atwater + fermentable dietary fibre contribution (~2 kcal/g)
  return round1(p * 4 + netAvailableCarbs * 4 + f * 9 + fib * 2);
}

export function deriveVerificationStatus(
  food: FoodItem,
  issues: FoodValidationIssue[]
): VerificationStatus {
  const hasBlockingIssue = issues.some(
    (i) => i.severity === 'error' || i.code === 'energy_inconsistency' || i.code === 'discontinued_product'
  );

  if (food.isCustom || food.sourceType === 'personal_custom') {
    return hasBlockingIssue ? 'needs_review' : 'user_provided';
  }
  if (hasBlockingIssue) {
    return 'needs_review';
  }
  if (food.enrichedNutrients && Object.keys(food.enrichedNutrients).length > 0) {
    return 'enriched';
  }
  if (food.verificationStatus === 'estimated') {
    return 'estimated';
  }
  if (food.sourceType === 'community' && (food.missingFields?.length || 0) >= 2) {
    return 'needs_review';
  }
  if (food.verificationStatus) {
    return food.verificationStatus;
  }
  if (food.sourceType === 'verified_reference' || food.sourceType === 'branded') {
    return 'verified';
  }
  return 'estimated';
}

export function validateFoodRecord(
  food: FoodItem,
  duplicateCodeSet?: Set<string>,
  duplicateNameStateSet?: Set<string>
): FoodValidationIssue[] {
  const issues: FoodValidationIssue[] = [];
  const sourceName = food.sourceName || (food.isCustom ? 'Personal Custom Food' : 'Unknown Source');
  const per100 = getNutrientsPer100g(food);

  // 1. Duplicate source code check
  if (food.foodCode || food.sourceId) {
    const key = `${sourceName}::${(food.foodCode || food.sourceId || '').toUpperCase()}`;
    if (duplicateCodeSet?.has(key)) {
      issues.push({
        foodId: food.id,
        foodName: food.name,
        sourceName,
        code: 'duplicate_code',
        severity: 'error',
        message: `Duplicate source food code "${food.foodCode || food.sourceId}" in ${sourceName}`,
      });
    }
  }

  // 2. Duplicate food record (same normalized name + state within same source)
  const normState = (food.foodState || 'unspecified').toLowerCase().trim();
  const normNameKey = `${sourceName}::${food.name.toLowerCase().trim()}::${normState}`;
  if (duplicateNameStateSet?.has(normNameKey)) {
    issues.push({
      foodId: food.id,
      foodName: food.name,
      sourceName,
      code: 'duplicate_food_record',
      severity: 'warning',
      message: `Duplicate food name & state record "${food.name}" (${normState})`,
    });
  }

  // 3. Missing nutrient identification (never silently coerced to 0)
  const missingKeys: NutrientFieldKey[] = [];
  if (per100.calories === null) missingKeys.push('calories');
  if (per100.protein === null) missingKeys.push('protein');
  if (per100.carbs === null) missingKeys.push('carbs');
  if (per100.fat === null) missingKeys.push('fat');
  if (per100.fibre === null) missingKeys.push('fibre');

  if (missingKeys.length > 0) {
    issues.push({
      foodId: food.id,
      foodName: food.name,
      sourceName,
      code: 'missing_nutrient',
      severity: 'info',
      message: `Pending validation for missing nutrients: ${missingKeys.join(', ')}`,
      details: { missingFields: missingKeys.join(',') },
    });
  }

  // 4. Negative value check
  const negFields: string[] = [];
  if (per100.calories !== null && per100.calories < 0) negFields.push('calories');
  if (per100.protein !== null && per100.protein < 0) negFields.push('protein');
  if (per100.carbs !== null && per100.carbs < 0) negFields.push('carbs');
  if (per100.fat !== null && per100.fat < 0) negFields.push('fat');
  if (per100.fibre !== null && per100.fibre < 0) negFields.push('fibre');
  if (negFields.length > 0) {
    issues.push({
      foodId: food.id,
      foodName: food.name,
      sourceName,
      code: 'negative_value',
      severity: 'error',
      message: `Negative nutrient values detected: ${negFields.join(', ')}`,
    });
  }

  // 5. Unit / range errors per 100 g
  if (
    (per100.protein !== null && per100.protein > 100) ||
    (per100.carbs !== null && per100.carbs > 100) ||
    (per100.fat !== null && per100.fat > 100) ||
    (per100.fibre !== null && per100.fibre > 100) ||
    (per100.calories !== null && per100.calories > 920)
  ) {
    issues.push({
      foodId: food.id,
      foodName: food.name,
      sourceName,
      code: 'unit_range_error',
      severity: 'error',
      message: `Impossible nutrient value per 100g (Cal=${per100.calories}, P=${per100.protein}, C=${per100.carbs}, F=${per100.fat}, Fib=${per100.fibre})`,
    });
  }

  // 6. Proximate sum anomaly (>105g per 100g)
  const macroSum =
    (per100.protein ?? 0) +
    (per100.carbs ?? 0) +
    (per100.fat ?? 0) +
    (per100.fibre ?? 0) +
    (per100.water ?? 0) +
    (per100.ash ?? 0);
  if (macroSum > 105) {
    issues.push({
      foodId: food.id,
      foodName: food.name,
      sourceName,
      code: 'proximate_sum_anomaly',
      severity: 'warning',
      message: `Sum of proximate components exceeds 105 g/100g (${round1(macroSum)} g)`,
      details: { proximateSumG: round1(macroSum) },
    });
  }

  // 7. Calorie consistency check against Atwater (WITHOUT overwriting source calories)
  if (per100.calories !== null && per100.calories > 0) {
    const inferredBasis =
      food.carbohydrateBasis ||
      ((food.sourceName || '').toLowerCase().includes('usda') ? 'total_by_difference' : 'available');
    const atwater = calculateAtwaterCaloriesPer100g(per100, inferredBasis);
    const diff = Math.abs(per100.calories - atwater);
    const diffPct = (diff / per100.calories) * 100;
    if (diffPct > 15 && diff > 15) {
      issues.push({
        foodId: food.id,
        foodName: food.name,
        sourceName,
        code: 'energy_inconsistency',
        severity: 'warning',
        message: `Source calories (${per100.calories} kcal/100g) differ by ${round1(diffPct)}% from Atwater calc (${atwater} kcal/100g). Original source value preserved.`,
        details: {
          sourceCaloriesPer100g: per100.calories,
          atwaterCaloriesPer100g: atwater,
          diffPct: round1(diffPct),
        },
      });
    }
  }

  // 8. Serving weight consistency check
  if (!Number.isFinite(food.servingWeightGrams) || food.servingWeightGrams <= 0) {
    issues.push({
      foodId: food.id,
      foodName: food.name,
      sourceName,
      code: 'serving_consistency_error',
      severity: 'error',
      message: `Invalid servingWeightGrams (${food.servingWeightGrams})`,
    });
  }

  // 9. Raw vs cooked classification check
  const nameLower = food.name.toLowerCase();
  const stateLower = (food.foodState || '').toLowerCase();
  if (!stateLower) {
    issues.push({
      foodId: food.id,
      foodName: food.name,
      sourceName,
      code: 'raw_cooked_unspecified',
      severity: 'info',
      message: 'Food state (raw/cooked/roasted/etc.) is unspecified',
    });
  } else if (
    (/\b(cooked|boiled|fried|roasted|steamed|curry|dosa|roti|idli|sambar|rasam|bhurji)\b/i.test(nameLower) &&
      stateLower === 'raw') ||
    (/\braw\b/i.test(nameLower) && stateLower === 'cooked')
  ) {
    issues.push({
      foodId: food.id,
      foodName: food.name,
      sourceName,
      code: 'raw_cooked_unspecified',
      severity: 'warning',
      message: `Potential raw/cooked mismatch between name ("${food.name}") and state ("${food.foodState}")`,
    });
  }

  // 10. Source authenticity / discontinued check
  if (food.isDiscontinued) {
    issues.push({
      foodId: food.id,
      foodName: food.name,
      sourceName,
      code: 'discontinued_product',
      severity: 'warning',
      message: 'Packaged product flagged as discontinued or obsolete in source catalog',
    });
  }

  if (!food.isCustom && !food.sourceName) {
    issues.push({
      foodId: food.id,
      foodName: food.name,
      sourceName,
      code: 'source_unverified',
      severity: 'warning',
      message: 'Reference food missing explicit sourceName attribution',
    });
  }

  return issues;
}

export function validateFoodCatalog(foods: FoodItem[]): {
  validatedFoods: FoodItem[];
  allIssues: FoodValidationIssue[];
} {
  const codeCounts = new Map<string, number>();
  const nameStateCounts = new Map<string, number>();

  for (const f of foods) {
    const sourceName = f.sourceName || (f.isCustom ? 'Personal Custom Food' : 'Unknown Source');
    const code = f.foodCode || f.sourceId;
    if (code) {
      const k = `${sourceName}::${code.toUpperCase()}`;
      codeCounts.set(k, (codeCounts.get(k) || 0) + 1);
    }
    const nk = `${sourceName}::${f.name.toLowerCase().trim()}::${(f.foodState || 'unspecified')
      .toLowerCase()
      .trim()}`;
    nameStateCounts.set(nk, (nameStateCounts.get(nk) || 0) + 1);
  }

  const dupCodes = new Set(
    [...codeCounts.entries()].filter(([, count]) => count > 1).map(([k]) => k)
  );
  const dupNames = new Set(
    [...nameStateCounts.entries()].filter(([, count]) => count > 1).map(([k]) => k)
  );

  const allIssues: FoodValidationIssue[] = [];
  const validatedFoods = foods.map((food) => {
    const issues = validateFoodRecord(food, dupCodes, dupNames);
    allIssues.push(...issues);
    const per100 = getNutrientsPer100g(food);
    const inferredBasis =
      food.carbohydrateBasis ||
      ((food.sourceName || '').toLowerCase().includes('usda') ? 'total_by_difference' : 'available');
    const atwaterCalories = calculateAtwaterCaloriesPer100g(per100, inferredBasis);
    const verificationStatus = deriveVerificationStatus(food, issues);

    const hasMissingCore =
      per100.calories === null ||
      per100.protein === null ||
      per100.carbs === null ||
      per100.fat === null ||
      per100.fibre === null;

    const hasBlockingError = issues.some(
      (i) => i.code === 'negative_value' || i.code === 'unit_range_error' || i.code === 'serving_consistency_error'
    );

    const derivedQualityStatus =
      food.qualityStatus ||
      (hasMissingCore || hasBlockingError
        ? 'pending_validation'
        : food.calculationMethod && /recipe|yield|weighted/i.test(food.calculationMethod)
        ? 'calculated'
        : verificationStatus === 'estimated'
        ? 'estimated'
        : 'verified');

    const derivedSearchable =
      food.isSearchable === false
        ? false
        : !food.isDiscontinued &&
          (food.isCustom || (!hasMissingCore && !hasBlockingError && derivedQualityStatus !== 'pending_validation'));

    return {
      ...food,
      atwaterCalories: food.atwaterCalories ?? atwaterCalories,
      verificationStatus,
      qualityStatus: derivedQualityStatus,
      isSearchable: derivedSearchable,
      validationIssues: issues,
    };
  });

  return { validatedFoods, allIssues };
}

export function buildDatabaseQualityReport(foods: FoodItem[]): DatabaseQualitySummary {
  const { validatedFoods, allIssues } = validateFoodCatalog(foods);

  let ifctCount = 0;
  let usdaCount = 0;
  let openFoodFactsCount = 0;
  let brandedCount = 0;
  let customCount = 0;
  let verifiedCount = 0;
  let enrichedCount = 0;
  let estimatedCount = 0;
  let userProvidedCount = 0;
  let needsReviewCount = 0;
  let missingProteinCount = 0;
  let missingCarbsCount = 0;
  let missingFatCount = 0;
  let missingFibreCount = 0;
  let nccdbCount = 0;
  let discontinuedCount = 0;

  for (const f of validatedFoods) {
    const src = (f.sourceName || '').toLowerCase();
    if (f.isDiscontinued) discontinuedCount++;
    if (f.isCustom || f.sourceType === 'personal_custom') customCount++;
    else if (src.includes('ifct') || f.id.startsWith('ifct-')) ifctCount++;
    else if (src.includes('nccdb')) {
      nccdbCount++;
      usdaCount++;
    } else if (src.includes('usda')) usdaCount++;
    else if (src.includes('open food facts')) openFoodFactsCount++;
    else if (f.sourceType === 'branded') brandedCount++;

    switch (f.verificationStatus) {
      case 'verified':
        verifiedCount++;
        break;
      case 'enriched':
        enrichedCount++;
        break;
      case 'estimated':
        estimatedCount++;
        break;
      case 'user_provided':
        userProvidedCount++;
        break;
      case 'needs_review':
        needsReviewCount++;
        break;
    }

    const per100 = getNutrientsPer100g(f);
    if (per100.protein === null) missingProteinCount++;
    if (per100.carbs === null) missingCarbsCount++;
    if (per100.fat === null) missingFatCount++;
    if (per100.fibre === null) missingFibreCount++;
  }

  const duplicateCount = allIssues.filter(
    (i) => i.code === 'duplicate_code' || i.code === 'duplicate_food_record'
  ).length;
  const inconsistentEnergyCount = allIssues.filter(
    (i) => i.code === 'energy_inconsistency'
  ).length;
  const rawCookedMismatchCount = allIssues.filter(
    (i) => i.code === 'raw_cooked_unspecified'
  ).length;

  return {
    totalRecords: validatedFoods.length,
    ifctCount,
    usdaCount,
    openFoodFactsCount,
    brandedCount,
    customCount,
    verifiedCount,
    enrichedCount,
    estimatedCount,
    userProvidedCount,
    needsReviewCount,
    missingProteinCount,
    missingCarbsCount,
    missingFatCount,
    missingFibreCount,
    duplicateCount,
    inconsistentEnergyCount,
    nccdbCount,
    discontinuedCount,
    rawCookedMismatchCount,
    issues: allIssues,
  };
}

function escapeCsvCell(val: unknown): string {
  const s = String(val ?? '');
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportValidationReportCsv(foods: FoodItem[]): string {
  const { validatedFoods } = validateFoodCatalog(foods);
  const headers = [
    'food_id',
    'source_code',
    'food_name',
    'food_state',
    'source_name',
    'verification_status',
    'measurement_basis',
    'calories_per_100g',
    'atwater_calories_per_100g',
    'protein_g',
    'carbs_g',
    'fat_g',
    'fibre_g',
    'missing_fields',
    'issue_codes',
    'issue_messages',
  ];

  const rows = validatedFoods.map((f) => {
    const per100 = getNutrientsPer100g(f);
    const issues = f.validationIssues || [];
    return [
      f.id,
      f.foodCode || f.sourceId || '',
      f.name,
      f.foodState || '',
      f.sourceName || '',
      f.verificationStatus || '',
      f.measurementBasis || 'per_100g',
      per100.calories ?? 'NULL',
      f.atwaterCalories ?? '',
      per100.protein ?? 'NULL',
      per100.carbs ?? 'NULL',
      per100.fat ?? 'NULL',
      per100.fibre ?? 'NULL',
      (f.missingFields || []).join('|'),
      issues.map((i) => i.code).join('|'),
      issues.map((i) => i.message).join(' ; '),
    ]
      .map(escapeCsvCell)
      .join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}
