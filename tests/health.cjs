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
  await t.test('Morning Routine shows linked doses in order independently of the Health cards', async () => {
    const account = makeAccount();
    account.routines.routines[0].name = 'Morning Routine';
    const health = seededHealth();
    for (const [id, name] of [[firstId, 'Memory example'], [secondId, 'Omega-3 example']]) {
      const [settings] = JSON.parse(health[id].payload);
      settings.name = name;
      health[id].payload = JSON.stringify([settings]);
    }
    const { context, page } = await fixture(browser, {
      width: 390, mobile: true, motion: 'reduce', firebase: true, cloudDocuments: { 'account-a': { ...account, health } }
    });
    try {
      await ready(page);
      await openRoutines(page);
      await page.locator('#medication-checks .medication-row').first().waitFor();
      assert.deepEqual(await page.locator('#medication-checks .medication-row strong').allTextContents(), ['Take Omega-3 example', 'Take Memory example']);
      await page.locator('#medication-open-health').click();
      assert.deepEqual(await page.locator('#health-medications [data-medication]').evaluateAll(cards => cards.map(card => card.dataset.medication)), [firstId, secondId]);
    } finally { await context.close(); }
  });
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
      await page.getByRole('button', { name: 'Add stock for Sample B' }).click();
      await restock.fill('5');
      await page.keyboard.down('Enter'); await waitStock(page, secondId, 13);
      assert.equal(await restock.isVisible(), false);
      await page.keyboard.down('Enter'); await page.keyboard.up('Enter');
      assert.equal(await stock(page, secondId), '13 tablets left');
      assert.equal(await restock.isVisible(), false);
      await page.getByRole('button', { name: 'Add stock for Sample B' }).click();
      await page.locator(`#restock-${secondId}`).fill('-1'); await page.getByRole('button', { name: 'Save stock for Sample B' }).click();
      assert.equal(await stock(page, secondId), '13 tablets left');
      await page.getByRole('button', { name: 'Cancel stock addition for Sample B' }).click();
      assert.equal(await restock.isVisible(), false);
      await page.getByRole('tab', { name: 'Activity' }).click();
      await page.getByRole('button', { name: 'Undo stock addition for Sample B' }).click();
      await waitStock(page, secondId, 8);
      await page.getByRole('tab', { name: 'Today' }).click();
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
      assert.match(await card.locator('.medication-schedule').textContent(), /09:30.*0\.5 tablets/);
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
      const edit = p => p.locator(`[data-medication="${firstId}"]`).getByRole('button', { name: /^Edit / });
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
      await other.getByRole('button', { name: 'Add stock for Third example' }).click();
      await other.getByRole('button', { name: 'Save stock for Third example' }).click(); await waitStock(other, firstId, 57);
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
      assert.equal(await card.locator('.medication-checklist-link .medication-checklist-name').textContent(), 'Wind Down');
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
      assert.equal(await card.locator('.medication-checklist-link .medication-checklist-name').textContent(), 'Workday');
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
      assert.match(await card.locator('.medication-link-info').textContent(), /No linked checklist/);
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
      assert.equal(await card.locator('.medication-checklist-link .medication-checklist-name').textContent(), 'Renamed work');
      await card.getByRole('button', { name: 'Edit Linked example', exact: true }).click();
      const toggle = page.locator(`#medication-${id}-checklist-menu .checklist-picker-toggle`);
      await toggle.focus(); await page.keyboard.press('Home'); await page.keyboard.press('Enter');
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      assert.equal(await card.locator('.medication-editor').isVisible(), true);
      await card.locator('.medication-editor .medication-dose-actions > button').first().click();
      await page.waitForFunction(id => document.querySelector(`[data-medication="${id}"] .medication-editor`).hidden, id);
      assert.match(await card.locator('.medication-link-info').textContent(), /No linked checklist/);
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
      const today = page.getByRole('tab', { name: 'Today' });
      assert.equal(await today.getAttribute('aria-selected'), 'true');
      assert.equal(await page.getByRole('heading', { name: 'Recent activity' }).isVisible(), false);
      await today.focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.getByRole('tab', { name: 'Activity' }).getAttribute('aria-selected'), 'true');
      assert.equal(await page.locator('#health-medications').isVisible(), false);
      assert.equal(await page.locator('#health-history li').count(), 4);
      await page.getByRole('button', { name: 'Undo Sample A dose for 2026-06-06', exact: true }).click(); await waitStock(page, firstId, 27);
      await closeHealth(page); assert.equal(await page.locator(`[data-dose="${firstId}"]`).isChecked(), true);
    } finally { await context.close(); }
  });

  await t.test('card order saves through dragging, keyboard and touch and syncs to another device', async () => {
    const first = await accountFixture(browser, { width: 1440, motion: 'reduce' });
    let second;
    const order = page => page.locator('#health-medications h3').allTextContents();
    try {
      await ready(first.page); await openHealth(first.page);
      const source = first.page.getByRole('heading', { name: 'Sample A', exact: true });
      const target = first.page.getByRole('heading', { name: 'Sample B', exact: true });
      assert.deepEqual(await order(first.page), ['Sample A', 'Sample B']);
      const sourceBox = await source.boundingBox();
      const targetBox = await target.boundingBox();
      await first.page.mouse.move(sourceBox.x + 10, sourceBox.y + 10);
      await first.page.mouse.down();
      await first.page.mouse.move(targetBox.x + 10, targetBox.y + 10, { steps: 8 });
      await first.page.locator('.medication-drag-preview').waitFor({ state: 'visible' });
      await first.page.mouse.up();
      await first.page.locator('#health-status').filter({ hasText: 'Medication order saved.' }).waitFor();
      assert.deepEqual(await order(first.page), ['Sample B', 'Sample A']);
      assert.equal(await stock(first.page, firstId), '28 tablets left');
      const docs = await first.page.evaluate(() => structuredClone(window.__hubFirebase.docs));
      second = await fixture(browser, { width: 390, height: 900, mobile: true, motion: 'reduce', firebase: true, cloudDocuments: docs });
      await ready(second.page); await second.page.locator('#phone-health').click();
      assert.deepEqual(await order(second.page), ['Sample B', 'Sample A']);
      const secondGrip = second.page.getByRole('button', { name: /Reorder Sample A/ });
      await secondGrip.press('ArrowUp');
      await second.page.getByRole('button', { name: 'Reorder Sample A, position 1 of 2' }).waitFor();
      assert.deepEqual(await order(second.page), ['Sample A', 'Sample B']);
      const touch = await second.context.newCDPSession(second.page);
      const start = await second.page.getByRole('heading', { name: 'Sample A', exact: true }).boundingBox();
      const end = await second.page.getByRole('heading', { name: 'Sample B', exact: true }).boundingBox();
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x + 10, y: start.y + 10 }] });
      await second.page.locator('.medication-drag-preview').waitFor({ state: 'visible' });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: end.x + 10, y: end.y + 10 }] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await second.page.getByRole('button', { name: 'Reorder Sample B, position 1 of 2' }).waitFor();
      assert.deepEqual(await order(second.page), ['Sample B', 'Sample A']);
      const moveB = second.page.getByRole('button', { name: /Reorder Sample B/ });
      assert.equal(await moveB.evaluate(button => button.getBoundingClientRect().width), 1, 'Move stays hidden until keyboard focus');
      await moveB.focus(); await second.page.keyboard.press('Enter');
      assert.equal(await moveB.getAttribute('aria-pressed'), 'true');
      await secondGrip.focus(); await second.page.keyboard.press('Enter');
      await second.page.getByRole('button', { name: 'Reorder Sample A, position 1 of 2' }).waitFor();
      assert.equal(await second.page.locator('#app-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true);
      assert.deepEqual(first.errors.concat(second.errors), []);
    } finally { await first.context.close(); await second?.context.close(); }
  });

  await t.test('Addiction Helper counts daily habits and shares lozenge records with Health', async () => {
    const records = seededHealth();
    const entries = JSON.parse(records[firstId].payload);
    Object.assign(entries[0], { name: 'Nicotine Lozenges', time: 'as-needed', quantity: null, link: null, adjustment: 2 });
    records[firstId].payload = JSON.stringify(entries);
    const { context, page, errors } = await accountFixture(browser, { width: 390, mobile: true, motion: 'reduce' }, records);
    try {
      await page.clock.setFixedTime(new Date('2026-07-10T22:59:00Z'));
      await ready(page);
      await page.locator('#phone-addiction').tap();
      const logCoffee = page.getByRole('button', { name: 'Log coffee', exact: true });
      for (let i = 0; i < 3; i++) await logCoffee.tap();
      assert.equal(await logCoffee.isDisabled(), true);
      assert.equal(await page.locator('#addiction-coffees').textContent(), '3 / 3 coffees today');
      await page.getByRole('button', { name: 'Log cigarette', exact: true }).tap();
      assert.equal(await page.locator('#addiction-cigarettes').textContent(), '1 cigarette today');
      await page.getByRole('button', { name: 'Log lozenge taken', exact: true }).tap();
      await page.locator('#addiction-lozenges').filter({ hasText: /^1 lozenge today$/ }).waitFor();
      assert.equal(await page.locator('#addiction-lozenge-status').textContent(), '1 in stock · running low');
      assert.equal(await page.locator('#addiction-cigarettes').textContent(), '1 cigarette today');
      await page.getByRole('button', { name: 'Open Health', exact: true }).tap();
      await page.getByRole('button', { name: 'Log lozenge taken for Nicotine Lozenges' }).tap();
      await page.getByText('As needed · 2 logged today', { exact: true }).waitFor();
      assert.equal(await stock(page, firstId), '0 lozenges left');
      assert.equal(await page.locator(`[data-medication="${firstId}"] .medication-link-info`).isVisible(), false);
      assert.equal(await page.getByRole('button', { name: 'Log lozenge taken for Nicotine Lozenges' }).isDisabled(), true);
      await closeHealth(page);
      await page.locator('#phone-addiction').tap();
      await page.getByRole('button', { name: 'Undo last nicotine lozenge' }).tap();
      await page.locator('#addiction-lozenges').filter({ hasText: /^1 lozenge today$/ }).waitFor();
      assert.equal(await page.locator('#addiction-lozenge-status').textContent(), '1 in stock · running low');
      assert.deepEqual(await page.evaluate(() => window.__hubFirebase.docs['account-a'].habits['2026-07-10']), { version: 1, coffees: 3, cigarettes: 1 });
      assert.equal(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('thehub:addiction-helper:v1:2026'))), false);
      await page.clock.setFixedTime(new Date('2026-07-10T23:01:00Z'));
      await page.getByRole('button', { name: 'Close Addiction Helper' }).tap();
      await page.locator('#phone-addiction').tap();
      assert.equal(await page.locator('#addiction-coffees').textContent(), '0 / 3 coffees today');
      assert.equal(await page.locator('#addiction-cigarettes').textContent(), '0 cigarettes today');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('Addiction Helper syncs habits, keeps streaks, history, savings, cut-off, craving timer and low lozenge alerts', async () => {
    const records = seededHealth();
    const entries = JSON.parse(records[firstId].payload);
    Object.assign(entries[0], { name: 'Nicotine Lozenges', time: 'as-needed', quantity: null, link: null, adjustment: 4 });
    records[firstId].payload = JSON.stringify(entries);
    const habits = { '2026-07-06': { version: 1, cigarettes: 2 } };
    const { context, page, errors } = await fixture(browser, { width: 390, mobile: true, motion: 'reduce', firebase: true,
      cloudDocuments: { 'account-a': { ...makeAccount(), health: records, habits } } });
    try {
      // Lisbon 15:30, past the default coffee cut-off.
      await page.clock.setFixedTime(new Date('2026-07-10T14:30:00Z'));
      await ready(page);
      await page.evaluate(() => localStorage.setItem('thehub:addiction-helper:v1:2026-07-09', JSON.stringify({ cigarettes: 0, coffees: 2 })));
      await ready(page);
      await page.waitForFunction(() => window.__hubFirebase.docs['account-a'].habits['2026-07-09']?.coffees === 2);
      assert.equal(await page.evaluate(() => localStorage.getItem('thehub:addiction-helper:v1:2026-07-09')), null);
      await page.locator('#phone-addiction').tap();
      assert.equal(await page.locator('#addiction-streak').textContent(), 'Smoke-free · 4 days · Best 4');
      assert.equal(await page.locator('#addiction-cutoff').textContent(), 'Past 15:00 · skip coffee for better sleep');
      assert.equal(await page.locator('#addiction-cutoff').getAttribute('data-warning'), 'true');
      assert.equal(await page.locator('#addiction-device').textContent(), 'Cigarettes and coffee sync to your account.');
      const rows = page.locator('#addiction-history tr');
      assert.equal(await rows.count(), 7);
      assert.deepEqual(await rows.nth(0).locator('th, td').allTextContents(), ['Today', '0', '0', '0']);
      assert.deepEqual(await rows.nth(1).locator('th, td').allTextContents(), ['Yesterday', '0', '2', '0']);
      assert.deepEqual(await rows.nth(4).locator('th, td').allTextContents(), ['Mon 6', '2', '0', '0']);
      assert.match(await page.locator('#addiction-savings').textContent(), /^Add your tobacco price/);

      assert.equal(await page.locator('#addiction-lozenge-status').textContent(), '4 in stock · running low');
      assert.equal(await page.locator('#addiction-lozenge-status').getAttribute('data-warning'), 'true');
      await page.getByRole('button', { name: 'Log lozenge taken', exact: true }).tap();
      await page.locator('#addiction-lozenges').filter({ hasText: /^1 lozenge today$/ }).waitFor();
      assert.equal(await page.locator('#addiction-craving').textContent(), 'Stop timer');
      assert.equal(await page.locator('#addiction-timer').textContent(), '5:00');
      assert.deepEqual(await rows.nth(0).locator('th, td').allTextContents(), ['Today', '0', '0', '1']);
      await page.locator('#addiction-craving').tap();
      assert.equal(await page.locator('#addiction-craving').textContent(), 'Start 5-minute timer');

      await page.locator('#addiction-settings summary').tap();
      assert.equal(await page.locator('#addiction-cutoff-time').inputValue(), '15:00');
      await page.locator('#addiction-price').fill('10');
      await page.locator('#addiction-per-pouch').fill('50');
      await page.locator('#addiction-baseline').fill('10');
      await page.getByRole('button', { name: 'Save settings', exact: true }).tap();
      await page.locator('#addiction-status').filter({ hasText: 'Settings saved to your account.' }).waitFor();
      // 10 + 10 + 10 + 10 + 8 cigarettes avoided since 6 July at 0.20 each.
      assert.equal(await page.locator('#addiction-savings').textContent(), '€9.60 saved in the last 7 days');
      assert.deepEqual(await page.evaluate(() => window.__hubFirebase.docs['account-a'].habits.settings),
        { version: 1, coffeeCutoff: '15:00', pouchPrice: 10, pouchCigarettes: 50, baseline: 10 });

      await page.getByRole('button', { name: 'Log cigarette', exact: true }).tap();
      assert.equal(await page.locator('#addiction-streak').textContent(), 'Smoke-free · 0 days · Best 3');
      assert.equal(await page.locator('#addiction-savings').textContent(), '€9.40 saved in the last 7 days');
      await page.getByRole('button', { name: 'Open Health', exact: true }).tap();
      assert.equal(await page.locator(`[data-medication="${firstId}"] .medication-warning`).textContent(), 'Only 3 left · buy more soon');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('Addiction Helper keeps counts on the device until account habit sync is enabled', async () => {
    const { context, page, errors } = await accountFixture(browser, { width: 1440, motion: 'reduce' });
    try {
      await context.addInitScript(() => { window.__hubFirebase.habitsDenied = true; });
      await ready(page);
      await page.locator('#addiction-launch').click();
      await page.locator('#addiction-device').filter({ hasText: 'Account sync for habits is not enabled yet' }).waitFor();
      await page.getByRole('button', { name: 'Log coffee', exact: true }).click();
      assert.equal(await page.locator('#addiction-coffees').textContent(), '1 / 3 coffees today');
      assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('thehub:addiction-helper:v1:2')).length), 1);
      const grid = await page.locator('.addiction-grid .addiction-actions').evaluateAll(rows => rows.map(row => Math.round(row.getBoundingClientRect().bottom)));
      assert.equal(new Set(grid.slice(0, 2)).size, 1, 'Tobacco and Coffee buttons line up');
      assert.equal(new Set(grid.slice(2, 4)).size, 1, 'Lozenge and timer buttons line up');
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });

  await t.test('empty stock blocks another dose, while restocking restores availability', async () => {
    const dates = Array.from({ length: 5 }, (_, index) => `2020-01-0${index + 1}`);
    const { context, page } = await accountFixture(browser, { motion: 'reduce' }, seededHealth([], dates));
    try {
      await ready(page); await openHealth(page);
      assert.equal(await stock(page, secondId), '0 tablets left');
      assert.equal(await page.getByRole('button', { name: 'Mark Sample B taken' }).isDisabled(), true);
      await page.getByRole('button', { name: 'Add stock for Sample B' }).click();
      await page.locator(`#restock-${secondId}`).fill('2'); await page.getByRole('button', { name: 'Save stock for Sample B' }).click(); await waitStock(page, secondId, 2);
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
      const importTab = page.getByRole('tab', { name: 'Import', exact: true });
      const todayTab = page.getByRole('tab', { name: 'Today', exact: true });
      await importTab.click();
      await textarea.fill(JSON.stringify({ version: 1, medications: [items[0], items[0]] }));
      assert.match(await result.textContent(), /unique name/);
      assert.equal(await save.isDisabled(), true);
      assert.equal(await page.evaluate(() => window.__hubFirebase.healthWrites.length), 0);
      await page.locator('#health-import-file').setInputFiles({ name: 'setup.json', mimeType: 'application/json', buffer: Buffer.from(payload) });
      await page.getByText('3 medications in this list', { exact: true }).waitFor();
      assert.equal(await page.locator('#health-import-names li').count(), 3);
      await page.evaluate(() => { window.__hubFirebase.rejectWrites = true; });
      await save.click();
      await page.waitForFunction(() => document.querySelector('#health-import-status').textContent.includes('could not be saved'));
      assert.equal(await textarea.inputValue(), payload);
      assert.equal(await page.evaluate(() => window.__hubFirebase.healthWrites.length), 0);
      await page.evaluate(() => { window.__hubFirebase.rejectWrites = false; });
      await save.click();
      await page.waitForFunction(() => document.querySelector('#health-import-status').textContent.includes('Added 3'));
      assert.match(await result.textContent(), /Checklists to link: Missing checklist/);
      await todayTab.click();
      assert.equal(await page.locator('#health-today').textContent(), '0 of 2 taken');
      assert.equal(await page.evaluate(() => window.__hubFirebase.healthWrites.length), 3);
      const morning = page.locator('#health-medications .medication-card').filter({ has: page.getByRole('heading', { name: 'Morning example', exact: true }) });
      assert.equal(await morning.locator('.medication-checklist-link .medication-checklist-name').textContent(), 'Getting Ready');
      await morning.getByRole('button', { name: 'Mark Morning example taken', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('#health-today').textContent === '1 of 2 taken');
      assert.equal(await page.locator('#health-dose-progress').evaluate(progress => progress.value), 1);
      await importTab.click();
      await textarea.fill(payload);
      await save.click();
      await page.waitForFunction(() => document.querySelector('#health-import-status').textContent.includes('3 already'));
      await todayTab.click();
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
