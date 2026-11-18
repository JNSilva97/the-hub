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
        if (!validId(item.id) || itemIds.has(item.id) || !validText(item.label)
          || item.linkedChecklist !== undefined && (!validId(item.linkedChecklist) || item.linkedChecklist === routine.id)) throw new Error('Invalid checklist item.');
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

export const skinCareOptions = { m: 'Moisturiser', s: 'Sunscreen', t: 'Self-tanner' };
export function skinCareOptionsFor(label) {
  const match = /^(?:apply|put(?: on)?) (?:moisturi[sz]er or (sunscreen|self-tanner)|(sunscreen|self-tanner) or moisturi[sz]er)(?:,.*)?[.!]?$/i.exec(label.trim());
  if (!match) return [];
  return ['m', (match[1] || match[2]).toLowerCase() === 'self-tanner' ? 't' : 's'];
}
export const isSkinCareChoice = label => skinCareOptionsFor(label).length > 0;
const lisbonDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon', dateStyle: 'short' });
export const lisbonDay = (date = new Date()) => lisbonDate.format(date);
export const isMinoxidilItem = label => /^apply minoxidil[.!]?$/i.test(label.trim());
export const minoxidilCheckKey = day => `@daily/minoxidil/${day}`;
export const isMinoxidilCheckKey = key => /^@daily\/minoxidil\/\d{4}-\d{2}-\d{2}$/.test(key);

export function progressKey(item, key, day) {
  return isMinoxidilItem(item.label) ? minoxidilCheckKey(day) : key;
}

// The compact suffix fits inside the existing progress key limit, even with three 50-character IDs.
const dayToken = day => Math.floor(Date.parse(day + 'T00:00:00Z') / 86400000).toString(36);
const skinCareMarker = /^([a-z][a-z0-9-]*\/[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*)~([0-9a-z]{1,5})([mstln])$/;
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
    if (marker[3] in skinCareOptions) used.add(marker[3]);
  }
  return { selected, used };
}

export function setSkinCareChoice(routines, progress, key, option, checked, day = lisbonDay()) {
  const [routineId, groupId, itemId] = key.split('/');
  const item = routines.find(routine => routine.id === routineId)?.groups.find(group => group.id === groupId)
    ?.items.find(item => item.id === itemId);
  const options = item ? skinCareOptionsFor(item.label) : [];
  if (!options.length || ![...options, 'l', 'n'].includes(option)) throw new Error('This checklist item changed. Open the checklist again.');
  const { selected, used } = skinCareProgress(progress.checks, day);
  const previous = selected.get(key);
  if ((checked && previous === option) || (!checked && previous !== option)) return progress;
  if (checked && (options.includes(previous) || used.has(option))) throw new Error('A skincare choice changed on another device. Check the available options.');

  const token = dayToken(day);
  const checks = Object.fromEntries(Object.entries(progress.checks).filter(([savedKey, value]) => {
    const marker = skinCareMarker.exec(savedKey);
    return savedKey !== key && (!marker || marker[2] === token && marker[1] !== key && value);
  }));
  if (checked) checks[`${key}~${token}${option}`] = true;
  return parseProgress(JSON.stringify({ checks, optional: progress.optional }));
}

export const isComplete = progress => Boolean(progress) && progress.total > 0 && progress.done === progress.total;

export function getWorkspaceProgress(routines, state, skinCare, day = lisbonDay(), medicationProgress = new Map()) {
  skinCare ??= skinCareProgress(state.checks, day);
  const work = new Map(routines.map(routine => [routine.id, {
    done: medicationProgress.get(routine.id)?.done ?? 0,
    total: medicationProgress.get(routine.id)?.total ?? 0,
    links: [], optionalLinks: []
  }]));
  for (const routine of routines) {
    const progress = work.get(routine.id);
    for (const group of routine.groups) {
      for (const item of group.items) {
        if (work.has(item.linkedChecklist)) {
          (group.optional ? progress.optionalLinks : progress.links).push(item.linkedChecklist);
          if (!group.optional) progress.total++;
          continue;
        }
        const key = itemKey(routine, group, item);
        const options = skinCareOptionsFor(item.label);
        const choice = skinCare.selected.get(key);
        if (options.length && ['l', 'n'].includes(choice)) continue;
        const done = state.checks[progressKey(item, key, day)] === true || options.includes(choice)
          || options.length && options.every(option => skinCare.used.has(option));
        if (group.optional && !done) continue;
        progress.total++;
        if (done) progress.done++;
      }
    }
  }

  const completed = new Map();
  function checkComplete(id) {
    if (completed.has(id)) return completed.get(id);
    // A dependency back to a checklist being checked cannot complete the cycle.
    completed.set(id, false);
    const { done, total, links } = work.get(id);
    const optionalDone = work.get(id).optionalLinks.filter(checkComplete).length;
    const complete = total + optionalDone > 0 && done + links.length === total && links.every(checkComplete);
    completed.set(id, complete);
    return complete;
  }

  return new Map([...work].map(([id, { done, total, links, optionalLinks }]) => {
    const optionalDone = optionalLinks.filter(checkComplete).length;
    const finished = done + links.filter(checkComplete).length + optionalDone;
    total += optionalDone;
    return [id, { done: finished, total, percent: total ? Math.round(finished / total * 100) : 0 }];
  }));
}

export function getProgress(routine, state, skinCare, routines = []) {
  const workspace = [routine, ...routines.filter(other => other.id !== routine.id)];
  return getWorkspaceProgress(workspace, state, skinCare).get(routine.id);
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
