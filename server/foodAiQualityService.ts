import { GoogleGenAI, Type } from '@google/genai';
import type { FoodItem, RegionalSearchSuggestion } from '../src/types/index.ts';
import { isFoodNutritionallyUsable } from '../src/utils/nutritionUtils.ts';
import {
  callGroqChatJson,
  GROQ_TEXT_MODELS,
  isGroqConfigured,
  parseLooseJsonObject,
} from './groqClient.ts';

const GEMINI_FAST_MODEL = 'gemini-3.1-flash-lite';
const GEMINI_HEADERS = { 'User-Agent': 'aistudio-build' };

let geminiFallbackSearchCalls = 0;
const regionalQueryCache = new Map<string, RegionalSearchSuggestion | null>();

export function getGeminiFoodSearchCallCount(): number {
  return geminiFallbackSearchCalls;
}

export function resetGeminiFoodSearchCallCount(): void {
  geminiFallbackSearchCalls = 0;
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: GEMINI_HEADERS },
  });
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Intelligent Regional / Transliteration Search Fallback Helper
 *
 * IMPORTANT: Called ONLY when normal database search returns 0 matches.
 * Identifies the intended food and maps it strictly to EXISTING database records.
 * Never fabricates fake foods, never mutates the database, and caches results.
 */
export async function resolveRegionalFoodQueryWithGemini(
  rawQuery: string,
  searchableCatalog: FoodItem[]
): Promise<RegionalSearchSuggestion | null> {
  const q = rawQuery.trim();
  if (q.length < 2 || q.length > 80) return null;

  const cacheKey = q.toLowerCase();
  if (regionalQueryCache.has(cacheKey)) {
    return regionalQueryCache.get(cacheKey) ?? null;
  }

  const groqActive = isGroqConfigured();
  const ai = getGeminiClient();
  if (!groqActive && !ai) return null;

  // Compact list of canonical candidate names + IDs from existing verified catalog
  const sampleCandidates = searchableCatalog
    .filter((f) => isFoodNutritionallyUsable(f))
    .slice(0, 180)
    .map((f) => `${f.id}|${f.name}`)
    .join('\n');

  const promptText = `A user searched an Indian nutrition database for: "${q}".
Normal database search found 0 direct matches.
Identify the intended real food (handling Kannada, Hindi, Tamil, Telugu, Marathi, regional names, transliterations, or spelling errors) and suggest ONLY matching food IDs from the provided existing catalog list below. If none genuinely match, return empty matchedFoodIds. Never invent IDs.

Existing Catalog (id|name):
${sampleCandidates}`;

  try {
    geminiFallbackSearchCalls++;
    let parsed: Partial<RegionalSearchSuggestion> | null = null;

    if (groqActive) {
      try {
        const raw = await callGroqChatJson({
          models: GROQ_TEXT_MODELS,
          systemInstruction:
            'Return strictly valid JSON: {"detectedFood":"string","canonicalEnglishName":"string","matchedFoodIds":["id1"],"reasoning":"string"}.',
          userContent: promptText,
          timeoutMs: 10000,
          temperature: 0.1,
        });
        parsed = parseLooseJsonObject(raw) as Partial<RegionalSearchSuggestion>;
      } catch (err) {
        if (!ai) throw err;
      }
    }

    if (!parsed && ai) {
      const response = await ai.models.generateContent({
        model: GEMINI_FAST_MODEL,
        contents: promptText,
        config: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedFood: { type: Type.STRING },
              canonicalEnglishName: { type: Type.STRING },
              matchedFoodIds: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              reasoning: { type: Type.STRING },
            },
            required: ['detectedFood', 'canonicalEnglishName', 'matchedFoodIds'],
          },
        },
      });

      const text = response.text;
      if (!text) {
        regionalQueryCache.set(cacheKey, null);
        return null;
      }
      parsed = JSON.parse(text) as Partial<RegionalSearchSuggestion>;
    }

    if (!parsed) {
      regionalQueryCache.set(cacheKey, null);
      return null;
    }
    const validIdSet = new Set(searchableCatalog.map((f) => f.id));
    const validMatchedIds = (parsed.matchedFoodIds || [])
      .filter((id) => typeof id === 'string' && validIdSet.has(id))
      .slice(0, 8);

    const suggestion: RegionalSearchSuggestion | null =
      parsed.canonicalEnglishName && validMatchedIds.length > 0
        ? {
            detectedFood: parsed.detectedFood || q,
            canonicalEnglishName: parsed.canonicalEnglishName,
            matchedFoodIds: validMatchedIds,
            reasoning: parsed.reasoning,
          }
        : null;

    if (regionalQueryCache.size > 200) {
      const first = regionalQueryCache.keys().next().value;
      if (first) regionalQueryCache.delete(first);
    }
    regionalQueryCache.set(cacheKey, suggestion);
    return suggestion;
  } catch (err) {
    console.warn('[FoodAiQuality] Regional query fallback failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export interface AiCompletionResult {
  foodId: string;
  status: 'updated' | 'skipped_already_verified' | 'kept_pending_insufficient_data' | 'error';
  updatedFood?: FoodItem;
  reason: string;
}

/**
 * Controlled Admin / Batch AI Nutritional Completion Workflow
 *
 * Strictly enforces:
 * - Never overwrites already-verified foods (`qualityStatus === 'verified'` with complete core 5 macros).
 * - Preserves `originalSourceValues`, `calculationMethod`, `sourceReferenceFoods`, `confidenceScore`.
 * - Keeps items with insufficient ingredient/preparation detail in `pending_validation` instead of guessing wildly.
 */
export async function completePendingFoodWithGemini(
  food: FoodItem,
  referenceCatalog: FoodItem[]
): Promise<AiCompletionResult> {
  // Guard 1: NEVER overwrite verified, nutritionally complete nutrition values
  if (food.qualityStatus === 'verified' && isFoodNutritionallyUsable(food)) {
    return {
      foodId: food.id,
      status: 'skipped_already_verified',
      reason: 'Record is already verified with complete core macros; preserved without modification.',
    };
  }

  // Guard 2: Reject generic/placeholder names lacking sufficient culinary context
  const cleanName = food.name.trim();
  if (cleanName.length < 3 || /^(test|sample|unknown|misc|other|item\s*\d*)$/i.test(cleanName)) {
    return {
      foodId: food.id,
      status: 'kept_pending_insufficient_data',
      reason: 'Food name is too generic or placeholder; kept in pending_validation.',
    };
  }

  const groqActive = isGroqConfigured();
  const ai = getGeminiClient();
  if (!groqActive && !ai) {
    return {
      foodId: food.id,
      status: 'error',
      reason: 'Server GROQ_API_KEY or GEMINI_API_KEY is not configured.',
    };
  }

  const missingFields = food.missingFields || [];
  const referenceHints = referenceCatalog
    .filter((f) => isFoodNutritionallyUsable(f) && (f.foodFamilyId === food.foodFamilyId || f.category === food.category))
    .slice(0, 20)
    .map(
      (f) =>
        `${f.id}: ${f.name} (${f.calories} kcal, P ${f.protein}g, C ${f.carbs}g, F ${f.fat}g, Fib ${f.fibre}g per ${f.servingWeightGrams}g)`
    )
    .join('\n');

  const completionPrompt = `You are a clinical nutritionist & Indian food composition specialist.
Complete ONLY the missing per-100g core macronutrients (calories kcal, protein g, carbs g, fat g, fibre g) for this food record.
Rules:
1. Do NOT invent values if the food is ambiguous or lacks sufficient detail — set sufficientConfidence=false in that case.
2. Preserve known non-missing values from the source record.
3. For animal products, dairy, oils, and pure sugars, dietary fibre is genuinely 0g.
4. Provide explicit calculationMethod and reference foods used.

Food Record:
- Name: ${food.name}
- State: ${food.foodState || 'unspecified'}
- Category: ${food.category}
- Source: ${food.sourceName || 'Unknown'}
- Ingredients: ${food.ingredientsText || 'Not provided'}
- Existing values (per ${food.servingWeightGrams}g): kcal=${food.calories}, protein=${food.protein}, carbs=${food.carbs}, fat=${food.fat}, fibre=${food.fibre}
- Missing fields: ${missingFields.join(', ') || 'none explicitly flagged'}

Nearby Verified Reference Foods:
${referenceHints}`;

  interface PendingFoodCompletionPayload {
    sufficientConfidence: boolean;
    confidenceScore: number;
    qualityStatus?: string;
    caloriesPer100g: number;
    proteinPer100g: number;
    carbsPer100g: number;
    fatPer100g: number;
    fibrePer100g: number;
    calculationMethod: string;
    sourceReferenceFoods?: string[];
    reasoning?: string;
  }

  try {
    let parsed: PendingFoodCompletionPayload | null = null;

    if (groqActive) {
      try {
        const raw = await callGroqChatJson({
          models: GROQ_TEXT_MODELS,
          systemInstruction:
            'Return strictly valid JSON: {"sufficientConfidence":boolean,"confidenceScore":number,"qualityStatus":"string","caloriesPer100g":number,"proteinPer100g":number,"carbsPer100g":number,"fatPer100g":number,"fibrePer100g":number,"calculationMethod":"string","sourceReferenceFoods":["string"],"reasoning":"string"}.',
          userContent: completionPrompt,
          timeoutMs: 14000,
          temperature: 0.1,
        });
        parsed = parseLooseJsonObject(raw) as unknown as PendingFoodCompletionPayload;
      } catch (err) {
        if (!ai) throw err;
      }
    }

    if (!parsed && ai) {
      const response = await ai.models.generateContent({
        model: GEMINI_FAST_MODEL,
        contents: completionPrompt,
        config: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              sufficientConfidence: { type: Type.BOOLEAN },
              confidenceScore: { type: Type.NUMBER },
              qualityStatus: { type: Type.STRING },
              caloriesPer100g: { type: Type.NUMBER },
              proteinPer100g: { type: Type.NUMBER },
              carbsPer100g: { type: Type.NUMBER },
              fatPer100g: { type: Type.NUMBER },
              fibrePer100g: { type: Type.NUMBER },
              calculationMethod: { type: Type.STRING },
              sourceReferenceFoods: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              reasoning: { type: Type.STRING },
            },
            required: [
              'sufficientConfidence',
              'confidenceScore',
              'caloriesPer100g',
              'proteinPer100g',
              'carbsPer100g',
              'fatPer100g',
              'fibrePer100g',
              'calculationMethod',
            ],
          },
        },
      });

      const text = response.text;
      if (!text) {
        return {
          foodId: food.id,
          status: 'kept_pending_insufficient_data',
          reason: 'Empty response from AI; kept in pending_validation.',
        };
      }
      parsed = JSON.parse(text) as PendingFoodCompletionPayload;
    }

    if (!parsed) {
      return {
        foodId: food.id,
        status: 'kept_pending_insufficient_data',
        reason: 'Empty response from AI; kept in pending_validation.',
      };
    }

    if (!parsed.sufficientConfidence || parsed.confidenceScore < 0.72) {
      return {
        foodId: food.id,
        status: 'kept_pending_insufficient_data',
        reason: parsed.reasoning || 'Insufficient confidence (<0.72); kept in pending_validation.',
      };
    }

    // Physiological sanity validation
    const { caloriesPer100g, proteinPer100g, carbsPer100g, fatPer100g, fibrePer100g } = parsed;
    if (
      caloriesPer100g < 0 ||
      caloriesPer100g > 920 ||
      proteinPer100g < 0 ||
      proteinPer100g > 100 ||
      carbsPer100g < 0 ||
      carbsPer100g > 100 ||
      fatPer100g < 0 ||
      fatPer100g > 100 ||
      fibrePer100g < 0 ||
      fibrePer100g > 100 ||
      proteinPer100g + carbsPer100g + fatPer100g > 105
    ) {
      return {
        foodId: food.id,
        status: 'kept_pending_insufficient_data',
        reason: 'AI estimate failed physiological range check; kept in pending_validation.',
      };
    }

    const missingSet = new Set(missingFields);
    const updatedFood: FoodItem = {
      ...food,
      servingName: '100 g',
      servingWeightGrams: 100,
      measurementBasis: 'per_100g',
      calories: missingSet.has('calories') || food.calories === 0 ? round1(caloriesPer100g) : food.calories,
      protein: missingSet.has('protein') ? round1(proteinPer100g) : food.protein,
      carbs: missingSet.has('carbs') ? round1(carbsPer100g) : food.carbs,
      fat: missingSet.has('fat') ? round1(fatPer100g) : food.fat,
      fibre: missingSet.has('fibre') ? round1(fibrePer100g) : food.fibre,
      missingFields: undefined,
      qualityStatus: parsed.qualityStatus === 'calculated' ? 'calculated' : 'estimated',
      verificationStatus: 'estimated',
      isSearchable: true,
      calculationMethod: parsed.calculationMethod,
      sourceReferenceFoods: parsed.sourceReferenceFoods || [],
      confidenceScore: Math.min(0.95, Math.max(0.72, parsed.confidenceScore)),
      originalSourceValues: food.originalSourceValues || {
        calories: missingSet.has('calories') ? null : food.calories,
        protein: missingSet.has('protein') ? null : food.protein,
        carbs: missingSet.has('carbs') ? null : food.carbs,
        fat: missingSet.has('fat') ? null : food.fat,
        fibre: missingSet.has('fibre') ? null : food.fibre,
      },
      lastUpdated: new Date().toISOString(),
    };

    return {
      foodId: food.id,
      status: 'updated',
      updatedFood,
      reason: parsed.calculationMethod,
    };
  } catch (err) {
    return {
      foodId: food.id,
      status: 'error',
      reason: err instanceof Error ? err.message : 'Gemini completion error',
    };
  }
}

export interface DiscoveredFoodProposal {
  name: string;
  foodFamilyId: string;
  resultGroup: 'basic_ingredient' | 'cooked_food' | 'prepared_dish';
  aliases: string[];
  regionalNames: string[];
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fibrePer100g: number;
  calculationMethod: string;
  alreadyExistsAsId?: string;
}

/**
 * Controlled Admin Workflow: Discover missing regional Indian foods & aliases
 * Strictly checks deduplication against existing catalog before returning proposals.
 */
export async function discoverRegionalFoodsWithGemini(
  regionOrTopic: string,
  existingCatalog: FoodItem[]
): Promise<DiscoveredFoodProposal[]> {
  const ai = getGeminiClient();
  if (!ai) return [];

  const existingNormalized = new Map<string, string>();
  for (const f of existingCatalog) {
    existingNormalized.set(f.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(), f.id);
    for (const a of f.aliases || []) {
      existingNormalized.set(a.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(), f.id);
    }
  }

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_FAST_MODEL,
      contents: `Propose up to 6 authentic, commonly eaten Indian / regional foods for topic: "${regionOrTopic}".
Focus ONLY on per-100g: calories (kcal), protein (g), carbs (g), fat (g), fibre (g).
Include English name, foodFamilyId (paneer|rice|chicken|egg|dal|milk|curd|wheat_roti|ragi|millet_rotti|dosa|idli|sambar_rasam|poha_upma|vada_snacks|fish_seafood|vegetables|sweets_desserts|beverages), resultGroup (basic_ingredient|cooked_food|prepared_dish), aliases, regionalNames, and ingredient-based calculationMethod.`,
      config: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            proposals: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  foodFamilyId: { type: Type.STRING },
                  resultGroup: { type: Type.STRING },
                  aliases: { type: Type.ARRAY, items: { type: Type.STRING } },
                  regionalNames: { type: Type.ARRAY, items: { type: Type.STRING } },
                  caloriesPer100g: { type: Type.NUMBER },
                  proteinPer100g: { type: Type.NUMBER },
                  carbsPer100g: { type: Type.NUMBER },
                  fatPer100g: { type: Type.NUMBER },
                  fibrePer100g: { type: Type.NUMBER },
                  calculationMethod: { type: Type.STRING },
                },
                required: [
                  'name',
                  'foodFamilyId',
                  'resultGroup',
                  'caloriesPer100g',
                  'proteinPer100g',
                  'carbsPer100g',
                  'fatPer100g',
                  'fibrePer100g',
                  'calculationMethod',
                ],
              },
            },
          },
          required: ['proposals'],
        },
      },
    });

    const text = response.text;
    if (!text) return [];
    const parsed = JSON.parse(text) as { proposals?: DiscoveredFoodProposal[] };
    return (parsed.proposals || []).map((p) => {
      const norm = p.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      let existingId = existingNormalized.get(norm);
      if (!existingId) {
        for (const al of p.aliases || []) {
          const hit = existingNormalized.get(al.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
          if (hit) {
            existingId = hit;
            break;
          }
        }
      }
      return {
        ...p,
        alreadyExistsAsId: existingId,
      };
    });
  } catch (err) {
    console.warn('[FoodAiQuality] Discovery failed:', err instanceof Error ? err.message : err);
    return [];
  }
}
