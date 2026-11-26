const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { fixture, ready, demo } = require('./browser-fixture.cjs');

test('Finance records pending spending, processes it once, and exports the audit history', { timeout: 45000 }, async t => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  t.after(() => browser.close());
  const data = { routines: JSON.parse(demo), progress: { checks: {}, optional: {} } };
  const { context, page, errors } = await fixture(browser, {
    width: 320, mobile: true, locale: 'pt-PT', motion: 'reduce', firebase: true,
    cloudDocuments: { 'account-a': data, 'account-b': data }
  });
  t.after(() => context.close());
  await page.clock.setFixedTime(new Date('2026-11-25T19:30:00Z'));
  await ready(page);
  await page.locator('[data-icon="finance"]').click();
  const panel = page.locator('#finance-dialog');
  const editor = page.locator('#finance-editor');
  const month = panel.getByRole('combobox', { name: 'Month', exact: true });
  const year = panel.getByRole('combobox', { name: 'Year', exact: true });
  assert.equal(await month.locator('option:checked').textContent(), 'November');
  assert.equal(await year.inputValue(), '2026');
  await month.selectOption({ label: 'October' });
  assert.equal(await month.inputValue(), '10');
  await month.selectOption({ label: 'November' });
  assert.deepEqual(await panel.locator('.finance-account-icon use').evaluateAll(icons => icons.map(icon => icon.getAttribute('href'))),
    ['#finance-account-bank', '#finance-account-revolut', '#finance-account-food', '#finance-account-benefits', '#finance-account-cash']);
  for (const name of ['Coverflex Meal Allowance', 'Coverflex Benefits', 'Cash']) {
    assert.equal(await panel.getByRole('heading', { name, exact: true }).count(), 1);
  }
  const bank = panel.locator('.finance-metric').filter({ has: page.getByRole('heading', { name: 'Bank · Authorized balance', exact: true }) });
  await bank.getByRole('button', { name: 'Confirm balance', exact: true }).click();
  await editor.getByLabel('Book balance (€)', { exact: true }).fill('100');
  await editor.getByLabel('Authorized balance (€)').fill('100');
  await editor.getByRole('button', { name: 'Review difference' }).click();
  await editor.getByRole('button', { name: 'Confirm balances', exact: true }).click();
  await editor.waitFor({ state: 'hidden' });

  await panel.getByRole('button', { name: 'Add movement' }).click();
  await editor.getByLabel('Quick entry').fill('-3,57 Uber, Bank, pendente');
  await editor.getByRole('button', { name: 'Review', exact: true }).click();
  assert.equal(await editor.getByLabel('Status').inputValue(), 'pending');
  await editor.getByRole('button', { name: 'Save movement' }).click();
  await editor.waitFor({ state: 'hidden' });
  assert.match(await bank.locator('strong').textContent(), /96\.43/);
  assert.match(await bank.getByText('Book balance', { exact: false }).textContent(), /100\.00/);
  await panel.getByRole('button', { name: 'Activity', exact: true }).click();
  await panel.getByRole('button', { name: 'Process', exact: true }).click();
  await editor.getByRole('button', { name: 'Process movement', exact: true }).click();
  await editor.waitFor({ state: 'hidden' });
  assert.equal(await panel.locator('.finance-row').filter({ hasText: 'Uber' }).count(), 1);
  await panel.getByRole('button', { name: 'Overview' }).click();
  assert.match(await bank.locator('strong').textContent(), /96\.43/);
  assert.match(await bank.getByText('Book balance', { exact: false }).textContent(), /96\.43/);

  await panel.getByRole('button', { name: 'Add movement' }).click();
  await editor.getByLabel('Quick entry').fill('-30 Jantar, Bank, Bea deve-me 1/3');
  await editor.getByRole('button', { name: 'Review', exact: true }).click();
  await editor.getByRole('button', { name: 'Save movement' }).click();
  await editor.waitFor({ state: 'hidden' });
  await panel.getByRole('button', { name: 'To receive', exact: true }).click();
  await panel.getByRole('button', { name: 'Record payment', exact: true }).click();
  await editor.getByLabel('Amount received (€)').fill('4');
  await editor.getByRole('button', { name: 'Save payment' }).click();
  await editor.waitFor({ state: 'hidden' });
  assert.match(await panel.locator('.finance-row').filter({ hasText: 'Bea' }).locator('.finance-row-value').textContent(), /6\.00/);
  await panel.getByRole('button', { name: 'Subscriptions', exact: true }).click();
  await panel.getByRole('button', { name: 'Add subscription', exact: true }).click();
  await editor.getByLabel('Name', { exact: true }).fill('Test subscription');
  await editor.getByLabel('Amount (€)', { exact: true }).fill('3,57');
  await editor.getByLabel('Paid from').selectOption('bank');
  await editor.getByLabel('Frequency').selectOption('monthly');
  await editor.getByLabel('Next charge').fill('2026-11-25');
  await editor.getByRole('button', { name: 'Save subscription', exact: true }).click();
  await editor.waitFor({ state: 'hidden' });
  await panel.getByRole('button', { name: 'Record charge', exact: true }).click();
  const movementSelect = editor.getByLabel('Movement', { exact: true });
  await movementSelect.selectOption({ label: '2026-11-25 · Uber' });
  await editor.getByRole('button', { name: 'Save charge', exact: true }).click();
  await editor.waitFor({ state: 'hidden' });
  assert.match(await panel.locator('.finance-row').filter({ hasText: 'Test subscription' }).textContent(), /Next 2026-12-25/);
  await panel.getByRole('button', { name: 'Payment history', exact: true }).click();
  assert.match(await editor.getByText('Paid 2026-11-25', { exact: false }).textContent(), /3\.57/);
  await editor.getByRole('button', { name: 'Close history', exact: true }).click();
  await panel.getByRole('button', { name: 'Add subscription', exact: true }).click();
  await editor.getByLabel('Name', { exact: true }).fill('Prepaid service');
  await editor.getByLabel('Amount (€)', { exact: true }).fill('20');
  await editor.getByLabel('Frequency').selectOption('annual');
  await editor.getByLabel('Prepaid through').fill('2027-10-10');
  await editor.getByRole('button', { name: 'Save subscription', exact: true }).click();
  await editor.waitFor({ state: 'hidden' });
  const prepaid = panel.locator('.finance-row').filter({ hasText: 'Prepaid service' });
  assert.match(await prepaid.textContent(), /Payment account unknown · Prepaid through 2027-10-10 · Next charge unknown/);
  assert.equal(await prepaid.getByRole('button', { name: 'Record charge' }).count(), 0);
  await panel.getByRole('button', { name: 'Activity', exact: true }).click();
  assert.equal(await panel.locator('.finance-row').count(), 3);

  const backupMenu = panel.getByRole('button', { name: 'Backup & Import', exact: true });
  const bulkText = [
    'Date | Description | Amount (EUR) | Account | Type | Status | Category',
    '2026-11-25 | Uber | -3.57 | Bank | Expense | Pending | Transport',
    '2026-11-25 | Beer | -5.00 | Bank | Expense | Processed | Drinks',
    '2026-11-25 | Beer | -5.00 | Bank | Expense | Processed | Drinks',
    'Unknown | Tobacco | -10.80 | Cash | Expense | Processed | Tobacco'
  ].join('\n');
  await backupMenu.click();
  await editor.getByRole('button', { name: 'Import movements', exact: true }).click();
  await editor.getByLabel('Movement list').fill(bulkText);
  await editor.getByRole('button', { name: 'Review movements' }).click();
  await editor.getByText('2 new movements · 1 already in Finance · 1 without a date', { exact: true }).waitFor();
  assert.equal(await panel.locator('.finance-row').count(), 3);
  await editor.getByRole('button', { name: 'Import movements', exact: true }).click();
  await editor.waitFor({ state: 'hidden' });
  assert.equal(await panel.locator('.finance-row').filter({ hasText: 'Beer' }).count(), 2);

  await backupMenu.click();
  const download = page.waitForEvent('download');
  await editor.getByRole('button', { name: 'Export backup' }).click();
  const file = await download;
  assert.equal(file.suggestedFilename(), 'the-hub-finance-2026-11-25.json');
  const payload = await page.evaluate(() => JSON.parse(window.__hubFirebase.docs['account-a'].finance.ledger.payload));
  const uber = payload.find(event => event.collection === 'movements' && event.value.description === 'Uber');
  assert.deepEqual(payload.filter(event => event.id === uber.id).map(event => event.value.status), ['pending', 'processed']);
  assert.equal(await panel.evaluate(el => el.scrollWidth > el.clientWidth), false);
  await page.evaluate(() => {
    const service = window.__hubFirebase;
    service.user = { uid: 'account-b', email: 'other@example.invalid' };
    service.authListener(service.user);
  });
  await bank.getByRole('button', { name: 'Confirm balance', exact: true }).waitFor();
  assert.equal(await bank.locator('strong').textContent(), '—');
  await backupMenu.click();
  await editor.getByRole('button', { name: 'Import backup', exact: true }).click();
  await editor.getByLabel('Finance backup file').setInputFiles(await file.path());
  await editor.getByRole('button', { name: 'Review backup', exact: true }).click();
  await editor.getByText('Movements: 5', { exact: true }).waitFor();
  assert.equal(await bank.locator('strong').textContent(), '—');
  await editor.getByRole('button', { name: 'Restore backup' }).click();
  await editor.waitFor({ state: 'hidden' });
  await page.getByText('Finance backup restored.', { exact: true }).waitFor();
  const restored = await page.evaluate(() => JSON.parse(window.__hubFirebase.docs['account-b'].finance.ledger.payload));
  assert.deepEqual(restored, payload);
  assert.deepEqual(errors, []);
});
