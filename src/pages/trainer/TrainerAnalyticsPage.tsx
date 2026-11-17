import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Calendar, CheckCircle2, Flame } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useMacroLogStore } from '../../hooks/useMacroLogStore';
import { useTrainerDashboard } from '../../hooks/useTrainerDashboard';
import { addDaysToDateKey, getTodayDateKey } from '../../utils/dateUtils';

type RangePreset = '7d' | '30d' | '90d' | 'custom';

export const TrainerAnalyticsPage: React.FC = () => {
  const { openTrainerClientDetail, resolvedTheme } = useMacroLogStore();
  const { clients } = useTrainerDashboard();
  const today = getTodayDateKey();
  const isDark = resolvedTheme === 'dark';

  const [preset, setPreset] = useState<RangePreset>('30d');
  const [customStart, setCustomStart] = useState(addDaysToDateKey(today, -29));
  const [customEnd, setCustomEnd] = useState(today);

  const bounds = useMemo(() => {
    if (preset === '7d') return { start: addDaysToDateKey(today, -6), end: today, totalDays: 7 };
    if (preset === '30d') return { start: addDaysToDateKey(today, -29), end: today, totalDays: 30 };
    if (preset === '90d') return { start: addDaysToDateKey(today, -89), end: today, totalDays: 90 };
    const start = customStart <= customEnd ? customStart : customEnd;
    const end = customStart <= customEnd ? customEnd : customStart;
    const diffMs =
      new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime();
    const totalDays = Math.max(1, Math.round(diffMs / 86400000) + 1);
    return { start, end, totalDays };
  }, [customEnd, customStart, preset, today]);

  const activeClients = useMemo(
    () => clients.filter((c) => c.relationship.status === 'active' && !c.relationship.isArchived),
    [clients]
  );

  const clientMetrics = useMemo(() => {
    const yesterday = addDaysToDateKey(today, -1);

    return activeClients.map((snap) => {
      const allEntries = snap.relationship.canViewNutrition ? snap.foodEntries : [];
      const entries = allEntries.filter((e) => e.date >= bounds.start && e.date <= bounds.end);

      const dayTotals = new Map<string, { cal: number; pro: number }>();
      for (const e of entries) {
        const cur = dayTotals.get(e.date) || { cal: 0, pro: 0 };
        cur.cal += e.calories;
        cur.pro += e.protein;
        dayTotals.set(e.date, cur);
      }

      const loggedDays = dayTotals.size;
      const loggingPct = Math.min(100, Math.round((loggedDays / bounds.totalDays) * 100));

      const avgCalories =
        loggedDays > 0
          ? Math.round(
              Array.from(dayTotals.values()).reduce((s, d) => s + d.cal, 0) / loggedDays
            )
          : 0;
      const avgProtein =
        loggedDays > 0
          ? Math.round(
              Array.from(dayTotals.values()).reduce((s, d) => s + d.pro, 0) / loggedDays
            )
          : 0;

      const calGoal = snap.goals?.calories || 0;
      const proGoal = snap.goals?.protein || 0;

      const onGoalDays = Array.from(dayTotals.values()).filter((d) =>
        calGoal > 0 ? d.cal >= calGoal * 0.85 && d.cal <= calGoal * 1.15 : d.cal > 0
      ).length;
      const goalCompletionPct = Math.round((onGoalDays / bounds.totalDays) * 100);

      const proteinHitDays =
        proGoal > 0
          ? Array.from(dayTotals.values()).filter((d) => d.pro >= proGoal * 0.85).length
          : 0;
      const proteinHitPct =
        loggedDays > 0 && proGoal > 0 ? Math.round((proteinHitDays / loggedDays) * 100) : 0;

      // Active logging streak ending today or yesterday
      const allLoggedDates = new Set(allEntries.map((e) => e.date));
      let streakDays = 0;
      let cursor = allLoggedDates.has(today) ? today : allLoggedDates.has(yesterday) ? yesterday : '';
      while (cursor && allLoggedDates.has(cursor) && streakDays < 120) {
        streakDays += 1;
        cursor = addDaysToDateKey(cursor, -1);
      }

      // Days since most recent log
      const pastOrTodayDates = allEntries
        .map((e) => e.date)
        .filter((d) => d <= today)
        .sort((a, b) => b.localeCompare(a));
      let daysSinceLastLog: number | null = null;
      if (pastOrTodayDates.length > 0) {
        const diffMs =
          new Date(`${today}T00:00:00`).getTime() -
          new Date(`${pastOrTodayDates[0]}T00:00:00`).getTime();
        daysSinceLastLog = Math.max(0, Math.round(diffMs / 86400000));
      }

      const weights = snap.relationship.canViewWeight
        ? snap.weightEntries
            .filter((w) => w.date >= bounds.start && w.date <= bounds.end)
            .sort((a, b) => a.date.localeCompare(b.date))
        : [];
      const weightDeltaKg =
        weights.length >= 2
          ? Math.round((weights[weights.length - 1].weightKg - weights[0].weightKg) * 100) / 100
          : null;

      // Coaching alert flags
      const alerts: string[] = [];
      if (snap.relationship.canViewNutrition) {
        if (daysSinceLastLog === null) {
          alerts.push('No food logs recorded yet');
        } else if (daysSinceLastLog >= 2) {
          alerts.push(`No food log in ${daysSinceLastLog} days`);
        }
        if (loggingPct < 50) {
          alerts.push(`Low consistency (${loggingPct}%)`);
        }
        if (proGoal > 0 && loggedDays >= 3 && proteinHitPct < 70) {
          alerts.push(`Protein target hit ${proteinHitPct}%`);
        }
      }

      return {
        clientId: snap.relationship.clientId,
        name: snap.profile?.name || 'Authorized Client',
        shortName: (snap.profile?.name || 'Client').split(' ')[0],
        canViewNutrition: snap.relationship.canViewNutrition,
        loggedDays,
        loggingPct,
        avgCalories,
        avgProtein,
        hasProteinGoal: proGoal > 0,
        proteinHitPct,
        goalCompletionPct,
        streakDays,
        daysSinceLastLog,
        weightDeltaKg,
        alerts,
      };
    });
  }, [activeClients, bounds.end, bounds.start, bounds.totalDays, today]);

  const rosterSummary = useMemo(() => {
    const visible = clientMetrics.filter((c) => c.canViewNutrition);
    const count = visible.length;
    const avgConsistency =
      count > 0 ? Math.round(visible.reduce((s, c) => s + c.loggingPct, 0) / count) : 0;
    const avgCalAdherence =
      count > 0 ? Math.round(visible.reduce((s, c) => s + c.goalCompletionPct, 0) / count) : 0;
    const proteinTrackers = visible.filter((c) => c.hasProteinGoal && c.loggedDays > 0);
    const avgProteinHit =
      proteinTrackers.length > 0
        ? Math.round(
            proteinTrackers.reduce((s, c) => s + c.proteinHitPct, 0) / proteinTrackers.length
          )
        : 0;
    const flagged = visible.filter((c) => c.alerts.length > 0);
    return { count, avgConsistency, avgCalAdherence, avgProteinHit, flagged };
  }, [clientMetrics]);

  const gridStroke = isDark ? '#1e293b' : '#e7e5e4';
  const tickColor = isDark ? '#94a3b8' : '#64748b';
  const tooltipStyle = {
    backgroundColor: isDark ? '#0f172a' : '#ffffff',
    borderColor: isDark ? '#334155' : '#e7e5e4',
    color: isDark ? '#f8fafc' : '#0f172a',
    borderRadius: '10px',
    fontSize: '12px',
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Cohort adherence matrix, protein hit rates, logging streaks & coaching alerts
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Client Progress Analytics
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex p-1 rounded-xl bg-stone-200/70 dark:bg-slate-900">
            {(
              [
                { id: '7d', label: '7 Days' },
                { id: '30d', label: '30 Days' },
                { id: '90d', label: '90 Days' },
                { id: 'custom', label: 'Custom' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPreset(opt.id)}
                className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold transition-colors ${
                  preset === opt.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="flex items-center gap-1.5 text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="h-9 px-2 rounded-lg border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
              />
              <span>–</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-9 px-2 rounded-lg border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
              />
            </div>
          )}
        </div>
      </section>

      {clientMetrics.length === 0 ? (
        <div className="bg-white dark:bg-[#121821] border border-dashed border-stone-300 dark:border-slate-700 rounded-2xl p-8 text-center text-xs text-slate-500">
          Connect with clients first to compare nutrition adherence and progress analytics.
        </div>
      ) : (
        <>
          {/* Cohort KPI Summary */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Avg Logging Consistency</div>
              <div className="mt-1 text-xl font-bold font-mono-nums text-slate-900 dark:text-slate-50">
                {rosterSummary.avgConsistency}%
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                Across {rosterSummary.count} visible client{rosterSummary.count === 1 ? '' : 's'}
              </div>
            </div>
            <div className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Avg Calorie On-Target</div>
              <div className="mt-1 text-xl font-bold font-mono-nums text-lime-700 dark:text-lime-400">
                {rosterSummary.avgCalAdherence}%
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">Days within ±15% of goal</div>
            </div>
            <div className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Avg Protein Hit Rate</div>
              <div className="mt-1 text-xl font-bold font-mono-nums text-teal-700 dark:text-teal-400">
                {rosterSummary.avgProteinHit}%
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">Logged days ≥85% protein goal</div>
            </div>
            <div className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400">Needs Attention</div>
              <div className="mt-1 text-xl font-bold font-mono-nums text-amber-600 dark:text-amber-400">
                {rosterSummary.flagged.length}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">Inactivity or adherence alerts</div>
            </div>
          </section>

          {/* Coaching Alerts + Cohort Adherence Matrix */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <section className="lg:col-span-7 bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Cohort Adherence Matrix ({bounds.start} → {bounds.end})
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Comparing Calorie On-Target %, Logging Consistency %, and Protein Hit Rate %
                </p>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={clientMetrics.filter((c) => c.canViewNutrition)}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis dataKey="shortName" tick={{ fontSize: 11, fill: tickColor }} stroke={gridStroke} />
                    <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11, fill: tickColor }} stroke={gridStroke} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Bar
                      dataKey="goalCompletionPct"
                      name="Calorie On-Target %"
                      fill="#84cc16"
                      radius={[5, 5, 0, 0]}
                    />
                    <Bar
                      dataKey="loggingPct"
                      name="Consistency %"
                      fill="#38bdf8"
                      radius={[5, 5, 0, 0]}
                    />
                    <Bar
                      dataKey="proteinHitPct"
                      name="Protein Hit %"
                      fill="#14b8a6"
                      radius={[5, 5, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="lg:col-span-5 bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Roster Coaching Alerts
                </h2>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Actionable check-ins
                </span>
              </div>

              {rosterSummary.flagged.length === 0 ? (
                <div className="rounded-xl bg-lime-50/70 dark:bg-lime-500/10 border border-lime-200/80 dark:border-lime-500/20 p-4 flex items-start gap-2.5 text-xs text-lime-800 dark:text-lime-300">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    All active nutrition-visible clients are logging consistently and tracking well against their protein & calorie targets.
                  </span>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {rosterSummary.flagged.map((c) => (
                    <div
                      key={c.clientId}
                      className="rounded-xl bg-stone-50 dark:bg-slate-900/80 border border-stone-200/80 dark:border-slate-800 p-3 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {c.name}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {c.alerts.map((reason) => (
                            <span
                              key={reason}
                              className="inline-block px-2 py-0.5 rounded-md bg-amber-100/80 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[10px] font-medium"
                            >
                              {reason}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openTrainerClientDetail(c.clientId)}
                        className="shrink-0 min-h-[32px] px-2.5 rounded-lg bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-lime-500 inline-flex items-center gap-1"
                      >
                        Inspect <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-stone-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="py-3.5 px-4 font-semibold">Client</th>
                    <th className="py-3.5 px-4 font-semibold">Logged Days</th>
                    <th className="py-3.5 px-4 font-semibold">Consistency</th>
                    <th className="py-3.5 px-4 font-semibold">Avg Calories</th>
                    <th className="py-3.5 px-4 font-semibold">Avg Protein</th>
                    <th className="py-3.5 px-4 font-semibold">Protein Hit</th>
                    <th className="py-3.5 px-4 font-semibold">Streak</th>
                    <th className="py-3.5 px-4 font-semibold">Weight Delta</th>
                    <th className="py-3.5 px-4 font-semibold">On-Target</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-slate-800/80">
                  {clientMetrics.map((m) => (
                    <tr key={m.clientId} className="hover:bg-stone-50/70 dark:hover:bg-slate-900/40">
                      <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-slate-100">
                        {m.name}
                      </td>
                      <td className="py-3.5 px-4 font-mono-nums">
                        {m.canViewNutrition ? `${m.loggedDays} / ${bounds.totalDays}` : 'Restricted'}
                      </td>
                      <td className="py-3.5 px-4 font-mono-nums">
                        {m.canViewNutrition ? `${m.loggingPct}%` : '—'}
                      </td>
                      <td className="py-3.5 px-4 font-mono-nums">
                        {m.canViewNutrition ? `${m.avgCalories.toLocaleString()} kcal` : '—'}
                      </td>
                      <td className="py-3.5 px-4 font-mono-nums">
                        {m.canViewNutrition ? `${m.avgProtein} g` : '—'}
                      </td>
                      <td className="py-3.5 px-4 font-mono-nums">
                        {m.canViewNutrition && m.hasProteinGoal ? `${m.proteinHitPct}%` : '—'}
                      </td>
                      <td className="py-3.5 px-4 font-mono-nums">
                        {m.canViewNutrition ? (
                          <span className="inline-flex items-center gap-1">
                            <Flame className="w-3 h-3 text-amber-500" />
                            {m.streakDays}d
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono-nums">
                        {m.weightDeltaKg !== null
                          ? `${m.weightDeltaKg > 0 ? '+' : ''}${m.weightDeltaKg} kg`
                          : '—'}
                      </td>
                      <td className="py-3.5 px-4 font-mono-nums font-bold text-lime-700 dark:text-lime-400">
                        {m.canViewNutrition ? `${m.goalCompletionPct}%` : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => openTrainerClientDetail(m.clientId)}
                          className="inline-flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-200 hover:text-lime-600 dark:hover:text-lime-400"
                        >
                          Inspect <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

