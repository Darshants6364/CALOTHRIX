import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, Mail, Moon, Sun } from 'lucide-react';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { CalothrixLogo } from './CalothrixLogo';

type EmailMode = 'signin' | 'signup' | 'magic';

export const AuthScreen: React.FC = () => {
  const {
    resolvedTheme,
    toggleTheme,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signInWithMagicLink,
  } = useMacroLogStore();

  const [emailMode, setEmailMode] = useState<EmailMode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  const handleGoogleClick = async () => {
    setError('');
    setInfoMessage('');
    setGoogleLoading(true);
    const res = await signInWithGoogle();
    setGoogleLoading(false);
    if (res.error) {
      setError(res.error);
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

    setSubmitting(true);
    try {
      if (emailMode === 'magic') {
        const res = await signInWithMagicLink(email);
        if (res.error) {
          setError(res.error);
        } else {
          setInfoMessage(`Sign-in link sent to ${email.trim()}. Check your inbox.`);
        }
      } else if (emailMode === 'signup') {
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
        const res = await signUpWithEmail(name, email, password);
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

  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#F8F8F6] dark:bg-[#0B0F14] text-[#14181F] dark:text-[#F3F4F6] px-4 py-6 sm:px-6">
      {/* Top Bar */}
      <div className="max-w-5xl w-full mx-auto flex items-center justify-between">
        <CalothrixLogo size="md" />
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className="min-h-[40px] px-3.5 rounded-xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-[#121821] text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-2 hover:bg-stone-50 dark:hover:bg-slate-800 transition-colors"
        >
          {resolvedTheme === 'dark' ? (
            <>
              <Sun className="w-4 h-4 text-amber-400" />
              <span>White</span>
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
      <div className="w-full max-w-md mx-auto my-8 bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Sign in to CALOTHRIX
          </h1>
          <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
            Every account stores its own food logs, goals, and weight history privately in the database.
          </p>
        </div>

        {/* 1-Click Primary Google Sign-In */}
        <button
          type="button"
          onClick={handleGoogleClick}
          disabled={googleLoading}
          className="mt-6 w-full min-h-[48px] px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 text-sm font-semibold hover:opacity-92 transition-opacity inline-flex items-center justify-center gap-3 disabled:opacity-60"
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

        {/* Divider */}
        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-stone-200 dark:bg-slate-800" />
          <span className="text-xs text-slate-400">or use email</span>
          <div className="h-px flex-1 bg-stone-200 dark:bg-slate-800" />
        </div>

        {/* Email Mode Tabs */}
        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-stone-100 dark:bg-slate-900 mb-4">
          {(
            [
              { id: 'signin', label: 'Sign In' },
              { id: 'signup', label: 'Sign Up' },
              { id: 'magic', label: 'Magic Link' },
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
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400'
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
          <div className="mb-4 p-3 rounded-xl bg-lime-50 dark:bg-lime-950/50 border border-lime-200 dark:border-lime-900/60 text-xs text-lime-800 dark:text-lime-300 leading-relaxed flex items-start gap-2">
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
                className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
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
              placeholder="you@example.com"
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
            />
          </div>

          {emailMode !== 'magic' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-lime-500"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[46px] rounded-xl bg-lime-500 hover:bg-lime-400 text-slate-950 text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {emailMode === 'magic' ? (
              <>
                <Mail className="w-4 h-4" />
                <span>{submitting ? 'Sending link...' : 'Send Sign-In Link'}</span>
              </>
            ) : (
              <>
                <span>
                  {submitting
                    ? 'Please wait...'
                    : emailMode === 'signup'
                    ? 'Create Account'
                    : 'Sign In'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>

      <p className="text-center text-xs text-slate-400 dark:text-slate-500">
        Eat Smart. Track Progress. Build Better.
      </p>
    </div>
  );
};
