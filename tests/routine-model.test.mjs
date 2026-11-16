import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateRoutines, parseProgress, getProgress, getWorkspaceProgress, restartRoutine, getProgressPatch, lisbonDay, setSkinCareChoice, skinCareProgress, minoxidilCheckKey } from '../routine-model.mjs';
import { createBackup, parseBackup } from '../workspace-model.mjs';

const demo = JSON.parse(readFileSync(new URL('../routines.demo.json', import.meta.url), 'utf8'));
const work = validateRoutines(demo).find(routine => routine.id === 'workday');

test('demo data contains five valid routines', () => {
  assert.equal(validateRoutines(demo).length, 5);
});

test('optional sections count only when enabled and keep their ticks', () => {
  const state = parseProgress(null);
  state.checks['workday/work/item-1'] = true;
  state.checks['workday/after-work/item-1'] = true;
  assert.deepEqual(getProgress(work, state), { done: 1, total: 4, percent: 25 });
  state.optional['workday/after-work'] = true;
  assert.deepEqual(getProgress(work, state), { done: 2, total: 6, percent: 33 });
  state.optional['workday/after-work'] = false;
  assert.equal(state.checks['workday/after-work/item-1'], true);
  assert.deepEqual(getProgress(work, state), { done: 1, total: 4, percent: 25 });
});

test('restart clears one routine and preserves other lists and optional choices', () => {
  const state = { checks: { 'workday/work/item-1': true, 'workday/work/item-2': false, 'workday-extra/work/item-1': true, 'training/training/item-1': true }, optional: { 'workday/after-work': true } };
  const fresh = restartRoutine(work, state);
  assert.deepEqual(fresh.checks, { 'workday-extra/work/item-1': true, 'training/training/item-1': true });
  assert.deepEqual(fresh.optional, state.optional);
  assert.equal(state.checks['workday/work/item-1'], true);
});

test('a checklist with no enabled items is not complete and reports zero progress', () => {
  const optionalOnly = { ...work, groups: [work.groups[1]] };
  assert.deepEqual(getProgress(optionalOnly, parseProgress(null)), { done: 0, total: 0, percent: 0 });
});

test('saved progress round-trips and malformed values are rejected', () => {
  const state = { checks: { 'workday/work/item-1': true }, optional: { 'workday/after-work': false } };
  assert.deepEqual(parseProgress(JSON.stringify(state)), state);
  for (const value of ['{', 'null', '{"checks":[],"optional":{}}', '{"checks":{"a":"yes"},"optional":{}}']) assert.throws(() => parseProgress(value));
});

test('duplicate identifiers and invalid section or item data are rejected', () => {
  const duplicate = structuredClone(demo);
  duplicate.routines.push(duplicate.routines[0]);
  assert.throws(() => validateRoutines(duplicate));
  const badItem = structuredClone(demo);
  badItem.routines[0].groups[0].items[0].label = '';
  assert.throws(() => validateRoutines(badItem));
  const badSection = structuredClone(demo);
  badSection.routines[0].groups[0].optional = 'yes';
  assert.throws(() => validateRoutines(badSection));
});

test('cloud patches contain only changed ticks and preserve explicit resets', () => {
  const previous = { checks: { 'workday/work/item-1': true, 'training/training/item-1': true }, optional: { 'workday/after-work': true } };
  const next = restartRoutine(work, previous);
  assert.deepEqual(getProgressPatch(previous, next), { checks: { 'workday/work/item-1': false } });
  assert.deepEqual(getProgressPatch(previous, previous), {});
  next.optional['workday/after-work'] = false;
  next.checks['training/training/item-2'] = true;
  assert.deepEqual(getProgressPatch(previous, next), { checks: { 'workday/work/item-1': false, 'training/training/item-2': true }, optional: { 'workday/after-work': false } });
  assert.throws(() => getProgressPatch(previous, { checks: { bad: 'true' }, optional: {} }));
});

test('shared skincare choices follow the Lisbon day and survive a checklist backup', () => {
  const routines = ['morning', 'going-out'].map(id => ({
    id, name: id, description: 'Daily checklist',
    groups: [{ id: 'daily', title: 'Daily', optional: false, items: [{ id: 'skin', label: 'Put moisturiser or sunscreen' }] }]
  }));
  const morning = 'morning/daily/skin';
  const goingOut = 'going-out/daily/skin';
  const day = lisbonDay(new Date('2026-07-01T22:59:59Z'));
  const nextDay = lisbonDay(new Date('2026-07-01T23:00:00Z'));
  assert.equal(nextDay, '2026-07-02');
  const initial = parseProgress(null);
  const first = setSkinCareChoice(routines, initial, morning, 'm', true, day);
  assert.throws(() => setSkinCareChoice(routines, first, goingOut, 'm', true, day), /changed on another device/);
  const sunscreen = setSkinCareChoice(routines, first, goingOut, 's', true, day);
  routines[1].groups[0].items[0].label = 'Apply moisturizer or self-tanner';
  assert.equal(getProgress(routines[1], sunscreen, skinCareProgress(sunscreen.checks, day)).done, 0);
  assert.throws(() => setSkinCareChoice(routines, first, goingOut, 's', true, day), /item changed/);
  const both = setSkinCareChoice(routines, sunscreen, goingOut, 't', true, day);
  const restored = parseBackup(JSON.stringify(createBackup(routines, both))).progress;
  assert.deepEqual(skinCareProgress(restored.checks, day).selected, new Map([[morning, 'm'], [goingOut, 't']]));
  const undone = setSkinCareChoice(routines, restored, morning, 'm', false, day);
  assert.deepEqual(skinCareProgress(undone.checks, day).used, new Set(['t']));
  assert.equal(getProgress(routines[1], restored, skinCareProgress(restored.checks, day)).done, 1);
  assert.equal(getProgress(routines[1], restored, skinCareProgress(restored.checks, nextDay)).done, 0);
  assert.deepEqual(skinCareProgress(restartRoutine(routines[1], both).checks, day).used, new Set(['m']));
});

test('linked items tick themselves when their checklist is complete', () => {
  const routines = validateRoutines({ version: 1, routines: [
    { id: 'wind-down', name: 'Wind Down', description: 'Evening.', groups: [
      { id: 'office', title: 'Office day', optional: true, items: [{ id: 'item-1', label: 'Complete office preparation', linkedChecklist: 'workday' }] }] },
    { id: 'workday', name: 'Workday', description: 'Office.', groups: [
      { id: 'bag', title: 'Bag', optional: false, items: [{ id: 'item-1', label: 'Mac' }, { id: 'item-2', label: 'Charger' }] },
      { id: 'back', title: 'Back home', optional: false, items: [{ id: 'item-1', label: 'Wind down', linkedChecklist: 'wind-down' }] }] }] });
  const [windDown, workday] = routines;
  const state = parseProgress(null);
  state.optional['wind-down/office'] = true;
  state.checks['wind-down/office/item-1'] = true;
  assert.deepEqual(getProgress(windDown, state, undefined, routines), { done: 0, total: 1, percent: 0 });
  state.checks['workday/bag/item-1'] = true;
  state.checks['workday/bag/item-2'] = true;
  assert.equal(getProgress(workday, state, undefined, routines).done, 2);
  assert.equal(getProgress(windDown, state, undefined, routines).done, 0, 'circular links never count as done');
  const oneWay = [windDown, { ...workday, groups: workday.groups.slice(0, 1) }];
  assert.deepEqual(getProgress(windDown, state, undefined, oneWay), { done: 1, total: 1, percent: 100 });
  delete state.checks['workday/bag/item-2'];
  assert.equal(getProgress(windDown, state, undefined, oneWay).done, 0);
});

test('workspace progress stays consistent across cycles and many repeated links', () => {
  const state = parseProgress(null);
  const routines = Array.from({ length: 20 }, (_, index) => {
    const id = `checklist-${index}`;
    state.checks[`${id}/items/manual`] = true;
    const items = [{ id: 'manual', label: 'Pack bag' }];
    if (index < 19) for (let link = 0; link < 8; link++) {
      items.push({ id: `link-${link}`, label: 'Finish next checklist', linkedChecklist: `checklist-${index + 1}` });
    }
    return { id, name: id, description: 'Checklist', groups: [{ id: 'items', title: 'Items', optional: false, items }] };
  });
  assert.deepEqual(getWorkspaceProgress(routines, state).get('checklist-0'), { done: 9, total: 9, percent: 100 });
  routines.at(-1).groups[0].items.push({ id: 'back', label: 'Finish first checklist', linkedChecklist: 'checklist-0' });
  const cyclic = getWorkspaceProgress(routines, state);
  assert.deepEqual(cyclic.get('checklist-0'), { done: 1, total: 9, percent: 11 });
  assert.deepEqual(cyclic.get('checklist-19'), { done: 1, total: 2, percent: 50 });
  assert.deepEqual(cyclic, getWorkspaceProgress([...routines].reverse(), state));
});

test('minoxidil is one Lisbon-day check across routines and survives backup and routine reset', () => {
  const routines = ['getting-ready', 'wind-down'].map(id => ({
    id, name: id, description: 'Checklist',
    groups: [{ id: 'care', title: 'Care', optional: false, items: [{ id: 'minoxidil', label: 'Apply minoxidil' }] }]
  }));
  const state = parseProgress(null);
  const day = lisbonDay(new Date('2026-07-01T22:59:59Z'));
  const nextDay = lisbonDay(new Date('2026-07-01T23:00:00Z'));
  state.checks['getting-ready/care/minoxidil'] = true;
  assert.deepEqual([...getWorkspaceProgress(routines, state, undefined, day).values()].map(progress => progress.done), [0, 0]);
  state.checks[minoxidilCheckKey(day)] = true;
  const restored = parseBackup(JSON.stringify(createBackup(routines, restartRoutine(routines[0], state)))).progress;
  assert.deepEqual([...getWorkspaceProgress(routines, restored, undefined, day).values()].map(progress => progress.done), [1, 1]);
  assert.deepEqual([...getWorkspaceProgress(routines, restored, undefined, nextDay).values()].map(progress => progress.done), [0, 0]);
});
