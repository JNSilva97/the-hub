// Runs only against a local emulator; never uses the live project or personal data.
const { test } = require('node:test');
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  test('Calendar security rules require the local Firestore emulator', { skip: true }, () => {});
} else {
  const { readFileSync } = require('node:fs');
  const path = require('node:path');
  const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
  const { doc, getDoc, setDoc, deleteDoc } = require('firebase/firestore');
  test('Calendar rules isolate owners and validate weekly patterns, date overrides and revisions', { timeout: 60000 }, async t => {
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
  });
}
