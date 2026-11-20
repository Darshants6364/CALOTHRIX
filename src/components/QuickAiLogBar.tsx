import React, { useState } from 'react';
import { Camera, Check, FileText, Loader2, Mic, Sparkles, X } from 'lucide-react';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { analyzeMealViaApi, recordAiTrainingEventApi } from '../services/mealAiService';
import {
  AiTrainingPayloadSnapshot,
  AnalyzedMealItem,
  MealCategory,
  MEAL_CATEGORIES,
} from '../types';
import { matchAnalyzedItemToDb } from '../utils/analyticsUtils';
import { searchFoodsIntelligent } from '../utils/foodSearchEngine';
import { round1 } from '../utils/nutritionUtils';
import { getPortionsForFood } from '../utils/portionEngine';

interface QuickAiLogBarProps {
  defaultMeal?: MealCategory;
  targetDate?: string;
}

interface EditableQuickDraftItem extends AnalyzedMealItem {
  aiBaseGrams: number;
  aiBaseMacros: {
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
  const [draftItems, setDraftItems] = useState<EditableQuickDraftItem[]>([]);
  const [rawAiSnapshot, setRawAiSnapshot] = useState<AiTrainingPayloadSnapshot | null>(null);
  const [aiDescription, setAiDescription] = useState('');
  const [feedbackNote, setFeedbackNote] = useState('');

  const effectiveDate = targetDate || selectedDate;

  const toEditableItems = (items: AnalyzedMealItem[]): EditableQuickDraftItem[] =>
    items.map((item) => {
      const safeGrams = Math.max(1, Math.round(item.estimatedGrams || 100));
      return {
        ...item,
        estimatedGrams: safeGrams,
        calories: Math.max(0, Math.round(item.calories || 0)),
        protein: round1(item.protein || 0),
        carbs: round1(item.carbs || 0),
        fat: round1(item.fat || 0),
        fibre: round1(item.fibre || 0),
        aiBaseGrams: safeGrams,
        aiBaseMacros: {
          calories: Math.max(0, Math.round(item.calories || 0)),
          protein: round1(item.protein || 0),
          carbs: round1(item.carbs || 0),
          fat: round1(item.fat || 0),
          fibre: round1(item.fibre || 0),
        },
      };
    });

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

      const editable = toEditableItems(result.items || []);
      setRawAiSnapshot({
        mealTitle: result.mealTitle || text,
        detectedDescription: result.detectedDescription || result.mealTitle || text,
        totalCalories: Math.round(result.totalCalories || 0),
        totalProtein: round1(result.totalProtein || 0),
        totalCarbs: round1(result.totalCarbs || 0),
        totalFat: round1(result.totalFat || 0),
        totalFibre: round1(result.totalFibre || 0),
        items: editable.map((it) => ({
          name: it.name,
          estimatedGrams: it.estimatedGrams,
          calories: it.calories,
          protein: it.protein,
          carbs: it.carbs,
          fat: it.fat,
          fibre: it.fibre,
        })),
      });
      setAiDescription(result.detectedDescription || result.mealTitle || text);
      setFeedbackNote('');
      setMealType(result.suggestedMealType || defaultMeal);
      setDraftItems(editable);
    } catch (err) {
      // Offline / non-AI fast single-item fallback using intelligent local search
      const qtyMatch = text.match(
        /^(\d+(?:\.\d+)?)\s*(g|gm|grams|ml|cup|cups|pcs|pc|piece|pieces|katori|bowl|slice|slices|scoop|scoops)?\s+(.+)$/i
      );
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
          const fallbackItem: AnalyzedMealItem = {
            name: food.name,
            estimatedQuantityDescription: `${grams} g`,
            estimatedGrams: grams,
            ...matched.scaledMacros,
          };
          const editable = toEditableItems([fallbackItem]);
          setRawAiSnapshot({
            mealTitle: food.name,
            detectedDescription: text,
            totalCalories: Math.round(matched.scaledMacros.calories),
            totalProtein: round1(matched.scaledMacros.protein),
            totalCarbs: round1(matched.scaledMacros.carbs),
            totalFat: round1(matched.scaledMacros.fat),
            totalFibre: round1(matched.scaledMacros.fibre),
            items: editable.map((it) => ({
              name: it.name,
              estimatedGrams: it.estimatedGrams,
              calories: it.calories,
              protein: it.protein,
              carbs: it.carbs,
              fat: it.fat,
              fibre: it.fibre,
            })),
          });
          setAiDescription(text);
          setFeedbackNote('');
          setDraftItems(editable);
          setMealType(defaultMeal);
          setParsing(false);
          return;
        }
      }

      setError(
        err instanceof Error
          ? err.message
          : 'Could not parse meal right now. Try Photo / Voice AI.'
      );
    } finally {
      setParsing(false);
    }
  };

  const updateDraftName = (idx: number, nextName: string) => {
    setDraftItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, name: nextName } : item))
    );
  };

  const updateDraftGrams = (idx: number, nextGrams: number) => {
    const safeNext = Math.max(1, Math.round(nextGrams || 1));
    setDraftItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const ratio = safeNext / Math.max(1, item.aiBaseGrams);
        return {
          ...item,
          estimatedGrams: safeNext,
          calories: Math.round(item.aiBaseMacros.calories * ratio),
          protein: round1(item.aiBaseMacros.protein * ratio),
          carbs: round1(item.aiBaseMacros.carbs * ratio),
          fat: round1(item.aiBaseMacros.fat * ratio),
          fibre: round1(item.aiBaseMacros.fibre * ratio),
        };
      })
    );
  };

  const updateDraftCalories = (idx: number, nextCalories: number) => {
    const safeKcal = Math.max(0, Math.round(nextCalories || 0));
    setDraftItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, calories: safeKcal } : item))
    );
  };

  const handleLogDraft = () => {
    if (draftItems.length === 0) return;

    logAnalyzedMealItems({
      items: draftItems,
      mealType,
      date: effectiveDate,
      sourceLabel: 'Quick Log AI',
    });

    if (rawAiSnapshot) {
      const userFinalOutput: AiTrainingPayloadSnapshot = {
        mealTitle: rawAiSnapshot.mealTitle,
        detectedDescription: aiDescription || input.trim() || rawAiSnapshot.mealTitle,
        totalCalories: Math.round(draftItems.reduce((s, i) => s + i.calories, 0)),
        totalProtein: round1(draftItems.reduce((s, i) => s + i.protein, 0)),
        totalCarbs: round1(draftItems.reduce((s, i) => s + i.carbs, 0)),
        totalFat: round1(draftItems.reduce((s, i) => s + i.fat, 0)),
        totalFibre: round1(draftItems.reduce((s, i) => s + i.fibre, 0)),
        items: draftItems.map((it) => ({
          name: it.name.trim() || 'Food Item',
          estimatedGrams: Math.max(1, Math.round(it.estimatedGrams || 0)),
          calories: Math.max(0, Math.round(it.calories || 0)),
          protein: round1(it.protein || 0),
          carbs: round1(it.carbs || 0),
          fat: round1(it.fat || 0),
          fibre: round1(it.fibre || 0),
        })),
      };

      void recordAiTrainingEventApi({
        inputMode: 'quick_parse',
        prepStyle: 'standard',
        userInputText: input.trim() || undefined,
        aiDescription: aiDescription || input.trim() || 'Quick AI Parse',
        aiRawOutput: rawAiSnapshot,
        userFinalOutput,
        userFeedbackNote: feedbackNote.trim() || undefined,
      });
    }

    setDraftItems([]);
    setRawAiSnapshot(null);
    setAiDescription('');
    setFeedbackNote('');
    setInput('');
    setError('');
  };

  const totalKcal = Math.round(draftItems.reduce((s, i) => s + i.calories, 0));
  const totalProtein = round1(draftItems.reduce((s, i) => s + i.protein, 0));

  return (
    <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-3 sm:p-4 space-y-3">
      <form
        onSubmit={handleParse}
        className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2"
      >
        <div className="relative flex-1 min-w-0">
          <Sparkles className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='Describe your meal: e.g. "2 boiled eggs, 1 sourdough toast, black coffee"'
            className="w-full h-11 pl-10 pr-4 rounded-xl border border-black/10 dark:border-white/12 bg-[#F4F3EF]/70 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="submit"
            disabled={parsing || !input.trim()}
            className="min-h-[44px] px-4 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-xs font-bold hover:opacity-90 disabled:opacity-45 transition-opacity inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            {parsing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            <span>{parsing ? 'Parsing...' : 'Quick Parse'}</span>
          </button>

          <button
            type="button"
            onClick={() =>
              openMealScannerModal({ mode: 'photo', meal: defaultMeal, date: effectiveDate })
            }
            className="min-h-[44px] px-3 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-slate-800 dark:text-slate-100 text-xs font-semibold hover:border-[#C8FF00] transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Camera className="w-3.5 h-3.5 text-[#4E6800] dark:text-[#C8FF00]" />
            <span>Photo AI</span>
          </button>

          <button
            type="button"
            onClick={() =>
              openMealScannerModal({ mode: 'voice', meal: defaultMeal, date: effectiveDate })
            }
            className="min-h-[44px] px-3 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-slate-800 dark:text-slate-100 text-xs font-semibold hover:border-[#C8FF00] transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Mic className="w-3.5 h-3.5 text-[#4E6800] dark:text-[#C8FF00]" />
            <span>Voice AI</span>
          </button>

          <button
            type="button"
            onClick={() =>
              openMealScannerModal({ mode: 'label', meal: defaultMeal, date: effectiveDate })
            }
            className="min-h-[44px] px-3 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-slate-800 dark:text-slate-100 text-xs font-semibold hover:border-[#C8FF00] transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <FileText className="w-3.5 h-3.5 text-[#4E6800] dark:text-[#C8FF00]" />
            <span>Label OCR</span>
          </button>
        </div>
      </form>

      {error && (
        <div className="text-xs text-rose-600 dark:text-rose-400 flex items-center justify-between gap-2 px-1">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError('')}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {draftItems.length > 0 && (
        <div className="pt-2.5 border-t border-black/8 dark:border-white/10 space-y-2.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Review &amp; edit AI output — calories update automatically and help train better future estimates.
          </div>

          <div className="divide-y divide-black/6 dark:divide-white/8">
            {draftItems.map((item, idx) => (
              <div
                key={`draft-${idx}`}
                className="py-2 flex flex-wrap items-center justify-between gap-2.5 text-xs"
              >
                <div className="flex-1 min-w-[180px] space-y-1">
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => updateDraftName(idx, e.target.value)}
                    aria-label={`Edit food name ${idx + 1}`}
                    className="w-full h-8 px-2.5 rounded-lg border border-black/10 dark:border-white/12 bg-stone-50/70 dark:bg-[#090A0C] text-xs font-semibold text-slate-900 dark:text-slate-100"
                  />
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-nums">
                    P {item.protein}g · C {item.carbs}g · F {item.fat}g · Fibre {item.fibre}g
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <label className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <input
                      type="number"
                      min="1"
                      value={item.estimatedGrams}
                      onChange={(e) => updateDraftGrams(idx, Number(e.target.value))}
                      aria-label={`Edit grams for ${item.name}`}
                      className="w-16 h-8 px-2 rounded-lg border border-black/10 dark:border-white/12 bg-stone-50/70 dark:bg-[#090A0C] text-xs font-mono-nums text-slate-900 dark:text-slate-100 text-right"
                    />
                    <span>g</span>
                  </label>

                  <label className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <input
                      type="number"
                      min="0"
                      value={item.calories}
                      onChange={(e) => updateDraftCalories(idx, Number(e.target.value))}
                      aria-label={`Edit calories for ${item.name}`}
                      className="w-16 h-8 px-2 rounded-lg border border-black/10 dark:border-white/12 bg-stone-50/70 dark:bg-[#090A0C] text-xs font-bold font-mono-nums text-slate-900 dark:text-slate-100 text-right"
                    />
                    <span>kcal</span>
                  </label>

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

          <input
            type="text"
            value={feedbackNote}
            onChange={(e) => setFeedbackNote(e.target.value)}
            placeholder="Optional feedback if AI missed something (e.g., cooked in butter, small bowl)"
            className="w-full h-8 px-2.5 rounded-lg border border-black/8 dark:border-white/10 bg-stone-50/50 dark:bg-[#090A0C] text-[11px] text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
          />

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
                Total: <strong className="text-slate-900 dark:text-slate-100">{totalKcal} kcal</strong> ·{' '}
                {totalProtein}g P
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraftItems([]);
                  setRawAiSnapshot(null);
                  setFeedbackNote('');
                }}
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

