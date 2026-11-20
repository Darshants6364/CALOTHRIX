import type { FoodItem, FoodPortion } from '../types/index.ts';

/**
 * Standardized Indian & Reference Food Portion Table
 * Stores explicit gram/ml weights, unit types, measurement methods, and scientific/household provenance.
 * Volume (ml) conversions ONLY apply to liquids with an explicit liquidDensityGPerMl.
 */
export const STANDARD_FOOD_PORTIONS: Record<string, FoodPortion[]> = {
  'food-roti': [
    {
      id: 'portion-roti-s',
      foodId: 'food-roti',
      portionName: '1 small roti / phulka',
      sizeVariant: 'small',
      gramOrMlWeight: 30,
      unitType: 'piece',
      measurementMethod: 'weighed_household_standard',
      sourceReference: 'ICMR-NIN Dietary Guidelines for Indians',
      confidenceLevel: 'high',
    },
    {
      id: 'portion-roti-m',
      foodId: 'food-roti',
      portionName: '1 medium roti / chapati',
      sizeVariant: 'medium',
      gramOrMlWeight: 40,
      unitType: 'piece',
      measurementMethod: 'weighed_household_standard',
      sourceReference: 'ICMR-NIN Dietary Guidelines for Indians',
      confidenceLevel: 'high',
      isDefault: true,
    },
    {
      id: 'portion-roti-l',
      foodId: 'food-roti',
      portionName: '1 large roti / tawa chapati',
      sizeVariant: 'large',
      gramOrMlWeight: 55,
      unitType: 'piece',
      measurementMethod: 'weighed_household_standard',
      sourceReference: 'ICMR-NIN Dietary Guidelines for Indians',
      confidenceLevel: 'high',
    },
  ],
  'ind-ghee-roti': [
    {
      id: 'portion-groti-m',
      foodId: 'ind-ghee-roti',
      portionName: '1 medium ghee roti (with 1/2 tsp ghee)',
      sizeVariant: 'medium',
      gramOrMlWeight: 43,
      unitType: 'piece',
      measurementMethod: 'weighed_household_standard',
      sourceReference: 'ICMR-NIN IFCT 2017 Recipe Calculation',
      confidenceLevel: 'high',
      isDefault: true,
    },
    {
      id: 'portion-groti-l',
      foodId: 'ind-ghee-roti',
      portionName: '1 large ghee roti',
      sizeVariant: 'large',
      gramOrMlWeight: 58,
      unitType: 'piece',
      measurementMethod: 'weighed_household_standard',
      sourceReference: 'ICMR-NIN IFCT 2017 Recipe Calculation',
      confidenceLevel: 'moderate',
    },
  ],
  'ind-akki-rotti': [
    {
      id: 'portion-akki-m',
      foodId: 'ind-akki-rotti',
      portionName: '1 medium akki rotti',
      sizeVariant: 'medium',
      gramOrMlWeight: 85,
      unitType: 'piece',
      measurementMethod: 'weighed_karnataka_household_standard',
      sourceReference: 'Karnataka Home Tiffin Standard',
      confidenceLevel: 'moderate',
      isDefault: true,
    },
    {
      id: 'portion-akki-l',
      foodId: 'ind-akki-rotti',
      portionName: '1 large hotel akki rotti',
      sizeVariant: 'large',
      gramOrMlWeight: 120,
      unitType: 'piece',
      measurementMethod: 'weighed_restaurant_standard',
      sourceReference: 'Karnataka Hotel Portion Benchmark',
      confidenceLevel: 'moderate',
    },
  ],
  'ind-ragi-mudde': [
    {
      id: 'portion-mudde-s',
      foodId: 'ind-ragi-mudde',
      portionName: '1 small ragi mudde / ragi ball',
      sizeVariant: 'small',
      gramOrMlWeight: 150,
      unitType: 'piece',
      measurementMethod: 'weighed_karnataka_household_standard',
      sourceReference: 'IFCT 2017 Ragi + Water Yield 2.7x',
      confidenceLevel: 'high',
    },
    {
      id: 'portion-mudde-m',
      foodId: 'ind-ragi-mudde',
      portionName: '1 medium ragi mudde / ragi ball',
      sizeVariant: 'medium',
      gramOrMlWeight: 200,
      unitType: 'piece',
      measurementMethod: 'weighed_karnataka_household_standard',
      sourceReference: 'IFCT 2017 Ragi + Water Yield 2.7x',
      confidenceLevel: 'high',
      isDefault: true,
    },
    {
      id: 'portion-mudde-l',
      foodId: 'ind-ragi-mudde',
      portionName: '1 large ragi mudde',
      sizeVariant: 'large',
      gramOrMlWeight: 280,
      unitType: 'piece',
      measurementMethod: 'weighed_karnataka_household_standard',
      sourceReference: 'IFCT 2017 Ragi + Water Yield 2.7x',
      confidenceLevel: 'moderate',
    },
  ],
  'food-rice-cooked': [
    {
      id: 'portion-rice-katori',
      foodId: 'food-rice-cooked',
      portionName: '1 medium katori cooked rice',
      sizeVariant: 'medium',
      gramOrMlWeight: 150,
      unitType: 'katori',
      measurementMethod: 'volumetric_cooked_yield',
      sourceReference: 'NIN Standard Household Cup/Katori',
      confidenceLevel: 'high',
    },
    {
      id: 'portion-rice-cup',
      foodId: 'food-rice-cooked',
      portionName: '1 standard cup cooked rice (240 ml cup)',
      sizeVariant: 'medium',
      gramOrMlWeight: 165,
      unitType: 'cup',
      measurementMethod: 'volumetric_cooked_yield',
      sourceReference: 'USDA / NIN Cooked White Rice Density (0.69 g/ml)',
      confidenceLevel: 'high',
      isDefault: true,
    },
    {
      id: 'portion-rice-plate',
      foodId: 'food-rice-cooked',
      portionName: '1 full plate cooked rice',
      sizeVariant: 'large',
      gramOrMlWeight: 250,
      unitType: 'plate',
      measurementMethod: 'weighed_restaurant_standard',
      sourceReference: 'Indian Meal Plate Benchmark',
      confidenceLevel: 'moderate',
    },
  ],
  'food-dal': [
    {
      id: 'portion-dal-s',
      foodId: 'food-dal',
      portionName: '1 small katori dal',
      sizeVariant: 'small',
      gramOrMlWeight: 120,
      unitType: 'katori',
      measurementMethod: 'weighed_household_standard',
      sourceReference: 'NIN Standard Katori (150 ml)',
      confidenceLevel: 'high',
    },
    {
      id: 'portion-dal-m',
      foodId: 'food-dal',
      portionName: '1 medium katori dal',
      sizeVariant: 'medium',
      gramOrMlWeight: 150,
      unitType: 'katori',
      measurementMethod: 'weighed_household_standard',
      sourceReference: 'NIN Standard Katori (150 ml)',
      confidenceLevel: 'high',
      isDefault: true,
    },
    {
      id: 'portion-dal-bowl',
      foodId: 'food-dal',
      portionName: '1 large bowl dal',
      sizeVariant: 'large',
      gramOrMlWeight: 250,
      unitType: 'bowl',
      measurementMethod: 'weighed_household_standard',
      sourceReference: 'Restaurant Bowl Standard',
      confidenceLevel: 'moderate',
    },
  ],
  'food-idli': [
    {
      id: 'portion-idli-s',
      foodId: 'food-idli',
      portionName: '1 mini / homemade idli',
      sizeVariant: 'small',
      gramOrMlWeight: 35,
      unitType: 'piece',
      measurementMethod: 'weighed_household_standard',
      sourceReference: 'South Indian Household Mould Standard',
      confidenceLevel: 'high',
    },
    {
      id: 'portion-idli-m',
      foodId: 'food-idli',
      portionName: '1 medium idli',
      sizeVariant: 'medium',
      gramOrMlWeight: 45,
      unitType: 'piece',
      measurementMethod: 'weighed_household_standard',
      sourceReference: 'NIN / South Indian Standard',
      confidenceLevel: 'high',
      isDefault: true,
    },
    {
      id: 'portion-idli-l',
      foodId: 'food-idli',
      portionName: '1 large hotel idli (thatte/restaurant)',
      sizeVariant: 'large',
      gramOrMlWeight: 75,
      unitType: 'piece',
      measurementMethod: 'weighed_restaurant_standard',
      sourceReference: 'South Indian Darshini Standard',
      confidenceLevel: 'moderate',
    },
  ],
  'food-dosa': [
    {
      id: 'portion-dosa-s',
      foodId: 'food-dosa',
      portionName: '1 small homemade plain dosa',
      sizeVariant: 'small',
      gramOrMlWeight: 65,
      unitType: 'piece',
      measurementMethod: 'weighed_household_standard',
      sourceReference: 'South Indian Household Tawa Standard',
      confidenceLevel: 'high',
    },
    {
      id: 'portion-dosa-m',
      foodId: 'food-dosa',
      portionName: '1 medium plain dosa',
      sizeVariant: 'medium',
      gramOrMlWeight: 90,
      unitType: 'piece',
      measurementMethod: 'weighed_household_standard',
      sourceReference: 'NIN / South Indian Standard',
      confidenceLevel: 'high',
      isDefault: true,
    },
    {
      id: 'portion-dosa-l',
      foodId: 'food-dosa',
      portionName: '1 large restaurant plain dosa',
      sizeVariant: 'large',
      gramOrMlWeight: 130,
      unitType: 'piece',
      measurementMethod: 'weighed_restaurant_standard',
      sourceReference: 'Restaurant Dosa Benchmark',
      confidenceLevel: 'moderate',
    },
  ],
  'ind-thuppa-dosa': [
    {
      id: 'portion-tdosa-m',
      foodId: 'ind-thuppa-dosa',
      portionName: '1 medium ghee / thuppa dosa',
      sizeVariant: 'medium',
      gramOrMlWeight: 110,
      unitType: 'piece',
      measurementMethod: 'weighed_restaurant_standard',
      sourceReference: 'Karnataka Ghee Roast / Thuppa Dosa Standard',
      confidenceLevel: 'moderate',
      isDefault: true,
    },
  ],
  'ind-masala-dosa': [
    {
      id: 'portion-mdosa-m',
      foodId: 'ind-masala-dosa',
      portionName: '1 medium masala dosa',
      sizeVariant: 'medium',
      gramOrMlWeight: 180,
      unitType: 'piece',
      measurementMethod: 'weighed_restaurant_standard',
      sourceReference: 'South Indian Masala Dosa Benchmark',
      confidenceLevel: 'high',
      isDefault: true,
    },
    {
      id: 'portion-mdosa-l',
      foodId: 'ind-masala-dosa',
      portionName: '1 large restaurant masala dosa',
      sizeVariant: 'large',
      gramOrMlWeight: 230,
      unitType: 'piece',
      measurementMethod: 'weighed_restaurant_standard',
      sourceReference: 'Restaurant Dosa Benchmark',
      confidenceLevel: 'moderate',
    },
  ],
  'food-sambar': [
    {
      id: 'portion-sambar-katori',
      foodId: 'food-sambar',
      portionName: '1 katori sambar',
      sizeVariant: 'small',
      gramOrMlWeight: 140,
      unitType: 'katori',
      measurementMethod: 'weighed_household_standard',
      sourceReference: 'South Indian Household Katori',
      confidenceLevel: 'high',
    },
    {
      id: 'portion-sambar-bowl',
      foodId: 'food-sambar',
      portionName: '1 medium bowl sambar',
      sizeVariant: 'medium',
      gramOrMlWeight: 200,
      unitType: 'bowl',
      measurementMethod: 'weighed_household_standard',
      sourceReference: 'NIN Standard Bowl',
      confidenceLevel: 'high',
      isDefault: true,
    },
  ],
  'ind-cow-ghee': [
    {
      id: 'portion-ghee-tsp',
      foodId: 'ind-cow-ghee',
      portionName: '1 tsp ghee',
      sizeVariant: 'small',
      gramOrMlWeight: 5,
      unitType: 'tsp',
      measurementMethod: 'volumetric_density_0.91',
      sourceReference: 'ICMR-NIN Fat Spoon Reference',
      confidenceLevel: 'high',
    },
    {
      id: 'portion-ghee-tbsp',
      foodId: 'ind-cow-ghee',
      portionName: '1 tbsp ghee',
      sizeVariant: 'medium',
      gramOrMlWeight: 14,
      unitType: 'tbsp',
      measurementMethod: 'volumetric_density_0.91',
      sourceReference: 'ICMR-NIN / USDA Clarified Butter Density',
      confidenceLevel: 'high',
      isDefault: true,
    },
  ],
  'food-milk': [
    {
      id: 'portion-milk-cup',
      foodId: 'food-milk',
      portionName: '1 cup milk (200 ml / 206 g)',
      sizeVariant: 'small',
      gramOrMlWeight: 206,
      unitType: 'cup',
      measurementMethod: 'volumetric_density_1.03',
      sourceReference: 'Cow/Toned Milk Specific Gravity (1.03 g/ml)',
      confidenceLevel: 'high',
    },
    {
      id: 'portion-milk-glass',
      foodId: 'food-milk',
      portionName: '1 standard glass milk (250 ml / 257.5 g)',
      sizeVariant: 'medium',
      gramOrMlWeight: 257.5,
      unitType: 'glass',
      measurementMethod: 'volumetric_density_1.03',
      sourceReference: 'Cow/Toned Milk Specific Gravity (1.03 g/ml)',
      confidenceLevel: 'high',
      isDefault: true,
    },
  ],
  'food-curd': [
    {
      id: 'portion-curd-katori',
      foodId: 'food-curd',
      portionName: '1 katori curd / dahi',
      sizeVariant: 'medium',
      gramOrMlWeight: 120,
      unitType: 'katori',
      measurementMethod: 'weighed_household_standard',
      sourceReference: 'NIN Standard Household Katori',
      confidenceLevel: 'high',
      isDefault: true,
    },
    {
      id: 'portion-curd-bowl',
      foodId: 'food-curd',
      portionName: '1 bowl curd / dahi',
      sizeVariant: 'large',
      gramOrMlWeight: 200,
      unitType: 'bowl',
      measurementMethod: 'weighed_household_standard',
      sourceReference: 'NIN Standard Household Bowl',
      confidenceLevel: 'high',
    },
  ],
  'food-eggs': [
    {
      id: 'portion-egg-s',
      foodId: 'food-eggs',
      portionName: '1 small boiled egg',
      sizeVariant: 'small',
      gramOrMlWeight: 42,
      unitType: 'piece',
      measurementMethod: 'edible_portion_weighed',
      sourceReference: 'USDA / NIN Shell-Free Edible Egg',
      confidenceLevel: 'high',
    },
    {
      id: 'portion-egg-m',
      foodId: 'food-eggs',
      portionName: '1 large boiled egg',
      sizeVariant: 'medium',
      gramOrMlWeight: 50,
      unitType: 'piece',
      measurementMethod: 'edible_portion_weighed',
      sourceReference: 'USDA / NIN Shell-Free Edible Egg',
      confidenceLevel: 'high',
      isDefault: true,
    },
    {
      id: 'portion-egg-l',
      foodId: 'food-eggs',
      portionName: '2 large boiled eggs',
      sizeVariant: 'large',
      gramOrMlWeight: 100,
      unitType: 'piece',
      measurementMethod: 'edible_portion_weighed',
      sourceReference: 'USDA / NIN Shell-Free Edible Egg',
      confidenceLevel: 'high',
    },
  ],
};

/**
 * Pattern-based fallback portion inference for IFCT raw items & packaged items
 * ONLY attaches scientifically sensible portions (never attaches "1 piece" to oil or "ml" to rice).
 */
export function getPortionsForFood(food: FoodItem): FoodPortion[] {
  const result: FoodPortion[] = [];

  if (food.portions && food.portions.length > 0) {
    result.push(...food.portions);
  }

  const catalogPortions = STANDARD_FOOD_PORTIONS[food.id];
  if (catalogPortions) {
    for (const p of catalogPortions) {
      if (!result.some((r) => r.portionName === p.portionName)) {
        result.push(p);
      }
    }
  }

  // Add item's native serving if it differs from 100 g
  if (
    food.servingWeightGrams > 0 &&
    food.servingWeightGrams !== 100 &&
    !result.some((p) => Math.abs(p.gramOrMlWeight - food.servingWeightGrams) < 0.5)
  ) {
    result.push({
      id: `${food.id}-native-serving`,
      foodId: food.id,
      portionName: food.servingName || `${food.servingWeightGrams} g serving`,
      sizeVariant: 'standard',
      gramOrMlWeight: food.servingWeightGrams,
      unitType: food.liquidDensityGPerMl ? 'ml' : 'piece',
      measurementMethod: 'source_serving_definition',
      sourceReference: food.sourceName || 'Reference',
      confidenceLevel: 'high',
    });
  }

  // Context-aware Indian portions by food group / name when no explicit catalog row matched
  if (result.length === 0) {
    const n = food.name.toLowerCase();
    const g = (food.foodGroup || '').toLowerCase();
    if (food.liquidDensityGPerMl) {
      const d = food.liquidDensityGPerMl;
      result.push(
        {
          id: `${food.id}-cup`,
          foodId: food.id,
          portionName: `1 cup (200 ml · ${Math.round(200 * d)} g)`,
          sizeVariant: 'small',
          gramOrMlWeight: Math.round(200 * d * 10) / 10,
          unitType: 'cup',
          measurementMethod: `liquid_density_${d}`,
          sourceReference: 'Verified Liquid Density',
          confidenceLevel: 'high',
        },
        {
          id: `${food.id}-glass`,
          foodId: food.id,
          portionName: `1 glass (250 ml · ${Math.round(250 * d)} g)`,
          sizeVariant: 'medium',
          gramOrMlWeight: Math.round(250 * d * 10) / 10,
          unitType: 'glass',
          measurementMethod: `liquid_density_${d}`,
          sourceReference: 'Verified Liquid Density',
          confidenceLevel: 'high',
        }
      );
    } else if (n.includes('egg,') || n.includes('egg ')) {
      result.push({
        id: `${food.id}-1egg`,
        foodId: food.id,
        portionName: '1 whole egg edible (~50 g)',
        sizeVariant: 'medium',
        gramOrMlWeight: 50,
        unitType: 'piece',
        measurementMethod: 'edible_portion_reference',
        sourceReference: 'NIN Egg Reference',
        confidenceLevel: 'high',
      });
    } else if (g.includes('grain legumes') || n.includes('dal') || n.includes('lentil')) {
      result.push({
        id: `${food.id}-dry-katori`,
        foodId: food.id,
        portionName: '1 small katori dry uncooked (~50 g)',
        sizeVariant: 'small',
        gramOrMlWeight: 50,
        unitType: 'katori',
        measurementMethod: 'dry_measure',
        sourceReference: 'Indian Kitchen Measure',
        confidenceLevel: 'moderate',
      });
    } else if (g.includes('nuts') || n.includes('almond') || n.includes('cashew') || n.includes('peanut')) {
      result.push({
        id: `${food.id}-handful`,
        foodId: food.id,
        portionName: '1 handful / 1 oz (~28 g)',
        sizeVariant: 'medium',
        gramOrMlWeight: 28,
        unitType: 'piece',
        measurementMethod: 'standard_nut_serving',
        sourceReference: 'USDA / NIN Nut Serving',
        confidenceLevel: 'high',
      });
    } else if (g.includes('spices') || n.includes('oil') || n.includes('ghee') || n.includes('butter')) {
      result.push(
        {
          id: `${food.id}-tsp`,
          foodId: food.id,
          portionName: '1 tsp (~5 g)',
          sizeVariant: 'small',
          gramOrMlWeight: 5,
          unitType: 'tsp',
          measurementMethod: 'kitchen_spoon_measure',
          sourceReference: 'NIN Household Spoon',
          confidenceLevel: 'moderate',
        },
        {
          id: `${food.id}-tbsp`,
          foodId: food.id,
          portionName: '1 tbsp (~15 g)',
          sizeVariant: 'medium',
          gramOrMlWeight: 15,
          unitType: 'tbsp',
          measurementMethod: 'kitchen_spoon_measure',
          sourceReference: 'NIN Household Spoon',
          confidenceLevel: 'moderate',
        }
      );
    }
  }

  return result;
}

/**
 * Strictly converts ml -> grams ONLY when the food has an explicit scientifically defined liquidDensityGPerMl.
 * Never assumes 1 ml = 1 g blindly for solid or unspecified foods.
 */
export function convertVolumeMlToGrams(
  food: FoodItem,
  mlAmount: number
): { ok: true; grams: number; density: number } | { ok: false; error: string } {
  if (!Number.isFinite(mlAmount) || mlAmount < 0) {
    return { ok: false, error: 'Volume must be a non-negative number.' };
  }
  const density = food.liquidDensityGPerMl;
  if (typeof density !== 'number' || !Number.isFinite(density) || density <= 0) {
    return {
      ok: false,
      error: `Millilitre (ml) conversion is unavailable for "${food.name}" because it has no verified liquid density.`,
    };
  }
  return {
    ok: true,
    grams: Math.round(mlAmount * density * 100) / 100,
    density,
  };
}
