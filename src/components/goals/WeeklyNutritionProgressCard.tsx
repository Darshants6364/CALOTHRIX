import React from 'react';
import { Calendar, ChevronLeft, ChevronRight, Utensils } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { WeeklyNutritionReport } from '../../utils/cycleAnalytics';

interface WeeklyNutritionProgressCardProps {
  report: WeeklyNutritionReport;
  fourWeekReports: WeeklyNutritionReport[];
  isDark: boolean;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onResetCurrentWeek: () => void;
  onSelectWeekOffset: (weekOffset: number) => void;
  onGoToFoodLog?: () => void;
}

const STATUS_LABEL: Record<WeeklyNutritionReport['weekStatus'], string> = {
  complete: 'Complete week',
  incomplete: 'Incomplete week',
  in_progress: 'In progress',
  empty: 'No food logged',
  future: 'Upcoming week',
};

export const WeeklyNutritionProgressCard: React.FC<WeeklyNutritionProgressCardProps> = ({
  report,
  fourWeekReports,
  isDark,
  onPrevWeek,
  onNextWeek,
  onResetCurrentWeek,
  onSelectWeekOffset,
  onGoToFoodLog,
}) => {
  const macroRows = [
    {
      key: 'calories',
      label: 'Avg Calories',
      avg: report.averages.calories,
      target: report.targets.calories,
      pct: report.pctAchieved.calories,
      unit: 'kcal',
      barColor: isDark ? '#C8FF00' : '#111317',
    },
    {
      key: 'protein',
      label: 'Avg Protein',
      avg: report.averages.protein,
      target: report.targets.protein,
      pct: report.pctAchieved.protein,
      unit: 'g',
      barColor: '#10b981',
    },
    {
      key: 'carbs',
      label: 'Avg Carbs',
      avg: report.averages.carbs,
      target: report.targets.carbs,
      pct: report.pctAchieved.carbs,
      unit: 'g',
      barColor: '#38bdf8',
    },
    {
      key: 'fat',
      label: 'Avg Fat',
      avg: report.averages.fat,
      target: report.targets.fat,
      pct: report.pctAchieved.fat,
      unit: 'g',
      barColor: '#f59e0b',
    },
    {
      key: 'fibre',
      label: 'Avg Fibre',
      avg: report.averages.fibre,
      target: report.targets.fibre,
      pct: report.pctAchieved.fibre,
      unit: 'g',
      barColor: '#a855f7',
    },
  ];

  const chartData = fourWeekReports.map((week) => {
    const avgCalories = week.averages.calories;
    const avgProtein = week.averages.protein ?? 0;
    const avgCarbs = week.averages.carbs ?? 0;
    const avgFat = week.averages.fat ?? 0;
    const avgFibre = week.averages.fibre ?? 0;
    const isSelectedWeek = week.weekOffset === report.weekOffset;

    if (week.loggedDays === 0 || avgCalories === null || avgCalories <= 0) {
      return {
        weekOffset: week.weekOffset,
        weekLabel: week.weekLabel,
        loggedDays: week.loggedDays,
        avgCalories: null as number | null,
        avgProtein: 0,
        avgCarbs: 0,
        avgFat: 0,
        avgFibre: 0,
        targetCalories: week.targets.calories,
        proteinKcal: 0,
        carbsKcal: 0,
        fatKcal: 0,
        proteinPct: 0,
        carbsPct: 0,
        fatPct: 0,
        isSelectedWeek,
      };
    }

    const rawP = Math.max(0, avgProtein * 4);
    const rawC = Math.max(0, avgCarbs * 4);
    const rawF = Math.max(0, avgFat * 9);
    const rawSum = rawP + rawC + rawF;

    if (rawSum <= 0) {
      return {
        weekOffset: week.weekOffset,
        weekLabel: week.weekLabel,
        loggedDays: week.loggedDays,
        avgCalories,
        avgProtein,
        avgCarbs,
        avgFat,
        avgFibre,
        targetCalories: week.targets.calories,
        proteinKcal: 0,
        carbsKcal: avgCalories,
        fatKcal: 0,
        proteinPct: 0,
        carbsPct: 100,
        fatPct: 0,
        isSelectedWeek,
      };
    }

    const pKcal = Math.round((rawP / rawSum) * avgCalories);
    const cKcal = Math.round((rawC / rawSum) * avgCalories);
    const fKcal = Math.max(0, avgCalories - pKcal - cKcal);
    const pPct = Math.round((rawP / rawSum) * 100);
    const cPct = Math.round((rawC / rawSum) * 100);
    const fPct = Math.max(0, 100 - pPct - cPct);

    return {
      weekOffset: week.weekOffset,
      weekLabel: week.weekLabel,
      loggedDays: week.loggedDays,
      avgCalories,
      avgProtein,
      avgCarbs,
      avgFat,
      avgFibre,
      targetCalories: week.targets.calories,
      proteinKcal: pKcal,
      carbsKcal: cKcal,
      fatKcal: fKcal,
      proteinPct: pPct,
      carbsPct: cPct,
      fatPct: fPct,
      isSelectedWeek,
    };
  });

  const anyWeekHasLogs = fourWeekReports.some((w) => w.loggedDays > 0);
  const statusTextColor =
    report.weekStatus === 'complete'
      ? 'text-emerald-700 dark:text-[#C8FF00]'
      : report.weekStatus === 'incomplete'
      ? 'text-amber-700 dark:text-amber-300'
      : 'text-slate-600 dark:text-slate-400';

  return (
    <section
      aria-label="Weekly Nutrition Progress"
      className="rounded-2xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#111317] p-4 sm:p-5 space-y-4"
    >
      {/* Header + Monday–Sunday Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-[#52555E] dark:text-[#9A9CA3]">
            <Calendar className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00] shrink-0" />
            <span>Weekly Nutrition Progress</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            <span className="font-bold text-base text-[#111317] dark:text-white font-mono-nums tabular-nums">
              {report.weekLabel}
            </span>
            <span className="text-slate-400">·</span>
            <span className="font-semibold text-[#111317] dark:text-zinc-200 font-mono-nums tabular-nums">
              {report.loggedDays}/7 days logged
            </span>
            <span className="text-slate-400">·</span>
            <span className={`font-semibold ${statusTextColor}`}>
              {STATUS_LABEL[report.weekStatus]}
            </span>
            {report.targets.source === 'historical' && (
              <>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500 dark:text-slate-400">
                  Compared to active targets that week
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onPrevWeek}
            aria-label="Previous week"
            className="min-h-[44px] min-w-[44px] rounded-xl border border-black/10 dark:border-white/12 bg-stone-50/80 dark:bg-[#090A0C] text-[#111317] dark:text-white flex items-center justify-center hover:bg-stone-100 dark:hover:bg-white/5 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {!report.isCurrentWeek && (
            <button
              type="button"
              onClick={onResetCurrentWeek}
              className="min-h-[44px] px-3 rounded-xl border border-black/10 dark:border-white/12 bg-stone-50/80 dark:bg-[#090A0C] text-xs font-semibold text-[#111317] dark:text-white hover:bg-stone-100 dark:hover:bg-white/5 whitespace-nowrap cursor-pointer"
            >
              This Week
            </button>
          )}

          <button
            type="button"
            onClick={onNextWeek}
            disabled={!report.canGoNext}
            aria-label="Next week"
            className="min-h-[44px] min-w-[44px] rounded-xl border border-black/10 dark:border-white/12 bg-stone-50/80 dark:bg-[#090A0C] text-[#111317] dark:text-white flex items-center justify-center hover:bg-stone-100 dark:hover:bg-white/5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!anyWeekHasLogs ? (
        <div className="rounded-xl border border-dashed border-black/15 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C]/60 px-4 py-7 text-center space-y-3">
          <div className="mx-auto w-10 h-10 rounded-xl bg-black/5 dark:bg-white/5 flex items-center justify-center text-[#4E6800] dark:text-[#C8FF00]">
            <Utensils className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-[#111317] dark:text-white">
              No meals logged for {report.weekLabel}
            </p>
            <p className="text-xs text-[#52555E] dark:text-[#9A9CA3] max-w-md mx-auto">
              Unlogged days are never counted as zero. Log your meals to see weekly averages across
              your 4-week view.
            </p>
          </div>
          {report.isCurrentWeek && onGoToFoodLog && (
            <button
              type="button"
              onClick={onGoToFoodLog}
              className="min-h-[44px] px-4 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-xs sm:text-sm font-bold hover:opacity-90 transition cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5"
            >
              Log Food Today
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Selected Week Averages vs Targets */}
          <div className="lg:col-span-7 space-y-3">
            {report.loggedDays === 0 ? (
              <div className="rounded-xl border border-dashed border-black/15 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C]/60 px-4 py-6 text-center space-y-2.5">
                <p className="text-sm font-semibold text-[#111317] dark:text-white">
                  No meals logged for {report.weekLabel}
                </p>
                <p className="text-xs text-[#52555E] dark:text-[#9A9CA3]">
                  Select any prior week on the 4-week chart or log meals today.
                </p>
                {report.isCurrentWeek && onGoToFoodLog && (
                  <button
                    type="button"
                    onClick={onGoToFoodLog}
                    className="min-h-[44px] px-4 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-xs font-bold hover:opacity-90 transition cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5"
                  >
                    Log Food Today
                  </button>
                )}
              </div>
            ) : (
              <>
                {macroRows.map((row) => {
                  const barWidth = row.pct !== null ? Math.min(100, Math.max(0, row.pct)) : 0;
                  return (
                    <div key={row.key} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="font-semibold text-[#111317] dark:text-zinc-100">
                          {row.label}
                        </span>
                        <div className="font-mono-nums tabular-nums text-right">
                          <span className="font-bold text-[#111317] dark:text-white">
                            {row.avg !== null ? `${row.avg.toLocaleString()} ${row.unit}` : '—'}
                          </span>
                          <span className="text-[#52555E] dark:text-[#9A9CA3]">
                            {' '}
                            / {row.target > 0 ? `${row.target.toLocaleString()} ${row.unit}` : '—'}
                          </span>
                          {row.pct !== null && (
                            <span className="ml-2 font-bold text-[#4E6800] dark:text-[#C8FF00]">
                              {row.pct}%
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-stone-200/80 dark:bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${barWidth}%`,
                            backgroundColor: row.barColor,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}

                {report.loggedDays < 7 && (
                  <p className="text-[11px] text-[#52555E] dark:text-[#9A9CA3] pt-1">
                    Weekly average from {report.loggedDays} logged{' '}
                    {report.loggedDays === 1 ? 'day' : 'days'} — missing days are excluded.
                  </p>
                )}
              </>
            )}
          </div>

          {/* 4-Week (Monthly) Weekly Average Stacked Bar Chart */}
          <div className="lg:col-span-5 rounded-xl border border-black/8 dark:border-white/10 bg-stone-50/60 dark:bg-[#090A0C]/60 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#52555E] dark:text-[#9A9CA3]">
              <span className="font-semibold text-[#111317] dark:text-zinc-200">
                4-Week Weekly Averages
              </span>
              <span className="font-mono-nums tabular-nums">
                Target {report.targets.calories.toLocaleString()} kcal
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-medium text-[#52555E] dark:text-[#9A9CA3]">
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-[#10b981] inline-block" />
                Protein
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-[#38bdf8] inline-block" />
                Carbs
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-[#f59e0b] inline-block" />
                Fat
              </span>
              {report.targets.calories > 0 && (
                <span className="inline-flex items-center gap-1">
                  <span className="w-3 border-t border-dashed border-[#4E6800] dark:border-[#C8FF00] inline-block" />
                  Target
                </span>
              )}
            </div>

            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(17,19,23,0.08)'}
                  />
                  <XAxis
                    dataKey="weekLabel"
                    interval={0}
                    tick={{ fontSize: 10, fill: isDark ? '#9A9CA3' : '#52555E' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[
                      0,
                      (dataMax: number) => Math.max(dataMax, report.targets.calories || 0),
                    ]}
                    tick={{ fontSize: 10, fill: isDark ? '#9A9CA3' : '#52555E' }}
                    axisLine={false}
                    tickLine={false}
                    width={46}
                  />
                  <Tooltip
                    cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const pt = payload[0].payload as (typeof chartData)[number];
                      return (
                        <div className="rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] px-3 py-2 text-xs shadow-lg space-y-1">
                          <div className="font-bold text-[#111317] dark:text-white">
                            {pt.weekLabel} · {pt.loggedDays}/7 days
                          </div>
                          {pt.loggedDays > 0 && pt.avgCalories !== null ? (
                            <div className="space-y-1 font-mono-nums tabular-nums text-[#52555E] dark:text-zinc-300">
                              <div className="font-bold text-[#4E6800] dark:text-[#C8FF00]">
                                Avg: {pt.avgCalories.toLocaleString()} /{' '}
                                {pt.targetCalories.toLocaleString()} kcal
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-sm bg-[#10b981]" />
                                  Protein
                                </span>
                                <span>
                                  {pt.avgProtein}g · {pt.proteinKcal} kcal ({pt.proteinPct}%)
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-sm bg-[#38bdf8]" />
                                  Carbs
                                </span>
                                <span>
                                  {pt.avgCarbs}g · {pt.carbsKcal} kcal ({pt.carbsPct}%)
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-sm bg-[#f59e0b]" />
                                  Fat
                                </span>
                                <span>
                                  {pt.avgFat}g · {pt.fatKcal} kcal ({pt.fatPct}%)
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-sm bg-[#a855f7]" />
                                  Fibre
                                </span>
                                <span>{pt.avgFibre}g avg</span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-[#52555E] dark:text-[#9A9CA3]">
                              No food logged this week
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  {report.targets.calories > 0 && (
                    <ReferenceLine
                      y={report.targets.calories}
                      stroke={isDark ? '#C8FF00' : '#4E6800'}
                      strokeDasharray="4 4"
                      strokeOpacity={0.75}
                    />
                  )}
                  <Bar
                    dataKey="proteinKcal"
                    stackId="intake"
                    maxBarSize={42}
                    isAnimationActive={false}
                    className="cursor-pointer"
                    onClick={(barData) => {
                      const offset = (barData as unknown as { weekOffset?: number })?.weekOffset;
                      if (typeof offset === 'number') onSelectWeekOffset(offset);
                    }}
                  >
                    {chartData.map((entry) => (
                      <Cell
                        key={`p-${entry.weekOffset}`}
                        fill="#10b981"
                        fillOpacity={entry.isSelectedWeek ? 1 : 0.65}
                      />
                    ))}
                  </Bar>
                  <Bar
                    dataKey="carbsKcal"
                    stackId="intake"
                    maxBarSize={42}
                    isAnimationActive={false}
                    className="cursor-pointer"
                    onClick={(barData) => {
                      const offset = (barData as unknown as { weekOffset?: number })?.weekOffset;
                      if (typeof offset === 'number') onSelectWeekOffset(offset);
                    }}
                  >
                    {chartData.map((entry) => (
                      <Cell
                        key={`c-${entry.weekOffset}`}
                        fill="#38bdf8"
                        fillOpacity={entry.isSelectedWeek ? 1 : 0.65}
                      />
                    ))}
                  </Bar>
                  <Bar
                    dataKey="fatKcal"
                    stackId="intake"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={42}
                    isAnimationActive={false}
                    className="cursor-pointer"
                    onClick={(barData) => {
                      const offset = (barData as unknown as { weekOffset?: number })?.weekOffset;
                      if (typeof offset === 'number') onSelectWeekOffset(offset);
                    }}
                  >
                    {chartData.map((entry) => (
                      <Cell
                        key={`f-${entry.weekOffset}`}
                        fill="#f59e0b"
                        fillOpacity={entry.isSelectedWeek ? 1 : 0.65}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <p className="text-[10px] text-[#52555E] dark:text-[#9A9CA3]">
              Tap any week bar to view its weekly averages · 4 weeks cover two 2-week review cycles
            </p>
          </div>
        </div>
      )}
    </section>
  );
};
