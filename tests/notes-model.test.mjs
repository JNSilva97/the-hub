import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCloudNote, visibleNotes } from '../notes-model.mjs';
const first = '00000000-0000-4000-8000-000000000001';
const second = '00000000-0000-4000-8000-000000000002';
const third = '00000000-0000-4000-8000-000000000003';
const note = (id, parent = '', text = 'A note') => ({ version: 1, id, parent, text, updatedAt: 1, retired: false });

test('account notes reject invalid identities, oversized text and malformed versions', () => {
  assert.deepEqual(validateCloudNote({ ...note(first), ignored: true }), note(first));
  for (const invalid of [{ ...note(first), id: '../other' }, { ...note(first), parent: first }, { ...note(first), text: 'x'.repeat(50001) }, { ...note(first), updatedAt: NaN }, { ...note(first), version: 2 }]) assert.throws(() => validateCloudNote(invalid));
});

test('immutable note branches keep both concurrent versions and hide only their shared predecessor', () => {
  const records = new Map([[first, note(first)], [second, note(second, first, 'PC edit')], [third, note(third, first, 'Phone edit')]]);
  assert.deepEqual([...visibleNotes(records, new Map()).values()].map(note => note.text), ['PC edit', 'Phone edit']);
  const deletion = new Map([[first, { ...note(first, second), deleted: true }]]);
  assert.deepEqual([...visibleNotes(new Map([[second, records.get(second)], [third, records.get(third)]]), deletion).keys()], [third]);
});
