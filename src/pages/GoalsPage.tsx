import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react';
import { SmartCalorieTrackerPanel } from '../components/SmartCalorieTrackerPanel';
import { WeeklyAssessmentBanner } from '../components/WeeklyAssessmentBanner';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { getGoalDisplayLabel } from '../utils/fitnessCalculator';
import {
  convertDisplayWeightToKg,
  convertWeightToDisplay,
  formatWeight,
} from '../utils/nutritionUtils';

export const GoalsPage: React.FC = () => {
  const { state, dailyWaterGoalMl, updateGoals } = useMacroLogStore();
  const unit = state.settings.weightUnit;
  const { profile } = state;

  const [showManualOverride, setShowManualOverride] = useState(false);
  const [calories, setCalories] = useState(String(state.goals.calories || 2200));
  const [protein, setProtein] = useState(String(state.goals.protein || 140));
  const [carbs, setCarbs] = useState(String(state.goals.carbs || 245));
  const [fat, setFat] = useState(String(state.goals.fat || 73));
  const [fibre, setFibre] = useState(String(state.goals.fibre || 30));
  const [targetWeight, setTargetWeight] = useState(
    state.goals.targetWeightKg !== undefined
      ? String(convertWeightToDisplay(state.goals.targetWeightKg, unit))
      : ''
  );
  const [manualError, setManualError] = useState('');

  useEffect(() => {
    if (state.goals.calories > 0) {
      setCalories(String(state.goals.calories));
      setProtein(String(state.goals.protein));
      setCarbs(String(state.goals.carbs));
      setFat(String(state.goals.fat));
      setFibre(String(state.goals.fibre));
    }
    setTargetWeight(
      state.goals.targetWeightKg !== undefined
        ? String(convertWeightToDisplay(state.goals.targetWeightKg, unit))
        : ''
    );
  }, [state.goals, unit]);

  const editorMacroPcts = useMemo(() => {
    const pCal = (parseFloat(protein) || 0) * 4;
    const cCal = (parseFloat(carbs) || 0) * 4;
    const fCal = (parseFloat(fat) || 0) * 9;
    const total = pCal + cCal + fCal;
    if (total <= 0) return { proteinPct: 30, carbsPct: 45, fatPct: 25 };
    const pPct = Math.round((pCal / total) * 100);
    const fPct = Math.round((fCal / total) * 100);
    const cPct = Math.max(0, 100 - pPct - fPct);
    return { proteinPct: pPct, carbsPct: cPct, fatPct: fPct };
  }, [carbs, fat, protein]);

  const applyMacroRatios = (nextCal: number, pPct: number, fPct: number) => {
    const clampedP = Math.min(50, Math.max(15, pPct));
    const clampedF = Math.min(45, Math.max(15, fPct));
    const cPct = Math.max(10, 100 - clampedP - clampedF);
    const totalPct = clampedP + clampedF + cPct;
    const normP = clampedP / totalPct;
    const normF = clampedF / totalPct;
    const normC = cPct / totalPct;

    setCalories(String(nextCal));
    setProtein(String(Math.round((nextCal * normP) / 4)));
    setCarbs(String(Math.round((nextCal * normC) / 4)));
    setFat(String(Math.round((nextCal * normF) / 9)));
    setFibre(String(Math.max(20, Math.round((nextCal / 1000) * 14))));
  };

  const estimatedMacroCalories =
    (parseFloat(protein) || 0) * 4 +
    (parseFloat(carbs) || 0) * 4 +
    (parseFloat(fat) || 0) * 9;

  const handleManualSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cal = Math.round(parseFloat(calories));
    const pro = Math.round(parseFloat(protein));
    const carb = Math.round(parseFloat(carbs));
    const f = Math.round(parseFloat(fat));
    const fib = Math.round(parseFloat(fibre));

    if ([cal, pro, carb, f, fib].some((v) => !Number.isFinite(v) || v <= 0)) {
      setManualError('All calorie and macro targets must be positive numbers.');
      return;
    }

    let targetWeightKg: number | undefined = undefined;
    if (targetWeight.trim() !== '') {
      const tw = parseFloat(targetWeight);
      if (!Number.isFinite(tw) || tw <= 0) {
        setManualError('Target weight must be a positive number.');
        return;
      }
      targetWeightKg = convertDisplayWeightToKg(tw, unit);
    }

    setManualError('');
    updateGoals({
      preset: 'custom',
      calories: cal,
      protein: pro,
      carbs: carb,
      fat: f,
      fibre: fib,
      targetWeightKg,
      estimatedBmr: state.goals.estimatedBmr,
      estimatedTdee: state.goals.estimatedTdee,
      adaptiveTdeeKcal: state.goals.adaptiveTdeeKcal,
      bmi: state.goals.bmi,
      goalSpeed: state.goals.goalSpeed,
      estimatedWeeks: state.goals.estimatedWeeks,
      macroFocus: state.goals.macroFocus,
      assessmentWeekNumber: state.goals.assessmentWeekNumber,
      initialCalculatedAt: state.goals.initialCalculatedAt,
      calculationVersion: state.goals.calculationVersion,
    });
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <section className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-xs text-[#52555E] dark:text-[#9A9CA3]">
            Personalized calorie, macro, hydration &amp; adaptive weekly targets
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-[#111317] dark:text-[#F3F4F6]">
            Goals &amp; Smart Calculator
          </h1>
        </div>
        {state.goals.calories > 0 && (
          <div className="text-xs font-medium text-[#52555E] dark:text-[#9A9CA3]">
            Active plan:{' '}
            <span className="font-semibold text-[#111317] dark:text-[#F3F4F6]">
              {getGoalDisplayLabel(profile.fitnessGoal)}
            </span>
          </div>
        )}
      </section>

      <WeeklyAssessmentBanner />

      {/* Active Saved Goal Overview Banner */}
      {state.goals.calories > 0 && (
        <section className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4 sm:p-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-[#52555E] dark:text-[#9A9CA3]">Active Calorie Target</div>
            <div className="mt-1 text-xl font-bold font-mono-nums text-[#4E6800] dark:text-[#C8FF00]">
              {state.goals.calories.toLocaleString()}{' '}
              <span className="text-xs font-normal text-[#52555E] dark:text-[#9A9CA3]">kcal/day</span>
            </div>
            {state.goals.adaptiveTdeeKcal ? (
              <div className="text-[11px] text-[#52555E] dark:text-[#9A9CA3] tabular-nums mt-0.5">
                Adaptive TDEE ~{state.goals.adaptiveTdeeKcal.toLocaleString()} kcal
              </div>
            ) : state.goals.estimatedTdee ? (
              <div className="text-[11px] text-[#52555E] dark:text-[#9A9CA3] tabular-nums mt-0.5">
                Est. TDEE ~{state.goals.estimatedTdee.toLocaleString()} kcal
              </div>
            ) : null}
          </div>

          <div>
            <div className="text-xs text-[#52555E] dark:text-[#9A9CA3]">Daily Macro Targets</div>
            <div className="mt-1 text-sm font-semibold font-mono-nums text-[#111317] dark:text-[#F3F4F6]">
              P {state.goals.protein}g · C {state.goals.carbs}g · F {state.goals.fat}g
            </div>
            <div className="text-[11px] text-[#52555E] dark:text-[#9A9CA3] tabular-nums mt-0.5">
              Fibre {state.goals.fibre}g/day
            </div>
          </div>

          <div>
            <div className="text-xs text-[#52555E] dark:text-[#9A9CA3]">Weight Goal</div>
            <div className="mt-1 text-sm font-semibold font-mono-nums text-[#111317] dark:text-[#F3F4F6]">
              {profile.currentWeightKg > 0 ? formatWeight(profile.currentWeightKg, unit) : '—'} →{' '}
              {state.goals.targetWeightKg
                ? formatWeight(state.goals.targetWeightKg, unit)
                : profile.targetWeightKg > 0
                ? formatWeight(profile.targetWeightKg, unit)
                : '—'}
            </div>
            {state.goals.estimatedWeeks ? (
              <div className="text-[11px] text-[#52555E] dark:text-[#9A9CA3] tabular-nums mt-0.5">
                Est. ~{state.goals.estimatedWeeks} weeks
              </div>
            ) : null}
          </div>

          <div>
            <div className="text-xs text-[#52555E] dark:text-[#9A9CA3]">Hydration Goal</div>
            <div className="mt-1 text-sm font-semibold font-mono-nums text-sky-600 dark:text-sky-400">
              {dailyWaterGoalMl.toLocaleString()} ml
            </div>
            <div className="text-[11px] text-[#52555E] dark:text-[#9A9CA3] tabular-nums mt-0.5">
              ~{Math.round(dailyWaterGoalMl / 250)} glasses/day
            </div>
          </div>
        </section>
      )}

      {/* Primary Scientific Smart Calorie Calculator */}
      <SmartCalorieTrackerPanel compactHeader />

      {/* Expandable Advanced Manual Override (No contradictory hardcoded calorie presets) */}
      <section className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowManualOverride((v) => !v)}
          aria-expanded={showManualOverride}
          className="w-full min-h-[56px] px-5 sm:px-6 py-4 flex items-center justify-between gap-3 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
        >
          <div className="flex items-center gap-3">
            <SlidersHorizontal className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00] shrink-0" />
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                Advanced: Customize Targets Manually
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Override your calculated calories, macro ratios, or exact daily gram targets
              </p>
            </div>
          </div>
          {showManualOverride ? (
            <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
          )}
        </button>

        {showManualOverride && (
          <form
            onSubmit={handleManualSave}
            className="px-5 sm:px-6 pb-6 pt-2 border-t border-black/8 dark:border-white/10 space-y-5"
          >
            {/* Interactive Macro % Sliders */}
            <div className="rounded-xl border border-black/10 dark:border-white/12 bg-stone-50/60 dark:bg-[#090A0C]/40 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Macro % Split (scales grams to your calorie target)
                </span>
                <span className="font-mono-nums text-slate-600 dark:text-slate-300">
                  {editorMacroPcts.proteinPct}% Protein · {editorMacroPcts.carbsPct}% Carbs ·{' '}
                  {editorMacroPcts.fatPct}% Fat
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 mb-1">
                    <span>Protein Share</span>
                    <span className="font-mono-nums font-semibold">{editorMacroPcts.proteinPct}%</span>
                  </div>
                  <input
                    type="range"
                    min="15"
                    max="50"
                    step="5"
                    value={Math.min(50, Math.max(15, Math.round(editorMacroPcts.proteinPct / 5) * 5))}
                    onChange={(e) =>
                      applyMacroRatios(
                        Math.max(1200, parseInt(calories, 10) || 2200),
                        Number(e.target.value),
                        editorMacroPcts.fatPct
                      )
                    }
                    className="w-full accent-[#4E6800] dark:accent-[#C8FF00]"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 mb-1">
                    <span>Fat Share</span>
                    <span className="font-mono-nums font-semibold">{editorMacroPcts.fatPct}%</span>
                  </div>
                  <input
                    type="range"
                    min="15"
                    max="45"
                    step="5"
                    value={Math.min(45, Math.max(15, Math.round(editorMacroPcts.fatPct / 5) * 5))}
                    onChange={(e) =>
                      applyMacroRatios(
                        Math.max(1200, parseInt(calories, 10) || 2200),
                        editorMacroPcts.proteinPct,
                        Number(e.target.value)
                      )
                    }
                    className="w-full accent-indigo-500"
                  />
                </div>
              </div>
            </div>

            {manualError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-xs font-medium">
                {manualError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Daily Calorie Target (kcal)
                </label>
                <input
                  type="number"
                  min="500"
                  max="10000"
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100"
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
                  onChange={(e) => setProtein(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100"
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
                  onChange={(e) => setCarbs(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100"
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
                  onChange={(e) => setFat(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100"
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
                  onChange={(e) => setFibre(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100"
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
                  className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-semibold font-mono-nums text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-stone-100 dark:border-white/12 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                Macro calorie total:{' '}
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {Math.round(estimatedMacroCalories).toLocaleString()} kcal
                </span>{' '}
                · P {editorMacroPcts.proteinPct}% / C {editorMacroPcts.carbsPct}% / F{' '}
                {editorMacroPcts.fatPct}%
              </div>

              <button
                type="submit"
                className="min-h-[44px] px-6 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-sm font-bold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <Check className="w-4 h-4" />
                Save Custom Targets
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
};
