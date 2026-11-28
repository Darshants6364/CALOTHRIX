import React, { useEffect, useState } from 'react';
import { Check, Shield, UserCheck } from 'lucide-react';
import { useMacroLogStore } from '../../hooks/useMacroLogStore';
import { useTrainerDashboard } from '../../hooks/useTrainerDashboard';
import { upsertTrainerProfile } from '../../services/trainerService';

export const TrainerSettingsPage: React.FC = () => {
  const { authUser, selectAccountRole, notify } = useMacroLogStore();
  const { trainerProfile, refreshAll } = useTrainerDashboard();

  const [displayName, setDisplayName] = useState(trainerProfile?.displayName || '');
  const [bio, setBio] = useState(trainerProfile?.bio || '');
  const [specialtiesStr, setSpecialtiesStr] = useState(
    (trainerProfile?.specialties || []).join(', ')
  );
  const [certificationsStr, setCertificationsStr] = useState(
    (trainerProfile?.certifications || []).join(', ')
  );
  const [acceptingClients, setAcceptingClients] = useState(
    trainerProfile?.acceptingClients ?? true
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!trainerProfile) return;
    setDisplayName(trainerProfile.displayName);
    setBio(trainerProfile.bio);
    setSpecialtiesStr(trainerProfile.specialties.join(', '));
    setCertificationsStr(trainerProfile.certifications.join(', '));
    setAcceptingClients(trainerProfile.acceptingClients);
  }, [trainerProfile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser) return;
    setSaving(true);
    try {
      const res = await upsertTrainerProfile({
        userId: authUser.id,
        displayName,
        bio,
        specialties: specialtiesStr
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        certifications: certificationsStr
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        acceptingClients,
      });
      if (!res.ok) {
        notify(res.error || 'Could not update trainer profile', 'error');
        return;
      }
      await refreshAll();
      notify('Coach profile settings saved');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <section>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Coach profile details, client invitation availability, and workspace mode
        </p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Coach Profile & Workspace Settings
        </h1>
      </section>

      <form
        onSubmit={handleSave}
        className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 sm:p-6 space-y-5"
      >
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-lime-600 dark:text-lime-400" />
          Trainer Profile
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Coach Display Name
            </label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Specialties (comma-separated)
            </label>
            <input
              type="text"
              value={specialtiesStr}
              onChange={(e) => setSpecialtiesStr(e.target.value)}
              placeholder="Fat Loss, Body Recomposition, Indian Macros"
              className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            Coaching Bio (shown on client invitations)
          </label>
          <textarea
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Describe your coaching philosophy and weekly check-in cadence..."
            className="w-full p-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Certifications (comma-separated)
            </label>
            <input
              type="text"
              value={certificationsStr}
              onChange={(e) => setCertificationsStr(e.target.value)}
              placeholder="CSCS, Precision Nutrition L1"
              className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100"
            />
          </div>

          <label className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-black/10 dark:border-white/12 bg-stone-50/60 dark:bg-[#090A0C] cursor-pointer mt-4 sm:mt-0">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Accepting New Client Invitations
            </span>
            <input
              type="checkbox"
              checked={acceptingClients}
              onChange={(e) => setAcceptingClients(e.target.checked)}
              className="w-4 h-4 accent-lime-500"
            />
          </label>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="min-h-[44px] px-6 rounded-xl bg-lime-500 hover:bg-lime-400 text-slate-950 text-sm font-bold inline-flex items-center gap-2 disabled:opacity-60"
          >
            <Check className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Coach Settings'}
          </button>
        </div>
      </form>

      {/* Role Switcher */}
      <section className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Switch to Personal Account
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Switch this account back to your Personal Account meal-logging and nutrition goal dashboard anytime. Your trainer roster remains saved in the database.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void selectAccountRole('individual')}
          className="min-h-[42px] px-4 rounded-xl border border-black/10 dark:border-white/15 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
        >
          Switch to Personal Account
        </button>
      </section>
    </div>
  );
};
