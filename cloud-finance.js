import { cloudWorkspace } from './cloud.js?v=finance-categories-1';
import { readFinance, prepareFinanceChanges, prepareFinanceRestore } from './finance-model.mjs?v=finance-categories-1';

export function createFinanceAccount(onChange) {
  let uid, stop, generation = 0, ready = false, cached = true, pending = false, error = '';
  let events = [], revision = 0;
  function watch() {
    stop?.();
    const current = ++generation;
    uid = cloudWorkspace.user?.uid;
    ready = false; cached = true; pending = false; error = ''; events = []; revision = 0;
    onChange();
    if (!uid) return;
    const { sdk, database } = cloudWorkspace.connection;
    stop = sdk.onSnapshot(sdk.collection(database, 'users', uid, 'finance'), { includeMetadataChanges: true }, snapshot => {
      if (current !== generation || !ready && snapshot.empty && snapshot.metadata.fromCache) return;
      try {
        const data = snapshot.docs.find(doc => doc.id === 'ledger')?.data();
        events = data ? readFinance(data) : [];
        revision = data?.revision ?? 0;
        ready = true; error = ''; cached = snapshot.metadata.fromCache; pending = snapshot.metadata.hasPendingWrites;
      } catch { ready = false; error = 'Finance history could not be read.'; }
      onChange();
    }, () => {
      if (current !== generation) return;
      ready = false; error = 'Finance sync is unavailable.';
      onChange();
    });
  }
  document.addEventListener('hub:accountchange', watch);
  window.addEventListener('online', () => { if (uid && error) watch(); else onChange(); });
  window.addEventListener('offline', onChange);
  watch();

  return {
    get uid() { return uid; }, get ready() { return ready; }, get error() { return error; },
    get events() { return events; }, get revision() { return revision; },
    get canWrite() { return Boolean(uid && ready && !cached && !pending && navigator.onLine && !error); },
    retry: watch,
    save(changes, expectedRevision) {
      return this.write(events => prepareFinanceChanges(events, changes), expectedRevision,
        'Balances changed. Reopen the confirmation to compare again.');
    },
    restore(backup, expectedRevision) {
      return this.write(events => prepareFinanceRestore(events, backup), expectedRevision,
        'Finance changed. Open the backup again to review the latest history.');
    },
    importMovements(changes, expectedRevision) {
      return this.write(events => prepareFinanceChanges(events, changes), expectedRevision,
        'Finance changed. Review the movement list again.');
    },
    async write(prepare, expectedRevision, conflictMessage) {
      if (!this.canWrite) throw new Error('Connect and wait for Finance to sync before saving.');
      const current = generation;
      const { sdk, database } = cloudWorkspace.connection;
      const ref = sdk.doc(database, 'users', uid, 'finance', 'ledger');
      try {
        const saved = await sdk.runTransaction(database, async transaction => {
          const snapshot = await transaction.get(ref);
          if (current !== generation) throw new Error('Your account changed. Open Finance again.');
          const data = snapshot.exists() ? snapshot.data() : undefined;
          const actual = data?.revision ?? 0;
          if (expectedRevision !== undefined && actual !== expectedRevision) throw new Error(conflictMessage);
          const now = data ? readFinance(data) : [];
          const next = prepare(now);
          if (next.events.length === now.length) return { events: now, revision: actual };
          transaction.set(ref, { version: 1, revision: actual + 1, payload: next.payload });
          return { events: next.events, revision: actual + 1 };
        });
        if (current === generation && revision <= saved.revision) {
          events = saved.events;
          revision = saved.revision;
          onChange();
        }
      } catch (failure) {
        if (failure.code === 'permission-denied' || failure.code === 'aborted') {
          throw new Error('Finance could not sync. Check the connection and try again.');
        }
        throw failure;
      }
    }
  };
}
