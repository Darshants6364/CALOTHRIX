import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Award,
  CheckCircle2,
  Droplets,
  Flame,
  Lock,
  Plus,
  Sparkles,
  Target,
  Trophy,
  Zap,
} from 'lucide-react';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import {
  computeGamificationSnapshot,
  DailyQuest,
  getStreakMultiplier,
} from '../utils/gamificationUtils';
import { triggerGoalCelebrationSplash } from './GoalCelebrationModal';

export const DailyQuestArena: React.FC = () => {
  const {
    state,
    selectedDate,
    selectedDateEntries,
    selectedDateTotals,
    waterIntakeMlByDate,
    dailyWaterGoalMl,
    addWaterMl,
    openAddFoodModal,
    setActiveTab,
  } = useMacroLogStore();

  const prefersReducedMotion = useReducedMotion();

  const snapshot = React.useMemo(
    () =>
      computeGamificationSnapshot({
        state,
        selectedDate,
        selectedDateEntries,
        selectedDateTotals,
        waterIntakeMlByDate,
        dailyWaterGoalMl,
      }),
    [
      state,
      selectedDate,
      selectedDateEntries,
      selectedDateTotals,
      waterIntakeMlByDate,
      dailyWaterGoalMl,
    ]
  );

  const streakMultiplier = getStreakMultiplier(snapshot.currentStreak);

  const handleQuestAction = (quest: DailyQuest) => {
    if (quest.actionType === 'water') {
      addWaterMl(selectedDate, 250);
    } else if (quest.actionType === 'food') {
      openAddFoodModal({ date: selectedDate });
    } else if (quest.actionType === 'database') {
      setActiveTab('food-database');
    } else {
      setActiveTab('goals');
    }
  };

  return (
    <section
      aria-label="Daily quests, level and achievements"
      className="bg-white dark:bg-[#111317] border border-black/10 dark:border-white/12 rounded-2xl p-5 sm:p-6 space-y-5"
    >
      {/* Header: Level + XP Progress + Streak Multiplier */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#111317] dark:bg-[#C8FF00] text-[#C8FF00] dark:text-black flex flex-col items-center justify-center shrink-0 font-display font-extrabold leading-none shadow-sm">
            <span className="text-[10px] uppercase tracking-wider opacity-80">LV</span>
            <span className="text-lg">{snapshot.level}</span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-[#111317] dark:text-white">
                {snapshot.rankTitle} Arena
              </h2>
              <span className="text-xs font-semibold font-mono-nums text-[#4E6800] dark:text-[#C8FF00]">
                +{snapshot.todayXpEarned} XP today
              </span>
              <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                · {streakMultiplier.label}
              </span>
            </div>

            <div className="mt-1.5 flex items-center gap-2.5 max-w-md">
              <div className="h-2 flex-1 rounded-full bg-black/8 dark:bg-white/10 overflow-hidden">
                <motion.div
                  initial={false}
                  animate={{ width: `${snapshot.levelProgressPct}%` }}
                  transition={{ duration: prefersReducedMotion ? 0 : 0.45, ease: 'easeOut' }}
                  className="h-full rounded-full bg-[#4E6800] dark:bg-[#C8FF00]"
                />
              </div>
              <span className="text-[11px] font-mono-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {snapshot.xpIntoLevel} / {snapshot.xpForNextLevel} XP
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="px-3 py-2 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/60 flex items-center gap-2 text-xs">
            <Flame className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="font-semibold text-[#111317] dark:text-white tabular-nums">
              {snapshot.currentStreak}d Streak
            </span>
            <span className="text-slate-400 dark:text-slate-500 tabular-nums">
              (Best {snapshot.bestStreak}d)
            </span>
          </div>

          <div className="px-3 py-2 rounded-xl bg-[#F4F3EF]/80 dark:bg-[#090A0C] border border-black/10 dark:border-white/12 flex items-center gap-2 text-xs">
            <Target className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00] shrink-0" />
            <span className="font-semibold text-[#111317] dark:text-white tabular-nums">
              {snapshot.questsCompletedCount} / {snapshot.quests.length} Quests
            </span>
          </div>

          {snapshot.dailyGoalCelebrationReady && (
            <button
              type="button"
              onClick={triggerGoalCelebrationSplash}
              className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-[#C8FF00] hover:bg-[#D9FF4D] text-black text-xs font-bold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shadow-sm"
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>Celebrate Goal</span>
            </button>
          )}
        </div>
      </div>

      {/* Playable Daily Combo Bar */}
      <div className="rounded-xl bg-[#F4F3EF]/80 dark:bg-[#090A0C]/60 border border-black/10 dark:border-white/12 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2.5 text-xs">
          <Sparkles className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00] shrink-0" />
          <span className="text-slate-700 dark:text-slate-200 font-medium">
            {snapshot.dailyGoalCelebrationReady
              ? `Goal crushed! Come back tomorrow to reach Day ${snapshot.currentStreak + 1} on your streak.`
              : `Complete today’s Calorie Goal or clear all ${snapshot.quests.length} Quests to unlock your Celebration Win!`}
          </span>
        </div>

        {/* 5 Segmented Combo Crystals */}
        <div className="flex items-center gap-1.5 shrink-0" aria-label="Daily quest combo meter">
          {snapshot.quests.map((q, idx) => (
            <div
              key={q.id}
              title={`${q.title}: ${q.completed ? 'Completed' : 'In Progress'}`}
              className={`h-2.5 w-7 rounded-full transition-all duration-300 ${
                q.completed
                  ? 'bg-[#4E6800] dark:bg-[#C8FF00] shadow-xs shadow-[#C8FF00]/40'
                  : 'bg-black/10 dark:bg-white/12'
              }`}
              aria-label={`Quest ${idx + 1} ${q.completed ? 'complete' : 'pending'}`}
            />
          ))}
        </div>
      </div>

      {/* Playable Daily Quests Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {snapshot.quests.map((quest) => {
          const pct = Math.min(100, Math.round((quest.current / Math.max(1, quest.target)) * 100));
          return (
            <div
              key={quest.id}
              className={`rounded-xl border p-3.5 flex flex-col justify-between gap-3 transition-colors ${
                quest.completed
                  ? 'border-lime-500/50 bg-lime-50/60 dark:bg-lime-950/20'
                  : 'border-black/10 dark:border-white/12 bg-stone-50/60 dark:bg-[#090A0C]/50'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-snug">
                    {quest.title}
                  </span>
                  {quest.completed ? (
                    <CheckCircle2 className="w-4 h-4 text-lime-600 dark:text-lime-400 shrink-0" />
                  ) : (
                    <span className="text-[11px] font-bold font-mono-nums text-lime-700 dark:text-lime-400 shrink-0 inline-flex items-center gap-0.5">
                      <Zap className="w-3 h-3" />+{quest.xpReward}
                    </span>
                  )}
                </div>

                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                  {quest.subtitle}
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono-nums text-slate-600 dark:text-slate-300">
                  <span>
                    {quest.current.toLocaleString()} / {quest.target.toLocaleString()} {quest.unitLabel}
                  </span>
                  <span className="font-semibold">{pct}%</span>
                </div>

                <div className="h-1.5 w-full rounded-full bg-stone-200/80 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      quest.completed ? 'bg-lime-500 dark:bg-lime-400' : 'bg-slate-800 dark:bg-slate-400'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {quest.completed ? (
                  <div className="text-[11px] font-semibold text-lime-700 dark:text-lime-400 flex items-center gap-1 pt-0.5">
                    <Sparkles className="w-3 h-3" />
                    <span>+{quest.xpReward} XP Unlocked</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleQuestAction(quest)}
                    className="w-full min-h-[30px] px-2.5 rounded-lg bg-white dark:bg-[#111317] border border-black/10 dark:border-white/15 hover:border-lime-500 text-[11px] font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center justify-center gap-1 transition-colors whitespace-nowrap"
                  >
                    {quest.actionType === 'water' ? (
                      <Droplets className="w-3 h-3 text-sky-500" />
                    ) : (
                      <Plus className="w-3 h-3 text-lime-600 dark:text-lime-400" />
                    )}
                    <span>{quest.actionLabel}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Unlockable Badges Shelf */}
      <div className="pt-2 border-t border-stone-100 dark:border-white/10">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <Award className="w-4 h-4 text-lime-600 dark:text-lime-400" />
            <span>Trophy Shelf</span>
          </div>
          <span className="text-[11px] font-mono-nums text-slate-500 dark:text-slate-400">
            {snapshot.unlockedBadgesCount} / {snapshot.badges.length} unlocked
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {snapshot.badges.map((badge) => (
            <div
              key={badge.id}
              className={`rounded-xl border px-3 py-2.5 flex items-center gap-2.5 ${
                badge.unlocked
                  ? 'border-lime-500/40 bg-lime-50/40 dark:bg-lime-950/15'
                  : 'border-black/10 dark:border-white/10 bg-stone-50/40 dark:bg-[#090A0C]/30 opacity-75'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  badge.unlocked
                    ? 'bg-lime-500 text-slate-950'
                    : 'bg-stone-200/80 dark:bg-slate-800 text-slate-400'
                }`}
              >
                {badge.unlocked ? (
                  <Trophy className="w-3.5 h-3.5" />
                ) : (
                  <Lock className="w-3.5 h-3.5" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {badge.title}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                  {badge.unlocked ? badge.description : badge.progressText}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
