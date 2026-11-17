import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  fetchClientCheckinsForTrainer,
  fetchTrainerClientsAndSnapshots,
  fetchTrainerInvitations,
  fetchTrainerProfile,
} from '../services/trainerService';
import {
  ClientInvitation,
  TrainerClientSnapshot,
  TrainerProfile,
  WeeklyClientCheckin,
} from '../types';
import { getTodayDateKey } from '../utils/dateUtils';
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
          subscriptionTier: 'free',
          maxClients: 5,
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
