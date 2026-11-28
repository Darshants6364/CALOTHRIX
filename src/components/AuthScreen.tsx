import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  EyeOff,
  KeyRound,
  Moon,
  Sun,
  Users,
} from 'lucide-react';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { supabase } from '../lib/supabaseClient';
import { AccountRole } from '../types';
import { CalothrixLogo } from './CalothrixLogo';
import { PENDING_TRAINER_ONBOARDING_KEY } from './TrainerOnboardingFlow';

type EmailMode = 'signin' | 'signup';

const PENDING_AUTH_ROLE_KEY = 'calothrix_pending_auth_role';
const LAST_PORTAL_ROLE_KEY = 'calothrix_last_portal_role';

interface AuthScreenProps {
  initialPortal?: AccountRole;
  onBackToHome?: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ initialPortal, onBackToHome }) => {
  const {
    resolvedTheme,
    toggleTheme,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
  } = useMacroLogStore();

  const [portalRole, setPortalRole] = useState<AccountRole>(() => {
    if (initialPortal === 'trainer' || initialPortal === 'individual') return initialPortal;
    if (typeof window === 'undefined') return 'individual';
    const params = new URLSearchParams(window.location.search);
    if (
      params.get('role') === 'trainer' ||
      params.get('portal') === 'trainer' ||
      window.location.pathname.startsWith('/trainer')
    ) {
      return 'trainer';
    }
    const remembered = localStorage.getItem(LAST_PORTAL_ROLE_KEY);
    if (remembered === 'trainer' || remembered === 'individual') {
      return remembered;
    }
    return 'individual';
  });
  const [roleExplicitlyToggled, setRoleExplicitlyToggled] = useState<boolean>(() => {
    if (initialPortal === 'trainer' || initialPortal === 'individual') return true;
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return (
      params.get('role') === 'trainer' ||
      params.get('portal') === 'trainer' ||
      window.location.pathname.startsWith('/trainer') ||
      Boolean(localStorage.getItem(LAST_PORTAL_ROLE_KEY))
    );
  });

  useEffect(() => {
    if (initialPortal === 'trainer' || initialPortal === 'individual') {
      setPortalRole(initialPortal);
      setRoleExplicitlyToggled(true);
    }
  }, [initialPortal]);

  const [emailMode, setEmailMode] = useState<EmailMode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  const persistPendingAuthRole = (overrideRole?: AccountRole) => {
    if (typeof window === 'undefined') return;
    const roleToUse = overrideRole || portalRole;
    localStorage.setItem(LAST_PORTAL_ROLE_KEY, roleToUse);
    if (roleToUse === 'trainer') {
      localStorage.setItem(PENDING_AUTH_ROLE_KEY, 'trainer');
    } else if (roleExplicitlyToggled || overrideRole === 'individual') {
      localStorage.setItem(PENDING_AUTH_ROLE_KEY, 'individual');
    } else {
      localStorage.removeItem(PENDING_AUTH_ROLE_KEY);
    }
  };

  const handleSelectPortal = (role: AccountRole) => {
    setPortalRole(role);
    setRoleExplicitlyToggled(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem(LAST_PORTAL_ROLE_KEY, role);
    }
    setError('');
    setInfoMessage('');
  };

  const handleGoogleClick = async () => {
    setError('');
    setInfoMessage('');
    if (typeof window !== 'undefined') {
      localStorage.removeItem(PENDING_TRAINER_ONBOARDING_KEY);
    }
    persistPendingAuthRole();
    setGoogleLoading(true);
    const res = await signInWithGoogle();
    setGoogleLoading(false);
    if (res.error) {
      setError(res.error);
    }
  };

  const handlePasswordReset = async () => {
    setError('');
    setInfoMessage('');
    if (!email.trim()) {
      setError('Enter your email address above first so we can send a password reset link.');
      return;
    }
    setResettingPassword(true);
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback`,
      });
      if (resetErr) {
        setError(resetErr.message);
      } else {
        setInfoMessage(`Password reset link sent to ${email.trim()}. Check your inbox.`);
      }
    } finally {
      setResettingPassword(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    if (typeof window !== 'undefined') {
      localStorage.removeItem(PENDING_TRAINER_ONBOARDING_KEY);
    }
    persistPendingAuthRole();
    setSubmitting(true);
    try {
      if (emailMode === 'signup') {
        if (!name.trim()) {
          setError('Please enter your full name.');
          setSubmitting(false);
          return;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters.');
          setSubmitting(false);
          return;
        }
        const res = await signUpWithEmail(name, email, password, portalRole);
        if (res.error) {
          setError(res.error);
        } else if (res.needsEmailConfirmation) {
          setInfoMessage(
            `Account created! Please confirm your email via the link sent to ${email.trim()}, then sign in.`
          );
        }
      } else {
        if (!password) {
          setError('Please enter your password.');
          setSubmitting(false);
          return;
        }
        const res = await signInWithEmail(email, password);
        if (res.error) {
          setError(res.error);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isTrainerPortal = portalRole === 'trainer';

  return (
    <div className="min-h-[100dvh] flex flex-col justify-between bg-[#F4F3EF] dark:bg-[#090A0C] text-[#111317] dark:text-[#F3F4F6] px-4 py-6 sm:px-6 selection:bg-[#C8FF00] selection:text-black">
      {/* Top Bar */}
      <div className="max-w-5xl w-full mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CalothrixLogo size="md" />
          {onBackToHome && (
            <button
              type="button"
              onClick={onBackToHome}
              className="min-h-[38px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#111317] text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-black dark:hover:text-[#C8FF00] hover:border-black/30 dark:hover:border-[#C8FF00]/60 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Home</span>
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="min-h-[40px] px-3.5 rounded-xl border border-black/15 dark:border-white/15 bg-white dark:bg-[#111317] text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        >
          {resolvedTheme === 'dark' ? (
            <>
              <Sun className="w-4 h-4 text-[#C8FF00]" />
              <span>Light</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4" />
              <span>Dark</span>
            </>
          )}
        </button>
      </div>

      {/* Main Centered Auth Card */}
      <div className="w-full max-w-md mx-auto my-8 bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-6 sm:p-8 shadow-2xl">
        {/* Account Type / Portal Switcher */}
        <div className="mb-5">
          <span className="block text-[11px] font-mono-nums font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400 text-center mb-2.5">
            Select Sign-In Portal
          </span>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => handleSelectPortal('individual')}
              className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                !isTrainerPortal
                  ? 'border-[#4E6800] dark:border-[#C8FF00] bg-[#C8FF00]/12 dark:bg-[#C8FF00]/10 ring-1 ring-[#4E6800] dark:ring-[#C8FF00]'
                  : 'border-black/12 dark:border-white/12 hover:border-black/30 dark:hover:border-white/25'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  !isTrainerPortal
                    ? 'bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black'
                    : 'bg-black/5 dark:bg-white/8 text-slate-500 dark:text-slate-400'
                }`}
              >
                <ClipboardCheck className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#111317] dark:text-white">
                  Personal Account
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                  Nutrition &amp; progress
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleSelectPortal('trainer')}
              className={`p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
                isTrainerPortal
                  ? 'border-[#4E6800] dark:border-[#C8FF00] bg-[#C8FF00]/12 dark:bg-[#C8FF00]/10 ring-1 ring-[#4E6800] dark:ring-[#C8FF00]'
                  : 'border-black/12 dark:border-white/12 hover:border-black/30 dark:hover:border-white/25'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  isTrainerPortal
                    ? 'bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black'
                    : 'bg-black/5 dark:bg-white/8 text-slate-500 dark:text-slate-400'
                }`}
              >
                <Users className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#111317] dark:text-white">
                  Fitness Trainer
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                  Coach workspace
                </div>
              </div>
            </button>
          </div>
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-display font-extrabold tracking-tight text-[#111317] dark:text-white">
            {isTrainerPortal
              ? emailMode === 'signup'
                ? 'Create Trainer Account'
                : 'Trainer Portal Sign-In'
              : emailMode === 'signup'
              ? 'Create CALOTHRIX Account'
              : 'Sign in to CALOTHRIX'}
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
            {isTrainerPortal
              ? 'Sign in or create your account. New coaches complete profile onboarding right after logging in.'
              : 'Every account stores its own food logs, goals, and weight history privately in the database.'}
          </p>
        </div>

        {/* 1-Click Primary Google Sign-In */}
        <button
          type="button"
          onClick={handleGoogleClick}
          disabled={googleLoading}
          className="mt-5 w-full min-h-[48px] px-4 rounded-xl bg-[#111317] dark:bg-white text-white dark:text-black text-sm font-semibold hover:opacity-92 transition-opacity inline-flex items-center justify-center gap-3 disabled:opacity-60"
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
          <span>
            {googleLoading
              ? 'Opening Google Sign-In...'
              : isTrainerPortal
              ? 'Continue with Google (Trainer)'
              : 'Continue with Google'}
          </span>
        </button>

        {/* Divider */}
        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
          <span className="text-xs text-slate-500 dark:text-slate-400">or use email</span>
          <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
        </div>

        {/* Email Mode Tabs: Sign In / Sign Up only */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-black/5 dark:bg-[#090A0C] border border-black/5 dark:border-white/8 mb-4">
          {(
            [
              { id: 'signin', label: 'Sign In' },
              { id: 'signup', label: 'Sign Up' },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setEmailMode(m.id);
                setError('');
                setInfoMessage('');
              }}
              className={`min-h-[34px] rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                emailMode === m.id
                  ? 'bg-white dark:bg-[#14161C] text-[#111317] dark:text-[#C8FF00] shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-black dark:hover:text-white'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-xs text-red-700 dark:text-red-300 leading-relaxed">
            {error}
          </div>
        )}

        {infoMessage && (
          <div className="mb-4 p-3 rounded-xl bg-[#C8FF00]/15 dark:bg-[#C8FF00]/10 border border-[#4E6800]/30 dark:border-[#C8FF00]/30 text-xs text-[#3D5200] dark:text-[#C8FF00] leading-relaxed flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{infoMessage}</span>
          </div>
        )}

        <form onSubmit={handleEmailSubmit} className="space-y-3.5">
          {emailMode === 'signup' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full h-11 px-3.5 rounded-xl border border-black/12 dark:border-white/12 bg-[#F4F3EF]/60 dark:bg-[#090A0C] text-sm text-[#111317] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={isTrainerPortal ? 'coach@example.com' : 'you@example.com'}
              className="w-full h-11 px-3.5 rounded-xl border border-black/12 dark:border-white/12 bg-[#F4F3EF]/60 dark:bg-[#090A0C] text-sm text-[#111317] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Password
              </label>
              {emailMode === 'signin' && (
                <button
                  type="button"
                  disabled={resettingPassword}
                  onClick={() => void handlePasswordReset()}
                  className="text-[11px] font-medium text-[#4E6800] dark:text-[#C8FF00] hover:underline inline-flex items-center gap-1 disabled:opacity-60"
                >
                  <KeyRound className="w-3 h-3" />
                  <span>{resettingPassword ? 'Sending...' : 'Forgot password?'}</span>
                </button>
              )}
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
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
            <span>
              {submitting
                ? 'Please wait...'
                : emailMode === 'signup'
                ? 'Create Account'
                : isTrainerPortal
                ? 'Sign In to Trainer Portal'
                : 'Sign In'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {isTrainerPortal && (
          <p className="mt-4 text-center text-[11px] text-slate-500 dark:text-slate-400">
            Accepting a coach invitation link as a client?{' '}
            <button
              type="button"
              onClick={() => handleSelectPortal('individual')}
              className="font-semibold text-[#4E6800] dark:text-[#C8FF00] hover:underline"
            >
              Switch to Personal Account
            </button>
          </p>
        )}
      </div>

      <p className="text-center text-xs text-slate-500 dark:text-slate-500">
        CALOTHRIX · Eat Smart. Track Progress. Build Better.
      </p>
    </div>
  );
};
