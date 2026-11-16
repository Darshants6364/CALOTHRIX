import React, { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { FoodItem } from '../types';

interface CustomFoodModalProps {
  isOpen: boolean;
  editingFood?: FoodItem;
  onClose: () => void;
  onSave: (data: {
    name: string;
    servingName: string;
    servingWeightGrams: number;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fibre: number;
  }) => void;
}

export const CustomFoodModal: React.FC<CustomFoodModalProps> = ({
  isOpen,
  editingFood,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [servingName, setServingName] = useState('100 g');
  const [servingWeightGrams, setServingWeightGrams] = useState('100');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [fibre, setFibre] = useState('0');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    if (editingFood) {
      setName(editingFood.name);
      setServingName(editingFood.servingName);
      setServingWeightGrams(String(editingFood.servingWeightGrams));
      setCalories(String(editingFood.calories));
      setProtein(String(editingFood.protein));
      setCarbs(String(editingFood.carbs));
      setFat(String(editingFood.fat));
      setFibre(String(editingFood.fibre));
    } else {
      setName('');
      setServingName('100 g');
      setServingWeightGrams('100');
      setCalories('');
      setProtein('');
      setCarbs('');
      setFat('');
      setFibre('0');
    }
  }, [editingFood, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const grams = parseFloat(servingWeightGrams);
    const cal = parseFloat(calories);
    const pro = parseFloat(protein || '0');
    const carb = parseFloat(carbs || '0');
    const f = parseFloat(fat || '0');
    const fib = parseFloat(fibre || '0');

    if (!name.trim()) {
      setError('Food name is required.');
      return;
    }
    if (!Number.isFinite(grams) || grams <= 0) {
      setError('Serving weight must be greater than 0 g.');
      return;
    }
    if (!Number.isFinite(cal) || cal < 0) {
      setError('Please enter valid calories.');
      return;
    }
    if ([pro, carb, f, fib].some((v) => !Number.isFinite(v) || v < 0)) {
      setError('Macro values cannot be negative.');
      return;
    }

    onSave({
      name: name.trim(),
      servingName: servingName.trim() || `${grams} g`,
      servingWeightGrams: grams,
      calories: cal,
      protein: pro,
      carbs: carb,
      fat: f,
      fibre: fib,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-xs sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editingFood ? 'Edit custom food' : 'Create custom food'}
    >
      <div className="w-full sm:max-w-md bg-white dark:bg-[#121821] rounded-t-3xl sm:rounded-2xl border border-stone-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="sm:hidden w-10 h-1.5 bg-stone-300 dark:bg-slate-700 rounded-full mx-auto mt-3" />

        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {editingFood ? 'Edit Custom Food' : 'Add Custom Food'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-stone-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80dvh] overflow-y-auto">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-xs font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Food Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Masala Oats Bowl"
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
                value={servingName}
                onChange={(e) => setServingName(e.target.value)}
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
                value={servingWeightGrams}
                onChange={(e) => setServingWeightGrams(e.target.value)}
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
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
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
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
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
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
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
                value={fat}
                onChange={(e) => setFat(e.target.value)}
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
                value={fibre}
                onChange={(e) => setFibre(e.target.value)}
                placeholder="0"
                className="w-full h-11 px-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/50 dark:bg-slate-900 text-sm font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full min-h-[48px] rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-sm font-semibold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            {editingFood ? 'Update Custom Food' : 'Save Custom Food'}
          </button>
        </form>
      </div>
    </div>
  );
};
