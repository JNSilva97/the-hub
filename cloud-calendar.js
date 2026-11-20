import { cloudWorkspace } from './cloud.js?v=calendar-week-1';
import { readCalendarRecord } from './calendar-model.mjs?v=calendar-week-1';

export function createCalendarAccount(onChange) {
  let uid, unsubscribe, generation = 0, ready = false, fromCache = true, pending = false, error = '';
  let records = new Map();
  function watch() {
    unsubscribe?.();
    const current = ++generation;
    uid = cloudWorkspace.user?.uid;
    records = new Map(); ready = false; fromCache = true; error = ''; pending = false;
    onChange();
    if (!uid) return;
    const { sdk, database } = cloudWorkspace.connection;
    unsubscribe = sdk.onSnapshot(sdk.collection(database, 'users', uid, 'calendar'), { includeMetadataChanges: true }, snapshot => {
      if (current !== generation || !ready && snapshot.empty && snapshot.metadata.fromCache) return;
      try {
        const next = new Map(snapshot.docs.map(doc => [doc.id, readCalendarRecord(doc.id, doc.data())]));
        records = next; ready = true; error = '';
        fromCache = Boolean(snapshot.metadata.fromCache); pending = Boolean(snapshot.metadata.hasPendingWrites);
      } catch { error = 'Your Calendar could not be read. Saved plans have not been changed.'; ready = false; }
      onChange();
    }, () => {
      if (current !== generation) return;
      ready = false; error = 'Calendar sync is unavailable. Check your connection or account rules.'; onChange();
    });
  }
  document.addEventListener('hub:accountchange', watch);
  window.addEventListener('online', () => { if (uid && error) watch(); else onChange(); });
  window.addEventListener('offline', onChange);
  watch();
  return {
    get uid() { return uid; }, get ready() { return ready; }, get error() { return error; },
    get records() { return new Map(records); },
    get canWrite() { return Boolean(uid && ready && !fromCache && !pending && navigator.onLine && !error); },
    retry: watch,
    async save(id, value, revision) {
      if (!this.canWrite) throw new Error('Connect and wait for Calendar to sync before saving.');
      const current = generation;
      const data = readCalendarRecord(id, { version: 1, ...value, revision: revision + 1 });
      const { sdk, database } = cloudWorkspace.connection;
      const ref = sdk.doc(database, 'users', uid, 'calendar', id);
      try {
        await sdk.runTransaction(database, async transaction => {
          const saved = await transaction.get(ref);
          if (current !== generation) throw new Error('Your account changed. Open Calendar again.');
          const actual = saved.exists() ? readCalendarRecord(id, saved.data()).revision : 0;
          if (actual !== revision) throw new Error('This plan changed on another device. Cancel to load it, then try again.');
          transaction.set(ref, data);
        });
      } catch (error) {
        if (error.code === 'permission-denied') throw new Error('Calendar could not sync. Check that its account rules are enabled. Your draft is still here.');
        throw error;
      }
    }
  };
}
