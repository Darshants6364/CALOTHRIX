/**
 * Local calendar date utilities (never shifts dates across UTC midnight boundaries).
 */

export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayDateKey(): string {
  return toLocalDateKey(new Date());
}

export function parseLocalDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const d = parseLocalDateKey(dateKey);
  d.setDate(d.getDate() + days);
  return toLocalDateKey(d);
}

export function getTimeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function formatReadableDate(dateKey: string): string {
  const today = getTodayDateKey();
  const yesterday = addDaysToDateKey(today, -1);
  const d = parseLocalDateKey(dateKey);
  const formatted = d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  if (dateKey === today) return `Today, ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  if (dateKey === yesterday) return `Yesterday, ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  return formatted;
}

export function formatShortDate(dateKey: string): string {
  const d = parseLocalDateKey(dateKey);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatWeekdayShort(dateKey: string): string {
  const d = parseLocalDateKey(dateKey);
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

/**
 * Returns Monday-Sunday date keys for the week containing `referenceDateKey`.
 */
export function getMondayToSundayWeek(referenceDateKey: string, weekOffset = 0): string[] {
  const ref = parseLocalDateKey(referenceDateKey);
  ref.setDate(ref.getDate() + weekOffset * 7);
  const day = ref.getDay(); // 0=Sun, 1=Mon ... 6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(ref);
  monday.setDate(ref.getDate() + diffToMonday);

  const keys: string[] = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);
    keys.push(toLocalDateKey(cur));
  }
  return keys;
}

/**
 * Returns rolling 7 days ending on referenceDateKey.
 */
export function getRollingSevenDays(referenceDateKey: string, weekOffset = 0): string[] {
  const end = addDaysToDateKey(referenceDateKey, weekOffset * 7);
  const keys: string[] = [];
  for (let i = 6; i >= 0; i--) {
    keys.push(addDaysToDateKey(end, -i));
  }
  return keys;
}

/**
 * Returns all YYYY-MM-DD date keys for a calendar month offset from today.
 */
export function getCalendarMonthDates(monthOffset = 0): {
  label: string;
  year: number;
  monthIndex: number;
  dates: string[];
} {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year = target.getFullYear();
  const monthIndex = target.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const dates: string[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    dates.push(toLocalDateKey(new Date(year, monthIndex, day)));
  }

  return {
    label: target.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    year,
    monthIndex,
    dates,
  };
}

export function getDateStripAround(centerDateKey: string, range = 3): string[] {
  const keys: string[] = [];
  for (let i = -range; i <= range; i++) {
    keys.push(addDaysToDateKey(centerDateKey, i));
  }
  return keys;
}
