import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  CalendarClock,
  Lock,
  PauseCircle,
  PlayCircle,
  Scale,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { NutritionGoals, UserProfile, WeeklyAssessmentDueStatus } from '../../types';
import type { Cycle15DayDashboardData } from '../../utils/cycleAnalytics';
import { formatWeight, formatWeightDisplay, kgToLbs } from '../../utils/nutritionUtils';

interface GoalsProgressDashboardProps {
  dashboard: Cycle15DayDashboardData;
  goals: NutritionGoals;
  profile: UserProfile;
  dueStatus: WeeklyAssessmentDueStatus;
  unit: 'kg' | 'lbs';
  isDark: boolean;
  onTogglePause: (paused: boolean) => void;
  onClearManualOverride: () => void;
  onOpenWeightModal: () => void;
}

export const GoalsProgressDashboard: React.FC<GoalsProgressDashboardProps> = ({
  dashboard,
  goals,
  profile,
  dueStatus,
  unit,
  isDark,
  onTogglePause,
  onClearManualOverride,
  onOpenWeightModal,
}) => {
  const isPaused = Boolean(profile.adaptivePaused);
  const isManualOverride = Boolean(goals.manualOverrideActive || profile.manualOverrideActive);

  const cycleProgressPct = Math.min(
    100,
    Math.max(4, Math.round((dashboard.daysCompleted / 15) * 100))
  );

  const convertPlotWeight = (kg: number | null): number | null => {
    if (kg === null || !Number.isFinite(kg) || kg <= 0) return null;
    return unit === 'lbs' ? kgToLbs(kg) : Math.round(kg * 100) / 100;
  };

  const weightPlotData = useMemo(
    () =>
      dashboard.weightSeries.map((pt) => ({
        ...pt,
        dailyWeightPlot: convertPlotWeight(pt.dailyWeightKg),
        rollingAvgPlot: convertPlotWeight(pt.rolling7dAvgKg),
      })),
    [dashboard.weightSeries, unit]
  );

  const hasAnyWeightPoint = useMemo(
    () => weightPlotData.some((d) => d.dailyWeightPlot !== null),
    [weightPlotData]
  );

  const weightYDomain = useMemo<[number, number]>(() => {
    const vals: number[] = [];
    for (const pt of weightPlotData) {
      if (pt.dailyWeightPlot !== null) vals.push(pt.dailyWeightPlot);
      if (pt.rollingAvgPlot !== null) vals.push(pt.rollingAvgPlot);
    }
    const startPlot = convertPlotWeight(dashboard.startingWeightKg);
    const targetPlot = convertPlotWeight(
      goals.targetWeightKg ?? (profile.targetWeightKg > 0 ? profile.targetWeightKg : null)
    );
    if (startPlot !== null) vals.push(startPlot);
    if (targetPlot !== null) vals.push(targetPlot);
    if (vals.length === 0) return [50, 90];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = Math.max(unit === 'lbs' ? 3 : 1.5, (max - min) * 0.25);
    return [Math.floor((min - pad) * 10) / 10, Math.ceil((max + pad) * 10) / 10];
  }, [weightPlotData, dashboard.startingWeightKg, goals.targetWeightKg, profile.targetWeightKg, unit]);

  const startPlotWeight = convertPlotWeight(dashboard.startingWeightKg);
  const targetPlotWeight = convertPlotWeight(
    goals.targetWeightKg ?? (profile.targetWeightKg > 0 ? profile.targetWeightKg : null)
  );

  const hasAnyFoodPoint = useMemo(
    () => dashboard.nutritionSeries.some((d) => d.calories !== null && d.calories > 0),
    [dashboard.nutritionSeries]
  );

  const gridStroke = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(17,19,23,0.08)';
  const axisTickColor = isDark ? '#9A9CA3' : '#64748B';

  const macroRows = [
    {
      label: 'Protein',
      avg: dashboard.summary.avgDailyProtein,
      target: goals.protein,
      barColor: isDark ? 'bg-[#C8FF00]' : 'bg-[#4E6800]',
    },
    {
      label: 'Carbs',
      avg: dashboard.summary.avgDailyCarbs,
      target: goals.carbs,
      barColor: 'bg-sky-500',
    },
    {
      label: 'Fat',
      avg: dashboard.summary.avgDailyFat,
      target: goals.fat,
      barColor: 'bg-amber-500',
    },
    {
      label: 'Fibre',
      avg: dashboard.summary.avgDailyFibre,
      target: goals.fibre,
      barColor: 'bg-emerald-500',
    },
  ];

  const getNutritionBarColor = (status: string) => {
    if (status === 'within') return isDark ? '#C8FF00' : '#4E6800';
    if (status === 'below') return '#F59E0B';
    if (status === 'above') return '#F43F5E';
    return isDark ? 'rgba(255,255,255,0.06)' : 'rgba(17,19,23,0.06)';
  };

  return (
    <div className="space-y-4">
      {/* 1. Current 15-Day Cycle Header Card */}
      <section className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#111317] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[#4E6800] dark:text-[#C8FF00]">
              <CalendarClock className="w-3.5 h-3.5 shrink-0" />
              <span>
                Cycle {dashboard.cycleNumber} · 15-Day Adaptive Window
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-zinc-950 dark:text-white font-mono-nums tabular-nums">
              {dashboard.comparison.currentLabel} · Day {dashboard.daysCompleted} of 15
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {isPaused
                ? 'Adaptive calorie updates are paused. Active targets remain locked.'
                : dashboard.daysRemaining === 0
                ? 'Day 15 reached — ready for adaptive evaluation.'
                : `${dashboard.daysRemaining} ${dashboard.daysRemaining === 1 ? 'day' : 'days'} remaining until next adaptive check-in.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isManualOverride && (
              <button
                type="button"
                onClick={onClearManualOverride}
                className="min-h-[40px] px-3 rounded-xl border border-amber-300 dark:border-amber-500/35 bg-amber-50 dark:bg-amber-500/10 text-xs font-semibold text-amber-800 dark:text-amber-300 inline-flex items-center gap-1.5 cursor-pointer hover:opacity-90"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Manual Target Active · Resume Auto</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onTogglePause(!isPaused)}
              className={`min-h-[40px] px-3.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
                isPaused
                  ? 'border-zinc-950 bg-zinc-950 text-white dark:border-[#C8FF00] dark:bg-[#C8FF00] dark:text-[#090A0C]'
                  : 'border-zinc-200 dark:border-white/15 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/5'
              }`}
            >
              {isPaused ? (
                <>
                  <PlayCircle className="w-3.5 h-3.5" />
                  <span>Resume Adaptive AI</span>
                </>
              ) : (
                <>
                  <PauseCircle className="w-3.5 h-3.5" />
                  <span>Pause Adaptive AI</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 15-Day Cycle Progress Bar */}
        <div className="space-y-1.5">
          <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-white/8 overflow-hidden">
            <div
              className="h-full rounded-full bg-zinc-950 dark:bg-[#C8FF00] transition-all duration-300"
              style={{ width: `${cycleProgressPct}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-nums tabular-nums text-zinc-500 dark:text-zinc-400">
            <span>
              Active Target:{' '}
              <strong className="text-zinc-900 dark:text-white">
                {dashboard.activeCalories.toLocaleString()} kcal/day
              </strong>
              {dashboard.previousCalories && dashboard.previousCalories !== dashboard.activeCalories
                ? ` (prev ${dashboard.previousCalories.toLocaleString()} kcal)`
                : ''}
            </span>
            <span>
              Food Logs: <strong className="text-zinc-900 dark:text-white">{dueStatus.foodLoggedDays}/15 d</strong> · Weigh-Ins:{' '}
              <strong className="text-zinc-900 dark:text-white">{dueStatus.weightLoggedDays}/15 d</strong>
            </span>
          </div>
        </div>
      </section>

      {/* 2. 15-Day Summary Metrics Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#111317] p-4">
          <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            15-Day Avg Calories
          </div>
          <div className="mt-1 text-xl font-extrabold font-mono-nums tabular-nums text-zinc-950 dark:text-white">
            {dashboard.summary.avgDailyCalories !== null
              ? `${dashboard.summary.avgDailyCalories.toLocaleString()} kcal`
              : '—'}
          </div>
          <div className="mt-0.5 text-[11px] font-mono-nums tabular-nums text-zinc-500 dark:text-zinc-400">
            Target {dashboard.activeCalories.toLocaleString()} kcal
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#111317] p-4">
          <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            15-Day Avg Protein
          </div>
          <div className="mt-1 text-xl font-extrabold font-mono-nums tabular-nums text-zinc-950 dark:text-white">
            {dashboard.summary.avgDailyProtein !== null
              ? `${Math.round(dashboard.summary.avgDailyProtein)} g`
              : '—'}
          </div>
          <div className="mt-0.5 text-[11px] font-mono-nums tabular-nums text-zinc-500 dark:text-zinc-400">
            Target {goals.protein} g/day
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#111317] p-4">
          <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            Cycle Weight Change
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xl font-extrabold font-mono-nums tabular-nums text-zinc-950 dark:text-white">
            {dashboard.cycleWeightChangeKg !== null ? (
              <>
                {dashboard.cycleWeightChangeKg < 0 ? (
                  <TrendingDown className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : dashboard.cycleWeightChangeKg > 0 ? (
                  <TrendingUp className="w-4 h-4 text-sky-500 shrink-0" />
                ) : null}
                <span>
                  {dashboard.cycleWeightChangeKg > 0 ? '+' : ''}
                  {formatWeightDisplay(dashboard.cycleWeightChangeKg, unit)}
                </span>
              </>
            ) : (
              '—'
            )}
          </div>
          <div className="mt-0.5 text-[11px] font-mono-nums tabular-nums text-zinc-500 dark:text-zinc-400">
            Latest:{' '}
            {dashboard.latestWeightKg !== null
              ? formatWeight(dashboard.latestWeightKg, unit)
              : 'No weigh-ins'}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#111317] p-4">
          <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            Target Adherence
          </div>
          <div className="mt-1 text-xl font-extrabold font-mono-nums tabular-nums text-[#4E6800] dark:text-[#C8FF00]">
            {dashboard.summary.adherencePct !== null
              ? `${Math.round(dashboard.summary.adherencePct)}%`
              : '—'}
          </div>
          <div className="mt-0.5 text-[11px] font-mono-nums tabular-nums text-zinc-500 dark:text-zinc-400">
            Across {dashboard.summary.foodLoggedDays} logged{' '}
            {dashboard.summary.foodLoggedDays === 1 ? 'day' : 'days'}
          </div>
        </div>
      </section>

      {/* 3. Weight Progress + Nutrition Progress Graphs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Weight Progress Chart */}
        <section className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#111317] p-4 sm:p-5 space-y-3 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-zinc-700 dark:text-zinc-200">
                <Scale className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00]" />
                <span>Weight Progress (15-Day Cycle)</span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                Measured weigh-ins + 7-day rolling average (missing days stay blank)
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenWeightModal}
              className="min-h-[36px] px-3 rounded-xl border border-zinc-200 dark:border-white/15 text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/5 cursor-pointer shrink-0"
            >
              + Log Weight
            </button>
          </div>

          {!hasAnyWeightPoint ? (
            <div className="h-[220px] rounded-xl border border-dashed border-zinc-200 dark:border-white/10 flex flex-col items-center justify-center text-center px-4 gap-2">
              <Scale className="w-6 h-6 text-zinc-400" />
              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                No weigh-ins logged during this 15-day window yet.
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 max-w-xs">
                Log your morning weight regularly so the adaptive engine tracks real smoothed trends without guessing missing dates.
              </p>
            </div>
          ) : (
            <div className="h-[230px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={weightPlotData} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: axisTickColor, fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={16}
                  />
                  <YAxis
                    domain={weightYDomain}
                    tick={{ fill: axisTickColor, fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={46}
                    tickFormatter={(v: number) => `${v}`}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const pt = payload[0]?.payload as (typeof weightPlotData)[number];
                      return (
                        <div className="rounded-xl border border-zinc-200 dark:border-white/15 bg-white dark:bg-[#090A0C] px-3 py-2 shadow-lg text-xs font-mono-nums tabular-nums space-y-0.5">
                          <div className="font-semibold text-zinc-950 dark:text-white">{pt.date}</div>
                          <div className="text-zinc-700 dark:text-zinc-200">
                            Measured:{' '}
                            {pt.dailyWeightPlot !== null ? `${pt.dailyWeightPlot} ${unit}` : 'Not logged'}
                          </div>
                          {pt.rollingAvgPlot !== null && (
                            <div className="text-[#4E6800] dark:text-[#C8FF00]">
                              7d Avg: {pt.rollingAvgPlot} {unit}
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  {startPlotWeight !== null && (
                    <ReferenceLine
                      y={startPlotWeight}
                      stroke={isDark ? 'rgba(255,255,255,0.28)' : 'rgba(17,19,23,0.28)'}
                      strokeDasharray="4 4"
                      label={{
                        value: `Start ${startPlotWeight}${unit}`,
                        position: 'insideTopLeft',
                        fill: axisTickColor,
                        fontSize: 10,
                      }}
                    />
                  )}
                  {targetPlotWeight !== null && (
                    <ReferenceLine
                      y={targetPlotWeight}
                      stroke="#10B981"
                      strokeDasharray="4 4"
                      label={{
                        value: `Target ${targetPlotWeight}${unit}`,
                        position: 'insideBottomLeft',
                        fill: '#10B981',
                        fontSize: 10,
                      }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="rollingAvgPlot"
                    name="7d Average"
                    stroke={isDark ? '#C8FF00' : '#4E6800'}
                    strokeWidth={2.2}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="dailyWeightPlot"
                    name="Measured Weight"
                    stroke="#38BDF8"
                    strokeWidth={1.8}
                    dot={{ r: 3.5, fill: '#38BDF8', strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 text-[11px] text-zinc-500 dark:text-zinc-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
              Measured weigh-in
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[#4E6800] dark:bg-[#C8FF00]" />
              7-day rolling avg
            </span>
            {targetPlotWeight !== null && (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-0.5 border-t border-dashed border-emerald-500" />
                Target weight
              </span>
            )}
          </div>
        </section>

        {/* Nutrition Progress Chart */}
        <section className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#111317] p-4 sm:p-5 space-y-3 min-w-0">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-zinc-700 dark:text-zinc-200">
              <Activity className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00]" />
              <span>Daily Nutrition Intake vs Target</span>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              Color-coded by target window (±8% tolerance around {dashboard.activeCalories.toLocaleString()} kcal)
            </p>
          </div>

          {!hasAnyFoodPoint ? (
            <div className="h-[220px] rounded-xl border border-dashed border-zinc-200 dark:border-white/10 flex flex-col items-center justify-center text-center px-4 gap-2">
              <Activity className="w-6 h-6 text-zinc-400" />
              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                No meals logged in this 15-day cycle yet.
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 max-w-xs">
                Log meals in the Food Diary to track calorie adherence and fuel your next adaptive assessment.
              </p>
            </div>
          ) : (
            <div className="h-[230px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dashboard.nutritionSeries}
                  margin={{ top: 10, right: 12, left: -12, bottom: 0 }}
                >
                  <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: axisTickColor, fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={16}
                  />
                  <YAxis
                    tick={{ fill: axisTickColor, fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={46}
                    tickFormatter={(v: number) => `${v}`}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const pt = payload[0]?.payload as (typeof dashboard.nutritionSeries)[number];
                      const delta =
                        pt.calories !== null ? Math.round(pt.calories - pt.targetCalories) : null;
                      return (
                        <div className="rounded-xl border border-zinc-200 dark:border-white/15 bg-white dark:bg-[#090A0C] px-3 py-2 shadow-lg text-xs font-mono-nums tabular-nums space-y-0.5">
                          <div className="font-semibold text-zinc-950 dark:text-white">{pt.date}</div>
                          {pt.calories !== null ? (
                            <>
                              <div className="text-zinc-800 dark:text-zinc-100">
                                Intake: {pt.calories.toLocaleString()} kcal (
                                {delta !== null && delta >= 0 ? `+${delta}` : delta} vs target)
                              </div>
                              <div className="text-zinc-500 dark:text-zinc-400">
                                {Math.round(pt.protein)}P · {Math.round(pt.carbs)}C ·{' '}
                                {Math.round(pt.fat)}F
                              </div>
                            </>
                          ) : (
                            <div className="text-zinc-500">No meals logged</div>
                          )}
                        </div>
                      );
                    }}
                  />
                  {dashboard.activeCalories > 0 && (
                    <ReferenceLine
                      y={dashboard.activeCalories}
                      stroke={isDark ? '#E4E4E7' : '#18181B'}
                      strokeDasharray="4 4"
                    />
                  )}
                  <Bar dataKey="calories" radius={[5, 5, 0, 0]} maxBarSize={24}>
                    {dashboard.nutritionSeries.map((entry) => (
                      <Cell key={entry.date} fill={getNutritionBarColor(entry.status)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 text-[11px] text-zinc-500 dark:text-zinc-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-[#4E6800] dark:bg-[#C8FF00]" />
              Within target
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
              Below target
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />
              Above target
            </span>
          </div>
        </section>
      </div>

      {/* 4. Macro Progress Bars (15-Day Avg vs Active Targets) */}
      <section className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#111317] p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-zinc-700 dark:text-zinc-200">
            15-Day Average Macro Progress
          </h3>
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono-nums tabular-nums">
            Daily logged average vs active goal
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {macroRows.map((m) => {
            const pct =
              m.avg !== null && m.target > 0
                ? Math.min(100, Math.round((m.avg / m.target) * 100))
                : 0;
            return (
              <div key={m.label} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono-nums tabular-nums">
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">{m.label}</span>
                  <span className="text-zinc-600 dark:text-zinc-400">
                    {m.avg !== null ? `${Math.round(m.avg)}g` : '—'} / {m.target}g
                  </span>
                </div>
                <div className="h-2 rounded-full bg-zinc-100 dark:bg-white/8 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${m.barColor} transition-all duration-300`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
