import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import {
  adminVerifyOrUpdateFood,
  fetchPublicFoodOverrides,
  getExternalFoodSourceStatus,
  getFoodVersionHistory,
  lookupBarcodeFromOpenFoodFacts,
  scoreSemanticMatch,
  searchGlobalFoods,
  seedMasterFoodsToSupabase,
} from './server/foodService.ts';
import { GLOBAL_REFERENCE_FOODS } from './src/data/globalReferenceFoods.ts';
import { isDatabaseAdmin } from './src/utils/adminAccess.ts';
import {
  buildDatabaseQualityReport,
  exportValidationReportCsv,
} from './src/utils/foodValidationEngine.ts';

import {
  calculateSmartFitnessTargets,
  validateCalculatorInput,
} from './src/utils/fitnessCalculator.ts';
import {
  analyzeMealWithGemini,
  coachChatWithGemini,
  parseNutritionLabelWithGemini,
  readBarcodeFromImageWithGemini,
  type AnalyzeMealInputMode,
  type MealPrepStyle,
} from './server/mealAiService.ts';
import {
  getAdminAiInsightsDashboard,
  recordAiTrainingEvent,
  runReinforcementTrainingCycle,
  updateLearnedPriorSharedStatus,
  verifyTrainingEventAndPromote,
} from './server/aiTrainingService.ts';
import type { AiTrainingInputMode, AiTrainingPayloadSnapshot } from './src/types/index.ts';

async function verifyAdminRequest(
  req: express.Request
): Promise<{ ok: boolean; status: number; error?: string; userId?: string; token?: string }> {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return { ok: false, status: 401, error: 'Authentication required' };
  }
  const supabaseUrl = (
    process.env.VITE_SUPABASE_URL || 'https://zzncijlmoskbilxjgiua.supabase.co'
  ).trim();
  const anonKey = (
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    'sb_publishable_1ga_OKeLe193hBppZQjr1Q_NVnAYHcF'
  ).trim();
  const sb = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) {
    return { ok: false, status: 401, error: 'Invalid session token' };
  }
  if (!isDatabaseAdmin(data.user, null)) {
    return { ok: false, status: 403, error: 'Admin privileges required' };
  }
  return { ok: true, status: 200, userId: data.user.id, token };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;
  app.use(express.json({ limit: '12mb' }));

  // Production health check
  app.get('/api/health', (_req, res) => {
    const foodStatus = getExternalFoodSourceStatus();
    res.json({
      ok: true,
      service: 'calothrix',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
      integrations: {
        usdaFdcConfigured: foodStatus.usdaFdc.configured,
        openFoodFacts: true,
        ifct2017: true,
      },
    });
  });

  // Backend Personalized Fitness Goal & Macro Calculator API
  app.post('/api/goals/calculate', (req, res) => {
    try {
      const validation = validateCalculatorInput(req.body || {});
      if (!validation.valid || !validation.sanitized) {
        return res.status(400).json({
          error: validation.errors[0] || 'Invalid fitness calculator inputs.',
          errors: validation.errors,
        });
      }
      const result = calculateSmartFitnessTargets(validation.sanitized);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to calculate goals',
      });
    }
  });

  // External Food Database Status & Attribution
  app.get('/api/foods/status', (_req, res) => {
    res.json(getExternalFoodSourceStatus());
  });

  // Public Food Overrides (admin-verified updates & discontinued flags from Supabase)
  app.get('/api/foods/overrides', async (req, res) => {
    try {
      const authHeader = String(req.headers.authorization || '');
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
      const items = await fetchPublicFoodOverrides(token);
      return res.json({ items });
    } catch {
      return res.json({ items: [] });
    }
  });

  // Admin-Only Internal Food Database Quality Audit Report
  app.get('/api/admin/food-quality', async (req, res) => {
    const auth = await verifyAdminRequest(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.error });
    }
    const overrides = await fetchPublicFoodOverrides(auth.token);
    const overrideMap = new Map(overrides.map((f) => [f.id, f]));
    const mergedFoods = GLOBAL_REFERENCE_FOODS.map((f) => overrideMap.get(f.id) || f);
    return res.json(buildDatabaseQualityReport(mergedFoods));
  });

  // Admin-Only CSV Export of Database Validation Audit
  app.get('/api/admin/food-quality/export.csv', async (req, res) => {
    const auth = await verifyAdminRequest(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.error });
    }
    const overrides = await fetchPublicFoodOverrides(auth.token);
    const overrideMap = new Map(overrides.map((f) => [f.id, f]));
    const mergedFoods = GLOBAL_REFERENCE_FOODS.map((f) => overrideMap.get(f.id) || f);
    const csv = exportValidationReportCsv(mergedFoods);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="calothrix-food-validation-audit-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    return res.send(csv);
  });

  // Admin-Only Seed / Sync Master Reference Catalog to Supabase Postgres
  app.post('/api/admin/seed-foods', async (req, res) => {
    const auth = await verifyAdminRequest(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.error });
    }
    const result = await seedMasterFoodsToSupabase(auth.token);
    if (!result.ok) {
      return res.status(500).json(result);
    }
    return res.json(result);
  });

  // Admin-Only Verify / Edit Macros / Flag / Discontinue a Food with Version Snapshot
  app.post('/api/admin/foods/:id/verify', async (req, res) => {
    const auth = await verifyAdminRequest(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.error });
    }
    const foodId = String(req.params.id || '').trim();
    if (!foodId) {
      return res.status(400).json({ ok: false, error: 'Missing food ID' });
    }
    const body = req.body || {};
    const result = await adminVerifyOrUpdateFood(foodId, body, auth.userId, auth.token);
    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.json(result);
  });

  // Admin-Only Read Food Version History
  app.get('/api/admin/foods/:id/versions', async (req, res) => {
    const auth = await verifyAdminRequest(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.error });
    }
    const foodId = String(req.params.id || '').trim();
    const result = await getFoodVersionHistory(foodId, auth.token);
    if (!result.ok) {
      return res.status(400).json(result);
    }
    return res.json(result);
  });

  // Unified Global Food Search (Postgres Master + IFCT 2017 + USDA FDC + Open Food Facts v2)
  app.get('/api/foods/search', async (req, res) => {
    try {
      const q = String(req.query.q || '');
      const category = String(req.query.category || 'All');
      const country = String(req.query.country || 'All');
      const source = String(req.query.source || 'All');
      const barcode = req.query.barcode ? String(req.query.barcode) : undefined;
      const semantic = req.query.semantic === 'true';
      const authHeader = String(req.headers.authorization || '');
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;

      const result = await searchGlobalFoods(
        {
          query: q,
          category,
          country,
          source,
          barcode,
          semantic,
        },
        token
      );
      res.json(result);
    } catch (err) {
      res.status(500).json({
        items: [],
        error: err instanceof Error ? err.message : 'Food search failed',
      });
    }
  });

  // Barcode Lookup via Open Food Facts v2 + Local Reference + Supabase cache
  app.get('/api/foods/barcode/:barcode', async (req, res) => {
    try {
      const authHeader = String(req.headers.authorization || '');
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
      const result = await lookupBarcodeFromOpenFoodFacts(req.params.barcode, token);
      res.json(result);
    } catch (err) {
      res.status(500).json({
        item: null,
        error: err instanceof Error ? err.message : 'Barcode lookup failed',
      });
    }
  });

  // Fallback AI Barcode Digit Reader for blurred/glare-covered packaging photos
  app.post('/api/foods/read-barcode-image', async (req, res) => {
    try {
      const body = (req.body || {}) as { mimeType?: string; mediaBase64?: string };
      if (!body.mediaBase64) {
        return res.status(400).json({ barcode: null, error: 'Missing image payload.' });
      }
      const result = await readBarcodeFromImageWithGemini({
        mimeType: body.mimeType,
        mediaBase64: body.mediaBase64,
      });
      return res.json(result);
    } catch (err) {
      const e = err as Error & { statusCode?: number; status?: number };
      const status = e.statusCode || e.status || 500;
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        barcode: null,
        error: e.message || 'Could not read barcode from image.',
      });
    }
  });

  // Semantic Food Search (Proxies to Supabase Edge Function if deployed, gracefully falls back to attribute search)
  app.post('/api/ai/food-search', async (req, res) => {
    const query = String(req.body?.query || '').trim();
    const authHeader = req.headers.authorization;
    const supabaseUrl = (process.env.VITE_SUPABASE_URL || 'https://zzncijlmoskbilxjgiua.supabase.co').replace(/\/+$/, '');
    const anonKey =
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      'sb_publishable_1ga_OKeLe193hBppZQjr1Q_NVnAYHcF';

    if (!query) {
      return res.json({ provider: 'deterministic_semantic', items: GLOBAL_REFERENCE_FOODS.slice(0, 12) });
    }

    // Attempt Supabase Edge Function (pgvector + gte-small) when user JWT is supplied
    if (authHeader) {
      try {
        const edgeRes = await fetch(`${supabaseUrl}/functions/v1/ai-food-search`, {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            apikey: anonKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query, limit: 15 }),
          signal: AbortSignal.timeout(4000),
        });
        if (edgeRes.ok) {
          const data = (await edgeRes.json()) as { results?: unknown[]; provider?: string };
          if (Array.isArray(data.results) && data.results.length > 0) {
            return res.json({
              provider: 'supabase_ai',
              items: data.results,
            });
          }
        }
      } catch {
        // Gracefully fall back to attribute-based semantic search
      }
    }

    const searchRes = await searchGlobalFoods({ query, semantic: true });
    const ranked = [...searchRes.items].sort(
      (a, b) => scoreSemanticMatch(b, query) - scoreSemanticMatch(a, query)
    );
    return res.json({
      provider: 'deterministic_semantic',
      items: ranked.slice(0, 20),
      sourceMeta: searchRes.sourceMeta,
    });
  });

  // Multimodal AI Meal Photo, Voice & Description Analyzer (Gemini 4)
  app.post('/api/ai/analyze-meal', async (req, res) => {
    try {
      const body = (req.body || {}) as {
        mode?: string;
        mimeType?: string;
        mediaBase64?: string;
        promptText?: string;
        mealHint?: string;
        prepStyle?: MealPrepStyle;
      };

      const mode: AnalyzeMealInputMode =
        body.mode === 'voice' || body.mode === 'text' ? body.mode : 'photo';

      if (mode === 'text' && !(body.promptText || '').trim()) {
        return res.status(400).json({ error: 'Please describe what you ate.' });
      }

      const result = await analyzeMealWithGemini({
        mode,
        mimeType: body.mimeType,
        mediaBase64: body.mediaBase64,
        promptText: body.promptText,
        prepStyle: body.prepStyle,
        mealHint: body.mealHint as
          | 'breakfast'
          | 'lunch'
          | 'evening_snacks'
          | 'dinner'
          | 'other'
          | undefined,
      });

      return res.json(result);
    } catch (err) {
      const e = err as Error & { statusCode?: number; status?: number };
      const status = e.statusCode || e.status || 500;
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: e.message || 'Meal analysis failed.',
      });
    }
  });

  // Nutrition Facts Label OCR -> Structured Custom Food
  app.post('/api/ai/scan-label', async (req, res) => {
    try {
      const body = (req.body || {}) as { mimeType?: string; mediaBase64?: string };
      if (!body.mediaBase64) {
        return res.status(400).json({ error: 'Missing nutrition label image payload.' });
      }
      const result = await parseNutritionLabelWithGemini({
        mimeType: body.mimeType,
        mediaBase64: body.mediaBase64,
      });
      return res.json(result);
    } catch (err) {
      const e = err as Error & { statusCode?: number; status?: number };
      const status = e.statusCode || e.status || 500;
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: e.message || 'Failed to read nutrition label.',
      });
    }
  });

  // Interactive Nutrition Coach ("Finish My Day" / Rebalance)
  app.post('/api/ai/coach', async (req, res) => {
    try {
      const body = (req.body || {}) as {
        prompt?: string;
        remainingCalories?: number;
        remainingProtein?: number;
        remainingCarbs?: number;
        remainingFat?: number;
        goalCalories?: number;
        goalProtein?: number;
        dietaryPreference?: string;
        restrictions?: string[];
      };
      const prompt = (body.prompt || '').trim() || 'Suggest high-protein ideas to finish my remaining macros today.';
      const result = await coachChatWithGemini({
        prompt,
        remainingCalories: Number(body.remainingCalories ?? 400),
        remainingProtein: Number(body.remainingProtein ?? 30),
        remainingCarbs: Number(body.remainingCarbs ?? 40),
        remainingFat: Number(body.remainingFat ?? 15),
        goalCalories: Number(body.goalCalories ?? 2000),
        goalProtein: Number(body.goalProtein ?? 120),
        dietaryPreference: body.dietaryPreference,
        restrictions: Array.isArray(body.restrictions) ? body.restrictions : [],
      });
      return res.json(result);
    } catch (err) {
      const e = err as Error & { statusCode?: number; status?: number };
      const status = e.statusCode || e.status || 500;
      return res.status(status >= 400 && status < 600 ? status : 500).json({
        error: e.message || 'Coach request failed.',
      });
    }
  });

  // AI Reinforcement Training Event Capture (AI description/output vs User final edited output)
  app.post('/api/ai/training-event', async (req, res) => {
    try {
      const body = (req.body || {}) as {
        inputMode?: AiTrainingInputMode;
        prepStyle?: string;
        userInputText?: string;
        imageStoragePath?: string;
        aiDescription?: string;
        aiRawOutput?: AiTrainingPayloadSnapshot;
        userFinalOutput?: AiTrainingPayloadSnapshot;
        userFeedbackNote?: string;
      };

      if (!body.aiRawOutput || !body.userFinalOutput) {
        return res.status(400).json({
          error: 'Both aiRawOutput and userFinalOutput snapshots are required.',
        });
      }

      const validModes: AiTrainingInputMode[] = [
        'photo',
        'voice',
        'text',
        'quick_parse',
        'label_ocr',
      ];
      const inputMode: AiTrainingInputMode = validModes.includes(
        body.inputMode as AiTrainingInputMode
      )
        ? (body.inputMode as AiTrainingInputMode)
        : 'text';

      const authHeader = String(req.headers.authorization || '');
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
      let userId: string | null = null;

      if (token) {
        try {
          const supabaseUrl = (
            process.env.VITE_SUPABASE_URL || 'https://zzncijlmoskbilxjgiua.supabase.co'
          ).trim();
          const anonKey = (
            process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
            'sb_publishable_1ga_OKeLe193hBppZQjr1Q_NVnAYHcF'
          ).trim();
          const sb = createClient(supabaseUrl, anonKey, {
            auth: { persistSession: false, autoRefreshToken: false },
          });
          const { data } = await sb.auth.getUser(token);
          userId = data?.user?.id || null;
        } catch {
          userId = null;
        }
      }

      const result = await recordAiTrainingEvent({
        userId,
        userToken: token,
        inputMode,
        prepStyle: body.prepStyle,
        userInputText: body.userInputText,
        imageStoragePath: body.imageStoragePath,
        aiDescription:
          body.aiDescription || body.aiRawOutput.mealTitle || 'AI Meal Analysis',
        aiRawOutput: body.aiRawOutput,
        userFinalOutput: body.userFinalOutput,
        userFeedbackNote: body.userFeedbackNote,
      });

      return res.json(result);
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to record AI training event.',
      });
    }
  });

  // Admin-Only AI Performance & Reinforcement Training Insights
  app.get('/api/admin/ai/insights', async (req, res) => {
    const auth = await verifyAdminRequest(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.error });
    }
    try {
      const insights = await getAdminAiInsightsDashboard(auth.token);
      return res.json(insights);
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to load AI insights.',
      });
    }
  });

  // Admin-Only Trigger Reinforcement Self-Training Cycle
  app.post('/api/admin/ai/train', async (req, res) => {
    const auth = await verifyAdminRequest(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.error });
    }
    try {
      const result = await runReinforcementTrainingCycle({
        runType: 'manual_admin',
        triggeredBy: auth.userId,
        userToken: auth.token,
      });
      return res.json(result);
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Reinforcement training cycle failed.',
      });
    }
  });

  // Admin-Only Verify Training Event & Promote to Shared Dataset
  app.post('/api/admin/ai/events/:id/verify', async (req, res) => {
    const auth = await verifyAdminRequest(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.error });
    }
    try {
      const verified = Boolean((req.body as { verified?: boolean })?.verified);
      const result = await verifyTrainingEventAndPromote({
        eventId: req.params.id,
        verified,
        adminUserId: auth.userId,
        userToken: auth.token,
      });
      if (!result.ok) {
        return res.status(404).json({ error: result.error || 'Training event not found.' });
      }
      return res.json(result);
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to verify training event.',
      });
    }
  });

  // Admin-Only Toggle Shared Status on Learned Prior
  app.post('/api/admin/ai/priors/:id/share', async (req, res) => {
    const auth = await verifyAdminRequest(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.error });
    }
    try {
      const isVerifiedShared = Boolean(
        (req.body as { isVerifiedShared?: boolean })?.isVerifiedShared
      );
      const result = await updateLearnedPriorSharedStatus({
        priorId: req.params.id,
        isVerifiedShared,
        userToken: auth.token,
      });
      return res.json(result);
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to update shared prior status.',
      });
    }
  });

  // Weekly AI Progress Summary (Supabase Edge Function with deterministic fallback)
  app.post('/api/ai/weekly-summary', async (req, res) => {
    const payload = req.body || {};
    const authHeader = req.headers.authorization;
    const supabaseUrl = (process.env.VITE_SUPABASE_URL || 'https://zzncijlmoskbilxjgiua.supabase.co').replace(/\/+$/, '');
    const anonKey =
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      'sb_publishable_1ga_OKeLe193hBppZQjr1Q_NVnAYHcF';

    if (authHeader) {
      try {
        const edgeRes = await fetch(`${supabaseUrl}/functions/v1/ai-weekly-summary`, {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            apikey: anonKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(4000),
        });
        if (edgeRes.ok) {
          const data = await edgeRes.json();
          return res.json(data);
        }
      } catch {
        // Fall through to deterministic summary
      }
    }

    const loggedDays = Number(payload.loggedDays || 0);
    const avgCalories = Number(payload.avgCalories || 0);
    const targetCalories = Number(payload.targetCalories || 0);
    const avgProtein = Number(payload.avgProtein || 0);
    const targetProtein = Number(payload.targetProtein || 0);
    const avgFibre = Number(payload.avgFibre || 0);
    const targetFibre = Number(payload.targetFibre || 0);
    const weightChangeKg =
      payload.weightChangeKg !== undefined && payload.weightChangeKg !== null
        ? Number(payload.weightChangeKg)
        : null;

    const highlights: string[] = [];
    const areasToImprove: string[] = [];
    const practicalSuggestions: string[] = [];

    if (loggedDays === 0) {
      areasToImprove.push('No meals logged during this week yet.');
      practicalSuggestions.push('Start by logging breakfast or your primary protein meal daily.');
    } else {
      highlights.push(
        `Tracked ${loggedDays}/7 days with an average of ${avgCalories.toLocaleString()} kcal and ${avgProtein}g protein/day.`
      );
      if (targetCalories > 0) {
        const calDiff = avgCalories - targetCalories;
        if (Math.abs(calDiff) <= targetCalories * 0.1) {
          highlights.push('Average calories stayed within ±10% of your daily target.');
        } else if (calDiff > 0) {
          areasToImprove.push(`Calories averaged +${Math.round(calDiff)} kcal above your daily target.`);
          practicalSuggestions.push('Swap calorie-dense snacks for high-satiety options like fruit, buttermilk, or curd.');
        } else {
          areasToImprove.push(`Calories averaged ${Math.abs(Math.round(calDiff))} kcal below your daily target.`);
          practicalSuggestions.push('Ensure you are eating enough to support recovery and avoid aggressive deficits.');
        }
      }

      if (targetProtein > 0) {
        if (avgProtein >= targetProtein * 0.9) {
          highlights.push(`Hit ${Math.round((avgProtein / targetProtein) * 100)}% of your daily protein target.`);
        } else {
          areasToImprove.push(`Protein averaged ${avgProtein}g vs ${targetProtein}g target.`);
          practicalSuggestions.push('Include one concentrated protein serving (Greek yoghurt, eggs, paneer, tofu, chicken, or whey) at breakfast or snacks.');
        }
      }

      if (targetFibre > 0 && avgFibre < targetFibre * 0.75) {
        areasToImprove.push(`Fibre averaged ${avgFibre}g vs ${targetFibre}g goal.`);
        practicalSuggestions.push('Add 1 bowl of sambar/dal, oats, or chia seeds to lift daily fibre.');
      }
    }

    if (weightChangeKg !== null) {
      const sign = weightChangeKg > 0 ? '+' : '';
      highlights.push(`Weekly weight trend delta: ${sign}${weightChangeKg} kg.`);
    }

    return res.json({
      provider: 'deterministic_analytics',
      weekLabel: String(payload.weekLabel || 'Current Week'),
      avgCalories,
      avgProtein,
      avgCarbs: Number(payload.avgCarbs || 0),
      avgFat: Number(payload.avgFat || 0),
      avgFibre,
      loggedDays,
      weightChangeKg,
      consistencyPct: Number(payload.consistencyPct || 0),
      headline:
        loggedDays >= 5
          ? 'Strong weekly tracking consistency.'
          : loggedDays > 0
          ? 'Keep building consistent daily logs.'
          : 'Log meals this week to unlock weekly insights.',
      highlights,
      areasToImprove,
      practicalSuggestions,
    });
  });

  // Lightweight OAuth callback handler for popup-based Google / Supabase OAuth
  app.get(['/auth/callback', '/auth/callback/'], (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CALOTHRIX — Completing Sign In</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: system-ui, -apple-system, sans-serif;
        background: #0b0f14;
        color: #f3f4f6;
      }
      .card {
        text-align: center;
        padding: 24px 28px;
        border-radius: 16px;
        border: 1px solid #1e293b;
        background: #121821;
        max-width: 340px;
      }
      .title { font-weight: 700; font-size: 16px; margin-bottom: 6px; }
      .sub { font-size: 13px; color: #94a3b8; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="title">CALOTHRIX</div>
      <div class="sub" id="status">Completing Google sign-in...</div>
    </div>
    <script>
      (function () {
        var hash = window.location.hash || '';
        var search = window.location.search || '';
        if (window.opener) {
          try {
            window.opener.postMessage(
              { type: 'CALOTHRIX_SUPABASE_OAUTH', hash: hash, search: search },
              '*'
            );
            document.getElementById('status').textContent = 'Signed in! Closing window...';
            setTimeout(function () { window.close(); }, 180);
            return;
          } catch (err) {}
        }
        // Fallback when opened in a standalone browser tab
        window.location.replace('/' + search + hash);
      })();
    </script>
  </body>
</html>`);
  });

  app.get('/privacy', (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CALOTHRIX — Privacy Policy</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; max-width: 720px; margin: 48px auto; padding: 0 20px; color: #f3f4f6; background: #0b0f14; line-height: 1.6; }
      h1 { font-size: 24px; margin-bottom: 8px; }
      h2 { font-size: 16px; margin-top: 24px; }
      p { color: #94a3b8; font-size: 14px; }
    </style>
  </head>
  <body>
    <h1>CALOTHRIX Privacy Policy</h1>
    <p>Effective Date: November 16, 2026</p>
    <h2>1. Information We Collect</h2>
    <p>When you sign in with Google or Email, CALOTHRIX receives your name, email address, and profile avatar solely to authenticate your account and isolate your personal nutrition, macro, and weight tracking records.</p>
    <h2>2. Data Storage & Security</h2>
    <p>All food logs, custom foods, goals, and body weight entries are stored privately in Supabase PostgreSQL protected by Row-Level Security so only your authenticated account can read or modify your data.</p>
    <h2>3. Data Sharing & Deletion</h2>
    <p>CALOTHRIX does not sell or share your personal data with third parties. For questions or data removal requests, contact darshants6364@gmail.com.</p>
  </body>
</html>`);
  });

  app.get('/terms', (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CALOTHRIX — Terms of Service</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; max-width: 720px; margin: 48px auto; padding: 0 20px; color: #f3f4f6; background: #0b0f14; line-height: 1.6; }
      h1 { font-size: 24px; margin-bottom: 8px; }
      h2 { font-size: 16px; margin-top: 24px; }
      p { color: #94a3b8; font-size: 14px; }
    </style>
  </head>
  <body>
    <h1>CALOTHRIX Terms of Service</h1>
    <p>Effective Date: November 16, 2026</p>
    <h2>1. Use of Service</h2>
    <p>CALOTHRIX provides personal nutrition, macronutrient, and body weight tracking tools for informational purposes. It is not medical advice.</p>
    <h2>2. User Accounts</h2>
    <p>Each user is responsible for maintaining access to their authenticated Google or Email account. Your logged entries remain private to your account.</p>
    <h2>3. Contact</h2>
    <p>For questions about these terms, contact darshants6364@gmail.com.</p>
  </body>
</html>`);
  });

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`CALOTHRIX server running on http://0.0.0.0:${PORT}`);
  });

  let viteServer: Awaited<ReturnType<typeof import('vite')['createServer']>> | null = null;

  if (process.env.NODE_ENV !== 'production') {
    const vitePromise = (async () => {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
        },
        appType: 'spa',
      });
      viteServer = vite;
      return vite;
    })();

    vitePromise.catch((err) => {
      console.error('Failed to initialize Vite dev middleware:', err);
    });

    app.use(async (req, res, next) => {
      try {
        const vite = await vitePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build not found. Run npm run build.');
      }
    });
  }

  const shutdown = async () => {
    try {
      if (viteServer) {
        await viteServer.close();
      }
    } catch {
      // Ignore close errors during shutdown
    }
    httpServer.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer();
