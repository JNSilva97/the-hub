import { firebaseConfig } from './firebase-config.mjs?v=sync-2';
import { validateRoutines, parseProgress, getProgressPatch } from './routine-model.mjs?v=sync-1';

const panel = document.getElementById('account-dialog');
const loginButton = document.getElementById('account-login');
const logoutButton = document.getElementById('account-logout');
const importButton = document.getElementById('account-import');
const retryButton = document.getElementById('account-retry');
const status = document.getElementById('account-status');
const local = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
let sdk;
let auth;
let database;
let user = null;
let routines = null;
let progress = parseProgress(null);
let ready = false;
let failure = '';
let setupFailure = false;
let watching;
let generation = 0;
let sequence = 0;
let pending = 0;
let importing = false;
const edits = new Map();

function render() {
  loginButton.hidden = Boolean(user);
  loginButton.disabled = !auth || setupFailure;
  logoutButton.hidden = !user;
  logoutButton.disabled = importing || pending > 0 || edits.size > 0;
  importButton.hidden = !user || !ready || routines !== null || !local || Boolean(failure);
  importButton.disabled = importing;
  retryButton.hidden = !firebaseConfig || (!failure && !edits.size);
  retryButton.disabled = importing || pending > 0;
  document.getElementById('account-identity').textContent = user ? user.email || 'Signed in' : 'Your checklists, on your devices.';
  document.getElementById('account-launch').textContent = user ? 'Account & sync' : 'Private access';
  let message;
  if (!firebaseConfig) message = 'Private access is not configured yet. Your existing checklists still work.';
  else if (failure) message = failure;
  else if (importing) message = 'Uploading your PC checklists… Keep this tab open.';
  else if (!auth) message = 'Connecting to Firebase…';
  else if (!user) message = 'Sign in to access your private checklists. Notes stay in this browser.';
  else if (!ready) message = 'Loading your account…';
  else if (edits.size && !navigator.onLine) message = 'Waiting for a connection. Keep this tab open to sync your ticks.';
  else if (pending) message = 'Saving your ticks… Keep this tab open until saved.';
  else if (edits.size) message = 'Your ticks have not synced. Keep this tab open and choose Try again.';
  else if (routines) message = 'Checklists synced. Notes stay in this browser.';
  else message = local ? 'Your account has no checklists yet. Choose “Sync PC checklists” to upload your personal lists and current ticks.'
    : 'Your account has no checklists yet. Open the PC version, sign in and choose “Sync PC checklists”.';
  status.textContent = message;
  status.dataset.warning = String(Boolean(failure) || !navigator.onLine && edits.size > 0);
  const routineNotice = document.getElementById('routine-notice');
  if (document.getElementById('routines-dialog').dataset.source === 'account') {
    routineNotice.textContent = failure || (pending || edits.size ? 'Ticks not yet synced. Keep this tab open.' : 'Progress synced to your account.');
  }
}

function notify(kind = 'hub:workspacechange') {
  render();
  document.dispatchEvent(new Event(kind));
}

function applyEdits(saved) {
  const result = parseProgress(JSON.stringify(saved));
  for (const edit of edits.values()) result[edit.field][edit.key] = edit.value;
  return result;
}

function watchAccount() {
  watching?.();
  const current = ++generation;
  ready = false;
  failure = '';
  notify();
  watching = sdk.onSnapshot(sdk.collection(database, 'users', user.uid, 'hub'), { includeMetadataChanges: true }, snapshot => {
    if (current !== generation) return;
    // An empty local cache is not evidence that the online account is empty.
    if (!ready && snapshot.metadata.fromCache && snapshot.empty) return;
    try {
      let definitions;
      let saved;
      for (const record of snapshot.docs) {
        if (record.id === 'routines') definitions = record.data();
        if (record.id === 'progress') saved = record.data();
      }
      const incomingRoutines = definitions ? validateRoutines(definitions) : null;
      if (incomingRoutines && !saved) throw new Error('Missing progress.');
      const incomingProgress = saved ? parseProgress(JSON.stringify(saved)) : parseProgress(null);
      const changed = !ready || failure || JSON.stringify(routines) !== JSON.stringify(incomingRoutines);
      routines = incomingRoutines;
      progress = applyEdits(incomingProgress);
      ready = true;
      failure = '';
      notify(changed ? 'hub:workspacechange' : 'hub:cloudprogress');
    } catch {
      failure = 'Your online checklists could not be read. Their stored data is unchanged. Try again.';
      ready = false;
      notify();
    }
  }, () => {
    if (current !== generation) return;
    failure = 'Account access failed. Check the connection and Firebase access rules, then try again.';
    ready = false;
    notify();
  });
}

async function connect() {
  if (!firebaseConfig || auth) return;
  setupFailure = false;
  failure = '';
  render();
  try {
    // Pin the official SDK; load only Authentication and Firestore, without Analytics.
    const [app, authentication, firestore] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js')
    ]);
    sdk = { ...authentication, ...firestore };
    const instance = app.initializeApp(firebaseConfig);
    // The SDK manages credentials. This visit's login is not retained after the tab closes.
    auth = sdk.initializeAuth(instance, { persistence: sdk.browserSessionPersistence, popupRedirectResolver: sdk.browserPopupRedirectResolver });
    database = sdk.initializeFirestore(instance, { localCache: sdk.memoryLocalCache() });
    sdk.onAuthStateChanged(auth, incoming => {
      watching?.();
      watching = undefined;
      generation++;
      user = incoming;
      routines = null;
      progress = parseProgress(null);
      edits.clear();
      pending = 0;
      importing = false;
      ready = false;
      failure = '';
      if (user) watchAccount();
      else notify();
    }, () => {
      failure = 'Sign-in could not be restored. Reload this page and try again.';
      notify();
    });
    render();
  } catch {
    setupFailure = true;
    failure = 'Firebase could not start. Check the connection and project configuration, then try again.';
    render();
  }
}

async function sendEdits(submitted) {
  if (!submitted.length || !user || !ready || !routines) return;
  const accountId = user.uid;
  const current = generation;
  const patch = {};
  for (const edit of submitted) (patch[edit.field] ??= {})[edit.key] = edit.value;
  pending++;
  failure = '';
  render();
  try {
    // Merge individual map entries, so changes to different ticks do not overwrite each other.
    await sdk.setDoc(sdk.doc(database, 'users', accountId, 'hub', 'progress'), patch, { merge: true });
    if (current !== generation) return;
    for (const edit of submitted) {
      const id = `${edit.field}/${edit.key}`;
      if (edits.get(id)?.sequence === edit.sequence) edits.delete(id);
    }
  } catch {
    if (current !== generation) return;
    failure = 'Your ticks have not synced. They are kept in this tab. Try again before leaving.';
  } finally {
    if (current === generation) { pending--; render(); }
  }
}

export const cloudWorkspace = {
  get user() { return user; },
  get ready() { return ready; },
  get error() { return failure; },
  get active() { return Boolean(user && ready && routines); },
  get routines() { return routines; },
  get progress() { return parseProgress(JSON.stringify(progress)); },
  save(next) {
    if (!this.active) throw new Error('Account is not ready.');
    const patch = getProgressPatch(progress, next);
    const submitted = [];
    for (const [field, values] of Object.entries(patch)) for (const [key, value] of Object.entries(values)) {
      const edit = { field, key, value, sequence: ++sequence };
      edits.set(`${field}/${key}`, edit);
      submitted.push(edit);
    }
    progress = applyEdits(next);
    sendEdits(submitted);
  },
  async importPC() {
    if (!local || !user || !ready || routines || importing) return;
    const current = generation;
    const accountId = user.uid;
    importing = true;
    render();
    try {
      const response = await fetch('./private/routines.json', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('Personal lists unavailable.');
      const data = await response.json();
      validateRoutines(data);
      // Import only personal progress; unreadable storage aborts instead of silently losing ticks.
      const saved = parseProgress(localStorage.getItem('thehub:routines:private:v1'));
      if (current !== generation) return;
      const definitionsRef = sdk.doc(database, 'users', accountId, 'hub', 'routines');
      const progressRef = sdk.doc(database, 'users', accountId, 'hub', 'progress');
      await sdk.runTransaction(database, async transaction => {
        const existing = await transaction.get(definitionsRef);
        const existingProgress = await transaction.get(progressRef);
        if (existing.exists() || existingProgress.exists()) throw new Error('Account already has data.');
        if (current !== generation) throw new Error('Account changed.');
        transaction.set(definitionsRef, { version: 1, routines: data.routines });
        transaction.set(progressRef, saved);
      });
    } catch {
      if (current === generation) failure = 'PC import did not finish. Existing account data and local files were not replaced. Check your connection, personal file and saved ticks, then try again.';
    } finally {
      if (current === generation) { importing = false; render(); }
    }
  }
};

document.getElementById('account-launch').addEventListener('click', () => { render(); panel.showModal(); });
panel.addEventListener('click', event => {
  if (event.target !== panel) return;
  const bounds = panel.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) panel.close();
});
loginButton.addEventListener('click', () => {
  if (!auth) return;
  failure = '';
  loginButton.disabled = true;
  const provider = new sdk.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  sdk.signInWithPopup(auth, provider).catch(error => {
    if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
      failure = 'Google sign-in did not finish. Allow the sign-in window and check that this site is authorized in Firebase.';
    }
  }).finally(render);
});
logoutButton.addEventListener('click', () => {
  if (!auth || importing || pending || edits.size) return;
  sdk.signOut(auth).catch(() => { failure = 'Sign-out did not finish. Try again.'; render(); });
});
importButton.addEventListener('click', () => cloudWorkspace.importPC());
retryButton.addEventListener('click', () => {
  // Failed module downloads remain cached by the browser until a reload.
  if (setupFailure) location.reload();
  else if (!auth) connect();
  else if (edits.size && ready) sendEdits([...edits.values()]);
  else if (user) watchAccount();
  else { failure = ''; render(); }
});
window.addEventListener('online', render);
window.addEventListener('offline', render);
window.addEventListener('beforeunload', event => {
  if (pending || edits.size || importing) { event.preventDefault(); event.returnValue = ''; }
});
render();
connect();
