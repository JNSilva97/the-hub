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
    if (!data?.[field] || typeof data[field] !== 'object' || Array.isArray(data[field]) || Object.entries(data[field]).some(([key, value]) => key.length > 160 || typeof value !== 'boolean')) throw new Error('Invalid saved progress.');
  }
  return { checks: { ...data.checks }, optional: { ...data.optional } };
}

export const groupKey = (routine, group) => `${routine.id}/${group.id}`;
export const itemKey = (routine, group, item) => `${groupKey(routine, group)}/${item.id}`;

export function getActiveItems(routine, state) {
  return routine.groups.flatMap(group => group.optional && state.optional[groupKey(routine, group)] !== true ? [] :
    group.items.map(item => ({ key: itemKey(routine, group, item), label: item.label, group: group.title })));
}

export function getProgress(routine, state) {
  const items = getActiveItems(routine, state);
  const total = items.length;
  const done = items.filter(item => state.checks[item.key] === true).length;
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
