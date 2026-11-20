const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { fixture, ready, demo } = require('./browser-fixture.cjs');
const account = () => ({ routines: JSON.parse(demo), progress: { checks: {}, optional: {} }, fitness: {} });
const make = (browser, options = {}) => fixture(browser, { motion: 'reduce', firebase: true, cloudDocuments: { 'account-a': account(), 'account-b': account() }, ...options });
async function open(page) {
  await page.clock.setFixedTime(new Date('2026-11-20T12:00:00Z'));
  await ready(page);
  assert.equal(await page.locator('.today-plans').count(), 0);
  await page.locator('.app[data-icon="fitness"]').click();
}
const row = (page, id) => page.locator(`[data-exercise="${id}"]`);
async function add(page, exercise, delta) {
  await row(page, exercise).locator(`[data-delta="${delta}"]`).click();
  await page.locator('#fitness-status').filter({ hasText: 'Synced to your account.' }).waitFor();
}
test('Fitness workflows', { timeout: 90000 }, async t => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true }); t.after(() => browser.close());
  for (const width of [320, 390, 1440]) await t.test(`daily goals, corrections, reload and rollover at ${width}px`, async () => {
    const { page, context, errors } = await make(browser, { width, mobile: width < 700 });
    try {
      await open(page);
      await page.locator('#fitness-status').filter({ hasText: 'Synced to your account.' }).waitFor();
      assert.equal(await page.locator('#fitness-dialog').evaluate(el => el.scrollWidth > el.clientWidth), false);
      for (const exercise of ['pushups', 'abs']) for (let i = 0; i < 5; i++) await add(page, exercise, 10);
      assert.equal(await page.locator('#fitness-summary').textContent(), 'Both goals complete. Well done!');
      await add(page, 'pushups', -1);
      assert.equal(await row(page, 'pushups').locator('output').textContent(), '49');
      assert.equal(await row(page, 'abs').locator('output').textContent(), '50');
      const documents = await page.evaluate(() => window.__hubFirebase.docs);
      await context.addInitScript(documents => { window.__hubFirebase.docs = documents; }, documents);
      await page.reload(); await page.locator('.app[data-icon="fitness"]').click();
      await page.waitForFunction(() => document.querySelector('[data-exercise="pushups"] output').textContent === '49');
      await page.clock.setFixedTime(new Date('2026-11-21T00:01:00Z'));
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      assert.equal(await row(page, 'pushups').locator('output').textContent(), '0');
      await add(page, 'abs', 5);
      const days = await page.evaluate(() => window.__hubFirebase.docs['account-a'].fitness);
      assert.equal(days['2026-11-20'].pushups, 49); assert.equal(days['2026-11-21'].abs, 5);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
  await t.test('sync, rejection, retry and account isolation', async () => {
    const first = await make(browser); const second = await make(browser);
    try {
      for (const item of [first, second]) { await open(item.page); await item.page.locator('#fitness-status').filter({ hasText: 'Synced' }).waitFor(); }
      await add(first.page, 'pushups', 10);
      const fitness = await first.page.evaluate(() => window.__hubFirebase.docs['account-a'].fitness);
      await second.page.evaluate(fitness => { window.__hubFirebase.docs['account-a'].fitness = fitness; window.__hubFirebase.publish(); }, fitness);
      assert.equal(await row(second.page, 'pushups').locator('output').textContent(), '10');
      await second.page.evaluate(() => { window.__hubFirebase.rejectFitness = true; });
      await row(second.page, 'pushups').locator('[data-delta="5"]').click();
      await second.page.locator('#fitness-status').filter({ hasText: 'Could not save' }).waitFor();
      assert.equal(await row(second.page, 'pushups').locator('output').textContent(), '10');
      await second.page.evaluate(() => { window.__hubFirebase.rejectFitness = false; });
      await add(second.page, 'pushups', 5);
      assert.equal(await row(second.page, 'pushups').locator('output').textContent(), '15');
      await second.page.evaluate(() => { const s = window.__hubFirebase; s.user = { uid: 'account-b' }; s.authListener(s.user); });
      await second.page.waitForFunction(() => document.querySelector('[data-exercise="pushups"] output').textContent === '0');
      await add(second.page, 'abs', 1);
      assert.equal(await second.page.evaluate(() => window.__hubFirebase.docs['account-a'].fitness['2026-11-20'].pushups), 15);
      await second.page.keyboard.press('Escape');
      assert.equal(await second.page.locator('#fitness-dialog').evaluate(el => el.open), false);
      assert.deepEqual(first.errors.concat(second.errors), []);
    } finally { await first.context.close(); await second.context.close(); }
  });
  await t.test('signed out, offline and denied rules disable changes', async () => {
    for (const options of [{ signedIn: false }, { fromCache: true, cloudDocuments: { 'account-a': { ...account(), fitness: { '2026-11-20': { version: 1, revision: 1, pushups: 20, abs: 0 } } } } }, {}]) {
      const { page, context, errors } = await make(browser, options);
      try {
        await open(page);
        if (!Object.keys(options).length) {
          await page.evaluate(() => { window.__hubFirebase.fitnessDenied = true; window.__hubFirebase.publish(); });
          await page.locator('#fitness-status').filter({ hasText: 'unavailable' }).waitFor();
        } else await page.locator('#fitness-status').filter({ hasText: options.fromCache ? 'Offline copy' : 'Sign in' }).waitFor();
        assert.equal(await row(page, 'pushups').locator('[data-delta="1"]').isDisabled(), true);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
  });
});
