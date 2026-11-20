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
 * Universal Household & Category Portion Inference + Serving-Size Memory
 * Attaches realistic unit options (slice, piece, scoop, bowl, katori, cup, tbsp, tsp, fillet)
 * without polluting liquids/solids inconsistently.
 */
export function getPortionsForFood(food: FoodItem): FoodPortion[] {
  const result: FoodPortion[] = [];
  const pushUnique = (p: FoodPortion) => {
    if (!result.some((r) => r.portionName.toLowerCase() === p.portionName.toLowerCase())) {
      result.push(p);
    }
  };

  if (food.portions && food.portions.length > 0) {
    food.portions.forEach(pushUnique);
  }

  const catalogPortions = STANDARD_FOOD_PORTIONS[food.id];
  if (catalogPortions) {
    catalogPortions.forEach(pushUnique);
  }

  // Add item's native serving if it differs from 100 g
  if (
    food.servingWeightGrams > 0 &&
    food.servingWeightGrams !== 100 &&
    !result.some((p) => Math.abs(p.gramOrMlWeight - food.servingWeightGrams) < 0.5)
  ) {
    pushUnique({
      id: `${food.id}-native-serving`,
      foodId: food.id,
      portionName: food.servingName || `${food.servingWeightGrams} g serving`,
      sizeVariant: 'standard',
      gramOrMlWeight: food.servingWeightGrams,
      unitType: food.liquidDensityGPerMl ? 'ml' : 'piece',
      measurementMethod: 'source_serving_definition',
      sourceReference: food.sourceName || 'Reference',
      confidenceLevel: 'high',
      isDefault: result.length === 0,
    });
  }

  // Add universal category & food-type portions so nearly every food has household units
  const n = food.name.toLowerCase();
  const cat = (food.category || '').toLowerCase();
  const g = (food.foodGroup || '').toLowerCase();

  if (food.liquidDensityGPerMl) {
    const d = food.liquidDensityGPerMl;
    if (/oil|ghee/.test(n)) {
      pushUnique({
        id: `${food.id}-tsp`,
        foodId: food.id,
        portionName: `1 tsp (5 ml · ${Math.round(5 * d * 10) / 10} g)`,
        sizeVariant: 'small',
        gramOrMlWeight: Math.round(5 * d * 10) / 10,
        unitType: 'tsp',
        measurementMethod: `liquid_density_${d}`,
        sourceReference: 'Household Spoon Measure',
        confidenceLevel: 'high',
      });
      pushUnique({
        id: `${food.id}-tbsp`,
        foodId: food.id,
        portionName: `1 tbsp (15 ml · ${Math.round(15 * d * 10) / 10} g)`,
        sizeVariant: 'medium',
        gramOrMlWeight: Math.round(15 * d * 10) / 10,
        unitType: 'tbsp',
        measurementMethod: `liquid_density_${d}`,
        sourceReference: 'Household Spoon Measure',
        confidenceLevel: 'high',
        isDefault: result.length === 0,
      });
    } else {
      pushUnique({
        id: `${food.id}-cup`,
        foodId: food.id,
        portionName: `1 cup (200 ml · ${Math.round(200 * d)} g)`,
        sizeVariant: 'small',
        gramOrMlWeight: Math.round(200 * d * 10) / 10,
        unitType: 'cup',
        measurementMethod: `liquid_density_${d}`,
        sourceReference: 'Verified Liquid Density',
        confidenceLevel: 'high',
      });
      pushUnique({
        id: `${food.id}-glass`,
        foodId: food.id,
        portionName: `1 glass (250 ml · ${Math.round(250 * d)} g)`,
        sizeVariant: 'medium',
        gramOrMlWeight: Math.round(250 * d * 10) / 10,
        unitType: 'glass',
        measurementMethod: `liquid_density_${d}`,
        sourceReference: 'Verified Liquid Density',
        confidenceLevel: 'high',
      });
    }
  } else if (/\bwhey\b|\bprotein powder\b|\bcasein\b|\bscoop\b/.test(n) || cat === 'supplements') {
    const scoopWeight = food.servingWeightGrams > 15 && food.servingWeightGrams <= 55 ? food.servingWeightGrams : 32;
    pushUnique({
      id: `${food.id}-1scoop`,
      foodId: food.id,
      portionName: `1 scoop (${scoopWeight} g)`,
      sizeVariant: 'medium',
      gramOrMlWeight: scoopWeight,
      unitType: 'scoop',
      measurementMethod: 'standard_supplement_scoop',
      sourceReference: 'Standard Protein Scoop',
      confidenceLevel: 'high',
    });
    pushUnique({
      id: `${food.id}-1.5scoop`,
      foodId: food.id,
      portionName: `1.5 scoops (${Math.round(scoopWeight * 1.5)} g)`,
      sizeVariant: 'large',
      gramOrMlWeight: Math.round(scoopWeight * 1.5),
      unitType: 'scoop',
      measurementMethod: 'standard_supplement_scoop',
      sourceReference: 'Standard Protein Scoop',
      confidenceLevel: 'high',
    });
  } else if (/\bbread\b|\btoast\b|\bsourdough\b/.test(n)) {
    pushUnique({
      id: `${food.id}-1slice`,
      foodId: food.id,
      portionName: '1 slice (~32 g)',
      sizeVariant: 'small',
      gramOrMlWeight: 32,
      unitType: 'slice',
      measurementMethod: 'standard_bakery_slice',
      sourceReference: 'USDA / Bakery Standard',
      confidenceLevel: 'high',
    });
    pushUnique({
      id: `${food.id}-2slices`,
      foodId: food.id,
      portionName: '2 slices (~64 g)',
      sizeVariant: 'medium',
      gramOrMlWeight: 64,
      unitType: 'slice',
      measurementMethod: 'standard_bakery_slice',
      sourceReference: 'USDA / Bakery Standard',
      confidenceLevel: 'high',
    });
  } else if (/\bparatha\b|\bnaan\b|\bkulcha\b|\bthepla\b|\bchilla\b|\bpancake\b/.test(n)) {
    const pieceG = food.servingWeightGrams !== 100 && food.servingWeightGrams > 25 ? food.servingWeightGrams : 75;
    pushUnique({
      id: `${food.id}-1pc`,
      foodId: food.id,
      portionName: `1 medium piece (${pieceG} g)`,
      sizeVariant: 'medium',
      gramOrMlWeight: pieceG,
      unitType: 'piece',
      measurementMethod: 'weighed_household_standard',
      sourceReference: 'Indian Flatbread Benchmark',
      confidenceLevel: 'moderate',
    });
    pushUnique({
      id: `${food.id}-2pc`,
      foodId: food.id,
      portionName: `2 pieces (${Math.round(pieceG * 2)} g)`,
      sizeVariant: 'large',
      gramOrMlWeight: Math.round(pieceG * 2),
      unitType: 'piece',
      measurementMethod: 'weighed_household_standard',
      sourceReference: 'Indian Flatbread Benchmark',
      confidenceLevel: 'moderate',
    });
  } else if (n.includes('egg,') || n.includes('egg ') || n === 'egg') {
    pushUnique({
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
    pushUnique({
      id: `${food.id}-2egg`,
      foodId: food.id,
      portionName: '2 whole eggs (~100 g)',
      sizeVariant: 'large',
      gramOrMlWeight: 100,
      unitType: 'piece',
      measurementMethod: 'edible_portion_reference',
      sourceReference: 'NIN Egg Reference',
      confidenceLevel: 'high',
    });
  } else if (
    /\bchicken\b|\bfish\b|\bsalmon\b|\bsteak\b|\bpaneer\b|\btofu\b/.test(n) &&
    !/curry|biryani|sub|bowl|tikka/.test(n)
  ) {
    pushUnique({
      id: `${food.id}-palm`,
      foodId: food.id,
      portionName: '1 palm fillet / block (120 g)',
      sizeVariant: 'medium',
      gramOrMlWeight: 120,
      unitType: 'piece',
      measurementMethod: 'hand_portion_benchmark',
      sourceReference: 'Precision Protein Portion Guide',
      confidenceLevel: 'moderate',
    });
    pushUnique({
      id: `${food.id}-large-fillet`,
      foodId: food.id,
      portionName: '1 large serving (180 g)',
      sizeVariant: 'large',
      gramOrMlWeight: 180,
      unitType: 'piece',
      measurementMethod: 'hand_portion_benchmark',
      sourceReference: 'Precision Protein Portion Guide',
      confidenceLevel: 'moderate',
    });
  } else if (/\boil\b|\bghee\b|\bbutter\b|\bhoney\b|\bpeanut butter\b|\bsauce\b|\bhummus\b/.test(n) || g.includes('spices')) {
    pushUnique({
      id: `${food.id}-tsp`,
      foodId: food.id,
      portionName: '1 tsp (~5 g)',
      sizeVariant: 'small',
      gramOrMlWeight: 5,
      unitType: 'tsp',
      measurementMethod: 'kitchen_spoon_measure',
      sourceReference: 'NIN Household Spoon',
      confidenceLevel: 'moderate',
    });
    pushUnique({
      id: `${food.id}-tbsp`,
      foodId: food.id,
      portionName: '1 tbsp (~15 g)',
      sizeVariant: 'medium',
      gramOrMlWeight: 15,
      unitType: 'tbsp',
      measurementMethod: 'kitchen_spoon_measure',
      sourceReference: 'NIN Household Spoon',
      confidenceLevel: 'moderate',
    });
  } else if (cat === 'fruits' || /\bapple\b|\bbanana\b|\borange\b|\bmango\b|\bpear\b/.test(n)) {
    pushUnique({
      id: `${food.id}-fruit-s`,
      foodId: food.id,
      portionName: '1 small piece (~90 g)',
      sizeVariant: 'small',
      gramOrMlWeight: 90,
      unitType: 'piece',
      measurementMethod: 'edible_fruit_standard',
      sourceReference: 'USDA / NIN Fruit Portion',
      confidenceLevel: 'moderate',
    });
    pushUnique({
      id: `${food.id}-fruit-m`,
      foodId: food.id,
      portionName: '1 medium piece (~130 g)',
      sizeVariant: 'medium',
      gramOrMlWeight: 130,
      unitType: 'piece',
      measurementMethod: 'edible_fruit_standard',
      sourceReference: 'USDA / NIN Fruit Portion',
      confidenceLevel: 'moderate',
    });
  } else if (g.includes('nuts') || /\balmond\b|\bcashew\b|\bpeanut\b|\bwalnut\b|\bseeds\b/.test(n)) {
    pushUnique({
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
    pushUnique({
      id: `${food.id}-tbsp`,
      foodId: food.id,
      portionName: '1 tbsp (~12 g)',
      sizeVariant: 'small',
      gramOrMlWeight: 12,
      unitType: 'tbsp',
      measurementMethod: 'kitchen_spoon_measure',
      sourceReference: 'NIN Household Spoon',
      confidenceLevel: 'moderate',
    });
  } else if (
    food.foodState === 'cooked' ||
    /\bcurry\b|\bdal\b|\bpulao\b|\brice\b|\boatmeal\b|\bporridge\b|\bsoup\b|\bbowl\b/.test(n)
  ) {
    pushUnique({
      id: `${food.id}-katori`,
      foodId: food.id,
      portionName: '1 katori / small bowl (150 g)',
      sizeVariant: 'small',
      gramOrMlWeight: 150,
      unitType: 'katori',
      measurementMethod: 'weighed_household_standard',
      sourceReference: 'NIN Standard Household Katori',
      confidenceLevel: 'moderate',
    });
    pushUnique({
      id: `${food.id}-bowl`,
      foodId: food.id,
      portionName: '1 medium bowl / cup (220 g)',
      sizeVariant: 'medium',
      gramOrMlWeight: 220,
      unitType: 'bowl',
      measurementMethod: 'weighed_household_standard',
      sourceReference: 'Standard Bowl Benchmark',
      confidenceLevel: 'moderate',
    });
  } else if (g.includes('grain legumes') || /\blentil\b|\bchana\b/.test(n)) {
    pushUnique({
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
  }

  return result;
}

const PORTION_MEMORY_KEY = 'calothrix_portion_memory_v1';

export interface RememberedPortion {
  grams: number;
  unitLabel: string;
  updatedAt: number;
}

export function getLastUsedPortion(foodId: string): RememberedPortion | null {
  if (typeof window === 'undefined' || !foodId) return null;
  try {
    const raw = localStorage.getItem(PORTION_MEMORY_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, RememberedPortion>;
    const hit = map[foodId];
    if (hit && Number.isFinite(hit.grams) && hit.grams > 0) {
      return hit;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveLastUsedPortion(foodId: string, grams: number, unitLabel: string): void {
  if (typeof window === 'undefined' || !foodId || !Number.isFinite(grams) || grams <= 0) return;
  try {
    const raw = localStorage.getItem(PORTION_MEMORY_KEY);
    const map: Record<string, RememberedPortion> = raw ? (JSON.parse(raw) as Record<string, RememberedPortion>) : {};
    map[foodId] = {
      grams: Math.round(grams * 10) / 10,
      unitLabel,
      updatedAt: Date.now(),
    };
    const entries = Object.entries(map);
    if (entries.length > 180) {
      entries.sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
      localStorage.setItem(PORTION_MEMORY_KEY, JSON.stringify(Object.fromEntries(entries.slice(0, 180))));
    } else {
      localStorage.setItem(PORTION_MEMORY_KEY, JSON.stringify(map));
    }
  } catch {
    // Ignore storage quota errors
  }
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
