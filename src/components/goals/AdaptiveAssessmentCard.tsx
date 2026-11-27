import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Lock,
  PauseCircle,
  Sparkles,
} from 'lucide-react';
import type {
  NutritionGoals,
  UserProfile,
  WeeklyAssessmentDueStatus,
  WeeklyAssessmentRecord,
} from '../../types';
import { formatWeightDisplay } from '../../utils/nutritionUtils';

interface AdaptiveAssessmentCardProps {
  profile: UserProfile;
  goals: NutritionGoals;
  dueStatus: WeeklyAssessmentDueStatus;
  assessments: WeeklyAssessmentRecord[];
  unit: 'kg' | 'lbs';
  loading: boolean;
  onRunAssessment: () => void;
  onOpenModal: (assessment: WeeklyAssessmentRecord) => void;
  onApplyAssessment: (assessment: WeeklyAssessmentRecord) => Promise<boolean>;
  onDismissAssessment: (assessment: WeeklyAssessmentRecord) => Promise<void>;
  onClearManualOverride: () => void;
}

const STATUS_DISPLAY: Record<string, { label: string; className: string }> = {
  on_track: {
    label: 'On Track',
    className: 'text-emerald-700 dark:text-[#C8FF00]',
  },
  targets_updated: {
    label: 'Update Ready',
    className: 'text-sky-700 dark:text-sky-300',
  },
  needs_attention: {
    label: 'Needs Attention',
    className: 'text-amber-700 dark:text-amber-300',
  },
  insufficient_data: {
    label: 'Need More Logs',
    className: 'text-zinc-600 dark:text-zinc-400',
  },
  custom: {
    label: 'Custom Targets Protected',
    className: 'text-sky-700 dark:text-sky-300',
  },
  paused: {
    label: 'Adaptive Paused',
    className: 'text-zinc-600 dark:text-zinc-400',
  },
};

export const AdaptiveAssessmentCard: React.FC<AdaptiveAssessmentCardProps> = ({
  profile,
  goals,
  dueStatus,
  assessments,
  unit,
  loading,
  onRunAssessment,
  onOpenModal,
  onApplyAssessment,
  onDismissAssessment,
  onClearManualOverride,
}) => {
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  const latestAssessment = assessments[0] || null;
  const structured = latestAssessment?.aiSummary?.structured;
  const isPaused = Boolean(profile.adaptivePaused);
  const isCustomActive = Boolean(
    profile.manualOverrideActive || goals.manualOverrideActive || goals.preset === 'custom'
  );

  const rawStatusKey = isPaused
    ? 'paused'
    : isCustomActive
    ? 'custom'
    : latestAssessment?.statusTag ||
      structured?.status ||
      (latestAssessment?.adjustmentType === 'insufficient_data'
        ? 'insufficient_data'
        : latestAssessment && latestAssessment.calorieDeltaKcal !== 0
        ? 'targets_updated'
        : 'on_track');

  const statusMeta = STATUS_DISPLAY[rawStatusKey] || STATUS_DISPLAY.on_track;
  const cycleDays = dueStatus.cycleDays || 14;
  const progressPct = Math.min(100, Math.round((dueStatus.daysSinceLastAnchor / cycleDays) * 100));

  const handleAccept = async (assessment: WeeklyAssessmentRecord) => {
    setApplyingId(assessment.id);
    try {
      await onApplyAssessment(assessment);
    } finally {
      setApplyingId(null);
    }
  };

  const handleKeep = async (assessment: WeeklyAssessmentRecord) => {
    setDismissingId(assessment.id);
    try {
      await onDismissAssessment(assessment);
    } finally {
      setDismissingId(null);
    }
  };

  return (
    <section
      aria-label="14-Day Progress Review"
      className="rounded-2xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#111317] p-4 sm:p-5 space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00] shrink-0" />
          <h2 className="text-sm sm:text-base font-bold text-[#111317] dark:text-white">
            14-Day Progress Review
          </h2>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold">
          {isPaused && <PauseCircle className="w-3.5 h-3.5 text-zinc-500" />}
          {isCustomActive && !isPaused && <Lock className="w-3.5 h-3.5 text-sky-500" />}
          <span className={statusMeta.className}>{statusMeta.label}</span>
          <span className="text-[#52555E] dark:text-[#9A9CA3] font-mono-nums tabular-nums font-normal">
            · Day {Math.min(cycleDays, dueStatus.daysSinceLastAnchor)} of {cycleDays}
          </span>
        </div>
      </div>

      {/* 14-Day Cycle Countdown Bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-[#52555E] dark:text-[#9A9CA3] font-mono-nums tabular-nums">
          <span>
            {dueStatus.isDue
              ? 'Your 14-day progress review is ready!'
              : `${dueStatus.foodLoggedDays}/${cycleDays} food days · ${dueStatus.weightLoggedDays} weigh-ins logged`}
          </span>
          <span>
            {dueStatus.isDue
              ? 'Ready now'
              : `${dueStatus.daysRemaining} ${dueStatus.daysRemaining === 1 ? 'day' : 'days'} left`}
          </span>
        </div>
        <div className="h-2 rounded-full bg-stone-200/80 dark:bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-[#111317] dark:bg-[#C8FF00] transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Custom Targets Protection Banner */}
      {isCustomActive && (
        <div className="rounded-xl border border-black/8 dark:border-white/10 bg-stone-50/60 dark:bg-[#090A0C]/60 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-[#52555E] dark:text-[#9A9CA3] leading-relaxed">
            Custom targets are active. Automatic 14-day target prompts are paused so your custom
            plan is never overwritten without your request.
          </p>
          <button
            type="button"
            onClick={onClearManualOverride}
            className="min-h-[44px] px-3.5 rounded-xl border border-black/10 dark:border-white/15 text-xs font-semibold text-[#111317] dark:text-white hover:bg-stone-100 dark:hover:bg-white/5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Re-Enable Auto Reviews
          </button>
        </div>
      )}

      {latestAssessment ? (
        <div className="space-y-3.5">
          {/* Plain-English Review Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="rounded-xl border border-black/8 dark:border-white/10 bg-stone-50/60 dark:bg-[#090A0C]/60 p-3">
              <div className="text-[11px] text-[#52555E] dark:text-[#9A9CA3]">
                Recommended Calories
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-sm font-bold font-mono-nums tabular-nums text-[#111317] dark:text-white">
                <span>{latestAssessment.previousRecommendedCalories.toLocaleString()}</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="text-[#4E6800] dark:text-[#C8FF00]">
                  {latestAssessment.recommendedCalories.toLocaleString()} kcal
                </span>
              </div>
              <div className="text-[11px] text-[#52555E] dark:text-[#9A9CA3] font-mono-nums tabular-nums mt-0.5">
                {latestAssessment.calorieDeltaKcal
                  ? `${latestAssessment.calorieDeltaKcal > 0 ? '+' : ''}${latestAssessment.calorieDeltaKcal} kcal/day change`
                  : 'No calorie change needed'}
              </div>
            </div>

            <div className="rounded-xl border border-black/8 dark:border-white/10 bg-stone-50/60 dark:bg-[#090A0C]/60 p-3">
              <div className="text-[11px] text-[#52555E] dark:text-[#9A9CA3]">
                14-Day Weight Trend
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-sm font-bold font-mono-nums tabular-nums text-[#111317] dark:text-white">
                <span>
                  {formatWeightDisplay(
                    latestAssessment.previous7dAvgWeightKg ?? latestAssessment.previousWeightKg,
                    unit
                  )}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>
                  {formatWeightDisplay(
                    latestAssessment.current7dAvgWeightKg ?? latestAssessment.assessedWeightKg,
                    unit
                  )}
                </span>
              </div>
              <div className="text-[11px] text-[#52555E] dark:text-[#9A9CA3] font-mono-nums tabular-nums mt-0.5">
                Avg intake {latestAssessment.avgDailyCalories.toLocaleString()} kcal/day
              </div>
            </div>

            <div className="rounded-xl border border-black/8 dark:border-white/10 bg-stone-50/60 dark:bg-[#090A0C]/60 p-3">
              <div className="text-[11px] text-[#52555E] dark:text-[#9A9CA3]">
                Recommended Macros
              </div>
              <div className="mt-1 text-sm font-bold font-mono-nums tabular-nums text-[#111317] dark:text-white">
                {latestAssessment.recommendedProtein}P · {latestAssessment.recommendedCarbs}C ·{' '}
                {latestAssessment.recommendedFat}F
              </div>
              <div className="text-[11px] text-[#52555E] dark:text-[#9A9CA3] font-mono-nums tabular-nums mt-0.5">
                Fibre {latestAssessment.recommendedFibre}g ·{' '}
                <span className="capitalize">{latestAssessment.status}</span>
              </div>
            </div>
          </div>

          {/* Plain-English Summary */}
          <div className="rounded-xl border border-black/8 dark:border-white/10 bg-stone-50/60 dark:bg-[#090A0C]/60 p-3.5 space-y-1">
            <p className="text-xs sm:text-sm text-[#111317] dark:text-zinc-100 leading-relaxed">
              {structured?.summary || latestAssessment.aiSummary.bodyChangeAnalysis}
            </p>
            <p className="text-xs text-[#52555E] dark:text-[#9A9CA3] leading-relaxed">
              {structured?.reason || latestAssessment.adjustmentReason}
            </p>
          </div>

          {/* Actions: Accept New Targets / Keep Current Targets / View Review */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              {latestAssessment.status === 'pending' &&
                latestAssessment.confidenceLevel !== 'low' && (
                  <>
                    <button
                      type="button"
                      disabled={applyingId === latestAssessment.id}
                      onClick={() => void handleAccept(latestAssessment)}
                      className="min-h-[44px] px-4 rounded-xl bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black text-xs sm:text-sm font-bold hover:opacity-90 transition inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-60"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {applyingId === latestAssessment.id
                          ? 'Applying...'
                          : 'Accept New Targets'}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={dismissingId === latestAssessment.id}
                      onClick={() => void handleKeep(latestAssessment)}
                      className="min-h-[44px] px-4 rounded-xl border border-black/15 dark:border-white/15 text-xs sm:text-sm font-semibold text-[#111317] dark:text-zinc-200 hover:bg-stone-100 dark:hover:bg-white/5 whitespace-nowrap cursor-pointer disabled:opacity-60"
                    >
                      Keep Current Targets
                    </button>
                  </>
                )}

              <button
                type="button"
                onClick={() => onOpenModal(latestAssessment)}
                className="min-h-[44px] px-4 rounded-xl border border-black/15 dark:border-white/15 text-xs sm:text-sm font-semibold text-[#111317] dark:text-zinc-200 hover:bg-stone-100 dark:hover:bg-white/5 whitespace-nowrap cursor-pointer"
              >
                Open Full Review
              </button>
            </div>

            <button
              type="button"
              disabled={loading || isPaused}
              onClick={onRunAssessment}
              className="min-h-[44px] px-4 rounded-xl border border-black/15 dark:border-[#C8FF00]/45 text-xs sm:text-sm font-bold text-[#111317] dark:text-[#C8FF00] hover:bg-stone-100 dark:hover:bg-[#C8FF00]/10 transition whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Analyzing...' : 'Run 14-Day Review'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-black/8 dark:border-white/10 bg-stone-50/60 dark:bg-[#090A0C]/60 p-3.5 flex items-start gap-2.5 text-xs sm:text-sm text-[#52555E] dark:text-zinc-300">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-[#111317] dark:text-white">
                {dueStatus.readinessMessage}
              </p>
              <p className="text-xs text-[#52555E] dark:text-[#9A9CA3]">
                Next automatic review date: {dueStatus.nextAssessmentDate}. For reliable target
                updates, log at least 9 food days and 5 weigh-ins over 14 days.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={loading || isPaused}
            onClick={onRunAssessment}
            className="min-h-[44px] px-4 rounded-xl border border-[#111317] dark:border-[#C8FF00]/50 text-[#111317] dark:text-[#C8FF00] text-xs sm:text-sm font-bold hover:bg-[#111317] hover:text-white dark:hover:bg-[#C8FF00]/10 transition inline-flex items-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            <span>{loading ? 'Analyzing 14-Day Logs...' : 'Run 14-Day Review Now'}</span>
          </button>
        </div>
      )}
    </section>
  );
};
