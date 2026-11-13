const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { fixture, ready, openRoutines, chooseRoutine, demo } = require('./browser-fixture.cjs');
const stock = (page, id) => page.locator(`[data-medication="${id}"] .medication-stock`).textContent();
const waitStock = (page, id, value) => page.waitForFunction(({ id, value }) => document.querySelector(`[data-medication="${id}"] .medication-stock`).textContent === `${value} tablets left`, { id, value });
const openHealth = page => page.locator('.app[data-icon="health"]').click();
const closeHealth = page => page.getByRole('button', { name: 'Close Health', exact: true }).click();
const firstId = 'med-00000000-0000-4000-8000-000000000001';
const secondId = 'med-00000000-0000-4000-8000-000000000002';
const healthKey = 'thehub:health-demo:v1:';
const makeAccount = () => ({ routines: JSON.parse(demo), progress: { checks: {}, optional: {} } });
function seededHealth(firstDoses = [], secondDoses = []) {
  return Object.fromEntries([[firstId, 'Sample A', 1, 28, firstDoses], [secondId, 'Sample B', 2, 10, secondDoses]].map(([medication, name, quantity, adjustment, dates]) => {
    const settings = { key: healthKey + 'settings:' + medication, medication, version: 1, type: 'settings', name, quantity, adjustment, time: '08:00', link: { scope: 'account:account-a', id: 'personal-care' }, at: 0 };
    const doses = dates.map((date, index) => ({ key: healthKey + 'dose:' + date + ':' + medication, medication, version: 1, type: 'dose', name, quantity, date, taken: true, at: index + 1 }));
    return [medication, { version: 1, revision: 1, payload: JSON.stringify([settings, ...doses]) }];
  }));
}
const accountFixture = (browser, options, health = seededHealth()) => fixture(browser, {
  ...options, firebase: true, cloudDocuments: { 'account-a': { ...makeAccount(), health } }
});
async function copyHealth(from, to, publish = true) {
  const health = await from.evaluate(() => structuredClone(window.__hubFirebase.docs['account-a'].health));
  await to.evaluate(({ health, publish }) => {
    const service = window.__hubFirebase;
    service.docs['account-a'].health = health;
    if (publish) service.publish();
  }, { health, publish });
}

test('Account Health', { timeout: 150000 }, async t => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true }); t.after(() => browser.close());
  for (const width of [320, 390, 1440]) await t.test(`Personal Care and Health share doses without changing saved checklist data at ${width}px`, async () => {
    const { context, page, errors } = await accountFixture(browser, { width, height: 740, motion: 'reduce' });
    try {
      await ready(page); await openRoutines(page);
      const check = page.locator(`[data-dose="${firstId}"]`);
      assert.equal(await check.isVisible(), true);
      await check.check(); await waitStock(page, firstId, 27);
      await page.locator('#medication-open-health').click();
      assert.equal(await page.locator('#app-title').textContent(), 'Health');
      assert.equal(await page.locator('#health-data-badge').textContent(), 'PRIVATE / YOUR ACCOUNT');
      assert.equal(await stock(page, firstId), '27 tablets left');
      assert.equal(await page.getByRole('button', { name: 'Mark Sample A taken' }).isDisabled(), true);
      await page.getByRole('button', { name: 'Mark Sample A taken' }).evaluate(button => { button.click(); button.click(); });
      assert.equal(await stock(page, firstId), '27 tablets left');
      assert.equal(await page.locator('#health-history li').count(), 3);
      await page.getByRole('button', { name: 'Mark Sample B taken' }).click(); await waitStock(page, secondId, 8);
      await closeHealth(page);
      assert.equal(await page.locator(`[data-dose="${secondId}"]`).isChecked(), true);
      await page.locator('.check-row input').first().check();
      await page.locator('#routine-restart').click(); await page.locator('#restart-confirm').click();
      assert.equal(await page.locator('.check-row input').first().isChecked(), false);
      assert.equal(await check.isChecked(), true);
      assert.equal(await page.locator(`[data-dose="${secondId}"]`).isChecked(), true);
      await page.locator('#medication-open-health').click();
      await page.getByRole('button', { name: 'Undo Sample A dose', exact: true }).click(); await waitStock(page, firstId, 28);
      await closeHealth(page); assert.equal(await check.isChecked(), false);
      await chooseRoutine(page, 'training'); assert.equal(await page.locator('#personal-care-medications').isVisible(), false);
      await page.locator('#routines-dialog').evaluate(dialog => dialog.close());
      await openHealth(page);
      assert.equal(await stock(page, firstId), '28 tablets left'); assert.equal(await stock(page, secondId), '8 tablets left');
      const restock = page.locator(`#restock-${secondId}`);
      await restock.fill('5');
      await page.keyboard.down('Enter'); await waitStock(page, secondId, 13);
      await restock.focus();
      await page.keyboard.down('Enter'); await page.keyboard.up('Enter');
      assert.equal(await stock(page, secondId), '13 tablets left');
      await page.locator(`#restock-${secondId}`).fill('-1'); await page.getByRole('button', { name: 'Add stock for Sample B' }).click();
      assert.equal(await stock(page, secondId), '13 tablets left');
      await page.getByRole('button', { name: 'Open Personal Care for Sample B', exact: true }).click();
      assert.equal(await page.locator('#routines-dialog').evaluate(el => el.open), true);
      assert.equal(await page.locator('#routine-name').textContent(), 'Personal Care');
      assert.equal(await page.locator(`[data-dose="${secondId}"]`).isChecked(), true);
      assert.equal(await page.locator('#routines-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true);
      const saved = await page.evaluate(() => window.__hubFirebase.docs['account-a'].progress);
      assert.equal(Object.keys(saved.checks).some(key => key.includes('med-')), false);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  for (const width of [320, 390, 1440]) await t.test(`editing medication keeps historical quantities and updates linked checks at ${width}px`, async () => {
    const { context, page, errors } = await accountFixture(browser, { width, motion: 'reduce' }, seededHealth(['2026-11-06']));
    try {
      await page.clock.install({ time: new Date('2026-11-06T12:00:00Z') });
      await ready(page); await openHealth(page); await waitStock(page, firstId, 27);
      const card = page.locator(`[data-medication="${firstId}"]`);
      await card.getByRole('button', { name: 'Edit Sample A', exact: true }).click();
      assert.equal(await card.locator('.medication-editor .medication-dose-actions > button').first().isDisabled(), true);
      await page.locator(`#medication-${firstId}-name`).fill('Morning example');
      await page.locator(`#medication-${firstId}-dose`).fill('2');
      await page.locator(`#medication-${firstId}-time`).fill('09:30');
      await card.locator('.medication-editor .medication-dose-actions > button').first().click();
      await page.waitForFunction(() => document.querySelector('[data-medication="med-00000000-0000-4000-8000-000000000001"] .medication-editor').hidden);
      assert.equal(await stock(page, firstId), '27 tablets left');
      assert.match(await card.locator('.medication-dose-state').textContent(), /1 tablet recorded/);
      assert.match(await page.locator('#health-history').textContent(), /Taken · 1 tablet/);
      await page.getByRole('button', { name: 'Undo Morning example dose', exact: true }).click(); await waitStock(page, firstId, 28);
      await page.getByRole('button', { name: 'Mark Morning example taken' }).click(); await waitStock(page, firstId, 26);
      await card.getByRole('button', { name: 'Edit Morning example', exact: true }).click();
      await page.locator(`#medication-${firstId}-dose`).fill('0.5');
      await card.locator('.medication-editor .medication-dose-actions > button').first().click();
      await page.waitForFunction(() => document.querySelector('[data-medication="med-00000000-0000-4000-8000-000000000001"] .medication-editor').hidden);
      assert.equal(await stock(page, firstId), '26 tablets left');
      assert.match(await card.locator('.medication-dose-state').textContent(), /2 tablets recorded/);
      await page.getByRole('button', { name: 'Undo Morning example dose', exact: true }).click(); await waitStock(page, firstId, 28);
      await card.getByRole('button', { name: 'Edit Morning example', exact: true }).click();
      await page.locator(`#medication-${firstId}-stock`).fill('10'); await card.locator('.medication-editor .medication-dose-actions > button').first().click(); await waitStock(page, firstId, 10);
      await page.getByRole('button', { name: 'Mark Morning example taken' }).click(); await waitStock(page, firstId, 9.5);
      await closeHealth(page); await openHealth(page); assert.equal(await stock(page, firstId), '9.5 tablets left');
      assert.equal(await card.locator('h3').textContent(), 'Morning example');
      assert.match(await card.locator('.medication-schedule').textContent(), /0.5 tablets.*09:30/);
      assert.equal(await page.locator('#health-data-badge').textContent(), 'PRIVATE / YOUR ACCOUNT');
      await page.locator('#health-open-care').click();
      assert.match(await page.locator(`[data-dose="${firstId}"]`).locator('..').textContent(), /Morning example.*0.5 tablets recorded/);
      assert.equal(await page.locator('#routines-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('editing detects conflicting setup and stock while keeping unrelated new doses', async () => {
    const { context, page, errors } = await accountFixture(browser, { motion: 'reduce' });
    try {
      const other = await context.newPage(); await ready(page); await ready(other); await openHealth(page); await openHealth(other);
      const editor = p => p.locator('[data-medication="med-00000000-0000-4000-8000-000000000001"] .medication-editor');
      const edit = p => p.locator('[data-medication="med-00000000-0000-4000-8000-000000000001"] > .medication-heading .health-button');
      await edit(page).click(); await edit(other).click();
      await page.locator(`#medication-${firstId}-name`).fill('First example');
      await other.locator('#medication-med-00000000-0000-4000-8000-000000000001-name').fill('Second example');
      await editor(page).locator('.medication-dose-actions > button').first().click();
      await page.getByRole('heading', { name: 'First example', exact: true }).waitFor();
      await copyHealth(page, other);
      await other.waitForFunction(() => document.querySelector('[data-medication="med-00000000-0000-4000-8000-000000000001"] h3').textContent === 'First example');
      await editor(other).locator('.medication-dose-actions > button').first().click();
      await other.waitForFunction(() => document.getElementById('health-status').textContent.includes('Medication changed'));
      assert.equal(await other.locator('#medication-med-00000000-0000-4000-8000-000000000001-name').inputValue(), 'Second example');
      await editor(other).locator('.medication-dose-actions > button').last().click(); await edit(other).click();
      await other.locator('#medication-med-00000000-0000-4000-8000-000000000001-name').fill('Third example');
      await page.getByRole('button', { name: 'Mark First example taken' }).click(); await waitStock(page, firstId, 27);
      await copyHealth(page, other); await waitStock(other, firstId, 27);
      await editor(other).locator('.medication-dose-actions > button').first().click();
      await other.getByRole('heading', { name: 'Third example', exact: true }).waitFor();
      await copyHealth(other, page);
      await page.waitForFunction(() => document.querySelector('[data-medication="med-00000000-0000-4000-8000-000000000001"] h3').textContent === 'Third example');
      assert.equal(await stock(other, firstId), '27 tablets left');
      await edit(page).click(); await page.locator(`#medication-${firstId}-stock`).fill('15');
      await other.getByRole('button', { name: 'Add stock for Third example' }).click(); await waitStock(other, firstId, 57);
      await copyHealth(other, page); await waitStock(page, firstId, 57);
      await editor(page).locator('.medication-dose-actions > button').first().click();
      await page.waitForFunction(() => document.getElementById('health-status').textContent.includes('Stock changed'));
      assert.equal(await stock(page, firstId), '57 tablets left');
      assert.equal(await page.locator(`#medication-${firstId}-stock`).inputValue(), '15');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('invalid and failed edits preserve the draft, guard exit and save setup and stock atomically', async () => {
    const { context, page, errors } = await accountFixture(browser, { width: 320, motion: 'reduce' });
    try {
      await ready(page); await openHealth(page); await page.getByRole('button', { name: 'Edit Sample A', exact: true }).click();
      const editor = page.locator(`[data-medication="${firstId}"] .medication-editor`);
      const save = editor.locator('.medication-dose-actions > button').first();
      await page.locator(`#medication-${firstId}-dose`).fill('0'); await save.click();
      assert.equal(await page.locator(`#medication-${firstId}-dose`).evaluate(el => el.validity.valid), false);
      assert.equal(await page.evaluate(() => window.__hubFirebase.healthWrites.length), 0);
      await page.locator(`#medication-${firstId}-dose`).fill('2'); await page.locator(`#medication-${firstId}-name`).fill('Unsaved example'); await page.locator(`#medication-${firstId}-stock`).fill('7');
      await page.evaluate(() => { window.__hubFirebase.rejectWrites = true; });
      await save.click(); await page.waitForFunction(() => document.getElementById('health-status').textContent.includes('could not be saved'));
      assert.equal(await page.locator(`#medication-${firstId}-name`).inputValue(), 'Unsaved example');
      assert.equal(await stock(page, firstId), '28 tablets left');
      assert.equal(await page.evaluate(() => window.__hubFirebase.healthWrites.length), 0);
      assert.equal(await page.evaluate(() => !dispatchEvent(new Event('beforeunload', { cancelable: true }))), true);
      await page.keyboard.press('Control+k'); assert.equal(await page.locator('#command-dialog').evaluate(el => el.open), false);
      await page.keyboard.press('Escape'); assert.equal(await page.locator('#medication-discard-dialog').evaluate(el => el.open), true);
      await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
      assert.equal(await page.locator('#app-dialog').evaluate(el => el.open), true);
      await page.getByRole('button', { name: 'Close Health', exact: true }).click();
      assert.equal(await page.locator('#medication-discard-dialog').evaluate(el => el.open), true);
      await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
      assert.equal(await page.locator('#app-dialog').evaluate(el => el.open), false);
      await openHealth(page); assert.equal(await page.locator(`[data-medication="${firstId}"] h3`).textContent(), 'Sample A');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  const chooseLink = async (page, id, name) => {
    const picker = page.locator(`#medication-${id}-checklist-menu`);
    await picker.locator('.checklist-picker-toggle').click();
    await picker.getByRole('button', { name, exact: true }).click();
  };
  const newMedication = async (page, name, checklist) => {
    await page.locator('#health-add-medication').click();
    await page.locator('#medication-new-medication-name').fill(name);
    await page.locator('#medication-new-medication-dose').fill('2');
    await page.locator('#medication-new-medication-time').fill('21:00');
    await page.locator('#medication-new-medication-stock').fill('12');
    if (checklist) await chooseLink(page, 'new-medication', checklist);
    await page.getByRole('button', { name: 'Save new medication', exact: true }).click();
    await page.waitForFunction(name => [...document.querySelectorAll('#health-medications h3')].some(node => node.textContent === name), name);
    return page.locator('#health-medications .medication-card').filter({ has: page.getByRole('heading', { name, exact: true }) }).getAttribute('data-medication');
  };
  for (const width of [320, 390, 1440]) await t.test(`new medications link to one chosen checklist and can move without a second deduction at ${width}px`, async () => {
    const { context, page, errors } = await accountFixture(browser, { width, height: 800, motion: 'reduce' });
    try {
      await ready(page); await openHealth(page);
      const id = await newMedication(page, 'Evening example', 'Wind Down');
      const card = page.locator(`[data-medication="${id}"]`);
      assert.match(await card.locator('.medication-link-info').textContent(), /Linked to Wind Down/);
      assert.equal(await stock(page, id), '12 tablets left');
      await card.getByRole('button', { name: 'Open Wind Down for Evening example', exact: true }).click();
      assert.equal(await page.locator('#routine-name').textContent(), 'Wind Down');
      assert.equal(await page.locator(`[data-dose="${id}"]`).isVisible(), true);
      assert.equal(await page.locator(`[data-dose="${firstId}"]`).isVisible(), false);
      await page.locator(`[data-dose="${id}"]`).check(); await waitStock(page, id, 10);
      await page.locator('#medication-open-health').click();
      await card.getByRole('button', { name: 'Edit Evening example', exact: true }).click();
      await chooseLink(page, id, 'Workday');
      await card.locator('.medication-editor .medication-dose-actions > button').first().click();
      await page.waitForFunction(id => document.querySelector(`[data-medication="${id}"] .medication-editor`).hidden, id);
      assert.equal(await stock(page, id), '10 tablets left');
      await card.getByRole('button', { name: 'Open Workday for Evening example', exact: true }).click();
      assert.equal(await page.locator(`[data-dose="${id}"]`).isChecked(), true);
      await chooseRoutine(page, 'wind-down'); assert.equal(await page.locator(`[data-dose="${id}"]`).isVisible(), false);
      await page.locator('#routines-dialog').evaluate(dialog => dialog.close());
      await openHealth(page); assert.equal(await stock(page, id), '10 tablets left');
      assert.match(await card.locator('.medication-link-info').textContent(), /Linked to Workday/);
      assert.equal(await page.locator('#app-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('unlinked medications stay in Health and cancelled or failed additions keep saved data unchanged', async () => {
    const { context, page, errors } = await accountFixture(browser, { width: 390, motion: 'reduce' });
    try {
      await ready(page); await openHealth(page);
      await page.locator('#health-add-medication').click(); await page.locator('#medication-new-medication-name').fill('Discarded sample');
      await page.locator('#health-new-medication .medication-editor .medication-dose-actions > button').last().click();
      assert.equal(await page.locator('#health-medications .medication-card').count(), 2);
      const id = await newMedication(page, 'Unlinked example');
      const card = page.locator(`[data-medication="${id}"]`);
      assert.match(await card.locator('.medication-link-info').textContent(), /Not linked/);
      await page.locator('#health-open-care').click(); assert.equal(await page.locator(`[data-dose="${id}"]`).isVisible(), false);
      await page.locator('#medication-open-health').click(); await page.locator('#health-add-medication').click();
      await page.locator('#medication-new-medication-name').fill('Failed sample');
      await page.evaluate(() => { window.__hubFirebase.rejectWrites = true; });
      await page.getByRole('button', { name: 'Save new medication', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('health-status').textContent.includes('could not be saved'));
      assert.equal(await page.locator('#health-medications .medication-card').count(), 3);
      assert.equal(await page.locator('#medication-new-medication-name').inputValue(), 'Failed sample');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('links follow renamed checklist IDs, can be cleared, and the themed picker supports keyboard selection', async () => {
    const { context, page, errors } = await accountFixture(browser, { motion: 'reduce' });
    try {
      await ready(page); await openHealth(page); const id = await newMedication(page, 'Linked example', 'Workday');
      const card = page.locator(`[data-medication="${id}"]`);
      await card.getByRole('button', { name: 'Open Workday for Linked example', exact: true }).click();
      await page.locator('#control-launch').click(); await page.getByLabel('Checklist name', { exact: true }).fill('Renamed work');
      await page.locator('#editor-save').click(); await page.waitForFunction(() => document.getElementById('control-status').textContent.startsWith('Saved.'));
      await page.locator('#control-close').click(); await page.locator('#medication-open-health').click();
      assert.match(await card.locator('.medication-link-info').textContent(), /Linked to Renamed work/);
      await card.getByRole('button', { name: 'Edit Linked example', exact: true }).click();
      const toggle = page.locator(`#medication-${id}-checklist-menu .checklist-picker-toggle`);
      await toggle.focus(); await page.keyboard.press('Home'); await page.keyboard.press('Enter');
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      assert.equal(await card.locator('.medication-editor').isVisible(), true);
      await card.locator('.medication-editor .medication-dose-actions > button').first().click();
      await page.waitForFunction(id => document.querySelector(`[data-medication="${id}"] .medication-editor`).hidden, id);
      assert.match(await card.locator('.medication-link-info').textContent(), /Not linked/);
      assert.equal(await stock(page, id), '12 tablets left');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('switching accounts clears linked records and drafts even with identical checklist IDs', async () => {
    const { context, page, errors } = await fixture(browser, { motion: 'reduce', firebase: true, cloudDocuments: { 'account-a': makeAccount(), 'account-b': makeAccount() } });
    try {
      await ready(page); await openHealth(page);
      const id = await newMedication(page, 'Account linked example', 'Workday');
      const card = page.locator(`[data-medication="${id}"]`);
      await card.getByRole('button', { name: 'Edit Account linked example', exact: true }).click();
      await page.locator(`#medication-${id}-name`).fill('Unsaved account example');
      await page.evaluate(() => {
        const service = window.__hubFirebase;
        service.user = { uid: 'account-b', email: 'other@example.invalid' };
        service.authListener(service.user);
      });
      await card.waitFor({ state: 'detached' });
      assert.equal(await page.locator('#health-empty').isVisible(), true);
      await page.locator('#health-open-care').click(); await chooseRoutine(page, 'workday');
      assert.equal(await page.locator(`[data-dose="${id}"]`).count(), 0);
      assert.equal(await page.evaluate(() => window.__hubFirebase.docs['account-b'].health), undefined);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('account Health syncs a linked dose, rejects duplicate deductions and keeps accounts separate', async () => {
    const account = () => ({ routines: JSON.parse(demo), progress: { checks: {}, optional: {} } });
    const first = await fixture(browser, { motion: 'reduce', firebase: true, cloudDocuments: { 'account-a': account(), 'account-b': account() } });
    let second;
    const waitSync = page => page.waitForFunction(() => document.getElementById('health-sync-status').textContent === 'Synced to your account.');
    try {
      const { page } = first;
      await ready(page);
      await openHealth(page);
      await waitSync(page);
      assert.equal(await page.locator('#health-empty').isVisible(), true);
      assert.equal(await page.locator(`[data-medication="${firstId}"]`).count(), 0);
      const id = await newMedication(page, 'Private example', 'Workday');
      await waitStock(page, id, 12);
      const documents = await page.evaluate(() => structuredClone(window.__hubFirebase.docs));
      second = await fixture(browser, { motion: 'reduce', firebase: true, cloudDocuments: documents });
      await ready(second.page);
      await openHealth(second.page);
      await waitStock(second.page, id, 12);

      await page.getByRole('button', { name: 'Mark Private example taken' }).click();
      await waitStock(page, id, 10);
      const remote = await page.evaluate(() => structuredClone(window.__hubFirebase.docs['account-a'].health));
      await second.page.evaluate(health => { window.__hubFirebase.docs['account-a'].health = health; }, remote);
      // The second screen still shows the pre-dose snapshot, but its transaction reads the current ledger.
      await second.page.getByRole('button', { name: 'Mark Private example taken' }).click();
      await waitStock(second.page, id, 10);
      assert.equal(await second.page.evaluate(() => window.__hubFirebase.healthWrites.length), 0);
      assert.equal(await second.page.locator('#health-today').textContent(), '1 of 1 taken');

      await second.page.locator('#health-open-care').click();
      await chooseRoutine(second.page, 'workday');
      assert.equal(await second.page.locator(`[data-dose="${id}"]`).isChecked(), true);
      await second.page.locator(`[data-dose="${id}"]`).uncheck();
      await waitStock(second.page, id, 12);
      const undone = await second.page.evaluate(() => structuredClone(window.__hubFirebase.docs['account-a'].health));
      await page.evaluate(health => { window.__hubFirebase.docs['account-a'].health = health; window.__hubFirebase.publish(); }, undone);
      await waitStock(page, id, 12);

      await second.page.evaluate(() => {
        const service = window.__hubFirebase;
        service.user = { uid: 'account-b', email: 'other@example.invalid' };
        service.authListener(service.user);
      });
      assert.equal(await second.page.locator(`[data-medication="${id}"]`).count(), 0);
      assert.equal(await second.page.locator(`[data-dose="${id}"]`).count(), 0);
      assert.deepEqual(first.errors.concat(second.errors), []);
    } finally { await first.context.close(); await second?.context.close(); }
  });

  await t.test('a new Lisbon day permits a new dose without replenishing stock or losing history', async () => {
    const { context, page } = await accountFixture(browser, { motion: 'reduce' });
    try {
      await page.clock.install({ time: new Date('2026-06-06T22:59:00Z') });
      await ready(page); await openRoutines(page);
      await page.locator(`[data-dose="${firstId}"]`).check(); await waitStock(page, firstId, 27);
      await page.clock.setSystemTime(new Date('2026-06-06T23:01:00Z'));
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      assert.equal(await page.locator(`[data-dose="${firstId}"]`).isChecked(), false);
      await page.locator(`[data-dose="${firstId}"]`).check(); await waitStock(page, firstId, 26);
      await page.locator('#medication-open-health').click();
      assert.equal(await page.locator('#health-history li').count(), 4);
      await page.getByRole('button', { name: 'Undo Sample A dose for 2026-06-06', exact: true }).click(); await waitStock(page, firstId, 27);
      await closeHealth(page); assert.equal(await page.locator(`[data-dose="${firstId}"]`).isChecked(), true);
    } finally { await context.close(); }
  });

  await t.test('empty stock blocks another dose, while restocking restores availability', async () => {
    const dates = Array.from({ length: 5 }, (_, index) => `2020-01-0${index + 1}`);
    const { context, page } = await accountFixture(browser, { motion: 'reduce' }, seededHealth([], dates));
    try {
      await ready(page); await openHealth(page);
      assert.equal(await stock(page, secondId), '0 tablets left');
      assert.equal(await page.getByRole('button', { name: 'Mark Sample B taken' }).isDisabled(), true);
      await page.locator(`#restock-${secondId}`).fill('2'); await page.getByRole('button', { name: 'Add stock for Sample B' }).click(); await waitStock(page, secondId, 2);
      await page.getByRole('button', { name: 'Mark Sample B taken' }).click(); await waitStock(page, secondId, 0);
      assert.equal(await page.getByRole('button', { name: 'Mark Sample B taken' }).isDisabled(), true);
    } finally { await context.close(); }
  });

  await t.test('account Health keeps routine periods and stock-only items across reloads', async () => {
    const { context, page, errors } = await fixture(browser, {
      width: 390, motion: 'reduce', firebase: true,
      cloudDocuments: { 'account-a': { routines: JSON.parse(demo), progress: { checks: {}, optional: {} } } }
    });
    try {
      await ready(page); await openHealth(page);
      await page.waitForFunction(() => document.getElementById('health-sync-status').textContent === 'Synced to your account.');
      for (const [name, schedule, title, checklist] of [
        ['Morning example', 'morning', 'Morning', 'Personal Care'],
        ['Bedtime example', 'bedtime', 'Before bed', 'Wind Down'],
        ['Stock example', 'as-needed', 'As needed', null]
      ]) {
        await page.locator('#health-add-medication').click();
        await page.locator('#medication-new-medication-name').fill(name);
        await page.locator('#medication-new-medication-schedule').selectOption(schedule);
        assert.equal(await page.locator('#medication-new-medication-time').isVisible(), false);
        assert.equal(await page.locator('#medication-new-medication-dose').isVisible(), Boolean(checklist));
        await page.locator('#medication-new-medication-stock').fill('12');
        await page.locator('#medication-new-medication-pack').fill('24');
        if (checklist) {
          await page.locator('#medication-new-medication-checklist-menu .checklist-picker-toggle').click();
          await page.getByRole('button', { name: checklist, exact: true }).click();
        }
        await page.getByRole('button', { name: 'Save new medication' }).click();
        const card = page.locator('#health-medications .medication-card').filter({ has: page.getByRole('heading', { name, exact: true }) });
        await card.waitFor();
        assert.ok((await card.locator('.medication-schedule').textContent()).includes(title));
        assert.ok((await card.textContent()).includes('Pack of 24'));
        assert.equal(await card.getByRole('button', { name: `Mark ${name} taken` }).isVisible(), Boolean(checklist));
      }
      assert.equal(await page.locator('#health-today').textContent(), '0 of 2 taken');
      const stockCard = page.locator('#health-medications .medication-card').filter({ has: page.getByRole('heading', { name: 'Stock example' }) });
      assert.equal(await stockCard.locator('.medication-stock').textContent(), '12 units left');
      await closeHealth(page);
      await openRoutines(page);
      const dose = page.getByRole('checkbox', { name: /Take Morning example/ });
      await dose.check();
      await page.waitForFunction(() => document.getElementById('medication-today').textContent === '1 of 1 doses recorded today');
      await chooseRoutine(page, 'wind-down');
      assert.equal(await page.getByRole('checkbox', { name: /Take Bedtime example/ }).isVisible(), true);
      assert.equal(await page.getByRole('checkbox', { name: /Take Stock example/ }).isVisible(), false);
      const documents = await page.evaluate(() => structuredClone(window.__hubFirebase.docs));
      const second = await fixture(browser, { motion: 'reduce', firebase: true, cloudDocuments: documents });
      try {
        await ready(second.page); await openHealth(second.page);
        await second.page.waitForFunction(() => document.getElementById('health-today').textContent === '1 of 2 taken');
        const stockOnly = second.page.locator('#health-medications .medication-card').filter({ has: second.page.getByRole('heading', { name: 'Stock example' }) });
        assert.equal(await stockOnly.locator('.medication-stock').textContent(), '12 units left');
        assert.deepEqual(second.errors, []);
      } finally { await second.context.close(); }
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('signed-out Health asks for sign-in and never reads demo storage', async () => {
    const { context, page, errors } = await fixture(browser, { motion: 'reduce', width: 390 });
    try {
      await context.addInitScript(() => localStorage.setItem('thehub:health-demo:v1:settings:sample-a', '{broken'));
      await ready(page); await openHealth(page);
      assert.equal(await page.getByRole('button', { name: 'Sign in', exact: true }).isVisible(), true);
      assert.equal(await page.locator('#health-account-content').isVisible(), false);
      assert.equal(await page.locator('#medication-checks input').count(), 0);
      await closeHealth(page);
      assert.equal(await page.evaluate(() => localStorage.getItem('thehub:health-demo:v1:settings:sample-a')), '{broken');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('imports a private list in one transaction, reports missing links and skips repeats', async () => {
    const { context, page, errors } = await accountFixture(browser, { width: 320, motion: 'reduce' }, {});
    try {
      await ready(page); await openHealth(page);
      const items = [
        { name: 'Morning example', schedule: 'morning', quantity: 1, stock: 15, packSize: 20, linkedChecklist: 'Getting Ready' },
        { name: 'Bedtime example', schedule: 'bedtime', quantity: 1, stock: 17, linkedChecklist: 'Missing checklist' },
        { name: 'Stock example', schedule: 'as-needed', quantity: null, stock: 12 }
      ];
      const textarea = page.locator('#health-import-text');
      const save = page.locator('#health-import-save');
      const result = page.locator('#health-import-status');
      const payload = JSON.stringify({ version: 1, medications: items });
      await page.getByText('Import medication list', { exact: true }).click();
      await textarea.fill(JSON.stringify({ version: 1, medications: [items[0], items[0]] }));
      await save.click();
      assert.match(await result.textContent(), /unique name/);
      assert.equal(await page.evaluate(() => window.__hubFirebase.healthWrites.length), 0);
      await textarea.fill(payload);
      await page.evaluate(() => { window.__hubFirebase.rejectWrites = true; });
      await save.click();
      await page.waitForFunction(() => document.querySelector('#health-import-status').textContent.includes('could not be saved'));
      assert.equal(await textarea.inputValue(), payload);
      assert.equal(await page.evaluate(() => window.__hubFirebase.healthWrites.length), 0);
      await page.evaluate(() => { window.__hubFirebase.rejectWrites = false; });
      await save.click();
      await page.waitForFunction(() => document.querySelector('#health-import-status').textContent.includes('Added 3'));
      assert.match(await result.textContent(), /Checklists to link: Missing checklist/);
      assert.equal(await page.locator('#health-today').textContent(), '0 of 2 taken');
      assert.equal(await page.evaluate(() => window.__hubFirebase.healthWrites.length), 3);
      const morning = page.locator('#health-medications .medication-card').filter({ has: page.getByRole('heading', { name: 'Morning example', exact: true }) });
      assert.match(await morning.locator('.medication-link-info').textContent(), /Linked to Getting Ready/);
      await morning.getByRole('button', { name: 'Mark Morning example taken', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('#health-today').textContent === '1 of 2 taken');
      await textarea.fill(payload);
      await save.click();
      await page.waitForFunction(() => document.querySelector('#health-import-status').textContent.includes('3 already'));
      assert.equal(await morning.locator('.medication-stock').textContent(), '14 tablets left');
      assert.equal(await page.evaluate(() => window.__hubFirebase.healthWrites.length), 4);
      assert.equal(await page.locator('#app-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('blocked account writes and unreadable records leave stored stock unchanged', async () => {
    const { context, page, errors } = await accountFixture(browser, { motion: 'reduce' });
    try {
      await ready(page); await openRoutines(page);
      const before = await page.evaluate(() => JSON.stringify(window.__hubFirebase.docs['account-a'].health));
      await page.evaluate(() => { window.__hubFirebase.rejectWrites = true; });
      const check = page.locator(`[data-dose="${firstId}"]`);
      await check.click();
      await page.waitForFunction(() => document.getElementById('medication-status').textContent.includes('could not be saved'));
      assert.equal(await check.isChecked(), false);
      assert.equal(await page.evaluate(() => JSON.stringify(window.__hubFirebase.docs['account-a'].health)), before);
      await page.locator('#medication-open-health').click();
      assert.equal(await stock(page, firstId), '28 tablets left');
      await page.evaluate(id => {
        const service = window.__hubFirebase;
        service.docs['account-a'].health[id].payload = '{broken';
        service.publish();
      }, firstId);
      assert.match(await page.locator('#health-sync-status').textContent(), /could not be read/);
      assert.equal(await page.locator('#health-add-medication').isDisabled(), true);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
});
