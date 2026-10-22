import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateRoutines, parseProgress, getActiveItems, getProgress, restartRoutine, getProgressPatch } from '../routine-model.mjs';

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

test('field items follow checklist order and exclude disabled extras', () => {
  const state = parseProgress(null);
  assert.deepEqual(getActiveItems(work, state).map(item => item.key), work.groups[0].items.map(item => `workday/work/${item.id}`));
  state.optional['workday/after-work'] = true;
  const items = getActiveItems(work, state);
  assert.equal(items.length, 6);
  assert.deepEqual(items[4], { key: 'workday/after-work/item-1', label: 'Pack a spare top', group: 'After-work activity' });
  const optionalOnly = { ...work, groups: [work.groups[1]] };
  assert.deepEqual(getActiveItems(optionalOnly, parseProgress(null)), []);
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
