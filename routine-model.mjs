const validId = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,49}$/.test(value);
const validText = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 240;

export function validateRoutines(data) {
  if (data?.version !== 1 || !Array.isArray(data.routines) || data.routines.length < 1 || data.routines.length > 20) throw new Error('Invalid checklist data.');
  const routineIds = new Set();
  for (const routine of data.routines) {
    if (!validId(routine.id) || routineIds.has(routine.id) || !validText(routine.name) || !validText(routine.description) || !Array.isArray(routine.groups) || !routine.groups.length || routine.groups.length > 12) throw new Error('Invalid routine.');
    routineIds.add(routine.id);
    const groupIds = new Set();
    for (const group of routine.groups) {
      if (!validId(group.id) || groupIds.has(group.id) || !validText(group.title) || typeof group.optional !== 'boolean' || !Array.isArray(group.items) || !group.items.length || group.items.length > 100) throw new Error('Invalid checklist section.');
      groupIds.add(group.id);
      const itemIds = new Set();
      for (const item of group.items) {
        if (!validId(item.id) || itemIds.has(item.id) || !validText(item.label)) throw new Error('Invalid checklist item.');
        itemIds.add(item.id);
      }
    }
  }
  return data.routines;
}

export function parseProgress(raw) {
  if (!raw) return { checks: {}, optional: {} };
  const data = JSON.parse(raw);
  for (const field of ['checks', 'optional']) {
    if (!data?.[field] || typeof data[field] !== 'object' || Array.isArray(data[field]) || Object.keys(data[field]).length > (field === 'checks' ? 24000 : 240) || Object.entries(data[field]).some(([key, value]) => key.length > 160 || typeof value !== 'boolean')) throw new Error('Invalid saved progress.');
  }
  return { checks: { ...data.checks }, optional: { ...data.optional } };
}

export const groupKey = (routine, group) => `${routine.id}/${group.id}`;
export const itemKey = (routine, group, item) => `${groupKey(routine, group)}/${item.id}`;

export const skinCareOptions = { m: 'Moisturiser', s: 'Sunscreen' };
export const isSkinCareChoice = label => /^(?:apply|put(?: on)?) (?:moisturi[sz]er or sunscreen|sunscreen or moisturi[sz]er)(?:,.*)?[.!]?$/i.test(label.trim());
const lisbonDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon', dateStyle: 'short' });
export const lisbonDay = (date = new Date()) => lisbonDate.format(date);
// The compact suffix fits inside the existing progress key limit, even with three 50-character IDs.
const dayToken = day => Math.floor(Date.parse(day + 'T00:00:00Z') / 86400000).toString(36);
const skinCareMarker = /^([a-z][a-z0-9-]*\/[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*)~([0-9a-z]{1,5})([ms])$/;
export const skinCareItemKey = key => skinCareMarker.exec(key)?.[1];

export function skinCareProgress(checks, day = lisbonDay()) {
  const token = dayToken(day);
  const selected = new Map();
  const used = new Set();
  for (const key of Object.keys(checks)) {
    if (checks[key] !== true) continue;
    const marker = skinCareMarker.exec(key);
    if (marker?.[2] !== token) continue;
    selected.set(marker[1], marker[3]);
    used.add(marker[3]);
  }
  return { selected, used };
}

export function setSkinCareChoice(routines, progress, key, option, checked, day = lisbonDay()) {
  const rowExists = routines.some(routine => routine.groups.some(group =>
    group.items.some(item => itemKey(routine, group, item) === key && isSkinCareChoice(item.label))));
  if (!rowExists || !Object.hasOwn(skinCareOptions, option)) throw new Error('This checklist item changed. Open the checklist again.');
  const { selected, used } = skinCareProgress(progress.checks, day);
  const previous = selected.get(key);
  if ((checked && previous === option) || (!checked && previous !== option)) return progress;
  if (checked && (previous || used.has(option))) throw new Error('A skincare choice changed on another device. Check the available options.');

  const token = dayToken(day);
  const checks = Object.fromEntries(Object.entries(progress.checks).filter(([savedKey, value]) => {
    const marker = skinCareMarker.exec(savedKey);
    return savedKey !== key && (!marker || marker[2] === token && marker[1] !== key && value);
  }));
  if (checked) checks[`${key}~${token}${option}`] = true;
  return parseProgress(JSON.stringify({ checks, optional: progress.optional }));
}

export function getProgress(routine, state, skinCare = skinCareProgress(state.checks)) {
  let done = 0;
  let total = 0;
  for (const group of routine.groups) {
    if (group.optional && state.optional[groupKey(routine, group)] !== true) continue;
    total += group.items.length;
    for (const item of group.items) {
      const key = itemKey(routine, group, item);
      if (state.checks[key] === true || isSkinCareChoice(item.label) && (skinCare.selected.has(key) || skinCare.used.size === 2)) done++;
    }
  }
  return { done, total, percent: total ? Math.round(done / total * 100) : 0 };
}

export function restartRoutine(routine, state) {
  const prefix = `${routine.id}/`;
  return { checks: Object.fromEntries(Object.entries(state.checks).filter(([key]) => !key.startsWith(prefix))), optional: { ...state.optional } };
}

export function getProgressPatch(previous, next) {
  const before = parseProgress(JSON.stringify(previous));
  const after = parseProgress(JSON.stringify(next));
  const patch = {};
  for (const field of ['checks', 'optional']) {
    for (const key of new Set([...Object.keys(before[field]), ...Object.keys(after[field])])) {
      const value = after[field][key] === true;
      if (value !== (before[field][key] === true)) (patch[field] ??= {})[key] = value;
    }
  }
  return patch;
}
