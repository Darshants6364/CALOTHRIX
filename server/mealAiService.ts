import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  AnalyzedMealItem,
  CoachAdviceResult,
  CoachSuggestionItem,
  MealAiAnalysisResult,
  MealCategory,
  NutritionLabelOcrResult,
} from '../src/types/index.ts';
import { getReinforcementPromptContext } from './aiTrainingService.ts';

export type AnalyzeMealInputMode = 'photo' | 'voice' | 'text';
export type MealPrepStyle = 'homemade_low_oil' | 'standard' | 'restaurant_rich';

export interface AnalyzeMealRequest {
  mode: AnalyzeMealInputMode;
  mimeType?: string;
  mediaBase64?: string;
  promptText?: string;
  mealHint?: MealCategory;
  prepStyle?: MealPrepStyle;
}

const VALID_MEAL_TYPES: MealCategory[] = [
  'breakfast',
  'lunch',
  'evening_snacks',
  'dinner',
  'other',
];

function getGeminiClient(): GoogleGenAI {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    const err = new Error(
      'GEMINI_API_KEY is not configured. Add GEMINI_API_KEY in Settings > Secrets to enable AI meal photo & voice analysis.'
    );
    (err as Error & { statusCode?: number }).statusCode = 503;
    throw err;
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function normalizeNumber(val: unknown, decimals = 1): number {
  const n = Number(val);
  if (!Number.isFinite(n) || n < 0) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(timeoutMessage);
      (err as Error & { statusCode?: number }).statusCode = 504;
      reject(err);
    }, ms);
    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function extractGeminiErrorDetails(err: unknown): {
  statusCode: number;
  message: string;
  retryable: boolean;
} {
  const anyErr = err as { status?: number; statusCode?: number; message?: string } | undefined;
  const rawMessage = String(anyErr?.message || err || 'Meal analysis failed.');
  let statusCode = Number(anyErr?.statusCode || anyErr?.status || 0);
  let cleanMessage = rawMessage;

  const jsonStart = rawMessage.indexOf('{');
  if (jsonStart !== -1) {
    try {
      const parsed = JSON.parse(rawMessage.slice(jsonStart)) as {
        error?: { code?: number; message?: string; status?: string };
      };
      if (parsed.error?.code) statusCode = parsed.error.code;
      if (parsed.error?.message) cleanMessage = parsed.error.message;
    } catch {
      // Keep raw message
    }
  }

  if (!statusCode) {
    if (/\b503\b|UNAVAILABLE|high demand|overloaded/i.test(rawMessage)) statusCode = 503;
    else if (/\b504\b|timed out|DEADLINE_EXCEEDED/i.test(rawMessage)) statusCode = 504;
    else if (/\b429\b|RESOURCE_EXHAUSTED|quota|rate limit/i.test(rawMessage)) statusCode = 429;
    else if (/\b403\b|PERMISSION_DENIED/i.test(rawMessage)) statusCode = 403;
    else if (/\b400\b|INVALID_ARGUMENT|API_KEY_INVALID/i.test(rawMessage)) statusCode = 400;
    else statusCode = 500;
  }

  const retryable =
    statusCode === 503 ||
    statusCode === 429 ||
    statusCode === 500 ||
    statusCode === 502 ||
    statusCode === 504 ||
    /ECONNRESET|ETIMEDOUT|fetch failed|network|timed out/i.test(rawMessage);

  if (statusCode === 503) {
    cleanMessage =
      'AI nutrition analyzer is temporarily busy (503). Please wait a few seconds and try again.';
  } else if (statusCode === 504) {
    cleanMessage =
      'AI analysis took too long and timed out. Please try again with a smaller/clearer clip or photo.';
  } else if (statusCode === 429) {
    cleanMessage =
      'AI rate limit reached temporarily (429). Please wait a moment and try again.';
  } else if (statusCode === 403 || /API_KEY_INVALID/i.test(rawMessage)) {
    cleanMessage =
      'Gemini API key permission error. Please verify GEMINI_API_KEY in Settings > Secrets.';
  }

  return { statusCode, message: cleanMessage, retryable };
}

export async function analyzeMealWithGemini(
  req: AnalyzeMealRequest
): Promise<MealAiAnalysisResult> {
  const ai = getGeminiClient();

  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [];

  const contextNote = (req.promptText || '').trim();
  const mealHintText = req.mealHint ? `Expected meal slot hint: ${req.mealHint}.` : '';

  if (req.mode === 'photo') {
    const cleanBase64 = (req.mediaBase64 || '').replace(/^data:[^;]+;base64,/, '').trim();
    if (!cleanBase64) {
      const err = new Error('No meal photo data received.');
      (err as Error & { statusCode?: number }).statusCode = 400;
      throw err;
    }

    parts.push({
      inlineData: {
        mimeType: req.mimeType || 'image/jpeg',
        data: cleanBase64,
      },
    });
  } else if (req.mode === 'voice') {
    const cleanBase64 = (req.mediaBase64 || '').replace(/^data:[^;]+;base64,/, '').trim();
    const rawMime = (req.mimeType || 'audio/webm').split(';')[0].trim() || 'audio/webm';

    if (cleanBase64) {
      // Single-pass multimodal audio: transcribe & extract nutrition in 1 fast Gemini call
      parts.push({
        inlineData: {
          mimeType: rawMime,
          data: cleanBase64,
        },
      });
    } else if (!contextNote) {
      const err = new Error('No voice recording or spoken sentence received.');
      (err as Error & { statusCode?: number }).statusCode = 400;
      throw err;
    }
  }

  const prepInstruction =
    req.prepStyle === 'homemade_low_oil'
      ? 'Preparation style: Homemade with minimal oil/ghee (~1 tsp per serving). Keep added cooking fat conservative.'
      : req.prepStyle === 'restaurant_rich'
      ? 'Preparation style: Restaurant / takeout rich preparation (generous oil, butter, ghee, or cream typical of dining out).'
      : 'Preparation style: Standard everyday home or café preparation.';

  const instructionPrompt =
    req.mode === 'photo'
      ? `Analyze the meal photograph. Identify every visible dish, food item, and drink (Indian dishes like roti, dal, sambar, dosa, idli, paneer, rice, curd as well as international foods). Estimate realistic cooked weights in grams and calculate calories, protein (g), carbs (g), fat (g), and fibre (g). ${prepInstruction} ${contextNote ? `User note: "${contextNote}". ` : ''}${mealHintText}`
      : req.mode === 'voice'
      ? `Listen carefully to the voice recording. First transcribe accurately what the user ate into "detectedDescription" (preserving Indian food names and household measures like katori, bowl, roti, piece, glass, spoon), then break down every food or drink with realistic weights in grams and nutritional estimates (calories, protein, carbs, fat, fibre). ${prepInstruction} ${contextNote ? `Optional user note / speech hint: "${contextNote}". ` : ''}${mealHintText}`
      : `Analyze this meal description: "${contextNote}". Set "detectedDescription" to a clean summary of what was described, and break down every food or drink mentioned with realistic serving weights in grams and macronutrient estimates (calories, protein, carbs, fat, fibre). ${prepInstruction} ${mealHintText}`;

  parts.push({ text: instructionPrompt });

  const reinforcementContext = await getReinforcementPromptContext(contextNote || req.mode);
  const systemInstruction = [
    'You are a precision clinical & sports nutritionist. Return realistic food weights and nutrition estimates grounded in USDA FoodData Central and Indian ICMR-NIN IFCT 2017 data. Ensure item calories match (protein*4 + carbs*4 + fat*9) closely. Return strictly valid JSON matching the schema.',
    reinforcementContext,
  ]
    .filter(Boolean)
    .join('\n\n');

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      mealTitle: {
        type: Type.STRING,
        description:
          'Short clear title summarizing the whole meal (e.g., Grilled Chicken Rice Bowl or Masala Dosa & Sambar).',
      },
      detectedDescription: {
        type: Type.STRING,
        description:
          'For voice/text: exact spoken or written meal sentence. For photo: 1-sentence visual summary of what is on the plate.',
      },
      suggestedMealType: {
        type: Type.STRING,
        description: 'One of: breakfast, lunch, evening_snacks, dinner, other',
      },
      confidence: {
        type: Type.STRING,
        description: 'One of: high, moderate, low',
      },
      nutritionTip: {
        type: Type.STRING,
        description: 'One concise practical nutrition observation (max 140 characters).',
      },
      items: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: 'Clear food name' },
            estimatedQuantityDescription: {
              type: Type.STRING,
              description: 'Human portion label e.g. 2 medium rotis, 1 bowl (200g), 150g fillet',
            },
            estimatedGrams: { type: Type.NUMBER },
            calories: { type: Type.NUMBER },
            protein: { type: Type.NUMBER },
            carbs: { type: Type.NUMBER },
            fat: { type: Type.NUMBER },
            fibre: { type: Type.NUMBER },
            notes: { type: Type.STRING },
          },
          required: [
            'name',
            'estimatedQuantityDescription',
            'estimatedGrams',
            'calories',
            'protein',
            'carbs',
            'fat',
            'fibre',
          ],
        },
      },
    },
    required: [
      'mealTitle',
      'detectedDescription',
      'suggestedMealType',
      'confidence',
      'nutritionTip',
      'items',
    ],
  };

  // Use fastest low-latency model first for instant response on all devices,
  // with clean fallback on transient congestion.
  const attempts: Array<{ model: string; thinkingLevel: ThinkingLevel; waitMs: number; timeoutMs: number }> = [
    { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL, waitMs: 0, timeoutMs: 12000 },
    { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW, waitMs: 350, timeoutMs: 14000 },
    { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL, waitMs: 700, timeoutMs: 12000 },
  ];

  let responseText = '';
  let lastError: unknown;

  for (const attempt of attempts) {
    if (attempt.waitMs > 0) {
      await delay(attempt.waitMs);
    }
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model: attempt.model,
          contents: { parts },
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: attempt.thinkingLevel },
            responseMimeType: 'application/json',
            responseSchema,
          },
        }),
        attempt.timeoutMs,
        'AI nutrition request timed out.'
      );
      const txt = (response.text || '').trim();
      if (txt) {
        responseText = txt;
        break;
      }
      lastError = new Error('The AI analyzer returned an empty response. Please try again.');
    } catch (err) {
      lastError = err;
      const details = extractGeminiErrorDetails(err);
      if (!details.retryable) {
        const fatal = new Error(details.message);
        (fatal as Error & { statusCode?: number }).statusCode = details.statusCode;
        throw fatal;
      }
    }
  }

  if (!responseText) {
    const details = extractGeminiErrorDetails(lastError);
    const wrapped = new Error(details.message);
    (wrapped as Error & { statusCode?: number }).statusCode = details.statusCode;
    throw wrapped;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(responseText) as Record<string, unknown>;
  } catch {
    throw new Error('Could not parse structured nutrition breakdown from AI output.');
  }

  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  const items: AnalyzedMealItem[] = rawItems
    .map((item) => {
      const row = (item || {}) as Record<string, unknown>;
      return {
        name: String(row.name || 'Food Item').trim(),
        estimatedQuantityDescription: String(row.estimatedQuantityDescription || '1 serving').trim(),
        estimatedGrams: Math.max(1, normalizeNumber(row.estimatedGrams, 0)),
        calories: Math.round(normalizeNumber(row.calories, 0)),
        protein: normalizeNumber(row.protein, 1),
        carbs: normalizeNumber(row.carbs, 1),
        fat: normalizeNumber(row.fat, 1),
        fibre: normalizeNumber(row.fibre, 1),
        notes: row.notes ? String(row.notes) : undefined,
      };
    })
    .filter((i) => i.name.length > 0);

  if (items.length === 0) {
    throw new Error('No recognizable food items were detected. Try describing the meal or uploading a clearer photo.');
  }

  const totalCalories = Math.round(items.reduce((s, i) => s + i.calories, 0));
  const totalProtein = normalizeNumber(items.reduce((s, i) => s + i.protein, 0), 1);
  const totalCarbs = normalizeNumber(items.reduce((s, i) => s + i.carbs, 0), 1);
  const totalFat = normalizeNumber(items.reduce((s, i) => s + i.fat, 0), 1);
  const totalFibre = normalizeNumber(items.reduce((s, i) => s + i.fibre, 0), 1);

  const rawMealType = String(parsed.suggestedMealType || req.mealHint || 'lunch') as MealCategory;
  const suggestedMealType: MealCategory = VALID_MEAL_TYPES.includes(rawMealType)
    ? rawMealType
    : req.mealHint || 'lunch';

  const rawConfidence = String(parsed.confidence || 'moderate');
  const confidence: MealAiAnalysisResult['confidence'] =
    rawConfidence === 'high' || rawConfidence === 'low' ? rawConfidence : 'moderate';

  return {
    mealTitle: String(parsed.mealTitle || items[0].name).trim(),
    detectedDescription: String(parsed.detectedDescription || contextNote || '').trim(),
    suggestedMealType,
    confidence,
    items,
    totalCalories,
    totalProtein,
    totalCarbs,
    totalFat,
    totalFibre,
    nutritionTip: String(parsed.nutritionTip || '').trim(),
  };
}

export async function readBarcodeFromImageWithGemini(req: {
  mimeType?: string;
  mediaBase64: string;
}): Promise<{ barcode: string | null }> {
  const rawBase64 = (req.mediaBase64 || '').replace(/^data:[^;]+;base64,/, '').trim();
  if (!rawBase64) {
    return { barcode: null };
  }

  const ai = getGeminiClient();
  const mimeType = req.mimeType && req.mimeType.startsWith('image/') ? req.mimeType : 'image/jpeg';

  const response = await withTimeout(
    ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: rawBase64,
            },
          },
          {
            text: 'Read the numeric barcode printed on this food product package (EAN-13, EAN-8, UPC-A, or UPC-E — usually 8 to 14 digits printed directly underneath the vertical black bars). Return ONLY the digits in `barcode`, with no spaces or dashes. If no barcode digits are clearly readable, return an empty string.',
          },
        ],
      },
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            barcode: {
              type: Type.STRING,
              description: 'Digits only (8-14 digits) or empty string if unreadable',
            },
          },
          required: ['barcode'],
        },
      },
    }),
    9000,
    'Barcode AI read timed out.'
  );

  const txt = (response.text || '').trim();
  if (!txt) return { barcode: null };

  try {
    const parsed = JSON.parse(txt) as { barcode?: string };
    const digits = String(parsed.barcode || '').replace(/\D/g, '').trim();
    if (/^\d{6,14}$/.test(digits)) {
      return { barcode: digits };
    }
  } catch {
    const match = txt.match(/\d{8,14}/);
    if (match) return { barcode: match[0] };
  }

  return { barcode: null };
}

export async function parseNutritionLabelWithGemini(req: {
  mimeType?: string;
  mediaBase64: string;
}): Promise<NutritionLabelOcrResult> {
  const rawBase64 = (req.mediaBase64 || '').replace(/^data:[^;]+;base64,/, '').trim();
  if (!rawBase64) {
    const err = new Error('No nutrition label image data received.');
    (err as Error & { statusCode?: number }).statusCode = 400;
    throw err;
  }

  const ai = getGeminiClient();
  const mimeType = req.mimeType && req.mimeType.startsWith('image/') ? req.mimeType : 'image/jpeg';

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: 'Product name if visible, otherwise Packaged Food' },
      brand: { type: Type.STRING, description: 'Brand name if visible, else empty string' },
      servingName: { type: Type.STRING, description: 'Serving label e.g. 1 serving (30g) or 100g' },
      servingWeightGrams: { type: Type.NUMBER, description: 'Numeric weight in grams or ml per serving (default 100 if per 100g)' },
      calories: { type: Type.NUMBER, description: 'Energy in kcal per servingWeightGrams' },
      protein: { type: Type.NUMBER },
      carbs: { type: Type.NUMBER },
      fat: { type: Type.NUMBER },
      fibre: { type: Type.NUMBER },
      sugarG: { type: Type.NUMBER },
      sodiumMg: { type: Type.NUMBER },
      confidence: { type: Type.STRING, description: 'high, moderate, or low' },
    },
    required: [
      'name',
      'servingName',
      'servingWeightGrams',
      'calories',
      'protein',
      'carbs',
      'fat',
      'fibre',
      'confidence',
    ],
  };

  let responseText = '';
  const attempts: Array<{ model: string; thinkingLevel: ThinkingLevel; timeoutMs: number }> = [
    { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL, timeoutMs: 12000 },
    { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW, timeoutMs: 14000 },
  ];
  let lastError: unknown;

  const reinforcementContext = await getReinforcementPromptContext('nutrition label ocr');
  const labelSystemInstruction = [
    'You are a precision food label OCR extractor. Read FSSAI (India), US FDA, and EU Nutrition Facts tables accurately without inventing numbers.',
    reinforcementContext,
  ]
    .filter(Boolean)
    .join('\n\n');

  for (const attempt of attempts) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model: attempt.model,
          contents: {
            parts: [
              { inlineData: { mimeType, data: rawBase64 } },
              {
                text: 'Extract the Nutrition Facts / Nutritional Information table accurately. Convert kJ to kcal (divide by 4.184) if only kJ is shown. Normalize values to match servingWeightGrams (prefer per-serving if clearly stated, otherwise 100g). Keep missing sugar or sodium as 0 if absent.',
              },
            ],
          },
          config: {
            systemInstruction: labelSystemInstruction,
            thinkingConfig: { thinkingLevel: attempt.thinkingLevel },
            responseMimeType: 'application/json',
            responseSchema,
          },
        }),
        attempt.timeoutMs,
        'Nutrition label OCR timed out.'
      );
      const txt = (response.text || '').trim();
      if (txt) {
        responseText = txt;
        break;
      }
    } catch (err) {
      lastError = err;
      const details = extractGeminiErrorDetails(err);
      if (!details.retryable) {
        const fatal = new Error(details.message);
        (fatal as Error & { statusCode?: number }).statusCode = details.statusCode;
        throw fatal;
      }
    }
  }

  if (!responseText) {
    const details = extractGeminiErrorDetails(lastError);
    const wrapped = new Error(details.message);
    (wrapped as Error & { statusCode?: number }).statusCode = details.statusCode;
    throw wrapped;
  }

  const parsed = JSON.parse(responseText) as Record<string, unknown>;
  const confRaw = String(parsed.confidence || 'moderate');
  const confidence: NutritionLabelOcrResult['confidence'] =
    confRaw === 'high' || confRaw === 'low' ? confRaw : 'moderate';

  return {
    name: String(parsed.name || 'Packaged Food').trim() || 'Packaged Food',
    brand: parsed.brand ? String(parsed.brand).trim() || undefined : undefined,
    servingName: String(parsed.servingName || '1 serving').trim(),
    servingWeightGrams: Math.max(1, normalizeNumber(parsed.servingWeightGrams, 1)),
    calories: Math.round(normalizeNumber(parsed.calories, 0)),
    protein: normalizeNumber(parsed.protein, 1),
    carbs: normalizeNumber(parsed.carbs, 1),
    fat: normalizeNumber(parsed.fat, 1),
    fibre: normalizeNumber(parsed.fibre, 1),
    sugarG: parsed.sugarG !== undefined ? normalizeNumber(parsed.sugarG, 1) : undefined,
    sodiumMg: parsed.sodiumMg !== undefined ? Math.round(normalizeNumber(parsed.sodiumMg, 0)) : undefined,
    confidence,
  };
}

function buildDeterministicCoachAdvice(req: {
  prompt: string;
  remainingCalories: number;
  remainingProtein: number;
  remainingCarbs: number;
  remainingFat: number;
  dietaryPreference?: string;
}): CoachAdviceResult {
  const cal = Math.max(0, Math.round(req.remainingCalories));
  const pro = Math.max(0, Math.round(req.remainingProtein));
  const diet = (req.dietaryPreference || 'omnivore').toLowerCase();
  const isVeg = diet.includes('veg') || diet.includes('vegan') || diet.includes('jain');
  const isVegan = diet.includes('vegan');

  const suggestions: CoachSuggestionItem[] = [];
  if (cal < 150) {
    suggestions.push({
      title: 'Mint Chaas / Spiced Buttermilk (250 ml)',
      calories: 55,
      protein: 2.8,
      carbs: 6.2,
      fat: 1.8,
      fibre: 0,
      reason: 'Hydrating and ultra-light when calories are nearly capped.',
    });
  } else if (pro >= 25 && cal <= 360) {
    if (isVegan) {
      suggestions.push({
        title: 'Grilled Herb Tofu + Steamed Edamame',
        calories: 270,
        protein: 28,
        carbs: 14,
        fat: 11,
        fibre: 6.5,
        reason: 'Hits high protein within a compact calorie budget.',
      });
    } else if (isVeg) {
      suggestions.push({
        title: '1 Scoop Whey Isolate + Low-Fat Paneer Cubes (80g)',
        calories: 295,
        protein: 38,
        carbs: 6,
        fat: 12,
        fibre: 0,
        reason: 'Rapidly closes remaining protein gap without carb spillover.',
      });
    } else {
      suggestions.push({
        title: 'Tandoori Chicken Breast (150g) + Cucumber Mint Salad',
        calories: 265,
        protein: 42,
        carbs: 6,
        fat: 7.5,
        fibre: 2.2,
        reason: 'Maximum lean protein per calorie to finish your day.',
      });
    }
  } else {
    suggestions.push(
      isVegan
        ? {
            title: 'Moong Dal Chilla (2 pcs) + Mint Chutney',
            calories: 255,
            protein: 14.5,
            carbs: 34,
            fat: 6.2,
            fibre: 6.0,
            reason: 'Balanced plant protein and high fibre finish.',
          }
        : isVeg
        ? {
            title: 'Paneer Tikka (140g) + 1 Phulka Roti',
            calories: 390,
            protein: 24,
            carbs: 32,
            fat: 18,
            fibre: 4.5,
            reason: 'Satisfying vegetarian meal hitting both protein and steady energy.',
          }
        : {
            title: '3 Boiled Eggs + 1 Whole Wheat Toast',
            calories: 315,
            protein: 22.5,
            carbs: 18,
            fat: 16.5,
            fibre: 2.8,
            reason: 'Quick 3-minute finish with bioavailable protein.',
          }
    );
  }

  if (cal >= 350 && !isVeg) {
    suggestions.push({
      title: 'Chicken Tikka (160g) + 1 Katori Dal',
      calories: 410,
      protein: 44,
      carbs: 26,
      fat: 13,
      fibre: 5.2,
      reason: 'High-satiety protein + legume fibre combo.',
    });
  } else if (cal >= 220) {
    suggestions.push({
      title: 'Greek Yogurt / Hung Curd Bowl (180g) + Blueberries',
      calories: 195,
      protein: 17.5,
      carbs: 19,
      fat: 4.5,
      fibre: 2.5,
      reason: 'Gut-friendly casein protein ideal before sleep.',
    });
  }

  return {
    provider: 'deterministic',
    reply:
      cal > 0
        ? `You have ${cal} kcal and ${pro}g protein left today. Focus on lean protein first (${Math.round(req.remainingCarbs)}g C / ${Math.round(req.remainingFat)}g F remaining).`
        : `You are at your daily calorie target with ${pro}g protein remaining — stick to ultra-lean protein or light hydration.`,
    suggestions,
  };
}

export async function coachChatWithGemini(req: {
  prompt: string;
  remainingCalories: number;
  remainingProtein: number;
  remainingCarbs: number;
  remainingFat: number;
  goalCalories: number;
  goalProtein: number;
  dietaryPreference?: string;
  restrictions?: string[];
}): Promise<CoachAdviceResult> {
  const hasKey = Boolean((process.env.GEMINI_API_KEY || '').trim());
  if (!hasKey) {
    return buildDeterministicCoachAdvice(req);
  }

  try {
    const ai = getGeminiClient();
    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        reply: { type: Type.STRING, description: 'Concise practical 2-3 sentence coaching response.' },
        suggestions: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              calories: { type: Type.NUMBER },
              protein: { type: Type.NUMBER },
              carbs: { type: Type.NUMBER },
              fat: { type: Type.NUMBER },
              fibre: { type: Type.NUMBER },
              reason: { type: Type.STRING },
            },
            required: ['title', 'calories', 'protein', 'carbs', 'fat', 'fibre', 'reason'],
          },
        },
      },
      required: ['reply', 'suggestions'],
    };

    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: {
          parts: [
            {
              text: `User question: "${req.prompt}". Daily goals: ${req.goalCalories} kcal, ${req.goalProtein}g protein. Remaining today: ${Math.round(req.remainingCalories)} kcal, ${Math.round(req.remainingProtein)}g protein, ${Math.round(req.remainingCarbs)}g carbs, ${Math.round(req.remainingFat)}g fat. Diet: ${req.dietaryPreference || 'omnivore'}. Restrictions: ${(req.restrictions || []).join(', ') || 'none'}. Give direct, realistic Indian + global meal/snack suggestions with exact macro estimates that respect remaining budget.`,
            },
          ],
        },
        config: {
          systemInstruction:
            'You are Calothrix Nutrition Coach. Give concise, actionable advice grounded in realistic portions and user dietary preferences. Suggest 2-3 loggable food ideas.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          responseMimeType: 'application/json',
          responseSchema,
        },
      }),
      10000,
      'Coach request timed out.'
    );

    const txt = (response.text || '').trim();
    if (!txt) return buildDeterministicCoachAdvice(req);
    const parsed = JSON.parse(txt) as Record<string, unknown>;
    const rawSugs = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
    const suggestions: CoachSuggestionItem[] = rawSugs.map((s) => {
      const row = (s || {}) as Record<string, unknown>;
      return {
        title: String(row.title || 'Balanced Snack').trim(),
        calories: Math.round(normalizeNumber(row.calories, 0)),
        protein: normalizeNumber(row.protein, 1),
        carbs: normalizeNumber(row.carbs, 1),
        fat: normalizeNumber(row.fat, 1),
        fibre: normalizeNumber(row.fibre, 1),
        reason: String(row.reason || '').trim(),
      };
    });

    return {
      provider: 'gemini',
      reply: String(parsed.reply || '').trim() || buildDeterministicCoachAdvice(req).reply,
      suggestions: suggestions.length > 0 ? suggestions : buildDeterministicCoachAdvice(req).suggestions,
    };
  } catch {
    return buildDeterministicCoachAdvice(req);
  }
}
