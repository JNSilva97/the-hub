const uuid = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);

export function validateCloudNote(note, id = note?.id) {
  if (note?.version !== 1 || !uuid(id) || note.id !== id || note.retired !== false || typeof note.text !== 'string' || note.text.length > 50000 || !Number.isSafeInteger(note.updatedAt) || note.updatedAt < 0 || !(note.parent === '' || uuid(note.parent)) || note.parent === id) throw new Error('Invalid account note.');
  return { version: 1, id, parent: note.parent, text: note.text, updatedAt: note.updatedAt, retired: false };
}

export function visibleNotes(records, drafts) {
  const notes = new Map(records);
  const replaced = new Set();
  for (const record of records.values()) if (record.parent) replaced.add(record.parent);
  for (const draft of drafts.values()) {
    if (draft.parent) replaced.add(draft.parent);
    if (!draft.deleted) notes.set(draft.id, validateCloudNote(draft));
  }
  for (const id of replaced) notes.delete(id);
  return notes;
}
