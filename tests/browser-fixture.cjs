// Public browser fixtures only; never contacts the configured Firebase project.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const origin = 'https://the-hub.test';
const storageKey = 'thehub:routines:demo:v1';
const demo = readFileSync(path.join(root, 'routines.demo.json'), 'utf8');
const publicFiles = ['index.html', 'styles/routine-tools.css', 'routine-tools.js', 'workspace-model.mjs', 'install.js', 'manifest.webmanifest', 'assets/icons/hub-192.png', 'assets/icons/hub-512.png', 'assets/icons/hub-180.png', 'styles/base.css', 'styles/shell.css', 'styles/core.css', 'styles/access.css', 'styles/panels.css', 'styles/routines.css', 'styles/notes.css', 'styles/motion.css', 'core-progress.js', 'core-transition.js', 'interface-sound.js', 'experience.js', 'pointer-effects.js', 'interface.js', 'notes.js', 'routines.js', 'routine-model.mjs', 'cloud.js', 'firebase-config.mjs', 'routines.demo.json', 'assets/fonts/orbitron-latin.woff2', 'assets/fonts/rajdhani-latin-600.woff2'];
publicFiles.push('cloud-notes.js', 'notes-model.mjs');

async function fixture(browser, options = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: options.width || 1024, height: options.height || 900 }, hasTouch: Boolean(options.mobile), isMobile: Boolean(options.mobile), reducedMotion: options.motion || 'no-preference' });
  const requests = [];
  const errors = [];
  const failures = { data: false, module: false, dependency: false, sdk: Boolean(options.sdkFailure) };
  if (options.firebase) await context.addInitScript(({ documents, signedIn, fromCache }) => {
    window.__hubFirebase = {
      docs: documents,
      user: signedIn ? { uid: 'account-a', email: 'test@example.invalid' } : null,
      writes: [], held: [], imports: 0, rejectWrites: false, holdWrites: false, fromCache, noteListeners: new Set(), noteWrites: [], heldNotes: [],
      publish() {
        if (this.listener) {
          const records = Object.entries(this.docs[this.listener.uid] || {});
          this.listener.next({ empty: !records.length, metadata: { fromCache: this.fromCache, hasPendingWrites: Boolean(this.hasPendingWrites) }, docs: records.map(([id, data]) => ({ id, data: () => structuredClone(data) })) });
        }
        for (const listener of this.noteListeners) {
          const records = Object.entries(this.docs[listener.uid]?.notes || {}).filter(([, note]) => note.retired === false);
          listener.next({ empty: !records.length, metadata: { fromCache: this.fromCache, hasPendingWrites: Boolean(this.notesPending) }, docs: records.map(([id, data]) => ({ id, data: () => structuredClone(data) })) });
        }
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

async function chooseRoutine(page, id) {
  if (await page.locator('#routine-picker-menu .checklist-picker-toggle').isVisible()) {
    await page.locator('#routine-picker-menu .checklist-picker-toggle').click();
    await page.locator(`#routine-picker-menu .checklist-choice[data-value="${id}"]`).click();
  }
  else await page.locator(`[data-routine="${id}"]`).click();
}

async function reviewChecklist(page) {
  if (!await page.locator('#routine-review').evaluate(element => element.open)) await page.locator('#routine-review > summary').click();
}

module.exports = { root, origin, storageKey, demo, fixture, ready, openRoutines, chooseRoutine, reviewChecklist };
