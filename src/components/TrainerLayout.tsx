import React from 'react';
import {
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Moon,
  Settings,
  Sun,
  UserPlus,
  Users,
} from 'lucide-react';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { useTrainerDashboard } from '../hooks/useTrainerDashboard';
import { TRAINER_SUBSCRIPTION_PLANS, TrainerNavTab } from '../types';
import { CalothrixLogo } from './CalothrixLogo';
import { SchemaSetupBanner } from './SchemaSetupBanner';

interface TrainerNavItem {
  id: TrainerNavTab;
  label: string;
  mobileLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TRAINER_NAV_ITEMS: TrainerNavItem[] = [
  { id: 'overview', label: 'Trainer Overview', mobileLabel: 'Overview', icon: LayoutDashboard },
  { id: 'clients', label: 'Clients & Invites', mobileLabel: 'Clients', icon: Users },
  { id: 'analytics', label: 'Progress Analytics', mobileLabel: 'Analytics', icon: BarChart3 },
  { id: 'settings', label: 'Coach Profile & Plan', mobileLabel: 'Settings', icon: Settings },
];

export const TrainerLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    state,
    authDetails,
    resolvedTheme,
    toggleTheme,
    trainerTab,
    setTrainerTab,
    selectAccountRole,
    signOut,
  } = useMacroLogStore();
  const { trainerProfile, clients, setInviteModalOpen } = useTrainerDashboard();

  const displayName =
    trainerProfile?.displayName || authDetails?.name || state.profile.name || 'Coach';
  const displayEmail = authDetails?.email || state.profile.email;
  const avatarUrl = state.profile.avatarUrl || authDetails?.avatarUrl;
  const activeClientsCount = clients.filter(
    (c) => c.relationship.status === 'active' && !c.relationship.isArchived
  ).length;
  const tier = trainerProfile?.subscriptionTier || 'free';
  const planMeta = TRAINER_SUBSCRIPTION_PLANS[tier];

  const initials = displayName
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#F8F8F6] dark:bg-[#0B0F14] text-[#14181F] dark:text-[#F3F4F6] transition-colors duration-200">
      {/* Dedicated Separate Trainer Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:left-0 bg-white dark:bg-[#121821] border-r border-stone-200 dark:border-slate-800 z-30">
        <div className="px-6 pt-6 pb-5 border-b border-stone-100 dark:border-slate-800/80">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setTrainerTab('overview')}
              className="text-left focus:outline-none"
              aria-label="CALOTHRIX Coach Overview"
            >
              <CalothrixLogo size="md" />
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={
                resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
              }
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300"
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
          </div>

          <div className="mt-2.5 flex items-center justify-between text-[11px]">
            <span className="font-semibold uppercase tracking-wider text-lime-700 dark:text-lime-400">
              Trainer Workspace
            </span>
            <span className="font-mono-nums text-slate-500 dark:text-slate-400">
              {activeClientsCount} / {planMeta.maxClients ?? '∞'} clients
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              setTrainerTab('clients');
              setInviteModalOpen(true);
            }}
            className="mt-4 w-full min-h-[42px] px-4 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-sm font-semibold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4" />
            Invite Client
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Trainer navigation">
          {TRAINER_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              trainerTab === item.id ||
              (trainerTab === 'client-detail' && item.id === 'clients');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTrainerTab(item.id)}
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

        <div className="p-3.5 border-t border-stone-100 dark:border-slate-800/80 space-y-2">
          <div className="px-2.5 py-1.5 rounded-lg bg-stone-50 dark:bg-slate-900 border border-stone-200/70 dark:border-slate-800 text-[11px] flex items-center justify-between">
            <span className="text-slate-500 dark:text-slate-400">Plan Tier</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 capitalize">
              {tier}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setTrainerTab('settings')}
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
                {initials || 'TR'}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                {displayName}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {displayEmail || 'Fitness Trainer'}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => void selectAccountRole('individual')}
            className="w-full min-h-[38px] px-3 rounded-xl border border-stone-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center justify-center gap-2"
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>Personal Tracker</span>
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

      {/* Mobile Top Header */}
      <header className="lg:hidden sticky top-0 z-30 h-[52px] bg-white/90 dark:bg-[#121821]/90 backdrop-blur-md border-b border-stone-200 dark:border-slate-800 px-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setTrainerTab('overview')}
          className="flex items-center gap-2 min-h-[44px] px-1 whitespace-nowrap shrink-0"
        >
          <CalothrixLogo size="sm" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-lime-700 dark:text-lime-400">
            Coach
          </span>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              setTrainerTab('clients');
              setInviteModalOpen(true);
            }}
            aria-label="Invite Client"
            className="min-h-[40px] px-3 rounded-xl bg-lime-500 text-slate-950 text-xs font-bold inline-flex items-center gap-1"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Invite</span>
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300"
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="w-5 h-5 text-amber-400" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => void signOut()}
            aria-label="Sign out"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 lg:pl-64 pb-24 lg:pb-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7">
          <SchemaSetupBanner />
          {children}
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav
        aria-label="Trainer mobile navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 h-[62px] bg-white/95 dark:bg-[#121821]/95 backdrop-blur-md border-t border-stone-200 dark:border-slate-800 grid grid-cols-4 items-center px-1"
      >
        {TRAINER_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            trainerTab === item.id ||
            (trainerTab === 'client-detail' && item.id === 'clients');
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTrainerTab(item.id)}
              className={`min-h-[48px] flex flex-col items-center justify-center rounded-xl transition-colors ${
                isActive
                  ? 'text-lime-700 dark:text-lime-400 font-semibold'
                  : 'text-slate-500 dark:text-slate-400 font-medium'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] mt-0.5 leading-none whitespace-nowrap">
                {item.mobileLabel}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
