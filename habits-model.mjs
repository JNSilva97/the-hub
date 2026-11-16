// Daily tobacco and coffee counts, keyed by Lisbon calendar day (YYYY-MM-DD).
export const COFFEE_LIMIT = 3;
export const LOW_LOZENGES = 5;
export const defaultSettings = Object.freeze({ coffeeCutoff: '15:00', pouchPrice: null, pouchCigarettes: null, baseline: null });

export function addDays(day, amount) {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + amount)).toISOString().slice(0, 10);
}
export const validDay = day => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && addDays(day, 0) === day;
const validCount = value => Number.isSafeInteger(value) && value >= 0 && value <= 500;

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
  const earliest = [...days.keys()].filter(day => day <= today).sort()[0];
  return earliest && earliest < today ? earliest : today;
}

export function smokeFreeStreak(days, today) {
  let current = 0;
  let best = 0;
  for (let day = firstDay(days, today); day <= today; day = addDays(day, 1)) {
    current = (days.get(day)?.cigarettes ?? 0) === 0 ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return { current, best };
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

export const pastCutoff = (cutoff, time) => Boolean(cutoff) && time >= cutoff;
