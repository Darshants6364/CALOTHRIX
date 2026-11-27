import React from 'react';
import { ChevronLeft, ChevronRight, Plus, Scale } from 'lucide-react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { WeeklyWeightProgressData } from '../../utils/cycleAnalytics';
import { convertWeightToDisplay, formatWeight } from '../../utils/nutritionUtils';

interface WeightProgressCardProps {
  data: WeeklyWeightProgressData;
  unit: 'kg' | 'lbs';
  isDark: boolean;
  windowWeeks: 1 | 2 | 4;
  onChangeWindowWeeks: (weeks: 1 | 2 | 4) => void;
  onPrevPeriod: () => void;
  onNextPeriod: () => void;
  onResetCurrent: () => void;
  onOpenWeightModal: () => void;
}

export const WeightProgressCard: React.FC<WeightProgressCardProps> = ({
  data,
  unit,
  isDark,
  windowWeeks,
  onChangeWindowWeeks,
  onPrevPeriod,
  onNextPeriod,
  onResetCurrent,
  onOpenWeightModal,
}) => {
  const chartData = data.series.map((pt) => ({
    ...pt,
    measuredDisplay:
      pt.dailyWeightKg !== null ? convertWeightToDisplay(pt.dailyWeightKg, unit) : null,
    smoothedDisplay:
      pt.smoothedWeightKg !== null ? convertWeightToDisplay(pt.smoothedWeightKg, unit) : null,
  }));

  const targetDisplay =
    data.targetWeightKg !== null ? convertWeightToDisplay(data.targetWeightKg, unit) : null;

  const numericValues: number[] = [];
  chartData.forEach((pt) => {
    if (pt.measuredDisplay !== null) numericValues.push(pt.measuredDisplay);
    if (pt.smoothedDisplay !== null) numericValues.push(pt.smoothedDisplay);
  });
  if (targetDisplay !== null) numericValues.push(targetDisplay);

  const minVal = numericValues.length > 0 ? Math.min(...numericValues) : 50;
  const maxVal = numericValues.length > 0 ? Math.max(...numericValues) : 80;
  const padding = Math.max(unit === 'lbs' ? 3 : 1.5, (maxVal - minVal) * 0.25);
  const yDomain: [number, number] = [
    Math.floor((minVal - padding) * 10) / 10,
    Math.ceil((maxVal + padding) * 10) / 10,
  ];

  const formatDelta = (deltaKg: number | null) => {
    if (deltaKg === null) return '—';
    const val = convertWeightToDisplay(Math.abs(deltaKg), unit);
    const sign = deltaKg > 0 ? '+' : deltaKg < 0 ? '-' : '';
    return `${sign}${val.toFixed(1)} ${unit}`;
  };

  const remainingText = (() => {
    if (data.remainingToTargetKg === null) return '—';
    const absRemaining = convertWeightToDisplay(Math.abs(data.remainingToTargetKg), unit);
    if (Math.abs(data.remainingToTargetKg) <= 0.3) return 'At goal weight';
    return `${absRemaining.toFixed(1)} ${unit} to go`;
  })();

  return (
    <section
      aria-label="Weight Progress"
      className="rounded-2xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#111317] p-4 sm:p-5 space-y-4"
    >
      {/* Header + Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-[#52555E] dark:text-[#9A9CA3]">
            <Scale className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00] shrink-0" />
            <span>Weight Progress</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            <span className="font-bold text-base text-[#111317] dark:text-white font-mono-nums tabular-nums">
              {data.rangeLabel}
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-[#52555E] dark:text-[#9A9CA3] font-mono-nums tabular-nums">
              {data.loggedDaysInWindow} weigh-{data.loggedDaysInWindow === 1 ? 'in' : 'ins'} in view
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Span toggle: 1W | 2W | 4W */}
          <div className="inline-flex rounded-xl border border-black/10 dark:border-white/12 bg-stone-50/80 dark:bg-[#090A0C] p-0.5">
            {([1, 2, 4] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => onChangeWindowWeeks(w)}
                className={`min-h-[38px] px-2.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  windowWeeks === w
                    ? 'bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black'
                    : 'text-[#52555E] dark:text-[#9A9CA3] hover:text-[#111317] dark:hover:text-white'
                }`}
              >
                {w}W
              </button>
            ))}
          </div>

          {/* Prev / Next */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onPrevPeriod}
              aria-label="Previous weight period"
              className="min-h-[44px] min-w-[44px] rounded-xl border border-black/10 dark:border-white/12 bg-stone-50/80 dark:bg-[#090A0C] text-[#111317] dark:text-white flex items-center justify-center hover:bg-stone-100 dark:hover:bg-white/5 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {data.weekOffset < 0 && (
              <button
                type="button"
                onClick={onResetCurrent}
                className="min-h-[44px] px-2.5 rounded-xl border border-black/10 dark:border-white/12 bg-stone-50/80 dark:bg-[#090A0C] text-xs font-semibold text-[#111317] dark:text-white whitespace-nowrap cursor-pointer"
              >
                Latest
              </button>
            )}

            <button
              type="button"
              onClick={onNextPeriod}
              disabled={!data.canGoNext}
              aria-label="Next weight period"
              className="min-h-[44px] min-w-[44px] rounded-xl border border-black/10 dark:border-white/12 bg-stone-50/80 dark:bg-[#090A0C] text-[#111317] dark:text-white flex items-center justify-center hover:bg-stone-100 dark:hover:bg-white/5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenWeightModal}
            className="min-h-[44px] px-3.5 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-xs font-bold hover:opacity-90 transition inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Log Weight</span>
          </button>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-black/8 dark:border-white/10 bg-stone-50/60 dark:bg-[#090A0C]/60 p-3">
          <div className="text-[11px] text-[#52555E] dark:text-[#9A9CA3]">Starting Weight</div>
          <div className="mt-0.5 text-base font-bold font-mono-nums tabular-nums text-[#111317] dark:text-white">
            {data.startingWeightKg !== null ? formatWeight(data.startingWeightKg, unit) : '—'}
          </div>
        </div>

        <div className="rounded-xl border border-black/8 dark:border-white/10 bg-stone-50/60 dark:bg-[#090A0C]/60 p-3">
          <div className="text-[11px] text-[#52555E] dark:text-[#9A9CA3]">Current Weight</div>
          <div className="mt-0.5 text-base font-bold font-mono-nums tabular-nums text-[#111317] dark:text-white">
            {data.currentWeightKg !== null ? formatWeight(data.currentWeightKg, unit) : '—'}
          </div>
        </div>

        <div className="rounded-xl border border-black/8 dark:border-white/10 bg-stone-50/60 dark:bg-[#090A0C]/60 p-3">
          <div className="text-[11px] text-[#52555E] dark:text-[#9A9CA3]">Total Change</div>
          <div className="mt-0.5 text-base font-bold font-mono-nums tabular-nums text-[#4E6800] dark:text-[#C8FF00]">
            {formatDelta(data.totalWeightChangeKg)}
          </div>
        </div>

        <div className="rounded-xl border border-black/8 dark:border-white/10 bg-stone-50/60 dark:bg-[#090A0C]/60 p-3">
          <div className="text-[11px] text-[#52555E] dark:text-[#9A9CA3]">
            Target{' '}
            {data.targetWeightKg !== null ? `(${formatWeight(data.targetWeightKg, unit)})` : ''}
          </div>
          <div className="mt-0.5 text-base font-bold font-mono-nums tabular-nums text-[#111317] dark:text-white">
            {remainingText}
          </div>
          {data.progressPct !== null && (
            <div className="mt-1.5 h-1.5 rounded-full bg-stone-200 dark:bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-[#4E6800] dark:bg-[#C8FF00] transition-all"
                style={{ width: `${data.progressPct}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Weight Chart (Zero Fabrication / Interpolation) */}
      {data.loggedDaysInWindow === 0 ? (
        <div className="rounded-xl border border-dashed border-black/15 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C]/60 px-4 py-7 text-center space-y-2">
          <p className="text-sm font-semibold text-[#111317] dark:text-white">
            No weigh-ins logged for {data.rangeLabel}
          </p>
          <p className="text-xs text-[#52555E] dark:text-[#9A9CA3] max-w-md mx-auto">
            Log your weight a few times per week to see your rolling trend and progress toward your
            target.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#52555E] dark:text-[#9A9CA3]">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#111317] dark:bg-white inline-block" />
                Measured weigh-in
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-[#4E6800] dark:bg-[#C8FF00] inline-block" />
                Smoothed trend
              </span>
              {targetDisplay !== null && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-0.5 border-t border-dashed border-sky-500 inline-block" />
                  Target ({targetDisplay} {unit})
                </span>
              )}
            </div>
            <span>Shows only recorded weigh-ins</span>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(17,19,23,0.08)'}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: isDark ? '#9A9CA3' : '#52555E' }}
                  axisLine={false}
                  tickLine={false}
                  interval={windowWeeks === 4 ? 3 : windowWeeks === 2 ? 1 : 0}
                />
                <YAxis
                  domain={yDomain}
                  tick={{ fontSize: 10, fill: isDark ? '#9A9CA3' : '#52555E' }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const pt = payload[0].payload as (typeof chartData)[number];
                    return (
                      <div className="rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] px-3 py-2 text-xs shadow-lg">
                        <div className="font-bold text-[#111317] dark:text-white">{pt.date}</div>
                        {pt.measuredDisplay !== null ? (
                          <div className="mt-1 space-y-0.5 font-mono-nums tabular-nums">
                            <div className="font-bold text-[#111317] dark:text-white">
                              Scale: {pt.measuredDisplay.toFixed(1)} {unit}
                            </div>
                            {pt.smoothedDisplay !== null && (
                              <div className="text-[#4E6800] dark:text-[#C8FF00]">
                                Trend: {pt.smoothedDisplay.toFixed(1)} {unit}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="mt-1 text-[#52555E] dark:text-[#9A9CA3]">
                            No weigh-in logged
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                {targetDisplay !== null && (
                  <ReferenceLine
                    y={targetDisplay}
                    stroke="#38bdf8"
                    strokeDasharray="5 5"
                    strokeOpacity={0.8}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="smoothedDisplay"
                  stroke={isDark ? '#C8FF00' : '#4E6800'}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="measuredDisplay"
                  stroke={isDark ? '#ffffff' : '#111317'}
                  strokeWidth={1.5}
                  strokeOpacity={0.45}
                  dot={{
                    r: 4,
                    fill: isDark ? '#ffffff' : '#111317',
                    strokeWidth: 0,
                  }}
                  activeDot={{
                    r: 5,
                    fill: isDark ? '#C8FF00' : '#4E6800',
                  }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  );
};
