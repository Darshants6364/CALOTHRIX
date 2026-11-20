import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Barcode,
  BookmarkCheck,
  Camera,
  Check,
  Clock,
  Globe,
  Mic,
  Plus,
  Search,
  ShoppingBag,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { lookupBarcodeApi, searchGlobalFoodsApi } from '../services/globalFoodApiService';
import {
  FoodCategory,
  FoodItem,
  FoodSourceType,
  GLOBAL_FOOD_CATEGORIES,
  MealCategory,
  MEAL_CATEGORIES,
  SavedMealCombo,
} from '../types';
import {
  calculateScaledNutrition,
  calculateScaledNutritionDetailed,
  formatFoodQuantity,
  formatNutrientValue,
  getEntriesForDate,
  getNutrientCompleteness,
  sumMacros,
} from '../utils/nutritionUtils';
import { searchFoodsIntelligent } from '../utils/foodSearchEngine';
import {
  convertVolumeMlToGrams,
  getLastUsedPortion,
  getPortionsForFood,
} from '../utils/portionEngine';

function getSourceTypeLabel(sourceType?: FoodSourceType, isCustom?: boolean): string {
  if (isCustom || sourceType === 'personal_custom') return 'Personal Custom';
  if (sourceType === 'branded') return 'Branded Product';
  if (sourceType === 'community') return 'Community Food';
  return 'Verified Reference';
}

function getVerificationBadgeInfo(status?: FoodItem['verificationStatus']): {
  label: string;
  cls: string;
} {
  switch (status) {
    case 'verified':
      return { label: 'Verified', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' };
    case 'enriched':
      return { label: 'Enriched', cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' };
    case 'estimated':
      return { label: 'Estimated', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' };
    case 'user_provided':
      return { label: 'User Provided', cls: 'bg-slate-500/15 text-slate-600 dark:text-slate-300' };
    case 'needs_review':
      return { label: 'Needs Review', cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-300' };
    default:
      return { label: 'Verified', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' };
  }
}

const STANDARD_GRAM_PRESETS: number[] = [50, 100, 150, 200, 250];

export const FoodEntryModal: React.FC = () => {
  const { foodModal } = useMacroLogStore();
  if (!foodModal.isOpen) return null;
  return <FoodEntryModalContent />;
};

interface TrayItem {
  id: string;
  food: FoodItem;
  quantityGrams: number;
  unitLabel: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
}

const FoodEntryModalContent: React.FC = () => {
  const {
    state,
    allFoods,
    foodModal,
    closeFoodModal,
    openMealScannerModal,
    openBarcodeScannerModal,
    addFoodEntry,
    updateFoodEntry,
    addCustomFood,
    savedMeals,
    logSavedMealCombo,
    deleteSavedMealCombo,
    saveMealCombo,
    notify,
  } = useMacroLogStore();

  const editing = foodModal.editingEntry;
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<
    'all' | 'india' | 'recent' | 'favorites' | 'meals' | 'custom'
  >('all');
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [inputMode, setInputMode] = useState<'grams' | 'ml' | 'servings'>('grams');
  const [quantityGrams, setQuantityGrams] = useState<string>('100');
  const [volumeMl, setVolumeMl] = useState<string>('200');
  const [servingsCount, setServingsCount] = useState<string>('1');
  const [selectedUnitLabel, setSelectedUnitLabel] = useState<string>('');
  const [lastUsedPortion, setLastUsedPortion] = useState<{ grams: number; unitLabel?: string } | null>(null);
  const [mealType, setMealType] = useState<MealCategory>('breakfast');
  const [date, setDate] = useState<string>(foodModal.targetDate);
  const [error, setError] = useState<string>('');

  // Multi-Add Meal Tray
  const [trayItems, setTrayItems] = useState<TrayItem[]>([]);
  const [trayMealName, setTrayMealName] = useState('');

  // Debounced live global search (Open Food Facts / USDA / IFCT)
  const [remoteFoods, setRemoteFoods] = useState<FoodItem[]>([]);
  const [remoteSearching, setRemoteSearching] = useState(false);

  // Quick custom food creation sub-view
  const [creatingCustom, setCreatingCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customBrand, setCustomBrand] = useState('');
  const [customCategory, setCustomCategory] = useState<FoodCategory>('Homemade foods');
  const [customServingName, setCustomServingName] = useState('100 g');
  const [customServingGrams, setCustomServingGrams] = useState('100');
  const [customCalories, setCustomCalories] = useState('');
  const [customProtein, setCustomProtein] = useState('');
  const [customCarbs, setCustomCarbs] = useState('');
  const [customFat, setCustomFat] = useState('');
  const [customFibre, setCustomFibre] = useState('0');
  const [customError, setCustomError] = useState('');

  useEffect(() => {
    if (!foodModal.isOpen) return;
    setError('');
    setCustomError('');
    setCreatingCustom(false);
    setSearchQuery('');
    setRemoteFoods([]);
    setTrayItems([]);
    setTrayMealName('');
    setFilterTab('all');
    setMealType(editing ? editing.mealType : foodModal.initialMeal);
    setDate(editing ? editing.date : foodModal.targetDate);

    if (editing) {
      const matched = allFoods.find((f) => f.id === editing.foodId);
      if (matched) {
        setSelectedFood(matched);
        setLastUsedPortion(getLastUsedPortion(matched.id));
        setQuantityGrams(String(editing.quantityGrams));
        setSelectedUnitLabel(editing.unitLabel || '');
        setServingsCount(
          String(
            Math.round((editing.quantityGrams / Math.max(1, matched.servingWeightGrams)) * 100) /
              100
          )
        );
        if (matched.liquidDensityGPerMl) {
          setVolumeMl(String(Math.round((editing.quantityGrams / matched.liquidDensityGPerMl) * 10) / 10));
        }
        setInputMode('grams');
      } else {
        const fallback: FoodItem = {
          id: editing.foodId,
          name: editing.foodName,
          category: 'Custom',
          servingName: editing.servingName,
          servingWeightGrams: editing.quantityGrams || 100,
          calories: editing.calories,
          protein: editing.protein,
          carbs: editing.carbs,
          fat: editing.fat,
          fibre: editing.fibre,
          isCustom: true,
          sourceName: editing.sourceName,
          sourceType: editing.sourceType,
          foodState: editing.foodState,
          verificationStatus: editing.verificationStatus,
        };
        setSelectedFood(fallback);
        setLastUsedPortion(null);
        setQuantityGrams(String(editing.quantityGrams));
        setSelectedUnitLabel(editing.unitLabel || '');
        setServingsCount('1');
        setInputMode('grams');
      }
    } else if (foodModal.preselectedFood) {
      const pre = foodModal.preselectedFood;
      const remembered = getLastUsedPortion(pre.id);
      const defaultPortions = getPortionsForFood(pre);
      const defP = defaultPortions.find((p) => p.isDefault) || defaultPortions[0];
      const initGrams = remembered?.grams ?? (defP ? defP.gramOrMlWeight : pre.servingWeightGrams || 100);
      setSelectedFood(pre);
      setLastUsedPortion(remembered);
      setQuantityGrams(String(initGrams));
      setSelectedUnitLabel(remembered?.unitLabel || (defP ? defP.portionName : `${initGrams} g`));
      setServingsCount('1');
      if (pre.liquidDensityGPerMl) {
        setVolumeMl(String(Math.round((initGrams / pre.liquidDensityGPerMl) * 10) / 10));
      }
      setInputMode('grams');
    } else if (foodModal.preselectedFoodId) {
      const matched = allFoods.find((f) => f.id === foodModal.preselectedFoodId) ?? null;
      setSelectedFood(matched);
      if (matched) {
        const remembered = getLastUsedPortion(matched.id);
        const defaultPortions = getPortionsForFood(matched);
        const defP = defaultPortions.find((p) => p.isDefault) || defaultPortions[0];
        const initGrams = remembered?.grams ?? (defP ? defP.gramOrMlWeight : matched.servingWeightGrams || 100);
        setLastUsedPortion(remembered);
        setQuantityGrams(String(initGrams));
        setSelectedUnitLabel(remembered?.unitLabel || (defP ? defP.portionName : `${initGrams} g`));
        setServingsCount('1');
        if (matched.liquidDensityGPerMl) {
          setVolumeMl(String(Math.round((initGrams / matched.liquidDensityGPerMl) * 10) / 10));
        }
        setInputMode('grams');
      }
    } else {
      setSelectedFood(null);
      setLastUsedPortion(null);
      setQuantityGrams('100');
      setSelectedUnitLabel('');
      setVolumeMl('200');
      setServingsCount('1');
      setInputMode('grams');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    foodModal.isOpen,
    foodModal.initialMeal,
    foodModal.preselectedFoodId,
    foodModal.preselectedFood,
    foodModal.targetDate,
    editing,
  ]);

  // Keyboard shortcuts: Escape closes modal, `/` focuses search bar
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeFoodModal();
      } else if (
        e.key === '/' &&
        !selectedFood &&
        !creatingCustom &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeFoodModal, creatingCustom, selectedFood]);

  const deferredSearchQuery = useDeferredValue(searchQuery);

  const localFoodIdSet = useMemo(
    () => new Set(allFoods.map((f) => f.id)),
    [allFoods]
  );
  const favoriteSet = useMemo(
    () => new Set(state.favoriteFoodIds),
    [state.favoriteFoodIds]
  );
  const recentSet = useMemo(
    () => new Set(state.recentFoodIds),
    [state.recentFoodIds]
  );

  // Trigger debounced global search when query >= 2 chars on 'all' or 'india' tab
  useEffect(() => {
    if (!foodModal.isOpen || selectedFood || creatingCustom) return;
    const q = searchQuery.trim();
    if (q.length < 2 || (filterTab !== 'all' && filterTab !== 'india')) {
      setRemoteFoods([]);
      setRemoteSearching(false);
      return;
    }

    let cancelled = false;
    setRemoteSearching(true);
    const timer = setTimeout(async () => {
      try {
        if (/^\d{8,14}$/.test(q)) {
          const bcRes = await lookupBarcodeApi(q);
          if (!cancelled && bcRes.item) {
            setRemoteFoods([bcRes.item]);
            setRemoteSearching(false);
            return;
          }
        }
        const res = await searchGlobalFoodsApi({
          query: q,
          country: filterTab === 'india' ? 'India' : undefined,
        });
        if (!cancelled) {
          setRemoteFoods(
            res.items.filter((item) => !item.isDiscontinued && !localFoodIdSet.has(item.id))
          );
        }
      } catch {
        if (!cancelled) setRemoteFoods([]);
      } finally {
        if (!cancelled) setRemoteSearching(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [creatingCustom, filterTab, foodModal.isOpen, localFoodIdSet, searchQuery, selectedFood]);

  const filteredLocalFoods = useMemo(() => {
    const activeFoods = allFoods.filter((f) => !f.isDiscontinued);
    const preFiltered =
      filterTab === 'all'
        ? activeFoods
        : activeFoods.filter((f) => {
            if (filterTab === 'india') return (f.country || '').toLowerCase().includes('india');
            if (filterTab === 'favorites') return favoriteSet.has(f.id);
            if (filterTab === 'recent') return recentSet.has(f.id);
            if (filterTab === 'custom') return f.isCustom;
            return true;
          });
    return searchFoodsIntelligent(preFiltered, deferredSearchQuery, {
      favoriteIds: state.favoriteFoodIds,
      recentIds: state.recentFoodIds,
      limit: deferredSearchQuery.trim() ? 50 : 60,
    });
  }, [
    allFoods,
    deferredSearchQuery,
    favoriteSet,
    filterTab,
    recentSet,
    state.favoriteFoodIds,
    state.recentFoodIds,
  ]);

  const combinedFoods = useMemo(() => {
    if (filterTab !== 'all' && filterTab !== 'india') return filteredLocalFoods;
    if (remoteFoods.length === 0) return filteredLocalFoods;
    const seen = new Set(filteredLocalFoods.map((f) => f.id));
    return [...filteredLocalFoods, ...remoteFoods.filter((r) => !seen.has(r.id))];
  }, [filterTab, filteredLocalFoods, remoteFoods]);

  const selectedCompleteness = useMemo(
    () => (selectedFood ? getNutrientCompleteness(selectedFood) : null),
    [selectedFood]
  );

  const familyVariants = useMemo(() => {
    if (!selectedFood?.canonicalFamily) return [];
    return allFoods
      .filter(
        (f) =>
          !f.isDiscontinued &&
          f.canonicalFamily === selectedFood.canonicalFamily &&
          f.id !== selectedFood.id
      )
      .slice(0, 6);
  }, [allFoods, selectedFood]);

  const foodPortions = useMemo(
    () => (selectedFood ? getPortionsForFood(selectedFood) : []),
    [selectedFood]
  );

  const supportsVolumeMl = Boolean(
    selectedFood?.liquidDensityGPerMl && selectedFood.liquidDensityGPerMl > 0
  );

  const effectiveGrams = useMemo(() => {
    if (!selectedFood) return 0;
    if (inputMode === 'grams') {
      const parsed = parseFloat(quantityGrams);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    if (inputMode === 'ml') {
      const parsedMl = parseFloat(volumeMl);
      if (!Number.isFinite(parsedMl)) return 0;
      const conv = convertVolumeMlToGrams(selectedFood, parsedMl);
      return conv.ok ? conv.grams : 0;
    }
    const parsedServings = parseFloat(servingsCount);
    return Number.isFinite(parsedServings)
      ? parsedServings * (selectedFood.servingWeightGrams || 100)
      : 0;
  }, [inputMode, quantityGrams, selectedFood, servingsCount, volumeMl]);

  const liveMacros = useMemo(() => {
    if (!selectedFood) {
      return {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        fibre: 0,
        insolubleFibreG: null as number | null,
        solubleFibreG: null as number | null,
        missingFields: [] as NonNullable<FoodItem['missingFields']>,
      };
    }
    const roundedGrams = Math.round(effectiveGrams * 10) / 10;
    return calculateScaledNutritionDetailed(selectedFood, roundedGrams);
  }, [effectiveGrams, selectedFood]);

  const targetDateMacros = useMemo(
    () => sumMacros(getEntriesForDate(state.foodEntries, date)),
    [date, state.foodEntries]
  );

  const trayMacros = useMemo(
    () =>
      trayItems.reduce(
        (acc, t) => ({
          calories: acc.calories + t.calories,
          protein: Math.round((acc.protein + t.protein) * 10) / 10,
          carbs: Math.round((acc.carbs + t.carbs) * 10) / 10,
          fat: Math.round((acc.fat + t.fat) * 10) / 10,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      ),
    [trayItems]
  );

  const remainingToday = useMemo(() => {
    const calLeft = Math.round(state.goals.calories - (targetDateMacros.calories + trayMacros.calories));
    const proLeft = Math.round((state.goals.protein - (targetDateMacros.protein + trayMacros.protein)) * 10) / 10;
    const carbLeft = Math.round((state.goals.carbs - (targetDateMacros.carbs + trayMacros.carbs)) * 10) / 10;
    const fatLeft = Math.round((state.goals.fat - (targetDateMacros.fat + trayMacros.fat)) * 10) / 10;
    return { calLeft, proLeft, carbLeft, fatLeft };
  }, [state.goals, targetDateMacros, trayMacros]);

  if (!foodModal.isOpen) return null;

  const resolveDefaultForFood = (food: FoodItem) => {
    const remembered = getLastUsedPortion(food.id);
    const portions = getPortionsForFood(food);
    const defaultP = portions.find((p) => p.isDefault) || portions[0];
    const grams = remembered?.grams ?? (defaultP ? defaultP.gramOrMlWeight : food.servingWeightGrams || 100);
    const label = remembered?.unitLabel || (defaultP ? defaultP.portionName : `${grams} g`);
    return { grams, label, remembered };
  };

  const handleSelectFood = (food: FoodItem) => {
    const { grams, label, remembered } = resolveDefaultForFood(food);
    setSelectedFood(food);
    setLastUsedPortion(remembered);
    setQuantityGrams(String(grams));
    setSelectedUnitLabel(label);
    setServingsCount(String(Math.round((grams / Math.max(1, food.servingWeightGrams || 100)) * 100) / 100));
    if (food.liquidDensityGPerMl) {
      setVolumeMl(String(Math.round((grams / food.liquidDensityGPerMl) * 10) / 10));
    }
    setInputMode('grams');
    setError('');
  };

  const handleQuickAddFood = (e: React.MouseEvent, food: FoodItem) => {
    e.stopPropagation();
    const { grams, label } = resolveDefaultForFood(food);
    addFoodEntry({
      food,
      quantityGrams: grams,
      mealType,
      date,
      unitLabel: label,
    });
  };

  const handleAddCurrentToTray = () => {
    if (!selectedFood) return;
    if (!Number.isFinite(effectiveGrams) || effectiveGrams <= 0) {
      setError('Quantity must be greater than 0.');
      return;
    }
    const roundedGrams = Math.round(effectiveGrams * 10) / 10;
    const computedUnitLabel =
      inputMode === 'ml'
        ? `${parseFloat(volumeMl) || 0} ml (${roundedGrams} g)`
        : inputMode === 'servings'
        ? `${parseFloat(servingsCount) || 1} × ${selectedFood.servingName}`
        : selectedUnitLabel || `${roundedGrams} g`;
    const scaled = calculateScaledNutrition(selectedFood, roundedGrams);
    setTrayItems((prev) => [
      ...prev,
      {
        id: `${selectedFood.id}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        food: selectedFood,
        quantityGrams: roundedGrams,
        unitLabel: computedUnitLabel,
        ...scaled,
      },
    ]);
    setSelectedFood(null);
    notify(`Added ${selectedFood.name} to meal tray`);
  };

  const handleLogTray = () => {
    if (trayItems.length === 0) return;
    trayItems.forEach((item) => {
      addFoodEntry({
        food: item.food,
        quantityGrams: item.quantityGrams,
        mealType,
        date,
        unitLabel: item.unitLabel,
      });
    });
    if (trayMealName.trim()) {
      saveMealCombo(
        trayMealName.trim(),
        mealType,
        trayItems.map((t) => ({
          foodId: t.food.id,
          foodName: t.food.name,
          quantityGrams: t.quantityGrams,
          unitLabel: t.unitLabel,
          calories: t.calories,
          protein: t.protein,
          carbs: t.carbs,
          fat: t.fat,
          fibre: t.fibre,
        }))
      );
    }
    setTrayItems([]);
    closeFoodModal();
  };

  const handleLogCombo = (combo: SavedMealCombo) => {
    logSavedMealCombo(combo, mealType, date);
    closeFoodModal();
  };

  const handleSaveEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFood) {
      setError('Please select a food item first.');
      return;
    }
    if (!Number.isFinite(effectiveGrams) || effectiveGrams <= 0) {
      setError('Quantity must be greater than 0.');
      return;
    }
    if (effectiveGrams > 10000) {
      setError('Quantity seems too large (max 10,000 g per entry).');
      return;
    }

    const roundedGrams = Math.round(effectiveGrams * 10) / 10;
    const computedUnitLabel =
      inputMode === 'ml'
        ? `${parseFloat(volumeMl) || 0} ml (${roundedGrams} g)`
        : inputMode === 'servings'
        ? `${parseFloat(servingsCount) || 1} × ${selectedFood.servingName}`
        : selectedUnitLabel || `${roundedGrams} g`;

    if (editing) {
      updateFoodEntry(editing.id, {
        food: selectedFood,
        quantityGrams: roundedGrams,
        mealType,
        date,
        unitLabel: computedUnitLabel,
      });
    } else {
      addFoodEntry({
        food: selectedFood,
        quantityGrams: roundedGrams,
        mealType,
        date,
        unitLabel: computedUnitLabel,
      });
    }
    closeFoodModal();
  };

  const handleSaveCustomFood = (e: React.FormEvent) => {
    e.preventDefault();
    const name = customName.trim();
    const grams = parseFloat(customServingGrams);
    const cal = parseFloat(customCalories);
    const pro = parseFloat(customProtein || '0');
    const carb = parseFloat(customCarbs || '0');
    const fat = parseFloat(customFat || '0');
    const fib = parseFloat(customFibre || '0');

    if (!name) {
      setCustomError('Enter a food name.');
      return;
    }
    if (!Number.isFinite(grams) || grams <= 0) {
      setCustomError('Serving weight must be greater than 0 g.');
      return;
    }
    if (!Number.isFinite(cal) || cal < 0) {
      setCustomError('Enter valid calories.');
      return;
    }
    if ([pro, carb, fat, fib].some((v) => !Number.isFinite(v) || v < 0)) {
      setCustomError('Macro values cannot be negative.');
      return;
    }

    const created = addCustomFood({
      name,
      brand: customBrand.trim() || undefined,
      category: customCategory,
      servingName: customServingName.trim() || `${grams} g`,
      servingWeightGrams: grams,
      calories: cal,
      protein: pro,
      carbs: carb,
      fat,
      fibre: fib,
    });
    setCreatingCustom(false);
    handleSelectFood(created);
    setCustomName('');
    setCustomBrand('');
    setCustomCalories('');
    setCustomProtein('');
    setCustomCarbs('');
    setCustomFat('');
    setCustomFibre('0');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-black/65 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editing ? 'Edit food entry' : 'Add food to log'}
    >
      <div className="w-full h-[100dvh] sm:h-auto sm:max-w-lg sm:max-h-[90vh] flex flex-col bg-white dark:bg-[#111317] rounded-none sm:rounded-2xl border-0 sm:border border-black/10 dark:border-white/12 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 sm:py-4 border-b border-black/10 dark:border-white/12 shrink-0 bg-white dark:bg-[#111317]">
          <div className="flex items-center gap-2.5 min-w-0">
            {(selectedFood && !editing) || creatingCustom ? (
              <button
                type="button"
                onClick={() => {
                  if (creatingCustom) {
                    setCreatingCustom(false);
                  } else {
                    setSelectedFood(null);
                  }
                }}
                aria-label="Back to food search"
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            ) : null}
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
              {creatingCustom
                ? 'Create Custom Food'
                : editing
                ? 'Edit Food Entry'
                : selectedFood
                ? 'Set Quantity & Meal'
                : 'Add Food'}
            </h2>
          </div>

          <button
            type="button"
            onClick={closeFoodModal}
            aria-label="Close modal"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-stone-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sticky Remaining Budget Bar */}
        <div className="px-4 sm:px-5 py-2 bg-[#F4F3EF]/85 dark:bg-[#090A0C] border-b border-black/8 dark:border-white/10 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono-nums shrink-0">
          <span className="text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
            Remaining Today
          </span>
          <div className="flex items-center gap-2.5 text-slate-800 dark:text-slate-200">
            <span className={remainingToday.calLeft < 0 ? 'text-rose-500 font-bold' : 'font-bold text-[#4E6800] dark:text-[#C8FF00]'}>
              {remainingToday.calLeft} kcal
            </span>
            <span>·</span>
            <span>P {remainingToday.proLeft}g</span>
            <span>·</span>
            <span>C {remainingToday.carbLeft}g</span>
            <span>·</span>
            <span>F {remainingToday.fatLeft}g</span>
          </div>
        </div>

        {/* Body */}
        {creatingCustom ? (
          <form onSubmit={handleSaveCustomFood} className="p-5 overflow-y-auto space-y-4">
            {customError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-xs font-medium">
                {customError}
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Food Name
              </label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g., Homemade Paneer Bhurji"
                className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Brand (optional)
                </label>
                <input
                  type="text"
                  value={customBrand}
                  onChange={(e) => setCustomBrand(e.target.value)}
                  placeholder="Optional"
                  className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Category
                </label>
                <select
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value as FoodCategory)}
                  className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
                >
                  {GLOBAL_FOOD_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Serving Name
                </label>
                <input
                  type="text"
                  value={customServingName}
                  onChange={(e) => setCustomServingName(e.target.value)}
                  placeholder="1 bowl / 100 g"
                  className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Serving Weight (g)
                </label>
                <input
                  type="number"
                  step="any"
                  min="1"
                  value={customServingGrams}
                  onChange={(e) => setCustomServingGrams(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-sm font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Calories (kcal)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={customCalories}
                  onChange={(e) => setCustomCalories(e.target.value)}
                  placeholder="0"
                  className="w-full h-11 px-3 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-sm font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Protein (g)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={customProtein}
                  onChange={(e) => setCustomProtein(e.target.value)}
                  placeholder="0"
                  className="w-full h-11 px-3 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-sm font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Carbs (g)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={customCarbs}
                  onChange={(e) => setCustomCarbs(e.target.value)}
                  placeholder="0"
                  className="w-full h-11 px-3 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-sm font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Fat (g)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={customFat}
                  onChange={(e) => setCustomFat(e.target.value)}
                  placeholder="0"
                  className="w-full h-11 px-3 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-sm font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Fibre (g)
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={customFibre}
                  onChange={(e) => setCustomFibre(e.target.value)}
                  placeholder="0"
                  className="w-full h-11 px-3 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-sm font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setCreatingCustom(false)}
                className="min-h-[44px] px-4 rounded-xl border border-black/10 dark:border-white/15 text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-h-[44px] px-5 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Save & Use Food
              </button>
            </div>
          </form>
        ) : !selectedFood ? (
          /* Step 1 & 2: Search, Meals & Select Food */
          <div className="flex flex-col flex-1 min-h-0">
            <div className="sticky top-0 z-20 px-4 sm:px-5 pt-3.5 pb-3 space-y-2.5 border-b border-stone-100 dark:border-white/10 bg-white dark:bg-[#111317] shrink-0">
              {filterTab !== 'meals' && (
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="search"
                    enterKeyHint="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search food, brand, chain, or barcode (press /)"
                    className="w-full h-11 pl-10 pr-4 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-base sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
                  />
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1 p-1 bg-stone-100 dark:bg-[#090A0C] rounded-xl overflow-x-auto no-scrollbar">
                  {(['all', 'india', 'recent', 'favorites', 'meals', 'custom'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setFilterTab(tab)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium capitalize whitespace-nowrap transition-colors ${
                        filterTab === tab
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {tab === 'custom'
                        ? 'My Foods'
                        : tab === 'india'
                        ? 'India'
                        : tab === 'meals'
                        ? `Meals${savedMeals.length > 0 ? ` (${savedMeals.length})` : ''}`
                        : tab}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      closeFoodModal();
                      openBarcodeScannerModal({ meal: mealType, date });
                    }}
                    title="Scan packaged food barcode"
                    className="min-h-[34px] px-2 rounded-xl border border-black/10 dark:border-white/15 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-lime-500 inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    <Barcode className="w-3.5 h-3.5 text-lime-600 dark:text-lime-400" />
                    <span>Scan</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      closeFoodModal();
                      openMealScannerModal({ mode: 'photo', meal: mealType, date });
                    }}
                    title="Scan meal photo with AI"
                    className="min-h-[34px] px-2 rounded-xl border border-black/10 dark:border-white/15 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-lime-500 inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    <Camera className="w-3.5 h-3.5 text-lime-600 dark:text-lime-400" />
                    <span>Photo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      closeFoodModal();
                      openMealScannerModal({ mode: 'voice', meal: mealType, date });
                    }}
                    title="Log meal by voice"
                    className="min-h-[34px] px-2 rounded-xl border border-black/10 dark:border-white/15 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-lime-500 inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    <Mic className="w-3.5 h-3.5 text-lime-600 dark:text-lime-400" />
                    <span>Voice</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreatingCustom(true)}
                    className="min-h-[34px] px-2 rounded-xl text-xs font-semibold text-lime-700 dark:text-lime-400 hover:bg-lime-50 dark:hover:bg-lime-950/40 inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Custom
                  </button>
                </div>
              </div>
            </div>

            {filterTab === 'meals' ? (
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Log target meal:
                  </span>
                  <select
                    value={mealType}
                    onChange={(e) => setMealType(e.target.value as MealCategory)}
                    className="h-9 px-2.5 rounded-lg border border-black/10 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-xs font-medium text-slate-800 dark:text-slate-200"
                  >
                    {MEAL_CATEGORIES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                {savedMeals.length === 0 ? (
                  <div className="py-10 px-4 text-center rounded-2xl border border-dashed border-black/10 dark:border-white/12">
                    <BookmarkCheck className="w-7 h-7 mx-auto text-slate-400" />
                    <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                      No saved meal combos yet
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Add multiple foods to your Meal Tray or click &ldquo;Save as Meal&rdquo; on any logged meal in your diary.
                    </p>
                  </div>
                ) : (
                  savedMeals.map((combo) => (
                    <div
                      key={combo.id}
                      className="p-3.5 rounded-xl border border-black/10 dark:border-white/12 bg-stone-50/70 dark:bg-[#090A0C] flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {combo.name}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono-nums">
                          {combo.items.length} items · {combo.totalCalories} kcal · P {combo.totalProtein}g · C {combo.totalCarbs}g · F {combo.totalFat}g
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleLogCombo(combo)}
                          className="min-h-[36px] px-3 rounded-lg bg-[#C8FF00] text-black text-xs font-bold hover:brightness-95"
                        >
                          Log Meal
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSavedMealCombo(combo.id)}
                          aria-label={`Delete saved meal ${combo.name}`}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain divide-y divide-stone-100 dark:divide-white/10 px-2 py-1">
                {remoteSearching && (
                  <div className="px-3 py-2 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 animate-pulse text-lime-600 dark:text-lime-400" />
                    Searching global databases (Open Food Facts, IFCT 2017, USDA)...
                  </div>
                )}

                {combinedFoods.length === 0 && !remoteSearching ? (
                  <div className="py-12 px-6 text-center">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      No matching foods found
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Try another search term or create a custom food item.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomName(searchQuery);
                        setCreatingCustom(true);
                      }}
                      className="mt-4 min-h-[40px] px-4 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      Create Custom Food
                    </button>
                  </div>
                ) : (
                  combinedFoods.map((food) => {
                    const isFav = favoriteSet.has(food.id);
                    const badge = getVerificationBadgeInfo(food.verificationStatus);
                    const remembered = getLastUsedPortion(food.id);
                    return (
                      <div
                        key={food.id}
                        className="w-full min-h-[60px] px-2.5 py-2 rounded-xl flex items-center justify-between gap-2 hover:bg-stone-50 dark:hover:bg-slate-800/60 transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectFood(food)}
                          className="flex-1 min-w-0 text-left"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                              {food.name}
                            </span>
                            {food.foodState && (
                              <span className="px-1.5 py-0.5 rounded bg-stone-100 dark:bg-white/10 text-[10px] capitalize text-slate-600 dark:text-slate-300 shrink-0">
                                {food.foodState}
                              </span>
                            )}
                            {food.brand && (
                              <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                · {food.brand}
                              </span>
                            )}
                            {isFav && (
                              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
                            )}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 truncate">
                            <span>{remembered ? `Last: ${remembered.unitLabel || `${remembered.grams}g`}` : food.servingName}</span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">
                              P {formatNutrientValue(food, 'protein', 'g')}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">
                              C {formatNutrientValue(food, 'carbs', 'g')}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">
                              F {formatNutrientValue(food, 'fat', 'g')}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-400 flex items-center gap-1.5 truncate">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${badge.cls}`}>
                              {badge.label}
                            </span>
                            <span className="truncate">
                              {food.sourceName || getSourceTypeLabel(food.sourceType, food.isCustom)}
                              {food.foodCode ? ` · ${food.foodCode}` : ''}
                            </span>
                          </div>
                        </button>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-mono-nums">
                              {formatNutrientValue(food, 'calories')}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {food.missingFields?.includes('calories') ? '' : 'kcal'}
                            </div>
                          </div>
                          {!editing && (
                            <button
                              type="button"
                              onClick={(e) => handleQuickAddFood(e, food)}
                              title="1-tap quick add default serving"
                              aria-label={`Quick add ${food.name}`}
                              className="min-h-[38px] min-w-[38px] rounded-xl border border-black/10 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-slate-800 dark:text-[#C8FF00] hover:bg-[#C8FF00] hover:text-black hover:border-[#C8FF00] flex items-center justify-center transition-colors"
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Sticky Multi-Add Meal Tray Footer */}
            {trayItems.length > 0 && (
              <div className="px-4 py-3 border-t border-black/10 dark:border-white/12 bg-stone-50 dark:bg-[#090A0C] space-y-2 shrink-0">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-1.5">
                    <ShoppingBag className="w-3.5 h-3.5 text-[#4E6800] dark:text-[#C8FF00]" />
                    Meal Tray ({trayItems.length} items · {trayMacros.calories} kcal · {trayMacros.protein}g P)
                  </span>
                  <button
                    type="button"
                    onClick={() => setTrayItems([])}
                    className="text-[11px] text-slate-500 hover:text-rose-500"
                  >
                    Clear
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={trayMealName}
                    onChange={(e) => setTrayMealName(e.target.value)}
                    placeholder="Optional: save combo name (e.g. Post-Workout)"
                    className="flex-1 h-9 px-3 rounded-lg border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] text-xs text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={handleLogTray}
                    className="min-h-[36px] px-4 rounded-lg bg-[#C8FF00] text-black text-xs font-bold whitespace-nowrap hover:brightness-95"
                  >
                    Log {trayItems.length} Items
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Step 3, 4, 5: Quantity, Meal & Live Macro Preview */
          <form onSubmit={handleSaveEntry} className="p-5 overflow-y-auto space-y-5">
            {error && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-xs font-medium">
                {error}
              </div>
            )}

            <div className="flex items-start justify-between gap-3 pb-4 border-b border-black/10 dark:border-white/12">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {selectedFood.name}
                    {selectedFood.brand ? ` (${selectedFood.brand})` : ''}
                  </h3>
                  {selectedFood.foodState && (
                    <span className="px-1.5 py-0.5 rounded bg-stone-100 dark:bg-white/10 text-[10px] font-medium capitalize text-slate-600 dark:text-slate-300">
                      {selectedFood.foodState}
                    </span>
                  )}
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      getVerificationBadgeInfo(selectedFood.verificationStatus).cls
                    }`}
                  >
                    {getVerificationBadgeInfo(selectedFood.verificationStatus).label}
                  </span>
                  {selectedCompleteness && (
                    <span className="px-1.5 py-0.5 rounded bg-stone-100 dark:bg-white/10 text-[10px] font-mono-nums text-slate-600 dark:text-slate-300">
                      {selectedCompleteness.macroPresent}/{selectedCompleteness.macroTotal} macros ·{' '}
                      {selectedCompleteness.microPresent}/{selectedCompleteness.microTotal} micros
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Ref basis: {selectedFood.servingName} (
                  {formatNutrientValue(selectedFood, 'calories', ' kcal')})
                  {selectedFood.foodCode ? ` · Code ${selectedFood.foodCode}` : ''}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {getSourceTypeLabel(selectedFood.sourceType, selectedFood.isCustom)}
                  {selectedFood.sourceName ? ` · ${selectedFood.sourceName}` : ''}
                </p>
                {familyVariants.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Other forms / variants:
                    </span>
                    {familyVariants.map((variant) => (
                      <button
                        key={variant.id}
                        type="button"
                        onClick={() => handleSelectFood(variant)}
                        className="px-2 py-0.5 rounded-lg border border-black/10 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-[11px] text-slate-700 dark:text-slate-200 hover:border-lime-500 transition-colors"
                      >
                        <span className="capitalize font-medium">{variant.foodState || 'variant'}</span>
                        {' · '}
                        <span className="font-mono-nums">
                          {variant.missingFields?.includes('calories') ? 'Unavailable' : `${variant.calories} kcal`}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {!editing && (
                <button
                  type="button"
                  onClick={() => setSelectedFood(null)}
                  className="text-xs font-medium text-lime-700 dark:text-lime-400 hover:underline whitespace-nowrap shrink-0"
                >
                  Change food
                </button>
              )}
            </div>

            {/* Quantity controls */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Quantity & Portions
                </label>
                <div className="flex items-center gap-1 p-0.5 bg-stone-100 dark:bg-[#090A0C] rounded-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setInputMode('grams');
                      setQuantityGrams(
                        String(
                          Math.round(effectiveGrams * 10) / 10 || selectedFood.servingWeightGrams
                        )
                      );
                    }}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                      inputMode === 'grams'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Grams (g)
                  </button>
                  {supportsVolumeMl && (
                    <button
                      type="button"
                      onClick={() => {
                        setInputMode('ml');
                        const density = selectedFood.liquidDensityGPerMl || 1;
                        setVolumeMl(String(Math.round((effectiveGrams / density) * 10) / 10 || 200));
                      }}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                        inputMode === 'ml'
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      ml (Liquid)
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setInputMode('servings');
                      const s = effectiveGrams / Math.max(1, selectedFood.servingWeightGrams);
                      setServingsCount(String(Math.round(s * 100) / 100 || 1));
                    }}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                      inputMode === 'servings'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Servings
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="number"
                  step="any"
                  min="0.1"
                  value={
                    inputMode === 'grams'
                      ? quantityGrams
                      : inputMode === 'ml'
                      ? volumeMl
                      : servingsCount
                  }
                  onChange={(e) => {
                    if (inputMode === 'grams') {
                      setQuantityGrams(e.target.value);
                      setSelectedUnitLabel('');
                    } else if (inputMode === 'ml') {
                      setVolumeMl(e.target.value);
                      setSelectedUnitLabel('');
                    } else {
                      setServingsCount(e.target.value);
                      setSelectedUnitLabel('');
                    }
                  }}
                  className="flex-1 h-12 px-4 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/70 dark:bg-[#090A0C] text-base font-semibold font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
                />
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400 min-w-[78px] text-right tabular-nums">
                  {inputMode === 'grams'
                    ? formatFoodQuantity(effectiveGrams, state.settings.foodUnit)
                    : `${Math.round(effectiveGrams * 10) / 10} g`}
                </span>
              </div>

              {inputMode === 'ml' && selectedFood.liquidDensityGPerMl && (
                <p className="text-[11px] text-sky-700 dark:text-sky-300 font-mono-nums">
                  Verified liquid density: {selectedFood.liquidDensityGPerMl} g/ml →{' '}
                  {Math.round(effectiveGrams * 10) / 10} g equivalent
                </p>
              )}

              {/* Food-specific verified portions (Last used + S / M / L / Katori / Piece) */}
              {(foodPortions.length > 0 || lastUsedPortion) && inputMode === 'grams' && (
                <div className="space-y-1">
                  <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Household Portions & Memory
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {lastUsedPortion && (
                      <button
                        type="button"
                        onClick={() => {
                          setQuantityGrams(String(lastUsedPortion.grams));
                          setSelectedUnitLabel(lastUsedPortion.unitLabel || `${lastUsedPortion.grams} g`);
                        }}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors inline-flex items-center gap-1 ${
                          Math.abs((parseFloat(quantityGrams) || 0) - lastUsedPortion.grams) < 0.05
                            ? 'bg-[#C8FF00] text-black border-[#C8FF00]'
                            : 'border-[#C8FF00]/50 bg-[#C8FF00]/10 text-[#4E6800] dark:text-[#C8FF00]'
                        }`}
                      >
                        <Clock className="w-3 h-3" />
                        Last used ({lastUsedPortion.grams}g)
                      </button>
                    )}
                    {foodPortions.map((portion) => {
                      const active =
                        Math.abs((parseFloat(quantityGrams) || 0) - portion.gramOrMlWeight) < 0.05;
                      return (
                        <button
                          key={portion.id}
                          type="button"
                          onClick={() => {
                            setQuantityGrams(String(portion.gramOrMlWeight));
                            setSelectedUnitLabel(portion.portionName);
                          }}
                          title={`${portion.sourceReference} · ${portion.confidenceLevel} confidence`}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            active
                              ? 'bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 border-slate-900 dark:border-lime-500'
                              : 'border-black/10 dark:border-white/15 text-slate-700 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {portion.portionName} ({portion.gramOrMlWeight}g)
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Quick Gram / Volume / Serving Presets */}
              <div className="flex flex-wrap gap-1.5">
                {inputMode === 'grams'
                  ? STANDARD_GRAM_PRESETS.map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => {
                          setQuantityGrams(String(g));
                          setSelectedUnitLabel(`${g} g`);
                        }}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium font-mono-nums border transition-colors ${
                          Math.abs((parseFloat(quantityGrams) || 0) - g) < 0.05
                            ? 'bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 border-slate-900 dark:border-lime-500'
                            : 'border-black/10 dark:border-white/15 text-slate-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {g}g
                      </button>
                    ))
                  : inputMode === 'ml'
                  ? [100, 150, 200, 250, 300].map((ml) => (
                      <button
                        key={ml}
                        type="button"
                        onClick={() => setVolumeMl(String(ml))}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium font-mono-nums border transition-colors ${
                          Math.abs((parseFloat(volumeMl) || 0) - ml) < 0.05
                            ? 'bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 border-slate-900 dark:border-lime-500'
                            : 'border-black/10 dark:border-white/15 text-slate-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {ml} ml
                      </button>
                    ))
                  : [0.5, 1, 1.5, 2, 3].map((srv) => (
                      <button
                        key={srv}
                        type="button"
                        onClick={() => setServingsCount(String(srv))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium font-mono-nums border transition-colors ${
                          Number(servingsCount) === srv
                            ? 'bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 border-slate-900 dark:border-lime-500'
                            : 'border-black/10 dark:border-white/15 text-slate-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {srv}×
                      </button>
                    ))}
              </div>
            </div>

            {/* Live calculated nutrition */}
            <div className="rounded-2xl bg-stone-50 dark:bg-[#090A0C]/90 border border-black/10 dark:border-white/12 p-4 space-y-2.5">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Calculated nutrition ({Math.round(effectiveGrams * 10) / 10} g)
                </span>
                <span className="text-lg font-bold text-slate-900 dark:text-slate-100 font-mono-nums">
                  {selectedFood.missingFields?.includes('calories')
                    ? 'Unavailable'
                    : `${liveMacros.calories} kcal`}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="py-2 px-1 rounded-xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Protein</div>
                  <div className="text-sm font-semibold text-lime-700 dark:text-lime-400 font-mono-nums mt-0.5">
                    {selectedFood.missingFields?.includes('protein')
                      ? 'Unavailable'
                      : `${liveMacros.protein}g`}
                  </div>
                </div>
                <div className="py-2 px-1 rounded-xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Carbs</div>
                  <div className="text-sm font-semibold text-amber-700 dark:text-amber-400 font-mono-nums mt-0.5">
                    {selectedFood.missingFields?.includes('carbs')
                      ? 'Unavailable'
                      : `${liveMacros.carbs}g`}
                  </div>
                </div>
                <div className="py-2 px-1 rounded-xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Fat</div>
                  <div className="text-sm font-semibold text-indigo-700 dark:text-indigo-400 font-mono-nums mt-0.5">
                    {selectedFood.missingFields?.includes('fat')
                      ? 'Unavailable'
                      : `${liveMacros.fat}g`}
                  </div>
                </div>
                <div className="py-2 px-1 rounded-xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Fibre</div>
                  <div className="text-sm font-semibold text-teal-700 dark:text-teal-400 font-mono-nums mt-0.5">
                    {selectedFood.missingFields?.includes('fibre')
                      ? 'Unavailable'
                      : `${liveMacros.fibre}g`}
                  </div>
                </div>
              </div>
              {(liveMacros.solubleFibreG !== null || liveMacros.insolubleFibreG !== null) && (
                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2 font-mono-nums">
                  <span>
                    Soluble Fibre: {liveMacros.solubleFibreG ?? 'Unavailable'}
                    {liveMacros.solubleFibreG !== null ? 'g' : ''}
                  </span>
                  <span>
                    Insoluble Fibre: {liveMacros.insolubleFibreG ?? 'Unavailable'}
                    {liveMacros.insolubleFibreG !== null ? 'g' : ''}
                  </span>
                </div>
              )}
            </div>

            {/* Meal & Date */}
            <div className="space-y-3">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Meal Category
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {MEAL_CATEGORIES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMealType(m.id)}
                    className={`min-h-[42px] px-3 rounded-xl text-xs font-medium border transition-colors text-center whitespace-nowrap ${
                      mealType === m.id
                        ? 'bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 border-slate-900 dark:border-lime-500 font-semibold'
                        : 'border-black/10 dark:border-white/15 text-slate-700 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Log Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              {!editing && (
                <button
                  type="button"
                  onClick={handleAddCurrentToTray}
                  className="sm:w-44 min-h-[48px] px-4 rounded-xl border border-black/15 dark:border-white/20 text-slate-800 dark:text-slate-100 text-sm font-semibold hover:border-[#C8FF00] transition-colors inline-flex items-center justify-center gap-1.5"
                >
                  <ShoppingBag className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00]" />
                  Add to Tray
                </button>
              )}
              <button
                type="submit"
                className="flex-1 min-h-[48px] rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-sm font-semibold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                {editing ? 'Save Changes' : 'Add to Food Log'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
