import React from 'react';
import {
  BarChart3,
  BookOpen,
  ClipboardList,
  Home,
  LogOut,
  Moon,
  Plus,
  Scale,
  Settings,
  ShieldCheck,
  Sun,
  Target,
  Users,
} from 'lucide-react';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { ENABLE_TRAINER_PORTAL, NavTab } from '../types';
import { isDatabaseAdmin } from '../utils/adminAccess';
import { CalothrixLogo } from './CalothrixLogo';
import { SchemaSetupBanner } from './SchemaSetupBanner';

interface NavItem {
  id: NavTab;
  label: string;
  mobileLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ALL_NAV_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', mobileLabel: 'Home', icon: Home },
  { id: 'food-log', label: 'Food Log', mobileLabel: 'Food Log', icon: ClipboardList },
  { id: 'food-database', label: 'Food Database', mobileLabel: 'Foods', icon: BookOpen },
  { id: 'progress', label: 'Progress', mobileLabel: 'Progress', icon: BarChart3 },
  { id: 'weight', label: 'Weight', mobileLabel: 'Weight', icon: Scale },
  { id: 'goals', label: 'Goals', mobileLabel: 'Goals', icon: Target },
  { id: 'profile', label: 'Profile / Settings', mobileLabel: 'Settings', icon: Settings },
];

const MOBILE_BOTTOM_TABS = ALL_NAV_ITEMS.slice(0, 5);

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    state,
    authUser,
    authDetails,
    resolvedTheme,
    toggleTheme,
    activeTab,
    setActiveTab,
    openAddFoodModal,
    selectAccountRole,
    signOut,
  } = useMacroLogStore();

  const isAdmin = isDatabaseAdmin(authUser, state.profile);
  const desktopNavItems: NavItem[] = isAdmin
    ? [
        ...ALL_NAV_ITEMS,
        { id: 'admin-quality', label: 'DB Quality Audit', mobileLabel: 'Audit', icon: ShieldCheck },
      ]
    : ALL_NAV_ITEMS;

  const displayName = authDetails?.name || state.profile.name;
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
              className="text-left group focus:outline-none"
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
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl border border-black/12 dark:border-white/15 bg-[#F4F3EF]/70 dark:bg-[#14161C] text-slate-700 dark:text-slate-300 hover:text-black dark:hover:text-white transition-colors shrink-0"
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

          <button
            type="button"
            onClick={() => openAddFoodModal()}
            className="mt-4 w-full min-h-[42px] px-4 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-sm font-bold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Add Food
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Main navigation">
          {desktopNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
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
                {displayName}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {displayEmail || 'Signed in'}
              </div>
            </div>
          </button>

          {ENABLE_TRAINER_PORTAL && (
            <button
              type="button"
              onClick={() => void selectAccountRole('trainer')}
              className="w-full min-h-[38px] px-3 rounded-xl border border-[#4E6800]/30 dark:border-[#C8FF00]/30 bg-[#C8FF00]/12 dark:bg-[#C8FF00]/10 text-xs font-semibold text-[#4E6800] dark:text-[#C8FF00] hover:bg-[#C8FF00]/22 transition-colors inline-flex items-center justify-center gap-2"
            >
              <Users className="w-3.5 h-3.5" />
              <span>Trainer Dashboard</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void signOut()}
            className="w-full min-h-[38px] px-3 rounded-xl border border-black/12 dark:border-white/15 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors inline-flex items-center justify-center gap-2"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Compact Sticky Top Bar with Safe Area */}
      <header className="lg:hidden sticky top-0 z-30 pt-[env(safe-area-inset-top)] bg-white/92 dark:bg-[#111317]/92 backdrop-blur-md border-b border-black/10 dark:border-white/10 px-3">
        <div className="h-[52px] flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            className="flex items-center min-h-[44px] px-1 whitespace-nowrap shrink-0"
            aria-label="CALOTHRIX Home"
          >
            <CalothrixLogo size="sm" />
          </button>

          <div className="flex items-center gap-0.5 shrink-0">
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
              onClick={() => setActiveTab('goals')}
              aria-label="Nutrition Goals"
              className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors ${
                activeTab === 'goals'
                  ? 'bg-[#C8FF00]/15 dark:bg-[#C8FF00]/15 text-[#4E6800] dark:text-[#C8FF00]'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <Target className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('profile')}
              aria-label="Profile and Settings"
              className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors ${
                activeTab === 'profile' ? 'ring-2 ring-[#C8FF00]' : ''
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

            <button
              type="button"
              onClick={() => void signOut()}
              aria-label="Sign out"
              title="Sign out"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 lg:pl-64 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-10 min-w-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7">
          <SchemaSetupBanner />
          {children}
        </div>
      </main>

      {/* Mobile Compact Bottom Tab Bar with Safe Area */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-[#111317]/95 backdrop-blur-md border-t border-black/10 dark:border-white/10 pb-[env(safe-area-inset-bottom)] px-1"
      >
        <div className="h-[60px] grid grid-cols-5 items-center">
          {MOBILE_BOTTOM_TABS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors ${
                  isActive
                    ? 'text-[#4E6800] dark:text-[#C8FF00] font-semibold'
                    : 'text-slate-500 dark:text-slate-400 font-medium'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] mt-0.5 leading-none tracking-tight whitespace-nowrap">
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
