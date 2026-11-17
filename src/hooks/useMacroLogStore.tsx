import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { DEFAULT_FOODS } from '../data/defaultFoods';
import { createEmptyState } from '../data/demoData';
import {
  supabase,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from '../lib/supabaseClient';
import {
  exportFoodAndWeightAsCsv,
  exportStateAsJson,
} from '../services/storageService';
import {
  createZeroUserState,
  DbMutationResult,
  deleteCustomFoodDb,
  deleteFoodEntryDb,
  deleteWeightEntryDb,
  extractAuthDetails,
  insertCustomFoodDb,
  insertFoodEntryDb,
  insertWeightEntryDb,
  loadUserStateFromSupabase,
  syncLocalStateToSupabase,
  updateCustomFoodDb,
  updateFoodEntryDb,
  updateWeightEntryDb,
  upsertFoodPreferencesDb,
  upsertNutritionGoals,
  upsertProfileAndSettings,
  upsertWeightGoal,
} from '../services/supabaseDataService';
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

export type AuthMode = 'loading' | 'unauthenticated' | 'authenticated';

interface FoodModalState {
  isOpen: boolean;
  initialMeal: MealCategory;
  preselectedFoodId?: string;
  preselectedFood?: FoodItem;
  editingEntry?: FoodLogEntry;
  targetDate: string;
}

interface WeightModalState {
  isOpen: boolean;
  editingEntry?: WeightEntry;
}

interface MacroLogContextValue {
  state: MacroLogPersistedState;
  authMode: AuthMode;
  authUser: User | null;
  authDetails: { name: string; email: string; avatarUrl?: string; provider: string } | null;
  needsSchemaSetup: boolean;
  syncingDb: boolean;
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
  // Auth Actions
  signInWithGoogle: () => Promise<{ error?: string }>;
  signInWithEmail: (email: string, password: string) => Promise<{ error?: string }>;
  signUpWithEmail: (
    name: string,
    email: string,
    password: string
  ) => Promise<{ error?: string; needsEmailConfirmation?: boolean }>;
  signInWithMagicLink: (email: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  retrySupabaseSync: () => Promise<boolean>;
  // Food Modal Controls
  foodModal: FoodModalState;
  openAddFoodModal: (options?: {
    meal?: MealCategory;
    foodId?: string;
    food?: FoodItem;
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
}

const MacroLogContext = createContext<MacroLogContextValue | null>(null);

function makeId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export const MacroLogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authMode, setAuthMode] = useState<AuthMode>('loading');
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [needsSchemaSetup, setNeedsSchemaSetup] = useState(false);
  const [syncingDb, setSyncingDb] = useState(false);

  const [state, setState] = useState<MacroLogPersistedState>(() => {
    const savedTheme =
      (localStorage.getItem('calothrix_theme_pref_v2') as AppSettings['theme'] | null) || 'dark';
    return createEmptyState(savedTheme);
  });

  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayDateKey());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const stateRef = useRef(state);
  stateRef.current = state;
  const authUserRef = useRef(authUser);
  authUserRef.current = authUser;

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

  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('calothrix_theme_pref_v2', state.settings.theme);
  }, [resolvedTheme, state.settings.theme]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback((message: string, type: ToastMessage['type'] = 'success') => {
    const id = makeId('toast');
    setToasts((prev) => [...prev.slice(-2), { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
  }, []);

  const handleDbResult = useCallback(
    (res: DbMutationResult) => {
      if (res.ok) return;
      if (res.needsSetup) {
        setNeedsSchemaSetup(true);
      }
      notify(res.errorMessage || 'Could not save to Supabase database', 'error');
    },
    [notify]
  );

  const hydrateForUser = useCallback(async (user: User) => {
    setAuthUser(user);
    const savedTheme =
      (localStorage.getItem('calothrix_theme_pref_v2') as AppSettings['theme'] | null) || 'dark';
    setSyncingDb(true);
    try {
      const result = await loadUserStateFromSupabase(user, savedTheme);
      setState(result.state);
      setNeedsSchemaSetup(result.needsSchemaSetup);
      setAuthMode('authenticated');
    } catch {
      setState(createZeroUserState(user, savedTheme));
      setNeedsSchemaSetup(true);
      setAuthMode('authenticated');
    } finally {
      setSyncingDb(false);
    }
  }, []);

  // Initialize Supabase Auth & Popup OAuth listener
  useEffect(() => {
    let mounted = true;
    localStorage.removeItem('calothrix_demo_preview_active');

    const init = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!mounted) return;
        if (session?.user) {
          await hydrateForUser(session.user);
        } else {
          setAuthMode('unauthenticated');
        }
      } catch {
        if (!mounted) return;
        setAuthMode('unauthenticated');
      }
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT') {
        setAuthUser(null);
        setNeedsSchemaSetup(false);
        const savedTheme =
          (localStorage.getItem('calothrix_theme_pref_v2') as AppSettings['theme'] | null) || 'dark';
        setState(createEmptyState(savedTheme));
        setAuthMode('unauthenticated');
        setActiveTab('home');
      } else if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        if (authUserRef.current?.id !== session.user.id) {
          void hydrateForUser(session.user);
        } else {
          setAuthUser(session.user);
        }
      }
    });

    const handleOAuthMessage = async (event: MessageEvent) => {
      if (!event.data || event.data.type !== 'CALOTHRIX_SUPABASE_OAUTH') return;
      const hashStr: string = event.data.hash || '';
      const searchStr: string = event.data.search || '';
      const hashParams = new URLSearchParams(hashStr.replace(/^#/, ''));
      const searchParams = new URLSearchParams(searchStr.replace(/^\?/, ''));

      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const errorDesc =
        hashParams.get('error_description') || searchParams.get('error_description');

      if (errorDesc) {
        notify(decodeURIComponent(errorDesc), 'error');
        return;
      }

      if (accessToken && refreshToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          notify(error.message, 'error');
          return;
        }
        if (data.user) {
          await hydrateForUser(data.user);
          notify('Signed in with Google');
        }
      }
    };

    window.addEventListener('message', handleOAuthMessage);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      window.removeEventListener('message', handleOAuthMessage);
    };
  }, [hydrateForUser, notify]);

  const authDetails = useMemo(
    () => (authUser ? extractAuthDetails(authUser) : null),
    [authUser]
  );

  // Auth Methods
  const signInWithGoogle = useCallback(async (): Promise<{ error?: string }> => {
    try {
      try {
        const settingsRes = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
          headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
        });
        if (settingsRes.ok) {
          const authSettings = (await settingsRes.json()) as {
            external?: { google?: boolean };
          };
          if (authSettings.external && authSettings.external.google === false) {
            return {
              error:
                'Google sign-in is not enabled in your Supabase project yet. Enable it under Authentication → Providers → Google, or sign in with Email below.',
            };
          }
        }
      } catch {
        // Proceed if preflight check fails
      }

      const redirectTo = `${window.location.origin}/auth/callback`;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: {
            prompt: 'select_account',
          },
        },
      });

      if (error) return { error: error.message };
      if (!data?.url) return { error: 'Could not generate Google sign-in URL.' };

      const popup = window.open(
        data.url,
        'calothrix_google_oauth',
        'width=520,height=660,menubar=no,toolbar=no'
      );

      if (!popup) {
        return {
          error: 'Popup was blocked by your browser. Please allow popups for this site and try again.',
        };
      }
      return {};
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : 'Google sign-in failed.',
      };
    }
  }, []);

  const signInWithEmail = useCallback(
    async (email: string, password: string): Promise<{ error?: string }> => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) return { error: error.message };
      if (data.user) {
        await hydrateForUser(data.user);
        notify('Signed in successfully');
      }
      return {};
    },
    [hydrateForUser, notify]
  );

  const signUpWithEmail = useCallback(
    async (
      name: string,
      email: string,
      password: string
    ): Promise<{ error?: string; needsEmailConfirmation?: boolean }> => {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: name.trim(),
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) return { error: error.message };
      if (data.session && data.user) {
        await hydrateForUser(data.user);
        notify('Account created and signed in');
        return {};
      }
      return { needsEmailConfirmation: true };
    },
    [hydrateForUser, notify]
  );

  const signInWithMagicLink = useCallback(
    async (email: string): Promise<{ error?: string }> => {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) return { error: error.message };
      return {};
    },
    []
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setAuthUser(null);
    setNeedsSchemaSetup(false);
    const savedTheme =
      (localStorage.getItem('calothrix_theme_pref_v2') as AppSettings['theme'] | null) || 'dark';
    setState(createEmptyState(savedTheme));
    setAuthMode('unauthenticated');
    setActiveTab('home');
    notify('Signed out', 'info');
  }, [notify]);

  const retrySupabaseSync = useCallback(async (): Promise<boolean> => {
    const user = authUserRef.current;
    if (!user) return false;
    setSyncingDb(true);
    try {
      const syncRes = await syncLocalStateToSupabase(user.id, stateRef.current);
      if (syncRes.ok) {
        setNeedsSchemaSetup(false);
        const fresh = await loadUserStateFromSupabase(user, stateRef.current.settings.theme);
        setState(fresh.state);
        notify('Connected and synced to Supabase database');
        return true;
      }
      notify(syncRes.errorMessage || 'Database tables or permissions need SQL setup first.', 'error');
      return false;
    } finally {
      setSyncingDb(false);
    }
  }, [notify]);

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
    (options?: { meal?: MealCategory; foodId?: string; food?: FoodItem; date?: string }) => {
      setFoodModal({
        isOpen: true,
        initialMeal: options?.meal ?? 'breakfast',
        preselectedFoodId: options?.foodId ?? options?.food?.id,
        preselectedFood: options?.food,
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
    setFoodModal((prev) => ({
      ...prev,
      isOpen: false,
      editingEntry: undefined,
      preselectedFoodId: undefined,
      preselectedFood: undefined,
    }));
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
      const user = authUserRef.current;
      if (!user) return;

      const scaled = calculateScaledNutrition(food, quantityGrams);
      const servingsCount =
        Math.round((quantityGrams / Math.max(1, food.servingWeightGrams)) * 100) / 100;
      const now = new Date().toISOString();
      const newEntry: FoodLogEntry = {
        id: makeId('entry'),
        userId: user.id,
        date,
        mealType,
        foodId: food.id,
        foodName: food.brand ? `${food.name} (${food.brand})` : food.name,
        quantityGrams,
        servingsCount,
        servingName: food.servingName,
        sourceName: food.sourceName || (food.isCustom ? 'Personal Custom Food' : 'Reference'),
        sourceType: food.sourceType || (food.isCustom ? 'personal_custom' : 'verified_reference'),
        ...scaled,
        createdAt: now,
        updatedAt: now,
      };

      const nextRecents = [
        food.id,
        ...stateRef.current.recentFoodIds.filter((id) => id !== food.id),
      ].slice(0, 12);

      setState((prev) => ({
        ...prev,
        foodEntries: [newEntry, ...prev.foodEntries],
        recentFoodIds: nextRecents,
      }));

      void insertFoodEntryDb(newEntry).then(handleDbResult);
      void upsertFoodPreferencesDb(user.id, stateRef.current.favoriteFoodIds, nextRecents);
      notify(`Added ${food.name} (${scaled.calories} kcal)`);
    },
    [handleDbResult, notify]
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
      let updatedEntry: FoodLogEntry | null = null;

      setState((prev) => ({
        ...prev,
        foodEntries: prev.foodEntries.map((e) => {
          if (e.id !== entryId) return e;
          updatedEntry = {
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
          };
          return updatedEntry;
        }),
      }));

      if (updatedEntry) {
        void updateFoodEntryDb(updatedEntry).then(handleDbResult);
      }
      notify(`Updated ${food.name}`);
    },
    [handleDbResult, notify]
  );

  const deleteFoodEntry = useCallback(
    (entryId: string) => {
      const user = authUserRef.current;
      if (!user) return;
      setState((prev) => ({
        ...prev,
        foodEntries: prev.foodEntries.filter((e) => e.id !== entryId),
      }));
      void deleteFoodEntryDb(user.id, entryId).then(handleDbResult);
      notify('Food entry removed', 'info');
    },
    [handleDbResult, notify]
  );

  const duplicateFoodEntry = useCallback(
    (entry: FoodLogEntry, targetDate?: string) => {
      const user = authUserRef.current;
      if (!user) return;
      const now = new Date().toISOString();
      const copy: FoodLogEntry = {
        ...entry,
        id: makeId('entry'),
        userId: user.id,
        date: targetDate ?? entry.date,
        createdAt: now,
        updatedAt: now,
      };
      setState((prev) => ({
        ...prev,
        foodEntries: [copy, ...prev.foodEntries],
      }));
      void insertFoodEntryDb(copy).then(handleDbResult);
      notify(`Duplicated ${entry.foodName}`);
    },
    [handleDbResult, notify]
  );

  const addCustomFood = useCallback(
    (food: Omit<FoodItem, 'id' | 'isCustom' | 'createdAt' | 'userId'>) => {
      const userId = authUserRef.current?.id || '';
      const newFood: FoodItem = {
        ...food,
        id: makeId('custom-food'),
        userId,
        isCustom: true,
        category: food.category || 'Custom',
        sourceType: 'personal_custom',
        sourceName: 'Personal Custom Food',
        dataQuality: 'user_entered',
        createdAt: new Date().toISOString(),
      };
      setState((prev) => ({
        ...prev,
        customFoods: [newFood, ...prev.customFoods],
      }));
      if (userId) {
        void insertCustomFoodDb(userId, newFood).then(handleDbResult);
      }
      notify(`Saved custom food "${newFood.name}"`);
      return newFood;
    },
    [handleDbResult, notify]
  );

  const updateCustomFood = useCallback(
    (foodId: string, updates: Partial<Omit<FoodItem, 'id' | 'isCustom'>>) => {
      const user = authUserRef.current;
      setState((prev) => ({
        ...prev,
        customFoods: prev.customFoods.map((f) => (f.id === foodId ? { ...f, ...updates } : f)),
      }));
      if (user) {
        void updateCustomFoodDb(user.id, foodId, updates).then(handleDbResult);
      }
      notify('Custom food updated');
    },
    [handleDbResult, notify]
  );

  const deleteCustomFood = useCallback(
    (foodId: string) => {
      const user = authUserRef.current;
      const nextFavs = stateRef.current.favoriteFoodIds.filter((id) => id !== foodId);
      const nextRecents = stateRef.current.recentFoodIds.filter((id) => id !== foodId);
      setState((prev) => ({
        ...prev,
        customFoods: prev.customFoods.filter((f) => f.id !== foodId),
        favoriteFoodIds: nextFavs,
        recentFoodIds: nextRecents,
      }));
      if (user) {
        void deleteCustomFoodDb(user.id, foodId).then(handleDbResult);
        void upsertFoodPreferencesDb(user.id, nextFavs, nextRecents);
      }
      notify('Custom food deleted', 'info');
    },
    [handleDbResult, notify]
  );

  const toggleFavoriteFood = useCallback((foodId: string) => {
    const user = authUserRef.current;
    setState((prev) => {
      const exists = prev.favoriteFoodIds.includes(foodId);
      const nextFavs = exists
        ? prev.favoriteFoodIds.filter((id) => id !== foodId)
        : [foodId, ...prev.favoriteFoodIds];

      if (user) {
        void upsertFoodPreferencesDb(user.id, nextFavs, prev.recentFoodIds);
      }
      return {
        ...prev,
        favoriteFoodIds: nextFavs,
      };
    });
  }, []);

  const updateGoals = useCallback(
    (goals: Omit<NutritionGoals, 'userId' | 'updatedAt'>) => {
      const user = authUserRef.current;
      if (!user) return;
      const now = new Date().toISOString();
      const nextGoals: NutritionGoals = {
        ...goals,
        userId: user.id,
        updatedAt: now,
      };

      setState((prev) => {
        const nextProfile =
          goals.targetWeightKg !== undefined
            ? { ...prev.profile, targetWeightKg: goals.targetWeightKg }
            : prev.profile;
        const nextWeightGoal =
          goals.targetWeightKg !== undefined
            ? { ...prev.weightGoal, targetWeightKg: goals.targetWeightKg, updatedAt: now }
            : prev.weightGoal;

        void upsertNutritionGoals(user.id, nextGoals).then(handleDbResult);
        if (goals.targetWeightKg !== undefined) {
          void upsertProfileAndSettings(user.id, nextProfile, prev.settings);
          void upsertWeightGoal(user.id, nextWeightGoal);
        }

        return {
          ...prev,
          goals: nextGoals,
          profile: nextProfile,
          weightGoal: nextWeightGoal,
        };
      });
      notify('Nutrition goals saved');
    },
    [handleDbResult, notify]
  );

  const addWeightEntry = useCallback(
    ({ weightKg, date, notes }: { weightKg: number; date: string; notes?: string }) => {
      const user = authUserRef.current;
      if (!user) return;
      const now = new Date().toISOString();
      const newEntry: WeightEntry = {
        id: makeId('weight'),
        userId: user.id,
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
        const nextProfile = { ...prev.profile, currentWeightKg: latestKg };

        const shouldSetStarting = prev.weightGoal.startingWeightKg <= 0;
        const nextWeightGoal = shouldSetStarting
          ? { ...prev.weightGoal, startingWeightKg: weightKg, updatedAt: now }
          : prev.weightGoal;

        void insertWeightEntryDb(newEntry).then(handleDbResult);
        void upsertProfileAndSettings(user.id, nextProfile, prev.settings);
        if (shouldSetStarting) {
          void upsertWeightGoal(user.id, nextWeightGoal);
        }

        return {
          ...prev,
          weightEntries: updated,
          profile: nextProfile,
          weightGoal: nextWeightGoal,
        };
      });
      notify('Weight entry recorded');
    },
    [handleDbResult, notify]
  );

  const updateWeightEntry = useCallback(
    (entryId: string, { weightKg, date, notes }: { weightKg: number; date: string; notes?: string }) => {
      const user = authUserRef.current;
      if (!user) return;
      const now = new Date().toISOString();
      setState((prev) => {
        let updatedEntry: WeightEntry | null = null;
        const updated = prev.weightEntries.map((w) => {
          if (w.id !== entryId) return w;
          updatedEntry = { ...w, weightKg, date, notes: notes?.trim() || undefined, updatedAt: now };
          return updatedEntry;
        });
        const sortedDesc = sortWeightEntriesChronological(updated, 'desc');
        const latestKg = sortedDesc[0]?.weightKg ?? prev.profile.currentWeightKg;
        const nextProfile = { ...prev.profile, currentWeightKg: latestKg };

        if (updatedEntry) {
          void updateWeightEntryDb(updatedEntry).then(handleDbResult);
          void upsertProfileAndSettings(user.id, nextProfile, prev.settings);
        }

        return {
          ...prev,
          weightEntries: updated,
          profile: nextProfile,
        };
      });
      notify('Weight entry updated');
    },
    [handleDbResult, notify]
  );

  const deleteWeightEntry = useCallback(
    (entryId: string) => {
      const user = authUserRef.current;
      if (!user) return;
      setState((prev) => {
        const updated = prev.weightEntries.filter((w) => w.id !== entryId);
        const sortedDesc = sortWeightEntriesChronological(updated, 'desc');
        const latestKg = sortedDesc[0]?.weightKg ?? 0;
        const nextProfile = { ...prev.profile, currentWeightKg: latestKg };

        void deleteWeightEntryDb(user.id, entryId).then(handleDbResult);
        void upsertProfileAndSettings(user.id, nextProfile, prev.settings);

        return {
          ...prev,
          weightEntries: updated,
          profile: nextProfile,
        };
      });
      notify('Weight entry deleted', 'info');
    },
    [handleDbResult, notify]
  );

  const updateWeightGoal = useCallback(
    (goal: Omit<WeightGoal, 'userId' | 'updatedAt'>) => {
      const user = authUserRef.current;
      if (!user) return;
      const now = new Date().toISOString();
      const nextWeightGoal: WeightGoal = {
        ...goal,
        userId: user.id,
        updatedAt: now,
      };
      setState((prev) => {
        const nextProfile = { ...prev.profile, targetWeightKg: goal.targetWeightKg };
        const nextGoals = { ...prev.goals, targetWeightKg: goal.targetWeightKg };
        void upsertWeightGoal(user.id, nextWeightGoal).then(handleDbResult);
        void upsertProfileAndSettings(user.id, nextProfile, prev.settings);
        void upsertNutritionGoals(user.id, nextGoals);
        return {
          ...prev,
          weightGoal: nextWeightGoal,
          profile: nextProfile,
          goals: nextGoals,
        };
      });
      notify('Weight goal updated');
    },
    [handleDbResult, notify]
  );

  const updateProfile = useCallback(
    (updates: Partial<UserProfile>) => {
      const user = authUserRef.current;
      setState((prev) => {
        const nextProfile = { ...prev.profile, ...updates };
        if (user) {
          void upsertProfileAndSettings(user.id, nextProfile, prev.settings).then(handleDbResult);
        }
        return {
          ...prev,
          profile: nextProfile,
        };
      });
      notify('Profile saved');
    },
    [handleDbResult, notify]
  );

  const updateSettings = useCallback(
    (updates: Partial<AppSettings>) => {
      const user = authUserRef.current;
      setState((prev) => {
        const nextSettings = { ...prev.settings, ...updates };
        if (user) {
          void upsertProfileAndSettings(user.id, prev.profile, nextSettings).then(handleDbResult);
        }
        return {
          ...prev,
          settings: nextSettings,
        };
      });
    },
    [handleDbResult]
  );

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

  const toggleTheme = useCallback(() => {
    const user = authUserRef.current;
    setState((prev) => {
      const nextTheme: AppSettings['theme'] = resolvedTheme === 'dark' ? 'light' : 'dark';
      const nextSettings: AppSettings = { ...prev.settings, theme: nextTheme };
      if (user) {
        void upsertProfileAndSettings(user.id, prev.profile, nextSettings);
      }
      return {
        ...prev,
        settings: nextSettings,
      };
    });
  }, [resolvedTheme]);

  const value: MacroLogContextValue = {
    state,
    authMode,
    authUser,
    authDetails,
    needsSchemaSetup,
    syncingDb,
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
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signInWithMagicLink,
    signOut,
    retrySupabaseSync,
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
