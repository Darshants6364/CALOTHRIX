import React, { useEffect, useState } from 'react';
import {
  Check,
  Database,
  Download,
  LogOut,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import {
  ExternalSourceStatus,
  fetchExternalSourceStatus,
} from '../services/globalFoodApiService';
import {
  ActivityLevel,
  BiologicalSex,
  DietaryPreference,
  ENABLE_TRAINER_PORTAL,
  FitnessGoalType,
  FoodRestriction,
  WorkoutIntensity,
} from '../types';
import { convertDisplayWeightToKg, convertWeightToDisplay } from '../utils/nutritionUtils';

const RESTRICTION_OPTIONS: { id: FoodRestriction; label: string }[] = [
  { id: 'dairy_free', label: 'Dairy-free' },
  { id: 'gluten_free', label: 'Gluten-free' },
  { id: 'nut_free', label: 'Nut-free' },
];

export const ProfileSettingsPage: React.FC = () => {
  const {
    state,
    authUser,
    authDetails,
    updateProfile,
    updateSettings,
    exportData,
    signOut,
  } = useMacroLogStore();

  const { profile, settings } = state;

  const [name, setName] = useState(profile.name);
  const [age, setAge] = useState(String(profile.age));
  const [biologicalSex, setBiologicalSex] = useState<BiologicalSex>(
    profile.biologicalSex || 'male'
  );
  const [heightCm, setHeightCm] = useState(String(profile.heightCm));
  const [currentWeight, setCurrentWeight] = useState(
    String(convertWeightToDisplay(profile.currentWeightKg, settings.weightUnit))
  );
  const [targetWeight, setTargetWeight] = useState(
    String(convertWeightToDisplay(profile.targetWeightKg, settings.weightUnit))
  );
  const [dailySteps, setDailySteps] = useState(String(profile.dailyAverageSteps || 7000));
  const [workoutFrequency, setWorkoutFrequency] = useState(
    String(profile.workoutFrequencyPerWeek ?? 3)
  );
  const [workoutIntensity, setWorkoutIntensity] = useState<WorkoutIntensity>(
    profile.workoutIntensity || 'moderate'
  );
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>(profile.activityLevel);
  const [fitnessGoal, setFitnessGoal] = useState<FitnessGoalType>(profile.fitnessGoal);
  const [dietaryPreference, setDietaryPreference] = useState<DietaryPreference>(
    profile.dietaryPreference || 'omnivore'
  );
  const [foodRestrictions, setFoodRestrictions] = useState<FoodRestriction[]>(
    profile.foodRestrictions || []
  );

  const [sourceStatus, setSourceStatus] = useState<ExternalSourceStatus | null>(null);

  useEffect(() => {
    setName(profile.name);
    setAge(String(profile.age));
    setBiologicalSex(profile.biologicalSex || 'male');
    setHeightCm(String(profile.heightCm));
    setCurrentWeight(
      String(convertWeightToDisplay(profile.currentWeightKg, settings.weightUnit))
    );
    setTargetWeight(
      String(convertWeightToDisplay(profile.targetWeightKg, settings.weightUnit))
    );
    setDailySteps(String(profile.dailyAverageSteps || 7000));
    setWorkoutFrequency(String(profile.workoutFrequencyPerWeek ?? 3));
    setWorkoutIntensity(profile.workoutIntensity || 'moderate');
    setActivityLevel(profile.activityLevel);
    setFitnessGoal(profile.fitnessGoal);
    setDietaryPreference(profile.dietaryPreference || 'omnivore');
    setFoodRestrictions(profile.foodRestrictions || []);
  }, [profile, settings.weightUnit]);

  useEffect(() => {
    let mounted = true;
    void fetchExternalSourceStatus().then((status) => {
      if (mounted && status) setSourceStatus(status);
    });
    return () => {
      mounted = false;
    };
  }, []);

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
      dietaryPreference,
      foodRestrictions,
    });
  };

  const displayAvatar = profile.avatarUrl || authDetails?.avatarUrl;
  const providerLabel =
    authDetails?.provider === 'google'
      ? 'Google Account'
      : authDetails?.provider === 'email'
      ? 'Email & Password'
      : authDetails?.provider || 'Supabase Auth';

  const lastSignInFormatted = authUser?.last_sign_in_at
    ? new Date(authUser.last_sign_in_at).toLocaleString()
    : null;

  return (
    <div className="space-y-6 max-w-4xl">
      <section>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Your login details, body profile, dietary preferences, theme, and database exports
        </p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Profile & Settings
        </h1>
      </section>

      {/* Account & Login Details Card */}
      <section className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            {displayAvatar ? (
              <img
                src={displayAvatar}
                alt={profile.name}
                referrerPolicy="no-referrer"
                className="w-16 h-16 rounded-full object-cover border border-stone-200 dark:border-slate-700 shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-lime-100 dark:bg-lime-950 text-lime-800 dark:text-lime-300 font-bold text-xl flex items-center justify-center shrink-0">
                {profile.name.slice(0, 2).toUpperCase()}
              </div>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {authDetails?.name || profile.name}
                </h2>
                <ShieldCheck className="w-4 h-4 text-lime-600 dark:text-lime-400 shrink-0" />
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 truncate">
                {authDetails?.email || profile.email}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                <span>Signed in via {providerLabel}</span>
                {lastSignInFormatted && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Last sign-in: {lastSignInFormatted}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void signOut()}
            className="min-h-[42px] px-4 rounded-xl border border-stone-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-red-600 dark:hover:text-red-400 hover:bg-stone-50 dark:hover:bg-slate-800 inline-flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>

        {authUser && (
          <div className="mt-4 pt-4 border-t border-stone-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-slate-400 block">Account ID</span>
              <span className="font-mono-nums text-slate-700 dark:text-slate-300 break-all">
                {authUser.id}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Account Role</span>
              <span className="font-semibold capitalize text-slate-800 dark:text-slate-200">
                {profile.accountRole || 'individual'}
                {!ENABLE_TRAINER_PORTAL ? ' (Personal Mode)' : ''}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Saved Food Entries</span>
              <span className="font-mono-nums font-semibold text-slate-800 dark:text-slate-200">
                {state.foodEntries.length}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block">Saved Weight Entries</span>
              <span className="font-mono-nums font-semibold text-slate-800 dark:text-slate-200">
                {state.weightEntries.length}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* Profile Form */}
      <form
        onSubmit={handleSaveProfile}
        className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5"
      >
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Body, Fitness & Dietary Profile
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
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Biological Sex (BMR Calculation)
            </label>
            <select
              value={biologicalSex}
              onChange={(e) => setBiologicalSex(e.target.value as BiologicalSex)}
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
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
              min="0"
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
              min="0"
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
              min="0"
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
              min="0"
              step="0.05"
              value={targetWeight}
              onChange={(e) => setTargetWeight(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm font-mono-nums text-slate-900 dark:text-slate-100"
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
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm font-mono-nums text-slate-900 dark:text-slate-100"
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
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm font-mono-nums text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Workout Intensity
            </label>
            <select
              value={workoutIntensity}
              onChange={(e) => setWorkoutIntensity(e.target.value as WorkoutIntensity)}
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
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
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
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
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
            >
              <option value="fat_loss">Fat Loss</option>
              <option value="maintenance">Maintenance</option>
              <option value="muscle_gain">Muscle Gain</option>
              <option value="recomposition">Body Recomposition</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Dietary Preference (for Smart Suggestions)
            </label>
            <select
              value={dietaryPreference}
              onChange={(e) => setDietaryPreference(e.target.value as DietaryPreference)}
              className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
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
                  className={`min-h-[38px] px-3.5 rounded-xl border text-xs font-medium transition-colors ${
                    active
                      ? 'bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 border-slate-900 dark:border-lime-500 font-semibold'
                      : 'border-stone-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-800'
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

      {/* Global Food Sources & Backend Status */}
      {sourceStatus && (
        <section className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-3">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Database className="w-4 h-4 text-lime-600 dark:text-lime-400" />
            Global Food Sources & AI Integrations
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-slate-900 border border-stone-200/70 dark:border-slate-800">
              <div className="font-semibold text-slate-800 dark:text-slate-200">
                ICMR-NIN IFCT 2017 & Reference Catalog
              </div>
              <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                Active · {sourceStatus.ifct2017.count} Indian & global staple foods
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-slate-900 border border-stone-200/70 dark:border-slate-800">
              <div className="font-semibold text-slate-800 dark:text-slate-200">
                Open Food Facts API {sourceStatus.openFoodFacts.apiVersion}
              </div>
              <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                Active · Branded products & barcode lookup ({sourceStatus.openFoodFacts.license})
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-slate-900 border border-stone-200/70 dark:border-slate-800">
              <div className="font-semibold text-slate-800 dark:text-slate-200">
                USDA FoodData Central API
              </div>
              <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                {sourceStatus.usdaFdc.configured
                  ? 'Configured & Active (Backend API key loaded)'
                  : `Using reference fallback · Set ${sourceStatus.usdaFdc.envVar} on server for full live catalog`}
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-stone-50 dark:bg-slate-900 border border-stone-200/70 dark:border-slate-800">
              <div className="font-semibold text-slate-800 dark:text-slate-200">
                Supabase AI & Deterministic Engine
              </div>
              <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                Semantic search & weekly summary active with deterministic fallback
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Export My Data */}
      <section className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Export Your Data
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Download your personal food logs, custom foods, and weight history from the database.
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
        </div>
      </section>
    </div>
  );
};
