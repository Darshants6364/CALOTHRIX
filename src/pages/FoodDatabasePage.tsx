import React, { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Star, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CustomFoodModal } from '../components/CustomFoodModal';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { FoodItem } from '../types';
import { searchFoods } from '../utils/nutritionUtils';

const CATEGORY_FILTERS = [
  'All',
  'Favorites',
  'Recent',
  'My Custom Foods',
  'Indian Staples',
  'Protein',
  'Grains & Carbs',
  'Dairy',
  'Fruits & Vegetables',
  'Nuts & Fats',
  'Supplements',
];

export const FoodDatabasePage: React.FC = () => {
  const {
    state,
    allFoods,
    selectedDate,
    openAddFoodModal,
    addCustomFood,
    updateCustomFood,
    deleteCustomFood,
    toggleFavoriteFood,
  } = useMacroLogStore();

  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [editingFood, setEditingFood] = useState<FoodItem | undefined>(undefined);
  const [pendingDeleteFood, setPendingDeleteFood] = useState<FoodItem | null>(null);

  const filteredFoods = useMemo(
    () =>
      searchFoods(
        allFoods,
        query,
        selectedCategory,
        state.favoriteFoodIds,
        state.recentFoodIds
      ),
    [allFoods, query, selectedCategory, state.favoriteFoodIds, state.recentFoodIds]
  );

  return (
    <div className="space-y-6">
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {allFoods.length} total items · {state.customFoods.length} custom foods
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Food Database
          </h1>
        </div>

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
      </section>

      {/* Search & Category Filters */}
      <section className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search foods by name or category (e.g., paneer, oats, dosa, whey)..."
            className="w-full h-12 pl-11 pr-4 rounded-2xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-[#121821] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
          />
        </div>

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
      {filteredFoods.length === 0 ? (
        <section className="bg-white dark:bg-[#121821] border border-dashed border-stone-300 dark:border-slate-700 rounded-2xl p-8 text-center">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            No foods match this filter
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {selectedCategory === 'My Custom Foods'
              ? 'Create your own custom foods once and reuse them any time.'
              : 'Try clearing your search or adding a new custom food.'}
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
          {filteredFoods.map((food) => {
            const isFav = state.favoriteFoodIds.includes(food.id);
            return (
              <div
                key={food.id}
                className="px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-stone-50/70 dark:hover:bg-slate-800/30 transition-colors"
              >
                <div className="min-w-0 flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => toggleFavoriteFood(food.id)}
                    aria-label={isFav ? `Unfavorite ${food.name}` : `Favorite ${food.name}`}
                    className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-slate-400 hover:bg-stone-100 dark:hover:bg-slate-800 shrink-0"
                  >
                    <Star
                      className={`w-4 h-4 ${
                        isFav ? 'text-amber-500 fill-amber-500' : ''
                      }`}
                    />
                  </button>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {food.name}
                      </h3>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {food.isCustom ? 'Custom' : food.category}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
                      <span>Serving: {food.servingName}</span>
                      <span aria-hidden="true">·</span>
                      <span>P {food.protein}g</span>
                      <span aria-hidden="true">·</span>
                      <span>C {food.carbs}g</span>
                      <span aria-hidden="true">·</span>
                      <span>F {food.fat}g</span>
                      <span aria-hidden="true">·</span>
                      <span>Fibre {food.fibre}g</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2 pl-11 sm:pl-0 shrink-0">
                  <div className="text-right mr-2">
                    <span className="text-sm font-bold font-mono-nums text-slate-900 dark:text-slate-100">
                      {food.calories}
                    </span>{' '}
                    <span className="text-xs text-slate-500 dark:text-slate-400">kcal</span>
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
                    onClick={() => openAddFoodModal({ foodId: food.id, date: selectedDate })}
                    className="min-h-[38px] px-3.5 rounded-xl bg-lime-100 dark:bg-lime-950/70 text-lime-800 dark:text-lime-300 text-xs font-semibold hover:bg-lime-200/80 dark:hover:bg-lime-900/70 transition-colors inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Quick Add
                  </button>
                </div>
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
            addCustomFood({ ...data, category: 'Custom' });
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
