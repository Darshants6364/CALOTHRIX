import React from 'react';
import { CalendarCheck2, ChevronRight, Sparkles, Trophy } from 'lucide-react';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import { formatWeightDisplay } from '../utils/nutritionUtils';

interface WeeklyAssessmentBannerProps {
  compact?: boolean;
  className?: string;
}

export const WeeklyAssessmentBanner: React.FC<WeeklyAssessmentBannerProps> = ({
  compact = false,
  className = '',
}) => {
  const {
    state,
    assessmentDueStatus,
    runWeeklyAssessment,
    openWeeklyAssessmentModal,
    weeklyAssessmentModal,
  } = useMacroLogStore();

  const unit = state.settings.weightUnit;
  const hasProfileReady = state.profile.heightCm >= 120 && state.profile.age >= 14;
  if (!hasProfileReady) return null;

  // Only show the quiet notification banner when an assessment is due OR goal target is reached
  if (!assessmentDueStatus.isDue && !assessmentDueStatus.goalCompleted) {
    return null;
  }

  const handleOpen = () => {
    if (
      assessmentDueStatus.existingAssessment &&
      assessmentDueStatus.existingAssessment.status === 'pending'
    ) {
      openWeeklyAssessmentModal(assessmentDueStatus.existingAssessment);
    } else {
      void runWeeklyAssessment({ openModal: true });
    }
  };

  const weightText =
    assessmentDueStatus.latestWeightKg !== null
      ? formatWeightDisplay(assessmentDueStatus.latestWeightKg, unit)
      : '—';

  const deltaText =
    assessmentDueStatus.weeklyDeltaKg !== null
      ? `${assessmentDueStatus.weeklyDeltaKg > 0 ? '+' : ''}${assessmentDueStatus.weeklyDeltaKg.toFixed(1)} kg trend`
      : 'Baseline week';

  const confidenceText =
    assessmentDueStatus.confidenceLevel === 'high'
      ? 'High confidence'
      : assessmentDueStatus.confidenceLevel === 'moderate'
      ? 'Moderate confidence'
      : 'Low data confidence';

  return (
    <div
      className={`rounded-2xl border border-[#C8FF00]/35 bg-[#111317] text-white dark:bg-[#111317] dark:border-[#C8FF00]/30 shadow-sm overflow-hidden ${className}`}
    >
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${compact ? 'p-3.5' : 'p-4'}`}>
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#C8FF00]">
            {assessmentDueStatus.goalCompleted ? (
              <Trophy className="w-4 h-4 shrink-0" />
            ) : (
              <Sparkles className="w-4 h-4 shrink-0" />
            )}
            <span className="truncate">
              {assessmentDueStatus.goalCompleted
                ? 'Goal Weight Reached — Maintenance Ready'
                : '7-Day AI Assessment Ready'}
            </span>
          </div>

          <p className="text-xs sm:text-sm text-zinc-300 leading-snug">
            <span className="font-mono-nums tabular-nums text-white font-semibold">
              {weightText}
            </span>
            <span className="mx-1.5 text-zinc-500">·</span>
            <span className="font-mono-nums tabular-nums">{deltaText}</span>
            <span className="mx-1.5 text-zinc-500">·</span>
            <span className="font-mono-nums tabular-nums">
              {assessmentDueStatus.foodLoggedDays}/7 food days
            </span>
            <span className="mx-1.5 text-zinc-500">·</span>
            <span
              className={
                assessmentDueStatus.confidenceLevel === 'low'
                  ? 'text-amber-300 font-medium'
                  : 'text-emerald-300 font-medium'
              }
            >
              {confidenceText}
            </span>
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpen}
          disabled={weeklyAssessmentModal.loading}
          className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl bg-[#C8FF00] text-[#090A0C] text-xs sm:text-sm font-bold tracking-tight hover:bg-[#d8ff4d] active:scale-[0.99] transition shrink-0 cursor-pointer disabled:opacity-60"
        >
          <CalendarCheck2 className="w-4 h-4 shrink-0" />
          <span>
            {weeklyAssessmentModal.loading
              ? 'Analyzing...'
              : assessmentDueStatus.goalCompleted
              ? 'Review Maintenance'
              : 'Review Check-In'}
          </span>
          <ChevronRight className="w-4 h-4 shrink-0" />
        </button>
      </div>
    </div>
  );
};
