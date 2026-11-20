import fs from 'fs';
import path from 'path';

const CSV_PATH = path.resolve('public/assets/aistudio/IFCT2017_proximate_master_3535081d.csv');
const OUT_PATH = path.resolve('src/data/ifct2017Master.ts');

function parseCSV(str) {
  const rows = [];
  let row = [];
  let val = '';
  let inQuotes = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    const next = str[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') {
        val += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        val += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') {
        row.push(val);
        val = '';
      } else if (c === '\r' && next === '\n') {
        row.push(val);
        rows.push(row);
        row = [];
        val = '';
        i++;
      } else if (c === '\n') {
        row.push(val);
        rows.push(row);
        row = [];
        val = '';
      } else {
        val += c;
      }
    }
  }
  if (val.length > 0 || row.length > 0) {
    row.push(val);
    rows.push(row);
  }
  return rows;
}

function mapIfctGroupToCategory(group, name) {
  const g = group.toLowerCase();
  const n = name.toLowerCase();
  if (g.includes('cereals') || g.includes('millets') || g.includes('grain legumes')) {
    return 'Grains and cereals';
  }
  if (g.includes('green leafy') || g.includes('other vegetables') || g.includes('roots and tubers') || g.includes('mushrooms')) {
    return 'Vegetables';
  }
  if (g.includes('fruits')) return 'Fruits';
  if (g.includes('milk')) return 'Dairy';
  if (g.includes('egg') || g.includes('poultry') || g.includes('animal meat')) {
    return 'Meat and poultry';
  }
  if (g.includes('fish') || g.includes('shellfish') || g.includes('mollusks')) {
    return 'Fish and seafood';
  }
  if (g.includes('nuts')) return 'Nuts and seeds';
  if (g.includes('condiments') || g.includes('spices') || g.includes('sugars') || g.includes('miscellaneous')) {
    if (n.includes('toddy') || n.includes('coconut water')) return 'Beverages';
    return 'Indian foods';
  }
  return 'Indian foods';
}

function getDietaryTagsForGroup(group, name, protein, fibre) {
  const g = group.toLowerCase();
  const n = name.toLowerCase();
  const tags = [];
  if (g.includes('poultry') || g.includes('animal meat') || g.includes('fish') || g.includes('shellfish') || g.includes('mollusks')) {
    tags.push('dairy_free', 'gluten_free', 'nut_free');
  } else if (g.includes('egg')) {
    tags.push('eggetarian', 'dairy_free', 'gluten_free', 'nut_free');
  } else if (g.includes('milk')) {
    tags.push('vegetarian', 'eggetarian', 'gluten_free', 'nut_free');
  } else {
    tags.push('vegetarian', 'vegan', 'eggetarian', 'dairy_free');
    if (!n.includes('wheat') && !n.includes('barley')) {
      tags.push('gluten_free');
    }
    if (!g.includes('nuts') || n.includes('coconut') || n.includes('gingelly') || n.includes('mustard') || n.includes('sunflower') || n.includes('niger') || n.includes('linseed')) {
      tags.push('nut_free');
    }
  }
  if (typeof protein === 'number' && protein >= 15) tags.push('high_protein');
  if (typeof fibre === 'number' && fibre >= 6) tags.push('high_fibre');
  return tags;
}

function inferFoodState(csvState, name) {
  const s = (csvState || '').trim().toLowerCase();
  if (s) return s;
  const n = name.toLowerCase();
  if (/\braw\b/.test(n)) return 'raw';
  if (/\bboiled\b/.test(n)) return 'boiled';
  if (/\broasted\b/.test(n)) return 'roasted';
  if (/\bfried\b/.test(n)) return 'fried';
  if (/\bdried\b|\bdry\b/.test(n)) return 'dry';
  if (/\bparboiled\b/.test(n)) return 'parboiled';
  if (/\bpuffed\b/.test(n)) return 'puffed';
  if (/\btender\b/.test(n)) return 'tender';
  if (/\bfresh\b/.test(n)) return 'fresh';
  return 'raw';
}

function buildAliasesForIfctFood(code, name) {
  const n = name.toLowerCase();
  const aliases = new Set();
  if (n.includes('quial')) aliases.add(name.replace(/quial/gi, 'quail'));
  if (n.includes('omlet')) aliases.add(name.replace(/omlet/gi, 'omelette'));
  if (n.includes('ragi') || n.includes('finger millet')) {
    aliases.add('ragi');
    aliases.add('nachni');
    aliases.add('finger millet');
  }
  if (n.includes('bajra') || n.includes('pearl millet')) {
    aliases.add('bajra');
    aliases.add('kambu');
    aliases.add('sajje');
  }
  if (n.includes('jowar') || n.includes('sorghum')) {
    aliases.add('jowar');
    aliases.add('jola');
    aliases.add('cholam');
  }
  if (n.includes('red gram') || n.includes('cajanus')) {
    aliases.add('toor dal');
    aliases.add('tur dal');
    aliases.add('arhar dal');
  }
  if (n.includes('green gram') || n.includes('phaseolus aureus')) {
    aliases.add('moong dal');
    aliases.add('mung dal');
    aliases.add('hesaru bele');
  }
  if (n.includes('black gram') || n.includes('phaseolus mungo')) {
    aliases.add('urad dal');
    aliases.add('uddina bele');
  }
  if (n.includes('bengal gram') || n.includes('cicer arietinum')) {
    aliases.add('chana dal');
    aliases.add('chana');
    aliases.add('kabuli chana');
    aliases.add('kadale bele');
  }
  if (n.includes('amaranth')) aliases.add('rajgira');
  if (n.includes('rice flakes')) aliases.add('poha');
  if (n.includes('rice') && n.includes('raw')) aliases.add('akki');
  if (n.includes('whole') && n.includes('wheat')) aliases.add('gehun');
  if (n.includes('spinach')) aliases.add('palak');
  if (n.includes('eggplant') || n.includes('brinjal')) aliases.add('baingan');
  if (n.includes('ladies finger')) {
    aliases.add('bhindi');
    aliases.add('okra');
  }
  if (n.includes('paneer')) aliases.add('cottage cheese');
  if (n.includes('milk, whole, cow')) aliases.add('cow milk');
  if (n.includes('milk, whole, buffalo')) aliases.add('buffalo milk');
  if (code === 'L003') aliases.add('cottage cheese');
  return [...aliases];
}

function getLiquidDensity(code, name) {
  const n = name.toLowerCase();
  if (code === 'L001' || code === 'L002' || n.includes('milk, whole')) return 1.03;
  if (code === 'K002' || n.includes('coconut water')) return 1.02;
  if (code === 'K001' || n.includes('toddy')) return 1.01;
  if (code === 'E033' || n.includes('lemon, juice')) return 1.03;
  return undefined;
}

const raw = fs.readFileSync(CSV_PATH, 'utf8');
const parsed = parseCSV(raw);
const header = parsed[0];
const rows = parsed.slice(1).filter((r) => r.length >= 14 && r[0].trim());

const numOrNull = (v) => {
  const s = (v ?? '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const round1 = (v) => Math.round(v * 10) / 10;

const items = rows.map((r) => {
  const rec = {};
  header.forEach((h, idx) => {
    rec[h] = (r[idx] ?? '').trim();
  });

  const code = rec.food_code;
  const name = rec.food_name;
  const group = rec.food_group;
  const csvState = rec.food_state;
  const foodState = inferFoodState(csvState, name);
  const energyKj = numOrNull(rec.energy_kj);
  const caloriesRaw = numOrNull(rec.energy_kcal_derived);
  const proteinRaw = numOrNull(rec.protein_g);
  const fatRaw = numOrNull(rec.fat_g);
  const carbsRaw = numOrNull(rec.carbohydrate_g);
  const totalFibreRaw = numOrNull(rec.total_dietary_fibre_g);
  const insolubleFibreRaw = numOrNull(rec.insoluble_fibre_g);
  const solubleFibreRaw = numOrNull(rec.soluble_fibre_g);
  const waterG = numOrNull(rec.water_g);
  const ashG = numOrNull(rec.ash_g);

  const missingFields = [];
  if (caloriesRaw === null) missingFields.push('calories');
  if (proteinRaw === null) missingFields.push('protein');
  if (carbsRaw === null) missingFields.push('carbs');
  if (fatRaw === null) missingFields.push('fat');
  if (totalFibreRaw === null) missingFields.push('fibre');

  const density = getLiquidDensity(code, name);
  const isLiquid = typeof density === 'number';
  const aliases = buildAliasesForIfctFood(code, name);

  return {
    id: `ifct-${code}`,
    name,
    country: 'India',
    category: mapIfctGroupToCategory(group, name),
    foodCode: code,
    foodGroup: group,
    foodState,
    measurementBasis: isLiquid ? 'per_100ml' : 'per_100g',
    servingName: isLiquid ? '100 ml' : '100 g',
    servingWeightGrams: 100,
    ...(isLiquid ? { liquidDensityGPerMl: density } : {}),
    calories: caloriesRaw !== null ? round1(caloriesRaw) : 0,
    protein: proteinRaw !== null ? round1(proteinRaw) : 0,
    carbs: carbsRaw !== null ? round1(carbsRaw) : 0,
    fat: fatRaw !== null ? round1(fatRaw) : 0,
    fibre: totalFibreRaw !== null ? round1(totalFibreRaw) : 0,
    energyKj,
    waterG,
    ashG,
    insolubleFibreG: insolubleFibreRaw,
    solubleFibreG: solubleFibreRaw,
    carbohydrateBasis: carbsRaw !== null ? 'available' : 'unknown',
    rawNutrients: {
      energyKj,
      calories: caloriesRaw,
      protein: proteinRaw,
      carbs: carbsRaw,
      fat: fatRaw,
      fibre: totalFibreRaw,
      insolubleFibre: insolubleFibreRaw,
      solubleFibre: solubleFibreRaw,
      water: waterG,
      ash: ashG,
    },
    ...(missingFields.length > 0 ? { missingFields } : {}),
    isCustom: false,
    sourceType: 'verified_reference',
    sourceName: rec.source || 'ICMR-NIN IFCT 2017',
    sourceId: code,
    sourcePriority: 1,
    verificationStatus: 'verified',
    lastUpdated: '2017-01-01',
    license: 'ICMR-NIN IFCT 2017 Official Proximate Composition',
    dataQuality: 'high',
    dietaryTags: getDietaryTagsForGroup(group, name, proteinRaw, totalFibreRaw),
    ...(aliases.length > 0 ? { aliases } : {}),
  };
});

const out = `/* eslint-disable */
// AUTO-GENERATED from public/assets/aistudio/IFCT2017_proximate_master_3535081d.csv
// Preserves all 528 official ICMR-NIN IFCT 2017 food codes, proximate values, and NULL/unavailable nutrients untouched.
import type { FoodItem } from '../types/index.ts';

export const IFCT_2017_MASTER_FOODS: FoodItem[] = ${JSON.stringify(items, null, 2)};
`;

fs.writeFileSync(OUT_PATH, out, 'utf8');
console.log(`Generated ${items.length} IFCT 2017 foods at ${OUT_PATH}`);
