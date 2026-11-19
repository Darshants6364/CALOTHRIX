import { useState, useEffect, useMemo, type FormEvent } from 'react';
import {
  Plus,
  Search,
  Trash2,
  ArrowLeft,
  LogOut,
  SlidersHorizontal,
  Scale,
  Utensils,
  Sparkles,
} from 'lucide-react';
import { FOOD_DATABASE, type FoodItem } from '../data/macrologData';
import type { UserSession } from './AuthModal';

type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snacks';
type AppTab = 'macros' | 'weight' | 'upcoming';

interface LoggedEntry {
  uid: string;
  meal: MealType;
  item: FoodItem;
}

interface MacroTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface WeightEntry {
  id: string;
  date: string;
  weightKg: number;
  note?: string;
}

interface NutritionAppProps {
  session: UserSession;
  onBackToHomepage: () => void;
  onSignOut: () => void;
}

const STORAGE_ENTRIES_KEY = 'calothrix_app_entries_v1';
const STORAGE_TARGETS_KEY = 'calothrix_app_targets_v1';
const STORAGE_WEIGHTS_KEY = 'calothrix_app_weights_v1';
const STORAGE_UNIT_KEY = 'calothrix_app_weight_unit_v1';

const DEFAULT_TARGETS: MacroTargets = {
  calories: 2350,
  protein: 180,
  carbs: 245,
  fat: 65,
};

const SEED_WEIGHTS: WeightEntry[] = [
  { id: 'w-1', date: '2026-11-03', weightKg: 75.0, note: 'Starting check-in' },
  { id: 'w-2', date: '2026-11-07', weightKg: 74.7 },
  { id: 'w-3', date: '2026-11-11', weightKg: 74.5 },
  { id: 'w-4', date: '2026-11-15', weightKg: 74.3 },
  { id: 'w-5', date: '2026-11-17', weightKg: 74.2, note: 'Morning fasted' },
];

export function NutritionApp({ session, onBackToHomepage, onSignOut }: NutritionAppProps) {
  const [activeTab, setActiveTab] = useState<AppTab>('macros');

  const [entries, setEntries] = useState<LoggedEntry[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_ENTRIES_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore storage errors
    }
    return [
      { uid: 'seed-1', meal: 'Breakfast', item: FOOD_DATABASE[4] },
      { uid: 'seed-2', meal: 'Breakfast', item: FOOD_DATABASE[1] },
      { uid: 'seed-3', meal: 'Lunch', item: FOOD_DATABASE[0] },
      { uid: 'seed-4', meal: 'Lunch', item: FOOD_DATABASE[2] },
    ];
  });

  const [targets, setTargets] = useState<MacroTargets>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_TARGETS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore storage errors
    }
    return DEFAULT_TARGETS;
  });

  const [weights, setWeights] = useState<WeightEntry[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_WEIGHTS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return SEED_WEIGHTS;
  });

  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_UNIT_KEY);
      if (saved === 'lbs') return 'lbs';
    } catch {
      // ignore
    }
    return 'kg';
  });

  const [selectedMeal, setSelectedMeal] = useState<MealType>('Dinner');
  const [search, setSearch] = useState('');
  const [showTargetsEditor, setShowTargetsEditor] = useState(false);

  // Custom food form state
  const [customName, setCustomName] = useState('');
  const [customCalories, setCustomCalories] = useState('');
  const [customProtein, setCustomProtein] = useState('');
  const [customCarbs, setCustomCarbs] = useState('');
  const [customFat, setCustomFat] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  // Weight form state
  const [weightInput, setWeightInput] = useState('');
  const [weightDate, setWeightDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [weightNote, setWeightNote] = useState('');
  const [weightError, setWeightError] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ENTRIES_KEY, JSON.stringify(entries));
    } catch {
      // ignore
    }
  }, [entries]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_TARGETS_KEY, JSON.stringify(targets));
    } catch {
      // ignore
    }
  }, [targets]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_WEIGHTS_KEY, JSON.stringify(weights));
    } catch {
      // ignore
    }
  }, [weights]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_UNIT_KEY, weightUnit);
    } catch {
      // ignore
    }
  }, [weightUnit]);

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return FOOD_DATABASE;
    return FOOD_DATABASE.filter(
      (f) => f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q)
    );
  }, [search]);

  const totals = entries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.item.calories,
      protein: acc.protein + e.item.protein,
      carbs: acc.carbs + e.item.carbs,
      fat: acc.fat + e.item.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const addDatabaseFood = (item: FoodItem) => {
    setEntries((prev) => [
      ...prev,
      { uid: `${item.id}-${Date.now()}-${Math.random()}`, meal: selectedMeal, item },
    ]);
  };

  const addCustomFood = (e: FormEvent) => {
    e.preventDefault();
    setCustomError(null);
    const cal = Number(customCalories);
    const p = Number(customProtein || 0);
    const c = Number(customCarbs || 0);
    const f = Number(customFat || 0);

    if (!customName.trim() || !Number.isFinite(cal) || cal <= 0) {
      setCustomError('Enter a food name and valid calorie amount.');
      return;
    }

    const customItem: FoodItem = {
      id: `custom-${Date.now()}`,
      name: customName.trim(),
      serving: '1 serving',
      calories: Math.round(cal),
      protein: Math.max(0, Math.round(p)),
      carbs: Math.max(0, Math.round(c)),
      fat: Math.max(0, Math.round(f)),
      category: 'Meal',
    };

    addDatabaseFood(customItem);
    setCustomName('');
    setCustomCalories('');
    setCustomProtein('');
    setCustomCarbs('');
    setCustomFat('');
  };

  const removeEntry = (uid: string) => {
    setEntries((prev) => prev.filter((e) => e.uid !== uid));
  };

  const formatWeight = (kg: number) =>
    weightUnit === 'kg' ? kg.toFixed(1) : (kg * 2.20462).toFixed(1);

  const handleAddWeight = (e: FormEvent) => {
    e.preventDefault();
    setWeightError(null);
    const num = Number(weightInput);
    if (!Number.isFinite(num) || num <= 0) {
      setWeightError(`Enter a valid weight in ${weightUnit}.`);
      return;
    }

    const weightKg = weightUnit === 'kg' ? num : num / 2.20462;
    const newEntry: WeightEntry = {
      id: `w-${Date.now()}`,
      date: weightDate || new Date().toISOString().slice(0, 10),
      weightKg: Number(weightKg.toFixed(2)),
      note: weightNote.trim() || undefined,
    };

    setWeights((prev) =>
      [...prev, newEntry].sort((a, b) => a.date.localeCompare(b.date))
    );
    setWeightInput('');
    setWeightNote('');
  };

  const removeWeight = (id: string) => {
    setWeights((prev) => prev.filter((w) => w.id !== id));
  };

  const sortedWeights = useMemo(
    () => [...weights].sort((a, b) => a.date.localeCompare(b.date)),
    [weights]
  );

  const latestWeight = sortedWeights[sortedWeights.length - 1];
  const firstWeight = sortedWeights[0];
  const weightDeltaKg =
    latestWeight && firstWeight ? latestWeight.weightKg - firstWeight.weightKg : 0;

  // Responsive SVG trend points for Weight Tracking
  const chartWeights = sortedWeights.slice(-10);
  const svgW = 420;
  const svgH = 140;
  const minW = chartWeights.length ? Math.min(...chartWeights.map((w) => w.weightKg)) - 0.5 : 70;
  const maxW = chartWeights.length ? Math.max(...chartWeights.map((w) => w.weightKg)) + 0.5 : 80;
  const weightCoords = chartWeights.map((w, i) => {
    const x =
      chartWeights.length === 1 ? svgW / 2 : 24 + (i / (chartWeights.length - 1)) * (svgW - 48);
    const y = svgH - 22 - ((w.weightKg - minW) / Math.max(0.5, maxW - minW)) * (svgH - 44);
    return { x, y, entry: w };
  });
  const weightPolyline = weightCoords.map((pt) => `${pt.x},${pt.y}`).join(' ');

  const mealsOrder: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-20 sm:pb-8">
      {/* Authenticated Web App Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-display text-base sm:text-lg font-extrabold tracking-[0.12em] text-[#090A0C] whitespace-nowrap">
              CALOTHRIX
            </span>
            <span className="hidden sm:inline text-xs text-slate-500 truncate">
              {session.role === 'trainer' ? 'Trainer View' : 'Individual App'} · {session.name}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={onBackToHomepage}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Homepage</span>
              <span className="sm:hidden">Home</span>
            </button>
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#090A0C] px-3.5 py-1.5 text-xs font-semibold text-[#C8FF00] hover:bg-slate-800 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6 sm:space-y-8">
        {/* Web App Header & Navigation Switcher */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <p className="text-xs font-semibold text-emerald-700">
              Available Now · Macro Tracking &amp; Body Weight
            </p>
            <h1 className="mt-1 font-display text-2xl sm:text-3xl font-semibold text-slate-950">
              {activeTab === 'macros'
                ? "Today's Macro Log"
                : activeTab === 'weight'
                ? 'Body Weight Tracker'
                : 'Upcoming Features'}
            </h1>
          </div>

          {/* Mobile & Desktop Segmented App Navigation */}
          <div
            role="tablist"
            aria-label="CALOTHRIX web app sections"
            className="grid grid-cols-3 sm:inline-flex items-center gap-1 rounded-xl bg-slate-200/75 p-1 border border-slate-200"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'macros'}
              onClick={() => setActiveTab('macros')}
              className={`inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                activeTab === 'macros'
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              <Utensils className="h-3.5 w-3.5" aria-hidden="true" />
              Macros
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'weight'}
              onClick={() => setActiveTab('weight')}
              className={`inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                activeTab === 'weight'
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              <Scale className="h-3.5 w-3.5" aria-hidden="true" />
              Weight
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'upcoming'}
              onClick={() => setActiveTab('upcoming')}
              className={`inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                activeTab === 'upcoming'
                  ? 'bg-white text-slate-950 shadow-sm'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Next
            </button>
          </div>
        </div>

        {/* TAB 1: MACRO TRACKING */}
        {activeTab === 'macros' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-600">
                Log meals and monitor calories, protein, carbs, and fats in real time.
              </p>
              <button
                type="button"
                onClick={() => setShowTargetsEditor((prev) => !prev)}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors"
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                {showTargetsEditor ? 'Hide Targets' : 'Edit Macro Targets'}
              </button>
            </div>

            {showTargetsEditor && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                <h2 className="text-sm font-semibold text-slate-950 mb-4">
                  Daily Nutrition Targets
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {(['calories', 'protein', 'carbs', 'fat'] as const).map((field) => (
                    <div key={field}>
                      <label
                        htmlFor={`target-${field}`}
                        className="block text-xs font-medium text-slate-600 capitalize mb-1"
                      >
                        {field} ({field === 'calories' ? 'kcal' : 'g'})
                      </label>
                      <input
                        id={`target-${field}`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={targets[field]}
                        onChange={(e) =>
                          setTargets((prev) => ({
                            ...prev,
                            [field]: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                        className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Daily Summary KPI Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                <p className="text-xs font-medium text-slate-500">Calories</p>
                <p className="mt-1 font-mono text-xl sm:text-2xl font-semibold tabular-nums text-slate-950">
                  {totals.calories.toLocaleString()}
                  <span className="block sm:inline sm:ml-1 text-xs font-normal text-slate-500">
                    / {targets.calories.toLocaleString()} kcal
                  </span>
                </p>
                <div className="mt-3 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round((totals.calories / Math.max(1, targets.calories)) * 100)
                      )}%`,
                    }}
                  />
                </div>
              </div>

              {[
                { label: 'Protein', val: totals.protein, target: targets.protein, color: 'bg-emerald-600' },
                { label: 'Carbs', val: totals.carbs, target: targets.carbs, color: 'bg-sky-600' },
                { label: 'Fat', val: totals.fat, target: targets.fat, color: 'bg-amber-500' },
              ].map((m) => (
                <div key={m.label} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                  <p className="text-xs font-medium text-slate-500">{m.label}</p>
                  <p className="mt-1 font-mono text-xl sm:text-2xl font-semibold tabular-nums text-slate-950">
                    {m.val}g
                    <span className="block sm:inline sm:ml-1 text-xs font-normal text-slate-500">
                      / {m.target}g
                    </span>
                  </p>
                  <div className="mt-3 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${m.color}`}
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round((m.val / Math.max(1, m.target)) * 100)
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Food Logger & Meal Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
              {/* Food Search & Custom Entry first on mobile for quick thumb logging */}
              <div className="lg:col-span-5 lg:order-2 space-y-6">
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h2 className="font-display text-base font-semibold text-slate-950">Log Food</h2>
                    <select
                      aria-label="Target meal"
                      value={selectedMeal}
                      onChange={(e) => setSelectedMeal(e.target.value as MealType)}
                      className="min-h-[40px] rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
                    >
                      {mealsOrder.map((m) => (
                        <option key={m} value={m}>
                          Add to {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search foods..."
                      aria-label="Search food catalog"
                      className="w-full min-h-[44px] rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                    />
                  </div>

                  <div className="mt-4 max-h-64 overflow-y-auto divide-y divide-slate-100">
                    {filteredCatalog.length === 0 ? (
                      <p className="py-6 text-center text-xs text-slate-500">
                        No matching items found. Add a custom food below.
                      </p>
                    ) : (
                      filteredCatalog.map((food) => (
                        <div key={food.id} className="py-2.5 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">{food.name}</p>
                            <p className="text-xs text-slate-500 font-mono tabular-nums">
                              {food.calories} kcal · {food.protein}P · {food.carbs}C · {food.fat}F
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => addDatabaseFood(food)}
                            aria-label={`Log ${food.name}`}
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white hover:bg-emerald-600 transition-colors"
                          >
                            <Plus className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <form
                  onSubmit={addCustomFood}
                  className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3"
                >
                  <h3 className="font-display text-sm font-semibold text-slate-950">
                    Quick Custom Entry
                  </h3>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="Food name (e.g. Protein Shake)"
                    className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <div className="grid grid-cols-4 gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={customCalories}
                      onChange={(e) => setCustomCalories(e.target.value)}
                      placeholder="kcal"
                      aria-label="Custom calories"
                      className="min-h-[42px] rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs"
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={customProtein}
                      onChange={(e) => setCustomProtein(e.target.value)}
                      placeholder="P (g)"
                      aria-label="Custom protein grams"
                      className="min-h-[42px] rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs"
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={customCarbs}
                      onChange={(e) => setCustomCarbs(e.target.value)}
                      placeholder="C (g)"
                      aria-label="Custom carbs grams"
                      className="min-h-[42px] rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs"
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={customFat}
                      onChange={(e) => setCustomFat(e.target.value)}
                      placeholder="F (g)"
                      aria-label="Custom fat grams"
                      className="min-h-[42px] rounded-lg border border-slate-300 px-2.5 py-1.5 font-mono text-xs"
                    />
                  </div>
                  {customError && <p className="text-xs text-rose-600">{customError}</p>}
                  <button
                    type="submit"
                    className="w-full min-h-[44px] rounded-lg bg-[#090A0C] px-4 py-2 text-xs font-semibold text-[#C8FF00] hover:bg-slate-800 transition-colors"
                  >
                    Add Custom Food to {selectedMeal}
                  </button>
                </form>
              </div>

              {/* Meal Breakdown */}
              <div className="lg:col-span-7 lg:order-1 space-y-4">
                {mealsOrder.map((meal) => {
                  const mealEntries = entries.filter((e) => e.meal === meal);
                  const mealKcal = mealEntries.reduce((sum, e) => sum + e.item.calories, 0);
                  return (
                    <div key={meal} className="rounded-2xl border border-slate-200 bg-white p-5">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
                        <h2 className="font-display text-base font-semibold text-slate-950">
                          {meal}
                        </h2>
                        <span className="font-mono text-xs font-semibold tabular-nums text-slate-600">
                          {mealKcal} kcal
                        </span>
                      </div>

                      {mealEntries.length === 0 ? (
                        <p className="py-3 text-xs text-slate-400">
                          No foods logged for {meal.toLowerCase()} yet.
                        </p>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {mealEntries.map((entry) => (
                            <div
                              key={entry.uid}
                              className="py-2.5 flex items-center justify-between gap-4"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-900 truncate">
                                  {entry.item.name}
                                </p>
                                <p className="text-xs text-slate-500 font-mono tabular-nums">
                                  {entry.item.serving} · {entry.item.protein}P · {entry.item.carbs}C ·{' '}
                                  {entry.item.fat}F
                                </p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="font-mono text-xs font-semibold tabular-nums text-slate-800">
                                  {entry.item.calories} kcal
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removeEntry(entry.uid)}
                                  aria-label={`Remove ${entry.item.name}`}
                                  className="inline-flex h-9 w-9 items-center justify-center text-slate-400 hover:text-rose-600 transition-colors"
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: BODY WEIGHT TRACKING */}
        {activeTab === 'weight' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm text-slate-600">
                Track morning check-ins and follow your body weight trajectory over time.
              </p>
              <div className="inline-flex items-center gap-1 rounded-lg bg-slate-200/75 p-1">
                {(['kg', 'lbs'] as const).map((unit) => (
                  <button
                    key={unit}
                    type="button"
                    onClick={() => setWeightUnit(unit)}
                    className={`min-h-[36px] px-3 py-1 text-xs font-semibold rounded-md uppercase transition-colors ${
                      weightUnit === unit ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    {unit}
                  </button>
                ))}
              </div>
            </div>

            {/* Weight KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-medium text-slate-500">Latest Weight</p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-950">
                  {latestWeight ? `${formatWeight(latestWeight.weightKg)} ${weightUnit}` : '—'}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-medium text-slate-500">Change Since Start</p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-emerald-700">
                  {sortedWeights.length >= 2
                    ? `${weightDeltaKg > 0 ? '+' : ''}${formatWeight(weightDeltaKg)} ${weightUnit}`
                    : '—'}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-medium text-slate-500">Check-Ins Logged</p>
                <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-950">
                  {sortedWeights.length}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Log Weight Form */}
              <form
                onSubmit={handleAddWeight}
                className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4"
              >
                <h2 className="font-display text-base font-semibold text-slate-950">
                  Log Body Weight
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="weight-val"
                      className="block text-xs font-medium text-slate-600 mb-1"
                    >
                      Weight ({weightUnit})
                    </label>
                    <input
                      id="weight-val"
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      min="1"
                      value={weightInput}
                      onChange={(e) => setWeightInput(e.target.value)}
                      placeholder={weightUnit === 'kg' ? '74.1' : '163.4'}
                      className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="weight-date"
                      className="block text-xs font-medium text-slate-600 mb-1"
                    >
                      Date
                    </label>
                    <input
                      id="weight-date"
                      type="date"
                      value={weightDate}
                      onChange={(e) => setWeightDate(e.target.value)}
                      className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="weight-note"
                    className="block text-xs font-medium text-slate-600 mb-1"
                  >
                    Optional Note
                  </label>
                  <input
                    id="weight-note"
                    type="text"
                    value={weightNote}
                    onChange={(e) => setWeightNote(e.target.value)}
                    placeholder="e.g. Morning fasted"
                    className="w-full min-h-[44px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                {weightError && <p className="text-xs text-rose-600">{weightError}</p>}
                <button
                  type="submit"
                  className="w-full min-h-[44px] rounded-lg bg-[#090A0C] px-4 py-2.5 text-xs font-semibold text-[#C8FF00] hover:bg-slate-800 transition-colors"
                >
                  Save Weight Check-In
                </button>
              </form>

              {/* Trend Chart & History */}
              <div className="lg:col-span-7 space-y-5">
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-display text-base font-semibold text-slate-950">
                      Recent Trend
                    </h2>
                    <span className="font-mono text-xs text-slate-500">
                      Last {chartWeights.length} entries
                    </span>
                  </div>

                  {chartWeights.length === 0 ? (
                    <p className="py-8 text-center text-xs text-slate-500">
                      Log your first weight entry to visualize your trend.
                    </p>
                  ) : (
                    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-36">
                      {chartWeights.length > 1 && (
                        <polyline
                          fill="none"
                          stroke="#059669"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={weightPolyline}
                        />
                      )}
                      {weightCoords.map((pt) => (
                        <g key={pt.entry.id}>
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r="4"
                            fill="#FFFFFF"
                            stroke="#059669"
                            strokeWidth="2"
                          />
                          <text
                            x={pt.x}
                            y={svgH - 4}
                            textAnchor="middle"
                            className="fill-slate-500 text-[10px] font-mono"
                          >
                            {pt.entry.date.slice(5)}
                          </text>
                        </g>
                      ))}
                    </svg>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="font-display text-sm font-semibold text-slate-950 mb-3">
                    Check-In History
                  </h3>
                  {sortedWeights.length === 0 ? (
                    <p className="py-4 text-xs text-slate-400">No weight entries recorded.</p>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {[...sortedWeights].reverse().map((w) => (
                        <div
                          key={w.id}
                          className="py-2.5 flex items-center justify-between gap-4"
                        >
                          <div>
                            <p className="font-mono text-sm font-semibold tabular-nums text-slate-900">
                              {formatWeight(w.weightKg)} {weightUnit}
                            </p>
                            <p className="text-xs text-slate-500">
                              {w.date} {w.note ? `· ${w.note}` : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeWeight(w.id)}
                            aria-label={`Delete weight entry for ${w.date}`}
                            className="inline-flex h-9 w-9 items-center justify-center text-slate-400 hover:text-rose-600 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: HONEST UPCOMING FEATURES ROADMAP */}
        {activeTab === 'upcoming' && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 space-y-6">
            <div>
              <p className="text-xs font-semibold text-emerald-700">Platform Expansion</p>
              <h2 className="mt-1 font-display text-xl font-semibold text-slate-950">
                What&apos;s Live vs. What&apos;s Next
              </h2>
              <p className="mt-2 text-sm text-slate-600 max-w-2xl leading-relaxed">
                CALOTHRIX is focused first on getting daily macro tracking and body weight logging
                fast and reliable on web and mobile browsers. Additional capabilities are planned for
                upcoming releases.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-slate-200 pt-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                  Available Today
                </p>
                <ul className="mt-3 space-y-2.5 text-sm text-slate-800">
                  <li>· Daily calorie &amp; macronutrient tracking (Protein, Carbs, Fat)</li>
                  <li>· Searchable food catalog &amp; quick custom entries</li>
                  <li>· Body weight check-ins (kg / lbs) and trend graph</li>
                </ul>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Upcoming Features
                </p>
                <ul className="mt-3 space-y-2.5 text-sm text-slate-600">
                  <li>· Structured workout logging (sets, reps &amp; load history)</li>
                  <li>· Trainer client roster &amp; shared macro/weight check-ins</li>
                  <li>· Combined nutrition, training &amp; progress analytics</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Mobile Bottom Web-App Navigation Bar */}
      <nav
        aria-label="Mobile web app tabs"
        className="sm:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-3 h-16">
          <button
            type="button"
            onClick={() => setActiveTab('macros')}
            className={`flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
              activeTab === 'macros' ? 'text-emerald-700' : 'text-slate-500'
            }`}
          >
            <Utensils className="h-4 w-4" aria-hidden="true" />
            Macros
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('weight')}
            className={`flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
              activeTab === 'weight' ? 'text-emerald-700' : 'text-slate-500'
            }`}
          >
            <Scale className="h-4 w-4" aria-hidden="true" />
            Weight
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('upcoming')}
            className={`flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
              activeTab === 'upcoming' ? 'text-emerald-700' : 'text-slate-500'
            }`}
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Next
          </button>
        </div>
      </nav>
    </div>
  );
}
