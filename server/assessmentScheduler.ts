/**
 * Server-side 14-Day Adaptive Assessment Background Scheduler.
 *
 * Runs safely with SUPABASE_SERVICE_ROLE_KEY (gracefully disabled when absent).
 * Evaluates configured users whose 14-day cycle has elapsed and adaptive_paused /
 * manual_override_active are false, runs the deterministic engine + Gemini explanation,
 * and stores idempotent 'pending' recommendations without ever overwriting active targets.
 */

import { createServiceRoleSupabaseClient } from './security.ts';
import { generateWeeklyAssessmentExplanation } from './mealAiService.ts';
import { getGoalDisplayLabel } from '../src/utils/fitnessCalculator.ts';
import { addDaysToDateKey, getTodayDateKey } from '../src/utils/dateUtils.ts';
import {
  buildDailyNutritionSummaries,
  evaluateWeeklyAssessmentDueStatus,
  runDeterministicWeeklyAssessment,
} from '../src/utils/weeklyAssessmentEngine.ts';
import type {
  ActivityLevel,
  BiologicalSex,
  DietaryPreference,
  FoodRestriction,
  NutritionGoals,
  UserProfile,
  WeeklyAssessmentRecord,
  WeightEntry,
  WorkoutIntensity,
} from '../src/types/index.ts';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const INITIAL_DELAY_MS = 15 * 1000;

export interface SchedulerHandle {
  stop: () => void;
  runOnce: () => Promise<{ evaluated: number; created: number; skipped: number; errors: number }>;
}

function mapDbRowToAssessment(row: Record<string, unknown>): WeeklyAssessmentRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    weekStartDate: String(row.week_start_date),
    weekEndDate: String(row.week_end_date),
    assessmentWeekNumber: Number(row.assessment_week_number || 1),
    cycleDays: Number(row.cycle_days || 14),
    previousWeightKg: Number(row.previous_weight_kg || 0),
    assessedWeightKg: Number(row.assessed_weight_kg || 0),
    previousTrendWeightKg: Number(row.previous_trend_weight_kg || 0),
    assessedTrendWeightKg: Number(row.assessed_trend_weight_kg || 0),
    avgDailyCalories: Number(row.avg_daily_calories || 0),
    avgDailyProtein: Number(row.avg_daily_protein || 0),
    priorTdeeKcal: Number(row.prior_tdee_kcal || 0),
    calibratedTdeeKcal: Number(row.calibrated_tdee_kcal || 0),
    previousRecommendedCalories: Number(row.previous_recommended_calories || 0),
    recommendedCalories: Number(row.recommended_calories || 0),
    recommendedProtein: Number(row.recommended_protein || 0),
    recommendedCarbs: Number(row.recommended_carbs || 0),
    recommendedFat: Number(row.recommended_fat || 0),
    recommendedFibre: Number(row.recommended_fibre || 0),
    foodLoggedDays: Number(row.food_logged_days || 0),
    weightLoggedDays: Number(row.weight_logged_days || 0),
    adherencePercentage: Number(row.adherence_percentage || 0),
    confidenceLevel:
      row.confidence_level === 'high' || row.confidence_level === 'moderate'
        ? row.confidence_level
        : 'low',
    adjustmentType:
      (row.adjustment_type as WeeklyAssessmentRecord['adjustmentType']) || 'maintained',
    adjustmentReason: String(row.adjustment_reason || ''),
    goalCompleted: Boolean(row.goal_completed),
    suggestedMaintenanceCalories:
      row.suggested_maintenance_calories != null
        ? Number(row.suggested_maintenance_calories)
        : null,
    aiSummary:
      row.ai_summary && typeof row.ai_summary === 'object'
        ? (row.ai_summary as WeeklyAssessmentRecord['aiSummary'])
        : {
            headline: '14-Day Progress Review',
            bodyChangeAnalysis: '',
            calorieAdjustmentReason: String(row.adjustment_reason || ''),
            actionableTips: [],
            confidenceExplanation: '',
            provider: 'deterministic',
          },
    rationaleBullets: Array.isArray(row.rationale_bullets)
      ? (row.rationale_bullets as string[])
      : [],
    calculationVersion: String(row.calculation_version || 'calothrix-smart-v2.2'),
    status: row.status === 'applied' || row.status === 'dismissed' ? row.status : 'pending',
    appliedAt: row.applied_at ? String(row.applied_at) : null,
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

export function start15DayAssessmentScheduler(): SchedulerHandle {
  let running = false;
  let stopped = false;

  const runOnce = async () => {
    const summary = { evaluated: 0, created: 0, skipped: 0, errors: 0 };
    if (running || stopped) return summary;

    const sb = createServiceRoleSupabaseClient();
    if (!sb) {
      return summary;
    }

    running = true;
    try {
      const todayKey = getTodayDateKey();
      const historyStart = addDaysToDateKey(todayKey, -44);

      const { data: profiles, error: profErr } = await sb
        .from('profiles')
        .select('*')
        .gte('age', 14)
        .gte('height_cm', 120)
        .gte('current_weight_kg', 30)
        .limit(200);

      if (profErr || !Array.isArray(profiles)) {
        return summary;
      }

      for (const pRow of profiles as Record<string, unknown>[]) {
        if (stopped) break;
        const userId = String(pRow.user_id || '');
        if (!userId) continue;

        summary.evaluated += 1;
        if (Boolean(pRow.adaptive_paused) || Boolean(pRow.manual_override_active)) {
          summary.skipped += 1;
          continue;
        }

        try {
          const [goalsRes, weightsRes, foodsRes, assessmentsRes] = await Promise.all([
            sb.from('nutrition_goals').select('*').eq('user_id', userId).maybeSingle(),
            sb
              .from('weight_entries')
              .select('*')
              .eq('user_id', userId)
              .gte('date', historyStart)
              .lte('date', todayKey)
              .order('date', { ascending: true }),
            sb
              .from('food_entries')
              .select('date, calories, protein, carbs, fat, fibre')
              .eq('user_id', userId)
              .gte('date', historyStart)
              .lte('date', todayKey),
            sb
              .from('weekly_assessments')
              .select('*')
              .eq('user_id', userId)
              .order('week_end_date', { ascending: false })
              .limit(12),
          ]);

          const gRow = goalsRes.data as Record<string, unknown> | null;
          if (
            !gRow ||
            Number(gRow.calories || 0) <= 0 ||
            Boolean(gRow.manual_override_active) ||
            gRow.preset === 'custom'
          ) {
            summary.skipped += 1;
            continue;
          }

          const profile: UserProfile = {
            id: userId,
            name: String(pRow.name || ''),
            age: Number(pRow.age || 0),
            biologicalSex: (pRow.biological_sex as BiologicalSex) === 'female' ? 'female' : 'male',
            heightCm: Number(pRow.height_cm || 0),
            currentWeightKg: Number(pRow.current_weight_kg || 0),
            targetWeightKg: Number(pRow.target_weight_kg || pRow.current_weight_kg || 0),
            dailyAverageSteps: Number(pRow.daily_average_steps ?? 7000),
            activityLevel: (pRow.activity_level as ActivityLevel) || 'moderate',
            workoutFrequencyPerWeek: Number(pRow.workout_frequency ?? 3),
            workoutIntensity: (pRow.workout_intensity as WorkoutIntensity) || 'moderate',
            fitnessGoal: (pRow.fitness_goal as UserProfile['fitnessGoal']) || 'maintain_weight',
            goalSpeed: (pRow.goal_speed as UserProfile['goalSpeed']) || 'moderate',
            macroFocus: (pRow.macro_focus as UserProfile['macroFocus']) || 'balanced',
            bodyFatPct: pRow.body_fat_pct != null ? Number(pRow.body_fat_pct) : null,
            isPregnantOrBreastfeeding: Boolean(pRow.is_pregnant_or_breastfeeding),
            adaptiveTdeeKcal: pRow.adaptive_tdee_kcal != null ? Number(pRow.adaptive_tdee_kcal) : null,
            lastWeeklyAssessmentAt: pRow.last_weekly_assessment_at
              ? String(pRow.last_weekly_assessment_at)
              : null,
            adaptivePaused: Boolean(pRow.adaptive_paused),
            manualOverrideActive: Boolean(pRow.manual_override_active),
            cycleAnchorDate: pRow.cycle_anchor_date ? String(pRow.cycle_anchor_date) : null,
            onboardingCompleted: true,
            dietaryPreference: (pRow.dietary_preference as DietaryPreference) || 'omnivore',
            foodRestrictions: Array.isArray(pRow.food_restrictions)
              ? (pRow.food_restrictions as FoodRestriction[])
              : [],
            accountRole: 'individual',
            isDemoProfile: false,
          };

          const goals: NutritionGoals = {
            userId,
            preset: (gRow.preset as NutritionGoals['preset']) || 'custom',
            calories: Number(gRow.calories || 0),
            protein: Number(gRow.protein || 0),
            carbs: Number(gRow.carbs || 0),
            fat: Number(gRow.fat || 0),
            fibre: Number(gRow.fibre || 0),
            targetWeightKg:
              gRow.target_weight_kg != null ? Number(gRow.target_weight_kg) : profile.targetWeightKg,
            estimatedBmr: gRow.estimated_bmr != null ? Number(gRow.estimated_bmr) : undefined,
            estimatedTdee: gRow.estimated_tdee != null ? Number(gRow.estimated_tdee) : undefined,
            adaptiveTdeeKcal:
              gRow.adaptive_tdee_kcal != null ? Number(gRow.adaptive_tdee_kcal) : null,
            macroFocus: (gRow.macro_focus as NutritionGoals['macroFocus']) || profile.macroFocus,
            assessmentWeekNumber: Number(gRow.assessment_week_number || 0),
            initialCalculatedAt: gRow.initial_calculated_at
              ? String(gRow.initial_calculated_at)
              : gRow.updated_at
              ? String(gRow.updated_at)
              : undefined,
            calculationVersion: gRow.calculation_version
              ? String(gRow.calculation_version)
              : undefined,
            goalSpeed: (gRow.goal_speed as NutritionGoals['goalSpeed']) || profile.goalSpeed,
            manualOverrideActive: Boolean(gRow.manual_override_active),
            updatedAt: String(gRow.updated_at || new Date().toISOString()),
          };

          const weights: WeightEntry[] = ((weightsRes.data || []) as Record<string, unknown>[]).map(
            (w) => ({
              id: String(w.id),
              userId,
              weightKg: Number(w.weight_kg),
              date: String(w.date),
              notes: w.notes ? String(w.notes) : undefined,
              createdAt: String(w.created_at || new Date().toISOString()),
              updatedAt: String(w.updated_at || new Date().toISOString()),
            })
          );

          const foods = ((foodsRes.data || []) as Record<string, unknown>[]).map((f) => ({
            date: String(f.date),
            calories: Number(f.calories || 0),
            protein: Number(f.protein || 0),
            carbs: Number(f.carbs || 0),
            fat: Number(f.fat || 0),
            fibre: Number(f.fibre || 0),
          }));

          const existingAssessments = ((assessmentsRes.data || []) as Record<string, unknown>[]).map(
            mapDbRowToAssessment
          );

          const dueStatus = evaluateWeeklyAssessmentDueStatus({
            profile,
            goals,
            weightEntries: weights,
            foodEntries: foods,
            weeklyAssessments: existingAssessments,
            todayDateKey: todayKey,
          });

          if (!dueStatus.isDue || dueStatus.hasExistingForPeriod) {
            summary.skipped += 1;
            continue;
          }

          const dailyNutrition = buildDailyNutritionSummaries(foods, historyStart, todayKey);
          const deterministic = runDeterministicWeeklyAssessment({
            userId,
            profile,
            goals,
            weightEntries: weights,
            dailyNutrition,
            previousAssessments: existingAssessments,
            referenceDateKey: todayKey,
          });

          const aiSummary = await generateWeeklyAssessmentExplanation({
            assessment: deterministic,
            dietaryPreference: profile.dietaryPreference,
            foodRestrictions: profile.foodRestrictions,
            goalLabel: getGoalDisplayLabel(deterministic.normalizedGoal),
          });

          const nowIso = new Date().toISOString();
          const basePayload = {
            user_id: userId,
            week_start_date: deterministic.weekStartDate,
            week_end_date: deterministic.weekEndDate,
            assessment_week_number: deterministic.assessmentWeekNumber,
            previous_weight_kg: deterministic.weightAnalysis.previousMeasuredWeightKg,
            assessed_weight_kg: deterministic.weightAnalysis.latestMeasuredWeightKg,
            previous_trend_weight_kg: deterministic.weightAnalysis.previousTrendWeightKg,
            assessed_trend_weight_kg: deterministic.weightAnalysis.assessedTrendWeightKg,
            avg_daily_calories: deterministic.avgDailyCalories,
            avg_daily_protein: deterministic.avgDailyProtein,
            prior_tdee_kcal: deterministic.priorTdeeKcal,
            calibrated_tdee_kcal: deterministic.calibratedTdeeKcal,
            previous_recommended_calories: deterministic.previousRecommendedCalories,
            recommended_calories: deterministic.recommendedCalories,
            recommended_protein: deterministic.recommendedProtein,
            recommended_carbs: deterministic.recommendedCarbs,
            recommended_fat: deterministic.recommendedFat,
            recommended_fibre: deterministic.recommendedFibre,
            recommended_hydration_ml: deterministic.recommendedHydrationMl,
            food_logged_days: deterministic.foodLoggedDays,
            weight_logged_days: deterministic.weightLoggedDays,
            adherence_percentage: deterministic.adherencePercentage,
            confidence_level: deterministic.confidenceLevel,
            adjustment_type: deterministic.adjustmentType,
            adjustment_reason: deterministic.adjustmentReason,
            goal_completed: deterministic.goalCompleted,
            suggested_maintenance_calories: deterministic.suggestedMaintenanceCalories,
            ai_summary: aiSummary,
            rationale_bullets: deterministic.rationaleBullets,
            calculation_version: deterministic.calculationVersion,
            status: 'pending',
            updated_at: nowIso,
          };

          const { error: upsertErr } = await sb
            .from('weekly_assessments')
            .upsert(
              {
                ...basePayload,
                cycle_days: deterministic.cycleDays,
                assessment_status_tag: deterministic.statusTag,
                structured_ai_output: aiSummary.structured ?? null,
                avg_daily_carbs: deterministic.avgDailyCarbs,
                avg_daily_fat: deterministic.avgDailyFat,
                avg_daily_fibre: deterministic.avgDailyFibre,
              },
              { onConflict: 'user_id,week_start_date,week_end_date' }
            );

          if (upsertErr) {
            await sb
              .from('weekly_assessments')
              .upsert(basePayload, { onConflict: 'user_id,week_start_date,week_end_date' });
          }

          summary.created += 1;
        } catch {
          summary.errors += 1;
        }
      }
    } catch {
      summary.errors += 1;
    } finally {
      running = false;
    }
    return summary;
  };

  const initialTimer = setTimeout(() => {
    void runOnce();
  }, INITIAL_DELAY_MS);
  if (typeof initialTimer.unref === 'function') initialTimer.unref();

  const intervalTimer = setInterval(() => {
    void runOnce();
  }, SIX_HOURS_MS);
  if (typeof intervalTimer.unref === 'function') intervalTimer.unref();

  return {
    stop: () => {
      stopped = true;
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    },
    runOnce,
  };
}
