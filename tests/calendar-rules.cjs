// Runs only against a local emulator; never uses the live project or personal data.
const { test } = require('node:test');
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  test('Calendar security rules require the local Firestore emulator', { skip: true }, () => {});
} else {
  const { readFileSync } = require('node:fs');
  const path = require('node:path');
  const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
  const { doc, getDoc, setDoc, deleteDoc, runTransaction } = require('firebase/firestore');
  test('Calendar and Fitness rules isolate owners and validate revisions and counters', { timeout: 60000 }, async t => {
    const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
    const env = await initializeTestEnvironment({ projectId: 'demo-the-hub-calendar', firestore: {
      host, port: Number(port), rules: readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8')
    } });
    t.after(() => env.cleanup());
    await env.clearFirestore();
    const a = env.authenticatedContext('account-a').firestore();
    const b = env.authenticatedContext('account-b').firestore();
    const guest = env.unauthenticatedContext().firestore();
    const ref = (db, id, uid = 'account-a') => doc(db, 'users', uid, 'calendar', id);
    const record = (plans = ['office'], revision = 1, mode = 'custom') => ({ version: 1, revision, mode, plans });
    await assertSucceeds(setDoc(ref(a, '2026-11-20'), record()));
    await assertSucceeds(setDoc(ref(a, 'repeat-5'), record(['office', 'training'])));
    await assertSucceeds(setDoc(ref(a, 'repeat-5'), { ...record(['office', 'training'], 2), details: { training: { time: '19:30', note: 'Bring gloves' } } }));
    for (const details of [{ office: { time: '25:00', note: '' } }, { office: { time: '', note: 'x'.repeat(121) } }, { training: { time: '', note: '' } }]) {
      await assertFails(setDoc(ref(a, '2026-11-22'), { ...record(), details }));
    }
    await assertSucceeds(getDoc(ref(a, '2026-11-20')));
    await assertFails(getDoc(ref(b, '2026-11-20')));
    await assertFails(getDoc(ref(guest, '2026-11-20')));
    await assertFails(setDoc(ref(a, '2026-11-20', 'account-b'), record()));
    await assertFails(setDoc(ref(guest, '2026-11-21'), record()));
    await assertFails(setDoc(ref(a, 'repeat-0'), record()));
    await assertFails(setDoc(ref(a, 'repeat-8'), record()));
    await assertFails(setDoc(ref(a, '2026-11-21'), record(['gym'])));
    await assertFails(setDoc(ref(a, '2026-11-21'), record(['office', 'office'])));
    await assertFails(setDoc(ref(a, '2026-11-21'), { ...record(), extra: 'unexpected' }));
    await assertFails(setDoc(ref(a, '2026-11-21'), record([], 1, 'bad')));
    await assertFails(setDoc(ref(a, 'repeat-3'), record([], 1, 'weekly')));
    await assertFails(setDoc(ref(a, '2026-11-21'), record(['office'], 1, 'weekly')));
    await assertFails(setDoc(ref(a, '2026-11-20'), record(['training'], 1)));
    await assertSucceeds(setDoc(ref(a, '2026-11-20'), record(['training'], 2)));
    await assertSucceeds(setDoc(ref(a, '2026-11-20'), record([], 3, 'weekly')));
    await assertSucceeds(setDoc(ref(a, '2026-11-21'), record([])));
    await assertFails(deleteDoc(ref(a, '2026-11-20')));
    const event = { title: 'Dinner', time: '20:00', note: '' };
    const eventRef = ref(a, '2026-11-23');
    await assertSucceeds(setDoc(eventRef, { ...record([]), events: [event] }));
    for (const events of [[{ ...event, title: ' ' }], [{ ...event, time: '25:00' }], Array(6).fill(event)]) {
      await assertFails(setDoc(eventRef, { ...record([], 2), events }));
    }
    await assertFails(setDoc(eventRef, record([], 2)));
    await assertSucceeds(setDoc(eventRef, { ...record([], 2), events: [] }));
    const fitness = (db, uid = 'account-a', day = '2026-11-20') => doc(db, 'users', uid, 'fitness', day);
    const reps = { version: 1, revision: 1, pushups: 50, abs: 10 };
    await assertSucceeds(setDoc(fitness(a), reps));
    await assertSucceeds(getDoc(fitness(a)));
    await assertFails(getDoc(fitness(b)));
    await assertFails(getDoc(fitness(guest)));
    await assertFails(setDoc(fitness(a, 'account-b'), reps));
    await assertFails(setDoc(fitness(guest), reps));
    await assertFails(setDoc(fitness(a), reps));
    await assertSucceeds(setDoc(fitness(a), { ...reps, revision: 2, abs: 50 }));
    for (const patch of [{ pushups: -1 }, { abs: 1.5 }, { abs: 5001 }, { extra: true }, { version: 2 }]) {
      await assertFails(setDoc(fitness(a), { ...reps, revision: 3, ...patch }));
    }
    await assertFails(setDoc(fitness(a, 'account-a', 'bad-day'), reps));
    await assertFails(deleteDoc(fitness(a)));
    const secondDevice = env.authenticatedContext('account-a').firestore();
    await Promise.all([a, secondDevice].map(async db => {
      for (let attempt = 0; ; attempt++) {
        try {
          await runTransaction(db, async tx => {
            const saved = (await tx.get(fitness(db))).data();
            tx.set(fitness(db), { ...saved, revision: saved.revision + 1, pushups: saved.pushups + 5 });
          });
          return;
        } catch (error) { if (error.code !== 'permission-denied' || attempt >= 2) throw error; }
      }
    }));
    const concurrent = (await getDoc(fitness(a))).data();
    if (concurrent.pushups !== 60 || concurrent.revision !== 4) throw new Error('Concurrent Fitness sets were lost.');
    const library = (db, uid = 'account-a') => doc(db, 'users', uid, 'library', 'entry-' + 'a'.repeat(32));
    const title = { version: 1, revision: 1, kind: 'series', title: 'Public fixture title', status: 'active', category: '', notes: '', platform: '', rating: 0, progress: 0, season: 1, episode: 2, updatedAt: 100 };
    await assertSucceeds(setDoc(library(a), title));
    await assertSucceeds(getDoc(library(a)));
    await assertFails(getDoc(library(b)));
    await assertFails(getDoc(library(guest)));
    await assertFails(setDoc(library(a, 'account-b'), title));
    await assertFails(setDoc(library(guest), title));
    await assertFails(setDoc(library(a), title));
    await assertSucceeds(setDoc(library(a), { ...title, revision: 2, episode: 3 }));
    for (const patch of [{ title: '' }, { kind: 'bad' }, { status: 'bad' }, { rating: 11 }, { progress: -1 }, { episode: 1.5 }, { notes: 'x'.repeat(3001) }, { extra: true }]) {
      await assertFails(setDoc(library(a), { ...title, revision: 3, ...patch }));
    }
    await assertFails(deleteDoc(library(a)));
  });
}
