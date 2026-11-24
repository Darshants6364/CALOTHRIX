import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Barcode,
  BookmarkCheck,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
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
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import { HorizontalScroller } from './HorizontalScroller';
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
  isFoodNutritionallyUsable,
  sumMacros,
} from '../utils/nutritionUtils';
import { getNonEmptyResultGroups, searchFoodsIntelligent } from '../utils/foodSearchEngine';
import {
  convertVolumeMlToGrams,
  getLastUsedPortion,
  getPortionsForFood,
} from '../utils/portionEngine';

function getSourceTypeLabel(sourceType?: FoodSourceType, isCustom?: boolean): string {
  if (isCustom || sourceType === 'personal_custom') return 'Custom';
  if (sourceType === 'branded') return 'Branded';
  if (sourceType === 'community') return 'Community';
  return 'Verified Ref';
}

function getShortSourceName(food: FoodItem): string {
  const raw = food.sourceName || getSourceTypeLabel(food.sourceType, food.isCustom);
  if (/ifct/i.test(raw)) return 'IFCT 2017';
  if (/indb/i.test(raw)) return 'INDB';
  if (/uk.*fct|mccance/i.test(raw)) return 'UK FCT';
  if (/us.*fct|usda/i.test(raw)) return 'US FCT';
  if (/karnataka/i.test(raw)) return 'Karnataka Ref';
  if (/calothrix.*cooked/i.test(raw)) return 'Indian Ref';
  return raw.length > 22 ? `${raw.slice(0, 21)}…` : raw;
}

function getShortVariantLabel(name: string): string {
  const stripped = name.replace(/\s*\([^)]*\)/g, '').trim();
  return stripped.length > 24 ? `${stripped.slice(0, 23)}…` : stripped;
}

const BROAD_CATCHALL_FAMILIES = new Set([
  'vegetables',
  'fruits',
  'beverages',
  'nuts_seeds',
  'bread_bakery',
  'sweets_desserts',
  'cheese_dairy',
  'supplements',
]);

function extractCoreFoodTokens(name: string): string[] {
  const stopWords = new Set([
    'raw', 'fresh', 'cooked', 'boiled', 'steamed', 'fried', 'roasted', 'grilled',
    'plain', 'indian', 'homemade', 'whole', 'with', 'without', 'skin', 'dried',
    'dry', 'ripe', 'tender', 'mature', 'green', 'red', 'white', 'black', 'yellow',
    'small', 'big', 'large', 'medium', 'sp', 'spp', 'var', 'style', 'dish', 'curry',
  ]);
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length >= 3 && !stopWords.has(t));
}

function getQualityBadgeInfo(food: FoodItem): {
  label: string;
  textCls: string;
} {
  if (food.qualityStatus === 'verified') {
    return { label: 'Verified', textCls: 'text-emerald-700 dark:text-emerald-400' };
  }
  if (food.qualityStatus === 'calculated') {
    return { label: 'Calculated', textCls: 'text-sky-700 dark:text-sky-400' };
  }
  if (food.qualityStatus === 'estimated') {
    return { label: 'Estimated', textCls: 'text-amber-700 dark:text-amber-400' };
  }
  switch (food.verificationStatus) {
    case 'verified':
      return { label: 'Verified', textCls: 'text-emerald-700 dark:text-emerald-400' };
    case 'enriched':
      return { label: 'Calculated', textCls: 'text-sky-700 dark:text-sky-400' };
    case 'estimated':
      return { label: 'Estimated', textCls: 'text-amber-700 dark:text-amber-400' };
    case 'user_provided':
      return { label: 'Custom', textCls: 'text-slate-600 dark:text-slate-400' };
    default:
      return { label: 'Verified', textCls: 'text-emerald-700 dark:text-emerald-400' };
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
  const modalContainerRef = useRef<HTMLDivElement | null>(null);
  useModalFocusTrap(modalContainerRef, foodModal.isOpen, closeFoodModal);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<
    'all' | 'india' | 'recent' | 'favorites' | 'meals' | 'custom'
  >('all');
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [showVariants, setShowVariants] = useState(false);
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
          if (!cancelled && bcRes.item && isFoodNutritionallyUsable(bcRes.item)) {
            setRemoteFoods([bcRes.item]);
            setRemoteSearching(false);
            return;
          }
        }
        const res = await searchGlobalFoodsApi({
          query: q,
          country: filterTab === 'india' ? 'India' : undefined,
          limit: 40,
        });
        if (!cancelled) {
          setRemoteFoods(
            res.items.filter(
              (item) => isFoodNutritionallyUsable(item) && !localFoodIdSet.has(item.id)
            )
          );
        }
      } catch {
        if (!cancelled) setRemoteFoods([]);
      } finally {
        if (!cancelled) setRemoteSearching(false);
      }
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [creatingCustom, filterTab, foodModal.isOpen, localFoodIdSet, searchQuery, selectedFood]);

  const filteredLocalFoods = useMemo(() => {
    const activeFoods = allFoods.filter((f) => isFoodNutritionallyUsable(f));
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

  const groupedSearchFoods = useMemo(() => {
    if (!deferredSearchQuery.trim()) return [];
    return getNonEmptyResultGroups(combinedFoods);
  }, [combinedFoods, deferredSearchQuery]);

  const familyVariants = useMemo(() => {
    const famKey = selectedFood?.foodFamilyId || selectedFood?.canonicalFamily;
    if (!selectedFood || !famKey) return [];

    const isBroadFamily = BROAD_CATCHALL_FAMILIES.has(famKey);
    const coreTokens = isBroadFamily ? extractCoreFoodTokens(selectedFood.name) : [];

    return allFoods
      .filter((f) => {
        if (!isFoodNutritionallyUsable(f) || f.id === selectedFood.id) return false;
        if ((f.foodFamilyId || f.canonicalFamily) !== famKey) return false;
        if (isBroadFamily) {
          if (coreTokens.length === 0) return false;
          const candLower = f.name.toLowerCase();
          return coreTokens.some((tok) => candLower.includes(tok));
        }
        return true;
      })
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
    setShowVariants(false);
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
      onClick={(e) => {
        if (e.target === e.currentTarget) closeFoodModal();
      }}
    >
      <div
        ref={modalContainerRef}
        className="w-full h-[100dvh] sm:h-auto sm:max-w-lg sm:max-h-[90vh] flex flex-col bg-white dark:bg-[#111317] rounded-none sm:rounded-2xl border-0 sm:border border-black/10 dark:border-white/12 shadow-2xl overflow-hidden overscroll-contain"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-2.5 sm:py-3.5 border-b border-black/10 dark:border-white/12 shrink-0 bg-white dark:bg-[#111317]">
          <div className="flex items-center gap-2 min-w-0">
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
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800 shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            ) : null}
            <h2 className="text-[15px] sm:text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
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
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-stone-100 dark:hover:bg-slate-800 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Compact Single-Line Remaining Budget Bar */}
        <div className="px-4 sm:px-5 py-1.5 bg-[#F4F3EF]/85 dark:bg-[#090A0C] border-b border-black/8 dark:border-white/10 flex items-center justify-between gap-2 text-[11px] font-mono-nums whitespace-nowrap overflow-x-auto no-scrollbar shrink-0">
          <span className="text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider shrink-0">
            <span className="sm:hidden">Left</span>
            <span className="hidden sm:inline">Remaining Today</span>
          </span>
          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 shrink-0">
            <span className={remainingToday.calLeft < 0 ? 'text-rose-500 font-bold' : 'font-bold text-[#4E6800] dark:text-[#C8FF00]'}>
              {remainingToday.calLeft} kcal
            </span>
            <span aria-hidden="true">·</span>
            <span>P {remainingToday.proLeft}g</span>
            <span aria-hidden="true">·</span>
            <span>C {remainingToday.carbLeft}g</span>
            <span aria-hidden="true">·</span>
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
            <div className="sticky top-0 z-20 px-4 sm:px-5 pt-3 pb-2.5 space-y-2 border-b border-stone-100 dark:border-white/10 bg-white dark:bg-[#111317] shrink-0">
              {filterTab !== 'meals' && (
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="search"
                    enterKeyHint="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search food, regional dish, brand, or barcode"
                    className="w-full h-11 pl-10 pr-4 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-base sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
                  />
                </div>
              )}

              <HorizontalScroller ariaLabel="Food filter tabs" showArrows={false}>
                <div className="flex items-center gap-1 p-1 bg-stone-100 dark:bg-[#090A0C] rounded-xl shrink-0">
                  {(['all', 'india', 'recent', 'favorites', 'meals', 'custom'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setFilterTab(tab)}
                      className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-medium capitalize whitespace-nowrap shrink-0 transition-colors ${
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
              </HorizontalScroller>

              <HorizontalScroller ariaLabel="Quick log tools" showArrows={false} contentClassName="gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    closeFoodModal();
                    openBarcodeScannerModal({ meal: mealType, date });
                  }}
                  title="Scan packaged food barcode"
                  className="min-h-[36px] px-2.5 rounded-xl border border-black/10 dark:border-white/15 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-lime-500 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
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
                  className="min-h-[36px] px-2.5 rounded-xl border border-black/10 dark:border-white/15 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-lime-500 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
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
                  className="min-h-[36px] px-2.5 rounded-xl border border-black/10 dark:border-white/15 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-lime-500 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Mic className="w-3.5 h-3.5 text-lime-600 dark:text-lime-400" />
                  <span>Voice</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCreatingCustom(true)}
                  className="min-h-[36px] px-2.5 rounded-xl text-xs font-semibold text-lime-700 dark:text-lime-400 hover:bg-lime-50 dark:hover:bg-lime-950/40 inline-flex items-center gap-1 whitespace-nowrap shrink-0 ml-auto"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Custom
                </button>
              </HorizontalScroller>
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
                ) : deferredSearchQuery.trim() && groupedSearchFoods.length > 0 ? (
                  <div className="space-y-2 py-1">
                    {groupedSearchFoods.map((group) => (
                      <div key={group.key}>
                        <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center justify-between bg-stone-50/80 dark:bg-[#090A0C]/70 rounded-lg mb-0.5">
                          <span>{group.label}</span>
                          <span className="font-mono-nums">{group.items.length}</span>
                        </div>
                        <div className="divide-y divide-stone-100 dark:divide-white/8">
                          {group.items.map((food) => {
                            const isFav = favoriteSet.has(food.id);
                            const badge = getQualityBadgeInfo(food);
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
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                                      {food.name}
                                    </span>
                                    {food.brand && (
                                      <span className="text-xs text-slate-500 dark:text-slate-400 truncate shrink-0 max-w-[100px]">
                                        · {food.brand}
                                      </span>
                                    )}
                                    {isFav && (
                                      <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
                                    )}
                                  </div>
                                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 truncate">
                                    <span className="truncate">
                                      {remembered
                                        ? `Last: ${remembered.unitLabel || `${remembered.grams}g`}`
                                        : food.servingName}
                                    </span>
                                    <span aria-hidden="true">·</span>
                                    <span className="tabular-nums shrink-0">
                                      P {formatNutrientValue(food, 'protein', 'g')}
                                    </span>
                                    <span aria-hidden="true">·</span>
                                    <span className="tabular-nums shrink-0">
                                      C {formatNutrientValue(food, 'carbs', 'g')}
                                    </span>
                                    <span aria-hidden="true">·</span>
                                    <span className="tabular-nums shrink-0">
                                      F {formatNutrientValue(food, 'fat', 'g')}
                                    </span>
                                  </div>
                                  <div className="mt-0.5 text-[11px] text-slate-400 flex items-center gap-1.5 truncate">
                                    <span className={`font-semibold shrink-0 ${badge.textCls}`}>
                                      {badge.label}
                                    </span>
                                    {food.foodState && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <span className="capitalize shrink-0">{food.foodState}</span>
                                      </>
                                    )}
                                    <span aria-hidden="true">·</span>
                                    <span className="truncate">
                                      {getShortSourceName(food)}
                                      {food.foodCode ? ` · ${food.foodCode}` : ''}
                                    </span>
                                  </div>
                                </button>

                                <div className="flex items-center gap-2 shrink-0">
                                  <div className="text-right">
                                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-mono-nums">
                                      {formatNutrientValue(food, 'calories')}
                                    </div>
                                    <div className="text-[11px] text-slate-400">kcal</div>
                                  </div>
                                  {!editing && (
                                    <button
                                      type="button"
                                      onClick={(e) => handleQuickAddFood(e, food)}
                                      title="1-tap quick add default serving"
                                      aria-label={`Quick add ${food.name}`}
                                      className="min-h-[44px] min-w-[44px] rounded-xl border border-black/10 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-slate-800 dark:text-[#C8FF00] hover:bg-[#C8FF00] hover:text-black hover:border-[#C8FF00] flex items-center justify-center transition-colors"
                                    >
                                      <Plus className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  combinedFoods.map((food) => {
                    const isFav = favoriteSet.has(food.id);
                    const badge = getQualityBadgeInfo(food);
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
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                              {food.name}
                            </span>
                            {food.brand && (
                              <span className="text-xs text-slate-500 dark:text-slate-400 truncate shrink-0 max-w-[100px]">
                                · {food.brand}
                              </span>
                            )}
                            {isFav && (
                              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
                            )}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 truncate">
                            <span className="truncate">
                              {remembered ? `Last: ${remembered.unitLabel || `${remembered.grams}g`}` : food.servingName}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums shrink-0">
                              P {formatNutrientValue(food, 'protein', 'g')}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums shrink-0">
                              C {formatNutrientValue(food, 'carbs', 'g')}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums shrink-0">
                              F {formatNutrientValue(food, 'fat', 'g')}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-400 flex items-center gap-1.5 truncate">
                            <span className={`font-semibold shrink-0 ${badge.textCls}`}>
                              {badge.label}
                            </span>
                            {food.foodState && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="capitalize shrink-0">{food.foodState}</span>
                              </>
                            )}
                            <span aria-hidden="true">·</span>
                            <span className="truncate">
                              {getShortSourceName(food)}
                              {food.foodCode ? ` · ${food.foodCode}` : ''}
                            </span>
                          </div>
                        </button>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-mono-nums">
                              {formatNutrientValue(food, 'calories')}
                            </div>
                            <div className="text-[11px] text-slate-400">kcal</div>
                          </div>
                          {!editing && (
                            <button
                              type="button"
                              onClick={(e) => handleQuickAddFood(e, food)}
                              title="1-tap quick add default serving"
                              aria-label={`Quick add ${food.name}`}
                              className="min-h-[44px] min-w-[44px] rounded-xl border border-black/10 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-slate-800 dark:text-[#C8FF00] hover:bg-[#C8FF00] hover:text-black hover:border-[#C8FF00] flex items-center justify-center transition-colors"
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
          /* Step 3, 4, 5: Quantity, Meal & Live Macro Preview (Mobile-First with Sticky Bottom CTA) */
          <form onSubmit={handleSaveEntry} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-5 py-3.5 sm:py-4 space-y-3.5 sm:space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-xs font-medium">
                  {error}
                </div>
              )}

              {/* Compact 2-Line Food Summary Header (Zero Pill Clutter) */}
              <div className="pb-3 border-b border-black/10 dark:border-white/12 space-y-1.5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-[15px] sm:text-base font-semibold leading-snug text-slate-900 dark:text-slate-100 line-clamp-2">
                    {selectedFood.name}
                    {selectedFood.brand ? ` (${selectedFood.brand})` : ''}
                  </h3>
                  {!editing && (
                    <button
                      type="button"
                      onClick={() => setSelectedFood(null)}
                      className="min-h-[32px] px-1 text-xs font-semibold text-lime-700 dark:text-lime-400 hover:underline whitespace-nowrap shrink-0"
                    >
                      Change
                    </button>
                  )}
                </div>

                <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 leading-tight">
                  <span className="font-mono-nums text-slate-700 dark:text-slate-300 font-medium">
                    {selectedFood.servingName} ({formatNutrientValue(selectedFood, 'calories', ' kcal')})
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className={`font-semibold ${getQualityBadgeInfo(selectedFood).textCls}`}>
                    {getQualityBadgeInfo(selectedFood).label}
                  </span>
                  {selectedFood.foodState && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize">{selectedFood.foodState}</span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span>
                    {getShortSourceName(selectedFood)}
                    {selectedFood.foodCode ? ` ${selectedFood.foodCode}` : ''}
                  </span>
                </div>

                {/* Collapsible 1-Row Variant Switcher (Collapsed by default so Quantity & Macros stay above the fold) */}
                {familyVariants.length > 0 && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setShowVariants((v) => !v)}
                      className="w-full min-h-[34px] px-2.5 rounded-lg bg-stone-50 dark:bg-[#090A0C] border border-black/8 dark:border-white/10 flex items-center justify-between gap-2 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:border-lime-500/60 transition-colors"
                    >
                      <span className="truncate">
                        Switch form or dish ({familyVariants.length} related)
                      </span>
                      {showVariants ? (
                        <ChevronUp className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                      )}
                    </button>

                    {showVariants && (
                      <HorizontalScroller
                        ariaLabel="Related forms and dishes"
                        className="mt-2"
                        contentClassName="gap-1.5 pb-0.5"
                      >
                        {familyVariants.map((variant) => (
                          <button
                            key={variant.id}
                            type="button"
                            onClick={() => handleSelectFood(variant)}
                            title={variant.name}
                            className="min-h-[38px] px-2.5 rounded-lg border border-black/10 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-xs text-slate-700 dark:text-slate-200 hover:border-lime-500 active:scale-[0.98] transition-all whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
                          >
                            <span className="font-medium">{getShortVariantLabel(variant.name)}</span>
                            <span className="text-[11px] text-slate-400 font-mono-nums">
                              {formatNutrientValue(variant, 'calories')} kcal
                            </span>
                          </button>
                        ))}
                      </HorizontalScroller>
                    )}
                  </div>
                )}
              </div>

              {/* Quantity controls — Immediately Visible Above the Fold */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    Quantity & Portions
                  </label>
                  <div className="flex items-center gap-0.5 p-0.5 bg-stone-100 dark:bg-[#090A0C] rounded-lg shrink-0">
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
                      className={`min-h-[30px] px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                        inputMode === 'grams'
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      Grams
                    </button>
                    {supportsVolumeMl && (
                      <button
                        type="button"
                        onClick={() => {
                          setInputMode('ml');
                          const density = selectedFood.liquidDensityGPerMl || 1;
                          setVolumeMl(String(Math.round((effectiveGrams / density) * 10) / 10 || 200));
                        }}
                        className={`min-h-[30px] px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                          inputMode === 'ml'
                            ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        ml
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setInputMode('servings');
                        const s = effectiveGrams / Math.max(1, selectedFood.servingWeightGrams);
                        setServingsCount(String(Math.round(s * 100) / 100 || 1));
                      }}
                      className={`min-h-[30px] px-2.5 py-1 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                        inputMode === 'servings'
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      Servings
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <input
                    type="number"
                    inputMode="decimal"
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
                    className="flex-1 h-11 sm:h-12 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/70 dark:bg-[#090A0C] text-base font-semibold font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
                  />
                  <span className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 min-w-[68px] text-right tabular-nums shrink-0">
                    {inputMode === 'grams'
                      ? formatFoodQuantity(effectiveGrams, state.settings.foodUnit)
                      : `${Math.round(effectiveGrams * 10) / 10} g`}
                  </span>
                </div>

                {inputMode === 'ml' && selectedFood.liquidDensityGPerMl && (
                  <p className="text-[11px] text-sky-700 dark:text-sky-300 font-mono-nums">
                    Density {selectedFood.liquidDensityGPerMl} g/ml → {Math.round(effectiveGrams * 10) / 10} g
                  </p>
                )}

                {/* Single-Row Horizontal Household Portions (Swipe + Drag + Arrow enabled) */}
                {(foodPortions.length > 0 || lastUsedPortion) && inputMode === 'grams' && (
                  <HorizontalScroller ariaLabel="Household portions" contentClassName="gap-1.5 pb-0.5">
                    {lastUsedPortion && (
                      <button
                        type="button"
                        onClick={() => {
                          setQuantityGrams(String(lastUsedPortion.grams));
                          setSelectedUnitLabel(lastUsedPortion.unitLabel || `${lastUsedPortion.grams} g`);
                        }}
                        className={`min-h-[36px] px-2.5 rounded-lg text-xs font-semibold border whitespace-nowrap shrink-0 transition-colors inline-flex items-center gap-1 ${
                          Math.abs((parseFloat(quantityGrams) || 0) - lastUsedPortion.grams) < 0.05
                            ? 'bg-[#C8FF00] text-black border-[#C8FF00]'
                            : 'border-[#C8FF00]/50 bg-[#C8FF00]/10 text-[#4E6800] dark:text-[#C8FF00]'
                        }`}
                      >
                        <Clock className="w-3 h-3" />
                        Last ({lastUsedPortion.grams}g)
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
                          className={`min-h-[36px] px-2.5 rounded-lg text-xs font-medium border whitespace-nowrap shrink-0 transition-colors ${
                            active
                              ? 'bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 border-slate-900 dark:border-lime-500'
                              : 'border-black/10 dark:border-white/15 text-slate-700 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {portion.portionName} ({portion.gramOrMlWeight}g)
                        </button>
                      );
                    })}
                  </HorizontalScroller>
                )}

                {/* Quick Gram / Volume / Serving Presets — Single Horizontal Row */}
                <HorizontalScroller ariaLabel="Quick quantity presets" showArrows={false} contentClassName="gap-1.5 pb-0.5">
                  {inputMode === 'grams'
                    ? STANDARD_GRAM_PRESETS.map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => {
                            setQuantityGrams(String(g));
                            setSelectedUnitLabel(`${g} g`);
                          }}
                          className={`min-h-[36px] px-3 rounded-lg text-xs font-medium font-mono-nums border whitespace-nowrap shrink-0 transition-colors ${
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
                          className={`min-h-[36px] px-3 rounded-lg text-xs font-medium font-mono-nums border whitespace-nowrap shrink-0 transition-colors ${
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
                          className={`min-h-[36px] px-3 rounded-lg text-xs font-medium font-mono-nums border whitespace-nowrap shrink-0 transition-colors ${
                            Number(servingsCount) === srv
                              ? 'bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 border-slate-900 dark:border-lime-500'
                              : 'border-black/10 dark:border-white/15 text-slate-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {srv}×
                        </button>
                      ))}
                </HorizontalScroller>
              </div>

              {/* Live calculated nutrition — Compact & Immediately Visible */}
              <div className="rounded-2xl bg-stone-50 dark:bg-[#090A0C]/90 border border-black/10 dark:border-white/12 p-3 sm:p-3.5 space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Nutrition ({Math.round(effectiveGrams * 10) / 10} g)
                  </span>
                  <span className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 font-mono-nums">
                    {liveMacros.calories} kcal
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5 sm:gap-2 text-center">
                  <div className="py-1.5 px-1 rounded-xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12">
                    <div className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400">Protein</div>
                    <div className="text-xs sm:text-sm font-semibold text-lime-700 dark:text-lime-400 font-mono-nums mt-0.5">
                      {liveMacros.protein}g
                    </div>
                  </div>
                  <div className="py-1.5 px-1 rounded-xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12">
                    <div className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400">Carbs</div>
                    <div className="text-xs sm:text-sm font-semibold text-amber-700 dark:text-amber-400 font-mono-nums mt-0.5">
                      {liveMacros.carbs}g
                    </div>
                  </div>
                  <div className="py-1.5 px-1 rounded-xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12">
                    <div className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400">Fat</div>
                    <div className="text-xs sm:text-sm font-semibold text-indigo-700 dark:text-indigo-400 font-mono-nums mt-0.5">
                      {liveMacros.fat}g
                    </div>
                  </div>
                  <div className="py-1.5 px-1 rounded-xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12">
                    <div className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400">Fibre</div>
                    <div className="text-xs sm:text-sm font-semibold text-teal-700 dark:text-teal-400 font-mono-nums mt-0.5">
                      {liveMacros.fibre}g
                    </div>
                  </div>
                </div>
                {(liveMacros.solubleFibreG !== null || liveMacros.insolubleFibreG !== null) && (
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2 font-mono-nums">
                    {liveMacros.solubleFibreG !== null && (
                      <span>Soluble: {liveMacros.solubleFibreG}g</span>
                    )}
                    {liveMacros.insolubleFibreG !== null && (
                      <span>Insoluble: {liveMacros.insolubleFibreG}g</span>
                    )}
                  </div>
                )}
              </div>

              {/* Meal Category & Log Date */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Meal Category
                </label>
                <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                  {MEAL_CATEGORIES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMealType(m.id)}
                      className={`min-h-[40px] px-2 rounded-xl text-xs font-medium border transition-colors text-center whitespace-nowrap truncate ${
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
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Log Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
                />
              </div>
            </div>

            {/* Sticky Thumb-Zone Bottom CTA Bar */}
            <div className="px-4 sm:px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-black/10 dark:border-white/12 bg-white/95 dark:bg-[#111317]/95 backdrop-blur-md shrink-0 flex items-center gap-2.5">
              {!editing && (
                <button
                  type="button"
                  onClick={handleAddCurrentToTray}
                  className="min-h-[48px] px-3.5 sm:px-4 rounded-xl border border-black/15 dark:border-white/20 text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-semibold hover:border-[#C8FF00] transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <ShoppingBag className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00]" />
                  <span className="sm:hidden">Tray</span>
                  <span className="hidden sm:inline">Add to Tray</span>
                </button>
              )}
              <button
                type="submit"
                className="flex-1 min-h-[48px] rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-sm font-semibold hover:opacity-90 active:scale-[0.99] transition-all inline-flex items-center justify-center gap-2 whitespace-nowrap"
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
