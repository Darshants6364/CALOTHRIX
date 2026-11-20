import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Database,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import {
  fetchAdminAiInsightsApi,
  toggleAdminAiPriorShareApi,
  triggerAdminAiTrainingApi,
  verifyAdminAiEventApi,
} from '../services/mealAiService';
import {
  AiPerformanceInsightsResponse,
  AiTrainingInputMode,
} from '../types';

type EventFilter = 'all' | 'edited' | 'unverified' | 'verified';

const MODE_LABELS: Record<AiTrainingInputMode, string> = {
  photo: 'Photo AI',
  voice: 'Voice AI',
  text: 'Describe',
  quick_parse: 'Quick Parse',
  label_ocr: 'Label OCR',
};

export const AdminQualityPage: React.FC = () => {
  const { notify } = useMacroLogStore();

  const [insights, setInsights] = useState<AiPerformanceInsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [busyPriorId, setBusyPriorId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [eventFilter, setEventFilter] = useState<EventFilter>('all');
  const [modeFilter, setModeFilter] = useState<'all' | AiTrainingInputMode>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const loadInsights = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAdminAiInsightsApi();
      setInsights(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load AI performance insights.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInsights();
  }, [loadInsights]);

  const handleRunTraining = async () => {
    setTraining(true);
    try {
      const res = await triggerAdminAiTrainingApi();
      notify(
        `Self-training complete: calibrated ${res.priorsUpdated} shared priors (MAE ${res.run.meanCalorieMae} kcal).`,
        'success'
      );
      await loadInsights();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Training cycle failed.', 'error');
    } finally {
      setTraining(false);
    }
  };

  const handleToggleVerifyEvent = async (eventId: string, nextVerified: boolean) => {
    setBusyEventId(eventId);
    try {
      await verifyAdminAiEventApi(eventId, nextVerified);
      notify(
        nextVerified
          ? 'Verified & promoted correction into shared AI training dataset.'
          : 'Removed verification flag from training event.',
        'success'
      );
      await loadInsights();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update verification status.', 'error');
    } finally {
      setBusyEventId(null);
    }
  };

  const handleToggleSharePrior = async (priorId: string, nextShared: boolean) => {
    setBusyPriorId(priorId);
    try {
      await toggleAdminAiPriorShareApi(priorId, nextShared);
      notify(
        nextShared
          ? 'Shared verified prior enabled for all users.'
          : 'Paused prior from shared AI context.',
        'info'
      );
      await loadInsights();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not update prior visibility.', 'error');
    } finally {
      setBusyPriorId(null);
    }
  };

  const filteredEvents = useMemo(() => {
    if (!insights) return [];
    const q = searchQuery.trim().toLowerCase();
    return insights.events.filter((ev) => {
      if (eventFilter === 'edited' && !ev.userChanged) return false;
      if (eventFilter === 'unverified' && (!ev.userChanged || ev.verifiedForTraining)) return false;
      if (eventFilter === 'verified' && !ev.verifiedForTraining) return false;
      if (modeFilter !== 'all' && ev.inputMode !== modeFilter) return false;
      if (q) {
        const hay = `${ev.aiDescription} ${ev.userInputText || ''} ${
          ev.userFeedbackNote || ''
        } ${(ev.userFinalOutput?.items || []).map((i) => i.name).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [insights, eventFilter, modeFilter, searchQuery]);

  if (loading && !insights) {
    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-8 text-center text-sm text-slate-500">
          Loading AI reinforcement performance &amp; training telemetry...
        </div>
      </div>
    );
  }

  if (error && !insights) {
    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-[#111317] border border-rose-500/30 rounded-2xl p-6 text-sm text-rose-700 dark:text-rose-300 space-y-3">
          <div className="font-semibold">Unable to load AI Performance Console</div>
          <p className="text-xs">{error}</p>
          <button
            type="button"
            onClick={() => void loadInsights()}
            className="min-h-[38px] px-4 rounded-xl bg-slate-900 dark:bg-[#C8FF00] text-white dark:text-black text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const summary = insights!.summary;

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Admin AI Console · Reinforcement Learning &amp; Self-Training Dataset
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            AI Performance
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={loading}
            onClick={() => void loadInsights()}
            className="min-h-[42px] px-3.5 py-2 rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-[#C8FF00] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            disabled={training}
            onClick={() => void handleRunTraining()}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-xs font-bold hover:opacity-90 disabled:opacity-50 transition-opacity inline-flex items-center gap-2 whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{training ? 'Training Model Priors...' : 'Run Reinforcement Training'}</span>
          </button>
        </div>
      </section>

      {/* Top KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Training Data Created</div>
          <div className="mt-1 text-2xl font-bold font-mono-nums text-slate-900 dark:text-slate-50">
            {summary.totalEvents.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] font-mono-nums text-slate-500 dark:text-slate-400">
            {summary.acceptedUneditedEvents} accepted · {summary.editedEvents} penalized edits
          </div>
        </div>

        <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Zero-Edit Acceptance Rate</div>
          <div className="mt-1 text-2xl font-bold font-mono-nums text-lime-700 dark:text-[#C8FF00]">
            {summary.acceptanceRatePct}%
          </div>
          <div className="mt-1 text-[11px] font-mono-nums text-slate-500 dark:text-slate-400">
            Mean Reward: {summary.meanRewardScore >= 0 ? '+' : ''}
            {summary.meanRewardScore} · Edit Rate {summary.editRatePct}%
          </div>
        </div>

        <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Mean Calorie Error (MAE)</div>
          <div className="mt-1 text-2xl font-bold font-mono-nums text-slate-900 dark:text-slate-50">
            {summary.meanCalorieMae} kcal
          </div>
          <div className="mt-1 text-[11px] font-mono-nums text-slate-500 dark:text-slate-400">
            Mean % Deviation (MAPE): {summary.meanCalorieMapePct}%
          </div>
        </div>

        <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Shared Verified Priors</div>
          <div className="mt-1 text-2xl font-bold font-mono-nums text-slate-900 dark:text-slate-50">
            {summary.verifiedPriorsCount}
          </div>
          <div className="mt-1 text-[11px] font-mono-nums text-slate-500 dark:text-slate-400">
            {summary.totalTrainingRuns} training runs · {summary.verifiedEvents} verified events
          </div>
        </div>
      </section>

      {/* Mode Breakdown Strip */}
      <section className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Channel Accuracy Breakdown
          </h2>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-nums">
            Storage: {summary.storageBackend === 'supabase' ? 'Supabase Postgres' : 'Hybrid Mirror'}
            {summary.lastRunAt ? ` · Last Trained ${new Date(summary.lastRunAt).toLocaleDateString()}` : ''}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {(['photo', 'voice', 'text', 'quick_parse', 'label_ocr'] as AiTrainingInputMode[]).map(
            (m) => {
              const stat = summary.modeBreakdown[m] || { total: 0, edited: 0, acceptancePct: 100 };
              return (
                <div
                  key={m}
                  className="p-3 rounded-xl border border-black/8 dark:border-white/10 bg-stone-50/70 dark:bg-[#090A0C]"
                >
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {MODE_LABELS[m]}
                  </div>
                  <div className="mt-1 text-lg font-bold font-mono-nums text-slate-900 dark:text-slate-50">
                    {stat.acceptancePct}%
                  </div>
                  <div className="text-[11px] font-mono-nums text-slate-500 dark:text-slate-400">
                    {stat.total} logs · {stat.edited} edited
                  </div>
                </div>
              );
            }
          )}
        </div>
      </section>

      {/* Daily Trend + Training Run Log */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Daily Acceptance Rate Trend
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Tracks how often AI predictions are accepted without user calorie/portion edits
              </p>
            </div>
          </div>

          {insights && insights.dailyTrend.length > 0 ? (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={insights.dailyTrend} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    tickFormatter={(v: string) => v.slice(5)}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    tickFormatter={(v: number) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#111317',
                      border: '1px solid rgba(255,255,255,0.12)',
                      borderRadius: '10px',
                      fontSize: '12px',
                      color: '#f8fafc',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="acceptanceRatePct"
                    name="Acceptance %"
                    stroke="#84cc16"
                    strokeWidth={2}
                    fill="rgba(200,255,0,0.18)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-56 flex items-center justify-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-black/10 dark:border-white/10 rounded-xl">
              No AI logs recorded yet. Once users scan photos, voice, or quick-parse meals, daily accuracy trends appear here.
            </div>
          )}
        </div>

        {/* Recent Self-Training Runs */}
        <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Self-Training Runs
            </h2>
            <Sparkles className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00]" />
          </div>

          {insights && insights.runs.length > 0 ? (
            <div className="divide-y divide-black/6 dark:divide-white/8 max-h-56 overflow-y-auto pr-1">
              {insights.runs.slice(0, 8).map((run) => (
                <div key={run.id} className="py-2.5 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {run.runType === 'auto_daily'
                        ? 'Auto Daily'
                        : run.runType === 'auto_feedback'
                        ? 'Feedback Calibration'
                        : 'Manual Training'}
                    </span>
                    <span className="font-mono-nums text-[11px] text-slate-400">
                      {new Date(run.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono-nums text-slate-500 dark:text-slate-400">
                    {run.priorsUpdatedCount} priors · MAE {run.meanCalorieMae} kcal · Accept {run.acceptanceRatePct}%
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
              Click "Run Reinforcement Training" or log meals to trigger automatic daily calibration.
            </div>
          )}
        </div>
      </section>

      {/* Verified Shared Knowledge Dataset (ai_learned_priors) */}
      <section className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Database className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00]" />
              <span>Shared Verified AI Knowledge Dataset</span>
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Verified portion weights and macro corrections automatically injected into future Gemini calls for all users
            </p>
          </div>
          <span className="text-xs font-mono-nums text-slate-500 dark:text-slate-400">
            {insights?.priors.length || 0} dishes calibrated
          </span>
        </div>

        {insights && insights.priors.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-black/8 dark:border-white/10 text-[11px] text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-3 font-semibold">Dish / Food Prior</th>
                  <th className="py-2 px-3 font-semibold">Calibrated Serving</th>
                  <th className="py-2 px-3 font-semibold">Lesson / Correction Pattern</th>
                  <th className="py-2 px-3 font-semibold text-right">Samples</th>
                  <th className="py-2 px-3 font-semibold text-right">Reward</th>
                  <th className="py-2 pl-3 font-semibold text-right">Shared Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/6 dark:divide-white/8">
                {insights.priors.slice(0, 25).map((prior) => (
                  <tr key={prior.id} className="align-top">
                    <td className="py-2.5 pr-3">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {prior.displayName}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {prior.foodKey}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-mono-nums whitespace-nowrap">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {prior.avgServingGrams}g · {prior.avgCalories} kcal
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        P {prior.avgProtein}g · C {prior.avgCarbs}g · F {prior.avgFat}g
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-[11px] text-slate-600 dark:text-slate-300 max-w-xs">
                      {prior.correctionPattern || prior.canonicalDescription}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono-nums font-semibold">
                      {prior.sampleCount}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono-nums font-semibold ${
                        prior.avgRewardScore >= 0
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {prior.avgRewardScore >= 0 ? '+' : ''}
                      {prior.avgRewardScore.toFixed(2)}
                    </td>
                    <td className="py-2.5 pl-3 text-right">
                      <button
                        type="button"
                        disabled={busyPriorId === prior.id}
                        onClick={() =>
                          void handleToggleSharePrior(prior.id, !prior.isVerifiedShared)
                        }
                        className={`min-h-[30px] px-2.5 rounded-lg text-[11px] font-semibold transition-colors ${
                          prior.isVerifiedShared
                            ? 'bg-[#C8FF00]/25 text-[#3F5500] dark:text-[#C8FF00] border border-[#C8FF00]/40'
                            : 'border border-black/10 dark:border-white/15 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {prior.isVerifiedShared ? 'Shared Active' : 'Share to AI'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center border border-dashed border-black/10 dark:border-white/10 rounded-xl">
            No shared priors generated yet. Verify corrections below or click "Run Reinforcement Training".
          </div>
        )}
      </section>

      {/* AI Description vs. User Edited Output Review Queue */}
      <section className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              AI Analysis vs. User Correction Ledger
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Compare raw AI description/output against what the user edited and saved; verify records to reinforce shared training
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter dishes or notes..."
              className="h-9 px-3 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-xs text-slate-900 dark:text-slate-100"
            />

            <select
              value={modeFilter}
              onChange={(e) => setModeFilter(e.target.value as 'all' | AiTrainingInputMode)}
              aria-label="Filter by AI input mode"
              className="h-9 px-2.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-xs font-medium"
            >
              <option value="all">All Channels</option>
              <option value="photo">Photo AI</option>
              <option value="voice">Voice AI</option>
              <option value="text">Describe</option>
              <option value="quick_parse">Quick Parse</option>
              <option value="label_ocr">Label OCR</option>
            </select>

            <div className="flex items-center rounded-xl border border-black/10 dark:border-white/15 p-0.5 bg-stone-50 dark:bg-[#090A0C] text-[11px] font-semibold">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'edited', label: 'Penalized' },
                  { id: 'unverified', label: 'Needs Verify' },
                  { id: 'verified', label: 'Verified' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setEventFilter(tab.id)}
                  className={`px-2.5 py-1.5 rounded-lg transition-colors ${
                    eventFilter === tab.id
                      ? 'bg-white dark:bg-[#111317] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredEvents.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-black/10 dark:border-white/10 rounded-xl">
            No training events match the active filter.
          </div>
        ) : (
          <div className="divide-y divide-black/8 dark:divide-white/10">
            {filteredEvents.slice(0, 40).map((ev) => {
              const diff = ev.editDiffSummary;
              const kcalSign = (diff?.kcalDelta || 0) >= 0 ? '+' : '';
              const gSign = (diff?.gramsDelta || 0) >= 0 ? '+' : '';

              return (
                <div key={ev.id} className="py-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5 text-slate-600 dark:text-slate-300">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {MODE_LABELS[ev.inputMode] || ev.inputMode}
                      </span>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                        ·
                      </span>
                      <span className="font-mono-nums text-[11px] text-slate-500 dark:text-slate-400">
                        {new Date(ev.createdAt).toLocaleString()}
                      </span>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                        ·
                      </span>
                      <span
                        className={`font-mono-nums font-semibold ${
                          ev.rewardScore >= 0
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        Reward {ev.rewardScore >= 0 ? '+' : ''}
                        {ev.rewardScore.toFixed(2)}
                      </span>
                      {ev.userChanged && (
                        <>
                          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                            ·
                          </span>
                          <span className="font-mono-nums text-amber-700 dark:text-amber-400">
                            Delta {kcalSign}
                            {diff.kcalDelta} kcal ({gSign}
                            {diff.gramsDelta}g)
                          </span>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={busyEventId === ev.id}
                      onClick={() => void handleToggleVerifyEvent(ev.id, !ev.verifiedForTraining)}
                      className={`min-h-[32px] px-3 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors ${
                        ev.verifiedForTraining
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                          : 'border border-black/15 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-slate-800 dark:text-slate-100 hover:border-[#C8FF00]'
                      }`}
                    >
                      {ev.verifiedForTraining ? (
                        <>
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Verified for Training</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Verify &amp; Promote</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {/* Left: AI Description & Raw Prediction */}
                    <div className="p-3 rounded-xl border border-black/8 dark:border-white/10 bg-stone-50/70 dark:bg-[#090A0C] space-y-1.5">
                      <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        AI Description &amp; Raw Output
                      </div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {ev.aiDescription}
                      </div>
                      <div className="font-mono-nums text-[11px] text-slate-600 dark:text-slate-300">
                        Total: {ev.aiRawOutput.totalCalories} kcal · P {ev.aiRawOutput.totalProtein}g · C{' '}
                        {ev.aiRawOutput.totalCarbs}g · F {ev.aiRawOutput.totalFat}g
                      </div>
                      <ul className="space-y-0.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono-nums">
                        {(ev.aiRawOutput.items || []).map((item, idx) => (
                          <li key={idx}>
                            • {item.name} — {item.estimatedGrams}g ({item.calories} kcal)
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Right: User Final Edited Output */}
                    <div className="p-3 rounded-xl border border-black/8 dark:border-white/10 bg-stone-50/70 dark:bg-[#090A0C] space-y-1.5">
                      <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        {ev.userChanged ? 'User Edited Final Output' : 'User Accepted As-Is'}
                      </div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {ev.userFinalOutput.mealTitle}
                      </div>
                      <div className="font-mono-nums text-[11px] text-slate-700 dark:text-slate-200">
                        Total: {ev.userFinalOutput.totalCalories} kcal · P{' '}
                        {ev.userFinalOutput.totalProtein}g · C {ev.userFinalOutput.totalCarbs}g · F{' '}
                        {ev.userFinalOutput.totalFat}g
                      </div>
                      <ul className="space-y-0.5 text-[11px] text-slate-600 dark:text-slate-300 font-mono-nums">
                        {(ev.userFinalOutput.items || []).map((item, idx) => (
                          <li key={idx}>
                            • {item.name} — {item.estimatedGrams}g ({item.calories} kcal)
                          </li>
                        ))}
                      </ul>
                      {ev.userFeedbackNote && (
                        <div className="pt-1 text-[11px] text-slate-700 dark:text-slate-300">
                          Feedback: “{ev.userFeedbackNote}”
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
