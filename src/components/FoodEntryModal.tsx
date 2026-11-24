import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Barcode,
  BookmarkCheck,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Globe,
  Heart,
  Mic,
  Minus,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Sparkles,
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
  FoodPortion,
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
const PRIMARY_MEALS = MEAL_CATEGORIES.filter((m) => m.id !== 'other');

type SheetFilterTab = 'all' | 'recent' | 'favorites' | 'custom' | 'meals';
type UnitInputMode = 'grams' | 'ml' | 'pieces' | 'servings';

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
    toggleFavoriteFood,
    savedMeals,
    logSavedMealCombo,
    deleteSavedMealCombo,
    saveMealCombo,
    notify,
  } = useMacroLogStore();

  const editing = foodModal.editingEntry;
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const modalContainerRef = useRef<HTMLDivElement | null>(null);
  const submittingRef = useRef(false);
  useModalFocusTrap(modalContainerRef, foodModal.isOpen, closeFoodModal);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<SheetFilterTab>('all');
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [showVariants, setShowVariants] = useState(false);
  const [inputMode, setInputMode] = useState<UnitInputMode>('grams');
  const [quantityGrams, setQuantityGrams] = useState<string>('100');
  const [volumeMl, setVolumeMl] = useState<string>('200');
  const [piecesCount, setPiecesCount] = useState<string>('1');
  const [selectedPiecePortionId, setSelectedPiecePortionId] = useState<string>('');
  const [servingsCount, setServingsCount] = useState<string>('1');
  const [selectedUnitLabel, setSelectedUnitLabel] = useState<string>('');
  const [lastUsedPortion, setLastUsedPortion] = useState<{ grams: number; unitLabel?: string } | null>(null);
  const [mealType, setMealType] = useState<MealCategory>(foodModal.initialMeal);
  const [date, setDate] = useState<string>(foodModal.targetDate);
  const [error, setError] = useState<string>('');

  // Multi-Add Meal Tray
  const [trayItems, setTrayItems] = useState<TrayItem[]>([]);
  const [trayExpanded, setTrayExpanded] = useState(false);
  const [trayMealName, setTrayMealName] = useState('');

  // Debounced live global search (Open Food Facts / USDA / IFCT)
  const [remoteFoods, setRemoteFoods] = useState<FoodItem[]>([]);
  const [remoteSearching, setRemoteSearching] = useState(false);
  const [remoteError, setRemoteError] = useState('');
  const [retryTrigger, setRetryTrigger] = useState(0);

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
    submittingRef.current = false;
    setError('');
    setCustomError('');
    setRemoteError('');
    setCreatingCustom(false);
    setSearchQuery('');
    setRemoteFoods([]);
    setTrayItems([]);
    setTrayExpanded(false);
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
        const portions = getPortionsForFood(matched);
        const defPiece = portions.find((p) => p.isDefault) || portions[0];
        if (defPiece) {
          setSelectedPiecePortionId(defPiece.id);
          setPiecesCount(
            String(Math.max(0.25, Math.round((editing.quantityGrams / defPiece.gramOrMlWeight) * 100) / 100))
          );
        }
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
        setPiecesCount('1');
        setSelectedPiecePortionId('');
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
      setServingsCount(
        String(Math.round((initGrams / Math.max(1, pre.servingWeightGrams || 100)) * 100) / 100)
      );
      if (defP) {
        setSelectedPiecePortionId(defP.id);
        setPiecesCount(
          String(Math.max(0.25, Math.round((initGrams / defP.gramOrMlWeight) * 100) / 100))
        );
      }
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
        setServingsCount(
          String(Math.round((initGrams / Math.max(1, matched.servingWeightGrams || 100)) * 100) / 100)
        );
        if (defP) {
          setSelectedPiecePortionId(defP.id);
          setPiecesCount(
            String(Math.max(0.25, Math.round((initGrams / defP.gramOrMlWeight) * 100) / 100))
          );
        }
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
      setPiecesCount('1');
      setSelectedPiecePortionId('');
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

  const localFoodIdSet = useMemo(() => new Set(allFoods.map((f) => f.id)), [allFoods]);
  const favoriteSet = useMemo(() => new Set(state.favoriteFoodIds), [state.favoriteFoodIds]);
  const recentSet = useMemo(() => new Set(state.recentFoodIds), [state.recentFoodIds]);

  // Trigger debounced global search when query >= 2 chars on 'all' tab
  useEffect(() => {
    if (!foodModal.isOpen || selectedFood || creatingCustom) return;
    const q = searchQuery.trim();
    if (q.length < 2 || filterTab !== 'all') {
      setRemoteFoods([]);
      setRemoteSearching(false);
      setRemoteError('');
      return;
    }

    let cancelled = false;
    setRemoteSearching(true);
    setRemoteError('');
    const timer = setTimeout(async () => {
      try {
        if (/^\d{8,14}$/.test(q)) {
          const bcRes = await lookupBarcodeApi(q);
          if (!cancelled) {
            if (bcRes.item && isFoodNutritionallyUsable(bcRes.item)) {
              setRemoteFoods([bcRes.item]);
              setRemoteSearching(false);
              return;
            }
          }
        }
        const res = await searchGlobalFoodsApi({
          query: q,
          limit: 40,
        });
        if (!cancelled) {
          setRemoteFoods(
            res.items.filter(
              (item) => isFoodNutritionallyUsable(item) && !localFoodIdSet.has(item.id)
            )
          );
          setRemoteError('');
        }
      } catch {
        if (!cancelled) {
          setRemoteFoods([]);
          setRemoteError('Live global search unavailable right now. Showing offline database matches.');
        }
      } finally {
        if (!cancelled) setRemoteSearching(false);
      }
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [creatingCustom, filterTab, foodModal.isOpen, localFoodIdSet, retryTrigger, searchQuery, selectedFood]);

  const filteredLocalFoods = useMemo(() => {
    const activeFoods = allFoods.filter((f) => isFoodNutritionallyUsable(f));
    const preFiltered =
      filterTab === 'all'
        ? activeFoods
        : activeFoods.filter((f) => {
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
    if (filterTab !== 'all') return filteredLocalFoods;
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

  const piecePortions = useMemo(
    () => foodPortions.filter((p) => p.unitType !== 'ml'),
    [foodPortions]
  );

  const activePiecePortion: FoodPortion | null = useMemo(() => {
    if (piecePortions.length === 0) return null;
    return (
      piecePortions.find((p) => p.id === selectedPiecePortionId) ||
      piecePortions.find((p) => p.isDefault) ||
      piecePortions[0]
    );
  }, [piecePortions, selectedPiecePortionId]);

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
    if (inputMode === 'pieces' && activePiecePortion) {
      const parsedPieces = parseFloat(piecesCount);
      return Number.isFinite(parsedPieces) ? parsedPieces * activePiecePortion.gramOrMlWeight : 0;
    }
    const parsedServings = parseFloat(servingsCount);
    return Number.isFinite(parsedServings)
      ? parsedServings * (selectedFood.servingWeightGrams || 100)
      : 0;
  }, [activePiecePortion, inputMode, piecesCount, quantityGrams, selectedFood, servingsCount, volumeMl]);

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
    return { grams, label, remembered, defaultP };
  };

  const handleSelectFood = (food: FoodItem) => {
    const { grams, label, remembered, defaultP } = resolveDefaultForFood(food);
    setSelectedFood(food);
    setShowVariants(false);
    setLastUsedPortion(remembered);
    setQuantityGrams(String(grams));
    setSelectedUnitLabel(label);
    setServingsCount(String(Math.round((grams / Math.max(1, food.servingWeightGrams || 100)) * 100) / 100));
    if (defaultP && defaultP.unitType !== 'ml') {
      setSelectedPiecePortionId(defaultP.id);
      setPiecesCount(String(Math.max(0.25, Math.round((grams / defaultP.gramOrMlWeight) * 100) / 100)));
    } else {
      setSelectedPiecePortionId('');
      setPiecesCount('1');
    }
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

  const buildComputedUnitLabel = (roundedGrams: number): string => {
    if (!selectedFood) return `${roundedGrams} g`;
    if (inputMode === 'ml') {
      return `${parseFloat(volumeMl) || 0} ml (${roundedGrams} g)`;
    }
    if (inputMode === 'pieces' && activePiecePortion) {
      const count = parseFloat(piecesCount) || 1;
      const cleanName = activePiecePortion.portionName.replace(/^1\s+/i, '');
      return `${count} × ${cleanName}`;
    }
    if (inputMode === 'servings') {
      return `${parseFloat(servingsCount) || 1} × ${selectedFood.servingName}`;
    }
    return selectedUnitLabel || `${roundedGrams} g`;
  };

  const stepCurrentQuantity = (direction: -1 | 1) => {
    setError('');
    if (inputMode === 'grams') {
      const current = parseFloat(quantityGrams) || 0;
      const step = current <= 25 && direction < 0 ? 5 : 10;
      const next = Math.max(1, Math.round((current + direction * step) * 10) / 10);
      setQuantityGrams(String(next));
      setSelectedUnitLabel(`${next} g`);
    } else if (inputMode === 'ml') {
      const current = parseFloat(volumeMl) || 0;
      const step = current <= 50 ? 15 : 25;
      const next = Math.max(5, Math.round((current + direction * step) * 10) / 10);
      setVolumeMl(String(next));
      setSelectedUnitLabel('');
    } else if (inputMode === 'pieces') {
      const current = parseFloat(piecesCount) || 1;
      const next = Math.max(0.5, Math.round((current + direction * 0.5) * 100) / 100);
      setPiecesCount(String(next));
      setSelectedUnitLabel('');
    } else {
      const current = parseFloat(servingsCount) || 1;
      const next = Math.max(0.25, Math.round((current + direction * 0.5) * 100) / 100);
      setServingsCount(String(next));
      setSelectedUnitLabel('');
    }
  };

  const handleAddCurrentToTray = () => {
    if (!selectedFood) return;
    if (!Number.isFinite(effectiveGrams) || effectiveGrams <= 0) {
      setError('Quantity must be greater than 0.');
      return;
    }
    if (effectiveGrams > 10000) {
      setError('Quantity seems too large (max 10,000 g per entry).');
      return;
    }
    const roundedGrams = Math.round(effectiveGrams * 10) / 10;
    const computedUnitLabel = buildComputedUnitLabel(roundedGrams);
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
    if (trayItems.length === 0 || submittingRef.current) return;
    submittingRef.current = true;
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
    if (submittingRef.current) return;
    submittingRef.current = true;
    logSavedMealCombo(combo, mealType, date);
    closeFoodModal();
  };

  const handleSaveEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
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

    submittingRef.current = true;
    const roundedGrams = Math.round(effectiveGrams * 10) / 10;
    const computedUnitLabel = buildComputedUnitLabel(roundedGrams);

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

  const visibleFilterTabs: { id: SheetFilterTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'recent', label: 'Recent' },
    { id: 'favorites', label: 'Favorites' },
    { id: 'custom', label: 'My Foods' },
    ...(savedMeals.length > 0 ? [{ id: 'meals' as const, label: `Meals (${savedMeals.length})` }] : []),
  ];

  const mealOptions =
    editing && editing.mealType === 'other' ? MEAL_CATEGORIES : PRIMARY_MEALS;

  const renderFoodSearchRow = (food: FoodItem) => {
    const isFav = favoriteSet.has(food.id);
    const badge = getQualityBadgeInfo(food);
    const remembered = getLastUsedPortion(food.id);
    return (
      <div
        key={food.id}
        className="w-full min-h-[60px] px-2.5 py-2 rounded-xl flex items-center justify-between gap-2 hover:bg-stone-50 dark:hover:bg-white/[0.04] transition-colors"
      >
        <button
          type="button"
          onClick={() => handleSelectFood(food)}
          className="flex-1 min-w-0 text-left py-0.5"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {food.name}
            </span>
            {food.brand && (
              <span className="text-xs text-slate-500 dark:text-slate-400 truncate shrink-0 max-w-[110px]">
                · {food.brand}
              </span>
            )}
            {isFav && (
              <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500 shrink-0" />
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
            <span className={`font-semibold shrink-0 ${badge.textCls}`}>{badge.label}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{getShortSourceName(food)}</span>
          </div>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right tabular-nums">
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono-nums">
              {formatNutrientValue(food, 'calories')}
            </div>
            <div className="text-[11px] text-slate-400">kcal</div>
          </div>
          {!editing && (
            <button
              type="button"
              onClick={(e) => handleQuickAddFood(e, food)}
              title="1-tap quick log default serving"
              aria-label={`Quick log ${food.name}`}
              className="min-h-[44px] min-w-[44px] rounded-xl border border-black/10 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-slate-800 dark:text-[#C8FF00] hover:bg-[#111317] hover:text-white dark:hover:bg-[#C8FF00] dark:hover:text-black hover:border-transparent flex items-center justify-center transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className="mobile-modal-backdrop fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editing ? 'Edit food entry' : 'Add food to log'}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeFoodModal();
      }}
    >
      <div
        ref={modalContainerRef}
        className="mobile-modal-sheet w-full max-h-[92dvh] sm:h-auto sm:max-w-xl sm:max-h-[90vh] flex flex-col bg-white dark:bg-[#111317] rounded-t-3xl sm:rounded-2xl border-t sm:border border-black/10 dark:border-white/12 shadow-2xl overflow-hidden overscroll-contain"
      >
        {/* Mobile Bottom-Sheet Drag Indicator */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0 bg-white dark:bg-[#111317]">
          <div className="w-10 h-1 rounded-full bg-black/15 dark:bg-white/20" aria-hidden="true" />
        </div>

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
                className="min-h-[44px] min-w-[44px] -ml-1.5 flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-white/10 shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            ) : null}
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
              {creatingCustom
                ? 'Create Custom Food'
                : editing
                ? 'Edit Food Entry'
                : selectedFood
                ? 'Adjust Serving & Log'
                : 'Add Food'}
            </h2>
          </div>

          <button
            type="button"
            onClick={closeFoodModal}
            aria-label="Close modal"
            className="min-h-[44px] min-w-[44px] -mr-1.5 flex items-center justify-center rounded-xl text-slate-500 hover:bg-stone-100 dark:hover:bg-white/10 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Compact Single-Line Remaining Budget Bar */}
        <div className="px-4 sm:px-5 py-1.5 bg-[#F4F3EF]/85 dark:bg-[#090A0C] border-b border-black/8 dark:border-white/10 flex items-center justify-between gap-2 text-[11px] font-mono-nums whitespace-nowrap overflow-x-auto no-scrollbar shrink-0">
          <span className="text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider shrink-0">
            <span className="sm:hidden">Left</span>
            <span className="hidden sm:inline">Remaining</span>
          </span>
          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 shrink-0">
            <span
              className={
                remainingToday.calLeft < 0
                  ? 'text-rose-500 font-bold'
                  : 'font-bold text-[#4E6800] dark:text-[#C8FF00]'
              }
            >
              {remainingToday.calLeft < 0
                ? `${Math.abs(remainingToday.calLeft)} kcal over`
                : `${remainingToday.calLeft} kcal`}
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
          <form onSubmit={handleSaveCustomFood} className="p-4 sm:p-5 overflow-y-auto space-y-4">
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
                className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
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
                  className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Category
                </label>
                <select
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value as FoodCategory)}
                  className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
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
                  className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
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
                  className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-sm font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
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
                  className="w-full h-11 px-3 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-sm font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
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
                  className="w-full h-11 px-3 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-sm font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
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
                  className="w-full h-11 px-3 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-sm font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
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
                  className="w-full h-11 px-3 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-sm font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
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
                  className="w-full h-11 px-3 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-sm font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
                />
              </div>
            </div>

            <div className="pt-2 pb-[env(safe-area-inset-bottom)] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setCreatingCustom(false)}
                className="min-h-[44px] px-4 rounded-xl border border-black/10 dark:border-white/15 text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-h-[44px] px-5 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-sm font-bold hover:opacity-90 transition-opacity"
              >
                Save &amp; Select
              </button>
            </div>
          </form>
        ) : !selectedFood ? (
          /* Step 1: Search, Quick Tools & Select Food */
          <div className="flex flex-col flex-1 min-h-0">
            <div className="sticky top-0 z-20 px-4 sm:px-5 pt-3 pb-2.5 space-y-2.5 border-b border-stone-100 dark:border-white/10 bg-white dark:bg-[#111317] shrink-0">
              {filterTab !== 'meals' && (
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="search"
                    enterKeyHint="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search food, Indian dish, brand, or barcode"
                    className="w-full h-11 pl-10 pr-10 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-base sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear search"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}

              {/* Filter Tabs: All | Recent | Favorites | My Foods | (Meals) */}
              <div className="flex items-center gap-1 p-1 bg-stone-100 dark:bg-[#090A0C] rounded-xl overflow-x-auto no-scrollbar">
                {visibleFilterTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilterTab(tab.id)}
                    className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                      filterTab === tab.id
                        ? 'bg-white dark:bg-[#1A1D24] text-slate-900 dark:text-[#C8FF00] shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Unified Quick Actions inside Add Food sheet: AI Logger, Voice, Barcode, Custom Food */}
              <HorizontalScroller ariaLabel="Quick log tools" showArrows={false} contentClassName="gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    closeFoodModal();
                    openMealScannerModal({ mode: 'photo', meal: mealType, date });
                  }}
                  className="min-h-[38px] px-3 rounded-xl border border-black/10 dark:border-white/15 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-[#4E6800] dark:hover:border-[#C8FF00] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#4E6800] dark:text-[#C8FF00]" />
                  <span>AI Logger</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    closeFoodModal();
                    openMealScannerModal({ mode: 'voice', meal: mealType, date });
                  }}
                  className="min-h-[38px] px-3 rounded-xl border border-black/10 dark:border-white/15 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-[#4E6800] dark:hover:border-[#C8FF00] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Mic className="w-3.5 h-3.5 text-[#4E6800] dark:text-[#C8FF00]" />
                  <span>Voice</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    closeFoodModal();
                    openBarcodeScannerModal({ meal: mealType, date });
                  }}
                  className="min-h-[38px] px-3 rounded-xl border border-black/10 dark:border-white/15 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-[#4E6800] dark:hover:border-[#C8FF00] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <Barcode className="w-3.5 h-3.5 text-[#4E6800] dark:text-[#C8FF00]" />
                  <span>Barcode</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCreatingCustom(true)}
                  className="min-h-[38px] px-3 rounded-xl text-xs font-semibold text-[#4E6800] dark:text-[#C8FF00] hover:bg-[#C8FF00]/10 inline-flex items-center gap-1 whitespace-nowrap shrink-0 ml-auto"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Custom Food</span>
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
                    {mealOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.shortLabel}
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
                      Add multiple foods to your Meal Tray or save any logged meal with 2+ items.
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
                          className="min-h-[40px] px-3.5 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-xs font-bold hover:opacity-90"
                        >
                          Log Meal
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSavedMealCombo(combo.id)}
                          aria-label={`Delete saved meal ${combo.name}`}
                          className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain divide-y divide-stone-100 dark:divide-white/8 px-2 py-1">
                {remoteSearching && (
                  <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 text-[#4E6800] dark:text-[#C8FF00]" />
                    <span>Searching global food databases...</span>
                  </div>
                )}

                {remoteError && (
                  <div className="mx-1 my-1.5 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-500/25 flex items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-300">
                    <span>{remoteError}</span>
                    <button
                      type="button"
                      onClick={() => setRetryTrigger((c) => c + 1)}
                      className="inline-flex items-center gap-1 font-semibold underline shrink-0"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Retry
                    </button>
                  </div>
                )}

                {combinedFoods.length === 0 && !remoteSearching ? (
                  <div className="py-12 px-6 text-center">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {filterTab === 'recent'
                        ? 'No recently logged foods yet'
                        : filterTab === 'favorites'
                        ? 'No favorite foods yet'
                        : filterTab === 'custom'
                        ? 'No custom foods created yet'
                        : 'No matching foods found'}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {filterTab === 'favorites'
                        ? 'Tap the heart icon on any food to pin it here for quick logging.'
                        : 'Try another search term or create a custom food item.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomName(searchQuery);
                        setCreatingCustom(true);
                      }}
                      className="mt-4 min-h-[42px] px-4 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-xs font-bold inline-flex items-center gap-1.5"
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
                          {group.items.map(renderFoodSearchRow)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  combinedFoods.map(renderFoodSearchRow)
                )}
              </div>
            )}

            {/* Sticky Multi-Add Meal Tray Footer */}
            {trayItems.length > 0 && (
              <div className="px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-black/10 dark:border-white/12 bg-stone-50 dark:bg-[#090A0C] space-y-2.5 shrink-0">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setTrayExpanded((v) => !v)}
                    className="font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-1.5"
                  >
                    <ShoppingBag className="w-3.5 h-3.5 text-[#4E6800] dark:text-[#C8FF00]" />
                    <span>
                      Meal Tray ({trayItems.length} · {trayMacros.calories} kcal · {trayMacros.protein}g P)
                    </span>
                    {trayExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    ) : (
                      <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrayItems([])}
                    className="text-xs text-slate-500 hover:text-rose-500 font-medium"
                  >
                    Clear
                  </button>
                </div>

                {trayExpanded && (
                  <div className="max-h-32 overflow-y-auto divide-y divide-black/6 dark:divide-white/8 rounded-xl border border-black/8 dark:border-white/10 bg-white dark:bg-[#111317] px-2.5">
                    {trayItems.map((item) => (
                      <div key={item.id} className="py-1.5 flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0 truncate">
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {item.food.name}
                          </span>{' '}
                          <span className="text-slate-500 dark:text-slate-400 font-mono-nums">
                            ({item.unitLabel} · {item.calories} kcal)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setTrayItems((prev) => prev.filter((t) => t.id !== item.id))
                          }
                          aria-label={`Remove ${item.food.name} from tray`}
                          className="p-1 text-slate-400 hover:text-rose-500 shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={trayMealName}
                    onChange={(e) => setTrayMealName(e.target.value)}
                    placeholder="Optional combo name (e.g., Post-Workout)"
                    className="flex-1 h-10 px-3 rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] text-xs text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={handleLogTray}
                    className="min-h-[40px] px-4 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-xs font-bold whitespace-nowrap hover:opacity-90"
                  >
                    Log {trayItems.length} {trayItems.length === 1 ? 'Item' : 'Items'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Step 2: Quantity, Units, Meal Category & Live Macro Preview */
          <form onSubmit={handleSaveEntry} className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-5 py-3.5 sm:py-4 space-y-3.5 sm:space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-xs font-medium">
                  {error}
                </div>
              )}

              {/* Compact 2-Line Food Summary Header + Favorite Toggle */}
              <div className="pb-3 border-b border-black/10 dark:border-white/12 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[15px] sm:text-base font-bold leading-snug text-slate-900 dark:text-slate-100 line-clamp-2 flex-1">
                    {selectedFood.name}
                    {selectedFood.brand ? ` (${selectedFood.brand})` : ''}
                  </h3>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleFavoriteFood(selectedFood.id)}
                      aria-label={
                        favoriteSet.has(selectedFood.id)
                          ? `Remove ${selectedFood.name} from favorites`
                          : `Save ${selectedFood.name} to favorites`
                      }
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-slate-400 hover:bg-stone-100 dark:hover:bg-white/10"
                    >
                      <Heart
                        className={`w-4 h-4 ${
                          favoriteSet.has(selectedFood.id)
                            ? 'text-rose-500 fill-rose-500'
                            : ''
                        }`}
                      />
                    </button>
                    {!editing && (
                      <button
                        type="button"
                        onClick={() => setSelectedFood(null)}
                        className="min-h-[36px] px-2 text-xs font-semibold text-[#4E6800] dark:text-[#C8FF00] hover:underline whitespace-nowrap"
                      >
                        Change
                      </button>
                    )}
                  </div>
                </div>

                <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 leading-tight">
                  <span className="font-mono-nums text-slate-700 dark:text-slate-300 font-medium">
                    {selectedFood.servingName} ({formatNutrientValue(selectedFood, 'calories', ' kcal')})
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className={`font-semibold ${getQualityBadgeInfo(selectedFood).textCls}`}>
                    {getQualityBadgeInfo(selectedFood).label}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{getShortSourceName(selectedFood)}</span>
                </div>

                {/* Collapsible Related Forms Switcher */}
                {familyVariants.length > 0 && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setShowVariants((v) => !v)}
                      className="w-full min-h-[34px] px-2.5 rounded-lg bg-stone-50 dark:bg-[#090A0C] border border-black/8 dark:border-white/10 flex items-center justify-between gap-2 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:border-[#4E6800] dark:hover:border-[#C8FF00]/60 transition-colors"
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
                            className="min-h-[38px] px-2.5 rounded-lg border border-black/10 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-xs text-slate-700 dark:text-slate-200 hover:border-[#C8FF00] whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
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

              {/* Quantity & Units (g, ml, pieces, servings) */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    Quantity &amp; Unit
                  </label>
                  <div className="flex items-center gap-0.5 p-0.5 bg-stone-100 dark:bg-[#090A0C] rounded-xl shrink-0">
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
                      className={`min-h-[32px] px-2.5 py-1 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
                        inputMode === 'grams'
                          ? 'bg-white dark:bg-[#1A1D24] text-slate-900 dark:text-[#C8FF00] shadow-xs'
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
                          setVolumeMl(
                            String(Math.round((effectiveGrams / density) * 10) / 10 || 200)
                          );
                        }}
                        className={`min-h-[32px] px-2.5 py-1 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
                          inputMode === 'ml'
                            ? 'bg-white dark:bg-[#1A1D24] text-slate-900 dark:text-[#C8FF00] shadow-xs'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        ml
                      </button>
                    )}
                    {piecePortions.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setInputMode('pieces');
                          const targetPortion = activePiecePortion || piecePortions[0];
                          setSelectedPiecePortionId(targetPortion.id);
                          const count = effectiveGrams / Math.max(1, targetPortion.gramOrMlWeight);
                          setPiecesCount(String(Math.max(0.5, Math.round(count * 100) / 100 || 1)));
                        }}
                        className={`min-h-[32px] px-2.5 py-1 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
                          inputMode === 'pieces'
                            ? 'bg-white dark:bg-[#1A1D24] text-slate-900 dark:text-[#C8FF00] shadow-xs'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        Pieces
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setInputMode('servings');
                        const s = effectiveGrams / Math.max(1, selectedFood.servingWeightGrams);
                        setServingsCount(String(Math.round(s * 100) / 100 || 1));
                      }}
                      className={`min-h-[32px] px-2.5 py-1 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
                        inputMode === 'servings'
                          ? 'bg-white dark:bg-[#1A1D24] text-slate-900 dark:text-[#C8FF00] shadow-xs'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      Servings
                    </button>
                  </div>
                </div>

                {/* Numeric Input with Fast - / + Stepper */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => stepCurrentQuantity(-1)}
                    aria-label="Decrease quantity"
                    className="min-h-[44px] min-w-[44px] rounded-xl border border-black/10 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-slate-700 dark:text-slate-200 hover:border-[#4E6800] dark:hover:border-[#C8FF00] flex items-center justify-center shrink-0"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
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
                        : inputMode === 'pieces'
                        ? piecesCount
                        : servingsCount
                    }
                    onChange={(e) => {
                      setError('');
                      if (inputMode === 'grams') {
                        setQuantityGrams(e.target.value);
                        setSelectedUnitLabel('');
                      } else if (inputMode === 'ml') {
                        setVolumeMl(e.target.value);
                        setSelectedUnitLabel('');
                      } else if (inputMode === 'pieces') {
                        setPiecesCount(e.target.value);
                        setSelectedUnitLabel('');
                      } else {
                        setServingsCount(e.target.value);
                        setSelectedUnitLabel('');
                      }
                    }}
                    className="flex-1 min-w-0 h-11 sm:h-12 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/70 dark:bg-[#090A0C] text-base font-bold font-mono-nums text-center text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
                  />
                  <button
                    type="button"
                    onClick={() => stepCurrentQuantity(1)}
                    aria-label="Increase quantity"
                    className="min-h-[44px] min-w-[44px] rounded-xl border border-black/10 dark:border-white/15 bg-stone-50 dark:bg-[#090A0C] text-slate-700 dark:text-slate-200 hover:border-[#4E6800] dark:hover:border-[#C8FF00] flex items-center justify-center shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  <span className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 min-w-[64px] text-right tabular-nums shrink-0">
                    {inputMode === 'grams'
                      ? formatFoodQuantity(effectiveGrams, state.settings.foodUnit)
                      : `${Math.round(effectiveGrams * 10) / 10} g`}
                  </span>
                </div>

                {inputMode === 'pieces' && piecePortions.length > 0 && (
                  <div className="space-y-1.5">
                    {piecePortions.length > 1 && (
                      <HorizontalScroller ariaLabel="Piece unit options" showArrows={false} contentClassName="gap-1.5 pb-0.5">
                        {piecePortions.map((portion) => {
                          const active = activePiecePortion?.id === portion.id;
                          return (
                            <button
                              key={portion.id}
                              type="button"
                              onClick={() => setSelectedPiecePortionId(portion.id)}
                              className={`min-h-[34px] px-2.5 rounded-lg text-xs font-medium border whitespace-nowrap shrink-0 transition-colors ${
                                active
                                  ? 'bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black border-transparent font-semibold'
                                  : 'border-black/10 dark:border-white/15 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {portion.portionName.replace(/^1\s+/i, '')} ({portion.gramOrMlWeight}g)
                            </button>
                          );
                        })}
                      </HorizontalScroller>
                    )}
                  </div>
                )}

                {inputMode === 'ml' && selectedFood.liquidDensityGPerMl && (
                  <p className="text-[11px] text-sky-700 dark:text-sky-300 font-mono-nums">
                    Density {selectedFood.liquidDensityGPerMl} g/ml → {Math.round(effectiveGrams * 10) / 10} g
                  </p>
                )}

                {/* Remembered + Household Portions in Grams Mode */}
                {(foodPortions.length > 0 || lastUsedPortion) && inputMode === 'grams' && (
                  <HorizontalScroller ariaLabel="Household portions" contentClassName="gap-1.5 pb-0.5">
                    {lastUsedPortion && (
                      <button
                        type="button"
                        onClick={() => {
                          setQuantityGrams(String(lastUsedPortion.grams));
                          setSelectedUnitLabel(
                            lastUsedPortion.unitLabel || `${lastUsedPortion.grams} g`
                          );
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
                              ? 'bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black border-transparent font-semibold'
                              : 'border-black/10 dark:border-white/15 text-slate-700 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-white/5'
                          }`}
                        >
                          {portion.portionName} ({portion.gramOrMlWeight}g)
                        </button>
                      );
                    })}
                  </HorizontalScroller>
                )}

                {/* Quick Quantity Presets */}
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
                              ? 'bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black border-transparent font-semibold'
                              : 'border-black/10 dark:border-white/15 text-slate-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-white/5'
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
                              ? 'bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black border-transparent font-semibold'
                              : 'border-black/10 dark:border-white/15 text-slate-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-white/5'
                          }`}
                        >
                          {ml} ml
                        </button>
                      ))
                    : inputMode === 'pieces'
                    ? [1, 2, 3, 4, 5].map((cnt) => (
                        <button
                          key={cnt}
                          type="button"
                          onClick={() => setPiecesCount(String(cnt))}
                          className={`min-h-[36px] px-3 rounded-lg text-xs font-medium font-mono-nums border whitespace-nowrap shrink-0 transition-colors ${
                            Number(piecesCount) === cnt
                              ? 'bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black border-transparent font-semibold'
                              : 'border-black/10 dark:border-white/15 text-slate-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-white/5'
                          }`}
                        >
                          {cnt}×
                        </button>
                      ))
                    : [0.5, 1, 1.5, 2, 3].map((srv) => (
                        <button
                          key={srv}
                          type="button"
                          onClick={() => setServingsCount(String(srv))}
                          className={`min-h-[36px] px-3 rounded-lg text-xs font-medium font-mono-nums border whitespace-nowrap shrink-0 transition-colors ${
                            Number(servingsCount) === srv
                              ? 'bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black border-transparent font-semibold'
                              : 'border-black/10 dark:border-white/15 text-slate-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-white/5'
                          }`}
                        >
                          {srv}×
                        </button>
                      ))}
                </HorizontalScroller>
              </div>

              {/* Live Calculated Nutrition */}
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
                    <div className="text-xs sm:text-sm font-semibold text-[#4E6800] dark:text-[#C8FF00] font-mono-nums mt-0.5">
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
              </div>

              {/* Meal Category Selector */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Meal
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
                  {mealOptions.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMealType(m.id)}
                      className={`min-h-[42px] px-2 rounded-xl text-xs font-semibold border transition-colors text-center whitespace-nowrap truncate ${
                        mealType === m.id
                          ? 'bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black border-transparent'
                          : 'border-black/10 dark:border-white/15 text-slate-700 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-white/5'
                      }`}
                    >
                      {m.shortLabel}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
                />
              </div>
            </div>

            {/* Sticky Thumb-Zone Bottom CTA Bar */}
            <div className="px-4 sm:px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-black/10 dark:border-white/12 bg-white/95 dark:bg-[#111317]/95 backdrop-blur-md shrink-0 flex items-center gap-2.5">
              {!editing && (
                <button
                  type="button"
                  onClick={handleAddCurrentToTray}
                  className="min-h-[48px] px-3.5 sm:px-4 rounded-xl border border-black/15 dark:border-white/20 text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-semibold hover:border-[#4E6800] dark:hover:border-[#C8FF00] transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
                >
                  <ShoppingBag className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00]" />
                  <span>Add to Tray</span>
                </button>
              )}
              <button
                type="submit"
                className="flex-1 min-h-[48px] rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-sm font-bold hover:opacity-90 active:scale-[0.99] transition-all inline-flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <Check className="w-4 h-4" />
                <span>{editing ? 'Save Changes' : 'Log Food'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
