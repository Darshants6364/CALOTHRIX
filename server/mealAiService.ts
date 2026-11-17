import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { AnalyzedMealItem, MealAiAnalysisResult, MealCategory } from '../src/types/index.ts';

export type AnalyzeMealInputMode = 'photo' | 'voice' | 'text';

export interface AnalyzeMealRequest {
  mode: AnalyzeMealInputMode;
  mimeType?: string;
  mediaBase64?: string;
  promptText?: string;
  mealHint?: MealCategory;
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

async function transcribeVoiceAudio(
  ai: GoogleGenAI,
  mimeType: string,
  base64Data: string
): Promise<string | null> {
  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
            {
              text: 'Transcribe the spoken foods, quantities, and meal description cleanly into a single plain English sentence. Preserve Indian food names and household measures (e.g. roti, dosa, idli, katori, bowl, cup, grams). Return only the transcript text.',
            },
          ],
        },
      }),
      10000,
      'Audio transcription timed out.'
    );
    const text = (response.text || '').trim();
    return text.length >= 2 ? text : null;
  } catch {
    return null;
  }
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
  let resolvedTranscript = '';

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
      // Dedicated fast transcription first (gemini-3.5-transcribe)
      const transcribed = await transcribeVoiceAudio(ai, rawMime, cleanBase64);
      if (transcribed) {
        resolvedTranscript = transcribed;
      } else {
        // Fallback: pass audio directly to multimodal model
        parts.push({
          inlineData: {
            mimeType: rawMime,
            data: cleanBase64,
          },
        });
      }
    } else if (!contextNote) {
      const err = new Error('No voice recording or spoken sentence received.');
      (err as Error & { statusCode?: number }).statusCode = 400;
      throw err;
    }
  }

  const instructionPrompt =
    req.mode === 'photo'
      ? `Analyze the meal photograph. Identify every visible dish, food item, and drink (Indian dishes like roti, dal, sambar, dosa, idli, paneer, rice, curd as well as international foods). Estimate realistic cooked weights in grams and calculate calories, protein (g), carbs (g), fat (g), and fibre (g). ${contextNote ? `User note: "${contextNote}". ` : ''}${mealHintText}`
      : req.mode === 'voice'
      ? resolvedTranscript
        ? `The user spoke this meal description: "${resolvedTranscript}".${contextNote ? ` Extra user note: "${contextNote}".` : ''} Set "detectedDescription" to "${resolvedTranscript}". Break down every food or drink mentioned with realistic serving weights in grams and nutrition estimates (calories, protein, carbs, fat, fibre). Understand Indian household portions (katori, bowl, roti, piece, glass, spoon). ${mealHintText}`
        : `Listen carefully to the voice recording. First transcribe accurately what the user ate into "detectedDescription", then break down every food or drink with realistic weights in grams and nutritional estimates (calories, protein, carbs, fat, fibre). Understand Indian household portions (katori, bowl, roti, piece, glass, spoon). ${contextNote ? `Extra note: "${contextNote}". ` : ''}${mealHintText}`
      : `Analyze this meal description: "${contextNote}". Set "detectedDescription" to a clean summary of what was described, and break down every food or drink mentioned with realistic serving weights in grams and macronutrient estimates (calories, protein, carbs, fat, fibre). ${mealHintText}`;

  parts.push({ text: instructionPrompt });

  const systemInstruction =
    'You are a precision clinical & sports nutritionist. Return realistic food weights and nutrition estimates grounded in USDA FoodData Central and Indian ICMR-NIN IFCT 2017 data. Ensure item calories match (protein*4 + carbs*4 + fat*9) closely. Return strictly valid JSON matching the schema.';

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
    detectedDescription:
      resolvedTranscript || String(parsed.detectedDescription || '').trim(),
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
