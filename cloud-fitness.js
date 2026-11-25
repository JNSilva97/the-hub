import { cloudWorkspace } from './cloud.js?v=quick-add-plan-time-1';
import { readFitnessDay, adjustFitnessDay } from './fitness-model.mjs?v=quick-add-plan-time-1';

export function createFitnessAccount(onChange) {
  let uid, unsubscribe, generation = 0, ready = false, cached = true, pending = false, error = '';
  let records = new Map();
  function watch() {
    unsubscribe?.();
    const current = ++generation;
    uid = cloudWorkspace.user?.uid;
    records = new Map(); ready = false; cached = true; pending = false; error = '';
    onChange();
    if (!uid) return;
    const { sdk, database } = cloudWorkspace.connection;
    unsubscribe = sdk.onSnapshot(sdk.collection(database, 'users', uid, 'fitness'), { includeMetadataChanges: true }, snapshot => {
      if (current !== generation || !ready && snapshot.empty && snapshot.metadata.fromCache) return;
      try {
        records = new Map(snapshot.docs.map(doc => [doc.id, readFitnessDay(doc.id, doc.data())]));
        ready = true; error = ''; cached = Boolean(snapshot.metadata.fromCache); pending = Boolean(snapshot.metadata.hasPendingWrites);
      } catch { ready = false; error = 'Fitness could not be read. Your saved progress has not been changed.'; }
      onChange();
    }, () => {
      if (current !== generation) return;
      ready = false; error = 'Fitness sync is unavailable. Check your connection or account rules.'; onChange();
    });
  }
  document.addEventListener('hub:accountchange', watch);
  window.addEventListener('online', () => { if (uid && error) watch(); else onChange(); });
  window.addEventListener('offline', onChange);
  watch();
  return {
    get uid() { return uid; }, get ready() { return ready; }, get error() { return error; },
    get records() { return new Map(records); },
    get canWrite() { return Boolean(uid && ready && !cached && !pending && navigator.onLine && !error); },
    retry: watch,
    async adjust(day, exercise, delta) {
      if (!this.canWrite) throw new Error('Connect and wait for Fitness to sync before adding reps.');
      const current = generation;
      const { sdk, database } = cloudWorkspace.connection;
      const ref = sdk.doc(database, 'users', uid, 'fitness', day);
      // A concurrent revision can be denied by rules before the SDK retries its
      // optimistic transaction. Read the latest record again, at most twice.
      for (let attempt = 0; ; attempt++) {
        try {
          await sdk.runTransaction(database, async transaction => {
            const saved = await transaction.get(ref);
            if (current !== generation) throw new Error('Your account changed. Open Fitness again.');
            transaction.set(ref, adjustFitnessDay(day, saved.exists() ? saved.data() : null, exercise, delta));
          });
          return;
        } catch (error) {
          if (error.code !== 'permission-denied' || attempt >= 2 || current !== generation || !navigator.onLine) throw error;
        }
      }
    }
  };
}
