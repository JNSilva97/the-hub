import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjustFitnessDay, readFitnessDay, lisbonDay } from '../fitness-model.mjs';
test('Fitness adds sets, corrects reps, preserves the other exercise and validates saved days', () => {
  const day = '2026-11-20';
  let saved = adjustFitnessDay(day, null, 'pushups', 10);
  saved = adjustFitnessDay(day, saved, 'abs', 5);
  saved = adjustFitnessDay(day, saved, 'pushups', -1);
  assert.deepEqual(saved, { version: 1, revision: 3, pushups: 9, abs: 5 });
  assert.equal(adjustFitnessDay(day, null, 'pushups', -1).pushups, 0);
  for (const patch of [{ pushups: -1 }, { abs: 1.5 }, { pushups: 5001 }, { revision: 0 }, { version: 2 }, { extra: true }]) assert.throws(() => readFitnessDay(day, { ...saved, ...patch }));
  assert.throws(() => readFitnessDay('2026-02-30', saved));
  assert.throws(() => adjustFitnessDay(day, saved, 'unknown', 1));
  assert.throws(() => adjustFitnessDay(day, saved, 'abs', 100));
  assert.equal(lisbonDay(new Date('2026-06-20T23:30:00Z')), '2026-06-21');
});
