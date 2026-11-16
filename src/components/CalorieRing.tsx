import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

interface CalorieRingProps {
  consumed: number;
  goal: number;
}

export const CalorieRing: React.FC<CalorieRingProps> = ({ consumed, goal }) => {
  const safeGoal = Math.max(1, goal);
  const rawPct = (consumed / safeGoal) * 100;
  const clampedPct = Math.min(100, Math.max(0, rawPct));
  const remaining = goal - consumed;
  const isOver = remaining < 0;
  const isComplete = !isOver && rawPct >= 90;

  const size = 216;
  const strokeWidth = 15;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampedPct / 100) * circumference;

  const ringStrokeClass = isOver
    ? 'stroke-amber-500 dark:stroke-amber-400'
    : 'stroke-lime-500 dark:stroke-lime-400';

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
      <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          role="img"
          aria-label={`Calories consumed: ${consumed} of ${goal} kcal`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            className="stroke-stone-200/80 dark:stroke-slate-800"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className={`${ringStrokeClass} transition-all duration-500 ease-out`}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {isOver ? 'Over target' : 'Remaining'}
          </span>
          <span className="mt-0.5 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50 font-mono-nums">
            {Math.abs(remaining).toLocaleString()}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            kcal
          </span>
          <div className="mt-2 flex items-center gap-1 text-xs font-medium">
            {isOver ? (
              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                {Math.round(rawPct)}% of goal
              </span>
            ) : isComplete ? (
              <span className="inline-flex items-center gap-1 text-lime-700 dark:text-lime-400">
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                {Math.round(rawPct)}% reached
              </span>
            ) : (
              <span className="text-slate-600 dark:text-slate-300 tabular-nums">
                {Math.round(rawPct)}% of goal
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-1 gap-4 w-full sm:w-auto sm:min-w-[170px] border-t sm:border-t-0 sm:border-l border-stone-200 dark:border-slate-800 pt-4 sm:pt-0 sm:pl-7">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Daily Goal</div>
          <div className="mt-0.5 text-lg sm:text-xl font-semibold text-slate-900 dark:text-slate-100 font-mono-nums">
            {goal.toLocaleString()} <span className="text-xs font-normal text-slate-500">kcal</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Consumed</div>
          <div className="mt-0.5 text-lg sm:text-xl font-semibold text-lime-700 dark:text-lime-400 font-mono-nums">
            {consumed.toLocaleString()} <span className="text-xs font-normal text-slate-500">kcal</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {isOver ? 'Exceeded by' : 'Remaining'}
          </div>
          <div
            className={`mt-0.5 text-lg sm:text-xl font-semibold font-mono-nums ${
              isOver
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {isOver ? '+' : ''}
            {Math.abs(remaining).toLocaleString()} <span className="text-xs font-normal text-slate-500">kcal</span>
          </div>
        </div>
      </div>
    </div>
  );
};
