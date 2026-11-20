import type {
  CalculatedRecipeResult,
  FoodItem,
  NutrientFieldKey,
  RecipeCalculationOptions,
} from '../types/index.ts';
import { getNutrientsPer100g } from './foodValidationEngine.ts';

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

export interface IndianRecipeTemplate {
  id: string;
  label: string;
  cookingYieldFactor: number;
  defaultPrepStyle: 'homemade' | 'restaurant';
  description: string;
}

export const INDIAN_RECIPE_TEMPLATES: IndianRecipeTemplate[] = [
  {
    id: 'dry-curry-fry',
    label: 'Bhuna / Dry Curry / Bhurji (Moisture Loss ~0.85x)',
    cookingYieldFactor: 0.85,
    defaultPrepStyle: 'homemade',
    description: 'Egg bhurji, paneer bhurji, dry sabzi, roasted chicken — water evaporates during cooking.',
  },
  {
    id: 'gravy-curry',
    label: 'Indian Gravy / Chicken Curry (~0.90x–1.10x)',
    cookingYieldFactor: 0.95,
    defaultPrepStyle: 'homemade',
    description: 'Onion-tomato-spice base curry (remember to include added water & cooking oil).',
  },
  {
    id: 'boiled-rice',
    label: 'Steamed / Boiled Rice (Water Absorption ~2.5x)',
    cookingYieldFactor: 2.5,
    defaultPrepStyle: 'homemade',
    description: '100 g dry raw rice absorbs water to yield ~250 g cooked rice.',
  },
  {
    id: 'boiled-dal',
    label: 'Pressure-Cooked Dal / Sambar (~2.6x)',
    cookingYieldFactor: 2.6,
    defaultPrepStyle: 'homemade',
    description: 'Dry lentils absorb water during pressure cooking; adjust final cooked weight for thickness.',
  },
  {
    id: 'ragi-mudde',
    label: 'Ragi Mudde / Millets Porridge (~2.7x)',
    cookingYieldFactor: 2.7,
    defaultPrepStyle: 'homemade',
    description: 'Finger millet flour cooked in boiling water to firm mudde consistency.',
  },
];

/**
 * Indian Recipe Calculation Engine
 * Formula: Nutrient per 100g cooked = (Total retained nutrient / Final cooked recipe weight) * 100
 * Accounts for:
 *  - Edible portion factor (EPF, e.g., discarding bones/peels)
 *  - Nutrient retention factor during thermal cooking
 *  - Cooking yield factor (water gain or moisture loss)
 *  - Added cooking oil / ghee
 *  - Homemade vs restaurant preparation style (tagged clearly as verificationStatus = 'estimated')
 */
export function calculateRecipeNutrition(
  options: RecipeCalculationOptions
): CalculatedRecipeResult {
  if (!options.ingredients || options.ingredients.length === 0) {
    throw new Error('At least one ingredient is required to calculate a recipe.');
  }

  let rawTotalWeightGrams = 0;
  let rawEdibleWeightGrams = 0;

  let totalCalories = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;
  let totalFibre = 0;
  let totalInsolubleFibre = 0;
  let totalSolubleFibre = 0;

  let hasInsoluble = false;
  let hasSoluble = false;

  // Track whether ANY meaningful nutrient data exists vs completely missing across all contributors
  const contributorFlags: Record<NutrientFieldKey, { present: boolean; missingWeight: number }> = {
    calories: { present: false, missingWeight: 0 },
    protein: { present: false, missingWeight: 0 },
    carbs: { present: false, missingWeight: 0 },
    fat: { present: false, missingWeight: 0 },
    fibre: { present: false, missingWeight: 0 },
  };

  for (const ing of options.ingredients) {
    if (!Number.isFinite(ing.rawWeightGrams) || ing.rawWeightGrams <= 0) continue;
    const epf =
      ing.ediblePortionFactor !== undefined && ing.ediblePortionFactor > 0
        ? Math.min(1, ing.ediblePortionFactor)
        : 1;
    const retention =
      ing.retentionFactor !== undefined && ing.retentionFactor > 0
        ? Math.min(1.5, ing.retentionFactor)
        : 1;

    const edibleGrams = ing.rawWeightGrams * epf;
    rawTotalWeightGrams += ing.rawWeightGrams;
    rawEdibleWeightGrams += edibleGrams;

    const per100 = getNutrientsPer100g(ing.food);
    const scale = (edibleGrams / 100) * retention;

    if (per100.calories !== null) {
      totalCalories += per100.calories * scale;
      contributorFlags.calories.present = true;
    } else {
      contributorFlags.calories.missingWeight += edibleGrams;
    }

    if (per100.protein !== null) {
      totalProtein += per100.protein * scale;
      contributorFlags.protein.present = true;
    } else {
      contributorFlags.protein.missingWeight += edibleGrams;
    }

    if (per100.carbs !== null) {
      totalCarbs += per100.carbs * scale;
      contributorFlags.carbs.present = true;
    } else {
      contributorFlags.carbs.missingWeight += edibleGrams;
    }

    if (per100.fat !== null) {
      totalFat += per100.fat * scale;
      contributorFlags.fat.present = true;
    } else {
      contributorFlags.fat.missingWeight += edibleGrams;
    }

    if (per100.fibre !== null) {
      totalFibre += per100.fibre * scale;
      contributorFlags.fibre.present = true;
    } else {
      contributorFlags.fibre.missingWeight += edibleGrams;
    }

    if (typeof ing.food.insolubleFibreG === 'number') {
      const baseW = ing.food.servingWeightGrams > 0 ? ing.food.servingWeightGrams : 100;
      totalInsolubleFibre += (ing.food.insolubleFibreG * (100 / baseW)) * scale;
      hasInsoluble = true;
    }
    if (typeof ing.food.solubleFibreG === 'number') {
      const baseW = ing.food.servingWeightGrams > 0 ? ing.food.servingWeightGrams : 100;
      totalSolubleFibre += (ing.food.solubleFibreG * (100 / baseW)) * scale;
      hasSoluble = true;
    }
  }

  if (rawEdibleWeightGrams <= 0) {
    throw new Error('Total edible ingredient weight must be greater than 0 g.');
  }

  const cookingYieldFactor =
    options.cookingYieldFactor && options.cookingYieldFactor > 0
      ? options.cookingYieldFactor
      : 1;

  const finalCookedWeightGrams =
    options.finalCookedWeightGrams && options.finalCookedWeightGrams > 0
      ? Math.round(options.finalCookedWeightGrams * 10) / 10
      : Math.round(rawEdibleWeightGrams * cookingYieldFactor * 10) / 10;

  const effectiveYield = Math.round((finalCookedWeightGrams / rawEdibleWeightGrams) * 100) / 100;
  const per100Factor = 100 / finalCookedWeightGrams;

  const missingFields: NutrientFieldKey[] = [];
  (['calories', 'protein', 'carbs', 'fat', 'fibre'] as NutrientFieldKey[]).forEach((key) => {
    if (!contributorFlags[key].present) {
      missingFields.push(key);
    }
  });

  const per100g = {
    calories: Math.round(totalCalories * per100Factor),
    protein: round1(totalProtein * per100Factor),
    carbs: round1(totalCarbs * per100Factor),
    fat: round1(totalFat * per100Factor),
    fibre: round1(totalFibre * per100Factor),
    insolubleFibreG: hasInsoluble ? round1(totalInsolubleFibre * per100Factor) : null,
    solubleFibreG: hasSoluble ? round1(totalSolubleFibre * per100Factor) : null,
    missingFields,
  };

  const totalBatch = {
    calories: Math.round(totalCalories),
    protein: round1(totalProtein),
    carbs: round1(totalCarbs),
    fat: round1(totalFat),
    fibre: round1(totalFibre),
  };

  const servingsCount =
    options.servingsCount && options.servingsCount > 0 ? options.servingsCount : 1;

  const ingredientSummary = options.ingredients
    .filter((i) => i.rawWeightGrams > 0)
    .map((i) => `${i.food.name} (${i.rawWeightGrams}g)`)
    .join(', ');

  const prepTag =
    options.preparationStyle === 'restaurant' ? 'Restaurant Recipe' : 'Homemade Recipe';

  const asFoodItem: FoodItem = {
    id: `recipe-${Date.now().toString(36)}`,
    name: `${options.name.trim()} (${prepTag})`,
    country: 'India',
    category: options.category || 'Homemade foods',
    ingredientsText: ingredientSummary,
    servingName: '100 g',
    servingWeightGrams: 100,
    measurementBasis: 'per_100g',
    foodState: 'cooked',
    calories: per100g.calories,
    protein: per100g.protein,
    carbs: per100g.carbs,
    fat: per100g.fat,
    fibre: per100g.fibre,
    insolubleFibreG: per100g.insolubleFibreG,
    solubleFibreG: per100g.solubleFibreG,
    missingFields: missingFields.length > 0 ? missingFields : undefined,
    isCustom: true,
    sourceType: 'personal_custom',
    sourceName: `Calothrix Recipe Engine (${prepTag})`,
    sourcePriority: 5,
    verificationStatus: 'estimated',
    dataQuality: 'user_entered',
    portions: [
      {
        id: 'recipe-portion-1srv',
        portionName: `1 recipe serving (${Math.round(finalCookedWeightGrams / servingsCount)} g)`,
        sizeVariant: 'standard',
        gramOrMlWeight: Math.round((finalCookedWeightGrams / servingsCount) * 10) / 10,
        unitType: 'bowl',
        measurementMethod: 'calculated_recipe_yield',
        sourceReference: `${prepTag} · yield ${effectiveYield}x`,
        confidenceLevel: 'moderate',
        isDefault: true,
      },
    ],
    lastUpdated: new Date().toISOString().slice(0, 10),
  };

  return {
    name: options.name.trim(),
    preparationStyle: options.preparationStyle,
    rawTotalWeightGrams: round1(rawTotalWeightGrams),
    rawEdibleWeightGrams: round1(rawEdibleWeightGrams),
    finalCookedWeightGrams,
    cookingYieldFactor: effectiveYield,
    servingsCount,
    per100g,
    totalBatch,
    asFoodItem,
  };
}
