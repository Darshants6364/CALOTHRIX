import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { DEFAULT_FOODS } from '../data/defaultFoods';
import { createDemoState, createEmptyState, seedDemoAuxiliaryCaches } from '../data/demoData';
import {
  supabase,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from '../lib/supabaseClient';
import { fetchFoodOverridesApi } from '../services/globalFoodApiService';
import {
  exportFoodAndWeightAsCsv,
  exportStateAsJson,
  storageService,
} from '../services/storageService';
import {
  createZeroUserState,
  DbMutationResult,
  deleteCustomFoodDb,
  deleteFoodEntryDb,
  deleteWeightEntryDb,
  extractAuthDetails,
  fetchTargetHistoryDb,
  fetchWeeklyAssessmentsDb,
  insertCustomFoodDb,
  insertFoodEntryDb,
  insertTargetHistoryDb,
  insertWeightEntryDb,
  loadUserStateFromSupabase,
  syncLocalStateToSupabase,
  updateCustomFoodDb,
  updateFoodEntryDb,
  updateWeeklyAssessmentStatusDb,
  updateWeightEntryDb,
  upsertFoodPreferencesDb,
  upsertNutritionGoals,
  upsertProfileAndSettings,
  upsertWeeklyAssessmentDb,
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
  FitnessGoalType,
  FoodItem,
  FoodLogEntry,
  MacroLogPersistedState,
  MealCategory,
  NavTab,
  NutritionGoals,
  NutritionTargetHistoryRecord,
  SavedMealCombo,
  SavedMealComboItem,
  TargetRecommendation,
  ToastMessage,
  TrainerClientPlan,
  TrainerNavTab,
  TrainerOnboardingInput,
  UserProfile,
  WeeklyAssessmentDueStatus,
  WeeklyAssessmentRecord,
  WeightEntry,
  WeightGoal,
} from '../types';
import { PENDING_TRAINER_ONBOARDING_KEY } from '../components/TrainerOnboardingFlow';
import { isDatabaseAdmin } from '../utils/adminAccess';
import { addDaysToDateKey, getTodayDateKey } from '../utils/dateUtils';
import {
  CALCULATION_VERSION,
  getGoalDirectionForStrategy,
} from '../utils/fitnessCalculator';
import {
  calculateScaledNutrition,
  getEntriesForDate,
  sortWeightEntriesChronological,
  sumMacros,
} from '../utils/nutritionUtils';
import { saveLastUsedPortion } from '../utils/portionEngine';
import {
  ASSESSMENT_CYCLE_DAYS,
  buildDailyNutritionSummaries,
  evaluateWeeklyAssessmentDueStatus,
  runDeterministicWeeklyAssessment,
} from '../utils/weeklyAssessmentEngine';

export type AuthMode = 'loading' | 'unauthenticated' | 'guest' | 'authenticated';

const GUEST_MODE_KEY = 'calothrix_guest_mode_v1';
const GUEST_USER_ID = 'guest-local-user';
const ADMIN_OVERRIDES_STORAGE_KEY = 'calothrix_admin_food_overrides_v1';
const PENDING_SYNC_KEY = 'calothrix_pending_sync_v1';
const COACH_MODE_PREF_KEY = 'calothrix_coach_mode_pref_v1';
const QUESTS_HOME_PREF_KEY = 'calothrix_quests_home_pref_v1';
const LAST_MEAL_STORAGE_KEY = 'calothrix_last_meal_v1';

const VALID_MEALS: MealCategory[] = ['breakfast', 'lunch', 'evening_snacks', 'dinner', 'other'];

function getLastSelectedMeal(): MealCategory {
  if (typeof window === 'undefined') return 'breakfast';
  try {
    const raw = localStorage.getItem(LAST_MEAL_STORAGE_KEY) as MealCategory | null;
    if (raw && VALID_MEALS.includes(raw)) return raw;
  } catch {
    // Ignore storage read errors
  }
  return 'breakfast';
}

function saveLastSelectedMeal(meal: MealCategory): void {
  if (typeof window === 'undefined' || !VALID_MEALS.includes(meal)) return;
  try {
    localStorage.setItem(LAST_MEAL_STORAGE_KEY, meal);
  } catch {
    // Ignore storage quota errors
  }
}

const TAB_PATHS: Record<NavTab, string> = {
  home: '/',
  'food-log': '/log',
  'food-database': '/foods',
  weight: '/weight',
  progress: '/progress',
  goals: '/goals',
  profile: '/profile',
  'admin-quality': '/admin',
};

function getTabFromPathname(pathname: string): NavTab {
  const clean = pathname.replace(/\/+$/, '') || '/';
  const match = (Object.entries(TAB_PATHS) as [NavTab, string][]).find(([, p]) => p === clean);
  return match ? match[0] : 'home';
}

type PendingSyncAction =
  | { id: string; userId: string; type: 'insert_food'; payload: FoodLogEntry }
  | { id: string; userId: string; type: 'update_food'; payload: FoodLogEntry }
  | { id: string; userId: string; type: 'delete_food'; payload: { entryId: string } }
  | { id: string; userId: string; type: 'insert_weight'; payload: WeightEntry }
  | { id: string; userId: string; type: 'delete_weight'; payload: { entryId: string } };

function readPendingSyncQueue(): PendingSyncAction[] {
  try {
    const raw = localStorage.getItem(PENDING_SYNC_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingSyncQueue(queue: PendingSyncAction[]): void {
  try {
    localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(queue.slice(-100)));
  } catch {
    // Ignore quota errors
  }
}

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
  initialMode: 'photo' | 'voice' | 'text' | 'label';
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
  isAdmin: boolean;
  authDetails: { name: string; email: string; avatarUrl?: string; provider: string } | null;
  needsSchemaSetup: boolean;
  syncingDb: boolean;
  isOnline: boolean;
  pendingSyncCount: number;
  syncPendingNow: () => Promise<number>;
  showCoachMode: boolean;
  setShowCoachMode: (enabled: boolean) => void;
  showQuestsOnHome: boolean;
  setShowQuestsOnHome: (enabled: boolean) => void;
  deleteAccount: (confirmationText: string) => Promise<{ ok: boolean; error?: string; warning?: string }>;
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
    intendedRole?: AccountRole,
    trainerOnboarding?: TrainerOnboardingInput
  ) => Promise<{ error?: string; needsEmailConfirmation?: boolean }>;
  signOut: () => Promise<void>;
  enterGuestMode: () => void;
  exitGuestModeToAuth: () => void;
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
    mode?: 'photo' | 'voice' | 'text' | 'label';
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
  quickUpdateFoodEntryQuantity: (entryId: string, quantityGrams: number) => void;
  deleteFoodEntry: (entryId: string) => void;
  duplicateFoodEntry: (entry: FoodLogEntry, targetDate?: string) => void;
  // Saved Meal Combos
  savedMeals: SavedMealCombo[];
  saveMealCombo: (name: string, mealType: MealCategory, items: SavedMealComboItem[]) => SavedMealCombo | null;
  deleteSavedMealCombo: (comboId: string) => void;
  logSavedMealCombo: (combo: SavedMealCombo, mealType: MealCategory, date: string) => number;
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
  applyAdminFoodOverride: (food: FoodItem) => void;
  // Goals Actions
  updateGoals: (
    goals: Omit<NutritionGoals, 'userId' | 'updatedAt'>,
    meta?: {
      adjustmentType?: 'initial' | 'manual' | 'adaptive';
      adjustmentReason?: string;
      assessmentId?: string | null;
      manualOverrideActive?: boolean;
    }
  ) => void;
  targetHistory: NutritionTargetHistoryRecord[];
  toggleAdaptivePaused: (paused: boolean) => void;
  clearManualOverride: () => void;
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
  needsTrainerOnboarding: boolean;
  selectAccountRole: (
    role: AccountRole,
    trainerOnboarding?: TrainerOnboardingInput
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
  // Daily Hydration, Active Burn Allowance & Quick Meal Copy
  waterIntakeMlByDate: Record<string, number>;
  dailyWaterGoalMl: number;
  addWaterMl: (dateKey: string, deltaMl: number) => void;
  setDailyWaterGoalMl: (goalMl: number) => void;
  activeBurnKcalByDate: Record<string, number>;
  setActiveBurnKcal: (dateKey: string, kcal: number) => void;
  addActiveBurnKcal: (dateKey: string, deltaKcal: number) => void;
  copyMealFromPreviousDay: (mealType: MealCategory, targetDate: string) => number;
  // 7-Day AI Adaptive Assessment
  weeklyAssessments: WeeklyAssessmentRecord[];
  assessmentDueStatus: WeeklyAssessmentDueStatus;
  weeklyAssessmentModal: {
    isOpen: boolean;
    assessment: WeeklyAssessmentRecord | null;
    loading: boolean;
    error: string | null;
  };
  openWeeklyAssessmentModal: (assessment?: WeeklyAssessmentRecord) => void;
  closeWeeklyAssessmentModal: () => void;
  runWeeklyAssessment: (options?: {
    openModal?: boolean;
    forceRecompute?: boolean;
  }) => Promise<WeeklyAssessmentRecord | null>;
  applyWeeklyAssessment: (
    assessment: WeeklyAssessmentRecord,
    options?: { switchToMaintenance?: boolean; newGoal?: FitnessGoalType }
  ) => Promise<boolean>;
  dismissWeeklyAssessment: (assessment: WeeklyAssessmentRecord) => Promise<void>;
}

const EMPTY_TOASTS: ToastMessage[] = [];
const NOOP_DISMISS = () => {};

interface ToastContextValue {
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toasts: EMPTY_TOASTS,
  dismissToast: NOOP_DISMISS,
});

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
  const [serverIsAdmin, setServerIsAdmin] = useState(false);
  const [needsSchemaSetup, setNeedsSchemaSetup] = useState(false);
  const [needsTrainerOnboarding, setNeedsTrainerOnboarding] = useState(false);
  const [syncingDb, setSyncingDb] = useState(false);

  const isAdmin = useMemo(
    () => (authMode === 'authenticated' && (serverIsAdmin || isDatabaseAdmin(authUser, null))),
    [authMode, authUser, serverIsAdmin]
  );

  useEffect(() => {
    let cancelled = false;
    if (authMode !== 'authenticated' || !authUser) {
      setServerIsAdmin(false);
      return;
    }
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token || cancelled) return;
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { isAdmin?: boolean };
        if (!cancelled) {
          setServerIsAdmin(Boolean(json.isAdmin));
        }
      } catch {
        // Keep JWT app_metadata fallback on network errors
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authMode, authUser]);

  const [state, setState] = useState<MacroLogPersistedState>(() => {
    const savedTheme =
      (localStorage.getItem('calothrix_theme_pref_v2') as AppSettings['theme'] | null) || 'dark';
    return createEmptyState(savedTheme);
  });

  const [activeTabState, setActiveTabState] = useState<NavTab>(() =>
    typeof window !== 'undefined' ? getTabFromPathname(window.location.pathname) : 'home'
  );
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(() => readPendingSyncQueue().length);
  const [showCoachModeState, setShowCoachModeState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COACH_MODE_PREF_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [showQuestsOnHomeState, setShowQuestsOnHomeState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(QUESTS_HOME_PREF_KEY) === '1';
    } catch {
      return false;
    }
  });
  const lastFoodSubmitRef = useRef<{ fingerprint: string; timestamp: number }>({
    fingerprint: '',
    timestamp: 0,
  });

  const activeTab = activeTabState;
  const setActiveTab = useCallback((tab: NavTab) => {
    setActiveTabState(tab);
    if (typeof window !== 'undefined') {
      const targetPath = TAB_PATHS[tab] || '/';
      if (window.location.pathname !== targetPath) {
        try {
          window.history.pushState({ tab }, '', targetPath);
        } catch {
          // Ignore pushState restrictions in sandboxed iframes
        }
      }
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = () => {
      setActiveTabState(getTabFromPathname(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const setShowCoachMode = useCallback((enabled: boolean) => {
    setShowCoachModeState(enabled);
    try {
      localStorage.setItem(COACH_MODE_PREF_KEY, enabled ? '1' : '0');
    } catch {
      // Ignore storage quota errors
    }
  }, []);

  const setShowQuestsOnHome = useCallback((enabled: boolean) => {
    setShowQuestsOnHomeState(enabled);
    try {
      localStorage.setItem(QUESTS_HOME_PREF_KEY, enabled ? '1' : '0');
    } catch {
      // Ignore storage quota errors
    }
  }, []);

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
  const [activeBurnKcalByDate, setActiveBurnKcalByDate] = useState<Record<string, number>>({});
  const [savedMeals, setSavedMeals] = useState<SavedMealCombo[]>([]);
  const [weeklyAssessments, setWeeklyAssessments] = useState<WeeklyAssessmentRecord[]>([]);
  const [targetHistory, setTargetHistory] = useState<NutritionTargetHistoryRecord[]>([]);
  const [weeklyAssessmentModal, setWeeklyAssessmentModal] = useState<{
    isOpen: boolean;
    assessment: WeeklyAssessmentRecord | null;
    loading: boolean;
    error: string | null;
  }>({
    isOpen: false,
    assessment: null,
    loading: false,
    error: null,
  });
  const [adminFoodOverrides, setAdminFoodOverrides] = useState<Record<string, FoodItem>>(() => {
    try {
      const raw = localStorage.getItem(ADMIN_OVERRIDES_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, FoodItem>) : {};
    } catch {
      return {};
    }
  });
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayDateKey());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const stateRef = useRef(state);
  stateRef.current = state;
  const authUserRef = useRef(authUser);
  authUserRef.current = authUser;
  const authModeRef = useRef(authMode);
  authModeRef.current = authMode;

  const getActiveActorId = useCallback((): string | null => {
    if (authUserRef.current?.id) return authUserRef.current.id;
    if (authModeRef.current === 'guest') return GUEST_USER_ID;
    return null;
  }, []);

  const [foodModal, setFoodModal] = useState<FoodModalState>(() => ({
    isOpen: false,
    initialMeal: getLastSelectedMeal(),
    targetDate: getTodayDateKey(),
  }));

  const [mealScannerModal, setMealScannerModal] = useState<MealScannerModalState>(() => ({
    isOpen: false,
    initialMode: 'photo',
    initialMeal: getLastSelectedMeal(),
    targetDate: getTodayDateKey(),
  }));

  const [barcodeScannerModal, setBarcodeScannerModal] = useState<BarcodeScannerModalState>(() => ({
    isOpen: false,
    initialMeal: getLastSelectedMeal(),
    targetDate: getTodayDateKey(),
  }));

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

  const enqueuePendingSync = useCallback((action: PendingSyncAction) => {
    const queue = readPendingSyncQueue().filter((item) => item.id !== action.id);
    queue.push(action);
    writePendingSyncQueue(queue);
    setPendingSyncCount(queue.length);
  }, []);

  const syncPendingNow = useCallback(async (): Promise<number> => {
    const user = authUserRef.current;
    if (!user || (typeof navigator !== 'undefined' && !navigator.onLine)) return 0;
    const queue = readPendingSyncQueue();
    if (queue.length === 0) return 0;

    let synced = 0;
    const remaining: PendingSyncAction[] = [];
    for (const item of queue) {
      if (item.userId !== user.id) {
        remaining.push(item);
        continue;
      }
      let res: DbMutationResult = { ok: false };
      if (item.type === 'insert_food') {
        res = await insertFoodEntryDb(item.payload);
      } else if (item.type === 'update_food') {
        res = await updateFoodEntryDb(item.payload);
      } else if (item.type === 'delete_food') {
        res = await deleteFoodEntryDb(user.id, item.payload.entryId);
      } else if (item.type === 'insert_weight') {
        res = await insertWeightEntryDb(item.payload);
      } else if (item.type === 'delete_weight') {
        res = await deleteWeightEntryDb(user.id, item.payload.entryId);
      }
      if (res.ok) {
        synced += 1;
      } else {
        remaining.push(item);
      }
    }
    writePendingSyncQueue(remaining);
    setPendingSyncCount(remaining.length);
    if (synced > 0) {
      notify(`Synced ${synced} pending ${synced === 1 ? 'change' : 'changes'}`);
    }
    return synced;
  }, [notify]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => {
      setIsOnline(true);
      void syncPendingNow();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncPendingNow]);

  const handleDbResult = useCallback(
    (res: DbMutationResult, fallbackAction?: PendingSyncAction) => {
      if (res.ok) return;
      if (res.needsSetup) {
        setNeedsSchemaSetup(true);
      }
      if (fallbackAction) {
        enqueuePendingSync(fallbackAction);
        notify('Saved locally — will sync automatically when connection returns', 'info');
        return;
      }
      notify(res.errorMessage || 'Could not save to cloud database', 'error');
    },
    [enqueuePendingSync, notify]
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

  // Persist guest mode state locally on any change
  useEffect(() => {
    if (authMode === 'guest') {
      storageService.saveState(state);
    }
  }, [authMode, state]);

  const hydrateAuxiliaryLocalCaches = useCallback((userId: string, user?: User | null) => {
    try {
      const storageKey = `calothrix_water_${userId}`;
      const cachedRaw = localStorage.getItem(storageKey);
      const cached = cachedRaw
        ? (JSON.parse(cachedRaw) as { logs?: Record<string, number>; goalMl?: number })
        : {};
      const metaLogs =
        (user?.user_metadata?.water_logs as Record<string, number> | undefined) || {};
      const mergedLogs = { ...metaLogs, ...(cached.logs || {}) };
      const metaGoal = Number(user?.user_metadata?.daily_water_goal_ml || 0);
      setWaterIntakeMlByDate(mergedLogs);
      setDailyWaterGoalMlState(cached.goalMl || metaGoal || 2500);
    } catch {
      setWaterIntakeMlByDate({});
      setDailyWaterGoalMlState(2500);
    }

    try {
      const burnRaw = localStorage.getItem(`calothrix_burn_${userId}`);
      const burnCached = burnRaw ? (JSON.parse(burnRaw) as Record<string, number>) : {};
      const metaBurn = (user?.user_metadata?.active_burn_logs as Record<string, number> | undefined) || {};
      setActiveBurnKcalByDate({ ...metaBurn, ...burnCached });
    } catch {
      setActiveBurnKcalByDate({});
    }

    try {
      const mealsRaw = localStorage.getItem(`calothrix_saved_meals_${userId}`);
      const parsedMeals = mealsRaw ? (JSON.parse(mealsRaw) as SavedMealCombo[]) : [];
      const metaMeals = Array.isArray(user?.user_metadata?.saved_meals)
        ? (user?.user_metadata?.saved_meals as SavedMealCombo[])
        : [];
      const mergedMealsMap = new Map<string, SavedMealCombo>();
      for (const m of [...metaMeals, ...(Array.isArray(parsedMeals) ? parsedMeals : [])]) {
        if (m && m.id) mergedMealsMap.set(m.id, m);
      }
      setSavedMeals(Array.from(mergedMealsMap.values()).slice(0, 40));
    } catch {
      setSavedMeals([]);
    }

    try {
      const assessmentsRaw = localStorage.getItem(`calothrix_weekly_assessments_${userId}`);
      const parsedAssessments = assessmentsRaw
        ? (JSON.parse(assessmentsRaw) as WeeklyAssessmentRecord[])
        : [];
      setWeeklyAssessments(Array.isArray(parsedAssessments) ? parsedAssessments : []);
    } catch {
      setWeeklyAssessments([]);
    }

    try {
      const historyRaw = localStorage.getItem(`calothrix_target_history_${userId}`);
      const parsedHistory = historyRaw
        ? (JSON.parse(historyRaw) as NutritionTargetHistoryRecord[])
        : [];
      setTargetHistory(Array.isArray(parsedHistory) ? parsedHistory : []);
    } catch {
      setTargetHistory([]);
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

      const wasGuest =
        typeof window !== 'undefined' && localStorage.getItem(GUEST_MODE_KEY) === '1';

      setSyncingDb(true);
      try {
        const result = await loadUserStateFromSupabase(user, savedTheme);
        let nextState = result.state;
        let mergedGuestCount = 0;

        // Non-destructive Guest-to-Account merge: preserve user-created guest logs without importing synthetic demo records
        if (wasGuest && !result.needsSchemaSetup) {
          const guestState = storageService.loadState();
          const isSyntheticDemo = Boolean(guestState.isDemoData);
          const userGuestFoodEntries = guestState.foodEntries.filter(
            (e) => !e.id.startsWith('demo-')
          );
          const userGuestCustomFoods = guestState.customFoods.filter(
            (f) => !f.id.startsWith('demo-')
          );
          const userGuestWeights = guestState.weightEntries.filter(
            (w) => !w.id.startsWith('demo-')
          );

          const hasGuestRecords =
            userGuestFoodEntries.length > 0 ||
            userGuestCustomFoods.length > 0 ||
            userGuestWeights.length > 0;

          if (hasGuestRecords) {
            const existingFoodIds = new Set(nextState.foodEntries.map((e) => e.id));
            const newGuestFoodEntries = userGuestFoodEntries
              .filter((e) => !existingFoodIds.has(e.id))
              .map((e) => ({ ...e, userId: user.id }));

            const existingCustomIds = new Set(nextState.customFoods.map((f) => f.id));
            const newGuestCustomFoods = userGuestCustomFoods
              .filter((f) => !existingCustomIds.has(f.id))
              .map((f) => ({ ...f, userId: user.id }));

            const existingWeightIds = new Set(nextState.weightEntries.map((w) => w.id));
            const newGuestWeights = userGuestWeights
              .filter((w) => !existingWeightIds.has(w.id))
              .map((w) => ({ ...w, userId: user.id }));

            mergedGuestCount =
              newGuestFoodEntries.length + newGuestCustomFoods.length + newGuestWeights.length;

            if (mergedGuestCount > 0) {
              const mergedFavs = isSyntheticDemo
                ? nextState.favoriteFoodIds
                : Array.from(
                    new Set([...nextState.favoriteFoodIds, ...guestState.favoriteFoodIds])
                  );
              const mergedRecents = isSyntheticDemo
                ? nextState.recentFoodIds
                : Array.from(
                    new Set([...guestState.recentFoodIds, ...nextState.recentFoodIds])
                  ).slice(0, 12);

              const migratedState: MacroLogPersistedState = {
                ...nextState,
                foodEntries: [...newGuestFoodEntries, ...nextState.foodEntries],
                customFoods: [...newGuestCustomFoods, ...nextState.customFoods],
                weightEntries: [...newGuestWeights, ...nextState.weightEntries],
                favoriteFoodIds: mergedFavs,
                recentFoodIds: mergedRecents,
                goals:
                  !isSyntheticDemo && nextState.goals.calories === 0 && guestState.goals.calories > 0
                    ? { ...guestState.goals, userId: user.id }
                    : nextState.goals,
                profile: { ...nextState.profile, roleSelected: true },
              };
              nextState = migratedState;
              void syncLocalStateToSupabase(user.id, {
                ...migratedState,
                foodEntries: newGuestFoodEntries,
                customFoods: newGuestCustomFoods,
                weightEntries: newGuestWeights,
              });
            }
          }

          // Merge user-created guest water & saved meals (skip synthetic demo seed caches)
          if (!isSyntheticDemo) {
            try {
              const guestWaterRaw = localStorage.getItem(`calothrix_water_${GUEST_USER_ID}`);
              if (guestWaterRaw) {
                const guestWater = JSON.parse(guestWaterRaw) as { logs?: Record<string, number>; goalMl?: number };
                const userWaterRaw = localStorage.getItem(`calothrix_water_${user.id}`);
                const userWater = userWaterRaw
                  ? (JSON.parse(userWaterRaw) as { logs?: Record<string, number>; goalMl?: number })
                  : {};
                const mergedLogs = { ...(guestWater.logs || {}), ...(userWater.logs || {}) };
                localStorage.setItem(
                  `calothrix_water_${user.id}`,
                  JSON.stringify({ logs: mergedLogs, goalMl: userWater.goalMl || guestWater.goalMl || 2500 })
                );
              }
              const guestMealsRaw = localStorage.getItem(`calothrix_saved_meals_${GUEST_USER_ID}`);
              if (guestMealsRaw) {
                const guestMeals = JSON.parse(guestMealsRaw) as SavedMealCombo[];
                const userMealsRaw = localStorage.getItem(`calothrix_saved_meals_${user.id}`);
                const userMeals = userMealsRaw ? (JSON.parse(userMealsRaw) as SavedMealCombo[]) : [];
                const byId = new Map<string, SavedMealCombo>();
                for (const m of [...guestMeals, ...userMeals]) {
                  if (m?.id && !m.id.startsWith('demo-')) byId.set(m.id, m);
                }
                localStorage.setItem(
                  `calothrix_saved_meals_${user.id}`,
                  JSON.stringify(Array.from(byId.values()).slice(0, 40))
                );
              }
            } catch {
              // Ignore cache merge failures
            }
          }

          localStorage.removeItem(GUEST_MODE_KEY);
        } else if (wasGuest) {
          localStorage.removeItem(GUEST_MODE_KEY);
        }

        const metaRole =
          user.user_metadata?.intended_role === 'trainer' ||
          user.user_metadata?.intended_role === 'individual'
            ? (user.user_metadata.intended_role as AccountRole)
            : null;
        const desiredRole: AccountRole | null =
          pendingAuthRole || (!nextState.profile.roleSelected ? metaRole : null);
        const resolvedRole: AccountRole | null =
          desiredRole || (nextState.profile.roleSelected ? nextState.profile.accountRole : null);
        let nextNeedsTrainerOnboarding = false;

        if (resolvedRole === 'trainer' && !result.needsSchemaSetup) {
          let pendingOnboarding: TrainerOnboardingInput | null = null;
          if (typeof window !== 'undefined') {
            try {
              const rawOnboarding = localStorage.getItem(PENDING_TRAINER_ONBOARDING_KEY);
              if (rawOnboarding) {
                pendingOnboarding = JSON.parse(rawOnboarding) as TrainerOnboardingInput;
              }
              localStorage.removeItem(PENDING_TRAINER_ONBOARDING_KEY);
            } catch {
              localStorage.removeItem(PENDING_TRAINER_ONBOARDING_KEY);
            }
          }
          const metaOnboarding =
            user.user_metadata?.trainer_onboarding &&
            typeof user.user_metadata.trainer_onboarding === 'object'
              ? (user.user_metadata.trainer_onboarding as TrainerOnboardingInput)
              : null;
          const resolvedOnboarding = pendingOnboarding || metaOnboarding;

          const existingTrainer = await fetchTrainerProfile(user.id);
          if (existingTrainer.ok) {
            if (resolvedOnboarding) {
              const authInfo = extractAuthDetails(user);
              await upsertTrainerProfile({
                userId: user.id,
                displayName:
                  resolvedOnboarding.displayName?.trim() ||
                  existingTrainer.data?.displayName ||
                  authInfo.name ||
                  nextState.profile.name ||
                  'Coach',
                bio: resolvedOnboarding.bio ?? existingTrainer.data?.bio ?? '',
                specialties:
                  resolvedOnboarding.specialties && resolvedOnboarding.specialties.length > 0
                    ? resolvedOnboarding.specialties
                    : existingTrainer.data?.specialties && existingTrainer.data.specialties.length > 0
                    ? existingTrainer.data.specialties
                    : ['Fat Loss', 'Macro Coaching'],
                certifications:
                  resolvedOnboarding.certifications ?? existingTrainer.data?.certifications ?? [],
                acceptingClients:
                  resolvedOnboarding.acceptingClients ??
                  existingTrainer.data?.acceptingClients ??
                  true,
              });
              nextNeedsTrainerOnboarding = false;
            } else if (existingTrainer.data) {
              nextNeedsTrainerOnboarding = false;
            } else {
              // Require new coaches logging in via Google or Email to complete post-login onboarding
              nextNeedsTrainerOnboarding = true;
            }
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
        setNeedsTrainerOnboarding(nextNeedsTrainerOnboarding);
        setAuthMode('authenticated');

        hydrateAuxiliaryLocalCaches(user.id, user);
        const defaultWater = Math.min(
          4500,
          Math.max(
            2000,
            Math.round(((nextState.profile.currentWeightKg || 70) * 35 + 250) / 250) * 250
          )
        );
        if (!localStorage.getItem(`calothrix_water_${user.id}`) && !user.user_metadata?.daily_water_goal_ml) {
          setDailyWaterGoalMlState(defaultWater);
        }

        if (mergedGuestCount > 0) {
          notify(`Merged ${mergedGuestCount} guest ${mergedGuestCount === 1 ? 'entry' : 'entries'} into your account`);
        }

        if (!result.needsSchemaSetup) {
          void refreshCoachingAlertsForUser(user.id);
          void syncPendingNow();

          // Cross-device hydrate from water_logs and user_saved_meals tables if migration is applied
          void supabase
            .from('water_logs')
            .select('date, amount_ml')
            .eq('user_id', user.id)
            .order('date', { ascending: false })
            .limit(90)
            .then(({ data, error }) => {
              if (!error && Array.isArray(data) && data.length > 0) {
                setWaterIntakeMlByDate((prev) => {
                  const merged = { ...prev };
                  for (const row of data as { date: string; amount_ml: number }[]) {
                    if (row.date && Number.isFinite(row.amount_ml)) {
                      merged[row.date] = Math.max(merged[row.date] || 0, Number(row.amount_ml));
                    }
                  }
                  return merged;
                });
              }
            });

          void supabase
            .from('user_saved_meals')
            .select('id, name, meal_type, items, total_calories, total_protein, total_carbs, total_fat, total_fibre, created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(40)
            .then(({ data, error }) => {
              if (!error && Array.isArray(data) && data.length > 0) {
                const mapped: SavedMealCombo[] = (data as Record<string, unknown>[]).map((row) => ({
                  id: String(row.id),
                  name: String(row.name || 'Saved Meal'),
                  mealType: (row.meal_type as MealCategory) || 'lunch',
                  items: Array.isArray(row.items) ? (row.items as SavedMealComboItem[]) : [],
                  totalCalories: Number(row.total_calories || 0),
                  totalProtein: Number(row.total_protein || 0),
                  totalCarbs: Number(row.total_carbs || 0),
                  totalFat: Number(row.total_fat || 0),
                  totalFibre: Number(row.total_fibre || 0),
                  createdAt: String(row.created_at || new Date().toISOString()),
                }));
                setSavedMeals((prev) => {
                  const byId = new Map<string, SavedMealCombo>();
                  for (const item of [...prev, ...mapped]) {
                    byId.set(item.id, item);
                  }
                  return Array.from(byId.values()).slice(0, 40);
                });
              }
            });

          void fetchWeeklyAssessmentsDb(user.id).then((waRes) => {
            if (waRes.ok && waRes.items.length > 0) {
              setWeeklyAssessments(waRes.items);
              try {
                localStorage.setItem(
                  `calothrix_weekly_assessments_${user.id}`,
                  JSON.stringify(waRes.items)
                );
              } catch {
                // ignore storage quota
              }
            }
          });

          void fetchTargetHistoryDb(user.id).then((thRes) => {
            if (thRes.ok && thRes.items.length > 0) {
              setTargetHistory(thRes.items);
              try {
                localStorage.setItem(
                  `calothrix_target_history_${user.id}`,
                  JSON.stringify(thRes.items)
                );
              } catch {
                // ignore storage quota
              }
            }
          });
        }
      } catch {
        setState(createZeroUserState(user, savedTheme));
        setNeedsSchemaSetup(true);
        setAuthMode('authenticated');
      } finally {
        setSyncingDb(false);
      }
    },
    [hydrateAuxiliaryLocalCaches, notify, refreshCoachingAlertsForUser, syncPendingNow]
  );

  const buildGuestDemoState = useCallback(
    (savedTheme: AppSettings['theme']): { guestState: MacroLogPersistedState; seededFresh: boolean } => {
      const loaded = storageService.loadState();
      const hasExistingGuestData =
        Boolean(loaded.isDemoData) ||
        loaded.foodEntries.length > 0 ||
        loaded.weightEntries.length > 0 ||
        loaded.customFoods.length > 0 ||
        loaded.goals.calories > 0 ||
        Boolean(loaded.profile?.onboardingCompleted);

      if (!hasExistingGuestData) {
        const seeded = createDemoState(GUEST_USER_ID, loaded.settings?.theme || savedTheme);
        seedDemoAuxiliaryCaches(GUEST_USER_ID, seeded);
        return {
          seededFresh: true,
          guestState: {
            ...seeded,
            profile: {
              ...seeded.profile,
              id: GUEST_USER_ID,
              accountRole: 'individual',
              roleSelected: true,
            },
          },
        };
      }

      if (loaded.isDemoData && typeof window !== 'undefined') {
        const hasWaterCache = Boolean(localStorage.getItem(`calothrix_water_${GUEST_USER_ID}`));
        if (!hasWaterCache) {
          seedDemoAuxiliaryCaches(GUEST_USER_ID, loaded);
        }
      }

      return {
        seededFresh: false,
        guestState: {
          ...loaded,
          profile: {
            ...loaded.profile,
            id: GUEST_USER_ID,
            accountRole: 'individual',
            roleSelected: true,
          },
        },
      };
    },
    []
  );

  const enterGuestMode = useCallback(() => {
    localStorage.setItem(GUEST_MODE_KEY, '1');
    const savedTheme =
      (localStorage.getItem('calothrix_theme_pref_v2') as AppSettings['theme'] | null) || 'dark';
    const { guestState } = buildGuestDemoState(savedTheme);

    storageService.saveState(guestState);
    setState(guestState);
    setNeedsSchemaSetup(false);
    setNeedsTrainerOnboarding(false);
    hydrateAuxiliaryLocalCaches(GUEST_USER_ID, null);
    setAuthMode('guest');
    setActiveTab('home');
    notify('Guest Login active — your data stays saved on this device. Sign in anytime to sync.');
  }, [buildGuestDemoState, hydrateAuxiliaryLocalCaches, notify, setActiveTab]);

  const exitGuestModeToAuth = useCallback(() => {
    setAuthMode('unauthenticated');
  }, []);

  // Initialize Supabase Auth & Popup OAuth listener
  useEffect(() => {
    let mounted = true;
    localStorage.removeItem('calothrix_demo_preview_active');

    const init = async () => {
      try {
        const {
          data: { session: initialSession },
        } = await supabase.auth.getSession();

        let session = initialSession;
        if (session) {
          const expiresAtMs = (session.expires_at || 0) * 1000;
          if (!expiresAtMs || expiresAtMs < Date.now() + 60_000) {
            const { data: refreshed } = await supabase.auth.refreshSession();
            if (refreshed?.session) {
              session = refreshed.session;
            }
          }
        }

        if (!mounted) return;
        if (session?.user) {
          await hydrateForUser(session.user);
        } else if (localStorage.getItem(GUEST_MODE_KEY) === '1') {
          const savedTheme =
            (localStorage.getItem('calothrix_theme_pref_v2') as AppSettings['theme'] | null) ||
            'dark';
          const { guestState, seededFresh } = buildGuestDemoState(savedTheme);
          if (seededFresh) {
            storageService.saveState(guestState);
          }

          setState(guestState);
          hydrateAuxiliaryLocalCaches(GUEST_USER_ID, null);
          setAuthMode('guest');
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
        localStorage.removeItem(GUEST_MODE_KEY);
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
      if (event.origin !== window.location.origin) return;
      if (!event.data || event.data.type !== 'CALOTHRIX_SUPABASE_OAUTH') return;
      const hashStr: string = typeof event.data.hash === 'string' ? event.data.hash : '';
      const searchStr: string = typeof event.data.search === 'string' ? event.data.search : '';
      const hashParams = new URLSearchParams(hashStr.replace(/^#/, ''));
      const searchParams = new URLSearchParams(searchStr.replace(/^\?/, ''));

      const authCode = searchParams.get('code');
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const errorDesc =
        hashParams.get('error_description') || searchParams.get('error_description');

      if (errorDesc) {
        notify(decodeURIComponent(errorDesc), 'error');
        return;
      }

      if (authCode) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(authCode);
        if (error) {
          notify(error.message, 'error');
          return;
        }
        if (data.user) {
          await hydrateForUser(data.user);
          notify('Signed in with Google');
        }
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

    void fetchFoodOverridesApi().then((items) => {
      if (!mounted || items.length === 0) return;
      setAdminFoodOverrides((prev) => {
        const next = { ...prev };
        for (const item of items) {
          next[item.id] = item;
        }
        try {
          localStorage.setItem(ADMIN_OVERRIDES_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Ignore storage quota issues
        }
        return next;
      });
    });

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
        // Mobile browsers often block popups — gracefully fall back to full-page redirect
        window.location.assign(data.url);
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
      intendedRole?: AccountRole,
      trainerOnboarding?: TrainerOnboardingInput
    ): Promise<{ error?: string; needsEmailConfirmation?: boolean }> => {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: name.trim(),
            ...(intendedRole ? { intended_role: intendedRole } : {}),
            ...(trainerOnboarding ? { trainer_onboarding: trainerOnboarding } : {}),
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

  const signOut = useCallback(async () => {
    localStorage.removeItem(GUEST_MODE_KEY);
    if (authUserRef.current) {
      await supabase.auth.signOut();
    }
    setAuthUser(null);
    setNeedsSchemaSetup(false);
    setNeedsTrainerOnboarding(false);
    setPendingInvitations([]);
    setPendingRecommendations([]);
    setCoachPlans([]);
    const savedTheme =
      (localStorage.getItem('calothrix_theme_pref_v2') as AppSettings['theme'] | null) || 'dark';
    setState(createEmptyState(savedTheme));
    setAuthMode('unauthenticated');
    setActiveTab('home');
    notify('Signed out', 'info');
  }, [notify, setActiveTab]);

  const deleteAccount = useCallback(
    async (confirmationText: string): Promise<{ ok: boolean; error?: string; warning?: string }> => {
      if (confirmationText.trim() !== 'DELETE') {
        return { ok: false, error: 'Please type DELETE to confirm account deletion.' };
      }
      const user = authUserRef.current;
      if (!user) {
        // Guest local data wipe
        localStorage.removeItem(GUEST_MODE_KEY);
        localStorage.removeItem(`calothrix_water_${GUEST_USER_ID}`);
        localStorage.removeItem(`calothrix_saved_meals_${GUEST_USER_ID}`);
        localStorage.removeItem(`calothrix_burn_${GUEST_USER_ID}`);
        localStorage.removeItem(`calothrix_weekly_assessments_${GUEST_USER_ID}`);
        localStorage.removeItem(`calothrix_target_history_${GUEST_USER_ID}`);
        const savedTheme =
          (localStorage.getItem('calothrix_theme_pref_v2') as AppSettings['theme'] | null) || 'dark';
        storageService.clearAll(savedTheme);
        setState(createEmptyState(savedTheme));
        setAuthMode('unauthenticated');
        setActiveTab('home');
        notify('Local guest data erased', 'info');
        return { ok: true };
      }

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          return { ok: false, error: 'Your session expired. Please sign in again and retry.' };
        }
        const res = await fetch('/api/account', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ confirm: 'DELETE' }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          warning?: string;
        };
        if (!res.ok || !data.ok) {
          return { ok: false, error: data.error || 'Could not delete account right now.' };
        }

        // Clear local caches & sign out
        localStorage.removeItem(GUEST_MODE_KEY);
        localStorage.removeItem(`calothrix_water_${user.id}`);
        localStorage.removeItem(`calothrix_saved_meals_${user.id}`);
        localStorage.removeItem(`calothrix_burn_${user.id}`);
        localStorage.removeItem(`calothrix_weekly_assessments_${user.id}`);
        writePendingSyncQueue([]);
        setPendingSyncCount(0);
        await supabase.auth.signOut();
        setAuthUser(null);
        const savedTheme =
          (localStorage.getItem('calothrix_theme_pref_v2') as AppSettings['theme'] | null) || 'dark';
        setState(createEmptyState(savedTheme));
        setAuthMode('unauthenticated');
        setActiveTab('home');
        notify(data.warning ? data.warning : 'Your account and data have been deleted.', 'info');
        return { ok: true, warning: data.warning };
      } catch {
        return { ok: false, error: 'Network error while deleting account. Please try again.' };
      }
    },
    [notify, setActiveTab]
  );

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

  const applyAdminFoodOverride = useCallback((food: FoodItem) => {
    setAdminFoodOverrides((prev) => {
      const next = { ...prev, [food.id]: food };
      try {
        localStorage.setItem(ADMIN_OVERRIDES_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage quota issues
      }
      return next;
    });
  }, []);

  const allFoods = useMemo(() => {
    const mergedDefaults = DEFAULT_FOODS.map((f) => adminFoodOverrides[f.id] ?? f);
    const defaultIds = new Set(DEFAULT_FOODS.map((f) => f.id));
    const extraOverrides = Object.values(adminFoodOverrides).filter((f) => !defaultIds.has(f.id));
    return [...state.customFoods, ...extraOverrides, ...mergedDefaults];
  }, [adminFoodOverrides, state.customFoods]);

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
      const targetMeal = options?.meal ?? getLastSelectedMeal();
      if (options?.meal) {
        saveLastSelectedMeal(options.meal);
      }
      setFoodModal({
        isOpen: true,
        initialMeal: targetMeal,
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
    (options?: { mode?: 'photo' | 'voice' | 'text' | 'label'; meal?: MealCategory; date?: string }) => {
      const targetMeal = options?.meal ?? getLastSelectedMeal();
      if (options?.meal) {
        saveLastSelectedMeal(options.meal);
      }
      setMealScannerModal({
        isOpen: true,
        initialMode: options?.mode ?? 'photo',
        initialMeal: targetMeal,
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
      const targetMeal = options?.meal ?? getLastSelectedMeal();
      if (options?.meal) {
        saveLastSelectedMeal(options.meal);
      }
      setBarcodeScannerModal({
        isOpen: true,
        initialMeal: targetMeal,
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
      const actorId = getActiveActorId();
      if (!actorId || items.length === 0) return 0;

      const now = new Date().toISOString();
      const newEntries: FoodLogEntry[] = items.map((item) => ({
        id: makeId('entry'),
        userId: actorId,
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

      saveLastSelectedMeal(mealType);
      setState((prev) => ({
        ...prev,
        foodEntries: [...newEntries, ...prev.foodEntries],
      }));

      if (authUserRef.current) {
        newEntries.forEach((entry) => {
          void insertFoodEntryDb(entry).then(handleDbResult);
        });
      }

      const totalKcal = newEntries.reduce((sum, e) => sum + e.calories, 0);
      notify(`Logged ${newEntries.length} ${newEntries.length === 1 ? 'item' : 'items'} (${totalKcal} kcal)`);
      return newEntries.length;
    },
    [getActiveActorId, handleDbResult, notify]
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
      const actorId = getActiveActorId();
      if (!actorId) return;

      // Duplicate submission guard (prevents accidental double-taps on mobile within 1.5s)
      const fingerprint = `${food.id}|${Math.round(quantityGrams * 10)}|${mealType}|${date}`;
      const nowMs = Date.now();
      if (
        lastFoodSubmitRef.current.fingerprint === fingerprint &&
        nowMs - lastFoodSubmitRef.current.timestamp < 1500
      ) {
        return;
      }
      lastFoodSubmitRef.current = { fingerprint, timestamp: nowMs };

      const scaled = calculateScaledNutrition(food, quantityGrams);
      const servingsCount =
        Math.round((quantityGrams / Math.max(1, food.servingWeightGrams)) * 100) / 100;
      const now = new Date().toISOString();
      const newEntry: FoodLogEntry = {
        id: makeId('entry'),
        userId: actorId,
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

      saveLastUsedPortion(food.id, quantityGrams, unitLabel || food.servingName);
      saveLastSelectedMeal(mealType);

      const nextRecents = [
        food.id,
        ...stateRef.current.recentFoodIds.filter((id) => id !== food.id),
      ].slice(0, 12);

      setState((prev) => ({
        ...prev,
        foodEntries: [newEntry, ...prev.foodEntries],
        recentFoodIds: nextRecents,
      }));

      if (authUserRef.current) {
        const pendingAction: PendingSyncAction = {
          id: `insert_food_${newEntry.id}`,
          userId: actorId,
          type: 'insert_food',
          payload: newEntry,
        };
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueuePendingSync(pendingAction);
        } else {
          void insertFoodEntryDb(newEntry).then((r) => handleDbResult(r, pendingAction));
          void upsertFoodPreferencesDb(actorId, stateRef.current.favoriteFoodIds, nextRecents);
        }
      }
      notify(`Added ${food.name} (${scaled.calories} kcal)`);
    },
    [enqueuePendingSync, getActiveActorId, handleDbResult, notify]
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

      saveLastUsedPortion(food.id, quantityGrams, unitLabel || food.servingName);
      saveLastSelectedMeal(mealType);

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

      if (updatedEntry && authUserRef.current) {
        void updateFoodEntryDb(updatedEntry).then(handleDbResult);
      }
      notify(`Updated ${food.name}`);
    },
    [handleDbResult, notify]
  );

  const quickUpdateFoodEntryQuantity = useCallback(
    (entryId: string, nextGramsRaw: number) => {
      const nextGrams = Math.max(1, Math.round(nextGramsRaw * 10) / 10);
      const now = new Date().toISOString();
      let updatedEntry: FoodLogEntry | null = null;

      setState((prev) => ({
        ...prev,
        foodEntries: prev.foodEntries.map((e) => {
          if (e.id !== entryId) return e;
          const matchedFood = [...prev.customFoods, ...DEFAULT_FOODS].find((f) => f.id === e.foodId);
          const scaled = matchedFood
            ? calculateScaledNutrition(matchedFood, nextGrams)
            : (() => {
                const factor = nextGrams / Math.max(1, e.quantityGrams);
                return {
                  calories: Math.round(e.calories * factor),
                  protein: Math.round(e.protein * factor * 10) / 10,
                  carbs: Math.round(e.carbs * factor * 10) / 10,
                  fat: Math.round(e.fat * factor * 10) / 10,
                  fibre: Math.round(e.fibre * factor * 10) / 10,
                };
              })();
          if (e.foodId) {
            saveLastUsedPortion(e.foodId, nextGrams, `${nextGrams} g`);
          }
          updatedEntry = {
            ...e,
            quantityGrams: nextGrams,
            unitLabel: `${nextGrams} g`,
            servingName: `${nextGrams} g`,
            ...scaled,
            updatedAt: now,
          };
          return updatedEntry;
        }),
      }));

      if (updatedEntry && authUserRef.current) {
        void updateFoodEntryDb(updatedEntry).then(handleDbResult);
      }
      notify('Quantity updated');
    },
    [handleDbResult, notify]
  );

  const deleteFoodEntry = useCallback(
    (entryId: string) => {
      const actorId = getActiveActorId();
      if (!actorId) return;
      setState((prev) => ({
        ...prev,
        foodEntries: prev.foodEntries.filter((e) => e.id !== entryId),
      }));
      if (authUserRef.current) {
        const pendingAction: PendingSyncAction = {
          id: `delete_food_${entryId}`,
          userId: actorId,
          type: 'delete_food',
          payload: { entryId },
        };
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          enqueuePendingSync(pendingAction);
        } else {
          void deleteFoodEntryDb(actorId, entryId).then((r) => handleDbResult(r, pendingAction));
        }
      }
      notify('Food entry removed', 'info');
    },
    [enqueuePendingSync, getActiveActorId, handleDbResult, notify]
  );

  const duplicateFoodEntry = useCallback(
    (entry: FoodLogEntry, targetDate?: string) => {
      const actorId = getActiveActorId();
      if (!actorId) return;
      const now = new Date().toISOString();
      const copy: FoodLogEntry = {
        ...entry,
        id: makeId('entry'),
        userId: actorId,
        date: targetDate ?? entry.date,
        createdAt: now,
        updatedAt: now,
      };
      setState((prev) => ({
        ...prev,
        foodEntries: [copy, ...prev.foodEntries],
      }));
      if (authUserRef.current) {
        void insertFoodEntryDb(copy).then(handleDbResult);
      }
      notify(`Duplicated ${entry.foodName}`);
    },
    [getActiveActorId, handleDbResult, notify]
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
        sourcePriority: 5,
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

  const persistTargetHistoryLocal = useCallback(
    (actorId: string, nextList: NutritionTargetHistoryRecord[]) => {
      const trimmed = nextList.slice(0, 50);
      try {
        localStorage.setItem(`calothrix_target_history_${actorId}`, JSON.stringify(trimmed));
      } catch {
        // Ignore storage quota errors
      }
      if (authModeRef.current === 'guest') {
        setState((prev) => ({ ...prev, targetHistory: trimmed }));
      }
    },
    []
  );

  const updateGoals = useCallback(
    (
      goals: Omit<NutritionGoals, 'userId' | 'updatedAt'>,
      meta?: {
        adjustmentType?: 'initial' | 'manual' | 'adaptive';
        adjustmentReason?: string;
        assessmentId?: string | null;
        manualOverrideActive?: boolean;
      }
    ) => {
      const actorId = getActiveActorId();
      if (!actorId) return;
      const now = new Date().toISOString();
      const todayKey = getTodayDateKey();
      const isManual = meta?.manualOverrideActive ?? (meta?.adjustmentType === 'manual' || goals.preset === 'custom');

      let historyRecordToPersist: NutritionTargetHistoryRecord | null = null;

      setState((prev) => {
        const prevGoals = prev.goals;
        const nextGoals: NutritionGoals = {
          ...goals,
          userId: actorId,
          initialCalculatedAt: goals.initialCalculatedAt || prev.goals.initialCalculatedAt || now,
          calculationVersion: goals.calculationVersion || prev.goals.calculationVersion || CALCULATION_VERSION,
          assessmentWeekNumber: goals.assessmentWeekNumber ?? prev.goals.assessmentWeekNumber ?? 0,
          manualOverrideActive: isManual,
          updatedAt: now,
        };
        const nextProfile: UserProfile = {
          ...prev.profile,
          targetWeightKg:
            goals.targetWeightKg !== undefined ? goals.targetWeightKg : prev.profile.targetWeightKg,
          macroFocus: goals.macroFocus ?? prev.profile.macroFocus,
          adaptiveTdeeKcal:
            goals.adaptiveTdeeKcal !== undefined
              ? goals.adaptiveTdeeKcal
              : prev.profile.adaptiveTdeeKcal,
          manualOverrideActive: isManual,
          onboardingCompleted: true,
          cycleAnchorDate: prev.profile.cycleAnchorDate || todayKey,
        };
        const nextWeightGoal =
          goals.targetWeightKg !== undefined
            ? {
                ...prev.weightGoal,
                targetWeightKg: goals.targetWeightKg,
                startingWeightKg:
                  prev.weightGoal.startingWeightKg > 0
                    ? prev.weightGoal.startingWeightKg
                    : prev.profile.currentWeightKg,
                updatedAt: now,
              }
            : prev.weightGoal;

        const targetsChanged =
          prevGoals.calories === 0 ||
          prevGoals.calories !== nextGoals.calories ||
          prevGoals.protein !== nextGoals.protein ||
          prevGoals.carbs !== nextGoals.carbs ||
          prevGoals.fat !== nextGoals.fat ||
          prevGoals.fibre !== nextGoals.fibre;

        if (targetsChanged && nextGoals.calories > 0) {
          const adjType =
            meta?.adjustmentType ??
            (prevGoals.calories === 0 ? 'initial' : isManual ? 'manual' : 'initial');
          const reason =
            meta?.adjustmentReason ||
            (adjType === 'initial' && prevGoals.calories === 0
              ? 'Initial personalized nutrition targets applied.'
              : isManual
              ? 'Manual custom calorie and macro targets saved.'
              : 'Recalculated nutrition targets applied from calculator.');
          historyRecordToPersist = {
            id: makeId('th'),
            userId: actorId,
            previousCalories: prevGoals.calories > 0 ? prevGoals.calories : null,
            previousProtein: prevGoals.calories > 0 ? prevGoals.protein : null,
            previousCarbs: prevGoals.calories > 0 ? prevGoals.carbs : null,
            previousFat: prevGoals.calories > 0 ? prevGoals.fat : null,
            previousFibre: prevGoals.calories > 0 ? prevGoals.fibre : null,
            newCalories: nextGoals.calories,
            newProtein: nextGoals.protein,
            newCarbs: nextGoals.carbs,
            newFat: nextGoals.fat,
            newFibre: nextGoals.fibre,
            targetWeightKg: nextGoals.targetWeightKg ?? null,
            effectiveDate: todayKey,
            adjustmentReason: reason,
            assessmentId: meta?.assessmentId ?? null,
            applied: true,
            adjustmentType: adjType,
            createdAt: now,
          };
        }

        if (authUserRef.current) {
          void upsertNutritionGoals(actorId, nextGoals).then(handleDbResult);
          void upsertProfileAndSettings(actorId, nextProfile, prev.settings);
          if (goals.targetWeightKg !== undefined) {
            void upsertWeightGoal(actorId, nextWeightGoal);
          }
        }

        return {
          ...prev,
          goals: nextGoals,
          profile: nextProfile,
          weightGoal: nextWeightGoal,
        };
      });

      if (historyRecordToPersist) {
        const record = historyRecordToPersist as NutritionTargetHistoryRecord;
        setTargetHistory((prev) => {
          const next = [record, ...prev].slice(0, 50);
          persistTargetHistoryLocal(actorId, next);
          return next;
        });
        if (authUserRef.current) {
          void insertTargetHistoryDb(actorId, record);
        }
      }

      notify('Nutrition goals saved');
    },
    [getActiveActorId, handleDbResult, notify, persistTargetHistoryLocal]
  );

  const addWeightEntry = useCallback(
    ({ weightKg, date, notes }: { weightKg: number; date: string; notes?: string }) => {
      const actorId = getActiveActorId();
      if (!actorId) return;
      const now = new Date().toISOString();
      const newEntry: WeightEntry = {
        id: makeId('weight'),
        userId: actorId,
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

        if (authUserRef.current) {
          void insertWeightEntryDb(newEntry).then(handleDbResult);
          void upsertProfileAndSettings(actorId, nextProfile, prev.settings);
          if (shouldSetStarting) {
            void upsertWeightGoal(actorId, nextWeightGoal);
          }
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
    [getActiveActorId, handleDbResult, notify]
  );

  const updateWeightEntry = useCallback(
    (entryId: string, { weightKg, date, notes }: { weightKg: number; date: string; notes?: string }) => {
      const actorId = getActiveActorId();
      if (!actorId) return;
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

        if (updatedEntry && authUserRef.current) {
          void updateWeightEntryDb(updatedEntry).then(handleDbResult);
          void upsertProfileAndSettings(actorId, nextProfile, prev.settings);
        }

        return {
          ...prev,
          weightEntries: updated,
          profile: nextProfile,
        };
      });
      notify('Weight entry updated');
    },
    [getActiveActorId, handleDbResult, notify]
  );

  const deleteWeightEntry = useCallback(
    (entryId: string) => {
      const actorId = getActiveActorId();
      if (!actorId) return;
      setState((prev) => {
        const updated = prev.weightEntries.filter((w) => w.id !== entryId);
        const sortedDesc = sortWeightEntriesChronological(updated, 'desc');
        const latestKg = sortedDesc[0]?.weightKg ?? 0;
        const nextProfile = { ...prev.profile, currentWeightKg: latestKg };

        if (authUserRef.current) {
          void deleteWeightEntryDb(actorId, entryId).then(handleDbResult);
          void upsertProfileAndSettings(actorId, nextProfile, prev.settings);
        }

        return {
          ...prev,
          weightEntries: updated,
          profile: nextProfile,
        };
      });
      notify('Weight entry deleted', 'info');
    },
    [getActiveActorId, handleDbResult, notify]
  );

  const updateWeightGoal = useCallback(
    (goal: Omit<WeightGoal, 'userId' | 'updatedAt'>) => {
      const actorId = getActiveActorId();
      if (!actorId) return;
      const now = new Date().toISOString();
      const nextWeightGoal: WeightGoal = {
        ...goal,
        userId: actorId,
        updatedAt: now,
      };
      setState((prev) => {
        const nextProfile = { ...prev.profile, targetWeightKg: goal.targetWeightKg };
        const nextGoals = { ...prev.goals, targetWeightKg: goal.targetWeightKg };
        if (authUserRef.current) {
          void upsertWeightGoal(actorId, nextWeightGoal).then(handleDbResult);
          void upsertProfileAndSettings(actorId, nextProfile, prev.settings);
          void upsertNutritionGoals(actorId, nextGoals);
        }
        return {
          ...prev,
          weightGoal: nextWeightGoal,
          profile: nextProfile,
          goals: nextGoals,
        };
      });
      notify('Weight goal updated');
    },
    [getActiveActorId, handleDbResult, notify]
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
      trainerOnboarding?: TrainerOnboardingInput
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
        if (!existing.data && !trainerOnboarding) {
          setNeedsTrainerOnboarding(true);
        } else {
          if (!existing.data || trainerOnboarding) {
            const res = await upsertTrainerProfile({
              userId: user.id,
              displayName:
                trainerOnboarding?.displayName?.trim() ||
                existing.data?.displayName ||
                stateRef.current.profile.name ||
                'Coach',
              bio: trainerOnboarding?.bio ?? existing.data?.bio ?? '',
              specialties:
                trainerOnboarding?.specialties && trainerOnboarding.specialties.length > 0
                  ? trainerOnboarding.specialties
                  : existing.data?.specialties && existing.data.specialties.length > 0
                  ? existing.data.specialties
                  : ['Fat Loss', 'Macro Coaching'],
              certifications:
                trainerOnboarding?.certifications ?? existing.data?.certifications ?? [],
              acceptingClients:
                trainerOnboarding?.acceptingClients ?? existing.data?.acceptingClients ?? true,
            });
            if (!res.ok) {
              notify(
                res.error || 'Could not initialize trainer profile. Please verify SQL migration.',
                'error'
              );
              return false;
            }
          }
          setNeedsTrainerOnboarding(false);
        }
      } else {
        setNeedsTrainerOnboarding(false);
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
        if (trainerOnboarding) {
          notify('Trainer Dashboard ready');
        }
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
    (actorId: string, logs: Record<string, number>, goalMl: number) => {
      const trimmedKeys = Object.keys(logs).sort().slice(-45);
      const compactLogs: Record<string, number> = {};
      for (const k of trimmedKeys) {
        if ((logs[k] ?? 0) > 0) compactLogs[k] = logs[k];
      }
      try {
        localStorage.setItem(
          `calothrix_water_${actorId}`,
          JSON.stringify({ logs: compactLogs, goalMl })
        );
      } catch {
        // Ignore storage errors
      }
      if (authUserRef.current) {
        void supabase.auth.updateUser({
          data: { water_logs: compactLogs, daily_water_goal_ml: goalMl },
        });
      }
    },
    []
  );

  const addWaterMl = useCallback(
    (dateKey: string, deltaMl: number) => {
      const actorId = getActiveActorId();
      setWaterIntakeMlByDate((prev) => {
        const nextVal = Math.max(0, Math.min(8000, (prev[dateKey] || 0) + deltaMl));
        const nextLogs = { ...prev, [dateKey]: nextVal };
        if (actorId) {
          syncWaterMeta(actorId, nextLogs, dailyWaterGoalMl);
          if (authUserRef.current) {
            void supabase
              .from('water_logs')
              .upsert(
                {
                  user_id: actorId,
                  date: dateKey,
                  amount_ml: nextVal,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: 'user_id,date' }
              );
          }
        }
        return nextLogs;
      });
    },
    [dailyWaterGoalMl, getActiveActorId, syncWaterMeta]
  );

  const setDailyWaterGoalMl = useCallback(
    (goalMl: number) => {
      const clamped = Math.max(1000, Math.min(6000, Math.round(goalMl / 250) * 250));
      setDailyWaterGoalMlState(clamped);
      const actorId = getActiveActorId();
      if (actorId) {
        syncWaterMeta(actorId, waterIntakeMlByDate, clamped);
      }
      notify(`Daily water target set to ${(clamped / 1000).toFixed(2).replace(/\.?0+$/, '')} L`);
    },
    [getActiveActorId, notify, syncWaterMeta, waterIntakeMlByDate]
  );

  const syncBurnMeta = useCallback((actorId: string, logs: Record<string, number>) => {
    const trimmedKeys = Object.keys(logs).sort().slice(-45);
    const compact: Record<string, number> = {};
    for (const k of trimmedKeys) {
      if ((logs[k] ?? 0) > 0) compact[k] = logs[k];
    }
    try {
      localStorage.setItem(`calothrix_burn_${actorId}`, JSON.stringify(compact));
    } catch {
      // Ignore storage errors
    }
    if (authUserRef.current) {
      void supabase.auth.updateUser({
        data: { active_burn_logs: compact },
      });
    }
  }, []);

  const setActiveBurnKcal = useCallback(
    (dateKey: string, kcal: number) => {
      const actorId = getActiveActorId();
      const clamped = Math.max(0, Math.min(3500, Math.round(kcal)));
      setActiveBurnKcalByDate((prev) => {
        const next = { ...prev, [dateKey]: clamped };
        if (actorId) syncBurnMeta(actorId, next);
        return next;
      });
    },
    [getActiveActorId, syncBurnMeta]
  );

  const addActiveBurnKcal = useCallback(
    (dateKey: string, deltaKcal: number) => {
      const actorId = getActiveActorId();
      setActiveBurnKcalByDate((prev) => {
        const nextVal = Math.max(0, Math.min(3500, Math.round((prev[dateKey] || 0) + deltaKcal)));
        const next = { ...prev, [dateKey]: nextVal };
        if (actorId) syncBurnMeta(actorId, next);
        return next;
      });
    },
    [getActiveActorId, syncBurnMeta]
  );

  const persistSavedMeals = useCallback((actorId: string, nextMeals: SavedMealCombo[]) => {
    try {
      localStorage.setItem(`calothrix_saved_meals_${actorId}`, JSON.stringify(nextMeals));
    } catch {
      // Ignore storage errors
    }
    if (authUserRef.current) {
      void supabase.auth.updateUser({
        data: { saved_meals: nextMeals.slice(0, 20) },
      });
    }
  }, []);

  const saveMealCombo = useCallback(
    (name: string, mealType: MealCategory, items: SavedMealComboItem[]): SavedMealCombo | null => {
      const actorId = getActiveActorId();
      const cleanName = name.trim();
      if (!actorId || !cleanName || items.length === 0) return null;
      const combo: SavedMealCombo = {
        id: makeId('combo'),
        name: cleanName,
        mealType,
        items,
        totalCalories: Math.round(items.reduce((s, i) => s + i.calories, 0)),
        totalProtein: Math.round(items.reduce((s, i) => s + i.protein, 0) * 10) / 10,
        totalCarbs: Math.round(items.reduce((s, i) => s + i.carbs, 0) * 10) / 10,
        totalFat: Math.round(items.reduce((s, i) => s + i.fat, 0) * 10) / 10,
        totalFibre: Math.round(items.reduce((s, i) => s + i.fibre, 0) * 10) / 10,
        createdAt: new Date().toISOString(),
      };
      setSavedMeals((prev) => {
        const next = [combo, ...prev].slice(0, 40);
        persistSavedMeals(actorId, next);
        return next;
      });
      if (authUserRef.current) {
        void supabase.from('user_saved_meals').upsert({
          id: combo.id,
          user_id: actorId,
          name: combo.name,
          meal_type: combo.mealType,
          items: combo.items,
          total_calories: combo.totalCalories,
          total_protein: combo.totalProtein,
          total_carbs: combo.totalCarbs,
          total_fat: combo.totalFat,
          total_fibre: combo.totalFibre,
          created_at: combo.createdAt,
        });
      }
      notify(`Saved combo "${cleanName}" (${combo.totalCalories} kcal)`);
      return combo;
    },
    [getActiveActorId, notify, persistSavedMeals]
  );

  const deleteSavedMealCombo = useCallback(
    (comboId: string) => {
      const actorId = getActiveActorId();
      setSavedMeals((prev) => {
        const next = prev.filter((c) => c.id !== comboId);
        if (actorId) persistSavedMeals(actorId, next);
        return next;
      });
      if (authUserRef.current && actorId) {
        void supabase
          .from('user_saved_meals')
          .delete()
          .eq('user_id', actorId)
          .eq('id', comboId);
      }
      notify('Saved meal deleted', 'info');
    },
    [getActiveActorId, notify, persistSavedMeals]
  );

  const logSavedMealCombo = useCallback(
    (combo: SavedMealCombo, mealType: MealCategory, date: string): number => {
      const actorId = getActiveActorId();
      if (!actorId || combo.items.length === 0) return 0;
      const now = new Date().toISOString();
      const entries: FoodLogEntry[] = combo.items.map((item) => {
        const foodMatch = [...stateRef.current.customFoods, ...DEFAULT_FOODS].find(
          (f) => f.id === item.foodId
        );
        return {
          id: makeId('entry'),
          userId: actorId,
          date,
          mealType,
          foodId: item.foodId,
          foodName: item.foodName,
          quantityGrams: item.quantityGrams,
          servingsCount: 1,
          servingName: item.unitLabel || `${item.quantityGrams} g`,
          unitLabel: item.unitLabel || `${item.quantityGrams} g`,
          measurementBasis: foodMatch?.measurementBasis || 'per_serving',
          verificationStatus: foodMatch?.verificationStatus || 'verified',
          foodState: foodMatch?.foodState,
          sourceName: foodMatch?.sourceName || `Saved Meal (${combo.name})`,
          sourceType: foodMatch?.sourceType || 'verified_reference',
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
          fibre: item.fibre,
          createdAt: now,
          updatedAt: now,
        };
      });

      saveLastSelectedMeal(mealType);
      setState((prev) => ({
        ...prev,
        foodEntries: [...entries, ...prev.foodEntries],
      }));
      if (authUserRef.current) {
        entries.forEach((e) => {
          void insertFoodEntryDb(e).then(handleDbResult);
        });
      }
      notify(`Logged "${combo.name}" (${combo.totalCalories} kcal)`);
      return entries.length;
    },
    [getActiveActorId, handleDbResult, notify]
  );

  const copyMealFromPreviousDay = useCallback(
    (mealType: MealCategory, targetDate: string): number => {
      const actorId = getActiveActorId();
      if (!actorId) return 0;
      const yesterdayKey = addDaysToDateKey(targetDate, -1);
      const sourceEntries = stateRef.current.foodEntries.filter(
        (e) => e.date === yesterdayKey && e.mealType === mealType
      );
      if (sourceEntries.length === 0) return 0;
      const now = new Date().toISOString();
      const clones: FoodLogEntry[] = sourceEntries.map((entry) => ({
        ...entry,
        id: makeId('entry'),
        userId: actorId,
        date: targetDate,
        createdAt: now,
        updatedAt: now,
      }));
      setState((prev) => ({
        ...prev,
        foodEntries: [...clones, ...prev.foodEntries],
      }));
      if (authUserRef.current) {
        clones.forEach((clone) => {
          void insertFoodEntryDb(clone).then(handleDbResult);
        });
      }
      notify(
        `Copied ${clones.length} ${clones.length === 1 ? 'item' : 'items'} from yesterday`
      );
      return clones.length;
    },
    [getActiveActorId, handleDbResult, notify]
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

  // ============================================================================
  // 15-DAY AI ADAPTIVE ASSESSMENT ACTIONS & DUE-CHECK
  // ============================================================================
  const persistWeeklyAssessmentsLocal = useCallback(
    (actorId: string, nextList: WeeklyAssessmentRecord[]) => {
      const trimmed = nextList.slice(0, 36);
      try {
        localStorage.setItem(`calothrix_weekly_assessments_${actorId}`, JSON.stringify(trimmed));
      } catch {
        // Ignore storage quota errors
      }
      if (authModeRef.current === 'guest') {
        setState((prev) => ({ ...prev, weeklyAssessments: trimmed }));
      }
    },
    []
  );

  const toggleAdaptivePaused = useCallback(
    (paused: boolean) => {
      const actorId = getActiveActorId();
      if (!actorId) return;
      setState((prev) => {
        const nextProfile: UserProfile = {
          ...prev.profile,
          adaptivePaused: paused,
        };
        if (authUserRef.current) {
          void upsertProfileAndSettings(actorId, nextProfile, prev.settings).then(handleDbResult);
        }
        return {
          ...prev,
          profile: nextProfile,
        };
      });
      notify(
        paused
          ? '14-day adaptive adjustments paused — your active targets stay locked'
          : '14-day adaptive nutrition tracking resumed',
        'info'
      );
    },
    [getActiveActorId, handleDbResult, notify]
  );

  const clearManualOverride = useCallback(() => {
    const actorId = getActiveActorId();
    if (!actorId) return;
    setState((prev) => {
      const nextProfile: UserProfile = {
        ...prev.profile,
        manualOverrideActive: false,
      };
      const nextGoals: NutritionGoals = {
        ...prev.goals,
        manualOverrideActive: false,
      };
      if (authUserRef.current) {
        void upsertProfileAndSettings(actorId, nextProfile, prev.settings);
        void upsertNutritionGoals(actorId, nextGoals);
      }
      return {
        ...prev,
        profile: nextProfile,
        goals: nextGoals,
      };
    });
    notify('Adaptive target recommendations re-enabled', 'info');
  }, [getActiveActorId, notify]);

  const assessmentDueStatus = useMemo<WeeklyAssessmentDueStatus>(
    () =>
      evaluateWeeklyAssessmentDueStatus({
        profile: state.profile,
        goals: state.goals,
        weightEntries: state.weightEntries,
        foodEntries: state.foodEntries,
        weeklyAssessments,
      }),
    [state.profile, state.goals, state.weightEntries, state.foodEntries, weeklyAssessments]
  );

  const openWeeklyAssessmentModal = useCallback((assessment?: WeeklyAssessmentRecord) => {
    setWeeklyAssessmentModal({
      isOpen: true,
      assessment: assessment ?? null,
      loading: false,
      error: null,
    });
  }, []);

  const closeWeeklyAssessmentModal = useCallback(() => {
    setWeeklyAssessmentModal((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const runWeeklyAssessment = useCallback(
    async (options?: {
      openModal?: boolean;
      forceRecompute?: boolean;
    }): Promise<WeeklyAssessmentRecord | null> => {
      const actorId = getActiveActorId();
      if (!actorId) return null;

      const cur = stateRef.current;
      const latestLoggedWeightKg = cur.weightEntries.length > 0 ? cur.weightEntries[0]?.weightKg || 0 : 0;
      const effectiveCurrentWeightKg =
        cur.profile.currentWeightKg >= 30 ? cur.profile.currentWeightKg : latestLoggedWeightKg;

      if (cur.profile.age < 14 || cur.profile.heightCm < 120 || effectiveCurrentWeightKg < 30) {
        notify('Please complete your body measurements first to run a 14-day progress review.', 'info');
        return null;
      }

      const todayKey = getTodayDateKey();
      const weekStart = addDaysToDateKey(todayKey, -(ASSESSMENT_CYCLE_DAYS - 1));
      const historyStart = addDaysToDateKey(todayKey, -44);

      // Idempotent short-circuit if an active assessment already exists for this exact 14-day period
      if (!options?.forceRecompute) {
        const existing = weeklyAssessments.find(
          (a) => a.weekStartDate === weekStart && a.weekEndDate === todayKey
        );
        if (existing) {
          if (options?.openModal !== false) {
            setWeeklyAssessmentModal({
              isOpen: true,
              assessment: existing,
              loading: false,
              error: null,
            });
          }
          return existing;
        }
      }

      if (options?.openModal !== false) {
        setWeeklyAssessmentModal({
          isOpen: true,
          assessment: null,
          loading: true,
          error: null,
        });
      }

      const dailyNutrition = buildDailyNutritionSummaries(cur.foodEntries, historyStart, todayKey);
      const recentWeights = cur.weightEntries.filter((w) => w.date >= historyStart && w.date <= todayKey);

      const safeProfile: UserProfile = {
        ...cur.profile,
        currentWeightKg: effectiveCurrentWeightKg,
        targetWeightKg:
          cur.profile.targetWeightKg >= 30
            ? cur.profile.targetWeightKg
            : cur.goals.targetWeightKg && cur.goals.targetWeightKg >= 30
            ? cur.goals.targetWeightKg
            : effectiveCurrentWeightKg,
      };

      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (authUserRef.current) {
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData?.session?.access_token) {
            headers.Authorization = `Bearer ${sessionData.session.access_token}`;
          }
        }

        const response = await fetch('/api/assessments/weekly', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            profile: safeProfile,
            goals: cur.goals,
            weightEntries: recentWeights,
            dailyNutrition,
            previousAssessments: weeklyAssessments,
            referenceDateKey: todayKey,
            forceRecompute: Boolean(options?.forceRecompute),
          }),
        });

        let record: WeeklyAssessmentRecord | null = null;
        if (response.ok) {
          const data = (await response.json()) as {
            assessment?: WeeklyAssessmentRecord;
            persistedToSupabase?: boolean;
          };
          if (data.assessment) {
            record = data.assessment;
          }
        }

        if (!record) {
          // Offline / network deterministic fallback (never blocks user)
          const det = runDeterministicWeeklyAssessment({
            userId: actorId,
            profile: safeProfile,
            goals: cur.goals,
            weightEntries: recentWeights,
            dailyNutrition,
            previousAssessments: weeklyAssessments,
            referenceDateKey: todayKey,
          });
          record = {
            id: makeId('wa'),
            userId: actorId,
            weekStartDate: det.weekStartDate,
            weekEndDate: det.weekEndDate,
            assessmentWeekNumber: det.assessmentWeekNumber,
            cycleDays: det.cycleDays,
            previousWeightKg: det.weightAnalysis.previousMeasuredWeightKg,
            assessedWeightKg: det.weightAnalysis.latestMeasuredWeightKg,
            previousTrendWeightKg: det.weightAnalysis.previousTrendWeightKg,
            assessedTrendWeightKg: det.weightAnalysis.assessedTrendWeightKg,
            current7dAvgWeightKg: det.weightAnalysis.current7dAvgWeightKg,
            previous7dAvgWeightKg: det.weightAnalysis.previous7dAvgWeightKg,
            weeklyWeightChangeKg: det.weightAnalysis.weeklyWeightChangeKg,
            weeklyWeightChangePct: det.weightAnalysis.weeklyWeightChangePct,
            avgDailyCalories: det.avgDailyCalories,
            avgDailyProtein: det.avgDailyProtein,
            avgDailyCarbs: det.avgDailyCarbs,
            avgDailyFat: det.avgDailyFat,
            avgDailyFibre: det.avgDailyFibre,
            priorTdeeKcal: det.priorTdeeKcal,
            estimatedTdeeKcal: det.estimatedTdeeKcal,
            calibratedTdeeKcal: det.calibratedTdeeKcal,
            previousRecommendedCalories: det.previousRecommendedCalories,
            recommendedCalories: det.recommendedCalories,
            previousRecommendedProtein: det.previousRecommendedProtein,
            previousRecommendedCarbs: det.previousRecommendedCarbs,
            previousRecommendedFat: det.previousRecommendedFat,
            previousRecommendedFibre: det.previousRecommendedFibre,
            recommendedProtein: det.recommendedProtein,
            recommendedCarbs: det.recommendedCarbs,
            recommendedFat: det.recommendedFat,
            recommendedFibre: det.recommendedFibre,
            recommendedHydrationMl: det.recommendedHydrationMl,
            estimatedBmr: det.estimatedBmr,
            projectedWeeksToGoal: det.projectedWeeksToGoal,
            foodLoggedDays: det.foodLoggedDays,
            weightLoggedDays: det.weightLoggedDays,
            loggingCompletenessPct: det.loggingCompletenessPct,
            adherencePercentage: det.adherencePercentage,
            confidenceLevel: det.confidenceLevel,
            adjustmentType: det.adjustmentType,
            statusTag: det.statusTag,
            calorieDeltaKcal: det.calorieDeltaKcal,
            adjustmentReason: det.adjustmentReason,
            goalCompleted: det.goalCompleted,
            suggestedMaintenanceCalories: det.suggestedMaintenanceCalories,
            aiSummary: det.fallbackAiSummary,
            rationaleBullets: det.rationaleBullets,
            calculationVersion: det.calculationVersion,
            status: 'pending',
            appliedAt: null,
            createdAt: new Date().toISOString(),
          };
        }

        const finalRecord = record;
        setWeeklyAssessments((prev) => {
          const filtered = prev.filter(
            (a) =>
              !(
                a.weekStartDate === finalRecord.weekStartDate &&
                a.weekEndDate === finalRecord.weekEndDate
              )
          );
          const next = [finalRecord, ...filtered].sort((a, b) =>
            b.weekEndDate.localeCompare(a.weekEndDate)
          );
          persistWeeklyAssessmentsLocal(actorId, next);
          return next;
        });

        if (options?.openModal !== false) {
          setWeeklyAssessmentModal({
            isOpen: true,
            assessment: finalRecord,
            loading: false,
            error: null,
          });
        }
        return finalRecord;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to run 14-day progress review.';
        if (options?.openModal !== false) {
          setWeeklyAssessmentModal({
            isOpen: true,
            assessment: null,
            loading: false,
            error: message,
          });
        }
        notify(message, 'error');
        return null;
      }
    },
    [getActiveActorId, notify, persistWeeklyAssessmentsLocal, weeklyAssessments]
  );

  const applyWeeklyAssessment = useCallback(
    async (
      assessment: WeeklyAssessmentRecord,
      options?: { switchToMaintenance?: boolean; newGoal?: FitnessGoalType }
    ): Promise<boolean> => {
      const actorId = getActiveActorId();
      if (!actorId) return false;
      const now = new Date().toISOString();

      const cur = stateRef.current;
      const nextFitnessGoal: FitnessGoalType = options?.newGoal
        ? options.newGoal
        : options?.switchToMaintenance || assessment.goalCompleted
        ? 'maintain_weight'
        : cur.profile.fitnessGoal;

      const latestValidWeight =
        assessment.assessedWeightKg > 25
          ? assessment.assessedWeightKg
          : cur.profile.currentWeightKg;

      const nextTargetWeight =
        nextFitnessGoal === 'maintain_weight'
          ? latestValidWeight
          : cur.profile.targetWeightKg || cur.goals.targetWeightKg || latestValidWeight;

      const nextProfile: UserProfile = {
        ...cur.profile,
        currentWeightKg: latestValidWeight,
        targetWeightKg: nextTargetWeight,
        fitnessGoal: nextFitnessGoal,
        adaptiveTdeeKcal: assessment.calibratedTdeeKcal,
        lastWeeklyAssessmentAt: now,
        manualOverrideActive: false,
        onboardingCompleted: true,
        cycleAnchorDate: assessment.weekEndDate || cur.profile.cycleAnchorDate || getTodayDateKey(),
      };

      const nextGoals: NutritionGoals = {
        ...cur.goals,
        userId: actorId,
        preset: nextFitnessGoal,
        calories: assessment.recommendedCalories,
        protein: assessment.recommendedProtein,
        carbs: assessment.recommendedCarbs,
        fat: assessment.recommendedFat,
        fibre: assessment.recommendedFibre,
        targetWeightKg: nextTargetWeight,
        estimatedBmr: assessment.estimatedBmr ?? cur.goals.estimatedBmr,
        estimatedTdee: assessment.estimatedTdeeKcal ?? cur.goals.estimatedTdee,
        adaptiveTdeeKcal: assessment.calibratedTdeeKcal,
        assessmentWeekNumber: assessment.assessmentWeekNumber,
        initialCalculatedAt: cur.goals.initialCalculatedAt || now,
        calculationVersion: assessment.calculationVersion || CALCULATION_VERSION,
        estimatedWeeks: assessment.projectedWeeksToGoal ?? cur.goals.estimatedWeeks,
        manualOverrideActive: false,
        updatedAt: now,
      };

      const nextWeightGoal: WeightGoal = {
        userId: actorId,
        startingWeightKg:
          cur.weightGoal.startingWeightKg > 0
            ? cur.weightGoal.startingWeightKg
            : latestValidWeight,
        targetWeightKg: nextTargetWeight,
        goalDirection: getGoalDirectionForStrategy(
          nextFitnessGoal,
          latestValidWeight,
          nextTargetWeight
        ),
        updatedAt: now,
      };

      const appliedRecord: WeeklyAssessmentRecord = {
        ...assessment,
        status: 'applied',
        appliedAt: now,
      };

      const historyEntry: NutritionTargetHistoryRecord = {
        id: makeId('th'),
        userId: actorId,
        previousCalories:
          cur.goals.calories > 0 ? cur.goals.calories : assessment.previousRecommendedCalories,
        previousProtein:
          cur.goals.calories > 0 ? cur.goals.protein : assessment.previousRecommendedProtein ?? null,
        previousCarbs:
          cur.goals.calories > 0 ? cur.goals.carbs : assessment.previousRecommendedCarbs ?? null,
        previousFat:
          cur.goals.calories > 0 ? cur.goals.fat : assessment.previousRecommendedFat ?? null,
        previousFibre:
          cur.goals.calories > 0 ? cur.goals.fibre : assessment.previousRecommendedFibre ?? null,
        newCalories: assessment.recommendedCalories,
        newProtein: assessment.recommendedProtein,
        newCarbs: assessment.recommendedCarbs,
        newFat: assessment.recommendedFat,
        newFibre: assessment.recommendedFibre,
        targetWeightKg: nextTargetWeight,
        effectiveDate: getTodayDateKey(),
        adjustmentReason: assessment.adjustmentReason,
        assessmentId: appliedRecord.id,
        applied: true,
        adjustmentType: 'adaptive',
        createdAt: now,
      };

      setState((prev) => ({
        ...prev,
        profile: nextProfile,
        goals: nextGoals,
        weightGoal: nextWeightGoal,
      }));

      setWeeklyAssessments((prev) => {
        const exists = prev.some(
          (a) =>
            a.id === appliedRecord.id ||
            (a.weekStartDate === appliedRecord.weekStartDate &&
              a.weekEndDate === appliedRecord.weekEndDate)
        );
        const next = exists
          ? prev.map((a) =>
              a.id === appliedRecord.id ||
              (a.weekStartDate === appliedRecord.weekStartDate &&
                a.weekEndDate === appliedRecord.weekEndDate)
                ? appliedRecord
                : a
            )
          : [appliedRecord, ...prev];
        persistWeeklyAssessmentsLocal(actorId, next);
        return next;
      });

      setTargetHistory((prev) => {
        const next = [historyEntry, ...prev].slice(0, 50);
        persistTargetHistoryLocal(actorId, next);
        return next;
      });

      if (assessment.recommendedHydrationMl && assessment.recommendedHydrationMl >= 1500) {
        setDailyWaterGoalMl(assessment.recommendedHydrationMl);
      }

      if (authUserRef.current) {
        void upsertProfileAndSettings(actorId, nextProfile, cur.settings).then(handleDbResult);
        void upsertNutritionGoals(actorId, nextGoals).then(handleDbResult);
        void upsertWeightGoal(actorId, nextWeightGoal);
        void upsertWeeklyAssessmentDb(actorId, appliedRecord);
        void insertTargetHistoryDb(actorId, historyEntry);
      }

      setWeeklyAssessmentModal((prev) => ({
        ...prev,
        assessment: appliedRecord,
      }));

      notify(
        `Cycle ${assessment.assessmentWeekNumber} targets applied (${assessment.previousRecommendedCalories.toLocaleString()} → ${assessment.recommendedCalories.toLocaleString()} kcal)`
      );
      return true;
    },
    [
      getActiveActorId,
      handleDbResult,
      notify,
      persistTargetHistoryLocal,
      persistWeeklyAssessmentsLocal,
      setDailyWaterGoalMl,
    ]
  );

  const dismissWeeklyAssessment = useCallback(
    async (assessment: WeeklyAssessmentRecord): Promise<void> => {
      const actorId = getActiveActorId();
      if (!actorId) return;
      const dismissedRecord: WeeklyAssessmentRecord = {
        ...assessment,
        status: 'dismissed',
      };

      setWeeklyAssessments((prev) => {
        const exists = prev.some(
          (a) =>
            a.id === dismissedRecord.id ||
            (a.weekStartDate === dismissedRecord.weekStartDate &&
              a.weekEndDate === dismissedRecord.weekEndDate)
        );
        const next = exists
          ? prev.map((a) =>
              a.id === dismissedRecord.id ||
              (a.weekStartDate === dismissedRecord.weekStartDate &&
                a.weekEndDate === dismissedRecord.weekEndDate)
                ? dismissedRecord
                : a
            )
          : [dismissedRecord, ...prev];
        persistWeeklyAssessmentsLocal(actorId, next);
        return next;
      });

      if (authUserRef.current) {
        void updateWeeklyAssessmentStatusDb(actorId, dismissedRecord.id, 'dismissed');
        void upsertWeeklyAssessmentDb(actorId, dismissedRecord);
      }

      setWeeklyAssessmentModal((prev) => ({ ...prev, isOpen: false }));
      notify('Current targets kept for this 14-day review cycle', 'info');
    },
    [getActiveActorId, notify, persistWeeklyAssessmentsLocal]
  );

  const toastContextValue = useMemo<ToastContextValue>(
    () => ({ toasts, dismissToast }),
    [toasts, dismissToast]
  );

  const value = useMemo<MacroLogContextValue>(
    () => ({
      state,
      authMode,
      authUser,
      isAdmin,
      authDetails,
      needsSchemaSetup,
      syncingDb,
      isOnline,
      pendingSyncCount,
      syncPendingNow,
      showCoachMode: showCoachModeState || coachPlans.length > 0 || pendingInvitations.length > 0,
      setShowCoachMode,
      showQuestsOnHome: showQuestsOnHomeState,
      setShowQuestsOnHome,
      deleteAccount,
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
      toasts: EMPTY_TOASTS,
      dismissToast,
      notify,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      signOut,
      enterGuestMode,
      exitGuestModeToAuth,
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
      quickUpdateFoodEntryQuantity,
      deleteFoodEntry,
      duplicateFoodEntry,
      savedMeals,
      saveMealCombo,
      deleteSavedMealCombo,
      logSavedMealCombo,
      addCustomFood,
      saveExternalFoodToMyFoods,
      updateCustomFood,
      deleteCustomFood,
      toggleFavoriteFood,
      applyAdminFoodOverride,
      updateGoals,
      targetHistory,
      toggleAdaptivePaused,
      clearManualOverride,
      addWeightEntry,
      updateWeightEntry,
      deleteWeightEntry,
      updateWeightGoal,
      updateProfile,
      updateSettings,
      exportData,
      needsTrainerOnboarding,
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
      activeBurnKcalByDate,
      setActiveBurnKcal,
      addActiveBurnKcal,
      copyMealFromPreviousDay,
      weeklyAssessments,
      assessmentDueStatus,
      weeklyAssessmentModal,
      openWeeklyAssessmentModal,
      closeWeeklyAssessmentModal,
      runWeeklyAssessment,
      applyWeeklyAssessment,
      dismissWeeklyAssessment,
    }),
    [
      state,
      authMode,
      authUser,
      isAdmin,
      authDetails,
      needsSchemaSetup,
      syncingDb,
      isOnline,
      pendingSyncCount,
      syncPendingNow,
      showCoachModeState,
      setShowCoachMode,
      showQuestsOnHomeState,
      setShowQuestsOnHome,
      deleteAccount,
      resolvedTheme,
      toggleTheme,
      activeTab,
      setActiveTab,
      selectedDate,
      allFoods,
      selectedDateEntries,
      selectedDateTotals,
      latestWeightEntry,
      previousWeightEntry,
      dismissToast,
      notify,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      signOut,
      enterGuestMode,
      exitGuestModeToAuth,
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
      quickUpdateFoodEntryQuantity,
      deleteFoodEntry,
      duplicateFoodEntry,
      savedMeals,
      saveMealCombo,
      deleteSavedMealCombo,
      logSavedMealCombo,
      addCustomFood,
      saveExternalFoodToMyFoods,
      updateCustomFood,
      deleteCustomFood,
      toggleFavoriteFood,
      applyAdminFoodOverride,
      updateGoals,
      targetHistory,
      toggleAdaptivePaused,
      clearManualOverride,
      addWeightEntry,
      updateWeightEntry,
      deleteWeightEntry,
      updateWeightGoal,
      updateProfile,
      updateSettings,
      exportData,
      needsTrainerOnboarding,
      selectAccountRole,
      trainerTab,
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
      activeBurnKcalByDate,
      setActiveBurnKcal,
      addActiveBurnKcal,
      copyMealFromPreviousDay,
      weeklyAssessments,
      assessmentDueStatus,
      weeklyAssessmentModal,
      openWeeklyAssessmentModal,
      closeWeeklyAssessmentModal,
      runWeeklyAssessment,
      applyWeeklyAssessment,
      dismissWeeklyAssessment,
    ]
  );

  return (
    <MacroLogContext.Provider value={value}>
      <ToastContext.Provider value={toastContextValue}>{children}</ToastContext.Provider>
    </MacroLogContext.Provider>
  );
};

export function useToasts(): ToastContextValue {
  return useContext(ToastContext);
}

export function useMacroLogStore(): MacroLogContextValue {
  const ctx = useContext(MacroLogContext);
  if (!ctx) {
    throw new Error('useMacroLogStore must be used inside MacroLogProvider');
  }
  return ctx;
}
