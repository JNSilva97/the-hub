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
  const tabs = [...document.querySelectorAll('.health-tabs [role="tab"]')];
  const todayTab = tabs[0];
  const importFile = document.getElementById('health-import-file');
  const importText = document.getElementById('health-import-text');
  const importSave = document.getElementById('health-import-save');
  const importStatus = document.getElementById('health-import-status');
  const importPreview = document.getElementById('health-import-preview');
  const importNames = document.getElementById('health-import-names');
  let importItems = [];
  let importFileRead = 0;
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
  const medicationList = document.getElementById('health-medications');
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
    const schedule = validTime(medication.time) ? `${medication.time} Lisbon` : timing(medication);
    return `${schedule} · ${tabletCount(medication.quantity)} daily`;
  }
  const setupKey = id => prefix + 'settings:' + id;
  const setup = (medication, entries) => entries.find(entry => entry.type === 'settings' && entry.medication === medication.id);
  const configured = (medication, entries) => ({ ...medication, ...setup(medication, entries), id: medication.id });
  const doseQuantity = entry => entry.quantity;
  let busy = false;
  let day = today();
  let message = '';
  let failed = false;
  let pickedUp;
  let drag;
  let reorderHint = '';

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

  function svgIcon(symbol, className) {
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS(icon.namespaceURI, 'use');
    icon.classList.add(className);
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    use.setAttribute('href', `#${symbol}`);
    icon.append(use);
    return icon;
  }

  function selectTab(selected, scroll = true) {
    const active = tabs.find(tab => tab.getAttribute('aria-selected') === 'true');
    if (active === selected) return;
    clearReorder();
    for (const tab of tabs) {
      const isSelected = tab === selected;
      tab.setAttribute('aria-selected', String(isSelected));
      tab.tabIndex = isSelected ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !isSelected;
    }
    if (scroll) panel.scrollTop = 0;
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
    } else if (record.type === 'lozenge') {
      if (!key.startsWith(prefix + 'lozenge:') || !/^\d{4}-\d{2}-\d{2}$/.test(record.date) ||
          record.quantity !== 1 || !validName(record.name)) throw new Error('Unreadable lozenge record');
    } else if (record.type === 'restock') {
      if (!key.startsWith(prefix + 'restock:') || !Number.isSafeInteger(record.quantity) || record.quantity < 1 || record.quantity > 10000 || record.name !== undefined && !validName(record.name)) throw new Error('Unreadable stock');
    } else if (record.type === 'settings') {
      const validDose = asNeeded(record) ? record.quantity === null && !record.link : validQuantity(record.quantity);
      if (key !== setupKey(id) || !validName(record.name) || !validDose || !validPackSize(record.packSize) ||
          !(validTime(record.time) || schedules.has(record.time)) || typeof record.adjustment !== 'number' ||
          !Number.isSafeInteger(record.adjustment * 4) || Math.abs(record.adjustment) > 1000000 ||
          Object.hasOwn(record, 'link') && !validLink(record.link) ||
          record.position !== undefined && (!Number.isSafeInteger(record.position) || record.position < 0)) throw new Error('Unreadable medication settings');
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
  function isNicotine(medication) {
    const name = normalizedName(medication.name);
    return asNeeded(medication) && /\b(?:nicotine|nicotina)\b/.test(name) && /\b(?:lozenges?|pastilhas?)\b/.test(name);
  }
  // Matches LOW_LOZENGES in habits-model.mjs.
  const lowLozenges = 5;
  const morningDoseOrder = new Map(['fish', 'brain', 'hair'].map((icon, index) => [icon, index]));

  function medicationIcon({ name, time }) {
    const label = normalizedName(name);
    if (/\b(memory|memória|memoria)\b/.test(label)) return 'brain';
    if (/\b(cabelo|unhas|hair|nails?)\b/.test(label)) return 'hair';
    if (/\bomega[\s-]*3\b/.test(label)) return 'fish';
    if (/\b(nicotina|nicotine|pastilhas?|lozenges?)\b/.test(label)) return 'lozenge';
    return time === 'bedtime' ? 'moon' : 'capsule';
  }

  async function importMedicationId(name) {
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(name)));
    const hex = Array.from(bytes.slice(0, 16), byte => byte.toString(16).padStart(2, '0')).join('');
    return 'med-' + hex.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  }

  function parseImport(text) {
    let items;
    try {
      const parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
      items = parsed?.medications;
      if (parsed?.version !== 1 || !Array.isArray(items) || !items.length || items.length > 50) throw new Error();
    } catch {
      throw new Error('Choose or paste a Health setup list with 1 to 50 medications.');
    }
    const names = new Set();
    for (const item of items) {
      if (!validName(item?.name) || typeof item.stock !== 'number' || !Number.isSafeInteger(item.stock * 4) ||
          item.stock < 0 || item.stock > 100000 || !validPackSize(item.packSize) ||
          !(validTime(item.schedule) || schedules.has(item.schedule)) ||
          (item.schedule === 'as-needed' ? item.quantity !== null || item.linkedChecklist != null : !validQuantity(item.quantity)) ||
          item.linkedChecklist != null && (typeof item.linkedChecklist !== 'string' || !item.linkedChecklist.trim() || item.linkedChecklist.length > 240) ||
          names.has(normalizedName(item.name))) {
        throw new Error('Check the names, schedules, stock and checklist names. Each medication needs a unique name.');
      }
      names.add(normalizedName(item.name));
    }
    return items;
  }

  function previewImport(text) {
    importItems = [];
    importStatus.textContent = '';
    try {
      if (text.trim()) importItems = parseImport(text);
    } catch (error) {
      importStatus.textContent = error.message;
    }
    importPreview.hidden = !importItems.length;
    document.getElementById('health-import-count').textContent = `${importItems.length} medication${importItems.length === 1 ? '' : 's'} in this list`;
    importNames.replaceChildren(...importItems.map(item => {
      const row = node('li', '');
      const schedule = item.schedule === 'as-needed' ? 'As needed' : timing({ time: item.schedule });
      row.append(node('strong', '', item.name), node('span', '', `${schedule} · ${item.stock} left`));
      return row;
    }));
    updateImportButton();
  }

  function resetImport() {
    importFileRead++;
    importFile.value = '';
    importText.value = '';
    previewImport('');
  }

  async function importMedicationList() {
    if (importSave.disabled || hasDraft()) return;
    const scope = healthScope();
    const items = importItems;
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
      resetImport();
      importStatus.textContent = `Added ${added.length} medication${added.length === 1 ? '' : 's'}.` +
        (skipped ? ` ${skipped} already in your account.` : '') +
        (unlinked.length ? ` Checklists to link: ${unlinked.join(', ')}.` : '');
      if (panel.open && !importStatus.closest('[role="tabpanel"]').hidden) importStatus.focus();
    } catch {
      if (scope === healthScope()) {
        importStatus.textContent = 'Your list could not be saved. Check the connection and try again.';
        if (panel.open && !importStatus.closest('[role="tabpanel"]').hidden) importStatus.focus();
      }
    } finally {
      busy = false;
      document.dispatchEvent(new CustomEvent('hub:healthsync', { detail: false }));
      render();
    }
  }

  function read() {
    return account?.ready ? account.entries : [];
  }
  function orderedSettings(entries) {
    return entries.filter(entry => entry.type === 'settings').sort((left, right) =>
      (left.position ?? Number.MAX_SAFE_INTEGER) - (right.position ?? Number.MAX_SAFE_INTEGER));
  }

  function clearReorder() {
    if (drag) {
      clearTimeout(drag.hold);
      cancelAnimationFrame(drag.frame);
      drag.preview?.remove();
      drag.card.removeAttribute('data-dragging');
    }
    drag = undefined;
    if (pickedUp) cards.get(pickedUp)?.handle.setAttribute('aria-pressed', 'false');
    pickedUp = undefined;
    reorderHint = '';
    delete medicationList.dataset.reordering;
    medicationList.querySelector('[data-drop]')?.removeAttribute('data-drop');
  }

  function showReorder(id) {
    if (pickedUp) cards.get(pickedUp)?.handle.setAttribute('aria-pressed', 'false');
    pickedUp = id;
    reorderHint = 'Drop it on another card, or use the arrow keys.';
    cards.get(id).handle.setAttribute('aria-pressed', 'true');
    medicationList.dataset.reordering = id;
  }

  async function moveMedication(from, to) {
    const scope = healthScope();
    const settings = orderedSettings(read());
    const order = settings.map(entry => entry.medication);
    const source = order.indexOf(from);
    const destination = order.indexOf(to);
    clearReorder();
    if (busy || source < 0 || destination < 0 || source === destination) return;
    order.splice(source, 1);
    order.splice(destination, 0, from);
    const positions = new Map(settings.map(entry => [entry.medication, entry.position]));
    busy = true;
    render();
    document.dispatchEvent(new CustomEvent('hub:healthsync', { detail: true }));
    try {
      if (!await account.reorder(order, positions) || scope !== healthScope()) return;
      message = 'Medication order saved.';
      failed = false;
    } catch (error) {
      if (scope !== healthScope()) return;
      message = error.message === 'Medication order changed on another device.' ? error.message : 'Order could not be saved. Try moving the medication again.';
      failed = true;
    } finally {
      busy = false;
      document.dispatchEvent(new CustomEvent('hub:healthsync', { detail: false }));
      render();
      if (scope === healthScope() && panel.open && todayTab.getAttribute('aria-selected') === 'true') {
        cards.get(from)?.handle.focus();
      }
    }
  }

  function trackDrag() {
    if (!drag?.active) return;
    drag.preview.style.transform = `translate(${drag.x - drag.offsetX}px, ${drag.y - drag.offsetY}px)`;
    const bounds = panel.getBoundingClientRect();
    const headerBottom = panel.querySelector('.health-tabs').getBoundingClientRect().bottom;
    const edge = 44;
    if (drag.y > bounds.bottom - edge && drag.y < bounds.bottom + edge) panel.scrollTop += 11;
    if (drag.y < headerBottom + edge && drag.y > bounds.top) panel.scrollTop -= 11;
    const target = document.elementFromPoint(drag.x, drag.y)?.closest('#health-medications > .medication-card');
    const next = target?.dataset.medication === drag.id ? undefined : target;
    if (drag.target !== next) {
      drag.target?.removeAttribute('data-drop');
      next?.setAttribute('data-drop', '');
      drag.target = next;
    }
    drag.frame = requestAnimationFrame(trackDrag);
  }

  function createReorderHandle(id) {
    const activate = () => {
      if (pickedUp === id) { clearReorder(); render(); return; }
      if (pickedUp) { moveMedication(pickedUp, id); return; }
      showReorder(id);
      render();
    };
    const handle = action('Move', 'Reorder medication', activate);
    handle.classList.add('medication-move');
    handle.setAttribute('aria-pressed', 'false');
    handle.setAttribute('aria-describedby', 'health-reorder-help');
    handle.title = 'Reorder';
    handle.addEventListener('keydown', event => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape'].includes(event.key)) return;
      if (event.key === 'Escape' && !pickedUp && !drag) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') { clearReorder(); render(); return; }
      const order = [...medicationList.children].map(card => card.dataset.medication);
      const direction = ['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 1;
      const target = order[order.indexOf(id) + direction];
      if (target) moveMedication(id, target);
    });
    return handle;
  }

  function enableCardDrag(card, id, handle) {
    function begin(input, target, x, y, contact) {
      if (drag || handle.disabled || handle.hidden || !panel.open || card.querySelector('.medication-restock:not([hidden])') ||
        target.closest('button, input, label, select, textarea, a, summary, .medication-editor, .medication-restock')) return false;
      drag = { id, card, input, contact, x, y, startX: x, startY: y };
      return true;
    }
    function lift() {
      const bounds = card.getBoundingClientRect();
      const preview = card.cloneNode(true);
      preview.classList.add('medication-drag-preview');
      preview.removeAttribute('data-medication');
      preview.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
      preview.inert = true;
      preview.setAttribute('aria-hidden', 'true');
      preview.style.width = `${bounds.width}px`;
      drag.offsetX = drag.startX - bounds.left;
      drag.offsetY = drag.startY - bounds.top;
      drag.preview = preview;
      drag.active = true;
      card.dataset.dragging = '';
      panel.append(preview);
      showReorder(id);
      trackDrag();
    }
    function move(x, y) {
      drag.x = x;
      drag.y = y;
      return Math.hypot(x - drag.startX, y - drag.startY) >= 7;
    }
    function drop(x, y) {
      if (!drag.active) { clearTimeout(drag.hold); drag = undefined; return; }
      const target = document.elementFromPoint(x, y)?.closest('#health-medications > .medication-card');
      if (target && target !== card) moveMedication(id, target.dataset.medication);
      else { clearReorder(); render(); }
    }
    const owns = (input, contact) => drag?.card === card && drag.input === input && drag.contact === contact;
    function cancel() {
      if (drag?.card !== card) return;
      clearReorder();
      render();
    }
    card.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch' || event.button !== 0 || !event.isPrimary) return;
      if (begin('pointer', event.target, event.clientX, event.clientY, event.pointerId)) {
        card.setPointerCapture(event.pointerId);
      }
    });
    card.addEventListener('pointermove', event => {
      if (owns('pointer', event.pointerId) && move(event.clientX, event.clientY) && !drag.active) lift();
    });
    card.addEventListener('pointerup', event => {
      if (owns('pointer', event.pointerId)) drop(event.clientX, event.clientY);
    });
    card.addEventListener('lostpointercapture', event => {
      if (owns('pointer', event.pointerId)) cancel();
    });
    card.addEventListener('touchstart', event => {
      if (event.touches.length !== 1) { if (drag?.input === 'touch') cancel(); return; }
      const touch = event.changedTouches[0];
      if (begin('touch', event.target, touch.clientX, touch.clientY, touch.identifier)) {
        drag.hold = setTimeout(lift, 300);
      }
    }, { passive: true });
    card.addEventListener('touchmove', event => {
      const touch = [...event.changedTouches].find(entry => owns('touch', entry.identifier));
      if (!touch) return;
      const moved = move(touch.clientX, touch.clientY);
      if (drag.active && event.cancelable) event.preventDefault();
      else if (moved) cancel();
    }, { passive: false });
    card.addEventListener('touchend', event => {
      const touch = [...event.changedTouches].find(entry => owns('touch', entry.identifier));
      if (touch) drop(touch.clientX, touch.clientY);
    });
    card.addEventListener('touchcancel', event => {
      if ([...event.changedTouches].some(entry => owns('touch', entry.identifier))) cancel();
    });
    card.addEventListener('contextmenu', event => {
      if (drag?.card === card) event.preventDefault();
    });
  }
  function stock(medication, entries) {
    const value = entries.filter(entry => entry.medication === medication.id).reduce((count, entry) => {
      if (entry.type === 'settings') return count + entry.adjustment;
      if (entry.type === 'restock') return count + entry.quantity;
      return count - (entry.type === 'lozenge' || entry.taken ? doseQuantity(entry) : 0);
    }, medication.initial);
    if (!Number.isSafeInteger(value * 4) || value < 0) throw new Error('Invalid stock');
    return value;
  }

  function undoRestock(medication, entry) {
    return change(medication.id, entries => {
      const refill = entries.find(record => record.key === entry.key);
      if (!refill) return;
      if (stock(medication, entries) < refill.quantity) conflict('There is not enough stock left to undo this refill.');
      return { key: refill.key, remove: true };
    }, `${entry.name || medication.name}: stock addition undone.`);
  }
  function taken(medication, entries, date = today()) {
    return entries.some(entry => entry.type === 'dose' && entry.medication === medication.id && entry.date === date && entry.taken);
  }
  const lozengesToday = (medication, entries, date = today()) => entries
    .filter(entry => entry.type === 'lozenge' && entry.medication === medication?.id && entry.date === date)
    .reverse()
    .sort((first, second) => second.at - first.at);

  function nicotineMedication(entries) {
    const matches = orderedSettings(entries).filter(isNicotine);
    return matches.length === 1 ? fromSetup(matches[0]) : undefined;
  }

  function logNicotine(medication = nicotineMedication(read())) {
    if (!medication) return false;
    const key = prefix + 'lozenge:' + crypto.randomUUID();
    const date = today();
    const at = Date.now();
    return change(medication.id, entries => {
      const current = configured(medication, entries);
      if (!isNicotine(current)) conflict('This nicotine item changed. Open Health and try again.');
      if (stock(medication, entries) < 1) conflict('No nicotine lozenges in stock.');
      return { key, version: 1, type: 'lozenge', name: current.name, medication: medication.id, quantity: 1, date, at };
    }, 'Lozenge recorded. Stock updated.');
  }

  function undoNicotine(medication = nicotineMedication(read()), entry) {
    const recorded = entry ?? lozengesToday(medication, read())[0];
    if (!medication || !recorded) return false;
    return change(medication.id, entries => {
      if (entries.some(item => item.key === recorded.key && item.type === 'lozenge')) return { key: recorded.key, remove: true };
    }, 'Lozenge record undone. Stock restored.');
  }

  function nicotineState() {
    if (!account?.uid) return { message: 'Sign in to Health to use your lozenge stock.' };
    if (!account.ready) return { message: account.error || 'Loading your Health account…' };
    const entries = read();
    const medication = nicotineMedication(entries);
    if (!medication) return { message: 'Set up one as-needed nicotine lozenge item in Health.' };
    const count = lozengesToday(medication, entries).length;
    const units = stock(medication, entries);
    const available = navigator.onLine && !account.cached && !busy;
    const status = busy ? ' · Saving…' : !available ? ' · Connect to log changes' : '';
    return { count, low: units <= lowLozenges, canRecord: available && units >= 1, canUndo: available && count > 0,
      message: `${units} in stock${units === 0 ? ' · buy more' : units <= lowLozenges ? ' · running low' : ''}${status}` };
  }
  function lozengeDays() {
    const medication = account?.ready ? nicotineMedication(read()) : undefined;
    const days = new Map();
    for (const entry of medication ? read() : []) {
      if (entry.type === 'lozenge' && entry.medication === medication.id) days.set(entry.date, (days.get(entry.date) ?? 0) + 1);
    }
    return days;
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
    importSave.disabled = busy || !account?.ready || account.cached || !navigator.onLine || hasDraft() || !importItems.length;
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
      const record = { ...setup(target, entries), version: 1, type: 'settings', medication: target.id, name: values.name, quantity: values.quantity, time: values.time, packSize: values.packSize, adjustment, link, at: Date.now() };
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
    const icon = svgIcon('med-icon-capsule', 'medication-icon');
    const iconUse = icon.firstElementChild;
    const handle = isNew ? null : createReorderHandle(medication.id);
    heading.append(icon, title);
    const schedule = node('p', 'medication-schedule');
    const count = node('strong', 'medication-stock');
    const packSize = node('p', 'medication-estimate');
    const estimate = node('p', 'medication-estimate');
    const warning = node('p', 'medication-warning');
    const dose = action('Mark taken', `Mark ${medication.name} taken`, () => recordDose(medication, true));
    const undo = action('Undo', `Undo ${medication.name} dose`, () => recordDose(medication, false));
    const doseState = node('p', 'medication-dose-state');
    const logLozenge = action('Log lozenge taken', `Log lozenge taken for ${medication.name}`, () => logNicotine(medication));
    logLozenge.classList.add('addiction-red');
    const undoLozenge = action('Undo', `Undo last lozenge for ${medication.name}`, () => undoNicotine(medication));
    const buttons = node('div', 'medication-dose-actions'); buttons.append(dose, undo, logLozenge, undoLozenge);
    const restock = node('div', 'medication-restock');
    restock.hidden = true;
    const label = node('label', '', 'Tablets to add');
    const quantity = node('input', ''); quantity.type = 'number'; quantity.min = '1'; quantity.max = '10000'; quantity.step = '1'; quantity.value = '30'; quantity.required = true; quantity.inputMode = 'numeric';
    quantity.id = `restock-${medication.id}`; label.htmlFor = quantity.id;
    restock.id = `stock-form-${medication.id}`;
    const restockToggle = action('Add stock', `Add stock for ${medication.name}`, () => {
      restock.hidden = !restock.hidden;
      restockToggle.setAttribute('aria-expanded', String(!restock.hidden));
      if (!restock.hidden) { quantity.value = quantity.defaultValue; quantity.focus(); quantity.select(); }
    });
    restockToggle.classList.add('medication-stock-toggle');
    restockToggle.setAttribute('aria-expanded', 'false');
    restockToggle.setAttribute('aria-controls', restock.id);
    restockToggle.addEventListener('keydown', event => {
      if (event.key === 'Enter' && event.repeat) event.preventDefault();
    });
    const closeRestock = () => {
      restock.hidden = true;
      restockToggle.setAttribute('aria-expanded', 'false');
      restockToggle.focus({ preventScroll: true });
    };
    const cancelStock = action('Cancel', `Cancel stock addition for ${medication.name}`, closeRestock);
    const add = action('Save stock', `Save stock for ${medication.name}`, () => {
      if (!quantity.reportValidity()) return;
      const amount = Number(quantity.value);
      const key = prefix + 'restock:' + crypto.randomUUID();
      change(medication.id, entries => ({ key, version: 1, type: 'restock', medication: medication.id,
        name: configured(medication, entries).name, quantity: amount, at: Date.now() }),
      `${view.title.textContent}: stock increased by ${amount}.`).then(saved => { if (saved) closeRestock(); });
    });
    quantity.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      if (!event.repeat) add.click();
    });
    restock.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || busy) return;
      event.preventDefault();
      event.stopPropagation();
      closeRestock();
    });
    restock.append(label, quantity, add, cancelStock);
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
    const edit = action('Edit', `Edit ${medication.name}`, () => {
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
    if (handle) {
      heading.prepend(handle);
      enableCardDrag(card, medication.id, handle);
    }
    const linkInfo = node('div', 'medication-link-info');
    const linkText = node('span', 'medication-checklist-name');
    const openLinked = action('', 'Open linked checklist', () => {
      const link = binding(medication, read()); const routine = linkedChecklist(link); if (routine) openRoutine(routine.id);
    });
    const linkedName = node('span', 'medication-checklist-name');
    const arrow = node('span', 'medication-checklist-arrow', '↗');
    arrow.setAttribute('aria-hidden', 'true');
    openLinked.classList.add('medication-checklist-link');
    openLinked.append(svgIcon('med-icon-checklist', 'medication-checklist-icon'), linkedName, arrow);
    const unlinked = node('div', 'medication-checklist-empty');
    unlinked.append(svgIcon('med-icon-checklist', 'medication-checklist-icon'), linkText);
    linkInfo.append(openLinked, unlinked);
    const stockLine = node('div', 'medication-stock-line');
    const stockInfo = node('div', 'medication-stock-info'); stockInfo.append(count, packSize, estimate);
    stockLine.append(stockInfo, restockToggle);
    const details = node('div', 'medication-details');
    details.append(schedule, stockLine, warning, buttons, doseState, restock, linkInfo);
    details.hidden = isNew;
    card.append(heading, editor, details);
    (isNew ? document.getElementById('health-new-medication') : medicationList).append(card);
    const row = node('label', 'medication-row');
    const check = node('input', ''); check.type = 'checkbox'; check.dataset.dose = medication.id;
    check.addEventListener('change', () => recordDose(medication, check.checked));
    const copy = node('span', ''); copy.append(node('strong', ''), node('small', ''));
    row.append(check, copy); if (!isNew) document.getElementById('medication-checks').append(row);
    Object.assign(view, { card, row, linkText, openLinked, linkedName, unlinked, linkField, linkSelect, linkPicker, title, iconUse, handle, schedule, copy, editor, fields, edit, save, cancel, count, packSize, estimate, warning, dose, undo, logLozenge, undoLozenge, doseState, restock, restockToggle, cancelStock, quantity, restockLabel: label, add, check });
    if (isNew) { card.hidden = true; edit.hidden = true; } else cards.set(medication.id, view);
    return view;
  }

  function render() {
    day = today();
    const entries = read();
    const medications = orderedSettings(entries).map(fromSetup);
    const signedIn = Boolean(account?.uid);
    const readOnly = !account?.ready || account.cached || !navigator.onLine;
    const locked = busy || readOnly;
    if (locked && (pickedUp || drag)) clearReorder();
    for (const medication of medications) if (!cards.has(medication.id)) createCard(medication);
    const medicationIds = new Set(medications.map(medication => medication.id));
    for (const [id, view] of cards) {
      if (medicationIds.has(id) || dirty(view)) continue;
      view.linkPicker.destroy();
      view.card.remove();
      view.row.remove();
      cards.delete(id);
    }
    let nextCard = medicationList.firstElementChild;
    for (const [index, medication] of medications.entries()) {
      const view = cards.get(medication.id);
      if (view.card !== nextCard) medicationList.insertBefore(view.card, nextCard);
      nextCard = view.card.nextElementSibling;
      const count = stock(medication, entries);
      const checked = taken(medication, entries, day);
      const current = configured(medication, entries);
      const stockOnly = asNeeded(current);
      const nicotine = isNicotine(current);
      const lozengeCount = nicotine ? lozengesToday(medication, entries, day).length : 0;
      const link = binding(medication, entries); const linked = linkedChecklist(link);
      const visibleHere = Boolean(linked && workspace.selected && linked.id === workspace.selected.id);
      view.row.hidden = !visibleHere;
      view.linkText.textContent = link ? 'Checklist unavailable' : 'No linked checklist';
      view.openLinked.hidden = !linked; view.openLinked.disabled = locked;
      view.unlinked.hidden = Boolean(linked);
      view.openLinked.closest('.medication-link-info').hidden = stockOnly;
      view.linkText.hidden = Boolean(linked);
      view.linkedName.textContent = linked?.name ?? '';
      if (linked) view.openLinked.setAttribute('aria-label', `Open ${linked.name} for ${current.name}`);
      updateLinkChoices(view, entries);
      view.title.textContent = current.name;
      view.handle.setAttribute('aria-label', `Reorder ${current.name}, position ${index + 1} of ${medications.length}`);
      view.handle.hidden = medications.length < 2;
      view.handle.disabled = locked || !view.editor.hidden;
      view.card.toggleAttribute('data-movable', !view.handle.disabled && !view.handle.hidden);
      const iconHref = `#med-icon-${medicationIcon(current)}`;
      if (view.iconUse.getAttribute('href') !== iconHref) view.iconUse.setAttribute('href', iconHref);
      view.schedule.textContent = scheduleText(current);
      if (nicotine) view.schedule.textContent = `As needed · ${lozengeCount} logged today`;
      view.logLozenge.hidden = !nicotine;
      view.logLozenge.disabled = locked || count < 1;
      view.logLozenge.setAttribute('aria-label', `Log lozenge taken for ${current.name}`);
      view.undoLozenge.hidden = !lozengeCount;
      view.undoLozenge.disabled = locked;
      view.undoLozenge.setAttribute('aria-label', `Undo last lozenge for ${current.name}`);
      view.copy.querySelector('strong').textContent = `Take ${current.name}`;
      view.copy.querySelector('small').textContent = `${tabletCount(current.quantity)} · ${timing(current)}`;
      view.dose.setAttribute('aria-label', `Mark ${current.name} taken`); view.undo.setAttribute('aria-label', `Undo ${current.name} dose`);
      view.edit.setAttribute('aria-label', `Edit ${current.name}`); view.save.setAttribute('aria-label', `Save ${current.name} changes`); view.cancel.setAttribute('aria-label', `Cancel ${current.name} changes`);
      view.add.setAttribute('aria-label', `Save stock for ${current.name}`);
      view.restockToggle.setAttribute('aria-label', `Add stock for ${current.name}`);
      view.cancelStock.setAttribute('aria-label', `Cancel stock addition for ${current.name}`);
      view.cancelStock.disabled = busy;
      view.edit.disabled = locked;
      renderEditorFields(view, locked);
      const unit = nicotine ? 'lozenges' : stockOnly ? 'units' : 'tablets';
      view.count.textContent = `${count} ${unit} left`;
      view.restockLabel.textContent = `${unit[0].toUpperCase()}${unit.slice(1)} to add`;
      view.quantity.defaultValue = current.packSize ?? 30;
      view.packSize.textContent = current.packSize ? `Pack of ${stockOnly ? `${current.packSize} ${unit}` : tabletCount(current.packSize)}` : '';
      view.packSize.hidden = !current.packSize;
      view.estimate.hidden = stockOnly;
      view.estimate.textContent = view.estimate.hidden ? '' : `~${Math.floor(count / current.quantity)} days left`;
      view.warning.textContent = count < current.quantity ? 'Not enough stock for the next dose.' : 'Low stock · add more soon';
      view.warning.hidden = stockOnly || count > current.quantity * 7;
      if (nicotine) {
        view.warning.textContent = count === 0 ? 'Out of lozenges · buy more' : `Only ${count} left · buy more soon`;
        view.warning.hidden = count > lowLozenges;
      }
      const todayDose = entries.find(entry => entry.key === doseKey(day, medication.id));
      const recordedQuantity = checked ? doseQuantity(todayDose) : 0;
      view.doseState.textContent = checked ? `${tabletCount(recordedQuantity)} recorded` : '';
      if (checked) view.copy.querySelector('small').textContent = `${recordedQuantity} tablet${recordedQuantity === 1 ? '' : 's'} recorded today`;
      view.dose.textContent = checked ? 'Taken today' : 'Mark taken';
      view.card.dataset.taken = String(checked && !stockOnly);
      view.dose.hidden = stockOnly;
      view.doseState.hidden = stockOnly || !checked;
      view.dose.disabled = locked || stockOnly || checked || count < current.quantity;
      view.undo.hidden = stockOnly || !checked; view.undo.disabled = locked;
      view.add.disabled = view.quantity.disabled = view.restockToggle.disabled = locked;
      if (!busy) view.check.checked = checked;
      view.check.disabled = locked || !checked && count < current.quantity;
    }
    document.getElementById('health-data-badge').hidden = !signedIn;
    document.getElementById('health-account-content').hidden = !signedIn;
    toolbar.hidden = !signedIn;
    importFile.disabled = importText.disabled = busy;
    updateImportButton();
    const daily = medications.filter(medication => !asNeeded(configured(medication, entries)));
    const totalTaken = daily.filter(medication => taken(medication, entries, day)).length;
    document.getElementById('health-today').textContent = daily.length ? `${totalTaken} of ${daily.length} taken` : '';
    document.getElementById('health-summary').hidden = !daily.length;
    const progress = document.getElementById('health-dose-progress');
    progress.max = daily.length || 1;
    progress.value = totalTaken;
    document.getElementById('health-empty').hidden = !account?.ready || medications.length > 0 || !newView?.card.hidden;
    document.getElementById('health-reorder-help').hidden = locked || medications.length < 2;
    document.getElementById('health-sign-in').hidden = signedIn;
    document.getElementById('health-sync-retry').hidden = !signedIn || !account.error;
    sync.textContent = signedIn ? account.error || (!account.ready ? navigator.onLine ? 'Loading account Health…' : 'Connect to load account Health.' : readOnly ? 'Offline copy. Connect to record changes.' : busy ? 'Syncing…' : 'Synced to your account.') : 'Sign in to see your medication and stock.';
    sync.dataset.state = signedIn && !account.error && !locked ? 'synced' : '';
    const visible = workspace.selected ? medications.filter(medication => linkedChecklist(binding(medication, entries))?.id === workspace.selected.id) : [];
    if (workspace.selected && normalizedName(workspace.selected.name) === 'morning routine') {
      const rank = medication => morningDoseOrder.get(medicationIcon(configured(medication, entries))) ?? morningDoseOrder.size;
      visible.sort((first, second) => rank(first) - rank(second));
    }
    const visibleRows = visible.map(medication => cards.get(medication.id).row);
    const doseList = document.getElementById('medication-checks');
    let nextRow = doseList.firstElementChild;
    for (const row of visibleRows) {
      if (row !== nextRow) doseList.insertBefore(row, nextRow);
      nextRow = row.nextElementSibling;
    }
    routineSection.hidden = !visible.length;
    const completed = visible.filter(medication => taken(medication, entries, day)).length;
    document.getElementById('medication-today').textContent = `${completed} of ${visible.length} doses recorded today`;
    addMedication.disabled = locked;
    if (newView) {
      updateLinkChoices(newView, entries);
      renderEditorFields(newView, locked);
    }
    status.textContent = busy ? 'Saving medication change…' : reorderHint || message;
    routineStatus.textContent = busy ? 'Saving medication change…' : message;
    status.dataset.warning = routineStatus.dataset.warning = String(failed);
    const focused = history.contains(document.activeElement);
    history.replaceChildren();
    for (const entry of entries.sort((a, b) => b.at - a.at).slice(0, 12)) {
      const medication = medications.find(med => med.id === entry.medication);
      const row = node('li', 'health-history-row');
      row.dataset.event = entry.type === 'dose' ? entry.taken ? 'taken' : 'undone' : entry.type;
      const quantity = entry.type === 'dose' ? doseQuantity(entry) : 0;
      const units = asNeeded(configured(medication, entries)) ? 'units' : 'tablets';
      const text = entry.type === 'settings' ? 'Medication setup updated' : entry.type === 'restock' ? `Added ${entry.quantity} ${units}` :
        entry.type === 'lozenge' ? 'Taken · 1 lozenge' : entry.taken ? `Taken · ${tabletCount(quantity)}` : 'Dose undone · stock restored';
      row.append(node('strong', '', entry.name || medication.name), node('span', '', text), node('small', '', `${stampFormat.format(entry.at)}${entry.type === 'dose' ? ' · Dose for ' + entry.date : ''}`));
      if (entry.type === 'restock' || entry.type === 'lozenge' || entry.type === 'dose' && entry.taken) {
        const name = entry.name || medication.name;
        const undo = entry.type === 'restock'
          ? action('Undo', `Undo stock addition for ${name}`, () => undoRestock(medication, entry))
          : entry.type === 'lozenge' ? action('Undo', `Undo ${name} lozenge`, () => undoNicotine(medication, entry))
            : action('Undo', `Undo ${name} dose for ${entry.date}`, () => recordDose(medication, false, entry.date));
        undo.disabled = locked; row.append(undo);
      }
      history.append(row);
    }
    document.getElementById('health-history-empty').hidden = history.children.length > 0;
    if (focused) status.focus({ preventScroll: true });
    document.getElementById('health-open-care').disabled = !currentRoutineCard();
    document.dispatchEvent(new Event('hub:healthchange'));
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
  panel.addEventListener('cancel', event => {
    if (pickedUp || drag) {
      event.preventDefault();
      clearReorder();
      render();
    } else if (hasDraft() || busy) {
      event.preventDefault();
      event.stopImmediatePropagation();
      requestExit(() => panel.close());
    }
  }, true);
  panel.addEventListener('close', () => {
    clearReorder();
    for (const view of allViews()) cancelEditor(view);
    for (const view of cards.values()) {
      view.restock.hidden = true;
      view.restockToggle.setAttribute('aria-expanded', 'false');
    }
    resetImport();
    selectTab(todayTab, false);
  });
  importText.addEventListener('input', () => {
    importFileRead++;
    importFile.value = '';
    previewImport(importText.value);
  });
  importFile.addEventListener('change', async () => {
    const file = importFile.files[0];
    if (!file) return;
    const request = ++importFileRead;
    importText.value = '';
    previewImport('');
    try {
      if (file.size > 120000) throw new Error('Choose a JSON file smaller than 120 KB.');
      const text = await file.text();
      if (request !== importFileRead) return;
      if (text.length > importText.maxLength) throw new Error('This file is too long. Use a list with up to 50 medications.');
      importText.value = text;
      previewImport(text);
    } catch (error) {
      if (request === importFileRead) importStatus.textContent = error instanceof DOMException ? 'This file could not be read.' : error.message;
    }
  });
  importSave.addEventListener('click', importMedicationList);
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      const target = { ArrowLeft: (index + tabs.length - 1) % tabs.length, ArrowRight: (index + 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
      if (target === undefined) return;
      event.preventDefault();
      selectTab(tabs[target]);
      tabs[target].focus({ preventScroll: true });
    });
  });
  document.getElementById('medication-discard-confirm').addEventListener('click', () => { const run = discardAction; discardAction = undefined; for (const view of allViews()) cancelEditor(view); discard.close(); run?.(); });
  discard.addEventListener('close', () => { if (!discard.open) discardAction = undefined; });
  window.addEventListener('beforeunload', event => { if (hasDraft() || busy) { event.preventDefault(); event.returnValue = ''; } });
  newView = createCard({ id: 'new-medication', name: 'New medication', quantity: 1, time: '08:00', initial: 0 }, true);
  addMedication.addEventListener('click', () => {
    selectTab(todayTab);
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
          clearReorder();
          for (const view of allViews()) cancelEditor(view);
          resetImport();
          selectTab(todayTab);
          accountId = account.uid;
          message = ''; failed = false;
        }
        render();
      }, validateLedger);
      account.watch();
    },
    refresh: render, nicotineState, logNicotine, undoNicotine, lozengeDays,
    canNavigate() { if (!hasDraft() && !busy) return true; message = 'Save or cancel medication edits before opening quick access.'; failed = true; render(); return false; } };
}
