import React, { useMemo } from 'react';
import { BarChart3, Plus } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  MacroEnergyDistribution,
  MetricSummary,
  NutritionChartDatum,
} from '../../utils/progressAnalytics';

/* ==========================================================================
   1. TOP HERO: MACRO DISTRIBUTION DONUT + 4 CORE NUTRITION METRICS
   ========================================================================== */

interface TopMacroOverviewProps {
  macroDistribution: MacroEnergyDistribution;
  overview: {
    calories: MetricSummary;
    protein: MetricSummary;
    carbs: MetricSummary;
    fat: MetricSummary;
    fibre: MetricSummary;
  };
  periodLabel: string;
  isDark: boolean;
}

export const TopMacroOverview: React.FC<TopMacroOverviewProps> = ({
  macroDistribution,
  overview,
  periodLabel,
  isDark,
}) => {
  const donutData = useMemo(
    () => [
      { name: 'Protein', value: macroDistribution.proteinKcal, color: isDark ? '#C8FF00' : '#4E6800' },
      { name: 'Carbs', value: macroDistribution.carbsKcal, color: '#f59e0b' },
      { name: 'Fat', value: macroDistribution.fatKcal, color: '#818cf8' },
    ],
    [isDark, macroDistribution]
  );

  const statCards = [overview.calories, overview.protein, overview.carbs, overview.fat];

  return (
    <section
      aria-label="Macro distribution and nutrition summary"
      className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch"
    >
      {/* Macro Distribution Donut FIRST (Top on Mobile, Left Hero on Desktop) */}
      <div className="lg:col-span-5 bg-white dark:bg-[#111317] border border-black/8 dark:border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
              Macro Distribution
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Calorie split · {periodLabel}
            </p>
          </div>
          {macroDistribution.hasData && (
            <span className="text-[11px] font-mono-nums text-slate-500 dark:text-slate-400">
              {overview.calories.loggedDays}d avg
            </span>
          )}
        </div>

        {!macroDistribution.hasData ? (
          <div className="py-8 text-center">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              No meals logged in this period yet.
            </p>
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
              Log food to see your protein, carb, and fat calorie balance.
            </p>
          </div>
        ) : (
          <div className="mt-3 flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center gap-4">
            <div className="relative h-36 w-36 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={44}
                    outerRadius={62}
                    paddingAngle={3}
                    strokeWidth={0}
                    isAnimationActive={false}
                  >
                    {donutData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const item = payload[0];
                      return (
                        <div className="rounded-lg bg-white dark:bg-[#171A21] border border-black/12 dark:border-white/15 px-2.5 py-1.5 shadow-md text-xs font-mono-nums">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {item.name}:{' '}
                          </span>
                          <span className="text-slate-600 dark:text-slate-300">
                            {Number(item.value).toLocaleString()} kcal
                          </span>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-base font-bold font-mono-nums text-slate-900 dark:text-white leading-none">
                  {macroDistribution.totalMacroCalories.toLocaleString()}
                </span>
                <span className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                  kcal/day
                </span>
              </div>
            </div>

            <div className="flex-1 w-full divide-y divide-black/6 dark:divide-white/8 text-xs">
              <div className="py-1.5 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200 font-medium">
                  <span className="w-2 h-2 rounded-full bg-[#4E6800] dark:bg-[#C8FF00]" />
                  Protein
                </span>
                <span className="font-mono-nums font-semibold text-slate-900 dark:text-white">
                  {macroDistribution.proteinPct}%{' '}
                  <span className="font-normal text-slate-500 dark:text-slate-400">
                    ({macroDistribution.proteinGrams}g)
                  </span>
                </span>
              </div>

              <div className="py-1.5 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200 font-medium">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Carbs
                </span>
                <span className="font-mono-nums font-semibold text-slate-900 dark:text-white">
                  {macroDistribution.carbsPct}%{' '}
                  <span className="font-normal text-slate-500 dark:text-slate-400">
                    ({macroDistribution.carbsGrams}g)
                  </span>
                </span>
              </div>

              <div className="py-1.5 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-200 font-medium">
                  <span className="w-2 h-2 rounded-full bg-indigo-400" />
                  Fat
                </span>
                <span className="font-mono-nums font-semibold text-slate-900 dark:text-white">
                  {macroDistribution.fatPct}%{' '}
                  <span className="font-normal text-slate-500 dark:text-slate-400">
                    ({macroDistribution.fatGrams}g)
                  </span>
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4 Core Average Daily Metrics (Calories, Protein, Carbs, Fat) */}
      <div className="lg:col-span-7 grid grid-cols-2 gap-2.5 sm:gap-3">
        {statCards.map((m) => {
          const isNoData = m.status === 'no_data';
          const barCls =
            m.status === 'on_target'
              ? 'bg-[#4E6800] dark:bg-[#C8FF00]'
              : m.status === 'above'
              ? 'bg-red-500 dark:bg-red-400'
              : m.status === 'below'
              ? 'bg-amber-500'
              : 'bg-slate-300 dark:bg-slate-700';

          const statusCls =
            m.status === 'on_target'
              ? 'text-[#4E6800] dark:text-[#C8FF00]'
              : m.status === 'above'
              ? 'text-red-600 dark:text-red-400'
              : m.status === 'below'
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-slate-400 dark:text-slate-500';

          const avgDisplay =
            m.avgPerLoggedDay !== null
              ? m.key === 'calories'
                ? m.avgPerLoggedDay.toLocaleString()
                : m.avgPerLoggedDay.toFixed(1)
              : '—';

          return (
            <div
              key={m.key}
              className="bg-white dark:bg-[#111317] border border-black/8 dark:border-white/10 rounded-2xl p-3.5 sm:p-4 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between gap-1 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-medium">Avg {m.label}</span>
                {m.achievementPct !== null && !isNoData && (
                  <span className="text-[11px] font-mono-nums">{m.achievementPct}% hit</span>
                )}
              </div>

              <div className="mt-1.5 flex items-baseline gap-1 font-mono-nums">
                <span className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {avgDisplay}
                </span>
                {avgDisplay !== '—' && (
                  <span className="text-xs text-slate-400 dark:text-slate-500">{m.unit}/d</span>
                )}
              </div>

              <div className="mt-2 space-y-1.5">
                <div className="h-1.5 w-full rounded-full bg-black/[0.06] dark:bg-white/[0.07] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${barCls}`}
                    style={{ width: `${Math.min(100, Math.max(isNoData ? 0 : 5, m.progressPct))}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-1 text-[11px]">
                  <span className={`font-medium truncate ${statusCls}`}>{m.statusText}</span>
                  <span className="font-mono-nums text-slate-400 dark:text-slate-500 shrink-0">
                    /{m.target > 0 ? m.target.toLocaleString() : '—'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

/* ==========================================================================
   2. DEDICATED SEPARATE CHARTS:
      - CALORIES BAR CHART
      - PROTEIN BAR CHART
      - CARBS & FAT COMBINED GRAPH
      - FIBER PROGRESS BAR CHART
   ========================================================================== */

interface DedicatedChartsProps {
  chartSeries: NutritionChartDatum[];
  overview: {
    calories: MetricSummary;
    protein: MetricSummary;
    carbs: MetricSummary;
    fat: MetricSummary;
    fibre: MetricSummary;
  };
  isDark: boolean;
  onLogFood: () => void;
}

const EmptyChartPlaceholder: React.FC<{ label: string; onLogFood: () => void }> = ({
  label,
  onLogFood,
}) => (
  <div className="rounded-xl border border-dashed border-black/10 dark:border-white/12 py-8 px-4 text-center">
    <BarChart3 className="w-6 h-6 text-slate-400 mx-auto" />
    <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">
      No {label.toLowerCase()} logged in this period
    </p>
    <button
      type="button"
      onClick={onLogFood}
      className="mt-3 min-h-[40px] px-3.5 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-xs font-bold inline-flex items-center gap-1"
    >
      <Plus className="w-3.5 h-3.5" />
      Log Food
    </button>
  </div>
);

export const DedicatedMacroCharts: React.FC<DedicatedChartsProps> = ({
  chartSeries,
  overview,
  isDark,
  onLogFood,
}) => {
  const hasFoodData = overview.calories.loggedDays > 0;
  const maxBarSize = chartSeries.length > 14 ? 12 : 30;
  const axisTickStyle = { fontSize: 11, fill: isDark ? '#8E929B' : '#64748B' };
  const gridStroke = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const trackBg = { fill: isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.025)', radius: 5 };

  return (
    <div className="space-y-4">
      {/* Row 1: Separate CALORIES Bar Chart & Separate PROTEIN Bar Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* CALORIES BAR CHART */}
        <section
          aria-label="Calories bar chart"
          className="bg-white dark:bg-[#111317] border border-black/8 dark:border-white/10 rounded-2xl p-4 sm:p-5 space-y-3"
        >
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                Calories
              </h2>
              <p className="text-[11px] font-mono-nums text-slate-500 dark:text-slate-400">
                {overview.calories.avgPerLoggedDay !== null
                  ? `Avg ${overview.calories.avgPerLoggedDay.toLocaleString()} kcal/day`
                  : 'Daily intake'}
                {overview.calories.target > 0
                  ? ` · Goal ${overview.calories.target.toLocaleString()}`
                  : ''}
              </p>
            </div>
            <div className="flex items-center gap-2.5 text-[10px] text-slate-400 dark:text-slate-500">
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-xs bg-[#4E6800] dark:bg-[#C8FF00]" />
                Goal
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-xs bg-red-500" />
                Over
              </span>
            </div>
          </div>

          {!hasFoodData ? (
            <EmptyChartPlaceholder label="Calories" onLogFood={onLogFood} />
          ) : (
            <div className="h-52 sm:h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartSeries} margin={{ top: 10, right: 6, left: -14, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                  <XAxis
                    dataKey="axisLabel"
                    tick={axisTickStyle}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={16}
                  />
                  <YAxis tick={axisTickStyle} tickLine={false} axisLine={false} width={44} />
                  <Tooltip
                    cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.035)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const pt = payload[0].payload as NutritionChartDatum;
                      return (
                        <div className="rounded-xl bg-white dark:bg-[#171A21] border border-black/12 dark:border-white/15 px-3 py-2 shadow-lg text-xs">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {pt.fullLabel}
                          </div>
                          <div className="font-mono-nums font-bold text-slate-900 dark:text-white mt-0.5">
                            {pt.calories !== null ? `${pt.calories.toLocaleString()} kcal` : 'Not logged'}
                          </div>
                        </div>
                      );
                    }}
                  />
                  {overview.calories.target > 0 && (
                    <ReferenceLine
                      y={overview.calories.target}
                      stroke={isDark ? '#C8FF00' : '#4E6800'}
                      strokeOpacity={0.65}
                      strokeDasharray="4 4"
                    />
                  )}
                  <Bar
                    dataKey="calories"
                    radius={[6, 6, 2, 2]}
                    maxBarSize={maxBarSize}
                    isAnimationActive={false}
                    background={trackBg}
                  >
                    {chartSeries.map((pt) => {
                      const fill =
                        pt.calories === null
                          ? 'transparent'
                          : pt.calorieStatus === 'on_target'
                          ? isDark
                            ? '#C8FF00'
                            : '#4E6800'
                          : pt.calorieStatus === 'above'
                          ? '#ef4444'
                          : '#f59e0b';
                      return <Cell key={pt.date} fill={fill} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* PROTEIN BAR CHART */}
        <section
          aria-label="Protein bar chart"
          className="bg-white dark:bg-[#111317] border border-black/8 dark:border-white/10 rounded-2xl p-4 sm:p-5 space-y-3"
        >
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                Protein
              </h2>
              <p className="text-[11px] font-mono-nums text-slate-500 dark:text-slate-400">
                {overview.protein.avgPerLoggedDay !== null
                  ? `Avg ${overview.protein.avgPerLoggedDay}g/day`
                  : 'Daily protein'}
                {overview.protein.target > 0 ? ` · Goal ${overview.protein.target}g` : ''}
              </p>
            </div>
            {overview.protein.loggedDays > 0 && overview.protein.target > 0 && (
              <span className="text-[11px] font-mono-nums text-[#4E6800] dark:text-[#C8FF00] font-semibold">
                {overview.protein.qualifyingDays}/{overview.protein.loggedDays} hit
              </span>
            )}
          </div>

          {!hasFoodData ? (
            <EmptyChartPlaceholder label="Protein" onLogFood={onLogFood} />
          ) : (
            <div className="h-52 sm:h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartSeries} margin={{ top: 10, right: 6, left: -14, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                  <XAxis
                    dataKey="axisLabel"
                    tick={axisTickStyle}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={16}
                  />
                  <YAxis tick={axisTickStyle} tickLine={false} axisLine={false} width={44} />
                  <Tooltip
                    cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.035)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const pt = payload[0].payload as NutritionChartDatum;
                      const hit =
                        pt.protein !== null &&
                        overview.protein.target > 0 &&
                        pt.protein >= overview.protein.target * 0.9;
                      return (
                        <div className="rounded-xl bg-white dark:bg-[#171A21] border border-black/12 dark:border-white/15 px-3 py-2 shadow-lg text-xs">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {pt.fullLabel}
                          </div>
                          <div className="font-mono-nums font-bold text-slate-900 dark:text-white mt-0.5">
                            {pt.protein !== null ? `${pt.protein} g` : 'Not logged'}
                          </div>
                          {pt.protein !== null && overview.protein.target > 0 && (
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              {hit ? 'Protein target hit' : `${Math.round((pt.protein / overview.protein.target) * 100)}% of goal`}
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  {overview.protein.target > 0 && (
                    <ReferenceLine
                      y={overview.protein.target}
                      stroke="#22c55e"
                      strokeOpacity={0.7}
                      strokeDasharray="4 4"
                    />
                  )}
                  <Bar
                    dataKey="protein"
                    radius={[6, 6, 2, 2]}
                    maxBarSize={maxBarSize}
                    isAnimationActive={false}
                    background={trackBg}
                  >
                    {chartSeries.map((pt) => {
                      const hit =
                        pt.protein !== null &&
                        overview.protein.target > 0 &&
                        pt.protein >= overview.protein.target * 0.9;
                      const fill =
                        pt.protein === null
                          ? 'transparent'
                          : hit
                          ? '#22c55e'
                          : isDark
                          ? 'rgba(34,197,94,0.38)'
                          : 'rgba(34,197,94,0.45)';
                      return <Cell key={pt.date} fill={fill} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      {/* Row 2: CARBS & FAT Combined Graph + FIBER Bar Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* CARBS & FAT IN ONE GRAPH (7 cols on desktop) */}
        <section
          aria-label="Carbs and fat combined chart"
          className="lg:col-span-7 bg-white dark:bg-[#111317] border border-black/8 dark:border-white/10 rounded-2xl p-4 sm:p-5 space-y-3"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                Carbs &amp; Fat
              </h2>
              <p className="text-[11px] font-mono-nums text-slate-500 dark:text-slate-400">
                {overview.carbs.avgPerLoggedDay !== null
                  ? `Avg ${overview.carbs.avgPerLoggedDay}g carbs · ${overview.fat.avgPerLoggedDay}g fat`
                  : 'Daily carbs & fat balance'}
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-amber-500" />
                Carbs
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-indigo-400" />
                Fat
              </span>
            </div>
          </div>

          {!hasFoodData ? (
            <EmptyChartPlaceholder label="Carbs & Fat" onLogFood={onLogFood} />
          ) : (
            <div className="h-52 sm:h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartSeries}
                  margin={{ top: 10, right: 6, left: -14, bottom: 0 }}
                  barGap={2}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                  <XAxis
                    dataKey="axisLabel"
                    tick={axisTickStyle}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={16}
                  />
                  <YAxis tick={axisTickStyle} tickLine={false} axisLine={false} width={44} />
                  <Tooltip
                    cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.035)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const pt = payload[0].payload as NutritionChartDatum;
                      return (
                        <div className="rounded-xl bg-white dark:bg-[#171A21] border border-black/12 dark:border-white/15 px-3 py-2 shadow-lg text-xs space-y-0.5">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {pt.fullLabel}
                          </div>
                          {pt.carbs === null && pt.fat === null ? (
                            <div className="text-slate-400">Not logged</div>
                          ) : (
                            <div className="font-mono-nums space-y-0.5 pt-0.5">
                              <div className="text-amber-600 dark:text-amber-400 font-semibold">
                                Carbs: {pt.carbs ?? 0}g
                              </div>
                              <div className="text-indigo-600 dark:text-indigo-400 font-semibold">
                                Fat: {pt.fat ?? 0}g
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="carbs"
                    fill="#f59e0b"
                    radius={[5, 5, 1, 1]}
                    maxBarSize={chartSeries.length > 14 ? 8 : 20}
                    isAnimationActive={false}
                  />
                  <Bar
                    dataKey="fat"
                    fill="#818cf8"
                    radius={[5, 5, 1, 1]}
                    maxBarSize={chartSeries.length > 14 ? 8 : 20}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* FIBER PROGRESS BAR CHART (5 cols on desktop) */}
        <section
          aria-label="Fiber bar chart"
          className="lg:col-span-5 bg-white dark:bg-[#111317] border border-black/8 dark:border-white/10 rounded-2xl p-4 sm:p-5 space-y-3"
        >
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                Fiber
              </h2>
              <p className="text-[11px] font-mono-nums text-slate-500 dark:text-slate-400">
                {overview.fibre.avgPerLoggedDay !== null
                  ? `Avg ${overview.fibre.avgPerLoggedDay}g/day · Goal ${overview.fibre.target}g`
                  : `Daily goal ${overview.fibre.target}g`}
              </p>
            </div>
            {overview.fibre.loggedDays > 0 && (
              <span className="text-[11px] font-mono-nums text-slate-500 dark:text-slate-400">
                {overview.fibre.qualifyingDays}/{overview.fibre.loggedDays} hit
              </span>
            )}
          </div>

          {!hasFoodData ? (
            <EmptyChartPlaceholder label="Fiber" onLogFood={onLogFood} />
          ) : (
            <div className="h-52 sm:h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartSeries} margin={{ top: 10, right: 6, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                  <XAxis
                    dataKey="axisLabel"
                    tick={axisTickStyle}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={18}
                  />
                  <YAxis tick={axisTickStyle} tickLine={false} axisLine={false} width={40} />
                  <Tooltip
                    cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.035)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const pt = payload[0].payload as NutritionChartDatum;
                      return (
                        <div className="rounded-xl bg-white dark:bg-[#171A21] border border-black/12 dark:border-white/15 px-3 py-2 shadow-lg text-xs">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {pt.fullLabel}
                          </div>
                          <div className="font-mono-nums font-bold text-slate-900 dark:text-white mt-0.5">
                            {pt.fibre !== null ? `${pt.fibre} g fiber` : 'Not logged'}
                          </div>
                        </div>
                      );
                    }}
                  />
                  {overview.fibre.target > 0 && (
                    <ReferenceLine
                      y={overview.fibre.target}
                      stroke="#10b981"
                      strokeOpacity={0.7}
                      strokeDasharray="4 4"
                    />
                  )}
                  <Bar
                    dataKey="fibre"
                    radius={[6, 6, 2, 2]}
                    maxBarSize={maxBarSize}
                    isAnimationActive={false}
                    background={trackBg}
                  >
                    {chartSeries.map((pt) => {
                      const hit =
                        pt.fibre !== null &&
                        overview.fibre.target > 0 &&
                        pt.fibre >= overview.fibre.target * 0.85;
                      return (
                        <Cell
                          key={pt.date}
                          fill={pt.fibre === null ? 'transparent' : hit ? '#10b981' : '#f59e0b'}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
