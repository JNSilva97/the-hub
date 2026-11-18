import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanRoutines, keepProgress, createBackup, parseBackup, removedItems, MAX_BACKUP_BYTES } from '../workspace-model.mjs';
const routines = JSON.parse(readFileSync(new URL('../routines.demo.json', import.meta.url))).routines;
const key = 'personal-care/care/item-1';

test('Wind Down reorders existing tasks without changing their keys or optional checklist links', () => {
  const group = (id, title, labels, optional = false) => ({ id, title, optional, items: labels.map((label, i) => ({ id: `i-${i}`, label })) });
  const original = [{ id: 'wind', name: 'Wind Down', description: 'Evening.', groups: [
    group('health', 'Health', ['Take melatonin']),
    group('care', 'Hygiene & Personal Care', ['Wash face', 'Floss', 'Brush teeth', 'Put in retainer', 'Apply minoxidil', 'Apply moisturizer or self-tanner']),
    group('bed', 'Bedtime Preparation', ['Set alarm for tomorrow', 'Charge phone', 'Charge watch']),
    group('outfit', 'Tomorrow’s outfit', ['Put on underwear', 'Put on socks', 'Put on pants / shorts', 'Put on a T-shirt / shirt', 'Put on shoes / sneakers'], true),
    group('extra', 'Optional clothing', ['Put on a sweatshirt / jumper', 'Put on a jacket'], true),
    { id: 'office', title: 'Office', optional: true, items: [{ id: 'office', label: 'Complete Office Preparation', linkedChecklist: 'workday' }] }
  ] }];
  const updated = cleanRoutines(original);
  assert.deepEqual(updated[0].groups.map(group => group.id), ['care', 'bed', 'health', 'outfit', 'extra', 'office']);
  assert.deepEqual(updated[0].groups[0].items.map(item => item.label), ['Wash face', 'Moisturizer or Self-tanner', 'Brush teeth', 'Floss teeth', 'Retainer', 'Minoxidil']);
  assert.deepEqual(updated[0].groups[0].items.map(item => item.id), ['i-0', 'i-5', 'i-2', 'i-1', 'i-3', 'i-4']);
  assert.deepEqual(updated[0].groups[1].items.map(item => item.label), ['Alarm', 'Charge phone', 'Charge watch']);
  assert.equal(updated[0].groups[2].items[0].label, 'Take ValdispertNoite');
  assert.deepEqual(updated[0].groups[4].items.map(item => item.label), ['Jacket', 'Sweatshirt']);
  assert.deepEqual(updated[0].groups[5], original[0].groups[5]);
  const checks = { 'wind/care/i-2': true, '@daily/minoxidil/2026-11-18': true };
  assert.deepEqual(keepProgress(updated, { checks, optional: {} }).checks, checks);
  assert.deepEqual(cleanRoutines(updated), updated);
});

test('Muay Thai shortens training clothes and splits the bag essentials', () => {
  const group = (id, title, labels) => ({ id, title, optional: false, items: labels.map((label, i) => ({ id: `${id}-${i}`, label })) });
  const base = { id: 'muay-thai', name: 'Muay Thai', description: 'Training.', groups: [
    group('clothes', 'Training clothes', ['Training T-shirt', 'Training shorts', 'Socks', 'Trainers for the journey', 'Sweatshirt for after training']),
    group('bag', 'Bag and essentials', ['Backpack', 'Locker padlock', 'Gym pass / membership card', 'Training towel', 'Water bottle', 'Earphones', 'Phone, wallet and keys'])
  ] };
  const [updated] = cleanRoutines([base]);
  assert.deepEqual(updated.groups[0].items.map(item => item.label), ['T-shirt', 'Shorts', 'Socks', 'Shoes', 'Sweatshirt']);
  assert.deepEqual(updated.groups[1].items.map(item => item.label), ['Backpack', 'Locker', 'Gym pass', 'Water', 'Earphones', 'Phone', 'Wallet', 'Keys']);
  assert.deepEqual(updated.groups[1].items.map(item => item.id), ['bag-0', 'bag-1', 'bag-2', 'bag-4', 'bag-5', 'bag-6', 'wallet', 'keys']);
  assert.deepEqual(cleanRoutines([updated]), [updated]);
});

test('Office Preparation keeps Shirt in Clothing, adds an optional Sweatshirt and renames Padel items', () => {
  const base = { id: 'workday', name: 'Office Preparation', description: 'Office.', groups: [
    { id: 'clothing', title: 'Clothing', optional: false, items: ['Underwear', 'Socks', 'Pants', 'T-shirt / Shirt', 'Sneakers', 'Jacket'].map((label, i) => ({ id: `c-${i}`, label })) },
    { id: 'padel', title: 'Padel', optional: true, items: ['Shorts', 'Running shoes (wear them on the way)', 'Spare top', 'Water'].map((label, i) => ({ id: `p-${i}`, label })) }
  ] };
  const [updated] = cleanRoutines([base]);
  assert.deepEqual(updated.groups.map(group => [group.title, group.optional]), [['Clothing', false], ['Optional clothing', true], ['Padel', true]]);
  assert.deepEqual(updated.groups[0].items.map(item => item.label), ['Underwear', 'Socks', 'Pants', 'Shirt', 'Sneakers', 'Jacket']);
  assert.equal(updated.groups[0].items[3].id, 'c-3');
  assert.deepEqual(updated.groups[1].items, [{ id: 'sweatshirt', label: 'Sweatshirt' }]);
  assert.deepEqual(updated.groups[2].items, ['Shorts', 'Running shoes', 'Spare shirt', 'Water'].map((label, i) => ({ id: `p-${i}`, label })));
  assert.deepEqual(cleanRoutines([updated]), [updated]);
  const saved = { checks: { 'workday/clothing/c-3': true, 'workday/padel/p-2': true }, optional: { 'workday/padel': true } };
  assert.deepEqual(keepProgress([updated], saved), saved);
});

test('Wind Down expands the old outfit shortcut and replaces all Prepare clothing labels', () => {
  const base = { id: 'wind', name: 'Wind Down', description: 'Evening.', groups: [
    { id: 'outfit', title: "Tomorrow's outfit", optional: true, items: [{ id: 'item-1', label: "Prepare tomorrow's outfit", linkedChecklist: 'getting-ready' }] },
    { id: 'outerwear', title: 'Optional clothing', optional: true, items: [{ id: 'sweat', label: 'Prepare a sweatshirt / jumper (if needed)' }, { id: 'jacket', label: 'Prepare a jacket (if needed)' }] }
  ] };
  const [updated] = cleanRoutines([base]);
  assert.equal(updated.groups[0].title, 'Prepare outfit');
  assert.deepEqual(updated.groups[0].items.map(item => item.label), ['Underwear', 'Socks', 'Pants', 'Shirt', 'Shoes']);
  assert.equal(updated.groups[0].items.some(item => item.linkedChecklist), false);
  assert.deepEqual(updated.groups[1].items, [{ id: 'jacket', label: 'Jacket' }, { id: 'sweat', label: 'Sweatshirt' }]);
  assert.deepEqual(updated.groups.map(group => group.optional), [false, true], 'Prepare outfit is required; extra clothing stays optional');
  assert.deepEqual(cleanRoutines([updated]), [updated]);
  const separateItems = structuredClone(base);
  separateItems.groups[0].items = ['Prepare underwear', 'Prepare socks', 'Prepare pants / shorts', 'Prepare a T-shirt / shirt', 'Prepare shoes / sneakers'].map((label, i) => ({ id: `old-${i}`, label }));
  const [renamed] = cleanRoutines([separateItems]);
  assert.deepEqual(renamed.groups[0].items.map(item => item.label), ['Underwear', 'Socks', 'Pants', 'Shirt', 'Shoes']);
  assert.deepEqual(renamed.groups[0].items.map(item => item.id), ['old-0', 'old-1', 'old-2', 'old-3', 'old-4']);
  const saved = { checks: { 'wind/outfit/old-2': true, 'wind/outerwear/jacket': true }, optional: {} };
  assert.deepEqual(keepProgress([renamed], saved), saved);
});

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
  assert.deepEqual(groups[0].items.map(item => item.label), ['Shave beard', 'Trim beard', 'Shave body hair', 'Trim eyebrows', 'Trim nails']);
  assert.equal(groups[0].items[1].id, 'trim-beard');
  assert.deepEqual(groups[1].items.map(item => item.label), ['Underwear', 'Socks', 'Pants', 'Shirt', 'Shoes']);
  assert.deepEqual(groups[2].items.map(item => item.label), ['Sweatshirt', 'Jacket']);
  assert.equal(groups[3].items[0].label, 'Phone charger');
  assert.equal(groups[4].title, 'Pouch');
  assert.deepEqual(groups[4].items.map(item => item.label), ['Tobacco', 'Small papers', 'Filters', 'W', 'Large papers', 'W filters', 'Grinder']);
  assert.deepEqual(groups[4].items.slice(0, 5).map(item => item.id), ['b-2', 'b-1', 'b-0', 'b-3', 'b-5']);
  assert.equal(groups[4].items[5].id, 'w-filters');
  assert.equal(groups.filter(group => group.optional).length, 4);
  const checks = { 'getting-ready/bag/b-0': true, 'getting-ready/bag/b-4': true, 'getting-ready/bag/w-filters': true };
  const restored = parseBackup(JSON.stringify(createBackup(data, { checks, optional: {} })));
  assert.deepEqual(restored.routines, updated);
  assert.deepEqual(restored.progress.checks, checks);
  assert.deepEqual(cleanRoutines(updated), updated);
  const previousRelease = structuredClone(updated);
  previousRelease[0].groups[0].items = groups[0].items.filter(item => item.label !== 'Trim beard');
  previousRelease[0].groups[0].items = previousRelease[0].groups[0].items.map(item => item.label === 'Trim eyebrows' ? { ...item, label: 'Clean eyebrows' } : item);
  previousRelease[0].groups[4].title = 'Belt bag';
  previousRelease[0].groups[4].items = groups[4].items.filter(item => item.label !== 'Grinder');
  const upgraded = cleanRoutines(previousRelease);
  assert.equal(upgraded[0].groups[0].items[1].label, 'Trim beard');
  assert.deepEqual(upgraded[0].groups[4].items.map(item => item.label), groups[4].items.map(item => item.label));
  assert.equal(upgraded[0].groups[4].items.at(-1).id, 'grinder');
  assert.deepEqual(cleanRoutines(upgraded), upgraded);
  const laterEdit = structuredClone(upgraded);
  laterEdit[0].groups[0].items = laterEdit[0].groups[0].items.filter(item => item.label !== 'Trim beard');
  assert.deepEqual(cleanRoutines(laterEdit), laterEdit);
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
