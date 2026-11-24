import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import type { FitnessGoalType } from '../types';
import { SMART_FITNESS_GOAL_META } from '../utils/fitnessCalculator';
import { formatWeightDisplay } from '../utils/nutritionUtils';

export const WeeklyAssessmentModal: React.FC = () => {
  const {
    state,
    weeklyAssessmentModal,
    closeWeeklyAssessmentModal,
    applyWeeklyAssessment,
    dismissWeeklyAssessment,
    runWeeklyAssessment,
  } = useMacroLogStore();

  const [applying, setApplying] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [selectedNextGoal, setSelectedNextGoal] = useState<FitnessGoalType>('maintain_weight');

  if (!weeklyAssessmentModal.isOpen) return null;

  const { assessment, loading, error } = weeklyAssessmentModal;
  const unit = state.settings.weightUnit;

  const handleApply = async (switchToMaintenance?: boolean, newGoal?: FitnessGoalType) => {
    if (!assessment) return;
    setApplying(true);
    try {
      await applyWeeklyAssessment(assessment, { switchToMaintenance, newGoal });
    } finally {
      setApplying(false);
    }
  };

  const handleKeepCurrent = async () => {
    if (!assessment) {
      closeWeeklyAssessmentModal();
      return;
    }
    await dismissWeeklyAssessment(assessment);
  };

  const isLowConfidence = assessment?.confidenceLevel === 'low';
  const isApplied = assessment?.status === 'applied';
  const cycleDays = assessment?.cycleDays || 14;

  const weightChange =
    assessment !== null && assessment !== undefined
      ? Math.round((assessment.assessedWeightKg - assessment.previousWeightKg) * 100) / 100
      : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Your 14-Day Progress Review"
    >
      <div className="w-full sm:max-w-2xl max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[#F4F3EF] dark:bg-[#090A0C] border border-zinc-200 dark:border-white/10 shadow-2xl overflow-hidden">
        {/* Sticky Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-zinc-200 dark:border-white/10 bg-white dark:bg-[#111317] shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500 dark:text-[#C8FF00]">
              {assessment?.goalCompleted ? (
                <Trophy className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>
                {assessment
                  ? `Review ${assessment.assessmentWeekNumber} · ${assessment.weekStartDate} to ${assessment.weekEndDate}`
                  : '14-Day Progress Review'}
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-zinc-950 dark:text-white truncate mt-0.5">
              {loading
                ? 'Preparing Your 14-Day Progress Review...'
                : assessment?.aiSummary.headline || 'Your 14-Day Progress Review'}
            </h2>
          </div>

          <button
            type="button"
            onClick={closeWeeklyAssessmentModal}
            aria-label="Close 14-day progress review"
            className="min-h-[44px] min-w-[44px] rounded-xl border border-zinc-200 dark:border-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-zinc-900 dark:text-[#C8FF00]" />
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Reviewing your 14-day weight trend and average nutrition intake...
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Your active targets stay untouched until you confirm.
              </p>
            </div>
          ) : error || !assessment ? (
            <div className="rounded-2xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-4 space-y-3">
              <p className="text-sm font-medium text-red-700 dark:text-red-300">
                {error || 'Could not load 14-day review data.'}
              </p>
              <button
                type="button"
                onClick={() => void runWeeklyAssessment({ openModal: true, forceRecompute: true })}
                className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl bg-zinc-900 dark:bg-[#C8FF00] text-white dark:text-[#090A0C] text-xs font-semibold cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                Retry Review
              </button>
            </div>
          ) : (
            <>
              {isApplied && (
                <div className="rounded-2xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3 flex items-center gap-2.5 text-xs sm:text-sm text-emerald-800 dark:text-emerald-200">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    Accepted on{' '}
                    {assessment.appliedAt
                      ? new Date(assessment.appliedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : assessment.weekEndDate}
                    . Your active Goals &amp; Daily Log targets have been updated.
                  </span>
                </div>
              )}

              {isLowConfidence && (
                <div className="rounded-2xl border border-amber-300/70 dark:border-amber-500/35 bg-amber-50 dark:bg-amber-500/10 p-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Not Enough Data Yet — Targets Unchanged
                  </div>
                  <p className="text-xs sm:text-sm text-amber-900/90 dark:text-amber-100/90 leading-relaxed">
                    {assessment.adjustmentReason}
                  </p>
                </div>
              )}

              {assessment.goalCompleted && (
                <div className="rounded-2xl border border-[#C8FF00]/50 bg-[#111317] text-white p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#C8FF00]">
                    <Trophy className="w-4 h-4 shrink-0" />
                    Goal Weight Reached — Ready for Maintenance
                  </div>
                  <p className="text-xs sm:text-sm text-zinc-200 leading-relaxed">
                    {assessment.adjustmentReason}
                  </p>
                </div>
              )}

              {/* Summary Grid: Weight Change, Previous Target vs Actual Intake, Recommended Targets */}
              <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#111317] p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                    14-Day Progress Summary
                  </h3>
                  <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 font-mono-nums tabular-nums">
                    {assessment.foodLoggedDays}/{cycleDays} food days · {assessment.weightLoggedDays}{' '}
                    weigh-ins
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Weight Change */}
                  <div className="rounded-xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/80 dark:border-white/8 p-3">
                    <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                      Weight Change
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-sm sm:text-base font-bold font-mono-nums tabular-nums text-zinc-950 dark:text-white">
                      <span>{formatWeightDisplay(assessment.previousWeightKg, unit)}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span>{formatWeightDisplay(assessment.assessedWeightKg, unit)}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 font-mono-nums tabular-nums">
                      Change:{' '}
                      <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                        {weightChange > 0 ? '+' : ''}
                        {weightChange.toFixed(1)} kg
                      </span>
                      {assessment.projectedWeeksToGoal
                        ? ` · ~${assessment.projectedWeeksToGoal} wks to goal`
                        : ''}
                    </div>
                  </div>

                  {/* Previous Target vs Actual Avg Intake */}
                  <div className="rounded-xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/80 dark:border-white/8 p-3">
                    <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                      Previous Target vs Actual Average Intake
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-sm sm:text-base font-bold font-mono-nums tabular-nums text-zinc-950 dark:text-white">
                      <span>{assessment.previousRecommendedCalories.toLocaleString()} target</span>
                      <span className="text-zinc-400">·</span>
                      <span className="text-sky-600 dark:text-sky-400">
                        {assessment.avgDailyCalories.toLocaleString()} avg
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 font-mono-nums tabular-nums">
                      Avg macros: {Math.round(assessment.avgDailyProtein)}P ·{' '}
                      {Math.round(assessment.avgDailyCarbs ?? 0)}C ·{' '}
                      {Math.round(assessment.avgDailyFat ?? 0)}F ({Math.round(assessment.adherencePercentage)}
                      % on target)
                    </div>
                  </div>

                  {/* Recommended Daily Calories */}
                  <div className="rounded-xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/80 dark:border-white/8 p-3">
                    <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                      Recommended Calories
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-sm sm:text-base font-bold font-mono-nums tabular-nums text-zinc-950 dark:text-white">
                      <span>{assessment.previousRecommendedCalories.toLocaleString()}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span className="text-zinc-950 dark:text-[#C8FF00]">
                        {assessment.recommendedCalories.toLocaleString()} kcal
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 font-mono-nums tabular-nums">
                      {assessment.calorieDeltaKcal && assessment.calorieDeltaKcal !== 0
                        ? `${assessment.calorieDeltaKcal > 0 ? '+' : ''}${assessment.calorieDeltaKcal} kcal/day adjustment`
                        : 'Current calories are working well'}
                    </div>
                  </div>

                  {/* Recommended Macros */}
                  <div className="rounded-xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-200/80 dark:border-white/8 p-3">
                    <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                      Recommended Daily Macros
                    </div>
                    <div className="mt-1 grid grid-cols-4 gap-1.5 text-center font-mono-nums tabular-nums">
                      <div>
                        <div className="text-[10px] text-zinc-500 dark:text-zinc-400">P</div>
                        <div className="text-xs sm:text-sm font-bold text-zinc-950 dark:text-white">
                          {assessment.recommendedProtein}g
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-zinc-500 dark:text-zinc-400">C</div>
                        <div className="text-xs sm:text-sm font-bold text-zinc-950 dark:text-white">
                          {assessment.recommendedCarbs}g
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-zinc-500 dark:text-zinc-400">F</div>
                        <div className="text-xs sm:text-sm font-bold text-zinc-950 dark:text-white">
                          {assessment.recommendedFat}g
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-zinc-500 dark:text-zinc-400">Fib</div>
                        <div className="text-xs sm:text-sm font-bold text-zinc-950 dark:text-white">
                          {assessment.recommendedFibre}g
                        </div>
                      </div>
                    </div>
                    {assessment.previousRecommendedProtein !== undefined && (
                      <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 font-mono-nums tabular-nums">
                        Prev: {assessment.previousRecommendedProtein}P /{' '}
                        {assessment.previousRecommendedCarbs}C / {assessment.previousRecommendedFat}F
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Plain-English Explanation */}
              <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#111317] p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-zinc-700 dark:text-[#C8FF00]" />
                    What Happened &amp; Next Steps
                  </h3>
                </div>

                <div className="space-y-2.5 text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                  {assessment.aiSummary.structured?.summary && (
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">
                      {assessment.aiSummary.structured.summary}
                    </p>
                  )}

                  <p>{assessment.aiSummary.bodyChangeAnalysis}</p>
                  <p>{assessment.aiSummary.calorieAdjustmentReason}</p>

                  {assessment.aiSummary.actionableTips.length > 0 && (
                    <div className="pt-1">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                        Practical Tips for the Next 14 Days
                      </div>
                      <ul className="space-y-1.5">
                        {assessment.aiSummary.actionableTips.map((tip, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-zinc-900 dark:bg-[#C8FF00] shrink-0" />
                            <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="pt-2 border-t border-zinc-200/80 dark:border-white/8 flex items-start gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                    <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-zinc-600 dark:text-zinc-300" />
                    <span>{assessment.aiSummary.confidenceExplanation}</span>
                  </div>

                  {/* Collapsible Technical Details (hidden by default) */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowTechnicalDetails((v) => !v)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer py-1"
                    >
                      <span>Technical details</span>
                      {showTechnicalDetails ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {showTechnicalDetails && (
                      <div className="mt-1.5 rounded-xl bg-zinc-50 dark:bg-[#090A0C] border border-zinc-200/80 dark:border-white/8 p-3 text-[11px] font-mono-nums tabular-nums text-zinc-600 dark:text-zinc-400 space-y-1">
                        <div>
                          Smoothed trend: {formatWeightDisplay(assessment.previousTrendWeightKg, unit)}{' '}
                          → {formatWeightDisplay(assessment.assessedTrendWeightKg, unit)}
                        </div>
                        <div>
                          Calibrated maintenance: {assessment.priorTdeeKcal.toLocaleString()} →{' '}
                          {isLowConfidence
                            ? assessment.priorTdeeKcal.toLocaleString()
                            : assessment.calibratedTdeeKcal.toLocaleString()}{' '}
                          kcal/day
                        </div>
                        <div>Engine: {assessment.calculationVersion}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Goal Completion Transition Goal Picker */}
              {assessment.goalCompleted && !isApplied && (
                <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#111317] p-4 space-y-2.5">
                  <div className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                    Choose Your Next Goal
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(['maintain_weight', 'recomposition', 'build_muscle'] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setSelectedNextGoal(g)}
                        className={`min-h-[44px] px-3 py-2 rounded-xl border text-left text-xs font-semibold transition cursor-pointer ${
                          selectedNextGoal === g
                            ? 'border-zinc-950 bg-zinc-950 text-white dark:border-[#C8FF00] dark:bg-[#C8FF00]/15 dark:text-[#C8FF00]'
                            : 'border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300'
                        }`}
                      >
                        {SMART_FITNESS_GOAL_META[g].label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Sticky Footer Actions */}
        {!loading && assessment && (
          <div className="px-4 sm:px-6 py-3.5 border-t border-zinc-200 dark:border-white/10 bg-white dark:bg-[#111317] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shrink-0 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
            {!isApplied ? (
              isLowConfidence ? (
                <button
                  type="button"
                  onClick={() => void handleKeepCurrent()}
                  className="w-full min-h-[44px] px-5 rounded-xl bg-zinc-950 dark:bg-[#C8FF00] text-white dark:text-[#090A0C] text-sm font-bold cursor-pointer"
                >
                  Keep Current Targets &amp; Log More Data
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void handleKeepCurrent()}
                    className="min-h-[44px] px-4 rounded-xl border border-zinc-300 dark:border-white/15 text-xs sm:text-sm font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/5 cursor-pointer whitespace-nowrap"
                  >
                    Keep Current Targets
                  </button>
                  <button
                    type="button"
                    disabled={applying}
                    onClick={() =>
                      void handleApply(
                        assessment.goalCompleted && selectedNextGoal === 'maintain_weight',
                        assessment.goalCompleted ? selectedNextGoal : undefined
                      )
                    }
                    className="min-h-[44px] px-5 rounded-xl bg-zinc-950 dark:bg-[#C8FF00] text-white dark:text-[#090A0C] text-xs sm:text-sm font-bold hover:opacity-95 active:scale-[0.99] transition cursor-pointer disabled:opacity-60 inline-flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      {applying
                        ? 'Applying...'
                        : assessment.goalCompleted
                        ? `Accept & Switch to ${SMART_FITNESS_GOAL_META[selectedNextGoal as keyof typeof SMART_FITNESS_GOAL_META]?.shortLabel || 'Maintenance'}`
                        : 'Accept New Targets'}
                    </span>
                  </button>
                </>
              )
            ) : (
              <button
                type="button"
                onClick={closeWeeklyAssessmentModal}
                className="w-full min-h-[44px] px-5 rounded-xl bg-zinc-950 dark:bg-[#C8FF00] text-white dark:text-[#090A0C] text-sm font-bold cursor-pointer"
              >
                Done
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
