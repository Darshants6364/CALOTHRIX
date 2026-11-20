import React, { useState } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { BarcodeScannerModal } from './components/BarcodeScannerModal';
import { CalothrixLogo } from './components/CalothrixLogo';
import { FoodEntryModal } from './components/FoodEntryModal';
import { GoalCelebrationController } from './components/GoalCelebrationModal';
import { InviteAcceptModal } from './components/InviteAcceptModal';
import { Layout } from './components/Layout';
import { MacroShareModal } from './components/MacroShareModal';
import { MealAiScannerModal } from './components/MealAiScannerModal';
import { RoleSelectionScreen } from './components/RoleSelectionScreen';
import { ToastContainer } from './components/ToastContainer';
import { TrainerLayout } from './components/TrainerLayout';
import { WeightEntryModal } from './components/WeightEntryModal';
import { MacroLogProvider, useMacroLogStore } from './hooks/useMacroLogStore';
import { TrainerDashboardProvider } from './hooks/useTrainerDashboard';
import { AdminQualityPage } from './pages/AdminQualityPage';
import { FoodDatabasePage } from './pages/FoodDatabasePage';
import { FoodLogPage } from './pages/FoodLogPage';
import { GoalsPage } from './pages/GoalsPage';
import { HomePage } from './pages/HomePage';
import { LandingPage } from './pages/LandingPage';
import { ProfileSettingsPage } from './pages/ProfileSettingsPage';
import { ProgressPage } from './pages/ProgressPage';
import { WeightPage } from './pages/WeightPage';
import { TrainerAnalyticsPage } from './pages/trainer/TrainerAnalyticsPage';
import { TrainerClientDetailPage } from './pages/trainer/TrainerClientDetailPage';
import { TrainerClientsPage } from './pages/trainer/TrainerClientsPage';
import { TrainerOverviewPage } from './pages/trainer/TrainerOverviewPage';
import { TrainerSettingsPage } from './pages/trainer/TrainerSettingsPage';
import { AccountRole, ENABLE_TRAINER_PORTAL } from './types';
import { isDatabaseAdmin } from './utils/adminAccess';

function shouldOpenAuthDirectly(): { openAuth: boolean; portal: AccountRole } {
  if (typeof window === 'undefined') return { openAuth: false, portal: 'individual' };
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname;
  const isTrainerUrl =
    params.get('role') === 'trainer' ||
    params.get('portal') === 'trainer' ||
    path.startsWith('/trainer');
  const isAuthRequested =
    isTrainerUrl ||
    params.get('role') === 'individual' ||
    params.get('portal') === 'individual' ||
    params.has('auth') ||
    params.has('invite') ||
    path.startsWith('/login') ||
    path.startsWith('/invite/');
  return {
    openAuth: isAuthRequested,
    portal: isTrainerUrl ? 'trainer' : 'individual',
  };
}

const MacroLogRouter: React.FC = () => {
  const { activeTab, authUser, state } = useMacroLogStore();

  switch (activeTab) {
    case 'home':
      return <HomePage />;
    case 'food-log':
      return <FoodLogPage />;
    case 'food-database':
      return <FoodDatabasePage />;
    case 'progress':
      return <ProgressPage />;
    case 'weight':
      return <WeightPage />;
    case 'goals':
      return <GoalsPage />;
    case 'profile':
      return <ProfileSettingsPage />;
    case 'admin-quality':
      return isDatabaseAdmin(authUser, state.profile) ? <AdminQualityPage /> : <HomePage />;
    default:
      return <HomePage />;
  }
};

const TrainerRouter: React.FC = () => {
  const { trainerTab } = useMacroLogStore();

  switch (trainerTab) {
    case 'overview':
      return <TrainerOverviewPage />;
    case 'clients':
      return <TrainerClientsPage />;
    case 'client-detail':
      return <TrainerClientDetailPage />;
    case 'analytics':
      return <TrainerAnalyticsPage />;
    case 'settings':
      return <TrainerSettingsPage />;
    default:
      return <TrainerOverviewPage />;
  }
};

const AppShell: React.FC = () => {
  const { authMode, state, enterGuestMode } = useMacroLogStore();
  const initialUnauth = shouldOpenAuthDirectly();
  const [showAuthScreen, setShowAuthScreen] = useState<boolean>(initialUnauth.openAuth);
  const [selectedAuthPortal, setSelectedAuthPortal] = useState<AccountRole>(initialUnauth.portal);

  if (authMode === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F4F3EF] dark:bg-[#090A0C] gap-4">
        <CalothrixLogo size="md" />
        <p className="text-xs text-[#52555E] dark:text-[#9A9CA3]">Loading your workspace...</p>
      </div>
    );
  }

  if (authMode === 'unauthenticated') {
    if (!showAuthScreen) {
      return (
        <LandingPage
          onSelectAuth={(role) => {
            setSelectedAuthPortal(role);
            setShowAuthScreen(true);
          }}
          onTryGuest={enterGuestMode}
        />
      );
    }
    return (
      <AuthScreen
        initialPortal={selectedAuthPortal}
        onBackToHome={() => setShowAuthScreen(false)}
      />
    );
  }

  if (!state.profile.roleSelected) {
    return (
      <>
        <RoleSelectionScreen />
        <InviteAcceptModal />
      </>
    );
  }

  if (ENABLE_TRAINER_PORTAL && state.profile.accountRole === 'trainer') {
    return (
      <TrainerDashboardProvider>
        <TrainerLayout>
          <TrainerRouter />
        </TrainerLayout>
        <InviteAcceptModal />
      </TrainerDashboardProvider>
    );
  }

  return (
    <>
      <Layout>
        <MacroLogRouter />
      </Layout>
      <FoodEntryModal />
      <MealAiScannerModal />
      <BarcodeScannerModal />
      <WeightEntryModal />
      <InviteAcceptModal />
      <GoalCelebrationController />
      <MacroShareModal />
    </>
  );
};

export default function App() {
  return (
    <MacroLogProvider>
      <AppShell />
      <ToastContainer />
    </MacroLogProvider>
  );
}
