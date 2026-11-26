import { cloudWorkspace } from './cloud.js?v=finance-backup-2';
import { readDay, readSettings, readSmokes, smokeEntry, validDay, validSmokeTime, smokeFreeSince } from './habits-model.mjs?v=finance-backup-2';

// One document per Lisbon day. Increments merge across devices and queue offline.
export function createHabitsAccount(onChange) {
  let uid;
  let unsubscribe;
  let generation = 0;
  let ready = false;
  let error = '';
  let days = new Map();
  let settings = null;
  let start = null;
  let adjustedAt = 0;
  let pending = false;

  function watch() {
    unsubscribe?.();
    unsubscribe = undefined;
    const current = ++generation;
    uid = cloudWorkspace.user?.uid;
    ready = false;
    error = '';
    days = new Map();
    settings = null;
    start = null;
    adjustedAt = 0;
    pending = false;
    onChange();
    if (!uid) return;
    const { sdk, database } = cloudWorkspace.connection;
    unsubscribe = sdk.onSnapshot(sdk.collection(database, 'users', uid, 'habits'), { includeMetadataChanges: true }, snapshot => {
      if (current !== generation) return;
      if (!ready && snapshot.empty && snapshot.metadata.fromCache) return;
      try {
        const nextDays = new Map();
        let nextSettings = null;
        let nextStart = null;
        let nextAdjustedAt = 0;
        for (const doc of snapshot.docs) {
          if (doc.id === 'settings') nextSettings = readSettings(doc.data());
          else if (doc.id === 'quit' && validSmokeTime(doc.data().startedAt)) {
            nextStart = doc.data().startedAt;
            nextAdjustedAt = validSmokeTime(doc.data().adjustedAt) ? doc.data().adjustedAt : 0;
          }
          else if (validDay(doc.id)) {
            const data = doc.data();
            const smokes = readSmokes(data);
            nextDays.set(doc.id, { ...readDay(data), smokes });
          }
        }
        days = nextDays;
        settings = nextSettings;
        start = nextStart;
        adjustedAt = nextAdjustedAt;
        pending = Boolean(snapshot.metadata.hasPendingWrites);
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
    get quitSince() { return smokeFreeSince(start, days, adjustedAt); },
    get pending() { return pending; },
    setQuitStart(at, correctedAt = Date.now()) {
      if (!ready || pending || !navigator.onLine || !validSmokeTime(at) || at > correctedAt) throw new Error('Connect and wait for Habits to sync before changing the timer.');
      for (const data of days.values()) for (const entry of readSmokes(data)) correctedAt = Math.max(correctedAt, Number(entry.slice(0, 16)));
      return cloudWorkspace.connection.sdk.setDoc(reference('quit'), { version: 1, startedAt: at, adjustedAt: correctedAt });
    },
    // Resolves when the server confirms; the snapshot shows the change immediately.
    add(day, counts) {
      const { sdk } = cloudWorkspace.connection;
      const patch = { version: 1 };
      for (const [key, delta] of Object.entries(counts)) if (delta) patch[key] = sdk.increment(delta);
      return sdk.setDoc(reference(day), patch, { merge: true });
    },
    recordSmoke(day, delta, at) {
      const { sdk } = cloudWorkspace.connection;
      const entry = delta > 0 ? smokeEntry(Math.max(at, adjustedAt + 1), crypto.randomUUID()) : days.get(day)?.smokes.at(-1);
      if (!entry) return sdk.setDoc(reference(day), { version: 1, cigarettes: sdk.increment(delta) }, { merge: true });
      const smokes = delta > 0 ? sdk.arrayUnion(entry) : sdk.arrayRemove(entry);
      return sdk.setDoc(reference(day), {
        version: 1, cigarettes: sdk.increment(delta), smokes, smokeOperation: crypto.randomUUID()
      }, { merge: true });
    },
    importQuit(base, logs, id, day, correctedAt = 0) {
      const { sdk, database } = cloudWorkspace.connection;
      const anchor = reference('quit');
      const dayRef = logs.length ? reference(logs[0].day) : null;
      const receipt = sdk.doc(database, 'users', uid, 'habitImports', id);
      return sdk.runTransaction(database, async transaction => {
        if ((await transaction.get(receipt)).exists()) return;
        const current = await transaction.get(anchor);
        const savedDay = dayRef ? await transaction.get(dayRef) : null;
        let startedAt = base;
        if (savedDay?.exists()) {
          const data = savedDay.data();
          const count = readDay(data).cigarettes;
          const smokes = readSmokes(data);
          const tracked = new Set(smokes);
          // A stable ID makes retrying an imported timestamp safe.
          for (const { at, day, index } of logs) {
            const entry = smokeEntry(at, `00000000-0000-0000-${day.slice(0, 4)}-${String(index).padStart(12, '0')}`);
            if (tracked.has(entry)) continue;
            if (tracked.size < count) tracked.add(entry);
            else startedAt = Math.max(startedAt ?? 0, at);
          }
          if (tracked.size !== smokes.length) transaction.set(dayRef, { smokes: [...tracked] }, { merge: true });
        } else if (logs.length) startedAt = Math.max(startedAt ?? 0, logs.at(-1).at);
        if (!current.exists() && validSmokeTime(startedAt)) transaction.set(anchor, {
          version: 1, startedAt: validSmokeTime(correctedAt) && validSmokeTime(base) ? base : startedAt,
          ...(validSmokeTime(correctedAt) ? { adjustedAt: correctedAt } : {})
        });
        transaction.set(receipt, { day, cigarettes: 0, coffees: 0 });
      });
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
          transaction.set(dayRef, { version: 1, ...next }, { merge: true });
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
