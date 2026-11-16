import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_FOODS } from '../data/defaultFoods';
import {
  exportFoodAndWeightAsCsv,
  exportStateAsJson,
  storageService,
} from '../services/storageService';
import {
  AppSettings,
  FoodItem,
  FoodLogEntry,
  MacroLogPersistedState,
  MealCategory,
  NavTab,
  NutritionGoals,
  ToastMessage,
  UserProfile,
  WeightEntry,
  WeightGoal,
} from '../types';
import { getTodayDateKey } from '../utils/dateUtils';
import {
  calculateScaledNutrition,
  getEntriesForDate,
  sortWeightEntriesChronological,
  sumMacros,
} from '../utils/nutritionUtils';

interface FoodModalState {
  isOpen: boolean;
  initialMeal: MealCategory;
  preselectedFoodId?: string;
  editingEntry?: FoodLogEntry;
  targetDate: string;
}

interface WeightModalState {
  isOpen: boolean;
  editingEntry?: WeightEntry;
}

interface MacroLogContextValue {
  state: MacroLogPersistedState;
  resolvedTheme: 'light' | 'dark';
  toggleTheme: () => void;
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  selectedDate: string;
  setSelectedDate: (dateKey: string) => void;
  allFoods: FoodItem[];
  selectedDateEntries: FoodLogEntry[];
  selectedDateTotals: ReturnType<typeof sumMacros>;
  latestWeightEntry?: WeightEntry;
  previousWeightEntry?: WeightEntry;
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
  notify: (message: string, type?: ToastMessage['type']) => void;
  // Food Modal Controls
  foodModal: FoodModalState;
  openAddFoodModal: (options?: {
    meal?: MealCategory;
    foodId?: string;
    date?: string;
  }) => void;
  openEditFoodModal: (entry: FoodLogEntry) => void;
  closeFoodModal: () => void;
  // Weight Modal Controls
  weightModal: WeightModalState;
  openWeightModal: (editingEntry?: WeightEntry) => void;
  closeWeightModal: () => void;
  // Food Entry Actions
  addFoodEntry: (params: {
    food: FoodItem;
    quantityGrams: number;
    mealType: MealCategory;
    date: string;
  }) => void;
  updateFoodEntry: (
    entryId: string,
    params: { food: FoodItem; quantityGrams: number; mealType: MealCategory; date: string }
  ) => void;
  deleteFoodEntry: (entryId: string) => void;
  duplicateFoodEntry: (entry: FoodLogEntry, targetDate?: string) => void;
  // Custom Food Actions
  addCustomFood: (
    food: Omit<FoodItem, 'id' | 'isCustom' | 'createdAt' | 'userId'>
  ) => FoodItem;
  updateCustomFood: (
    foodId: string,
    updates: Partial<Omit<FoodItem, 'id' | 'isCustom'>>
  ) => void;
  deleteCustomFood: (foodId: string) => void;
  toggleFavoriteFood: (foodId: string) => void;
  // Goals Actions
  updateGoals: (goals: Omit<NutritionGoals, 'userId' | 'updatedAt'>) => void;
  // Weight Actions
  addWeightEntry: (params: { weightKg: number; date: string; notes?: string }) => void;
  updateWeightEntry: (
    entryId: string,
    params: { weightKg: number; date: string; notes?: string }
  ) => void;
  deleteWeightEntry: (entryId: string) => void;
  updateWeightGoal: (goal: Omit<WeightGoal, 'userId' | 'updatedAt'>) => void;
  // Profile & Settings Actions
  updateProfile: (updates: Partial<UserProfile>) => void;
  updateSettings: (updates: Partial<AppSettings>) => void;
  exportData: (format: 'json' | 'csv') => void;
  resetDemoData: () => void;
  clearAllData: () => void;
}

const MacroLogContext = createContext<MacroLogContextValue | null>(null);

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export const MacroLogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<MacroLogPersistedState>(() => storageService.loadState());
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayDateKey());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const [foodModal, setFoodModal] = useState<FoodModalState>({
    isOpen: false,
    initialMeal: 'breakfast',
    targetDate: getTodayDateKey(),
  });

  const [weightModal, setWeightModal] = useState<WeightModalState>({
    isOpen: false,
  });

  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolvedTheme: 'light' | 'dark' =
    state.settings.theme === 'system'
      ? systemPrefersDark
        ? 'dark'
        : 'light'
      : state.settings.theme;

  // Sync dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [resolvedTheme]);

  // Persist every state change
  useEffect(() => {
    storageService.saveState(state);
  }, [state]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback((message: string, type: ToastMessage['type'] = 'success') => {
    const id = makeId('toast');
    setToasts((prev) => [...prev.slice(-2), { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const allFoods = useMemo(
    () => [...state.customFoods, ...DEFAULT_FOODS],
    [state.customFoods]
  );

  const selectedDateEntries = useMemo(
    () => getEntriesForDate(state.foodEntries, selectedDate),
    [state.foodEntries, selectedDate]
  );

  const selectedDateTotals = useMemo(
    () => sumMacros(selectedDateEntries),
    [selectedDateEntries]
  );

  const sortedWeightsDesc = useMemo(
    () => sortWeightEntriesChronological(state.weightEntries, 'desc'),
    [state.weightEntries]
  );

  const latestWeightEntry = sortedWeightsDesc[0];
  const previousWeightEntry = sortedWeightsDesc[1];

  const openAddFoodModal = useCallback(
    (options?: { meal?: MealCategory; foodId?: string; date?: string }) => {
      setFoodModal({
        isOpen: true,
        initialMeal: options?.meal ?? 'breakfast',
        preselectedFoodId: options?.foodId,
        targetDate: options?.date ?? selectedDate,
      });
    },
    [selectedDate]
  );

  const openEditFoodModal = useCallback((entry: FoodLogEntry) => {
    setFoodModal({
      isOpen: true,
      initialMeal: entry.mealType,
      preselectedFoodId: entry.foodId,
      editingEntry: entry,
      targetDate: entry.date,
    });
  }, []);

  const closeFoodModal = useCallback(() => {
    setFoodModal((prev) => ({ ...prev, isOpen: false, editingEntry: undefined, preselectedFoodId: undefined }));
  }, []);

  const openWeightModal = useCallback((editingEntry?: WeightEntry) => {
    setWeightModal({ isOpen: true, editingEntry });
  }, []);

  const closeWeightModal = useCallback(() => {
    setWeightModal({ isOpen: false, editingEntry: undefined });
  }, []);

  const addFoodEntry = useCallback(
    ({
      food,
      quantityGrams,
      mealType,
      date,
    }: {
      food: FoodItem;
      quantityGrams: number;
      mealType: MealCategory;
      date: string;
    }) => {
      const scaled = calculateScaledNutrition(food, quantityGrams);
      const servingsCount =
        Math.round((quantityGrams / Math.max(1, food.servingWeightGrams)) * 100) / 100;
      const now = new Date().toISOString();
      const newEntry: FoodLogEntry = {
        id: makeId('entry'),
        userId: state.profile.id,
        date,
        mealType,
        foodId: food.id,
        foodName: food.name,
        quantityGrams,
        servingsCount,
        servingName: food.servingName,
        ...scaled,
        createdAt: now,
        updatedAt: now,
      };

      setState((prev) => ({
        ...prev,
        foodEntries: [newEntry, ...prev.foodEntries],
        recentFoodIds: [food.id, ...prev.recentFoodIds.filter((id) => id !== food.id)].slice(0, 12),
      }));
      notify(`Added ${food.name} (${scaled.calories} kcal)`);
    },
    [notify, state.profile.id]
  );

  const updateFoodEntry = useCallback(
    (
      entryId: string,
      {
        food,
        quantityGrams,
        mealType,
        date,
      }: { food: FoodItem; quantityGrams: number; mealType: MealCategory; date: string }
    ) => {
      const scaled = calculateScaledNutrition(food, quantityGrams);
      const servingsCount =
        Math.round((quantityGrams / Math.max(1, food.servingWeightGrams)) * 100) / 100;
      const now = new Date().toISOString();

      setState((prev) => ({
        ...prev,
        foodEntries: prev.foodEntries.map((e) =>
          e.id === entryId
            ? {
                ...e,
                date,
                mealType,
                foodId: food.id,
                foodName: food.name,
                quantityGrams,
                servingsCount,
                servingName: food.servingName,
                ...scaled,
                updatedAt: now,
              }
            : e
        ),
      }));
      notify(`Updated ${food.name}`);
    },
    [notify]
  );

  const deleteFoodEntry = useCallback(
    (entryId: string) => {
      setState((prev) => ({
        ...prev,
        foodEntries: prev.foodEntries.filter((e) => e.id !== entryId),
      }));
      notify('Food entry removed', 'info');
    },
    [notify]
  );

  const duplicateFoodEntry = useCallback(
    (entry: FoodLogEntry, targetDate?: string) => {
      const now = new Date().toISOString();
      const copy: FoodLogEntry = {
        ...entry,
        id: makeId('entry'),
        date: targetDate ?? entry.date,
        createdAt: now,
        updatedAt: now,
      };
      setState((prev) => ({
        ...prev,
        foodEntries: [copy, ...prev.foodEntries],
      }));
      notify(`Duplicated ${entry.foodName}`);
    },
    [notify]
  );

  const addCustomFood = useCallback(
    (food: Omit<FoodItem, 'id' | 'isCustom' | 'createdAt' | 'userId'>) => {
      const newFood: FoodItem = {
        ...food,
        id: makeId('custom-food'),
        userId: state.profile.id,
        isCustom: true,
        category: 'Custom',
        createdAt: new Date().toISOString(),
      };
      setState((prev) => ({
        ...prev,
        customFoods: [newFood, ...prev.customFoods],
      }));
      notify(`Saved custom food "${newFood.name}"`);
      return newFood;
    },
    [notify, state.profile.id]
  );

  const updateCustomFood = useCallback(
    (foodId: string, updates: Partial<Omit<FoodItem, 'id' | 'isCustom'>>) => {
      setState((prev) => ({
        ...prev,
        customFoods: prev.customFoods.map((f) => (f.id === foodId ? { ...f, ...updates } : f)),
      }));
      notify('Custom food updated');
    },
    [notify]
  );

  const deleteCustomFood = useCallback(
    (foodId: string) => {
      setState((prev) => ({
        ...prev,
        customFoods: prev.customFoods.filter((f) => f.id !== foodId),
        favoriteFoodIds: prev.favoriteFoodIds.filter((id) => id !== foodId),
        recentFoodIds: prev.recentFoodIds.filter((id) => id !== foodId),
      }));
      notify('Custom food deleted', 'info');
    },
    [notify]
  );

  const toggleFavoriteFood = useCallback((foodId: string) => {
    setState((prev) => {
      const exists = prev.favoriteFoodIds.includes(foodId);
      return {
        ...prev,
        favoriteFoodIds: exists
          ? prev.favoriteFoodIds.filter((id) => id !== foodId)
          : [foodId, ...prev.favoriteFoodIds],
      };
    });
  }, []);

  const updateGoals = useCallback(
    (goals: Omit<NutritionGoals, 'userId' | 'updatedAt'>) => {
      const now = new Date().toISOString();
      setState((prev) => ({
        ...prev,
        goals: {
          ...goals,
          userId: prev.profile.id,
          updatedAt: now,
        },
        profile:
          goals.targetWeightKg !== undefined
            ? { ...prev.profile, targetWeightKg: goals.targetWeightKg }
            : prev.profile,
        weightGoal:
          goals.targetWeightKg !== undefined
            ? {
                ...prev.weightGoal,
                targetWeightKg: goals.targetWeightKg,
                updatedAt: now,
              }
            : prev.weightGoal,
      }));
      notify('Nutrition goals saved');
    },
    [notify]
  );

  const addWeightEntry = useCallback(
    ({ weightKg, date, notes }: { weightKg: number; date: string; notes?: string }) => {
      const now = new Date().toISOString();
      const newEntry: WeightEntry = {
        id: makeId('weight'),
        userId: state.profile.id,
        weightKg,
        date,
        notes: notes?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      };
      setState((prev) => {
        const updated = [newEntry, ...prev.weightEntries];
        const sortedDesc = sortWeightEntriesChronological(updated, 'desc');
        const latestKg = sortedDesc[0]?.weightKg ?? weightKg;
        return {
          ...prev,
          weightEntries: updated,
          profile: {
            ...prev.profile,
            currentWeightKg: latestKg,
          },
        };
      });
      notify('Weight entry recorded');
    },
    [notify, state.profile.id]
  );

  const updateWeightEntry = useCallback(
    (entryId: string, { weightKg, date, notes }: { weightKg: number; date: string; notes?: string }) => {
      const now = new Date().toISOString();
      setState((prev) => {
        const updated = prev.weightEntries.map((w) =>
          w.id === entryId
            ? { ...w, weightKg, date, notes: notes?.trim() || undefined, updatedAt: now }
            : w
        );
        const sortedDesc = sortWeightEntriesChronological(updated, 'desc');
        const latestKg = sortedDesc[0]?.weightKg ?? prev.profile.currentWeightKg;
        return {
          ...prev,
          weightEntries: updated,
          profile: {
            ...prev.profile,
            currentWeightKg: latestKg,
          },
        };
      });
      notify('Weight entry updated');
    },
    [notify]
  );

  const deleteWeightEntry = useCallback(
    (entryId: string) => {
      setState((prev) => {
        const updated = prev.weightEntries.filter((w) => w.id !== entryId);
        const sortedDesc = sortWeightEntriesChronological(updated, 'desc');
        const latestKg = sortedDesc[0]?.weightKg ?? prev.profile.currentWeightKg;
        return {
          ...prev,
          weightEntries: updated,
          profile: {
            ...prev.profile,
            currentWeightKg: latestKg,
          },
        };
      });
      notify('Weight entry deleted', 'info');
    },
    [notify]
  );

  const updateWeightGoal = useCallback(
    (goal: Omit<WeightGoal, 'userId' | 'updatedAt'>) => {
      const now = new Date().toISOString();
      setState((prev) => ({
        ...prev,
        weightGoal: {
          ...goal,
          userId: prev.profile.id,
          updatedAt: now,
        },
        profile: {
          ...prev.profile,
          targetWeightKg: goal.targetWeightKg,
        },
        goals: {
          ...prev.goals,
          targetWeightKg: goal.targetWeightKg,
        },
      }));
      notify('Weight goal updated');
    },
    [notify]
  );

  const updateProfile = useCallback(
    (updates: Partial<UserProfile>) => {
      setState((prev) => ({
        ...prev,
        profile: { ...prev.profile, ...updates },
      }));
      notify('Profile saved');
    },
    [notify]
  );

  const updateSettings = useCallback((updates: Partial<AppSettings>) => {
    setState((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...updates },
    }));
  }, []);

  const exportData = useCallback(
    (format: 'json' | 'csv') => {
      const content =
        format === 'json' ? exportStateAsJson(state) : exportFoodAndWeightAsCsv(state);
      const blob = new Blob([content], {
        type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `calothrix-export-${getTodayDateKey()}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      notify(`Exported data as ${format.toUpperCase()}`);
    },
    [notify, state]
  );

  const resetDemoData = useCallback(() => {
    const fresh = storageService.resetToDemo();
    setState(fresh);
    setSelectedDate(getTodayDateKey());
    notify('Demo data restored');
  }, [notify]);

  const clearAllData = useCallback(() => {
    const empty = storageService.clearAll(state.settings.theme);
    setState(empty);
    setSelectedDate(getTodayDateKey());
    notify('All demo data cleared — starting fresh', 'info');
  }, [notify, state.settings.theme]);

  const toggleTheme = useCallback(() => {
    setState((prev) => {
      const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
      return {
        ...prev,
        settings: { ...prev.settings, theme: nextTheme },
      };
    });
  }, [resolvedTheme]);

  const value: MacroLogContextValue = {
    state,
    resolvedTheme,
    toggleTheme,
    activeTab,
    setActiveTab,
    selectedDate,
    setSelectedDate,
    allFoods,
    selectedDateEntries,
    selectedDateTotals,
    latestWeightEntry,
    previousWeightEntry,
    toasts,
    dismissToast,
    notify,
    foodModal,
    openAddFoodModal,
    openEditFoodModal,
    closeFoodModal,
    weightModal,
    openWeightModal,
    closeWeightModal,
    addFoodEntry,
    updateFoodEntry,
    deleteFoodEntry,
    duplicateFoodEntry,
    addCustomFood,
    updateCustomFood,
    deleteCustomFood,
    toggleFavoriteFood,
    updateGoals,
    addWeightEntry,
    updateWeightEntry,
    deleteWeightEntry,
    updateWeightGoal,
    updateProfile,
    updateSettings,
    exportData,
    resetDemoData,
    clearAllData,
  };

  return <MacroLogContext.Provider value={value}>{children}</MacroLogContext.Provider>;
};

export function useMacroLogStore(): MacroLogContextValue {
  const ctx = useContext(MacroLogContext);
  if (!ctx) {
    throw new Error('useMacroLogStore must be used inside MacroLogProvider');
  }
  return ctx;
}
