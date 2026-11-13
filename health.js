// Medication tracking for the signed-in account.
function createHealth(panel) {
  // Existing cloud ledger keys use this prefix.
  const prefix = 'thehub:health-demo:v1:';
  let workspace = { scope: '', routines: [], selected: null };
  let newView;
  let account;
  let accountId;
  const healthScope = () => account?.uid;
  const scopeMatches = () => account?.uid && workspace.scope === `account:${account.uid}`;
  const sync = document.getElementById('health-sync-status');
  const toolbar = document.getElementById('health-toolbar-actions');
  const addMedication = document.getElementById('health-add-medication');
  const importer = document.getElementById('health-import');
  const importText = document.getElementById('health-import-text');
  const importSave = document.getElementById('health-import-save');
  const importStatus = document.getElementById('health-import-status');
  const allViews = () => [...cards.values(), newView].filter(Boolean);
  const validMedicationId = id => typeof id === 'string' && /^med-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);
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
  const schedules = new Map([['morning', 'Morning'], ['bedtime', 'Before bed'], ['as-needed', 'As needed']]);
  const asNeeded = medication => medication.time === 'as-needed';
  const validPackSize = value => value == null || Number.isSafeInteger(value) && value > 0 && value <= 10000;
  const tabletCount = quantity => `${quantity} tablet${quantity === 1 ? '' : 's'}`;
  const timing = medication => schedules.get(medication.time) || medication.time;
  function scheduleText(medication) {
    if (asNeeded(medication)) return 'As needed · Stock only';
    const schedule = validTime(medication.time) ? `Daily at ${medication.time} · Lisbon time` : `Daily · ${timing(medication)}`;
    return `${tabletCount(medication.quantity)} · ${schedule}`;
  }
  const setupKey = id => prefix + 'settings:' + id;
  const setup = (medication, entries) => entries.find(entry => entry.type === 'settings' && entry.medication === medication.id);
  const configured = (medication, entries) => ({ ...medication, ...setup(medication, entries), id: medication.id });
  const doseQuantity = entry => entry.quantity;
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
  const binding = (medication, entries) => setup(medication, entries)?.link ?? null;
  function linkedChecklist(link) {
    return scopeMatches() && link && link.scope === workspace.scope ? workspace.routines.find(routine => routine.id === link.id) : undefined;
  }
  function validateRecord(key, record) {
    const id = record?.medication;
    if (!validMedicationId(id) || record.version !== 1 || !Number.isSafeInteger(record.at) || record.at < 0 || record.at > 8640000000000000) throw new Error('Unreadable medication record');
    if (record.type === 'dose') {
      if (typeof record.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(record.date) || key !== doseKey(record.date, id) || typeof record.taken !== 'boolean' || !validQuantity(record.quantity) || record.name !== undefined && !validName(record.name)) throw new Error('Unreadable dose');
    } else if (record.type === 'restock') {
      if (!key.startsWith(prefix + 'restock:') || !Number.isSafeInteger(record.quantity) || record.quantity < 1 || record.quantity > 10000 || record.name !== undefined && !validName(record.name)) throw new Error('Unreadable stock');
    } else if (record.type === 'settings') {
      const validDose = asNeeded(record) ? record.quantity === null && !record.link : validQuantity(record.quantity);
      if (key !== setupKey(id) || !validName(record.name) || !validDose || !validPackSize(record.packSize) ||
          !(validTime(record.time) || schedules.has(record.time)) || typeof record.adjustment !== 'number' ||
          !Number.isSafeInteger(record.adjustment * 4) || Math.abs(record.adjustment) > 1000000 ||
          Object.hasOwn(record, 'link') && !validLink(record.link)) throw new Error('Unreadable medication settings');
    } else throw new Error('Unknown medication record');
  }

  const fromSetup = entry => ({ id: entry.medication, name: entry.name, quantity: 1, time: '08:00', initial: 0 });

  function validateLedger(id, entries) {
    if (!validMedicationId(id) || !Array.isArray(entries)) throw new Error('Unreadable Health ledger');
    const keys = new Set();
    for (const entry of entries) {
      if (entry?.medication !== id || typeof entry.key !== 'string' || keys.has(entry.key)) throw new Error('Unreadable Health ledger');
      validateRecord(entry.key, entry);
      keys.add(entry.key);
    }
    const settings = entries.find(entry => entry.type === 'settings');
    if (!settings) throw new Error('Medication setup missing');
    stock(fromSetup(settings), entries);
  }

  const normalizedName = name => name.trim().normalize('NFKC').toLowerCase();

  async function importMedicationId(name) {
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(name)));
    const hex = Array.from(bytes.slice(0, 16), byte => byte.toString(16).padStart(2, '0')).join('');
    return 'med-' + hex.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  }

  async function importMedicationList() {
    if (importSave.disabled || hasDraft()) return;
    const scope = healthScope();
    let items;
    try {
      const parsed = JSON.parse(importText.value);
      items = parsed?.medications;
      if (parsed?.version !== 1 || !Array.isArray(items) || !items.length || items.length > 50) throw new Error();
    } catch {
      importStatus.textContent = 'Paste a valid Health setup list with 1 to 50 medications.';
      return;
    }
    const names = new Set();
    for (const item of items) {
      if (!validName(item?.name) || typeof item.stock !== 'number' || !Number.isSafeInteger(item.stock * 4) ||
          item.stock < 0 || item.stock > 100000 || !validPackSize(item.packSize) ||
          !(validTime(item.schedule) || schedules.has(item.schedule)) ||
          (item.schedule === 'as-needed' ? item.quantity !== null || item.linkedChecklist != null : !validQuantity(item.quantity)) ||
          item.linkedChecklist != null && (typeof item.linkedChecklist !== 'string' || !item.linkedChecklist.trim() || item.linkedChecklist.length > 240) ||
          names.has(normalizedName(item.name))) {
        importStatus.textContent = 'Check the names, schedules, stock and checklist names. Each medication needs a unique name.';
        return;
      }
      names.add(normalizedName(item.name));
    }
    const existing = new Set(read().filter(entry => entry.type === 'settings').map(entry => normalizedName(entry.name)));
    const missing = new Map();
    const checklistScope = workspace.scope;
    const checklists = scopeMatches() ? workspace.routines : [];
    busy = true;
    importStatus.textContent = 'Saving your medication list…';
    document.dispatchEvent(new CustomEvent('hub:healthsync', { detail: true }));
    render();
    try {
      const records = await Promise.all(items.filter(item => !existing.has(normalizedName(item.name))).map(async item => {
        const medication = await importMedicationId(normalizedName(item.name));
        const matches = item.linkedChecklist ? checklists.filter(routine => normalizedName(routine.name) === normalizedName(item.linkedChecklist)) : [];
        const link = matches.length === 1 ? { scope: checklistScope, id: matches[0].id } : null;
        if (item.linkedChecklist && !link) missing.set(medication, item.linkedChecklist);
        return { key: setupKey(medication), version: 1, type: 'settings', medication, name: item.name.trim(),
          quantity: item.quantity, time: item.schedule, packSize: item.packSize ?? null, adjustment: item.stock, link, at: Date.now() };
      }));
      if (scope !== healthScope()) return;
      if (checklistScope !== workspace.scope) {
        importStatus.textContent = 'Your checklist workspace changed. Try the import again.';
        return;
      }
      const added = records.length ? await account.importSetup(records) : [];
      if (scope !== healthScope()) return;
      const unlinked = [...new Set(added.map(record => missing.get(record.medication)).filter(Boolean))];
      const skipped = items.length - added.length;
      importText.value = '';
      importStatus.textContent = `Added ${added.length} medication${added.length === 1 ? '' : 's'}.` +
        (skipped ? ` ${skipped} already in your account.` : '') +
        (unlinked.length ? ` Checklists to link: ${unlinked.join(', ')}.` : '');
    } catch {
      if (scope === healthScope()) importStatus.textContent = 'Your list could not be saved. Check the connection and try again.';
    } finally {
      busy = false;
      document.dispatchEvent(new CustomEvent('hub:healthsync', { detail: false }));
      render();
    }
  }

  function read() {
    return account?.ready ? account.entries : [];
  }
  function stock(medication, entries) {
    const value = entries.filter(entry => entry.medication === medication.id).reduce((count, entry) => entry.type === 'settings' ? count + entry.adjustment : entry.type === 'restock' ? count + entry.quantity : count - (entry.taken ? doseQuantity(entry) : 0), medication.initial);
    if (!Number.isSafeInteger(value * 4) || value < 0) throw new Error('Invalid stock');
    return value;
  }
  function taken(medication, entries, date = today()) {
    return entries.some(entry => entry.type === 'dose' && entry.medication === medication.id && entry.date === date && entry.taken);
  }
  async function change(id, write, success) {
    const scope = healthScope();
    if (!scope || busy) return false;
    busy = true; render();
    document.dispatchEvent(new CustomEvent('hub:healthsync', { detail: true }));
    try {
      if (!await account.change(id, write)) return false;
      if (scope !== healthScope()) return false;
      message = success; failed = false;
      return true;
    } catch (error) {
      if (scope !== healthScope()) return false;
      message = error.medicationConflict ? error.message : error.message === 'Not enough stock' ? 'Not enough stock for this dose. Add stock first.'
        : error.message === 'Health history is full.' ? 'This medication’s account history is full.'
        : 'Change could not be saved to your account. Check the connection and try again.';
      failed = true;
      return false;
    } finally {
      busy = false;
      document.dispatchEvent(new CustomEvent('hub:healthsync', { detail: false }));
      render();
    }
  }
  function recordDose(medication, checked, date = today()) {
    const name = cards.get(medication.id).title.textContent;
    return change(medication.id, entries => {
      if (taken(medication, entries, date) === checked) return;
      const current = configured(medication, entries);
      if (checked && asNeeded(current)) conflict('This item is set to stock only.');
      const previous = entries.find(entry => entry.key === doseKey(date, medication.id));
      const quantity = checked ? current.quantity : doseQuantity(previous);
      if (checked && stock(medication, entries) < quantity) throw new Error('Not enough stock');
      const record = { version: 1, type: 'dose', medication: medication.id, date, taken: checked, quantity, name: checked ? current.name : previous.name || medication.name, at: Date.now() };
      return { ...record, key: doseKey(date, medication.id) };
    }, checked ? `${name}: dose recorded. Stock updated once.` : `${name}: dose undone. Stock restored.`);
  }

  const conflict = text => { const error = new Error(text); error.medicationConflict = true; throw error; };
  function editorValues(view) {
    const { name, dose, schedule, time, stock, pack } = view.fields;
    const stockOnly = schedule.value === 'as-needed';
    return {
      name: name.value.trim(),
      quantity: stockOnly ? null : Number(dose.value),
      time: schedule.value === 'fixed' ? time.value : schedule.value,
      stock: Number(stock.value),
      packSize: pack.value ? Number(pack.value) : null,
      link: stockOnly ? '' : view.linkChoice || ''
    };
  }
  function loadEditorFields(view, values) {
    const { name, dose, schedule, time, stock, pack } = view.fields;
    name.value = values.name;
    dose.value = values.quantity ?? '';
    schedule.value = schedules.has(values.time) ? values.time : 'fixed';
    time.value = validTime(values.time) ? values.time : '';
    stock.value = values.stock;
    pack.value = values.packSize ?? '';
  }
  function renderEditorFields(view, locked) {
    const { dose, schedule, time } = view.fields;
    const stockOnly = schedule.value === 'as-needed';
    for (const field of Object.values(view.fields)) field.disabled = locked;
    for (const [field, hidden] of [[dose, stockOnly], [time, schedule.value !== 'fixed']]) {
      field.closest('label').hidden = hidden;
      field.disabled = locked || hidden;
    }
    view.linkField.hidden = stockOnly;
    view.linkSelect.disabled = locked || stockOnly;
    if (stockOnly) view.linkPicker.close();
    view.save.disabled = locked || !dirty(view);
    view.cancel.disabled = busy;
  }

  function updateImportButton() {
    importSave.disabled = busy || !account?.ready || account.cached || !navigator.onLine || hasDraft() || !importText.value.trim();
  }
  function dirty(view) {
    return view.baseline && JSON.stringify(editorValues(view)) !== JSON.stringify(view.baseline.values);
  }
  function cancelEditor(view) {
    view.baseline = undefined;
    view.linkPicker.close();
    view.editor.hidden = true;
    if (view.isNew) {
      view.card.hidden = true;
      addMedication.hidden = false;
    } else view.edit.hidden = false;
  }
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
    const scope = healthScope();
    const baseline = view.baseline;
    const target = view.isNew ? { id: view.draftId, initial: 0, quantity: 1 } : medication;
    return change(target.id, entries => {
      if (scope !== healthScope() || baseline.scope !== workspace.scope) conflict('Checklist workspace changed. Cancel and reopen the editor before saving.');
      if (JSON.stringify(setup(target, entries) || null) !== baseline.setup) conflict('Medication changed elsewhere. Cancel and reopen Edit medication to review the latest setup.');
      const currentStock = stock(target, entries);
      const stockEdited = values.stock !== baseline.values.stock;
      if (stockEdited && currentStock !== baseline.values.stock) conflict('Stock changed while you were editing. Cancel and reopen Edit medication to review it.');
      const adjustment = (setup(target, entries)?.adjustment || 0) + (stockEdited ? values.stock - currentStock : 0);
      if (!Number.isSafeInteger(adjustment * 4) || Math.abs(adjustment) > 1000000) conflict('Stock adjustment is outside the supported range. Stored data is unchanged.');
      const link = values.link ? JSON.parse(values.link) : null;
      if (!validLink(link) || (view.isNew || values.link !== baseline.values.link) && link && !linkedChecklist(link)) conflict('Choose a checklist from the current workspace or No checklist.');
      const record = { version: 1, type: 'settings', medication: target.id, name: values.name, quantity: values.quantity, time: values.time, packSize: values.packSize, adjustment, link, at: Date.now() };
      return { ...record, key: setupKey(target.id) };
    }, view.isNew ? 'Medication added.' : 'Medication saved. Existing dose quantities are unchanged.').then(saved => {
      if (!saved) return;
      cancelEditor(view);
      render();
      const savedView = cards.get(target.id);
      if (view.isNew) savedView.card.scrollIntoView({ block: 'nearest' });
      savedView.edit.focus({ preventScroll: true });
    });
  }
  function updateLinkChoices(view, entries) {
    const desired = view.baseline ? view.linkChoice || '' : linkValue(binding(view.medication, entries));
    const routines = scopeMatches() ? workspace.routines : [];
    const signature = JSON.stringify([workspace.scope, routines, desired]);
    if (signature === view.linkSignature) return;
    view.linkSignature = signature;
    const options = [Object.assign(document.createElement('option'), { value: '', textContent: 'No checklist' })];
    for (const routine of routines) options.push(Object.assign(document.createElement('option'), { value: linkValue({ scope: workspace.scope, id: routine.id }), textContent: routine.name }));
    if (desired && !options.some(option => option.value === desired)) options.push(Object.assign(document.createElement('option'), { value: desired, textContent: 'Linked checklist unavailable in this workspace', disabled: true }));
    view.linkSelect.replaceChildren(...options); view.linkSelect.value = desired; view.linkPicker.refresh();
  }

  function createCard(medication, isNew = false) {
    const view = { medication, isNew };

    const card = node('article', 'medication-card'); card.dataset.medication = medication.id;
    const heading = node('div', 'medication-heading');
    const title = node('h3', '', medication.name);
    heading.append(title);
    const schedule = node('p', 'medication-schedule');
    const count = node('strong', 'medication-stock');
    const packSize = node('p', 'medication-estimate');
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
      const key = prefix + 'restock:' + crypto.randomUUID();
      change(medication.id, entries => ({ key, version: 1, type: 'restock', medication: medication.id,
        name: configured(medication, entries).name, quantity: amount, at: Date.now() }),
      `${view.title.textContent}: stock increased by ${amount}.`);
    });
    quantity.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      if (!event.repeat) add.click();
    });
    restock.append(label, quantity, add);
    const editor = node('fieldset', 'medication-editor'); editor.hidden = true;
    editor.append(node('legend', '', isNew ? 'Add medication' : 'Edit medication'));
    const fields = {};
    for (const [key, text, type] of [['name', 'Name', 'text'], ['schedule', 'Schedule', 'select'], ['time', 'Daily time (Lisbon)', 'time'], ['dose', 'Tablets per dose', 'number'], ['stock', 'Current stock', 'number'], ['pack', 'Pack size (optional)', 'number']]) {
      const label = node('label', '', text);
      const input = node(type === 'select' ? 'select' : 'input', '');
      if (type !== 'select') input.type = type;
      input.required = key !== 'pack';
      input.id = `medication-${medication.id}-${key}`; label.htmlFor = input.id;
      if (key === 'name') input.maxLength = 80;
      if (key === 'dose' || key === 'stock') { input.min = key === 'dose' ? '.25' : '0'; input.max = key === 'dose' ? '100' : '100000'; input.step = '.25'; input.inputMode = 'decimal'; }
      if (key === 'pack') { input.min = '1'; input.max = '10000'; input.inputMode = 'numeric'; }
      if (key === 'schedule') for (const [value, label] of [['fixed', 'At a set time'], ...schedules]) {
        input.append(new Option(value === 'as-needed' ? 'As needed (stock only)' : label, value));
      }
      fields[key] = input; label.append(input); editor.append(label);
    }
    const linkField = node('div', 'medication-link-field');
    const linkLabel = node('span', '', 'Linked checklist'); linkLabel.id = `medication-${medication.id}-link-label`;
    const linkSelect = node('select', ''); linkSelect.id = `medication-${medication.id}-checklist`; linkSelect.setAttribute('aria-label', 'Linked checklist'); linkSelect.setAttribute('aria-labelledby', linkLabel.id);
    linkField.append(linkLabel, linkSelect); editor.append(linkField);
    const linkPicker = createChecklistPicker(linkSelect);
    linkSelect.addEventListener('change', () => { view.linkChoice = linkSelect.value; view.save.disabled = busy || !dirty(view); updateImportButton(); });
    const save = action(isNew ? 'Save medication' : 'Save changes', isNew ? 'Save new medication' : `Save ${medication.name} changes`, () => saveEditor(medication, view));
    const cancel = action('Cancel', `Cancel ${medication.name} changes`, () => { cancelEditor(view); render(); (view.isNew ? addMedication : view.edit).focus(); });
    const editorActions = node('div', 'medication-dose-actions'); editorActions.append(save, cancel);
    editor.append(editorActions);
    const edit = action('Edit medication', `Edit ${medication.name}`, () => {
      try {
        const entries = read(); const current = configured(medication, entries);
        const values = { name: current.name, quantity: current.quantity, time: current.time, stock: stock(medication, entries), packSize: current.packSize ?? null, link: linkValue(binding(medication, entries)) };
        view.linkChoice = values.link;
        view.baseline = { scope: workspace.scope, values, setup: JSON.stringify(setup(medication, entries) || null) };
        loadEditorFields(view, values);
        editor.hidden = false; edit.hidden = true; render(); fields.name.focus(); fields.name.select();
      } catch { message = 'Medication setup could not be read. Stored data is unchanged.'; failed = true; render(); }
    });
    fields.schedule.addEventListener('change', () => { renderEditorFields(view, fields.schedule.disabled); updateImportButton(); });
    editor.addEventListener('input', () => { fields.name.setCustomValidity(''); save.disabled = busy || !dirty(view); updateImportButton(); });
    editor.addEventListener('keydown', event => { if (event.key === 'Enter' && event.target.matches('input')) { event.preventDefault(); save.click(); } });
    heading.append(edit);
    const linkInfo = node('div', 'medication-link-info'); const linkText = node('span', '');
    const openLinked = action('Open checklist', 'Open linked checklist', () => {
      const link = binding(medication, read()); const routine = linkedChecklist(link); if (routine) openRoutine(routine.id);
    });
    linkInfo.append(linkText, openLinked);
    const details = node('div', 'medication-details'); details.append(schedule, buttons, doseState, count, packSize, estimate, warning, restock, linkInfo); details.hidden = isNew;
    card.append(heading, editor, details);
    document.getElementById(isNew ? 'health-new-medication' : 'health-medications').append(card);
    const row = node('label', 'medication-row');
    const check = node('input', ''); check.type = 'checkbox'; check.dataset.dose = medication.id;
    check.addEventListener('change', () => recordDose(medication, check.checked));
    const copy = node('span', ''); copy.append(node('strong', ''), node('small', ''));
    row.append(check, copy); if (!isNew) document.getElementById('medication-checks').append(row);
    Object.assign(view, { card, row, linkText, openLinked, linkField, linkSelect, linkPicker, title, schedule, copy, editor, fields, edit, save, cancel, count, packSize, estimate, warning, dose, undo, doseState, quantity, restockLabel: label, add, check });
    if (isNew) { card.hidden = true; edit.hidden = true; } else cards.set(medication.id, view);
    return view;
  }

  function render() {
    day = today();
    const entries = read();
    const medications = entries.filter(entry => entry.type === 'settings').map(fromSetup);
    const signedIn = Boolean(account?.uid);
    const readOnly = !account?.ready || account.cached || !navigator.onLine;
    const locked = busy || readOnly;
    for (const medication of medications) if (!cards.has(medication.id)) createCard(medication);
    const medicationIds = new Set(medications.map(medication => medication.id));
    for (const [id, view] of cards) {
      if (medicationIds.has(id) || dirty(view)) continue;
      view.linkPicker.destroy();
      view.card.remove();
      view.row.remove();
      cards.delete(id);
    }
    for (const medication of medications) {
      const view = cards.get(medication.id);
      const count = stock(medication, entries);
      const checked = taken(medication, entries, day);
      const current = configured(medication, entries);
      const stockOnly = asNeeded(current);
      const link = binding(medication, entries); const linked = linkedChecklist(link);
      const visibleHere = Boolean(linked && workspace.selected && linked.id === workspace.selected.id);
      view.row.hidden = !visibleHere;
      view.linkText.textContent = linked ? `Linked to ${linked.name}` : link ? 'Linked checklist unavailable in this workspace' : 'Not linked to a checklist';
      view.openLinked.hidden = !linked; view.openLinked.disabled = locked;
      if (linked) view.openLinked.setAttribute('aria-label', `Open ${linked.name} for ${current.name}`);
      updateLinkChoices(view, entries);
      view.title.textContent = current.name;
      view.schedule.textContent = scheduleText(current);
      view.copy.querySelector('strong').textContent = `Take ${current.name}`;
      view.copy.querySelector('small').textContent = `${tabletCount(current.quantity)} · ${timing(current)}`;
      view.dose.setAttribute('aria-label', `Mark ${current.name} taken`); view.undo.setAttribute('aria-label', `Undo ${current.name} dose`);
      view.edit.setAttribute('aria-label', `Edit ${current.name}`); view.save.setAttribute('aria-label', `Save ${current.name} changes`); view.cancel.setAttribute('aria-label', `Cancel ${current.name} changes`);
      view.add.setAttribute('aria-label', `Add stock for ${current.name}`);
      view.edit.disabled = locked;
      renderEditorFields(view, locked);
      view.count.textContent = `${count} ${stockOnly ? 'units' : 'tablets'} left`;
      view.restockLabel.textContent = stockOnly ? 'Units to add' : 'Tablets to add';
      view.packSize.textContent = current.packSize ? `Pack of ${stockOnly ? current.packSize + ' units' : tabletCount(current.packSize)}` : '';
      view.packSize.hidden = !current.packSize;
      view.estimate.hidden = stockOnly;
      view.estimate.textContent = view.estimate.hidden ? '' : `About ${Math.floor(count / current.quantity)} days at this daily schedule.`;
      view.warning.textContent = count < current.quantity ? 'Not enough stock for the next dose.' : 'Low stock · add more soon';
      view.warning.hidden = stockOnly || count > current.quantity * 7;
      const todayDose = entries.find(entry => entry.key === doseKey(day, medication.id));
      const recordedQuantity = checked ? doseQuantity(todayDose) : 0;
      view.doseState.textContent = checked ? `Taken today · ${recordedQuantity} tablet${recordedQuantity === 1 ? '' : 's'} recorded` : 'Not recorded today';
      if (checked) view.copy.querySelector('small').textContent = `${recordedQuantity} tablet${recordedQuantity === 1 ? '' : 's'} recorded today`;
      view.dose.textContent = checked ? 'Taken today' : 'Mark taken';
      view.dose.hidden = stockOnly;
      view.doseState.hidden = stockOnly;
      view.dose.disabled = locked || stockOnly || checked || count < current.quantity;
      view.undo.hidden = stockOnly || !checked; view.undo.disabled = locked;
      view.add.disabled = view.quantity.disabled = locked;
      if (!busy) view.check.checked = checked;
      view.check.disabled = locked || !checked && count < current.quantity;
    }
    document.getElementById('health-data-badge').hidden = !signedIn;
    document.getElementById('health-account-content').hidden = !signedIn;
    toolbar.hidden = !signedIn;
    importer.hidden = !signedIn;
    importText.disabled = busy;
    updateImportButton();
    const daily = medications.filter(medication => !asNeeded(configured(medication, entries)));
    const totalTaken = daily.filter(medication => taken(medication, entries, day)).length;
    document.getElementById('health-today').textContent = daily.length ? `${totalTaken} of ${daily.length} taken` : '';
    document.getElementById('health-empty').hidden = !account?.ready || medications.length > 0 || !newView?.card.hidden;
    document.getElementById('health-sign-in').hidden = signedIn;
    document.getElementById('health-sync-retry').hidden = !signedIn || !account.error;
    sync.textContent = signedIn ? account.error || (!account.ready ? navigator.onLine ? 'Loading account Health…' : 'Connect to load account Health.' : readOnly ? 'Offline copy. Connect to record changes.' : busy ? 'Syncing…' : 'Synced to your account.') : 'Sign in to see your medication and stock.';
    const visible = workspace.selected ? medications.filter(medication => linkedChecklist(binding(medication, entries))?.id === workspace.selected.id) : [];
    routineSection.hidden = !visible.length;
    const completed = visible.filter(medication => taken(medication, entries, day)).length;
    document.getElementById('medication-today').textContent = `${completed} of ${visible.length} doses recorded today`;
    addMedication.disabled = locked;
    if (newView) {
      updateLinkChoices(newView, entries);
      renderEditorFields(newView, locked);
    }
    status.textContent = routineStatus.textContent = busy ? 'Saving medication change…' : message;
    status.dataset.warning = routineStatus.dataset.warning = String(failed);
    const focused = history.contains(document.activeElement);
    history.replaceChildren();
    for (const entry of entries.sort((a, b) => b.at - a.at).slice(0, 12)) {
      const medication = medications.find(med => med.id === entry.medication);
      const row = node('li', 'health-history-row');
      const quantity = entry.type === 'dose' ? doseQuantity(entry) : 0;
      const units = asNeeded(configured(medication, entries)) ? 'units' : 'tablets';
      const text = entry.type === 'settings' ? 'Medication setup updated' : entry.type === 'restock' ? `Added ${entry.quantity} ${units}` : entry.taken ? `Taken · ${tabletCount(quantity)}` : 'Dose undone · stock restored';
      row.append(node('strong', '', entry.name || medication.name), node('span', '', text), node('small', '', `${stampFormat.format(entry.at)}${entry.type === 'dose' ? ' · Dose for ' + entry.date : ''}`));
      if (entry.type === 'dose' && entry.taken) {
        const undo = action('Undo', `Undo ${entry.name || medication.name} dose for ${entry.date}`, () => recordDose(medication, false, entry.date));
        undo.disabled = locked; row.append(undo);
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
  window.addEventListener('focus', render);
  window.addEventListener('online', render);
  window.addEventListener('offline', render);
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
  panel.addEventListener('close', () => {
    for (const view of allViews()) cancelEditor(view);
    importText.value = '';
    importStatus.textContent = '';
    importer.open = false;
  });
  importText.addEventListener('input', () => {
    importStatus.textContent = '';
    updateImportButton();
  });
  importSave.addEventListener('click', importMedicationList);
  document.getElementById('medication-discard-confirm').addEventListener('click', () => { const run = discardAction; discardAction = undefined; for (const view of allViews()) cancelEditor(view); discard.close(); run?.(); });
  discard.addEventListener('close', () => { if (!discard.open) discardAction = undefined; });
  window.addEventListener('beforeunload', event => { if (hasDraft() || busy) { event.preventDefault(); event.returnValue = ''; } });
  newView = createCard({ id: 'new-medication', name: 'New medication', quantity: 1, time: '08:00', initial: 0 }, true);
  addMedication.addEventListener('click', () => {
    newView.draftId = 'med-' + crypto.randomUUID();
    const values = { name: '', quantity: 1, time: '08:00', stock: 0, packSize: null, link: '' };
    newView.baseline = { values, scope: workspace.scope, setup: 'null' }; newView.linkChoice = '';
    loadEditorFields(newView, values);
    newView.fields.name.setCustomValidity('');
    newView.card.hidden = false; newView.editor.hidden = false; addMedication.hidden = true;
    render(); newView.fields.name.focus();
  });
  document.getElementById('health-sign-in').addEventListener('click', () => requestExit(() => {
    panel.close();
    document.getElementById('account-launch').click();
  }));
  document.getElementById('health-sync-retry').addEventListener('click', () => account?.watch());
  render();
  return {
    connect(createAccount) {
      account = createAccount(() => {
        if (accountId !== account.uid) {
          for (const view of allViews()) cancelEditor(view);
          importText.value = '';
          importStatus.textContent = '';
          importer.open = false;
          accountId = account.uid;
          message = ''; failed = false;
        }
        render();
      }, validateLedger);
      account.watch();
    },
    refresh: render, canNavigate() { if (!hasDraft() && !busy) return true; message = 'Save or cancel medication edits before opening quick access.'; failed = true; render(); return false; } };
}
