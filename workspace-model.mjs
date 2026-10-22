import { validateRoutines, parseProgress, groupKey, itemKey } from './routine-model.mjs?v=control-1';

export const MAX_BACKUP_BYTES = 2 * 1024 * 1024;

export function cleanRoutines(routines) {
  validateRoutines({ version: 1, routines });
  const cleaned = routines.map(routine => ({ id: routine.id, name: routine.name.trim(), description: routine.description.trim(),
    groups: routine.groups.map(group => ({ id: group.id, title: group.title.trim(), optional: group.optional,
      items: group.items.map(item => ({ id: item.id, label: item.label.trim() })) })) }));
  if (new TextEncoder().encode(JSON.stringify(cleaned)).length > 750000) throw new Error('Checklists are too large. Shorten some text before saving.');
  return cleaned;
}

export function keepProgress(routines, progress) {
  const saved = parseProgress(JSON.stringify(progress));
  const checks = new Set();
  const optional = new Set();
  for (const routine of routines) for (const group of routine.groups) {
    optional.add(groupKey(routine, group));
    for (const item of group.items) checks.add(itemKey(routine, group, item));
  }
  return { checks: Object.fromEntries(Object.entries(saved.checks).filter(([key]) => checks.has(key))),
    optional: Object.fromEntries(Object.entries(saved.optional).filter(([key]) => optional.has(key))) };
}

export function readWorkspace(data) {
  if (!data?.progress || typeof data.progress !== 'object') throw new Error('Missing checklist progress.');
  const routines = cleanRoutines(data?.routines);
  return { routines, progress: keepProgress(routines, data.progress) };
}

export function createBackup(routines, progress) {
  const backup = { format: 'the-hub-checklists', version: 1, exportedAt: new Date().toISOString(), ...readWorkspace({ routines, progress }) };
  if (new TextEncoder().encode(JSON.stringify(backup)).length > MAX_BACKUP_BYTES) throw new Error('This workspace exceeds the 2 MB backup limit. Shorten or remove unused checklists before exporting.');
  return backup;
}

export function parseBackup(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) throw new Error('Choose a Hub checklist backup smaller than 2 MB.');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('This file is not valid JSON. Nothing has been changed.'); }
  if (data?.format !== 'the-hub-checklists' || data.version !== 1) throw new Error('This is not a supported Hub checklist backup.');
  try { return readWorkspace(data); } catch { throw new Error('This backup contains invalid checklists or ticks. Nothing has been changed.'); }
}

export function countItems(routines) {
  return routines.reduce((total, routine) => total + routine.groups.reduce((count, group) => count + group.items.length, 0), 0);
}

export function removedItems(before, after) {
  const keys = new Set(after.flatMap(routine => routine.groups.flatMap(group => group.items.map(item => itemKey(routine, group, item)))));
  return before.reduce((total, routine) => total + routine.groups.reduce((count, group) => count + group.items.filter(item => !keys.has(itemKey(routine, group, item))).length, 0), 0);
}
