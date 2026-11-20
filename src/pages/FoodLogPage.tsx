import React, { memo, useCallback, useMemo, useState } from 'react';
import {
  Barcode,
  BookmarkPlus,
  Camera,
  Check,
  Copy,
  Download,
  History,
  Mic,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DateStrip } from '../components/DateStrip';
import { openShareStudio } from '../components/MacroShareModal';
import { QuickAiLogBar } from '../components/QuickAiLogBar';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { FoodLogEntry, MealCategory, MEAL_CATEGORIES } from '../types';
import { formatReadableDate, formatShortDate } from '../utils/dateUtils';
import { formatFoodQuantity, getMealBreakdown, round1 } from '../utils/nutritionUtils';

interface FoodLogEntryRowProps {
  entry: FoodLogEntry;
  mealShortLabel: string;
  foodUnit: 'g' | 'oz';
  onMealChange: (entry: FoodLogEntry, nextMeal: MealCategory) => void;
  onQuickQuantityChange: (entryId: string, grams: number) => void;
  onDownloadSticker: (entry: FoodLogEntry, mealLabel: string) => void;
  onEdit: (entry: FoodLogEntry) => void;
  onDuplicate: (entry: FoodLogEntry) => void;
  onDelete: (entry: FoodLogEntry) => void;
}

const FoodLogEntryRow = memo<FoodLogEntryRowProps>(
  ({
    entry,
    mealShortLabel,
    foodUnit,
    onMealChange,
    onQuickQuantityChange,
    onDownloadSticker,
    onEdit,
    onDuplicate,
    onDelete,
  }) => {
    const [editingQty, setEditingQty] = useState(false);
    const [qtyValue, setQtyValue] = useState(String(entry.quantityGrams));

    const commitQty = () => {
      const parsed = parseFloat(qtyValue);
      if (Number.isFinite(parsed) && parsed > 0 && parsed <= 10000) {
        onQuickQuantityChange(entry.id, parsed);
      } else {
        setQtyValue(String(entry.quantityGrams));
      }
      setEditingQty(false);
    };

    return (
      <div className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-stone-50/60 dark:hover:bg-white/[0.02] transition-colors">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {entry.foodName}
            </span>
            {editingQty ? (
              <span className="inline-flex items-center gap-1">
                <input
                  type="number"
                  min="1"
                  max="10000"
                  step="any"
                  autoFocus
                  value={qtyValue}
                  onChange={(e) => setQtyValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitQty();
                    } else if (e.key === 'Escape') {
                      setQtyValue(String(entry.quantityGrams));
                      setEditingQty(false);
                    }
                  }}
                  aria-label={`Quick edit grams for ${entry.foodName}`}
                  className="w-20 h-7 px-2 rounded-md border border-[#C8FF00] bg-white dark:bg-[#090A0C] text-xs font-mono-nums text-slate-900 dark:text-slate-100"
                />
                <span className="text-[11px] text-slate-400">g</span>
                <button
                  type="button"
                  onClick={commitQty}
                  aria-label="Save quantity"
                  className="p-1 rounded text-emerald-600 dark:text-[#C8FF00] hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQtyValue(String(entry.quantityGrams));
                    setEditingQty(false);
                  }}
                  aria-label="Cancel quantity edit"
                  className="p-1 rounded text-slate-400 hover:text-slate-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setQtyValue(String(entry.quantityGrams));
                  setEditingQty(true);
                }}
                title="Click to quickly edit quantity"
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-[#4E6800] dark:hover:text-[#C8FF00] underline decoration-dotted underline-offset-2 font-mono-nums"
              >
                {formatFoodQuantity(entry.quantityGrams, foodUnit)}
              </button>
            )}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 tabular-nums">
            <span>P {entry.protein}g</span>
            <span aria-hidden="true">·</span>
            <span>C {entry.carbs}g</span>
            <span aria-hidden="true">·</span>
            <span>F {entry.fat}g</span>
            <span aria-hidden="true">·</span>
            <span>Fibre {entry.fibre}g</span>
            {entry.sourceName && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[11px] text-slate-400">{entry.sourceName}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-1.5 shrink-0">
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-mono-nums mr-1.5">
            {entry.calories} kcal
          </span>

          <select
            aria-label={`Move ${entry.foodName} to meal`}
            value={entry.mealType}
            onChange={(e) => onMealChange(entry, e.target.value as MealCategory)}
            className="h-9 px-2 rounded-lg border border-black/10 dark:border-white/15 bg-white dark:bg-[#090A0C] text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
          >
            {MEAL_CATEGORIES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.shortLabel}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => onDownloadSticker(entry, mealShortLabel)}
            title="Download transparent macro sticker"
            aria-label={`Download transparent sticker for ${entry.foodName}`}
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-500 hover:text-[#4E6800] dark:hover:text-[#C8FF00] hover:bg-stone-100 dark:hover:bg-[#14161C] transition-colors"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => onEdit(entry)}
            title="Edit entry"
            aria-label={`Edit ${entry.foodName}`}
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-stone-100 dark:hover:bg-[#14161C] transition-colors"
          >
            <Pencil className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => onDuplicate(entry)}
            title="Duplicate entry"
            aria-label={`Duplicate ${entry.foodName}`}
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-stone-100 dark:hover:bg-[#14161C] transition-colors"
          >
            <Copy className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => onDelete(entry)}
            title="Delete entry"
            aria-label={`Delete ${entry.foodName}`}
            className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }
);

FoodLogEntryRow.displayName = 'FoodLogEntryRow';

export const FoodLogPage: React.FC = () => {
  const {
    state,
    selectedDate,
    setSelectedDate,
    selectedDateEntries,
    selectedDateTotals,
    openAddFoodModal,
    openEditFoodModal,
    openMealScannerModal,
    openBarcodeScannerModal,
    deleteFoodEntry,
    duplicateFoodEntry,
    updateFoodEntry,
    quickUpdateFoodEntryQuantity,
    copyMealFromPreviousDay,
    savedMeals,
    saveMealCombo,
    logSavedMealCombo,
    notify,
    allFoods,
  } = useMacroLogStore();

  const [pendingDelete, setPendingDelete] = useState<FoodLogEntry | null>(null);
  const [savingComboMeal, setSavingComboMeal] = useState<MealCategory | null>(null);
  const [comboNameInput, setComboNameInput] = useState('');

  const foodById = useMemo(() => new Map(allFoods.map((f) => [f.id, f])), [allFoods]);

  const mealBreakdown = useMemo(
    () => getMealBreakdown(selectedDateEntries),
    [selectedDateEntries]
  );

  const aiPhotoBatchesByMeal = useMemo(() => {
    const out = {} as Record<MealCategory, FoodLogEntry[][]>;
    for (const meal of MEAL_CATEGORIES) {
      const items = mealBreakdown[meal.id].items;
      const aiBatchMap = new Map<string, FoodLogEntry[]>();
      for (const entry of items) {
        if (entry.sourceName === 'AI Photo Scan' || entry.sourceName === 'AI Photo Re-log') {
          const key = entry.createdAt || 'ai-photo';
          const group = aiBatchMap.get(key) || [];
          group.push(entry);
          aiBatchMap.set(key, group);
        }
      }
      const batches: FoodLogEntry[][] = [];
      aiBatchMap.forEach((group) => {
        if (group.length >= 2) batches.push(group);
      });
      out[meal.id] = batches;
    }
    return out;
  }, [mealBreakdown]);

  const handleMealChange = useCallback(
    (entry: FoodLogEntry, nextMeal: MealCategory) => {
      const matched = foodById.get(entry.foodId);
      const fallback = matched ?? {
        id: entry.foodId,
        name: entry.foodName,
        category: 'Custom' as const,
        servingName: entry.servingName,
        servingWeightGrams: entry.quantityGrams || 100,
        calories: entry.calories,
        protein: entry.protein,
        carbs: entry.carbs,
        fat: entry.fat,
        fibre: entry.fibre,
        isCustom: true,
      };
      updateFoodEntry(entry.id, {
        food: fallback,
        quantityGrams: entry.quantityGrams,
        mealType: nextMeal,
        date: entry.date,
      });
    },
    [foodById, updateFoodEntry]
  );

  const handleDuplicate = useCallback(
    (entry: FoodLogEntry) => duplicateFoodEntry(entry),
    [duplicateFoodEntry]
  );

  const openFoodItemSticker = useCallback(
    (entry: FoodLogEntry, mealLabel: string) => {
      openShareStudio({
        mode: 'food',
        foodPayload: {
          title: entry.foodName,
          subtitle: `${mealLabel} · ${formatFoodQuantity(
            entry.quantityGrams,
            state.settings.foodUnit
          )}`,
          calories: Math.round(entry.calories),
          protein: round1(entry.protein),
          carbs: round1(entry.carbs),
          fat: round1(entry.fat),
          fibre: round1(entry.fibre),
          dateLabel: formatShortDate(entry.date),
        },
      });
    },
    [state.settings.foodUnit]
  );

  const openAiPhotoBatchSticker = (
    mealLabel: string,
    batchItems: FoodLogEntry[]
  ) => {
    const batchTotals = batchItems.reduce(
      (acc, item) => ({
        calories: acc.calories + (item.calories || 0),
        protein: acc.protein + (item.protein || 0),
        carbs: acc.carbs + (item.carbs || 0),
        fat: acc.fat + (item.fat || 0),
        fibre: acc.fibre + (item.fibre || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 }
    );

    const itemNames = batchItems.map((item) => item.foodName).filter(Boolean);
    const titleSummary =
      itemNames.length > 0
        ? itemNames.slice(0, 3).join(', ') + (itemNames.length > 3 ? ` +${itemNames.length - 3}` : '')
        : `${mealLabel} · AI Photo Scan`;

    openShareStudio({
      mode: 'food',
      foodPayload: {
        title: titleSummary,
        subtitle: `${batchItems.length} items`,
        calories: Math.round(batchTotals.calories),
        protein: round1(batchTotals.protein),
        carbs: round1(batchTotals.carbs),
        fat: round1(batchTotals.fat),
        fibre: round1(batchTotals.fibre),
        dateLabel: formatShortDate(selectedDate),
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Daily Food Diary · {formatReadableDate(selectedDate)}
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Food Log
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => openBarcodeScannerModal({ date: selectedDate })}
            className="min-h-[44px] px-3.5 py-2.5 rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-semibold hover:border-[#C8FF00] transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
          >
            <Barcode className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00]" />
            <span>Barcode</span>
          </button>

          <button
            type="button"
            onClick={() => openMealScannerModal({ mode: 'photo', date: selectedDate })}
            className="min-h-[44px] px-4 py-2.5 rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-semibold hover:border-[#C8FF00] transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
          >
            <Camera className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00]" />
            <Mic className="w-3.5 h-3.5 text-[#4E6800] dark:text-[#C8FF00] -ml-1" />
            <span>Photo / Voice AI</span>
          </button>

          <button
            type="button"
            onClick={() => openAddFoodModal({ date: selectedDate })}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-sm font-bold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Add Food
          </button>
        </div>
      </section>

      <DateStrip selectedDate={selectedDate} onSelectDate={setSelectedDate} />

      {/* Full-Day Nutritional Totals Bar */}
      <section className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4 sm:p-5">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Calories</div>
            <div className="mt-0.5 text-lg font-bold font-mono-nums text-slate-900 dark:text-slate-50">
              {selectedDateTotals.calories.toLocaleString()}{' '}
              <span className="text-xs font-normal text-slate-400">
                / {state.goals.calories}
              </span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Protein</div>
            <div className="mt-0.5 text-lg font-bold font-mono-nums text-lime-700 dark:text-lime-400">
              {selectedDateTotals.protein}g{' '}
              <span className="text-xs font-normal text-slate-400">/ {state.goals.protein}g</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Carbs</div>
            <div className="mt-0.5 text-lg font-bold font-mono-nums text-amber-700 dark:text-amber-400">
              {selectedDateTotals.carbs}g{' '}
              <span className="text-xs font-normal text-slate-400">/ {state.goals.carbs}g</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Fat</div>
            <div className="mt-0.5 text-lg font-bold font-mono-nums text-indigo-700 dark:text-indigo-400">
              {selectedDateTotals.fat}g{' '}
              <span className="text-xs font-normal text-slate-400">/ {state.goals.fat}g</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Fibre</div>
            <div className="mt-0.5 text-lg font-bold font-mono-nums text-teal-700 dark:text-teal-400">
              {selectedDateTotals.fibre}g{' '}
              <span className="text-xs font-normal text-slate-400">/ {state.goals.fibre}g</span>
            </div>
          </div>
        </div>
      </section>

      {/* Instant 1-line Natural Language Quick Log */}
      <QuickAiLogBar targetDate={selectedDate} />

      {/* Empty Day Notice */}
      {selectedDateEntries.length === 0 && (
        <section className="bg-white dark:bg-[#111317] border border-dashed border-stone-300 dark:border-white/15 rounded-2xl p-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-stone-100 dark:bg-[#14161C] text-slate-500 dark:text-slate-300 flex items-center justify-center mx-auto">
            <Utensils className="w-6 h-6" />
          </div>
          <h2 className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-100">
            No food logged for {formatReadableDate(selectedDate)}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Each calendar day starts clean. Add your first meal to immediately update your calories and macros.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => openAddFoodModal({ date: selectedDate })}
              className="min-h-[44px] px-5 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-sm font-bold inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Log First Meal
            </button>
            <button
              type="button"
              onClick={() => openMealScannerModal({ mode: 'voice', date: selectedDate })}
              className="min-h-[44px] px-4 rounded-xl border border-black/10 dark:border-white/15 text-sm font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-2"
            >
              <Mic className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00]" />
              Log with Voice or Photo
            </button>
          </div>
        </section>
      )}

      {/* Meal Sections */}
      <div className="space-y-4">
        {MEAL_CATEGORIES.map((meal) => {
          const { items, totals } = mealBreakdown[meal.id];
          const aiPhotoBatches = aiPhotoBatchesByMeal[meal.id];

          return (
            <section
              key={meal.id}
              className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl"
            >
              {/* Meal Header */}
              <div className="px-5 py-4 border-b border-stone-100 dark:border-white/10 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {meal.label}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {totals.calories} kcal · P {totals.protein}g · C {totals.carbs}g · F {totals.fat}g · Fibre {totals.fibre}g
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {savedMeals.length > 0 && (
                    <select
                      aria-label={`Log saved meal to ${meal.shortLabel}`}
                      value=""
                      onChange={(e) => {
                        const found = savedMeals.find((c) => c.id === e.target.value);
                        if (found) logSavedMealCombo(found, meal.id, selectedDate);
                      }}
                      className="h-[38px] px-2.5 rounded-xl border border-black/10 dark:border-white/12 bg-stone-50 dark:bg-[#090A0C] text-xs font-medium text-slate-700 dark:text-slate-200"
                    >
                      <option value="">+ Saved Meal...</option>
                      {savedMeals.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.totalCalories} kcal)
                        </option>
                      ))}
                    </select>
                  )}

                  {items.length >= 2 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSavingComboMeal(meal.id);
                        setComboNameInput(`${meal.shortLabel} Combo`);
                      }}
                      className="min-h-[38px] px-3 rounded-xl border border-black/10 dark:border-white/12 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-[#C8FF00] inline-flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <BookmarkPlus className="w-3.5 h-3.5 text-[#4E6800] dark:text-[#C8FF00]" />
                      Save as Meal
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => openAddFoodModal({ meal: meal.id, date: selectedDate })}
                    className="min-h-[38px] px-3.5 rounded-xl bg-stone-100 dark:bg-[#14161C] border border-black/8 dark:border-white/12 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:border-[#C8FF00] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add to {meal.shortLabel}
                  </button>
                </div>
              </div>

              {savingComboMeal === meal.id && (
                <div className="px-5 py-3 bg-[#C8FF00]/10 border-b border-[#C8FF00]/25 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={comboNameInput}
                    onChange={(e) => setComboNameInput(e.target.value)}
                    placeholder="Combo name (e.g., My Morning Breakfast)"
                    className="flex-1 min-w-[200px] h-9 px-3 rounded-lg border border-black/10 dark:border-white/15 bg-white dark:bg-[#090A0C] text-xs text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      saveMealCombo(
                        comboNameInput,
                        meal.id,
                        items.map((it) => ({
                          foodId: it.foodId,
                          foodName: it.foodName,
                          quantityGrams: it.quantityGrams,
                          unitLabel: it.unitLabel || it.servingName,
                          calories: it.calories,
                          protein: it.protein,
                          carbs: it.carbs,
                          fat: it.fat,
                          fibre: it.fibre,
                        }))
                      );
                      setSavingComboMeal(null);
                    }}
                    className="h-9 px-3.5 rounded-lg bg-[#C8FF00] text-black text-xs font-bold"
                  >
                    Save Combo
                  </button>
                  <button
                    type="button"
                    onClick={() => setSavingComboMeal(null)}
                    className="h-9 px-2.5 text-xs text-slate-500"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Meal Items */}
              {items.length === 0 ? (
                <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 dark:text-slate-500">
                  <span>Nothing logged under {meal.label} yet.</span>
                  <button
                    type="button"
                    onClick={() => {
                      const count = copyMealFromPreviousDay(meal.id, selectedDate);
                      if (count === 0) {
                        notify(`No ${meal.shortLabel.toLowerCase()} entries found from yesterday`, 'info');
                      }
                    }}
                    className="min-h-[32px] px-2.5 rounded-lg border border-black/10 dark:border-white/12 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-[#C8FF00] inline-flex items-center gap-1.5"
                  >
                    <History className="w-3.5 h-3.5" />
                    Copy yesterday
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-stone-100 dark:divide-white/10">
                    {items.map((entry) => (
                      <FoodLogEntryRow
                        key={entry.id}
                        entry={entry}
                        mealShortLabel={meal.shortLabel}
                        foodUnit={state.settings.foodUnit}
                        onMealChange={handleMealChange}
                        onQuickQuantityChange={quickUpdateFoodEntryQuantity}
                        onDownloadSticker={openFoodItemSticker}
                        onEdit={openEditFoodModal}
                        onDuplicate={handleDuplicate}
                        onDelete={setPendingDelete}
                      />
                    ))}

                    {aiPhotoBatches.map((batch, idx) => {
                      const batchTotals = batch.reduce(
                        (acc, item) => ({
                          calories: acc.calories + (item.calories || 0),
                          protein: round1(acc.protein + (item.protein || 0)),
                          carbs: round1(acc.carbs + (item.carbs || 0)),
                          fat: round1(acc.fat + (item.fat || 0)),
                        }),
                        { calories: 0, protein: 0, carbs: 0, fat: 0 }
                      );
                      const batchNames = batch
                        .map((item) => item.foodName)
                        .filter(Boolean)
                        .join(', ');

                      return (
                        <div
                          key={batch[0]?.createdAt || `ai-batch-${idx}`}
                          className="px-5 py-3 bg-lime-500/8 dark:bg-[#C8FF00]/6 flex flex-wrap items-center justify-between gap-2.5 last:rounded-b-2xl"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#4E6800] dark:text-[#C8FF00]">
                              <Sparkles className="w-3.5 h-3.5 shrink-0" />
                              <span>
                                AI Photo Scan · {batch.length} items
                              </span>
                            </div>
                            <div
                              title={batchNames}
                              className="text-xs font-semibold text-slate-900 dark:text-slate-100 mt-0.5 line-clamp-2"
                            >
                              {batchNames}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-nums mt-0.5">
                              {Math.round(batchTotals.calories)} kcal · P {batchTotals.protein}g · C{' '}
                              {batchTotals.carbs}g · F {batchTotals.fat}g
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => openAiPhotoBatchSticker(meal.shortLabel, batch)}
                            className="min-h-[38px] px-3.5 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-xs font-bold hover:opacity-90 transition-opacity inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Full Macros PNG</span>
                          </button>
                        </div>
                      );
                    })}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        title="Delete food entry?"
        description={
          pendingDelete
            ? `Remove ${pendingDelete.foodName} (${pendingDelete.calories} kcal) from ${formatReadableDate(
                pendingDelete.date
              )}?`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={() => {
          if (pendingDelete) {
            deleteFoodEntry(pendingDelete.id);
            setPendingDelete(null);
          }
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
};
