import { cloudWorkspace } from './cloud.js?v=calendar-layout-1';

// One versioned ledger per medication. A transaction rechecks doses and stock on the server.
export function createHealthAccount(onChange, validate) {
  let uid;
  let unsubscribe;
  let generation = 0;
  let ready = false;
  let cached = true;
  let error = '';
  let ledgers = new Map();

  function parse(id, data) {
    if (data.version !== 1 || !Number.isSafeInteger(data.revision) || data.revision < 1 || typeof data.payload !== 'string') throw new Error('Invalid Health ledger');
    const entries = JSON.parse(data.payload);
    validate(id, entries);
    return { revision: data.revision, entries };
  }

  function watch() {
    unsubscribe?.();
    const current = ++generation;
    const next = cloudWorkspace.user?.uid;
    if (uid !== next) ledgers = new Map();
    uid = next;
    ready = false;
    cached = true;
    error = '';
    onChange();
    if (!uid) return;
    const { sdk, database } = cloudWorkspace.connection;
    unsubscribe = sdk.onSnapshot(sdk.collection(database, 'users', uid, 'health'), { includeMetadataChanges: true }, snapshot => {
      if (current !== generation || snapshot.empty && snapshot.metadata.fromCache && !ready) return;
      try {
        const incoming = new Map(snapshot.docs.map(doc => [doc.id, parse(doc.id, doc.data())]));
        for (const [id, saved] of ledgers) {
          if (saved.revision > (incoming.get(id)?.revision ?? 0)) incoming.set(id, saved);
        }
        ledgers = incoming;
        ready = true;
        cached = snapshot.metadata.fromCache;
        error = '';
      } catch {
        ready = false;
        error = 'Account Health could not be read. Your stored records are unchanged.';
      }
      onChange();
    }, () => {
      if (current !== generation) return;
      ready = false;
      error = 'Health sync is unavailable. Check the connection or ask the app owner to enable Health sync.';
      onChange();
    });
  }

  document.addEventListener('hub:accountchange', watch);
  window.addEventListener('online', () => { if (uid && error) watch(); });

  return {
    watch,
    get uid() { return uid; },
    get ready() { return ready; },
    get cached() { return cached; },
    get error() { return error; },
    get entries() { return [...ledgers.values()].flatMap(ledger => ledger.entries); },
    async importSetup(records) {
      if (!uid || !ready || cached || !navigator.onLine) throw new Error('Connect to import medication.');
      const current = generation;
      const { sdk, database } = cloudWorkspace.connection;
      const references = records.map(record => sdk.doc(database, 'users', uid, 'health', record.medication));
      const added = await sdk.runTransaction(database, async transaction => {
        const snapshots = await Promise.all(references.map(reference => transaction.get(reference)));
        if (current !== generation) throw new Error('Health account changed');
        const created = [];
        records.forEach((record, index) => {
          if (snapshots[index].exists()) return;
          const entries = [record];
          validate(record.medication, entries);
          transaction.set(references[index], { version: 1, revision: 1, payload: JSON.stringify(entries) });
          created.push(record);
        });
        return created;
      });
      if (current !== generation) return [];
      for (const record of added) {
        if (!ledgers.has(record.medication)) ledgers.set(record.medication, { revision: 1, entries: [record] });
      }
      return added;
    },
    async reorder(order, positions) {
      if (!uid || !ready || cached || !navigator.onLine) throw new Error('Health requires an online connection to save.');
      const current = generation;
      const { sdk, database } = cloudWorkspace.connection;
      const references = order.map(id => sdk.doc(database, 'users', uid, 'health', id));
      const saved = await sdk.runTransaction(database, async transaction => {
        const snapshots = await Promise.all(references.map(reference => transaction.get(reference)));
        if (current !== generation) throw new Error('Health account changed');
        const updated = new Map();
        snapshots.forEach((snapshot, index) => {
          const id = order[index];
          const ledger = parse(id, snapshot.data());
          const settings = ledger.entries.find(entry => entry.type === 'settings');
          if (settings.position !== positions.get(id)) throw new Error('Medication order changed on another device.');
          if (settings.position === index) return;
          const entries = ledger.entries.map(entry => entry === settings ? { ...settings, position: index } : entry);
          const revision = ledger.revision + 1;
          const payload = JSON.stringify(entries);
          if (new TextEncoder().encode(payload).length > 450000) throw new Error('Health history is full.');
          transaction.set(references[index], { version: 1, revision, payload });
          updated.set(id, { revision, entries });
        });
        return updated;
      });
      if (current !== generation) return false;
      for (const [id, ledger] of saved) {
        if (ledger.revision > (ledgers.get(id)?.revision ?? 0)) ledgers.set(id, ledger);
      }
      return true;
    },
    async change(id, update) {
      if (!uid || !ready || cached || !navigator.onLine) throw new Error('Health requires an online connection to save.');
      const current = generation;
      const { sdk, database } = cloudWorkspace.connection;
      const reference = sdk.doc(database, 'users', uid, 'health', id);
      let readRevision;
      const commit = () => sdk.runTransaction(database, async transaction => {
        if (current !== generation) throw new Error('Health account changed');
        const snapshot = await transaction.get(reference);
        const saved = snapshot.exists() ? parse(id, snapshot.data()) : { revision: 0, entries: [] };
        readRevision = saved.revision;
        const change = update(saved.entries);
        if (!change) return saved;
        const entries = saved.entries.filter(entry => entry.key !== change.key);
        if (!change.remove) entries.push(change);
        validate(id, entries);
        const payload = JSON.stringify(entries);
        if (new TextEncoder().encode(payload).length > 450000) throw new Error('Health history is full.');
        const revision = saved.revision + 1;
        transaction.set(reference, { version: 1, revision, payload });
        return { revision, entries };
      });
      let ledger;
      try {
        ledger = await commit();
      } catch (error) {
        // Rules can reject a stale revision before the transaction reports a retryable conflict.
        if (error.code !== 'permission-denied' || current !== generation || readRevision === undefined) throw error;
        const latest = await sdk.getDocFromServer(reference);
        if (!latest.exists() || latest.data().revision <= readRevision) throw error;
        ledger = await commit();
      }
      if (current !== generation) return false;
      if (ledger.revision > (ledgers.get(id)?.revision ?? 0)) ledgers.set(id, ledger);
      return true;
    }
  };
}
