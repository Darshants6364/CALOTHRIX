import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, ClipboardCheck, Loader2, Shield, Users } from 'lucide-react';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { CalothrixLogo } from './CalothrixLogo';

const SPECIALTY_OPTIONS = [
  'Fat Loss',
  'Muscle Hypertrophy',
  'Body Recomposition',
  'Indian Nutrition',
  'Strength & Conditioning',
  'Contest Prep',
];

export const RoleSelectionScreen: React.FC = () => {
  const { state, authDetails, selectAccountRole, signOut } = useMacroLogStore();
  const [selectedRole, setSelectedRole] = useState<'individual' | 'trainer'>('individual');
  const [trainerName, setTrainerName] = useState(
    authDetails?.name || state.profile.name || ''
  );
  const [trainerBio, setTrainerBio] = useState('');
  const [specialties, setSpecialties] = useState<string[]>(['Fat Loss', 'Macro Coaching']);
  const [submitting, setSubmitting] = useState(false);

  const toggleSpecialty = (item: string) => {
    setSpecialties((prev) =>
      prev.includes(item) ? prev.filter((s) => s !== item) : [...prev, item]
    );
  };

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (selectedRole === 'trainer') {
        await selectAccountRole('trainer', {
          displayName: trainerName.trim() || authDetails?.name || 'Coach',
          bio: trainerBio.trim(),
          specialties: specialties.length > 0 ? specialties : ['Macro Coaching'],
          certifications: [],
        });
      } else {
        await selectAccountRole('individual');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F8F6] dark:bg-[#0B0F14] text-[#14181F] dark:text-[#F3F4F6] flex flex-col justify-between px-4 py-6 sm:px-6">
      <div className="max-w-4xl w-full mx-auto flex items-center justify-between">
        <CalothrixLogo size="md" />
        <button
          type="button"
          onClick={() => void signOut()}
          className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
        >
          Sign Out
        </button>
      </div>

      <form
        onSubmit={handleContinue}
        className="w-full max-w-3xl mx-auto my-8 bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm"
      >
        <div>
          <span className="text-xs font-semibold text-lime-700 dark:text-lime-400 uppercase tracking-wider">
            Welcome{authDetails?.name ? `, ${authDetails.name}` : ''}
          </span>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Choose Your Workspace Role
          </h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            Select how you want to use CALOTHRIX. You can also adjust your coaching role later in Settings.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Normal User Card */}
          <button
            type="button"
            onClick={() => setSelectedRole('individual')}
            className={`p-5 rounded-2xl border text-left transition-all flex flex-col justify-between gap-4 ${
              selectedRole === 'individual'
                ? 'border-lime-500 bg-lime-50/70 dark:bg-lime-950/30 ring-1 ring-lime-500'
                : 'border-stone-200 dark:border-slate-800 hover:border-stone-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 flex items-center justify-center">
                  <ClipboardCheck className="w-5 h-5" />
                </div>
                {selectedRole === 'individual' && (
                  <CheckCircle2 className="w-5 h-5 text-lime-600 dark:text-lime-400" />
                )}
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">
                  Normal User
                </h2>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Track daily meals, search global & Indian foods, calculate personalized macro targets, log body weight, and optionally share progress with a coach.
                </p>
              </div>
            </div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Includes Personal Goal Calculator & Global Food Search
            </div>
          </button>

          {/* Fitness Trainer Card */}
          <button
            type="button"
            onClick={() => setSelectedRole('trainer')}
            className={`p-5 rounded-2xl border text-left transition-all flex flex-col justify-between gap-4 ${
              selectedRole === 'trainer'
                ? 'border-lime-500 bg-lime-50/70 dark:bg-lime-950/30 ring-1 ring-lime-500'
                : 'border-stone-200 dark:border-slate-800 hover:border-stone-300 dark:hover:border-slate-700'
            }`}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
                {selectedRole === 'trainer' && (
                  <CheckCircle2 className="w-5 h-5 text-lime-600 dark:text-lime-400" />
                )}
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">
                  Fitness Trainer
                </h2>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Dedicated coaching dashboard to invite clients, monitor daily adherence, inspect client-authorized progress charts, write private notes, and recommend macro updates.
                </p>
              </div>
            </div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-lime-600 dark:text-lime-400" />
              Separate Trainer Console with Strict Client Privacy
            </div>
          </button>
        </div>

        {/* Trainer Quick Setup when Trainer is selected */}
        {selectedRole === 'trainer' && (
          <div className="rounded-2xl border border-stone-200 dark:border-slate-800 bg-stone-50/70 dark:bg-slate-900/60 p-4 sm:p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Trainer Profile Setup
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Coach Display Name
                </label>
                <input
                  type="text"
                  required
                  value={trainerName}
                  onChange={(e) => setTrainerName(e.target.value)}
                  placeholder="Coach Alex"
                  className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Short Coaching Bio (Optional)
                </label>
                <input
                  type="text"
                  value={trainerBio}
                  onChange={(e) => setTrainerBio(e.target.value)}
                  placeholder="Evidence-based fat loss & strength nutrition"
                  className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div>
              <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                Coaching Specialties
              </span>
              <div className="flex flex-wrap gap-2">
                {SPECIALTY_OPTIONS.map((spec) => {
                  const active = specialties.includes(spec);
                  return (
                    <button
                      key={spec}
                      type="button"
                      onClick={() => toggleSpecialty(spec)}
                      className={`min-h-[34px] px-3 rounded-lg border text-xs font-medium transition-colors ${
                        active
                          ? 'bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 border-slate-900 dark:border-lime-500 font-semibold'
                          : 'bg-white dark:bg-slate-900 border-stone-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {spec}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="min-h-[46px] px-6 rounded-xl bg-lime-500 hover:bg-lime-400 text-slate-950 text-sm font-bold transition-colors inline-flex items-center gap-2 disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Setting up...</span>
              </>
            ) : (
              <>
                <span>
                  {selectedRole === 'trainer'
                    ? 'Enter Trainer Dashboard'
                    : 'Continue as Normal User'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </form>

      <p className="text-center text-xs text-slate-400 dark:text-slate-500">
        CALOTHRIX · Eat Smart. Track Progress. Build Better.
      </p>
    </div>
  );
};
