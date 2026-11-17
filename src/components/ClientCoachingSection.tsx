import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Send,
  Shield,
  Sparkles,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import {
  fetchClientTrainerConnections,
  respondToTrainerInvitation,
  revokeClientTrainerAccess,
  submitClientCheckin,
  updateClientTrainerPermissions,
} from '../services/trainerService';
import { TrainerClientRelationship } from '../types';
import { addDaysToDateKey, getTodayDateKey } from '../utils/dateUtils';

export const ClientCoachingSection: React.FC = () => {
  const {
    authUser,
    state,
    pendingInvitations,
    pendingRecommendations,
    refreshCoachingAlerts,
    approveTargetRecommendation,
    declineTargetRecommendation,
    notify,
  } = useMacroLogStore();

  const [connections, setConnections] = useState<TrainerClientRelationship[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkinTrainerId, setCheckinTrainerId] = useState('');
  const [checkinNotes, setCheckinNotes] = useState('');
  const [sendingCheckin, setSendingCheckin] = useState(false);

  const loadConnections = useCallback(async () => {
    if (!authUser) return;
    setLoading(true);
    try {
      const res = await fetchClientTrainerConnections(authUser.id);
      if (res.ok && res.data) {
        setConnections(res.data);
        if (res.data.length > 0 && !checkinTrainerId) {
          setCheckinTrainerId(res.data[0].trainerId);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [authUser, checkinTrainerId]);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  const handleInviteDecision = async (invitationId: string, accept: boolean) => {
    const res = await respondToTrainerInvitation({
      invitationId,
      accept,
    });
    if (!res.ok) {
      notify(res.error || 'Could not update invitation', 'error');
      return;
    }
    notify(accept ? 'Trainer connected with read-only permissions' : 'Invitation declined', accept ? 'success' : 'info');
    await Promise.all([refreshCoachingAlerts(), loadConnections()]);
  };

  const handleTogglePermission = async (
    rel: TrainerClientRelationship,
    field:
      | 'canViewProfile'
      | 'canViewNutrition'
      | 'canViewWeight'
      | 'canViewGoals'
      | 'canAddNotes'
      | 'canManageGoals'
  ) => {
    if (!authUser) return;
    const nextVal = !rel[field];
    setConnections((prev) =>
      prev.map((item) => (item.id === rel.id ? { ...item, [field]: nextVal } : item))
    );
    const res = await updateClientTrainerPermissions(authUser.id, rel.id, {
      [field]: nextVal,
    });
    if (!res.ok) {
      notify(res.error || 'Could not update sharing permission', 'error');
      void loadConnections();
    }
  };

  const handleRevoke = async (relId: string) => {
    if (!authUser) return;
    const res = await revokeClientTrainerAccess(authUser.id, relId);
    if (!res.ok) {
      notify(res.error || 'Could not revoke access', 'error');
      return;
    }
    setConnections((prev) => prev.filter((item) => item.id !== relId));
    notify('Trainer access revoked immediately', 'info');
  };

  const handleSubmitCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser || !checkinTrainerId) return;

    const today = getTodayDateKey();
    const weekStart = addDaysToDateKey(today, -6);
    const recentEntries = state.foodEntries.filter((entry) => entry.date >= weekStart && entry.date <= today);
    const uniqueDays = new Set(recentEntries.map((entry) => entry.date)).size || 1;
    const avgCalories =
      recentEntries.reduce((acc, entry) => acc + entry.calories, 0) / uniqueDays;
    const avgProtein =
      recentEntries.reduce((acc, entry) => acc + entry.protein, 0) / uniqueDays;
    const recentWeights = state.weightEntries.filter((w) => w.date >= weekStart && w.date <= today);
    const avgWeightKg =
      recentWeights.length > 0
        ? Math.round(
            (recentWeights.reduce((acc, w) => acc + w.weightKg, 0) / recentWeights.length) * 100
          ) / 100
        : state.profile.currentWeightKg || undefined;

    setSendingCheckin(true);
    try {
      const res = await submitClientCheckin({
        clientId: authUser.id,
        trainerId: checkinTrainerId,
        weekStartDate: weekStart,
        avgCalories,
        avgProtein,
        avgWeightKg,
        clientNotes: checkinNotes,
      });
      if (!res.ok) {
        notify(res.error || 'Could not submit weekly check-in', 'error');
        return;
      }
      setCheckinNotes('');
      notify('Weekly check-in sent to your coach');
    } finally {
      setSendingCheckin(false);
    }
  };

  return (
    <section className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Shield className="w-4 h-4 text-lime-600 dark:text-lime-400" />
            Coaching Connections, Privacy & Target Proposals
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Control which trainers can view your progress. Multiple trainers can be managed independently, and access can be revoked anytime.
          </p>
        </div>
      </div>

      {/* Pending Target Recommendations from Trainers */}
      {pendingRecommendations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-lime-700 dark:text-lime-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            Pending Target Recommendations ({pendingRecommendations.length})
          </h3>
          {pendingRecommendations.map((rec) => (
            <div
              key={rec.id}
              className="rounded-xl border border-lime-500/60 bg-lime-50/60 dark:bg-lime-950/20 p-4 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Suggested Update from {rec.trainerName || 'Your Trainer'}
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Requires your approval
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-mono-nums">
                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-stone-200/70 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Calories</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {rec.recommendedCalories} kcal
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-stone-200/70 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Protein</span>
                  <span className="font-bold text-sky-600 dark:text-sky-400">
                    {rec.recommendedProtein}g
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-stone-200/70 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Carbs</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">
                    {rec.recommendedCarbs}g
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-stone-200/70 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Fat</span>
                  <span className="font-bold text-rose-600 dark:text-rose-400">
                    {rec.recommendedFat}g
                  </span>
                </div>
                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-stone-200/70 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 block">Fibre</span>
                  <span className="font-bold text-lime-700 dark:text-lime-400">
                    {rec.recommendedFibre}g
                  </span>
                </div>
              </div>

              {rec.rationale && (
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Coach note: {rec.rationale}
                </p>
              )}

              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void declineTargetRecommendation(rec.id)}
                  className="min-h-[38px] px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1.5"
                >
                  <X className="w-3.5 h-3.5" />
                  Decline
                </button>
                <button
                  type="button"
                  onClick={() => void approveTargetRecommendation(rec)}
                  className="min-h-[38px] px-4 rounded-xl bg-lime-500 hover:bg-lime-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  Approve & Apply Targets
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pending Trainer Invitations */}
      {pendingInvitations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Incoming Trainer Invitations ({pendingInvitations.length})
          </h3>
          {pendingInvitations.map((inv) => (
            <div
              key={inv.id}
              className="rounded-xl border border-stone-200 dark:border-slate-800 bg-stone-50/70 dark:bg-slate-900/60 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {inv.trainerName || 'Fitness Coach'}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {inv.message || 'Invited you to connect for nutrition & progress coaching.'}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleInviteDecision(inv.id, false)}
                  className="min-h-[38px] px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300"
                >
                  Decline
                </button>
                <button
                  type="button"
                  onClick={() => void handleInviteDecision(inv.id, true)}
                  className="min-h-[38px] px-4 rounded-xl bg-lime-500 hover:bg-lime-400 text-slate-950 text-xs font-bold"
                >
                  Accept Invitation
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Active Connected Trainers */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Authorized Trainers ({connections.length})
        </h3>

        {loading && connections.length === 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400">Loading connections...</p>
        )}

        {!loading && connections.length === 0 && (
          <div className="rounded-xl border border-dashed border-stone-200 dark:border-slate-800 p-4 text-xs text-slate-500 dark:text-slate-400">
            No trainers are connected to your account. Your food logs, weight history, and goals remain 100% private.
          </div>
        )}

        {connections.map((rel) => (
          <div
            key={rel.id}
            className="rounded-xl border border-stone-200/80 dark:border-slate-800 p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <UserCheck className="w-4 h-4 text-lime-600 dark:text-lime-400" />
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {rel.trainerProfile?.displayName || 'Fitness Coach'}
                  </div>
                  {rel.trainerProfile?.bio && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {rel.trainerProfile.bio}
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleRevoke(rel.id)}
                className="min-h-[36px] px-3 rounded-xl border border-red-200 dark:border-red-900/60 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 inline-flex items-center gap-1.5"
              >
                <UserX className="w-3.5 h-3.5" />
                Revoke Access
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {(
                [
                  { key: 'canViewProfile', label: 'Profile Details' },
                  { key: 'canViewNutrition', label: 'Food & Macro Logs' },
                  { key: 'canViewWeight', label: 'Weight History' },
                  { key: 'canViewGoals', label: 'Calorie & Macro Goals' },
                  { key: 'canAddNotes', label: 'Coach Notes' },
                  { key: 'canManageGoals', label: 'Edit Goals & Plan' },
                ] as const
              ).map((perm) => (
                <label
                  key={perm.key}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-stone-50 dark:bg-slate-900 border border-stone-200/70 dark:border-slate-800 cursor-pointer"
                >
                  <span className="text-xs text-slate-700 dark:text-slate-300">{perm.label}</span>
                  <input
                    type="checkbox"
                    checked={rel[perm.key]}
                    onChange={() => void handleTogglePermission(rel, perm.key)}
                    className="w-4 h-4 accent-lime-500"
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Submit Weekly Check-In to Connected Coach */}
      {connections.length > 0 && (
        <form
          onSubmit={handleSubmitCheckin}
          className="rounded-xl border border-stone-200/80 dark:border-slate-800 bg-stone-50/60 dark:bg-slate-900/50 p-4 space-y-3"
        >
          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            Send Weekly Check-In to Coach
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select
              value={checkinTrainerId}
              onChange={(e) => setCheckinTrainerId(e.target.value)}
              className="h-10 px-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
            >
              {connections.map((rel) => (
                <option key={rel.id} value={rel.trainerId}>
                  {rel.trainerProfile?.displayName || 'Coach'}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={checkinNotes}
              onChange={(e) => setCheckinNotes(e.target.value)}
              placeholder="How did energy, hunger & workouts feel this week?"
              className="sm:col-span-2 h-10 px-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={sendingCheckin}
              className="min-h-[38px] px-4 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              <Send className="w-3.5 h-3.5" />
              {sendingCheckin ? 'Sending...' : 'Submit Weekly Check-In'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
};
