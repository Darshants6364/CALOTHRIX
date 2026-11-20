import React, { useState } from 'react';
import { Check, Database, Loader2, Sparkles, X } from 'lucide-react';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { analyzeMealViaApi } from '../services/mealAiService';
import { AnalyzedMealItem, MealCategory, MEAL_CATEGORIES } from '../types';
import { matchAnalyzedItemToDb } from '../utils/analyticsUtils';
import { searchFoodsIntelligent } from '../utils/foodSearchEngine';
import { getPortionsForFood } from '../utils/portionEngine';

interface QuickAiLogBarProps {
  defaultMeal?: MealCategory;
  targetDate?: string;
}

interface GroundedDraftItem extends AnalyzedMealItem {
  matchedDbName?: string;
  matchedSource?: string;
  useDbMatch: boolean;
  dbScaled?: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fibre: number;
  };
  aiOriginal: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fibre: number;
  };
}

export const QuickAiLogBar: React.FC<QuickAiLogBarProps> = ({
  defaultMeal = 'lunch',
  targetDate,
}) => {
  const { allFoods, selectedDate, logAnalyzedMealItems, openMealScannerModal } =
    useMacroLogStore();

  const [input, setInput] = useState('');
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState('');
  const [mealType, setMealType] = useState<MealCategory>(defaultMeal);
  const [draftItems, setDraftItems] = useState<GroundedDraftItem[]>([]);

  const effectiveDate = targetDate || selectedDate;

  const handleParse = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || parsing) return;

    setError('');
    setParsing(true);
    try {
      const result = await analyzeMealViaApi({
        mode: 'text',
        promptText: text,
        mealHint: defaultMeal,
      });

      const grounded: GroundedDraftItem[] = result.items.map((item) => {
        const dbMatch = matchAnalyzedItemToDb(item.name, item.estimatedGrams, allFoods);
        const useDb = Boolean(dbMatch && dbMatch.confidence === 'high');
        return {
          ...item,
          ...(useDb && dbMatch ? dbMatch.scaledMacros : {}),
          matchedDbName: dbMatch?.food.name,
          matchedSource: dbMatch?.food.sourceName,
          useDbMatch: useDb,
          dbScaled: dbMatch?.scaledMacros,
          aiOriginal: {
            calories: item.calories,
            protein: item.protein,
            carbs: item.carbs,
            fat: item.fat,
            fibre: item.fibre,
          },
        };
      });

      setMealType(result.suggestedMealType || defaultMeal);
      setDraftItems(grounded);
    } catch (err) {
      // Offline / non-AI fast single-item fallback using intelligent local search
      const qtyMatch = text.match(/^(\d+(?:\.\d+)?)\s*(g|gm|grams|ml|cup|cups|pcs|pc|piece|pieces|katori|bowl|slice|slices|scoop|scoops)?\s+(.+)$/i);
      const queryPart = qtyMatch ? qtyMatch[3].trim() : text;
      const numPart = qtyMatch ? parseFloat(qtyMatch[1]) : 1;
      const unitPart = (qtyMatch?.[2] || '').toLowerCase();

      const localHits = searchFoodsIntelligent(allFoods, queryPart, { limit: 1 });
      if (localHits.length > 0 && !text.includes(',')) {
        const food = localHits[0];
        const portions = getPortionsForFood(food);
        const defP = portions.find((p) => p.isDefault) || portions[0];
        let grams = defP ? defP.gramOrMlWeight : food.servingWeightGrams || 100;
        if (unitPart === 'g' || unitPart === 'gm' || unitPart === 'grams' || unitPart === 'ml') {
          grams = Math.max(1, numPart);
        } else if (qtyMatch) {
          grams = Math.max(1, Math.round(grams * numPart));
        }
        const matched = matchAnalyzedItemToDb(food.name, grams, [food]);
        if (matched) {
          setDraftItems([
            {
              name: food.name,
              estimatedQuantityDescription: `${grams} g`,
              estimatedGrams: grams,
              ...matched.scaledMacros,
              matchedDbName: food.name,
              matchedSource: food.sourceName || 'Verified DB',
              useDbMatch: true,
              dbScaled: matched.scaledMacros,
              aiOriginal: matched.scaledMacros,
            },
          ]);
          setMealType(defaultMeal);
          setParsing(false);
          return;
        }
      }

      setError(
        err instanceof Error
          ? err.message
          : 'Could not parse meal right now. Try Photo / Voice or manual search.'
      );
    } finally {
      setParsing(false);
    }
  };

  const toggleItemDbGrounding = (idx: number) => {
    setDraftItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx || !item.dbScaled) return item;
        const nextUse = !item.useDbMatch;
        return {
          ...item,
          useDbMatch: nextUse,
          ...(nextUse ? item.dbScaled : item.aiOriginal),
        };
      })
    );
  };

  const handleLogDraft = () => {
    if (draftItems.length === 0) return;
    logAnalyzedMealItems({
      items: draftItems,
      mealType,
      date: effectiveDate,
      sourceLabel: draftItems.every((i) => i.useDbMatch)
        ? 'Quick Log (Verified DB)'
        : 'Quick Log AI',
    });
    setDraftItems([]);
    setInput('');
    setError('');
  };

  const totalKcal = Math.round(draftItems.reduce((s, i) => s + i.calories, 0));
  const totalProtein = Math.round(draftItems.reduce((s, i) => s + i.protein, 0) * 10) / 10;

  return (
    <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-3 sm:p-4 space-y-3">
      <form onSubmit={handleParse} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Sparkles className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='Quick log: e.g. "2 boiled eggs, 1 sourdough toast, black coffee"'
            className="w-full h-11 pl-10 pr-4 rounded-xl border border-black/10 dark:border-white/12 bg-[#F4F3EF]/70 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="submit"
            disabled={parsing || !input.trim()}
            className="min-h-[44px] px-4 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-xs font-bold hover:opacity-90 disabled:opacity-45 transition-opacity inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            {parsing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>{parsing ? 'Parsing...' : 'Quick Parse'}</span>
          </button>
          <button
            type="button"
            onClick={() => openMealScannerModal({ mode: 'menu', meal: defaultMeal, date: effectiveDate })}
            className="min-h-[44px] px-3 rounded-xl border border-black/10 dark:border-white/12 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-[#C8FF00] transition-colors whitespace-nowrap"
          >
            Menu Advisor
          </button>
        </div>
      </form>

      {error && (
        <div className="text-xs text-rose-600 dark:text-rose-400 flex items-center justify-between gap-2 px-1">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="text-slate-400 hover:text-slate-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {draftItems.length > 0 && (
        <div className="pt-2 border-t border-black/8 dark:border-white/10 space-y-2.5">
          <div className="divide-y divide-black/6 dark:divide-white/8">
            {draftItems.map((item, idx) => (
              <div key={`${item.name}-${idx}`} className="py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900 dark:text-slate-100 flex flex-wrap items-center gap-1.5">
                    <span>{item.useDbMatch && item.matchedDbName ? item.matchedDbName : item.name}</span>
                    <span className="text-slate-400 font-mono-nums">· {item.estimatedGrams}g</span>
                    {item.dbScaled && (
                      <button
                        type="button"
                        onClick={() => toggleItemDbGrounding(idx)}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                          item.useDbMatch
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                            : 'bg-slate-200/70 dark:bg-white/10 text-slate-600 dark:text-slate-300'
                        }`}
                        title="Toggle Verified DB macro values vs AI estimate"
                      >
                        <Database className="w-2.5 h-2.5" />
                        {item.useDbMatch ? 'Verified DB' : 'AI Est.'}
                      </button>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-nums">
                    P {item.protein}g · C {item.carbs}g · F {item.fat}g · Fibre {item.fibre}g
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-bold font-mono-nums text-slate-900 dark:text-slate-100">
                    {item.calories} kcal
                  </span>
                  <button
                    type="button"
                    onClick={() => setDraftItems((prev) => prev.filter((_, i) => i !== idx))}
                    aria-label={`Remove ${item.name}`}
                    className="p-1 text-slate-400 hover:text-rose-500"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-2">
              <select
                value={mealType}
                onChange={(e) => setMealType(e.target.value as MealCategory)}
                aria-label="Meal category for quick log"
                className="h-9 px-2.5 rounded-lg border border-black/10 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-xs font-medium text-slate-800 dark:text-slate-200"
              >
                {MEAL_CATEGORIES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <span className="text-xs font-mono-nums text-slate-500 dark:text-slate-400">
                Total: <strong className="text-slate-900 dark:text-slate-100">{totalKcal} kcal</strong> · {totalProtein}g P
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDraftItems([])}
                className="min-h-[36px] px-3 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={handleLogDraft}
                className="min-h-[36px] px-4 rounded-lg bg-[#C8FF00] text-black text-xs font-bold inline-flex items-center gap-1.5 hover:brightness-95"
              >
                <Check className="w-3.5 h-3.5" />
                Log {draftItems.length} {draftItems.length === 1 ? 'Item' : 'Items'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
