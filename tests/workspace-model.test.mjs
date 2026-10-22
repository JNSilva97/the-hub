import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanRoutines, keepProgress, createBackup, parseBackup, removedItems, MAX_BACKUP_BYTES } from '../workspace-model.mjs';
const routines = JSON.parse(readFileSync(new URL('../routines.demo.json', import.meta.url))).routines;
const key = 'personal-care/care/item-1';
test('portable backup preserves IDs and ticks, strips unknown fields and rejects foreign or oversized input', () => {
  const data = structuredClone(routines); data[0].secret = 'excluded';
  const backup = createBackup(data, { checks: { [key]: true, 'obsolete/item': true }, optional: {} });
  assert.equal(backup.routines[0].secret, undefined);
  assert.deepEqual(parseBackup(JSON.stringify(backup)).progress.checks, { [key]: true });
  for (const bad of ['{}', '{', JSON.stringify({ ...backup, version: 2 }), JSON.stringify({ ...backup, progress: { checks: { [key]: 'yes' }, optional: {} } }), ' '.repeat(MAX_BACKUP_BYTES + 1)]) assert.throws(() => parseBackup(bad));
});
test('renaming and reordering preserve ticks; removal prunes only removed item IDs', () => {
  const next = structuredClone(routines); next[0].name = 'Renamed'; next[0].groups[0].items.reverse();
  assert.deepEqual(keepProgress(cleanRoutines(next), { checks: { [key]: true }, optional: {} }).checks, { [key]: true });
  assert.equal(removedItems(routines, next), 0);
  next[0].groups[0].items = next[0].groups[0].items.filter(item => item.id !== 'item-1');
  assert.equal(removedItems(routines, next), 1);
  assert.deepEqual(keepProgress(next, { checks: { [key]: true }, optional: {} }).checks, {});
});
test('validation keeps drafts with empty labels or duplicate IDs out of storage', () => {
  const next = structuredClone(routines); next[0].name = '   '; assert.throws(() => cleanRoutines(next));
  next[0].name = 'Valid'; next[0].groups[0].items.push(next[0].groups[0].items[0]); assert.throws(() => cleanRoutines(next));
});
