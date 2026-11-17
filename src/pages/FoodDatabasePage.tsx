import React, { useEffect, useMemo, useState } from 'react';
import {
  Barcode,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Globe,
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
  ExternalSourceStatus,
  fetchExternalSourceStatus,
  lookupBarcodeApi,
  searchGlobalFoodsApi,
  semanticFoodSearchApi,
} from '../services/globalFoodApiService';
import {
  FoodItem,
  FoodSourceType,
  GLOBAL_FOOD_CATEGORIES,
} from '../types';
import { formatNutrientValue, searchFoods } from '../utils/nutritionUtils';

const CATEGORY_FILTERS: string[] = [
  'All',
  'Favorites',
  'Recent',
  'My Custom Foods',
  ...GLOBAL_FOOD_CATEGORIES,
];

const SEMANTIC_EXAMPLES = [
  'High protein Indian breakfast',
  'Low calorie dinner',
  'Foods rich in fibre',
  'Vegetarian protein sources',
];

function getSourceTypeDisplay(food: FoodItem): string {
  if (food.isCustom || food.sourceType === 'personal_custom') return 'Personal Custom';
  if (food.sourceType === 'branded') return 'Branded Product';
  if (food.sourceType === 'community') return 'Community Food';
  return 'Verified Reference';
}

export const FoodDatabasePage: React.FC = () => {
  const {
    state,
    allFoods,
    selectedDate,
    openAddFoodModal,
    openBarcodeScannerModal,
    addCustomFood,
    updateCustomFood,
    deleteCustomFood,
    toggleFavoriteFood,
  } = useMacroLogStore();

  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedCountry, setSelectedCountry] = useState('all');
  const [selectedSourceType, setSelectedSourceType] = useState<'all' | FoodSourceType>('all');
  const [semanticMode, setSemanticMode] = useState(false);

  const [remoteFoods, setRemoteFoods] = useState<FoodItem[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteNote, setRemoteNote] = useState<string>('');
  const [sourceStatus, setSourceStatus] = useState<ExternalSourceStatus | null>(null);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [editingFood, setEditingFood] = useState<FoodItem | undefined>(undefined);
  const [pendingDeleteFood, setPendingDeleteFood] = useState<FoodItem | null>(null);

  useEffect(() => {
    let mounted = true;
    void fetchExternalSourceStatus().then((status) => {
      if (mounted && status) setSourceStatus(status);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Trigger backend global search or semantic search when query changes
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setRemoteFoods([]);
      setRemoteNote('');
      setRemoteLoading(false);
      return;
    }

    if (
      selectedCategory === 'Favorites' ||
      selectedCategory === 'Recent' ||
      selectedCategory === 'My Custom Foods' ||
      selectedSourceType === 'personal_custom'
    ) {
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
            setRemoteNote(
              res.provider === 'supabase_ai'
                ? 'Semantic matches via Supabase AI (pgvector)'
                : 'Semantic attribute ranking across verified & global foods'
            );
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
          category: selectedCategory === 'All' ? undefined : selectedCategory,
          country: selectedCountry === 'all' ? undefined : selectedCountry,
          source: selectedSourceType === 'all' ? undefined : selectedSourceType,
        });

        if (!cancelled) {
          setRemoteFoods(res.items);
          if (res.sourceMeta) {
            const parts: string[] = [];
            if (res.sourceMeta.ifctCount > 0)
              parts.push(`${res.sourceMeta.ifctCount} IFCT/Ref`);
            if (res.sourceMeta.offCount > 0)
              parts.push(`${res.sourceMeta.offCount} Open Food Facts`);
            if (res.sourceMeta.usdaCount > 0)
              parts.push(`${res.sourceMeta.usdaCount} USDA FDC`);
            setRemoteNote(
              parts.length > 0 ? `Global sources: ${parts.join(' · ')}` : ''
            );
          } else {
            setRemoteNote('');
          }
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
  }, [query, selectedCategory, selectedCountry, selectedSourceType, semanticMode]);

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
      selectedCategory !== 'Recent' &&
      selectedCategory !== 'My Custom Foods'
    ) {
      const seen = new Set(filteredLocalFoods.map((f) => f.id));
      base = [...filteredLocalFoods, ...remoteFoods.filter((r) => !seen.has(r.id))];
    } else {
      base = filteredLocalFoods;
    }

    return base.filter((food) => {
      if (selectedCountry !== 'all') {
        const c = (food.country || '').toLowerCase();
        if (selectedCountry === 'India' && !c.includes('india')) return false;
        if (
          selectedCountry === 'United States' &&
          !c.includes('united states') &&
          !c.includes('usa') &&
          !c.includes('us')
        ) {
          return false;
        }
        if (selectedCountry === 'International' && c.includes('india')) return false;
      }

      if (selectedSourceType !== 'all') {
        const effectiveSource =
          food.isCustom ? 'personal_custom' : food.sourceType || 'verified_reference';
        if (effectiveSource !== selectedSourceType) return false;
      }

      if (
        selectedCategory !== 'All' &&
        selectedCategory !== 'Favorites' &&
        selectedCategory !== 'Recent' &&
        selectedCategory !== 'My Custom Foods'
      ) {
        // Keep remote semantic/search results only if matching selected category when category filter is active
        if (!semanticMode && food.category !== selectedCategory) {
          const localCatMatch = searchFoods([food], '', selectedCategory, [], []);
          if (localCatMatch.length === 0) return false;
        }
      }

      return true;
    });
  }, [
    allFoods,
    filteredLocalFoods,
    query,
    remoteFoods,
    selectedCategory,
    selectedCountry,
    selectedSourceType,
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
            className="min-h-[44px] px-4 py-2.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-[#121821] text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-semibold hover:border-lime-500 transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
          >
            <Barcode className="w-4 h-4 text-lime-600 dark:text-lime-400" />
            <span>Scan Barcode</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingFood(undefined);
              setCustomModalOpen(true);
            }}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-sm font-semibold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Create Custom Food
          </button>
        </div>
      </section>

      {/* Search Bar + Smart Semantic Toggle + Filters */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            {semanticMode ? (
              <Sparkles className="w-4 h-4 text-lime-600 dark:text-lime-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            ) : (
              <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            )}
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                semanticMode
                  ? 'Describe what you want (e.g., High protein Indian breakfast, rich in fibre)...'
                  : 'Search food name, brand, country, ingredient, or barcode...'
              }
              className="w-full h-12 pl-11 pr-4 rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-[#121821] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
            />
          </div>

          <button
            type="button"
            onClick={() => setSemanticMode((v) => !v)}
            className={`min-h-[48px] px-4 rounded-2xl border text-xs font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-colors ${
              semanticMode
                ? 'bg-lime-500 text-slate-950 border-lime-500'
                : 'bg-white dark:bg-[#121821] border-stone-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-slate-800'
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
                className="px-2.5 py-1 rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-[#121821] text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:border-lime-500"
              >
                {example}
              </button>
            ))}
          </div>
        )}

        {/* Country & Source Filters */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              aria-label="Filter by country"
              className="h-9 px-3 rounded-xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-[#121821] text-xs font-medium text-slate-700 dark:text-slate-200"
            >
              <option value="all">All Countries</option>
              <option value="India">India (IFCT & Local)</option>
              <option value="United States">United States</option>
              <option value="International">International</option>
            </select>

            <button
              type="button"
              onClick={() =>
                setSelectedCountry((prev) => (prev === 'India' ? 'all' : 'India'))
              }
              className={`h-9 px-3 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap ${
                selectedCountry === 'India'
                  ? 'bg-lime-500 text-slate-950 border-lime-500'
                  : 'bg-white dark:bg-[#121821] border-stone-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:border-lime-500'
              }`}
            >
              Indian Foods (IFCT & 890…)
            </button>

            <select
              value={selectedSourceType}
              onChange={(e) => setSelectedSourceType(e.target.value as 'all' | FoodSourceType)}
              aria-label="Filter by source type"
              className="h-9 px-3 rounded-xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-[#121821] text-xs font-medium text-slate-700 dark:text-slate-200"
            >
              <option value="all">All Sources</option>
              <option value="verified_reference">Verified Reference</option>
              <option value="branded">Branded Product</option>
              <option value="community">Community Food</option>
              <option value="personal_custom">Personal Custom</option>
            </select>
          </div>

          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
            {remoteLoading ? (
              <span className="inline-flex items-center gap-1 text-lime-700 dark:text-lime-400">
                <Globe className="w-3.5 h-3.5 animate-pulse" />
                Searching global catalogs...
              </span>
            ) : remoteNote ? (
              <span>{remoteNote}</span>
            ) : (
              <span>
                IFCT 2017 · Open Food Facts v2 (ODbL)
                {sourceStatus?.usdaFdc.configured ? ' · USDA FoodData Central' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Category Pills / Tabs */}
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
                    ? 'bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 border-slate-900 dark:border-lime-500 font-semibold'
                    : 'bg-white dark:bg-[#121821] border-stone-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-800'
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
        <section className="bg-white dark:bg-[#121821] border border-dashed border-stone-300 dark:border-slate-700 rounded-2xl p-8 text-center">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            No foods match this filter
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {selectedCategory === 'My Custom Foods'
              ? 'Create your own custom foods once and reuse them any time.'
              : 'Try another search keyword, barcode number, or create a private custom food.'}
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
        <section className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl divide-y divide-stone-100 dark:divide-slate-800/80 overflow-hidden">
          {displayedFoods.map((food) => {
            const isFav = state.favoriteFoodIds.includes(food.id);
            const isExpanded = Boolean(expandedIds[food.id]);
            const sourceLabel = getSourceTypeDisplay(food);
            const hasDetails =
              Boolean(food.ingredientsText) ||
              Boolean(food.barcode) ||
              Boolean(food.micronutrients && Object.keys(food.micronutrients).length > 0) ||
              Boolean(food.license);

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
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {food.name}
                        </h3>
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

                {/* Expanded provenance, ingredients & micronutrients */}
                {isExpanded && (
                  <div className="mt-3 ml-0 sm:ml-12 p-3.5 rounded-xl bg-stone-50 dark:bg-slate-900/80 border border-stone-200/80 dark:border-slate-800 text-xs space-y-2">
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
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-stone-200/70 dark:border-slate-800">
                      <span>
                        License: {food.license || 'Verified Reference'}
                        {food.sourceId ? ` · ID ${food.sourceId}` : ''}
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

      {/* Attribution & API Status Footer */}
      <section className="rounded-2xl border border-stone-200/80 dark:border-slate-800 bg-white dark:bg-[#121821] p-4 text-xs text-slate-500 dark:text-slate-400 space-y-1">
        <div className="font-semibold text-slate-700 dark:text-slate-200">
          Food Data Provenance & Attribution
        </div>
        <p>
          Reference Indian foods incorporate values from ICMR-NIN Indian Food Composition Tables (IFCT 2017). Branded packaged products include Open Food Facts data under the Open Database License (ODbL). Missing external nutrient fields are displayed as Unavailable rather than zero.
          {sourceStatus && !sourceStatus.usdaFdc.configured && (
            <span>
              {' '}
              Configure <code className="font-mono-nums">USDA_FDC_API_KEY</code> on the server to enable live USDA FoodData Central queries alongside reference staples.
            </span>
          )}
        </p>
      </section>

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
