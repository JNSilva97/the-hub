// Browser-local medication setup and dose ledger; separate from account checklists.
function createHealthDemo(panel) {
  const prefix = 'thehub:health-demo:v1:';
  const samples = [
    { id: 'sample-a', name: 'Sample A', quantity: 1, time: '08:00', initial: 28 },
    { id: 'sample-b', name: 'Sample B', quantity: 2, time: '20:00', initial: 10 }
  ];
  let medications = [...samples];
  let workspace = { scope: '', routines: [], selected: null };
  let newView;
  const allViews = () => [...cards.values(), newView].filter(Boolean);
  const validMedicationId = id => typeof id === 'string' && (samples.some(med => med.id === id) || /^med-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id));
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
  const discard = document.getElementById('medication-discard-dialog');
  let discardAction;
  const validQuantity = value => Number.isFinite(value) && value >= .25 && value <= 100 && Number.isSafeInteger(value * 4);
  const validName = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 80;
  const validTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const setupKey = id => prefix + 'settings:' + id;
  const setup = (medication, entries) => entries.find(entry => entry.type === 'settings' && entry.medication === medication.id);
  const configured = (medication, entries) => ({ ...medication, ...setup(medication, entries), id: medication.id });
  const doseQuantity = entry => entry.quantity ?? samples.find(medication => medication.id === entry.medication).quantity;
  let busy = false;
  let day = today();
  let message = 'Record a dose here or in its linked checklist.';
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
  const validLink = link => link === null || link && typeof link === 'object' && !Array.isArray(link) && typeof link.scope === 'string' && link.scope.length > 0 && link.scope.length <= 180 && typeof link.id === 'string' && /^[a-z][a-z0-9-]{0,49}$/.test(link.id);
  const linkValue = link => link ? JSON.stringify({ scope: link.scope, id: link.id }) : '';
  function binding(medication, entries) {
    const saved = setup(medication, entries);
    if (saved && Object.hasOwn(saved, 'link')) return saved.link;
    if (!samples.some(sample => sample.id === medication.id)) return null;
    const care = workspace.routines.find(routine => routine.id === 'personal-care' || routine.name.trim().toLowerCase() === 'personal care');
    return care ? { scope: workspace.scope, id: care.id } : null;
  }
  function linkedChecklist(link) {
    return link && link.scope === workspace.scope ? workspace.routines.find(routine => routine.id === link.id) : undefined;
  }
  function read() {
    const entries = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const record = JSON.parse(localStorage.getItem(key));
      const id = record?.medication;
      if (!validMedicationId(id) || record.version !== 1 || !Number.isSafeInteger(record.at) || record.at < 0) throw new Error('Unreadable demo record');
      if (record.type === 'dose') {
        if (typeof record.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(record.date) || key !== doseKey(record.date, id) || typeof record.taken !== 'boolean' || record.quantity !== undefined && !validQuantity(record.quantity) || record.quantity === undefined && !samples.some(sample => sample.id === id) || record.name !== undefined && !validName(record.name)) throw new Error('Unreadable dose');
      } else if (record.type === 'restock') {
        if (!key.startsWith(prefix + 'restock:') || !Number.isSafeInteger(record.quantity) || record.quantity < 1 || record.quantity > 10000) throw new Error('Unreadable stock');
      } else if (record.type === 'settings') {
        if (key !== setupKey(id) || !validName(record.name) || !validQuantity(record.quantity) || !validTime(record.time) || typeof record.adjustment !== 'number' || !Number.isSafeInteger(record.adjustment * 4) || Math.abs(record.adjustment) > 1000000 || Object.hasOwn(record, 'link') && !validLink(record.link)) throw new Error('Unreadable medication settings');
      } else throw new Error('Unknown demo record');
      entries.push({ ...record, key });
    }
    const custom = entries.filter(entry => entry.type === 'settings' && !samples.some(sample => sample.id === entry.medication));
    const known = new Set([...samples.map(sample => sample.id), ...custom.map(entry => entry.medication)]);
    if (known.size > 50 || entries.some(entry => !known.has(entry.medication))) throw new Error('Medication setup missing');
    medications = [...samples, ...custom.map(entry => ({ id: entry.medication, name: entry.name, quantity: 1, time: '08:00', initial: 0 }))];
    return entries;
  }
  function stock(medication, entries) {
    const value = entries.filter(entry => entry.medication === medication.id).reduce((count, entry) => entry.type === 'settings' ? count + entry.adjustment : entry.type === 'restock' ? count + entry.quantity : count - (entry.taken ? doseQuantity(entry) : 0), medication.initial);
    if (!Number.isSafeInteger(value * 4) || value < 0) throw new Error('Invalid stock');
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
      message = error.medicationConflict ? error.message : error.message === 'Not enough stock' ? 'Not enough stock for this dose. Add stock first.' : 'Demo change could not be saved. Stored records are unchanged; check browser storage and try again.';
      failed = true;
    } finally { busy = false; render(); }
  }
  function recordDose(medication, checked, date = today()) {
    const name = cards.get(medication.id).title.textContent;
    return change(entries => {
      if (taken(medication, entries, date) === checked) return;
      const current = configured(medication, entries);
      const previous = entries.find(entry => entry.key === doseKey(date, medication.id));
      const quantity = checked ? current.quantity : doseQuantity(previous);
      if (checked && stock(medication, entries) < quantity) throw new Error('Not enough stock');
      const record = { version: 1, type: 'dose', medication: medication.id, date, taken: checked, quantity, name: checked ? current.name : previous.name || medication.name, at: Date.now() };
      localStorage.setItem(doseKey(date, medication.id), JSON.stringify(record));
    }, checked ? `${name}: dose recorded. Stock updated once.` : `${name}: dose undone. Stock restored.`);
  }

  const conflict = text => { const error = new Error(text); error.medicationConflict = true; throw error; };
  function editorValues(view) {
    return { name: view.fields.name.value.trim(), quantity: Number(view.fields.dose.value), time: view.fields.time.value, stock: Number(view.fields.stock.value), link: view.linkChoice || '' };
  }
  function dirty(view) {
    return view.baseline && JSON.stringify(editorValues(view)) !== JSON.stringify(view.baseline.values);
  }
  function cancelEditor(view) { view.baseline = undefined; view.linkPicker.close(); view.editor.hidden = true; if (view.isNew) { view.card.hidden = true; document.getElementById('health-add-medication').hidden = false; } else view.edit.hidden = false; }
  function hasDraft() { return allViews().some(dirty); }
  function requestExit(run) {
    if (busy) { message = 'Saving medication changes… Keep this tab open.'; render(); return false; }
    if (!hasDraft()) { run(); return true; }
    discardAction = run;
    if (!discard.open) discard.showModal();
    return false;
  }
  function saveEditor(medication, view) {
    if (!dirty(view) || busy) return;
    if (!Object.values(view.fields).every(input => input.reportValidity())) return;
    const values = editorValues(view);
    if (!validName(values.name)) { view.fields.name.setCustomValidity('Enter a medication name.'); view.fields.name.reportValidity(); return; }
    let savedId;
    return change(entries => {
      if (view.baseline.scope !== workspace.scope) conflict('Checklist workspace changed. Cancel and reopen the editor before saving.');
      const target = view.isNew ? { id: view.draftId, initial: 0, quantity: 1 } : medication;
      if (view.isNew && medications.length >= 50) conflict('This browser supports up to 50 medications.');
      if (JSON.stringify(setup(target, entries) || null) !== view.baseline.setup) conflict('Medication changed in another tab. Cancel and reopen Edit medication to review the latest setup.');
      const currentStock = stock(target, entries);
      const stockEdited = values.stock !== view.baseline.values.stock;
      if (stockEdited && currentStock !== view.baseline.values.stock) conflict('Stock changed while you were editing. Cancel and reopen Edit medication to review it.');
      const adjustment = (setup(target, entries)?.adjustment || 0) + (stockEdited ? values.stock - currentStock : 0);
      if (!Number.isSafeInteger(adjustment * 4) || Math.abs(adjustment) > 1000000) conflict('Stock adjustment is outside the supported range. Stored data is unchanged.');
      const link = values.link ? JSON.parse(values.link) : null;
      if (!validLink(link) || (view.isNew || values.link !== view.baseline.values.link) && link && !linkedChecklist(link)) conflict('Choose a checklist from the current workspace or No checklist.');
      const record = { version: 1, type: 'settings', medication: target.id, name: values.name, quantity: values.quantity, time: values.time, adjustment, link, at: Date.now() };
      localStorage.setItem(setupKey(target.id), JSON.stringify(record));
      savedId = target.id;
      cancelEditor(view);
    }, view.isNew ? 'Medication added in this browser.' : 'Medication saved in this browser. Existing dose quantities are unchanged.').then(() => {
      if (!savedId) return;
      const saved = cards.get(savedId);
      if (view.isNew) saved.card.scrollIntoView({ block: 'nearest' });
      saved.edit.focus({ preventScroll: true });
    });
  }
  function updateLinkChoices(view, entries) {
    const desired = view.baseline ? view.linkChoice || '' : linkValue(binding(view.medication, entries));
    const signature = JSON.stringify([workspace.scope, workspace.routines, desired]);
    if (signature === view.linkSignature) return;
    view.linkSignature = signature;
    const options = [Object.assign(document.createElement('option'), { value: '', textContent: 'No checklist' })];
    for (const routine of workspace.routines) options.push(Object.assign(document.createElement('option'), { value: linkValue({ scope: workspace.scope, id: routine.id }), textContent: routine.name }));
    if (desired && !options.some(option => option.value === desired)) options.push(Object.assign(document.createElement('option'), { value: desired, textContent: 'Linked checklist unavailable in this workspace', disabled: true }));
    view.linkSelect.replaceChildren(...options); view.linkSelect.value = desired; view.linkPicker.refresh();
  }

  function createCard(medication, isNew = false) {
    const view = { medication, isNew };

    const card = node('article', 'medication-card'); card.dataset.medication = medication.id;
    const heading = node('div', 'medication-heading');
    const title = node('h3', '', medication.name);
    const badge = node('span', 'health-demo-badge', 'DEMO');
    heading.append(title, badge);
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
      change(entries => {
        const key = prefix + 'restock:' + crypto.randomUUID();
        localStorage.setItem(key, JSON.stringify({ version: 1, type: 'restock', medication: medication.id, name: configured(medication, entries).name, quantity: amount, at: Date.now() }));
      }, `${view.title.textContent}: added ${amount} tablets.`);
    });
    quantity.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); add.click(); } });
    restock.append(label, quantity, add);
    const editor = node('fieldset', 'medication-editor'); editor.hidden = true;
    editor.append(node('legend', '', isNew ? 'Add medication' : 'Edit medication'));
    const fields = {};
    for (const [key, text, type] of [['name', 'Name', 'text'], ['dose', 'Tablets per dose', 'number'], ['time', 'Daily time (Lisbon)', 'time'], ['stock', 'Current stock', 'number']]) {
      const label = node('label', '', text);
      const input = node('input', ''); input.type = type; input.required = true;
      input.id = `medication-${medication.id}-${key}`; label.htmlFor = input.id;
      if (key === 'name') input.maxLength = 80;
      if (key === 'dose' || key === 'stock') { input.min = key === 'dose' ? '.25' : '0'; input.max = key === 'dose' ? '100' : '100000'; input.step = '.25'; input.inputMode = 'decimal'; }
      fields[key] = input; label.append(input); editor.append(label);
    }
    const linkField = node('div', 'medication-link-field');
    const linkLabel = node('span', '', 'Linked checklist'); linkLabel.id = `medication-${medication.id}-link-label`;
    const linkSelect = node('select', ''); linkSelect.id = `medication-${medication.id}-checklist`; linkSelect.setAttribute('aria-label', 'Linked checklist'); linkSelect.setAttribute('aria-labelledby', linkLabel.id);
    linkField.append(linkLabel, linkSelect); editor.append(linkField);
    const linkPicker = createChecklistPicker(linkSelect);
    linkSelect.addEventListener('change', () => { view.linkChoice = linkSelect.value; view.save.disabled = busy || !dirty(view); });
    const save = action(isNew ? 'Save medication' : 'Save changes', isNew ? 'Save new medication' : `Save ${medication.name} changes`, () => saveEditor(medication, view));
    const cancel = action('Cancel', `Cancel ${medication.name} changes`, () => { cancelEditor(view); render(); (view.isNew ? document.getElementById('health-add-medication') : view.edit).focus(); });
    const editorActions = node('div', 'medication-dose-actions'); editorActions.append(save, cancel);
    editor.append(node('p', '', 'One daily dose. Changes save in this browser; previous dose quantities stay unchanged.'), editorActions);
    const edit = action('Edit medication', `Edit ${medication.name}`, () => {
      try {
        const entries = read(); const current = configured(medication, entries);
        const values = { name: current.name, quantity: current.quantity, time: current.time, stock: stock(medication, entries), link: linkValue(binding(medication, entries)) };
        view.linkChoice = values.link;
        view.baseline = { scope: workspace.scope, values, setup: JSON.stringify(setup(medication, entries) || null) };
        fields.name.value = values.name; fields.dose.value = values.quantity; fields.time.value = values.time; fields.stock.value = values.stock;
        editor.hidden = false; edit.hidden = true; render(); fields.name.focus(); fields.name.select();
      } catch { message = 'Medication setup could not be read. Stored data is unchanged.'; failed = true; render(); }
    });
    editor.addEventListener('input', () => { fields.name.setCustomValidity(''); save.disabled = busy || !dirty(view); });
    editor.addEventListener('keydown', event => { if (event.key === 'Enter' && event.target.matches('input')) { event.preventDefault(); save.click(); } });
    heading.append(edit);
    const linkInfo = node('div', 'medication-link-info'); const linkText = node('span', '');
    const openLinked = action('Open checklist', 'Open linked checklist', () => {
      const link = binding(medication, read()); const routine = linkedChecklist(link); if (routine) openRoutine(routine.id);
    });
    linkInfo.append(linkText, openLinked);
    const details = node('div', 'medication-details'); details.append(linkInfo, schedule, count, estimate, warning, doseState, buttons, restock); details.hidden = isNew;
    card.append(heading, editor, details);
    document.getElementById(isNew ? 'health-new-medication' : 'health-medications').append(card);
    const row = node('label', 'medication-row');
    const check = node('input', ''); check.type = 'checkbox'; check.dataset.dose = medication.id;
    check.addEventListener('change', () => recordDose(medication, check.checked));
    const copy = node('span', ''); copy.append(node('strong', '', `Take ${medication.name}`), node('small', '', `${medication.quantity} tablet${medication.quantity === 1 ? '' : 's'} · ${medication.time} · Demo`));
    row.append(check, copy); if (!isNew) document.getElementById('medication-checks').append(row);
    Object.assign(view, { card, row, linkText, openLinked, linkSelect, linkPicker, title, badge, schedule, copy, editor, fields, edit, save, cancel, count, estimate, warning, dose, undo, doseState, quantity, add, check });
    if (isNew) { card.hidden = true; edit.hidden = true; } else cards.set(medication.id, view);
    return view;
  }

  function render() {
    day = today();
    let entries = [];
    let error = '';
    try { entries = read(); medications.forEach(medication => stock(medication, entries)); }
    catch { error = 'Demo storage could not be read. Stored records are unchanged. No stock changes are available until storage is accessible.'; }
    for (const medication of medications) if (!cards.has(medication.id)) createCard(medication);
    for (const [id, view] of cards) if (!medications.some(med => med.id === id) && !dirty(view)) { view.card.remove(); view.row.remove(); cards.delete(id); }
    for (const medication of medications) {
      const view = cards.get(medication.id);
      const count = error ? 0 : stock(medication, entries);
      const checked = taken(medication, entries);
      const current = configured(medication, entries);
      const custom = Boolean(setup(medication, entries));
      const link = binding(medication, entries); const linked = linkedChecklist(link);
      const visibleHere = Boolean(linked && workspace.selected && linked.id === workspace.selected.id);
      view.row.hidden = !visibleHere;
      view.linkText.textContent = linked ? `Linked to ${linked.name}` : link ? 'Linked checklist unavailable in this workspace' : 'Not linked to a checklist';
      view.openLinked.hidden = !linked; view.openLinked.disabled = Boolean(error) || busy;
      if (linked) view.openLinked.setAttribute('aria-label', `Open ${linked.name} for ${current.name}`);
      updateLinkChoices(view, entries); view.linkSelect.disabled = Boolean(error) || busy;
      view.title.textContent = current.name; view.badge.textContent = custom ? 'CUSTOM DEMO' : 'DEMO';
      view.schedule.textContent = `${current.quantity} tablet${current.quantity === 1 ? '' : 's'} · Daily at ${current.time} · Lisbon time`;
      view.copy.querySelector('strong').textContent = `Take ${current.name}`;
      view.copy.querySelector('small').textContent = `${current.quantity} tablet${current.quantity === 1 ? '' : 's'} · ${current.time} · ${custom ? 'Demo · This browser' : 'Demo'}`;
      view.dose.setAttribute('aria-label', `Mark ${current.name} taken`); view.undo.setAttribute('aria-label', `Undo ${current.name} dose`);
      view.edit.setAttribute('aria-label', `Edit ${current.name}`); view.save.setAttribute('aria-label', `Save ${current.name} changes`); view.cancel.setAttribute('aria-label', `Cancel ${current.name} changes`);
      view.add.setAttribute('aria-label', `Add stock for ${current.name}`);
      view.edit.disabled = Boolean(error) || busy;
      for (const input of Object.values(view.fields)) input.disabled = Boolean(error) || busy;
      view.save.disabled = Boolean(error) || busy || !dirty(view); view.cancel.disabled = busy;
      view.count.textContent = error ? 'Stock unavailable' : `${count} tablets left`;
      view.estimate.textContent = error ? '' : `About ${Math.floor(count / current.quantity)} days at this daily schedule.`;
      view.warning.textContent = count < current.quantity ? 'Not enough stock for the next dose.' : 'Low stock · add more soon';
      view.warning.hidden = Boolean(error) || count > current.quantity * 7;
      const todayDose = entries.find(entry => entry.key === doseKey(today(), medication.id));
      const recordedQuantity = checked ? doseQuantity(todayDose) : 0;
      view.doseState.textContent = checked ? `Taken today · ${recordedQuantity} tablet${recordedQuantity === 1 ? '' : 's'} recorded` : 'Not recorded today';
      if (checked) view.copy.querySelector('small').textContent = `${recordedQuantity} tablet${recordedQuantity === 1 ? '' : 's'} recorded today · ${custom ? 'Demo · This browser' : 'Demo'}`;
      view.dose.textContent = checked ? 'Taken today' : 'Mark taken';
      view.dose.disabled = Boolean(error) || busy || checked || count < current.quantity;
      view.undo.hidden = !checked; view.undo.disabled = Boolean(error) || busy;
      view.add.disabled = view.quantity.disabled = Boolean(error) || busy;
      if (!busy) view.check.checked = checked;
      view.check.disabled = Boolean(error) || busy || !checked && count < current.quantity;
    }
    const customSetup = entries.some(entry => entry.type === 'settings');
    document.getElementById('health-data-badge').textContent = customSetup ? 'CUSTOM DEMO / THIS BROWSER' : 'DEMO / THIS BROWSER';
    document.getElementById('medication-demo-title').textContent = 'Medication demo';
    document.getElementById('medication-data-note').textContent = customSetup ? 'Customized demo saved only in this browser. Routine resets keep recorded doses and stock.' : 'Fictional samples saved only in this browser. Routine resets keep recorded doses and stock.';
    if (panel.dataset.app === 'health') document.getElementById('app-description').textContent = customSetup ? 'Medication demo customized in this browser. Sample dose history is kept. Not synced to your account.' : 'Fictional medications, times and stock for testing. Saved only in this browser; not synced to your account.';
    const visible = medications.filter(medication => { const link = binding(medication, entries); return workspace.selected && link && link.scope === workspace.scope && link.id === workspace.selected.id; });
    routineSection.hidden = !visible.length;
    const completed = visible.filter(medication => taken(medication, entries)).length;
    document.getElementById('medication-today').textContent = `${completed} of ${visible.length} demo doses recorded today`;
    document.getElementById('health-add-medication').disabled = Boolean(error) || busy || medications.length >= 50;
    if (newView) {
      updateLinkChoices(newView, entries); newView.linkSelect.disabled = Boolean(error) || busy;
      for (const input of Object.values(newView.fields)) input.disabled = Boolean(error) || busy;
      newView.save.disabled = Boolean(error) || busy || !dirty(newView); newView.cancel.disabled = busy;
    }
    status.textContent = routineStatus.textContent = busy ? 'Saving demo change…' : error || message;
    status.dataset.warning = routineStatus.dataset.warning = String(Boolean(error) || failed);
    const focused = history.contains(document.activeElement);
    history.replaceChildren();
    for (const entry of entries.sort((a, b) => b.at - a.at).slice(0, 12)) {
      const medication = medications.find(med => med.id === entry.medication);
      const row = node('li', 'health-history-row');
      const quantity = entry.type === 'dose' ? doseQuantity(entry) : 0;
      const text = entry.type === 'settings' ? 'Medication setup updated' : entry.type === 'restock' ? `Added ${entry.quantity} tablets` : entry.taken ? `Taken · ${quantity} tablet${quantity === 1 ? '' : 's'}` : 'Dose undone · stock restored';
      row.append(node('strong', '', entry.name || medication.name), node('span', '', text), node('small', '', `${stampFormat.format(entry.at)}${entry.type === 'dose' ? ' · Dose for ' + entry.date : ''}`));
      if (entry.type === 'dose' && entry.taken) {
        const undo = action('Undo', `Undo ${entry.name || medication.name} dose for ${entry.date}`, () => recordDose(medication, false, entry.date));
        undo.disabled = Boolean(error) || busy; row.append(undo);
      }
      history.append(row);
    }
    document.getElementById('health-history-empty').hidden = history.children.length > 0;
    if (focused) status.focus({ preventScroll: true });
    document.getElementById('health-open-care').disabled = !currentRoutineCard();
  }
  function currentRoutineCard() {
    const cards = [...document.querySelectorAll('.routine-card')];
    return cards.find(card => card.dataset.routine === workspace.selected?.id) || cards[0];
  }
  function openRoutine(id, scope = workspace.scope) {
    requestExit(() => {
      const card = [...document.querySelectorAll('.routine-card')].find(card => card.dataset.routine === id);
      if (scope !== workspace.scope || !card) { message = 'Checklist workspace changed. Choose the linked checklist again.'; failed = true; render(); return; }
      panel.close(); document.getElementById('routines-launch').click(); card.click();
      if (!routineSection.hidden) routineSection.scrollIntoView({ block: 'nearest' });
    });
  }
  document.getElementById('health-open-care').addEventListener('click', () => { const card = currentRoutineCard(); if (card) openRoutine(card.dataset.routine); });
  document.getElementById('medication-open-health').addEventListener('click', () => document.querySelector('.app[data-icon="health"]').click());
  document.addEventListener('hub:progress', () => { document.getElementById('health-open-care').disabled = !currentRoutineCard(); });
  document.addEventListener('hub:checklistview', event => {
    workspace = event.detail || { scope: '', routines: [], selected: null };
    render();
  });
  window.addEventListener('storage', event => { if (event.key === null || event.key.startsWith(prefix)) render(); });
  window.addEventListener('focus', render);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  setInterval(() => { if (day !== today()) render(); }, 30000);
  const closingClick = event => {
    if (!hasDraft() && !busy) return;
    const bounds = panel.getBoundingClientRect();
    const outside = event.target === panel && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom);
    if (event.target.closest('#health-close, form[method="dialog"]') || outside) {
      event.preventDefault(); event.stopImmediatePropagation(); requestExit(() => panel.close());
    }
  };
  panel.addEventListener('click', closingClick, true);
  panel.addEventListener('submit', event => { if (hasDraft() || busy) { event.preventDefault(); event.stopImmediatePropagation(); requestExit(() => panel.close()); } }, true);
  panel.addEventListener('cancel', event => { if (hasDraft() || busy) { event.preventDefault(); event.stopImmediatePropagation(); requestExit(() => panel.close()); } }, true);
  panel.addEventListener('close', () => { for (const view of allViews()) cancelEditor(view); });
  document.getElementById('medication-discard-confirm').addEventListener('click', () => { const run = discardAction; discardAction = undefined; for (const view of allViews()) cancelEditor(view); discard.close(); run?.(); });
  discard.addEventListener('close', () => { if (!discard.open) discardAction = undefined; });
  window.addEventListener('beforeunload', event => { if (hasDraft() || busy) { event.preventDefault(); event.returnValue = ''; } });
  newView = createCard({ id: 'new-medication', name: 'New medication', quantity: 1, time: '08:00', initial: 0 }, true);
  document.getElementById('health-add-medication').addEventListener('click', () => {
    newView.draftId = 'med-' + crypto.randomUUID();
    const values = { name: '', quantity: 1, time: '08:00', stock: 0, link: '' };
    newView.baseline = { values, scope: workspace.scope, setup: 'null' }; newView.linkChoice = '';
    newView.fields.name.value = ''; newView.fields.dose.value = '1'; newView.fields.time.value = '08:00'; newView.fields.stock.value = '0';
    newView.fields.name.setCustomValidity('');
    newView.card.hidden = false; newView.editor.hidden = false; document.getElementById('health-add-medication').hidden = true;
    render(); newView.fields.name.focus();
  });
  render();
  return { refresh: render, canNavigate() { if (!hasDraft() && !busy) return true; message = 'Save or cancel medication edits before opening quick access.'; failed = true; render(); return false; } };
}
