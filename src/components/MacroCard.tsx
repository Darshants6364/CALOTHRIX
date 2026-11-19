import React from 'react';
import { round1 } from '../utils/nutritionUtils';

export type MacroTone = 'protein' | 'carbs' | 'fat' | 'fibre';

interface MacroCardProps {
  name: string;
  consumed: number;
  target: number;
  tone: MacroTone;
}

const TONE_MAP: Record<
  MacroTone,
  {
    bar: string;
    label: string;
    track: string;
  }
> = {
  protein: {
    bar: 'bg-lime-500 dark:bg-lime-400',
    label: 'text-lime-700 dark:text-lime-400',
    track: 'bg-lime-100 dark:bg-lime-950/60',
  },
  carbs: {
    bar: 'bg-amber-500 dark:bg-amber-400',
    label: 'text-amber-700 dark:text-amber-400',
    track: 'bg-amber-100 dark:bg-amber-950/60',
  },
  fat: {
    bar: 'bg-indigo-500 dark:bg-indigo-400',
    label: 'text-indigo-700 dark:text-indigo-400',
    track: 'bg-indigo-100 dark:bg-indigo-950/60',
  },
  fibre: {
    bar: 'bg-teal-500 dark:bg-teal-400',
    label: 'text-teal-700 dark:text-teal-400',
    track: 'bg-teal-100 dark:bg-teal-950/60',
  },
};

export const MacroCard: React.FC<MacroCardProps> = ({ name, consumed, target, tone }) => {
  const hasTarget = target > 0;
  const safeTarget = Math.max(1, target);
  const pct = hasTarget ? Math.min(100, Math.round((consumed / safeTarget) * 100)) : 0;
  const rawPct = hasTarget ? Math.round((consumed / safeTarget) * 100) : 0;
  const remaining = hasTarget ? round1(target - consumed) : 0;
  const isOver = hasTarget && remaining < 0;
  const styles = TONE_MAP[tone];

  return (
    <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{name}</span>
        <span className={`text-xs font-medium tabular-nums ${styles.label}`}>
          {rawPct}%
        </span>
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50 font-mono-nums">
          {round1(consumed)}
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono-nums">
          / {target} g
        </span>
      </div>

      <div className={`mt-3 h-2 w-full rounded-full overflow-hidden ${styles.track}`}>
        <div
          className={`h-full rounded-full transition-all duration-300 ${styles.bar}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-2.5 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
        <span>{!hasTarget ? 'Target not set' : isOver ? 'Over target' : 'Remaining'}</span>
        <span
          className={`font-medium ${
            isOver ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'
          }`}
        >
          {!hasTarget ? '0 g' : isOver ? `+${Math.abs(remaining)} g` : `${remaining} g left`}
        </span>
      </div>
    </div>
  );
};
