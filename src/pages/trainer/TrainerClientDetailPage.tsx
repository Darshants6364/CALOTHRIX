import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Calculator,
  Calendar,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Lock,
  MessageSquarePlus,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useMacroLogStore } from '../../hooks/useMacroLogStore';
import {
  computeTodayStatsForClient,
  useTrainerDashboard,
} from '../../hooks/useTrainerDashboard';
import {
  addTrainerNote,
  createTargetRecommendation,
  deleteTrainerNote,
  fetchTargetRecommendationsForTrainer,
  fetchTrainerClientPlan,
  fetchTrainerNotesForClient,
  reviewClientCheckin,
  trainerUpdateClientGoals,
  upsertTrainerClientPlan,
} from '../../services/trainerService';
import {
  FitnessGoalType,
  GoalSpeed,
  MEAL_CATEGORIES,
  MealCategory,
  MealGuidelineItem,
  TargetRecommendation,
  TrainerClientPlan,
  TrainerNote,
} from '../../types';
import { addDaysToDateKey, getTodayDateKey } from '../../utils/dateUtils';
import { calculateSmartFitnessTargets } from '../../utils/fitnessCalculator';

type DateRangePreset = '7d' | '30d' | '90d' | 'custom';

const COACH_GOAL_PRESETS: {
  id: string;
  label: string;
  fitnessGoal: FitnessGoalType;
  goalSpeed: GoalSpeed;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
}[] = [
  { id: 'fat_loss', label: 'Steady Cut', fitnessGoal: 'fat_loss', goalSpeed: 'moderate', calories: 1900, protein: 155, carbs: 185, fat: 58, fibre: 30 },
  { id: 'high_pro_cut', label: 'High-Protein Cut', fitnessGoal: 'fat_loss', goalSpeed: 'aggressive', calories: 1750, protein: 170, carbs: 145, fat: 54, fibre: 28 },
  { id: 'recomp', label: 'Body Recomp', fitnessGoal: 'recomposition', goalSpeed: 'moderate', calories: 2250, protein: 165, carbs: 245, fat: 66, fibre: 32 },
  { id: 'maintenance', label: 'Balanced Maintain', fitnessGoal: 'maintenance', goalSpeed: 'moderate', calories: 2400, protein: 145, carbs: 295, fat: 70, fibre: 34 },
  { id: 'lean_bulk', label: 'Lean Muscle Gain', fitnessGoal: 'muscle_gain', goalSpeed: 'slow', calories: 2750, protein: 170, carbs: 355, fat: 72, fibre: 36 },
  { id: 'athletic', label: 'Athletic Fuel', fitnessGoal: 'muscle_gain', goalSpeed: 'moderate', calories: 3050, protein: 185, carbs: 410, fat: 76, fibre: 38 },
  { id: 'low_carb', label: 'Lower-Carb Cut', fitnessGoal: 'fat_loss', goalSpeed: 'moderate', calories: 1850, protein: 160, carbs: 120, fat: 80, fibre: 28 },
  { id: 'high_fibre', label: 'Metabolic Wellness', fitnessGoal: 'maintenance', goalSpeed: 'slow', calories: 2150, protein: 130, carbs: 260, fat: 65, fibre: 38 },
];

const DEFAULT_MEAL_GUIDELINES: MealGuidelineItem[] = [
  { mealType: 'breakfast', targetCalories: 500, targetProtein: 35, guidance: 'Protein-rich morning meal + fibre' },
  { mealType: 'lunch', targetCalories: 700, targetProtein: 45, guidance: 'Balanced lean protein, whole grains & vegetables' },
  { mealType: 'evening_snacks', targetCalories: 300, targetProtein: 25, guidance: 'Light high-protein snack or fruit' },
  { mealType: 'dinner', targetCalories: 550, targetProtein: 40, guidance: 'Moderate carbs, lean protein & cooked greens' },
];

export const TrainerClientDetailPage: React.FC = () => {
  const { authUser, selectedTrainerClientId, setTrainerTab, notify } = useMacroLogStore();
  const { clients, checkins, refreshAll } = useTrainerDashboard();

  const snapshot = useMemo(
    () => clients.find((c) => c.relationship.clientId === selectedTrainerClientId),
    [clients, selectedTrainerClientId]
  );

  const today = getTodayDateKey();
  const [rangePreset, setRangePreset] = useState<DateRangePreset>('30d');
  const [customStart, setCustomStart] = useState(addDaysToDateKey(today, -29));
  const [customEnd, setCustomEnd] = useState(today);

  const [notes, setNotes] = useState<TrainerNote[]>([]);
  const [noteCategory, setNoteCategory] = useState<TrainerNote['category']>('nutrition');
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const [recommendations, setRecommendations] = useState<TargetRecommendation[]>([]);
  const [recCalories, setRecCalories] = useState('');
  const [recProtein, setRecProtein] = useState('');
  const [recCarbs, setRecCarbs] = useState('');
  const [recFat, setRecFat] = useState('');
  const [recFibre, setRecFibre] = useState('30');
  const [recTargetWeight, setRecTargetWeight] = useState('');
  const [recFitnessGoal, setRecFitnessGoal] = useState<FitnessGoalType>('fat_loss');
  const [recGoalSpeed, setRecGoalSpeed] = useState<GoalSpeed>('moderate');
  const [recPreset, setRecPreset] = useState<string>('custom');
  const [recRationale, setRecRationale] = useState('');
  const [sendingRec, setSendingRec] = useState(false);
  const [applyingDirect, setApplyingDirect] = useState(false);
  const [goalActionError, setGoalActionError] = useState<string | null>(null);

  // Structured Coach Blueprint Plan state
  const [clientPlan, setClientPlan] = useState<TrainerClientPlan | null>(null);
  const [phaseTitle, setPhaseTitle] = useState('4-Week Metabolic Consistency Phase');
  const [coachSummary, setCoachSummary] = useState('');
  const [planWaterMl, setPlanWaterMl] = useState('2750');
  const [planStepsTarget, setPlanStepsTarget] = useState('8500');
  const [mealGuidelines, setMealGuidelines] = useState<MealGuidelineItem[]>(DEFAULT_MEAL_GUIDELINES);
  const [actionItemsText, setActionItemsText] = useState(
    'Hit protein target before dinner\nLog all cooking oils & snacks\nWalk 20 minutes after lunch'
  );
  const [savingPlan, setSavingPlan] = useState(false);

  const [feedbackMap, setFeedbackMap] = useState<Record<string, string>>({});

  const loadCoachingRecords = useCallback(async () => {
    if (!authUser || !selectedTrainerClientId) return;
    const [notesRes, recRes, planRes] = await Promise.all([
      fetchTrainerNotesForClient(authUser.id, selectedTrainerClientId),
      fetchTargetRecommendationsForTrainer(authUser.id, selectedTrainerClientId),
      fetchTrainerClientPlan(authUser.id, selectedTrainerClientId),
    ]);
    if (notesRes.ok && notesRes.data) setNotes(notesRes.data);
    if (recRes.ok && recRes.data) setRecommendations(recRes.data);
    if (planRes.ok && planRes.data) {
      setClientPlan(planRes.data);
      setPhaseTitle(planRes.data.phaseTitle);
      setCoachSummary(planRes.data.coachSummary);
      setPlanWaterMl(String(planRes.data.dailyWaterGoalMl));
      setPlanStepsTarget(String(planRes.data.dailyStepsTarget));
      if (planRes.data.mealGuidelines.length > 0) {
        setMealGuidelines(planRes.data.mealGuidelines);
      }
      if (planRes.data.actionItems.length > 0) {
        setActionItemsText(planRes.data.actionItems.join('\n'));
      }
    } else {
      setClientPlan(null);
    }
  }, [authUser, selectedTrainerClientId]);

  useEffect(() => {
    void loadCoachingRecords();
  }, [loadCoachingRecords]);

  useEffect(() => {
    if (!snapshot?.goals) return;
    setRecCalories(String(snapshot.goals.calories || 2000));
    setRecProtein(String(snapshot.goals.protein || 140));
    setRecCarbs(String(snapshot.goals.carbs || 220));
    setRecFat(String(snapshot.goals.fat || 60));
    setRecFibre(String(snapshot.goals.fibre || 30));
    setRecTargetWeight(
      snapshot.goals.targetWeightKg ? String(snapshot.goals.targetWeightKg) : ''
    );
    setRecPreset(snapshot.goals.preset || 'custom');
    if (snapshot.profile?.fitnessGoal) setRecFitnessGoal(snapshot.profile.fitnessGoal);
    if (snapshot.profile?.goalSpeed) setRecGoalSpeed(snapshot.profile.goalSpeed);
  }, [snapshot?.goals, snapshot?.profile?.fitnessGoal, snapshot?.profile?.goalSpeed]);

  const dateBounds = useMemo(() => {
    if (rangePreset === '7d') return { start: addDaysToDateKey(today, -6), end: today, days: 7 };
    if (rangePreset === '30d') return { start: addDaysToDateKey(today, -29), end: today, days: 30 };
    if (rangePreset === '90d') return { start: addDaysToDateKey(today, -89), end: today, days: 90 };
    const start = customStart <= customEnd ? customStart : customEnd;
    const end = customStart <= customEnd ? customEnd : customStart;
    return { start, end, days: 30 };
  }, [customEnd, customStart, rangePreset, today]);

  const dailySeries = useMemo(() => {
    if (!snapshot || !snapshot.relationship.canViewNutrition) return [];
    const byDate = new Map<string, { calories: number; protein: number }>();
    for (const entry of snapshot.foodEntries) {
      if (entry.date < dateBounds.start || entry.date > dateBounds.end) continue;
      const cur = byDate.get(entry.date) || { calories: 0, protein: 0 };
      cur.calories += entry.calories;
      cur.protein += entry.protein;
      byDate.set(entry.date, cur);
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, val]) => ({
        date: date.slice(5),
        fullDate: date,
        calories: Math.round(val.calories),
        protein: Math.round(val.protein),
      }));
  }, [dateBounds.end, dateBounds.start, snapshot]);

  const weeklyAverages = useMemo(() => {
    if (dailySeries.length === 0) return [];
    const buckets = new Map<string, { calSum: number; proSum: number; count: number }>();
    for (const item of dailySeries) {
      const d = new Date(`${item.fullDate}T00:00:00`);
      const day = d.getDay();
      const diff = (day + 6) % 7;
      d.setDate(d.getDate() - diff);
      const weekKey = d.toISOString().slice(0, 10);
      const cur = buckets.get(weekKey) || { calSum: 0, proSum: 0, count: 0 };
      cur.calSum += item.calories;
      cur.proSum += item.protein;
      cur.count += 1;
      buckets.set(weekKey, cur);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, val]) => ({
        week: week.slice(5),
        avgCalories: Math.round(val.calSum / val.count),
        avgProtein: Math.round(val.proSum / val.count),
      }));
  }, [dailySeries]);

  const weightSeries = useMemo(() => {
    if (!snapshot || !snapshot.relationship.canViewWeight) return [];
    return snapshot.weightEntries
      .filter((w) => w.date >= dateBounds.start && w.date <= dateBounds.end)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((w) => ({
        date: w.date.slice(5),
        weightKg: w.weightKg,
      }));
  }, [dateBounds.end, dateBounds.start, snapshot]);

  const mealDistributionSeries = useMemo(() => {
    if (!snapshot || !snapshot.relationship.canViewNutrition) return [];
    const totals = new Map<MealCategory, { cal: number; pro: number; days: Set<string> }>();
    for (const m of MEAL_CATEGORIES) {
      totals.set(m.id, { cal: 0, pro: 0, days: new Set() });
    }
    for (const e of snapshot.foodEntries) {
      if (e.date < dateBounds.start || e.date > dateBounds.end) continue;
      const bucket = totals.get(e.mealType);
      if (bucket) {
        bucket.cal += e.calories;
        bucket.pro += e.protein;
        bucket.days.add(e.date);
      }
    }
    const distinctDays = Math.max(1, dailySeries.length);
    return MEAL_CATEGORIES.slice(0, 4).map((m) => {
      const b = totals.get(m.id)!;
      return {
        meal: m.shortLabel,
        avgCalories: Math.round(b.cal / distinctDays),
        avgProtein: Math.round(b.pro / distinctDays),
      };
    });
  }, [dailySeries.length, dateBounds.end, dateBounds.start, snapshot]);

  if (!snapshot) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setTrainerTab('clients')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Clients
        </button>
        <div className="bg-white dark:bg-[#121821] border border-stone-200 dark:border-slate-800 rounded-2xl p-8 text-center text-sm text-slate-500">
          Client record not found or access has been revoked.
        </div>
      </div>
    );
  }

  const { relationship, profile, goals } = snapshot;
  const todayStats = computeTodayStatsForClient(snapshot);
  const clientCheckins = checkins.filter((c) => c.clientId === relationship.clientId);

  const calGoal = goals?.calories || 0;
  const proGoal = goals?.protein || 0;
  const goalCompletionDays = dailySeries.filter((d) =>
    calGoal > 0 ? d.calories >= calGoal * 0.85 && d.calories <= calGoal * 1.15 : d.calories > 0
  ).length;
  const goalCompletionPct =
    dailySeries.length > 0 ? Math.round((goalCompletionDays / dailySeries.length) * 100) : 0;

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser || !noteText.trim()) return;
    setSavingNote(true);
    try {
      const res = await addTrainerNote({
        trainerId: authUser.id,
        clientId: relationship.clientId,
        category: noteCategory,
        note: noteText,
      });
      if (!res.ok || !res.data) {
        notify(res.error || 'Could not save private note', 'error');
        return;
      }
      setNotes((prev) => [res.data!, ...prev]);
      setNoteText('');
      notify('Private trainer note saved');
    } finally {
      setSavingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!authUser) return;
    const res = await deleteTrainerNote(authUser.id, noteId);
    if (res.ok) {
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    }
  };

  const handleAutoCalculateFromClientStats = () => {
    const p = snapshot?.profile;
    const latestWeight = snapshot?.weightEntries[0]?.weightKg ?? p?.currentWeightKg ?? 72;
    const targetW =
      parseFloat(recTargetWeight) || p?.targetWeightKg || goals?.targetWeightKg || latestWeight;
    const calc = calculateSmartFitnessTargets({
      age: p?.age && p.age >= 14 ? p.age : 28,
      biologicalSex: 'male',
      heightCm: p?.heightCm && p.heightCm >= 120 ? p.heightCm : 172,
      currentWeightKg: latestWeight > 30 ? latestWeight : 72,
      targetWeightKg: targetW > 30 ? targetW : 68,
      activityLevel: 'moderate',
      workoutFrequencyPerWeek: 4,
      fitnessGoal: recFitnessGoal,
      goalSpeed: recGoalSpeed,
    });
    setRecCalories(String(calc.recommendedCalories));
    setRecProtein(String(calc.proteinGrams));
    setRecCarbs(String(calc.carbsGrams));
    setRecFat(String(calc.fatGrams));
    setRecFibre(String(calc.fibreGrams));
    setRecTargetWeight(String(calc.recommendedTargetWeightKg));
    setRecPreset(recFitnessGoal);
    notify('Targets calculated from client body stats', 'info');
  };

  const handleApplyDirectGoals = async () => {
    if (!authUser) return;
    setGoalActionError(null);
    const cal = Math.round(parseFloat(recCalories));
    const pro = Math.round(parseFloat(recProtein));
    const carb = Math.round(parseFloat(recCarbs));
    const fat = Math.round(parseFloat(recFat));
    const fib = Math.round(parseFloat(recFibre));

    if ([cal, pro, carb, fat, fib].some((v) => !Number.isFinite(v) || v <= 0)) {
      const msg = 'All macro and calorie targets must be positive numbers.';
      setGoalActionError(msg);
      notify(msg, 'error');
      return;
    }

    setApplyingDirect(true);
    try {
      const res = await trainerUpdateClientGoals({
        clientId: relationship.clientId,
        calories: cal,
        protein: pro,
        carbs: carb,
        fat,
        fibre: fib,
        targetWeightKg: recTargetWeight ? parseFloat(recTargetWeight) : undefined,
        preset: recPreset || 'custom',
        fitnessGoal: recFitnessGoal,
        goalSpeed: recGoalSpeed,
      });
      if (!res.ok) {
        const errMsg =
          res.error || 'Could not update client goals directly. Ensure SQL schema is updated.';
        setGoalActionError(errMsg);
        notify(errMsg, 'error');
        return;
      }
      setGoalActionError(null);
      notify('Client nutrition goals updated directly in Supabase');
      await refreshAll();
    } finally {
      setApplyingDirect(false);
    }
  };

  const handleSaveClientPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser) return;
    setSavingPlan(true);
    try {
      const actionItems = actionItemsText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      const res = await upsertTrainerClientPlan({
        trainerId: authUser.id,
        clientId: relationship.clientId,
        phaseTitle,
        coachSummary,
        dailyWaterGoalMl: parseInt(planWaterMl, 10) || 2500,
        dailyStepsTarget: parseInt(planStepsTarget, 10) || 8000,
        mealGuidelines,
        actionItems,
      });
      if (!res.ok || !res.data) {
        notify(res.error || 'Could not save coaching plan', 'error');
        return;
      }
      setClientPlan(res.data);
      notify('Client Coaching Blueprint saved & published to client dashboard');
    } finally {
      setSavingPlan(false);
    }
  };

  const handleSendRecommendation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser) return;
    const cal = Math.round(parseFloat(recCalories));
    const pro = Math.round(parseFloat(recProtein));
    const carb = Math.round(parseFloat(recCarbs));
    const fat = Math.round(parseFloat(recFat));
    const fib = Math.round(parseFloat(recFibre));

    if ([cal, pro, carb, fat, fib].some((v) => !Number.isFinite(v) || v <= 0)) {
      notify('All recommended macro values must be positive numbers.', 'error');
      return;
    }

    setSendingRec(true);
    try {
      const res = await createTargetRecommendation({
        trainerId: authUser.id,
        clientId: relationship.clientId,
        recommendedCalories: cal,
        recommendedProtein: pro,
        recommendedCarbs: carb,
        recommendedFat: fat,
        recommendedFibre: fib,
        recommendedTargetWeightKg: recTargetWeight ? parseFloat(recTargetWeight) : undefined,
        rationale: recRationale,
      });
      if (!res.ok || !res.data) {
        notify(res.error || 'Could not send recommendation', 'error');
        return;
      }
      setRecommendations((prev) => [res.data!, ...prev]);
      setRecRationale('');
      notify('Target recommendation sent to client for approval');
    } finally {
      setSendingRec(false);
    }
  };

  const handleReviewCheckin = async (checkinId: string) => {
    if (!authUser) return;
    const fb = feedbackMap[checkinId] || 'Reviewed — keep tracking consistently.';
    const res = await reviewClientCheckin({
      trainerId: authUser.id,
      checkinId,
      trainerFeedback: fb,
    });
    if (!res.ok) {
      notify(res.error || 'Could not mark check-in reviewed', 'error');
      return;
    }
    notify('Check-in review saved');
    await refreshAll();
  };

  return (
    <div className="space-y-6">
      {/* Header & Back Link */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setTrainerTab('clients')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All Clients
          </button>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            {profile?.name || 'Client Workspace'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Read-only client telemetry governed by client privacy permissions
          </p>
        </div>

        {/* Date Range Filter */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex p-1 rounded-xl bg-stone-200/70 dark:bg-slate-900">
            {(
              [
                { id: '7d', label: '7 Days' },
                { id: '30d', label: '30 Days' },
                { id: '90d', label: '90 Days' },
                { id: 'custom', label: 'Custom' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRangePreset(opt.id)}
                className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold transition-colors ${
                  rangePreset === opt.id
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {rangePreset === 'custom' && (
            <div className="flex items-center gap-1.5 text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="h-9 px-2 rounded-lg border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
              />
              <span>–</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-9 px-2 rounded-lg border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
              />
            </div>
          )}
        </div>
      </div>

      {/* Authorized Profile & Targets Overview */}
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-4">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Client Profile</div>
          {relationship.canViewProfile && profile ? (
            <>
              <div className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100 capitalize">
                {profile.fitnessGoal.replace('_', ' ')}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                Age {profile.age || '—'} · {profile.heightCm || '—'} cm
              </div>
            </>
          ) : (
            <div className="mt-1.5 text-xs text-slate-400 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" /> Private
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-4">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Today Calories</div>
          {relationship.canViewNutrition ? (
            <>
              <div className="mt-1 text-xl font-bold font-mono-nums text-slate-900 dark:text-slate-50">
                {todayStats.calories.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                {calGoal > 0 ? `Target ${calGoal.toLocaleString()} · Rem ${Math.max(0, calGoal - todayStats.calories)}` : 'No target set'}
              </div>
            </>
          ) : (
            <div className="mt-1.5 text-xs text-slate-400 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" /> Private
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-4">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Today Macros</div>
          {relationship.canViewNutrition ? (
            <>
              <div className="mt-1 text-sm font-bold font-mono-nums text-slate-900 dark:text-slate-50">
                P {todayStats.protein}g · C {todayStats.carbs}g · F {todayStats.fat}g
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                {proGoal > 0 ? `Rem Protein: ${Math.max(0, proGoal - todayStats.protein)}g` : `Fibre ${todayStats.fibre}g`}
              </div>
            </>
          ) : (
            <div className="mt-1.5 text-xs text-slate-400 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" /> Private
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-4">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Current vs Target</div>
          {relationship.canViewWeight ? (
            <>
              <div className="mt-1 text-xl font-bold font-mono-nums text-slate-900 dark:text-slate-50">
                {snapshot.weightEntries[0]?.weightKg ?? profile?.currentWeightKg ?? '—'} kg
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                Goal: {goals?.targetWeightKg ?? profile?.targetWeightKg ?? '—'} kg
              </div>
            </>
          ) : (
            <div className="mt-1.5 text-xs text-slate-400 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" /> Private
            </div>
          )}
        </div>

        <div className="col-span-2 lg:col-span-1 bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-4">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Goal Completion</div>
          <div className="mt-1 text-xl font-bold font-mono-nums text-lime-700 dark:text-lime-400">
            {relationship.canViewNutrition ? `${goalCompletionPct}%` : '—'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {dailySeries.length} logged days in range
          </div>
        </div>
      </section>

      {/* Progress Analytics Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Daily Calories Chart */}
        <div className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Daily Calories vs Target
          </h2>
          {!relationship.canViewNutrition ? (
            <div className="h-52 flex items-center justify-center text-xs text-slate-400 gap-2">
              <Lock className="w-4 h-4" /> Client paused nutrition sharing.
            </div>
          ) : dailySeries.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-xs text-slate-400">
              No food logs recorded during this date range.
            </div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#121821',
                      border: '1px solid #1e293b',
                      borderRadius: '10px',
                      color: '#f3f4f6',
                      fontSize: '12px',
                    }}
                  />
                  {calGoal > 0 && (
                    <ReferenceLine y={calGoal} stroke="#84cc16" strokeDasharray="4 4" />
                  )}
                  <Bar dataKey="calories" name="Calories (kcal)" fill="#84cc16" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Daily Protein Chart */}
        <div className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Daily Protein Intake (g)
          </h2>
          {!relationship.canViewNutrition ? (
            <div className="h-52 flex items-center justify-center text-xs text-slate-400 gap-2">
              <Lock className="w-4 h-4" /> Client paused nutrition sharing.
            </div>
          ) : dailySeries.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-xs text-slate-400">
              No protein logs in this range.
            </div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#121821',
                      border: '1px solid #1e293b',
                      borderRadius: '10px',
                      color: '#f3f4f6',
                      fontSize: '12px',
                    }}
                  />
                  {proGoal > 0 && (
                    <ReferenceLine y={proGoal} stroke="#0ea5e9" strokeDasharray="4 4" />
                  )}
                  <Bar dataKey="protein" name="Protein (g)" fill="#0ea5e9" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Weekly Calorie & Protein Averages */}
        <div className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Weekly Calorie & Protein Averages
          </h2>
          {weeklyAverages.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-xs text-slate-400">
              Insufficient logs for weekly averages.
            </div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyAverages}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#121821',
                      border: '1px solid #1e293b',
                      borderRadius: '10px',
                      color: '#f3f4f6',
                      fontSize: '12px',
                    }}
                  />
                  <Bar yAxisId="left" dataKey="avgCalories" name="Avg kcal" fill="#84cc16" radius={[5, 5, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="avgProtein" name="Avg Protein (g)" stroke="#0ea5e9" strokeWidth={2} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Weight Progression Chart */}
        <div className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Weight Progression (kg)
          </h2>
          {!relationship.canViewWeight ? (
            <div className="h-52 flex items-center justify-center text-xs text-slate-400 gap-2">
              <Lock className="w-4 h-4" /> Client paused weight history sharing.
            </div>
          ) : weightSeries.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-xs text-slate-400">
              No weight entries logged in this date range.
            </div>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weightSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#121821',
                      border: '1px solid #1e293b',
                      borderRadius: '10px',
                      color: '#f3f4f6',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="weightKg"
                    name="Weight (kg)"
                    stroke="#84cc16"
                    fill="#84cc16"
                    fillOpacity={0.18}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      {/* Meal Timing & Macro Distribution Breakdown */}
      {relationship.canViewNutrition && mealDistributionSeries.some((m) => m.avgCalories > 0) && (
        <section className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Average Meal Distribution (kcal &amp; Protein per Logged Day)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Shows where the client eats most calories and whether breakfast/snacks carry enough protein
              </p>
            </div>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mealDistributionSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                <XAxis dataKey="meal" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#121821',
                    border: '1px solid #1e293b',
                    borderRadius: '10px',
                    color: '#f3f4f6',
                    fontSize: '12px',
                  }}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="avgCalories" name="Avg Calories (kcal)" fill="#84cc16" radius={[6, 6, 0, 0]} />
                <Bar yAxisId="right" dataKey="avgProtein" name="Avg Protein (g)" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Read-Only Today's Food Log + Target Recommendation Composer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Read-Only Client Food Entries */}
        <section className="lg:col-span-6 bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-lime-600 dark:text-lime-400" />
              Today’s Logged Foods (Read-Only)
            </h2>
            <span className="text-[11px] text-slate-400">{today}</span>
          </div>

          {!relationship.canViewNutrition ? (
            <p className="text-xs text-slate-400">Client has restricted food log access.</p>
          ) : todayStats.todayEntries.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No meals logged today yet.
            </p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {todayStats.todayEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="p-3 rounded-xl border border-stone-200/80 dark:border-slate-800 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {entry.foodName}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">
                      {entry.mealType.replace('_', ' ')} · {entry.quantityGrams}g
                    </div>
                  </div>
                  <div className="text-right font-mono-nums shrink-0">
                    <div className="font-bold text-slate-900 dark:text-slate-100">
                      {Math.round(entry.calories)} kcal
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      P {Math.round(entry.protein)}g · C {Math.round(entry.carbs)}g · F {Math.round(entry.fat)}g
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Client Goal Studio: Direct Edit & Apply OR Send Proposal */}
        <section className="lg:col-span-6 bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-lime-600 dark:text-lime-400" />
                Client Goal Studio (Calories &amp; Macros)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {relationship.canManageGoals
                  ? 'Client granted goal editing access — apply updated targets directly or send a proposal.'
                  : 'Client limited direct goal edits — changes are sent as approval proposals.'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleAutoCalculateFromClientStats}
              className="min-h-[34px] px-3 rounded-xl border border-stone-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-lime-500 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Calculator className="w-3.5 h-3.5 text-lime-600 dark:text-lime-400" />
              Auto-Calculate
            </button>
          </div>

          {/* 8 Quick Coaching Goal Presets */}
          <div>
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              Quick Coaching Templates
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {COACH_GOAL_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setRecCalories(String(preset.calories));
                    setRecProtein(String(preset.protein));
                    setRecCarbs(String(preset.carbs));
                    setRecFat(String(preset.fat));
                    setRecFibre(String(preset.fibre));
                    setRecFitnessGoal(preset.fitnessGoal);
                    setRecGoalSpeed(preset.goalSpeed);
                    setRecPreset(preset.fitnessGoal);
                  }}
                  className="px-2.5 py-2 rounded-lg border border-stone-200 dark:border-slate-800 hover:border-lime-500 text-left transition-colors"
                >
                  <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {preset.label}
                  </div>
                  <div className="text-[10px] font-mono-nums text-slate-400">
                    {preset.calories} kcal · {preset.protein}g P
                  </div>
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSendRecommendation} className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Calories (kcal)</label>
                <input
                  type="number"
                  required
                  value={recCalories}
                  onChange={(e) => setRecCalories(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-xs font-mono-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Protein (g)</label>
                <input
                  type="number"
                  required
                  value={recProtein}
                  onChange={(e) => setRecProtein(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-xs font-mono-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Carbs (g)</label>
                <input
                  type="number"
                  required
                  value={recCarbs}
                  onChange={(e) => setRecCarbs(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-xs font-mono-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Fat (g)</label>
                <input
                  type="number"
                  required
                  value={recFat}
                  onChange={(e) => setRecFat(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-xs font-mono-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Fibre (g)</label>
                <input
                  type="number"
                  required
                  value={recFibre}
                  onChange={(e) => setRecFibre(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-xs font-mono-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Target Wt (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={recTargetWeight}
                  onChange={(e) => setRecTargetWeight(e.target.value)}
                  placeholder="Optional"
                  className="w-full h-10 px-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-xs font-mono-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Goal Type</label>
                <select
                  value={recFitnessGoal}
                  onChange={(e) => setRecFitnessGoal(e.target.value as FitnessGoalType)}
                  className="w-full h-10 px-2.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-xs"
                >
                  <option value="fat_loss">Lose Fat</option>
                  <option value="muscle_gain">Build Muscle</option>
                  <option value="recomposition">Recomposition</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] text-slate-500 mb-1">Pace</label>
                <select
                  value={recGoalSpeed}
                  onChange={(e) => setRecGoalSpeed(e.target.value as GoalSpeed)}
                  className="w-full h-10 px-2.5 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-xs"
                >
                  <option value="slow">Slow &amp; Sustainable</option>
                  <option value="moderate">Moderate</option>
                  <option value="aggressive">Aggressive (Safely Capped)</option>
                </select>
              </div>
            </div>

            <input
              type="text"
              value={recRationale}
              onChange={(e) => setRecRationale(e.target.value)}
              placeholder="Coach rationale (e.g., Weight plateaued for 2 weeks; trimming 150 kcal from carbs)"
              className="w-full h-10 px-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-xs"
            />

            {goalActionError && (
              <div className="rounded-xl border border-rose-300/80 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-800 dark:text-rose-200">
                {goalActionError}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="submit"
                disabled={sendingRec}
                className="min-h-[40px] px-4 rounded-xl border border-stone-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-stone-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                <Send className="w-3.5 h-3.5" />
                {sendingRec ? 'Sending...' : 'Send as Proposal'}
              </button>

              {relationship.canManageGoals && (
                <button
                  type="button"
                  disabled={applyingDirect}
                  onClick={() => void handleApplyDirectGoals()}
                  className="min-h-[40px] px-4 rounded-xl bg-lime-500 hover:bg-lime-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  <Check className="w-3.5 h-3.5" />
                  {applyingDirect ? 'Saving...' : 'Save & Apply Directly'}
                </button>
              )}
            </div>
          </form>

          {recommendations.length > 0 && (
            <div className="pt-2 border-t border-stone-100 dark:border-slate-800 space-y-2 max-h-36 overflow-y-auto">
              {recommendations.map((rec) => (
                <div
                  key={rec.id}
                  className="text-xs flex items-center justify-between gap-2 p-2.5 rounded-lg bg-stone-50 dark:bg-slate-900"
                >
                  <span className="font-mono-nums">
                    {rec.recommendedCalories} kcal · P{rec.recommendedProtein} C{rec.recommendedCarbs} F{rec.recommendedFat}
                  </span>
                  <span
                    className={`capitalize font-semibold ${
                      rec.status === 'approved'
                        ? 'text-lime-600 dark:text-lime-400'
                        : rec.status === 'declined'
                        ? 'text-red-500'
                        : 'text-amber-500'
                    }`}
                  >
                    {rec.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Coach-Defined Client Blueprint & Weekly Action Plan */}
      <section className="bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-lime-600 dark:text-lime-400" />
              Define Client Blueprint &amp; Meal Guidelines
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Define this client&apos;s phase structure, daily steps &amp; hydration targets, meal-by-meal calorie/protein splits, and action checklist. Published directly to their Home dashboard.
            </p>
          </div>
          {clientPlan && (
            <span className="text-[11px] text-lime-700 dark:text-lime-400 font-semibold">
              Published · Updated {new Date(clientPlan.updatedAt).toLocaleDateString()}
            </span>
          )}
        </div>

        <form onSubmit={handleSaveClientPlan} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] text-slate-500 mb-1">Training / Nutrition Phase Title</label>
              <input
                type="text"
                required
                value={phaseTitle}
                onChange={(e) => setPhaseTitle(e.target.value)}
                placeholder="e.g., Phase 1: High-Protein Fat Loss"
                className="w-full h-10 px-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Water Goal (ml/day)</label>
              <input
                type="number"
                min="1000"
                max="6000"
                step="250"
                value={planWaterMl}
                onChange={(e) => setPlanWaterMl(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-xs font-mono-nums"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">Daily Steps Target</label>
              <input
                type="number"
                min="1000"
                max="30000"
                step="500"
                value={planStepsTarget}
                onChange={(e) => setPlanStepsTarget(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-xs font-mono-nums"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 mb-1">Coach Strategy Summary</label>
            <textarea
              rows={2}
              value={coachSummary}
              onChange={(e) => setCoachSummary(e.target.value)}
              placeholder="Explain focus for the next 2–4 weeks, workout fueling cues, and dining-out strategy..."
              className="w-full p-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-xs"
            />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Meal-by-Meal Targets &amp; Guidance
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {mealGuidelines.map((mg, idx) => {
                const label =
                  MEAL_CATEGORIES.find((m) => m.id === mg.mealType)?.shortLabel || mg.mealType;
                return (
                  <div
                    key={mg.mealType}
                    className="p-3 rounded-xl border border-stone-200/80 dark:border-slate-800 bg-stone-50/60 dark:bg-slate-900/50 space-y-2"
                  >
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100">{label}</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="block text-[10px] text-slate-400">kcal</label>
                        <input
                          type="number"
                          min="0"
                          value={mg.targetCalories}
                          onChange={(e) =>
                            setMealGuidelines((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, targetCalories: Number(e.target.value) || 0 } : item
                              )
                            )
                          }
                          className="w-full h-8 px-2 rounded-lg border border-stone-200 dark:border-slate-700 bg-white dark:bg-[#121821] text-xs font-mono-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400">Protein (g)</label>
                        <input
                          type="number"
                          min="0"
                          value={mg.targetProtein}
                          onChange={(e) =>
                            setMealGuidelines((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, targetProtein: Number(e.target.value) || 0 } : item
                              )
                            )
                          }
                          className="w-full h-8 px-2 rounded-lg border border-stone-200 dark:border-slate-700 bg-white dark:bg-[#121821] text-xs font-mono-nums"
                        />
                      </div>
                    </div>
                    <input
                      type="text"
                      value={mg.guidance}
                      onChange={(e) =>
                        setMealGuidelines((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, guidance: e.target.value } : item))
                        )
                      }
                      placeholder="Food guideline..."
                      className="w-full h-8 px-2 rounded-lg border border-stone-200 dark:border-slate-700 bg-white dark:bg-[#121821] text-[11px]"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 mb-1">
              Daily Action Checklist (one habit per line)
            </label>
            <textarea
              rows={3}
              value={actionItemsText}
              onChange={(e) => setActionItemsText(e.target.value)}
              className="w-full p-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-xs"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingPlan}
              className="min-h-[42px] px-5 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-xs font-bold inline-flex items-center gap-2 disabled:opacity-60"
            >
              <Plus className="w-3.5 h-3.5" />
              {savingPlan ? 'Publishing Plan...' : 'Publish Client Blueprint'}
            </button>
          </div>
        </form>
      </section>

      {/* Private Trainer Notes & Weekly Check-Ins */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <section className="lg:col-span-6 bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <MessageSquarePlus className="w-4 h-4 text-lime-600 dark:text-lime-400" />
              Private Trainer Notes (Coach-Only)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Isolated to your trainer account; other trainers never see these notes.
            </p>
          </div>

          {!relationship.canAddNotes ? (
            <p className="text-xs text-slate-400">Client disabled coaching notes permission.</p>
          ) : (
            <form onSubmit={handleAddNote} className="space-y-2.5">
              <div className="flex gap-2">
                <select
                  value={noteCategory}
                  onChange={(e) => setNoteCategory(e.target.value as TrainerNote['category'])}
                  className="h-10 px-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-xs"
                >
                  <option value="nutrition">Nutrition</option>
                  <option value="training">Training</option>
                  <option value="recovery">Recovery</option>
                  <option value="general">General</option>
                </select>
                <input
                  type="text"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Write coaching observation..."
                  className="flex-1 h-10 px-3 rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50/60 dark:bg-slate-900 text-xs"
                />
                <button
                  type="submit"
                  disabled={savingNote}
                  className="min-h-[40px] px-4 rounded-xl bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 text-xs font-bold"
                >
                  Add
                </button>
              </div>
            </form>
          )}

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {notes.length === 0 ? (
              <p className="text-xs text-slate-400">No private notes logged for this client yet.</p>
            ) : (
              notes.map((n) => (
                <div
                  key={n.id}
                  className="p-3 rounded-xl border border-stone-200/70 dark:border-slate-800 flex items-start justify-between gap-2"
                >
                  <div className="space-y-0.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      {n.category} · {new Date(n.createdAt).toLocaleDateString()}
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                      {n.note}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDeleteNote(n.id)}
                    aria-label="Delete note"
                    className="p-1.5 text-slate-400 hover:text-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Weekly Reviews / Check-Ins */}
        <section className="lg:col-span-6 bg-white dark:bg-[#121821] border border-stone-200/90 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-lime-600 dark:text-lime-400" />
            Weekly Check-Ins & Reviews
          </h2>

          {clientCheckins.length === 0 ? (
            <p className="text-xs text-slate-400">
              No weekly check-ins submitted by this client yet.
            </p>
          ) : (
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {clientCheckins.map((chk) => (
                <div
                  key={chk.id}
                  className="p-3.5 rounded-xl border border-stone-200/80 dark:border-slate-800 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      Week of {chk.weekStartDate}
                    </span>
                    <span
                      className={`capitalize font-semibold ${
                        chk.status === 'reviewed'
                          ? 'text-lime-600 dark:text-lime-400'
                          : 'text-amber-500'
                      }`}
                    >
                      {chk.status}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono-nums text-slate-500 dark:text-slate-400">
                    Avg {chk.avgCalories} kcal · Protein {chk.avgProtein}g
                    {chk.avgWeightKg ? ` · Weight ${chk.avgWeightKg} kg` : ''}
                  </div>
                  {chk.clientNotes && (
                    <p className="text-slate-600 dark:text-slate-300">“{chk.clientNotes}”</p>
                  )}
                  {chk.status === 'reviewed' && chk.trainerFeedback ? (
                    <div className="p-2.5 rounded-lg bg-lime-50/70 dark:bg-lime-950/30 text-lime-900 dark:text-lime-200">
                      Coach Review: {chk.trainerFeedback}
                    </div>
                  ) : (
                    <div className="flex gap-2 pt-1">
                      <input
                        type="text"
                        value={feedbackMap[chk.id] || ''}
                        onChange={(e) =>
                          setFeedbackMap((prev) => ({ ...prev, [chk.id]: e.target.value }))
                        }
                        placeholder="Write weekly feedback..."
                        className="flex-1 h-9 px-3 rounded-lg border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-900 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => void handleReviewCheckin(chk.id)}
                        className="h-9 px-3 rounded-lg bg-lime-500 text-slate-950 text-xs font-bold"
                      >
                        Mark Reviewed
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
