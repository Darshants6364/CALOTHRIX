import React, { useState } from 'react';
import { Check, Loader2, Send, Sparkles, X } from 'lucide-react';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { askNutritionCoachViaApi } from '../services/mealAiService';
import { CoachAdviceResult, CoachSuggestionItem, MEAL_CATEGORIES, MealCategory } from '../types';

interface AiCoachDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  targetDate: string;
  remainingCalories: number;
  remainingProtein: number;
  remainingCarbs: number;
  remainingFat: number;
}

const QUICK_PROMPTS = [
  'Finish remaining macros today',
  'High-protein snack under 250 kcal',
  'Rebalance after a heavy meal',
  'High-protein Indian dinner ideas',
];

export const AiCoachDrawer: React.FC<AiCoachDrawerProps> = ({
  isOpen,
  onClose,
  targetDate,
  remainingCalories,
  remainingProtein,
  remainingCarbs,
  remainingFat,
}) => {
  const { state, logAnalyzedMealItems } = useMacroLogStore();
  const [prompt, setPrompt] = useState('');
  const [mealType, setMealType] = useState<MealCategory>('dinner');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [advice, setAdvice] = useState<CoachAdviceResult | null>(null);
  const [loggedTitles, setLoggedTitles] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  const runCoachQuery = async (queryText: string) => {
    const clean = queryText.trim();
    if (!clean || loading) return;
    setPrompt(clean);
    setError('');
    setLoading(true);
    setLoggedTitles({});
    try {
      const res = await askNutritionCoachViaApi({
        prompt: clean,
        remainingCalories: Math.round(remainingCalories),
        remainingProtein: Math.round(remainingProtein * 10) / 10,
        remainingCarbs: Math.round(remainingCarbs * 10) / 10,
        remainingFat: Math.round(remainingFat * 10) / 10,
        goalCalories: state.goals.calories || 2000,
        goalProtein: state.goals.protein || 120,
        dietaryPreference: state.profile.dietaryPreference,
        restrictions: state.profile.foodRestrictions,
      });
      setAdvice(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach nutrition coach right now.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogSuggestion = (item: CoachSuggestionItem) => {
    logAnalyzedMealItems({
      items: [
        {
          name: item.title,
          estimatedQuantityDescription: '1 coach-suggested serving',
          estimatedGrams: 180,
          calories: Math.max(0, Math.round(item.calories)),
          protein: Math.max(0, item.protein),
          carbs: Math.max(0, item.carbs),
          fat: Math.max(0, item.fat),
          fibre: Math.max(0, item.fibre || 0),
        },
      ],
      mealType,
      date: targetDate,
      sourceLabel: 'Finish-My-Day Coach',
    });
    setLoggedTitles((prev) => ({ ...prev, [item.title]: true }));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-end bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Finish My Day Nutrition Coach"
    >
      <div className="w-full sm:max-w-md h-[88dvh] sm:h-full bg-white dark:bg-[#111317] border-t sm:border-t-0 sm:border-l border-black/10 dark:border-white/12 rounded-t-3xl sm:rounded-none shadow-2xl flex flex-col overflow-hidden">
        <div className="sm:hidden w-10 h-1.5 bg-stone-300 dark:bg-slate-700 rounded-full mx-auto mt-3 shrink-0" />

        {/* Header */}
        <div className="px-5 py-4 border-b border-black/10 dark:border-white/12 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#C8FF00]/20 text-[#4E6800] dark:text-[#C8FF00] flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-50 truncate">
                Finish My Day Coach
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Live macro-aware meal ideas with 1-tap logging
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close coach"
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-stone-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Remaining Budget Strip */}
        <div className="px-5 py-3 bg-[#F4F3EF]/80 dark:bg-[#090A0C] border-b border-black/8 dark:border-white/10 grid grid-cols-4 gap-2 text-center shrink-0">
          <div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">Cal Left</div>
            <div className="text-xs font-bold font-mono-nums text-slate-900 dark:text-slate-100">
              {Math.round(remainingCalories)}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">Protein</div>
            <div className="text-xs font-bold font-mono-nums text-lime-700 dark:text-lime-400">
              {Math.round(remainingProtein)}g
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">Carbs</div>
            <div className="text-xs font-bold font-mono-nums text-amber-700 dark:text-amber-400">
              {Math.round(remainingCarbs)}g
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400">Fat</div>
            <div className="text-xs font-bold font-mono-nums text-indigo-700 dark:text-indigo-400">
              {Math.round(remainingFat)}g
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Quick 1-Tap Prompt Chips */}
          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              One-tap coaching prompts
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={loading}
                  onClick={() => void runCoachQuery(q)}
                  className="px-3 py-1.5 rounded-xl border border-black/10 dark:border-white/12 bg-stone-50 dark:bg-[#090A0C] text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-[#C8FF00] transition-colors text-left"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          {loading && (
            <div className="py-10 flex flex-col items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin text-[#4E6800] dark:text-[#C8FF00]" />
              <span>Building macro-matched meal options...</span>
            </div>
          )}

          {advice && !loading && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-lime-50/70 dark:bg-lime-950/25 border border-lime-500/30 text-xs text-slate-800 dark:text-slate-200 leading-relaxed">
                {advice.reply}
              </div>

              {advice.suggestions.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Quick-Log Suggestions
                    </span>
                    <select
                      value={mealType}
                      onChange={(e) => setMealType(e.target.value as MealCategory)}
                      aria-label="Target meal slot for coach suggestion"
                      className="h-8 px-2.5 rounded-lg border border-black/10 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-xs font-medium text-slate-800 dark:text-slate-200"
                    >
                      {MEAL_CATEGORIES.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {advice.suggestions.map((item, idx) => {
                    const isLogged = Boolean(loggedTitles[item.title]);
                    return (
                      <div
                        key={`${item.title}-${idx}`}
                        className="p-3.5 rounded-xl border border-black/10 dark:border-white/12 bg-stone-50/60 dark:bg-[#090A0C]/60 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {item.title}
                            </div>
                            <div className="text-xs font-mono-nums text-slate-600 dark:text-slate-300 mt-0.5">
                              {item.calories} kcal · P {item.protein}g · C {item.carbs}g · F {item.fat}g
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={isLogged}
                            onClick={() => handleQuickLogSuggestion(item)}
                            className={`min-h-[34px] px-3 rounded-lg text-xs font-bold inline-flex items-center gap-1 shrink-0 whitespace-nowrap ${
                              isLogged
                                ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                                : 'bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black hover:opacity-90'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>{isLogged ? 'Logged' : 'Quick Log'}</span>
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {item.reason}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input Footer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runCoachQuery(prompt);
          }}
          className="p-4 border-t border-black/10 dark:border-white/12 bg-stone-50/60 dark:bg-[#090A0C] flex items-center gap-2 shrink-0"
        >
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask e.g. '450 kcal veg dinner with 30g protein'"
            className="flex-1 h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
          />
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            aria-label="Ask nutrition coach"
            className="h-11 px-4 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-xs font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-45 shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Ask</span>
          </button>
        </form>
      </div>
    </div>
  );
};
