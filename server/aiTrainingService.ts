import fs from 'fs';
import crypto from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AiDailyMetricPoint,
  AiEditDiffSummary,
  AiItemCorrectionDiff,
  AiLearnedPrior,
  AiPerformanceInsightsResponse,
  AiTrainingEvent,
  AiTrainingInputMode,
  AiTrainingPayloadSnapshot,
  AiTrainingRun,
} from '../src/types/index.ts';
import { getSupabaseConfig } from './security.ts';

const FALLBACK_STORE_PATH = '/tmp/calothrix-ai-training-store.json';
const CACHE_TTL_MS = 60 * 1000;
const MISSING_TABLE_BACKOFF_MS = 5 * 60 * 1000;

interface CachedTrainingSnapshot {
  events: AiTrainingEvent[];
  priors: AiLearnedPrior[];
  runs: AiTrainingRun[];
  backend: 'supabase' | 'hybrid_fallback';
  expiresAt: number;
}

let cachedTrainingSnapshot: CachedTrainingSnapshot | null = null;
let tablesMissingUntil = 0;

function invalidateTrainingCache(): void {
  cachedTrainingSnapshot = null;
}

interface FallbackTrainingStore {
  events: AiTrainingEvent[];
  priors: AiLearnedPrior[];
  runs: AiTrainingRun[];
  lastAutoDailyDate?: string;
}

function getTrainingSupabase(userToken?: string): SupabaseClient | null {
  const { url, publishableKey, serviceRoleKey } = getSupabaseConfig();
  const key = serviceRoleKey || publishableKey;
  if (!url || !key) return null;

  if (userToken && !serviceRoleKey) {
    return createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${userToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function readFallbackStore(): FallbackTrainingStore {
  try {
    if (fs.existsSync(FALLBACK_STORE_PATH)) {
      const raw = fs.readFileSync(FALLBACK_STORE_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<FallbackTrainingStore>;
      return {
        events: Array.isArray(parsed.events) ? parsed.events : [],
        priors: Array.isArray(parsed.priors) ? parsed.priors : [],
        runs: Array.isArray(parsed.runs) ? parsed.runs : [],
        lastAutoDailyDate: parsed.lastAutoDailyDate,
      };
    }
  } catch {
    // Ignore read issues and return empty store
  }
  return { events: [], priors: [], runs: [] };
}

function writeFallbackStore(store: FallbackTrainingStore): void {
  try {
    fs.writeFileSync(FALLBACK_STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
  } catch {
    // Ignore fs errors in read-only sandboxes
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function normalizeFoodKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(medium|small|large|bowl|plate|serving|cup|katori|piece|pieces|pc|pcs|gms?|grams?)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function computeReinforcementDiffAndReward(
  aiRaw: AiTrainingPayloadSnapshot,
  userFinal: AiTrainingPayloadSnapshot
): {
  userChanged: boolean;
  editDiffSummary: AiEditDiffSummary;
  rewardScore: number;
} {
  const aiItems = aiRaw.items || [];
  const userItems = userFinal.items || [];
  const totalItemCount = Math.max(aiItems.length, userItems.length, 1);

  const itemCorrections: AiItemCorrectionDiff[] = [];
  const editedFieldsSet = new Set<string>();
  let editedItemCount = 0;

  for (let i = 0; i < totalItemCount; i++) {
    const aiItem = aiItems[i];
    const userItem = userItems[i];

    if (!aiItem && userItem) {
      editedItemCount += 1;
      editedFieldsSet.add('item_added');
      itemCorrections.push({
        aiName: '(none)',
        userName: userItem.name,
        aiGrams: 0,
        userGrams: userItem.estimatedGrams,
        aiCalories: 0,
        userCalories: userItem.calories,
        kcalDelta: Math.round(userItem.calories),
        gramsDelta: Math.round(userItem.estimatedGrams),
        changedFields: ['item_added'],
      });
      continue;
    }

    if (aiItem && !userItem) {
      editedItemCount += 1;
      editedFieldsSet.add('item_removed');
      itemCorrections.push({
        aiName: aiItem.name,
        userName: '(removed)',
        aiGrams: aiItem.estimatedGrams,
        userGrams: 0,
        aiCalories: aiItem.calories,
        userCalories: 0,
        kcalDelta: -Math.round(aiItem.calories),
        gramsDelta: -Math.round(aiItem.estimatedGrams),
        changedFields: ['item_removed'],
      });
      continue;
    }

    if (!aiItem || !userItem) continue;

    const changedFields: string[] = [];
    if (aiItem.name.trim().toLowerCase() !== userItem.name.trim().toLowerCase()) {
      changedFields.push('name');
      editedFieldsSet.add('name');
    }
    if (Math.abs((userItem.estimatedGrams || 0) - (aiItem.estimatedGrams || 0)) >= 2) {
      changedFields.push('grams');
      editedFieldsSet.add('grams');
    }
    if (Math.abs((userItem.calories || 0) - (aiItem.calories || 0)) >= 3) {
      changedFields.push('calories');
      editedFieldsSet.add('calories');
    }
    if (Math.abs((userItem.protein || 0) - (aiItem.protein || 0)) >= 0.5) {
      changedFields.push('protein');
      editedFieldsSet.add('protein');
    }
    if (Math.abs((userItem.carbs || 0) - (aiItem.carbs || 0)) >= 0.5) {
      changedFields.push('carbs');
      editedFieldsSet.add('carbs');
    }
    if (Math.abs((userItem.fat || 0) - (aiItem.fat || 0)) >= 0.5) {
      changedFields.push('fat');
      editedFieldsSet.add('fat');
    }
    if (Math.abs((userItem.fibre || 0) - (aiItem.fibre || 0)) >= 0.5) {
      changedFields.push('fibre');
      editedFieldsSet.add('fibre');
    }

    if (changedFields.length > 0) {
      editedItemCount += 1;
      itemCorrections.push({
        aiName: aiItem.name,
        userName: userItem.name,
        aiGrams: Math.round(aiItem.estimatedGrams || 0),
        userGrams: Math.round(userItem.estimatedGrams || 0),
        aiCalories: Math.round(aiItem.calories || 0),
        userCalories: Math.round(userItem.calories || 0),
        kcalDelta: Math.round((userItem.calories || 0) - (aiItem.calories || 0)),
        gramsDelta: Math.round((userItem.estimatedGrams || 0) - (aiItem.estimatedGrams || 0)),
        changedFields,
      });
    }
  }

  const aiTotalGrams = aiItems.reduce((s, x) => s + (x.estimatedGrams || 0), 0);
  const userTotalGrams = userItems.reduce((s, x) => s + (x.estimatedGrams || 0), 0);

  const kcalDelta = Math.round((userFinal.totalCalories || 0) - (aiRaw.totalCalories || 0));
  const kcalDeltaPct = round1(
    (Math.abs(kcalDelta) / Math.max(100, userFinal.totalCalories || aiRaw.totalCalories || 100)) * 100
  );
  const gramsDelta = Math.round(userTotalGrams - aiTotalGrams);
  const proteinDelta = round1((userFinal.totalProtein || 0) - (aiRaw.totalProtein || 0));
  const carbsDelta = round1((userFinal.totalCarbs || 0) - (aiRaw.totalCarbs || 0));
  const fatDelta = round1((userFinal.totalFat || 0) - (aiRaw.totalFat || 0));

  const userChanged =
    editedItemCount > 0 ||
    Math.abs(kcalDelta) >= 3 ||
    Math.abs(gramsDelta) >= 2 ||
    Math.abs(proteinDelta) >= 0.5 ||
    Math.abs(carbsDelta) >= 0.5 ||
    Math.abs(fatDelta) >= 0.5;

  let rewardScore = 1.0;
  if (userChanged) {
    const kcalErrorRatio = Math.abs(kcalDelta) / Math.max(120, userFinal.totalCalories || 120);
    const itemEditRatio = editedItemCount / totalItemCount;
    const rawPenalty = Math.min(1.0, 0.15 + kcalErrorRatio * 1.15 + itemEditRatio * 0.45);
    rewardScore = -round2(rawPenalty);
  }

  return {
    userChanged,
    editDiffSummary: {
      kcalDelta,
      kcalDeltaPct,
      gramsDelta,
      proteinDelta,
      carbsDelta,
      fatDelta,
      editedItemCount,
      totalItemCount,
      editedFields: Array.from(editedFieldsSet),
      itemCorrections,
    },
    rewardScore,
  };
}

function mapEventRow(row: Record<string, unknown>): AiTrainingEvent {
  return {
    id: String(row.id),
    userId: row.user_id ? String(row.user_id) : null,
    inputMode: (row.input_mode as AiTrainingInputMode) || 'photo',
    prepStyle: String(row.prep_style || 'standard'),
    userInputText: row.user_input_text ? String(row.user_input_text) : undefined,
    imageStoragePath: row.image_storage_path ? String(row.image_storage_path) : undefined,
    aiDescription: String(row.ai_description || ''),
    aiRawOutput: (row.ai_raw_output || {}) as AiTrainingPayloadSnapshot,
    userFinalOutput: (row.user_final_output || {}) as AiTrainingPayloadSnapshot,
    userChanged: Boolean(row.user_changed),
    editDiffSummary: (row.edit_diff_summary || {}) as AiEditDiffSummary,
    rewardScore: Number(row.reward_score ?? 1),
    userFeedbackNote: row.user_feedback_note ? String(row.user_feedback_note) : undefined,
    verifiedForTraining: Boolean(row.verified_for_training),
    verifiedBy: row.verified_by ? String(row.verified_by) : undefined,
    verifiedAt: row.verified_at ? String(row.verified_at) : undefined,
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

function mapPriorRow(row: Record<string, unknown>): AiLearnedPrior {
  return {
    id: String(row.id),
    foodKey: String(row.food_key),
    displayName: String(row.display_name),
    inputMode: String(row.input_mode || 'all'),
    canonicalDescription: String(row.canonical_description || ''),
    avgServingGrams: Number(row.avg_serving_grams || 100),
    avgCalories: Number(row.avg_calories || 0),
    avgProtein: Number(row.avg_protein || 0),
    avgCarbs: Number(row.avg_carbs || 0),
    avgFat: Number(row.avg_fat || 0),
    avgFibre: Number(row.avg_fibre || 0),
    correctionPattern: row.correction_pattern ? String(row.correction_pattern) : undefined,
    sampleCount: Number(row.sample_count || 1),
    avgRewardScore: Number(row.avg_reward_score || 0),
    confidenceWeight: Number(row.confidence_weight || 0.5),
    isVerifiedShared: Boolean(row.is_verified_shared),
    updatedAt: String(row.updated_at || new Date().toISOString()),
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

function mapRunRow(row: Record<string, unknown>): AiTrainingRun {
  return {
    id: String(row.id),
    runType: (row.run_type as AiTrainingRun['runType']) || 'reinforcement_calibration',
    eventsProcessed: Number(row.events_processed || 0),
    verifiedEventsCount: Number(row.verified_events_count || 0),
    editedEventsCount: Number(row.edited_events_count || 0),
    priorsUpdatedCount: Number(row.priors_updated_count || 0),
    meanRewardScore: Number(row.mean_reward_score || 0),
    meanCalorieMae: Number(row.mean_calorie_mae || 0),
    acceptanceRatePct: Number(row.acceptance_rate_pct || 100),
    notes: row.notes ? String(row.notes) : undefined,
    triggeredBy: row.triggered_by ? String(row.triggered_by) : undefined,
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

async function fetchAllEventsAndPriors(
  userToken?: string,
  options?: { bypassCache?: boolean }
): Promise<{
  events: AiTrainingEvent[];
  priors: AiLearnedPrior[];
  runs: AiTrainingRun[];
  backend: 'supabase' | 'hybrid_fallback';
}> {
  if (
    !options?.bypassCache &&
    !userToken &&
    cachedTrainingSnapshot &&
    Date.now() < cachedTrainingSnapshot.expiresAt
  ) {
    return {
      events: cachedTrainingSnapshot.events,
      priors: cachedTrainingSnapshot.priors,
      runs: cachedTrainingSnapshot.runs,
      backend: cachedTrainingSnapshot.backend,
    };
  }

  const sb = Date.now() < tablesMissingUntil ? null : getTrainingSupabase(userToken);
  const fallback = readFallbackStore();
  let backend: 'supabase' | 'hybrid_fallback' = 'hybrid_fallback';

  let dbEvents: AiTrainingEvent[] = [];
  let dbPriors: AiLearnedPrior[] = [];
  let dbRuns: AiTrainingRun[] = [];

  if (sb) {
    try {
      const [evRes, prRes, rnRes] = await Promise.all([
        sb
          .from('ai_training_events')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(400),
        sb
          .from('ai_learned_priors')
          .select('*')
          .order('sample_count', { ascending: false })
          .limit(200),
        sb
          .from('ai_training_runs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(40),
      ]);

      const errCode = (evRes.error as { code?: string } | null)?.code;
      if (errCode === '42P01' || errCode === 'PGRST205') {
        tablesMissingUntil = Date.now() + MISSING_TABLE_BACKOFF_MS;
      }

      if (!evRes.error && evRes.data) {
        backend = 'supabase';
        dbEvents = evRes.data.map((r) => mapEventRow(r as Record<string, unknown>));
      }
      if (!prRes.error && prRes.data) {
        dbPriors = prRes.data.map((r) => mapPriorRow(r as Record<string, unknown>));
      }
      if (!rnRes.error && rnRes.data) {
        dbRuns = rnRes.data.map((r) => mapRunRow(r as Record<string, unknown>));
      }
    } catch {
      // Gracefully merge fallback store below
    }
  }

  const eventMap = new Map<string, AiTrainingEvent>();
  for (const ev of fallback.events) eventMap.set(ev.id, ev);
  for (const ev of dbEvents) eventMap.set(ev.id, ev);

  const priorMap = new Map<string, AiLearnedPrior>();
  for (const pr of fallback.priors) priorMap.set(pr.foodKey, pr);
  for (const pr of dbPriors) priorMap.set(pr.foodKey, pr);

  const runMap = new Map<string, AiTrainingRun>();
  for (const rn of fallback.runs) runMap.set(rn.id, rn);
  for (const rn of dbRuns) runMap.set(rn.id, rn);

  const sortDesc = <T extends { createdAt: string }>(arr: T[]) =>
    arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const snapshot = {
    events: sortDesc(Array.from(eventMap.values())),
    priors: Array.from(priorMap.values()).sort((a, b) => b.sampleCount - a.sampleCount),
    runs: sortDesc(Array.from(runMap.values())),
    backend,
  };

  if (!userToken) {
    cachedTrainingSnapshot = {
      ...snapshot,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
  }

  return snapshot;
}

export async function recordAiTrainingEvent(params: {
  userId?: string | null;
  userToken?: string;
  inputMode: AiTrainingInputMode;
  prepStyle?: string;
  userInputText?: string;
  imageStoragePath?: string;
  aiDescription: string;
  aiRawOutput: AiTrainingPayloadSnapshot;
  userFinalOutput: AiTrainingPayloadSnapshot;
  userFeedbackNote?: string;
}): Promise<{ ok: boolean; event: AiTrainingEvent; storage: 'supabase' | 'hybrid_fallback' }> {
  const { userChanged, editDiffSummary, rewardScore } = computeReinforcementDiffAndReward(
    params.aiRawOutput,
    params.userFinalOutput
  );

  // Unedited accepted logs (+1.0) or explicit user corrections are queued for training;
  // admin can verify/curate or daily auto-training promotes high-consensus records.
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const event: AiTrainingEvent = {
    id,
    userId: params.userId || null,
    inputMode: params.inputMode,
    prepStyle: params.prepStyle || 'standard',
    userInputText: params.userInputText?.trim() || undefined,
    imageStoragePath: params.imageStoragePath?.trim() || undefined,
    aiDescription: params.aiDescription.trim() || params.aiRawOutput.mealTitle || 'AI Meal Analysis',
    aiRawOutput: params.aiRawOutput,
    userFinalOutput: params.userFinalOutput,
    userChanged,
    editDiffSummary,
    rewardScore,
    userFeedbackNote: params.userFeedbackNote?.trim() || undefined,
    verifiedForTraining: false,
    createdAt: now,
  };

  let storage: 'supabase' | 'hybrid_fallback' = 'hybrid_fallback';
  const sb = getTrainingSupabase(params.userToken);

  if (sb) {
    try {
      const { data, error } = await sb
        .from('ai_training_events')
        .insert({
          id: event.id,
          user_id: event.userId || null,
          input_mode: event.inputMode,
          prep_style: event.prepStyle,
          user_input_text: event.userInputText || null,
          image_storage_path: event.imageStoragePath || null,
          ai_description: event.aiDescription,
          ai_raw_output: event.aiRawOutput,
          user_final_output: event.userFinalOutput,
          user_changed: event.userChanged,
          edit_diff_summary: event.editDiffSummary,
          reward_score: event.rewardScore,
          user_feedback_note: event.userFeedbackNote || null,
          verified_for_training: false,
        })
        .select('*')
        .single();

      if (!error && data) {
        storage = 'supabase';
        event.id = String(data.id);
        event.createdAt = String(data.created_at || now);
      }
    } catch {
      // Fallback store handles continuity below
    }
  }

  const store = readFallbackStore();
  store.events = [event, ...store.events.filter((e) => e.id !== event.id)].slice(0, 400);
  writeFallbackStore(store);
  invalidateTrainingCache();

  // Run lightweight daily / self-calibration check asynchronously
  void ensureDailySelfTraining(params.userToken);

  return { ok: true, event, storage };
}

function buildPriorUpdatesFromEvents(
  events: AiTrainingEvent[],
  existingPriors: AiLearnedPrior[]
): AiLearnedPrior[] {
  const existingMap = new Map(existingPriors.map((p) => [p.foodKey, p]));
  const buckets = new Map<
    string,
    {
      displayName: string;
      modeCounts: Map<string, number>;
      descriptions: string[];
      samples: Array<{
        grams: number;
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        fibre: number;
        kcalDelta: number;
        rewardScore: number;
        verified: boolean;
      }>;
    }
  >();

  // Only train shared model priors from verified events OR accepted (+1.0) / clear user edits
  const eligibleEvents = events.filter((ev) => ev.verifiedForTraining || ev.userChanged || ev.rewardScore >= 0.9);

  for (const ev of eligibleEvents) {
    const items = ev.userFinalOutput?.items || [];
    const aiItems = ev.aiRawOutput?.items || [];
    for (let i = 0; i < items.length; i++) {
      const uItem = items[i];
      if (!uItem?.name || uItem.estimatedGrams <= 0) continue;
      const key = normalizeFoodKey(uItem.name);
      if (key.length < 2) continue;

      const aiItem = aiItems[i];
      const kcalDelta = aiItem ? (uItem.calories || 0) - (aiItem.calories || 0) : 0;

      const existingBucket = buckets.get(key) || {
        displayName: uItem.name.trim(),
        modeCounts: new Map<string, number>(),
        descriptions: [],
        samples: [],
      };
      existingBucket.modeCounts.set(
        ev.inputMode,
        (existingBucket.modeCounts.get(ev.inputMode) || 0) + 1
      );
      if (ev.aiDescription && existingBucket.descriptions.length < 3) {
        existingBucket.descriptions.push(ev.aiDescription);
      }
      // Weight verified training records 2x during aggregation by adding duplicate sample
      const sample = {
        grams: uItem.estimatedGrams,
        calories: uItem.calories,
        protein: uItem.protein,
        carbs: uItem.carbs,
        fat: uItem.fat,
        fibre: uItem.fibre,
        kcalDelta,
        rewardScore: ev.rewardScore,
        verified: ev.verifiedForTraining,
      };
      existingBucket.samples.push(sample);
      if (ev.verifiedForTraining) existingBucket.samples.push(sample);
      buckets.set(key, existingBucket);
    }
  }

  const now = new Date().toISOString();
  const resultPriors: AiLearnedPrior[] = [...existingPriors];
  const resultMap = new Map(resultPriors.map((p) => [p.foodKey, p]));

  buckets.forEach((bucket, foodKey) => {
    const n = bucket.samples.length;
    if (n === 0) return;

    const avg = (fn: (s: (typeof bucket.samples)[number]) => number) =>
      bucket.samples.reduce((sum, s) => sum + fn(s), 0) / n;

    const avgGrams = Math.max(1, Math.round(avg((s) => s.grams)));
    const avgKcal = Math.max(0, Math.round(avg((s) => s.calories)));
    const avgP = round1(avg((s) => s.protein));
    const avgC = round1(avg((s) => s.carbs));
    const avgF = round1(avg((s) => s.fat));
    const avgFib = round1(avg((s) => s.fibre));
    const avgKcalDelta = Math.round(avg((s) => s.kcalDelta));
    const avgReward = round2(avg((s) => s.rewardScore));
    const hasVerified = bucket.samples.some((s) => s.verified);

    let topMode = 'all';
    let topCount = 0;
    bucket.modeCounts.forEach((count, mode) => {
      if (count > topCount) {
        topCount = count;
        topMode = mode;
      }
    });

    const correctionPattern =
      Math.abs(avgKcalDelta) >= 12
        ? `AI historically ${avgKcalDelta > 0 ? 'underestimated' : 'overestimated'} by ${Math.abs(
            avgKcalDelta
          )} kcal/serving; verified user benchmark = ${avgGrams}g (${avgKcal} kcal, P ${avgP}g / C ${avgC}g / F ${avgF}g).`
        : `High user alignment (${avgGrams}g serving ≈ ${avgKcal} kcal, P ${avgP}g / C ${avgC}g / F ${avgF}g).`;

    const prev = existingMap.get(foodKey);
    const updated: AiLearnedPrior = {
      id: prev?.id || crypto.randomUUID(),
      foodKey,
      displayName: prev?.displayName || bucket.displayName,
      inputMode: topMode,
      canonicalDescription: bucket.descriptions[0] || prev?.canonicalDescription || bucket.displayName,
      avgServingGrams: avgGrams,
      avgCalories: avgKcal,
      avgProtein: avgP,
      avgCarbs: avgC,
      avgFat: avgF,
      avgFibre: avgFib,
      correctionPattern,
      sampleCount: Math.max(n, prev?.sampleCount || 0),
      avgRewardScore: avgReward,
      confidenceWeight: round2(Math.min(1, 0.4 + n * 0.12 + (hasVerified ? 0.25 : 0))),
      isVerifiedShared: prev ? prev.isVerifiedShared : hasVerified || n >= 1,
      updatedAt: now,
      createdAt: prev?.createdAt || now,
    };
    resultMap.set(foodKey, updated);
  });

  return Array.from(resultMap.values()).sort((a, b) => b.sampleCount - a.sampleCount);
}

export async function runReinforcementTrainingCycle(params: {
  runType?: AiTrainingRun['runType'];
  triggeredBy?: string;
  userToken?: string;
}): Promise<{ ok: boolean; run: AiTrainingRun; priorsUpdated: number }> {
  const { events, priors } = await fetchAllEventsAndPriors(params.userToken);
  const updatedPriors = buildPriorUpdatesFromEvents(events, priors);

  const totalEvents = events.length;
  const editedEvents = events.filter((e) => e.userChanged).length;
  const verifiedEvents = events.filter((e) => e.verifiedForTraining).length;
  const acceptanceRatePct =
    totalEvents > 0
      ? round1(((totalEvents - editedEvents) / totalEvents) * 100)
      : 100;
  const meanRewardScore =
    totalEvents > 0
      ? round2(events.reduce((s, e) => s + e.rewardScore, 0) / totalEvents)
      : 1.0;
  const meanCalorieMae =
    totalEvents > 0
      ? Math.round(
          events.reduce((s, e) => s + Math.abs(e.editDiffSummary?.kcalDelta || 0), 0) /
            totalEvents
        )
      : 0;

  const run: AiTrainingRun = {
    id: crypto.randomUUID(),
    runType: params.runType || 'manual_admin',
    eventsProcessed: totalEvents,
    verifiedEventsCount: verifiedEvents,
    editedEventsCount: editedEvents,
    priorsUpdatedCount: updatedPriors.length,
    meanRewardScore,
    meanCalorieMae,
    acceptanceRatePct,
    notes: `Calibrated ${updatedPriors.length} dish priors from ${totalEvents} user events (${editedEvents} penalized corrections, ${verifiedEvents} admin-verified).`,
    triggeredBy: params.triggeredBy,
    createdAt: new Date().toISOString(),
  };

  const sb = getTrainingSupabase(params.userToken);
  if (sb) {
    try {
      if (updatedPriors.length > 0) {
        const priorRows = updatedPriors.map((p) => ({
          id: p.id,
          food_key: p.foodKey,
          display_name: p.displayName,
          input_mode: p.inputMode,
          canonical_description: p.canonicalDescription,
          avg_serving_grams: p.avgServingGrams,
          avg_calories: p.avgCalories,
          avg_protein: p.avgProtein,
          avg_carbs: p.avgCarbs,
          avg_fat: p.avgFat,
          avg_fibre: p.avgFibre,
          correction_pattern: p.correctionPattern || null,
          sample_count: p.sampleCount,
          avg_reward_score: p.avgRewardScore,
          confidence_weight: p.confidenceWeight,
          is_verified_shared: p.isVerifiedShared,
          updated_at: p.updatedAt,
        }));
        await sb.from('ai_learned_priors').upsert(priorRows, { onConflict: 'food_key' });
      }

      await sb.from('ai_training_runs').insert({
        id: run.id,
        run_type: run.runType,
        events_processed: run.eventsProcessed,
        verified_events_count: run.verifiedEventsCount,
        edited_events_count: run.editedEventsCount,
        priors_updated_count: run.priorsUpdatedCount,
        mean_reward_score: run.meanRewardScore,
        mean_calorie_mae: run.meanCalorieMae,
        acceptance_rate_pct: run.acceptanceRatePct,
        notes: run.notes || null,
        triggered_by: params.triggeredBy || null,
      });
    } catch {
      // Mirror into local fallback store below
    }
  }

  const store = readFallbackStore();
  store.priors = updatedPriors;
  store.runs = [run, ...store.runs].slice(0, 40);
  store.lastAutoDailyDate = new Date().toISOString().slice(0, 10);
  writeFallbackStore(store);
  invalidateTrainingCache();

  return { ok: true, run, priorsUpdated: updatedPriors.length };
}

export async function ensureDailySelfTraining(userToken?: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const store = readFallbackStore();
  if (store.lastAutoDailyDate === today) return;

  const { events } = await fetchAllEventsAndPriors(userToken);
  if (events.length === 0) {
    store.lastAutoDailyDate = today;
    writeFallbackStore(store);
    return;
  }

  await runReinforcementTrainingCycle({
    runType: 'auto_daily',
    userToken,
  });
}

export async function verifyTrainingEventAndPromote(params: {
  eventId: string;
  verified: boolean;
  adminUserId?: string;
  userToken?: string;
}): Promise<{ ok: boolean; event?: AiTrainingEvent; error?: string }> {
  const { events } = await fetchAllEventsAndPriors(params.userToken);
  const target = events.find((e) => e.id === params.eventId);
  if (!target) {
    return { ok: false, error: 'Training event not found.' };
  }

  const now = new Date().toISOString();
  const updatedEvent: AiTrainingEvent = {
    ...target,
    verifiedForTraining: params.verified,
    verifiedBy: params.verified ? params.adminUserId : undefined,
    verifiedAt: params.verified ? now : undefined,
  };

  const sb = getTrainingSupabase(params.userToken);
  if (sb) {
    try {
      await sb
        .from('ai_training_events')
        .update({
          verified_for_training: params.verified,
          verified_by: params.verified ? params.adminUserId || null : null,
          verified_at: params.verified ? now : null,
        })
        .eq('id', params.eventId);
    } catch {
      // Fallback handled below
    }
  }

  const store = readFallbackStore();
  const idx = store.events.findIndex((e) => e.id === params.eventId);
  if (idx >= 0) store.events[idx] = updatedEvent;
  else store.events.unshift(updatedEvent);
  writeFallbackStore(store);
  invalidateTrainingCache();

  if (params.verified) {
    await runReinforcementTrainingCycle({
      runType: 'auto_feedback',
      triggeredBy: params.adminUserId,
      userToken: params.userToken,
    });
  }

  return { ok: true, event: updatedEvent };
}

export async function updateLearnedPriorSharedStatus(params: {
  priorId: string;
  isVerifiedShared: boolean;
  userToken?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const sb = getTrainingSupabase(params.userToken);
  if (sb) {
    try {
      await sb
        .from('ai_learned_priors')
        .update({
          is_verified_shared: params.isVerifiedShared,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.priorId);
    } catch {
      // Continue to fallback update
    }
  }

  const store = readFallbackStore();
  store.priors = store.priors.map((p) =>
    p.id === params.priorId
      ? { ...p, isVerifiedShared: params.isVerifiedShared, updatedAt: new Date().toISOString() }
      : p
  );
  writeFallbackStore(store);
  invalidateTrainingCache();
  return { ok: true };
}

export async function getReinforcementPromptContext(queryHint?: string): Promise<string> {
  try {
    const { events, priors } = await fetchAllEventsAndPriors();
    const sharedPriors = priors.filter((p) => p.isVerifiedShared);
    if (sharedPriors.length === 0 && events.length === 0) return '';

    const cleanHint = normalizeFoodKey(queryHint || '');
    const tokens = cleanHint.split(' ').filter((t) => t.length >= 2);

    const scoredPriors = sharedPriors
      .map((p) => {
        let relevance = p.sampleCount * 2 + (p.avgRewardScore < 0 ? 5 : 1);
        for (const tok of tokens) {
          if (p.foodKey.includes(tok) || p.displayName.toLowerCase().includes(tok)) {
            relevance += 30;
          }
        }
        return { p, relevance };
      })
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 8)
      .map((x) => x.p);

    const recentPenalized = events
      .filter((e) => e.userChanged && e.rewardScore <= -0.25)
      .slice(0, 4);

    const lines: string[] = [];
    if (scoredPriors.length > 0) {
      lines.push(
        'VERIFIED COMMUNITY REINFORCEMENT PRIORS (learned from verified user corrections — prioritize these portion weights & macros when matching dishes):'
      );
      for (const p of scoredPriors) {
        lines.push(
          `- ${p.displayName}: ${p.avgServingGrams}g serving = ${p.avgCalories} kcal (P ${p.avgProtein}g, C ${p.avgCarbs}g, F ${p.avgFat}g, Fibre ${p.avgFibre}g)${
            p.correctionPattern ? ` | Lesson: ${p.correctionPattern}` : ''
          }`
        );
      }
    }

    if (recentPenalized.length > 0) {
      lines.push('RECENT PENALIZED MISTAKES TO AVOID:');
      for (const ev of recentPenalized) {
        const diff = ev.editDiffSummary;
        const sign = (diff?.kcalDelta || 0) >= 0 ? '+' : '';
        lines.push(
          `- "${ev.aiDescription}" was corrected by ${sign}${diff?.kcalDelta || 0} kcal (${sign}${
            diff?.gramsDelta || 0
          }g)${ev.userFeedbackNote ? ` · User note: "${ev.userFeedbackNote}"` : ''}`
        );
      }
    }

    return lines.join('\n');
  } catch {
    return '';
  }
}

export async function getAdminAiInsightsDashboard(
  userToken?: string
): Promise<AiPerformanceInsightsResponse> {
  const { events, priors, runs, backend } = await fetchAllEventsAndPriors(userToken);

  const totalEvents = events.length;
  const editedEvents = events.filter((e) => e.userChanged).length;
  const acceptedUneditedEvents = totalEvents - editedEvents;
  const verifiedEvents = events.filter((e) => e.verifiedForTraining).length;

  const acceptanceRatePct =
    totalEvents > 0 ? round1((acceptedUneditedEvents / totalEvents) * 100) : 100;
  const editRatePct = totalEvents > 0 ? round1((editedEvents / totalEvents) * 100) : 0;

  const meanRewardScore =
    totalEvents > 0
      ? round2(events.reduce((s, e) => s + e.rewardScore, 0) / totalEvents)
      : 1.0;

  const meanCalorieMae =
    totalEvents > 0
      ? Math.round(
          events.reduce((s, e) => s + Math.abs(e.editDiffSummary?.kcalDelta || 0), 0) /
            totalEvents
        )
      : 0;

  const meanCalorieMapePct =
    totalEvents > 0
      ? round1(
          events.reduce((s, e) => s + (e.editDiffSummary?.kcalDeltaPct || 0), 0) /
            totalEvents
        )
      : 0;

  const modes: AiTrainingInputMode[] = ['photo', 'voice', 'text', 'quick_parse', 'label_ocr'];
  const modeBreakdown = {} as Record<
    AiTrainingInputMode,
    { total: number; edited: number; acceptancePct: number }
  >;
  for (const m of modes) {
    const subset = events.filter((e) => e.inputMode === m);
    const ed = subset.filter((e) => e.userChanged).length;
    modeBreakdown[m] = {
      total: subset.length,
      edited: ed,
      acceptancePct:
        subset.length > 0 ? round1(((subset.length - ed) / subset.length) * 100) : 100,
    };
  }

  // Group daily trend
  const dayBuckets = new Map<string, AiTrainingEvent[]>();
  for (const ev of events) {
    const d = (ev.createdAt || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
    const arr = dayBuckets.get(d) || [];
    arr.push(ev);
    dayBuckets.set(d, arr);
  }

  const dailyTrend: AiDailyMetricPoint[] = Array.from(dayBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-30)
    .map(([date, list]) => {
      const ed = list.filter((e) => e.userChanged).length;
      return {
        date,
        totalEvents: list.length,
        editedEvents: ed,
        acceptanceRatePct: round1(((list.length - ed) / Math.max(1, list.length)) * 100),
        meanRewardScore: round2(
          list.reduce((s, e) => s + e.rewardScore, 0) / Math.max(1, list.length)
        ),
        meanCalorieMae: Math.round(
          list.reduce((s, e) => s + Math.abs(e.editDiffSummary?.kcalDelta || 0), 0) /
            Math.max(1, list.length)
        ),
      };
    });

  return {
    summary: {
      totalEvents,
      editedEvents,
      acceptedUneditedEvents,
      verifiedEvents,
      acceptanceRatePct,
      editRatePct,
      meanRewardScore,
      meanCalorieMae,
      meanCalorieMapePct,
      verifiedPriorsCount: priors.filter((p) => p.isVerifiedShared).length,
      totalTrainingRuns: runs.length,
      lastRunAt: runs[0]?.createdAt,
      modeBreakdown,
      storageBackend: backend,
    },
    dailyTrend,
    events,
    priors,
    runs,
  };
}
