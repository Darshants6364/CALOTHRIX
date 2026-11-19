import React, { useMemo, useRef } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Flame } from 'lucide-react';
import { useMacroLogStore } from '../hooks/useMacroLogStore';
import {
  addDaysToDateKey,
  formatReadableDate,
  formatWeekdayShort,
  getDateStripAround,
  getTodayDateKey,
  parseLocalDateKey,
} from '../utils/dateUtils';
import { computeAdvancedStreakAnalytics } from '../utils/gamificationUtils';
import { StreakFireIcon } from './StreakFireIcon';

interface DateStripProps {
  selectedDate: string;
  onSelectDate: (dateKey: string) => void;
}

export const DateStrip: React.FC<DateStripProps> = ({ selectedDate, onSelectDate }) => {
  const { state } = useMacroLogStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const today = getTodayDateKey();
  const stripDates = getDateStripAround(selectedDate, 3);
  const calorieGoal = state.goals.calories;

  // Map calories per date in the visible 7-day strip
  const caloriesByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of state.foodEntries) {
      map.set(entry.date, (map.get(entry.date) || 0) + (entry.calories || 0));
    }
    return map;
  }, [state.foodEntries]);

  const streakAnalytics = useMemo(
    () =>
      computeAdvancedStreakAnalytics({
        foodEntries: state.foodEntries,
        goals: state.goals,
        todayKey: today,
      }),
    [state.foodEntries, state.goals, today]
  );

  const openNativePicker = () => {
    const el = inputRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') {
      el.showPicker();
    } else {
      el.click();
    }
  };

  // Circle ring geometry (r=13 inside 32x32 viewBox so 16px streak fire fits prominently inside)
  const radius = 13;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onSelectDate(addDaysToDateKey(selectedDate, -1))}
            aria-label="Previous day"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#111317] text-slate-600 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-[#14161C] transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={openNativePicker}
            className="relative min-h-[40px] px-3.5 rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#111317] text-sm font-medium text-slate-800 dark:text-slate-100 hover:bg-stone-50 dark:hover:bg-[#14161C] transition-colors inline-flex items-center gap-2 whitespace-nowrap"
          >
            <Calendar className="w-4 h-4 text-[#4E6800] dark:text-[#C8FF00] shrink-0" />
            <span>{formatReadableDate(selectedDate)}</span>
            <input
              ref={inputRef}
              type="date"
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) onSelectDate(e.target.value);
              }}
              aria-label="Pick calendar date"
              className="sr-only"
            />
          </button>

          <button
            type="button"
            onClick={() => onSelectDate(addDaysToDateKey(selectedDate, 1))}
            aria-label="Next day"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-black/10 dark:border-white/12 bg-white dark:bg-[#111317] text-slate-600 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-[#14161C] transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* Streak counter pinned right at the top of the calendar strip */}
          <div
            className={`min-h-[40px] px-3 rounded-xl border bg-white dark:bg-[#111317] inline-flex items-center gap-1.5 text-xs font-semibold tabular-nums whitespace-nowrap ${
              streakAnalytics.currentStreak > 0
                ? 'border-orange-500/35 dark:border-orange-400/35'
                : 'border-black/10 dark:border-white/12'
            }`}
            title={`Current streak: ${streakAnalytics.currentStreak} days · Best: ${streakAnalytics.longestStreak} days`}
          >
            <StreakFireIcon active={streakAnalytics.currentStreak > 0} />
            <span className="text-slate-900 dark:text-slate-100 font-mono-nums">
              {streakAnalytics.currentStreak}
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              {streakAnalytics.currentStreak === 1 ? 'Day Streak' : 'Days Streak'}
            </span>
          </div>

          {selectedDate !== today && (
            <button
              type="button"
              onClick={() => onSelectDate(today)}
              className="min-h-[40px] px-3.5 rounded-xl bg-[#C8FF00]/20 text-[#4E6800] dark:text-[#C8FF00] border border-[#C8FF00]/35 text-xs font-semibold hover:bg-[#C8FF00]/30 transition-colors whitespace-nowrap shrink-0"
            >
              Jump to Today
            </button>
          )}
        </div>
      </div>

      {/* 7-day horizontal touch strip with daily intake progress rings */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {stripDates.map((dKey) => {
          const isSelected = dKey === selectedDate;
          const isToday = dKey === today;
          const dayNum = parseLocalDateKey(dKey).getDate();
          const weekday = formatWeekdayShort(dKey).slice(0, 3);
          const dayCalories = Math.round(caloriesByDate.get(dKey) || 0);

          let ratio = 0;
          if (dayCalories > 0) {
            if (calorieGoal > 0) {
              const raw = dayCalories / calorieGoal;
              // Keep tiny visible gap when < 100% (e.g. 99% shows partial dough), close fully at >= 100%
              ratio = raw >= 1 ? 1 : Math.min(0.95, Math.max(0.08, raw));
            } else {
              ratio = 0.65;
            }
          }
          const pctDisplay =
            calorieGoal > 0
              ? Math.round((dayCalories / calorieGoal) * 100)
              : dayCalories > 0
              ? 100
              : 0;
          const strokeDashoffset = circumference * (1 - ratio);
          // Show fire icon inside the circle once a day is completed (any past logged day, or today once >= 100%)
          const isCompletedStreakDay = dayCalories > 0 && (dKey < today || pctDisplay >= 100);

          return (
            <button
              key={dKey}
              type="button"
              onClick={() => onSelectDate(dKey)}
              title={
                calorieGoal > 0
                  ? `${formatReadableDate(dKey)}: ${dayCalories.toLocaleString()} / ${calorieGoal.toLocaleString()} kcal (${pctDisplay}%)`
                  : `${formatReadableDate(dKey)}: ${dayCalories.toLocaleString()} kcal logged`
              }
              className={`min-h-[82px] py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-1 transition-colors border ${
                isSelected
                  ? 'bg-[#111317] dark:bg-[#C8FF00] text-white dark:text-black border-[#111317] dark:border-[#C8FF00] font-semibold'
                  : isToday
                  ? 'bg-[#C8FF00]/12 text-[#4E6800] dark:text-[#C8FF00] border-[#4E6800]/30 dark:border-[#C8FF00]/40 hover:bg-[#C8FF00]/20'
                  : 'bg-white dark:bg-[#111317] text-slate-600 dark:text-slate-400 border-black/10 dark:border-white/12 hover:border-black/25 dark:hover:border-white/25'
              }`}
            >
              <span className="text-[11px] leading-tight opacity-80">{weekday}</span>
              <span className="text-sm font-bold tabular-nums leading-none">{dayNum}</span>

              {/* Circular intake progress ring with streak fire icon inside once completed */}
              <div className="relative w-8 h-8 flex items-center justify-center mt-0.5">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 32 32"
                  className="-rotate-90 block"
                  aria-hidden="true"
                >
                  <circle
                    cx="16"
                    cy="16"
                    r={radius}
                    fill="none"
                    stroke={
                      isSelected
                        ? 'rgba(255,255,255,0.24)'
                        : 'currentColor'
                    }
                    strokeOpacity={isSelected ? 1 : 0.16}
                    strokeWidth="2.6"
                  />
                  {ratio > 0 && (
                    <circle
                      cx="16"
                      cy="16"
                      r={radius}
                      fill="none"
                      stroke={
                        isSelected
                          ? '#090A0C'
                          : pctDisplay >= 100
                          ? '#C8FF00'
                          : '#84cc16'
                      }
                      className={isSelected ? 'stroke-white dark:stroke-[#090A0C]' : ''}
                      strokeWidth="2.6"
                      strokeLinecap={ratio >= 1 ? 'butt' : 'round'}
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                    />
                  )}
                </svg>

                {isCompletedStreakDay && (
                  <Flame
                    className={`w-3.5 h-3.5 absolute inset-0 m-auto z-10 pointer-events-none ${
                      isSelected
                        ? 'text-white dark:text-[#090A0C]'
                        : 'text-lime-600 dark:text-[#C8FF00]'
                    }`}
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
