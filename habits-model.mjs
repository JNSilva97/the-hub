// Daily tobacco and coffee counts, keyed by Lisbon calendar day (YYYY-MM-DD).
export const COFFEE_GOAL = 3;
export const MAX_DAILY_COUNT = 500;
export const validSmokeTime = value => Number.isSafeInteger(value) && value > 0 && value <= 8640000000000000;

export function smokeEntry(at, id) {
  return `${String(at).padStart(16, '0')}:${id}`;
}

export function readSmokes(data) {
  const entries = data?.smokes ?? [];
  if (!Array.isArray(entries)) return [];
  return entries.filter(entry => typeof entry === 'string' && /^\d{16}:[a-f0-9-]{36}$/.test(entry)
    && validSmokeTime(Number(entry.slice(0, 16)))).sort();
}

// A correction changes the timer anchor, while later cigarettes still reset it.
export function smokeFreeSince(start, days, adjustedAt = 0) {
  let since = validSmokeTime(start) ? start : null;
  for (const data of days.values()) for (const entry of readSmokes(data)) {
    const at = Number(entry.slice(0, 16));
    if (at > adjustedAt) since = Math.max(since ?? 0, at);
  }
  return since;
}
export const defaultSettings = Object.freeze({ coffeeCutoff: '17:00', pouchPrice: null, pouchCigarettes: null, baseline: null });

export function addDays(day, amount) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + amount)).toISOString().slice(0, 10);
}
export const validDay = day => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && addDays(day, 0) === day;
const validCount = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_DAILY_COUNT;

export function readDay(data) {
  const day = { cigarettes: data?.cigarettes ?? 0, coffees: data?.coffees ?? 0 };
  if (!data || typeof data !== 'object' || !validCount(day.cigarettes) || !validCount(day.coffees)) throw new Error('Unreadable habit day');
  return day;
}

export function readSettings(data) {
  const settings = { ...defaultSettings, ...data };
  const { coffeeCutoff, pouchPrice, pouchCigarettes, baseline } = settings;
  if (coffeeCutoff !== null && !(typeof coffeeCutoff === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(coffeeCutoff)) ||
      pouchPrice !== null && !(Number.isFinite(pouchPrice) && pouchPrice > 0 && pouchPrice <= 1000) ||
      pouchCigarettes !== null && !(Number.isSafeInteger(pouchCigarettes) && pouchCigarettes > 0 && pouchCigarettes <= 1000) ||
      baseline !== null && !(Number.isSafeInteger(baseline) && baseline >= 0 && baseline <= 200)) throw new Error('Unreadable habit settings');
  return { coffeeCutoff, pouchPrice, pouchCigarettes, baseline };
}

// Tracking starts on the earliest recorded day; days without a record had no cigarettes logged.
export function firstDay(days, today) {
  let earliest = today;
  for (const day of days.keys()) if (day < earliest) earliest = day;
  return earliest;
}

export function smokeFreeStreak(days, today) {
  const elapsedDays = (from, to) => (Date.parse(to) - Date.parse(from)) / 86400000;
  const smokingDays = [...days.keys()].filter(day => day <= today && days.get(day).cigarettes > 0).sort();
  let start = firstDay(days, today);
  let best = 0;
  for (const day of smokingDays) {
    best = Math.max(best, elapsedDays(start, day));
    start = addDays(day, 1);
  }
  const current = elapsedDays(start, today) + 1;
  return { current, best: Math.max(best, current) };
}

// Newest first, so today is the first row.
export function recentDays(days, lozenges, today, length = 7) {
  return Array.from({ length }, (_, index) => {
    const day = addDays(today, -index);
    const saved = days.get(day);
    return { day, cigarettes: saved?.cigarettes ?? 0, coffees: saved?.coffees ?? 0, lozenges: lozenges.get(day) ?? 0 };
  });
}

// Money not spent on cigarettes below the pre-quitting daily baseline; null until settings are complete.
export function savings(rows, settings, start) {
  const { pouchPrice, pouchCigarettes, baseline } = settings;
  if (!pouchPrice || !pouchCigarettes || baseline === null) return null;
  const avoided = rows.filter(row => row.day >= start).reduce((sum, row) => sum + Math.max(0, baseline - row.cigarettes), 0);
  return avoided * pouchPrice / pouchCigarettes;
}

const fixedHolidays = new Set(['01-01', '04-25', '05-01', '06-10', '08-15', '10-05', '11-01', '12-01', '12-08', '12-25']);
const easterByYear = new Map();

function easter(year) {
  if (easterByYear.has(year)) return easterByYear.get(year);
  // Gregorian computus (Meeus/Jones/Butcher).
  const cycle = year % 19;
  const century = Math.floor(year / 100);
  const remainder = year % 100;
  const correction = Math.floor((century - Math.floor((century + 8) / 25) + 1) / 3);
  const moon = (19 * cycle + century - Math.floor(century / 4) - correction + 15) % 30;
  const weekday = (32 + 2 * (century % 4) + 2 * Math.floor(remainder / 4) - moon - remainder % 4) % 7;
  const offset = moon + weekday - 7 * Math.floor((cycle + 11 * moon + 22 * weekday) / 451) + 114;
  const day = new Date(Date.UTC(year, Math.floor(offset / 31) - 1, offset % 31 + 1)).toISOString().slice(0, 10);
  easterByYear.set(year, day);
  return day;
}

export function coffeeWindow(day, time) {
  const tomorrow = addDays(day, 1);
  const sunday = easter(Number(tomorrow.slice(0, 4)));
  if (fixedHolidays.has(tomorrow.slice(5)) || [addDays(sunday, -2), sunday, addDays(sunday, 60)].includes(tomorrow)) return 'holiday-eve';
  const weekday = new Date(day).getUTCDay();
  if (weekday === 5 || weekday === 6) return 'weekend';
  return time >= defaultSettings.coffeeCutoff ? 'closed' : 'open';
}
