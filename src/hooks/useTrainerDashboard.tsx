import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  fetchClientCheckinsForTrainer,
  fetchTrainerClientsAndSnapshots,
  fetchTrainerInvitations,
  fetchTrainerProfile,
} from '../services/trainerService';
import {
  ClientInvitation,
  NutritionGoals,
  TrainerClientSnapshot,
  TrainerProfile,
  UserProfile,
  WeeklyAssessmentDueStatus,
  WeeklyClientCheckin,
  WeightGoal,
} from '../types';
import { addDaysToDateKey, getTodayDateKey } from '../utils/dateUtils';
import { evaluateWeeklyAssessmentDueStatus } from '../utils/weeklyAssessmentEngine';
import { useMacroLogStore } from './useMacroLogStore';

interface TrainerDashboardContextValue {
  loading: boolean;
  error: string;
  trainerProfile: TrainerProfile | null;
  clients: TrainerClientSnapshot[];
  invitations: ClientInvitation[];
  checkins: WeeklyClientCheckin[];
  refreshAll: () => Promise<void>;
  inviteModalOpen: boolean;
  setInviteModalOpen: (open: boolean) => void;
}

const TrainerDashboardContext = createContext<TrainerDashboardContextValue | null>(null);

export const TrainerDashboardProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { authUser, authDetails } = useMacroLogStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [trainerProfile, setTrainerProfile] = useState<TrainerProfile | null>(null);
  const [clients, setClients] = useState<TrainerClientSnapshot[]>([]);
  const [invitations, setInvitations] = useState<ClientInvitation[]>([]);
  const [checkins, setCheckins] = useState<WeeklyClientCheckin[]>([]);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);

  const refreshAll = useCallback(async () => {
    if (!authUser) return;
    setLoading(true);
    setError('');
    try {
      const [tpRes, clientsRes, invRes, checkinsRes] = await Promise.all([
        fetchTrainerProfile(authUser.id),
        fetchTrainerClientsAndSnapshots(authUser.id),
        fetchTrainerInvitations(authUser.id),
        fetchClientCheckinsForTrainer(authUser.id),
      ]);

      if (!tpRes.ok && tpRes.error) {
        setError(tpRes.error);
      }
      if (tpRes.data) {
        setTrainerProfile(tpRes.data);
      } else {
        setTrainerProfile({
          userId: authUser.id,
          displayName: authDetails?.name || 'Fitness Coach',
          bio: '',
          specialties: ['Nutrition Coaching'],
          certifications: [],
          acceptingClients: true,
          createdAt: new Date().toISOString(),
        });
      }

      if (clientsRes.ok && clientsRes.data) setClients(clientsRes.data);
      if (invRes.ok && invRes.data) setInvitations(invRes.data);
      if (checkinsRes.ok && checkinsRes.data) setCheckins(checkinsRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trainer workspace');
    } finally {
      setLoading(false);
    }
  }, [authDetails?.name, authUser]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const value = useMemo<TrainerDashboardContextValue>(
    () => ({
      loading,
      error,
      trainerProfile,
      clients,
      invitations,
      checkins,
      refreshAll,
      inviteModalOpen,
      setInviteModalOpen,
    }),
    [checkins, clients, error, inviteModalOpen, invitations, loading, refreshAll, trainerProfile]
  );

  return (
    <TrainerDashboardContext.Provider value={value}>
      {children}
    </TrainerDashboardContext.Provider>
  );
};

export function useTrainerDashboard(): TrainerDashboardContextValue {
  const ctx = useContext(TrainerDashboardContext);
  if (!ctx) {
    throw new Error('useTrainerDashboard must be used inside TrainerDashboardProvider');
  }
  return ctx;
}

export function computeTodayStatsForClient(snapshot: TrainerClientSnapshot) {
  const today = getTodayDateKey();
  const todayEntries = snapshot.foodEntries.filter((e) => e.date === today);
  const calories = Math.round(todayEntries.reduce((acc, e) => acc + e.calories, 0));
  const protein = Math.round(todayEntries.reduce((acc, e) => acc + e.protein, 0));
  const carbs = Math.round(todayEntries.reduce((acc, e) => acc + e.carbs, 0));
  const fat = Math.round(todayEntries.reduce((acc, e) => acc + e.fat, 0));
  const fibre = Math.round(todayEntries.reduce((acc, e) => acc + e.fibre, 0));

  const targetCal = snapshot.goals?.calories || 0;
  const targetProtein = snapshot.goals?.protein || 0;

  const loggedToday = todayEntries.length > 0;
  const meetingCalories =
    loggedToday &&
    targetCal > 0 &&
    calories >= targetCal * 0.85 &&
    calories <= targetCal * 1.15;
  const meetingProtein =
    loggedToday && targetProtein > 0 && protein >= targetProtein * 0.9;

  return {
    todayEntries,
    calories,
    protein,
    carbs,
    fat,
    fibre,
    loggedToday,
    meetingCalories,
    meetingProtein,
  };
}

export function buildClientDashboardContext(snapshot: TrainerClientSnapshot): {
  profile: UserProfile;
  goals: NutritionGoals;
  weightGoal: WeightGoal;
  dueStatus: WeeklyAssessmentDueStatus;
} {
  const today = getTodayDateKey();
  const p = snapshot.profile;
  const g = snapshot.goals;
  const latestWeight = snapshot.weightEntries[0]?.weightKg ?? p?.currentWeightKg ?? 0;

  const profile: UserProfile = {
    id: snapshot.relationship.clientId,
    name: p?.name || 'Client',
    email: p?.email,
    avatarUrl: p?.avatarUrl,
    age: p?.age || 0,
    biologicalSex: p?.biologicalSex || 'male',
    heightCm: p?.heightCm || 0,
    currentWeightKg: latestWeight || p?.currentWeightKg || 0,
    targetWeightKg: p?.targetWeightKg ?? g?.targetWeightKg ?? 0,
    dailyAverageSteps: p?.dailyAverageSteps ?? 7000,
    activityLevel: p?.activityLevel || 'moderate',
    workoutFrequencyPerWeek: p?.workoutFrequencyPerWeek ?? 3,
    workoutIntensity: p?.workoutIntensity || 'moderate',
    fitnessGoal: p?.fitnessGoal || 'maintenance',
    goalSpeed: p?.goalSpeed || g?.goalSpeed || 'moderate',
    macroFocus: p?.macroFocus || g?.macroFocus || 'balanced',
    adaptiveTdeeKcal: p?.adaptiveTdeeKcal ?? g?.adaptiveTdeeKcal ?? null,
    lastWeeklyAssessmentAt: p?.lastWeeklyAssessmentAt ?? null,
    bodyFatPct: p?.bodyFatPct ?? null,
    adaptivePaused: Boolean(p?.adaptivePaused),
    manualOverrideActive: Boolean(p?.manualOverrideActive || g?.manualOverrideActive),
    cycleAnchorDate: p?.cycleAnchorDate ?? null,
    onboardingCompleted: true,
    isPregnantOrBreastfeeding: Boolean(p?.isPregnantOrBreastfeeding),
    dietaryPreference: p?.dietaryPreference || 'omnivore',
    foodRestrictions: p?.foodRestrictions || [],
    accountRole: 'individual',
    roleSelected: true,
    isDemoProfile: false,
  };

  const goals: NutritionGoals = g ?? {
    userId: snapshot.relationship.clientId,
    preset: 'custom',
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fibre: 0,
    targetWeightKg: p?.targetWeightKg || undefined,
    updatedAt: today,
  };

  const weightGoal: WeightGoal = snapshot.weightGoal ?? {
    userId: snapshot.relationship.clientId,
    startingWeightKg:
      snapshot.weightEntries[snapshot.weightEntries.length - 1]?.weightKg ??
      p?.currentWeightKg ??
      0,
    targetWeightKg: g?.targetWeightKg ?? p?.targetWeightKg ?? 0,
    goalDirection:
      profile.fitnessGoal === 'fat_loss'
        ? 'loss'
        : profile.fitnessGoal === 'muscle_gain'
        ? 'gain'
        : 'maintain',
    updatedAt: today,
  };

  const dueStatus = evaluateWeeklyAssessmentDueStatus({
    profile,
    goals,
    weightEntries: snapshot.weightEntries,
    foodEntries: snapshot.foodEntries,
    weeklyAssessments: snapshot.weeklyAssessments || [],
    todayDateKey: today,
  });

  return { profile, goals, weightGoal, dueStatus };
}

export function computeClientCoachingSummary(snapshot: TrainerClientSnapshot) {
  const today = getTodayDateKey();
  const yesterday = addDaysToDateKey(today, -1);
  const canNutrition = snapshot.relationship.canViewNutrition;
  const entries = canNutrition ? snapshot.foodEntries : [];

  const loggedDates = new Set(entries.map((e) => e.date));
  let streakDays = 0;
  let cursor = loggedDates.has(today) ? today : loggedDates.has(yesterday) ? yesterday : '';
  while (cursor && loggedDates.has(cursor) && streakDays < 180) {
    streakDays += 1;
    cursor = addDaysToDateKey(cursor, -1);
  }

  // Last 14 days nutrition adherence & averages
  const start14 = addDaysToDateKey(today, -13);
  const dayTotals14 = new Map<string, { cal: number; pro: number }>();
  for (const e of entries) {
    if (e.date < start14 || e.date > today) continue;
    const cur = dayTotals14.get(e.date) || { cal: 0, pro: 0 };
    cur.cal += e.calories;
    cur.pro += e.protein;
    dayTotals14.set(e.date, cur);
  }

  const calGoal = snapshot.goals?.calories || 0;
  const loggedDays14 = dayTotals14.size;
  const onTargetDays14 = Array.from(dayTotals14.values()).filter((d) =>
    calGoal > 0 ? d.cal >= calGoal * 0.85 && d.cal <= calGoal * 1.15 : d.cal > 0
  ).length;
  const adherence14Pct = loggedDays14 > 0 ? Math.round((onTargetDays14 / loggedDays14) * 100) : 0;

  const avgCal14 =
    loggedDays14 > 0
      ? Math.round(Array.from(dayTotals14.values()).reduce((s, d) => s + d.cal, 0) / loggedDays14)
      : 0;
  const avgPro14 =
    loggedDays14 > 0
      ? Math.round(Array.from(dayTotals14.values()).reduce((s, d) => s + d.pro, 0) / loggedDays14)
      : 0;
  const proteinPer1000Kcal = avgCal14 > 0 ? Math.round((avgPro14 / avgCal14) * 1000) : 0;

  const { dueStatus } = buildClientDashboardContext(snapshot);

  const weightsDesc = snapshot.relationship.canViewWeight ? snapshot.weightEntries : [];
  const latestWeightKg = weightsDesc[0]?.weightKg ?? snapshot.profile?.currentWeightKg ?? null;
  const weight14Entry = weightsDesc.find((w) => w.date <= start14) || weightsDesc[weightsDesc.length - 1];
  const weightDelta14Kg =
    latestWeightKg !== null && weight14Entry && weightsDesc.length >= 2
      ? Math.round((latestWeightKg - weight14Entry.weightKg) * 10) / 10
      : null;

  return {
    streakDays,
    loggedDays14,
    adherence14Pct,
    avgCal14,
    avgPro14,
    proteinPer1000Kcal,
    dueStatus,
    latestWeightKg,
    weightDelta14Kg,
  };
}
