import React from 'react';
import { CheckCircle2, Info, AlertCircle, X } from 'lucide-react';
import { useMacroLogStore } from '../hooks/useMacroLogStore';

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useMacroLogStore();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-20 md:bottom-6 right-4 z-50 flex flex-col gap-2 max-w-sm w-[calc(100%-2rem)] pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const Icon =
          t.type === 'error' ? AlertCircle : t.type === 'info' ? Info : CheckCircle2;
        const iconColor =
          t.type === 'error'
            ? 'text-red-500'
            : t.type === 'info'
            ? 'text-slate-400'
            : 'text-lime-500';
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-slate-900 dark:bg-slate-800 text-white shadow-lg border border-slate-800 dark:border-slate-700 text-sm"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Icon className={`w-4 h-4 shrink-0 ${iconColor}`} />
              <span className="truncate">{t.message}</span>
            </div>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss notification"
              className="text-slate-400 hover:text-white shrink-0 p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
