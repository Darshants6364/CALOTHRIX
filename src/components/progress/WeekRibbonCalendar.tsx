import React, { useMemo } from 'react';
import { Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import type { NutritionGoals } from '../../types';
import { formatShortDate, parseLocalDateKey } from '../../utils/dateUtils';
import {
  buildCompactMonthGrid,
  classifyCalorieStatus,
  FULL_MONTHS,
  type DailyAggregate,
} from '../../utils/progressAnalytics';

interface WeekRibbonCalendarProps {
  weekDates: string[];
  todayKey: string;
  calendarMonth: { year: number; month: number };
  dailyMap: Map<string, DailyAggregate>;
  goals: NutritionGoals;
  monthExpanded: boolean;
  onToggleMonth: () => void;
  onStepWeek: (delta: number) => void;
  onStepMonth: (delta: number) => void;
  onSelectWeekByDate: (dateKey: string) => void;
  onJumpCurrentWeek: () => void;
  isCurrentWeek: boolean;
}

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_TINY = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export const WeekRibbonCalendar: React.FC<WeekRibbonCalendarProps> = ({
  weekDates,
  todayKey,
  calendarMonth,
  dailyMap,
  goals,
  monthExpanded,
  onToggleMonth,
  onStepWeek,
  onStepMonth,
  onSelectWeekByDate,
  onJumpCurrentWeek,
  isCurrentWeek,
}) => {
  const weekStart = weekDates[0];
  const weekEnd = weekDates[6];
  const weekLabel = `${formatShortDate(weekStart)} – ${formatShortDate(weekEnd)}`;
  const monthLabel = `${FULL_MONTHS[calendarMonth.month]} ${calendarMonth.year}`;

  const monthGrid = useMemo(
    () =>
      monthExpanded
        ? buildCompactMonthGrid({
            year: calendarMonth.year,
            month: calendarMonth.month,
            dailyMap,
            goals,
            todayKey,
          })
        : null,
    [calendarMonth.month, calendarMonth.year, dailyMap, goals, monthExpanded, todayKey]
  );

  const loggedCountThisWeek = useMemo(
    () => weekDates.filter((d) => dailyMap.get(d)?.hasFood).length,
    [dailyMap, weekDates]
  );

  return (
    <section
      aria-label="Weekly calendar selector"
      className="bg-white dark:bg-[#111317] border border-black/8 dark:border-white/10 rounded-2xl p-3 sm:p-4 space-y-2.5"
    >
      {/* Top Compact Bar: Symmetric Week Navigator (zero overlap on 320px+ mobile) */}
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onStepWeek(-1)}
            aria-label="Previous week"
            className="h-9 w-9 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/8 transition-colors shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onToggleMonth}
            aria-expanded={monthExpanded}
            className="min-h-[36px] px-2.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/8 transition-colors inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap min-w-0"
          >
            <Calendar className="w-3.5 h-3.5 text-[#4E6800] dark:text-[#C8FF00] shrink-0" />
            <span className="font-mono-nums truncate">{weekLabel}</span>
            {monthExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onStepWeek(1)}
            disabled={isCurrentWeek}
            aria-label="Next week"
            className="h-9 w-9 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/8 transition-colors disabled:opacity-30 disabled:pointer-events-none shrink-0"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 px-1">
          <span className="text-[11px] font-mono-nums text-slate-500 dark:text-slate-400">
            {loggedCountThisWeek}/7 logged
          </span>
          {!isCurrentWeek && (
            <button
              type="button"
              onClick={onJumpCurrentWeek}
              className="text-[11px] font-semibold text-[#4E6800] dark:text-[#C8FF00] hover:underline whitespace-nowrap"
            >
              Back to this week
            </button>
          )}
        </div>
      </div>

      {/* Sleek Single-Row 7-Day Progress Ribbon */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {weekDates.map((dateKey, idx) => {
          const dt = parseLocalDateKey(dateKey);
          const rec = dailyMap.get(dateKey);
          const isToday = dateKey === todayKey;
          const isFuture = dateKey > todayKey;
          const status =
            !isFuture && rec?.hasFood
              ? classifyCalorieStatus(rec.calories, goals.calories)
              : 'unlogged';
          const pct =
            !isFuture && rec?.hasFood && goals.calories > 0
              ? Math.min(100, Math.round((rec.calories / goals.calories) * 100))
              : 0;

          return (
            <div
              key={dateKey}
              title={`${WEEKDAY_SHORT[idx]} ${formatShortDate(dateKey)}: ${
                rec?.hasFood ? `${rec.calories.toLocaleString()} kcal` : 'Not logged'
              }`}
              className={`rounded-xl py-1.5 px-1 flex flex-col items-center justify-center gap-1 transition-colors ${
                isToday
                  ? 'bg-[#111317] dark:bg-[#C8FF00]/16 ring-1 ring-slate-900 dark:ring-[#C8FF00]/60'
                  : status === 'on_target'
                  ? 'bg-[#C8FF00]/18 dark:bg-[#C8FF00]/10'
                  : status === 'below' || status === 'above'
                  ? 'bg-amber-500/10 dark:bg-amber-500/12'
                  : 'bg-[#F4F3EF]/80 dark:bg-[#090A0C]'
              }`}
            >
              <span
                className={`text-[10px] font-medium leading-none ${
                  isToday
                    ? 'text-white/75 dark:text-[#C8FF00]'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {WEEKDAY_SHORT[idx]}
              </span>
              <span
                className={`text-xs font-bold font-mono-nums leading-none ${
                  isToday
                    ? 'text-white dark:text-white'
                    : isFuture
                    ? 'text-slate-300 dark:text-slate-700'
                    : 'text-slate-900 dark:text-slate-100'
                }`}
              >
                {dt.getDate()}
              </span>

              {/* Tiny Status Indicator / Mini Goal Fill Bar */}
              <div className="h-3 flex items-center justify-center">
                {status === 'on_target' ? (
                  <Check
                    className={`w-3 h-3 stroke-[3] ${
                      isToday
                        ? 'text-[#C8FF00]'
                        : 'text-[#4E6800] dark:text-[#C8FF00]'
                    }`}
                    aria-hidden="true"
                  />
                ) : status === 'below' || status === 'above' ? (
                  <div className="w-5 h-1 rounded-full bg-black/10 dark:bg-white/15 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        status === 'above' ? 'bg-red-500' : 'bg-amber-500'
                      }`}
                      style={{ width: `${Math.max(25, pct)}%` }}
                    />
                  </div>
                ) : (
                  <span
                    className={`w-1 h-1 rounded-full ${
                      isToday
                        ? 'bg-white/40 dark:bg-[#C8FF00]/40'
                        : 'bg-black/10 dark:bg-white/10'
                    }`}
                    aria-hidden="true"
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Expandable Innovative Mini Month Picker (Hidden by default so zero wasted vertical space) */}
      {monthExpanded && monthGrid && (
        <div className="pt-2.5 border-t border-black/8 dark:border-white/10 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onStepMonth(-1)}
              aria-label="Previous month"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/8"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {monthLabel} · Tap any week
            </span>
            <button
              type="button"
              onClick={() => onStepMonth(1)}
              aria-label="Next month"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/8"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {WEEKDAY_TINY.map((d, i) => (
              <div
                key={`${d}-${i}`}
                className="text-center text-[10px] font-medium text-slate-400 dark:text-slate-500"
              >
                {d}
              </div>
            ))}
          </div>

          <div className="space-y-0.5">
            {monthGrid.weeks.map((week) => {
              const isSelectedWeek = week[0]?.date === weekStart;
              return (
                <div
                  key={week[0]?.date}
                  className={`grid grid-cols-7 gap-0.5 p-0.5 rounded-lg transition-colors ${
                    isSelectedWeek
                      ? 'bg-[#111317]/[0.06] dark:bg-[#C8FF00]/12 ring-1 ring-[#4E6800]/30 dark:ring-[#C8FF00]/35'
                      : ''
                  }`}
                >
                  {week.map((cell) => {
                    const hit = cell.status === 'on_target';
                    const logged = cell.status === 'below' || cell.status === 'above';
                    return (
                      <button
                        key={cell.date}
                        type="button"
                        onClick={() => onSelectWeekByDate(cell.date)}
                        className={`h-7 rounded-md flex flex-col items-center justify-center text-[11px] font-mono-nums transition-colors ${
                          !cell.inCurrentMonth
                            ? 'text-slate-300 dark:text-slate-700'
                            : hit
                            ? 'text-[#364900] dark:text-[#C8FF00] font-semibold'
                            : logged
                            ? 'text-amber-700 dark:text-amber-300'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/8'
                        } ${cell.isToday ? 'ring-1 ring-slate-900 dark:ring-white font-bold' : ''}`}
                      >
                        <span className="leading-none">{cell.dayNum}</span>
                        {hit ? (
                          <Check className="w-2 h-2 mt-0.5 stroke-[3]" aria-hidden="true" />
                        ) : logged ? (
                          <span className="w-1 h-1 rounded-full bg-amber-500 mt-0.5" aria-hidden="true" />
                        ) : (
                          <span className="h-1.5" aria-hidden="true" />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};
