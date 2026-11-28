import React, { useMemo } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  Flame,
  RefreshCw,
  Target,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useMacroLogStore } from '../../hooks/useMacroLogStore';
import {
  computeClientCoachingSummary,
  computeTodayStatsForClient,
  useTrainerDashboard,
} from '../../hooks/useTrainerDashboard';
import { addDaysToDateKey, getTodayDateKey } from '../../utils/dateUtils';

export const TrainerOverviewPage: React.FC = () => {
  const { openTrainerClientDetail, setTrainerTab } = useMacroLogStore();
  const {
    loading,
    error,
    trainerProfile,
    clients,
    invitations,
    checkins,
    refreshAll,
    setInviteModalOpen,
  } = useTrainerDashboard();

  const today = getTodayDateKey();
  const sevenDaysAgo = addDaysToDateKey(today, -6);
  const thirtyDaysAgoIso = new Date(Date.now() - 30 * 86400000).toISOString();

  const activeClients = useMemo(
    () => clients.filter((c) => c.relationship.status === 'active' && !c.relationship.isArchived),
    [clients]
  );

  const pendingInvitesCount = useMemo(
    () => invitations.filter((inv) => inv.status === 'pending').length,
    [invitations]
  );

  const newClientsLast30d = useMemo(
    () =>
      activeClients.filter(
        (c) => (c.relationship.authorizedAt || c.relationship.createdAt) >= thirtyDaysAgoIso
      ).length,
    [activeClients, thirtyDaysAgoIso]
  );

  const clientStatuses = useMemo(
    () =>
      activeClients.map((snap) => ({
        snap,
        todayStats: computeTodayStatsForClient(snap),
        progress: computeClientCoachingSummary(snap),
      })),
    [activeClients]
  );

  const archivedCount = useMemo(
    () => clients.filter((c) => c.relationship.status === 'active' && c.relationship.isArchived).length,
    [clients]
  );

  const meetingCaloriesCount = clientStatuses.filter((c) => c.todayStats.meetingCalories).length;
  const meetingProteinCount = clientStatuses.filter((c) => c.todayStats.meetingProtein).length;
  const notLoggedToday = clientStatuses.filter(
    (c) => c.snap.relationship.canViewNutrition && !c.todayStats.loggedToday
  );
  const assessmentDueClients = clientStatuses.filter(
    (c) => c.snap.relationship.canViewNutrition && c.progress.dueStatus.isDue
  );

  const cohortChartData = useMemo(() => {
    return activeClients
      .filter((c) => c.relationship.canViewNutrition)
      .slice(0, 8)
      .map((snap) => {
        const last7 = snap.foodEntries.filter(
          (e) => e.date >= sevenDaysAgo && e.date <= today
        );
        const daysLogged = new Set(last7.map((e) => e.date)).size;
        const adherencePct = Math.round((daysLogged / 7) * 100);
        const avgCalories =
          daysLogged > 0
            ? Math.round(last7.reduce((sum, e) => sum + e.calories, 0) / daysLogged)
            : 0;
        return {
          name: snap.profile?.name?.split(' ')[0] || 'Client',
          adherencePct,
          avgCalories,
        };
      });
  }, [activeClients, sevenDaysAgo, today]);

  const unreviewedCheckins = checkins.filter((c) => c.status === 'submitted');

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Welcome back, {trainerProfile?.displayName || 'Coach'} · Client Coaching Hub
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Trainer Overview
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshAll()}
            disabled={loading}
            className="min-h-[42px] px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => {
              setTrainerTab('clients');
              setInviteModalOpen(true);
            }}
            className="min-h-[42px] px-4 rounded-xl bg-lime-500 hover:bg-lime-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5"
          >
            <UserPlus className="w-4 h-4" />
            Invite Client
          </button>
        </div>
      </section>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Top KPI Grid */}
      <section className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            Active Clients
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono-nums text-slate-900 dark:text-slate-50">
            {activeClients.length}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono-nums">
            {archivedCount > 0 ? `${archivedCount} archived` : 'Authorized roster'}
          </div>
        </div>

        <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">New Clients (30d)</div>
          <div className="mt-1.5 text-2xl font-bold font-mono-nums text-slate-900 dark:text-slate-50">
            {newClientsLast30d}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Authorized</div>
        </div>

        <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Pending Invites
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono-nums text-slate-900 dark:text-slate-50">
            {pendingInvitesCount}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Awaiting reply</div>
        </div>

        <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-lime-600 dark:text-lime-400" />
            On Calorie Goal
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono-nums text-lime-700 dark:text-lime-400">
            {meetingCaloriesCount}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Today (±15%)</div>
        </div>

        <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-sky-500" />
            On Protein Goal
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono-nums text-sky-600 dark:text-sky-400">
            {meetingProteinCount}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Today (≥90%)</div>
        </div>

        <div className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
            Not Logged Today
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono-nums text-amber-600 dark:text-amber-400">
            {notLoggedToday.length}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Need check-in</div>
        </div>
      </section>

      {/* Empty Zero-State */}
      {!loading && activeClients.length === 0 && (
        <section className="bg-white dark:bg-[#111317] border border-dashed border-stone-300 dark:border-white/15 rounded-2xl p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-lime-100 dark:bg-lime-950 text-lime-700 dark:text-lime-400 flex items-center justify-center mx-auto">
            <Users className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            No Active Clients Connected Yet
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
            Invite clients via email or generate a secure invite link. Once a client accepts and grants read permissions, their live calorie, macro, and weight telemetry appears here.
          </p>
          <button
            type="button"
            onClick={() => {
              setTrainerTab('clients');
              setInviteModalOpen(true);
            }}
            className="min-h-[44px] px-5 rounded-xl bg-lime-500 hover:bg-lime-400 text-slate-950 text-xs font-bold inline-flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            Invite Your First Client
          </button>
        </section>
      )}

      {/* Charts + Attention Lists */}
      {activeClients.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* 7-Day Adherence Chart */}
          <section className="lg:col-span-7 bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  7-Day Client Logging Consistency (%)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Only includes clients who enabled nutrition sharing
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTrainerTab('analytics')}
                className="text-xs font-semibold text-lime-700 dark:text-lime-400 hover:underline inline-flex items-center gap-1"
              >
                Full Analytics <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {cohortChartData.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
                No nutrition-sharing clients available for charting yet.
              </div>
            ) : (
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cohortChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9A9CA3' }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#9A9CA3' }} unit="%" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#14161C',
                        border: '1px solid rgba(255,255,255,0.14)',
                        borderRadius: '10px',
                        color: '#F3F4F6',
                        fontSize: '12px',
                      }}
                    />
                    <Bar dataKey="adherencePct" name="7-Day Logging %" fill="#C8FF00" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          {/* Clients Needing Attention & Check-Ins */}
          <section className="lg:col-span-5 bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Daily Follow-Up Queue
            </h2>

            {notLoggedToday.length === 0 &&
            unreviewedCheckins.length === 0 &&
            assessmentDueClients.length === 0 ? (
              <div className="rounded-xl bg-lime-50/70 dark:bg-lime-950/20 border border-lime-200 dark:border-lime-900/50 p-4 text-xs text-lime-800 dark:text-lime-300">
                All authorized clients have logged meals today and no check-ins or 14-day cycles are awaiting review.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {assessmentDueClients.map(({ snap, progress }) => (
                  <button
                    key={`cycle-${snap.relationship.id}`}
                    type="button"
                    onClick={() => openTrainerClientDetail(snap.relationship.clientId)}
                    className="w-full text-left p-3 rounded-xl border border-[#4E6800]/30 dark:border-[#C8FF00]/30 bg-[#C8FF00]/10 hover:opacity-90 flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        <CalendarClock className="w-3.5 h-3.5 text-[#4E6800] dark:text-[#C8FF00]" />
                        <span>14-Day Cycle Ready · {snap.profile?.name || 'Client'}</span>
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                        {progress.dueStatus.foodLoggedDays}/14 food days · {progress.dueStatus.weightLoggedDays} weigh-ins
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00] shrink-0" />
                  </button>
                ))}

                {unreviewedCheckins.map((chk) => {
                  const matched = activeClients.find((c) => c.relationship.clientId === chk.clientId);
                  return (
                    <button
                      key={chk.id}
                      type="button"
                      onClick={() => openTrainerClientDetail(chk.clientId)}
                      className="w-full text-left p-3 rounded-xl border border-lime-300/70 dark:border-lime-800/70 bg-lime-50/50 dark:bg-lime-950/20 hover:opacity-90 flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                          Check-in from {matched?.profile?.name || 'Client'}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Week of {chk.weekStartDate} · Needs coach review
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-lime-600 dark:text-lime-400 shrink-0" />
                    </button>
                  );
                })}

                {notLoggedToday.map(({ snap, progress }) => (
                  <button
                    key={snap.relationship.id}
                    type="button"
                    onClick={() => openTrainerClientDetail(snap.relationship.clientId)}
                    className="w-full text-left p-3 rounded-xl border border-black/10 dark:border-white/12 hover:bg-stone-50 dark:hover:bg-slate-900 flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <span>{snap.profile?.name || 'Client'}</span>
                        {progress.streakDays > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-mono-nums text-amber-600 dark:text-amber-400">
                            <Flame className="w-3 h-3" />
                            {progress.streakDays}d
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-amber-600 dark:text-amber-400">
                        Has not logged food today
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
