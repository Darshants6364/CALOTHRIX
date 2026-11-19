import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

interface CalorieRingProps {
  consumed: number;
  goal: number;
}

export const CalorieRing: React.FC<CalorieRingProps> = ({ consumed, goal }) => {
  const hasGoal = goal > 0;
  const safeGoal = Math.max(1, goal);
  const rawPct = hasGoal ? (consumed / safeGoal) * 100 : 0;
  const clampedPct = Math.min(100, Math.max(0, rawPct));
  const remaining = hasGoal ? goal - consumed : 0;
  const isOver = hasGoal && remaining < 0;
  const isComplete = hasGoal && !isOver && rawPct >= 90;

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
            className="stroke-stone-200/80 dark:stroke-white/12"
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
            {!hasGoal ? 'No goal set' : isOver ? 'Over daily goal' : 'Remaining'}
          </span>
          <span className="mt-0.5 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50 font-mono-nums">
            {hasGoal ? Math.abs(remaining).toLocaleString() : consumed.toLocaleString()}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {hasGoal ? 'kcal' : 'kcal logged'}
          </span>
          <div className="mt-2 flex items-center gap-1 text-xs font-medium">
            {!hasGoal ? (
              <span className="text-slate-500 dark:text-slate-400">Set your daily goal</span>
            ) : isOver ? (
              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                {Math.round(rawPct)}% of goal
              </span>
            ) : isComplete ? (
              <span className="inline-flex items-center gap-1 text-lime-700 dark:text-lime-400">
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                {Math.round(rawPct)}% on track
              </span>
            ) : (
              <span className="text-slate-600 dark:text-slate-300 tabular-nums">
                {Math.round(rawPct)}% consumed
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 w-full border-t sm:border-t-0 sm:border-l border-black/10 dark:border-white/12 pt-4 sm:pt-0 sm:pl-7 space-y-4">
        <div className="grid grid-cols-3 sm:grid-cols-1 gap-3.5">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Base Goal</div>
            <div className="mt-0.5 text-lg sm:text-xl font-semibold text-slate-900 dark:text-slate-100 font-mono-nums">
              {hasGoal ? goal.toLocaleString() : '—'}{' '}
              {hasGoal && <span className="text-xs font-normal text-slate-500">kcal</span>}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Food Logged</div>
            <div className="mt-0.5 text-lg sm:text-xl font-semibold text-lime-700 dark:text-lime-400 font-mono-nums">
              {consumed.toLocaleString()} <span className="text-xs font-normal text-slate-500">kcal</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {isOver ? 'Over By' : 'Remaining'}
            </div>
            <div
              className={`mt-0.5 text-lg sm:text-xl font-semibold font-mono-nums ${
                isOver
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {!hasGoal ? (
                <span className="text-slate-500 dark:text-slate-400">—</span>
              ) : (
                <>
                  {isOver ? '+' : ''}
                  {Math.abs(remaining).toLocaleString()}{' '}
                  <span className="text-xs font-normal text-slate-500">kcal</span>
                </>
              )}
            </div>
          </div>
        </div>

        {hasGoal && (
          <div className="pt-3 border-t border-stone-100 dark:border-white/10 text-xs text-slate-500 dark:text-slate-400 font-mono-nums">
            {goal.toLocaleString()} Goal − {consumed.toLocaleString()} Food ={' '}
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {remaining >= 0 ? `${remaining.toLocaleString()} left` : `${Math.abs(remaining).toLocaleString()} over`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
