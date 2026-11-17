import React from 'react';
import { AuthScreen } from './components/AuthScreen';
import { CalothrixLogo } from './components/CalothrixLogo';
import { FoodEntryModal } from './components/FoodEntryModal';
import { Layout } from './components/Layout';
import { ToastContainer } from './components/ToastContainer';
import { WeightEntryModal } from './components/WeightEntryModal';
import { MacroLogProvider, useMacroLogStore } from './hooks/useMacroLogStore';
import { FoodDatabasePage } from './pages/FoodDatabasePage';
import { FoodLogPage } from './pages/FoodLogPage';
import { GoalsPage } from './pages/GoalsPage';
import { HomePage } from './pages/HomePage';
import { ProfileSettingsPage } from './pages/ProfileSettingsPage';
import { ProgressPage } from './pages/ProgressPage';
import { WeightPage } from './pages/WeightPage';

const MacroLogRouter: React.FC = () => {
  const { activeTab } = useMacroLogStore();

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
    default:
      return <HomePage />;
  }
};

const AppShell: React.FC = () => {
  const { authMode } = useMacroLogStore();

  if (authMode === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8F8F6] dark:bg-[#0B0F14] gap-4">
        <CalothrixLogo size="md" />
        <p className="text-xs text-slate-500 dark:text-slate-400">Loading your workspace...</p>
      </div>
    );
  }

  if (authMode === 'unauthenticated') {
    return <AuthScreen />;
  }

  return (
    <>
      <Layout>
        <MacroLogRouter />
      </Layout>
      <FoodEntryModal />
      <WeightEntryModal />
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
