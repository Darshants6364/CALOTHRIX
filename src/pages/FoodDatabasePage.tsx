import React, { useEffect, useMemo, useState } from 'react';
import {
  Barcode,
  BookmarkPlus,
  Camera,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Globe,
  Mic,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CustomFoodModal } from '../components/CustomFoodModal';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import {
  lookupBarcodeApi,
  searchGlobalFoodsApi,
  semanticFoodSearchApi,
} from '../services/globalFoodApiService';
import { FoodItem } from '../types';
import { formatNutrientValue, searchFoods } from '../utils/nutritionUtils';
import { getPortionsForFood } from '../utils/portionEngine';

type DietaryFilterOption = 'all' | 'vegetarian' | 'vegan' | 'eggetarian' | 'non_veg';

const DIETARY_FILTER_STORAGE_KEY = 'calothrix_db_dietary_filter';

const CATEGORY_FILTERS: string[] = ['All', 'Favorites', 'Recent'];

const SEMANTIC_EXAMPLES = [
  'High protein Indian breakfast',
  'Low calorie dinner',
  'Foods rich in fibre',
  'Vegetarian protein sources',
];

const NON_VEG_MEAT_FISH_REGEX =
  /\b(chicken|mutton|lamb|goat|beef|pork|fish|salmon|tuna|prawn|prawns|shrimp|crab|seafood|rohu|katla|surmai|hilsa|pomfret|bacon|turkey|duck|ham|sausage|pepperoni|meat|steak|keema|biryani.*chicken|chicken.*biryani)\b/i;
const EGG_REGEX = /\b(egg|eggs|omelette|omlet|bhurji|egg white|egg yolk)\b/i;
const DAIRY_HONEY_REGEX =
  /\b(milk|paneer|cheese|butter|ghee|curd|yogurt|yoghurt|dahi|whey|casein|cream|lassi|kulfi|ice cream|honey|khoya|mawa)\b/i;

function matchesDietaryFilter(food: FoodItem, filter: DietaryFilterOption): boolean {
  if (filter === 'all') return true;

  const tags = food.dietaryTags || [];
  const text = `${food.name} ${food.brand || ''} ${food.ingredientsText || ''}`.toLowerCase();
  const isMeatCategory =
    food.category === 'Meat and poultry' || food.category === 'Fish and seafood';

  if (filter === 'vegetarian') {
    if (tags.length > 0) return tags.includes('vegetarian');
    return !isMeatCategory && !NON_VEG_MEAT_FISH_REGEX.test(text) && !EGG_REGEX.test(text);
  }

  if (filter === 'vegan') {
    if (tags.length > 0) return tags.includes('vegan');
    return (
      !isMeatCategory &&
      food.category !== 'Dairy' &&
      !NON_VEG_MEAT_FISH_REGEX.test(text) &&
      !EGG_REGEX.test(text) &&
      !DAIRY_HONEY_REGEX.test(text)
    );
  }

  if (filter === 'eggetarian') {
    if (tags.length > 0) return tags.includes('eggetarian') || tags.includes('vegetarian');
    return !isMeatCategory && !NON_VEG_MEAT_FISH_REGEX.test(text);
  }

  // 'non_veg'
  if (tags.length > 0) {
    return !tags.includes('vegetarian');
  }
  return isMeatCategory || NON_VEG_MEAT_FISH_REGEX.test(text) || EGG_REGEX.test(text);
}

function getSourceTypeDisplay(food: FoodItem): string {
  if (food.isCustom && (food.sourceName || '').includes('Recipe Engine')) return 'Calculated Recipe';
  if (food.isCustom || food.sourceType === 'personal_custom') return 'Personal Custom';
  if (food.sourceType === 'branded') return 'Branded Product';
  if (food.sourceType === 'community') return 'Community Food';
  return 'Verified Reference';
}

function getVerificationPill(status?: FoodItem['verificationStatus']): {
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

export const FoodDatabasePage: React.FC = () => {
  const {
    state,
    allFoods,
    selectedDate,
    openAddFoodModal,
    openBarcodeScannerModal,
    openMealScannerModal,
    addCustomFood,
    saveExternalFoodToMyFoods,
    updateCustomFood,
    deleteCustomFood,
    toggleFavoriteFood,
  } = useMacroLogStore();

  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [dietaryFilter, setDietaryFilter] = useState<DietaryFilterOption>(() => {
    try {
      const saved = localStorage.getItem(DIETARY_FILTER_STORAGE_KEY);
      if (
        saved === 'all' ||
        saved === 'vegetarian' ||
        saved === 'vegan' ||
        saved === 'eggetarian' ||
        saved === 'non_veg'
      ) {
        return saved;
      }
    } catch {
      // Ignore storage read issues
    }
    const pref = state.profile.dietaryPreference;
    return pref === 'omnivore' ? 'all' : pref;
  });
  const [semanticMode, setSemanticMode] = useState(false);

  const [remoteFoods, setRemoteFoods] = useState<FoodItem[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteNote, setRemoteNote] = useState<string>('');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [editingFood, setEditingFood] = useState<FoodItem | undefined>(undefined);
  const [pendingDeleteFood, setPendingDeleteFood] = useState<FoodItem | null>(null);

  const handleDietaryFilterChange = (next: DietaryFilterOption) => {
    setDietaryFilter(next);
    try {
      localStorage.setItem(DIETARY_FILTER_STORAGE_KEY, next);
    } catch {
      // Ignore storage write issues
    }
  };

  // Trigger backend global search or semantic search when query changes
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setRemoteFoods([]);
      setRemoteNote('');
      setRemoteLoading(false);
      return;
    }

    if (selectedCategory === 'Favorites' || selectedCategory === 'Recent') {
      setRemoteFoods([]);
      setRemoteLoading(false);
      return;
    }

    let cancelled = false;
    setRemoteLoading(true);

    const timer = setTimeout(async () => {
      try {
        if (semanticMode) {
          const res = await semanticFoodSearchApi(trimmed);
          if (!cancelled) {
            setRemoteFoods(res.items);
            setRemoteNote('Smart AI matches');
          }
          return;
        }

        if (/^\d{8,14}$/.test(trimmed)) {
          const bc = await lookupBarcodeApi(trimmed);
          if (!cancelled) {
            setRemoteFoods(bc.item ? [bc.item] : []);
            setRemoteNote(bc.item ? `Barcode match (${trimmed})` : bc.error || '');
          }
          return;
        }

        if (trimmed.length < 2) {
          if (!cancelled) {
            setRemoteFoods([]);
            setRemoteNote('');
          }
          return;
        }

        const res = await searchGlobalFoodsApi({
          query: trimmed,
        });

        if (!cancelled) {
          setRemoteFoods(res.items);
          setRemoteNote('');
        }
      } catch {
        if (!cancelled) {
          setRemoteFoods([]);
          setRemoteNote('');
        }
      } finally {
        if (!cancelled) setRemoteLoading(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, selectedCategory, semanticMode]);

  const filteredLocalFoods = useMemo(
    () =>
      searchFoods(
        allFoods,
        semanticMode ? '' : query,
        selectedCategory,
        state.favoriteFoodIds,
        state.recentFoodIds
      ),
    [allFoods, query, selectedCategory, semanticMode, state.favoriteFoodIds, state.recentFoodIds]
  );

  const displayedFoods = useMemo(() => {
    let base: FoodItem[];
    if (semanticMode && query.trim()) {
      const seen = new Set(remoteFoods.map((f) => f.id));
      const localMatches = searchFoods(
        allFoods,
        query,
        selectedCategory,
        state.favoriteFoodIds,
        state.recentFoodIds
      ).filter((f) => !seen.has(f.id));
      base = [...remoteFoods, ...localMatches];
    } else if (
      query.trim() &&
      selectedCategory !== 'Favorites' &&
      selectedCategory !== 'Recent'
    ) {
      const seen = new Set(filteredLocalFoods.map((f) => f.id));
      base = [...filteredLocalFoods, ...remoteFoods.filter((r) => !seen.has(r.id))];
    } else {
      base = filteredLocalFoods;
    }

    return base.filter((food) => matchesDietaryFilter(food, dietaryFilter));
  }, [
    allFoods,
    dietaryFilter,
    filteredLocalFoods,
    query,
    remoteFoods,
    selectedCategory,
    semanticMode,
    state.favoriteFoodIds,
    state.recentFoodIds,
  ]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {allFoods.length} curated items · {state.customFoods.length} private custom foods · Live global search
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Global Food Database
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => openBarcodeScannerModal({ date: selectedDate })}
            className="min-h-[44px] px-3.5 py-2.5 rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-semibold hover:border-[#C8FF00] transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
          >
            <Barcode className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00]" />
            <span>Scan Barcode</span>
          </button>

          <button
            type="button"
            onClick={() => openMealScannerModal({ mode: 'photo', date: selectedDate })}
            className="min-h-[44px] px-3.5 py-2.5 rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-semibold hover:border-[#C8FF00] transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
          >
            <Camera className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00]" />
            <Mic className="w-3.5 h-3.5 text-[#4E6800] dark:text-[#C8FF00] -ml-1" />
            <span>Photo / Voice AI</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingFood(undefined);
              setCustomModalOpen(true);
            }}
            className="min-h-[44px] px-4 sm:px-5 py-2.5 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-xs sm:text-sm font-bold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Create Custom Food
          </button>
        </div>
      </section>

      {/* Search Bar + Smart Semantic Toggle + Filters */}
      <section className="space-y-3">
        <div className="sticky top-[calc(52px+env(safe-area-inset-top))] lg:static z-20 bg-[#F4F3EF]/95 dark:bg-[#090A0C]/95 backdrop-blur-md py-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:py-0 sm:bg-transparent flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            {semanticMode ? (
              <Sparkles className="w-4 h-4 text-lime-600 dark:text-lime-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            ) : (
              <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            )}
            <input
              type="search"
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                semanticMode
                  ? 'Describe what you want (e.g., High protein Indian breakfast, rich in fibre)...'
                  : 'Search food name, brand, country, ingredient, or barcode...'
              }
              className="w-full h-12 pl-11 pr-4 rounded-2xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#111317] text-base sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
            />
          </div>

          <button
            type="button"
            onClick={() => setSemanticMode((v) => !v)}
            className={`min-h-[48px] px-4 rounded-2xl border text-xs font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-colors ${
              semanticMode
                ? 'bg-lime-500 text-slate-950 border-lime-500'
                : 'bg-white dark:bg-[#111317] border-black/10 dark:border-white/12 text-slate-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-slate-800'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            Smart AI Search
          </button>
        </div>

        {/* Semantic quick prompts when Smart AI Search is enabled */}
        {semanticMode && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mr-1">Try:</span>
            {SEMANTIC_EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setQuery(example)}
                className="px-2.5 py-1 rounded-lg border border-black/10 dark:border-white/12 bg-white dark:bg-[#111317] text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:border-lime-500"
              >
                {example}
              </button>
            ))}
          </div>
        )}

        {/* Single Dietary Preference Filter */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <label
              htmlFor="dietary-preference-filter"
              className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap"
            >
              Dietary Preference:
            </label>
            <select
              id="dietary-preference-filter"
              value={dietaryFilter}
              onChange={(e) => handleDietaryFilterChange(e.target.value as DietaryFilterOption)}
              aria-label="Filter by dietary preference"
              className="h-9 px-3 rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#111317] text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
            >
              <option value="all">All Foods</option>
              <option value="vegetarian">Vegetarian</option>
              <option value="vegan">Vegan</option>
              <option value="eggetarian">Eggetarian</option>
              <option value="non_veg">Non-Vegetarian</option>
            </select>
          </div>

          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
            {remoteLoading ? (
              <span className="inline-flex items-center gap-1 text-[#4E6800] dark:text-[#C8FF00]">
                <Globe className="w-3.5 h-3.5 animate-pulse" />
                Searching...
              </span>
            ) : remoteNote ? (
              <span>{remoteNote}</span>
            ) : (
              <span>{displayedFoods.length} items</span>
            )}
          </div>
        </div>

        {/* Category Tabs (All, Favorites, Recent) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {CATEGORY_FILTERS.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`min-h-[36px] px-3.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 border transition-colors ${
                  active
                    ? 'bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black border-[#111317] dark:border-[#C8FF00] font-semibold'
                    : 'bg-white dark:bg-[#111317] border-black/10 dark:border-white/12 text-slate-600 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-800'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </section>

      {/* Food List */}
      {displayedFoods.length === 0 && !remoteLoading ? (
        <section className="bg-white dark:bg-[#111317] border border-dashed border-stone-300 dark:border-white/15 rounded-2xl p-8 text-center">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            No foods match this filter
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Try switching your dietary preference, searching another keyword, or creating a custom food.
          </p>
          <button
            type="button"
            onClick={() => {
              setEditingFood(undefined);
              setCustomModalOpen(true);
            }}
            className="mt-4 min-h-[42px] px-4 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Add Custom Food
          </button>
        </section>
      ) : (
        <section className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl divide-y divide-stone-100 dark:divide-slate-800/80 overflow-hidden">
          {displayedFoods.map((food) => {
            const isFav = state.favoriteFoodIds.includes(food.id);
            const isExpanded = Boolean(expandedIds[food.id]);
            const sourceLabel = getSourceTypeDisplay(food);
            const badge = getVerificationPill(food.verificationStatus);
            const isExternalApiResult =
              !food.isCustom && (food.id.startsWith('off-') || food.id.startsWith('usda-'));
            const portions = isExpanded ? getPortionsForFood(food) : [];
            const hasDetails =
              Boolean(food.ingredientsText) ||
              Boolean(food.barcode) ||
              Boolean(food.micronutrients && Object.keys(food.micronutrients).length > 0) ||
              Boolean(food.license) ||
              Boolean(food.foodCode || food.sourceId) ||
              food.solubleFibreG != null ||
              food.insolubleFibreG != null ||
              food.waterG != null ||
              (food.aliases && food.aliases.length > 0);

            return (
              <div
                key={food.id}
                className="px-4 sm:px-5 py-4 hover:bg-stone-50/70 dark:hover:bg-slate-800/30 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0 flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggleFavoriteFood(food.id)}
                      aria-label={isFav ? `Unfavorite ${food.name}` : `Favorite ${food.name}`}
                      className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-slate-400 hover:bg-stone-100 dark:hover:bg-slate-800 shrink-0"
                    >
                      <Star
                        className={`w-4 h-4 ${isFav ? 'text-amber-500 fill-amber-500' : ''}`}
                      />
                    </button>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {food.name}
                        </h3>
                        {food.foodState && (
                          <span className="px-1.5 py-0.5 rounded bg-stone-100 dark:bg-white/10 text-[10px] font-medium capitalize text-slate-600 dark:text-slate-300">
                            {food.foodState}
                          </span>
                        )}
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${badge.cls}`}>
                          {badge.label}
                        </span>
                        {food.brand && (
                          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                            {food.brand}
                          </span>
                        )}
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {food.category}
                        </span>
                      </div>

                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
                        <span>Serving: {food.servingName}</span>
                        <span aria-hidden="true">·</span>
                        <span>P {formatNutrientValue(food, 'protein', 'g')}</span>
                        <span aria-hidden="true">·</span>
                        <span>C {formatNutrientValue(food, 'carbs', 'g')}</span>
                        <span aria-hidden="true">·</span>
                        <span>F {formatNutrientValue(food, 'fat', 'g')}</span>
                        <span aria-hidden="true">·</span>
                        <span>Fibre {formatNutrientValue(food, 'fibre', 'g')}</span>
                      </div>

                      <div className="mt-1 text-[11px] text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span
                          className={
                            food.isCustom
                              ? 'text-amber-600 dark:text-amber-400 font-medium'
                              : food.sourceType === 'verified_reference'
                              ? 'text-lime-700 dark:text-lime-400 font-medium'
                              : ''
                          }
                        >
                          {sourceLabel}
                        </span>
                        {food.sourceName && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{food.sourceName}</span>
                          </>
                        )}
                        {(food.foodCode || food.sourceId) && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono-nums">{food.foodCode || food.sourceId}</span>
                          </>
                        )}
                        {food.country && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{food.country}</span>
                          </>
                        )}
                        {hasDetails && (
                          <>
                            <span aria-hidden="true">·</span>
                            <button
                              type="button"
                              onClick={() => toggleExpand(food.id)}
                              className="text-lime-700 dark:text-lime-400 hover:underline inline-flex items-center gap-0.5 font-medium"
                            >
                              {isExpanded ? 'Hide details' : 'Provenance & nutrients'}
                              {isExpanded ? (
                                <ChevronUp className="w-3 h-3" />
                              ) : (
                                <ChevronDown className="w-3 h-3" />
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2 pl-11 sm:pl-0 shrink-0">
                    <div className="text-right mr-2">
                      <span className="text-sm font-bold font-mono-nums text-slate-900 dark:text-slate-100">
                        {formatNutrientValue(food, 'calories')}
                      </span>{' '}
                      {!food.missingFields?.includes('calories') && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">kcal</span>
                      )}
                    </div>

                    {isExternalApiResult && (
                      <button
                        type="button"
                        onClick={() => saveExternalFoodToMyFoods(food)}
                        title="Save verified external food to My Foods"
                        className="min-h-[38px] px-2.5 rounded-xl border border-black/10 dark:border-white/15 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-lime-500 inline-flex items-center gap-1 whitespace-nowrap"
                      >
                        <BookmarkPlus className="w-3.5 h-3.5 text-lime-600 dark:text-lime-400" />
                        Save
                      </button>
                    )}

                    {food.isCustom && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingFood(food);
                            setCustomModalOpen(true);
                          }}
                          aria-label={`Edit ${food.name}`}
                          className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-stone-100 dark:hover:bg-slate-800"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDeleteFood(food)}
                          aria-label={`Delete ${food.name}`}
                          className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => openAddFoodModal({ food, date: selectedDate })}
                      className="min-h-[38px] px-3.5 rounded-xl bg-lime-100 dark:bg-lime-950/70 text-lime-800 dark:text-lime-300 text-xs font-semibold hover:bg-lime-200/80 dark:hover:bg-lime-900/70 transition-colors inline-flex items-center gap-1 whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Quick Add
                    </button>
                  </div>
                </div>

                {/* Expanded provenance, ingredients, IFCT proximate composition & micronutrients */}
                {isExpanded && (
                  <div className="mt-3 ml-0 sm:ml-12 p-3.5 rounded-xl bg-stone-50 dark:bg-[#090A0C]/80 border border-black/10 dark:border-white/12 text-xs space-y-2">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-600 dark:text-slate-300 font-mono-nums">
                      {food.energyKj != null && <span>Energy: {food.energyKj} kJ</span>}
                      {food.atwaterCalories != null && (
                        <span>Atwater check: {food.atwaterCalories} kcal/100g</span>
                      )}
                      {food.waterG != null && <span>Moisture/Water: {food.waterG}g</span>}
                      {food.ashG != null && <span>Ash: {food.ashG}g</span>}
                      {food.solubleFibreG != null && (
                        <span>Soluble Fibre: {food.solubleFibreG}g</span>
                      )}
                      {food.insolubleFibreG != null && (
                        <span>Insoluble Fibre: {food.insolubleFibreG}g</span>
                      )}
                      {food.liquidDensityGPerMl != null && (
                        <span>Density: {food.liquidDensityGPerMl} g/ml</span>
                      )}
                    </div>

                    {food.barcode && (
                      <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-mono-nums">
                        <Barcode className="w-3.5 h-3.5 text-slate-400" />
                        Barcode: {food.barcode}
                      </div>
                    )}
                    {food.ingredientsText && (
                      <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          Ingredients:{' '}
                        </span>
                        {food.ingredientsText}
                      </p>
                    )}
                    {(food.aliases?.length || 0) > 0 && (
                      <p className="text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          Also known as:{' '}
                        </span>
                        {food.aliases!.join(', ')}
                      </p>
                    )}
                    {portions.length > 0 && (
                      <p className="text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          Standard portions:{' '}
                        </span>
                        {portions.map((p) => `${p.portionName} (${p.gramOrMlWeight}g)`).join(' · ')}
                      </p>
                    )}
                    {food.micronutrients && Object.keys(food.micronutrients).length > 0 && (
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-slate-600 dark:text-slate-300 tabular-nums">
                        {food.micronutrients.sugarG != null && (
                          <span>Sugar: {food.micronutrients.sugarG}g</span>
                        )}
                        {food.micronutrients.saturatedFatG != null && (
                          <span>Sat. Fat: {food.micronutrients.saturatedFatG}g</span>
                        )}
                        {food.micronutrients.sodiumMg != null && (
                          <span>Sodium: {food.micronutrients.sodiumMg}mg</span>
                        )}
                        {food.micronutrients.potassiumMg != null && (
                          <span>Potassium: {food.micronutrients.potassiumMg}mg</span>
                        )}
                        {food.micronutrients.calciumMg != null && (
                          <span>Calcium: {food.micronutrients.calciumMg}mg</span>
                        )}
                        {food.micronutrients.ironMg != null && (
                          <span>Iron: {food.micronutrients.ironMg}mg</span>
                        )}
                        {food.micronutrients.vitaminCMg != null && (
                          <span>Vitamin C: {food.micronutrients.vitaminCMg}mg</span>
                        )}
                      </div>
                    )}
                    {food.validationIssues &&
                      food.validationIssues.some((i) => i.severity !== 'info') && (
                        <div className="text-[11px] text-amber-700 dark:text-amber-300 space-y-0.5">
                          {food.validationIssues
                            .filter((i) => i.severity !== 'info')
                            .map((issue, idx) => (
                              <div key={idx}>Notice: {issue.message}</div>
                            ))}
                        </div>
                      )}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-black/10 dark:border-white/12">
                      <span>
                        License: {food.license || 'Verified Reference'}
                        {food.sourceId ? ` · ID ${food.sourceId}` : ''}
                        {food.measurementBasis ? ` · Basis ${food.measurementBasis}` : ''}
                      </span>
                      {food.sourceUrl && (
                        <a
                          href={food.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-lime-700 dark:text-lime-400 hover:underline inline-flex items-center gap-1"
                        >
                          View Source Record
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      <CustomFoodModal
        isOpen={customModalOpen}
        editingFood={editingFood}
        onClose={() => {
          setCustomModalOpen(false);
          setEditingFood(undefined);
        }}
        onSave={(data) => {
          if (editingFood) {
            updateCustomFood(editingFood.id, data);
          } else {
            addCustomFood(data);
          }
        }}
      />

      <ConfirmDialog
        isOpen={pendingDeleteFood !== null}
        title="Delete custom food?"
        description={
          pendingDeleteFood
            ? `Delete "${pendingDeleteFood.name}" from your custom foods? Existing historical food log entries will remain intact.`
            : ''
        }
        confirmLabel="Delete Food"
        onConfirm={() => {
          if (pendingDeleteFood) {
            deleteCustomFood(pendingDeleteFood.id);
            setPendingDeleteFood(null);
          }
        }}
        onCancel={() => setPendingDeleteFood(null)}
      />
    </div>
  );
};
