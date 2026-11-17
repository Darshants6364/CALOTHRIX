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
  Sun,
  Target,
} from 'lucide-react';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { NavTab } from '../types';
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
    authDetails,
    resolvedTheme,
    toggleTheme,
    activeTab,
    setActiveTab,
    openAddFoodModal,
    signOut,
  } = useMacroLogStore();

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
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#F8F8F6] dark:bg-[#0B0F14] text-[#14181F] dark:text-[#F3F4F6] transition-colors duration-200">
      {/* Desktop Sidebar (256px) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:left-0 bg-white dark:bg-[#121821] border-r border-stone-200 dark:border-slate-800 z-30">
        <div className="px-6 pt-6 pb-5 border-b border-stone-100 dark:border-slate-800/80">
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
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0"
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
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
            className="mt-4 w-full min-h-[42px] px-4 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-sm font-semibold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Add Food
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Main navigation">
          {ALL_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full min-h-[44px] px-3.5 rounded-xl flex items-center gap-3 text-sm transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-lime-50 dark:bg-lime-950/50 text-lime-800 dark:text-lime-300 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-stone-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100 font-medium'
                }`}
              >
                <Icon
                  className={`w-[18px] h-[18px] shrink-0 ${
                    isActive ? 'text-lime-600 dark:text-lime-400' : ''
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User profile & sign-out footer */}
        <div className="p-3.5 border-t border-stone-100 dark:border-slate-800/80 space-y-2">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className="w-full min-w-0 flex items-center gap-2.5 p-2 rounded-xl hover:bg-stone-50 dark:hover:bg-slate-800/60 transition-colors text-left"
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                referrerPolicy="no-referrer"
                className="w-9 h-9 rounded-full object-cover border border-stone-200 dark:border-slate-700 shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-lime-100 dark:bg-lime-950 text-lime-800 dark:text-lime-300 text-xs font-bold flex items-center justify-center shrink-0">
                {initials || 'CX'}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                {displayName}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {displayEmail || 'Signed in'}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => void signOut()}
            className="w-full min-h-[38px] px-3 rounded-xl border border-stone-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-stone-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center justify-center gap-2"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Compact Sticky Top Bar (52px) */}
      <header className="lg:hidden sticky top-0 z-30 h-[52px] bg-white/90 dark:bg-[#121821]/90 backdrop-blur-md border-b border-stone-200 dark:border-slate-800 px-3 flex items-center justify-between gap-2">
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
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800 transition-colors"
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="w-5 h-5 text-amber-400" />
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
                ? 'bg-lime-50 dark:bg-lime-950/60 text-lime-700 dark:text-lime-400'
                : 'text-slate-600 dark:text-slate-300 hover:bg-stone-100 dark:hover:bg-slate-800'
            }`}
          >
            <Target className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            aria-label="Profile and Settings"
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors ${
              activeTab === 'profile' ? 'ring-2 ring-lime-500' : ''
            }`}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                referrerPolicy="no-referrer"
                className="w-8 h-8 rounded-full object-cover border border-stone-200 dark:border-slate-700"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-lime-100 dark:bg-lime-950 text-lime-800 dark:text-lime-300 text-xs font-bold flex items-center justify-center">
                {initials || 'CX'}
              </div>
            )}
          </button>

          <button
            type="button"
            onClick={() => void signOut()}
            aria-label="Sign out"
            title="Sign out"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 hover:bg-stone-100 dark:hover:bg-slate-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 lg:pl-64 pb-24 lg:pb-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7">
          <SchemaSetupBanner />
          {children}
        </div>
      </main>

      {/* Mobile Compact Bottom Tab Bar (62px) */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 h-[62px] bg-white/95 dark:bg-[#121821]/95 backdrop-blur-md border-t border-stone-200 dark:border-slate-800 grid grid-cols-5 items-center px-1"
      >
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
                  ? 'text-lime-700 dark:text-lime-400 font-semibold'
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
      </nav>
    </div>
  );
};
