import React from 'react';
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

export default function App() {
  return (
    <MacroLogProvider>
      <Layout>
        <MacroLogRouter />
      </Layout>
      <FoodEntryModal />
      <WeightEntryModal />
      <ToastContainer />
    </MacroLogProvider>
  );
}
