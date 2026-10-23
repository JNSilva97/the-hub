import { cloudWorkspace } from './cloud.js?v=notes-sync-1';
import { validateCloudNote, visibleNotes } from './notes-model.mjs?v=notes-sync-1';

// Each submitted version is immutable. Concurrent offline edits create separate versions, never overwrite text.
export function createCloudNotes(changed) {
  const writer = crypto.randomUUID();
  let user, prefix, stop, timer, generation = 0, ready = false, cached = true, queued = false, persistent = false, failure = '';
  let confirmed = false;
  const records = new Map(), drafts = new Map(), inflight = new Set(), durable = new Set();
  function notify() {
    document.dispatchEvent(new CustomEvent('hub:notessync', { detail: {
      pending: Boolean(drafts.size || inflight.size || queued),
      unsafe: [...drafts.keys()].some(id => !durable.has(id)) || queued && !persistent
    } }));
    queueMicrotask(changed);
  }
  function writeDraft(draft) {
    try { localStorage.setItem(prefix + draft.id, JSON.stringify(draft)); durable.add(draft.id); return true; }
    catch { durable.delete(draft.id); return false; }
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(flush, 600); }
  function flush() {
    clearTimeout(timer);
    if (!user || !ready || failure) return;
    const { sdk, database } = cloudWorkspace.connection;
    // Parents enter the SDK queue before descendants, including chains recovered after a reload.
    const remaining = [...drafts.values()].filter(draft => !inflight.has(draft.id));
    while (remaining.length) {
      const index = remaining.findIndex(draft => !remaining.some(parent => parent.id === draft.parent));
      if (index < 0) { failure = 'Saved note drafts could not be read. Their stored data is unchanged.'; notify(); return; }
      const draft = remaining.splice(index, 1)[0];
      draft.submitted = true;
      writeDraft(draft);
      const current = generation;
      inflight.add(draft.id);
      const batch = sdk.writeBatch(database);
      if (!draft.deleted) batch.set(sdk.doc(database, 'users', user.uid, 'notes', draft.id), validateCloudNote(draft));
      // Retain only a text-free marker so a delayed retry can never resurrect a retired version.
      if (draft.parent) batch.set(sdk.doc(database, 'users', user.uid, 'notes', draft.parent), { version: 1, id: draft.parent, retired: true });
      batch.commit().then(() => {
        if (current !== generation) return;
        // Keep the confirmed version visible even if the listener notification follows the commit promise.
        if (!draft.deleted) records.set(draft.id, validateCloudNote(draft));
        if (draft.parent) records.delete(draft.parent);
        try { localStorage.removeItem(prefix + draft.id); }
        catch { failure = 'Notes synced, but local draft cleanup failed. Reopen Notes to retry.'; return; }
        drafts.delete(draft.id); durable.delete(draft.id);
      }).catch(async () => {
        if (current !== generation) return;
        try {
          const stored = await sdk.getDoc(sdk.doc(database, 'users', user.uid, 'notes', draft.id));
          if (current !== generation) return;
          if (stored.data()?.retired === true && stored.data()?.id === draft.id) {
            localStorage.removeItem(prefix + draft.id); drafts.delete(draft.id); durable.delete(draft.id); return;
          }
        } catch { /* Keep the device draft until the server can confirm its version. */ }
        if (current === generation) failure = 'Notes have not synced. Your device copies are kept. Check the connection and Firebase notes rules, then try again.';
      }).finally(() => { if (current === generation) { inflight.delete(draft.id); notify(); } });
    }
    notify();
  }
  function reset() {
    const kept = user?.uid === cloudWorkspace.user?.uid ? [...drafts.values()] : [];
    stop?.(); clearTimeout(timer); generation++;
    user = cloudWorkspace.user; ready = false; cached = true; queued = false; persistent = false; confirmed = false; failure = '';
    records.clear(); drafts.clear(); inflight.clear(); durable.clear();
    if (!user) { notify(); return; }
    prefix = `thehub:notes:account:${user.uid}:v1:`;
    try {
      confirmed = localStorage.getItem(`thehub:notes-ready:${user.uid}:v1`) === '1';
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (!key?.startsWith(prefix)) continue;
        const draft = JSON.parse(localStorage.getItem(key));
        validateCloudNote(draft, key.slice(prefix.length));
        if (typeof draft.deleted !== 'boolean' || typeof draft.submitted !== 'boolean') throw new Error('Invalid draft.');
        drafts.set(draft.id, draft); durable.add(draft.id);
      }
    } catch { failure = 'Some device drafts could not be read. Their stored data is unchanged.'; }
    for (const draft of kept) if (!drafts.has(draft.id) || !durable.has(draft.id)) drafts.set(draft.id, draft);
    const { sdk, database } = cloudWorkspace.connection;
    const current = generation;
    notify();
    stop = sdk.onSnapshot(sdk.query(sdk.collection(database, 'users', user.uid, 'notes'), sdk.where('retired', '==', false)), { includeMetadataChanges: true }, snapshot => {
      if (current !== generation) return;
      try {
        const incoming = new Map(snapshot.docs.map(doc => [doc.id, validateCloudNote(doc.data(), doc.id)]));
        records.clear(); for (const [id, note] of incoming) records.set(id, note);
        cached = snapshot.metadata.fromCache; queued = Boolean(snapshot.metadata.hasPendingWrites);
        persistent = Boolean(sdk.getPersistentCacheIndexManager(database));
        if (!cached) {
          confirmed = true;
          try { localStorage.setItem(`thehub:notes-ready:${user.uid}:v1`, '1'); } catch { /* The open session can still sync without this empty-account marker. */ }
        }
        ready = confirmed || incoming.size > 0 || drafts.size > 0;
        // A reopened tab may already have these identical versions queued in Firebase's persistent cache.
        for (const [id, draft] of drafts) if (incoming.has(id) && JSON.stringify(incoming.get(id)) === JSON.stringify(validateCloudNote(draft))) {
          if (!queued && !cached) { try { localStorage.removeItem(prefix + id); drafts.delete(id); durable.delete(id); } catch { /* The idempotent retry keeps the stored draft safe. */ } }
        }
        notify();
        if (!failure && drafts.size && !cached) schedule();
      } catch { failure = 'Account notes could not be read. Stored notes and your device drafts are unchanged.'; notify(); }
    }, () => { if (current === generation) { ready = false; failure = 'Account notes are unavailable. Check the connection and publish the Firebase notes rules. Local notes are unchanged.'; notify(); } });
  }
  const api = {
    get user() { return user; }, get ready() { return ready; }, get error() { return failure; },
    get notes() { return visibleNotes(records, drafts); },
    get status() {
      if (failure) return failure;
      if (drafts.size || queued) return [...drafts.keys()].every(id => durable.has(id)) && (!queued || persistent) ? 'Saved on device. Syncs when The Hub is open and online.' : 'Not saved on this device yet. Keep this tab open and copy your text.';
      if (!ready) return navigator.onLine ? 'Loading your account notes…' : 'Open account Notes online once on this device before using them offline.';
      return cached || !navigator.onLine ? 'Offline copy. New edits save on this device.' : 'Synced to your account.';
    },
    stage(note, deleted = false) {
      if (!user || !ready) throw new Error('Account notes are not ready. Your local notes are unchanged.');
      const previous = drafts.get(note.id);
      let reuse = previous && !previous.submitted && previous.writer === writer;
      try { reuse = reuse && localStorage.getItem(prefix + previous.id) === JSON.stringify(previous); } catch { reuse = false; }
      const draft = { ...validateCloudNote({ ...note, retired: false, id: reuse ? note.id : crypto.randomUUID(), parent: reuse ? previous.parent : records.has(note.id) || previous ? note.id : '' }), deleted, submitted: false, writer };
      if (deleted) draft.text = '';
      if (!writeDraft(draft) && deleted) throw new Error('Deletion could not be saved. Your note is still here.');
      drafts.set(draft.id, draft); failure = ''; notify(); schedule();
      return draft;
    },
    retry() { failure = ''; if (!ready) reset(); else flush(); },
    flush
  };
  document.addEventListener('hub:accountchange', reset);
  window.addEventListener('online', () => { if (user) api.retry(); });
  window.addEventListener('offline', notify);
  window.addEventListener('storage', event => {
    if (!user) return;
    if (event.key === null) {
      durable.clear();
      if (drafts.size) failure = 'Device drafts were cleared in another tab. Open copies are kept here; copy your text before leaving.';
      notify(); return;
    }
    if (!event.key.startsWith(prefix)) return;
    if (!event.newValue) { durable.delete(event.key.slice(prefix.length)); notify(); return; }
    try {
      const draft = JSON.parse(event.newValue); validateCloudNote(draft, event.key.slice(prefix.length));
      if (!drafts.has(draft.id) || !inflight.has(draft.id)) { drafts.set(draft.id, draft); durable.add(draft.id); notify(); schedule(); }
    } catch { failure = 'A note draft from another tab could not be read. Stored data is unchanged.'; notify(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  reset();
  return api;
}
