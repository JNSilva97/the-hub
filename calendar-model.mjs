import { addDays, validDay } from './habits-model.mjs?v=finance-1';
export { addDays, validDay };
export { lisbonDay } from './routine-model.mjs?v=finance-1';
export { routinePlan, routineRelevant } from './routine-model.mjs?v=finance-1';

export const planTypes = [
  { id: 'office', name: 'Office', icon: 'notes', description: 'Work and office preparation' },
  { id: 'training', name: 'Gym/Muay Thai', icon: 'habits', description: 'Training preparation' }
];
export const planNames = plans => plans.map(id => planTypes.find(plan => plan.id === id)?.name).filter(Boolean).join(' + ');
export const weekday = day => new Date(`${day}T12:00:00Z`).getUTCDay() || 7;
export const weekDates = day => Array.from({ length: 7 }, (_, index) => addDays(day, index + 1 - weekday(day)));
export const validCalendarId = id => validDay(id) || /^repeat-[1-7]$/.test(id);
const validTime = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
export const maxCustomPlans = 5;

export function readCalendarRecord(id, value) {
  if (!validCalendarId(id) || value?.version !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 1 || value.revision > 1000000000
    || !['custom', 'weekly'].includes(value.mode) || !Array.isArray(value.plans) || value.plans.length > 3
    // Read old Going out records without breaking account sync; only active plans are returned.
    || new Set(value.plans).size !== value.plans.length || value.plans.some(id => id !== 'going-out' && !planTypes.some(plan => plan.id === id))
    || value.mode === 'weekly' && (id.startsWith('repeat-') || value.plans.length)) throw new Error('Invalid Calendar plan.');
  const plans = planTypes.map(plan => plan.id).filter(id => value.plans.includes(id));
  const details = value.details === undefined ? {} : value.details;
  if (!details || typeof details !== 'object' || Array.isArray(details)) throw new Error('Invalid Calendar details.');
  for (const [plan, entry] of Object.entries(details)) {
    if (!plans.includes(plan) || !entry || Object.keys(entry).length !== 2
      || typeof entry.time !== 'string' || entry.time !== '' && !validTime.test(entry.time)
      || typeof entry.note !== 'string' || entry.note.length > 120) throw new Error('Invalid Calendar details.');
  }
  const events = value.events === undefined ? [] : value.events;
  if (!Array.isArray(events) || events.length > maxCustomPlans || value.mode === 'weekly' && events.length) {
    throw new Error('Invalid custom plans.');
  }
  for (const event of events) {
    if (!event || Object.keys(event).length !== 3 || typeof event.title !== 'string'
      || !event.title.trim() || event.title.length > 60
      || typeof event.time !== 'string' || event.time !== '' && !validTime.test(event.time)
      || typeof event.note !== 'string' || event.note.length > 120) throw new Error('Invalid custom plan.');
  }
  return { version: 1, revision: value.revision, mode: value.mode, plans,
    ...(Object.keys(details).length ? { details } : {}), ...(value.events !== undefined ? { events } : {}) };
}

export function plansForDay(records, day) {
  if (!validDay(day)) throw new Error('Choose a valid date.');
  const custom = records.get(day);
  const repeated = records.get(`repeat-${weekday(day)}`);
  const selected = custom?.mode === 'custom' ? custom : repeated;
  return { day, plans: (selected?.plans ?? []).filter(id => planTypes.some(plan => plan.id === id)),
    ...(selected?.details ? { details: selected.details } : {}),
    ...(selected?.events?.length ? { events: selected.events } : {}),
    source: custom?.mode === 'custom' ? 'custom' : repeated ? 'weekly' : 'empty' };
}

