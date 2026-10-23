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
export function onSnapshot(reference, options, next, failed) {
  const listener = { uid: reference.path[1], next, failed };
  service.listener = listener;
  queueMicrotask(() => { if (service.listener === listener) service.publish(); });
  return () => { if (service.listener === listener) service.listener = null; };
}
export async function setDoc(reference, patch) {
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
      const data = service.docs[reference.path[1]]?.[reference.path[3]];
      return { exists: () => data !== undefined, data: () => structuredClone(data) };
    },
    set(reference, data) { writes.push({ path: reference.path, data: structuredClone(data) }); }
  };
  const result = await update(transaction);
  for (const write of writes) (service.docs[write.path[1]] ??= {})[write.path[3]] = write.data;
  service.imports++;
  service.publish();
  return result;
}
