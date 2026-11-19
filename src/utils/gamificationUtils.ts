import {
  FoodLogEntry,
  MacroNutrients,
  MacroLogPersistedState,
  NutritionGoals,
} from '../types';
import { addDaysToDateKey, getTodayDateKey } from './dateUtils';
import { isCalorieGoalAchieved, sumMacros } from './nutritionUtils';

export interface DailyQuest {
  id: string;
  title: string;
  subtitle: string;
  xpReward: number;
  current: number;
  target: number;
  unitLabel: string;
  completed: boolean;
  actionType: 'food' | 'water' | 'goals' | 'database';
  actionLabel: string;
}

export interface AchievementBadge {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  progressText: string;
  tier: 'bronze' | 'silver' | 'gold';
}

export interface GoalCelebrationPayload {
  milestoneKey: string;
  title: string;
  quote: string;
  subtext: string;
  calories: number;
  calorieTarget: number;
  protein: number;
  proteinTarget: number;
  xpEarnedToday: number;
  streak: number;
  level: number;
  rankTitle: string;
}

export interface GamificationSnapshot {
  totalXp: number;
  level: number;
  rankTitle: string;
  xpIntoLevel: number;
  xpForNextLevel: number;
  levelProgressPct: number;
  currentStreak: number;
  bestStreak: number;
  quests: DailyQuest[];
  questsCompletedCount: number;
  allQuestsCompleted: boolean;
  badges: AchievementBadge[];
  unlockedBadgesCount: number;
  todayXpEarned: number;
  dailyGoalCelebrationReady: boolean;
  celebrationPayload: GoalCelebrationPayload;
}

const RANK_TITLES = [
  'Starter',
  'Habit Builder',
  'Momentum Seeker',
  'Macro Challenger',
  'Iron Habit',
  'Peak Athlete',
  'Calothrix Legend',
];

export const MOTIVATIONAL_QUOTES: { quote: string; subtext: string }[] = [
  {
    quote: 'Keep going, you rock!',
    subtext: 'You crushed today’s goal. One strong day turns into an unstoppable streak.',
  },
  {
    quote: 'Goal crushed — you rock!',
    subtext: 'Every smart meal and glass of water adds up to real transformation.',
  },
  {
    quote: 'Keep going, champion!',
    subtext: 'Consistency beats intensity. Show up again tomorrow and level up your streak.',
  },
  {
    quote: 'Unstoppable energy — you rock!',
    subtext: 'Daily discipline unlocked. Your future self is cheering for what you did today.',
  },
  {
    quote: 'Target locked. Keep going!',
    subtext: 'You stayed focused, fueled smart, and closed out your mission like a pro.',
  },
];

function getRankTitle(level: number): string {
  if (level >= 25) return RANK_TITLES[6];
  if (level >= 18) return RANK_TITLES[5];
  if (level >= 12) return RANK_TITLES[4];
  if (level >= 8) return RANK_TITLES[3];
  if (level >= 5) return RANK_TITLES[2];
  if (level >= 2) return RANK_TITLES[1];
  return RANK_TITLES[0];
}

function getLevelInfo(totalXp: number): {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  levelProgressPct: number;
  rankTitle: string;
} {
  let level = 1;
  let remaining = Math.max(0, Math.round(totalXp));
  let xpForNext = 120;

  while (remaining >= xpForNext && level < 99) {
    remaining -= xpForNext;
    level += 1;
    xpForNext = Math.round(120 + (level - 1) * 45);
  }

  return {
    level,
    xpIntoLevel: remaining,
    xpForNextLevel: xpForNext,
    levelProgressPct: Math.min(100, Math.round((remaining / Math.max(1, xpForNext)) * 100)),
    rankTitle: getRankTitle(level),
  };
}

function computeStreaks(foodEntries: FoodLogEntry[], todayKey: string): {
  currentStreak: number;
  bestStreak: number;
} {
  const loggedDates = new Set(foodEntries.map((e) => e.date));
  let currentStreak = 0;
  let cursor = loggedDates.has(todayKey) ? todayKey : addDaysToDateKey(todayKey, -1);
  while (loggedDates.has(cursor) && currentStreak < 365) {
    currentStreak += 1;
    cursor = addDaysToDateKey(cursor, -1);
  }

  const sortedDates = Array.from(loggedDates).sort();
  let bestStreak = currentStreak;
  let run = 0;
  let prev: string | null = null;
  for (const d of sortedDates) {
    if (prev && addDaysToDateKey(prev, 1) === d) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > bestStreak) bestStreak = run;
    prev = d;
  }

  return { currentStreak, bestStreak };
}

function getQuoteForDate(dateKey: string): { quote: string; subtext: string } {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i += 1) {
    hash = (hash + dateKey.charCodeAt(i)) % MOTIVATIONAL_QUOTES.length;
  }
  return MOTIVATIONAL_QUOTES[hash] || MOTIVATIONAL_QUOTES[0];
}

export function getStreakMultiplier(streak: number): { label: string; factor: number } {
  if (streak >= 14) return { label: '2.0x Streak Bonus', factor: 2.0 };
  if (streak >= 7) return { label: '1.5x Streak Bonus', factor: 1.5 };
  if (streak >= 3) return { label: '1.25x Streak Bonus', factor: 1.25 };
  return { label: '1.0x Base XP', factor: 1.0 };
}

export function isDailyNutritionGoalCompleted(
  totals: MacroNutrients,
  goals: NutritionGoals,
  entryCount: number,
  waterMl: number,
  dailyWaterGoalMl: number
): boolean {
  if (entryCount === 0 || totals.calories <= 0) return false;

  if (goals.calories > 0) {
    return isCalorieGoalAchieved(totals.calories, goals.calories);
  }

  // Fallback for brand-new users who haven't configured calorie targets yet:
  // Celebrate completing 3 meals + hitting hydration goal!
  return entryCount >= 3 && waterMl >= Math.max(500, dailyWaterGoalMl);
}

export function computeGamificationSnapshot({
  state,
  selectedDate,
  selectedDateEntries,
  selectedDateTotals,
  waterIntakeMlByDate,
  dailyWaterGoalMl,
}: {
  state: MacroLogPersistedState;
  selectedDate: string;
  selectedDateEntries: FoodLogEntry[];
  selectedDateTotals: MacroNutrients;
  waterIntakeMlByDate: Record<string, number>;
  dailyWaterGoalMl: number;
}): GamificationSnapshot {
  const todayKey = getTodayDateKey();
  const { goals, foodEntries, weightEntries } = state;

  // Group all entries by date to calculate real historical XP cleanly
  const entriesByDate = new Map<string, FoodLogEntry[]>();
  let aiOrScannerCount = 0;
  for (const entry of foodEntries) {
    const list = entriesByDate.get(entry.date) || [];
    list.push(entry);
    entriesByDate.set(entry.date, list);
    if (
      entry.sourceName?.toLowerCase().includes('ai') ||
      entry.sourceName?.toLowerCase().includes('open food') ||
      entry.sourceName?.toLowerCase().includes('ifct')
    ) {
      aiOrScannerCount += 1;
    }
  }

  let totalXp = 0;
  let calorieGoalDaysCount = 0;
  let proteinGoalDaysCount = 0;
  let hydrationGoalDaysCount = 0;

  entriesByDate.forEach((dayEntries, dateKey) => {
    const totals = sumMacros(dayEntries);
    // Up to 60 XP/day from logging individual foods + 20 XP for logging 3+ items
    totalXp += Math.min(60, dayEntries.length * 15);
    if (dayEntries.length >= 3) totalXp += 20;

    if (goals.calories > 0 && isCalorieGoalAchieved(totals.calories, goals.calories)) {
      totalXp += 40;
      calorieGoalDaysCount += 1;
    }
    if (goals.protein > 0 && totals.protein >= goals.protein * 0.85) {
      totalXp += 25;
      proteinGoalDaysCount += 1;
    }
    const dayWater = waterIntakeMlByDate[dateKey] || 0;
    if (dayWater >= Math.max(500, dailyWaterGoalMl)) {
      totalXp += 20;
      hydrationGoalDaysCount += 1;
    }
  });

  // Also credit hydration days even if no food was logged that day
  Object.entries(waterIntakeMlByDate).forEach(([dateKey, ml]) => {
    if (!entriesByDate.has(dateKey) && ml >= Math.max(500, dailyWaterGoalMl)) {
      totalXp += 20;
      hydrationGoalDaysCount += 1;
    }
  });

  // Unique weight check-in dates
  const uniqueWeightDates = new Set(weightEntries.map((w) => w.date));
  totalXp += uniqueWeightDates.size * 25;

  // Scanner / Indian catalog exploration bonus (up to 100 XP)
  totalXp += Math.min(100, aiOrScannerCount * 10);

  const { currentStreak, bestStreak } = computeStreaks(foodEntries, todayKey);
  totalXp += currentStreak * 15;

  const levelInfo = getLevelInfo(totalXp);

  // Selected date Daily Quests
  const waterMl = waterIntakeMlByDate[selectedDate] || 0;
  const distinctMealSlots = new Set(selectedDateEntries.map((e) => e.mealType)).size;
  const mealLogCount = selectedDateEntries.length;

  const quest1Done = mealLogCount >= 1;
  const quest2Done = mealLogCount >= 3 || distinctMealSlots >= 2;
  const quest3Done = waterMl >= Math.max(500, dailyWaterGoalMl);
  const proteinTarget = goals.protein > 0 ? goals.protein : 60;
  const quest4Done = selectedDateTotals.protein >= Math.round(proteinTarget * 0.8);
  const calorieTarget = goals.calories;
  const quest5Done =
    calorieTarget > 0
      ? isCalorieGoalAchieved(selectedDateTotals.calories, calorieTarget)
      : mealLogCount >= 4;

  const quests: DailyQuest[] = [
    {
      id: 'first_fuel',
      title: 'First Meal Check-In',
      subtitle: 'Log at least 1 meal or snack',
      xpReward: 25,
      current: Math.min(1, mealLogCount),
      target: 1,
      unitLabel: 'meal',
      completed: quest1Done,
      actionType: 'food',
      actionLabel: 'Log Meal',
    },
    {
      id: 'meal_rhythm',
      title: 'Fuel Rhythm',
      subtitle: 'Log 3+ items or 2+ meal slots',
      xpReward: 35,
      current: Math.min(3, mealLogCount),
      target: 3,
      unitLabel: 'items',
      completed: quest2Done,
      actionType: 'food',
      actionLabel: 'Add Food',
    },
    {
      id: 'hydration_hero',
      title: 'Hydration Target',
      subtitle: `Drink ${dailyWaterGoalMl.toLocaleString()} ml water`,
      xpReward: 30,
      current: Math.min(dailyWaterGoalMl, waterMl),
      target: dailyWaterGoalMl,
      unitLabel: 'ml',
      completed: quest3Done,
      actionType: 'water',
      actionLabel: '+250 ml',
    },
    {
      id: 'protein_power',
      title: 'Protein Power',
      subtitle:
        goals.protein > 0
          ? `Reach 80% of ${goals.protein}g protein`
          : 'Hit 48g+ daily protein',
      xpReward: 40,
      current: Math.min(Math.round(proteinTarget * 0.8), Math.round(selectedDateTotals.protein)),
      target: Math.round(proteinTarget * 0.8),
      unitLabel: 'g',
      completed: quest4Done,
      actionType: 'database',
      actionLabel: 'Find Protein',
    },
    {
      id: 'calorie_bullseye',
      title: calorieTarget > 0 ? 'Daily Calorie Bullseye' : 'Full Day Tracker',
      subtitle:
        calorieTarget > 0
          ? `Land within 85–110% of ${calorieTarget.toLocaleString()} kcal`
          : 'Log 4+ items across your day',
      xpReward: 60,
      current:
        calorieTarget > 0
          ? Math.min(calorieTarget, selectedDateTotals.calories)
          : Math.min(4, mealLogCount),
      target: calorieTarget > 0 ? calorieTarget : 4,
      unitLabel: calorieTarget > 0 ? 'kcal' : 'items',
      completed: quest5Done,
      actionType: calorieTarget > 0 ? 'food' : 'goals',
      actionLabel: calorieTarget > 0 ? 'Track Meal' : 'Set Target',
    },
  ];

  const questsCompletedCount = quests.filter((q) => q.completed).length;
  const allQuestsCompleted = questsCompletedCount === quests.length;
  const todayXpEarned = quests
    .filter((q) => q.completed)
    .reduce((sum, q) => sum + q.xpReward, 0);

  const badges: AchievementBadge[] = [
    {
      id: 'first_bite',
      title: 'First Spark',
      description: 'Log your first meal entry',
      unlocked: foodEntries.length >= 1,
      progressText: `${Math.min(1, foodEntries.length)} / 1`,
      tier: 'bronze',
    },
    {
      id: 'streak_3',
      title: '3-Day Streak',
      description: 'Track food 3 days in a row',
      unlocked: bestStreak >= 3,
      progressText: `${Math.min(3, bestStreak)} / 3 days`,
      tier: 'bronze',
    },
    {
      id: 'streak_7',
      title: '7-Day Flame',
      description: 'Build a full 7-day habit chain',
      unlocked: bestStreak >= 7,
      progressText: `${Math.min(7, bestStreak)} / 7 days`,
      tier: 'gold',
    },
    {
      id: 'goal_crusher',
      title: 'Goal Crusher',
      description: 'Hit your daily calorie target',
      unlocked: calorieGoalDaysCount >= 1,
      progressText: `${Math.min(1, calorieGoalDaysCount)} / 1 day`,
      tier: 'silver',
    },
    {
      id: 'protein_pro',
      title: 'Protein Pro',
      description: 'Reach 85%+ of protein goal',
      unlocked: proteinGoalDaysCount >= 1,
      progressText: `${Math.min(1, proteinGoalDaysCount)} / 1 day`,
      tier: 'silver',
    },
    {
      id: 'hydration_champ',
      title: 'Hydration Champ',
      description: 'Complete 100% daily water goal',
      unlocked: hydrationGoalDaysCount >= 1,
      progressText: `${Math.min(1, hydrationGoalDaysCount)} / 1 day`,
      tier: 'bronze',
    },
  ];

  const unlockedBadgesCount = badges.filter((b) => b.unlocked).length;

  const dailyGoalCelebrationReady =
    isDailyNutritionGoalCompleted(
      selectedDateTotals,
      goals,
      mealLogCount,
      waterMl,
      dailyWaterGoalMl
    ) || allQuestsCompleted;

  const selectedQuote = getQuoteForDate(selectedDate);
  const celebrationTitle = allQuestsCompleted
    ? 'ALL DAILY QUESTS CLEARED!'
    : goals.calories > 0
    ? 'DAILY GOAL COMPLETED!'
    : 'DAY COMPLETE!';

  return {
    totalXp,
    level: levelInfo.level,
    rankTitle: levelInfo.rankTitle,
    xpIntoLevel: levelInfo.xpIntoLevel,
    xpForNextLevel: levelInfo.xpForNextLevel,
    levelProgressPct: levelInfo.levelProgressPct,
    currentStreak,
    bestStreak,
    quests,
    questsCompletedCount,
    allQuestsCompleted,
    badges,
    unlockedBadgesCount,
    todayXpEarned,
    dailyGoalCelebrationReady,
    celebrationPayload: {
      milestoneKey: `${selectedDate}-${allQuestsCompleted ? 'all_quests' : 'goal_hit'}`,
      title: celebrationTitle,
      quote: selectedQuote.quote,
      subtext: selectedQuote.subtext,
      calories: selectedDateTotals.calories,
      calorieTarget: goals.calories,
      protein: Math.round(selectedDateTotals.protein * 10) / 10,
      proteinTarget: goals.protein,
      xpEarnedToday: Math.max(60, todayXpEarned),
      streak: Math.max(1, currentStreak),
      level: levelInfo.level,
      rankTitle: levelInfo.rankTitle,
    },
  };
}

// ---------------------------------------------------------------------------
// Feature 2: Advanced Macro Streak System & Monthly Streak Calendar
// ---------------------------------------------------------------------------

export interface StreakMilestoneDefinition {
  days: number;
  title: string;
  shareHeadline: string;
  description: string;
  tier: 'spark' | 'momentum' | 'iron' | 'gold' | 'diamond' | 'elite' | 'legend';
}

export const STREAK_MILESTONES: StreakMilestoneDefinition[] = [
  {
    days: 3,
    title: '3-Day Spark',
    shareHeadline: '3 DAYS OF MOMENTUM',
    description: 'Three consecutive days of real meal tracking.',
    tier: 'spark',
  },
  {
    days: 7,
    title: '7-Day Habit',
    shareHeadline: '7 DAYS OF CONSISTENCY',
    description: 'One full week of uninterrupted nutrition discipline.',
    tier: 'momentum',
  },
  {
    days: 14,
    title: '14-Day Lock',
    shareHeadline: '14 DAYS UNBROKEN',
    description: 'Two full weeks showing up for your body every day.',
    tier: 'iron',
  },
  {
    days: 30,
    title: '30-Day Athlete',
    shareHeadline: '30 DAYS STRONG',
    description: 'A full month of deliberate fueling and logging.',
    tier: 'gold',
  },
  {
    days: 60,
    title: '60-Day Standard',
    shareHeadline: '60 DAYS LOCKED IN',
    description: 'Sixty days where discipline became second nature.',
    tier: 'diamond',
  },
  {
    days: 100,
    title: '100-Day Century',
    shareHeadline: '100 DAYS OF DISCIPLINE',
    description: 'Triple-digit streak earned one honest day at a time.',
    tier: 'elite',
  },
  {
    days: 365,
    title: '365-Day Legend',
    shareHeadline: '365 DAYS UNSTOPPABLE',
    description: 'A complete year of mastery and relentless consistency.',
    tier: 'legend',
  },
];

export interface StreakMilestoneStatus extends StreakMilestoneDefinition {
  unlocked: boolean;
  progressPct: number;
}

export interface AdvancedStreakAnalytics {
  currentStreak: number;
  longestStreak: number;
  totalActiveDays: number;
  weeklyLoggedDays: number;
  weeklyElapsedDays: number;
  weeklyConsistencyPct: number;
  monthlyLoggedDays: number;
  monthlyElapsedDays: number;
  monthlyConsistencyPct: number;
  todayLogged: boolean;
  todayGoalMet: boolean;
  milestones: StreakMilestoneStatus[];
  latestUnlockedMilestone: StreakMilestoneStatus | null;
  nextMilestone: StreakMilestoneStatus | null;
  daysToNextMilestone: number;
}

export function computeAdvancedStreakAnalytics({
  foodEntries,
  goals,
  todayKey = getTodayDateKey(),
}: {
  foodEntries: FoodLogEntry[];
  goals: NutritionGoals;
  todayKey?: string;
}): AdvancedStreakAnalytics {
  const entriesByDate = new Map<string, FoodLogEntry[]>();
  for (const entry of foodEntries) {
    const list = entriesByDate.get(entry.date) || [];
    list.push(entry);
    entriesByDate.set(entry.date, list);
  }

  const { currentStreak, bestStreak: longestStreak } = computeStreaks(foodEntries, todayKey);
  const totalActiveDays = entriesByDate.size;

  // Weekly consistency (Monday -> today within current week)
  const todayDate = new Date(`${todayKey}T12:00:00`);
  const jsDay = todayDate.getDay(); // 0 Sun .. 6 Sat
  const diffToMon = jsDay === 0 ? -6 : 1 - jsDay;
  const weekElapsed = Math.abs(diffToMon) + 1;
  let weeklyLoggedDays = 0;
  for (let i = 0; i < weekElapsed; i++) {
    const k = addDaysToDateKey(todayKey, -i);
    if (entriesByDate.has(k)) weeklyLoggedDays += 1;
  }
  const weeklyConsistencyPct = Math.min(100, Math.round((weeklyLoggedDays / Math.max(1, weekElapsed)) * 100));

  // Monthly consistency (1st of month -> today)
  const year = todayDate.getFullYear();
  const monthIdx = todayDate.getMonth();
  const dayOfMonth = todayDate.getDate();
  let monthlyLoggedDays = 0;
  for (let day = 1; day <= dayOfMonth; day++) {
    const k = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (entriesByDate.has(k)) monthlyLoggedDays += 1;
  }
  const monthlyConsistencyPct = Math.min(100, Math.round((monthlyLoggedDays / Math.max(1, dayOfMonth)) * 100));

  const todayEntries = entriesByDate.get(todayKey) || [];
  const todayLogged = todayEntries.length > 0;
  const todayTotals = sumMacros(todayEntries);
  const todayGoalMet =
    todayLogged &&
    (goals.calories > 0 ? isCalorieGoalAchieved(todayTotals.calories, goals.calories) : todayEntries.length >= 1);

  const referenceBest = Math.max(currentStreak, longestStreak);
  const milestones: StreakMilestoneStatus[] = STREAK_MILESTONES.map((m) => ({
    ...m,
    unlocked: referenceBest >= m.days,
    progressPct: Math.min(100, Math.round((currentStreak / m.days) * 100)),
  }));

  const unlockedList = milestones.filter((m) => m.unlocked);
  const latestUnlockedMilestone = unlockedList.length > 0 ? unlockedList[unlockedList.length - 1] : null;
  const nextMilestone = milestones.find((m) => currentStreak < m.days) || null;
  const daysToNextMilestone = nextMilestone ? Math.max(0, nextMilestone.days - currentStreak) : 0;

  return {
    currentStreak,
    longestStreak,
    totalActiveDays,
    weeklyLoggedDays,
    weeklyElapsedDays: weekElapsed,
    weeklyConsistencyPct,
    monthlyLoggedDays,
    monthlyElapsedDays: dayOfMonth,
    monthlyConsistencyPct,
    todayLogged,
    todayGoalMet,
    milestones,
    latestUnlockedMilestone,
    nextMilestone,
    daysToNextMilestone,
  };
}

export interface StreakCalendarCell {
  dateKey: string;
  dayNumber: number;
  inMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
  hasLogged: boolean;
  onCalorieTarget: boolean;
  calories: number;
  protein: number;
  entryCount: number;
}

export function getStreakCalendarMonthMatrix({
  foodEntries,
  goals,
  year,
  monthIndex,
  todayKey = getTodayDateKey(),
}: {
  foodEntries: FoodLogEntry[];
  goals: NutritionGoals;
  year: number;
  monthIndex: number; // 0-indexed
  todayKey?: string;
}): {
  label: string;
  year: number;
  monthIndex: number;
  cells: StreakCalendarCell[];
  loggedInMonth: number;
  onTargetInMonth: number;
} {
  const entriesByDate = new Map<string, FoodLogEntry[]>();
  for (const entry of foodEntries) {
    const list = entriesByDate.get(entry.date) || [];
    list.push(entry);
    entriesByDate.set(entry.date, list);
  }

  const firstOfMonth = new Date(year, monthIndex, 1, 12, 0, 0);
  const label = firstOfMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const firstJsDay = firstOfMonth.getDay(); // 0=Sun..6=Sat
  const leadingEmpty = firstJsDay === 0 ? 6 : firstJsDay - 1; // Monday-first column index
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const totalCells = leadingEmpty + daysInMonth > 35 ? 42 : 35;

  const cells: StreakCalendarCell[] = [];
  let loggedInMonth = 0;
  let onTargetInMonth = 0;

  for (let i = 0; i < totalCells; i++) {
    const dayOffset = i - leadingEmpty + 1;
    const cellDate = new Date(year, monthIndex, dayOffset, 12, 0, 0);
    const cy = cellDate.getFullYear();
    const cm = String(cellDate.getMonth() + 1).padStart(2, '0');
    const cd = String(cellDate.getDate()).padStart(2, '0');
    const dateKey = `${cy}-${cm}-${cd}`;
    const inMonth = cellDate.getMonth() === monthIndex && cellDate.getFullYear() === year;
    const dayEntries = entriesByDate.get(dateKey) || [];
    const totals = sumMacros(dayEntries);
    const hasLogged = dayEntries.length > 0;
    const onCalorieTarget =
      hasLogged &&
      (goals.calories > 0 ? isCalorieGoalAchieved(totals.calories, goals.calories) : true);

    if (inMonth && hasLogged) {
      loggedInMonth += 1;
      if (onCalorieTarget) onTargetInMonth += 1;
    }

    cells.push({
      dateKey,
      dayNumber: cellDate.getDate(),
      inMonth,
      isToday: dateKey === todayKey,
      isFuture: dateKey > todayKey,
      hasLogged,
      onCalorieTarget,
      calories: totals.calories,
      protein: Math.round(totals.protein * 10) / 10,
      entryCount: dayEntries.length,
    });
  }

  return {
    label,
    year,
    monthIndex,
    cells,
    loggedInMonth,
    onTargetInMonth,
  };
}

// ---------------------------------------------------------------------------
// Feature 3: Transformation & Progress Journey (Bi-Directional Support)
// ---------------------------------------------------------------------------

export interface TransformationMilestone {
  id: string;
  title: string;
  subtitle: string;
  unlocked: boolean;
  progressLabel: string;
}

export interface TransformationJourneyStats {
  direction: 'loss' | 'gain' | 'maintain';
  startingWeightKg: number;
  currentWeightKg: number;
  targetWeightKg: number;
  totalChangeKg: number; // current - starting (signed)
  progressTowardGoalKg: number;
  remainingKg: number;
  progressPct: number;
  weeklyAvgWeightKg: number | null;
  monthlyChangeKg: number | null;
  daysTrackedNutrition: number;
  proteinGoalConsistencyPct: number;
  avgDailyCalories: number;
  avgDailyProtein: number;
  currentStreak: number;
  milestones: TransformationMilestone[];
}

export function computeTransformationJourneyStats({
  state,
  todayKey = getTodayDateKey(),
}: {
  state: MacroLogPersistedState;
  todayKey?: string;
}): TransformationJourneyStats {
  const { weightEntries, weightGoal, profile, foodEntries, goals } = state;

  const sortedWeights = [...weightEntries].sort((a, b) => a.date.localeCompare(b.date));
  const firstEntryKg = sortedWeights.length > 0 ? sortedWeights[0].weightKg : 0;
  const lastEntryKg = sortedWeights.length > 0 ? sortedWeights[sortedWeights.length - 1].weightKg : 0;

  const startingWeightKg =
    weightGoal.startingWeightKg > 0
      ? weightGoal.startingWeightKg
      : firstEntryKg > 0
      ? firstEntryKg
      : profile.currentWeightKg;

  const currentWeightKg = lastEntryKg > 0 ? lastEntryKg : profile.currentWeightKg;
  const targetWeightKg =
    weightGoal.targetWeightKg > 0 ? weightGoal.targetWeightKg : profile.targetWeightKg;

  let direction: 'loss' | 'gain' | 'maintain' = weightGoal.goalDirection || 'maintain';
  if (!weightGoal.goalDirection) {
    if (profile.fitnessGoal === 'fat_loss') direction = 'loss';
    else if (profile.fitnessGoal === 'muscle_gain') direction = 'gain';
    else if (targetWeightKg > 0 && startingWeightKg > 0) {
      if (targetWeightKg < startingWeightKg - 0.3) direction = 'loss';
      else if (targetWeightKg > startingWeightKg + 0.3) direction = 'gain';
    }
  }

  const totalChangeKg =
    startingWeightKg > 0 && currentWeightKg > 0
      ? Math.round((currentWeightKg - startingWeightKg) * 100) / 100
      : 0;

  // Directional progress computation supporting weight loss, weight gain & maintenance
  const totalDeltaNeeded =
    startingWeightKg > 0 && targetWeightKg > 0 ? targetWeightKg - startingWeightKg : 0;
  let progressTowardGoalKg = 0;
  let remainingKg = 0;
  let progressPct = 0;

  if (currentWeightKg > 0 && targetWeightKg > 0) {
    remainingKg = Math.round(Math.abs(targetWeightKg - currentWeightKg) * 100) / 100;
    if (direction === 'maintain' || Math.abs(totalDeltaNeeded) < 0.25) {
      const dist = Math.abs(currentWeightKg - targetWeightKg);
      progressPct = dist <= 0.5 ? 100 : Math.max(0, Math.round(100 - dist * 20));
    } else if (direction === 'loss') {
      progressTowardGoalKg = Math.max(0, Math.round((startingWeightKg - currentWeightKg) * 100) / 100);
      const totalLossGoal = Math.max(0.25, startingWeightKg - targetWeightKg);
      progressPct = Math.min(100, Math.max(0, Math.round((progressTowardGoalKg / totalLossGoal) * 100)));
    } else {
      progressTowardGoalKg = Math.max(0, Math.round((currentWeightKg - startingWeightKg) * 100) / 100);
      const totalGainGoal = Math.max(0.25, targetWeightKg - startingWeightKg);
      progressPct = Math.min(100, Math.max(0, Math.round((progressTowardGoalKg / totalGainGoal) * 100)));
    }
  }

  // Rolling last-7-days average weight
  const cutoff7 = addDaysToDateKey(todayKey, -6);
  const recent7Weights = sortedWeights.filter((w) => w.date >= cutoff7 && w.date <= todayKey);
  const weeklyAvgWeightKg =
    recent7Weights.length > 0
      ? Math.round((recent7Weights.reduce((s, w) => s + w.weightKg, 0) / recent7Weights.length) * 100) / 100
      : null;

  // Monthly change (compare latest weight vs weight ~30 days ago)
  const cutoff30 = addDaysToDateKey(todayKey, -30);
  const last30Weights = sortedWeights.filter((w) => w.date >= cutoff30 && w.date <= todayKey);
  const monthlyChangeKg =
    last30Weights.length >= 2
      ? Math.round((last30Weights[last30Weights.length - 1].weightKg - last30Weights[0].weightKg) * 100) /
        100
      : null;

  // Nutrition consistency stats
  const byDate = new Map<string, FoodLogEntry[]>();
  for (const entry of foodEntries) {
    const arr = byDate.get(entry.date) || [];
    arr.push(entry);
    byDate.set(entry.date, arr);
  }

  const daysTrackedNutrition = byDate.size;
  let sumDailyCals = 0;
  let sumDailyPro = 0;
  let proteinHitDays = 0;
  byDate.forEach((entries) => {
    const sum = sumMacros(entries);
    sumDailyCals += sum.calories;
    sumDailyPro += sum.protein;
    if (goals.protein > 0 && sum.protein >= goals.protein * 0.85) {
      proteinHitDays += 1;
    }
  });

  const avgDailyCalories =
    daysTrackedNutrition > 0 ? Math.round(sumDailyCals / daysTrackedNutrition) : 0;
  const avgDailyProtein =
    daysTrackedNutrition > 0 ? Math.round((sumDailyPro / daysTrackedNutrition) * 10) / 10 : 0;
  const proteinGoalConsistencyPct =
    daysTrackedNutrition > 0 && goals.protein > 0
      ? Math.min(100, Math.round((proteinHitDays / daysTrackedNutrition) * 100))
      : 0;

  const { currentStreak, bestStreak } = computeStreaks(foodEntries, todayKey);
  const peakHabitDays = Math.max(currentStreak, bestStreak, daysTrackedNutrition);

  const reachedTargetWeight =
    targetWeightKg > 0 &&
    currentWeightKg > 0 &&
    (direction === 'loss'
      ? currentWeightKg <= targetWeightKg + 0.1
      : direction === 'gain'
      ? currentWeightKg >= targetWeightKg - 0.1
      : Math.abs(currentWeightKg - targetWeightKg) <= 0.4);

  const first1KgLabel =
    direction === 'gain'
      ? 'First +1 kg Lean Gain'
      : direction === 'loss'
      ? 'First 1 kg Progress'
      : 'First 1 kg Steady Shift';

  const milestones: TransformationMilestone[] = [
    {
      id: 'track_7',
      title: 'First 7 Days Tracking',
      subtitle: 'Establish baseline nutrition & weigh-in rhythm',
      unlocked: daysTrackedNutrition >= 7,
      progressLabel: `${Math.min(7, daysTrackedNutrition)} / 7 days`,
    },
    {
      id: 'first_1kg',
      title: first1KgLabel,
      subtitle:
        direction === 'maintain'
          ? 'Stay anchored within target band'
          : 'Measurable progress toward target direction',
      unlocked:
        direction === 'maintain'
          ? sortedWeights.length >= 4 && remainingKg <= 0.6
          : progressTowardGoalKg >= 1,
      progressLabel:
        direction === 'maintain'
          ? `${sortedWeights.length} check-ins`
          : `${Math.min(1, progressTowardGoalKg).toFixed(1)} / 1.0 kg`,
    },
    {
      id: 'consistency_30',
      title: '30 Days Consistency',
      subtitle: 'Build durable daily nutrition habits',
      unlocked: peakHabitDays >= 30,
      progressLabel: `${Math.min(30, peakHabitDays)} / 30 days`,
    },
    {
      id: 'goal_weight',
      title: 'Target Weight Reached',
      subtitle: 'Arrive at your configured transformation target',
      unlocked: reachedTargetWeight,
      progressLabel: targetWeightKg > 0 ? `${progressPct}% there` : 'Set target',
    },
    {
      id: 'track_90',
      title: '90 Days Nutrition Tracking',
      subtitle: 'Long-horizon discipline & lifestyle mastery',
      unlocked: daysTrackedNutrition >= 90,
      progressLabel: `${Math.min(90, daysTrackedNutrition)} / 90 days`,
    },
  ];

  return {
    direction,
    startingWeightKg,
    currentWeightKg,
    targetWeightKg,
    totalChangeKg,
    progressTowardGoalKg,
    remainingKg,
    progressPct,
    weeklyAvgWeightKg,
    monthlyChangeKg,
    daysTrackedNutrition,
    proteinGoalConsistencyPct,
    avgDailyCalories,
    avgDailyProtein,
    currentStreak,
    milestones,
  };
}
