// Requires Playwright and Chrome; no test server or personal data is used.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const origin = 'https://the-hub.test';
const storageKey = 'thehub:routines:demo:v1';
const demo = readFileSync(path.join(root, 'routines.demo.json'), 'utf8');
const publicFiles = ['index.html', 'styles/routine-tools.css', 'routine-tools.js', 'workspace-model.mjs', 'install.js', 'manifest.webmanifest', 'assets/icons/hub-192.png', 'assets/icons/hub-512.png', 'assets/icons/hub-180.png', 'styles/base.css', 'styles/shell.css', 'styles/core.css', 'styles/access.css', 'styles/panels.css', 'styles/routines.css', 'styles/notes.css', 'styles/motion.css', 'core-progress.js', 'core-transition.js', 'interface-sound.js', 'experience.js', 'interface.js', 'notes.js', 'routines.js', 'routine-model.mjs', 'cloud.js', 'firebase-config.mjs', 'routines.demo.json', 'assets/fonts/orbitron-latin.woff2', 'assets/fonts/rajdhani-latin-600.woff2'];

async function fixture(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: options.width || 1024, height: 900 }, reducedMotion: options.motion || 'no-preference' });
  const requests = [];
  const errors = [];
  const failures = { data: false, module: false, dependency: false, sdk: Boolean(options.sdkFailure) };
  if (options.firebase) await context.addInitScript(({ documents, signedIn, fromCache }) => {
    window.__hubFirebase = {
      docs: documents,
      user: signedIn ? { uid: 'account-a', email: 'test@example.invalid' } : null,
      writes: [], held: [], imports: 0, rejectWrites: false, holdWrites: false, fromCache,
      publish() {
        if (!this.listener) return;
        const records = Object.entries(this.docs[this.listener.uid] || {});
        this.listener.next({ empty: !records.length, metadata: { fromCache: this.fromCache }, docs: records.map(([id, data]) => ({ id, data: () => structuredClone(data) })) });
      }
    };
  }, { documents: options.cloudDocuments || {}, signedIn: options.signedIn !== false, fromCache: Boolean(options.fromCache) });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const filename = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    requests.push({ pathname: url.pathname, method: request.method() });
    if (options.firebase && url.hostname === 'www.gstatic.com') {
      if (failures.sdk) return route.abort();
      return route.fulfill({ path: path.join(root, 'tests/firebase-fixture.mjs'), contentType: 'text/javascript' });
    }
    // Never connect regression tests to the real account, even after production activation.
    if (filename === 'firebase-config.mjs') return route.fulfill({ contentType: 'text/javascript', body: options.firebase ? 'export const firebaseConfig = {projectId:"fixture",apiKey:"fixture",authDomain:"fixture.firebaseapp.com",appId:"fixture"};' : 'export const firebaseConfig = null;' });
    if (filename === 'core-transition.js' && options.noTransition) return route.abort();
    if (filename === 'notes.js' && options.noNotes) return route.abort();
    if (filename === 'routines.demo.json' && options.dataDelay) await new Promise(resolve => setTimeout(resolve, options.dataDelay));
    if (filename === 'routines.demo.json' && failures.data) return route.fulfill({ status: 503, body: 'Unavailable' });
    if (filename === 'routines.demo.json' && options.data) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(options.data) });
    if (filename === 'routines.js' && failures.module) return route.abort();
    if (filename === 'routine-model.mjs' && failures.dependency) return route.abort();
    if (url.pathname === '/private/routines.json' && options.private) return route.fulfill({ contentType: 'application/json', body: demo });
    if (!publicFiles.includes(filename)) return route.fulfill({ status: 404, body: 'Not found' });
    const contentType = filename.endsWith('.woff2') ? 'font/woff2' : filename.endsWith('.css') ? 'text/css' : /\.m?js$/.test(filename) ? 'text/javascript' : filename.endsWith('.json') ? 'application/json' : 'text/html';
    return route.fulfill({ path: path.join(root, filename), contentType });
  });
  return { context, requests, errors, failures, page: await context.newPage() };
}

async function ready(page, url = origin) {
  await page.goto(url);
  await page.waitForSelector('#routines-dialog[data-ready="true"]', { state: 'attached' });
  await page.evaluate(() => document.fonts.ready);
}

async function openRoutines(page) {
  await page.locator('#routines-launch').click({ timeout: 5000 });
  assert.equal(await page.locator('#routines-dialog').evaluate(element => element.open), true);
}

async function reviewChecklist(page) {
  if (!await page.locator('#routine-review').evaluate(element => element.open)) await page.locator('#routine-review > summary').click();
}

test('The Hub browser regressions', { timeout: 240000 }, async t => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());

  await t.test('editor preserves ticks through rename/reorder and confirms removal; backup round-trips at mobile width', async () => {
    const { context, page, errors } = await fixture(browser, { width: 320, motion: 'reduce' });
    try {
      await ready(page); await openRoutines(page); await page.locator('#field-complete').click();
      await page.locator('#control-launch').click();
      assert.equal(await page.locator('#checklist-control').evaluate(el => el.scrollWidth > el.clientWidth), false);
      await page.getByLabel('Checklist name', { exact: true }).fill('My edited list');
      await page.locator('.editor-item').first().getByRole('button', { name: 'Move item 1 down', exact: true }).click();
      await page.locator('#editor-save').click(); await page.waitForFunction(() => document.getElementById('control-status').textContent.startsWith('Saved.'));
      let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('thehub:workspace:demo:v1')));
      assert.equal(saved.routines[0].name, 'My edited list'); assert.equal(saved.progress.checks['personal-care/care/item-1'], true);
      await page.locator('#control-close').click(); await page.locator('#backup-launch').click();
      const downloaded = page.waitForEvent('download'); await page.locator('#backup-export').click();
      const download = await downloaded; const backupText = readFileSync(await download.path(), 'utf8');
      assert.equal(JSON.parse(backupText).format, 'the-hub-checklists');
      await page.locator('#backup-close').click(); await page.locator('#control-launch').click();
      await page.locator('.editor-item').nth(1).getByRole('button', { name: 'Remove item 2', exact: true }).click();
      await page.locator('#editor-save').click(); assert.equal(await page.locator('#control-confirm').evaluate(el => el.open), true);
      await page.locator('#control-confirm-yes').click(); await page.waitForFunction(() => document.getElementById('control-status').textContent.startsWith('Saved.'));
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('thehub:workspace:demo:v1')).progress.checks['personal-care/care/item-1']), undefined);
      await page.locator('#control-close').click(); await page.locator('#backup-launch').click();
      await page.locator('#backup-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backupText) });
      await page.locator('#backup-restore').click(); await page.locator('#control-confirm-yes').click();
      await page.waitForFunction(() => document.getElementById('backup-status').textContent.startsWith('Saved.'));
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('thehub:workspace:demo:v1'))), saved);
      await page.locator('#backup-close').click(); await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.getElementById('core-signal-list').textContent.includes('My edited list'));
      assert.match(await page.locator('#core-signal-list').textContent(), /My edited list/);
      await page.reload(); await page.waitForSelector('#routines-dialog[data-ready="true"]', { state: 'attached' });
      assert.equal(await page.locator('#routine-name').textContent(), 'My edited list');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('editor creates lists, sections and items; failed storage keeps the draft and rejects invalid backup', async () => {
    const { context, page, errors } = await fixture(browser, { motion: 'reduce' });
    try {
      await ready(page); await openRoutines(page); await page.locator('#control-launch').click();
      await page.locator('#editor-add-list').click(); await page.getByLabel('Checklist name', { exact: true }).fill('Created checklist');
      await page.getByRole('button', { name: '+ Add section', exact: true }).click();
      await page.locator('.editor-section').last().getByRole('button', { name: '+ Add item', exact: true }).click();
      await page.evaluate(() => { window.__originalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function() { throw new Error('full'); }; });
      await page.locator('#editor-save').click(); assert.match(await page.locator('#control-status').textContent(), /could not save/);
      assert.equal(await page.getByLabel('Checklist name', { exact: true }).inputValue(), 'Created checklist');
      await page.evaluate(() => { Storage.prototype.setItem = window.__originalSetItem; });
      await page.locator('#editor-save').click(); await page.waitForFunction(() => document.getElementById('control-status').textContent.startsWith('Saved.'));
      assert.equal(await page.locator('.routine-card').count(), 6);
      await page.locator('#control-close').click(); await page.locator('#backup-launch').click();
      await page.locator('#backup-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"other"}') });
      await page.waitForFunction(() => document.getElementById('backup-status').textContent.includes('not a supported'));
      assert.equal(await page.locator('#restore-preview').isVisible(), false); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('editing stays inside the selected checklist and guards Escape, exit and backdrop; backup stays separate', async () => {
    const { context, page, errors } = await fixture(browser, { width: 320, motion: 'reduce' });
    try {
      await ready(page); await openRoutines(page); await page.locator('.routine-card').nth(2).click();
      const name = await page.locator('#routine-name').textContent();
      await page.locator('#control-launch').click();
      assert.equal(await page.getByLabel('Checklist name', { exact: true }).inputValue(), name);
      assert.equal(await page.locator('#routines-dialog').evaluate(el => el.matches(':modal')), true);
      assert.equal(await page.locator('#routine-reader').isVisible(), false);
      assert.equal(await page.locator('#backup-launch').isDisabled(), true);
      await page.getByLabel('Checklist name', { exact: true }).fill('Unsaved draft');
      for (const exit of [() => page.keyboard.press('Escape'), () => page.getByRole('button', {name:'Close routines',exact:true}).click(), () => page.mouse.click(1,1)]) {
        await exit(); await page.waitForSelector('#control-confirm[open]');
        assert.equal(await page.locator('#routines-dialog').evaluate(el => el.open), true);
        await page.locator('#control-confirm .restart-keep').click();
        assert.equal(await page.getByLabel('Checklist name', {exact:true}).inputValue(), 'Unsaved draft');
      }
      await page.locator('#control-close').click(); await page.locator('#control-confirm-yes').click();
      assert.equal(await page.locator('#routine-reader').isVisible(), true);
      assert.equal(await page.locator('#routine-name').textContent(), name);
      await page.locator('#backup-launch').click(); assert.equal(await page.locator('#backup-dialog').evaluate(el => el.open), true);
      assert.equal(await page.getByLabel('Checklist name', {exact:true}).count(), 0);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('cloud editor retains concurrent ticks, rejects stale revisions and preserves a rejected draft', async () => {
    const { context, page, errors } = await fixture(browser, { motion: 'reduce', firebase: true, cloudDocuments: { 'account-a': { routines: JSON.parse(demo), progress: { checks: {}, optional: {} } } } });
    try {
      await ready(page); await page.waitForFunction(() => document.getElementById('routines-dialog').dataset.source === 'account');
      await openRoutines(page); await page.locator('#control-launch').click();
      await page.getByLabel('Checklist name', { exact: true }).fill('Cloud edit');
      await page.evaluate(() => { const service = window.__hubFirebase; service.docs['account-a'].progress.checks['personal-care/care/item-1'] = true; service.publish(); service.rejectWrites = true; });
      await page.locator('#editor-save').click(); await page.waitForFunction(() => document.getElementById('control-status').textContent.includes('could not save'));
      assert.equal(await page.getByLabel('Checklist name', { exact: true }).inputValue(), 'Cloud edit');
      await page.evaluate(() => { window.__hubFirebase.rejectWrites = false; }); await page.locator('#editor-save').click();
      await page.waitForFunction(() => document.getElementById('control-status').textContent.startsWith('Saved.'));
      assert.equal(await page.evaluate(() => window.__hubFirebase.docs['account-a'].progress.checks['personal-care/care/item-1']), true);
      assert.equal(await page.evaluate(() => window.__hubFirebase.docs['account-a'].routines.revision), 1);
      await page.getByLabel('Checklist name', { exact: true }).fill('Stale draft');
      await page.evaluate(() => { const service = window.__hubFirebase; service.docs['account-a'].routines.revision = 2; service.docs['account-a'].routines.routines[0].name = 'Other device'; service.publish(); });
      await page.locator('#editor-save').click(); await page.waitForFunction(() => document.getElementById('control-status').textContent.includes('changed on another device'));
      assert.equal(await page.getByLabel('Checklist name', { exact: true }).inputValue(), 'Stale draft');
      await page.evaluate(() => { window.__hubFirebase.user = null; window.__hubFirebase.authListener(null); });
      assert.equal(await page.locator('#checklist-control').evaluate(el => el.hidden), true);
      assert.equal(await page.locator('#checklist-editor').textContent(), ''); assert.equal(await page.locator('#control-status').textContent(), '');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('restore refuses progress changes after preview; local editors reject another tab definition edit', async () => {
    const { context, page, errors } = await fixture(browser, { motion: 'reduce' });
    try {
      await ready(page); await openRoutines(page); await page.locator('#backup-launch').click();
      const backup = { format: 'the-hub-checklists', version: 1, routines: JSON.parse(demo).routines, progress: { checks: {}, optional: {} } };
      await page.locator('#backup-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
      await page.waitForSelector('#restore-preview', { state: 'visible' });
      await page.evaluate(() => localStorage.setItem('thehub:routines:demo:v1', JSON.stringify({ checks: { 'personal-care/care/item-1': true }, optional: {} })));
      await page.locator('#backup-restore').click(); await page.locator('#control-confirm-yes').click();
      await page.waitForFunction(() => document.getElementById('backup-status').textContent.includes('Progress changed'));
      await page.locator('#backup-close').click(); await page.locator('#control-launch').click();
      const other = await context.newPage(); await ready(other); await openRoutines(other); await other.locator('#control-launch').click();
      await other.getByLabel('Checklist name', { exact: true }).fill('Other tab'); await other.locator('#editor-save').click();
      await other.waitForFunction(() => document.getElementById('control-status').textContent.startsWith('Saved.'));
      await page.getByLabel('Checklist name', { exact: true }).fill('Old tab draft'); await page.locator('#editor-save').click();
      await page.waitForFunction(() => document.getElementById('control-status').textContent.includes('changed in another tab'));
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('thehub:workspace:demo:v1')).routines[0].name), 'Other tab'); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('installation provides native prompt and fallback, manifest stays within GitHub Pages scope', async () => {
    const { context, page, errors } = await fixture(browser, { motion: 'reduce' });
    try {
      await ready(page); await page.locator('[data-icon="settings"]').click(); await page.locator('#install-app').click();
      assert.match(await page.locator('#install-help').textContent(), /Safari/);
      assert.match(await page.locator('#install-help').textContent(), /Android/);
      await page.evaluate(() => { const event = new Event('beforeinstallprompt', { cancelable: true }); event.prompt = async () => { window.__installPrompted = true; }; event.userChoice = Promise.resolve({ outcome: 'accepted' }); dispatchEvent(event); });
      await page.locator('#install-app').click(); assert.equal(await page.evaluate(() => window.__installPrompted), true);
      const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.webmanifest')));
      for (const field of ['id', 'start_url', 'scope']) assert.equal(new URL(manifest[field], 'https://example.com/the-hub/manifest.webmanifest').pathname, '/the-hub/');
      for (const icon of manifest.icons) { const png = readFileSync(path.join(root, icon.src)); assert.equal(png.readUInt32BE(16), Number(icon.sizes.split('x')[0])); }
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('mechanical optic follows module focus and stops under pause and reduced motion', async () => {
    const { context, page, errors } = await fixture(browser);
    try {
      await ready(page); await page.locator('[data-icon="projects"]').focus();
      assert.notEqual(await page.locator('.core-art').evaluate(el => el.style.getPropertyValue('--eye-x')), '');
      await page.locator('.motion-toggle').click();
      assert.equal(await page.locator('.core-art').evaluate(el => el.style.getPropertyValue('--eye-x')), '');
      assert.equal(await page.locator('.eye-focus').evaluate(el => el.getAnimations().length), 0);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal(await page.locator('.eye-pupil').evaluate(el => el.getAnimations().length), 0); assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('unconfigured private access explains setup and does not download or contact Firebase', async () => {
    const { context, page, requests, errors } = await fixture(browser, { width: 320, motion: 'reduce' });
    try {
      await ready(page);
      await openRoutines(page);
      await page.locator('#account-launch').click();
      assert.equal(await page.locator('#account-dialog').evaluate(element => element.open), true);
      assert.match(await page.locator('#account-status').textContent(), /not configured/);
      assert.equal(await page.locator('#account-login').isDisabled(), true);
      assert.equal(await page.locator('#account-import').isVisible(), false);
      assert.equal(requests.some(request => request.pathname.includes('firebasejs')), false);
      assert.equal(await page.locator('#account-dialog').evaluate(element => element.scrollWidth > element.clientWidth), false);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#account-launch').evaluate(element => document.activeElement === element), true);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('account sync merges different ticks, keeps pending edits and clears private readouts on sign-out', async () => {
    const privateData = JSON.parse(demo);
    privateData.routines[0].name = 'Private fixture';
    const { context, page, errors } = await fixture(browser, { width: 390, motion: 'reduce', firebase: true, cloudDocuments: {
      'account-a': { routines: privateData, progress: { checks: {}, optional: {} } },
      'account-b': { routines: privateData, progress: { checks: { 'personal-care/morning/item-1': true }, optional: {} } }
    } });
    try {
      await ready(page);
      await page.waitForFunction(() => document.getElementById('routines-dialog').dataset.source === 'account' && document.querySelector('.routine-card'));
      await openRoutines(page);
      assert.equal(await page.locator('#routine-name').textContent(), 'Private fixture');
      const keys = await page.locator('#routine-content input[data-check]').evaluateAll(inputs => inputs.slice(0, 2).map(input => input.dataset.check));
      await page.evaluate(() => { window.__hubFirebase.holdWrites = true; });
      await page.locator('#field-complete').click();
      await page.evaluate(keys => {
        const test = window.__hubFirebase;
        test.docs['account-a'].progress.checks[keys[1]] = true;
        test.publish();
      }, keys);
      assert.match(await page.locator('#routine-progress-label').textContent(), /2 of 3/);
      await page.locator('#account-launch').click();
      assert.equal(await page.locator('#account-logout').isDisabled(), true);
      await page.evaluate(() => { window.__hubFirebase.held.splice(0).forEach(finish => finish()); });
      await page.waitForFunction(() => !document.getElementById('account-logout').disabled);
      const writes = await page.evaluate(() => window.__hubFirebase.writes);
      assert.deepEqual(writes, [{ path: ['users', 'account-a', 'hub', 'progress'], patch: { checks: { [keys[0]]: true } } }]);
      assert.deepEqual(await page.evaluate(() => window.__hubFirebase.docs['account-a'].progress.checks), { [keys[0]]: true, [keys[1]]: true });
      await page.locator('#account-logout').click();
      await page.waitForFunction(() => document.getElementById('routines-dialog').dataset.source === 'demo');
      assert.equal(await page.locator('#routine-name').textContent(), 'Personal Care');
      assert.equal(await page.locator('#core-signal-list').textContent().then(text => text.includes('Private fixture')), false);
      assert.equal(await page.locator('#account-identity').textContent(), 'Your checklists, on your devices.');
      assert.deepEqual(await page.evaluate(() => Object.keys(localStorage)), []);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('rejected cloud writes retain the draft, block sign-out and retry without overwriting other ticks', async () => {
    const { context, page, errors } = await fixture(browser, { motion: 'reduce', firebase: true, cloudDocuments: {
      'account-a': { routines: JSON.parse(demo), progress: { checks: {}, optional: {} } }
    } });
    try {
      await ready(page);
      await page.waitForFunction(() => document.getElementById('routines-dialog').dataset.source === 'account' && document.querySelector('.routine-card'));
      await openRoutines(page);
      const keys = await page.locator('#routine-content input[data-check]').evaluateAll(inputs => inputs.slice(0, 2).map(input => input.dataset.check));
      await page.evaluate(() => { window.__hubFirebase.rejectWrites = true; });
      await page.locator('#field-complete').click();
      await page.waitForFunction(() => document.getElementById('account-status').textContent.includes('not synced'));
      await page.evaluate(keys => {
        const test = window.__hubFirebase;
        test.docs['account-a'].progress.checks[keys[1]] = true;
        test.publish();
      }, keys);
      assert.match(await page.locator('#routine-progress-label').textContent(), /2 of 3/);
      await page.locator('#account-launch').click();
      assert.equal(await page.locator('#account-logout').isDisabled(), true);
      await page.evaluate(() => { window.__hubFirebase.rejectWrites = false; });
      await page.locator('#account-retry').click();
      await page.waitForFunction(() => !document.getElementById('account-logout').disabled);
      assert.deepEqual(await page.evaluate(() => window.__hubFirebase.docs['account-a'].progress.checks), { [keys[1]]: true, [keys[0]]: true });
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('PC import is explicit, keeps local storage and creates definitions and progress together', async () => {
    const { context, page, errors } = await fixture(browser, { motion: 'reduce', firebase: true, private: true });
    try {
      const saved = { checks: { 'personal-care/morning/item-1': true }, optional: {} };
      await context.addInitScript(saved => {
        localStorage.setItem('thehub:routines:private:v1', JSON.stringify(saved));
        localStorage.setItem('thehub:routines:demo:v1', '{"checks":{},"optional":{}}');
      }, saved);
      await ready(page, 'http://127.0.0.1:8765/');
      await page.waitForFunction(() => document.getElementById('routines-dialog').dataset.source === 'private' && !document.getElementById('account-import').hidden);
      assert.equal(await page.evaluate(() => window.__hubFirebase.imports), 0);
      await openRoutines(page);
      await page.locator('#account-launch').click();
      await page.locator('#account-import').click();
      await page.waitForFunction(() => document.getElementById('routines-dialog').dataset.source === 'account');
      assert.equal(await page.locator('#account-import').isVisible(), false);
      const result = await page.evaluate(() => ({ records: window.__hubFirebase.docs['account-a'], imports: window.__hubFirebase.imports, saved: localStorage.getItem('thehub:routines:private:v1') }));
      assert.equal(result.imports, 1);
      assert.deepEqual(result.records.routines, JSON.parse(demo));
      assert.deepEqual(result.records.progress, saved);
      assert.deepEqual(JSON.parse(result.saved), saved);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('an empty cached snapshot waits for the server and public demo lists cannot be imported', async () => {
    const { context, page, errors } = await fixture(browser, { motion: 'reduce', firebase: true, fromCache: true });
    try {
      await ready(page);
      assert.equal(await page.locator('.routine-card').count(), 0);
      assert.equal(await page.locator('#account-import').isVisible(), false);
      await page.evaluate(() => { window.__hubFirebase.fromCache = false; window.__hubFirebase.publish(); });
      await page.waitForFunction(() => document.getElementById('routines-dialog').dataset.source === 'demo');
      await openRoutines(page);
      await page.locator('#account-launch').click();
      assert.equal(await page.locator('#account-import').isVisible(), false);
      assert.match(await page.locator('#account-status').textContent(), /Open the PC version/);
      assert.equal(await page.evaluate(() => window.__hubFirebase.imports), 0);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('Google sign-in opens the account workspace and an access failure can retry safely', async () => {
    const privateData = JSON.parse(demo);
    privateData.routines[0].groups[0].items[0].label = 'Private account item';
    const { context, page, errors } = await fixture(browser, { motion: 'reduce', firebase: true, signedIn: false, cloudDocuments: {
      'account-a': { routines: privateData, progress: { checks: {}, optional: {} } }
    } });
    try {
      await ready(page);
      await openRoutines(page);
      await page.locator('#account-launch').click();
      await page.locator('#account-login').click();
      await page.waitForFunction(() => document.getElementById('routines-dialog').dataset.source === 'account');
      assert.match(await page.locator('#account-identity').textContent(), /test@example.invalid/);
      await page.evaluate(() => window.__hubFirebase.listener.failed(new Error('Denied.')));
      await page.waitForFunction(() => document.getElementById('account-status').textContent.includes('Account access failed'));
      assert.equal(await page.locator('.routine-card').count(), 0);
      assert.equal(await page.locator('#core-signal-list li').count(), 0);
      assert.equal(await page.locator('#routines-dialog').textContent().then(text => text.includes('Private account item')), false);
      await page.locator('#account-retry').click();
      await page.waitForFunction(() => document.querySelectorAll('.routine-card').length === 5);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('a failed Firebase SDK leaves demo progress usable and reload retry recovers', async () => {
    const { context, page, errors, failures } = await fixture(browser, { motion: 'reduce', firebase: true, signedIn: false, sdkFailure: true });
    try {
      await ready(page);
      await openRoutines(page);
      await page.locator('#field-complete').click();
      const saved = await page.evaluate(key => localStorage.getItem(key), storageKey);
      await page.locator('#account-launch').click();
      await page.waitForFunction(() => document.getElementById('account-status').textContent.includes('Firebase could not start'));
      assert.equal(await page.locator('#account-login').isDisabled(), true);
      failures.sdk = false;
      await Promise.all([page.waitForEvent('load'), page.locator('#account-retry').click()]);
      await page.waitForSelector('#routines-dialog[data-ready="true"]', { state: 'attached' });
      assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), saved);
      await openRoutines(page);
      await page.locator('#account-launch').click();
      await page.waitForFunction(() => !document.getElementById('account-login').disabled);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('PC import refuses to replace an account populated by another device', async () => {
    const { context, page, errors } = await fixture(browser, { motion: 'reduce', firebase: true, private: true });
    try {
      await ready(page, 'http://127.0.0.1:8765/');
      await page.waitForFunction(() => !document.getElementById('account-import').hidden);
      await openRoutines(page);
      await page.locator('#account-launch').click();
      const existing = { routines: JSON.parse(demo), progress: { checks: { 'other-device/item': true }, optional: {} } };
      await page.evaluate(existing => { window.__hubFirebase.docs['account-a'] = existing; }, existing);
      await page.locator('#account-import').click();
      await page.waitForFunction(() => document.getElementById('account-status').textContent.includes('PC import did not finish'));
      assert.deepEqual(await page.evaluate(() => window.__hubFirebase.docs['account-a']), existing);
      assert.equal(await page.evaluate(() => window.__hubFirebase.imports), 0);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  for (const width of [320, 390, 768, 1024, 1440]) {
    await t.test(`real clicks, keyboard, layout and smoke check at ${width}px`, async () => {
      const { context, page, requests, errors } = await fixture(browser, { width });
      try {
        await ready(page);
        await openRoutines(page);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.getElementById('routines-dialog').open);
        assert.equal(await page.locator('#routines-launch').evaluate(element => document.activeElement === element), true);
        await page.keyboard.press('Enter');
        await page.getByRole('button', { name: 'Close routines' }).click();
        for (const app of await page.locator('.app').all()) {
          await app.click();
          const notes = await app.getAttribute('data-icon') === 'notes';
          assert.equal(await page.locator(notes ? '#notes-title' : '#app-title').textContent(), notes ? 'NOTES' : await app.locator('.app-name').textContent());
          await page.keyboard.press('Escape');
          await page.waitForFunction(id => !document.getElementById(id).open, notes ? 'notes-dialog' : 'app-dialog');
        }
        await page.addScriptTag({ path: path.join(root, 'smoke-test.js') });
        assert.equal((await page.evaluate(() => testHub())).passed, true);
        assert.equal(await page.evaluate(() => document.fonts.check('500 24px Orbitron') && document.fonts.check('600 18px Rajdhani')), true);
        assert.equal(requests.some(request => request.pathname.includes('/private/') || request.method !== 'GET'), false);
        assert.deepEqual(errors, []);
        if ([390, 1440].includes(width)) {
          await page.locator('.motion-toggle').click();
          await page.screenshot({ path: path.join(root, `preview-fixed-${width}.jpg`), fullPage: true });
          await openRoutines(page);
          await page.screenshot({ path: path.join(root, `preview-checklists-${width}.jpg`), fullPage: true });
        }
      } finally { await context.close(); }
    });
  }

  for (const width of [320, 1440]) {
    await t.test(`Instant Notes captures, searches and resumes text at ${width}px`, async () => {
      const { context, page, errors, requests } = await fixture(browser, { width });
      try {
        await ready(page);
        await page.locator('[data-icon="notes"]').click();
        assert.equal(await page.locator('#notes-dialog').evaluate(el => el.open), true);
        assert.equal(await page.locator('#note-text').evaluate(el => el === document.activeElement), true);
        await page.locator('#note-text').fill('First idea\nA blue city after dark.');
        assert.equal(await page.locator('#note-name').textContent(), 'First idea');
        assert.match(await page.locator('#notes-status').textContent(), /^Saved/);
        await page.locator('#note-new').click();
        await page.locator('#note-text').fill('Second idea\nRemember the training bag.');
        await page.locator('#notes-search').fill('blue city');
        assert.equal(await page.locator('#note-list button').count(), 1);
        await page.locator('#note-list button').click();
        assert.equal(await page.locator('#note-text').inputValue(), 'First idea\nA blue city after dark.');
        await page.locator('#note-text').evaluate(el => { el.setSelectionRange(0, 0); });
        await page.keyboard.type('New ');
        assert.equal(await page.locator('#note-text').inputValue(), 'New First idea\nA blue city after dark.');
        assert.equal(await page.locator('#note-text').evaluate(el => el.selectionStart), 4);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.getElementById('notes-dialog').open);
        assert.equal(await page.locator('[data-icon="notes"]').evaluate(el => el === document.activeElement), true);
        await ready(page);
        await page.locator('#command-launch').click();
        await page.locator('#command-search').fill('Notes');
        await page.keyboard.press('Enter');
        assert.equal(await page.locator('#note-text').inputValue(), 'New First idea\nA blue city after dark.');
        await page.locator('#notes-search').fill('no-such-note');
        assert.equal(await page.locator('#notes-empty').isVisible(), true);
        assert.equal(await page.locator('#note-text').inputValue(), 'New First idea\nA blue city after dark.');
        await page.locator('#note-new').click();
        assert.equal(await page.locator('#note-text').inputValue(), '');
        assert.equal(await page.locator('#notes-search').inputValue(), '');
        assert.equal(await page.locator('#notes-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true);
        await page.locator('#note-text').fill('<img src=x onerror="window.noteInjected=true">');
        assert.equal(await page.evaluate(() => window.noteInjected), undefined);
        assert.equal(requests.some(request => request.method !== 'GET' || request.pathname.includes('/private/')), false);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
  }

  for (const width of [320, 1440]) {
    await t.test(`note deletion confirms, persists and can be undone at ${width}px`, async () => {
      const { context, page, errors } = await fixture(browser, { width, motion: 'reduce' });
      try {
        await ready(page);
        await page.locator('[data-icon="notes"]').click();
        await page.locator('#note-text').fill('Delete this draft\nKeep the other note.');
        const id = await page.locator('#note-list button[aria-pressed="true"]').getAttribute('data-note');
        const key = `thehub:notes:demo:v1:${id}`;
        const original = await page.evaluate(key => localStorage.getItem(key), key);
        await page.locator('#note-new').click();
        await page.locator('#note-text').fill('Keep this note\nThis text must stay unchanged.');
        await page.locator(`#note-list [data-note="${id}"]`).click();
        await page.locator('#note-delete').click();
        assert.equal(await page.locator('#note-delete-dialog .restart-keep').evaluate(el => el === document.activeElement), true);
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(key => localStorage.getItem(key), key), original);
        await page.locator('#note-delete').click();
        await page.mouse.click(1, 1);
        assert.equal(await page.locator('#note-delete-dialog').evaluate(el => el.open), false);
        assert.equal(await page.evaluate(key => localStorage.getItem(key), key), original);
        await page.locator('#note-delete').click();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Enter');
        assert.equal(await page.locator(`#note-list [data-note="${id}"]`).count(), 0);
        const removed = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
        assert.equal(removed.deleted, true);
        assert.equal(removed.text, undefined);
        assert.equal(await page.locator('#note-undo-delete').isVisible(), true);
        await page.locator('#note-undo-delete').click();
        assert.equal(await page.locator('#note-text').inputValue(), 'Delete this draft\nKeep the other note.');
        assert.equal(await page.locator('#note-text').evaluate(el => el === document.activeElement), true);
        assert.equal(await page.locator('#note-undo-delete').isVisible(), false);
        await page.locator('#note-delete').click();
        await page.locator('#note-delete-confirm').click();
        await ready(page);
        await page.locator('[data-icon="notes"]').click();
        await page.locator('#notes-search').fill('Delete this draft');
        assert.equal(await page.locator('#note-list button').count(), 0);
        await page.locator('#notes-search').fill('Nightfall ideas');
        await page.locator('#note-list button').click();
        await page.locator('#note-delete').click();
        assert.equal(await page.locator('#note-delete-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true);
        await page.locator('#note-delete-confirm').click();
        await ready(page);
        await page.locator('[data-icon="notes"]').click();
        await page.locator('#notes-search').fill('Nightfall ideas');
        assert.equal(await page.locator('#note-list button').count(), 0, 'Deleted sample notes must stay deleted too.');
        await page.locator('#notes-search').fill('Keep this note');
        await page.locator('#note-list button').click();
        assert.equal(await page.locator('#note-text').inputValue(), 'Keep this note\nThis text must stay unchanged.');
        assert.equal(await page.locator('#notes-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
  }

  await t.test('failed deletion keeps the note and stale confirmation cannot delete a newer edit', async () => {
    const { context, page } = await fixture(browser, { motion: 'reduce' });
    try {
      await ready(page);
      await page.locator('[data-icon="notes"]').click();
      await page.locator('#note-text').fill('Protected note');
      const id = await page.locator('#note-list button[aria-pressed="true"]').getAttribute('data-note');
      const key = `thehub:notes:demo:v1:${id}`;
      await page.locator('#note-delete').click();
      await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ version: 1, id: key.split(':').at(-1), text: 'Newer edit', updatedAt: Date.now() })), key);
      await page.locator('#note-delete-confirm').click();
      assert.match(await page.locator('#notes-status').textContent(), /changed in another tab/);
      assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).text, key), 'Newer edit');
      await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('Storage blocked'); }; });
      await page.locator('#note-new').click();
      await page.locator('#note-text').fill('Unsaved draft');
      await page.locator('#note-delete').click();
      await page.locator('#note-delete-confirm').click();
      assert.match(await page.locator('#notes-status').textContent(), /Couldn’t delete/);
      assert.equal(await page.locator('#note-text').inputValue(), 'Unsaved draft');
    } finally { await context.close(); }
  });

  await t.test('deletion in another tab removes the active note without resurrecting it', async () => {
    const { context, page, errors } = await fixture(browser, { motion: 'reduce' });
    try {
      await ready(page);
      await page.locator('[data-icon="notes"]').click();
      await page.locator('#note-text').fill('Shared removal\nThis note should disappear.');
      const id = await page.locator('#note-list button[aria-pressed="true"]').getAttribute('data-note');
      const other = await context.newPage();
      await ready(other);
      await other.locator('[data-icon="notes"]').click();
      await other.locator('#note-delete').click();
      await other.locator('#note-delete-confirm').click();
      await page.waitForFunction(id => !document.querySelector(`#note-list [data-note="${id}"]`), id);
      assert.equal(await page.locator('#note-text').inputValue() === 'Shared removal\nThis note should disappear.', false);
      assert.match(await page.locator('#notes-status').textContent(), /deleted in another tab/);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('Instant Notes preserves separate edits to the same note in two tabs', async () => {
    const { context, page, errors } = await fixture(browser, { motion: 'reduce' });
    try {
      await ready(page);
      await page.locator('[data-icon="notes"]').click();
      await page.locator('#note-text').fill('Shared idea\nOriginal version.');
      const other = await context.newPage();
      await ready(other);
      await other.locator('[data-icon="notes"]').click();
      assert.equal(await other.locator('#note-text').inputValue(), 'Shared idea\nOriginal version.');
      await page.locator('#note-text').fill('Shared idea\nFirst tab edit.');
      await other.waitForFunction(() => document.getElementById('notes-status').textContent.includes('separate note'));
      assert.equal(await other.locator('#note-text').inputValue(), 'Shared idea\nOriginal version.');
      await other.locator('#note-text').fill('Another idea\nSecond tab edit.');
      const stored = await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('thehub:notes:demo:v1:')).map(key => JSON.parse(localStorage.getItem(key)).text));
      assert.deepEqual(stored.sort(), ['Shared idea\nFirst tab edit.', 'Another idea\nSecond tab edit.'].sort());
      await page.locator('#note-new').click();
      await page.locator('#note-text').fill('Third idea\nA different note.');
      await other.waitForFunction(() => [...document.querySelectorAll('#note-list strong')].some(el => el.textContent === 'Third idea'));
      assert.equal(await other.locator('#note-text').inputValue(), 'Another idea\nSecond tab edit.');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('Instant Notes keeps text in memory when saving fails and preserves corrupt records', async () => {
    const { context, page } = await fixture(browser, { motion: 'reduce' });
    try {
      const key = 'thehub:notes:demo:v1:11111111-1111-4111-8111-111111111111';
      await context.addInitScript(key => localStorage.setItem(key, '{broken'), key);
      await ready(page);
      await page.locator('[data-icon="notes"]').click();
      await page.locator('#note-text').fill('Keep this text');
      assert.equal(await page.evaluate(key => localStorage.getItem(key), key), '{broken');
      assert.match(await page.locator('#notes-status').textContent(), /stored data is unchanged/);
      await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('Quota exceeded'); }; });
      await page.locator('#note-text').fill('Keep this unsaved draft');
      assert.match(await page.locator('#notes-status').textContent(), /Not saved/);
      await page.locator('#note-new').click();
      await page.getByRole('button', { name: 'Keep this unsaved draft' }).click();
      assert.equal(await page.locator('#note-text').inputValue(), 'Keep this unsaved draft');
      assert.match(await page.locator('#notes-status').textContent(), /Not saved/);
    } finally { await context.close(); }
  });

  await t.test('PC notes use separate storage and reduced motion; unavailable script falls back safely', async () => {
    const { context, page } = await fixture(browser, { motion: 'reduce', private: true });
    try {
      await ready(page, 'http://127.0.0.1:18765');
      await page.locator('[data-icon="notes"]').click();
      await page.locator('#note-text').fill('Personal draft');
      assert.equal(await page.locator('#note-list button').count(), 1);
      const keys = await page.evaluate(() => Object.keys(localStorage));
      assert(keys.some(key => key.startsWith('thehub:notes:private:v1:')));
      assert.equal(keys.some(key => key.startsWith('thehub:notes:demo:v1:')), false);
      assert.equal(await page.locator('#notes-dialog').evaluate(el => getComputedStyle(el).animationName), 'none');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#notes-dialog').evaluate(el => el.open), false);
    } finally { await context.close(); }
    const fallback = await fixture(browser, { noNotes: true });
    try {
      await ready(fallback.page);
      await fallback.page.locator('[data-icon="notes"]').click();
      assert.equal(await fallback.page.locator('#app-dialog').evaluate(el => el.open), true);
      assert.match(await fallback.page.locator('#app-description').textContent(), /Notes couldn’t load/);
      assert.deepEqual(fallback.errors, []);
    } finally { await fallback.context.close(); }
  });

  await t.test('bright completed rings leave the summary and frame labels readable across screen sizes', async () => {
    const checks = {}, optional = {};
    for (const routine of JSON.parse(demo).routines.slice(0, 4)) {
      for (const group of routine.groups) {
        if (group.optional) optional[`${routine.id}/${group.id}`] = true;
        for (const item of group.items) checks[`${routine.id}/${group.id}/${item.id}`] = true;
      }
    }
    for (const width of [320, 390, 768, 1024, 1440, 1728]) {
      const { context, page } = await fixture(browser, { width, motion: 'reduce' });
      try {
        await context.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: storageKey, value: JSON.stringify({ checks, optional }) });
        await ready(page);
        assert.equal(await page.locator('#core-summary').textContent(), '4 / 5 CHECKLISTS READY');
        const layout = await page.evaluate(() => {
          const box = selector => document.querySelector(selector).getBoundingClientRect();
          const summary = box('#core-summary');
          const ring = box('.core-progress-rings');
          const next = box(innerWidth <= 700 ? '.apps' : '.workspace-caption');
          const frame = document.querySelector('.core-reticle');
          const label = document.querySelector('.core-reticle span:last-child');
          return {
            ringGap: summary.top - ring.bottom,
            nextGap: next.top - summary.bottom,
            fontSize: parseFloat(getComputedStyle(document.getElementById('core-summary')).fontSize),
            background: getComputedStyle(document.getElementById('core-summary')).backgroundColor,
            clipped: getComputedStyle(frame).clipPath !== 'none',
            labelFont: parseFloat(getComputedStyle(label).fontSize),
            overflow: document.documentElement.scrollWidth > innerWidth
          };
        });
        assert.ok(layout.ringGap >= 8, `${width}px: the summary must sit below the rings.`);
        assert.ok(layout.nextGap >= 8, `${width}px: the next row must clear the summary.`);
        assert.ok(layout.fontSize >= 14);
        assert.equal(layout.background, 'rgb(3, 10, 20)');
        assert.equal(layout.clipped, false, 'Only the decorative frame can be clipped, never its labels.');
        if (width > 700) assert.ok(layout.labelFont >= 12);
        assert.equal(layout.overflow, false);
      } finally { await context.close(); }
    }
  });

  await t.test('core rings load saved progress without replaying completion celebrations', async () => {
    const { context, page, errors } = await fixture(browser);
    try {
      await context.addInitScript(({ key }) => localStorage.setItem(key, JSON.stringify({ checks: {
        'personal-care/care/item-1': true, 'personal-care/care/item-2': true, 'personal-care/care/item-3': true,
        'workday/work/item-1': true
      }, optional: { 'workday/after-work': true } })), { key: storageKey });
      await ready(page);
      assert.equal(await page.locator('.core-progress-fill').count(), 5);
      assert.equal(await page.locator('#core-summary').textContent(), '1 / 5 CHECKLISTS READY');
      assert.equal(await page.locator('.core-progress-fill[data-checklist="personal-care"]').evaluate(el => Number(el.style.strokeDashoffset)), 0);
      const workOffset = await page.locator('.core-progress-fill[data-checklist="workday"]').evaluate(el => Number(el.style.strokeDashoffset));
      assert.ok(Math.abs(workOffset - 100 * 5 / 6) < .001);
      assert.equal(await page.locator('#core-signal-list [data-checklist="workday"] .core-signal-count').textContent(), '1 / 6');
      assert.equal(await page.locator('.core-art > .core-energy').evaluate(el => el.getAnimations().length), 0);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  for (const motion of ['no-preference', 'reduce']) {
    await t.test(`core keeps its departure rings, then updates and pulses on return with ${motion} motion`, async () => {
      const { context, page, errors } = await fixture(browser, { motion, width: 390 });
      try {
        await ready(page);
        await openRoutines(page);
        await page.waitForFunction(() => document.body.dataset.corePhase === 'open');
        const ring = page.locator('.core-art .core-progress-fill[data-checklist="personal-care"]');
        for (let i = 0; i < 3; i++) await page.locator('#field-complete').click();
        assert.equal(await ring.evaluate(el => Number(el.style.strokeDashoffset)), 100);
        assert.equal(await page.locator('.routine-optic .core-energy').evaluate(el => el.getAnimations().length > 0), motion !== 'reduce');
        await page.keyboard.press('Escape');
        if (motion !== 'reduce') {
          assert.equal(await page.locator('.core-flight .core-progress-fill[data-checklist="personal-care"]').evaluate(el => parseFloat(el.style.strokeDashoffset)), 100);
        }
        await page.waitForFunction(() => !document.getElementById('routines-dialog').open && document.getElementById('core-summary').textContent.startsWith('1 /'));
        assert.equal(await ring.evaluate(el => Number(el.style.strokeDashoffset)), 0);
        const fill = await ring.evaluate(el => {
          const animations = el.getAnimations();
          for (const animation of animations) { animation.pause(); animation.currentTime = 300; }
          return { offset: parseFloat(getComputedStyle(el).strokeDashoffset), animations: animations.length };
        });
        if (motion === 'reduce') assert.equal(fill.animations, 0);
        else {
          assert.ok(fill.offset > 0 && fill.offset < 100, 'The home ring fills gradually after the handoff.');
          assert.ok(fill.animations > 0);
        }
        assert.equal(await page.locator('.core-art > .core-energy').evaluate(el => el.getAnimations().length > 0), motion !== 'reduce');
        await ring.evaluate(el => el.getAnimations().forEach(animation => animation.finish()));
        await openRoutines(page);
        await page.locator('#field-undo').click();
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.getElementById('routines-dialog').open && document.getElementById('core-summary').textContent.startsWith('0 /'));
        assert.ok(Math.abs(await ring.evaluate(el => Number(el.style.strokeDashoffset)) - 100 / 3) < .001);
        assert.equal(await page.locator('#routines-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
  }

  await t.test('undoing a completion before returning cancels its queued home pulse', async () => {
    const { context, page } = await fixture(browser);
    try {
      await ready(page);
      await openRoutines(page);
      for (let i = 0; i < 3; i++) await page.locator('#field-complete').click();
      await page.locator('#field-undo').click();
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.getElementById('routines-dialog').open);
      await page.waitForFunction(() => Number(document.querySelector('.core-art .core-progress-fill').style.strokeDashoffset) < 100);
      assert.equal(await page.locator('#core-summary').textContent(), '0 / 5 CHECKLISTS READY');
      assert.equal(await page.locator('.core-art > .core-energy').evaluate(el => el.getAnimations().length), 0);
    } finally { await context.close(); }
  });

  await t.test('ticks, optional counts, reload and scoped reset', async () => {
    const { context, page } = await fixture(browser);
    try {
      await ready(page);
      await openRoutines(page);
      await reviewChecklist(page);
      await page.locator('[data-routine="workday"]').click();
      await page.locator('[data-check="workday/work/item-1"]').check();
      await page.locator('[data-group="workday/after-work"]').check();
      assert.equal(await page.locator('#routine-progress-label').textContent(), '1 of 6 ready');
      await page.locator('[data-routine="training"]').click();
      await page.locator('.check-row input').first().check();
      await ready(page);
      await openRoutines(page);
      await reviewChecklist(page);
      await page.locator('[data-routine="workday"]').click();
      assert.equal(await page.locator('[data-check="workday/work/item-1"]').isChecked(), true);
      assert.equal(await page.locator('[data-group="workday/after-work"]').isChecked(), true);
      await page.locator('#routine-restart').click();
      assert.equal(await page.locator('#restart-dialog').evaluate(el => el.open), true);
      assert.equal(await page.locator('#restart-dialog .restart-keep').evaluate(el => el === document.activeElement), true);
      await page.getByRole('button', { name: 'Keep progress' }).click();
      assert.equal(await page.locator('[data-check="workday/work/item-1"]').isChecked(), true);
      await page.locator('#routine-restart').click();
      await page.getByRole('button', { name: 'Clear ticks', exact: true }).click();
      assert.equal(await page.locator('[data-check="workday/work/item-1"]').isChecked(), false);
      assert.equal(await page.locator('[data-group="workday/after-work"]').isChecked(), true);
      await page.locator('[data-routine="training"]').click();
      assert.equal(await page.locator('.check-row input').first().isChecked(), true);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.getElementById('routines-dialog').open);
      await page.waitForFunction(() => document.querySelector('#core-signal-list [data-checklist="workday"] .core-signal-count').textContent === '0 / 6');
    } finally { await context.close(); }
  });

  await t.test('core journey opens and returns with focus, clean artwork and no duplicate IDs', async () => {
    const { context, page, errors } = await fixture(browser, { width: 390 });
    try {
      await ready(page);
      await openRoutines(page);
      assert.equal(await page.locator('#routines-dialog').getAttribute('data-transition'), 'opening');
      assert.equal(await page.locator('.core-flight:popover-open').count(), 1);
      assert.equal(await page.evaluate(() => {
        const ids = [...document.querySelectorAll('[id]')].map(el => el.id);
        return new Set(ids).size === ids.length;
      }), true);
      await page.waitForFunction(() => document.body.dataset.corePhase === 'open');
      assert.equal(await page.locator('.core-flight').count(), 0);
      assert.equal(await page.locator('#routines-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true);
      await page.getByRole('button', { name: 'Close routines' }).click();
      assert.equal(await page.locator('#routines-dialog').getAttribute('data-transition'), 'closing');
      await page.waitForFunction(() => !document.getElementById('routines-dialog').open);
      assert.equal(await page.locator('.core-flight').count(), 0);
      assert.equal(await page.evaluate(() => document.body.hasAttribute('data-core-phase')), false);
      assert.equal(await page.locator('#routines-launch').evaluate(el => el === document.activeElement), true);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('return handoff blends behind the title before landing while the backdrop clears', async () => {
    for (const width of [390, 1440]) {
    const { context, page } = await fixture(browser, { width });
    try {
      await ready(page);
      await openRoutines(page);
      await page.waitForFunction(() => document.body.dataset.corePhase === 'open');
      await page.keyboard.press('Escape');
      const lateFrame = await page.evaluate(() => {
        const panel = document.getElementById('routines-dialog');
        const artwork = document.querySelector('.core-flight > svg');
        let blendError, blendOpacity;
        for (const sample of [430, 500]) {
          for (const animation of document.getAnimations()) {
            if (animation.effect.target.closest?.('#routines-dialog, .core-flight') || animation.effect.target.matches?.('.core-art, .gyro, .core-reticle') && animation.effect.getTiming().duration === 520) {
              animation.pause();
              animation.currentTime = sample;
            }
          }
          if (sample === 430) {
            const front = artwork.getBoundingClientRect();
            const home = document.querySelector('.core-art').getBoundingClientRect();
            blendError = Math.abs(front.left - home.left) + Math.abs(front.top - home.top) + Math.abs(front.width - home.width);
            blendOpacity = Number(getComputedStyle(artwork).opacity) + Number(getComputedStyle(document.querySelector('.core-art')).opacity);
          }
        }
        const returning = artwork.getBoundingClientRect();
        const home = document.querySelector('.core-art').getBoundingClientRect();
        return {
          blendError, blendOpacity,
          optic: Number(getComputedStyle(artwork).opacity),
          homeOptic: Number(getComputedStyle(document.querySelector('.core-art')).opacity),
          homeVisibility: getComputedStyle(document.querySelector('.core-art')).visibility,
          backdrop: Number(getComputedStyle(panel, '::backdrop').opacity),
          positionError: Math.abs(returning.left - home.left) + Math.abs(returning.top - home.top) + Math.abs(returning.width - home.width)
        };
      });
      assert.ok(lateFrame.blendError < 1, 'Both layers must stay aligned during blending, without a double image.');
      assert.ok(Math.abs(lateFrame.blendOpacity - 1) < .01, 'The handoff must keep the optic lit throughout.');
      assert.equal(lateFrame.optic, 0, 'Front layer must disappear before the end of the return.');
      assert.equal(lateFrame.homeOptic, 1, 'Home layer must already be visible behind the title.');
      assert.equal(lateFrame.homeVisibility, 'visible');
      assert.ok(lateFrame.backdrop < .02, 'Backdrop must clear gradually before the native dialog closes.');
      assert.ok(lateFrame.positionError < 2, 'Returning artwork must meet the home core without a position jump.');
      await page.evaluate(() => document.getAnimations().forEach(animation => animation.play()));
      await page.waitForFunction(() => !document.getElementById('routines-dialog').open);
      assert.equal(await page.locator('.core-art').evaluate(el => getComputedStyle(el).visibility), 'visible');
    } finally { await context.close(); }
    }
  });

  await t.test('styled restart prompt cancels safely with Escape and backdrop, then confirms by keyboard', async () => {
    const { context, page, errors } = await fixture(browser, { width: 320 });
    try {
      page.on('dialog', dialog => { errors.push('Unexpected browser confirmation'); dialog.dismiss(); });
      await ready(page);
      await openRoutines(page);
      await reviewChecklist(page);
      const check = page.locator('.check-row input').first();
      await check.check();
      const saved = await page.evaluate(key => localStorage.getItem(key), storageKey);
      await page.locator('#routine-restart').click();
      await page.keyboard.press('Escape');
      assert.equal(await check.isChecked(), true);
      assert.equal(await page.locator('#routine-restart').evaluate(el => el === document.activeElement), true);
      await page.locator('#routine-restart').click();
      await page.locator('#restart-dialog').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
      assert.equal(await page.locator('#restart-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true);
      await page.mouse.click(1, 1);
      assert.equal(await page.locator('#restart-dialog').evaluate(el => el.open), false);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), saved);
      await page.locator('#routine-restart').click();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      assert.equal(await check.isChecked(), false);
      assert.equal(await page.locator('#restart-dialog').evaluate(el => el.open), false);
      assert.equal(await check.evaluate(el => el === document.activeElement), true);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('interrupted journeys recover after repeated Escape, resize and programmatic navigation', async () => {
    const { context, page, errors } = await fixture(browser);
    try {
      await ready(page);
      await openRoutines(page);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.getElementById('routines-dialog').open);
      await openRoutines(page);
      await page.setViewportSize({ width: 768, height: 800 });
      await page.waitForFunction(() => document.body.dataset.corePhase === 'open');
      assert.equal(await page.locator('.core-flight').count(), 0);
      await page.keyboard.press('Control+k');
      assert.equal(await page.locator('#command-dialog').evaluate(el => el.open), true);
      await page.locator('#command-search').fill('Workday');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.body.dataset.corePhase === 'open');
      assert.equal(await page.locator('#routine-name').textContent(), 'Workday');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal(await page.locator('.core-flight').count(), 0);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.getElementById('routines-dialog').open);
      assert.equal(await page.locator('.core-flight').count(), 0);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('checklists arriving during unfolding settle into a usable panel', async () => {
    const { context, page, errors } = await fixture(browser, { dataDelay: 700 });
    try {
      await page.goto(origin);
      await openRoutines(page);
      assert.equal(await page.locator('#routines-dialog').getAttribute('data-ready'), 'false');
      await page.waitForSelector('#routines-dialog[data-ready="true"]', { state: 'attached' });
      await page.waitForFunction(() => document.body.dataset.corePhase === 'open');
      assert.equal(await page.locator('.core-flight').count(), 0);
      await reviewChecklist(page);
      await page.locator('.check-row input').first().check();
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.getElementById('routines-dialog').open);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('reduced motion, paused motion and missing popovers keep Routines usable', async () => {
    for (const mode of ['reduce', 'paused', 'no-popover', 'no-script', 'no-animate']) {
      const { context, page, errors } = await fixture(browser, { motion: mode === 'reduce' ? 'reduce' : 'no-preference', noTransition: mode === 'no-script' });
      try {
        if (mode === 'no-popover') await context.addInitScript(() => { delete HTMLElement.prototype.showPopover; });
        if (mode === 'no-animate') await context.addInitScript(() => { Element.prototype.animate = () => { throw new Error('Animation unavailable'); }; });
        await ready(page);
        if (mode === 'paused') await page.locator('.motion-toggle').click();
        await openRoutines(page);
        if (mode !== 'no-popover') assert.equal(await page.locator('#routines-dialog').getAttribute('data-transition'), null);
        assert.equal(await page.locator('.core-flight').count(), 0);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.getElementById('routines-dialog').open);
        assert.equal(await page.evaluate(() => document.body.hasAttribute('data-core-phase')), false);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
  });

  await t.test('quick access filters checklists, supports keyboard and handles no matches', async () => {
    const { context, page, errors } = await fixture(browser, { width: 390 });
    try {
      await ready(page);
      await page.keyboard.press('Control+k');
      assert.equal(await page.locator('#command-search').evaluate(el => el === document.activeElement), true);
      await page.locator('#command-search').fill('workday');
      assert.equal(await page.locator('#command-results button').count(), 1);
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#routines-dialog').evaluate(el => el.open), true);
      assert.equal(await page.locator('#routine-name').textContent(), 'Workday');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.getElementById('routines-dialog').open);
      await page.locator('#command-launch').click();
      await page.locator('#command-search').fill('zzzz-no-match');
      assert.equal(await page.locator('#command-empty').isVisible(), true);
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#command-dialog').evaluate(el => el.open), true);
      await page.locator('#command-search').fill('');
      await page.keyboard.press('ArrowUp');
      assert.equal(await page.locator('#command-results button').last().evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#command-results button').first().evaluate(el => el === document.activeElement), true);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.getElementById('routines-dialog').open);
      assert.equal(await page.locator('#command-launch').evaluate(el => el === document.activeElement), true);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('replay can be skipped again and Settings controls motion and opt-in sound', async () => {
    const { context, page, errors } = await fixture(browser);
    try {
      await context.addInitScript(() => {
        window.toneCount = 0;
        const NativeAudioContext = window.AudioContext;
        window.AudioContext = class extends NativeAudioContext {
          createOscillator() { window.toneCount++; return super.createOscillator(); }
        };
      });
      await ready(page);
      await page.keyboard.press('Shift');
      await page.locator('#replay-intro').click();
      assert.equal(await page.locator('.access-sequence').count(), 1);
      await page.keyboard.press('Shift');
      assert.equal(await page.locator('.access-sequence').count(), 0);
      await page.locator('[data-icon="settings"]').click();
      assert.equal(await page.locator('#interface-settings').isVisible(), true);
      assert.equal(await page.evaluate(() => window.toneCount), 0);
      await page.locator('#settings-motion').click();
      assert.equal(await page.locator('.motion-toggle').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#replay-intro').isDisabled(), true);
      await page.locator('#settings-motion').click();
      await page.locator('#settings-sound').click();
      await page.waitForFunction(() => window.toneCount > 0);
      const tones = await page.evaluate(() => window.toneCount);
      await page.locator('#settings-sound').click();
      assert.equal(await page.evaluate(() => window.toneCount), tones);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.getElementById('routines-dialog').open);
      await page.locator('[data-icon="projects"]').click();
      assert.equal(await page.locator('#interface-settings').isVisible(), false);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('completion feedback follows actual ticks and reduced motion disables replay', async () => {
    const { context, page } = await fixture(browser, { motion: 'reduce' });
    try {
      await ready(page);
      assert.equal(await page.locator('#replay-intro').isDisabled(), true);
      await openRoutines(page);
      await reviewChecklist(page);
      for (const checkbox of await page.locator('.check-row input:visible').all()) await checkbox.check();
      assert.equal(await page.locator('.routine-detail').getAttribute('data-complete'), 'true');
      await page.locator('.check-row input').first().uncheck();
      assert.equal(await page.locator('.routine-detail').getAttribute('data-complete'), 'false');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.getElementById('routines-dialog').open);
      await page.locator('[data-icon="settings"]').click();
      assert.equal(await page.locator('#settings-motion').isDisabled(), true);
    } finally { await context.close(); }
  });

  for (const width of [320, 1440]) {
    await t.test(`Field Mode advances, undoes, resumes and includes optional items at ${width}px`, async () => {
      const { context, page, errors } = await fixture(browser, { width, motion: width === 320 ? 'reduce' : 'no-preference' });
      try {
        await ready(page);
        await openRoutines(page);
        assert.equal(await page.locator('#routine-review').evaluate(el => el.open), false);
        assert.equal(await page.locator('#field-title').textContent(), 'Wash your face');
        await page.locator('#field-complete').focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.locator('#field-title').textContent(), 'Brush your teeth');
        assert.equal(await page.locator('#field-complete').evaluate(el => el === document.activeElement), true);
        await page.locator('#field-undo').click();
        assert.equal(await page.locator('#field-title').textContent(), 'Wash your face');
        assert.equal(await page.locator('[data-check="personal-care/care/item-1"]').isChecked(), false);
        for (let i = 0; i < 3; i++) await page.locator('#field-complete').click();
        assert.equal(await page.locator('.routine-detail').getAttribute('data-complete'), 'true');
        assert.equal(await page.locator('#field-title').textContent(), 'All set. You’re ready.');
        assert.equal(await page.locator('#field-complete').evaluate(el => el === document.activeElement), true);
        if (width === 320) {
          assert.equal(await page.locator('.field-mark').evaluate(el => getComputedStyle(el).animationName), 'none');
          assert.equal(await page.locator('.field-copy').evaluate(el => el.getAnimations().length), 0);
        }
        await page.locator('#field-complete').click();
        assert.equal(await page.locator('#routine-review').evaluate(el => el.open), true);
        await page.locator('#field-undo').click();
        assert.equal(await page.locator('#field-title').textContent(), 'Get a fresh towel');
        await ready(page);
        await openRoutines(page);
        assert.equal(await page.locator('#field-title').textContent(), 'Get a fresh towel');
        assert.equal(await page.locator('#field-undo').isVisible(), false);
        await reviewChecklist(page);
        await page.locator('[data-group="personal-care/extras"]').check();
        await page.locator('#routine-review > summary').click();
        await page.locator('#field-complete').click();
        assert.equal(await page.locator('#field-title').textContent(), 'Tidy your grooming kit');
        await page.locator('#field-complete').click();
        assert.equal(await page.locator('#field-title').textContent(), 'Put away toiletries');
        await reviewChecklist(page);
        await page.locator('[data-group="personal-care/extras"]').uncheck();
        assert.equal(await page.locator('.routine-detail').getAttribute('data-complete'), 'true');
        await page.locator('[data-group="personal-care/extras"]').check();
        assert.equal(await page.locator('#field-title').textContent(), 'Put away toiletries');
        await page.locator('[data-routine="training"]').click();
        assert.equal(await page.locator('#field-title').textContent(), 'Pack training clothes');
        assert.equal(await page.locator('#field-undo').isVisible(), false);
        await page.locator('#field-complete').click();
        await page.locator('[data-routine="personal-care"]').click();
        await page.locator('#routine-review > summary').click();
        await page.locator('#routine-restart').click();
        await page.locator('#restart-confirm').click();
        assert.equal(await page.locator('#field-title').textContent(), 'Wash your face');
        assert.equal(await page.locator('#field-complete').evaluate(el => el === document.activeElement), true);
        assert.equal(await page.locator('#routine-progress-label').textContent(), '0 of 5 ready');
        assert.equal(await page.locator('[data-routine="training"] .routine-count').textContent(), '1 / 4');
        assert.equal(await page.locator('#routines-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
  }

  await t.test('Field Mode handles long labels and a checklist with only optional sections', async () => {
    const data = JSON.parse(demo);
    data.routines = [data.routines[0]];
    data.routines[0].groups = [data.routines[0].groups[1]];
    data.routines[0].groups[0].items[0].label = 'Prepare your equipment and check everything you need before leaving '.repeat(3).trim();
    const { context, page } = await fixture(browser, { width: 320, data, motion: 'reduce' });
    try {
      await ready(page);
      await openRoutines(page);
      assert.equal(await page.locator('#field-group').textContent(), 'NO ACTIVE ITEMS');
      assert.equal(await page.locator('.routine-detail').getAttribute('data-complete'), 'false');
      await page.locator('#field-complete').click();
      await page.locator('[data-group="personal-care/extras"]').check();
      assert.equal(await page.locator('#field-title').textContent(), data.routines[0].groups[0].items[0].label);
      assert.equal(await page.locator('#routines-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true);
      await page.locator('#field-complete').click();
      assert.equal(await page.locator('#field-title').textContent(), 'Put away toiletries');
    } finally { await context.close(); }
  });

  await t.test('scanner sounds stay quiet, avoid bass impacts and end in silence', async () => {
    const { context, page } = await fixture(browser);
    try {
      await ready(page);
      const rendered = await page.evaluate(async () => {
        const results = [];
        for (const kind of ['select', 'open', 'close']) {
          const audio = new OfflineAudioContext(1, 17640, 44100);
          synthesizeInterfaceSound(audio, audio.destination, kind);
          const rendered = await audio.startRendering();
          const data = rendered.getChannelData(0);
          let peak = 0, energy = 0, last = 0, tail = 0;
          for (let i = 0; i < data.length; i++) {
            peak = Math.max(peak, Math.abs(data[i]));
            energy += data[i] ** 2;
            if (Math.abs(data[i]) > .00005) last = i / 44100;
            if (i > 14112) tail = Math.max(tail, Math.abs(data[i]));
          }
          const bassContext = new OfflineAudioContext(1, data.length, 44100);
          const source = bassContext.createBufferSource();
          const lowpass = bassContext.createBiquadFilter();
          source.buffer = rendered;
          lowpass.type = 'lowpass';
          lowpass.frequency.value = 250;
          lowpass.Q.value = Math.SQRT1_2;
          source.connect(lowpass).connect(bassContext.destination);
          source.start();
          const bass = (await bassContext.startRendering()).getChannelData(0);
          const bassEnergy = bass.reduce((sum, value) => sum + value ** 2, 0);
          results.push({ kind, peak, rms: Math.sqrt(energy / data.length), bassRatio: bassEnergy / energy, last, tail });
        }
        return results;
      });
      for (const sound of rendered) {
        assert.ok(sound.peak > .005 && sound.peak < .12, `${sound.kind} should be audible without clipping or a loud peak.`);
        assert.ok(sound.rms > .0005 && sound.rms < .03);
        assert.ok(sound.bassRatio < .02, `${sound.kind} should have no drum-like bass impact.`);
        assert.equal(sound.tail, 0, 'No lingering drone after the one-shot ends.');
      }
      assert.ok(rendered[0].last < rendered[2].last && rendered[2].last < rendered[1].last);
    } finally { await context.close(); }
  });

  await t.test('sequential edits in two tabs preserve and refresh both ticks', async () => {
    const { context, page } = await fixture(browser);
    try {
      const other = await context.newPage();
      await ready(page);
      await ready(other);
      await openRoutines(page);
      await openRoutines(other);
      await reviewChecklist(page);
      await reviewChecklist(other);
      await page.locator('.check-row input').nth(0).check();
      await other.waitForFunction(() => document.querySelectorAll('.check-row input')[0].checked);
      assert.equal(await other.locator('#field-title').textContent(), 'Brush your teeth');
      await other.locator('.check-row input').nth(1).check();
      await page.waitForFunction(() => document.querySelectorAll('.check-row input')[1].checked);
      assert.equal(await page.locator('#field-title').textContent(), 'Get a fresh towel');
      const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
      assert.equal(Object.values(saved.checks).filter(Boolean).length, 2);
      await other.keyboard.press('Escape');
      await other.waitForFunction(() => document.querySelector('#core-signal-list [data-checklist="personal-care"] .core-signal-count').textContent === '2 / 3');
      await page.locator('[data-group="personal-care/extras"]').check();
      await other.waitForFunction(() => document.querySelector('#core-signal-list [data-checklist="personal-care"] .core-signal-count').textContent === '2 / 5');
      assert.equal(await other.locator('.core-art .core-progress-fill[data-checklist="personal-care"]').evaluate(el => Number(el.style.strokeDashoffset)), 60);
      await other.evaluate(key => localStorage.removeItem(key), storageKey);
      await page.waitForFunction(() => !document.querySelectorAll('.check-row input')[0].checked);
    } finally { await context.close(); }
  });

  for (const failure of ['data', 'module', 'dependency']) {
    await t.test(`failed ${failure} load can retry without losing saved ticks`, async () => {
      const { context, page, failures } = await fixture(browser);
      try {
        await context.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: storageKey, value: JSON.stringify({ checks: { 'personal-care/care/item-1': true }, optional: {} }) });
        failures[failure] = true;
        await page.goto(origin);
        await openRoutines(page);
        await page.locator('#routine-retry').waitFor();
        assert.equal(await page.locator('#routine-source').textContent(), 'UNAVAILABLE');
        const saved = await page.evaluate(key => localStorage.getItem(key), storageKey);
        failures[failure] = false;
        await page.locator('#routine-retry').click();
        await page.waitForSelector('#routines-dialog[data-ready="true"]', { state: 'attached' });
        assert.equal(await page.locator('.routine-card').count(), 5);
        assert.equal(await page.locator('.check-row input').first().isChecked(), true);
        assert.equal(await page.locator('#routine-retry').isVisible(), false);
        assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), saved);
      } finally { await context.close(); }
    });
  }

  for (const storage of ['blocked', 'corrupt', 'corrupted after loading']) {
    await t.test(`${storage} storage retains multiple ticks for this visit`, async () => {
      const { context, page } = await fixture(browser);
      try {
        await context.addInitScript(({ storage, key }) => {
          if (storage === 'corrupt') localStorage.setItem(key, '{broken');
          else if (storage === 'blocked') Storage.prototype.setItem = () => { throw new Error('Storage blocked'); };
        }, { storage, key: storageKey });
        await ready(page);
        await openRoutines(page);
        await reviewChecklist(page);
        if (storage === 'corrupted after loading') {
          await page.evaluate(key => localStorage.setItem(key, '{broken'), storageKey);
        }
        await page.locator('#field-complete').click();
        await page.locator('#field-complete').click();
        assert.equal(await page.locator('.check-row input:checked').count(), 2);
        assert.match(await page.locator('#routine-notice').textContent(), /this visit only/);
        if (storage !== 'blocked') assert.equal(await page.evaluate(key => localStorage.getItem(key), storageKey), '{broken');
      } finally { await context.close(); }
    });
  }

  await t.test('loopback uses a separate private progress key, reduced motion and older timeout API work', async () => {
    const { context, page, errors } = await fixture(browser, { private: true, motion: 'reduce', width: 390 });
    try {
      await context.addInitScript(() => { AbortSignal.timeout = undefined; });
      await ready(page, 'http://127.0.0.1:18765');
      await openRoutines(page);
      assert.equal(await page.locator('#routines-dialog').getAttribute('data-source'), 'private');
      assert.equal(await page.locator('.gyro').first().evaluate(element => getComputedStyle(element).animationName), 'none');
      await reviewChecklist(page);
      await page.locator('.check-row input').first().check();
      assert.equal(await page.evaluate(() => localStorage.getItem('thehub:routines:demo:v1')), null);
      assert.notEqual(await page.evaluate(() => localStorage.getItem('thehub:routines:private:v1')), null);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
});
