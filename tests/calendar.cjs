const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { fixture, ready, chooseRoutine } = require('./browser-fixture.cjs');

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
      assert.equal(await plan(page, 'going-out').count(), 0);
      assert.equal(await page.locator('#calendar-dialog').evaluate(el => el.scrollWidth > el.clientWidth), false);
      const home = await page.evaluate(() => ({
        order: [...document.querySelectorAll('.app')].map(button => button.dataset.icon),
        calendar: document.querySelector('.app[data-icon="calendar"] .module-number').textContent,
        notes: document.querySelector('.app[data-icon="notes"] .module-number').textContent
      }));
      assert.deepEqual(home.order, ['goals', 'habits', 'health', 'calendar', ...(width < 700 ? [] : ['finance']), 'fitness', 'games', 'entertainment', 'notes', 'settings', ...(width < 700 ? ['finance'] : [])]);
      assert.equal(home.calendar, '04'); assert.equal(home.notes, '09');
      assert.match(await page.locator('.calendar-header .panel-eyebrow').textContent(), /MODULE 04/);
      await page.locator('#calendar-mode-weekly').click();
      await plan(page, 'office').check(); await plan(page, 'training').check();
      await page.locator('#calendar-save').click();
      await page.locator('#calendar-status').filter({ hasText: 'Weekly pattern saved.' }).waitFor();
      assert.deepEqual(await page.locator('#calendar-week [aria-current="date"] .calendar-agenda-entry b').allTextContents(), ['Office', 'Gym/Muay Thai']);
      await page.locator('#calendar-mode-day').click();
      await plan(page, 'office').uncheck(); await plan(page, 'training').uncheck();
      await page.locator('#calendar-save').click();
      await page.locator('#calendar-status').filter({ hasText: 'Plans saved for this date.' }).waitFor();
      assert.equal(await page.locator('#calendar-week [aria-current="date"] small').textContent(), 'No plans');
      await page.locator('#calendar-follow').click();
      await page.locator('#calendar-status').filter({ hasText: 'now follows your weekly pattern' }).waitFor();
      assert.equal(await plan(page, 'office').isChecked(), true);
      await page.locator('#calendar-next').click();
      assert.equal(await page.locator('#calendar-week [data-day="2026-11-27"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await plan(page, 'training').isChecked(), true);
      await plan(page, 'office').uncheck();
      await page.locator('#calendar-save').click();
      await page.locator('#calendar-status').filter({ hasText: 'Plans saved for this date.' }).waitFor();
      assert.equal(await page.locator('#calendar-week [data-day="2026-11-27"] .calendar-agenda-entry b').textContent(), 'Gym/Muay Thai');
      const saved = await page.evaluate(() => window.__hubFirebase.docs['account-a']);
      assert.deepEqual(saved.calendar['repeat-5'].plans, ['office', 'training']);
      assert.deepEqual(saved.calendar['2026-11-27'].plans, ['training']);
      assert.deepEqual(saved.progress.checks, { 'morning/care/task': true });
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
  await t.test('plans sync between devices and keep all checklists and preparation links accessible by default', async () => {
    const first = await make(browser); const second = await make(browser);
    try {
      for (const { page } of [first, second]) await start(page);
      await plan(first.page, 'training').check();
      await first.page.locator('#calendar-time-training').fill('19:30');
      await first.page.locator('#calendar-note-training').fill('Bring gloves');
      await first.page.locator('#calendar-save').click();
      await first.page.locator('#calendar-status').filter({ hasText: 'Plans saved' }).waitFor();
      await first.page.locator('#calendar-week [data-day="2026-11-21"]').click();
      await plan(first.page, 'office').check(); await first.page.locator('#calendar-save').click();
      await first.page.locator('#calendar-status').filter({ hasText: 'Plans saved' }).waitFor();
      await sync(first.page, second.page);
      const training = second.page.locator('#calendar-week [aria-current="date"] [data-plan="training"]');
      await training.getByText('Gym/Muay Thai').waitFor();
      assert.equal(await training.locator('time').textContent(), '19:30');
      assert.equal(await second.page.locator('#calendar-note-training').inputValue(), 'Bring gloves');
      await first.page.getByRole('button', { name: 'Open Office Preparation', exact: true }).click();
      assert.equal(await first.page.locator('#routine-name').textContent(), 'Office Preparation');
      assert.equal(await first.page.locator('#calendar-dialog').isVisible(), false);
      await second.page.getByRole('button', { name: 'Open Muay Thai Preparation', exact: true }).click();
      assert.equal(await second.page.locator('#routine-name').textContent(), 'Muay Thai Preparation');
      assert.equal(await second.page.locator('#calendar-dialog').isVisible(), false);
      await second.page.locator('#routine-plan-context:not([hidden])').waitFor();
      assert.equal(await second.page.locator('#routine-list [data-routine="other"]').evaluate(el => el.hidden), false);
      assert.equal(await second.page.locator('#routine-list [data-routine="office"]').evaluate(el => el.hidden), false);
      assert.equal(await second.page.locator('#routine-list [data-routine="muay-thai"]').evaluate(el => el.hidden), false);
      await chooseRoutine(second.page, 'wind-down');
      assert.equal(await second.page.getByRole('button', { name: 'Open Office Preparation', exact: true }).isVisible(), true);
      assert.equal(await second.page.getByRole('button', { name: 'Open Muay Thai Preparation', exact: true }).isVisible(), true);
      assert.equal(await second.page.locator('input[data-minoxidil]').count(), 0);
      assert.equal(await second.page.getByRole('heading', { name: /^Prepare outfit/ }).isVisible(), true);
      await second.page.locator('#routine-all-checklists').click();
      assert.equal(await second.page.locator('#routine-list [data-routine="other"]').evaluate(el => el.hidden), true);
      assert.equal(await second.page.getByRole('button', { name: 'Open Muay Thai Preparation', exact: true }).isVisible(), false);
      await second.page.locator('#routine-all-checklists').click();
      assert.equal(await second.page.locator('#routine-list [data-routine="other"]').evaluate(el => el.hidden), false);
      assert.equal(await second.page.getByRole('button', { name: 'Open Muay Thai Preparation', exact: true }).isVisible(), true);
      await second.page.getByRole('button', { name: 'Open Office Preparation', exact: true }).click();
      assert.equal(await second.page.locator('#routine-name').textContent(), 'Office Preparation');
      assert.equal(await second.page.locator('#routine-content').getByText('MacBook', { exact: true }).isVisible(), true);
      assert.deepEqual(first.errors.concat(second.errors), []);
    } finally { await first.context.close(); await second.context.close(); }
  });
  await t.test('custom plans can be saved without checklists, synced, edited and removed', async () => {
    const first = await make(browser); const second = await make(browser);
    try {
      for (const { page } of [first, second]) await start(page);
      const page = first.page;
      const custom = page.locator('.calendar-custom-plan');
      await page.getByRole('button', { name: 'Show hours', exact: true }).click();
      const hours = page.locator('#calendar-hour-list');
      assert.equal(await hours.locator('li').count(), 24);
      assert.equal(await hours.locator('li').first().getAttribute('data-slot'), '00:00');
      assert.equal(await hours.locator('li').last().getAttribute('data-slot'), '23:00');
      await page.getByRole('button', { name: '18:00', exact: true }).click();
      assert.equal(await hours.evaluate(el => el.scrollTop === el.querySelector('[data-slot="18:00"]').offsetTop), true);
      await hours.getByRole('button', { name: 'Add plan at 20:00', exact: true }).click();
      assert.equal(await page.locator('#calendar-save').isDisabled(), true);
      assert.equal(await custom.first().getByLabel('Time (Lisbon, optional)').inputValue(), '20:00');
      await custom.first().getByLabel('Plan name').fill('Dinner');
      await custom.first().getByLabel('Note (optional)').fill('Outdoor table');
      await page.getByRole('button', { name: 'Add plan', exact: true }).click();
      await custom.last().getByLabel('Plan name').fill('Appointment');
      await custom.last().getByLabel('Time (Lisbon, optional)').fill('09:00');
      await page.locator('#calendar-save').click();
      await page.locator('#calendar-status').filter({ hasText: 'Plans saved' }).waitFor();
      assert.equal(await hours.locator('[data-slot="20:00"]').getByText('Outdoor table', { exact: true }).count(), 1);
      await hours.getByRole('button', { name: 'Edit Dinner', exact: true }).click();
      assert.equal(await custom.first().getByLabel('Plan name').evaluate(el => el === document.activeElement), true);
      await page.locator('#calendar-week [data-day="2026-11-21"]').click();
      assert.equal(await hours.getByText('Dinner', { exact: true }).count(), 0);
      assert.equal(await page.locator('#calendar-dialog').evaluate(el => el.scrollWidth > el.clientWidth), false);
      await sync(page, second.page);
      const day = second.page.locator('#calendar-week [aria-current="date"]');
      await day.getByText('Dinner', { exact: true }).waitFor();
      assert.deepEqual(await day.locator('b').allTextContents(), ['Appointment', 'Dinner']);
      assert.equal(await second.page.getByLabel('Note (optional)', { exact: true }).first().inputValue(), 'Outdoor table');
      assert.equal(await second.page.locator('#calendar-checklists').getByRole('button').count(), 0);
      await second.page.getByLabel('Plan name', { exact: true }).first().fill('Birthday dinner');
      await second.page.getByRole('button', { name: 'Remove custom plan 2' }).click();
      await second.page.locator('#calendar-save').click();
      await second.page.locator('#calendar-status').filter({ hasText: 'Plans saved' }).waitFor();
      assert.deepEqual(await day.locator('b').allTextContents(), ['Birthday dinner']);
      await second.page.getByRole('button', { name: 'Remove custom plan 1' }).click();
      await second.page.locator('#calendar-save').click();
      await day.getByText('No plans', { exact: true }).waitFor();
      assert.deepEqual(first.errors.concat(second.errors), []);
    } finally { await first.context.close(); await second.context.close(); }
  });
  await t.test('dirty plans guard navigation; rejected or conflicting saves keep the draft', async () => {
    const first = await make(browser); const second = await make(browser);
    try {
      for (const { page } of [first, second]) await start(page);
      const page = first.page;
      await plan(page, 'office').check();
      await page.getByRole('button', { name: 'Open Office Preparation', exact: true }).click();
      assert.equal(await page.locator('#calendar-dialog').isVisible(), true);
      assert.equal(await page.locator('#routines-dialog').isVisible(), false);
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
      assert.equal(await account.page.locator('#calendar-week [aria-current="date"] small').textContent(), 'No plans');
      assert.deepEqual(signedOut.errors.concat(denied.errors, account.errors), []);
    } finally { await signedOut.context.close(); await denied.context.close(); await account.context.close(); }
  });
});
