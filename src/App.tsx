import React, { Suspense, lazy, useState } from 'react';
import { AuthScreen } from './components/AuthScreen';
import { CalothrixLogo } from './components/CalothrixLogo';
import { FoodEntryModal } from './components/FoodEntryModal';
import { GoalCelebrationController } from './components/GoalCelebrationModal';
import { InviteAcceptModal } from './components/InviteAcceptModal';
import { Layout } from './components/Layout';
import { RoleSelectionScreen } from './components/RoleSelectionScreen';
import { ToastContainer } from './components/ToastContainer';
import { WeightEntryModal } from './components/WeightEntryModal';
import { MacroLogProvider, useMacroLogStore } from './hooks/useMacroLogStore';
import { HomePage } from './pages/HomePage';
import { LandingPage } from './pages/LandingPage';
import { AccountRole, ENABLE_TRAINER_PORTAL } from './types';

// Lazy-loaded pages & heavy modals for fast mobile initial load
const FoodLogPage = lazy(() =>
  import('./pages/FoodLogPage').then((m) => ({ default: m.FoodLogPage }))
);
const ProgressPage = lazy(() =>
  import('./pages/ProgressPage').then((m) => ({ default: m.ProgressPage }))
);
const WeightPage = lazy(() =>
  import('./pages/WeightPage').then((m) => ({ default: m.WeightPage }))
);
const GoalsPage = lazy(() =>
  import('./pages/GoalsPage').then((m) => ({ default: m.GoalsPage }))
);
const ProfileSettingsPage = lazy(() =>
  import('./pages/ProfileSettingsPage').then((m) => ({ default: m.ProfileSettingsPage }))
);
const AdminQualityPage = lazy(() =>
  import('./pages/AdminQualityPage').then((m) => ({ default: m.AdminQualityPage }))
);

const MealAiScannerModal = lazy(() =>
  import('./components/MealAiScannerModal').then((m) => ({ default: m.MealAiScannerModal }))
);
const BarcodeScannerModal = lazy(() =>
  import('./components/BarcodeScannerModal').then((m) => ({ default: m.BarcodeScannerModal }))
);
const MacroShareModal = lazy(() =>
  import('./components/MacroShareModal').then((m) => ({ default: m.MacroShareModal }))
);
const WeeklyAssessmentModal = lazy(() =>
  import('./components/WeeklyAssessmentModal').then((m) => ({ default: m.WeeklyAssessmentModal }))
);

// Lazy-loaded Trainer Portal bundle (never downloaded by regular users)
const TrainerDashboardProvider = lazy(() =>
  import('./hooks/useTrainerDashboard').then((m) => ({ default: m.TrainerDashboardProvider }))
);
const TrainerLayout = lazy(() =>
  import('./components/TrainerLayout').then((m) => ({ default: m.TrainerLayout }))
);
const TrainerOverviewPage = lazy(() =>
  import('./pages/trainer/TrainerOverviewPage').then((m) => ({ default: m.TrainerOverviewPage }))
);
const TrainerClientsPage = lazy(() =>
  import('./pages/trainer/TrainerClientsPage').then((m) => ({ default: m.TrainerClientsPage }))
);
const TrainerClientDetailPage = lazy(() =>
  import('./pages/trainer/TrainerClientDetailPage').then((m) => ({
    default: m.TrainerClientDetailPage,
  }))
);
const TrainerAnalyticsPage = lazy(() =>
  import('./pages/trainer/TrainerAnalyticsPage').then((m) => ({ default: m.TrainerAnalyticsPage }))
);
const TrainerSettingsPage = lazy(() =>
  import('./pages/trainer/TrainerSettingsPage').then((m) => ({ default: m.TrainerSettingsPage }))
);

const PageFallback: React.FC = () => (
  <div className="space-y-4 py-4 animate-pulse" aria-label="Loading view">
    <div className="h-8 w-44 rounded-xl bg-black/8 dark:bg-white/10" />
    <div className="h-36 rounded-2xl bg-black/6 dark:bg-white/[0.06]" />
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="h-28 rounded-2xl bg-black/6 dark:bg-white/[0.06]" />
      <div className="h-28 rounded-2xl bg-black/6 dark:bg-white/[0.06]" />
    </div>
  </div>
);

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
  const { activeTab, isAdmin } = useMacroLogStore();

  const renderPage = () => {
    switch (activeTab) {
      case 'home':
        return <HomePage />;
      case 'food-log':
        return <FoodLogPage initialSection="diary" />;
      case 'food-database':
        return <FoodLogPage initialSection="database" />;
      case 'progress':
        return <ProgressPage />;
      case 'weight':
        return <WeightPage />;
      case 'goals':
        return <GoalsPage />;
      case 'profile':
        return <ProfileSettingsPage />;
      case 'admin-quality':
        return isAdmin ? <AdminQualityPage /> : <HomePage />;
      default:
        return <HomePage />;
    }
  };

  return <Suspense fallback={<PageFallback />}>{renderPage()}</Suspense>;
};

const TrainerRouter: React.FC = () => {
  const { trainerTab } = useMacroLogStore();

  const renderTrainerPage = () => {
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

  return <Suspense fallback={<PageFallback />}>{renderTrainerPage()}</Suspense>;
};

const AppShell: React.FC = () => {
  const {
    authMode,
    state,
    enterGuestMode,
    mealScannerModal,
    barcodeScannerModal,
    weeklyAssessmentModal,
  } = useMacroLogStore();
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
      <Suspense
        fallback={
          <div className="min-h-screen flex flex-col items-center justify-center bg-[#F4F3EF] dark:bg-[#090A0C] gap-4">
            <CalothrixLogo size="md" />
            <p className="text-xs text-[#52555E] dark:text-[#9A9CA3]">Loading Coach Workspace...</p>
          </div>
        }
      >
        <TrainerDashboardProvider>
          <TrainerLayout>
            <TrainerRouter />
          </TrainerLayout>
          <InviteAcceptModal />
        </TrainerDashboardProvider>
      </Suspense>
    );
  }

  return (
    <>
      <Layout>
        <MacroLogRouter />
      </Layout>
      <FoodEntryModal />
      <WeightEntryModal />
      <InviteAcceptModal />
      <GoalCelebrationController />
      <Suspense fallback={null}>
        {mealScannerModal.isOpen && <MealAiScannerModal />}
        {barcodeScannerModal.isOpen && <BarcodeScannerModal />}
        <MacroShareModal />
        {weeklyAssessmentModal.isOpen && <WeeklyAssessmentModal />}
      </Suspense>
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
