import { lisbonDay } from './routine-model.mjs?v=finance-1';
import { validDay } from './habits-model.mjs?v=finance-1';

export { lisbonDay };
export const accounts = [
  { id: 'bank', name: 'Bank', aliases: ['bank'] },
  { id: 'revolut', name: 'Revolut', aliases: ['revolut'] },
  { id: 'food', name: 'Coverflex Alimentação', aliases: ['alimentacao', 'coverflex alimentacao'] },
  { id: 'benefits', name: 'Coverflex Benefícios', aliases: ['beneficios', 'coverflex beneficios'] },
  { id: 'cash', name: 'Dinheiro físico', aliases: ['dinheiro', 'dinheiro fisico', 'cash'] }
];
export const financeLimit = 450000;
const collections = ['movements', 'confirmations', 'receivables', 'subscriptions'];
const knownAccount = id => accounts.some(account => account.id === id);
const key = /^[a-z0-9-]{1,70}$/;
const amount = value => Number.isSafeInteger(value) && Math.abs(value) <= 99999999999;
const positive = value => amount(value) && value > 0;
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const normalized = value => value.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const fail = message => { throw new Error(message); };

export function parseMoney(input) {
  let value = String(input).trim().replace(/^€\s*|\s*€$/g, '').replace(/\s/g, '');
  if (/^[+-]?\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(value)) value = value.replaceAll('.', '');
  const match = /^([+-]?)(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(value);
  if (!match) fail('Enter a valid amount with up to two decimal places.');
  return (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 100 + Number((match[3] || '').padEnd(2, '0')));
}

export function splitAmount(total, value) {
  const input = value.trim();
  const fraction = /^(\d{1,6})\s*\/\s*(\d{1,6})$/.exec(input);
  if (fraction && Number(fraction[2]) > 0 && Number(fraction[1]) <= Number(fraction[2])) {
    return Math.round(total * (Number(fraction[1]) / Number(fraction[2])));
  }
  if (/^\d{1,3}(?:[.,]\d{1,2})?%$/.test(input)) {
    const rate = Number(input.slice(0, -1).replace(',', '.'));
    if (rate <= 100) return Math.round(total * rate / 100);
  }
  if (input.includes('/') || input.includes('%')) fail('Use a share such as 1/3, 25%, or a fixed amount.');
  return parseMoney(input);
}

export function parseQuick(input, date = lisbonDay()) {
  const match = /^([+-][\d.,]+)\s+(.+)$/.exec(input.trim());
  if (!match) fail('Start with a signed amount, for example -3,57 Uber, Bank.');
  const value = parseMoney(match[1]);
  const parts = match[2].split(',').map(part => part.trim());
  const description = parts.shift();
  const accountName = normalized(parts.shift() || '');
  const account = accounts.find(item => item.aliases.includes(accountName));
  if (!account) fail('Name the account after the description, for example Bank or Revolut.');
  const draft = { kind: value < 0 ? 'expense' : 'income', cents: Math.abs(value), description, category: value < 0 ? 'Other' : 'Income',
    account: account.id, date, status: 'processed' };
  let debt;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (/^(pending|pendente)$/i.test(part)) draft.status = 'pending';
    else if (/^(processed|processad[oa])$/i.test(part)) draft.status = 'processed';
    else if (/^categoria\s*:/i.test(part)) draft.category = part.slice(part.indexOf(':') + 1).trim();
    else {
      const owed = /^(.+?)\s+(?:deve[- ]me|owes me)\s+(.+)$/i.exec(part);
      if (!owed || debt || draft.kind !== 'expense') fail('Unrecognised detail. Use “pendente”, “categoria: W” or “Bea deve-me 1/3”.');
      const share = /^\d+$/.test(owed[2]) && /^\d{1,2}(?:\s*€)?$/.test(parts[i + 1] || '') ? `${owed[2]},${parts[++i]}` : owed[2];
      debt = { person: owed[1].trim(), cents: splitAmount(draft.cents, share) };
      if (!positive(debt.cents) || debt.cents > draft.cents) fail('The share must be positive and cannot exceed the expense.');
    }
  }
  validateRecord('movements', draft);
  return { draft, debt };
}

function validateRecord(collection, value) {
  if (!value || typeof value !== 'object') fail('Invalid record.');
  if (collection === 'movements') {
    if (!['expense', 'income', 'transfer', 'repayment'].includes(value.kind) || !positive(value.cents)
      || !text(value.description, 140) || !text(value.category, 50) || !knownAccount(value.account)
      || !validDay(value.date) || !['pending', 'processed'].includes(value.status)
      || value.postedOn && (value.kind !== 'expense' || value.status !== 'processed' || !validDay(value.postedOn) || value.postedOn < value.date)
      || value.status === 'pending' && value.kind !== 'expense'
      || value.kind === 'transfer' && (!knownAccount(value.destination) || value.destination === value.account)
      || value.kind === 'repayment' && !key.test(value.receivable || '')) fail('Check the movement amount, account, date and status.');
  } else if (collection === 'confirmations') {
    if (!knownAccount(value.account) || !validDay(value.date) || !amount(value.book) || !amount(value.available)
      || !amount(value.bookChange) || !amount(value.availableChange)) fail('Check the confirmed balances.');
  } else if (collection === 'receivables') {
    if (!text(value.person, 70) || !text(value.description, 140) || !positive(value.cents) || !validDay(value.date)
      || value.movement && !key.test(value.movement)) fail('Enter a person, a description and a valid amount.');
  } else if (collection === 'subscriptions') {
    if (!text(value.name, 70) || !positive(value.cents) || !knownAccount(value.account) || !validDay(value.next)
      || !['monthly', 'annual'].includes(value.frequency) || typeof value.active !== 'boolean'
      || !Number.isInteger(value.billingDay) || value.billingDay < 1 || value.billingDay > 31
      || !Array.isArray(value.payments) || value.payments.some(payment => !validDay(payment.cycle) || !key.test(payment.movement || ''))) fail('Check the subscription details.');
  } else fail('Unknown Finance record.');
}

export function financeState(events) {
  const state = Object.fromEntries(collections.map(name => [name, new Map()]));
  for (const event of events) {
    if (!event || !collections.includes(event.collection) || typeof event.id !== 'string' || !key.test(event.id)
      || !Number.isSafeInteger(event.at) || event.at < 0) fail('Unreadable Finance history.');
    const list = state[event.collection];
    if (event.value === null) list.delete(event.id);
    else { validateRecord(event.collection, event.value); list.set(event.id, event.value); }
  }
  return state;
}

export function readFinance(data) {
  if (data?.version !== 1 || !Number.isSafeInteger(data.revision) || data.revision < 1 || data.revision > 1000000000
    || typeof data.payload !== 'string' || new TextEncoder().encode(data.payload).length > financeLimit) fail('Unreadable Finance data.');
  const events = JSON.parse(data.payload);
  if (!Array.isArray(events)) fail('Unreadable Finance history.');
  financeState(events);
  return events;
}

export function balances(state, through = '9999-12-31') {
  const result = new Map(accounts.map(({ id }) => [id, { book: 0, available: 0, confirmed: null, pending: 0 }]));
  for (const confirmation of state.confirmations.values()) {
    if (confirmation.date > through) continue;
    const row = result.get(confirmation.account);
    row.book += confirmation.bookChange;
    row.available += confirmation.availableChange;
    if (!row.confirmed || row.confirmed.date <= confirmation.date) row.confirmed = confirmation;
  }
  for (const movement of state.movements.values()) {
    if (movement.date > through) continue;
    const row = result.get(movement.account);
    const sign = ['expense', 'transfer'].includes(movement.kind) ? -1 : 1;
    row.available += sign * movement.cents;
    if (movement.status === 'processed' && (!movement.postedOn || movement.postedOn <= through)) row.book += sign * movement.cents;
    else row.pending += movement.cents;
    if (movement.kind === 'transfer') {
      const to = result.get(movement.destination);
      to.available += movement.cents;
      to.book += movement.cents;
    }
  }
  return result;
}

export function remainingDebt(state, id) {
  const debt = state.receivables.get(id);
  if (!debt) return 0;
  return debt.cents - [...state.movements.values()].filter(item => item.kind === 'repayment' && item.receivable === id)
    .reduce((sum, item) => sum + item.cents, 0);
}

export function nextCharge(date, frequency, billingDay) {
  const from = new Date(date + 'T12:00:00Z');
  from.setUTCDate(1);
  from.setUTCMonth(from.getUTCMonth() + (frequency === 'annual' ? 12 : 1));
  const end = new Date(from);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  from.setUTCDate(Math.min(billingDay, end.getUTCDate()));
  return from.toISOString().slice(0, 10);
}

export function prepareFinanceChanges(events, changes, at = Date.now()) {
  const state = financeState(events);
  const next = [...events];
  for (const change of changes) {
    const { collection, id, value } = change;
    if (!collections.includes(collection) || typeof id !== 'string' || !key.test(id)) fail('Invalid Finance change.');
    const list = state[collection];
    const existing = JSON.stringify(list.get(id) ?? null);
    if (existing === JSON.stringify(value)) continue;
    if (existing !== JSON.stringify(change.before ?? null)) fail('This record changed on another device. Reopen it and try again.');
    if (value === null) list.delete(id);
    else { validateRecord(collection, value); list.set(id, value); }
    next.push({ collection, id, value, at });
  }
  for (const [id, debt] of state.receivables) {
    const expense = debt.movement && state.movements.get(debt.movement);
    if (debt.movement && (expense?.kind !== 'expense' || expense.cents < debt.cents)) fail('Update or unlink the associated debt before changing this expense.');
    if (remainingDebt(state, id) < 0) fail('Payments would exceed the amount owed.');
  }
  const linked = new Set();
  const shared = new Map();
  for (const debt of state.receivables.values()) if (debt.movement) {
    const total = (shared.get(debt.movement) || 0) + debt.cents;
    if (total > state.movements.get(debt.movement).cents) fail('Total shares cannot exceed the expense.');
    shared.set(debt.movement, total);
  }
  for (const movement of state.movements.values()) {
    if (movement.kind === 'repayment' && !state.receivables.has(movement.receivable)) fail('Remove the linked repayments before deleting this debt.');
  }
  for (const sub of state.subscriptions.values()) for (const payment of sub.payments) {
    const movement = state.movements.get(payment.movement);
    if (linked.has(payment.movement) || movement?.kind !== 'expense' || movement.status !== 'processed') {
      fail('Unlink the subscription payment before changing or deleting that movement.');
    }
    linked.add(payment.movement);
  }
  const payload = JSON.stringify(next);
  if (new TextEncoder().encode(payload).length > financeLimit) fail('The ledger is full. You can still view and export your history.');
  return { events: next, payload };
}

export function monthReport(state, month, today = lisbonDay()) {
  const [year, number] = month.split('-').map(Number);
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const end = `${month}-${days}`;
  const elapsed = month === today.slice(0, 7) ? Number(today.slice(8)) : days;
  let income = 0, expenses = 0, pending = 0, repayments = 0;
  const categories = new Map();
  for (const item of state.movements.values()) {
    if (!(item.postedOn || item.date).startsWith(month)) continue;
    if (item.kind === 'income') income += item.cents;
    else if (item.kind === 'repayment') repayments += item.cents;
    else if (item.kind === 'expense') {
      if (item.status === 'pending') pending += item.cents;
      else {
        expenses += item.cents;
        categories.set(item.category, (categories.get(item.category) || 0) + item.cents);
      }
    }
  }
  const available = [...balances(state, end).values()].reduce((sum, row) => sum + row.available, 0);
  return { income, expenses, pending, repayments, categories, available, average: Math.round(expenses / elapsed) };
}
