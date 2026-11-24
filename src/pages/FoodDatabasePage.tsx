import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  Barcode,
  BookmarkPlus,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Globe,
  Heart,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CustomFoodModal } from '../components/CustomFoodModal';
import { HorizontalScroller } from '../components/HorizontalScroller';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import {
  lookupBarcodeApi,
  searchGlobalFoodsApi,
  semanticFoodSearchApi,
} from '../services/globalFoodApiService';
import { FoodItem, FoodResultGroup, RegionalSearchSuggestion } from '../types';
import {
  formatNutrientValue,
  getNutrientCompleteness,
  isFoodNutritionallyUsable,
  searchFoods,
} from '../utils/nutritionUtils';
import { getNonEmptyResultGroups } from '../utils/foodSearchEngine';
import { getPortionsForFood } from '../utils/portionEngine';

const DATABASE_PAGE_SIZE = 40;

type DietaryFilterOption = 'all' | 'vegetarian' | 'vegan' | 'eggetarian' | 'non_veg';

const DIETARY_FILTER_STORAGE_KEY = 'calothrix_db_dietary_filter';

const CATEGORY_FILTERS: { id: string; label: string }[] = [
  { id: 'All', label: 'All Foods' },
  { id: 'Recent', label: 'Recent' },
  { id: 'Favorites', label: 'Favorites' },
  { id: 'Custom', label: 'My Foods' },
];

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
  const isMushroomOrPlant =
    /\bmushroom\b|\bmushrooms\b|\bfungus\b/.test(text) ||
    food.category === 'Vegetables' ||
    food.category === 'Fruits';
  const isMeatCategory =
    food.category === 'Meat and poultry' || food.category === 'Fish and seafood';
  const hasMeatKeyword = !isMushroomOrPlant && NON_VEG_MEAT_FISH_REGEX.test(text);
  const hasEggKeyword = !isMushroomOrPlant && EGG_REGEX.test(text);

  if (filter === 'vegetarian') {
    if (tags.length > 0) return tags.includes('vegetarian');
    return !isMeatCategory && !hasMeatKeyword && !hasEggKeyword;
  }

  if (filter === 'vegan') {
    if (tags.length > 0) return tags.includes('vegan');
    return (
      !isMeatCategory &&
      food.category !== 'Dairy' &&
      !hasMeatKeyword &&
      !hasEggKeyword &&
      !DAIRY_HONEY_REGEX.test(text)
    );
  }

  if (filter === 'eggetarian') {
    if (tags.length > 0) return tags.includes('eggetarian') || tags.includes('vegetarian');
    return !isMeatCategory && !hasMeatKeyword;
  }

  // 'non_veg'
  if (tags.length > 0) {
    return !tags.includes('vegetarian');
  }
  return isMeatCategory || hasMeatKeyword || hasEggKeyword;
}

function getSourceTypeDisplay(food: FoodItem): string {
  if (food.isCustom && (food.sourceName || '').includes('Recipe Engine')) return 'Recipe';
  if (food.isCustom || food.sourceType === 'personal_custom') return 'Custom';
  if (food.sourceType === 'branded') return 'Branded';
  if (food.sourceType === 'community') return 'Community';
  return 'Verified Ref';
}

function getShortSourceName(food: FoodItem): string {
  const raw = food.sourceName || '';
  if (!raw) return '';
  if (/ifct/i.test(raw)) return 'IFCT 2017';
  if (/indb/i.test(raw)) return 'INDB';
  if (/uk.*fct|mccance/i.test(raw)) return 'UK FCT';
  if (/us.*fct|usda/i.test(raw)) return 'US FCT';
  if (/karnataka/i.test(raw)) return 'Karnataka Ref';
  if (/calothrix.*cooked/i.test(raw)) return 'Indian Ref';
  return raw.length > 24 ? `${raw.slice(0, 23)}…` : raw;
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

function getRelatedFamilyVariants(food: FoodItem, familyMap: Map<string, FoodItem[]>): FoodItem[] {
  const famKey = food.foodFamilyId || food.canonicalFamily;
  if (!famKey) return [];
  const members = familyMap.get(famKey) || [];
  if (!BROAD_CATCHALL_FAMILIES.has(famKey)) {
    return members.filter((f) => f.id !== food.id).slice(0, 6);
  }
  const stopWords = new Set([
    'raw', 'fresh', 'cooked', 'boiled', 'steamed', 'fried', 'roasted', 'grilled',
    'plain', 'indian', 'homemade', 'whole', 'with', 'without', 'skin', 'dried',
    'dry', 'ripe', 'tender', 'mature', 'green', 'red', 'white', 'black', 'yellow',
    'small', 'big', 'large', 'medium', 'sp', 'spp', 'var', 'style', 'dish', 'curry',
  ]);
  const tokens = food.name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length >= 3 && !stopWords.has(t));
  if (tokens.length === 0) return [];
  return members
    .filter((f) => {
      if (f.id === food.id) return false;
      const lower = f.name.toLowerCase();
      return tokens.some((tok) => lower.includes(tok));
    })
    .slice(0, 6);
}

function getQualityOrVerificationPill(food: FoodItem): {
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

interface FoodDatabaseRowProps {
  food: FoodItem;
  familyVariants: FoodItem[];
  isFav: boolean;
  isExpanded: boolean;
  onToggleFavorite: (foodId: string) => void;
  onToggleExpand: (foodId: string) => void;
  onSaveExternal: (food: FoodItem) => void;
  onEditCustom: (food: FoodItem) => void;
  onDeleteCustom: (food: FoodItem) => void;
  onQuickAdd: (food: FoodItem) => void;
}

const FoodDatabaseRow: React.FC<FoodDatabaseRowProps> = React.memo(
  ({
    food,
    familyVariants,
    isFav,
    isExpanded,
    onToggleFavorite,
    onToggleExpand,
    onSaveExternal,
    onEditCustom,
    onDeleteCustom,
    onQuickAdd,
  }) => {
    const sourceLabel = getSourceTypeDisplay(food);
    const badge = getQualityOrVerificationPill(food);
    const completeness = getNutrientCompleteness(food);
    const isExternalApiResult =
      !food.isCustom && (food.id.startsWith('off-') || food.id.startsWith('usda-'));
    const portions = isExpanded ? getPortionsForFood(food) : [];
    const hasDetails =
      Boolean(food.ingredientsText) ||
      Boolean(food.barcode) ||
      Boolean(food.micronutrients && Object.keys(food.micronutrients).length > 0) ||
      Boolean(food.license) ||
      Boolean(food.foodCode || food.sourceId) ||
      Boolean(food.calculationMethod) ||
      food.solubleFibreG != null ||
      food.insolubleFibreG != null ||
      food.waterG != null ||
      familyVariants.length > 0 ||
      (food.aliases && food.aliases.length > 0);

    const shortSource = getShortSourceName(food);

    return (
      <div className="px-3.5 sm:px-5 py-3.5 hover:bg-stone-50/70 dark:hover:bg-slate-800/30 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3">
          <div className="min-w-0 flex items-start gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={() => onToggleFavorite(food.id)}
              aria-label={isFav ? `Remove ${food.name} from favorites` : `Save ${food.name} to favorites`}
              className="min-h-[44px] min-w-[44px] -ml-1.5 flex items-center justify-center rounded-xl text-slate-400 hover:bg-stone-100 dark:hover:bg-white/10 shrink-0"
            >
              <Heart className={`w-4 h-4 ${isFav ? 'text-rose-500 fill-rose-500' : ''}`} />
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2 sm:block">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                  {food.name}
                  {food.brand ? (
                    <span className="font-normal text-xs text-slate-500 dark:text-slate-400">
                      {' '}· {food.brand}
                    </span>
                  ) : null}
                </h3>
              </div>

              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 tabular-nums">
                <span>{food.servingName}</span>
                <span aria-hidden="true">·</span>
                <span>P {formatNutrientValue(food, 'protein', 'g')}</span>
                <span aria-hidden="true">·</span>
                <span>C {formatNutrientValue(food, 'carbs', 'g')}</span>
                <span aria-hidden="true">·</span>
                <span>F {formatNutrientValue(food, 'fat', 'g')}</span>
                <span aria-hidden="true">·</span>
                <span>Fib {formatNutrientValue(food, 'fibre', 'g')}</span>
              </div>

              <div className="mt-1 text-[11px] text-slate-400 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span className={`font-semibold ${badge.textCls}`}>
                  {badge.label}
                </span>
                {food.foodState && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize">{food.foodState}</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span>{shortSource || sourceLabel}</span>
                {(food.foodCode || food.sourceId) && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-nums">{food.foodCode || food.sourceId}</span>
                  </>
                )}
                {hasDetails && (
                  <>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() => onToggleExpand(food.id)}
                      className="text-lime-700 dark:text-lime-400 hover:underline inline-flex items-center gap-0.5 font-medium"
                    >
                      {isExpanded ? 'Hide details' : 'Details'}
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

          <div className="flex items-center justify-between sm:justify-end gap-2 pl-10 sm:pl-0 shrink-0">
            <div className="text-left sm:text-right sm:mr-2">
              <span className="text-sm font-bold font-mono-nums text-slate-900 dark:text-slate-100">
                {formatNutrientValue(food, 'calories')}
              </span>{' '}
              {!food.missingFields?.includes('calories') && (
                <span className="text-xs text-slate-500 dark:text-slate-400">kcal</span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {isExternalApiResult && (
                <button
                  type="button"
                  onClick={() => onSaveExternal(food)}
                  title="Save verified external food to My Foods"
                  className="min-h-[40px] px-2.5 rounded-xl border border-black/10 dark:border-white/15 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-lime-500 inline-flex items-center gap-1 whitespace-nowrap"
                >
                  <BookmarkPlus className="w-3.5 h-3.5 text-lime-600 dark:text-lime-400" />
                  Save
                </button>
              )}

              {food.isCustom && (
                <>
                  <button
                    type="button"
                    onClick={() => onEditCustom(food)}
                    aria-label={`Edit ${food.name}`}
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-stone-100 dark:hover:bg-slate-800"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteCustom(food)}
                    aria-label={`Delete ${food.name}`}
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => onQuickAdd(food)}
                className="min-h-[40px] px-3.5 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-xs font-bold hover:opacity-90 transition-opacity inline-flex items-center gap-1 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Quick Log
              </button>
            </div>
          </div>
        </div>

        {/* Expanded provenance, ingredients, IFCT proximate composition & micronutrients */}
        {isExpanded && (
          <div className="mt-3 ml-0 sm:ml-11 p-3 sm:p-3.5 rounded-xl bg-stone-50 dark:bg-[#090A0C]/80 border border-black/10 dark:border-white/12 text-xs space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-black/8 dark:border-white/10">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 font-mono-nums">
                Core Macros: <strong>{completeness.macroPresent}/{completeness.macroTotal}</strong> verified
                {completeness.microPresent > 0
                  ? ` · ${completeness.microPresent}/${completeness.microTotal} micros`
                  : ''}
              </span>
              {food.confidenceScore != null && (
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-nums">
                  Confidence {Math.round(food.confidenceScore * 100)}%
                </span>
              )}
            </div>

            {food.calculationMethod && (
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Provenance:{' '}
                </span>
                {food.calculationMethod}
                {food.sourceReferenceFoods && food.sourceReferenceFoods.length > 0
                  ? ` (${food.sourceReferenceFoods.join(', ')})`
                  : ''}
              </p>
            )}

            {familyVariants.length > 0 && (
              <div className="space-y-1.5 pb-1">
                <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  Related forms &amp; dishes
                </div>
                <HorizontalScroller ariaLabel="Related forms and dishes" contentClassName="gap-1.5 pb-0.5">
                  {familyVariants.map((variant) => (
                    <button
                      key={variant.id}
                      type="button"
                      onClick={() => onQuickAdd(variant)}
                      title={`Quick add ${variant.name}`}
                      className="min-h-[36px] px-2.5 rounded-lg border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] text-[11px] text-slate-700 dark:text-slate-200 hover:border-lime-500 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
                    >
                      <span className="font-medium">{getShortVariantLabel(variant.name)}</span>
                      <span className="text-slate-400 font-mono-nums">
                        {formatNutrientValue(variant, 'calories')} kcal
                      </span>
                    </button>
                  ))}
                </HorizontalScroller>
              </div>
            )}

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-600 dark:text-slate-300 font-mono-nums">
              {food.energyKj != null && <span>Energy: {food.energyKj} kJ</span>}
              {food.atwaterCalories != null && (
                <span>Atwater check: {food.atwaterCalories} kcal/100g</span>
              )}
              {food.waterG != null && <span>Moisture/Water: {food.waterG}g</span>}
              {food.ashG != null && <span>Ash: {food.ashG}g</span>}
              {food.solubleFibreG != null && <span>Soluble Fibre: {food.solubleFibreG}g</span>}
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
  }
);
FoodDatabaseRow.displayName = 'FoodDatabaseRow';

export interface FoodDatabasePageProps {
  embedded?: boolean;
}

export const FoodDatabasePage: React.FC<FoodDatabasePageProps> = ({ embedded = false }) => {
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
  const deferredQuery = useDeferredValue(query);
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
  const [remoteError, setRemoteError] = useState<string>('');
  const [retryCount, setRetryCount] = useState(0);
  const [regionalSuggestion, setRegionalSuggestion] = useState<RegionalSearchSuggestion | null>(null);
  const [resultGroupFilter, setResultGroupFilter] = useState<'all' | FoodResultGroup>('all');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [visibleCount, setVisibleCount] = useState(DATABASE_PAGE_SIZE);
  const [searchGroupLimit, setSearchGroupLimit] = useState(25);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

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
      setRemoteError('');
      setRegionalSuggestion(null);
      setRemoteLoading(false);
      return;
    }

    if (selectedCategory !== 'All') {
      setRemoteFoods([]);
      setRegionalSuggestion(null);
      setRemoteError('');
      setRemoteLoading(false);
      return;
    }

    let cancelled = false;
    setRemoteLoading(true);
    setRemoteError('');

    const timer = setTimeout(async () => {
      try {
        if (semanticMode) {
          const res = await semanticFoodSearchApi(trimmed);
          if (!cancelled) {
            setRemoteFoods(res.items.filter(isFoodNutritionallyUsable));
            setRegionalSuggestion(null);
            setRemoteNote('Smart AI matches');
            setRemoteError('');
          }
          return;
        }

        if (/^\d{8,14}$/.test(trimmed)) {
          const bc = await lookupBarcodeApi(trimmed);
          if (!cancelled) {
            setRemoteFoods(bc.item && isFoodNutritionallyUsable(bc.item) ? [bc.item] : []);
            setRegionalSuggestion(null);
            setRemoteNote(bc.item ? `Barcode match (${trimmed})` : bc.error || '');
            setRemoteError('');
          }
          return;
        }

        if (trimmed.length < 2) {
          if (!cancelled) {
            setRemoteFoods([]);
            setRegionalSuggestion(null);
            setRemoteNote('');
            setRemoteError('');
          }
          return;
        }

        const res = await searchGlobalFoodsApi({
          query: trimmed,
          limit: 60,
        });

        if (!cancelled) {
          setRemoteFoods(res.items.filter(isFoodNutritionallyUsable));
          setRegionalSuggestion(res.regionalSuggestion || null);
          setRemoteNote('');
          setRemoteError('');
        }
      } catch {
        if (!cancelled) {
          setRemoteFoods([]);
          setRegionalSuggestion(null);
          setRemoteNote('');
          setRemoteError('Live global search could not reach the server. Showing local matches.');
        }
      } finally {
        if (!cancelled) setRemoteLoading(false);
      }
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, retryCount, selectedCategory, semanticMode]);

  const favoriteSet = useMemo(
    () => new Set(state.favoriteFoodIds),
    [state.favoriteFoodIds]
  );

  const activeFoods = useMemo(
    () => allFoods.filter((f) => isFoodNutritionallyUsable(f)),
    [allFoods]
  );

  const familyMap = useMemo(() => {
    const map = new Map<string, FoodItem[]>();
    for (const f of activeFoods) {
      const famKey = f.foodFamilyId || f.canonicalFamily;
      if (!famKey) continue;
      const arr = map.get(famKey) || [];
      arr.push(f);
      map.set(famKey, arr);
    }
    return map;
  }, [activeFoods]);

  const filteredLocalFoods = useMemo(
    () =>
      searchFoods(
        activeFoods,
        deferredQuery,
        selectedCategory,
        state.favoriteFoodIds,
        state.recentFoodIds
      ),
    [activeFoods, deferredQuery, selectedCategory, state.favoriteFoodIds, state.recentFoodIds]
  );

  const displayedFoods = useMemo(() => {
    const trimmedDeferred = deferredQuery.trim();
    const validRemote = remoteFoods.filter((r) => isFoodNutritionallyUsable(r));
    let base: FoodItem[];
    if (semanticMode && trimmedDeferred) {
      const seen = new Set(validRemote.map((f) => f.id));
      const localMatches = filteredLocalFoods.filter((f) => !seen.has(f.id));
      base = [...validRemote, ...localMatches];
    } else if (trimmedDeferred && selectedCategory === 'All') {
      const seen = new Set(filteredLocalFoods.map((f) => f.id));
      base = [...filteredLocalFoods, ...validRemote.filter((r) => !seen.has(r.id))];
    } else {
      base = filteredLocalFoods;
    }

    if (dietaryFilter !== 'all') {
      base = base.filter((food) => matchesDietaryFilter(food, dietaryFilter));
    }

    return base;
  }, [
    deferredQuery,
    dietaryFilter,
    filteredLocalFoods,
    remoteFoods,
    selectedCategory,
    semanticMode,
  ]);

  const isActiveSearch = deferredQuery.trim().length > 0 && !semanticMode;

  const nonEmptySearchGroups = useMemo(() => {
    if (!isActiveSearch) return [];
    const groups = getNonEmptyResultGroups(displayedFoods);
    if (resultGroupFilter === 'all') return groups;
    return groups.filter((g) => g.key === resultGroupFilter);
  }, [displayedFoods, isActiveSearch, resultGroupFilter]);

  const allNonEmptyGroupKeys = useMemo(() => {
    if (!isActiveSearch) return [];
    return getNonEmptyResultGroups(displayedFoods);
  }, [displayedFoods, isActiveSearch]);

  // Reset pagination & group filter when search criteria change
  useEffect(() => {
    setVisibleCount(DATABASE_PAGE_SIZE);
    setSearchGroupLimit(25);
    setResultGroupFilter('all');
  }, [deferredQuery, selectedCategory, dietaryFilter, semanticMode]);

  const visibleFoods = useMemo(
    () => displayedFoods.slice(0, visibleCount),
    [displayedFoods, visibleCount]
  );

  const hasMoreFoods = !isActiveSearch && visibleCount < displayedFoods.length;

  useEffect(() => {
    if (!hasMoreFoods) return;
    const target = loadMoreRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((prev) => prev + DATABASE_PAGE_SIZE);
        }
      },
      { rootMargin: '240px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMoreFoods]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleEditCustomFood = useCallback((food: FoodItem) => {
    setEditingFood(food);
    setCustomModalOpen(true);
  }, []);

  const handleDeleteCustomFood = useCallback((food: FoodItem) => {
    setPendingDeleteFood(food);
  }, []);

  const handleQuickAddFood = useCallback(
    (food: FoodItem) => {
      openAddFoodModal({ food, date: selectedDate });
    },
    [openAddFoodModal, selectedDate]
  );

  return (
    <div className="space-y-5">
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          {!embedded && (
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
              Food Database
            </h1>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {activeFoods.filter((f) => !f.isCustom).length.toLocaleString()} verified foods · {state.customFoods.length} custom foods
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => openBarcodeScannerModal({ date: selectedDate })}
            className="min-h-[40px] px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] text-slate-800 dark:text-slate-100 text-xs font-semibold hover:border-[#4E6800] dark:hover:border-[#C8FF00] transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Barcode className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00]" />
            <span>Barcode</span>
          </button>

          <button
            type="button"
            onClick={() => openMealScannerModal({ mode: 'photo', date: selectedDate })}
            title="Log with Photo, Voice, Description, or Label OCR"
            className="min-h-[40px] px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] text-slate-800 dark:text-slate-100 text-xs font-semibold hover:border-[#4E6800] dark:hover:border-[#C8FF00] transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Sparkles className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00]" />
            <span>AI Logger</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingFood(undefined);
              setCustomModalOpen(true);
            }}
            className="min-h-[40px] px-4 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-xs font-bold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Create Custom Food</span>
          </button>
        </div>
      </section>

      {/* Search Bar + Smart Semantic Toggle + Filters */}
      <section className="space-y-3">
        <div className="sticky top-[calc(52px+env(safe-area-inset-top))] lg:static z-20 bg-[#F4F3EF]/98 dark:bg-[#090A0C]/98 py-1.5 -mx-4 px-4 sm:mx-0 sm:px-0 sm:py-0 sm:bg-transparent flex flex-row items-center gap-2">
          <div className="relative flex-1 min-w-0">
            {semanticMode ? (
              <Sparkles className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            ) : (
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            )}
            <input
              type="search"
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                semanticMode
                  ? 'Describe meal (e.g., High protein Indian breakfast)...'
                  : 'Search food, regional Indian dish, brand, or barcode...'
              }
              className="w-full h-11 sm:h-12 pl-10 pr-10 rounded-2xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#111317] text-base sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setSemanticMode((v) => !v)}
            aria-label="Toggle Smart AI Search"
            className={`min-h-[44px] sm:min-h-[48px] px-3 sm:px-4 rounded-2xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
              semanticMode
                ? 'bg-lime-500 text-slate-950 border-lime-500'
                : 'bg-white dark:bg-[#111317] border-black/10 dark:border-white/12 text-slate-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-slate-800'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span className="sm:hidden">AI</span>
            <span className="hidden sm:inline">Smart AI Search</span>
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

        {/* Category Tabs (All Foods, Recent, Favorites, My Foods) + Non-Empty Search Group Filter */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {CATEGORY_FILTERS.map((cat) => {
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 border transition-colors ${
                    active
                      ? 'bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black border-[#111317] dark:border-[#C8FF00]'
                      : 'bg-white dark:bg-[#111317] border-black/10 dark:border-white/12 text-slate-600 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-white/5'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {isActiveSearch && allNonEmptyGroupKeys.length > 1 && (
            <HorizontalScroller ariaLabel="Search result groups" contentClassName="gap-1.5">
              <button
                type="button"
                onClick={() => setResultGroupFilter('all')}
                className={`min-h-[32px] px-3 rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0 border transition-colors ${
                  resultGroupFilter === 'all'
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-950 border-slate-900 dark:border-white'
                    : 'bg-white dark:bg-[#111317] border-black/10 dark:border-white/12 text-slate-600 dark:text-slate-300'
                }`}
              >
                All Groups ({displayedFoods.length})
              </button>
              {allNonEmptyGroupKeys.map((grp) => (
                <button
                  key={grp.key}
                  type="button"
                  onClick={() => setResultGroupFilter(grp.key)}
                  className={`min-h-[32px] px-3 rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0 border transition-colors ${
                    resultGroupFilter === grp.key
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-950 border-slate-900 dark:border-white'
                      : 'bg-white dark:bg-[#111317] border-black/10 dark:border-white/12 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {grp.label} ({grp.items.length})
                </button>
              ))}
            </HorizontalScroller>
          )}
        </div>
      </section>

      {/* Regional Fallback Mapping Banner (0-match Gemini helper strictly mapping to existing DB entries) */}
      {regionalSuggestion && regionalSuggestion.matchedFoodIds.length > 0 && (
        <section className="rounded-2xl border border-lime-500/30 bg-lime-50/70 dark:bg-lime-950/20 px-4 py-3 text-xs flex flex-wrap items-center justify-between gap-2">
          <div className="text-slate-700 dark:text-slate-200">
            <span className="font-semibold text-lime-800 dark:text-lime-300">
              Regional Match:
            </span>{' '}
            &ldquo;{regionalSuggestion.detectedFood}&rdquo; →{' '}
            <strong className="font-semibold">{regionalSuggestion.canonicalEnglishName}</strong>
            {regionalSuggestion.reasoning ? ` · ${regionalSuggestion.reasoning}` : ''}
          </div>
        </section>
      )}

      {remoteError && (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-50/70 dark:bg-amber-950/20 px-4 py-3 text-xs flex flex-wrap items-center justify-between gap-2 text-amber-800 dark:text-amber-300">
          <span>{remoteError}</span>
          <button
            type="button"
            onClick={() => setRetryCount((c) => c + 1)}
            className="inline-flex items-center gap-1 font-semibold underline"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </section>
      )}

      {/* Food List */}
      {remoteLoading && displayedFoods.length === 0 ? (
        <section className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-6 space-y-3 animate-pulse">
          <div className="h-12 rounded-xl bg-black/5 dark:bg-white/5" />
          <div className="h-12 rounded-xl bg-black/5 dark:bg-white/5" />
          <div className="h-12 rounded-xl bg-black/5 dark:bg-white/5" />
        </section>
      ) : displayedFoods.length === 0 && !remoteLoading ? (
        <section className="bg-white dark:bg-[#111317] border border-dashed border-stone-300 dark:border-white/15 rounded-2xl p-8 text-center">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {selectedCategory === 'Custom'
              ? 'No personal custom foods yet'
              : selectedCategory === 'Favorites'
              ? 'No favorite foods yet'
              : selectedCategory === 'Recent'
              ? 'No recently logged foods yet'
              : 'No foods match this filter'}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {selectedCategory === 'Custom'
              ? 'Create homemade recipes or scan a nutrition label to save your own foods.'
              : selectedCategory === 'Favorites'
              ? 'Tap the heart icon on any food in All Foods to pin it here.'
              : 'Try switching your dietary preference, searching another keyword, or creating a custom food.'}
          </p>
          <button
            type="button"
            onClick={() => {
              setEditingFood(undefined);
              setCustomModalOpen(true);
            }}
            className="mt-4 min-h-[42px] px-4 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-xs font-bold inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Create Custom Food
          </button>
        </section>
      ) : isActiveSearch && nonEmptySearchGroups.length > 0 ? (
        <div className="space-y-4">
          {nonEmptySearchGroups.map((group) => {
            const visibleGroupItems = group.items.slice(0, searchGroupLimit);
            return (
              <section
                key={group.key}
                className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl overflow-hidden"
              >
                <div className="px-4 sm:px-5 py-2.5 bg-stone-50/90 dark:bg-[#090A0C]/80 border-b border-black/8 dark:border-white/10 flex items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">
                      {group.label}
                    </h2>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {group.description}
                    </p>
                  </div>
                  <span className="text-[11px] font-mono-nums font-semibold text-slate-500 dark:text-slate-400">
                    {group.items.length} {group.items.length === 1 ? 'match' : 'matches'}
                  </span>
                </div>
                <div className="divide-y divide-stone-100 dark:divide-slate-800/80">
                  {visibleGroupItems.map((food) => {
                    const siblings = getRelatedFamilyVariants(food, familyMap);
                    return (
                      <FoodDatabaseRow
                        key={food.id}
                        food={food}
                        familyVariants={siblings}
                        isFav={favoriteSet.has(food.id)}
                        isExpanded={Boolean(expandedIds[food.id])}
                        onToggleFavorite={toggleFavoriteFood}
                        onToggleExpand={toggleExpand}
                        onSaveExternal={saveExternalFoodToMyFoods}
                        onEditCustom={handleEditCustomFood}
                        onDeleteCustom={handleDeleteCustomFood}
                        onQuickAdd={handleQuickAddFood}
                      />
                    );
                  })}
                </div>
                {group.items.length > searchGroupLimit && (
                  <div className="px-4 py-3 flex justify-center border-t border-black/6 dark:border-white/8 bg-stone-50/40 dark:bg-white/[0.02]">
                    <button
                      type="button"
                      onClick={() => setSearchGroupLimit((prev) => prev + 25)}
                      className="min-h-[38px] px-4 rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-[#4E6800] dark:hover:border-[#C8FF00] transition-colors"
                    >
                      Show more ({group.items.length - searchGroupLimit} remaining)
                    </button>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <section className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl divide-y divide-stone-100 dark:divide-slate-800/80 overflow-hidden">
          {visibleFoods.map((food) => {
            const siblings = getRelatedFamilyVariants(food, familyMap);
            return (
              <FoodDatabaseRow
                key={food.id}
                food={food}
                familyVariants={siblings}
                isFav={favoriteSet.has(food.id)}
                isExpanded={Boolean(expandedIds[food.id])}
                onToggleFavorite={toggleFavoriteFood}
                onToggleExpand={toggleExpand}
                onSaveExternal={saveExternalFoodToMyFoods}
                onEditCustom={handleEditCustomFood}
                onDeleteCustom={handleDeleteCustomFood}
                onQuickAdd={handleQuickAddFood}
              />
            );
          })}

          {hasMoreFoods && (
            <div ref={loadMoreRef} className="px-4 py-4 flex items-center justify-center bg-stone-50/40 dark:bg-white/[0.02]">
              <button
                type="button"
                onClick={() => setVisibleCount((prev) => prev + DATABASE_PAGE_SIZE)}
                className="min-h-[38px] px-4 rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-lime-500 transition-colors"
              >
                Load more ({displayedFoods.length - visibleCount} remaining)
              </button>
            </div>
          )}
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
