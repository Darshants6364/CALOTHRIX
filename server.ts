import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  adminVerifyOrUpdateFood,
  fetchPublicFoodOverrides,
  getExternalFoodSourceStatus,
  getFoodVersionHistory,
  getFullServerFoodCatalog,
  getPendingValidationFoods,
  lookupBarcodeFromOpenFoodFacts,
  scoreSemanticMatch,
  searchGlobalFoods,
  seedMasterFoodsToSupabase,
} from './server/foodService.ts';
import {
  completePendingFoodWithGemini,
  discoverRegionalFoodsWithGemini,
} from './server/foodAiQualityService.ts';
import { FOOD_FAMILIES } from './src/data/foodFamilies.ts';
import { GLOBAL_REFERENCE_FOODS } from './src/data/globalReferenceFoods.ts';
import {
  buildDatabaseQualityReport,
  exportValidationReportCsv,
} from './src/utils/foodValidationEngine.ts';

import {
  buildWhatIfGoalComparisons,
  calculateSmartFitnessTargets,
  getGoalDisplayLabel,
  validateCalculatorInput,
} from './src/utils/fitnessCalculator.ts';
import {
  runDeterministicWeeklyAssessment,
} from './src/utils/weeklyAssessmentEngine.ts';
import {
  analyzeMealWithGemini,
  coachChatWithGemini,
  generateWeeklyAssessmentExplanation,
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
import type {
  AiTrainingInputMode,
  AiTrainingPayloadSnapshot,
  DailyNutritionSummary,
  NutritionGoals,
  UserProfile,
  WeeklyAssessmentRecord,
  WeightEntry,
} from './src/types/index.ts';

import {
  accountMutationLimiter,
  attachRequestId,
  createSecurityHeadersMiddleware,
  createServiceRoleSupabaseClient,
  createUserSupabaseClient,
  enforceAiAccessAndQuota,
  generalApiLimiter,
  getSupabaseConfig,
  getSupportEmail,
  resolveRequestActor,
  sendSafeError,
  validateBase64MediaPayload,
} from './server/security.ts';

async function verifyAdminRequest(
  req: express.Request
): Promise<{ ok: boolean; status: number; error?: string; userId?: string; token?: string }> {
  const actor = await resolveRequestActor(req);
  if (!actor.authenticated || !actor.userId || !actor.token) {
    return {
      ok: false,
      status: 401,
      error: actor.authError || 'Authentication required',
    };
  }
  if (!actor.isAdmin) {
    return { ok: false, status: 403, error: 'Admin privileges required' };
  }
  return { ok: true, status: 200, userId: actor.userId, token: actor.token };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const parsedPort = Number(process.env.PORT);
  const PORT = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3000;

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(attachRequestId);
  app.use(createSecurityHeadersMiddleware());

  // Safe default body limit (1 MB) across general routes; media AI routes mount a dedicated 6 MB parser
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', generalApiLimiter);

  const mediaJsonParser = express.json({ limit: '6mb' });

  // Lightweight Cloud Run readiness/liveness probe
  app.get('/healthz', (_req, res) => {
    res.status(200).json({ ok: true, service: 'calothrix' });
  });

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

  // Authenticated self-service Account & Personal Data Deletion
  app.delete('/api/account', accountMutationLimiter, async (req, res) => {
    try {
      const actor = await resolveRequestActor(req);
      if (!actor.authenticated || !actor.userId || !actor.token) {
        return res.status(401).json({ error: actor.authError || 'Authentication required.' });
      }

      const confirm = String((req.body as { confirmText?: string } | undefined)?.confirmText || '')
        .trim()
        .toUpperCase();
      if (confirm !== 'DELETE') {
        return res.status(400).json({ error: 'Please type DELETE to confirm permanent account removal.' });
      }

      const userId = actor.userId;
      const userSb = createUserSupabaseClient(actor.token);
      const serviceSb = createServiceRoleSupabaseClient();
      const db = serviceSb || userSb;

      // Delete user-owned records in dependency-safe order (ignore missing optional tables)
      const userTables = [
        'food_entries',
        'weight_entries',
        'custom_foods',
        'user_food_preferences',
        'nutrition_goals',
        'weight_goals',
        'weekly_assessments',
        'ai_meal_scans',
        'user_saved_meals',
        'water_logs',
        'trainer_client_plans',
        'target_recommendations',
        'trainer_profiles',
        'profiles',
      ];

      for (const table of userTables) {
        try {
          await db.from(table).delete().eq('user_id', userId);
        } catch {
          // Table may not exist in older schemas; continue cleaning remaining tables
        }
      }

      let authAccountDeleted = false;
      if (serviceSb) {
        const { error: delAuthErr } = await serviceSb.auth.admin.deleteUser(userId);
        if (!delAuthErr) {
          authAccountDeleted = true;
        }
      }

      return res.json({
        ok: true,
        dataDeleted: true,
        authAccountDeleted,
        message: authAccountDeleted
          ? 'Your account and all personal nutrition data have been permanently deleted.'
          : 'All personal nutrition records, logs, goals, and profile data have been deleted from the database. Contact support if you also require immediate auth login removal.',
      });
    } catch (err) {
      return sendSafeError(req, res, 'delete_account', err, 'Failed to delete account data.');
    }
  });

  // Backend Personalized Smart Calorie Tracker Calculator API
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
      if (req.body?.includeWhatIf) {
        return res.json({
          ...result,
          whatIfComparisons: buildWhatIfGoalComparisons(validation.sanitized),
        });
      }
      return res.json(result);
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to calculate goals',
      });
    }
  });

  // 7-Day AI Adaptive Assessment Endpoint (Deterministic Engine + Gemini Explanation + Idempotent Supabase Persistence)
  app.post('/api/assessments/weekly', async (req, res) => {
    try {
      const body = (req.body || {}) as {
        profile?: Partial<UserProfile>;
        goals?: Partial<NutritionGoals>;
        weightEntries?: WeightEntry[];
        dailyNutrition?: DailyNutritionSummary[];
        previousAssessments?: WeeklyAssessmentRecord[];
        referenceDateKey?: string;
        assessmentWeekNumber?: number;
        forceRecompute?: boolean;
      };

      // 1. Validate profile inputs server-side (never trust client-submitted targets or assessment outputs)
      const rawProfile = body.profile || {};
      const profileValidation = validateCalculatorInput({
        age: rawProfile.age,
        biologicalSex: rawProfile.biologicalSex,
        heightCm: rawProfile.heightCm,
        currentWeightKg: rawProfile.currentWeightKg,
        targetWeightKg: rawProfile.targetWeightKg ?? rawProfile.currentWeightKg,
        dailyAverageSteps: rawProfile.dailyAverageSteps,
        activityLevel: rawProfile.activityLevel,
        workoutFrequencyPerWeek: rawProfile.workoutFrequencyPerWeek,
        workoutIntensity: rawProfile.workoutIntensity,
        fitnessGoal: rawProfile.fitnessGoal,
        goalSpeed: rawProfile.goalSpeed,
        macroFocus: rawProfile.macroFocus,
        bodyFatPct: rawProfile.bodyFatPct,
        isPregnantOrBreastfeeding: rawProfile.isPregnantOrBreastfeeding,
        adaptiveTdeeKcal: rawProfile.adaptiveTdeeKcal,
      });

      if (!profileValidation.valid || !profileValidation.sanitized) {
        return res.status(400).json({
          error: profileValidation.errors[0] || 'Invalid profile data for weekly assessment.',
          errors: profileValidation.errors,
        });
      }

      // 2. Enforce auth/guest AI quota cleanly
      const actor = await enforceAiAccessAndQuota(req, res, {
        guestAllowed: true,
        featureName: 'Weekly Adaptive Assessment',
      });
      if (!actor) return;

      const authenticatedUserId: string | null = actor.userId;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userScopedSupabase: any =
        actor.authenticated && actor.token ? createUserSupabaseClient(actor.token) : null;

      const actorId = authenticatedUserId || String(rawProfile.id || 'guest-user');

      // Sanitize weight entries and daily nutrition summaries
      const sanitizedWeights: WeightEntry[] = Array.isArray(body.weightEntries)
        ? body.weightEntries
            .filter(
              (w) =>
                w &&
                typeof w.date === 'string' &&
                /^\d{4}-\d{2}-\d{2}$/.test(w.date) &&
                Number.isFinite(Number(w.weightKg)) &&
                Number(w.weightKg) >= 25 &&
                Number(w.weightKg) <= 350
            )
            .slice(0, 90)
            .map((w, idx) => ({
              id: String(w.id || `w-${idx}`),
              userId: actorId,
              date: w.date,
              weightKg: Number(w.weightKg),
              notes: typeof w.notes === 'string' ? w.notes.slice(0, 180) : undefined,
              createdAt: w.createdAt || new Date().toISOString(),
              updatedAt: w.updatedAt || new Date().toISOString(),
            }))
        : [];

      const sanitizedDailyNutrition: DailyNutritionSummary[] = Array.isArray(body.dailyNutrition)
        ? body.dailyNutrition
            .filter(
              (d) =>
                d &&
                typeof d.date === 'string' &&
                /^\d{4}-\d{2}-\d{2}$/.test(d.date) &&
                Number.isFinite(Number(d.calories)) &&
                Number(d.calories) >= 0 &&
                Number(d.calories) <= 15000
            )
            .slice(0, 45)
            .map((d) => ({
              date: d.date,
              calories: Math.round(Number(d.calories)),
              protein: Math.round(Number(d.protein || 0) * 10) / 10,
              carbs: Math.round(Number(d.carbs || 0) * 10) / 10,
              fat: Math.round(Number(d.fat || 0) * 10) / 10,
              fibre: Math.round(Number(d.fibre || 0) * 10) / 10,
              entryCount: Math.max(0, Math.round(Number(d.entryCount || 1))),
            }))
        : [];

      const referenceDateKey =
        typeof body.referenceDateKey === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.referenceDateKey)
          ? body.referenceDateKey
          : undefined;

      const sanitizedProfile: UserProfile = {
        id: actorId,
        name: String(rawProfile.name || ''),
        age: profileValidation.sanitized.age,
        biologicalSex: profileValidation.sanitized.biologicalSex,
        heightCm: profileValidation.sanitized.heightCm,
        currentWeightKg: profileValidation.sanitized.currentWeightKg,
        targetWeightKg: profileValidation.sanitized.targetWeightKg,
        dailyAverageSteps: profileValidation.sanitized.dailyAverageSteps ?? 7500,
        activityLevel: profileValidation.sanitized.activityLevel,
        workoutFrequencyPerWeek: profileValidation.sanitized.workoutFrequencyPerWeek,
        workoutIntensity: profileValidation.sanitized.workoutIntensity || 'moderate',
        fitnessGoal: profileValidation.sanitized.fitnessGoal,
        goalSpeed: profileValidation.sanitized.goalSpeed,
        macroFocus: profileValidation.sanitized.macroFocus,
        bodyFatPct: profileValidation.sanitized.bodyFatPct,
        isPregnantOrBreastfeeding: profileValidation.sanitized.isPregnantOrBreastfeeding,
        adaptiveTdeeKcal: profileValidation.sanitized.adaptiveTdeeKcal,
        lastWeeklyAssessmentAt: rawProfile.lastWeeklyAssessmentAt ?? null,
        dietaryPreference:
          rawProfile.dietaryPreference === 'vegetarian' ||
          rawProfile.dietaryPreference === 'vegan' ||
          rawProfile.dietaryPreference === 'eggetarian'
            ? rawProfile.dietaryPreference
            : 'omnivore',
        foodRestrictions: Array.isArray(rawProfile.foodRestrictions)
          ? rawProfile.foodRestrictions.slice(0, 6)
          : [],
        accountRole: rawProfile.accountRole || 'individual',
        isDemoProfile: Boolean(rawProfile.isDemoProfile),
      };

      const rawGoals = body.goals || {};
      const sanitizedGoals: NutritionGoals = {
        userId: actorId,
        preset: rawGoals.preset || sanitizedProfile.fitnessGoal,
        calories: Math.max(0, Math.min(10000, Math.round(Number(rawGoals.calories || 0)))),
        protein: Math.max(0, Math.min(600, Math.round(Number(rawGoals.protein || 0)))),
        carbs: Math.max(0, Math.min(1500, Math.round(Number(rawGoals.carbs || 0)))),
        fat: Math.max(0, Math.min(400, Math.round(Number(rawGoals.fat || 0)))),
        fibre: Math.max(0, Math.min(150, Math.round(Number(rawGoals.fibre || 0)))),
        targetWeightKg: rawGoals.targetWeightKg ?? sanitizedProfile.targetWeightKg,
        estimatedBmr: rawGoals.estimatedBmr,
        estimatedTdee: rawGoals.estimatedTdee,
        adaptiveTdeeKcal: rawGoals.adaptiveTdeeKcal ?? sanitizedProfile.adaptiveTdeeKcal,
        macroFocus: rawGoals.macroFocus || sanitizedProfile.macroFocus,
        assessmentWeekNumber: Number(rawGoals.assessmentWeekNumber || 0),
        initialCalculatedAt: rawGoals.initialCalculatedAt,
        calculationVersion: rawGoals.calculationVersion,
        bmi: rawGoals.bmi,
        goalSpeed: rawGoals.goalSpeed || sanitizedProfile.goalSpeed,
        estimatedWeeks: rawGoals.estimatedWeeks,
        updatedAt: rawGoals.updatedAt || new Date().toISOString(),
      };

      // 3. Recompute deterministic assessment authoritatively on the server
      const deterministic = runDeterministicWeeklyAssessment({
        userId: actorId,
        profile: sanitizedProfile,
        goals: sanitizedGoals,
        weightEntries: sanitizedWeights,
        dailyNutrition: sanitizedDailyNutrition,
        previousAssessments: Array.isArray(body.previousAssessments)
          ? body.previousAssessments.slice(0, 24)
          : [],
        referenceDateKey,
        assessmentWeekNumber: body.assessmentWeekNumber,
      });

      // 4. Idempotency check in Supabase for authenticated users
      if (authenticatedUserId && userScopedSupabase && !body.forceRecompute) {
        try {
          const { data: existingRow } = await userScopedSupabase
            .from('weekly_assessments')
            .select('*')
            .eq('user_id', authenticatedUserId)
            .eq('week_start_date', deterministic.weekStartDate)
            .eq('week_end_date', deterministic.weekEndDate)
            .maybeSingle();

          if (existingRow) {
            const row = existingRow as Record<string, unknown>;
            const existingRecord: WeeklyAssessmentRecord = {
              id: String(row.id),
              userId: String(row.user_id),
              weekStartDate: String(row.week_start_date),
              weekEndDate: String(row.week_end_date),
              assessmentWeekNumber: Number(row.assessment_week_number || deterministic.assessmentWeekNumber),
              previousWeightKg: Number(row.previous_weight_kg),
              assessedWeightKg: Number(row.assessed_weight_kg),
              previousTrendWeightKg: Number(row.previous_trend_weight_kg),
              assessedTrendWeightKg: Number(row.assessed_trend_weight_kg),
              current7dAvgWeightKg: deterministic.weightAnalysis.current7dAvgWeightKg,
              previous7dAvgWeightKg: deterministic.weightAnalysis.previous7dAvgWeightKg,
              weeklyWeightChangeKg: deterministic.weightAnalysis.weeklyWeightChangeKg,
              weeklyWeightChangePct: deterministic.weightAnalysis.weeklyWeightChangePct,
              avgDailyCalories: Number(row.avg_daily_calories || 0),
              avgDailyProtein: Number(row.avg_daily_protein || 0),
              priorTdeeKcal: Number(row.prior_tdee_kcal || 0),
              estimatedTdeeKcal: deterministic.estimatedTdeeKcal,
              calibratedTdeeKcal: Number(row.calibrated_tdee_kcal || 0),
              previousRecommendedCalories: Number(row.previous_recommended_calories || 0),
              recommendedCalories: Number(row.recommended_calories || 0),
              previousRecommendedProtein: deterministic.previousRecommendedProtein,
              previousRecommendedCarbs: deterministic.previousRecommendedCarbs,
              previousRecommendedFat: deterministic.previousRecommendedFat,
              previousRecommendedFibre: deterministic.previousRecommendedFibre,
              recommendedProtein: Number(row.recommended_protein || 0),
              recommendedCarbs: Number(row.recommended_carbs || 0),
              recommendedFat: Number(row.recommended_fat || 0),
              recommendedFibre: Number(row.recommended_fibre || 0),
              recommendedHydrationMl:
                row.recommended_hydration_ml != null
                  ? Number(row.recommended_hydration_ml)
                  : deterministic.recommendedHydrationMl,
              estimatedBmr: deterministic.estimatedBmr,
              projectedWeeksToGoal: deterministic.projectedWeeksToGoal,
              foodLoggedDays: Number(row.food_logged_days || 0),
              weightLoggedDays: Number(row.weight_logged_days || 0),
              loggingCompletenessPct: deterministic.loggingCompletenessPct,
              adherencePercentage: Number(row.adherence_percentage || 0),
              confidenceLevel: (row.confidence_level as WeeklyAssessmentRecord['confidenceLevel']) || 'low',
              adjustmentType:
                (row.adjustment_type as WeeklyAssessmentRecord['adjustmentType']) ||
                deterministic.adjustmentType,
              calorieDeltaKcal:
                Number(row.recommended_calories || 0) - Number(row.previous_recommended_calories || 0),
              adjustmentReason: String(row.adjustment_reason || ''),
              goalCompleted: Boolean(row.goal_completed),
              suggestedMaintenanceCalories:
                row.suggested_maintenance_calories != null
                  ? Number(row.suggested_maintenance_calories)
                  : deterministic.suggestedMaintenanceCalories,
              aiSummary:
                row.ai_summary && typeof row.ai_summary === 'object'
                  ? (row.ai_summary as WeeklyAssessmentRecord['aiSummary'])
                  : deterministic.fallbackAiSummary,
              rationaleBullets: Array.isArray(row.rationale_bullets)
                ? (row.rationale_bullets as string[])
                : deterministic.rationaleBullets,
              calculationVersion: String(row.calculation_version || deterministic.calculationVersion),
              status: (row.status as WeeklyAssessmentRecord['status']) || 'pending',
              appliedAt: row.applied_at ? String(row.applied_at) : null,
              createdAt: String(row.created_at || new Date().toISOString()),
            };
            return res.json({
              assessment: existingRecord,
              idempotentHit: true,
              persistedToSupabase: true,
            });
          }
        } catch {
          // Table may not be migrated yet; proceed gracefully
        }
      }

      // 5. Generate Gemini explanation (strictly read-only over deterministic numbers, with fallback)
      const aiSummary = await generateWeeklyAssessmentExplanation({
        assessment: deterministic,
        dietaryPreference: sanitizedProfile.dietaryPreference,
        foodRestrictions: sanitizedProfile.foodRestrictions,
        goalLabel: getGoalDisplayLabel(deterministic.normalizedGoal),
      });

      const nowIso = new Date().toISOString();
      const recordId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `wa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const assessmentRecord: WeeklyAssessmentRecord = {
        id: recordId,
        userId: actorId,
        weekStartDate: deterministic.weekStartDate,
        weekEndDate: deterministic.weekEndDate,
        assessmentWeekNumber: deterministic.assessmentWeekNumber,
        previousWeightKg: deterministic.weightAnalysis.previousMeasuredWeightKg,
        assessedWeightKg: deterministic.weightAnalysis.latestMeasuredWeightKg,
        previousTrendWeightKg: deterministic.weightAnalysis.previousTrendWeightKg,
        assessedTrendWeightKg: deterministic.weightAnalysis.assessedTrendWeightKg,
        current7dAvgWeightKg: deterministic.weightAnalysis.current7dAvgWeightKg,
        previous7dAvgWeightKg: deterministic.weightAnalysis.previous7dAvgWeightKg,
        weeklyWeightChangeKg: deterministic.weightAnalysis.weeklyWeightChangeKg,
        weeklyWeightChangePct: deterministic.weightAnalysis.weeklyWeightChangePct,
        avgDailyCalories: deterministic.avgDailyCalories,
        avgDailyProtein: deterministic.avgDailyProtein,
        avgDailyCarbs: deterministic.avgDailyCarbs,
        avgDailyFat: deterministic.avgDailyFat,
        priorTdeeKcal: deterministic.priorTdeeKcal,
        estimatedTdeeKcal: deterministic.estimatedTdeeKcal,
        calibratedTdeeKcal: deterministic.calibratedTdeeKcal,
        previousRecommendedCalories: deterministic.previousRecommendedCalories,
        recommendedCalories: deterministic.recommendedCalories,
        previousRecommendedProtein: deterministic.previousRecommendedProtein,
        previousRecommendedCarbs: deterministic.previousRecommendedCarbs,
        previousRecommendedFat: deterministic.previousRecommendedFat,
        previousRecommendedFibre: deterministic.previousRecommendedFibre,
        recommendedProtein: deterministic.recommendedProtein,
        recommendedCarbs: deterministic.recommendedCarbs,
        recommendedFat: deterministic.recommendedFat,
        recommendedFibre: deterministic.recommendedFibre,
        recommendedHydrationMl: deterministic.recommendedHydrationMl,
        estimatedBmr: deterministic.estimatedBmr,
        projectedWeeksToGoal: deterministic.projectedWeeksToGoal,
        foodLoggedDays: deterministic.foodLoggedDays,
        weightLoggedDays: deterministic.weightLoggedDays,
        loggingCompletenessPct: deterministic.loggingCompletenessPct,
        adherencePercentage: deterministic.adherencePercentage,
        confidenceLevel: deterministic.confidenceLevel,
        adjustmentType: deterministic.adjustmentType,
        calorieDeltaKcal: deterministic.calorieDeltaKcal,
        adjustmentReason: deterministic.adjustmentReason,
        goalCompleted: deterministic.goalCompleted,
        suggestedMaintenanceCalories: deterministic.suggestedMaintenanceCalories,
        aiSummary,
        rationaleBullets: deterministic.rationaleBullets,
        calculationVersion: deterministic.calculationVersion,
        status: 'pending',
        appliedAt: null,
        createdAt: nowIso,
      };

      let persistedToSupabase = false;
      if (authenticatedUserId && userScopedSupabase) {
        try {
          const { data: upserted, error: upsertErr } = await userScopedSupabase
            .from('weekly_assessments')
            .upsert(
              {
                user_id: authenticatedUserId,
                week_start_date: assessmentRecord.weekStartDate,
                week_end_date: assessmentRecord.weekEndDate,
                assessment_week_number: assessmentRecord.assessmentWeekNumber,
                previous_weight_kg: assessmentRecord.previousWeightKg,
                assessed_weight_kg: assessmentRecord.assessedWeightKg,
                previous_trend_weight_kg: assessmentRecord.previousTrendWeightKg,
                assessed_trend_weight_kg: assessmentRecord.assessedTrendWeightKg,
                avg_daily_calories: assessmentRecord.avgDailyCalories,
                avg_daily_protein: assessmentRecord.avgDailyProtein,
                prior_tdee_kcal: assessmentRecord.priorTdeeKcal,
                calibrated_tdee_kcal: assessmentRecord.calibratedTdeeKcal,
                previous_recommended_calories: assessmentRecord.previousRecommendedCalories,
                recommended_calories: assessmentRecord.recommendedCalories,
                recommended_protein: assessmentRecord.recommendedProtein,
                recommended_carbs: assessmentRecord.recommendedCarbs,
                recommended_fat: assessmentRecord.recommendedFat,
                recommended_fibre: assessmentRecord.recommendedFibre,
                recommended_hydration_ml: assessmentRecord.recommendedHydrationMl ?? null,
                food_logged_days: assessmentRecord.foodLoggedDays,
                weight_logged_days: assessmentRecord.weightLoggedDays,
                adherence_percentage: assessmentRecord.adherencePercentage,
                confidence_level: assessmentRecord.confidenceLevel,
                adjustment_type: assessmentRecord.adjustmentType,
                adjustment_reason: assessmentRecord.adjustmentReason,
                goal_completed: assessmentRecord.goalCompleted,
                suggested_maintenance_calories: assessmentRecord.suggestedMaintenanceCalories ?? null,
                ai_summary: assessmentRecord.aiSummary,
                rationale_bullets: assessmentRecord.rationaleBullets,
                calculation_version: assessmentRecord.calculationVersion,
                status: 'pending',
                updated_at: nowIso,
              } as never,
              { onConflict: 'user_id,week_start_date,week_end_date' }
            )
            .select('id, created_at')
            .maybeSingle();

          if (!upsertErr && upserted) {
            const uRow = upserted as Record<string, unknown>;
            if (uRow.id) assessmentRecord.id = String(uRow.id);
            if (uRow.created_at) assessmentRecord.createdAt = String(uRow.created_at);
            persistedToSupabase = true;
          }
        } catch {
          persistedToSupabase = false;
        }
      }

      return res.json({
        assessment: assessmentRecord,
        idempotentHit: false,
        persistedToSupabase,
      });
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to run 7-day adaptive assessment.',
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

  // Admin-Only: List pending_validation / incomplete records for controlled quality review
  app.get('/api/admin/foods/pending-validation', async (req, res) => {
    const auth = await verifyAdminRequest(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.error });
    }
    const pending = getPendingValidationFoods();
    return res.json({
      totalPending: pending.length,
      items: pending.slice(0, 100),
    });
  });

  // Admin-Only: Controlled Gemini Batch Nutritional Completion (never overwrites verified foods)
  app.post('/api/admin/foods/ai-complete', async (req, res) => {
    const auth = await verifyAdminRequest(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.error });
    }
    const rawIds = Array.isArray(req.body?.foodIds) ? req.body.foodIds : [];
    const foodIds: string[] = rawIds
      .map((id: unknown) => String(id || '').trim())
      .filter(Boolean)
      .slice(0, 10);

    const catalog = getFullServerFoodCatalog();
    const byId = new Map(catalog.map((f) => [f.id, f]));
    const targets =
      foodIds.length > 0
        ? foodIds.map((id) => byId.get(id)).filter((f): f is NonNullable<typeof f> => Boolean(f))
        : getPendingValidationFoods().slice(0, 5);

    const results = [];
    for (const target of targets) {
      const completion = await completePendingFoodWithGemini(target, catalog);
      results.push(completion);
    }

    return res.json({
      processed: results.length,
      updated: results.filter((r) => r.status === 'updated').length,
      skippedVerified: results.filter((r) => r.status === 'skipped_already_verified').length,
      keptPending: results.filter((r) => r.status === 'kept_pending_insufficient_data').length,
      results,
    });
  });

  // Admin-Only: Controlled Gemini Regional Food & Alias Discovery (deduplicated against catalog)
  app.post('/api/admin/foods/ai-discover', async (req, res) => {
    const auth = await verifyAdminRequest(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.error });
    }
    const topic = String(req.body?.topic || '').trim();
    if (topic.length < 2 || topic.length > 120) {
      return res.status(400).json({ error: 'Provide a topic/region between 2 and 120 characters.' });
    }
    const proposals = await discoverRegionalFoodsWithGemini(topic, getFullServerFoodCatalog());
    return res.json({ topic, proposals });
  });

  // Public Food Families Taxonomy
  app.get('/api/foods/families', (_req, res) => {
    res.json({ families: FOOD_FAMILIES });
  });

  // Unified Global Food Search (DB-First <200ms: Supabase Postgres + IFCT + INDB + Karnataka + UK/US FCT; External/Gemini fallback only)
  app.get('/api/foods/search', async (req, res) => {
    try {
      const q = String(req.query.q || '');
      const category = String(req.query.category || 'All');
      const country = String(req.query.country || 'All');
      const source = String(req.query.source || 'All');
      const barcode = req.query.barcode ? String(req.query.barcode) : undefined;
      const semantic = req.query.semantic === 'true';
      const page = req.query.page ? Number(req.query.page) : 1;
      const limit = req.query.limit ? Number(req.query.limit) : 40;
      const groupParam = String(req.query.group || 'all');
      const group =
        groupParam === 'basic_ingredient' || groupParam === 'cooked_food' || groupParam === 'prepared_dish'
          ? groupParam
          : 'all';
      const familyId = req.query.familyId ? String(req.query.familyId) : undefined;
      const includeExternal = req.query.includeExternal === 'true';
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
          page: Number.isFinite(page) ? page : 1,
          limit: Number.isFinite(limit) ? limit : 40,
          group,
          familyId,
          includeExternal,
        },
        token
      );
      res.json(result);
    } catch (err) {
      res.status(500).json({
        items: [],
        grouped: { basic_ingredient: [], cooked_food: [], prepared_dish: [] },
        totalCount: 0,
        page: 1,
        limit: 40,
        hasMore: false,
        elapsedMs: 0,
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
  app.post('/api/foods/read-barcode-image', mediaJsonParser, async (req, res) => {
    try {
      const actor = await enforceAiAccessAndQuota(req, res, {
        guestAllowed: true,
        featureName: 'AI Barcode Image Reader',
      });
      if (!actor) return;

      const body = (req.body || {}) as { mimeType?: string; mediaBase64?: string };
      const validated = validateBase64MediaPayload({
        mediaBase64: body.mediaBase64,
        mimeType: body.mimeType,
        kind: 'image',
        maxBytes: 4 * 1024 * 1024,
      });
      if (!validated.ok) {
        return res.status(400).json({ barcode: null, error: validated.error });
      }
      const result = await readBarcodeFromImageWithGemini({
        mimeType: validated.mimeType,
        mediaBase64: validated.cleanBase64,
      });
      return res.json(result);
    } catch (err) {
      return sendSafeError(
        req,
        res,
        'read_barcode_image',
        err,
        'Could not read barcode from image right now.'
      );
    }
  });

  // Semantic Food Search (Proxies to Supabase Edge Function if deployed, gracefully falls back to attribute search)
  app.post('/api/ai/food-search', async (req, res) => {
    try {
      const actor = await enforceAiAccessAndQuota(req, res, {
        guestAllowed: true,
        featureName: 'Smart Food Search',
      });
      if (!actor) return;

      const query = String(req.body?.query || '').trim().slice(0, 120);
      const authHeader = req.headers.authorization;
      const { url: supabaseUrl, publishableKey: anonKey } = getSupabaseConfig();

      if (!query) {
        return res.json({ provider: 'deterministic_semantic', items: GLOBAL_REFERENCE_FOODS.slice(0, 12) });
      }

      // Attempt Supabase Edge Function (pgvector + gte-small) when user JWT is supplied
      if (authHeader && actor.authenticated) {
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
    } catch (err) {
      return sendSafeError(req, res, 'ai_food_search', err, 'Food search failed.');
    }
  });

  // Multimodal AI Meal Photo, Voice & Description Analyzer
  app.post('/api/ai/analyze-meal', mediaJsonParser, async (req, res) => {
    try {
      const actor = await enforceAiAccessAndQuota(req, res, {
        guestAllowed: true,
        featureName: 'AI Meal Scanner',
      });
      if (!actor) return;

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

      const promptText = typeof body.promptText === 'string' ? body.promptText.trim().slice(0, 1200) : '';

      if (mode === 'text' && !promptText) {
        return res.status(400).json({ error: 'Please describe what you ate.' });
      }

      let cleanBase64: string | undefined;
      let normalizedMime: string | undefined;

      if (mode === 'photo') {
        const validated = validateBase64MediaPayload({
          mediaBase64: body.mediaBase64,
          mimeType: body.mimeType,
          kind: 'image',
          maxBytes: 4 * 1024 * 1024,
        });
        if (!validated.ok) {
          return res.status(400).json({ error: validated.error });
        }
        cleanBase64 = validated.cleanBase64;
        normalizedMime = validated.mimeType;
      } else if (mode === 'voice') {
        if (body.mediaBase64) {
          const validated = validateBase64MediaPayload({
            mediaBase64: body.mediaBase64,
            mimeType: body.mimeType,
            kind: 'audio',
            maxBytes: 5 * 1024 * 1024,
          });
          if (!validated.ok) {
            return res.status(400).json({ error: validated.error });
          }
          cleanBase64 = validated.cleanBase64;
          normalizedMime = validated.mimeType;
        } else if (!promptText) {
          return res.status(400).json({ error: 'Please record audio or speak/type your meal description.' });
        }
      }

      const result = await analyzeMealWithGemini({
        mode,
        mimeType: normalizedMime,
        mediaBase64: cleanBase64,
        promptText,
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
      return sendSafeError(req, res, 'analyze_meal', err, 'Meal analysis failed. Please try again.');
    }
  });

  // Nutrition Facts Label OCR -> Structured Custom Food
  app.post('/api/ai/scan-label', mediaJsonParser, async (req, res) => {
    try {
      const actor = await enforceAiAccessAndQuota(req, res, {
        guestAllowed: true,
        featureName: 'Nutrition Label OCR',
      });
      if (!actor) return;

      const body = (req.body || {}) as { mimeType?: string; mediaBase64?: string };
      const validated = validateBase64MediaPayload({
        mediaBase64: body.mediaBase64,
        mimeType: body.mimeType,
        kind: 'image',
        maxBytes: 4 * 1024 * 1024,
      });
      if (!validated.ok) {
        return res.status(400).json({ error: validated.error });
      }
      const result = await parseNutritionLabelWithGemini({
        mimeType: validated.mimeType,
        mediaBase64: validated.cleanBase64,
      });
      return res.json(result);
    } catch (err) {
      return sendSafeError(
        req,
        res,
        'scan_label',
        err,
        'Failed to read nutrition label. Please try a clearer photo.'
      );
    }
  });

  // Interactive Nutrition Coach (Strictly authenticated + rate-limited)
  app.post('/api/ai/coach', async (req, res) => {
    try {
      const actor = await enforceAiAccessAndQuota(req, res, {
        requireAuth: true,
        guestAllowed: false,
        featureName: 'AI Nutrition Coach',
      });
      if (!actor) return;

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
      const prompt =
        String(body.prompt || '')
          .trim()
          .slice(0, 600) ||
        'Suggest high-protein ideas to finish my remaining macros today.';
      const result = await coachChatWithGemini({
        prompt,
        remainingCalories: Number(body.remainingCalories ?? 400),
        remainingProtein: Number(body.remainingProtein ?? 30),
        remainingCarbs: Number(body.remainingCarbs ?? 40),
        remainingFat: Number(body.remainingFat ?? 15),
        goalCalories: Number(body.goalCalories ?? 2000),
        goalProtein: Number(body.goalProtein ?? 120),
        dietaryPreference: body.dietaryPreference,
        restrictions: Array.isArray(body.restrictions) ? body.restrictions.slice(0, 12) : [],
      });
      return res.json(result);
    } catch (err) {
      return sendSafeError(req, res, 'ai_coach', err, 'Coach request failed. Please try again.');
    }
  });

  // AI Reinforcement Training Event Capture (Strictly authenticated to prevent anonymous data poisoning)
  app.post('/api/ai/training-event', async (req, res) => {
    try {
      const actor = await resolveRequestActor(req);
      if (!actor.authenticated || !actor.userId || !actor.token) {
        return res.status(401).json({
          error: actor.authError || 'Authentication required to submit meal correction feedback.',
        });
      }

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

      const result = await recordAiTrainingEvent({
        userId: actor.userId,
        userToken: actor.token,
        inputMode,
        prepStyle: body.prepStyle,
        userInputText: body.userInputText?.slice(0, 800),
        imageStoragePath: body.imageStoragePath?.slice(0, 300),
        aiDescription: (
          body.aiDescription ||
          body.aiRawOutput.mealTitle ||
          'AI Meal Analysis'
        ).slice(0, 300),
        aiRawOutput: body.aiRawOutput,
        userFinalOutput: body.userFinalOutput,
        userFeedbackNote: body.userFeedbackNote?.slice(0, 500),
      });

      return res.json(result);
    } catch (err) {
      return sendSafeError(
        req,
        res,
        'ai_training_event',
        err,
        'Failed to record meal feedback.'
      );
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
    const actor = await enforceAiAccessAndQuota(req, res, {
      guestAllowed: true,
      featureName: 'Weekly Nutrition Summary',
    });
    if (!actor) return;

    const payload = req.body || {};
    const authHeader = req.headers.authorization;
    const { url: supabaseUrl, publishableKey: anonKey } = getSupabaseConfig();

    if (authHeader && actor.authenticated) {
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
              window.location.origin
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
    const supportEmail = getSupportEmail();
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
      p, li { color: #94a3b8; font-size: 14px; }
      ul { padding-left: 20px; }
    </style>
  </head>
  <body>
    <h1>CALOTHRIX Privacy Policy</h1>
    <p>Effective Date: November 22, 2026</p>
    <h2>1. Information We Collect</h2>
    <p>When you sign in with Google or Email, CALOTHRIX stores your account identifier, name, email address, and profile avatar to authenticate your account and synchronize your nutrition logs, body metrics, water intake, saved meals, and weight history.</p>
    <h2>2. AI Processing of Images, Audio &amp; Text</h2>
    <p>When you explicitly use optional AI logging tools (Meal Photo Scan, Voice Meal Logging, Nutrition Label OCR, Barcode Image Reader, or Weekly Assessment Explanations), the submitted meal photo, voice recording/transcript, nutrition label photo, or text description is transmitted over HTTPS to our server and processed by Google Gemini API to generate structured nutrition estimates.</p>
    <ul>
      <li>AI nutrition values are estimates — you can always review and edit every item before saving.</li>
      <li>Do not include sensitive personal documents or identifying information in meal photos or audio recordings.</li>
      <li>If you use Guest Mode, diary records are stored locally in your browser until you sign in or clear browser data.</li>
    </ul>
    <h2>3. Data Storage &amp; Security</h2>
    <p>Signed-in user data is stored in Supabase PostgreSQL protected by Row-Level Security so only your authenticated account (and any trainer you explicitly approve) can access your records.</p>
    <h2>4. Data Export &amp; Account Deletion</h2>
    <p>CALOTHRIX does not sell your personal health or nutrition data. You can export your complete history (CSV or JSON) or permanently delete your account and stored data directly inside Profile &amp; Settings at any time. For privacy inquiries, contact ${supportEmail}.</p>
  </body>
</html>`);
  });

  app.get('/terms', (_req, res) => {
    const supportEmail = getSupportEmail();
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
    <p>Effective Date: November 22, 2026</p>
    <h2>1. Informational Use Only</h2>
    <p>CALOTHRIX provides calorie, macronutrient, hydration, and weight tracking tools and mathematical estimates for general wellness and informational purposes. It is not medical, diagnostic, or clinical nutrition advice.</p>
    <h2>2. User Accounts &amp; Fair Use</h2>
    <p>You are responsible for keeping your account credentials secure and using AI features fairly within published usage limits. Your logged nutrition entries remain private to your account.</p>
    <h2>3. Contact</h2>
    <p>For questions about these terms, contact ${supportEmail}.</p>
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
