import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, ClipboardCheck, Loader2, Shield, Users } from 'lucide-react';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { TrainerOnboardingInput } from '../types';
import { CalothrixLogo } from './CalothrixLogo';
import { TrainerOnboardingFlow } from './TrainerOnboardingFlow';

export const RoleSelectionScreen: React.FC = () => {
  const { state, authDetails, selectAccountRole, signOut } = useMacroLogStore();
  const [selectedRole, setSelectedRole] = useState<'individual' | 'trainer'>('individual');
  const [submitting, setSubmitting] = useState(false);

  const handleContinuePersonal = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await selectAccountRole('individual');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteTrainerOnboarding = async (onboarding: TrainerOnboardingInput) => {
    await selectAccountRole('trainer', onboarding);
  };

  return (
    <div className="min-h-[100dvh] bg-[#F4F3EF] dark:bg-[#090A0C] text-[#111317] dark:text-[#F3F4F6] flex flex-col justify-between px-4 py-6 sm:px-6 selection:bg-[#C8FF00] selection:text-black">
      <div className="max-w-4xl w-full mx-auto flex items-center justify-between">
        <CalothrixLogo size="md" />
        <button
          type="button"
          onClick={() => void signOut()}
          className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-black dark:hover:text-[#C8FF00] transition-colors"
        >
          Sign Out
        </button>
      </div>

      <div className="w-full max-w-3xl mx-auto my-8 bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl">
        <div>
          <span className="text-xs font-mono-nums font-semibold text-[#4E6800] dark:text-[#C8FF00] uppercase tracking-[0.16em]">
            Welcome{authDetails?.name ? `, ${authDetails.name}` : ''}
          </span>
          <h1 className="mt-1 text-2xl sm:text-3xl font-display font-extrabold tracking-tight text-[#111317] dark:text-white">
            Choose Your Workspace Role
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
            Select how you want to use CALOTHRIX. You can also onboard as a trainer later from Settings.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Normal User Card */}
          <button
            type="button"
            onClick={() => setSelectedRole('individual')}
            className={`p-5 rounded-xl border text-left transition-all flex flex-col justify-between gap-4 ${
              selectedRole === 'individual'
                ? 'border-[#4E6800] dark:border-[#C8FF00] bg-[#C8FF00]/12 dark:bg-[#C8FF00]/10 ring-1 ring-[#4E6800] dark:ring-[#C8FF00]'
                : 'border-black/12 dark:border-white/12 hover:border-black/30 dark:hover:border-white/25'
            }`}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black flex items-center justify-center">
                  <ClipboardCheck className="w-5 h-5" />
                </div>
                {selectedRole === 'individual' && (
                  <CheckCircle2 className="w-5 h-5 text-[#4E6800] dark:text-[#C8FF00]" />
                )}
              </div>
              <div>
                <h2 className="text-base font-bold text-[#111317] dark:text-white">
                  Personal Account
                </h2>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Track daily meals, search global &amp; Indian foods, calculate personalized macro targets, log body weight, and optionally share progress with a coach.
                </p>
              </div>
            </div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Includes Personal Goal Calculator &amp; Global Food Search
            </div>
          </button>

          {/* Fitness Trainer Card */}
          <button
            type="button"
            onClick={() => setSelectedRole('trainer')}
            className={`p-5 rounded-xl border text-left transition-all flex flex-col justify-between gap-4 ${
              selectedRole === 'trainer'
                ? 'border-[#4E6800] dark:border-[#C8FF00] bg-[#C8FF00]/12 dark:bg-[#C8FF00]/10 ring-1 ring-[#4E6800] dark:ring-[#C8FF00]'
                : 'border-black/12 dark:border-white/12 hover:border-black/30 dark:hover:border-white/25'
            }`}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
                {selectedRole === 'trainer' && (
                  <CheckCircle2 className="w-5 h-5 text-[#4E6800] dark:text-[#C8FF00]" />
                )}
              </div>
              <div>
                <h2 className="text-base font-bold text-[#111317] dark:text-white">
                  Fitness Trainer
                </h2>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Dedicated coaching dashboard to invite clients, monitor daily adherence, inspect client-authorized progress charts, write private notes, and recommend macro updates.
                </p>
              </div>
            </div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-[#4E6800] dark:text-[#C8FF00]" />
              Separate Trainer Console with Strict Client Privacy
            </div>
          </button>
        </div>

        {selectedRole === 'trainer' ? (
          <div className="rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#14171D] p-5 sm:p-6">
            <TrainerOnboardingFlow
              mode="authenticated"
              initialDisplayName={authDetails?.name || state.profile.name || ''}
              cancelLabel="Back to Role Choice"
              onCancel={() => setSelectedRole('individual')}
              onCompleteAuthenticated={handleCompleteTrainerOnboarding}
            />
          </div>
        ) : (
          <form onSubmit={handleContinuePersonal} className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[46px] px-6 rounded-xl bg-[#C8FF00] hover:bg-[#D9FF4D] text-black text-sm font-bold uppercase tracking-[0.06em] transition-colors inline-flex items-center gap-2 disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Setting up...</span>
                </>
              ) : (
                <>
                  <span>Continue as Personal Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>

      <p className="text-center text-xs text-slate-500 dark:text-slate-500">
        CALOTHRIX · Eat Smart. Track Progress. Build Better.
      </p>
    </div>
  );
};
