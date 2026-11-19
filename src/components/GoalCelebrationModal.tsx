import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Flame, Sparkles, Trophy, X, Zap } from 'lucide-react';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { getTodayDateKey } from '../utils/dateUtils';
import {
  computeGamificationSnapshot,
  GoalCelebrationPayload,
  STREAK_MILESTONES,
} from '../utils/gamificationUtils';

interface GoalCelebrationModalProps {
  isOpen: boolean;
  payload: GoalCelebrationPayload | null;
  onClose: () => void;
}

const CONFETTI_PIECES = [
  { id: 1, x: -135, y: -110, rotate: -38, color: '#A3E635', size: 10 },
  { id: 2, x: 130, y: -115, rotate: 42, color: '#FACC15', size: 9 },
  { id: 3, x: -95, y: -145, rotate: 24, color: '#38BDF8', size: 8 },
  { id: 4, x: 90, y: -150, rotate: -26, color: '#4ADE80', size: 11 },
  { id: 5, x: -165, y: -35, rotate: -55, color: '#FACC15', size: 8 },
  { id: 6, x: 165, y: -40, rotate: 60, color: '#A3E635', size: 9 },
  { id: 7, x: -120, y: 75, rotate: 35, color: '#38BDF8', size: 9 },
  { id: 8, x: 120, y: 80, rotate: -40, color: '#4ADE80', size: 10 },
  { id: 9, x: 0, y: -165, rotate: 12, color: '#A3E635', size: 11 },
  { id: 10, x: -55, y: -125, rotate: -18, color: '#FB923C', size: 8 },
  { id: 11, x: 55, y: -130, rotate: 22, color: '#A3E635', size: 8 },
  { id: 12, x: -150, y: 20, rotate: 48, color: '#4ADE80', size: 7 },
];

export const GoalCelebrationModal: React.FC<GoalCelebrationModalProps> = ({
  isOpen,
  payload,
  onClose,
}) => {
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && payload && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0.05 : 0.22 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#090A0C]/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="goal-celebration-quote"
          onClick={onClose}
        >
          <motion.div
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.88, y: 24 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 12 }}
            transition={{
              type: 'spring',
              stiffness: 360,
              damping: 26,
            }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md rounded-3xl border border-[#C8FF00]/40 bg-[#111317] text-[#F3F4F6] p-6 sm:p-8 shadow-2xl overflow-hidden"
          >
            {/* Subtle top glow */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-48 rounded-full bg-[#C8FF00]/20 blur-3xl"
            />

            {/* Confetti burst */}
            {!prefersReducedMotion && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2"
              >
                {CONFETTI_PIECES.map((piece, idx) => (
                  <motion.span
                    key={piece.id}
                    initial={{ x: 0, y: 0, opacity: 1, scale: 0.4, rotate: 0 }}
                    animate={{
                      x: piece.x,
                      y: piece.y,
                      opacity: [1, 1, 0],
                      scale: [0.4, 1.15, 0.9],
                      rotate: piece.rotate * 3,
                    }}
                    transition={{
                      duration: 1.25,
                      delay: idx * 0.02,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    style={{
                      width: piece.size,
                      height: piece.size * 0.55,
                      backgroundColor: piece.color,
                    }}
                    className="absolute block rounded-xs"
                  />
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close celebration"
              className="absolute top-4 right-4 w-10 h-10 rounded-full border border-white/12 bg-[#090A0C] text-slate-400 hover:text-white flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="relative flex flex-col items-center text-center">
              {/* Animated Trophy Emblem */}
              <motion.div
                initial={prefersReducedMotion ? undefined : { scale: 0.5, rotate: -14 }}
                animate={prefersReducedMotion ? undefined : { scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 0.08 }}
                className="w-20 h-20 rounded-2xl bg-[#C8FF00] text-black flex items-center justify-center shadow-lg shadow-[#C8FF00]/25"
              >
                <Trophy className="w-10 h-10 stroke-[2.2]" />
              </motion.div>

              <div className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.16em] text-[#C8FF00]">
                <Sparkles className="w-3.5 h-3.5" />
                <span>{payload.title}</span>
              </div>

              <h2
                id="goal-celebration-quote"
                className="mt-2 text-3xl sm:text-4xl font-display font-extrabold tracking-tight text-white leading-tight"
              >
                &ldquo;{payload.quote}&rdquo;
              </h2>

              <p className="mt-2.5 text-sm text-slate-300 leading-relaxed max-w-sm">
                {payload.subtext}
              </p>

              {/* Daily Win Stats */}
              <div className="mt-6 w-full grid grid-cols-3 gap-2.5 text-left">
                <div className="rounded-2xl bg-[#090A0C] border border-white/10 p-3">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-[#C8FF00]" />
                    <span>Today XP</span>
                  </div>
                  <div className="mt-1 text-base font-bold font-mono-nums text-[#C8FF00]">
                    +{payload.xpEarnedToday} XP
                  </div>
                </div>

                <div className="rounded-2xl bg-[#090A0C] border border-white/10 p-3">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Flame className="w-3 h-3 text-amber-400" />
                    <span>Streak</span>
                  </div>
                  <div className="mt-1 text-base font-bold font-mono-nums text-white">
                    {payload.streak} {payload.streak === 1 ? 'Day' : 'Days'}
                  </div>
                </div>

                <div className="rounded-2xl bg-[#090A0C] border border-white/10 p-3">
                  <div className="text-[11px] text-slate-400">Rank</div>
                  <div className="mt-1 text-sm font-bold text-white truncate">
                    LV {payload.level}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">{payload.rankTitle}</div>
                </div>
              </div>

              <div className="mt-3 w-full rounded-2xl bg-[#090A0C] border border-white/10 px-4 py-2.5 flex items-center justify-between text-xs font-mono-nums text-slate-300">
                <span>
                  Logged: <strong className="text-white">{payload.calories.toLocaleString()} kcal</strong>
                  {payload.calorieTarget > 0 ? ` / ${payload.calorieTarget.toLocaleString()}` : ''}
                </span>
                <span>
                  Protein: <strong className="text-[#C8FF00]">{payload.protein}g</strong>
                  {payload.proteinTarget > 0 ? ` / ${payload.proteinTarget}g` : ''}
                </span>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="mt-6 w-full min-h-[48px] px-6 rounded-xl bg-[#C8FF00] hover:bg-[#D9FF4D] text-black font-bold text-sm uppercase tracking-[0.05em] transition-colors shadow-lg shadow-[#C8FF00]/20"
              >
                Keep Going
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export function triggerGoalCelebrationSplash(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('calothrix:celebrate'));
  }
}

export const GoalCelebrationController: React.FC = () => {
  const {
    authMode,
    authUser,
    state,
    selectedDate,
    selectedDateEntries,
    selectedDateTotals,
    waterIntakeMlByDate,
    dailyWaterGoalMl,
    notify,
  } = useMacroLogStore();

  const [isOpen, setIsOpen] = useState(false);
  const [activePayload, setActivePayload] = useState<GoalCelebrationPayload | null>(null);
  const [isSettled, setIsSettled] = useState(false);
  const prevCompletedQuestsRef = useRef<Set<string> | null>(null);

  const snapshot = useMemo(
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

  // Brief settle delay after mount so initial sync settles cleanly
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsSettled(true);
    }, 450);
    return () => window.clearTimeout(timer);
  }, []);

  // Reset quest diff tracker whenever selectedDate switches
  useEffect(() => {
    prevCompletedQuestsRef.current = null;
  }, [selectedDate]);

  // Live instant dopamine toast when any individual quest flips to completed
  useEffect(() => {
    if (authMode !== 'authenticated' || !state.profile.roleSelected || !isSettled) return;
    const currentSet = new Set(snapshot.quests.filter((q) => q.completed).map((q) => q.id));

    if (prevCompletedQuestsRef.current === null) {
      prevCompletedQuestsRef.current = currentSet;
      return;
    }

    for (const quest of snapshot.quests) {
      if (quest.completed && !prevCompletedQuestsRef.current.has(quest.id)) {
        notify(`Quest Complete: ${quest.title} (+${quest.xpReward} XP)!`);
      }
    }
    prevCompletedQuestsRef.current = currentSet;
  }, [authMode, isSettled, notify, snapshot.quests, state.profile.roleSelected]);

  // Automatic splash popup when user hits a Streak Milestone or completes today's goal
  useEffect(() => {
    if (authMode !== 'authenticated' || !state.profile.roleSelected) return;
    if (!isSettled) return;

    const todayKey = getTodayDateKey();
    if (selectedDate !== todayKey) return;

    const userKey = authUser?.id || 'anon';

    // Check streak milestone unlock first (3, 7, 14, 30, 60, 100, 365 days)
    const exactMilestone = STREAK_MILESTONES.find((m) => m.days === snapshot.currentStreak);
    if (exactMilestone) {
      const streakStorageKey = `calothrix_streak_celebrated_${userKey}_${exactMilestone.days}`;
      let alreadyCelebratedStreak = false;
      try {
        alreadyCelebratedStreak = Boolean(localStorage.getItem(streakStorageKey));
        if (!alreadyCelebratedStreak) {
          localStorage.setItem(streakStorageKey, '1');
        }
      } catch {
        // Ignore storage errors
      }
      if (!alreadyCelebratedStreak) {
        setActivePayload({
          ...snapshot.celebrationPayload,
          milestoneKey: `streak_${exactMilestone.days}`,
          title: `${exactMilestone.title.toUpperCase()} UNLOCKED!`,
          quote: exactMilestone.shareHeadline,
          subtext: exactMilestone.description,
        });
        setIsOpen(true);
        return;
      }
    }

    if (!snapshot.dailyGoalCelebrationReady) return;

    const storageKey = `calothrix_goal_celebrated_${userKey}_${snapshot.celebrationPayload.milestoneKey}`;
    try {
      if (localStorage.getItem(storageKey)) return;
      localStorage.setItem(storageKey, '1');
    } catch {
      // Ignore storage quota errors
    }

    setActivePayload(snapshot.celebrationPayload);
    setIsOpen(true);
  }, [authMode, authUser?.id, isSettled, selectedDate, snapshot, state.profile.roleSelected]);

  // Manual / replay celebration trigger from HomePage Arena
  useEffect(() => {
    const handleManualTrigger = () => {
      setActivePayload(snapshot.celebrationPayload);
      setIsOpen(true);
    };
    window.addEventListener('calothrix:celebrate', handleManualTrigger);
    return () => window.removeEventListener('calothrix:celebrate', handleManualTrigger);
  }, [snapshot.celebrationPayload]);

  return (
    <GoalCelebrationModal
      isOpen={isOpen}
      payload={activePayload}
      onClose={() => setIsOpen(false)}
    />
  );
};
