const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { fixture, ready, openRoutines, chooseRoutine, demo } = require('./browser-fixture.cjs');
const stock = (page, id) => page.locator(`[data-medication="${id}"] .medication-stock`).textContent();
const waitStock = (page, id, value) => page.waitForFunction(({ id, value }) => document.querySelector(`[data-medication="${id}"] .medication-stock`).textContent === `${value} tablets left`, { id, value });
const openHealth = page => page.locator('.app[data-icon="health"]').click();
const closeHealth = page => page.getByRole('button', { name: 'Close Health', exact: true }).click();

test('Health medication demo', { timeout: 150000 }, async t => {
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
      await page.getByRole('button', { name: 'Open Personal Care for Sample B', exact: true }).click();
      assert.equal(await page.locator('#routines-dialog').evaluate(el => el.open), true);
      assert.equal(await page.locator('#routine-name').textContent(), 'Personal Care');
      assert.equal(await page.locator('[data-dose="sample-b"]').isChecked(), true);
      assert.equal(await page.locator('#routines-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('thehub:routines:demo:v1')));
      assert.equal(Object.keys(saved.checks).some(key => key.includes('sample-')), false);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  for (const width of [320, 390, 1440]) await t.test(`editing medication keeps historical quantities and updates linked checks at ${width}px`, async () => {
    const { context, page, errors } = await fixture(browser, { width, motion: 'reduce' });
    try {
      await page.clock.install({ time: new Date('2026-11-06T12:00:00Z') });
      await context.addInitScript(() => { const key = 'thehub:health-demo:v1:dose:2026-11-06:sample-a'; if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, type: 'dose', medication: 'sample-a', date: '2026-11-06', taken: true, at: 1 })); });
      await ready(page); await openHealth(page); await waitStock(page, 'sample-a', 27);
      const card = page.locator('[data-medication="sample-a"]');
      await card.getByRole('button', { name: 'Edit Sample A', exact: true }).click();
      assert.equal(await card.locator('.medication-editor .medication-dose-actions > button').first().isDisabled(), true);
      await page.locator('#medication-sample-a-name').fill('Morning example');
      await page.locator('#medication-sample-a-dose').fill('2');
      await page.locator('#medication-sample-a-time').fill('09:30');
      await card.locator('.medication-editor .medication-dose-actions > button').first().click();
      await page.waitForFunction(() => document.querySelector('[data-medication="sample-a"] .medication-editor').hidden);
      assert.equal(await stock(page, 'sample-a'), '27 tablets left');
      assert.match(await card.locator('.medication-dose-state').textContent(), /1 tablet recorded/);
      assert.match(await page.locator('#health-history').textContent(), /Taken · 1 tablet/);
      await page.getByRole('button', { name: 'Undo Morning example dose', exact: true }).click(); await waitStock(page, 'sample-a', 28);
      await page.getByRole('button', { name: 'Mark Morning example taken' }).click(); await waitStock(page, 'sample-a', 26);
      await card.getByRole('button', { name: 'Edit Morning example', exact: true }).click();
      await page.locator('#medication-sample-a-dose').fill('0.5');
      await card.locator('.medication-editor .medication-dose-actions > button').first().click();
      await page.waitForFunction(() => document.querySelector('[data-medication="sample-a"] .medication-editor').hidden);
      assert.equal(await stock(page, 'sample-a'), '26 tablets left');
      assert.match(await card.locator('.medication-dose-state').textContent(), /2 tablets recorded/);
      await page.getByRole('button', { name: 'Undo Morning example dose', exact: true }).click(); await waitStock(page, 'sample-a', 28);
      await card.getByRole('button', { name: 'Edit Morning example', exact: true }).click();
      await page.locator('#medication-sample-a-stock').fill('10'); await card.locator('.medication-editor .medication-dose-actions > button').first().click(); await waitStock(page, 'sample-a', 10);
      await page.getByRole('button', { name: 'Mark Morning example taken' }).click(); await waitStock(page, 'sample-a', 9.5);
      await ready(page); await openHealth(page); assert.equal(await stock(page, 'sample-a'), '9.5 tablets left');
      assert.equal(await card.locator('h3').textContent(), 'Morning example');
      assert.match(await card.locator('.medication-schedule').textContent(), /0.5 tablets.*09:30/);
      assert.match(await page.locator('#health-data-badge').textContent(), /CUSTOM DEMO/);
      await page.locator('#health-open-care').click();
      assert.match(await page.locator('[data-dose="sample-a"]').locator('..').textContent(), /Morning example.*0.5 tablets recorded/);
      assert.equal(await page.locator('#routines-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('editing detects conflicting setup and stock while keeping unrelated new doses', async () => {
    const { context, page, errors } = await fixture(browser, { motion: 'reduce' });
    try {
      const other = await context.newPage(); await ready(page); await ready(other); await openHealth(page); await openHealth(other);
      const editor = p => p.locator('[data-medication="sample-a"] .medication-editor');
      const edit = p => p.locator('[data-medication="sample-a"] > .medication-heading .health-button');
      await edit(page).click(); await edit(other).click();
      await page.locator('#medication-sample-a-name').fill('First example');
      await other.locator('#medication-sample-a-name').fill('Second example');
      await editor(page).locator('.medication-dose-actions > button').first().click();
      await other.waitForFunction(() => document.querySelector('[data-medication="sample-a"] h3').textContent === 'First example');
      await editor(other).locator('.medication-dose-actions > button').first().click();
      await other.waitForFunction(() => document.getElementById('health-status').textContent.includes('Medication changed'));
      assert.equal(await other.locator('#medication-sample-a-name').inputValue(), 'Second example');
      await editor(other).locator('.medication-dose-actions > button').last().click(); await edit(other).click();
      await other.locator('#medication-sample-a-name').fill('Third example');
      await page.getByRole('button', { name: 'Mark First example taken' }).click(); await waitStock(other, 'sample-a', 27);
      await editor(other).locator('.medication-dose-actions > button').first().click();
      await page.waitForFunction(() => document.querySelector('[data-medication="sample-a"] h3').textContent === 'Third example');
      assert.equal(await stock(other, 'sample-a'), '27 tablets left');
      await edit(page).click(); await page.locator('#medication-sample-a-stock').fill('15');
      await other.getByRole('button', { name: 'Add stock for Third example' }).click(); await waitStock(page, 'sample-a', 57);
      await editor(page).locator('.medication-dose-actions > button').first().click();
      await page.waitForFunction(() => document.getElementById('health-status').textContent.includes('Stock changed'));
      assert.equal(await stock(page, 'sample-a'), '57 tablets left');
      assert.equal(await page.locator('#medication-sample-a-stock').inputValue(), '15');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('invalid and failed edits preserve the draft, guard exit and save setup and stock atomically', async () => {
    const { context, page, errors } = await fixture(browser, { width: 320, motion: 'reduce' });
    try {
      await ready(page); await openHealth(page); await page.getByRole('button', { name: 'Edit Sample A', exact: true }).click();
      const editor = page.locator('[data-medication="sample-a"] .medication-editor');
      const save = editor.locator('.medication-dose-actions > button').first();
      await page.locator('#medication-sample-a-dose').fill('0'); await save.click();
      assert.equal(await page.locator('#medication-sample-a-dose').evaluate(el => el.validity.valid), false);
      assert.equal(await page.evaluate(() => localStorage.getItem('thehub:health-demo:v1:settings:sample-a')), null);
      await page.locator('#medication-sample-a-dose').fill('2'); await page.locator('#medication-sample-a-name').fill('Unsaved example'); await page.locator('#medication-sample-a-stock').fill('7');
      await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key.includes('health-demo:v1:settings:')) throw new Error('Full'); return original.call(this, key, value); }; });
      await save.click(); await page.waitForFunction(() => document.getElementById('health-status').textContent.includes('could not be saved'));
      assert.equal(await page.locator('#medication-sample-a-name').inputValue(), 'Unsaved example');
      assert.equal(await stock(page, 'sample-a'), '28 tablets left');
      assert.equal(await page.evaluate(() => localStorage.getItem('thehub:health-demo:v1:settings:sample-a')), null);
      assert.equal(await page.evaluate(() => !dispatchEvent(new Event('beforeunload', { cancelable: true }))), true);
      await page.keyboard.press('Control+k'); assert.equal(await page.locator('#command-dialog').evaluate(el => el.open), false);
      await page.keyboard.press('Escape'); assert.equal(await page.locator('#medication-discard-dialog').evaluate(el => el.open), true);
      await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
      assert.equal(await page.locator('#app-dialog').evaluate(el => el.open), true);
      await page.getByRole('button', { name: 'Close Health', exact: true }).click();
      assert.equal(await page.locator('#medication-discard-dialog').evaluate(el => el.open), true);
      await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
      assert.equal(await page.locator('#app-dialog').evaluate(el => el.open), false);
      await openHealth(page); assert.equal(await page.locator('[data-medication="sample-a"] h3').textContent(), 'Sample A');
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
    const { context, page, errors } = await fixture(browser, { width, height: 800, motion: 'reduce' });
    try {
      await ready(page); await openHealth(page);
      const id = await newMedication(page, 'Evening example', 'Wind Down');
      const card = page.locator(`[data-medication="${id}"]`);
      assert.match(await card.locator('.medication-link-info').textContent(), /Linked to Wind Down/);
      assert.equal(await stock(page, id), '12 tablets left');
      await card.getByRole('button', { name: 'Open Wind Down for Evening example', exact: true }).click();
      assert.equal(await page.locator('#routine-name').textContent(), 'Wind Down');
      assert.equal(await page.locator(`[data-dose="${id}"]`).isVisible(), true);
      assert.equal(await page.locator('[data-dose="sample-a"]').isVisible(), false);
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
      await ready(page); await openHealth(page); assert.equal(await stock(page, id), '10 tablets left');
      assert.match(await card.locator('.medication-link-info').textContent(), /Linked to Workday/);
      assert.equal(await page.locator('#app-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('unlinked medications stay in Health and cancelled or failed additions keep saved data unchanged', async () => {
    const { context, page, errors } = await fixture(browser, { width: 390, motion: 'reduce' });
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
      await page.evaluate(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key.includes('health-demo:v1:settings:med-')) throw new Error('Full'); return set.call(this, key, value); }; });
      await page.getByRole('button', { name: 'Save new medication', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('health-status').textContent.includes('could not be saved'));
      assert.equal(await page.locator('#health-medications .medication-card').count(), 3);
      assert.equal(await page.locator('#medication-new-medication-name').inputValue(), 'Failed sample');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('links follow renamed checklist IDs, can be cleared, and the themed picker supports keyboard selection', async () => {
    const { context, page, errors } = await fixture(browser, { motion: 'reduce' });
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

  await t.test('account-scoped links do not attach medication to another account with the same checklist IDs', async () => {
    const account = () => ({ routines: JSON.parse(demo), progress: { checks: {}, optional: {} } });
    const { context, page, errors } = await fixture(browser, { motion: 'reduce', firebase: true, cloudDocuments: { 'account-a': account(), 'account-b': account() } });
    try {
      await ready(page); await page.waitForFunction(() => document.getElementById('routines-dialog').dataset.source === 'account');
      const original = await page.evaluate(() => JSON.stringify(window.__hubFirebase.docs));
      await openHealth(page); const id = await newMedication(page, 'Account linked example', 'Workday');
      const card = page.locator(`[data-medication="${id}"]`);
      const switchAccount = uid => page.evaluate(uid => { const service = window.__hubFirebase; service.user = { uid, email: uid + '@example.invalid' }; service.authListener(service.user); }, uid);
      await switchAccount('account-b'); await page.waitForFunction(id => document.querySelector(`[data-medication="${id}"] .medication-link-info`).textContent.includes('unavailable'), id);
      await page.locator('#health-open-care').click(); await chooseRoutine(page, 'workday'); assert.equal(await page.locator(`[data-dose="${id}"]`).isVisible(), false);
      await switchAccount('account-a'); await page.waitForFunction(() => document.getElementById('routine-name').textContent === 'Personal Care');
      await chooseRoutine(page, 'workday'); assert.equal(await page.locator(`[data-dose="${id}"]`).isVisible(), true);
      await page.locator(`[data-dose="${id}"]`).check(); await waitStock(page, id, 10);
      await page.locator('#medication-open-health').click();
      await card.getByRole('button', { name: 'Edit Account linked example', exact: true }).click();
      await page.locator(`#medication-${id}-name`).fill('Unsaved account example');
      await card.getByRole('button', { name: 'Open Workday for Account linked example', exact: true }).click();
      assert.equal(await page.locator('#medication-discard-dialog').evaluate(el => el.open), true);
      await switchAccount('account-b');
      await page.waitForFunction(id => document.querySelector(`[data-medication="${id}"] .medication-link-info`).textContent.includes('unavailable'), id);
      await page.locator('#medication-discard-confirm').click();
      assert.equal(await page.locator('#app-dialog').evaluate(el => el.open), true);
      assert.match(await page.locator('#health-status').textContent(), /workspace changed/);
      assert.equal(await page.evaluate(() => JSON.stringify(window.__hubFirebase.docs)), original);
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
