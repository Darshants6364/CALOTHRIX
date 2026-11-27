import React, { useMemo, useState } from 'react';
import {
  Award,
  Check,
  ChevronLeft,
  ChevronRight,
  Lock,
  Pencil,
  Plus,
  Scale,
  Trash2,
} from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { WeightEntry } from '../types';
import {
  addDaysToDateKey,
  formatShortDate,
  getTodayDateKey,
  parseLocalDateKey,
} from '../utils/dateUtils';
import { getMultiWeekProgressSeries } from '../utils/analyticsUtils';
import { computeTransformationJourneyStats } from '../utils/gamificationUtils';
import {
  convertDisplayWeightToKg,
  convertWeightToDisplay,
  formatWeight,
  getWeeklyWeightBreakdown,
  round2,
  sortWeightEntriesChronological,
} from '../utils/nutritionUtils';

type WeightRange = '7d' | '30d' | '3m' | '6m' | '1y' | 'all';

const RANGE_OPTIONS: { id: WeightRange; label: string; days: number | null }[] = [
  { id: '7d', label: '7D', days: 7 },
  { id: '30d', label: '30D', days: 30 },
  { id: '3m', label: '3M', days: 90 },
  { id: '6m', label: '6M', days: 180 },
  { id: '1y', label: '1Y', days: 365 },
  { id: 'all', label: 'All', days: null },
];

export const WeightPage: React.FC = () => {
  const {
    state,
    resolvedTheme,
    latestWeightEntry,
    previousWeightEntry,
    openWeightModal,
    deleteWeightEntry,
    updateWeightGoal,
    setActiveTab,
  } = useMacroLogStore();

  const isDark = resolvedTheme === 'dark';
  const gridStroke = isDark ? 'rgba(255,255,255,0.08)' : '#e7e5e4';
  const tickColor = isDark ? '#9A9CA3' : '#52555E';
  const actualLineColor = isDark ? '#F3F4F6' : '#111317';
  const targetLineColor = isDark ? '#C8FF00' : '#4E6800';
  const tooltipStyle = {
    backgroundColor: isDark ? '#14161C' : '#ffffff',
    borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)',
    color: isDark ? '#F3F4F6' : '#111317',
    borderRadius: '10px',
    fontSize: '12px',
  };

  const unit = state.settings.weightUnit;
  const today = getTodayDateKey();
  const { weightGoal } = state;

  const [range, setRange] = useState<WeightRange>('6m');
  const [showTrendLine, setShowTrendLine] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [historyFilterDate, setHistoryFilterDate] = useState('');
  const [pendingDelete, setPendingDelete] = useState<WeightEntry | null>(null);

  // Editable Weight Goal form state
  const [editingGoal, setEditingGoal] = useState(false);
  const [startInput, setStartInput] = useState(
    String(convertWeightToDisplay(weightGoal.startingWeightKg, unit))
  );
  const [targetInput, setTargetInput] = useState(
    String(convertWeightToDisplay(weightGoal.targetWeightKg, unit))
  );
  const [goalDirection, setGoalDirection] = useState<'loss' | 'gain' | 'maintain'>(
    weightGoal.goalDirection
  );

  const sortedAsc = useMemo(
    () => sortWeightEntriesChronological(state.weightEntries, 'asc'),
    [state.weightEntries]
  );
  const sortedDesc = useMemo(() => [...sortedAsc].reverse(), [sortedAsc]);

  const currentKg = latestWeightEntry?.weightKg ?? state.profile.currentWeightKg;
  const previousKg = previousWeightEntry?.weightKg ?? null;
  const startingKg = weightGoal.startingWeightKg;
  const targetKg = weightGoal.targetWeightKg;
  const totalChangeKg =
    startingKg > 0 && currentKg > 0 ? round2(currentKg - startingKg) : 0;
  const remainingToTargetKg =
    targetKg > 0 && currentKg > 0 ? round2(Math.abs(targetKg - currentKg)) : 0;
  const isAtTarget = targetKg > 0 && currentKg > 0 && Math.abs(targetKg - currentKg) < 0.05;

  // Chart data filtered by range + 7-entry rolling weekly average trend
  const chartData = useMemo(() => {
    const selectedRangeObj = RANGE_OPTIONS.find((r) => r.id === range);
    const cutoffDate =
      selectedRangeObj?.days != null ? addDaysToDateKey(today, -selectedRangeObj.days) : null;

    const filtered = cutoffDate
      ? sortedAsc.filter((w) => w.date >= cutoffDate)
      : sortedAsc;

    return filtered.map((entry, idx) => {
      const windowSlice = filtered.slice(Math.max(0, idx - 6), idx + 1);
      const avgKg =
        windowSlice.reduce((sum, item) => sum + item.weightKg, 0) / windowSlice.length;

      return {
        date: entry.date,
        label: formatShortDate(entry.date),
        weight: convertWeightToDisplay(entry.weightKg, unit),
        trend: convertWeightToDisplay(avgKg, unit),
      };
    });
  }, [range, sortedAsc, today, unit]);

  const targetDisplay = convertWeightToDisplay(targetKg, unit);
  const startingDisplay = convertWeightToDisplay(startingKg, unit);

  // Weekly Average Weight breakdown (Mon-Sun)
  const weeklyBreakdown = useMemo(
    () => getWeeklyWeightBreakdown(state.weightEntries, today, weekOffset),
    [state.weightEntries, today, weekOffset]
  );

  const fourWeekSeries = useMemo(
    () => getMultiWeekProgressSeries(state.foodEntries, state.weightEntries, today, 4),
    [state.foodEntries, state.weightEntries, today]
  );

  const journeyStats = useMemo(
    () => computeTransformationJourneyStats({ state, todayKey: today }),
    [state, today]
  );

  // History rows with change vs previous chronological entry
  const historyRows = useMemo(() => {
    const withDiff = sortedAsc.map((entry, idx) => {
      const prev = idx > 0 ? sortedAsc[idx - 1] : null;
      const diffKg = prev ? round2(entry.weightKg - prev.weightKg) : null;
      return { entry, diffKg };
    });
    const desc = withDiff.reverse();
    if (!historyFilterDate) return desc;
    return desc.filter((r) => r.entry.date === historyFilterDate);
  }, [historyFilterDate, sortedAsc]);

  const handleSaveWeightGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const s = parseFloat(startInput);
    const t = parseFloat(targetInput);
    if (!Number.isFinite(s) || !Number.isFinite(t) || s <= 0 || t <= 0) return;
    updateWeightGoal({
      startingWeightKg: convertDisplayWeightToKg(s, unit),
      targetWeightKg: convertDisplayWeightToKg(t, unit),
      goalDirection,
    });
    setEditingGoal(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-[#4E6800] dark:text-[#C8FF00] font-semibold">
            Transformation &amp; Progress Journey
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-display font-bold tracking-tight text-[#111317] dark:text-white">
            Weight &amp; Body Transformation
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              const fallbackStart = weightGoal.startingWeightKg > 0 ? weightGoal.startingWeightKg : currentKg;
              setStartInput(
                fallbackStart > 0 ? String(convertWeightToDisplay(fallbackStart, unit)) : ''
              );
              setTargetInput(
                weightGoal.targetWeightKg > 0
                  ? String(convertWeightToDisplay(weightGoal.targetWeightKg, unit))
                  : ''
              );
              setGoalDirection(weightGoal.goalDirection);
              setEditingGoal((v) => !v);
            }}
            className="min-h-[44px] px-4 rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-[#C8FF00] whitespace-nowrap"
          >
            {editingGoal ? 'Close Goal Editor' : 'Weight Goal'}
          </button>

          <button
            type="button"
            onClick={() => openWeightModal()}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-sm font-bold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Log Weight
          </button>
        </div>
      </section>

      {/* Directional Transformation Goal Progress Banner */}
      <section className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-[#111317] dark:text-white">
              {journeyStats.direction === 'loss'
                ? 'Weight Loss Trajectory'
                : journeyStats.direction === 'gain'
                ? 'Muscle & Weight Gain Trajectory'
                : 'Maintenance & Recomposition Trajectory'}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
              Weekly Avg:{' '}
              <strong className="text-[#111317] dark:text-white">
                {journeyStats.weeklyAvgWeightKg !== null
                  ? formatWeight(journeyStats.weeklyAvgWeightKg, unit)
                  : '—'}
              </strong>{' '}
              · 30-Day Change:{' '}
              <strong className="text-[#4E6800] dark:text-[#C8FF00]">
                {journeyStats.monthlyChangeKg !== null
                  ? `${journeyStats.monthlyChangeKg > 0 ? '+' : ''}${convertWeightToDisplay(
                      journeyStats.monthlyChangeKg,
                      unit
                    )} ${unit}`
                  : 'Need 2+ entries'}
              </strong>
            </p>
          </div>
          <div className="text-right font-mono-nums">
            <span className="text-xl font-bold text-[#4E6800] dark:text-[#C8FF00]">
              {journeyStats.progressPct}%
            </span>
            <span className="ml-1.5 text-xs text-slate-500 dark:text-slate-400">to target</span>
          </div>
        </div>

        <div className="h-2.5 w-full rounded-full bg-black/8 dark:bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-[#4E6800] dark:bg-[#C8FF00] transition-all duration-500"
            style={{ width: `${journeyStats.progressPct}%` }}
          />
        </div>
      </section>

      {/* Weight Goal Integration Editor */}
      {editingGoal && (
        <form
          onSubmit={handleSaveWeightGoal}
          className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 space-y-4"
        >
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Configure Weight Goal
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Starting Weight ({unit})
              </label>
              <input
                type="number"
                step="0.05"
                value={startInput}
                onChange={(e) => setStartInput(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-mono-nums text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Target Weight ({unit})
              </label>
              <input
                type="number"
                step="0.05"
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-mono-nums text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Goal Direction
              </label>
              <select
                value={goalDirection}
                onChange={(e) =>
                  setGoalDirection(e.target.value as 'loss' | 'gain' | 'maintain')
                }
                className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="loss">Weight Loss</option>
                <option value="gain">Weight Gain</option>
                <option value="maintain">Maintain</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditingGoal(false)}
              className="min-h-[40px] px-4 rounded-xl border border-black/10 dark:border-white/15 text-xs font-medium text-slate-600 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[40px] px-4 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-xs font-semibold"
            >
              Save Weight Goal
            </button>
          </div>
        </form>
      )}

      {/* Weight KPI Dashboard */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Current Weight</div>
          <div className="mt-1 text-lg font-bold font-mono-nums text-slate-900 dark:text-slate-50">
            {currentKg > 0 ? formatWeight(currentKg, unit) : '—'}
          </div>
        </div>
        <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Previous</div>
          <div className="mt-1 text-lg font-bold font-mono-nums text-slate-900 dark:text-slate-50">
            {previousKg !== null && previousKg > 0 ? formatWeight(previousKg, unit) : '—'}
          </div>
        </div>
        <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Starting Weight</div>
          <div className="mt-1 text-lg font-bold font-mono-nums text-slate-900 dark:text-slate-50">
            {startingKg > 0 ? formatWeight(startingKg, unit) : '—'}
          </div>
        </div>
        <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Target Weight</div>
          <div className="mt-1 text-lg font-bold font-mono-nums text-lime-700 dark:text-lime-400">
            {targetKg > 0 ? formatWeight(targetKg, unit) : 'Not set'}
          </div>
        </div>
        <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Total Change</div>
          <div className="mt-1 text-lg font-bold font-mono-nums text-slate-900 dark:text-slate-50">
            {startingKg > 0 && currentKg > 0
              ? `${totalChangeKg > 0 ? '+' : ''}${convertWeightToDisplay(totalChangeKg, unit)} ${unit}`
              : '—'}
          </div>
        </div>
        <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Remaining</div>
          <div className="mt-1 text-lg font-bold font-mono-nums text-slate-900 dark:text-slate-50">
            {targetKg <= 0
              ? 'Not set'
              : currentKg <= 0
              ? '—'
              : isAtTarget
              ? 'On target'
              : `${convertWeightToDisplay(remainingToTargetKg, unit)} ${unit}`}
          </div>
        </div>
      </section>

      {/* Weight Progress Chart */}
      <section className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-[#111317] dark:text-white">
              Weight Transformation Chart
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Actual weigh-ins, rolling trend average, and target reference line
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowTrendLine((v) => !v)}
              className={`min-h-[34px] px-3 rounded-xl border text-xs font-semibold transition-colors ${
                showTrendLine
                  ? 'border-[#4E6800] dark:border-[#C8FF00] bg-[#C8FF00]/15 text-[#4E6800] dark:text-[#C8FF00]'
                  : 'border-black/10 dark:border-white/15 text-slate-500 dark:text-slate-400'
              }`}
            >
              Rolling Trend
            </button>

            <div className="inline-flex items-center p-1 rounded-xl bg-[#F4F3EF] dark:bg-[#090A0C] border border-black/8 dark:border-white/10">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setRange(opt.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    range === opt.id
                      ? 'bg-white dark:bg-[#181A20] text-[#111317] dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-[#111317] dark:hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="py-12 text-center">
            <Scale className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              No weight measurements recorded in this timeframe.
            </p>
            <button
              type="button"
              onClick={() => openWeightModal()}
              className="mt-4 min-h-[40px] px-4 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-xs font-bold"
            >
              Log First Weight
            </button>
          </div>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: tickColor }} stroke={gridStroke} />
                <YAxis
                  domain={['dataMin - 1', 'dataMax + 1']}
                  tick={{ fontSize: 12, fill: tickColor }}
                  stroke={gridStroke}
                  width={48}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value, name) => [`${value} ${unit}`, name]}
                />
                <Legend />
                {targetKg > 0 && (
                  <ReferenceLine
                    y={targetDisplay}
                    stroke={targetLineColor}
                    strokeDasharray="5 4"
                    strokeWidth={2}
                    label={{
                      value: `Target (${targetDisplay} ${unit})`,
                      position: 'insideTopRight',
                      fontSize: 11,
                      fill: targetLineColor,
                    }}
                  />
                )}
                {startingKg > 0 && (
                  <ReferenceLine
                    y={startingDisplay}
                    stroke={isDark ? 'rgba(255,255,255,0.28)' : '#94a3b8'}
                    strokeDasharray="3 3"
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="weight"
                  name={`Actual (${unit})`}
                  stroke={actualLineColor}
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: actualLineColor }}
                  activeDot={{ r: 6, fill: '#C8FF00', stroke: '#090A0C', strokeWidth: 2 }}
                />
                {showTrendLine && (
                  <Line
                    type="monotone"
                    dataKey="trend"
                    name={`Weekly Avg Trend (${unit})`}
                    stroke="#C8FF00"
                    strokeWidth={2.5}
                    dot={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Nutrition Consistency Alongside Weight Progress + Transformation Milestones */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-[#111317] dark:text-white">
                Nutrition Consistency Summary
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Logged nutrition metrics observed alongside your weigh-ins
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('progress')}
              className="text-xs font-semibold text-[#4E6800] dark:text-[#C8FF00] hover:underline whitespace-nowrap"
            >
              Charts →
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-[#F4F3EF]/80 dark:bg-[#090A0C] border border-black/10 dark:border-white/12 p-3.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Days Tracked</div>
              <div className="mt-1 text-xl font-bold font-mono-nums text-[#111317] dark:text-white">
                {journeyStats.daysTrackedNutrition} days
              </div>
            </div>
            <div className="rounded-xl bg-[#F4F3EF]/80 dark:bg-[#090A0C] border border-black/10 dark:border-white/12 p-3.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Protein Goal Hit</div>
              <div className="mt-1 text-xl font-bold font-mono-nums text-[#4E6800] dark:text-[#C8FF00]">
                {journeyStats.proteinGoalConsistencyPct}%
              </div>
            </div>
            <div className="rounded-xl bg-[#F4F3EF]/80 dark:bg-[#090A0C] border border-black/10 dark:border-white/12 p-3.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Avg Daily Calories</div>
              <div className="mt-1 text-lg font-bold font-mono-nums text-[#111317] dark:text-white">
                {journeyStats.avgDailyCalories.toLocaleString()} kcal
              </div>
            </div>
            <div className="rounded-xl bg-[#F4F3EF]/80 dark:bg-[#090A0C] border border-black/10 dark:border-white/12 p-3.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Avg Daily Protein</div>
              <div className="mt-1 text-lg font-bold font-mono-nums text-[#111317] dark:text-white">
                {journeyStats.avgDailyProtein} g
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00]" />
              <h2 className="text-sm font-bold text-[#111317] dark:text-white">
                Transformation Milestones
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {journeyStats.milestones.map((m) => (
              <div
                key={m.id}
                className={`rounded-xl border p-3.5 flex flex-col justify-between gap-2 ${
                  m.unlocked
                    ? 'border-[#4E6800]/45 dark:border-[#C8FF00]/45 bg-[#C8FF00]/12 dark:bg-[#C8FF00]/10'
                    : 'border-black/10 dark:border-white/12 bg-[#F4F3EF]/60 dark:bg-[#090A0C]/60 opacity-80'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs font-bold text-[#111317] dark:text-white leading-snug">
                    {m.title}
                  </div>
                  {m.unlocked ? (
                    <span className="w-5 h-5 rounded-md bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3" />
                    </span>
                  ) : (
                    <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                  {m.subtitle}
                </p>
                <div className="text-[11px] font-mono-nums font-semibold text-[#4E6800] dark:text-[#C8FF00]">
                  {m.unlocked ? 'Unlocked' : m.progressLabel}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4-Week Weekly Average Weight Trend */}
      <section className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              4-Week Average Weight Comparison
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Weekly averages help evaluate progress without day-to-day water fluctuations
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('progress')}
            className="text-xs font-medium text-lime-700 dark:text-lime-400 hover:underline"
          >
            View 2–4 Week Calorie Review →
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {fourWeekSeries.map((wk) => (
            <div
              key={wk.weekStart}
              className="p-3.5 rounded-xl bg-stone-50/80 dark:bg-[#090A0C]/80 border border-black/10 dark:border-white/12"
            >
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Week of {wk.label}
              </div>
              <div className="mt-1 text-base font-bold font-mono-nums text-slate-900 dark:text-slate-100">
                {wk.avgWeightKg !== null ? formatWeight(wk.avgWeightKg, unit) : 'No weigh-ins'}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400 tabular-nums">
                {wk.weightReadings} {wk.weightReadings === 1 ? 'entry' : 'entries'}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Weekly Average Weight + History Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Weekly Average Weight */}
        <div className="lg:col-span-5 bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Weekly Average Weight
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {formatShortDate(weeklyBreakdown.days[0].date)} –{' '}
                {formatShortDate(weeklyBreakdown.days[6].date)}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setWeekOffset((w) => w - 1)}
                aria-label="Previous week"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl border border-black/10 dark:border-white/12 text-slate-600 dark:text-slate-300"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setWeekOffset((w) => Math.min(0, w + 1))}
                disabled={weekOffset === 0}
                aria-label="Next week"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl border border-black/10 dark:border-white/12 text-slate-600 dark:text-slate-300 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-stone-50 dark:bg-[#090A0C] border border-black/10 dark:border-white/12 mb-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Average ({weeklyBreakdown.recordedDaysCount} recorded{' '}
                {weeklyBreakdown.recordedDaysCount === 1 ? 'day' : 'days'})
              </div>
              <div className="mt-0.5 text-2xl font-bold font-mono-nums text-lime-700 dark:text-lime-400">
                {weeklyBreakdown.averageKg !== null
                  ? formatWeight(weeklyBreakdown.averageKg, unit)
                  : 'No entries'}
              </div>
            </div>
          </div>

          <div className="divide-y divide-stone-100 dark:divide-slate-800/70">
            {weeklyBreakdown.days.map((d) => (
              <div
                key={d.date}
                className="py-2.5 flex items-center justify-between text-sm"
              >
                <div>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {d.weekday}
                  </span>
                  <span className="ml-2 text-xs text-slate-400">
                    {formatShortDate(d.date)}
                  </span>
                </div>
                <span
                  className={`font-mono-nums ${
                    d.weightKg !== null
                      ? 'font-semibold text-slate-900 dark:text-slate-100'
                      : 'text-xs text-slate-400'
                  }`}
                >
                  {d.weightKg !== null ? formatWeight(d.weightKg, unit) : 'No entry'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Chronological Weight History Table */}
        <div className="lg:col-span-7 bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-stone-100 dark:border-white/10 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Weight History
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {sortedDesc.length} recorded {sortedDesc.length === 1 ? 'entry' : 'entries'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="date"
                value={historyFilterDate}
                onChange={(e) => setHistoryFilterDate(e.target.value)}
                aria-label="Filter weight history by date"
                className="h-9 px-2.5 rounded-lg border border-black/10 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-xs text-slate-700 dark:text-slate-200"
              />
              {historyFilterDate && (
                <button
                  type="button"
                  onClick={() => setHistoryFilterDate('')}
                  className="text-xs font-medium text-lime-700 dark:text-lime-400 hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {historyRows.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No weight records found{historyFilterDate ? ' for that date' : ''}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 dark:border-white/12 text-xs text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-4 text-left font-medium">Date</th>
                    <th className="py-3 px-4 text-right font-medium">Weight</th>
                    <th className="py-3 px-4 text-right font-medium">Change</th>
                    <th className="py-3 px-4 text-left font-medium">Notes</th>
                    <th className="py-3 px-4 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-slate-800/70">
                  {historyRows.map(({ entry, diffKg }) => {
                    const displayDiff =
                      diffKg !== null ? convertWeightToDisplay(diffKg, unit) : null;
                    const dateLabel = parseLocalDateKey(entry.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    });
                    return (
                      <tr
                        key={entry.id}
                        className="hover:bg-stone-50/60 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {dateLabel}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-nums font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {formatWeight(entry.weightKg, unit)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-nums whitespace-nowrap">
                          {displayDiff === null ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <span
                              className={
                                displayDiff < 0
                                  ? 'text-lime-700 dark:text-lime-400'
                                  : displayDiff > 0
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-slate-500'
                              }
                            >
                              {displayDiff > 0 ? '+' : ''}
                              {displayDiff} {unit}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 max-w-[160px] truncate">
                          {entry.notes || '—'}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openWeightModal(entry)}
                              aria-label={`Edit weight from ${entry.date}`}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-stone-100 dark:hover:bg-slate-800"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingDelete(entry)}
                              aria-label={`Delete weight from ${entry.date}`}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        title="Delete weight entry?"
        description={
          pendingDelete
            ? `Remove ${formatWeight(pendingDelete.weightKg, unit)} recorded on ${formatShortDate(
                pendingDelete.date
              )}?`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={() => {
          if (pendingDelete) {
            deleteWeightEntry(pendingDelete.id);
            setPendingDelete(null);
          }
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
};
