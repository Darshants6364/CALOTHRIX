import React, { useEffect, useState } from 'react';
import { Check, Download, Monitor, Moon, RotateCcw, Sun, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { ActivityLevel, FitnessGoalType } from '../types';
import { convertDisplayWeightToKg, convertWeightToDisplay } from '../utils/nutritionUtils';

export const ProfileSettingsPage: React.FC = () => {
  const {
    state,
    updateProfile,
    updateSettings,
    exportData,
    resetDemoData,
    clearAllData,
  } = useMacroLogStore();

  const { profile, settings } = state;

  const [name, setName] = useState(profile.name);
  const [age, setAge] = useState(String(profile.age));
  const [heightCm, setHeightCm] = useState(String(profile.heightCm));
  const [currentWeight, setCurrentWeight] = useState(
    String(convertWeightToDisplay(profile.currentWeightKg, settings.weightUnit))
  );
  const [targetWeight, setTargetWeight] = useState(
    String(convertWeightToDisplay(profile.targetWeightKg, settings.weightUnit))
  );
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(profile.activityLevel);
  const [fitnessGoal, setFitnessGoal] = useState<FitnessGoalType>(profile.fitnessGoal);

  const [confirmAction, setConfirmAction] = useState<'clear' | 'reset' | null>(null);

  useEffect(() => {
    setName(profile.name);
    setAge(String(profile.age));
    setHeightCm(String(profile.heightCm));
    setCurrentWeight(
      String(convertWeightToDisplay(profile.currentWeightKg, settings.weightUnit))
    );
    setTargetWeight(
      String(convertWeightToDisplay(profile.targetWeightKg, settings.weightUnit))
    );
    setActivityLevel(profile.activityLevel);
    setFitnessGoal(profile.fitnessGoal);
  }, [profile, settings.weightUnit]);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const parsedAge = parseInt(age, 10);
    const parsedHeight = parseFloat(heightCm);
    const parsedCurrentW = parseFloat(currentWeight);
    const parsedTargetW = parseFloat(targetWeight);

    updateProfile({
      name: name.trim(),
      age: Number.isFinite(parsedAge) && parsedAge > 0 ? parsedAge : profile.age,
      heightCm:
        Number.isFinite(parsedHeight) && parsedHeight > 0 ? parsedHeight : profile.heightCm,
      currentWeightKg:
        Number.isFinite(parsedCurrentW) && parsedCurrentW > 0
          ? convertDisplayWeightToKg(parsedCurrentW, settings.weightUnit)
          : profile.currentWeightKg,
      targetWeightKg:
        Number.isFinite(parsedTargetW) && parsedTargetW > 0
          ? convertDisplayWeightToKg(parsedTargetW, settings.weightUnit)
          : profile.targetWeightKg,
      activityLevel,
      fitnessGoal,
    });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <section>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Personal details, measurement preferences, and local data backup
        </p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Profile & Settings
        </h1>
      </section>

      {/* Profile Form */}
      <form
        onSubmit={handleSaveProfile}
        className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5"
      >
        <div className="flex items-center gap-4 pb-4 border-b border-stone-100 dark:border-slate-800">
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={profile.name}
              referrerPolicy="no-referrer"
              className="w-14 h-14 rounded-full object-cover border border-stone-200 dark:border-slate-700 shrink-0"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-lime-100 dark:bg-lime-950 text-lime-800 dark:text-lime-300 font-bold text-lg flex items-center justify-center shrink-0">
              {profile.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {profile.name}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {state.isDemoData ? 'Demo Profile · Stored in browser localStorage' : 'Local Profile · Stored in browser localStorage'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Full Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Age (years)
            </label>
            <input
              type="number"
              min="12"
              max="110"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm font-mono-nums text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Height (cm)
            </label>
            <input
              type="number"
              min="90"
              max="250"
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm font-mono-nums text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Current Weight ({settings.weightUnit})
            </label>
            <input
              type="number"
              step="0.05"
              value={currentWeight}
              onChange={(e) => setCurrentWeight(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm font-mono-nums text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Target Weight ({settings.weightUnit})
            </label>
            <input
              type="number"
              step="0.05"
              value={targetWeight}
              onChange={(e) => setTargetWeight(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm font-mono-nums text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Activity Level
            </label>
            <select
              value={activityLevel}
              onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)}
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
            >
              <option value="sedentary">Sedentary (Desk job)</option>
              <option value="light">Lightly Active (1–2 workouts/wk)</option>
              <option value="moderate">Moderately Active (3–5 workouts/wk)</option>
              <option value="active">Active (6–7 workouts/wk)</option>
              <option value="very_active">Very Active (Athlete / Physical job)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Fitness Goal
            </label>
            <select
              value={fitnessGoal}
              onChange={(e) => setFitnessGoal(e.target.value as FitnessGoalType)}
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
            >
              <option value="fat_loss">Fat Loss</option>
              <option value="maintenance">Maintenance</option>
              <option value="muscle_gain">Muscle Gain</option>
              <option value="recomposition">Body Recomposition</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="min-h-[44px] px-5 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-sm font-semibold hover:opacity-90 transition-opacity inline-flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            Save Profile
          </button>
        </div>
      </form>

      {/* Preferences & Units */}
      <section className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          App Preferences
        </h2>

        <div className="divide-y divide-stone-100 dark:divide-slate-800/80">
          <div className="py-3.5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Appearance Theme
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Choose Light (White), Dark, or match your device setting
              </div>
            </div>
            <div className="inline-flex items-center p-1 rounded-xl bg-stone-100 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => updateSettings({ theme: 'light' })}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  settings.theme === 'light'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                White
              </button>
              <button
                type="button"
                onClick={() => updateSettings({ theme: 'dark' })}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  settings.theme === 'dark'
                    ? 'bg-slate-800 text-slate-100 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                Dark
              </button>
              <button
                type="button"
                onClick={() => updateSettings({ theme: 'system' })}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  settings.theme === 'system'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                Auto
              </button>
            </div>
          </div>

          <div className="py-3.5 flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Body Weight Unit
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Used across Weight Tracking and Goals
              </div>
            </div>
            <div className="inline-flex items-center p-1 rounded-xl bg-stone-100 dark:bg-slate-900">
              {(['kg', 'lbs'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => updateSettings({ weightUnit: u })}
                  className={`min-h-[36px] px-3.5 rounded-lg text-xs font-semibold uppercase transition-colors ${
                    settings.weightUnit === u
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          <div className="py-3.5 flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Food Quantity Unit
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Display logged portions in grams or ounces
              </div>
            </div>
            <div className="inline-flex items-center p-1 rounded-xl bg-stone-100 dark:bg-slate-900">
              {(['g', 'oz'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => updateSettings({ foodUnit: u })}
                  className={`min-h-[36px] px-3.5 rounded-lg text-xs font-semibold transition-colors ${
                    settings.foodUnit === u
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {u === 'g' ? 'Grams (g)' : 'Ounces (oz)'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Export & Data Reset */}
      <section className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Data Export & Workspace Management
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Download your complete food and weight history, restore sample demo data, or start with a clean slate.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => exportData('csv')}
            className="min-h-[42px] px-4 rounded-xl border border-stone-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-slate-800 inline-flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>

          <button
            type="button"
            onClick={() => exportData('json')}
            className="min-h-[42px] px-4 rounded-xl border border-stone-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-slate-800 inline-flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export JSON
          </button>

          <button
            type="button"
            onClick={() => setConfirmAction('reset')}
            className="min-h-[42px] px-4 rounded-xl border border-stone-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-slate-800 inline-flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Restore Demo Data
          </button>

          <button
            type="button"
            onClick={() => setConfirmAction('clear')}
            className="min-h-[42px] px-4 rounded-xl border border-red-200 dark:border-red-900/60 text-xs font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 inline-flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Clear Demo Data & Start Fresh
          </button>
        </div>
      </section>

      <ConfirmDialog
        isOpen={confirmAction !== null}
        title={
          confirmAction === 'clear'
            ? 'Clear all data and start fresh?'
            : 'Restore sample demo data?'
        }
        description={
          confirmAction === 'clear'
            ? 'This will remove all food entries, custom foods, and weight logs stored in your browser so you can start completely fresh.'
            : 'This will replace your current local entries with the CALOTHRIX sample demo dataset.'
        }
        confirmLabel={confirmAction === 'clear' ? 'Clear All Data' : 'Restore Demo'}
        destructive={confirmAction === 'clear'}
        onConfirm={() => {
          if (confirmAction === 'clear') {
            clearAllData();
          } else if (confirmAction === 'reset') {
            resetDemoData();
          }
          setConfirmAction(null);
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
};
