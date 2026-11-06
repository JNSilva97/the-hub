// Fictional medication demo. Its ledger is local and separate from account checklists.
function createHealthDemo(panel) {
  const prefix = 'thehub:health-demo:v1:';
  const medications = [
    { id: 'sample-a', name: 'Sample A', quantity: 1, time: '08:00', initial: 28 },
    { id: 'sample-b', name: 'Sample B', quantity: 2, time: '20:00', initial: 10 }
  ];
  const dateFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' });
  const stampFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const today = () => {
    const parts = Object.fromEntries(dateFormat.formatToParts(new Date()).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const doseKey = (date, id) => `${prefix}dose:${date}:${id}`;
  const status = document.getElementById('health-status');
  const routineStatus = document.getElementById('medication-status');
  const routineSection = document.getElementById('personal-care-medications');
  const history = document.getElementById('health-history');
  const cards = new Map();
  let busy = false;
  let day = today();
  let message = 'Try a dose in Personal Care or record it here.';
  let failed = false;

  function node(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function action(text, label, run) {
    const button = node('button', 'health-button', text);
    button.type = 'button'; button.setAttribute('aria-label', label);
    button.addEventListener('click', run);
    return button;
  }
  function read() {
    const entries = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const record = JSON.parse(localStorage.getItem(key));
      const medication = medications.find(med => med.id === record?.medication);
      if (!medication || record.version !== 1 || !Number.isSafeInteger(record.at) || record.at < 0) throw new Error('Unreadable demo record');
      if (record.type === 'dose') {
        if (typeof record.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(record.date) || key !== doseKey(record.date, medication.id) || typeof record.taken !== 'boolean') throw new Error('Unreadable dose');
      } else if (record.type === 'restock') {
        if (!key.startsWith(prefix + 'restock:') || !Number.isSafeInteger(record.quantity) || record.quantity < 1 || record.quantity > 10000) throw new Error('Unreadable stock');
      } else throw new Error('Unknown demo record');
      entries.push({ ...record, key });
    }
    return entries;
  }
  function stock(medication, entries) {
    const value = entries.filter(entry => entry.medication === medication.id).reduce((count, entry) => entry.type === 'restock' ? count + entry.quantity : count - (entry.taken ? medication.quantity : 0), medication.initial);
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid stock');
    return value;
  }
  function taken(medication, entries, date = today()) {
    return entries.some(entry => entry.type === 'dose' && entry.medication === medication.id && entry.date === date && entry.taken);
  }
  async function change(write, success) {
    if (busy) return;
    busy = true; render();
    try {
      const update = () => { const entries = read(); write(entries); };
      if (navigator.locks?.request) await navigator.locks.request(prefix, update);
      else update();
      message = success; failed = false;
    } catch (error) {
      message = error.message === 'Not enough stock' ? 'Not enough stock for this dose. Add stock first.' : 'Demo change could not be saved. Stored records are unchanged; check browser storage and try again.';
      failed = true;
    } finally { busy = false; render(); }
  }
  function recordDose(medication, checked, date = today()) {
    return change(entries => {
      if (taken(medication, entries, date) === checked) return;
      if (checked && stock(medication, entries) < medication.quantity) throw new Error('Not enough stock');
      const record = { version: 1, type: 'dose', medication: medication.id, date, taken: checked, at: Date.now() };
      localStorage.setItem(doseKey(date, medication.id), JSON.stringify(record));
    }, checked ? `${medication.name}: dose recorded. Stock updated once.` : `${medication.name}: dose undone. Stock restored.`);
  }

  for (const medication of medications) {
    const card = node('article', 'medication-card'); card.dataset.medication = medication.id;
    const heading = node('div', 'medication-heading');
    heading.append(node('h3', '', medication.name), node('span', 'health-demo-badge', 'DEMO'));
    const schedule = node('p', 'medication-schedule', `${medication.quantity} tablet${medication.quantity === 1 ? '' : 's'} · Daily at ${medication.time} · Lisbon time`);
    const count = node('strong', 'medication-stock');
    const estimate = node('p', 'medication-estimate');
    const warning = node('p', 'medication-warning');
    const dose = action('Mark taken', `Mark ${medication.name} taken`, () => recordDose(medication, true));
    const undo = action('Undo', `Undo ${medication.name} dose`, () => recordDose(medication, false));
    const doseState = node('p', 'medication-dose-state');
    const buttons = node('div', 'medication-dose-actions'); buttons.append(dose, undo);
    const restock = node('div', 'medication-restock');
    const label = node('label', '', 'Tablets to add');
    const quantity = node('input', ''); quantity.type = 'number'; quantity.min = '1'; quantity.max = '10000'; quantity.step = '1'; quantity.value = '30'; quantity.required = true; quantity.inputMode = 'numeric';
    quantity.id = `restock-${medication.id}`; label.htmlFor = quantity.id;
    const add = action('Add stock', `Add stock for ${medication.name}`, () => {
      if (!quantity.reportValidity()) return;
      const amount = Number(quantity.value);
      change(() => {
        const key = prefix + 'restock:' + crypto.randomUUID();
        localStorage.setItem(key, JSON.stringify({ version: 1, type: 'restock', medication: medication.id, quantity: amount, at: Date.now() }));
      }, `${medication.name}: added ${amount} tablets.`);
    });
    quantity.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); add.click(); } });
    restock.append(label, quantity, add);
    card.append(heading, schedule, count, estimate, warning, doseState, buttons, restock);
    document.getElementById('health-medications').append(card);
    const row = node('label', 'medication-row');
    const check = node('input', ''); check.type = 'checkbox'; check.dataset.dose = medication.id;
    check.addEventListener('change', () => recordDose(medication, check.checked));
    const copy = node('span', ''); copy.append(node('strong', '', `Take ${medication.name}`), node('small', '', `${medication.quantity} tablet${medication.quantity === 1 ? '' : 's'} · ${medication.time} · Demo`));
    row.append(check, copy); document.getElementById('medication-checks').append(row);
    cards.set(medication.id, { count, estimate, warning, dose, undo, doseState, quantity, add, check });
  }

  function render() {
    day = today();
    let entries = [];
    let error = '';
    try { entries = read(); medications.forEach(medication => stock(medication, entries)); }
    catch { error = 'Demo storage could not be read. Stored records are unchanged. No stock changes are available until storage is accessible.'; }
    for (const medication of medications) {
      const view = cards.get(medication.id);
      const count = error ? 0 : stock(medication, entries);
      const checked = taken(medication, entries);
      view.count.textContent = error ? 'Stock unavailable' : `${count} tablets left`;
      view.estimate.textContent = error ? '' : `About ${Math.floor(count / medication.quantity)} days at this demo schedule.`;
      view.warning.textContent = count < medication.quantity ? 'Not enough stock for the next dose.' : 'Low stock · add more soon';
      view.warning.hidden = Boolean(error) || count > medication.quantity * 7;
      view.doseState.textContent = checked ? 'Taken today · recorded in Health and Personal Care' : 'Not recorded today';
      view.dose.textContent = checked ? 'Taken today' : 'Mark taken';
      view.dose.disabled = Boolean(error) || busy || checked || count < medication.quantity;
      view.undo.hidden = !checked; view.undo.disabled = Boolean(error) || busy;
      view.add.disabled = view.quantity.disabled = Boolean(error) || busy;
      if (!busy) view.check.checked = checked;
      view.check.disabled = Boolean(error) || busy || !checked && count < medication.quantity;
    }
    const completed = medications.filter(medication => taken(medication, entries)).length;
    document.getElementById('medication-today').textContent = `${completed} of ${medications.length} demo doses recorded today`;
    status.textContent = routineStatus.textContent = busy ? 'Saving demo change…' : error || message;
    status.dataset.warning = routineStatus.dataset.warning = String(Boolean(error) || failed);
    const focused = history.contains(document.activeElement);
    history.replaceChildren();
    for (const entry of entries.sort((a, b) => b.at - a.at).slice(0, 12)) {
      const medication = medications.find(med => med.id === entry.medication);
      const row = node('li', 'health-history-row');
      const text = entry.type === 'restock' ? `Added ${entry.quantity} tablets` : entry.taken ? `Taken · ${medication.quantity} tablet${medication.quantity === 1 ? '' : 's'}` : 'Dose undone · stock restored';
      row.append(node('strong', '', medication.name), node('span', '', text), node('small', '', `${stampFormat.format(entry.at)}${entry.type === 'dose' ? ' · Dose for ' + entry.date : ''}`));
      if (entry.type === 'dose' && entry.taken) {
        const undo = action('Undo', `Undo ${medication.name} dose for ${entry.date}`, () => recordDose(medication, false, entry.date));
        undo.disabled = Boolean(error) || busy; row.append(undo);
      }
      history.append(row);
    }
    document.getElementById('health-history-empty').hidden = history.children.length > 0;
    if (focused) status.focus({ preventScroll: true });
    document.getElementById('health-open-care').disabled = !personalCareCard();
  }
  function personalCareCard() {
    return [...document.querySelectorAll('.routine-card')].find(card => card.dataset.routine === 'personal-care' || card.querySelector('.routine-card-name').textContent.trim().toLowerCase() === 'personal care');
  }
  document.getElementById('health-open-care').addEventListener('click', () => {
    const card = personalCareCard(); if (!card) return;
    panel.close(); document.getElementById('routines-launch').click(); card.click();
    routineSection.scrollIntoView({ block: 'nearest' });
  });
  document.getElementById('medication-open-health').addEventListener('click', () => document.querySelector('.app[data-icon="health"]').click());
  document.addEventListener('hub:progress', () => { document.getElementById('health-open-care').disabled = !personalCareCard(); });
  document.addEventListener('hub:checklistview', event => {
    const routine = event.detail;
    routineSection.hidden = !routine || !(routine.id === 'personal-care' || routine.name.trim().toLowerCase() === 'personal care');
    render();
  });
  window.addEventListener('storage', event => { if (event.key === null || event.key.startsWith(prefix)) render(); });
  window.addEventListener('focus', render);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  setInterval(() => { if (day !== today()) render(); }, 30000);
  render();
  return { refresh: render };
}
