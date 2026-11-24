import React, { Suspense, lazy, memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Barcode,
  BookmarkPlus,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  History,
  MoreHorizontal,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DateStrip } from '../components/DateStrip';
import { openShareStudio } from '../components/MacroShareModal';
import { QuickAiLogBar } from '../components/QuickAiLogBar';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { FoodLogEntry, MealCategory, MEAL_CATEGORIES } from '../types';
import { addDaysToDateKey, formatReadableDate, formatShortDate } from '../utils/dateUtils';
import { formatFoodQuantity, getMealBreakdown, round1 } from '../utils/nutritionUtils';

const FoodDatabasePage = lazy(() =>
  import('./FoodDatabasePage').then((m) => ({ default: m.FoodDatabasePage }))
);

export type FoodLogSection = 'diary' | 'database';

export interface FoodLogPageProps {
  initialSection?: FoodLogSection;
}

const PRIMARY_MEALS = MEAL_CATEGORIES.filter((m) => m.id !== 'other');

interface AiMealBatch {
  id: string;
  sourceName: string;
  items: FoodLogEntry[];
  totals: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fibre: number;
  };
}

function isAiEntrySource(sourceName?: string): boolean {
  if (!sourceName) return false;
  const lower = sourceName.toLowerCase();
  return (
    lower.startsWith('ai ') ||
    lower.includes('quick log ai') ||
    lower.includes('meal scan') ||
    lower.includes('photo scan') ||
    lower.includes('meal describe') ||
    lower.includes('voice log') ||
    lower.includes('label ocr')
  );
}

function getCombinedAiBatches(entries: FoodLogEntry[]): AiMealBatch[] {
  const aiEntries = entries.filter((entry) => isAiEntrySource(entry.sourceName));
  if (aiEntries.length < 2) return [];

  const sorted = [...aiEntries].sort((a, b) => {
    const ta = Date.parse(a.createdAt || '') || 0;
    const tb = Date.parse(b.createdAt || '') || 0;
    return ta - tb;
  });

  const groups: { sourceName: string; anchorMs: number; items: FoodLogEntry[] }[] = [];

  for (const entry of sorted) {
    const sourceName = entry.sourceName || 'AI Meal Log';
    const entryMs = Date.parse(entry.createdAt || '') || 0;
    const lastGroup = groups[groups.length - 1];

    if (
      lastGroup &&
      lastGroup.sourceName === sourceName &&
      Math.abs(entryMs - lastGroup.anchorMs) <= 15_000
    ) {
      lastGroup.items.push(entry);
    } else {
      groups.push({ sourceName, anchorMs: entryMs, items: [entry] });
    }
  }

  return groups
    .filter((group) => group.items.length >= 2)
    .map((group, idx) => ({
      id: `${group.sourceName}-${group.anchorMs}-${idx}`,
      sourceName: group.sourceName,
      items: group.items,
      totals: {
        calories: Math.round(group.items.reduce((sum, item) => sum + (item.calories || 0), 0)),
        protein: round1(group.items.reduce((sum, item) => sum + (item.protein || 0), 0)),
        carbs: round1(group.items.reduce((sum, item) => sum + (item.carbs || 0), 0)),
        fat: round1(group.items.reduce((sum, item) => sum + (item.fat || 0), 0)),
        fibre: round1(group.items.reduce((sum, item) => sum + (item.fibre || 0), 0)),
      },
    }));
}

interface ProgressMetricRowProps {
  label: string;
  consumed: number;
  target: number;
  unit: string;
  barClassName: string;
  valueClassName?: string;
}

const ProgressMetricRow: React.FC<ProgressMetricRowProps> = ({
  label,
  consumed,
  target,
  unit,
  barClassName,
  valueClassName = 'text-slate-900 dark:text-slate-100',
}) => {
  const safeTarget = Math.max(0, target);
  const ratio = safeTarget > 0 ? (consumed / safeTarget) * 100 : 0;
  const clampedWidth = Math.min(100, Math.max(0, ratio));
  const isOver = safeTarget > 0 && consumed > safeTarget;
  const diff = Math.round((safeTarget - consumed) * 10) / 10;

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold text-slate-700 dark:text-slate-300">{label}</span>
        <div className="flex items-baseline gap-2 tabular-nums">
          <span className={`font-bold font-mono-nums ${isOver ? 'text-rose-600 dark:text-rose-400' : valueClassName}`}>
            {consumed.toLocaleString()}
            {unit}
          </span>
          <span className="text-slate-400 font-mono-nums">
            / {safeTarget > 0 ? `${safeTarget.toLocaleString()}${unit}` : '—'}
          </span>
          {safeTarget > 0 && (
            <span
              className={`text-[11px] font-medium ${
                isOver ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {isOver ? `Over ${Math.abs(diff)}${unit}` : `${diff}${unit} left`}
            </span>
          )}
        </div>
      </div>
      <div className="h-2 w-full rounded-full bg-stone-200/80 dark:bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isOver ? 'bg-rose-500' : barClassName
          }`}
          style={{ width: `${clampedWidth}%` }}
        />
      </div>
    </div>
  );
};

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
    const [menuOpen, setMenuOpen] = useState(false);

    const commitQty = () => {
      const parsed = parseFloat(qtyValue);
      if (Number.isFinite(parsed) && parsed > 0 && parsed <= 10000) {
        onQuickQuantityChange(entry.id, parsed);
      } else {
        setQtyValue(String(entry.quantityGrams));
      }
      setEditingQty(false);
    };

    const servingDisplay =
      entry.unitLabel && entry.unitLabel !== `${entry.quantityGrams} g`
        ? `${entry.unitLabel} (${formatFoodQuantity(entry.quantityGrams, foodUnit)})`
        : formatFoodQuantity(entry.quantityGrams, foodUnit);

    return (
      <div className="px-4 sm:px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 hover:bg-stone-50/60 dark:hover:bg-white/[0.02] transition-colors">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
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
                  className="w-20 h-9 px-2 rounded-lg border border-[#4E6800] dark:border-[#C8FF00] bg-white dark:bg-[#090A0C] text-xs font-mono-nums text-slate-900 dark:text-slate-100"
                />
                <span className="text-xs text-slate-400">g</span>
                <button
                  type="button"
                  onClick={commitQty}
                  aria-label="Save quantity"
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#4E6800] dark:text-[#C8FF00] hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQtyValue(String(entry.quantityGrams));
                    setEditingQty(false);
                  }}
                  aria-label="Cancel quantity edit"
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setQtyValue(String(entry.quantityGrams));
                  setEditingQty(true);
                }}
                title="Tap to edit quantity"
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-[#4E6800] dark:hover:text-[#C8FF00] underline decoration-dotted underline-offset-2 font-mono-nums py-0.5"
              >
                {servingDisplay}
              </button>
            )}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
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
                <span className="text-slate-500 dark:text-slate-400">{entry.sourceName}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-1 shrink-0">
          <span className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono-nums mr-1">
            {entry.calories} kcal
          </span>

          <div className="flex items-center gap-0.5 relative">
            <button
              type="button"
              onClick={() => onDownloadSticker(entry, mealShortLabel)}
              title={`Download ${entry.foodName} PNG sticker`}
              aria-label={`Download ${entry.foodName} PNG sticker`}
              className="min-h-[44px] min-w-[40px] sm:min-w-[44px] flex items-center justify-center rounded-xl text-[#4E6800] dark:text-[#C8FF00] hover:bg-[#C8FF00]/15 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => onEdit(entry)}
              title="Edit entry"
              aria-label={`Edit ${entry.foodName}`}
              className="min-h-[44px] min-w-[40px] sm:min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-stone-100 dark:hover:bg-[#14161C] transition-colors"
            >
              <Pencil className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => onDelete(entry)}
              title="Delete entry"
              aria-label={`Delete ${entry.foodName}`}
              className="min-h-[44px] min-w-[40px] sm:min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={`More actions for ${entry.foodName}`}
              aria-expanded={menuOpen}
              className="min-h-[44px] min-w-[40px] sm:min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-stone-100 dark:hover:bg-[#14161C] transition-colors"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-12 z-20 w-48 rounded-xl border border-black/12 dark:border-white/15 bg-white dark:bg-[#151820] shadow-xl p-1.5 space-y-1">
                <div className="px-2 py-1">
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">
                    Move to meal
                  </label>
                  <select
                    aria-label={`Move ${entry.foodName} to meal`}
                    value={entry.mealType}
                    onChange={(e) => {
                      onMealChange(entry, e.target.value as MealCategory);
                      setMenuOpen(false);
                    }}
                    className="w-full h-9 px-2 rounded-lg border border-black/10 dark:border-white/15 bg-[#F4F3EF] dark:bg-[#090A0C] text-xs text-slate-800 dark:text-slate-200"
                  >
                    {MEAL_CATEGORIES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.shortLabel}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onDuplicate(entry);
                    setMenuOpen(false);
                  }}
                  className="w-full min-h-[38px] px-2.5 rounded-lg text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 inline-flex items-center gap-2"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Duplicate entry
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDownloadSticker(entry, mealShortLabel);
                    setMenuOpen(false);
                  }}
                  className="w-full min-h-[38px] px-2.5 rounded-lg text-left text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5 inline-flex items-center gap-2"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download PNG sticker
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);

FoodLogEntryRow.displayName = 'FoodLogEntryRow';

export const FoodLogPage: React.FC<FoodLogPageProps> = ({ initialSection = 'diary' }) => {
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
    setActiveTab,
  } = useMacroLogStore();

  const [subTab, setSubTab] = useState<FoodLogSection>(initialSection);
  const [collapsedMeals, setCollapsedMeals] = useState<Record<string, boolean>>({});
  const [pendingDelete, setPendingDelete] = useState<FoodLogEntry | null>(null);
  const [savingComboMeal, setSavingComboMeal] = useState<MealCategory | null>(null);
  const [comboNameInput, setComboNameInput] = useState('');

  useEffect(() => {
    setSubTab(initialSection);
  }, [initialSection]);

  const foodById = useMemo(() => new Map(allFoods.map((f) => [f.id, f])), [allFoods]);

  const mealBreakdown = useMemo(
    () => getMealBreakdown(selectedDateEntries),
    [selectedDateEntries]
  );

  const yesterdayKey = useMemo(() => addDaysToDateKey(selectedDate, -1), [selectedDate]);
  const yesterdayMealCounts = useMemo(() => {
    const counts: Record<MealCategory, number> = {
      breakfast: 0,
      lunch: 0,
      evening_snacks: 0,
      dinner: 0,
      other: 0,
    };
    for (const entry of state.foodEntries) {
      if (entry.date === yesterdayKey && counts[entry.mealType] !== undefined) {
        counts[entry.mealType] += 1;
      }
    }
    return counts;
  }, [state.foodEntries, yesterdayKey]);

  const visibleMeals = useMemo(() => {
    if (mealBreakdown.other.items.length > 0) {
      return MEAL_CATEGORIES;
    }
    return PRIMARY_MEALS;
  }, [mealBreakdown.other.items.length]);

  const toggleMealCollapsed = (mealId: MealCategory) => {
    setCollapsedMeals((prev) => ({ ...prev, [mealId]: !prev[mealId] }));
  };

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

  const openMealMacrosSticker = useCallback(
    (
      mealLabel: string,
      itemCount: number,
      totals: { calories: number; protein: number; carbs: number; fat: number; fibre: number }
    ) => {
      openShareStudio({
        mode: 'food',
        foodPayload: {
          title: mealLabel,
          subtitle: `${itemCount} ${itemCount === 1 ? 'item' : 'items'} · ${formatShortDate(selectedDate)}`,
          calories: Math.round(totals.calories),
          protein: round1(totals.protein),
          carbs: round1(totals.carbs),
          fat: round1(totals.fat),
          fibre: round1(totals.fibre),
          dateLabel: formatShortDate(selectedDate),
        },
      });
    },
    [selectedDate]
  );

  const openAiBatchSticker = useCallback(
    (mealLabel: string, batch: AiMealBatch) => {
      const combinedTitle =
        batch.items.length <= 2
          ? batch.items.map((item) => item.foodName).join(' + ')
          : `${batch.items[0].foodName} + ${batch.items.length - 1} more`;
      openShareStudio({
        mode: 'food',
        foodPayload: {
          title: combinedTitle,
          subtitle: `${mealLabel} · ${batch.sourceName} · ${batch.items.length} items`,
          calories: batch.totals.calories,
          protein: batch.totals.protein,
          carbs: batch.totals.carbs,
          fat: batch.totals.fat,
          fibre: batch.totals.fibre,
          dateLabel: formatShortDate(selectedDate),
        },
      });
    },
    [selectedDate]
  );

  const handleSwitchSection = (next: FoodLogSection) => {
    setSubTab(next);
    if (next === 'database') {
      setActiveTab('food-database');
    } else {
      setActiveTab('food-log');
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {formatReadableDate(selectedDate)}
          </p>
          <h1 className="mt-0.5 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Food Log
          </h1>
        </div>

        {subTab === 'diary' && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => openMealScannerModal({ mode: 'photo', date: selectedDate })}
              aria-label="Open AI Logger"
              className="min-h-[44px] px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-semibold hover:border-[#4E6800] dark:hover:border-[#C8FF00] transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <Sparkles className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00]" />
              <span>AI Logger</span>
            </button>

            <button
              type="button"
              onClick={() => openBarcodeScannerModal({ date: selectedDate })}
              aria-label="Scan Barcode"
              className="min-h-[44px] px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-semibold hover:border-[#4E6800] dark:hover:border-[#C8FF00] transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <Barcode className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00]" />
              <span className="hidden sm:inline">Barcode</span>
            </button>

            <button
              type="button"
              onClick={() => openAddFoodModal({ date: selectedDate })}
              className="min-h-[44px] px-4 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-xs sm:text-sm font-bold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Add Food</span>
            </button>
          </div>
        )}
      </section>

      {/* Simplified 2-Section Navigation: Daily Log | Food Database */}
      <nav
        aria-label="Food Log sections"
        className="grid grid-cols-2 p-1 rounded-2xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 max-w-sm"
      >
        <button
          type="button"
          onClick={() => handleSwitchSection('diary')}
          className={`min-h-[40px] px-4 rounded-xl text-xs sm:text-sm font-bold transition-colors whitespace-nowrap ${
            subTab === 'diary'
              ? 'bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          Daily Log
        </button>
        <button
          type="button"
          onClick={() => handleSwitchSection('database')}
          className={`min-h-[40px] px-4 rounded-xl text-xs sm:text-sm font-bold transition-colors whitespace-nowrap ${
            subTab === 'database'
              ? 'bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          Food Database
        </button>
      </nav>

      {subTab === 'database' ? (
        <Suspense
          fallback={
            <div className="h-48 rounded-2xl bg-black/5 dark:bg-white/5 animate-pulse" />
          }
        >
          <FoodDatabasePage embedded />
        </Suspense>
      ) : (
        <>
          {/* Date Navigation + Compact Weekly Date Selector */}
          <DateStrip selectedDate={selectedDate} onSelectDate={setSelectedDate} />

          {/* Daily Nutrition Dashboard: Compact Horizontal Progress Bars */}
          <section
            aria-label="Daily nutrition progress"
            className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4 sm:p-5 space-y-3"
          >
            <ProgressMetricRow
              label="Calories"
              consumed={selectedDateTotals.calories}
              target={state.goals.calories}
              unit=" kcal"
              barClassName="bg-[#4E6800] dark:bg-[#C8FF00]"
              valueClassName="text-[#4E6800] dark:text-[#C8FF00]"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <ProgressMetricRow
                label="Protein"
                consumed={selectedDateTotals.protein}
                target={state.goals.protein}
                unit="g"
                barClassName="bg-[#4E6800] dark:bg-[#C8FF00]"
              />
              <ProgressMetricRow
                label="Carbs"
                consumed={selectedDateTotals.carbs}
                target={state.goals.carbs}
                unit="g"
                barClassName="bg-amber-500 dark:bg-amber-400"
              />
              <ProgressMetricRow
                label="Fat"
                consumed={selectedDateTotals.fat}
                target={state.goals.fat}
                unit="g"
                barClassName="bg-indigo-500 dark:bg-indigo-400"
              />
              <ProgressMetricRow
                label="Fibre"
                consumed={selectedDateTotals.fibre}
                target={state.goals.fibre}
                unit="g"
                barClassName="bg-teal-500 dark:bg-teal-400"
              />
            </div>
          </section>

          {/* Compact 1-Line Natural Language Quick Log */}
          <QuickAiLogBar targetDate={selectedDate} />

          {/* Collapsible Meal Sections (Breakfast, Lunch, Snacks, Dinner) */}
          <div className="space-y-3">
            {visibleMeals.map((meal) => {
              const { items, totals } = mealBreakdown[meal.id];
              const aiBatches = getCombinedAiBatches(items);
              const isCollapsed = Boolean(collapsedMeals[meal.id]);
              const yesterdayCount = yesterdayMealCounts[meal.id] || 0;

              return (
                <section
                  key={meal.id}
                  className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl overflow-hidden"
                >
                  <div className="px-4 sm:px-5 py-3 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => toggleMealCollapsed(meal.id)}
                      aria-expanded={!isCollapsed}
                      className="flex-1 min-w-0 flex items-center gap-2.5 text-left min-h-[44px]"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                            {meal.shortLabel}
                          </h2>
                          {items.length > 0 && (
                            <span className="text-xs text-slate-400 tabular-nums">
                              ({items.length})
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums truncate">
                          {items.length > 0
                            ? `${totals.calories} kcal · P ${totals.protein}g · C ${totals.carbs}g · F ${totals.fat}g`
                            : '0 kcal logged'}
                        </p>
                      </div>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {items.length > 0 && (
                        <button
                          type="button"
                          onClick={() => openMealMacrosSticker(meal.shortLabel, items.length, totals)}
                          title={`Download ${meal.shortLabel} macros as transparent Story PNG`}
                          aria-label={`Download ${meal.shortLabel} macros PNG`}
                          className="min-h-[40px] min-w-[40px] px-2.5 rounded-xl border border-black/10 dark:border-white/12 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-[#4E6800] dark:hover:border-[#C8FF00] inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5 text-[#4E6800] dark:text-[#C8FF00] shrink-0" />
                          <span className="hidden sm:inline">Story PNG</span>
                        </button>
                      )}

                      {items.length >= 2 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSavingComboMeal(meal.id);
                            setComboNameInput(`${meal.shortLabel} Combo`);
                          }}
                          title="Save meal as reusable combo"
                          className="min-h-[40px] px-2.5 rounded-xl border border-black/10 dark:border-white/12 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-[#4E6800] dark:hover:border-[#C8FF00] inline-flex items-center gap-1 whitespace-nowrap"
                        >
                          <BookmarkPlus className="w-3.5 h-3.5 text-[#4E6800] dark:text-[#C8FF00]" />
                          <span className="hidden sm:inline">Save Meal</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => openAddFoodModal({ meal: meal.id, date: selectedDate })}
                        className="min-h-[40px] px-3.5 rounded-xl bg-stone-100 dark:bg-[#181B22] border border-black/8 dark:border-white/12 text-xs font-bold text-slate-900 dark:text-[#C8FF00] hover:border-[#4E6800] dark:hover:border-[#C8FF00] transition-colors inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Food</span>
                      </button>
                    </div>
                  </div>

                  {!isCollapsed && (
                    <div className="border-t border-stone-100 dark:border-white/8">
                      {savingComboMeal === meal.id && (
                        <div className="px-4 sm:px-5 py-3 bg-[#C8FF00]/10 border-b border-[#C8FF00]/25 flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={comboNameInput}
                            onChange={(e) => setComboNameInput(e.target.value)}
                            placeholder="Combo name (e.g., High-Protein Breakfast)"
                            className="flex-1 min-w-[200px] h-10 px-3 rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-[#090A0C] text-xs text-slate-900 dark:text-slate-100"
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
                            className="h-10 px-4 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-xs font-bold"
                          >
                            Save Combo
                          </button>
                          <button
                            type="button"
                            onClick={() => setSavingComboMeal(null)}
                            className="h-10 px-3 text-xs font-medium text-slate-500"
                          >
                            Cancel
                          </button>
                        </div>
                      )}

                      {items.length === 0 ? (
                        <div className="px-4 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <button
                            type="button"
                            onClick={() => openAddFoodModal({ meal: meal.id, date: selectedDate })}
                            className="min-h-[36px] text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-[#4E6800] dark:hover:text-[#C8FF00] inline-flex items-center gap-1.5"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add food to {meal.shortLabel.toLowerCase()}</span>
                          </button>

                          <div className="flex items-center gap-2">
                            {savedMeals.length > 0 && (
                              <select
                                aria-label={`Log saved meal to ${meal.shortLabel}`}
                                value=""
                                onChange={(e) => {
                                  const found = savedMeals.find((c) => c.id === e.target.value);
                                  if (found) logSavedMealCombo(found, meal.id, selectedDate);
                                }}
                                className="h-[34px] px-2 rounded-lg border border-black/10 dark:border-white/12 bg-stone-50 dark:bg-[#090A0C] text-xs font-medium text-slate-700 dark:text-slate-300"
                              >
                                <option value="">+ Saved Meal</option>
                                {savedMeals.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name} ({c.totalCalories} kcal)
                                  </option>
                                ))}
                              </select>
                            )}

                            {yesterdayCount > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const count = copyMealFromPreviousDay(meal.id, selectedDate);
                                  if (count === 0) {
                                    notify(`No ${meal.shortLabel.toLowerCase()} entries found from yesterday`, 'info');
                                  }
                                }}
                                className="min-h-[34px] px-2.5 rounded-lg border border-black/10 dark:border-white/12 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-[#4E6800] dark:hover:border-[#C8FF00] inline-flex items-center gap-1"
                              >
                                <History className="w-3.5 h-3.5" />
                                <span>Copy yesterday ({yesterdayCount})</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="divide-y divide-stone-100 dark:divide-white/8">
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
                          </div>

                          {aiBatches.length > 0 && (
                            <div className="p-3 sm:p-4 border-t border-stone-100 dark:border-white/8 space-y-2.5">
                              {aiBatches.map((batch) => {
                                const combinedNames = batch.items
                                  .map((item) => item.foodName)
                                  .join(' · ');
                                return (
                                  <div
                                    key={batch.id}
                                    className="rounded-xl border border-[#4E6800]/25 dark:border-[#C8FF00]/30 bg-[#C8FF00]/12 dark:bg-[#C8FF00]/[0.07] px-3.5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5 text-xs font-bold text-[#4E6800] dark:text-[#C8FF00]">
                                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                                        <span>
                                          {batch.sourceName} · {batch.items.length} items
                                        </span>
                                      </div>
                                      <p className="mt-1 text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                                        {combinedNames}
                                      </p>
                                      <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300 tabular-nums font-mono-nums">
                                        {batch.totals.calories} kcal · P {batch.totals.protein}g · C{' '}
                                        {batch.totals.carbs}g · F {batch.totals.fat}g
                                        {batch.totals.fibre > 0 ? ` · Fibre ${batch.totals.fibre}g` : ''}
                                      </p>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => openAiBatchSticker(meal.shortLabel, batch)}
                                      aria-label={`Download combined ${batch.sourceName} macros PNG`}
                                      className="min-h-[40px] px-3.5 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-[#090A0C] text-xs font-bold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                                    >
                                      <Download className="w-3.5 h-3.5 shrink-0" />
                                      <span>Full Macros PNG</span>
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}

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
