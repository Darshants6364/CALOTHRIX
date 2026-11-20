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
  fetchClientActiveCoachPlans,
  fetchClientTargetRecommendations,
  fetchMyPendingInvitations,
  fetchTrainerProfile,
  respondToTargetRecommendation,
  upsertTrainerProfile,
} from '../services/trainerService';
import {
  AccountRole,
  AnalyzedMealItem,
  AppSettings,
  ClientInvitation,
  FoodItem,
  FoodLogEntry,
  MacroLogPersistedState,
  MealCategory,
  NavTab,
  NutritionGoals,
  TargetRecommendation,
  ToastMessage,
  TrainerClientPlan,
  TrainerNavTab,
  UserProfile,
  WeightEntry,
  WeightGoal,
} from '../types';
import { addDaysToDateKey, getTodayDateKey } from '../utils/dateUtils';
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

interface MealScannerModalState {
  isOpen: boolean;
  initialMode: 'photo' | 'voice' | 'text';
  initialMeal: MealCategory;
  targetDate: string;
}

interface BarcodeScannerModalState {
  isOpen: boolean;
  initialMeal: MealCategory;
  targetDate: string;
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
    password: string,
    intendedRole?: AccountRole
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
  // AI Meal Photo / Voice Scanner Controls
  mealScannerModal: MealScannerModalState;
  openMealScannerModal: (options?: {
    mode?: 'photo' | 'voice' | 'text';
    meal?: MealCategory;
    date?: string;
  }) => void;
  closeMealScannerModal: () => void;
  logAnalyzedMealItems: (params: {
    items: AnalyzedMealItem[];
    mealType: MealCategory;
    date: string;
    sourceLabel?: string;
  }) => number;
  // Barcode Scanner Modal Controls
  barcodeScannerModal: BarcodeScannerModalState;
  openBarcodeScannerModal: (options?: { meal?: MealCategory; date?: string }) => void;
  closeBarcodeScannerModal: () => void;
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
    unitLabel?: string;
  }) => void;
  updateFoodEntry: (
    entryId: string,
    params: {
      food: FoodItem;
      quantityGrams: number;
      mealType: MealCategory;
      date: string;
      unitLabel?: string;
    }
  ) => void;
  deleteFoodEntry: (entryId: string) => void;
  duplicateFoodEntry: (entry: FoodLogEntry, targetDate?: string) => void;
  // Custom Food Actions
  addCustomFood: (
    food: Omit<FoodItem, 'id' | 'isCustom' | 'createdAt' | 'userId'>
  ) => FoodItem;
  saveExternalFoodToMyFoods: (food: FoodItem) => FoodItem;
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
  // Role Selection, Trainer Workspace & Coaching
  selectAccountRole: (
    role: AccountRole,
    trainerOnboarding?: {
      displayName: string;
      bio: string;
      specialties: string[];
      certifications: string[];
    }
  ) => Promise<boolean>;
  trainerTab: TrainerNavTab;
  setTrainerTab: (tab: TrainerNavTab) => void;
  selectedTrainerClientId: string | null;
  openTrainerClientDetail: (clientId: string) => void;
  pendingInviteToken: string | null;
  clearPendingInviteToken: () => void;
  pendingInvitations: ClientInvitation[];
  pendingRecommendations: TargetRecommendation[];
  coachPlans: TrainerClientPlan[];
  refreshCoachingAlerts: () => Promise<void>;
  approveTargetRecommendation: (rec: TargetRecommendation) => Promise<boolean>;
  declineTargetRecommendation: (recId: string) => Promise<boolean>;
  // Daily Hydration & Quick Meal Copy
  waterIntakeMlByDate: Record<string, number>;
  dailyWaterGoalMl: number;
  addWaterMl: (dateKey: string, deltaMl: number) => void;
  setDailyWaterGoalMl: (goalMl: number) => void;
  copyMealFromPreviousDay: (mealType: MealCategory, targetDate: string) => number;
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
  const [trainerTab, setTrainerTab] = useState<TrainerNavTab>('overview');
  const [selectedTrainerClientId, setSelectedTrainerClientId] = useState<string | null>(null);
  const [pendingInviteToken, setPendingInviteToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const match = window.location.pathname.match(/^\/invite\/([A-Za-z0-9_-]+)/);
    const paramToken = new URLSearchParams(window.location.search).get('invite');
    const found = match?.[1] || paramToken || sessionStorage.getItem('calothrix_pending_invite');
    if (found) {
      sessionStorage.setItem('calothrix_pending_invite', found);
    }
    return found || null;
  });
  const [pendingInvitations, setPendingInvitations] = useState<ClientInvitation[]>([]);
  const [pendingRecommendations, setPendingRecommendations] = useState<TargetRecommendation[]>([]);
  const [coachPlans, setCoachPlans] = useState<TrainerClientPlan[]>([]);
  const [waterIntakeMlByDate, setWaterIntakeMlByDate] = useState<Record<string, number>>({});
  const [dailyWaterGoalMl, setDailyWaterGoalMlState] = useState<number>(2500);
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

  const [mealScannerModal, setMealScannerModal] = useState<MealScannerModalState>({
    isOpen: false,
    initialMode: 'photo',
    initialMeal: 'lunch',
    targetDate: getTodayDateKey(),
  });

  const [barcodeScannerModal, setBarcodeScannerModal] = useState<BarcodeScannerModalState>({
    isOpen: false,
    initialMeal: 'lunch',
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

  const refreshCoachingAlertsForUser = useCallback(async (userId: string) => {
    try {
      const [invRes, recRes, planRes] = await Promise.all([
        fetchMyPendingInvitations(),
        fetchClientTargetRecommendations(userId),
        fetchClientActiveCoachPlans(userId),
      ]);
      if (invRes.ok && invRes.data) {
        setPendingInvitations(invRes.data);
      }
      if (recRes.ok && recRes.data) {
        setPendingRecommendations(recRes.data.filter((r) => r.status === 'pending'));
      }
      if (planRes.ok && planRes.data) {
        setCoachPlans(planRes.data);
      }
    } catch {
      // Ignore pre-migration errors silently
    }
  }, []);

  const hydrateForUser = useCallback(
    async (user: User) => {
      setAuthUser(user);
      const savedTheme =
        (localStorage.getItem('calothrix_theme_pref_v2') as AppSettings['theme'] | null) || 'dark';
      const pendingAuthRole =
        typeof window !== 'undefined'
          ? (localStorage.getItem('calothrix_pending_auth_role') as AccountRole | null)
          : null;
      if (typeof window !== 'undefined') {
        localStorage.removeItem('calothrix_pending_auth_role');
      }

      setSyncingDb(true);
      try {
        const result = await loadUserStateFromSupabase(user, savedTheme);
        let nextState = result.state;

        const metaRole =
          user.user_metadata?.intended_role === 'trainer' ||
          user.user_metadata?.intended_role === 'individual'
            ? (user.user_metadata.intended_role as AccountRole)
            : null;
        const desiredRole: AccountRole | null =
          pendingAuthRole || (!nextState.profile.roleSelected ? metaRole : null);

        if (desiredRole === 'trainer' && !result.needsSchemaSetup) {
          const existingTrainer = await fetchTrainerProfile(user.id);
          if (existingTrainer.ok && !existingTrainer.data) {
            const authInfo = extractAuthDetails(user);
            await upsertTrainerProfile({
              userId: user.id,
              displayName: authInfo.name || nextState.profile.name || 'Coach',
              bio: '',
              specialties: ['Fat Loss', 'Macro Coaching'],
              certifications: [],
              acceptingClients: true,
              subscriptionTier: 'free',
            });
          }
          if (nextState.profile.accountRole !== 'trainer' || !nextState.profile.roleSelected) {
            const updatedProfile: UserProfile = {
              ...nextState.profile,
              accountRole: 'trainer',
              roleSelected: true,
            };
            nextState = { ...nextState, profile: updatedProfile };
            void upsertProfileAndSettings(user.id, updatedProfile, nextState.settings);
          }
          setTrainerTab('overview');
        } else if (desiredRole === 'individual' && !result.needsSchemaSetup) {
          if (nextState.profile.accountRole !== 'individual' || !nextState.profile.roleSelected) {
            const updatedProfile: UserProfile = {
              ...nextState.profile,
              accountRole: 'individual',
              roleSelected: true,
            };
            nextState = { ...nextState, profile: updatedProfile };
            void upsertProfileAndSettings(user.id, updatedProfile, nextState.settings);
          }
        }

        setState(nextState);
        setNeedsSchemaSetup(result.needsSchemaSetup);
        setAuthMode('authenticated');

        // Hydrate water intake from Supabase user_metadata + localStorage cache
        try {
          const storageKey = `calothrix_water_${user.id}`;
          const cachedRaw = localStorage.getItem(storageKey);
          const cached = cachedRaw
            ? (JSON.parse(cachedRaw) as { logs?: Record<string, number>; goalMl?: number })
            : {};
          const metaLogs =
            (user.user_metadata?.water_logs as Record<string, number> | undefined) || {};
          const mergedLogs = { ...metaLogs, ...(cached.logs || {}) };
          const defaultWater = Math.min(
            4500,
            Math.max(
              2000,
              Math.round(((nextState.profile.currentWeightKg || 70) * 35 + 250) / 250) * 250
            )
          );
          const metaGoal = Number(user.user_metadata?.daily_water_goal_ml || 0);
          setWaterIntakeMlByDate(mergedLogs);
          setDailyWaterGoalMlState(cached.goalMl || metaGoal || defaultWater);
        } catch {
          setWaterIntakeMlByDate({});
          setDailyWaterGoalMlState(2500);
        }

        if (!result.needsSchemaSetup) {
          void refreshCoachingAlertsForUser(user.id);
        }
      } catch {
        setState(createZeroUserState(user, savedTheme));
        setNeedsSchemaSetup(true);
        setAuthMode('authenticated');
      } finally {
        setSyncingDb(false);
      }
    },
    [refreshCoachingAlertsForUser]
  );

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
        setPendingInvitations([]);
        setPendingRecommendations([]);
        setCoachPlans([]);
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
      password: string,
      intendedRole?: AccountRole
    ): Promise<{ error?: string; needsEmailConfirmation?: boolean }> => {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: name.trim(),
            ...(intendedRole ? { intended_role: intendedRole } : {}),
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
    setPendingInvitations([]);
    setPendingRecommendations([]);
    setCoachPlans([]);
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

  const openMealScannerModal = useCallback(
    (options?: { mode?: 'photo' | 'voice' | 'text'; meal?: MealCategory; date?: string }) => {
      setMealScannerModal({
        isOpen: true,
        initialMode: options?.mode ?? 'photo',
        initialMeal: options?.meal ?? 'lunch',
        targetDate: options?.date ?? selectedDate,
      });
    },
    [selectedDate]
  );

  const closeMealScannerModal = useCallback(() => {
    setMealScannerModal((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const openBarcodeScannerModal = useCallback(
    (options?: { meal?: MealCategory; date?: string }) => {
      setBarcodeScannerModal({
        isOpen: true,
        initialMeal: options?.meal ?? 'lunch',
        targetDate: options?.date ?? selectedDate,
      });
    },
    [selectedDate]
  );

  const closeBarcodeScannerModal = useCallback(() => {
    setBarcodeScannerModal((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const logAnalyzedMealItems = useCallback(
    ({
      items,
      mealType,
      date,
      sourceLabel = 'AI Meal Scan',
    }: {
      items: AnalyzedMealItem[];
      mealType: MealCategory;
      date: string;
      sourceLabel?: string;
    }): number => {
      const user = authUserRef.current;
      if (!user || items.length === 0) return 0;

      const now = new Date().toISOString();
      const newEntries: FoodLogEntry[] = items.map((item) => ({
        id: makeId('entry'),
        userId: user.id,
        date,
        mealType,
        foodId: makeId('ai-food'),
        foodName: item.name.trim() || 'Meal Item',
        quantityGrams: Math.max(1, Math.round((item.estimatedGrams || 100) * 10) / 10),
        servingsCount: 1,
        servingName: item.estimatedQuantityDescription?.trim() || `${Math.round(item.estimatedGrams || 100)} g`,
        sourceName: sourceLabel,
        sourceType: 'community',
        verificationStatus: 'estimated',
        measurementBasis: 'per_serving',
        foodState: 'prepared',
        calories: Math.max(0, Math.round(item.calories)),
        protein: Math.max(0, Math.round(item.protein * 10) / 10),
        carbs: Math.max(0, Math.round(item.carbs * 10) / 10),
        fat: Math.max(0, Math.round(item.fat * 10) / 10),
        fibre: Math.max(0, Math.round(item.fibre * 10) / 10),
        createdAt: now,
        updatedAt: now,
      }));

      setState((prev) => ({
        ...prev,
        foodEntries: [...newEntries, ...prev.foodEntries],
      }));

      newEntries.forEach((entry) => {
        void insertFoodEntryDb(entry).then(handleDbResult);
      });

      const totalKcal = newEntries.reduce((sum, e) => sum + e.calories, 0);
      notify(`Logged ${newEntries.length} ${newEntries.length === 1 ? 'item' : 'items'} (${totalKcal} kcal)`);
      return newEntries.length;
    },
    [handleDbResult, notify]
  );

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
      unitLabel,
    }: {
      food: FoodItem;
      quantityGrams: number;
      mealType: MealCategory;
      date: string;
      unitLabel?: string;
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
        servingName: unitLabel || food.servingName,
        unitLabel: unitLabel || `${quantityGrams} g`,
        measurementBasis: food.measurementBasis || (food.servingWeightGrams === 100 ? 'per_100g' : 'per_serving'),
        verificationStatus: food.verificationStatus || (food.isCustom ? 'user_provided' : 'verified'),
        foodState: food.foodState,
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
        unitLabel,
      }: {
        food: FoodItem;
        quantityGrams: number;
        mealType: MealCategory;
        date: string;
        unitLabel?: string;
      }
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
            servingName: unitLabel || food.servingName,
            unitLabel: unitLabel || `${quantityGrams} g`,
            measurementBasis:
              food.measurementBasis || e.measurementBasis || (food.servingWeightGrams === 100 ? 'per_100g' : 'per_serving'),
            verificationStatus: food.verificationStatus || e.verificationStatus,
            foodState: food.foodState || e.foodState,
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
      const isRecipe = food.verificationStatus === 'estimated' && (food.sourceName || '').includes('Recipe Engine');
      const newFood: FoodItem = {
        ...food,
        id: makeId('custom-food'),
        userId,
        isCustom: true,
        category: food.category || 'Custom',
        sourceType: 'personal_custom',
        sourceName: isRecipe ? food.sourceName : 'Personal Custom Food',
        sourcePriority: isRecipe ? 2 : 6,
        verificationStatus: isRecipe ? 'estimated' : 'user_provided',
        foodState: food.foodState || 'prepared',
        measurementBasis:
          food.measurementBasis || (food.servingWeightGrams === 100 ? 'per_100g' : 'per_serving'),
        dataQuality: 'user_entered',
        lastUpdated: new Date().toISOString().slice(0, 10),
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

  const saveExternalFoodToMyFoods = useCallback(
    (food: FoodItem) => {
      const userId = authUserRef.current?.id || '';
      const existing = stateRef.current.customFoods.find(
        (f) => f.sourceId && food.sourceId && f.sourceId === food.sourceId
      );
      if (existing) {
        notify(`"${food.name}" is already saved in your foods`, 'info');
        return existing;
      }
      const savedFood: FoodItem = {
        ...food,
        id: makeId('saved-food'),
        userId,
        isCustom: true,
        sourceType: food.sourceType || 'branded',
        sourceName: food.sourceName || 'Verified External Source',
        verificationStatus: food.verificationStatus || 'verified',
        createdAt: new Date().toISOString(),
      };
      setState((prev) => ({
        ...prev,
        customFoods: [savedFood, ...prev.customFoods],
      }));
      if (userId) {
        void insertCustomFoodDb(userId, savedFood).then(handleDbResult);
      }
      notify(`Saved "${savedFood.name}" (${savedFood.sourceName}) to My Foods`);
      return savedFood;
    },
    [handleDbResult, notify]
  );

  const updateCustomFood = useCallback(
    (foodId: string, updates: Partial<Omit<FoodItem, 'id' | 'isCustom'>>) => {
      const user = authUserRef.current;
      const stampedUpdates = {
        ...updates,
        verificationStatus: 'user_provided' as const,
        sourceName: 'Personal Custom Food',
      };
      setState((prev) => ({
        ...prev,
        customFoods: prev.customFoods.map((f) =>
          f.id === foodId ? { ...f, ...stampedUpdates } : f
        ),
      }));
      if (user) {
        void updateCustomFoodDb(user.id, foodId, stampedUpdates).then(handleDbResult);
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

  const selectAccountRole = useCallback(
    async (
      role: AccountRole,
      trainerOnboarding?: {
        displayName: string;
        bio: string;
        specialties: string[];
        certifications: string[];
      }
    ): Promise<boolean> => {
      const user = authUserRef.current;
      if (!user) return false;

      if (role === 'trainer') {
        const existing = await fetchTrainerProfile(user.id);
        if (!existing.ok) {
          notify(
            existing.error || 'Could not verify trainer profile. Please verify SQL migration.',
            'error'
          );
          return false;
        }
        if (!existing.data || trainerOnboarding?.bio || (trainerOnboarding?.certifications?.length ?? 0) > 0) {
          const res = await upsertTrainerProfile({
            userId: user.id,
            displayName:
              existing.data?.displayName ||
              trainerOnboarding?.displayName ||
              stateRef.current.profile.name ||
              'Coach',
            bio: trainerOnboarding?.bio ?? existing.data?.bio ?? '',
            specialties:
              existing.data?.specialties && existing.data.specialties.length > 0
                ? existing.data.specialties
                : trainerOnboarding?.specialties || ['Fat Loss', 'Macro Coaching'],
            certifications:
              existing.data?.certifications && existing.data.certifications.length > 0
                ? existing.data.certifications
                : trainerOnboarding?.certifications || [],
            acceptingClients: existing.data?.acceptingClients ?? true,
            subscriptionTier: existing.data?.subscriptionTier ?? 'free',
          });
          if (!res.ok) {
            notify(
              res.error || 'Could not initialize trainer profile. Please verify SQL migration.',
              'error'
            );
            return false;
          }
        }
      }

      const nextProfile: UserProfile = {
        ...stateRef.current.profile,
        accountRole: role,
        roleSelected: true,
      };
      setState((prev) => ({ ...prev, profile: nextProfile }));
      const dbRes = await upsertProfileAndSettings(user.id, nextProfile, stateRef.current.settings);
      handleDbResult(dbRes);

      if (role === 'trainer') {
        setTrainerTab('overview');
        notify('Trainer Dashboard ready');
      } else {
        if (stateRef.current.goals.calories === 0) {
          setActiveTab('goals');
        } else {
          setActiveTab('home');
        }
        notify('Personal workspace ready');
      }
      return true;
    },
    [handleDbResult, notify]
  );

  const openTrainerClientDetail = useCallback((clientId: string) => {
    setSelectedTrainerClientId(clientId);
    setTrainerTab('client-detail');
  }, []);

  const clearPendingInviteToken = useCallback(() => {
    setPendingInviteToken(null);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('calothrix_pending_invite');
      if (window.location.pathname.startsWith('/invite/') || window.location.search.includes('invite=')) {
        window.history.replaceState({}, '', '/');
      }
    }
  }, []);

  const refreshCoachingAlerts = useCallback(async () => {
    const user = authUserRef.current;
    if (!user) return;
    await refreshCoachingAlertsForUser(user.id);
  }, [refreshCoachingAlertsForUser]);

  const approveTargetRecommendation = useCallback(
    async (rec: TargetRecommendation): Promise<boolean> => {
      const user = authUserRef.current;
      if (!user) return false;
      const res = await respondToTargetRecommendation(user.id, rec.id, true);
      if (!res.ok) {
        notify(res.error || 'Could not approve recommendation', 'error');
        return false;
      }

      updateGoals({
        preset: stateRef.current.goals.preset,
        calories: rec.recommendedCalories,
        protein: rec.recommendedProtein,
        carbs: rec.recommendedCarbs,
        fat: rec.recommendedFat,
        fibre: rec.recommendedFibre,
        targetWeightKg: rec.recommendedTargetWeightKg ?? stateRef.current.goals.targetWeightKg,
        estimatedBmr: stateRef.current.goals.estimatedBmr,
        estimatedTdee: stateRef.current.goals.estimatedTdee,
        bmi: stateRef.current.goals.bmi,
        goalSpeed: stateRef.current.goals.goalSpeed,
        estimatedWeeks: stateRef.current.goals.estimatedWeeks,
      });

      setPendingRecommendations((prev) => prev.filter((item) => item.id !== rec.id));
      notify('Trainer target recommendation approved & applied');
      return true;
    },
    [notify, updateGoals]
  );

  const syncWaterMeta = useCallback(
    (userId: string, logs: Record<string, number>, goalMl: number) => {
      // Keep last 45 logged dates so metadata remains compact
      const trimmedKeys = Object.keys(logs).sort().slice(-45);
      const compactLogs: Record<string, number> = {};
      for (const k of trimmedKeys) {
        if ((logs[k] ?? 0) > 0) compactLogs[k] = logs[k];
      }
      try {
        localStorage.setItem(
          `calothrix_water_${userId}`,
          JSON.stringify({ logs: compactLogs, goalMl })
        );
      } catch {
        // Ignore storage errors
      }
      void supabase.auth.updateUser({
        data: { water_logs: compactLogs, daily_water_goal_ml: goalMl },
      });
    },
    []
  );

  const addWaterMl = useCallback(
    (dateKey: string, deltaMl: number) => {
      const user = authUserRef.current;
      setWaterIntakeMlByDate((prev) => {
        const nextVal = Math.max(0, Math.min(8000, (prev[dateKey] || 0) + deltaMl));
        const nextLogs = { ...prev, [dateKey]: nextVal };
        if (user) {
          syncWaterMeta(user.id, nextLogs, dailyWaterGoalMl);
        }
        return nextLogs;
      });
    },
    [dailyWaterGoalMl, syncWaterMeta]
  );

  const setDailyWaterGoalMl = useCallback(
    (goalMl: number) => {
      const clamped = Math.max(1000, Math.min(6000, Math.round(goalMl / 250) * 250));
      setDailyWaterGoalMlState(clamped);
      const user = authUserRef.current;
      if (user) {
        syncWaterMeta(user.id, waterIntakeMlByDate, clamped);
      }
      notify(`Daily water target set to ${(clamped / 1000).toFixed(2).replace(/\.?0+$/, '')} L`);
    },
    [notify, syncWaterMeta, waterIntakeMlByDate]
  );

  const copyMealFromPreviousDay = useCallback(
    (mealType: MealCategory, targetDate: string): number => {
      const user = authUserRef.current;
      if (!user) return 0;
      const yesterdayKey = addDaysToDateKey(targetDate, -1);
      const sourceEntries = stateRef.current.foodEntries.filter(
        (e) => e.date === yesterdayKey && e.mealType === mealType
      );
      if (sourceEntries.length === 0) return 0;
      const now = new Date().toISOString();
      const clones: FoodLogEntry[] = sourceEntries.map((entry) => ({
        ...entry,
        id: makeId('entry'),
        userId: user.id,
        date: targetDate,
        createdAt: now,
        updatedAt: now,
      }));
      setState((prev) => ({
        ...prev,
        foodEntries: [...clones, ...prev.foodEntries],
      }));
      clones.forEach((clone) => {
        void insertFoodEntryDb(clone).then(handleDbResult);
      });
      notify(
        `Copied ${clones.length} ${clones.length === 1 ? 'item' : 'items'} from yesterday`
      );
      return clones.length;
    },
    [handleDbResult, notify]
  );

  const declineTargetRecommendation = useCallback(
    async (recId: string): Promise<boolean> => {
      const user = authUserRef.current;
      if (!user) return false;
      const res = await respondToTargetRecommendation(user.id, recId, false);
      if (!res.ok) {
        notify(res.error || 'Could not decline recommendation', 'error');
        return false;
      }
      setPendingRecommendations((prev) => prev.filter((item) => item.id !== recId));
      notify('Target recommendation declined', 'info');
      return true;
    },
    [notify]
  );

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
    mealScannerModal,
    openMealScannerModal,
    closeMealScannerModal,
    logAnalyzedMealItems,
    barcodeScannerModal,
    openBarcodeScannerModal,
    closeBarcodeScannerModal,
    weightModal,
    openWeightModal,
    closeWeightModal,
    addFoodEntry,
    updateFoodEntry,
    deleteFoodEntry,
    duplicateFoodEntry,
    addCustomFood,
    saveExternalFoodToMyFoods,
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
    selectAccountRole,
    trainerTab,
    setTrainerTab,
    selectedTrainerClientId,
    openTrainerClientDetail,
    pendingInviteToken,
    clearPendingInviteToken,
    pendingInvitations,
    pendingRecommendations,
    coachPlans,
    refreshCoachingAlerts,
    approveTargetRecommendation,
    declineTargetRecommendation,
    waterIntakeMlByDate,
    dailyWaterGoalMl,
    addWaterMl,
    setDailyWaterGoalMl,
    copyMealFromPreviousDay,
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
