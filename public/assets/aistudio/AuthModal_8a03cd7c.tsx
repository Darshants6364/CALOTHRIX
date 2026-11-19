import { useState, useEffect, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ArrowRight } from 'lucide-react';

export interface UserSession {
  email: string;
  name: string;
  role: 'member' | 'trainer';
  provider: 'email' | 'google';
}

interface AuthModalProps {
  open: boolean;
  initialMode: 'signin' | 'signup';
  initialRole: 'member' | 'trainer';
  onClose: () => void;
  onAuthenticated: (session: UserSession) => void;
}

export function AuthModal({
  open,
  initialMode,
  initialRole,
  onClose,
  onAuthenticated,
}: AuthModalProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [role, setRole] = useState<'member' | 'trainer'>(initialRole);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setRole(initialRole);
      setError(null);
    }
  }, [open, initialMode, initialRole]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      onAuthenticated({
        email: trimmedEmail,
        name: name.trim() || trimmedEmail.split('@')[0],
        role,
        provider: 'email',
      });
    }, 280);
  };

  const handleGoogleAuth = () => {
    setError(null);
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      onAuthenticated({
        email: role === 'trainer' ? 'coach@calothrix.app' : 'athlete@calothrix.app',
        name: role === 'trainer' ? 'Coach Jordan' : 'Alex Mercer',
        role,
        provider: 'google',
      });
    }, 280);
  };

  return (
    <AnimatePresence>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-10 w-full max-w-md rounded-sm border border-black/15 bg-[#F4F3EF] p-6 sm:p-8 text-[#090A0C] shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-xs font-medium uppercase tracking-widest text-[#52555E]">
                  CALOTHRIX Portal
                </p>
                <h2
                  id="auth-modal-title"
                  className="mt-1 font-display text-2xl font-extrabold tracking-tight text-[#090A0C]"
                >
                  {mode === 'signin'
                    ? role === 'trainer'
                      ? 'Trainer Sign In'
                      : 'Individual Sign In'
                    : 'Create Your Account'}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close sign in dialog"
                className="flex h-10 w-10 items-center justify-center rounded-sm text-[#52555E] hover:bg-black/5 hover:text-[#090A0C] transition-colors"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {/* Mode Switch */}
            <div className="mt-5 grid grid-cols-2 gap-1 rounded-sm bg-black/5 p-1">
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setError(null);
                }}
                className={`py-2 text-xs font-bold uppercase tracking-wider rounded-sm transition-colors ${
                  mode === 'signin' ? 'bg-[#090A0C] text-white' : 'text-[#52555E]'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError(null);
                }}
                className={`py-2 text-xs font-bold uppercase tracking-wider rounded-sm transition-colors ${
                  mode === 'signup' ? 'bg-[#090A0C] text-white' : 'text-[#52555E]'
                }`}
              >
                Get Started
              </button>
            </div>

            {/* Account Role Switch */}
            <div className="mt-4">
              <span className="block text-xs font-medium text-[#52555E] mb-1.5">
                Account Type
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRole('member')}
                  className={`rounded-sm border px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                    role === 'member'
                      ? 'border-[#090A0C] bg-[#090A0C] text-[#C8FF00]'
                      : 'border-black/15 bg-white text-[#52555E] hover:border-black/40'
                  }`}
                >
                  Individual
                </button>
                <button
                  type="button"
                  onClick={() => setRole('trainer')}
                  className={`rounded-sm border px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                    role === 'trainer'
                      ? 'border-[#090A0C] bg-[#090A0C] text-[#C8FF00]'
                      : 'border-black/15 bg-white text-[#52555E] hover:border-black/40'
                  }`}
                >
                  Fitness Trainer
                </button>
              </div>
            </div>

            <button
              type="button"
              disabled={submitting}
              onClick={handleGoogleAuth}
              className="mt-5 flex min-h-[44px] w-full items-center justify-center gap-2.5 rounded-sm border border-black/20 bg-white px-4 py-2.5 text-sm font-medium text-[#090A0C] hover:bg-black/[0.03] transition-colors disabled:opacity-60"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                />
              </svg>
              Continue with Google
            </button>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-black/15" />
              <span className="text-xs text-[#52555E]">or continue with email</span>
              <div className="h-px flex-1 bg-black/15" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
              {mode === 'signup' && (
                <div>
                  <label htmlFor="auth-name" className="block text-xs font-medium text-[#24262B] mb-1">
                    Full Name
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jordan Taylor"
                    className="w-full min-h-[42px] rounded-sm border border-black/20 bg-white px-3 py-2 text-sm text-[#090A0C] focus:border-[#090A0C] focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label htmlFor="auth-email" className="block text-xs font-medium text-[#24262B] mb-1">
                  Email Address
                </label>
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full min-h-[42px] rounded-sm border border-black/20 bg-white px-3 py-2 text-sm text-[#090A0C] focus:border-[#090A0C] focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="auth-password" className="block text-xs font-medium text-[#24262B] mb-1">
                  Password
                </label>
                <input
                  id="auth-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full min-h-[42px] rounded-sm border border-black/20 bg-white px-3 py-2 text-sm text-[#090A0C] focus:border-[#090A0C] focus:outline-none"
                />
              </div>

              {error && (
                <p role="alert" className="text-xs font-medium text-rose-700">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-sm bg-[#090A0C] px-4 py-2.5 text-xs font-bold tracking-wider uppercase text-[#C8FF00] hover:bg-[#1C1F26] transition-colors disabled:opacity-60"
              >
                {submitting
                  ? 'Entering CALOTHRIX...'
                  : role === 'trainer'
                  ? 'Enter Trainer Dashboard'
                  : 'Enter Individual Dashboard'}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
