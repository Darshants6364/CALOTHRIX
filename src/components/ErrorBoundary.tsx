import React from 'react';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'An unexpected rendering error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[CALOTHRIX ErrorBoundary]', error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    try {
      window.history.replaceState({}, '', '/');
    } catch {
      // ignore history errors
    }
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F3EF] dark:bg-[#090A0C] px-4 py-10 text-[#111317] dark:text-[#F3F4F6]">
        <div
          role="alert"
          className="w-full max-w-md bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-6 sm:p-7 space-y-5 shadow-lg"
        >
          <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>

          <div className="space-y-1.5">
            <h1 className="text-lg font-bold tracking-tight">Something went wrong</h1>
            <p className="text-sm text-[#52555E] dark:text-[#9A9CA3] leading-relaxed">
              CALOTHRIX ran into an unexpected error on this screen. Your saved nutrition logs are
              safe.
            </p>
            {this.state.errorMessage && (
              <p className="mt-2 text-xs font-mono text-slate-600 dark:text-slate-400 bg-stone-100 dark:bg-[#090A0C] rounded-xl px-3 py-2 break-words">
                {this.state.errorMessage}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={this.handleGoHome}
              className="flex-1 min-h-[44px] px-4 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-sm font-bold inline-flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
            >
              <Home className="w-4 h-4" />
              Return Home
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              className="flex-1 min-h-[44px] px-4 rounded-xl border border-black/15 dark:border-white/15 text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Reload App
            </button>
          </div>
        </div>
      </div>
    );
  }
}
