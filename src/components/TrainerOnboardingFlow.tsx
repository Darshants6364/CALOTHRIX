import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { TrainerOnboardingInput } from '../types';

const SPECIALTY_OPTIONS = [
  'Fat Loss',
  'Muscle Hypertrophy',
  'Body Recomposition',
  'Indian Macros & Diet',
  'Athletic Conditioning',
  'Metabolic Wellness',
  'Strength & Conditioning',
  'Contest Prep',
];

const CERTIFICATION_CHIPS = ['CSCS', 'PN-L1', 'NASM-CPT', 'ACE-CPT', 'ISSA', 'ISSN-SNS'];

const COACHING_CADENCES = [
  {
    id: '14-Day Adaptive Cycles',
    title: '14-Day Adaptive Macro Cycles',
    subtitle: 'Adjust calories & macros from 14-day weight trends and adherence data',
  },
  {
    id: 'Weekly Check-Ins',
    title: 'Weekly Check-Ins & Reviews',
    subtitle: 'Structured weekly macro reviews, coach notes, and accountability',
  },
  {
    id: 'Habit & Meal-Split Coaching',
    title: 'Habit & Meal-Split Coaching',
    subtitle: 'Daily meal structure, protein timing, and hydration targets',
  },
];

const BIO_TEMPLATES = [
  'Evidence-based macro and strength coach helping clients achieve sustainable fat loss and muscle retention through 14-day adaptive check-ins.',
  'Personalized nutrition coaching tailored around home-cooked & Indian meals, practical macro splits, and consistent weekly accountability.',
];

export const PENDING_TRAINER_ONBOARDING_KEY = 'calothrix_pending_trainer_onboarding_v1';

interface TrainerOnboardingFlowProps {
  mode: 'create-account' | 'authenticated';
  initialDisplayName?: string;
  initialBio?: string;
  initialSpecialties?: string[];
  initialCertifications?: string[];
  initialAcceptingClients?: boolean;
  onCancel?: () => void;
  cancelLabel?: string;
  onCompleteAuthenticated?: (onboarding: TrainerOnboardingInput) => Promise<void>;
  onCreateAccountWithEmail?: (params: {
    email: string;
    password: string;
    onboarding: TrainerOnboardingInput;
  }) => Promise<{ error?: string; info?: string }>;
  onContinueWithGoogle?: (onboarding: TrainerOnboardingInput) => Promise<{ error?: string }>;
}

export const TrainerOnboardingFlow: React.FC<TrainerOnboardingFlowProps> = ({
  mode,
  initialDisplayName = '',
  initialBio = '',
  initialSpecialties = ['Fat Loss', 'Body Recomposition'],
  initialCertifications = [],
  initialAcceptingClients = true,
  onCancel,
  cancelLabel = 'Back',
  onCompleteAuthenticated,
  onCreateAccountWithEmail,
  onContinueWithGoogle,
}) => {
  const totalSteps = mode === 'create-account' ? 4 : 3;
  const [step, setStep] = useState<number>(1);

  // Step 1: Coach Details
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [certifications, setCertifications] = useState<string[]>(initialCertifications);
  const [customCertInput, setCustomCertInput] = useState('');
  const [acceptingClients, setAcceptingClients] = useState(initialAcceptingClients);

  // Step 2: Coaching Preferences
  const [specialties, setSpecialties] = useState<string[]>(
    initialSpecialties.length > 0 ? initialSpecialties : ['Fat Loss', 'Body Recomposition']
  );
  const [coachingCadence, setCoachingCadence] = useState<string>(COACHING_CADENCES[0].id);

  // Step 3: Description
  const [bio, setBio] = useState(initialBio);

  // Step 4 (create-account mode): Credentials
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  const toggleSpecialty = (item: string) => {
    setSpecialties((prev) =>
      prev.includes(item) ? prev.filter((s) => s !== item) : [...prev, item]
    );
  };

  const toggleCertChip = (cert: string) => {
    setCertifications((prev) =>
      prev.includes(cert) ? prev.filter((c) => c !== cert) : [...prev, cert]
    );
  };

  const buildOnboardingPayload = (): TrainerOnboardingInput => {
    const customCerts = customCertInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const mergedCerts = Array.from(new Set([...certifications, ...customCerts]));
    const mergedSpecialties = Array.from(
      new Set([...(specialties.length > 0 ? specialties : ['Macro Coaching']), coachingCadence])
    );

    return {
      displayName: displayName.trim() || 'Coach',
      bio: bio.trim(),
      specialties: mergedSpecialties,
      certifications: mergedCerts,
      acceptingClients,
      coachingCadence,
    };
  };

  const handleNext = () => {
    setError('');
    if (step === 1 && !displayName.trim()) {
      setError('Please enter your coach or studio display name.');
      return;
    }
    if (step === 2 && specialties.length === 0) {
      setError('Select at least one coaching specialty.');
      return;
    }
    setStep((s) => Math.min(totalSteps, s + 1));
  };

  const handleBack = () => {
    setError('');
    setInfoMessage('');
    if (step > 1) {
      setStep((s) => s - 1);
    } else if (onCancel) {
      onCancel();
    }
  };

  const handleAuthenticatedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCompleteAuthenticated) return;
    setError('');
    setSubmitting(true);
    try {
      await onCompleteAuthenticated(buildOnboardingPayload());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete trainer setup.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateAccountWithEmail) return;
    setError('');
    setInfoMessage('');
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    const payload = buildOnboardingPayload();
    try {
      localStorage.setItem(PENDING_TRAINER_ONBOARDING_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors
    }

    setSubmitting(true);
    try {
      const res = await onCreateAccountWithEmail({
        email,
        password,
        onboarding: payload,
      });
      if (res.error) {
        setError(res.error);
      } else if (res.info) {
        setInfoMessage(res.info);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleOnboarding = async () => {
    if (!onContinueWithGoogle) return;
    setError('');
    setInfoMessage('');
    const payload = buildOnboardingPayload();
    try {
      localStorage.setItem(PENDING_TRAINER_ONBOARDING_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors
    }
    setGoogleLoading(true);
    try {
      const res = await onContinueWithGoogle(payload);
      if (res.error) {
        setError(res.error);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const stepTitles: Record<number, { title: string; subtitle: string }> = {
    1: {
      title: 'Coach Details',
      subtitle: 'Tell clients who you are and whether your roster is open for invitations.',
    },
    2: {
      title: 'Coaching Preferences',
      subtitle: 'Choose your specialties and how you prefer to review client progress.',
    },
    3: {
      title: 'Coaching Description',
      subtitle: 'Add a short bio shown on client invitations so athletes know your approach.',
    },
    4: {
      title: 'Create Your Coach Account',
      subtitle: 'Your coaching profile is ready—create your account to launch your dashboard.',
    },
  };

  const currentMeta = stepTitles[step];

  return (
    <div className="space-y-5">
      {/* Top Progress Header */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          {step > 1 || onCancel ? (
            <button
              type="button"
              onClick={handleBack}
              className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-black dark:hover:text-[#C8FF00] inline-flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{step === 1 ? cancelLabel : 'Previous step'}</span>
            </button>
          ) : (
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Trainer Profile Onboarding
            </span>
          )}

          <span className="text-[11px] font-mono-nums font-semibold uppercase tracking-[0.14em] text-[#4E6800] dark:text-[#C8FF00]">
            Step {step} of {totalSteps}
          </span>
        </div>

        {/* Step Indicator Bars */}
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${totalSteps}, minmax(0, 1fr))` }}>
          {Array.from({ length: totalSteps }, (_, idx) => {
            const active = idx + 1 <= step;
            return (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-colors ${
                  active ? 'bg-[#4E6800] dark:bg-[#C8FF00]' : 'bg-black/10 dark:bg-white/10'
                }`}
              />
            );
          })}
        </div>

        <div>
          <h2 className="text-xl font-display font-extrabold tracking-tight text-[#111317] dark:text-white">
            {currentMeta.title}
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            {currentMeta.subtitle}
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300 leading-relaxed">
          {error}
        </div>
      )}

      {infoMessage && (
        <div className="p-3 rounded-xl bg-[#C8FF00]/15 dark:bg-[#C8FF00]/10 border border-[#4E6800]/30 dark:border-[#C8FF00]/30 text-xs text-[#3D5200] dark:text-[#C8FF00] leading-relaxed flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{infoMessage}</span>
        </div>
      )}

      {/* STEP 1: Coach Details */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Coach or Studio Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Coach Alex or Apex Performance Studio"
              className="w-full h-11 px-3.5 rounded-xl border border-black/12 dark:border-white/12 bg-[#F4F3EF]/60 dark:bg-[#090A0C] text-sm text-[#111317] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
              Credentials &amp; Certifications (Optional)
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {CERTIFICATION_CHIPS.map((cert) => {
                const selected = certifications.includes(cert);
                return (
                  <button
                    key={cert}
                    type="button"
                    onClick={() => toggleCertChip(cert)}
                    className={`min-h-[30px] px-2.5 rounded-lg border text-xs font-medium transition-colors ${
                      selected
                        ? 'bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black border-[#111317] dark:border-[#C8FF00] font-semibold'
                        : 'bg-white dark:bg-[#090A0C] border-black/12 dark:border-white/12 text-slate-600 dark:text-slate-300 hover:border-black/25 dark:hover:border-white/25'
                    }`}
                  >
                    {cert}
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              value={customCertInput}
              onChange={(e) => setCustomCertInput(e.target.value)}
              placeholder="Other certifications (comma-separated)"
              className="w-full h-10 px-3.5 rounded-xl border border-black/12 dark:border-white/12 bg-[#F4F3EF]/60 dark:bg-[#090A0C] text-xs text-[#111317] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
            />
          </div>

          <label className="flex items-center justify-between gap-3 p-3.5 rounded-xl border border-black/10 dark:border-white/12 bg-[#F4F3EF]/60 dark:bg-[#090A0C] cursor-pointer">
            <div>
              <div className="text-xs font-semibold text-[#111317] dark:text-white">
                Accepting New Clients
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Allow clients to connect with you via invite links
              </div>
            </div>
            <input
              type="checkbox"
              checked={acceptingClients}
              onChange={(e) => setAcceptingClients(e.target.checked)}
              className="w-4 h-4 accent-[#C8FF00]"
            />
          </label>
        </div>
      )}

      {/* STEP 2: Coaching Preferences */}
      {step === 2 && (
        <div className="space-y-4">
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
                    className={`min-h-[34px] px-3 rounded-lg border text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
                      active
                        ? 'bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black border-[#111317] dark:border-[#C8FF00] font-semibold'
                        : 'bg-white dark:bg-[#090A0C] border-black/12 dark:border-white/12 text-slate-600 dark:text-slate-300 hover:border-black/25 dark:hover:border-white/25'
                    }`}
                  >
                    {active && <Check className="w-3 h-3" />}
                    <span>{spec}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
              Preferred Coaching Workflow
            </span>
            <div className="space-y-2">
              {COACHING_CADENCES.map((cadence) => {
                const selected = coachingCadence === cadence.id;
                return (
                  <button
                    key={cadence.id}
                    type="button"
                    onClick={() => setCoachingCadence(cadence.id)}
                    className={`w-full p-3 rounded-xl border text-left transition-all ${
                      selected
                        ? 'border-[#4E6800] dark:border-[#C8FF00] bg-[#C8FF00]/12 dark:bg-[#C8FF00]/10 ring-1 ring-[#4E6800] dark:ring-[#C8FF00]'
                        : 'border-black/10 dark:border-white/12 bg-white dark:bg-[#090A0C] hover:border-black/25 dark:hover:border-white/25'
                    }`}
                  >
                    <div className="text-xs font-bold text-[#111317] dark:text-white">
                      {cadence.title}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {cadence.subtitle}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: Description */}
      {step === 3 && (
        <form
          id="trainer-onboarding-step3-form"
          onSubmit={mode === 'authenticated' ? handleAuthenticatedSubmit : (e) => { e.preventDefault(); handleNext(); }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Coach Description / Bio
            </label>
            <textarea
              rows={4}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Describe your coaching philosophy, target clientele, and weekly check-in expectations..."
              className="w-full p-3.5 rounded-xl border border-black/12 dark:border-white/12 bg-[#F4F3EF]/60 dark:bg-[#090A0C] text-sm text-[#111317] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <Sparkles className="w-3.5 h-3.5 text-[#4E6800] dark:text-[#C8FF00]" />
              <span>Quick starter templates (tap to fill):</span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {BIO_TEMPLATES.map((tpl, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setBio(tpl)}
                  className="p-2.5 rounded-xl border border-black/8 dark:border-white/10 bg-[#F4F3EF]/50 dark:bg-[#090A0C] text-left text-[11px] text-slate-600 dark:text-slate-300 hover:border-[#4E6800]/50 dark:hover:border-[#C8FF00]/50 transition-colors"
                >
                  “{tpl}”
                </button>
              ))}
            </div>
          </div>

          {mode === 'authenticated' && (
            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[48px] rounded-xl bg-[#C8FF00] hover:bg-[#D9FF4D] text-black text-sm font-bold uppercase tracking-[0.08em] transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Setting up Coach Workspace...</span>
                </>
              ) : (
                <>
                  <span>Complete Setup &amp; Open Trainer Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          )}
        </form>
      )}

      {/* STEP 4: Create Account (pre-auth mode) */}
      {step === 4 && mode === 'create-account' && (
        <div className="space-y-4">
          <div className="p-3 rounded-xl border border-[#4E6800]/25 dark:border-[#C8FF00]/25 bg-[#C8FF00]/10 flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-2.5">
              <UserCheck className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00] shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#111317] dark:text-white truncate">
                  {displayName.trim() || 'Coach'}
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                  {specialties.slice(0, 2).join(' · ')} · {coachingCadence}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-[11px] font-semibold text-[#4E6800] dark:text-[#C8FF00] hover:underline shrink-0"
            >
              Edit
            </button>
          </div>

          {onContinueWithGoogle && (
            <>
              <button
                type="button"
                onClick={() => void handleGoogleOnboarding()}
                disabled={googleLoading}
                className="w-full min-h-[48px] px-4 rounded-xl bg-[#111317] dark:bg-white text-white dark:text-black text-sm font-semibold hover:opacity-92 transition-opacity inline-flex items-center justify-center gap-3 disabled:opacity-60"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.91 6.72-4.91z"
                  />
                </svg>
                <span>{googleLoading ? 'Opening Google Sign-In...' : 'Continue with Google'}</span>
              </button>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
                <span className="text-xs text-slate-500 dark:text-slate-400">or create with email</span>
                <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
              </div>
            </>
          )}

          <form onSubmit={handleCreateAccountSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="coach@example.com"
                className="w-full h-11 px-3.5 rounded-xl border border-black/12 dark:border-white/12 bg-[#F4F3EF]/60 dark:bg-[#090A0C] text-sm text-[#111317] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full h-11 pl-3.5 pr-11 rounded-xl border border-black/12 dark:border-white/12 bg-[#F4F3EF]/60 dark:bg-[#090A0C] text-sm text-[#111317] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[48px] rounded-xl bg-[#C8FF00] hover:bg-[#D9FF4D] text-black text-sm font-bold uppercase tracking-[0.08em] transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating Trainer Account...</span>
                </>
              ) : (
                <>
                  <span>Create Trainer Account</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Next Button for Steps 1-2 (and Step 3 in create-account mode) */}
      {(step < 3 || (step === 3 && mode === 'create-account')) && (
        <div className="pt-1 flex justify-end">
          <button
            type="button"
            onClick={handleNext}
            className="w-full min-h-[46px] rounded-xl bg-[#C8FF00] hover:bg-[#D9FF4D] text-black text-sm font-bold uppercase tracking-[0.08em] transition-colors inline-flex items-center justify-center gap-2"
          >
            <span>{step === 3 ? 'Continue to Create Account' : 'Continue'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
