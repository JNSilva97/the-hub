import { cloudWorkspace } from './cloud.js?v=addiction-helper-1';
import { readDay, readSettings, validDay } from './habits-model.mjs?v=3';

// One document per Lisbon day. Increments merge across devices and queue offline.
export function createHabitsAccount(onChange) {
  let uid;
  let unsubscribe;
  let generation = 0;
  let ready = false;
  let error = '';
  let days = new Map();
  let settings = null;

  function watch() {
    unsubscribe?.();
    unsubscribe = undefined;
    const current = ++generation;
    uid = cloudWorkspace.user?.uid;
    ready = false;
    error = '';
    days = new Map();
    settings = null;
    onChange();
    if (!uid) return;
    const { sdk, database } = cloudWorkspace.connection;
    unsubscribe = sdk.onSnapshot(sdk.collection(database, 'users', uid, 'habits'), { includeMetadataChanges: true }, snapshot => {
      if (current !== generation) return;
      if (!ready && snapshot.empty && snapshot.metadata.fromCache) return;
      try {
        const nextDays = new Map();
        let nextSettings = null;
        for (const doc of snapshot.docs) {
          if (doc.id === 'settings') nextSettings = readSettings(doc.data());
          else if (validDay(doc.id)) nextDays.set(doc.id, readDay(doc.data()));
        }
        days = nextDays;
        settings = nextSettings;
        ready = true;
        error = '';
      } catch {
        ready = false;
        error = 'Account habit counts could not be read. Counts are saved on this device for now.';
      }
      onChange();
    }, () => {
      if (current !== generation) return;
      ready = false;
      error = 'Account sync for habits is not enabled yet. Counts are saved on this device for now.';
      onChange();
    });
  }

  document.addEventListener('hub:accountchange', watch);
  window.addEventListener('online', () => { if (uid && error) watch(); });
  watch();

  const reference = id => {
    const { sdk, database } = cloudWorkspace.connection;
    return sdk.doc(database, 'users', uid, 'habits', id);
  };
  return {
    get uid() { return uid; },
    get ready() { return ready; },
    get error() { return error; },
    get days() { return days; },
    get settings() { return settings; },
    // Resolves when the server confirms; the snapshot shows the change immediately.
    add(day, counts) {
      const { sdk } = cloudWorkspace.connection;
      const patch = { version: 1 };
      for (const [key, delta] of Object.entries(counts)) if (delta) patch[key] = sdk.increment(delta);
      return sdk.setDoc(reference(day), patch, { merge: true });
    },
    saveSettings(values) {
      return cloudWorkspace.connection.sdk.setDoc(reference('settings'), { version: 1, ...readSettings(values) });
    },
    importDay(day, id, counts) {
      const { sdk, database } = cloudWorkspace.connection;
      const dayRef = reference(day);
      const receipt = sdk.doc(database, 'users', uid, 'habitImports', id);
      return sdk.runTransaction(database, async transaction => {
        const previous = await transaction.get(receipt);
        const imported = previous.exists() ? readDay(previous.data()) : { cigarettes: 0, coffees: 0 };
        if (previous.exists() && previous.data().day !== day) throw new Error('Import receipt belongs to another day.');
        const saved = await transaction.get(dayRef);
        const totals = saved.exists() ? readDay(saved.data()) : { cigarettes: 0, coffees: 0 };
        const next = readDay({
          cigarettes: totals.cigarettes + counts.cigarettes - imported.cigarettes,
          coffees: totals.coffees + counts.coffees - imported.coffees
        });
        if (!previous.exists() || counts.cigarettes !== imported.cigarettes || counts.coffees !== imported.coffees) {
          transaction.set(dayRef, { version: 1, ...next });
          transaction.set(receipt, { day, ...counts });
        }
      });
    },
    importSettings(values) {
      const { sdk, database } = cloudWorkspace.connection;
      const ref = reference('settings');
      return sdk.runTransaction(database, async transaction => {
        if (!(await transaction.get(ref)).exists()) transaction.set(ref, { version: 1, ...readSettings(values) });
      });
    }
  };
}
