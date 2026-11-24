import React from 'react';
import { ArrowLeftRight } from 'lucide-react';
import type { Cycle15DayDashboardData } from '../../utils/cycleAnalytics';

interface CycleComparisonSectionProps {
  dashboard: Cycle15DayDashboardData;
}

export const CycleComparisonSection: React.FC<CycleComparisonSectionProps> = ({
  dashboard,
}) => {
  const { comparison } = dashboard;

  const badgeTone = (status: 'positive' | 'neutral' | 'attention') => {
    if (status === 'positive') {
      return 'text-emerald-700 dark:text-[#C8FF00]';
    }
    if (status === 'attention') {
      return 'text-amber-700 dark:text-amber-300';
    }
    return 'text-zinc-500 dark:text-zinc-400';
  };

  return (
    <section className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#111317] p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-zinc-700 dark:text-zinc-200">
            <ArrowLeftRight className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00]" />
            <span>15-Day Cycle Comparison</span>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            {comparison.summaryStatement}
          </p>
        </div>

        <div className="text-[11px] font-mono-nums tabular-nums text-zinc-500 dark:text-zinc-400 shrink-0">
          {comparison.hasPreviousCycleData
            ? `${comparison.previousLabel} vs ${comparison.currentLabel}`
            : `Cycle ${dashboard.cycleNumber}: ${comparison.currentLabel}`}
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-white/10 text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              <th className="py-2.5 pr-3">Metric</th>
              <th className="py-2.5 px-3">Previous 15 Days</th>
              <th className="py-2.5 px-3">Current 15 Days</th>
              <th className="py-2.5 px-3">Delta</th>
              <th className="py-2.5 pl-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200/70 dark:divide-white/8 text-xs sm:text-sm">
            {comparison.rows.map((row) => (
              <tr key={row.key}>
                <td className="py-2.5 pr-3 font-medium text-zinc-900 dark:text-zinc-100">
                  {row.label}
                </td>
                <td className="py-2.5 px-3 font-mono-nums tabular-nums text-zinc-500 dark:text-zinc-400">
                  {row.previousDisplay}
                </td>
                <td className="py-2.5 px-3 font-mono-nums tabular-nums font-bold text-zinc-950 dark:text-white">
                  {row.currentDisplay}
                </td>
                <td className="py-2.5 px-3 font-mono-nums tabular-nums text-zinc-700 dark:text-zinc-300">
                  {row.deltaDisplay}
                </td>
                <td className={`py-2.5 pl-3 text-right text-xs font-semibold ${badgeTone(row.status)}`}>
                  {row.statusLabel}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="sm:hidden grid grid-cols-1 gap-2">
        {comparison.rows.map((row) => (
          <div
            key={row.key}
            className="rounded-xl border border-zinc-200/80 dark:border-white/8 bg-zinc-50 dark:bg-[#090A0C] p-3 flex items-center justify-between gap-2"
          >
            <div className="min-w-0">
              <div className="text-xs font-semibold text-zinc-900 dark:text-white">
                {row.label}
              </div>
              <div className="text-[11px] font-mono-nums tabular-nums text-zinc-500 dark:text-zinc-400">
                Prev {row.previousDisplay} · Delta {row.deltaDisplay}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm font-bold font-mono-nums tabular-nums text-zinc-950 dark:text-white">
                {row.currentDisplay}
              </div>
              <div className={`text-[11px] font-semibold ${badgeTone(row.status)}`}>
                {row.statusLabel}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
