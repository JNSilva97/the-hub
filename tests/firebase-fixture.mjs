// Test transport only. Hosted Authentication and deployed rules need separate verification.
const service = window.__hubFirebase;
export const initializeApp = config => config;
export const browserSessionPersistence = {};
export const browserLocalPersistence = {};
export const indexedDBLocalPersistence = {};
export const browserPopupRedirectResolver = {};
export const initializeAuth = () => ({});
export const initializeFirestore = () => ({});
export const memoryLocalCache = () => ({});
export const persistentLocalCache = () => ({});
export const persistentMultipleTabManager = () => ({});
export const getPersistentCacheIndexManager = () => service.persistenceFailure ? null : {};
export class GoogleAuthProvider { setCustomParameters() {} }
export function onAuthStateChanged(auth, next) {
  service.authListener = next;
  queueMicrotask(() => next(service.user));
}
export async function signInWithPopup() {
  service.user = { uid: 'account-a', email: 'test@example.invalid' };
  service.authListener(service.user);
}
export async function signOut() {
  service.user = null;
  service.authListener(null);
}
export const collection = (database, ...path) => ({ path });
export const doc = collection;
export const query = reference => reference;
export const where = () => ({});
export async function getDoc(reference) {
  const data = service.docs[reference.path[1]]?.notes?.[reference.path[3]];
  return { exists: () => Boolean(data), data: () => structuredClone(data) };
}
export function onSnapshot(reference, options, next, failed) {
  const listener = { uid: reference.path[1], next, failed };
  if (reference.path[2] === 'health') {
    service.healthListeners.add(listener);
    queueMicrotask(() => { if (service.healthListeners.has(listener)) service.publish(); });
    return () => service.healthListeners.delete(listener);
  }
  if (reference.path[2] === 'habits') {
    service.habitListeners.add(listener);
    queueMicrotask(() => { if (service.habitListeners.has(listener)) service.publish(); });
    return () => service.habitListeners.delete(listener);
  }
  if (reference.path[2] === 'notes') {
    service.noteListeners.add(listener);
    queueMicrotask(() => { if (service.noteListeners.has(listener)) service.publish(); });
    return () => service.noteListeners.delete(listener);
  }
  service.listener = listener;
  queueMicrotask(() => { if (service.listener === listener) service.publish(); });
  return () => { if (service.listener === listener) service.listener = null; };
}
export function writeBatch() {
  const writes = [];
  return {
    set(reference, data) { writes.push({ path: reference.path, data: structuredClone(data) }); },
    delete(reference) { writes.push({ path: reference.path, deleted: true }); },
    async commit() {
      service.noteWrites.push(structuredClone(writes));
      if (service.rejectNotes) throw new Error('Notes denied.');
      const commit = () => {
        for (const write of writes) {
          const notes = ((service.docs[write.path[1]] ??= {}).notes ??= {});
          if (write.deleted) delete notes[write.path[3]];
          else {
            if (notes[write.path[3]] && !write.data.retired && JSON.stringify(notes[write.path[3]]) !== JSON.stringify(write.data)) throw new Error('Immutable note.');
            notes[write.path[3]] = write.data;
          }
        }
        service.publish();
      };
      if (service.holdNotes) await new Promise(resolve => service.heldNotes.push(() => { commit(); resolve(); }));
      else commit();
    }
  };
}
export const increment = amount => ({ __increment: amount });
export async function setDoc(reference, patch, options) {
  if (reference.path[2] === 'habits') {
    service.habitWrites.push({ path: reference.path, patch: structuredClone(patch) });
    if (service.habitsDenied) throw Object.assign(new Error('Denied.'), { code: 'permission-denied' });
    const habits = (service.docs[reference.path[1]] ??= {}).habits ??= {};
    const next = options?.merge ? { ...habits[reference.path[3]] } : {};
    for (const [key, value] of Object.entries(patch)) next[key] = value?.__increment === undefined ? value : (next[key] ?? 0) + value.__increment;
    habits[reference.path[3]] = next;
    service.publish();
    return;
  }
  service.writes.push({ path: reference.path, patch: structuredClone(patch) });
  if (service.rejectWrites) throw new Error('Denied.');
  const commit = () => {
    const account = service.docs[reference.path[1]];
    const existing = account.progress || { checks: {}, optional: {} };
    account.progress = {
      checks: { ...existing.checks, ...patch.checks },
      optional: { ...existing.optional, ...patch.optional }
    };
    service.publish();
  };
  if (service.holdWrites) await new Promise(resolve => service.held.push(() => { commit(); resolve(); }));
  else commit();
}
export async function runTransaction(database, update) {
  if (service.rejectWrites) throw Object.assign(new Error('Denied.'), { code: 'permission-denied' });
  const writes = [];
  const transaction = {
    async get(reference) {
      const [, uid, collection, id] = reference.path;
      const data = collection === 'health' ? service.docs[uid]?.health?.[id] : service.docs[uid]?.[id];
      return { exists: () => data !== undefined, data: () => structuredClone(data) };
    },
    set(reference, data) { writes.push({ path: reference.path, data: structuredClone(data) }); }
  };
  const result = await update(transaction);
  for (const write of writes) {
    const [, uid, collection, id] = write.path;
    const account = service.docs[uid] ??= {};
    if (collection === 'health') {
      (account.health ??= {})[id] = write.data;
      service.healthWrites.push(write);
    } else account[id] = write.data;
  }
  if (writes.some(write => write.path[2] === 'hub')) service.imports++;
  service.publish();
  return result;
}
