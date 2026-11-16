import React, { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { getTodayDateKey } from '../utils/dateUtils';
import { convertDisplayWeightToKg, convertWeightToDisplay } from '../utils/nutritionUtils';

export const WeightEntryModal: React.FC = () => {
  const {
    state,
    weightModal,
    closeWeightModal,
    addWeightEntry,
    updateWeightEntry,
    latestWeightEntry,
  } = useMacroLogStore();

  const unit = state.settings.weightUnit;
  const editing = weightModal.editingEntry;

  const [weightValue, setWeightValue] = useState('');
  const [date, setDate] = useState(getTodayDateKey());
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!weightModal.isOpen) return;
    setError('');
    if (editing) {
      setWeightValue(String(convertWeightToDisplay(editing.weightKg, unit)));
      setDate(editing.date);
      setNotes(editing.notes ?? '');
    } else {
      const baseKg = latestWeightEntry?.weightKg ?? state.profile.currentWeightKg;
      setWeightValue(String(convertWeightToDisplay(baseKg, unit)));
      setDate(getTodayDateKey());
      setNotes('');
    }
  }, [weightModal.isOpen, editing, latestWeightEntry, state.profile.currentWeightKg, unit]);

  if (!weightModal.isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(weightValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Please enter a valid positive weight.');
      return;
    }
    const kg = convertDisplayWeightToKg(parsed, unit);
    if (kg < 20 || kg > 350) {
      setError('Please enter a realistic body weight (20–350 kg).');
      return;
    }

    if (editing) {
      updateWeightEntry(editing.id, { weightKg: kg, date, notes });
    } else {
      addWeightEntry({ weightKg: kg, date, notes });
    }
    closeWeightModal();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editing ? 'Edit weight entry' : 'Log body weight'}
    >
      <div className="w-full sm:max-w-md bg-white dark:bg-[#121821] rounded-t-3xl sm:rounded-2xl border border-stone-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="sm:hidden w-10 h-1.5 bg-stone-300 dark:bg-slate-700 rounded-full mx-auto mt-3" />

        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {editing ? 'Edit Weight Entry' : 'Log Body Weight'}
          </h2>
          <button
            type="button"
            onClick={closeWeightModal}
            aria-label="Close"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-stone-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-xs font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Weight ({unit})
            </label>
            <input
              type="number"
              step="0.05"
              autoFocus
              value={weightValue}
              onChange={(e) => setWeightValue(e.target.value)}
              placeholder={unit === 'kg' ? '62.95' : '138.8'}
              className="w-full h-12 px-4 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/70 dark:bg-slate-900 text-lg font-semibold font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Measurement Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/50 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Notes (optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g., Morning fasted, post-workout"
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/50 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
            />
          </div>

          <button
            type="submit"
            className="w-full min-h-[48px] rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-sm font-semibold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            {editing ? 'Update Weight' : 'Save Weight Entry'}
          </button>
        </form>
      </div>
    </div>
  );
};
