// Real Chrome, service worker and Firebase IndexedDB; fake identity, no account/backend traffic.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const sdkRoot = 'https://www.gstatic.com/firebasejs/13.1.0/';

test('offline startup and native queued ticks survive closing; private account data stays outside the app cache', { timeout: 90000 }, async t => {
  const sdk = new Map();
  for (const file of ['firebase-app.js', 'firebase-firestore.js']) {
    const response = await fetch(sdkRoot + file);
    assert.equal(response.ok, true);
    sdk.set(sdkRoot + file, await response.text());
  }
  sdk.set(sdkRoot + 'firebase-auth.js', `
    export const indexedDBLocalPersistence={}, browserLocalPersistence={}, browserPopupRedirectResolver={};
    export const initializeAuth=()=>({});
    export function onAuthStateChanged(auth,next){ window.changeAccount=next; queueMicrotask(()=>next({uid:'account-a',email:'test@example.invalid'})); }
    export const signOut=async()=>window.changeAccount(null);
  `);
  const publicFiles = new Set([
    ...Array.from(readFileSync(path.join(root, 'sw.js'), 'utf8').matchAll(/'([^']+\.(?:js|mjs|json|css|woff2|png|webmanifest|html))'/g), match => match[1]),
    'sw.js'
  ]);
  const requests = [];
  let release = 1;
  let failInstall = false;
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const filename = url.pathname === '/the-hub/' ? 'index.html' : url.pathname.slice('/the-hub/'.length);
    requests.push(url.pathname);
    if (!url.pathname.startsWith('/the-hub/') || !publicFiles.has(filename)) { response.writeHead(404); response.end(); return; }
    if (failInstall && filename === 'styles/core.css') { response.writeHead(503); response.end(); return; }
    response.setHeader('Content-Type', /\.m?js$/.test(filename) ? 'text/javascript' : filename.endsWith('.css') ? 'text/css' : /\.(json|webmanifest)$/.test(filename) ? 'application/json' : filename.endsWith('.png') ? 'image/png' : filename.endsWith('.woff2') ? 'font/woff2' : 'text/html');
    if (filename === 'firebase-config.mjs') response.end('export const firebaseConfig={projectId:"fixture-offline",apiKey:"fixture",appId:"fixture",authDomain:"fixture.invalid"};');
    else if (filename === 'sw.js') response.end(readFileSync(path.join(root, filename), 'utf8').replace(/\$\{prefix\}[^`]+/, '${prefix}offline-' + release));
    else if (filename === 'index.html' && release > 1) response.end(readFileSync(path.join(root, filename), 'utf8').replace('<title>The Hub</title>', `<title>The Hub release ${release}</title>`));
    else response.end(readFileSync(path.join(root, filename)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const blocked = [], errors = [];
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(origin + '/')) return route.continue();
    if (sdk.has(url)) return route.fulfill({ body: sdk.get(url), contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } });
    blocked.push(url); return route.abort();
  });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  let page = await context.newPage();
  failInstall = true;
  await page.goto(origin + '/the-hub/');
  await page.waitForFunction(() => document.getElementById('offline-status').textContent.startsWith('Offline setup did not finish.'));
  assert.equal(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), false);
  failInstall = false;
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller && document.getElementById('offline-status').textContent.includes('ready'));
  const definitions = JSON.parse(readFileSync(path.join(root, 'routines.demo.json'), 'utf8'));
  definitions.routines[0].name = 'Offline private fixture';
  // Seed only this fake project's local cache; networking is disabled before any write.
  await page.evaluate(async definitions => {
    const sdk = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js');
    const db = sdk.getFirestore();
    await sdk.disableNetwork(db);
    sdk.setDoc(sdk.doc(db, 'users', 'account-a', 'hub', 'routines'), definitions).catch(() => {});
    sdk.setDoc(sdk.doc(db, 'users', 'account-a', 'hub', 'progress'), { checks: {}, optional: {} }).catch(() => {});
    const noteId = '10000000-0000-4000-8000-000000000001';
    sdk.setDoc(sdk.doc(db, 'users', 'account-a', 'notes', noteId), {version:1,id:noteId,parent:'',text:'Cached account note',updatedAt:1,retired:false}).catch(() => {});
  }, definitions);
  await page.waitForFunction(() => document.getElementById('routine-name').textContent === 'Offline private fixture');
  await context.setOffline(true);
  await page.locator('#routines-launch').click();
  await page.locator('#field-complete').click();
  await page.waitForFunction(() => document.getElementById('routine-notice').textContent.startsWith('Saved on this device.'));
  assert.match(await page.locator('#routine-progress-label').textContent(), /1 of 3/);
  assert.equal(await page.evaluate(() => !dispatchEvent(new Event('beforeunload', { cancelable: true }))), false, 'A confirmed disk save must allow closing.');
  await page.close();
  page = await context.newPage();
  await page.goto(origin + '/the-hub/?v=offline-test');
  try {
    await page.waitForFunction(() => document.getElementById('routine-name').textContent === 'Offline private fixture');
  } catch (error) {
    console.log('Offline restart diagnostics', JSON.stringify({
      errors, blocked, requests,
      page: await page.evaluate(() => ({
        title: document.title,
        source: document.getElementById('routine-source')?.textContent,
        notice: document.getElementById('routine-notice')?.textContent,
        note: document.getElementById('routine-data-note')?.textContent,
        controller: navigator.serviceWorker.controller?.scriptURL
      }))
    }));
    throw error;
  }
  await page.locator('#routines-launch').click();
  assert.match(await page.locator('#routine-progress-label').textContent(), /1 of 3/);
  assert.match(await page.locator('#routine-notice').textContent(), /Saved on this device/);
  await page.locator('#field-complete').click();
  await page.waitForFunction(() => document.getElementById('routine-notice').textContent.startsWith('Saved on this device.'));
  await page.reload();
  await page.waitForFunction(() => document.getElementById('routine-name').textContent === 'Offline private fixture');
  assert.match(await page.locator('#routine-progress-label').textContent(), /2 of 3/);
  await page.locator('[data-icon="notes"]').click();
  await page.waitForFunction(() => document.getElementById('note-text').value === 'Cached account note' && !document.getElementById('note-text').readOnly);
  await page.locator('#note-text').fill('Account note edited offline');
  await page.waitForFunction(() => document.getElementById('notes-status').textContent.startsWith('Saved on device.'));
  await page.close();
  page = await context.newPage(); await page.goto(origin + '/the-hub/');
  await page.locator('[data-icon="notes"]').click();
  await page.waitForFunction(() => document.getElementById('note-text').value === 'Account note edited offline');
  assert.equal(await page.locator('#note-list button').count(), 1);
  await page.keyboard.press('Escape');
  await page.waitForFunction(async () => {
    const sdk = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js');
    const previous = await sdk.getDocFromCache(sdk.doc(sdk.getFirestore(), 'users', 'account-a', 'notes', '10000000-0000-4000-8000-000000000001'));
    return previous.data()?.retired === true && previous.data()?.text === undefined;
  });
  const cache = await page.evaluate(async () => {
    const keys = await caches.keys(), entries = [];
    for (const key of keys) for (const request of await (await caches.open(key)).keys()) entries.push(request.url);
    return entries;
  });
  assert.equal(cache.some(url => /private\/|firestore.googleapis.com|identitytoolkit|securetoken/.test(url)), false);
  assert.equal(cache.includes(sdkRoot + 'firebase-firestore.js'), true);
  assert.equal(cache.some(url => url.endsWith('/the-hub/styles/core.css')), true);
  await page.evaluate(() => window.changeAccount({ uid: 'account-b', email: 'other@example.invalid' }));
  await page.waitForFunction(() => document.getElementById('routine-list').children.length === 0);
  assert.equal(await page.locator('#routine-name').textContent(), 'Your next move');
  assert.equal(await page.locator('#core-signal-list').textContent().then(text => text.includes('Offline private fixture')), false);
  assert.match(await page.locator('#routine-notice').textContent(), /Open your checklists online once/);
  assert.equal(await page.locator('#note-text').inputValue(), '');
  assert.deepEqual(errors, []);
  assert.equal(blocked.some(url => url.includes('the-hub-16a6d')), false);
  assert.equal(requests.includes('/the-hub/private/routines.json'), true, 'Loopback may request but must never cache the private file.');
  await context.setOffline(false);
  const update = () => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration.update();
    const worker = registration.installing;
    if (worker && !['installed', 'redundant'].includes(worker.state)) await new Promise(resolve => worker.addEventListener('statechange', () => { if (['installed', 'redundant'].includes(worker.state)) resolve(); }));
    return Boolean(registration.waiting);
  });
  release = 2; failInstall = true;
  assert.equal(await update(), false, 'A partial download must not replace the working offline app.');
  assert.equal(await page.evaluate(async () => (await caches.keys()).some(key => key.endsWith('offline-1'))), true);
  release = 3; failInstall = false;
  assert.equal(await update(), true);
  assert.equal(await page.title(), 'The Hub', 'Updates must not reload a tab with pending checks.');
  await page.close();
  await context.setOffline(true);
  page = await context.newPage();
  await page.goto(origin + '/the-hub/');
  assert.equal(await page.title(), 'The Hub release 3');
  await page.waitForFunction(() => document.getElementById('routine-name').textContent === 'Offline private fixture');
  assert.match(await page.locator('#routine-progress-label').textContent(), /2 of 3/);
  const versions = await page.evaluate(() => caches.keys());
  assert.deepEqual(versions, ['the-hub:/the-hub/:offline-3']);
  assert.deepEqual(errors, []);
  await context.close();
});
