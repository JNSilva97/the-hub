import test from 'node:test';
import assert from 'node:assert/strict';
import { balances, financeState, monthReport, nextCharge, parseQuick, prepareFinanceChanges, prepareFinanceRestore, previewFinanceMovements, remainingDebt } from '../finance-model.mjs';

const change = (collection, id, value, before = null) => ({ collection, id, value, before });
const add = (events, ...changes) => prepareFinanceChanges(events, changes, 1).events;
const today = '2026-11-25';

test('pending processing maintains available balance and books the expense on the settlement day', () => {
  const { draft } = parseQuick('-3,57 Uber, Bank, pendente', '2026-10-31');
  const initial = add([], change('confirmations', 'opening', { account: 'bank', date: '2026-10-01', book: 10000, available: 10000, bookChange: 10000, availableChange: 10000 }));
  const pending = add(initial, change('movements', 'uber', draft));
  assert.equal(balances(financeState(pending), today).get('bank').book, 10000);
  assert.equal(balances(financeState(pending), today).get('bank').available, 9643);
  const booked = { ...draft, status: 'processed', postedOn: '2026-11-01' };
  const events = add(pending, change('movements', 'uber', booked, draft));
  const state = financeState(events);
  assert.equal(state.movements.size, 1);
  assert.equal(balances(state, today).get('bank').book, 9643);
  assert.equal(balances(state, today).get('bank').available, 9643);
  assert.equal(balances(state, '2026-10-31').get('bank').book, 10000);
  assert.equal(monthReport(state, '2026-11', today).expenses, 357);
  assert.equal(add(events, change('movements', 'uber', booked, draft)).length, events.length);
});

test('transfers and repayments affect balances without inflating income or expenses', () => {
  const { draft, debt } = parseQuick('-30 Jantar, Bank, Bea deve-me 1/3', today);
  assert.equal(debt.cents, 1000);
  assert.equal(parseQuick('+1111,74 Ordenado, Bank', today).draft.cents, 111174);
  assert.equal(parseQuick('-20 Supermercado, Alimentação, categoria: W', today).draft.category, 'W');
  const english = parseQuick('-1,234.56 Groceries, Coverflex Meal Allowance, category: Food', today).draft;
  assert.deepEqual([english.account, english.cents, english.category], ['food', 123456, 'Food']);
  const transfer = { ...draft, kind: 'transfer', cents: 2000, destination: 'revolut' };
  const payment = { ...draft, kind: 'repayment', cents: 400, receivable: 'bea' };
  const changes = [change('movements', 'dinner', draft), change('movements', 'transfer', transfer),
    change('receivables', 'bea', { ...debt, date: today, description: 'Jantar', movement: 'dinner' }),
    change('movements', 'partial', payment)];
  const events = add([], ...changes);
  const state = financeState(events);
  const report = monthReport(state, '2026-11', today);
  assert.equal(report.expenses, 3000);
  assert.equal(report.income, 0);
  assert.equal(report.repayments, 400);
  assert.equal(remainingDebt(state, 'bea'), 600);
  assert.equal(balances(state, today).get('revolut').available, 2000);
  assert.throws(() => add(events, change('movements', 'overpay', { ...payment, cents: 601 })), /exceed/);
});

test('subscription payments can reuse an existing movement and recurrence preserves the billing day', () => {
  const charge = parseQuick('-45 Ginásio, Bank', today).draft;
  const sub = { name: 'Gym', cents: 4500, account: 'bank', frequency: 'monthly', active: true, next: '2026-12-31', billingDay: 31,
    payments: [{ cycle: today, movement: 'gym' }] };
  const events = add([], change('movements', 'gym', charge), change('subscriptions', 'gym-sub', sub));
  assert.equal(monthReport(financeState(events), '2026-11', today).expenses, 4500);
  assert.throws(() => add(events, change('subscriptions', 'duplicate', sub)), /Unlink/);
  assert.equal(nextCharge('2027-01-31', 'monthly', 31), '2027-02-28');
  assert.equal(nextCharge('2027-02-28', 'monthly', 31), '2027-03-31');
});

test('Finance restores an exact history without replacing a different ledger', () => {
  const { draft } = parseQuick('-3.57 Uber, Bank, pending', today);
  const initial = add([], change('movements', 'ride', draft));
  const latest = add(initial, change('movements', 'ride', { ...draft, status: 'processed' }, draft));
  const backup = { format: 'the-hub-finance', version: 1, currency: 'EUR', events: latest };
  assert.deepEqual(prepareFinanceRestore(initial, backup).events, latest);
  assert.equal(prepareFinanceRestore(latest, backup).added, 0);
  assert.deepEqual(prepareFinanceRestore(latest, { ...backup, events: initial }).events, latest);
  assert.throws(() => prepareFinanceRestore(add([], change('movements', 'another', draft)), backup), /different history/);
  assert.throws(() => prepareFinanceRestore([], { ...backup, currency: 'USD' }), /Finance backup in EUR/);
});

test('Finance previews transfers and rejects invalid lines before importing', () => {
  const text = '2026-11-25 | Gym reimbursement transfer | +45.00 | Coverflex Benefits -> Bank | Transfer | Processed | Internal Transfer';
  const [entry] = previewFinanceMovements([], text, today).entries;
  assert.deepEqual([entry.kind, entry.account, entry.destination, entry.cents], ['transfer', 'benefits', 'bank', 4500]);
  assert.throws(() => previewFinanceMovements([], text.replace('2026-11-25', '2026-11-26'), today), /Line 1: Enter a date/);
});
