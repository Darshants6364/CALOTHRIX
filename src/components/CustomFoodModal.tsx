import React, { useEffect, useState } from 'react';
import { Camera, Check, ChevronDown, ChevronUp, Loader2, Sparkles, X } from 'lucide-react';
import { scanNutritionLabelViaApi } from '../services/mealAiService';
import {
  FoodCategory,
  FoodItem,
  GLOBAL_FOOD_CATEGORIES,
  Micronutrients,
} from '../types';

const SERVING_UNIT_TEMPLATES: { label: string; servingName: string; grams: number }[] = [
  { label: '1 piece', servingName: '1 piece', grams: 50 },
  { label: '1 bowl', servingName: '1 bowl', grams: 200 },
  { label: '1 cup', servingName: '1 cup', grams: 240 },
  { label: '1 tbsp', servingName: '1 tablespoon', grams: 15 },
  { label: '1 tsp', servingName: '1 teaspoon', grams: 5 },
  { label: '100g', servingName: '100 g', grams: 100 },
];

export interface CustomFoodFormPayload {
  name: string;
  brand?: string;
  category: FoodCategory;
  servingName: string;
  servingWeightGrams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  micronutrients?: Micronutrients;
}

interface CustomFoodModalProps {
  isOpen: boolean;
  editingFood?: FoodItem;
  onClose: () => void;
  onSave: (data: CustomFoodFormPayload) => void;
}

export const CustomFoodModal: React.FC<CustomFoodModalProps> = ({
  isOpen,
  editingFood,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState<FoodCategory>('Homemade foods');
  const [servingName, setServingName] = useState('100 g');
  const [servingWeightGrams, setServingWeightGrams] = useState('100');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [fibre, setFibre] = useState('0');
  const [showOtherNutrients, setShowOtherNutrients] = useState(false);
  const [sugarG, setSugarG] = useState('');
  const [sodiumMg, setSodiumMg] = useState('');
  const [potassiumMg, setPotassiumMg] = useState('');
  const [calciumMg, setCalciumMg] = useState('');
  const [ironMg, setIronMg] = useState('');
  const [error, setError] = useState('');
  const [scanningLabel, setScanningLabel] = useState(false);
  const [labelScanStatus, setLabelScanStatus] = useState('');

  const compressLabelToJpegBase64 = async (file: File): Promise<string> => {
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Could not read selected image file.'));
        el.src = objectUrl;
      });
      const maxDim = 960;
      const scale = Math.min(1, maxDim / Math.max(1, img.naturalWidth || img.width, img.naturalHeight || img.height));
      const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
      const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
      return dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handleLabelImageChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError('');
    setLabelScanStatus('');
    setScanningLabel(true);
    try {
      const base64 = await compressLabelToJpegBase64(file);
      const result = await scanNutritionLabelViaApi({
        mimeType: 'image/jpeg',
        mediaBase64: base64,
      });
      if (result.name) setName(result.name);
      if (result.brand) setBrand(result.brand);
      setCategory('Packaged foods');
      if (result.servingName) setServingName(result.servingName);
      if (result.servingWeightGrams > 0) setServingWeightGrams(String(result.servingWeightGrams));
      setCalories(String(Math.round(result.calories || 0)));
      setProtein(String(result.protein ?? 0));
      setCarbs(String(result.carbs ?? 0));
      setFat(String(result.fat ?? 0));
      setFibre(String(result.fibre ?? 0));
      if (result.sugarG != null) {
        setSugarG(String(result.sugarG));
        setShowOtherNutrients(true);
      }
      if (result.sodiumMg != null) {
        setSodiumMg(String(result.sodiumMg));
        setShowOtherNutrients(true);
      }
      setLabelScanStatus(
        `Nutrition facts extracted (${result.confidence} confidence). Review and save below.`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not extract nutrition label facts.'
      );
    } finally {
      setScanningLabel(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setLabelScanStatus('');
    setScanningLabel(false);
    if (editingFood) {
      setName(editingFood.name);
      setBrand(editingFood.brand || '');
      setCategory(editingFood.category || 'Homemade foods');
      setServingName(editingFood.servingName);
      setServingWeightGrams(String(editingFood.servingWeightGrams));
      setCalories(String(editingFood.calories));
      setProtein(String(editingFood.protein));
      setCarbs(String(editingFood.carbs));
      setFat(String(editingFood.fat));
      setFibre(String(editingFood.fibre));
      const m = editingFood.micronutrients || {};
      const hasMicronutrients =
        m.sugarG != null ||
        m.sodiumMg != null ||
        m.potassiumMg != null ||
        m.calciumMg != null ||
        m.ironMg != null;
      setShowOtherNutrients(hasMicronutrients);
      setSugarG(m.sugarG != null ? String(m.sugarG) : '');
      setSodiumMg(m.sodiumMg != null ? String(m.sodiumMg) : '');
      setPotassiumMg(m.potassiumMg != null ? String(m.potassiumMg) : '');
      setCalciumMg(m.calciumMg != null ? String(m.calciumMg) : '');
      setIronMg(m.ironMg != null ? String(m.ironMg) : '');
    } else {
      setName('');
      setBrand('');
      setCategory('Homemade foods');
      setServingName('100 g');
      setServingWeightGrams('100');
      setCalories('');
      setProtein('');
      setCarbs('');
      setFat('');
      setFibre('0');
      setShowOtherNutrients(false);
      setSugarG('');
      setSodiumMg('');
      setPotassiumMg('');
      setCalciumMg('');
      setIronMg('');
    }
  }, [editingFood, isOpen]);

  if (!isOpen) return null;

  const parseOptionalNutrient = (raw: string): number | undefined => {
    if (!raw.trim()) return undefined;
    const num = parseFloat(raw);
    return Number.isFinite(num) && num >= 0 ? num : undefined;
  };

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

    const micronutrients: Micronutrients = {};
    const parsedSugar = parseOptionalNutrient(sugarG);
    const parsedSodium = parseOptionalNutrient(sodiumMg);
    const parsedPotassium = parseOptionalNutrient(potassiumMg);
    const parsedCalcium = parseOptionalNutrient(calciumMg);
    const parsedIron = parseOptionalNutrient(ironMg);

    if (parsedSugar !== undefined) micronutrients.sugarG = parsedSugar;
    if (parsedSodium !== undefined) micronutrients.sodiumMg = parsedSodium;
    if (parsedPotassium !== undefined) micronutrients.potassiumMg = parsedPotassium;
    if (parsedCalcium !== undefined) micronutrients.calciumMg = parsedCalcium;
    if (parsedIron !== undefined) micronutrients.ironMg = parsedIron;

    onSave({
      name: name.trim(),
      brand: brand.trim() || undefined,
      category,
      servingName: servingName.trim() || `${grams} g`,
      servingWeightGrams: grams,
      calories: cal,
      protein: pro,
      carbs: carb,
      fat: f,
      fibre: fib,
      micronutrients: Object.keys(micronutrients).length > 0 ? micronutrients : undefined,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editingFood ? 'Edit custom food' : 'Create custom food'}
    >
      <div className="w-full sm:max-w-lg bg-white dark:bg-[#111317] rounded-t-3xl sm:rounded-2xl border border-black/10 dark:border-white/12 shadow-2xl overflow-hidden">
        <div className="sm:hidden w-10 h-1.5 bg-stone-300 dark:bg-slate-700 rounded-full mx-auto mt-3" />

        <div className="flex items-center justify-between px-5 py-4 border-b border-black/10 dark:border-white/12">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {editingFood ? 'Edit Custom Food' : 'Add Custom Food'}
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Private to your account · Never alters verified reference foods
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-stone-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[82dvh] overflow-y-auto">
          <div className="p-3 rounded-xl border border-black/10 dark:border-white/12 bg-stone-50/80 dark:bg-[#090A0C]/70 flex flex-wrap items-center justify-between gap-2.5">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-lime-600 dark:text-lime-400" />
                Auto-Fill from Nutrition Label
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Upload or snap a back-of-pack nutrition table
              </p>
            </div>
            <label className="min-h-[36px] px-3 rounded-lg bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer hover:opacity-90 shrink-0">
              {scanningLabel ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Camera className="w-3.5 h-3.5" />
              )}
              <span>{scanningLabel ? 'Reading Label...' : 'Scan Label'}</span>
              <input
                type="file"
                accept="image/*"
                disabled={scanningLabel}
                onChange={handleLabelImageChosen}
                className="sr-only"
              />
            </label>
          </div>

          {labelScanStatus && (
            <div className="p-3 rounded-xl bg-lime-50 dark:bg-lime-950/40 border border-lime-300 dark:border-lime-800/60 text-lime-800 dark:text-lime-300 text-xs font-medium">
              {labelScanStatus}
            </div>
          )}

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
              className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Brand (optional)
              </label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="e.g., Homemade / Amul"
                className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as FoodCategory)}
                className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
              >
                {GLOBAL_FOOD_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
                <option value="Custom">Custom</option>
              </select>
            </div>
          </div>

          {/* Serving Unit Quick Templates */}
          <div>
            <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Quick Serving Units
            </span>
            <div className="flex flex-wrap gap-1.5">
              {SERVING_UNIT_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.label}
                  type="button"
                  onClick={() => {
                    setServingName(tpl.servingName);
                    setServingWeightGrams(String(tpl.grams));
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    servingName.toLowerCase() === tpl.servingName.toLowerCase()
                      ? 'bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 border-slate-900 dark:border-lime-500'
                      : 'border-black/10 dark:border-white/15 text-slate-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {tpl.label}
                </button>
              ))}
            </div>
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
                value={servingWeightGrams}
                onChange={(e) => setServingWeightGrams(e.target.value)}
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
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
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
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
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
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
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
                value={fat}
                onChange={(e) => setFat(e.target.value)}
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
                value={fibre}
                onChange={(e) => setFibre(e.target.value)}
                placeholder="0"
                className="w-full h-11 px-3 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-sm font-mono-nums text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
              />
            </div>
          </div>

          {/* Optional Micronutrients */}
          <div className="border-t border-stone-100 dark:border-white/12 pt-3">
            <button
              type="button"
              onClick={() => setShowOtherNutrients((v) => !v)}
              className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-lime-700 dark:hover:text-lime-400 inline-flex items-center gap-1"
            >
              {showOtherNutrients ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
              Other Nutrients (optional: Sugar, Sodium, Potassium, Calcium, Iron)
            </button>

            {showOtherNutrients && (
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Sugar (g)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={sugarG}
                    onChange={(e) => setSugarG(e.target.value)}
                    placeholder="—"
                    className="w-full h-10 px-3 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-xs font-mono-nums text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Sodium (mg)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={sodiumMg}
                    onChange={(e) => setSodiumMg(e.target.value)}
                    placeholder="—"
                    className="w-full h-10 px-3 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-xs font-mono-nums text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Potassium (mg)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={potassiumMg}
                    onChange={(e) => setPotassiumMg(e.target.value)}
                    placeholder="—"
                    className="w-full h-10 px-3 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-xs font-mono-nums text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Calcium (mg)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={calciumMg}
                    onChange={(e) => setCalciumMg(e.target.value)}
                    placeholder="—"
                    className="w-full h-10 px-3 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-xs font-mono-nums text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Iron (mg)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={ironMg}
                    onChange={(e) => setIronMg(e.target.value)}
                    placeholder="—"
                    className="w-full h-10 px-3 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/50 dark:bg-[#090A0C] text-xs font-mono-nums text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>
            )}
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
