import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { GoalPreset } from '../types';
import { convertDisplayWeightToKg, convertWeightToDisplay } from '../utils/nutritionUtils';

const GOAL_PRESETS: {
  id: GoalPreset;
  label: string;
  description: string;
  targets?: { calories: number; protein: number; carbs: number; fat: number; fibre: number };
}[] = [
  {
    id: 'fat_loss',
    label: 'Fat Loss',
    description: 'High protein, moderate deficit (~1,950 kcal)',
    targets: { calories: 1950, protein: 155, carbs: 195, fat: 58, fibre: 32 },
  },
  {
    id: 'maintenance',
    label: 'Maintenance',
    description: 'Balanced daily energy & steady recovery (~2,500 kcal)',
    targets: { calories: 2500, protein: 140, carbs: 320, fat: 70, fibre: 30 },
  },
  {
    id: 'muscle_gain',
    label: 'Muscle Gain',
    description: 'Lean surplus for strength & hypertrophy (~2,900 kcal)',
    targets: { calories: 2900, protein: 175, carbs: 380, fat: 75, fibre: 35 },
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Set every nutrition target manually',
  },
];

export const GoalsPage: React.FC = () => {
  const { state, updateGoals } = useMacroLogStore();
  const unit = state.settings.weightUnit;

  const [preset, setPreset] = useState<GoalPreset>(state.goals.preset);
  const [calories, setCalories] = useState(String(state.goals.calories));
  const [protein, setProtein] = useState(String(state.goals.protein));
  const [carbs, setCarbs] = useState(String(state.goals.carbs));
  const [fat, setFat] = useState(String(state.goals.fat));
  const [fibre, setFibre] = useState(String(state.goals.fibre));
  const [targetWeight, setTargetWeight] = useState(
    state.goals.targetWeightKg !== undefined
      ? String(convertWeightToDisplay(state.goals.targetWeightKg, unit))
      : ''
  );
  const [error, setError] = useState('');

  useEffect(() => {
    setPreset(state.goals.preset);
    setCalories(String(state.goals.calories));
    setProtein(String(state.goals.protein));
    setCarbs(String(state.goals.carbs));
    setFat(String(state.goals.fat));
    setFibre(String(state.goals.fibre));
    setTargetWeight(
      state.goals.targetWeightKg !== undefined
        ? String(convertWeightToDisplay(state.goals.targetWeightKg, unit))
        : ''
    );
  }, [state.goals, unit]);

  const applyPreset = (id: GoalPreset) => {
    setPreset(id);
    const found = GOAL_PRESETS.find((p) => p.id === id);
    if (found?.targets) {
      setCalories(String(found.targets.calories));
      setProtein(String(found.targets.protein));
      setCarbs(String(found.targets.carbs));
      setFat(String(found.targets.fat));
      setFibre(String(found.targets.fibre));
    }
  };

  const estimatedMacroCalories =
    (parseFloat(protein) || 0) * 4 +
    (parseFloat(carbs) || 0) * 4 +
    (parseFloat(fat) || 0) * 9;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cal = Math.round(parseFloat(calories));
    const pro = Math.round(parseFloat(protein));
    const carb = Math.round(parseFloat(carbs));
    const f = Math.round(parseFloat(fat));
    const fib = Math.round(parseFloat(fibre));

    if ([cal, pro, carb, f, fib].some((v) => !Number.isFinite(v) || v <= 0)) {
      setError('All calorie and macro targets must be positive numbers.');
      return;
    }

    let targetWeightKg: number | undefined = undefined;
    if (targetWeight.trim() !== '') {
      const tw = parseFloat(targetWeight);
      if (!Number.isFinite(tw) || tw <= 0) {
        setError('Target weight must be a positive number.');
        return;
      }
      targetWeightKg = convertDisplayWeightToKg(tw, unit);
    }

    setError('');
    updateGoals({
      preset,
      calories: cal,
      protein: pro,
      carbs: carb,
      fat: f,
      fibre: fib,
      targetWeightKg,
    });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <section>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Updates apply immediately without altering historical logs
        </p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Nutrition Goals
        </h1>
      </section>

      {/* Presets */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Goal Presets (Suggested Targets)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {GOAL_PRESETS.map((p) => {
            const active = preset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className={`p-4 rounded-2xl border text-left transition-colors ${
                  active
                    ? 'bg-lime-50 dark:bg-lime-950/40 border-lime-500 dark:border-lime-500'
                    : 'bg-white dark:bg-[#121821] border-stone-200 dark:border-slate-800 hover:border-stone-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {p.label}
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {p.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Editable Target Form */}
      <form
        onSubmit={handleSave}
        className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5"
      >
        {error && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-xs font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Daily Calorie Target (kcal)
            </label>
            <input
              type="number"
              min="500"
              max="10000"
              value={calories}
              onChange={(e) => {
                setCalories(e.target.value);
                setPreset('custom');
              }}
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Target Body Weight ({unit}, optional)
            </label>
            <input
              type="number"
              step="0.05"
              value={targetWeight}
              onChange={(e) => setTargetWeight(e.target.value)}
              placeholder={`e.g. ${unit === 'kg' ? '64.0' : '141.0'}`}
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Protein Target (g)
            </label>
            <input
              type="number"
              min="10"
              value={protein}
              onChange={(e) => {
                setProtein(e.target.value);
                setPreset('custom');
              }}
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Carbohydrate Target (g)
            </label>
            <input
              type="number"
              min="10"
              value={carbs}
              onChange={(e) => {
                setCarbs(e.target.value);
                setPreset('custom');
              }}
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Fat Target (g)
            </label>
            <input
              type="number"
              min="10"
              value={fat}
              onChange={(e) => {
                setFat(e.target.value);
                setPreset('custom');
              }}
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Fibre Target (g)
            </label>
            <input
              type="number"
              min="5"
              value={fibre}
              onChange={(e) => {
                setFibre(e.target.value);
                setPreset('custom');
              }}
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
            />
          </div>
        </div>

        <div className="pt-2 border-t border-stone-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Macro energy estimate:{' '}
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {Math.round(estimatedMacroCalories).toLocaleString()} kcal
            </span>{' '}
            (4 kcal/g protein & carbs · 9 kcal/g fat)
          </div>

          <button
            type="submit"
            className="min-h-[46px] px-6 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-sm font-semibold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Check className="w-4 h-4" />
            Save Goals
          </button>
        </div>
      </form>
    </div>
  );
};
