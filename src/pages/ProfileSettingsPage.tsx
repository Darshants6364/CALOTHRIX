import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Download,
  LogOut,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  Trash2,
  Users,
} from 'lucide-react';
import { ClientCoachingSection } from '../components/ClientCoachingSection';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import {
  ActivityLevel,
  BiologicalSex,
  DietaryPreference,
  ENABLE_TRAINER_PORTAL,
  FitnessGoalType,
  FoodRestriction,
  GoalSpeed,
  WorkoutIntensity,
} from '../types';
import { normalizeFitnessGoal } from '../utils/fitnessCalculator';
import { convertDisplayWeightToKg, convertWeightToDisplay } from '../utils/nutritionUtils';

const RESTRICTION_OPTIONS: { id: FoodRestriction; label: string }[] = [
  { id: 'dairy_free', label: 'Dairy-free' },
  { id: 'gluten_free', label: 'Gluten-free' },
  { id: 'nut_free', label: 'Nut-free' },
];

export const ProfileSettingsPage: React.FC = () => {
  const {
    state,
    authMode,
    isAdmin,
    authDetails,
    showCoachMode,
    setShowCoachMode,
    updateProfile,
    updateSettings,
    exportData,
    signOut,
    deleteAccount,
    exitGuestModeToAuth,
    selectAccountRole,
    setActiveTab,
  } = useMacroLogStore();

  const { profile, settings } = state;
  const isGuest = authMode === 'guest';

  const [name, setName] = useState(profile.name);
  const [age, setAge] = useState(profile.age >= 14 ? String(profile.age) : '');
  const [biologicalSex, setBiologicalSex] = useState<BiologicalSex>(
    profile.biologicalSex || 'male'
  );
  const [heightCm, setHeightCm] = useState(profile.heightCm >= 120 ? String(profile.heightCm) : '');
  const [currentWeight, setCurrentWeight] = useState(
    profile.currentWeightKg >= 30
      ? String(convertWeightToDisplay(profile.currentWeightKg, settings.weightUnit))
      : ''
  );
  const [targetWeight, setTargetWeight] = useState(
    profile.targetWeightKg >= 30
      ? String(convertWeightToDisplay(profile.targetWeightKg, settings.weightUnit))
      : ''
  );
  const [dailySteps, setDailySteps] = useState(
    profile.dailyAverageSteps > 0 ? String(profile.dailyAverageSteps) : '7000'
  );
  const [workoutFrequency, setWorkoutFrequency] = useState(
    String(profile.workoutFrequencyPerWeek ?? 3)
  );
  const [workoutIntensity, setWorkoutIntensity] = useState<WorkoutIntensity>(
    profile.workoutIntensity || 'moderate'
  );
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(profile.activityLevel);
  const [fitnessGoal, setFitnessGoal] = useState<FitnessGoalType>(
    normalizeFitnessGoal(profile.fitnessGoal)
  );
  const [goalSpeed, setGoalSpeed] = useState<GoalSpeed>(profile.goalSpeed || 'moderate');
  const [dietaryPreference, setDietaryPreference] = useState<DietaryPreference>(
    profile.dietaryPreference || 'omnivore'
  );
  const [foodRestrictions, setFoodRestrictions] = useState<FoodRestriction[]>(
    profile.foodRestrictions || []
  );

  // Two-step Account Deletion state
  const [deleteStepOpen, setDeleteStepOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    setName(profile.name);
    setAge(profile.age >= 14 ? String(profile.age) : '');
    setBiologicalSex(profile.biologicalSex || 'male');
    setHeightCm(profile.heightCm >= 120 ? String(profile.heightCm) : '');
    setCurrentWeight(
      profile.currentWeightKg >= 30
        ? String(convertWeightToDisplay(profile.currentWeightKg, settings.weightUnit))
        : ''
    );
    setTargetWeight(
      profile.targetWeightKg >= 30
        ? String(convertWeightToDisplay(profile.targetWeightKg, settings.weightUnit))
        : ''
    );
    setDailySteps(profile.dailyAverageSteps > 0 ? String(profile.dailyAverageSteps) : '7000');
    setWorkoutFrequency(String(profile.workoutFrequencyPerWeek ?? 3));
    setWorkoutIntensity(profile.workoutIntensity || 'moderate');
    setActivityLevel(profile.activityLevel);
    setFitnessGoal(normalizeFitnessGoal(profile.fitnessGoal));
    setGoalSpeed(profile.goalSpeed || 'moderate');
    setDietaryPreference(profile.dietaryPreference || 'omnivore');
    setFoodRestrictions(profile.foodRestrictions || []);
  }, [profile, settings.weightUnit]);

  const toggleRestriction = (id: FoodRestriction) => {
    setFoodRestrictions((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const parsedAge = parseInt(age, 10);
    const parsedHeight = parseFloat(heightCm);
    const parsedCurrentW = parseFloat(currentWeight);
    const parsedTargetW = parseFloat(targetWeight);
    const parsedSteps = parseInt(dailySteps, 10);
    const parsedWorkouts = parseInt(workoutFrequency, 10);

    updateProfile({
      name: name.trim(),
      age: Number.isFinite(parsedAge) && parsedAge >= 0 ? parsedAge : profile.age,
      biologicalSex,
      heightCm:
        Number.isFinite(parsedHeight) && parsedHeight >= 0 ? parsedHeight : profile.heightCm,
      currentWeightKg:
        Number.isFinite(parsedCurrentW) && parsedCurrentW >= 0
          ? convertDisplayWeightToKg(parsedCurrentW, settings.weightUnit)
          : profile.currentWeightKg,
      targetWeightKg:
        Number.isFinite(parsedTargetW) && parsedTargetW >= 0
          ? convertDisplayWeightToKg(parsedTargetW, settings.weightUnit)
          : profile.targetWeightKg,
      dailyAverageSteps:
        Number.isFinite(parsedSteps) && parsedSteps >= 0
          ? parsedSteps
          : profile.dailyAverageSteps,
      workoutFrequencyPerWeek:
        Number.isFinite(parsedWorkouts) && parsedWorkouts >= 0
          ? parsedWorkouts
          : profile.workoutFrequencyPerWeek,
      workoutIntensity,
      activityLevel,
      fitnessGoal,
      goalSpeed,
      dietaryPreference,
      foodRestrictions,
    });
  };

  const handleConfirmDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError('');
    if (deleteConfirmText.trim() !== 'DELETE') {
      setDeleteError('Please type DELETE in all caps to confirm.');
      return;
    }
    setDeletingAccount(true);
    const res = await deleteAccount(deleteConfirmText);
    setDeletingAccount(false);
    if (!res.ok) {
      setDeleteError(res.error || 'Could not delete account.');
    }
  };

  const displayAvatar = profile.avatarUrl || authDetails?.avatarUrl;
  const providerLabel = isGuest
    ? 'Local Guest Session'
    : authDetails?.provider === 'google'
    ? 'Google Account'
    : authDetails?.provider === 'email'
    ? 'Email & Password'
    : 'Cloud Account';

  return (
    <div className="space-y-6 max-w-4xl">
      <section>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Manage your profile, units, theme, data exports, and privacy
        </p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Profile &amp; Settings
        </h1>
      </section>

      {/* Account Card */}
      <section className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {displayAvatar ? (
              <img
                src={displayAvatar}
                alt={profile.name}
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-full object-cover border border-black/10 dark:border-white/15 shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-[#C8FF00]/20 text-[#4E6800] dark:text-[#C8FF00] font-bold text-lg flex items-center justify-center shrink-0">
                {(profile.name || 'CX').slice(0, 2).toUpperCase()}
              </div>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                  {isGuest ? 'Guest Session' : authDetails?.name || profile.name}
                </h2>
                {!isGuest && (
                  <ShieldCheck className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00] shrink-0" />
                )}
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 truncate">
                {isGuest
                  ? 'Entries are stored on this device. Sign in to sync across devices.'
                  : authDetails?.email || profile.email}
              </p>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {providerLabel} · {state.foodEntries.length} food logs · {state.weightEntries.length} weigh-ins
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isGuest && (
              <button
                type="button"
                onClick={exitGuestModeToAuth}
                className="min-h-[44px] px-4 rounded-xl bg-[#C8FF00] text-black text-xs font-bold whitespace-nowrap"
              >
                Sign in to sync
              </button>
            )}
            <button
              type="button"
              onClick={() => void signOut()}
              className="min-h-[44px] px-4 rounded-xl border border-black/10 dark:border-white/15 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-red-600 dark:hover:text-red-400 hover:bg-stone-50 dark:hover:bg-white/5 inline-flex items-center gap-2 whitespace-nowrap"
            >
              <LogOut className="w-4 h-4" />
              {isGuest ? 'Exit Guest Mode' : 'Sign Out'}
            </button>
          </div>
        </div>

        {isAdmin && (
          <div className="mt-4 pt-4 border-t border-black/8 dark:border-white/10 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Administrator tools
            </span>
            <button
              type="button"
              onClick={() => setActiveTab('admin-quality')}
              className="min-h-[38px] px-3.5 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-xs font-bold inline-flex items-center gap-1.5"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Open Admin Quality Panel
            </button>
          </div>
        )}
      </section>

      {/* Body, Fitness & Dietary Profile Form */}
      <form
        onSubmit={handleSaveProfile}
        className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 sm:p-6 space-y-5"
      >
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
          Body, Activity &amp; Dietary Profile
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Display Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Biological Sex
            </label>
            <select
              value={biologicalSex}
              onChange={(e) => setBiologicalSex(e.target.value as BiologicalSex)}
              className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100"
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Age (years)
            </label>
            <input
              type="number"
              min="14"
              max="110"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-mono-nums text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Height (cm)
            </label>
            <input
              type="number"
              min="100"
              max="250"
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-mono-nums text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Current Weight ({settings.weightUnit})
            </label>
            <input
              type="number"
              min="25"
              step="0.1"
              value={currentWeight}
              onChange={(e) => setCurrentWeight(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-mono-nums text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Target Weight ({settings.weightUnit})
            </label>
            <input
              type="number"
              min="25"
              step="0.1"
              value={targetWeight}
              onChange={(e) => setTargetWeight(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-mono-nums text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Daily Average Steps
            </label>
            <input
              type="number"
              min="0"
              step="500"
              value={dailySteps}
              onChange={(e) => setDailySteps(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-mono-nums text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Workouts / Week
            </label>
            <input
              type="number"
              min="0"
              max="14"
              value={workoutFrequency}
              onChange={(e) => setWorkoutFrequency(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm font-mono-nums text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Workout Intensity
            </label>
            <select
              value={workoutIntensity}
              onChange={(e) => setWorkoutIntensity(e.target.value as WorkoutIntensity)}
              className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100"
            >
              <option value="light">Light</option>
              <option value="moderate">Moderate</option>
              <option value="vigorous">Vigorous</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Activity Level
            </label>
            <select
              value={activityLevel}
              onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)}
              className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100"
            >
              <option value="sedentary">Sedentary (Desk job)</option>
              <option value="light">Lightly Active (1–2 workouts/wk)</option>
              <option value="moderate">Moderately Active (3–5 workouts/wk)</option>
              <option value="active">Very Active (6–7 workouts/wk)</option>
              <option value="very_active">Extremely Active (Athlete / Physical job)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Fitness Goal
            </label>
            <select
              value={fitnessGoal}
              onChange={(e) => setFitnessGoal(e.target.value as FitnessGoalType)}
              className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100"
            >
              <option value="lose_weight">Lose Weight (Fat Loss)</option>
              <option value="build_muscle">Build Muscle (Lean Gain)</option>
              <option value="fat_gain">Healthy Weight Gain</option>
              <option value="recomposition">Body Recomposition</option>
              <option value="maintain_weight">Maintain Weight</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Dietary Preference
            </label>
            <select
              value={dietaryPreference}
              onChange={(e) => setDietaryPreference(e.target.value as DietaryPreference)}
              className="w-full h-11 px-3.5 rounded-xl border border-black/10 dark:border-white/15 bg-stone-50/60 dark:bg-[#090A0C] text-sm text-slate-900 dark:text-slate-100"
            >
              <option value="omnivore">Omnivore (All foods)</option>
              <option value="eggetarian">Eggetarian</option>
              <option value="vegetarian">Vegetarian</option>
              <option value="vegan">Vegan</option>
            </select>
          </div>
        </div>

        <div>
          <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
            Food Restrictions
          </span>
          <div className="flex flex-wrap gap-2">
            {RESTRICTION_OPTIONS.map((opt) => {
              const active = foodRestrictions.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggleRestriction(opt.id)}
                  className={`min-h-[40px] px-4 rounded-xl border text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black border-transparent'
                      : 'border-black/10 dark:border-white/15 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="min-h-[44px] px-5 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-sm font-bold hover:opacity-90 transition-opacity inline-flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            Save Profile
          </button>
        </div>
      </form>

      {/* Preferences & Units */}
      <section className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 sm:p-6 space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
          App Preferences
        </h2>

        <div className="divide-y divide-black/6 dark:divide-white/10">
          <div className="py-3.5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Appearance Theme
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Light, Dark, or match your device
              </div>
            </div>
            <div className="inline-flex items-center p-1 rounded-xl bg-stone-100 dark:bg-[#090A0C]">
              {(
                [
                  { id: 'light', label: 'Light', icon: Sun },
                  { id: 'dark', label: 'Dark', icon: Moon },
                  { id: 'system', label: 'Auto', icon: Monitor },
                ] as const
              ).map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => updateSettings({ theme: t.id })}
                    className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors ${
                      settings.theme === t.id
                        ? 'bg-white dark:bg-[#181B22] text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="py-3.5 flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Body Weight Unit
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Used across Weight, Progress, and Goals
              </div>
            </div>
            <div className="inline-flex items-center p-1 rounded-xl bg-stone-100 dark:bg-[#090A0C]">
              {(['kg', 'lbs'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => updateSettings({ weightUnit: u })}
                  className={`min-h-[38px] px-4 rounded-lg text-xs font-semibold uppercase ${
                    settings.weightUnit === u
                      ? 'bg-white dark:bg-[#181B22] text-slate-900 dark:text-white shadow-xs'
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
                Display food portions in grams or ounces
              </div>
            </div>
            <div className="inline-flex items-center p-1 rounded-xl bg-stone-100 dark:bg-[#090A0C]">
              {(['g', 'oz'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => updateSettings({ foodUnit: u })}
                  className={`min-h-[38px] px-3.5 rounded-lg text-xs font-semibold ${
                    settings.foodUnit === u
                      ? 'bg-white dark:bg-[#181B22] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {u === 'g' ? 'Grams (g)' : 'Ounces (oz)'}
                </button>
              ))}
            </div>
          </div>

          {ENABLE_TRAINER_PORTAL && !isGuest && (
            <div className="py-3.5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Coach &amp; Trainer Tools
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Enable only if you coach clients or work with a nutrition trainer
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCoachMode(!showCoachMode)}
                  className={`min-h-[38px] px-3.5 rounded-xl text-xs font-bold border transition-colors ${
                    showCoachMode
                      ? 'bg-[#C8FF00]/20 border-[#4E6800]/30 dark:border-[#C8FF00]/40 text-[#4E6800] dark:text-[#C8FF00]'
                      : 'border-black/12 dark:border-white/15 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {showCoachMode ? 'Enabled' : 'Enable Coach Mode'}
                </button>
                {showCoachMode && (
                  <button
                    type="button"
                    onClick={() =>
                      void selectAccountRole('trainer', {
                        displayName: authDetails?.name || profile.name || 'Coach',
                        bio: '',
                        specialties: ['Fat Loss', 'Macro Coaching'],
                        certifications: [],
                      })
                    }
                    className="min-h-[38px] px-3.5 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <Users className="w-3.5 h-3.5" />
                    Open Trainer Workspace
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Coaching Connections (only shown when opted in or user has active coaching) */}
      {ENABLE_TRAINER_PORTAL && !isGuest && showCoachMode && <ClientCoachingSection />}

      {/* Export & Data Privacy */}
      <section className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Data Export &amp; Privacy
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Download your food logs, custom foods, and weight history anytime.{' '}
            <a href="/privacy" target="_blank" rel="noreferrer" className="underline text-[#4E6800] dark:text-[#C8FF00]">
              Privacy Policy
            </a>{' '}
            ·{' '}
            <a href="/terms" target="_blank" rel="noreferrer" className="underline text-[#4E6800] dark:text-[#C8FF00]">
              Terms
            </a>
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => exportData('csv')}
            className="min-h-[44px] px-4 rounded-xl border border-black/10 dark:border-white/15 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-white/5 inline-flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>

          <button
            type="button"
            onClick={() => exportData('json')}
            className="min-h-[44px] px-4 rounded-xl border border-black/10 dark:border-white/15 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-white/5 inline-flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export JSON
          </button>
        </div>
      </section>

      {/* Danger Zone: Self-Service Account & Data Deletion */}
      <section className="bg-white dark:bg-[#111317] border border-red-500/25 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {isGuest ? 'Erase Local Guest Data' : 'Delete Account & Erase Data'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {isGuest
                ? 'Permanently clear all guest meals, weight entries, saved combos, and goals stored on this browser.'
                : 'Permanently delete your profile, food diary, custom foods, weight history, hydration logs, and saved meals. This cannot be undone.'}
            </p>
          </div>
          {!deleteStepOpen && (
            <button
              type="button"
              onClick={() => setDeleteStepOpen(true)}
              className="min-h-[42px] px-4 rounded-xl border border-red-500/35 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-500/10 inline-flex items-center gap-1.5 shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {isGuest ? 'Erase Data' : 'Delete Account'}
            </button>
          )}
        </div>

        {deleteStepOpen && (
          <form onSubmit={handleConfirmDeleteAccount} className="space-y-3 pt-2 border-t border-red-500/15">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Type <span className="font-mono font-bold text-red-600 dark:text-red-400">DELETE</span> below to permanently erase your data:
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE"
              autoComplete="off"
              className="w-full max-w-xs h-11 px-3.5 rounded-xl border border-red-500/40 bg-stone-50 dark:bg-[#090A0C] text-sm font-mono text-slate-900 dark:text-white"
            />
            {deleteError && (
              <p className="text-xs font-medium text-red-600 dark:text-red-400">{deleteError}</p>
            )}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="submit"
                disabled={deletingAccount || deleteConfirmText.trim() !== 'DELETE'}
                className="min-h-[44px] px-5 rounded-xl bg-red-600 text-white text-xs font-bold disabled:opacity-45 hover:bg-red-700 transition-colors"
              >
                {deletingAccount ? 'Deleting...' : 'Permanently Delete'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteStepOpen(false);
                  setDeleteConfirmText('');
                  setDeleteError('');
                }}
                className="min-h-[44px] px-4 rounded-xl border border-black/10 dark:border-white/15 text-xs font-semibold text-slate-600 dark:text-slate-300"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
};
