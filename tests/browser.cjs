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
const publicFiles = ['index.html', 'interface.css', 'routines.css', 'interface.js', 'routines.js', 'routine-model.mjs', 'routines.demo.json', 'assets/fonts/orbitron-latin.woff2', 'assets/fonts/rajdhani-latin-600.woff2'];

async function fixture(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: options.width || 1024, height: 900 }, reducedMotion: options.motion || 'no-preference' });
  const requests = [];
  const errors = [];
  const failures = { data: false, module: false, dependency: false };
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    const filename = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    requests.push({ pathname: url.pathname, method: request.method() });
    if (filename === 'routines.demo.json' && failures.data) return route.fulfill({ status: 503, body: 'Unavailable' });
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

test('The Hub browser regressions', { timeout: 180000 }, async t => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());

  for (const width of [320, 390, 768, 1024, 1440]) {
    await t.test(`real clicks, keyboard, layout and smoke check at ${width}px`, async () => {
      const { context, page, requests, errors } = await fixture(browser, { width });
      try {
        await ready(page);
        await openRoutines(page);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#routines-launch').evaluate(element => document.activeElement === element), true);
        await page.keyboard.press('Enter');
        await page.getByRole('button', { name: 'Close routines' }).click();
        for (const app of await page.locator('.app').all()) {
          await app.click();
          assert.equal(await page.locator('#app-title').textContent(), await app.locator('.app-name').textContent());
          await page.keyboard.press('Escape');
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

  await t.test('ticks, optional counts, reload and scoped reset', async () => {
    const { context, page } = await fixture(browser);
    try {
      await ready(page);
      await openRoutines(page);
      await page.locator('[data-routine="workday"]').click();
      await page.locator('[data-check="workday/work/item-1"]').check();
      await page.locator('[data-group="workday/after-work"]').check();
      assert.equal(await page.locator('#routine-progress-label').textContent(), '1 of 6 ready');
      await page.locator('[data-routine="training"]').click();
      await page.locator('.check-row input').first().check();
      await ready(page);
      await openRoutines(page);
      await page.locator('[data-routine="workday"]').click();
      assert.equal(await page.locator('[data-check="workday/work/item-1"]').isChecked(), true);
      assert.equal(await page.locator('[data-group="workday/after-work"]').isChecked(), true);
      page.once('dialog', dialog => dialog.dismiss());
      await page.locator('#routine-restart').click();
      assert.equal(await page.locator('[data-check="workday/work/item-1"]').isChecked(), true);
      page.once('dialog', dialog => dialog.accept());
      await page.locator('#routine-restart').click();
      assert.equal(await page.locator('[data-check="workday/work/item-1"]').isChecked(), false);
      assert.equal(await page.locator('[data-group="workday/after-work"]').isChecked(), true);
      await page.locator('[data-routine="training"]').click();
      assert.equal(await page.locator('.check-row input').first().isChecked(), true);
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
      await page.locator('.check-row input').nth(0).check();
      await other.waitForFunction(() => document.querySelectorAll('.check-row input')[0].checked);
      await other.locator('.check-row input').nth(1).check();
      await page.waitForFunction(() => document.querySelectorAll('.check-row input')[1].checked);
      const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
      assert.equal(Object.values(saved.checks).filter(Boolean).length, 2);
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
        if (storage === 'corrupted after loading') {
          await page.evaluate(key => localStorage.setItem(key, '{broken'), storageKey);
        }
        await page.locator('.check-row input').nth(0).check();
        await page.locator('.check-row input').nth(1).check();
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
      await page.locator('.check-row input').first().check();
      assert.equal(await page.evaluate(() => localStorage.getItem('thehub:routines:demo:v1')), null);
      assert.notEqual(await page.evaluate(() => localStorage.getItem('thehub:routines:private:v1')), null);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
});
