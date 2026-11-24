import React, { useEffect, useState } from 'react';
import { Check, Loader2, ShieldCheck, X } from 'lucide-react';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import {
  lookupInvitationByToken,
  respondToTrainerInvitation,
} from '../services/trainerService';
import { ClientInvitation } from '../types';

export const InviteAcceptModal: React.FC = () => {
  const {
    pendingInviteToken,
    clearPendingInviteToken,
    notify,
    refreshCoachingAlerts,
  } = useMacroLogStore();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [invitation, setInvitation] = useState<ClientInvitation | null>(null);
  const [error, setError] = useState('');

  const [perms, setPerms] = useState({
    canViewProfile: true,
    canViewNutrition: true,
    canViewWeight: true,
    canViewGoals: true,
    canAddNotes: true,
    canManageGoals: true,
  });

  useEffect(() => {
    if (!pendingInviteToken) {
      setInvitation(null);
      return;
    }
    let mounted = true;
    setLoading(true);
    setError('');
    void lookupInvitationByToken(pendingInviteToken)
      .then((res) => {
        if (!mounted) return;
        if (!res.ok) {
          setError(res.error || 'Could not load invitation.');
        } else if (!res.data) {
          setError('Invitation link is invalid or has expired.');
        } else {
          setInvitation(res.data);
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [pendingInviteToken]);

  if (!pendingInviteToken) return null;

  const handleDecision = async (accept: boolean) => {
    setSubmitting(true);
    setError('');
    try {
      const res = await respondToTrainerInvitation({
        inviteToken: pendingInviteToken,
        accept,
        permissions: perms,
      });
      if (!res.ok) {
        setError(res.error || 'Could not process invitation.');
        return;
      }
      await refreshCoachingAlerts();
      notify(
        accept
          ? `Connected with ${invitation?.trainerName || 'your trainer'}`
          : 'Trainer invitation declined',
        accept ? 'success' : 'info'
      );
      clearPendingInviteToken();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mobile-modal-backdrop fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="mobile-modal-sheet w-full max-w-lg max-h-[92dvh] overflow-y-auto overscroll-contain rounded-2xl bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 p-6 space-y-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-lime-100 dark:bg-lime-950 text-lime-700 dark:text-lime-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">
                Trainer Coaching Invitation
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Choose exactly which tracking sections you want to share
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={clearPendingInviteToken}
            aria-label="Close invitation dialog"
            className="min-h-[36px] min-w-[36px] rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading && (
          <div className="py-8 flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin text-lime-500" />
            <span>Verifying coaching invitation...</span>
          </div>
        )}

        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {!loading && invitation && (
          <>
            <div className="rounded-xl border border-black/10 dark:border-white/12 bg-stone-50/70 dark:bg-[#090A0C]/60 p-4 space-y-1.5">
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {invitation.trainerName || 'Fitness Coach'}
              </div>
              {invitation.trainerBio && (
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {invitation.trainerBio}
                </p>
              )}
              {invitation.message && (
                <p className="text-xs italic text-slate-500 dark:text-slate-400 pt-1">
                  “{invitation.message}”
                </p>
              )}
            </div>

            {invitation.status === 'pending' ? (
              <>
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Authorized Read-Only Access Permissions
                  </div>
                  {(
                    [
                      { key: 'canViewProfile', label: 'Basic fitness profile (age, height, goal)' },
                      { key: 'canViewGoals', label: 'Daily calorie & macro targets' },
                      { key: 'canViewNutrition', label: 'Daily food logs & macro progress (read-only)' },
                      { key: 'canViewWeight', label: 'Body weight log history & trends' },
                      { key: 'canAddNotes', label: 'Allow coach to write private coaching notes' },
                      { key: 'canManageGoals', label: 'Allow coach to edit goals & define nutrition plan' },
                    ] as const
                  ).map((item) => (
                    <label
                      key={item.key}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-black/10 dark:border-white/12 cursor-pointer"
                    >
                      <span className="text-xs text-slate-700 dark:text-slate-300">
                        {item.label}
                      </span>
                      <input
                        type="checkbox"
                        checked={perms[item.key]}
                        onChange={(e) =>
                          setPerms((prev) => ({ ...prev, [item.key]: e.target.checked }))
                        }
                        className="w-4 h-4 accent-lime-500"
                      />
                    </label>
                  ))}
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Trainers can never edit your food logs, and you can revoke access anytime in Settings.
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleDecision(false)}
                    className="min-h-[42px] px-4 rounded-xl border border-black/10 dark:border-white/15 text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleDecision(true)}
                    className="min-h-[42px] px-5 rounded-xl bg-lime-500 hover:bg-lime-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
                  >
                    <Check className="w-4 h-4" />
                    Accept & Share Selected Data
                  </button>
                </div>
              </>
            ) : (
              <div className="text-xs text-slate-500 dark:text-slate-400">
                This invitation status is currently <span className="font-semibold">{invitation.status}</span>.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
