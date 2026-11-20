const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { fixture, ready, openRoutines, chooseRoutine } = require('./browser-fixture.cjs');

const routines = { version: 1, routines: [
  ['morning', 'Morning Routine', 'Breakfast'], ['getting-ready', 'Getting Ready', 'Phone'],
  ['wind-down', 'Wind Down', 'Wash face'], ['office', 'Office Preparation', 'MacBook'],
  ['muay-thai', 'Muay Thai Preparation', 'Water'], ['other', 'Other checklist', 'Other task']
].map(([id, name, label]) => ({ id, name, description: 'Checklist.', groups: [{ id: 'care', title: 'Care', optional: false, items: [{ id: 'task', label }] }] })) };
routines.routines[2].groups.push(
  { id: 'office-link', title: 'Office tomorrow', optional: true, items: [{ id: 'office', label: 'Complete Office Preparation', linkedChecklist: 'office' }] },
  { id: 'training-link', title: 'Training tomorrow', optional: true, items: [{ id: 'training', label: 'Complete Muay Thai Preparation', linkedChecklist: 'muay-thai' }] }
);
const data = calendar => ({ 'account-a': { routines, progress: { checks: { 'morning/care/task': true }, optional: {} }, calendar } });
const make = (browser, options = {}) => fixture(browser, { width: 390, mobile: true, motion: 'reduce', firebase: true, cloudDocuments: data({}), ...options });
async function start(page) {
  await page.clock.setFixedTime(new Date('2026-11-20T12:00:00Z'));
  await ready(page); await page.locator('.app[data-icon="calendar"]').click();
  await page.locator('#calendar-status').filter({ hasText: 'Synced to your account.' }).waitFor();
}
const plan = (page, id) => page.locator(`#calendar-plan-${id}`);
const close = page => page.getByRole('button', { name: 'Close Calendar', exact: true }).click();
async function sync(from, to) {
  const calendar = await from.evaluate(() => structuredClone(window.__hubFirebase.docs['account-a'].calendar));
  await to.evaluate(calendar => { window.__hubFirebase.docs['account-a'].calendar = calendar; window.__hubFirebase.publish(); }, calendar);
}

test('Calendar workflows', { timeout: 150000 }, async t => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true }); t.after(() => browser.close());
  for (const width of [320, 390, 1440]) await t.test(`weekly repeats, custom dates and free days at ${width}px`, async () => {
    const { context, page, errors } = await make(browser, { width, mobile: width < 700 });
    try {
      await start(page);
      assert.equal(await page.locator('#calendar-dialog').evaluate(el => el.scrollWidth > el.clientWidth), false);
      const home = await page.evaluate(() => ({
        gap: document.querySelector('.today-plans').getBoundingClientRect().top - document.querySelector('.intro').getBoundingClientRect().bottom,
        width: document.querySelector('.today-plans').getBoundingClientRect().width,
        order: [...document.querySelectorAll('.app')].map(button => button.dataset.icon),
        calendar: document.querySelector('.app[data-icon="calendar"] .module-number').textContent,
        notes: document.querySelector('.app[data-icon="notes"] .module-number').textContent
      }));
      assert.ok(home.gap >= (width < 700 ? 28 : 48));
      assert.ok(home.width <= 760);
      assert.deepEqual(home.order, ['goals', 'health', 'habits', 'calendar', 'notes', 'settings', 'finance', 'people']);
      assert.equal(home.calendar, '04'); assert.equal(home.notes, '05');
      assert.match(await page.locator('.calendar-header .panel-eyebrow').textContent(), /MODULE 04/);
      await page.locator('#calendar-mode-weekly').click();
      await plan(page, 'office').check(); await plan(page, 'training').check();
      await page.locator('#calendar-save').click();
      await page.locator('#calendar-status').filter({ hasText: 'Weekly pattern saved.' }).waitFor();
      assert.match(await page.locator('#today-plans-summary').textContent(), /Office \+ Gym\/Muay Thai/);
      await page.locator('#calendar-mode-day').click();
      await plan(page, 'office').uncheck(); await plan(page, 'training').uncheck();
      await page.locator('#calendar-save').click();
      await page.locator('#calendar-status').filter({ hasText: 'Plans saved for this date.' }).waitFor();
      assert.equal(await page.locator('#today-plans-summary').textContent(), 'No plans for today');
      await page.locator('#calendar-follow').click();
      await page.locator('#calendar-status').filter({ hasText: 'now follows your weekly pattern' }).waitFor();
      assert.equal(await plan(page, 'office').isChecked(), true);
      await page.locator('#calendar-next').click();
      assert.equal(await page.locator('#calendar-week [data-day="2026-11-27"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await plan(page, 'training').isChecked(), true);
      await plan(page, 'office').uncheck(); await plan(page, 'training').uncheck(); await plan(page, 'going-out').check();
      await page.locator('#calendar-save').click();
      await page.locator('#calendar-status').filter({ hasText: 'Plans saved for this date.' }).waitFor();
      assert.match(await page.locator('#today-plans-summary').textContent(), /Office \+ Gym\/Muay Thai/);
      const saved = await page.evaluate(() => window.__hubFirebase.docs['account-a']);
      assert.deepEqual(saved.calendar['repeat-5'].plans, ['office', 'training']);
      assert.deepEqual(saved.calendar['2026-11-27'].plans, ['going-out']);
      assert.deepEqual(saved.progress.checks, { 'morning/care/task': true });
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
  await t.test('plans sync between devices, guide Goals and only show tomorrow’s optional preparations', async () => {
    const first = await make(browser); const second = await make(browser);
    try {
      for (const { page } of [first, second]) await start(page);
      await plan(first.page, 'training').check(); await first.page.locator('#calendar-save').click();
      await first.page.locator('#calendar-status').filter({ hasText: 'Plans saved' }).waitFor();
      await first.page.locator('#calendar-week [data-day="2026-11-21"]').click();
      await plan(first.page, 'office').check(); await first.page.locator('#calendar-save').click();
      await first.page.locator('#calendar-status').filter({ hasText: 'Plans saved' }).waitFor();
      await sync(first.page, second.page);
      await second.page.locator('#today-plans-summary').filter({ hasText: 'Gym/Muay Thai' }).waitFor();
      await close(second.page); await openRoutines(second.page);
      await second.page.locator('#routine-plan-context:not([hidden])').waitFor();
      assert.equal(await second.page.locator('#routine-list [data-routine="other"]').evaluate(el => el.hidden), true);
      assert.equal(await second.page.locator('#routine-list [data-routine="muay-thai"]').evaluate(el => el.hidden), false);
      await chooseRoutine(second.page, 'wind-down');
      assert.equal(await second.page.getByRole('button', { name: 'Open Office Preparation', exact: true }).isVisible(), true);
      assert.equal(await second.page.getByRole('button', { name: 'Open Muay Thai Preparation', exact: true }).isVisible(), false);
      assert.equal(await second.page.locator('input[data-minoxidil]').count(), 0);
      assert.equal(await second.page.getByRole('heading', { name: /^Prepare outfit/ }).isVisible(), true);
      await second.page.locator('#routine-all-checklists').click();
      assert.equal(await second.page.locator('#routine-list [data-routine="other"]').evaluate(el => el.hidden), false);
      assert.deepEqual(first.errors.concat(second.errors), []);
    } finally { await first.context.close(); await second.context.close(); }
  });
  await t.test('dirty plans guard navigation; rejected or conflicting saves keep the draft', async () => {
    const first = await make(browser); const second = await make(browser);
    try {
      for (const { page } of [first, second]) await start(page);
      const page = first.page;
      await plan(page, 'office').check();
      assert.equal(await page.locator('#account-logout').isDisabled(), true);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#calendar-dialog').evaluate(el => el.open), true);
      await page.locator('#calendar-next').click();
      assert.equal(await page.locator('#calendar-week [data-day="2026-11-20"]').getAttribute('aria-pressed'), 'true');
      await page.evaluate(() => { window.__hubFirebase.rejectCalendar = true; });
      await page.locator('#calendar-save').click();
      await page.locator('#calendar-status').filter({ hasText: 'could not sync' }).waitFor();
      assert.equal(await plan(page, 'office').isChecked(), true);
      assert.equal(await page.evaluate(() => Object.keys(window.__hubFirebase.docs['account-a'].calendar).length), 0);
      await page.evaluate(() => { window.__hubFirebase.rejectCalendar = false; });
      await plan(second.page, 'training').check();
      await page.locator('#calendar-save').click();
      await page.locator('#calendar-status').filter({ hasText: 'Plans saved' }).waitFor();
      assert.equal(await page.locator('#account-logout').isDisabled(), false);
      await sync(page, second.page);
      await second.page.locator('#calendar-save').click();
      await second.page.locator('#calendar-status').filter({ hasText: 'changed on another device' }).waitFor();
      assert.equal(await plan(second.page, 'training').isChecked(), true);
      await second.page.locator('#calendar-cancel').click();
      assert.equal(await plan(second.page, 'office').isChecked(), true);
      assert.equal(await plan(second.page, 'training').isChecked(), false);
      assert.deepEqual(first.errors.concat(second.errors), []);
    } finally { await first.context.close(); await second.context.close(); }
  });
  await t.test('signed-out, denied rules, offline and account switching keep private plans separate', async () => {
    const signedOut = await make(browser, { signedIn: false });
    const denied = await make(browser);
    const account = await make(browser, { cloudDocuments: data({ '2026-11-20': { version: 1, revision: 1, mode: 'custom', plans: ['office'] } }) });
    try {
      await ready(signedOut.page); await signedOut.page.locator('.app[data-icon="calendar"]').click();
      assert.equal(await plan(signedOut.page, 'office').isDisabled(), true);
      assert.equal(await signedOut.page.locator('#calendar-signin').isVisible(), true);
      await denied.context.addInitScript(() => { window.__hubFirebase.calendarDenied = true; });
      await ready(denied.page); await denied.page.locator('.app[data-icon="calendar"]').click();
      await denied.page.locator('#calendar-status').filter({ hasText: 'Calendar sync is unavailable' }).waitFor();
      assert.equal(await plan(denied.page, 'office').isDisabled(), true);
      await start(account.page);
      assert.equal(await plan(account.page, 'office').isChecked(), true);
      await account.context.setOffline(true);
      await account.page.locator('#calendar-status').filter({ hasText: 'Offline copy' }).waitFor();
      assert.equal(await plan(account.page, 'office').isDisabled(), true);
      await account.context.setOffline(false);
      await account.page.evaluate(() => {
        const service = window.__hubFirebase; service.docs['account-b'] = { routines: service.docs['account-a'].routines, progress: { checks: {}, optional: {} } };
        service.user = { uid: 'account-b', email: 'other@example.invalid' }; service.authListener(service.user);
      });
      await account.page.locator('#calendar-status').filter({ hasText: 'Synced to your account.' }).waitFor();
      assert.equal(await plan(account.page, 'office').isChecked(), false);
      assert.equal(await account.page.locator('#today-plans-summary').textContent(), 'No plans for today');
      assert.deepEqual(signedOut.errors.concat(denied.errors, account.errors), []);
    } finally { await signedOut.context.close(); await denied.context.close(); await account.context.close(); }
  });
});
