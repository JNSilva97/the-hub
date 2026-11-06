const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { fixture, ready, openRoutines, chooseRoutine, demo } = require('./browser-fixture.cjs');
const stock = (page, id) => page.locator(`[data-medication="${id}"] .medication-stock`).textContent();
const waitStock = (page, id, value) => page.waitForFunction(({ id, value }) => document.querySelector(`[data-medication="${id}"] .medication-stock`).textContent === `${value} tablets left`, { id, value });
const openHealth = page => page.locator('.app[data-icon="health"]').click();
const closeHealth = page => page.getByRole('button', { name: 'Close Health', exact: true }).click();

test('Health medication demo', { timeout: 90000 }, async t => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true }); t.after(() => browser.close());
  for (const width of [320, 390, 1440]) await t.test(`Personal Care and Health share doses without changing saved checklist data at ${width}px`, async () => {
    const { context, page, errors } = await fixture(browser, { width, height: 740, motion: 'reduce' });
    try {
      await ready(page); await openRoutines(page);
      const check = page.locator('[data-dose="sample-a"]');
      assert.equal(await check.isVisible(), true);
      await check.check(); await waitStock(page, 'sample-a', 27);
      await page.locator('#medication-open-health').click();
      assert.equal(await page.locator('#app-title').textContent(), 'Health');
      assert.match(await page.locator('#app-description').textContent(), /Fictional.*not synced/);
      assert.equal(await stock(page, 'sample-a'), '27 tablets left');
      assert.equal(await page.getByRole('button', { name: 'Mark Sample A taken' }).isDisabled(), true);
      await page.getByRole('button', { name: 'Mark Sample A taken' }).evaluate(button => { button.click(); button.click(); });
      assert.equal(await stock(page, 'sample-a'), '27 tablets left');
      assert.equal(await page.locator('#health-history li').count(), 1);
      await page.getByRole('button', { name: 'Mark Sample B taken' }).click(); await waitStock(page, 'sample-b', 8);
      await closeHealth(page);
      assert.equal(await page.locator('[data-dose="sample-b"]').isChecked(), true);
      await page.locator('.check-row input').first().check();
      await page.locator('#routine-restart').click(); await page.locator('#restart-confirm').click();
      assert.equal(await page.locator('.check-row input').first().isChecked(), false);
      assert.equal(await check.isChecked(), true);
      assert.equal(await page.locator('[data-dose="sample-b"]').isChecked(), true);
      await page.locator('#medication-open-health').click();
      await page.getByRole('button', { name: 'Undo Sample A dose', exact: true }).click(); await waitStock(page, 'sample-a', 28);
      await closeHealth(page); assert.equal(await check.isChecked(), false);
      await chooseRoutine(page, 'training'); assert.equal(await page.locator('#personal-care-medications').isVisible(), false);
      await ready(page); await openHealth(page);
      assert.equal(await stock(page, 'sample-a'), '28 tablets left'); assert.equal(await stock(page, 'sample-b'), '8 tablets left');
      await page.locator('#restock-sample-b').fill('5'); await page.getByRole('button', { name: 'Add stock for Sample B' }).click(); await waitStock(page, 'sample-b', 13);
      await page.locator('#restock-sample-b').fill('-1'); await page.getByRole('button', { name: 'Add stock for Sample B' }).click();
      assert.equal(await stock(page, 'sample-b'), '13 tablets left');
      await page.locator('#health-open-care').click();
      assert.equal(await page.locator('#routines-dialog').evaluate(el => el.open), true);
      assert.equal(await page.locator('#routine-name').textContent(), 'Personal Care');
      assert.equal(await page.locator('[data-dose="sample-b"]').isChecked(), true);
      assert.equal(await page.locator('#routines-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('thehub:routines:demo:v1')));
      assert.equal(Object.keys(saved.checks).some(key => key.includes('sample-')), false);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('two tabs share stock and concurrent checks of the same dose deduct only once', async () => {
    const { context, page, errors } = await fixture(browser, { motion: 'reduce' });
    try {
      const other = await context.newPage(); await ready(page); await ready(other);
      await openRoutines(page); await openRoutines(other);
      const take = page => page.locator('[data-dose="sample-a"]').evaluate(input => { input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); });
      await Promise.all([take(page), take(other)]);
      await waitStock(page, 'sample-a', 27); await waitStock(other, 'sample-a', 27);
      await page.locator('[data-dose="sample-a"]').uncheck();
      await other.waitForFunction(() => !document.querySelector('[data-dose="sample-a"]').checked);
      await waitStock(other, 'sample-a', 28);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('a new Lisbon day permits a new dose without replenishing stock or losing history', async () => {
    const { context, page } = await fixture(browser, { motion: 'reduce' });
    try {
      await page.clock.install({ time: new Date('2026-06-06T22:59:00Z') });
      await ready(page); await openRoutines(page);
      await page.locator('[data-dose="sample-a"]').check(); await waitStock(page, 'sample-a', 27);
      await page.clock.setSystemTime(new Date('2026-06-06T23:01:00Z'));
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      assert.equal(await page.locator('[data-dose="sample-a"]').isChecked(), false);
      await page.locator('[data-dose="sample-a"]').check(); await waitStock(page, 'sample-a', 26);
      await page.locator('#medication-open-health').click();
      assert.equal(await page.locator('#health-history li').count(), 2);
      await page.getByRole('button', { name: 'Undo Sample A dose for 2026-06-06', exact: true }).click(); await waitStock(page, 'sample-a', 27);
      await closeHealth(page); assert.equal(await page.locator('[data-dose="sample-a"]').isChecked(), true);
    } finally { await context.close(); }
  });

  await t.test('empty stock blocks another dose, while restocking restores availability', async () => {
    const { context, page } = await fixture(browser, { motion: 'reduce' });
    try {
      await context.addInitScript(() => {
        for (let day = 1; day <= 5; day++) {
          const date = `2020-01-0${day}`;
          localStorage.setItem(`thehub:health-demo:v1:dose:${date}:sample-b`, JSON.stringify({ version: 1, type: 'dose', medication: 'sample-b', date, taken: true, at: day }));
        }
      });
      await ready(page); await openHealth(page);
      assert.equal(await stock(page, 'sample-b'), '0 tablets left');
      assert.equal(await page.getByRole('button', { name: 'Mark Sample B taken' }).isDisabled(), true);
      await page.locator('#restock-sample-b').fill('2'); await page.getByRole('button', { name: 'Add stock for Sample B' }).click(); await waitStock(page, 'sample-b', 2);
      await page.getByRole('button', { name: 'Mark Sample B taken' }).click(); await waitStock(page, 'sample-b', 0);
      assert.equal(await page.getByRole('button', { name: 'Mark Sample B taken' }).isDisabled(), true);
    } finally { await context.close(); }
  });

  await t.test('blocked writes and unreadable records cannot change stock or private account data', async () => {
    const { context, page, errors } = await fixture(browser, { motion: 'reduce', firebase: true, cloudDocuments: { 'account-a': { routines: JSON.parse(demo), progress: { checks: {}, optional: {} } } } });
    try {
      await ready(page); await page.waitForFunction(() => document.getElementById('routines-dialog').dataset.source === 'account');
      const before = await page.evaluate(() => JSON.stringify(window.__hubFirebase.docs));
      await openRoutines(page);
      await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key.startsWith('thehub:health-demo:')) throw new Error('Storage full'); return original.call(this, key, value); }; });
      await page.locator('[data-dose="sample-a"]').click();
      await page.waitForFunction(() => document.getElementById('medication-status').textContent.includes('could not be saved'));
      assert.equal(await page.locator('[data-dose="sample-a"]').isChecked(), false);
      assert.equal(await stock(page, 'sample-a'), '28 tablets left');
      assert.equal(await page.evaluate(() => JSON.stringify(window.__hubFirebase.docs)), before);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
    const bad = await fixture(browser, { motion: 'reduce' });
    try {
      await bad.context.addInitScript(() => localStorage.setItem('thehub:health-demo:v1:dose:2020-01-01:sample-a', '{broken'));
      await ready(bad.page); await openHealth(bad.page);
      assert.equal(await bad.page.getByRole('button', { name: 'Mark Sample A taken' }).isDisabled(), true);
      assert.match(await bad.page.locator('#health-status').textContent(), /could not be read/);
      assert.equal(await bad.page.evaluate(() => localStorage.getItem('thehub:health-demo:v1:dose:2020-01-01:sample-a')), '{broken');
    } finally { await bad.context.close(); }
  });
});
