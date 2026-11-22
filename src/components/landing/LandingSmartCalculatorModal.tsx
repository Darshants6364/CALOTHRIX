import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Calculator,
  Check,
  ChevronDown,
  ChevronUp,
  Droplets,
  Dumbbell,
  Info,
  Scale,
  ShieldAlert,
  Target,
  X,
} from 'lucide-react';
import type {
  ActivityLevel,
  BiologicalSex,
  GoalSpeed,
  MacroFocusType,
  SmartFitnessGoalType,
  WorkoutIntensity,
} from '../../types';
import {
  ACTIVITY_MULTIPLIERS,
  calculateSmartFitnessTargets,
  ClimateLevel,
  GOAL_SPEED_CONFIG,
  MACRO_FOCUS_META,
  SMART_FITNESS_GOAL_META,
  SweatRateLevel,
  validateCalculatorInput,
} from '../../utils/fitnessCalculator';

interface LandingSmartCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGetStarted: () => void;
  onTryGuest?: () => void;
}

const ORDERED_GOALS: SmartFitnessGoalType[] = [
  'build_muscle',
  'fat_gain',
  'lose_weight',
  'recomposition',
  'maintain_weight',
];

const ORDERED_MACRO_FOCUS: MacroFocusType[] = [
  'balanced',
  'high_protein',
  'lower_carb',
  'athletic',
];

export const LandingSmartCalculatorModal: React.FC<LandingSmartCalculatorModalProps> = ({
  isOpen,
  onClose,
  onGetStarted,
  onTryGuest,
}) => {
  const [age, setAge] = useState('26');
  const [biologicalSex, setBiologicalSex] = useState<BiologicalSex>('male');
  const [heightCm, setHeightCm] = useState('174');
  const [currentWeightKg, setCurrentWeightKg] = useState('72');
  const [targetWeightKg, setTargetWeightKg] = useState('68');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');
  const [dailyAverageSteps, setDailyAverageSteps] = useState('8000');
  const [workoutFrequency, setWorkoutFrequency] = useState('4');
  const [workoutIntensity, setWorkoutIntensity] = useState<WorkoutIntensity>('moderate');
  const [avgWorkoutDurationMin, setAvgWorkoutDurationMin] = useState('45');
  const [sweatRateLevel, setSweatRateLevel] = useState<SweatRateLevel>('moderate');
  const [climateLevel, setClimateLevel] = useState<ClimateLevel>('temperate');
  const [doesResistanceTraining, setDoesResistanceTraining] = useState(true);
  const [fitnessGoal, setFitnessGoal] = useState<SmartFitnessGoalType>('lose_weight');
  const [goalSpeed, setGoalSpeed] = useState<GoalSpeed>('moderate');
  const [macroFocus, setMacroFocus] = useState<MacroFocusType>('high_protein');
  const [bodyFatPct, setBodyFatPct] = useState('');
  const [isPregnantOrBreastfeeding, setIsPregnantOrBreastfeeding] = useState(false);
  const [showOptional, setShowOptional] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  const validation = useMemo(
    () =>
      validateCalculatorInput({
        age: Number(age),
        biologicalSex,
        heightCm: Number(heightCm),
        currentWeightKg: Number(currentWeightKg),
        targetWeightKg: Number(targetWeightKg) || Number(currentWeightKg),
        dailyAverageSteps: Number(dailyAverageSteps),
        activityLevel,
        workoutFrequencyPerWeek: Number(workoutFrequency),
        workoutIntensity,
        avgWorkoutDurationMin: Number(avgWorkoutDurationMin),
        sweatRateLevel,
        climateLevel,
        doesResistanceTraining,
        fitnessGoal,
        goalSpeed,
        macroFocus,
        bodyFatPct: bodyFatPct.trim() === '' ? null : Number(bodyFatPct),
        isPregnantOrBreastfeeding,
      }),
    [
      age,
      biologicalSex,
      heightCm,
      currentWeightKg,
      targetWeightKg,
      dailyAverageSteps,
      activityLevel,
      workoutFrequency,
      workoutIntensity,
      avgWorkoutDurationMin,
      sweatRateLevel,
      climateLevel,
      doesResistanceTraining,
      fitnessGoal,
      goalSpeed,
      macroFocus,
      bodyFatPct,
      isPregnantOrBreastfeeding,
    ]
  );

  const calculation = useMemo(() => {
    if (!validation.valid || !validation.sanitized) return null;
    return calculateSmartFitnessTargets(validation.sanitized);
  }, [validation]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="smart-calculator-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-5xl max-h-[94svh] sm:max-h-[90svh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-white/15 bg-[#090A0C] text-[#F4F3EF] shadow-2xl">
        {/* Sticky Modal Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 bg-[#090A0C]/95 backdrop-blur-md border-b border-white/10">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.14em] text-[#C8FF00]">
              <Calculator className="w-3.5 h-3.5 shrink-0" />
              <span>Scientific Nutrition Engine</span>
            </div>
            <h2
              id="smart-calculator-modal-title"
              className="text-base sm:text-lg font-bold tracking-tight text-white truncate"
            >
              Smart Calorie Calculator
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Smart Calorie Calculator"
            className="w-10 h-10 rounded-xl border border-white/15 bg-white/[0.04] hover:bg-white/10 text-zinc-200 flex items-center justify-center shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* LEFT: One Unified Input Box */}
            <div className="lg:col-span-7 rounded-2xl border border-white/10 bg-[#111317] p-4 sm:p-5 space-y-5 min-w-0">
              {/* Body Measurements */}
              <div className="space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-zinc-200">
                    <Scale className="w-4 h-4 text-[#C8FF00]" />
                    <span>Body Measurements</span>
                  </div>
                  <span className="text-[11px] text-zinc-400">Metric (cm · kg)</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <label className="block space-y-1">
                    <span className="text-[11px] font-medium text-zinc-400">Age (14–100)</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={14}
                      max={100}
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-white/12 bg-[#090A0C] text-sm font-mono-nums tabular-nums text-white focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
                    />
                  </label>

                  <div className="space-y-1">
                    <span className="text-[11px] font-medium text-zinc-400 block">Biological Sex</span>
                    <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#090A0C] border border-white/10 min-h-[44px]">
                      {(['male', 'female'] as const).map((sex) => (
                        <button
                          key={sex}
                          type="button"
                          onClick={() => setBiologicalSex(sex)}
                          className={`rounded-lg text-xs font-semibold capitalize transition cursor-pointer ${
                            biologicalSex === sex
                              ? 'bg-[#C8FF00] text-[#090A0C]'
                              : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          {sex}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="block space-y-1 col-span-2 sm:col-span-1">
                    <span className="text-[11px] font-medium text-zinc-400">Height (cm)</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={120}
                      max={240}
                      value={heightCm}
                      onChange={(e) => setHeightCm(e.target.value)}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-white/12 bg-[#090A0C] text-sm font-mono-nums tabular-nums text-white focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[11px] font-medium text-zinc-400">Current Weight (kg)</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      value={currentWeightKg}
                      onChange={(e) => setCurrentWeightKg(e.target.value)}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-white/12 bg-[#090A0C] text-sm font-mono-nums tabular-nums text-white focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[11px] font-medium text-zinc-400">Target Weight (kg)</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.1"
                      value={targetWeightKg}
                      onChange={(e) => setTargetWeightKg(e.target.value)}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-white/12 bg-[#090A0C] text-sm font-mono-nums tabular-nums text-white focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => setShowOptional((v) => !v)}
                    className="col-span-2 sm:col-span-1 self-end min-h-[44px] px-3 rounded-xl border border-dashed border-white/15 text-xs font-semibold text-zinc-300 hover:bg-white/5 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>{showOptional ? 'Hide Optional' : 'Optional BF% / Sweat / Safety'}</span>
                    {showOptional ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {showOptional && (
                  <div className="pt-2.5 border-t border-white/8 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="block space-y-1">
                        <span className="text-[11px] font-medium text-zinc-400">
                          Body-Fat % (Optional · enables Katch-McArdle for 18+)
                        </span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={4}
                          max={60}
                          step="0.5"
                          placeholder="Leave blank for standard equation"
                          value={bodyFatPct}
                          onChange={(e) => setBodyFatPct(e.target.value)}
                          className="w-full min-h-[44px] px-3 rounded-xl border border-white/12 bg-[#090A0C] text-sm font-mono-nums tabular-nums text-white focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
                        />
                      </label>
                      <label className="flex items-center gap-3 min-h-[44px] px-3 py-2 rounded-xl border border-white/12 bg-[#090A0C] cursor-pointer self-end">
                        <input
                          type="checkbox"
                          checked={isPregnantOrBreastfeeding}
                          onChange={(e) => setIsPregnantOrBreastfeeding(e.target.checked)}
                          className="w-4 h-4 accent-[#C8FF00]"
                        />
                        <span className="text-xs text-zinc-300 leading-tight">
                          Pregnant or breastfeeding (excludes automated deficits/prescriptions)
                        </span>
                      </label>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <label className="block space-y-1">
                        <span className="text-[11px] font-medium text-zinc-400">Workout Duration (min)</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={240}
                          step={5}
                          value={avgWorkoutDurationMin}
                          onChange={(e) => setAvgWorkoutDurationMin(e.target.value)}
                          className="w-full min-h-[44px] px-3 rounded-xl border border-white/12 bg-[#090A0C] text-sm font-mono-nums tabular-nums text-white focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
                        />
                      </label>
                      <div className="space-y-1">
                        <span className="text-[11px] font-medium text-zinc-400 block">Sweat Rate</span>
                        <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#090A0C] border border-white/10 min-h-[44px]">
                          {(['low', 'moderate', 'high'] as const).map((level) => (
                            <button
                              key={level}
                              type="button"
                              onClick={() => setSweatRateLevel(level)}
                              className={`rounded-lg text-[11px] font-semibold capitalize transition cursor-pointer ${
                                sweatRateLevel === level
                                  ? 'bg-[#C8FF00] text-[#090A0C]'
                                  : 'text-zinc-400 hover:text-white'
                              }`}
                            >
                              {level}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[11px] font-medium text-zinc-400 block">Climate</span>
                        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#090A0C] border border-white/10 min-h-[44px]">
                          {[
                            { id: 'temperate' as const, label: 'Mild' },
                            { id: 'warm_humid' as const, label: 'Hot/Humid' },
                          ].map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => setClimateLevel(opt.id)}
                              className={`rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                                climateLevel === opt.id
                                  ? 'bg-[#C8FF00] text-[#090A0C]'
                                  : 'text-zinc-400 hover:text-white'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Activity & Training */}
              <div className="pt-4 border-t border-white/10 space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-zinc-200">
                    <Activity className="w-4 h-4 text-[#C8FF00]" />
                    <span>Activity &amp; Training</span>
                  </div>
                  {calculation && (
                    <span className="text-[11px] font-mono-nums tabular-nums text-zinc-400">
                      Custom PAL Est. ×{calculation.activityMultiplier.toFixed(2)} (Std. ×
                      {calculation.activityBreakdown.conventionalTierMultiplier})
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                  {(Object.keys(ACTIVITY_MULTIPLIERS) as ActivityLevel[]).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setActivityLevel(level)}
                      className={`min-h-[44px] px-2.5 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer text-center ${
                        activityLevel === level
                          ? 'border-[#C8FF00] bg-[#C8FF00]/15 text-[#C8FF00]'
                          : 'border-white/10 text-zinc-300 hover:bg-white/5'
                      }`}
                    >
                      {ACTIVITY_MULTIPLIERS[level].shortLabel}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <label className="block space-y-1">
                    <span className="text-[11px] font-medium text-zinc-400">Avg Daily Steps</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={50000}
                      step={500}
                      value={dailyAverageSteps}
                      onChange={(e) => setDailyAverageSteps(e.target.value)}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-white/12 bg-[#090A0C] text-sm font-mono-nums tabular-nums text-white focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
                    />
                  </label>

                  <label className="block space-y-1">
                    <span className="text-[11px] font-medium text-zinc-400">Workouts / Week</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={14}
                      value={workoutFrequency}
                      onChange={(e) => {
                        setWorkoutFrequency(e.target.value);
                        if (Number(e.target.value) === 0) setDoesResistanceTraining(false);
                      }}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-white/12 bg-[#090A0C] text-sm font-mono-nums tabular-nums text-white focus:outline-none focus:ring-2 focus:ring-[#C8FF00]"
                    />
                  </label>

                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <span className="text-[11px] font-medium text-zinc-400 block">Workout Intensity</span>
                    <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#090A0C] border border-white/10 min-h-[44px]">
                      {(['light', 'moderate', 'vigorous'] as const).map((intensity) => (
                        <button
                          key={intensity}
                          type="button"
                          onClick={() => setWorkoutIntensity(intensity)}
                          className={`rounded-lg text-[11px] font-semibold capitalize transition cursor-pointer ${
                            workoutIntensity === intensity
                              ? 'bg-[#C8FF00] text-[#090A0C]'
                              : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          {intensity}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  Custom calibrated estimate (65% tier + 35% steps/workouts) — avoids double-counting exercise, steps, or TEF.
                </p>
              </div>

              {/* Goal Strategy, Pace & Macro Preference */}
              <div className="pt-4 border-t border-white/10 space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-zinc-200">
                  <Target className="w-4 h-4 text-[#C8FF00]" />
                  <span>Goal Strategy, Pace &amp; Macro Preference</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ORDERED_GOALS.map((g) => {
                    const meta = SMART_FITNESS_GOAL_META[g];
                    const selected = fitnessGoal === g;
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setFitnessGoal(g)}
                        className={`min-h-[50px] p-3 rounded-xl border text-left transition cursor-pointer ${
                          selected
                            ? 'border-[#C8FF00] bg-[#C8FF00]/12 text-white'
                            : 'border-white/10 bg-white/[0.02] text-zinc-200 hover:bg-white/[0.05]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs sm:text-sm font-bold">{meta.label}</span>
                          {selected && <Check className="w-4 h-4 text-[#C8FF00] shrink-0" />}
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug">{meta.summary}</p>
                      </button>
                    );
                  })}
                </div>

                {fitnessGoal === 'build_muscle' && (
                  <label className="flex items-center gap-3 min-h-[44px] px-3 py-2.5 rounded-xl border border-white/12 bg-[#090A0C] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={doesResistanceTraining}
                      onChange={(e) => setDoesResistanceTraining(e.target.checked)}
                      className="w-4 h-4 accent-[#C8FF00]"
                    />
                    <span className="text-xs text-zinc-300 leading-snug">
                      I do progressive resistance / strength training (2–4+ sessions/week recommended for muscle gain)
                    </span>
                  </label>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {fitnessGoal !== 'maintain_weight' && (
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-medium text-zinc-400">Preferred Pace</span>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(['slow', 'moderate', 'aggressive'] as const).map((speed) => (
                          <button
                            key={speed}
                            type="button"
                            onClick={() => setGoalSpeed(speed)}
                            className={`min-h-[44px] px-2 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                              goalSpeed === speed
                                ? 'border-[#C8FF00] bg-[#C8FF00]/15 text-[#C8FF00]'
                                : 'border-white/10 text-zinc-300'
                            }`}
                          >
                            {speed === 'slow' ? 'Slow' : speed === 'moderate' ? 'Moderate' : 'Faster'}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-zinc-500">{GOAL_SPEED_CONFIG[goalSpeed].description}</p>
                    </div>
                  )}

                  <div className={`space-y-1.5 ${fitnessGoal === 'maintain_weight' ? 'sm:col-span-2' : ''}`}>
                    <span className="text-[11px] font-medium text-zinc-400">Macro Preference</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {ORDERED_MACRO_FOCUS.map((focus) => (
                        <button
                          key={focus}
                          type="button"
                          onClick={() => setMacroFocus(focus)}
                          className={`min-h-[44px] px-2.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                            macroFocus === focus
                              ? 'border-[#C8FF00] bg-[#C8FF00]/15 text-[#C8FF00]'
                              : 'border-white/10 text-zinc-300'
                          }`}
                        >
                          {MACRO_FOCUS_META[focus].shortLabel}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT: Live Results & Transparency */}
            <div className="lg:col-span-5 space-y-4 min-w-0">
              {!validation.valid || !calculation ? (
                <div className="rounded-2xl border border-red-500/35 bg-red-500/10 p-5 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase text-red-300">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Check Your Inputs</span>
                  </div>
                  <ul className="space-y-1 text-xs text-red-200">
                    {validation.errors.map((err, i) => (
                      <li key={i}>• {err}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-[#111317] p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-400">
                        Estimated Daily Target
                      </div>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-4xl font-extrabold tracking-tight font-mono-nums tabular-nums text-[#C8FF00]">
                          {calculation.recommendedCalories.toLocaleString()}
                        </span>
                        <span className="text-sm font-semibold text-zinc-400">kcal/day</span>
                      </div>
                      <div className="mt-1 text-xs text-zinc-300 font-mono-nums tabular-nums">
                        Maint. {calculation.activeMaintenanceKcal.toLocaleString()} kcal ·{' '}
                        {calculation.calorieDelta > 0
                          ? `+${calculation.calorieDelta} kcal (+${calculation.actualCalorieDeltaPct.toFixed(1)}%)`
                          : calculation.calorieDelta < 0
                          ? `${calculation.calorieDelta} kcal (${calculation.actualCalorieDeltaPct.toFixed(1)}%)`
                          : '0 kcal (0%)'}{' '}
                        · {SMART_FITNESS_GOAL_META[calculation.normalizedGoal].label}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[11px] text-zinc-400">
                        {calculation.bmiBasis === 'pediatric_cdc_percentile'
                          ? 'BMI-for-Age'
                          : 'BMI Screening'}
                      </div>
                      <div className="text-base font-bold font-mono-nums tabular-nums text-white">
                        {calculation.bmi}
                      </div>
                      <div className="text-[11px] font-medium text-zinc-300">
                        {calculation.bodyStatusLabel}
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-zinc-400 leading-snug -mt-1">
                    {calculation.bmiDisclaimer}
                  </p>

                  {calculation.safetyNote && (
                    <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 flex items-start gap-2 text-xs text-amber-200 leading-relaxed">
                      <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-300" />
                      <span>{calculation.safetyNote}</span>
                    </div>
                  )}

                  {calculation.resistanceTrainingNote && (
                    <div className="rounded-xl border border-sky-500/35 bg-sky-500/10 p-3 flex items-start gap-2 text-xs text-sky-200 leading-relaxed">
                      <Dumbbell className="w-4 h-4 shrink-0 mt-0.5 text-sky-300" />
                      <span>{calculation.resistanceTrainingNote}</span>
                    </div>
                  )}

                  {/* BMR & TDEE */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="rounded-xl bg-[#090A0C] border border-white/8 p-3">
                      <div className="text-[11px] text-zinc-400">Resting Burn (BMR)</div>
                      <div className="mt-0.5 text-base font-bold font-mono-nums tabular-nums text-white">
                        {calculation.bmr.toLocaleString()} kcal
                      </div>
                      <div className="text-[10px] text-zinc-400">
                        {calculation.bmrEquation === 'katch_mcardle'
                          ? 'Katch-McArdle (BF%)'
                          : calculation.bmrEquation === 'schofield_adolescent'
                          ? 'Schofield (14–17 y)'
                          : 'Mifflin-St Jeor'}
                      </div>
                    </div>
                    <div className="rounded-xl bg-[#090A0C] border border-white/8 p-3">
                      <div className="text-[11px] text-zinc-400">Est. Maintenance (TDEE)</div>
                      <div className="mt-0.5 text-base font-bold font-mono-nums tabular-nums text-white">
                        {calculation.estimatedTdeeKcal.toLocaleString()} kcal
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono-nums tabular-nums">
                        Custom PAL Est. ×{calculation.activityMultiplier.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* Macros */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-[#090A0C] border border-white/8 p-3">
                      <div className="text-[11px] text-zinc-400">Protein</div>
                      <div className="text-lg font-extrabold font-mono-nums tabular-nums text-white">
                        {calculation.proteinGrams}g
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono-nums">
                        {calculation.proteinPct}% · {calculation.proteinPerKgUsed}g/kg
                      </div>
                    </div>
                    <div className="rounded-xl bg-[#090A0C] border border-white/8 p-3">
                      <div className="text-[11px] text-zinc-400">Carbs</div>
                      <div className="text-lg font-extrabold font-mono-nums tabular-nums text-white">
                        {calculation.carbsGrams}g
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono-nums">
                        {calculation.carbsPct}%
                      </div>
                    </div>
                    <div className="rounded-xl bg-[#090A0C] border border-white/8 p-3">
                      <div className="text-[11px] text-zinc-400">Fat</div>
                      <div className="text-lg font-extrabold font-mono-nums tabular-nums text-white">
                        {calculation.fatGrams}g
                      </div>
                      <div className="text-[10px] text-zinc-400 font-mono-nums">
                        {calculation.fatPct}%
                      </div>
                    </div>
                  </div>

                  {/* Fibre, Hydration & Timeline */}
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-xl bg-[#090A0C] border border-white/8 p-2.5">
                      <div className="text-[10px] text-zinc-400">Fibre (Est.)</div>
                      <div className="mt-0.5 font-bold font-mono-nums text-white">
                        ~{calculation.fibreGrams} g/day
                      </div>
                    </div>
                    <div className="rounded-xl bg-[#090A0C] border border-white/8 p-2.5">
                      <div className="text-[10px] text-zinc-400 flex items-center gap-1">
                        <Droplets className="w-3 h-3 text-sky-400 shrink-0" />
                        Hydration (Est.)
                      </div>
                      <div className="mt-0.5 font-bold font-mono-nums text-white">
                        {(calculation.recommendedWaterMl / 1000).toFixed(2).replace(/\.?0+$/, '')} L/day
                      </div>
                    </div>
                    <div className="rounded-xl bg-[#090A0C] border border-white/8 p-2.5">
                      <div className="text-[10px] text-zinc-400">Est. Timeline</div>
                      <div className="mt-0.5 font-bold font-mono-nums text-white truncate">
                        {calculation.estimatedWeeksRange
                          ? `~${calculation.estimatedWeeksRange.min}–${calculation.estimatedWeeksRange.max} wks`
                          : calculation.adultPrescriptionBlocked
                          ? 'Safety mode'
                          : 'Steady'}
                      </div>
                    </div>
                  </div>

                  <p className="text-[11px] text-zinc-500 leading-snug">
                    {calculation.timelineDisclaimer} {calculation.hydrationDisclaimer}
                  </p>

                  {/* Expandable Formula Breakdown */}
                  <div className="rounded-xl border border-white/10 bg-[#090A0C] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowBreakdown((v) => !v)}
                      className="w-full min-h-[42px] px-3 py-2 flex items-center justify-between gap-2 text-xs font-semibold text-zinc-300 hover:bg-white/[0.03] cursor-pointer"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-[#C8FF00]" />
                        <span>Calculation transparency (exact internal values)</span>
                      </span>
                      {showBreakdown ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    {showBreakdown && (
                      <dl className="border-t border-white/10 p-3 space-y-2 text-[11px] text-zinc-300 leading-relaxed">
                        {[
                          { label: 'BMR', text: calculation.calculationBreakdown.bmr },
                          { label: 'Activity', text: calculation.calculationBreakdown.activity },
                          { label: 'TDEE', text: calculation.calculationBreakdown.tdee },
                          { label: 'Strategy', text: calculation.calculationBreakdown.calorieStrategy },
                          { label: 'Macros', text: calculation.calculationBreakdown.macros },
                          { label: 'Fibre & Water', text: calculation.calculationBreakdown.fibreAndHydration },
                          { label: 'Timeline', text: calculation.calculationBreakdown.timeline },
                        ].map((row) => (
                          <div key={row.label}>
                            <dt className="font-bold text-zinc-100">{row.label}:</dt>
                            <dd className="text-zinc-400">{row.text}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>

                  {/* Action CTAs */}
                  <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onGetStarted();
                      }}
                      className="flex-1 min-h-[46px] px-4 rounded-xl bg-[#C8FF00] text-[#090A0C] text-xs sm:text-sm font-bold hover:brightness-95 transition inline-flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>Save Plan &amp; Track Free</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    {onTryGuest && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onTryGuest();
                        }}
                        className="min-h-[46px] px-4 rounded-xl border border-white/20 text-white text-xs sm:text-sm font-semibold hover:bg-white/10 transition cursor-pointer"
                      >
                        Try Guest Mode
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
