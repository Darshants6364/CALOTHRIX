import React, { useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  CalendarClock,
  Check,
  Copy,
  Flame,
  Link2,
  Mail,
  Search,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { useMacroLogStore } from '../../hooks/useMacroLogStore';
import {
  computeClientCoachingSummary,
  computeTodayStatsForClient,
  useTrainerDashboard,
} from '../../hooks/useTrainerDashboard';
import {
  createClientInvitation,
  deleteTrainerInvitation,
  manageTrainerClientConnection,
} from '../../services/trainerService';

export const TrainerClientsPage: React.FC = () => {
  const { authUser, openTrainerClientDetail, notify } = useMacroLogStore();
  const {
    trainerProfile,
    clients,
    invitations,
    refreshAll,
    inviteModalOpen,
    setInviteModalOpen,
  } = useTrainerDashboard();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'active' | 'pending' | 'archived'>('active');

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviting, setInviting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const activeClients = useMemo(
    () => clients.filter((c) => c.relationship.status === 'active' && !c.relationship.isArchived),
    [clients]
  );
  const archivedClients = useMemo(
    () => clients.filter((c) => c.relationship.isArchived && c.relationship.status === 'active'),
    [clients]
  );
  const pendingInvites = useMemo(
    () => invitations.filter((i) => i.status === 'pending'),
    [invitations]
  );

  const filteredActive = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = filterTab === 'archived' ? archivedClients : activeClients;
    if (!q) return list;
    return list.filter(
      (c) =>
        (c.profile?.name || '').toLowerCase().includes(q) ||
        (c.profile?.email || '').toLowerCase().includes(q)
    );
  }, [activeClients, archivedClients, filterTab, searchQuery]);

  const handleSendInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser) return;
    setInviting(true);
    try {
      const res = await createClientInvitation({
        trainerId: authUser.id,
        clientEmail: inviteEmail,
        clientName: inviteName,
        message: inviteMessage,
      });
      if (!res.ok || !res.data) {
        notify(res.error || 'Could not create invitation', 'error');
        return;
      }
      setInviteEmail('');
      setInviteName('');
      setInviteMessage('');
      setInviteModalOpen(false);
      setFilterTab('pending');
      await refreshAll();
      notify('Client invitation & shareable invite link created');
    } finally {
      setInviting(false);
    }
  };

  const copyInviteLink = async (token: string, id: string) => {
    const url = `${window.location.origin}/invite/${token}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(id);
    notify('Invite link copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClientAction = async (
    relationshipId: string,
    action: 'archive' | 'restore' | 'remove'
  ) => {
    const res = await manageTrainerClientConnection(relationshipId, action);
    if (!res.ok) {
      notify(res.error || 'Action failed', 'error');
      return;
    }
    notify(
      action === 'archive'
        ? 'Client archived'
        : action === 'restore'
        ? 'Client restored'
        : 'Client connection removed',
      'info'
    );
    await refreshAll();
  };

  const handleCancelInvite = async (invitationId: string) => {
    if (!authUser) return;
    const res = await deleteTrainerInvitation(authUser.id, invitationId);
    if (!res.ok) {
      notify(res.error || 'Could not remove invitation', 'error');
      return;
    }
    notify('Invitation removed', 'info');
    await refreshAll();
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Manage authorized clients, email invitations, and shareable invite links ({activeClients.length} active)
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Clients & Invitations
          </h1>
        </div>

        <button
          type="button"
          onClick={() => setInviteModalOpen(true)}
          className="min-h-[44px] px-5 rounded-xl bg-lime-500 hover:bg-lime-400 text-slate-950 text-xs font-bold inline-flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          Invite New Client
        </button>
      </section>

      {/* Invite Composer Panel */}
      {inviteModalOpen && (
        <form
          onSubmit={handleSendInvitation}
          className="bg-white dark:bg-[#111317] border border-lime-500/60 rounded-2xl p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Invite Client via Shareable Link & In-App Alert
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Creates a unique invite link you can share directly and shows an in-app invite when that email signs in (no automatic inbox email is sent).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setInviteModalOpen(false)}
              className="min-h-[36px] min-w-[36px] rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Client Email (optional if sharing link directly)
              </label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="client@example.com"
                className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Client Label / Name (optional)
              </label>
              <input
                type="text"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Rohan Sharma"
                className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Welcome Note (shown to client before accepting)
            </label>
            <input
              type="text"
              value={inviteMessage}
              onChange={(e) => setInviteMessage(e.target.value)}
              placeholder="Accept to share your daily macros and weight trends so we can dial in your targets."
              className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setInviteModalOpen(false)}
              className="min-h-[42px] px-4 rounded-xl border border-black/10 dark:border-white/15 text-xs font-semibold text-slate-600 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={inviting}
              className="min-h-[42px] px-5 rounded-xl bg-lime-500 hover:bg-lime-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              <Link2 className="w-4 h-4" />
              {inviting ? 'Creating...' : 'Create Invitation & Link'}
            </button>
          </div>
        </form>
      )}

      {/* Filter & Search Bar */}
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="inline-flex p-1 rounded-xl bg-stone-200/70 dark:bg-[#090A0C] w-fit">
          {(
            [
              { id: 'active', label: `Active (${activeClients.length})` },
              { id: 'pending', label: `Pending Invites (${pendingInvites.length})` },
              { id: 'archived', label: `Archived (${archivedClients.length})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterTab(tab.id)}
              className={`min-h-[36px] px-3.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                filterTab === tab.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {filterTab !== 'pending' && (
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search client name or email..."
              className="w-full h-10 pl-9 pr-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-white dark:bg-[#111317] text-xs text-slate-900 dark:text-slate-100"
            />
          </div>
        )}
      </section>

      {/* Pending Invites List */}
      {filterTab === 'pending' && (
        <section className="space-y-3">
          {pendingInvites.length === 0 ? (
            <div className="bg-white dark:bg-[#111317] border border-dashed border-stone-300 dark:border-white/15 rounded-2xl p-8 text-center text-xs text-slate-500 dark:text-slate-400">
              No pending invitations. Click “Invite New Client” above to generate a shareable invite link or in-app invite.
            </div>
          ) : (
            pendingInvites.map((inv) => (
              <div
                key={inv.id}
                className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-lime-600 dark:text-lime-400" />
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {inv.clientName || inv.clientEmail || 'Shareable Invite Link'}
                    </span>
                  </div>
                  {inv.clientEmail && (
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Email: {inv.clientEmail}
                    </div>
                  )}
                  <div className="text-[11px] font-mono-nums text-slate-400 break-all">
                    {`${window.location.origin}/invite/${inv.inviteToken}`}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {inv.clientEmail && (
                    <a
                      href={`mailto:${encodeURIComponent(inv.clientEmail)}?subject=${encodeURIComponent(
                        `${trainerProfile?.displayName || 'Your Coach'} invited you to CALOTHRIX`
                      )}&body=${encodeURIComponent(
                        `Hi${inv.clientName ? ` ${inv.clientName}` : ''},\n\n${
                          inv.message ? `${inv.message}\n\n` : ''
                        }Accept your coaching invitation here:\n${window.location.origin}/invite/${inv.inviteToken}\n`
                      )}`}
                      className="min-h-[38px] px-3.5 rounded-xl border border-lime-500/50 bg-lime-500/10 hover:bg-lime-500/20 text-xs font-semibold text-lime-700 dark:text-lime-300 inline-flex items-center gap-1.5"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      Email Invite
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => void copyInviteLink(inv.inviteToken, inv.id)}
                    className="min-h-[38px] px-3.5 rounded-xl border border-black/10 dark:border-white/15 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5"
                  >
                    {copiedId === inv.id ? (
                      <Check className="w-3.5 h-3.5 text-lime-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copiedId === inv.id ? 'Copied' : 'Copy Link'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCancelInvite(inv.id)}
                    className="min-h-[38px] px-3 rounded-xl border border-red-200 dark:border-red-900/60 text-xs font-semibold text-red-600 dark:text-red-400 inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Cancel
                  </button>
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {/* Active / Archived Client Cards */}
      {filterTab !== 'pending' && (
        <section className="space-y-3">
          {filteredActive.length === 0 ? (
            <div className="bg-white dark:bg-[#111317] border border-dashed border-stone-300 dark:border-white/15 rounded-2xl p-8 text-center text-xs text-slate-500 dark:text-slate-400">
              {filterTab === 'archived'
                ? 'No archived clients.'
                : searchQuery
                ? 'No matching clients found.'
                : 'No active clients connected yet.'}
            </div>
          ) : (
            filteredActive.map((snap) => {
              const stats = computeTodayStatsForClient(snap);
              const summary = computeClientCoachingSummary(snap);
              const clientName = snap.profile?.name || 'Authorized Client';
              const targetCal = snap.goals?.calories || 0;
              return (
                <div
                  key={snap.relationship.id}
                  className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">
                        {clientName}
                      </h2>
                      {snap.profile?.fitnessGoal && (
                        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 capitalize">
                          · {snap.profile.fitnessGoal.replace('_', ' ')}
                        </span>
                      )}
                      {snap.profile?.dietaryPreference && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">
                          · {snap.profile.dietaryPreference}
                        </span>
                      )}
                      {snap.relationship.canViewNutrition && summary.dueStatus.isDue && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#4E6800] dark:text-[#C8FF00]">
                          <CalendarClock className="w-3.5 h-3.5" />
                          14d Review Ready
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {snap.relationship.canViewNutrition ? (
                        <>
                          <span>
                            Today:{' '}
                            <strong className="text-slate-800 dark:text-slate-200 font-mono-nums">
                              {stats.calories.toLocaleString()}
                            </strong>
                            {targetCal > 0 ? ` / ${targetCal.toLocaleString()} kcal` : ' kcal'} · P{' '}
                            {stats.protein}g
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Flame className="w-3.5 h-3.5 text-amber-500" />
                            <strong className="text-slate-800 dark:text-slate-200 font-mono-nums">
                              {summary.streakDays}d
                            </strong>{' '}
                            streak
                          </span>
                          <span>
                            14d On-Target:{' '}
                            <strong className="text-slate-800 dark:text-slate-200 font-mono-nums">
                              {summary.adherence14Pct}%
                            </strong>{' '}
                            ({summary.loggedDays14}/14d)
                          </span>
                          <span>
                            Cycle Day{' '}
                            <strong className="text-slate-800 dark:text-slate-200 font-mono-nums">
                              {Math.min(summary.dueStatus.cycleDays, summary.dueStatus.daysCompleted + 1)}/{summary.dueStatus.cycleDays}
                            </strong>
                          </span>
                        </>
                      ) : (
                        <span>Nutrition sharing paused by client</span>
                      )}

                      {snap.relationship.canViewWeight && summary.latestWeightKg !== null && (
                        <span>
                          Weight:{' '}
                          <strong className="text-slate-800 dark:text-slate-200 font-mono-nums">
                            {summary.latestWeightKg} kg
                          </strong>
                          {summary.weightDelta14Kg !== null && (
                            <span className="ml-1 text-[11px] font-mono-nums">
                              ({summary.weightDelta14Kg > 0 ? '+' : ''}
                              {summary.weightDelta14Kg} kg / 14d)
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {filterTab === 'active' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => openTrainerClientDetail(snap.relationship.clientId)}
                          className="min-h-[40px] px-4 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-xs font-bold inline-flex items-center gap-1.5"
                        >
                          Open Dashboard
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handleClientAction(snap.relationship.id, 'archive')
                          }
                          className="min-h-[40px] px-3 rounded-xl border border-black/10 dark:border-white/15 text-xs font-medium text-slate-600 dark:text-slate-300 inline-flex items-center gap-1.5"
                        >
                          <Archive className="w-3.5 h-3.5" />
                          Archive
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleClientAction(snap.relationship.id, 'restore')}
                        className="min-h-[40px] px-3.5 rounded-xl border border-black/10 dark:border-white/15 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5"
                      >
                        <ArchiveRestore className="w-3.5 h-3.5" />
                        Restore
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => void handleClientAction(snap.relationship.id, 'remove')}
                      className="min-h-[40px] px-3 rounded-xl border border-red-200 dark:border-red-900/60 text-xs font-semibold text-red-600 dark:text-red-400 inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </section>
      )}
    </div>
  );
};
