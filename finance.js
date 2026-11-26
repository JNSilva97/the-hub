function createFinance(panel) {
  const el = id => document.getElementById(`finance-${id}`);
  const editor = el('editor');
  const currency = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });
  const monthFormat = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' });
  const reportMonthFormat = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const money = cents => currency.format(cents / 100);
  let model, account, owner, view = 'overview', month, query = '', accountFilter = '', categoryFilter = '';
  let state, busy = false, action, notice = '', unavailable = '';
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const nameOf = id => model.accounts.find(item => item.id === id)?.name ?? id;
  const writable = () => Boolean(account?.canWrite && !busy);
  const id = () => crypto.randomUUID();
  const today = () => model.lisbonDay();
  const dateField = date => ({ type: 'date', value: date || today(), required: true, max: today() });
  const amountField = value => ({ value: value === undefined ? '' : (value / 100).toFixed(2), inputMode: 'decimal', required: true, maxLength: 24 });
  const fieldText = (value, limit, required = true) => ({ value: value || '', maxLength: limit, required });
  const accountOptions = () => model.accounts.map(({ id, name }) => [id, name]);
  const change = (collection, id, value, before = null) => ({ collection, id, value, before });
  function button(label, run, needsWrite = false) {
    const element = node('button', label);
    element.type = 'button';
    element.disabled = needsWrite && !writable();
    element.addEventListener('click', run);
    return element;
  }
  function field(label, name, properties = {}, options) {
    const control = node(options ? 'select' : 'input');
    control.name = name;
    control.setAttribute('aria-label', label);
    if (options) for (const [value, caption] of options) control.add(new Option(caption, value));
    Object.assign(control, properties);
    const wrapper = node('label', label);
    wrapper.append(control);
    el('fields').append(wrapper);
    return control;
  }
  function explain(text) { el('fields').append(node('p', text, 'finance-muted')); }
  function actions(...buttons) {
    const row = node('div', '', 'finance-actions');
    row.append(...buttons);
    return row;
  }
  function openForm(title, saveLabel, build, submit, readOnly = false) {
    if (!readOnly && !writable()) return;
    el('editor-title').textContent = title;
    el('save').textContent = saveLabel;
    el('save').hidden = readOnly;
    el('cancel').textContent = readOnly ? 'Close' : 'Cancel';
    el('form-status').textContent = '';
    el('fields').replaceChildren();
    action = submit;
    build();
    if (!editor.open) editor.showModal();
    editor.scrollTop = 0;
    (el('fields').querySelector('input, select, textarea') ?? el('cancel')).focus();
  }
  function closeEditor() { if (!busy && editor.open) editor.close(); }
  function confirm(title, message, submit) {
    openForm(title, title, () => explain(message), submit);
  }
  function summary(title, value, detail) {
    const item = node('div', '', 'finance-metric');
    item.append(node('h4', title), node('strong', value));
    if (detail) item.append(node('small', detail));
    return item;
  }
  function section(title) {
    const block = node('section', '', 'finance-section');
    block.append(node('h3', title));
    return block;
  }
  function listRow(title, detail, value, ...controls) {
    const row = node('article', '', 'finance-row');
    const heading = node('div');
    heading.append(node('strong', title), node('small', detail));
    row.append(heading, node('span', value, 'finance-row-value'));
    if (controls.length) row.append(actions(...controls));
    return row;
  }
  function monthInput(container) {
    const [year, number] = month.split('-').map(Number);
    const [currentYear, currentMonth] = today().slice(0, 7).split('-').map(Number);
    const controls = node('div', '', 'finance-month');
    const addSelect = (caption, values, selected, update) => {
      const label = node('label', caption, 'finance-filter');
      const select = node('select');
      select.setAttribute('aria-label', caption);
      for (const [value, text] of values) select.add(new Option(text, value));
      select.value = selected;
      select.addEventListener('change', () => {
        const [nextYear, nextMonth] = update(Number(select.value));
        month = nextYear + '-' + String(nextMonth).padStart(2, '0');
        render();
        el('view').querySelector(`[aria-label="${caption}"]`)?.focus();
      });
      label.append(select);
      controls.append(label);
    };
    addSelect('Month', Array.from({ length: year === currentYear ? currentMonth : 12 }, (_, index) =>
      [index + 1, monthFormat.format(new Date(Date.UTC(2000, index, 1)))]), number, value => [year, value]);
    addSelect('Year', Array.from({ length: currentYear - 1899 }, (_, index) =>
      [currentYear - index, String(currentYear - index)]), year,
    value => [value, value === currentYear ? Math.min(number, currentMonth) : number]);
    container.append(controls);
  }
  function accountIcon(accountId) {
    const namespace = 'http://www.w3.org/2000/svg';
    const icon = document.createElementNS(namespace, 'svg');
    const symbol = document.createElementNS(namespace, 'use');
    icon.setAttribute('class', 'finance-account-icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('viewBox', '0 0 24 24');
    symbol.setAttribute('href', `#finance-account-${accountId}`);
    icon.append(symbol);
    return icon;
  }
  function previousMonth(value) {
    const [year, number] = value.split('-').map(Number);
    return new Date(Date.UTC(year, number - 2, 1)).toISOString().slice(0, 7);
  }
  function drawOverview(container) {
    const current = today();
    const currentMonth = current.slice(0, 7);
    const balances = model.balances(state, current);
    const total = [...balances.values()].reduce((sum, row) => sum + row.available, 0);
    const confirmedCount = [...balances.values()].filter(row => row.confirmed).length;
    const owing = [...state.receivables.keys()].reduce((sum, key) => sum + model.remainingDebt(state, key), 0);
    const pending = [...balances.values()].reduce((sum, row) => sum + row.pending, 0);
    const stats = node('div', '', 'finance-grid');
    stats.append(summary('Available across accounts', confirmedCount || total ? money(total) : '—', `${confirmedCount} of 5 balances confirmed · includes Coverflex`),
      summary('Pending expenses', money(pending)), summary('To receive', money(owing), 'Outside available balances'));
    container.append(stats);
    const accountBlock = section('Accounts');
    const cards = node('div', '', 'finance-grid');
    for (const { id, name } of model.accounts) {
      const row = balances.get(id);
      const title = id === 'bank' ? 'Bank · Authorized balance' : name;
      const item = summary(title, row.confirmed || row.available ? money(row.available) : '—', row.confirmed
        ? `Calculated · confirmed ${row.confirmed.date} at ${money(row.confirmed.available)}` : 'Opening balance not confirmed');
      if (id === 'bank' || row.book !== row.available) item.append(node('small', `Book balance ${row.confirmed || row.book ? money(row.book) : '—'}`));
      item.querySelector('h4').prepend(accountIcon(id));
      item.append(button(row.confirmed ? 'Reconcile' : 'Confirm balance', () => reconcile(id), true));
      cards.append(item);
    }
    accountBlock.append(cards);
    container.append(accountBlock);

    const report = section('Monthly report');
    monthInput(report);
    const totals = model.monthReport(state, month, current);
    const previous = model.monthReport(state, previousMonth(month), current);
    const figures = node('div', '', 'finance-grid');
    const delta = totals.expenses - previous.expenses;
    figures.append(summary('Income', money(totals.income)), summary('Processed expenses', money(totals.expenses), `${delta > 0 ? '+' : ''}${money(delta)} vs previous month`),
      summary('Average per day', money(totals.average)), summary('Pending in month', money(totals.pending)), summary('Repayments received', money(totals.repayments)));
    const categories = node('ul', '', 'finance-totals');
    for (const [category, value] of [...totals.categories].sort((a, b) => b[1] - a[1])) categories.append(node('li', `${category} · ${money(value)}`));
    const evolution = node('ul', '', 'finance-totals');
    let period = currentMonth;
    for (let i = 0; i < 6; i++, period = previousMonth(period)) {
      const balance = [...model.balances(state, `${period}-${period === currentMonth ? current.slice(-2) : '31'}`).values()];
      if (balance.every(row => !row.confirmed && !row.available && !row.book)) continue;
      const estimate = balance.reduce((sum, row) => sum + row.available, 0);
      evolution.prepend(node('li', `${reportMonthFormat.format(new Date(period + '-01T00:00:00Z'))} · ${money(estimate)}`));
    }
    report.append(figures, node('h4', 'Expenses by category'), categories.children.length ? categories : node('p', 'No processed expenses this month.', 'finance-muted'),
      node('h4', 'Available balance over time'), evolution.children.length ? evolution : node('p', 'Confirm a balance to start tracking it.', 'finance-muted'));
    container.append(report);
  }
  function drawActivity(container) {
    const block = section('Movement history');
    const filters = node('div', '', 'finance-filters');
    monthInput(filters);
    const choices = [...new Set([...state.movements.values()].map(item => item.category))].sort();
    for (const [caption, options, value, update] of [
      ['Account', [['', 'All accounts'], ...accountOptions()], accountFilter, next => { accountFilter = next; }],
      ['Category', [['', 'All categories'], ...choices.map(item => [item, item])], categoryFilter, next => { categoryFilter = next; }]
    ]) {
      const label = node('label', caption, 'finance-filter');
      const input = node('select');
      for (const [key, text] of options) input.add(new Option(text, key));
      input.value = options.some(([key]) => key === value) ? value : '';
      input.addEventListener('change', () => { update(input.value); populate(); });
      label.append(input); filters.append(label);
    }
    const searchLabel = node('label', 'Search', 'finance-filter');
    const search = node('input'); search.type = 'search'; search.value = query;
    search.addEventListener('input', () => { query = search.value; populate(); });
    searchLabel.append(search); filters.append(searchLabel);
    const list = node('div');
    function populate() {
      const entries = [...state.movements.entries()].filter(([, item]) => (item.date.startsWith(month) || item.postedOn?.startsWith(month))
        && (!accountFilter || item.account === accountFilter || item.destination === accountFilter)
        && (!categoryFilter || item.category === categoryFilter)
        && `${item.description} ${item.category}`.toLowerCase().includes(query.trim().toLowerCase()))
        .sort((a, b) => b[1].date.localeCompare(a[1].date));
      list.replaceChildren(...entries.map(([key, entry]) => {
        const detail = [entry.date, nameOf(entry.account), entry.destination && `→ ${nameOf(entry.destination)}`, entry.category,
          entry.status === 'pending' && 'Pending', entry.postedOn && `Posted ${entry.postedOn}`].filter(Boolean).join(' · ');
        const sign = entry.kind === 'transfer' ? '' : entry.kind === 'expense' ? '−' : '+';
        const manage = [button('Edit', () => movementForm(entry.kind, key, entry), true)];
        if (entry.status === 'pending') manage.unshift(button('Process', () => processMovement(key, entry), true));
        manage.push(button('Delete', () => confirm('Delete movement', `Remove “${entry.description}” from balances and reports? Its corrections stay in the history export.`,
          () => save([change('movements', key, null, entry)])), true));
        return listRow(entry.description, detail, sign + money(entry.cents), ...manage);
      }));
      if (!entries.length) list.append(node('p', 'No movements match these filters.', 'finance-muted'));
    }
    populate();
    block.append(filters, list);
    const corrections = state.events.filter(event => event.collection === 'movements' || event.collection === 'confirmations');
    const history = node('details', '', 'finance-corrections');
    history.append(node('summary', 'Recent corrections'));
    const seen = new Set();
    const changes = corrections.filter(event => {
      const changed = seen.has(event.id) || event.collection === 'confirmations';
      seen.add(event.id);
      return changed;
    });
    for (const event of changes.slice(-12).reverse()) {
      const label = event.collection === 'confirmations' ? `Confirmed ${nameOf(event.value.account)} · ${money(event.value.available)} available`
        : event.value ? `Updated ${event.value.description} · ${event.value.status}` : 'Movement deleted';
      history.append(node('p', `${new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', dateStyle: 'short', timeStyle: 'short' }).format(event.at)} · ${label}`));
    }
    block.append(history);
    container.append(block);
  }

  function drawReceivables(container) {
    const block = section('Money to receive');
    block.append(button('Add amount owed', () => debtForm(), true));
    for (const [key, debt] of state.receivables) {
      const remaining = model.remainingDebt(state, key);
      const linked = debt.movement && state.movements.get(debt.movement);
      const controls = [button('Edit', () => debtForm(key, debt), true)];
      if (remaining > 0) controls.unshift(button('Record payment', () => repaymentForm(key, debt), true));
      controls.push(button('Delete', () => confirm('Delete amount owed', `Remove the amount owed by ${debt.person}?`,
        () => save([change('receivables', key, null, debt)])), true));
      block.append(listRow(debt.person, `${debt.description} · ${linked ? linked.description + ' · ' : ''}${remaining ? money(debt.cents - remaining) + ' received' : 'Paid in full'}`,
        money(remaining), ...controls));
    }
    if (!state.receivables.size) block.append(node('p', 'No amounts owed yet.', 'finance-muted'));
    container.append(block);
  }
  function drawSubscriptions(container) {
    const block = section('Subscriptions');
    const active = [...state.subscriptions.values()].filter(item => item.active);
    const annual = active.reduce((sum, item) => sum + item.cents * (item.frequency === 'monthly' ? 12 : item.frequency === 'annual' ? 1 : 0), 0);
    const monthEnd = today().slice(0, 7) + '-31';
    const due = active.filter(item => item.next && item.next <= monthEnd).reduce((sum, item) => sum + item.cents, 0);
    const totals = node('div', '', 'finance-grid');
    totals.append(summary('Monthly equivalent', money(Math.round(annual / 12))), summary('Annual equivalent', money(annual)), summary('Upcoming through month end', money(due), 'Includes overdue charges with a known date'));
    block.append(totals, button('Add subscription', () => subscriptionForm(), true));
    for (const [key, sub] of state.subscriptions) {
      const controls = [button('Edit', () => subscriptionForm(key, sub), true)];
      if (sub.active && sub.account) controls.unshift(button('Record charge', () => chargeForm(key, sub), true));
      if (sub.payments.length) controls.push(button('Payment history', () => paymentHistory(key, sub)));
      const frequency = { monthly: 'Monthly', annual: 'Annual' }[sub.frequency] || 'Frequency unknown';
      const schedule = sub.active ? sub.next ? 'Next ' + sub.next : 'Next charge unknown' : 'Cancelled';
      const details = [frequency, sub.account ? nameOf(sub.account) : 'Payment account unknown',
        sub.prepaidThrough && 'Prepaid through ' + sub.prepaidThrough, schedule, sub.note].filter(Boolean);
      block.append(listRow(sub.name, details.join(' · '), money(sub.cents), ...controls));
    }
    if (!state.subscriptions.size) block.append(node('p', 'No subscriptions yet.', 'finance-muted'));
    container.append(block);
  }
  function render() {
    el('signin').hidden = Boolean(account?.uid);
    el('retry').hidden = !account?.error && !unavailable;
    el('status').textContent = unavailable || account?.error || (busy ? 'Saving…' : notice || (!account?.uid
      ? 'Sign in to open your private Finance ledger.' : !account.ready ? 'Loading Finance…'
      : account.canWrite ? '' : 'Read-only copy. Connect to save changes.'));
    el('content').hidden = !model || !account?.ready;
    el('add').disabled = el('transfer').disabled = !writable();
    el('close').disabled = busy;
    for (const name of ['save', 'cancel', 'editor-close']) el(name).disabled = busy || name === 'save' && !writable();
    if (!model || !account?.ready || !panel.open || editor.open) return;
    state = { ...model.financeState(account.events), events: account.events };
    month ??= today().slice(0, 7);
    for (const button of panel.querySelectorAll('[data-finance-view]')) button.setAttribute('aria-pressed', String(button.dataset.financeView === view));
    const container = el('view');
    container.replaceChildren();
    ({ overview: drawOverview, activity: drawActivity, receivables: drawReceivables, subscriptions: drawSubscriptions })[view](container);
  }

  function movementPreview() {
    openForm('Add movement', 'Review', () => {
      field('Quick entry', 'line', { placeholder: '-3.57 Uber, Bank, pending', required: true, maxLength: 270 });
      explain('Start with + or −. Add the description and account, separated by commas. You can add “pending”, “category: W” or “Bea owes me 1/3”.');
      el('fields').append(button('Enter manually', () => movementForm('expense')));
    }, values => {
      const { draft, debt } = model.parseQuick(values.line.replace(/^−/, '-'));
      movementForm(draft.kind, undefined, draft, debt);
    });
  }
  function movementForm(kind, key, entry = {}, debt) {
    const existing = key ? entry : null;
    const movementId = key || id();
    const debtId = debt && id();
    const transfer = kind === 'transfer';
    const repayment = kind === 'repayment';
    openForm(transfer ? 'Transfer between accounts' : key ? 'Edit movement' : 'Review movement', 'Save movement', () => {
      if (!transfer && !repayment) field('Type', 'kind', { value: kind }, [['expense', 'Expense'], ['income', 'Income']]);
      field('Amount (€)', 'amount', amountField(entry.cents));
      field(transfer ? 'From account' : 'Account', 'account', { value: entry.account || 'bank' }, accountOptions());
      if (transfer) field('To account', 'destination', { value: entry.destination || 'revolut' }, accountOptions());
      field('Description', 'description', { ...fieldText(entry.description || (transfer ? 'Transfer' : ''), 140) });
      if (!transfer && !repayment) {
        field('Category', 'category', fieldText(entry.category || 'Other', 50));
        const status = field('Status', 'status', { value: entry.status || 'processed' }, [['processed', 'Processed'], ['pending', 'Pending']]);
        const type = el('form').elements.kind;
        const updateType = () => {
          if (type.value === 'income') status.value = 'processed';
          status.disabled = type.value !== 'expense';
        };
        type.addEventListener('change', updateType); updateType();
      }
      field('Date', 'date', dateField(entry.date));
      if (debt) explain(`${debt.person} owes you ${money(debt.cents)}. The amount owed will be saved with this movement.`);
    }, values => {
      const value = { kind: values.kind || kind, cents: model.parseMoney(values.amount), account: values.account, date: values.date,
        description: values.description.trim(), category: values.category?.trim() || (transfer ? 'Transfer' : 'Repayment'), status: values.status || 'processed' };
      if (transfer) value.destination = values.destination;
      if (repayment) value.receivable = entry.receivable;
      if (value.kind === 'expense' && value.status === 'processed') {
        if (entry.status === 'pending') value.postedOn = today();
        else if (entry.postedOn) value.postedOn = entry.postedOn;
      }
      const changes = [change('movements', movementId, value, existing)];
      if (debt) changes.push(change('receivables', debtId, { ...debt, description: value.description, movement: movementId, date: value.date }));
      return save(changes);
    });
  }
  function processMovement(key, entry) {
    confirm('Process movement', `Mark “${entry.description}” as processed. Its amount moves into the book balance; the available balance already includes it.`,
      () => save([change('movements', key, { ...entry, status: 'processed', postedOn: today() }, entry)]));
  }
  function reconcile(accountId) {
    const date = today();
    const before = model.balances(state, date).get(accountId);
    const revision = account.revision;
    const confirmationId = id();
    openForm(`Confirm ${nameOf(accountId)} balance`, 'Review difference', () => {
      explain(`Calculated today: ${money(before.available)} available${accountId === 'bank' || before.book !== before.available ? ` · ${money(before.book)} book` : ''}.`);
      if (!before.confirmed) explain('Enter the real balance as of now, including any movements already reflected in it.');
      if (accountId === 'bank') field('Book balance (€)', 'book', amountField(undefined));
      field(accountId === 'bank' ? 'Authorized balance (€)' : 'Available balance (€)', 'available', amountField(undefined));
    }, values => {
      const available = model.parseMoney(values.available);
      const book = accountId === 'bank' ? model.parseMoney(values.book) : available + before.book - before.available;
      const correction = { date, account: accountId, book, available, bookChange: book - before.book, availableChange: available - before.available };
      confirm('Confirm balances', `Difference: ${money(correction.availableChange)} available${accountId === 'bank' ? ` · ${money(correction.bookChange)} book` : ''}. This confirmation will be stored in the audit history.`,
        () => save([change('confirmations', confirmationId, correction)], revision));
    });
  }
  function debtForm(key, entry = {}) {
    const debtId = key || id();
    const options = [['', 'No linked expense'], ...[...state.movements].filter(([, item]) => item.kind === 'expense')
      .map(([id, item]) => [id, `${item.date} · ${item.description} · ${money(item.cents)}`])];
    openForm(key ? 'Edit amount owed' : 'Add amount owed', 'Save amount owed', () => {
      field('Person', 'person', fieldText(entry.person, 70));
      field('Description', 'description', fieldText(entry.description, 140));
      field('Linked expense', 'movement', { value: entry.movement || '' }, options);
      field('Amount (€) or share (1/3, 25%)', 'share', { ...amountField(entry.cents), inputMode: 'text' });
      field('Date', 'date', dateField(entry.date));
    }, values => {
      const expense = state.movements.get(values.movement);
      const cents = expense ? model.splitAmount(expense.cents, values.share) : model.parseMoney(values.share);
      return save([change('receivables', debtId, { person: values.person.trim(), description: values.description.trim(),
        movement: values.movement || null, date: values.date, cents }, key ? entry : null)]);
    });
  }
  function repaymentForm(key, debt) {
    const remaining = model.remainingDebt(state, key);
    const movementId = id();
    openForm(`Payment from ${debt.person}`, 'Save payment', () => {
      field('Amount received (€)', 'amount', amountField(remaining));
      field('Received in', 'account', { value: 'bank' }, accountOptions());
      field('Date', 'date', dateField());
    }, values => save([change('movements', movementId, { kind: 'repayment', receivable: key, cents: model.parseMoney(values.amount),
      description: `Payment from ${debt.person}`, category: 'Repayment', account: values.account, date: values.date, status: 'processed' })]));
  }
  function subscriptionForm(key, entry = {}) {
    const subscriptionId = key || id();
    openForm(key ? 'Edit subscription' : 'Add subscription', 'Save subscription', () => {
      field('Name', 'name', fieldText(entry.name, 70));
      field('Amount (€)', 'amount', amountField(entry.cents));
      field('Paid from', 'account', { value: entry.account ?? '' }, [['', 'Unknown'], ...accountOptions()]);
      field('Frequency', 'frequency', { value: entry.frequency ?? '' }, [['', 'Unknown'], ['monthly', 'Monthly'], ['annual', 'Annual']]);
      field('Next charge', 'next', { type: 'date', value: entry.next || '' });
      explain('Leave the next charge blank if the date is unknown. A scheduled charge needs a frequency.');
      field('Prepaid through', 'prepaid', { type: 'date', value: entry.prepaidThrough || '' });
      field('Notes', 'note', fieldText(entry.note, 240, false));
      field('Status', 'active', { value: String(entry.active ?? true) }, [['true', 'Active'], ['false', 'Cancelled']]);
    }, values => save([change('subscriptions', subscriptionId, { name: values.name.trim(), cents: model.parseMoney(values.amount), account: values.account || null,
      frequency: values.frequency || null, next: values.next || null,
      billingDay: values.next ? values.next === entry.next ? entry.billingDay : Number(values.next.slice(-2)) : null,
      prepaidThrough: values.prepaid || null, note: values.note.trim() || null,
      active: values.active === 'true', payments: entry.payments || [] }, key ? entry : null)]));
  }
  function chargeForm(key, sub) {
    const movementId = id();
    const linked = new Set([...state.subscriptions.values()].flatMap(item => item.payments.map(payment => payment.movement)));
    const existing = [...state.movements].filter(([id, item]) => !linked.has(id) && item.account === sub.account && item.cents === sub.cents
      && item.kind === 'expense' && item.status === 'processed').map(([id, item]) => [id, `${item.date} · ${item.description}`]);
    const options = [...(existing.length ? [['', 'Choose how to record it']] : []), ['new', 'Create a new movement'], ...existing];
    openForm(`Record ${sub.name} charge`, 'Save charge', () => {
      const schedule = sub.next ? `Scheduled for ${sub.next} · ` : '';
      explain(`${schedule}${money(sub.cents)} from ${nameOf(sub.account)}. Link an existing expense if it was already logged.`);
      const match = field('Movement', 'existing', { value: existing.length ? '' : 'new', required: true }, options);
      const date = field('Payment date', 'date', dateField());
      const update = () => { date.disabled = match.value !== 'new'; };
      match.addEventListener('change', update); update();
    }, values => {
      const create = values.existing === 'new';
      const movement = create ? movementId : values.existing;
      const changes = create ? [change('movements', movement, { kind: 'expense', description: sub.name,
        category: 'Subscriptions', cents: sub.cents, account: sub.account, date: values.date, status: 'processed' })] : [];
      const cycle = sub.next || (create ? values.date : state.movements.get(movement)?.date);
      if (sub.payments.some(payment => payment.cycle === cycle)) throw new Error('This charge is already linked to a movement.');
      const payment = sub.next ? { cycle, movement } : { cycle, movement, unscheduled: true };
      const next = sub.next && model.nextCharge(sub.next, sub.frequency, sub.billingDay);
      changes.push(change('subscriptions', key, { ...sub, next, payments: [...sub.payments, payment] }, sub));
      return save(changes);
    });
  }
  function paymentHistory(key, sub) {
    openForm(`${sub.name} payments`, '', () => {
      for (const payment of [...sub.payments].reverse()) {
        const movement = state.movements.get(payment.movement);
        explain(`${payment.cycle} · ${movement ? 'Paid ' + movement.date + ' · ' + money(movement.cents) : 'Movement unavailable'}`);
      }
      if (!writable()) return;
      const recent = sub.payments.at(-1);
      const restoreSchedule = !recent.unscheduled && sub.frequency;
      el('fields').append(button('Unlink latest charge', () => confirm('Unlink latest charge',
        restoreSchedule ? 'The expense stays in your movements. The scheduled charge becomes due again.' : 'The expense stays in your movements.',
        () => save([change('subscriptions', key, { ...sub, next: restoreSchedule ? recent.cycle : sub.next,
          billingDay: restoreSchedule ? sub.billingDay ?? Number(recent.cycle.slice(-2)) : sub.billingDay,
          payments: sub.payments.slice(0, -1) }, sub)]))));
    }, undefined, true);
    el('cancel').textContent = 'Close history';
  }
  function save(changes, revision) {
    return saveFinance(() => account.save(changes, revision));
  }
  async function saveFinance(write, message = 'Saved.') {
    busy = true; notice = '';
    render();
    try {
      await write();
      notice = message;
      busy = false;
      closeEditor();
    } finally { busy = false; render(); }
  }
  el('form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!writable() || !action) return;
    el('form-status').textContent = '';
    try { await action(Object.fromEntries(new FormData(el('form')))); }
    catch (error) { el('form-status').textContent = error.message; }
  });
  for (const name of ['cancel', 'editor-close']) el(name).addEventListener('click', closeEditor);
  editor.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  editor.addEventListener('close', () => { if (!editor.open) { action = undefined; el('fields').replaceChildren(); render(); } });
  panel.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  for (const tab of panel.querySelectorAll('[data-finance-view]')) tab.addEventListener('click', () => { view = tab.dataset.financeView; render(); });
  el('add').addEventListener('click', movementPreview);
  el('transfer').addEventListener('click', () => movementForm('transfer'));
  el('signin').addEventListener('click', () => { panel.close(); document.getElementById('account-launch').click(); });
  el('retry').addEventListener('click', () => { if (account) account.retry(); else location.reload(); });
  function exportBackup() {
    if (!account?.ready) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ format: 'the-hub-finance', version: 1, currency: 'EUR', events: account.events }, null, 2)], { type: 'application/json' }));
    const link = node('a'); link.href = url; link.download = `the-hub-finance-${today()}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function backupMenu() {
    openForm('Backup & Import', '', () => {
      explain('Download a private JSON backup of your Finance history, restore a backup, or paste several movements at once.');
      el('fields').append(actions(button('Export backup', exportBackup), button('Import backup', restoreForm, true),
        button('Import movements', () => movementsImportForm(), true)));
    }, undefined, true);
  }
  function restoreForm() {
    openForm('Import backup', 'Review backup', () => {
      field('Finance backup file', 'backup', { type: 'file', accept: '.json,application/json', required: true });
      explain('Restore a full backup into an empty ledger or recover newer records from the same history.');
    }, async ({ backup: file }) => {
      const uid = account.uid;
      const formAction = action;
      if (file.size > 2_000_000) throw new Error('Choose a Finance backup smaller than 2 MB.');
      const text = await file.text();
      if (uid !== account.uid || action !== formAction || !editor.open) return;
      let backup;
      try { backup = JSON.parse(text); }
      catch { throw new Error('This file is not valid JSON. Choose an exported Finance backup.'); }
      const revision = account.revision;
      const preview = model.prepareFinanceRestore(account.events, backup);
      if (!preview.added) throw new Error('This backup has no new history to restore.');
      const { movements, confirmations, receivables, subscriptions } = preview.counts;
      openForm('Review backup', 'Restore backup', () => {
        explain('Backup contents');
        const counts = node('ul', '', 'finance-totals');
        for (const [label, count] of [['Movements', movements], ['Balance records', confirmations], ['Receivables', receivables], ['Subscriptions', subscriptions]]) {
          counts.append(node('li', `${label}: ${count}`));
        }
        el('fields').append(counts);
        explain(`${preview.added} history entries to restore, including corrections and links.`);
      }, () => saveFinance(() => account.restore(backup, revision), 'Finance backup restored.'));
    });
  }
  function movementsImportForm(source = '') {
    openForm('Import movements', 'Review movements', () => {
      const label = node('label', 'Movement list');
      const input = node('textarea');
      input.name = 'movements';
      input.rows = 6;
      input.maxLength = 100000;
      input.required = true;
      input.value = source;
      label.append(input);
      el('fields').append(label);
      explain('Date | Description | Amount (EUR) | Account | Type | Status | Category');
      explain('Use YYYY-MM-DD dates and a minus sign for expenses. For a transfer, use Source -> Destination in the Account column.');
    }, ({ movements }) => {
      const revision = account.revision;
      const preview = model.previewFinanceMovements(account.events, movements, today());
      const changes = preview.entries.map(entry => change('movements', id(), entry));
      model.prepareFinanceChanges(account.events, changes);
      openForm('Review movements', changes.length ? 'Import movements' : '', () => {
        explain(`${changes.length} new movements · ${preview.duplicates} already in Finance · ${preview.undated.length} without a date`);
        if (preview.undated.length) explain(`Skipped without a date: ${preview.undated.join(', ')}.`);
        const list = node('div', '', 'finance-import-preview');
        for (const entry of preview.entries) {
          const detail = [entry.date, nameOf(entry.account), entry.destination && '→ ' + nameOf(entry.destination),
            entry.status === 'pending' ? 'Pending' : 'Processed', entry.category].filter(Boolean).join(' · ');
          list.append(listRow(entry.description, detail, money(entry.kind === 'expense' ? -entry.cents : entry.cents)));
        }
        if (changes.length) el('fields').append(list);
        el('fields').append(button('Back to list', () => movementsImportForm(movements)));
      }, () => saveFinance(() => account.importMovements(changes, revision), `${changes.length} movements imported.`), !changes.length);
    });
  }
  el('backup').addEventListener('click', backupMenu);
  function changed() {
    if (owner !== account?.uid) {
      owner = account?.uid; view = 'overview'; month = undefined; query = ''; accountFilter = ''; categoryFilter = '';
      notice = ''; state = undefined;
      if (editor.open) editor.close();
      el('fields').replaceChildren();
      el('view').replaceChildren();
    }
    render();
  }
  import('./finance-model.mjs?v=finance-subscriptions-1').then(module => {
    model = module;
    return import('./cloud-finance.js?v=finance-subscriptions-1');
  }).then(module => {
    account = module.createFinanceAccount(changed);
    changed();
  }).catch(() => { unavailable = 'Finance could not load. Reload to try again.'; render(); });
  render();
  return { open() { if (!panel.open) panel.showModal(); render(); }, canNavigate() { return !busy && !editor.open; } };
}
