import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Plus, Search, Star, X } from 'lucide-react';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { FoodItem, MealCategory, MEAL_CATEGORIES } from '../types';
import { calculateScaledNutrition, formatFoodQuantity } from '../utils/nutritionUtils';

export const FoodEntryModal: React.FC = () => {
  const {
    state,
    allFoods,
    foodModal,
    closeFoodModal,
    addFoodEntry,
    updateFoodEntry,
    addCustomFood,
  } = useMacroLogStore();

  const editing = foodModal.editingEntry;

  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'recent' | 'favorites' | 'custom'>('all');
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [inputMode, setInputMode] = useState<'grams' | 'servings'>('grams');
  const [quantityGrams, setQuantityGrams] = useState<string>('100');
  const [servingsCount, setServingsCount] = useState<string>('1');
  const [mealType, setMealType] = useState<MealCategory>('breakfast');
  const [date, setDate] = useState<string>(foodModal.targetDate);
  const [error, setError] = useState<string>('');

  // Quick custom food creation sub-view
  const [creatingCustom, setCreatingCustom] = useState(false);
  const [customName, setCustomName] = useState('');
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
    setFilterTab('all');
    setMealType(editing ? editing.mealType : foodModal.initialMeal);
    setDate(editing ? editing.date : foodModal.targetDate);

    if (editing) {
      const matched = allFoods.find((f) => f.id === editing.foodId);
      if (matched) {
        setSelectedFood(matched);
        setQuantityGrams(String(editing.quantityGrams));
        setServingsCount(
          String(
            Math.round((editing.quantityGrams / Math.max(1, matched.servingWeightGrams)) * 100) /
              100
          )
        );
        setInputMode('grams');
      } else {
        // Fallback synthetic item if custom food was deleted
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
        };
        setSelectedFood(fallback);
        setQuantityGrams(String(editing.quantityGrams));
        setServingsCount('1');
        setInputMode('grams');
      }
    } else if (foodModal.preselectedFoodId) {
      const matched = allFoods.find((f) => f.id === foodModal.preselectedFoodId) ?? null;
      setSelectedFood(matched);
      if (matched) {
        setQuantityGrams(String(matched.servingWeightGrams));
        setServingsCount('1');
        setInputMode(matched.servingWeightGrams === 100 ? 'grams' : 'servings');
      }
    } else {
      setSelectedFood(null);
      setQuantityGrams('100');
      setServingsCount('1');
      setInputMode('grams');
    }
  }, [foodModal.isOpen, foodModal.initialMeal, foodModal.preselectedFoodId, foodModal.targetDate, editing, allFoods]);

  const filteredFoods = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allFoods.filter((f) => {
      const matchesQ =
        !q ||
        f.name.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q);
      if (!matchesQ) return false;
      if (filterTab === 'favorites') return state.favoriteFoodIds.includes(f.id);
      if (filterTab === 'recent') return state.recentFoodIds.includes(f.id);
      if (filterTab === 'custom') return f.isCustom;
      return true;
    });
  }, [allFoods, filterTab, searchQuery, state.favoriteFoodIds, state.recentFoodIds]);

  const effectiveGrams = useMemo(() => {
    if (!selectedFood) return 0;
    if (inputMode === 'grams') {
      const parsed = parseFloat(quantityGrams);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    const parsedServings = parseFloat(servingsCount);
    return Number.isFinite(parsedServings)
      ? parsedServings * selectedFood.servingWeightGrams
      : 0;
  }, [inputMode, quantityGrams, selectedFood, servingsCount]);

  const liveMacros = useMemo(() => {
    if (!selectedFood) {
      return { calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 };
    }
    return calculateScaledNutrition(selectedFood, effectiveGrams);
  }, [effectiveGrams, selectedFood]);

  if (!foodModal.isOpen) return null;

  const handleSelectFood = (food: FoodItem) => {
    setSelectedFood(food);
    setQuantityGrams(String(food.servingWeightGrams));
    setServingsCount('1');
    setInputMode(food.servingWeightGrams === 100 ? 'grams' : 'servings');
    setError('');
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

    if (editing) {
      updateFoodEntry(editing.id, {
        food: selectedFood,
        quantityGrams: Math.round(effectiveGrams * 10) / 10,
        mealType,
        date,
      });
    } else {
      addFoodEntry({
        food: selectedFood,
        quantityGrams: Math.round(effectiveGrams * 10) / 10,
        mealType,
        date,
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
      category: 'Custom',
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
    setCustomCalories('');
    setCustomProtein('');
    setCustomCarbs('');
    setCustomFat('');
    setCustomFibre('0');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editing ? 'Edit food entry' : 'Add food to log'}
    >
      <div className="w-full sm:max-w-lg max-h-[92dvh] flex flex-col bg-white dark:bg-[#121821] rounded-t-3xl sm:rounded-2xl border border-stone-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        {/* Mobile bottom-sheet handle */}
        <div className="sm:hidden w-10 h-1.5 bg-stone-300 dark:bg-slate-700 rounded-full mx-auto mt-3 shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-stone-200 dark:border-slate-800 shrink-0">
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
                className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/50 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
              />
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
                  className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/50 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
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
                  className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/50 dark:bg-slate-900 text-sm font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
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
                  className="w-full h-11 px-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/50 dark:bg-slate-900 text-sm font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
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
                  className="w-full h-11 px-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/50 dark:bg-slate-900 text-sm font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
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
                  className="w-full h-11 px-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/50 dark:bg-slate-900 text-sm font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
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
                  className="w-full h-11 px-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/50 dark:bg-slate-900 text-sm font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
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
                  className="w-full h-11 px-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/50 dark:bg-slate-900 text-sm font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setCreatingCustom(false)}
                className="min-h-[44px] px-4 rounded-xl border border-stone-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300"
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
          /* Step 1 & 2: Search & Select Food */
          <div className="flex flex-col flex-1 min-h-0">
            <div className="px-5 pt-4 pb-3 space-y-3 border-b border-stone-100 dark:border-slate-800/80 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search rice, roti, banana, paneer, whey..."
                  className="w-full h-11 pl-10 pr-4 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1 p-1 bg-stone-100 dark:bg-slate-900 rounded-xl overflow-x-auto no-scrollbar">
                  {(['all', 'recent', 'favorites', 'custom'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setFilterTab(tab)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize whitespace-nowrap transition-colors ${
                        filterTab === tab
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {tab === 'custom' ? 'My Foods' : tab}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setCreatingCustom(true)}
                  className="min-h-[36px] px-3 rounded-xl text-xs font-semibold text-lime-700 dark:text-lime-400 hover:bg-lime-50 dark:hover:bg-lime-950/40 inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Custom
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-stone-100 dark:divide-slate-800/70 px-2 py-1">
              {filteredFoods.length === 0 ? (
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
                filteredFoods.map((food) => {
                  const isFav = state.favoriteFoodIds.includes(food.id);
                  return (
                    <button
                      key={food.id}
                      type="button"
                      onClick={() => handleSelectFood(food)}
                      className="w-full min-h-[60px] px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 text-left hover:bg-stone-50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                            {food.name}
                          </span>
                          {isFav && (
                            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 truncate">
                          <span>{food.servingName}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">P {food.protein}g</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">C {food.carbs}g</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">F {food.fat}g</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-mono-nums">
                          {food.calories}
                        </div>
                        <div className="text-[11px] text-slate-400">kcal</div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          /* Step 3, 4, 5: Quantity, Meal & Live Macro Preview */
          <form onSubmit={handleSaveEntry} className="p-5 overflow-y-auto space-y-5">
            {error && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-xs font-medium">
                {error}
              </div>
            )}

            <div className="flex items-start justify-between gap-3 pb-4 border-b border-stone-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {selectedFood.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Base serving: {selectedFood.servingName} ({selectedFood.calories} kcal)
                </p>
              </div>
              {!editing && (
                <button
                  type="button"
                  onClick={() => setSelectedFood(null)}
                  className="text-xs font-medium text-lime-700 dark:text-lime-400 hover:underline whitespace-nowrap"
                >
                  Change food
                </button>
              )}
            </div>

            {/* Quantity controls */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Quantity
                </label>
                <div className="flex items-center gap-1 p-0.5 bg-stone-100 dark:bg-slate-900 rounded-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setInputMode('grams');
                      setQuantityGrams(String(Math.round(effectiveGrams * 10) / 10 || selectedFood.servingWeightGrams));
                    }}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                      inputMode === 'grams'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    Grams (g)
                  </button>
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
                  value={inputMode === 'grams' ? quantityGrams : servingsCount}
                  onChange={(e) => {
                    if (inputMode === 'grams') {
                      setQuantityGrams(e.target.value);
                    } else {
                      setServingsCount(e.target.value);
                    }
                  }}
                  className="flex-1 h-12 px-4 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/70 dark:bg-slate-900 text-base font-semibold font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
                />
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400 min-w-[70px] text-right tabular-nums">
                  {inputMode === 'grams'
                    ? formatFoodQuantity(effectiveGrams, state.settings.foodUnit)
                    : `${Math.round(effectiveGrams)} g`}
                </span>
              </div>

              {/* Quick preset buttons */}
              <div className="flex flex-wrap gap-2">
                {inputMode === 'grams'
                  ? [50, 100, 150, 200, 250].map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setQuantityGrams(String(g))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium font-mono-nums border transition-colors ${
                          Number(quantityGrams) === g
                            ? 'bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 border-slate-900 dark:border-lime-500'
                            : 'border-stone-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {g} g
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
                            : 'border-stone-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        {srv}×
                      </button>
                    ))}
              </div>
            </div>

            {/* Live calculated nutrition */}
            <div className="rounded-2xl bg-stone-50 dark:bg-slate-900/90 border border-stone-200/80 dark:border-slate-800 p-4">
              <div className="flex items-baseline justify-between mb-3">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Calculated nutrition
                </span>
                <span className="text-lg font-bold text-slate-900 dark:text-slate-100 font-mono-nums">
                  {liveMacros.calories} kcal
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="py-2 px-1 rounded-xl bg-white dark:bg-[#121821] border border-stone-200/70 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Protein</div>
                  <div className="text-sm font-semibold text-lime-700 dark:text-lime-400 font-mono-nums mt-0.5">
                    {liveMacros.protein}g
                  </div>
                </div>
                <div className="py-2 px-1 rounded-xl bg-white dark:bg-[#121821] border border-stone-200/70 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Carbs</div>
                  <div className="text-sm font-semibold text-amber-700 dark:text-amber-400 font-mono-nums mt-0.5">
                    {liveMacros.carbs}g
                  </div>
                </div>
                <div className="py-2 px-1 rounded-xl bg-white dark:bg-[#121821] border border-stone-200/70 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Fat</div>
                  <div className="text-sm font-semibold text-indigo-700 dark:text-indigo-400 font-mono-nums mt-0.5">
                    {liveMacros.fat}g
                  </div>
                </div>
                <div className="py-2 px-1 rounded-xl bg-white dark:bg-[#121821] border border-stone-200/70 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Fibre</div>
                  <div className="text-sm font-semibold text-teal-700 dark:text-teal-400 font-mono-nums mt-0.5">
                    {liveMacros.fibre}g
                  </div>
                </div>
              </div>
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
                        : 'border-stone-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-800'
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
                className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/50 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
              />
            </div>

            <button
              type="submit"
              className="w-full min-h-[48px] rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-sm font-semibold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              {editing ? 'Save Changes' : 'Add to Food Log'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
