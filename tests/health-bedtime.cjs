const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { fixture, ready, demo, openRoutines, chooseRoutine } = require('./browser-fixture.cjs');
const id = 'med-00000000-0000-4000-8000-000000000001';
const dailyId = 'med-00000000-0000-4000-8000-000000000002';
const prefix = 'thehub:health-demo:v1:';
const legacy = { key: `${prefix}dose:2026-11-21:${id}`, medication: id, version: 1, type: 'dose', name: 'ValdispertNoite', quantity: 1, date: '2026-11-21', taken: true, at: Date.parse('2026-11-21T01:00:00Z') };
function documents(time = 'bedtime', doses = []) {
  const settings = { key: `${prefix}settings:${id}`, medication: id, version: 1, type: 'settings', name: 'ValdispertNoite', quantity: 1, adjustment: 28, time, link: { scope: 'account:account-a', id: 'wind-down' }, at: 0 };
  return { 'account-a': { routines: JSON.parse(demo), progress: { checks: {}, optional: {} }, health: { [id]: { version: 1, revision: 1, payload: JSON.stringify([settings, ...doses]) } } } };
}
const card = page => page.locator(`[data-medication="${id}"]`);
const mark = page => page.getByRole('button', { name: 'Mark ValdispertNoite taken', exact: true });
async function open(page, at) {
  await page.clock.setFixedTime(new Date(at)); await ready(page);
  await page.locator('[data-icon="health"]').click();
  await page.locator('#health-sync-status').filter({ hasText: 'Synced to your account.' }).waitFor();
}
async function clock(page, at) { await page.clock.setFixedTime(new Date(at)); await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); }
const waitStock = (page, n) => page.waitForFunction(({ id, n }) => document.querySelector(`[data-medication="${id}"] .medication-stock`).textContent === `${n} tablets left`, { id, n });
test('Before-bed records follow Lisbon nights without overwriting calendar-day history', { timeout: 90000 }, async t => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true }); t.after(() => browser.close());
  for (const time of ['bedtime', '23:00']) await t.test(`legacy after-midnight Valdispert and tonight remain separate with ${time} schedule`, async () => {
    const data = documents(time, [legacy]);
    const settings = { ...JSON.parse(data['account-a'].health[id].payload)[0], medication: dailyId, name: 'Morning example', key: `${prefix}settings:${dailyId}`, time: '08:00', link: null };
    data['account-a'].health[dailyId] = { version: 1, revision: 1, payload: JSON.stringify([settings, { ...legacy, medication: dailyId, name: 'Morning example', key: `${prefix}dose:2026-11-21:${dailyId}` }]) };
    const { context, page, errors } = await fixture(browser, { width: 390, mobile: true, motion: 'reduce', firebase: true, cloudDocuments: data });
    try {
      await open(page, '2026-11-21T23:00:00Z'); await waitStock(page, 27);
      assert.equal(await mark(page).isEnabled(), true);
      assert.equal(await page.getByRole('button', { name: 'Mark Morning example taken', exact: true }).isDisabled(), true);
      await mark(page).click(); await waitStock(page, 26);
      const records = await page.evaluate(id => JSON.parse(window.__hubFirebase.docs['account-a'].health[id].payload), id);
      assert.deepEqual(records.find(e => e.key === legacy.key), legacy);
      assert.equal(records.filter(e => e.type === 'dose' && e.taken).length, 2);
      const tonight = records.find(e => e.night === '2026-11-21');
      assert.equal(tonight.date, '2026-11-21'); assert.equal(tonight.at, Date.parse('2026-11-21T23:00:00Z'));
      assert.equal(await mark(page).isDisabled(), true);
      await page.getByRole('button', { name: 'Close Health', exact: true }).click();
      await openRoutines(page); await chooseRoutine(page, 'wind-down');
      const check = page.locator(`[data-dose="${id}"]`); assert.equal(await check.isChecked(), true);
      await check.uncheck(); await waitStock(page, 27);
      const undone = await page.evaluate(id => JSON.parse(window.__hubFirebase.docs['account-a'].health[id].payload), id);
      assert.deepEqual(undone.find(e => e.key === legacy.key), legacy);
      assert.equal(undone.find(e => e.key === tonight.key).taken, false);
      await check.check(); await waitStock(page, 26);
      const saved = await page.evaluate(() => window.__hubFirebase.docs);
      await context.addInitScript(saved => { window.__hubFirebase.docs = saved; }, saved);
      await page.reload(); await page.locator('[data-icon="health"]').click(); await waitStock(page, 26);
      assert.equal(await mark(page).isDisabled(), true);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
  await t.test('midnight does not start a new night; noon does; activity Undo targets only its own night', async () => {
    const { context, page, errors } = await fixture(browser, { motion: 'reduce', firebase: true, cloudDocuments: documents() });
    try {
      await open(page, '2026-11-20T23:30:00Z'); await mark(page).click(); await waitStock(page, 27);
      await clock(page, '2026-11-21T01:00:00Z'); assert.equal(await mark(page).isDisabled(), true);
      await clock(page, '2026-11-21T11:59:00Z'); assert.equal(await mark(page).isDisabled(), true);
      await clock(page, '2026-11-21T12:01:00Z'); assert.equal(await mark(page).isEnabled(), true);
      await mark(page).click(); await waitStock(page, 26);
      await page.getByRole('tab', { name: 'Activity', exact: true }).click();
      await page.getByRole('button', { name: 'Undo ValdispertNoite dose for night 2026-11-20', exact: true }).click(); await waitStock(page, 27);
      await page.getByRole('tab', { name: 'Today', exact: true }).click();
      assert.equal(await mark(page).isDisabled(), true);
      const records = await page.evaluate(id => JSON.parse(window.__hubFirebase.docs['account-a'].health[id].payload), id);
      assert.equal(records.find(e => e.night === '2026-11-20').taken, false);
      assert.equal(records.find(e => e.night === '2026-11-21').taken, true);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
  for (const [start, overnight, noon] of [
    ['2026-03-28T23:30:00Z', '2026-03-29T01:30:00Z', '2026-03-29T11:01:00Z'],
    ['2026-10-24T22:30:00Z', '2026-10-25T01:30:00Z', '2026-10-25T12:01:00Z']
  ]) await t.test(`Lisbon daylight-saving night at ${start}`, async () => {
    const { context, page, errors } = await fixture(browser, { motion: 'reduce', firebase: true, cloudDocuments: documents() });
    try {
      await open(page, start); await mark(page).click(); await waitStock(page, 27);
      await clock(page, overnight); assert.equal(await mark(page).isDisabled(), true);
      await clock(page, noon); assert.equal(await mark(page).isEnabled(), true);
      await mark(page).click(); await waitStock(page, 26);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
  await t.test('two devices recording the same night only deduct stock once', async () => {
    const first = await fixture(browser, { motion: 'reduce', firebase: true, cloudDocuments: documents() });
    const second = await fixture(browser, { motion: 'reduce', firebase: true, cloudDocuments: documents() });
    try {
      for (const item of [first, second]) await open(item.page, '2026-11-21T01:30:00Z');
      await mark(first.page).click(); await waitStock(first.page, 27);
      const health = await first.page.evaluate(() => window.__hubFirebase.docs['account-a'].health);
      await second.page.evaluate(health => { window.__hubFirebase.docs['account-a'].health = health; }, health);
      await mark(second.page).click(); await waitStock(second.page, 27);
      const records = await second.page.evaluate(id => JSON.parse(window.__hubFirebase.docs['account-a'].health[id].payload), id);
      assert.equal(records.filter(e => e.type === 'dose' && e.taken).length, 1);
      assert.deepEqual(first.errors.concat(second.errors), []);
    } finally { await first.context.close(); await second.context.close(); }
  });
});
