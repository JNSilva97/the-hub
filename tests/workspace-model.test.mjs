import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanRoutines, keepProgress, createBackup, parseBackup, removedItems, MAX_BACKUP_BYTES } from '../workspace-model.mjs';
const routines = JSON.parse(readFileSync(new URL('../routines.demo.json', import.meta.url))).routines;
const key = 'personal-care/care/item-1';

test('Getting Ready updates retain task IDs and optional flags; new W filters has its own saved tick', () => {
  const labels = ['Shave / Trim beard', 'Remove unwanted body hair', 'Remove hair between eyebrows', 'Trim nails'];
  const data = [{ id: 'getting-ready', name: 'Getting Ready', description: 'Before heading out.', groups: [
    { id: 'grooming', title: 'Grooming (If Needed)', optional: true, items: labels.map((label, i) => ({ id: `g-${i}`, label })) },
    { id: 'clothing', title: 'Clothing', optional: false, items: ['Put on underwear', 'Put on socks', 'Put on pants / shorts', 'Put on a T-shirt / shirt', 'Put on shoes / sneakers'].map((label, i) => ({ id: `c-${i}`, label })) },
    { id: 'outerwear', title: 'Optional Clothing', optional: true, items: [{ id: 'jacket', label: 'Put on a jacket' }, { id: 'sweat', label: 'Put on a sweatshirt / jumper' }] },
    { id: 'essentials', title: 'Optional Essentials', optional: true, items: [{ id: 'charger', label: 'Phone charger (if needed)' }] },
    { id: 'bag', title: 'Belt bag', optional: true, items: ['Tobacco filters', 'Small rolling papers', 'Tobacco', 'W', 'Grinder', 'Large rolling papers'].map((label, i) => ({ id: `b-${i}`, label })) }
  ] }];
  const updated = cleanRoutines(data);
  const groups = updated[0].groups;
  assert.equal(groups[0].title, 'Grooming');
  assert.deepEqual(groups[0].items.map(item => item.label), ['Shave beard', 'Shave body hair', 'Clean eyebrows', 'Trim nails']);
  assert.deepEqual(groups[1].items.map(item => item.label), ['Underwear', 'Socks', 'Pants', 'Shirt', 'Shoes']);
  assert.deepEqual(groups[2].items.map(item => item.label), ['Sweatshirt', 'Jacket']);
  assert.equal(groups[3].items[0].label, 'Phone charger');
  assert.deepEqual(groups[4].items.map(item => item.label), ['Tobacco', 'Small papers', 'Filters', 'W', 'Large papers', 'W filters']);
  assert.deepEqual(groups[4].items.slice(0, 5).map(item => item.id), ['b-2', 'b-1', 'b-0', 'b-3', 'b-5']);
  assert.equal(groups[4].items[5].id, 'w-filters');
  assert.equal(groups.filter(group => group.optional).length, 4);
  const checks = { 'getting-ready/bag/b-0': true, 'getting-ready/bag/b-4': true, 'getting-ready/bag/w-filters': true };
  const restored = parseBackup(JSON.stringify(createBackup(data, { checks, optional: {} })));
  assert.deepEqual(restored.routines, updated);
  assert.deepEqual(restored.progress.checks, { 'getting-ready/bag/b-0': true, 'getting-ready/bag/w-filters': true });
  assert.deepEqual(cleanRoutines(updated), updated);
});
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
