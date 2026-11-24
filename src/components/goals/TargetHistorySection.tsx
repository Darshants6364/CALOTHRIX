import React from 'react';
import { ArrowRight, History } from 'lucide-react';
import type { NutritionTargetHistoryRecord } from '../../types';

interface TargetHistorySectionProps {
  targetHistory: NutritionTargetHistoryRecord[];
}

const TYPE_LABEL: Record<NutritionTargetHistoryRecord['adjustmentType'], string> = {
  initial: 'Smart Plan',
  adaptive: '14-Day AI Review',
  manual: 'Custom Targets',
};

export const TargetHistorySection: React.FC<TargetHistorySectionProps> = ({ targetHistory }) => {
  return (
    <section
      aria-label="Target History"
      className="rounded-2xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#111317] p-4 sm:p-5 space-y-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-[#52555E] dark:text-[#9A9CA3]">
          <History className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00] shrink-0" />
          <span>Target History</span>
        </div>
        <span className="text-xs font-mono-nums tabular-nums text-[#52555E] dark:text-[#9A9CA3]">
          {targetHistory.length} {targetHistory.length === 1 ? 'change' : 'changes'}
        </span>
      </div>

      {targetHistory.length === 0 ? (
        <p className="text-xs text-[#52555E] dark:text-[#9A9CA3]">
          Every target update — from Smart Calc, Custom Targets, or a 14-day review — is saved
          here so past weeks always compare against the targets active at that time.
        </p>
      ) : (
        <div className="space-y-2">
          {targetHistory.slice(0, 12).map((h) => (
            <div
              key={h.id}
              className="rounded-xl border border-black/8 dark:border-white/10 bg-stone-50/60 dark:bg-[#090A0C]/60 p-3 space-y-1.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold font-mono-nums tabular-nums text-[#111317] dark:text-white">
                  {h.previousCalories ? (
                    <>
                      <span>{h.previousCalories.toLocaleString()} kcal</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="text-[#4E6800] dark:text-[#C8FF00]">
                        {h.newCalories.toLocaleString()} kcal
                      </span>
                    </>
                  ) : (
                    <span className="text-[#4E6800] dark:text-[#C8FF00]">
                      Initial {h.newCalories.toLocaleString()} kcal
                    </span>
                  )}
                </div>

                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#52555E] dark:text-[#9A9CA3] font-mono-nums tabular-nums">
                  {TYPE_LABEL[h.adjustmentType] || h.adjustmentType} · {h.effectiveDate}
                </div>
              </div>

              <div className="text-xs font-mono-nums tabular-nums text-[#52555E] dark:text-zinc-300">
                {h.previousProtein !== null && h.previousProtein !== undefined
                  ? `${h.previousProtein}P / ${h.previousCarbs ?? '—'}C / ${h.previousFat ?? '—'}F → `
                  : ''}
                <span className="font-semibold text-[#111317] dark:text-white">
                  {h.newProtein}g P · {h.newCarbs}g C · {h.newFat}g F · {h.newFibre}g Fib
                </span>
              </div>

              {h.adjustmentReason && (
                <p className="text-xs text-[#52555E] dark:text-[#9A9CA3] leading-snug">
                  {h.adjustmentReason}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
