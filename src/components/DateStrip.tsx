import React, { useRef } from 'react';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  addDaysToDateKey,
  formatReadableDate,
  formatWeekdayShort,
  getDateStripAround,
  getTodayDateKey,
  parseLocalDateKey,
} from '../utils/dateUtils';

interface DateStripProps {
  selectedDate: string;
  onSelectDate: (dateKey: string) => void;
}

export const DateStrip: React.FC<DateStripProps> = ({ selectedDate, onSelectDate }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const today = getTodayDateKey();
  const stripDates = getDateStripAround(selectedDate, 3);

  const openNativePicker = () => {
    const el = inputRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') {
      el.showPicker();
    } else {
      el.click();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onSelectDate(addDaysToDateKey(selectedDate, -1))}
            aria-label="Previous day"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-[#121821] text-slate-600 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-800 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={openNativePicker}
            className="relative min-h-[40px] px-3.5 rounded-xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-[#121821] text-sm font-medium text-slate-800 dark:text-slate-100 hover:bg-stone-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-2 whitespace-nowrap"
          >
            <Calendar className="w-4 h-4 text-lime-600 dark:text-lime-400 shrink-0" />
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
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-[#121821] text-slate-600 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-800 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {selectedDate !== today && (
          <button
            type="button"
            onClick={() => onSelectDate(today)}
            className="min-h-[40px] px-3.5 rounded-xl bg-lime-100 dark:bg-lime-950/70 text-lime-800 dark:text-lime-300 text-xs font-semibold hover:bg-lime-200/80 dark:hover:bg-lime-900/70 transition-colors whitespace-nowrap shrink-0"
          >
            Jump to Today
          </button>
        )}
      </div>

      {/* 7-day horizontal touch strip */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {stripDates.map((dKey) => {
          const isSelected = dKey === selectedDate;
          const isToday = dKey === today;
          const dayNum = parseLocalDateKey(dKey).getDate();
          const weekday = formatWeekdayShort(dKey).slice(0, 3);
          return (
            <button
              key={dKey}
              type="button"
              onClick={() => onSelectDate(dKey)}
              className={`min-h-[52px] py-1.5 px-1 rounded-xl flex flex-col items-center justify-center transition-colors border ${
                isSelected
                  ? 'bg-slate-900 dark:bg-lime-500 text-white dark:text-slate-950 border-slate-900 dark:border-lime-500 font-semibold'
                  : isToday
                  ? 'bg-lime-50 dark:bg-lime-950/30 text-lime-800 dark:text-lime-300 border-lime-200 dark:border-lime-900/60 hover:bg-lime-100/70'
                  : 'bg-white dark:bg-[#121821] text-slate-600 dark:text-slate-400 border-stone-200/80 dark:border-slate-800 hover:border-stone-300 dark:hover:border-slate-700'
              }`}
            >
              <span className="text-[11px] leading-tight opacity-80">{weekday}</span>
              <span className="text-sm font-semibold tabular-nums mt-0.5">{dayNum}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
