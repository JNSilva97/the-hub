import { cloudWorkspace } from './cloud.js?v=finance-subscriptions-1';
import { readEntry } from './library-model.mjs?v=finance-subscriptions-1';
export function createLibraryAccount(onChange) {
  let uid, unsubscribe, generation = 0, ready = false, cached = true, pending = false, error = '';
  let entries = new Map();
  function watch() {
    unsubscribe?.(); const current = ++generation;
    uid = cloudWorkspace.user?.uid; entries = new Map(); ready = false; cached = true; pending = false; error = ''; onChange();
    if (!uid) return;
    const { sdk, database } = cloudWorkspace.connection;
    unsubscribe = sdk.onSnapshot(sdk.collection(database, 'users', uid, 'library'), { includeMetadataChanges: true }, snapshot => {
      if (current !== generation || !ready && snapshot.empty && snapshot.metadata.fromCache) return;
      try {
        entries = new Map(snapshot.docs.map(doc => [doc.id, readEntry(doc.id, doc.data())]));
        ready = true; cached = Boolean(snapshot.metadata.fromCache); pending = Boolean(snapshot.metadata.hasPendingWrites); error = '';
      } catch { ready = false; error = 'Your library could not be read. Your saved titles have not been changed.'; }
      onChange();
    }, () => { if (current === generation) { ready = false; error = 'Library sync is unavailable. Check your connection or account rules.'; onChange(); } });
  }
  document.addEventListener('hub:accountchange', watch);
  window.addEventListener('online', () => { if (uid && error) watch(); else onChange(); });
  window.addEventListener('offline', onChange); watch();
  return {
    get uid() { return uid; }, get ready() { return ready; }, get error() { return error; }, get entries() { return new Map(entries); },
    get canWrite() { return Boolean(uid && ready && !cached && !pending && !error && navigator.onLine); }, retry: watch,
    async save(id, value, revision) {
      if (!this.canWrite) throw new Error('Connect and wait for your library to sync before saving.');
      const current = generation, { sdk, database } = cloudWorkspace.connection;
      const ref = sdk.doc(database, 'users', uid, 'library', id);
      await sdk.runTransaction(database, async tx => {
        const saved = await tx.get(ref);
        if (current !== generation) throw new Error('Your account changed. Reopen your library.');
        const actual = saved.exists() ? readEntry(id, saved.data()).revision : 0;
        if (actual !== revision) throw new Error('This title changed on another device. Close the editor and reopen it to see the latest version.');
        tx.set(ref, readEntry(id, { ...value, version: 1, revision: revision + 1, updatedAt: Date.now() }));
      });
    },
    async importEntries(items) {
      if (!this.canWrite || items.length > 300) throw new Error('Connect before importing up to 300 titles.');
      const current = generation, { sdk, database } = cloudWorkspace.connection;
      return sdk.runTransaction(database, async tx => {
        const refs = items.map(({ id }) => sdk.doc(database, 'users', uid, 'library', id));
        const saved = await Promise.all(refs.map(ref => tx.get(ref)));
        if (current !== generation) throw new Error('Your account changed. Import again in the correct account.');
        let added = 0;
        for (let i = 0; i < items.length; i++) if (!saved[i].exists()) {
          tx.set(refs[i], readEntry(items[i].id, { ...items[i].entry, revision: 1, updatedAt: Date.now() })); added++;
        }
        return added;
      });
    }
  };
}
