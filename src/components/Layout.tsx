import React from 'react';
import {
  BarChart3,
  ClipboardList,
  CloudOff,
  Home,
  LogOut,
  Moon,
  Plus,
  RefreshCw,
  Scale,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  Users,
} from 'lucide-react';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { ENABLE_TRAINER_PORTAL, NavTab } from '../types';
import { CalothrixLogo } from './CalothrixLogo';
import { SchemaSetupBanner } from './SchemaSetupBanner';

interface NavItem {
  id: NavTab;
  label: string;
  mobileLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}

// Primary navigation strictly aligned to: Home | Log | Weight | Progress | Goals
const PRIMARY_NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', mobileLabel: 'Home', icon: Home },
  { id: 'food-log', label: 'Food Log', mobileLabel: 'Log', icon: ClipboardList },
  { id: 'weight', label: 'Weight', mobileLabel: 'Weight', icon: Scale },
  { id: 'progress', label: 'Progress', mobileLabel: 'Progress', icon: BarChart3 },
  { id: 'goals', label: 'Goals', mobileLabel: 'Goals', icon: Target },
];

const DESKTOP_SECONDARY_ITEMS: NavItem[] = [
  { id: 'profile', label: 'Profile & Settings', mobileLabel: 'Profile', icon: Settings },
];

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    state,
    authMode,
    isAdmin,
    authDetails,
    isOnline,
    pendingSyncCount,
    syncPendingNow,
    showCoachMode,
    resolvedTheme,
    toggleTheme,
    activeTab,
    setActiveTab,
    openAddFoodModal,
    openMealScannerModal,
    selectAccountRole,
    exitGuestModeToAuth,
    signOut,
  } = useMacroLogStore();

  const isGuest = authMode === 'guest';

  const desktopNavItems: NavItem[] = [
    ...PRIMARY_NAV_ITEMS,
    ...DESKTOP_SECONDARY_ITEMS,
    ...(isAdmin
      ? [{ id: 'admin-quality' as NavTab, label: 'AI Performance', mobileLabel: 'AI Stats', icon: ShieldCheck }]
      : []),
  ];

  const displayName = authDetails?.name || state.profile.name || 'Member';
  const displayEmail = authDetails?.email || state.profile.email;
  const avatarUrl = state.profile.avatarUrl || authDetails?.avatarUrl;

  const initials = displayName
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#F4F3EF] dark:bg-[#090A0C] text-[#111317] dark:text-[#F3F4F6] transition-colors duration-200 overflow-x-clip">
      {/* Desktop Sidebar (256px) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:left-0 bg-white dark:bg-[#111317] border-r border-black/10 dark:border-white/10 z-30">
        <div className="px-6 pt-6 pb-5 border-b border-black/8 dark:border-white/10">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('home')}
              className="text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C8FF00] rounded-lg"
              aria-label="CALOTHRIX Home"
            >
              <CalothrixLogo size="md" />
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={
                resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
              }
              title={resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-black/12 dark:border-white/15 bg-[#F4F3EF]/70 dark:bg-[#14161C] text-slate-700 dark:text-slate-300 hover:text-black dark:hover:text-white transition-colors shrink-0"
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="w-4 h-4 text-[#C8FF00]" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
          </div>

          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
            Eat Smart. Track Progress. Build Better.
          </p>

          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={() => openMealScannerModal({ mode: 'photo' })}
              className="w-full min-h-[44px] px-4 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-sm font-bold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2 whitespace-nowrap"
            >
              <Sparkles className="w-4 h-4" />
              AI Meal Logger
            </button>
            <button
              type="button"
              onClick={() => openAddFoodModal()}
              className="w-full min-h-[40px] px-4 rounded-xl border border-black/10 dark:border-white/15 bg-transparent text-slate-700 dark:text-slate-200 text-xs font-semibold hover:border-[#4E6800] dark:hover:border-[#C8FF00] transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Food
            </button>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Main navigation">
          {desktopNavItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              activeTab === item.id ||
              (item.id === 'food-log' && activeTab === 'food-database');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full min-h-[44px] px-3.5 rounded-xl flex items-center gap-3 text-sm transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-[#C8FF00]/18 dark:bg-[#C8FF00]/12 text-[#4E6800] dark:text-[#C8FF00] font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5 hover:text-[#111317] dark:hover:text-white font-medium'
                }`}
              >
                <Icon
                  className={`w-[18px] h-[18px] shrink-0 ${
                    isActive ? 'text-[#4E6800] dark:text-[#C8FF00]' : ''
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User profile & sign-out footer */}
        <div className="p-3.5 border-t border-black/8 dark:border-white/10 space-y-2">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className="w-full min-w-0 flex items-center gap-2.5 p-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                referrerPolicy="no-referrer"
                className="w-9 h-9 rounded-full object-cover border border-black/15 dark:border-white/15 shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-[#C8FF00]/20 text-[#4E6800] dark:text-[#C8FF00] text-xs font-bold flex items-center justify-center shrink-0">
                {initials || 'CX'}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-[#111317] dark:text-white truncate">
                {isGuest ? 'Guest Session' : displayName}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {isGuest ? 'Saved on this device' : displayEmail || 'Signed in'}
              </div>
            </div>
          </button>

          {isGuest && (
            <button
              type="button"
              onClick={exitGuestModeToAuth}
              className="w-full min-h-[40px] px-3 rounded-xl bg-[#C8FF00] text-black text-xs font-bold hover:brightness-95 transition-all inline-flex items-center justify-center gap-2"
            >
              <span>Sign in to sync</span>
            </button>
          )}

          {ENABLE_TRAINER_PORTAL && !isGuest && showCoachMode && (
            <button
              type="button"
              onClick={() => void selectAccountRole('trainer')}
              className="w-full min-h-[40px] px-3 rounded-xl border border-[#4E6800]/30 dark:border-[#C8FF00]/30 bg-[#C8FF00]/12 dark:bg-[#C8FF00]/10 text-xs font-semibold text-[#4E6800] dark:text-[#C8FF00] hover:bg-[#C8FF00]/22 transition-colors inline-flex items-center justify-center gap-2"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Trainer Workspace</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void signOut()}
            className="w-full min-h-[40px] px-3 rounded-xl border border-black/12 dark:border-white/15 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors inline-flex items-center justify-center gap-2"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>{isGuest ? 'Exit Guest Mode' : 'Sign Out'}</span>
          </button>
        </div>
      </aside>

      {/* Mobile Compact Sticky Top Bar — uncluttered: Brand left, Sign-in (if guest) + Theme + Profile right */}
      <header className="lg:hidden sticky top-0 z-30 pt-[env(safe-area-inset-top)] bg-white/95 dark:bg-[#111317]/95 backdrop-blur-md border-b border-black/10 dark:border-white/10 px-3">
        <div className="h-[52px] flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            className="flex items-center min-h-[44px] px-1 whitespace-nowrap shrink-0"
            aria-label="CALOTHRIX Home"
          >
            <CalothrixLogo size="sm" />
          </button>

          <div className="flex items-center gap-1 shrink-0">
            {isGuest && (
              <button
                type="button"
                onClick={exitGuestModeToAuth}
                className="min-h-[38px] px-3 mr-1 rounded-xl bg-[#C8FF00] text-black text-xs font-bold whitespace-nowrap"
              >
                Sign in
              </button>
            )}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={
                resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
              }
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="w-5 h-5 text-[#C8FF00]" />
              ) : (
                <Moon className="w-5 h-5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              aria-label="Profile and Settings"
              aria-current={activeTab === 'profile' ? 'page' : undefined}
              className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors ${
                activeTab === 'profile' ? 'ring-2 ring-[#4E6800] dark:ring-[#C8FF00]' : ''
              }`}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  referrerPolicy="no-referrer"
                  className="w-8 h-8 rounded-full object-cover border border-black/15 dark:border-white/15"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#C8FF00]/20 text-[#4E6800] dark:text-[#C8FF00] text-xs font-bold flex items-center justify-center">
                  {initials || 'CX'}
                </div>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 lg:pl-64 pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:pb-10 min-w-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <SchemaSetupBanner />

          {/* Subtle offline / pending cloud sync banner — only shown when relevant */}
          {(!isOnline || (pendingSyncCount > 0 && !isGuest)) && (
            <div
              role="status"
              className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-medium">
                <CloudOff className="w-4 h-4 shrink-0" />
                <span>
                  {!isOnline
                    ? 'You are offline. Changes are saved locally and will sync when you reconnect.'
                    : `${pendingSyncCount} local ${pendingSyncCount === 1 ? 'change' : 'changes'} waiting to sync.`}
                </span>
              </div>
              {isOnline && pendingSyncCount > 0 && (
                <button
                  type="button"
                  onClick={() => void syncPendingNow()}
                  className="min-h-[34px] px-3 rounded-lg bg-amber-500 text-black font-bold inline-flex items-center gap-1.5 shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Sync now
                </button>
              )}
            </div>
          )}

          {children}
        </div>
      </main>

      {/* Mobile Bottom Tab Bar — strictly Home | Log | Weight | Progress | Goals */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-[#111317]/95 backdrop-blur-md border-t border-black/10 dark:border-white/10 pb-[env(safe-area-inset-bottom)] px-1"
      >
        <div className="h-[62px] grid grid-cols-5 items-center">
          {PRIMARY_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              activeTab === item.id ||
              (item.id === 'food-log' && activeTab === 'food-database');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors relative ${
                  isActive
                    ? 'text-[#4E6800] dark:text-[#C8FF00] font-semibold'
                    : 'text-slate-500 dark:text-slate-400 font-medium'
                }`}
              >
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute top-1 w-5 h-0.5 rounded-full bg-[#4E6800] dark:bg-[#C8FF00]"
                  />
                )}
                <Icon className="w-5 h-5" />
                <span className="text-[11px] mt-0.5 leading-none tracking-tight whitespace-nowrap">
                  {item.mobileLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
