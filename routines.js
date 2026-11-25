import {
  validateRoutines, parseProgress, itemKey, getWorkspaceProgress, isComplete, restartRoutine, lisbonDay, routineItemLabel, updateRoutineSections, linkedDoseReplaces, routinePlan, routineRelevant,
  skinCareOptionsFor, skinCareOptions, skinCareProgress, skinCareItemKey, setSkinCareChoice,
  isMinoxidilItem, minoxidilCheckKey, setMinoxidilLater
} from './routine-model.mjs?v=calendar-today-1';
import { cloudWorkspace } from './cloud.js?v=calendar-today-1';
import { readWorkspace, cleanRoutines, keepProgress } from './workspace-model.mjs?v=calendar-today-1';
import { createRoutineTools } from './routine-tools.js?v=calendar-today-1';

export { createHealthAccount } from './cloud-health.js?v=calendar-today-1';

const dialog = document.getElementById('routines-dialog');
const list = document.getElementById('routine-list');
const picker = document.getElementById('routine-picker');
const routinePicker = window.createChecklistPicker(picker);
picker.addEventListener('change', () => {
  const routine = routines.find(routine => routine.id === picker.value);
  if (routine) selectRoutine(routine);
});
const content = document.getElementById('routine-content');
const medicationSection = document.getElementById('personal-care-medications');
const notice = document.getElementById('routine-notice');
const sourceBadge = document.getElementById('routine-source');
const restartDialog = document.getElementById('restart-dialog');
let pendingRestart;
let routines = [];
let selected;
let state;
let storageKey;
let workspaceKey;
let selectionKey;
let localOverride = false;
let storageAvailable = true;
let loadGeneration = 0;
let progressDay;
let pendingDailyChoice;
let medicationProgress = new Map();
let calendarState;
let showAllChecklists = true;

function applyCalendarContext() {
  const context = document.getElementById('routine-plan-context');
  const available = Boolean(calendarState?.ready && calendarState.scope === workspaceIdentity());
  context.hidden = !available;
  const today = available ? calendarState.today.plans : [];
  const focus = available && today.length > 0 && !showAllChecklists;
  if (available) {
    document.getElementById('routine-today-plans').textContent = `Today: ${calendarState.today.label || 'No plans'}`;
    document.getElementById('routine-tomorrow-plans').textContent = `Tomorrow: ${calendarState.tomorrow.label || 'No plans'}`;
    const toggle = document.getElementById('routine-all-checklists');
    toggle.hidden = !today.length;
    toggle.textContent = showAllChecklists ? 'Today’s checklists' : 'All checklists';
    toggle.setAttribute('aria-pressed', String(showAllChecklists));
  }
  const order = focus ? [...routines].sort((a, b) => Number(routineRelevant(b.name, today)) - Number(routineRelevant(a.name, today))) : routines;
  for (const routine of order) {
    const card = list.querySelector(`[data-routine="${routine.id}"]`);
    const option = [...picker.options].find(option => option.value === routine.id);
    const hidden = focus && !routineRelevant(routine.name, today) && routine.id !== selected?.id;
    if (card) { card.hidden = hidden; list.append(card); }
    if (option) { option.hidden = hidden; picker.append(option); }
  }
  if (selected) picker.value = selected.id;
  routinePicker.refresh();
  const tomorrow = available && calendarState.active && selected?.name.trim().toLowerCase() === 'wind down' ? calendarState.tomorrow.plans : undefined;
  for (const row of content.querySelectorAll('.linked-check-row')) {
    const target = routines.find(routine => routine.id === row.querySelector('input').dataset.linked);
    const plan = target && routinePlan(target.name);
    row.hidden = Boolean(!showAllChecklists && tomorrow && plan && row.closest('.check-section').dataset.optional && !tomorrow.includes(plan));
  }
  for (const section of content.querySelectorAll('.check-section[data-optional]')) {
    if (section.querySelector('.linked-check-row')) section.hidden = [...section.querySelector('.check-items').children].every(child => child.hidden);
  }
}

document.getElementById('routine-all-checklists').addEventListener('click', () => { showAllChecklists = !showAllChecklists; applyCalendarContext(); });
document.getElementById('routine-plan-tomorrow').addEventListener('click', () => document.dispatchEvent(new CustomEvent('hub:opencalendar', { detail: { day: calendarState?.tomorrow.day } })));
document.addEventListener('hub:calendarchange', event => {
  if (calendarState?.scope !== event.detail.scope) showAllChecklists = true;
  calendarState = event.detail;
  applyCalendarContext();
});
document.dispatchEvent(new Event('hub:calendarrequest'));

const inAccount = () => dialog.dataset.source === 'account';
function workspaceIdentity() {
  if (!inAccount()) return dialog.dataset.source;
  return cloudWorkspace.user ? `account:${cloudWorkspace.user.uid}` : undefined;
}

function make(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

async function readData(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(path, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('Checklist file unavailable.');
    return validateRoutines(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

function latestProgress() {
  if (inAccount()) return cloudWorkspace.progress;
  // Read other tabs' saved ticks before applying the current edit.
  if (!storageAvailable) return state;
  try {
    const raw = localStorage.getItem(workspaceKey);
    if (raw) return readWorkspace(JSON.parse(raw)).progress;
    return parseProgress(localStorage.getItem(storageKey));
  } catch {
    storageAvailable = false;
    return state;
  }
}

function save() {
  if (inAccount()) {
    try { cloudWorkspace.save(state); }
    catch { notice.textContent = 'Account is not ready. Your ticks have not synced. Open Account & sync to retry.'; }
    return;
  }
  if (!storageAvailable) {
    notice.textContent = 'Browser storage is unavailable. Your ticks will last for this visit only.';
    return;
  }
  try {
    const raw = localStorage.getItem(workspaceKey);
    if (raw) {
      const latest = readWorkspace(JSON.parse(raw));
      if (JSON.stringify(latest.routines) !== JSON.stringify(routines)) {
        queueMicrotask(initialiseRoutines);
        return;
      }
      state = keepProgress(routines, state);
      localStorage.setItem(workspaceKey, JSON.stringify({ routines, progress: state }));
    } else if (localOverride) {
      queueMicrotask(initialiseRoutines);
      return;
    } else localStorage.setItem(storageKey, JSON.stringify(state));
    notice.textContent = 'Progress saved in this browser.';
  } catch {
    storageAvailable = false;
    notice.textContent = 'Browser storage is unavailable. Your ticks will last for this visit only.';
  }
}

function updateProgress() {
  progressDay = lisbonDay();
  const skinCare = skinCareProgress(state.checks, progressDay);
  const workspaceProgress = getWorkspaceProgress(routines, state, skinCare, progressDay, medicationProgress);
  for (const row of content.querySelectorAll('[data-skin-care]')) {
    const choices = [...row.querySelectorAll('button[data-skin-care-option]')];
    const selectedOption = skinCare.selected.get(row.dataset.skinCare);
    const choice = choices.some(button => button.dataset.skinCareOption === selectedOption) ? selectedOption : undefined;
    const disposition = ['l', 'n'].includes(selectedOption) ? selectedOption : undefined;
    const legacy = state.checks[row.dataset.skinCare] === true;
    const bothUsed = choices.every(button => skinCare.used.has(button.dataset.skinCareOption));
    // Later is offered once a day: after one checklist postpones skincare, the next one has to settle it.
    const laterUsed = [...skinCare.selected].some(([key, value]) => value === 'l' && key !== row.dataset.skinCare);
    const status = row.querySelector('.skin-care-status');
    const elsewhere = choices.filter(button => skinCare.used.has(button.dataset.skinCareOption)).map(button => {
      const option = button.dataset.skinCareOption;
      const source = [...skinCare.selected].find(([, value]) => value === option)?.[0].split('/')[0];
      const name = routines.find(routine => routine.id === source)?.name;
      return `${skinCareOptions[option]} · Done in ${name ?? 'another checklist'}`;
    }).join(' · ');
    status.textContent = disposition === 'l' ? 'Later · excluded from this checklist'
      : disposition === 'n' ? 'Not needed · excluded from this checklist'
      : choice ? `${skinCareOptions[choice]} applied today` : elsewhere || (legacy ? 'Previously ticked · choose what you applied today' : '');
    row.dataset.done = String(!disposition && (Boolean(choice) || bothUsed || legacy));
    row.dataset.skipped = String(Boolean(disposition));
    for (const button of row.querySelectorAll('button')) {
      const option = button.dataset.skinCareOption;
      const skip = button.dataset.skinCareDisposition;
      button.hidden = option ? Boolean(choice || disposition) || skinCare.used.has(option)
        : skip ? Boolean(choice || disposition) || bothUsed || (skip === 'l' && laterUsed) : !(choice || disposition);
      button.disabled = Boolean(pendingDailyChoice);
    }
  }
  for (const input of content.querySelectorAll('input[data-check]')) {
    const key = input.hasAttribute('data-minoxidil') ? minoxidilCheckKey(progressDay) : input.dataset.check;
    input.checked = state.checks[key] === true;
    if (input.dataset.healthDose) input.closest('.check-row').hidden = Boolean(linkedDoseReplaces({ label: input.dataset.healthDose }, medicationProgress.get(selected.id)));
  }
  const minoxidilLaterUsed = [...skinCare.selected.values()].includes('d');
  for (const row of content.querySelectorAll('[data-minoxidil-row]')) {
    const input = row.querySelector('input');
    const deferred = skinCare.selected.get(input.dataset.check) === 'd';
    if (deferred) input.checked = false;
    input.hidden = deferred;
    input.disabled = deferred || Boolean(pendingDailyChoice);
    row.dataset.skipped = String(deferred);
    row.dataset.done = String(!deferred && input.checked);
    row.querySelector('.skin-care-status').textContent = deferred ? 'Later · excluded from this checklist' : '';
    row.querySelector('[data-minoxidil-later]').hidden = input.checked || minoxidilLaterUsed;
    row.querySelector('[data-minoxidil-undo]').hidden = !deferred;
    for (const button of row.querySelectorAll('button')) button.disabled = Boolean(pendingDailyChoice);
  }
  for (const row of content.querySelectorAll('.linked-check-row')) {
    const input = row.querySelector('input');
    const linked = workspaceProgress.get(input.dataset.linked);
    input.checked = isComplete(linked);
    const status = row.querySelector('.linked-check-status');
    const name = status.dataset.checklistName;
    status.textContent = input.checked ? `${name} complete` : `${name}: ${linked.done} of ${linked.total} ready`;
  }
  const signals = routines.map(routine => {
    const progress = workspaceProgress.get(routine.id);
    const card = list.querySelector(`[data-routine="${routine.id}"]`);
    card.querySelector('.routine-count').textContent = `${progress.done} / ${progress.total}`;
    card.querySelector('.routine-mini-fill').style.transform = `scaleX(${progress.percent / 100})`;
    return { id: routine.id, name: routine.name, ...progress };
  });
  const progress = workspaceProgress.get(selected.id);
  content.closest('.routine-detail').dataset.complete = String(isComplete(progress));
  document.getElementById('routine-progress-label').textContent = isComplete(progress) ? 'All set. You’re ready.' : `${progress.done} of ${progress.total} ready`;
  const bar = document.getElementById('routine-progress');
  bar.setAttribute('aria-valuenow', progress.percent);
  bar.firstElementChild.style.transform = `scaleX(${progress.percent / 100})`;
  const prefix = `${selected.id}/`;
  const hasTicks = Object.entries(state.checks).some(([key, checked]) => checked && key.startsWith(prefix) && !skinCareItemKey(key));
  document.getElementById('routine-restart').disabled = Boolean(pendingDailyChoice) || !(hasTicks || [...skinCare.selected.keys()].some(key => key.startsWith(prefix)));
  document.dispatchEvent(new CustomEvent('hub:progress', { detail: signals }));
}

async function chooseDailyTask(row, key, button, option, checked) {
  if (!option || pendingDailyChoice) return;
  const error = row.querySelector('.skin-care-error');
  const identity = workspaceIdentity();
  const day = lisbonDay();
  pendingDailyChoice = row;
  error.textContent = '';
  updateProgress();
  try {
    if (inAccount()) {
      await cloudWorkspace.chooseDailyTask(key, option, checked, day);
      if (identity === workspaceIdentity()) state = latestProgress();
    } else {
      const latest = latestProgress();
      state = option === 'd' ? setMinoxidilLater(routines, latest, key, checked, day)
        : setSkinCareChoice(routines, latest, key, option, checked, day);
      save();
    }
  } catch (failure) {
    error.textContent = failure.message;
  } finally {
    pendingDailyChoice = undefined;
    if (selected) updateProgress();
    if (row.isConnected && [button, document.body].includes(document.activeElement)) {
      (button.hidden ? row.querySelector('button:not([hidden]), input:not([hidden])') : button)?.focus();
    }
  }
}

function createSkinCareRow(key, title, options) {
  const row = make('div', 'check-row skin-care-row');
  row.dataset.skinCare = key;
  const status = make('span', 'skin-care-status');
  status.setAttribute('role', 'status');
  const error = make('span', 'skin-care-error');
  error.setAttribute('role', 'status');
  const buttons = make('div', 'skin-care-actions');
  const choose = (button, option, checked) => chooseDailyTask(row, key, button, option, checked);
  for (const option of options) {
    const button = make('button', '', skinCareOptions[option]);
    button.type = 'button';
    button.dataset.skinCareOption = option;
    button.addEventListener('click', () => choose(button, option, true));
    buttons.append(button);
  }
  for (const [option, title] of [['l', 'Later']]) {
    const button = make('button', '', title);
    button.type = 'button';
    button.dataset.skinCareDisposition = option;
    button.addEventListener('click', () => choose(button, option, true));
    buttons.append(button);
  }
  const undo = make('button', '', 'Undo');
  undo.type = 'button';
  undo.setAttribute('aria-label', 'Undo skincare choice');
  undo.addEventListener('click', () => choose(undo, skinCareProgress(state.checks).selected.get(key), false));
  buttons.append(undo);
  const copy = make('div', 'skin-care-copy');
  copy.append(make('span', '', title), status, error);
  row.append(copy, buttons);
  return row;
}

function createMinoxidilRow(label, key) {
  const row = make('div', 'check-row skin-care-row');
  row.dataset.minoxidilRow = '';
  const copy = make('div', 'skin-care-copy');
  const status = make('span', 'skin-care-status');
  status.setAttribute('role', 'status');
  const error = make('span', 'skin-care-error');
  error.setAttribute('role', 'status');
  copy.append(label, status, error);
  const actions = make('div', 'skin-care-actions');
  const later = make('button', '', 'Later');
  later.type = 'button';
  later.dataset.minoxidilLater = '';
  later.setAttribute('aria-label', 'Minoxidil: Later');
  later.addEventListener('click', () => chooseDailyTask(row, key, later, 'd', true));
  const undo = make('button', '', 'Undo');
  undo.type = 'button';
  undo.dataset.minoxidilUndo = '';
  undo.setAttribute('aria-label', 'Undo Minoxidil postponement');
  undo.addEventListener('click', () => chooseDailyTask(row, key, undo, 'd', false));
  actions.append(later, undo);
  row.append(copy, actions);
  return row;
}

function selectRoutine(routine, remember = true) {
  selected = routine;
  if (remember && selectionKey) {
    try { localStorage.setItem(selectionKey, routine.id); } catch { /* Optional navigation state must never block a checklist. */ }
  }
  picker.value = routine.id;
  routinePicker.refresh();
  for (const button of list.children) button.setAttribute('aria-pressed', String(button.dataset.routine === routine.id));
  document.getElementById('routine-name').textContent = routine.name;
  document.getElementById('routine-description').textContent = routine.description;
  document.getElementById('routine-reader').append(medicationSection);
  content.replaceChildren();
  for (const group of routine.groups) {
    const section = make('section', 'check-section');
    const body = make('div', 'check-items');
    section.append(make('h4', 'check-section-title', group.title));
    if (group.optional) section.dataset.optional = 'true';
    if (group.optional && /^optional\b/i.test(group.title)) section.dataset.optionalNamed = 'true';
    if (routine.name.trim().toLowerCase() === 'getting ready' && /^(?:optional )?accessories$/i.test(group.title.trim())) section.dataset.accessories = '';
    for (const item of group.items) {
      const key = itemKey(routine, group, item);
      const target = routines.find(candidate => candidate.id === item.linkedChecklist);
      if (target) {
        body.append(createLinkedRow(item, target));
        continue;
      }
      const options = skinCareOptionsFor(item.label);
      if (options.length) {
        body.append(createSkinCareRow(key, routineItemLabel(routine, item), options));
        continue;
      }
      const minoxidil = isMinoxidilItem(item.label);
      const label = make('label', minoxidil ? 'minoxidil-control' : 'check-row');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.dataset.check = key;
      if (/^take (?:melatonin|valdispert\s*noite)$/i.test(item.label.trim())) {
        input.dataset.healthDose = item.label;
        section.dataset.medicationTarget = '';
      }
      if (minoxidil) input.dataset.minoxidil = '';
      input.addEventListener('change', () => {
        state = latestProgress();
        state.checks[minoxidil ? minoxidilCheckKey(lisbonDay()) : key] = input.checked;
        save();
        updateProgress();
      });
      label.append(input, make('span', '', routineItemLabel(routine, item)));
      if (group.optional) label.append(make('small', 'optional-task', 'Optional'));
      body.append(minoxidil ? createMinoxidilRow(label, key) : label);
    }
    section.append(body);
    content.append(section);
  }
  // Show the old split groups together without changing any saved progress keys.
  const accessorySections = [...content.querySelectorAll('[data-accessories]')];
  const accessories = accessorySections.find(section => /^accessories$/i.test(section.querySelector('h4').textContent.trim())) ?? accessorySections[0];
  if (accessories) {
    accessories.querySelector('h4').textContent = 'Accessories';
    delete accessories.dataset.optionalNamed;
    for (const section of accessorySections.filter(section => section !== accessories)) {
      accessories.querySelector('.check-items').append(...section.querySelector('.check-items').childNodes);
      section.remove();
    }
  }
  const lastRequired = [...content.querySelectorAll('.check-section:not([data-optional]) .check-items')].at(-1);
  (content.querySelector('[data-medication-target] .check-items') ?? lastRequired ?? content).append(medicationSection);
  updateProgress();
  applyCalendarContext();
  document.dispatchEvent(new CustomEvent('hub:checklistview', { detail: { scope: workspaceIdentity(), routines: routines.map(({ id, name }) => ({ id, name })), selected: { id: routine.id, name: routine.name } } }));
}

export function openPlannedChecklist(plan, closeCalendar) {
  if (dialog.dataset.ready !== 'true' || !inAccount()) return false;
  const target = routines.find(routine => routinePlan(routine.name) === plan);
  if (!target) return false;

  closeCalendar();
  if (!dialog.open) document.getElementById('routines-launch').click();
  focusChecklist(target);
  return true;
}

function focusChecklist(target) {
  selectRoutine(target);
  const heading = document.getElementById('routine-name');
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
  heading.scrollIntoView({ block: 'start' });
}

function createLinkedRow(item, target) {
  const row = make('div', 'linked-check-row');
  const label = make('label', 'check-row');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.disabled = true;
  input.dataset.linked = target.id;
  const status = make('span', 'linked-check-status');
  status.dataset.checklistName = target.name;
  label.append(input, make('span', '', item.label), status);
  const open = make('button', 'routine-linked-button', 'Open');
  open.type = 'button';
  open.setAttribute('aria-label', `Open ${target.name}`);
  open.addEventListener('click', () => focusChecklist(target));
  row.append(label, open);
  return row;
}

document.getElementById('routine-restart').addEventListener('click', () => {
  if (!selected || restartDialog.open) return;
  pendingRestart = selected;
  document.getElementById('restart-description').textContent = `Clear the ticks in ${selected.name}? Your other checklists and Health records will stay as they are.`;
  restartDialog.showModal();
});

document.getElementById('restart-confirm').addEventListener('click', () => {
  if (!restartDialog.open || !pendingRestart) return;
  const routine = pendingRestart;
  pendingRestart = undefined;
  restartDialog.close();
  state = restartRoutine(routine, latestProgress());
  save();
  selectRoutine(selected);
  content.querySelector('input')?.focus();
});
restartDialog.addEventListener('close', () => { if (!restartDialog.open) pendingRestart = undefined; });

export async function initialiseRoutines() {
  const current = ++loadGeneration;
  document.dispatchEvent(new CustomEvent('hub:checklistview', { detail: null }));
  selectionKey = undefined;
  routines = [];
  selected = undefined;
  medicationProgress = new Map();
  pendingRestart = undefined;
  restartDialog.close();
  list.replaceChildren();
  routinePicker.close();
  picker.replaceChildren();
  picker.disabled = true;
  document.getElementById('routine-reader').append(medicationSection);
  content.replaceChildren();
  document.getElementById('restart-description').textContent = '';
  content.closest('.routine-detail').dataset.complete = 'false';
  document.getElementById('routine-name').textContent = 'Your next move';
  document.getElementById('routine-description').textContent = 'Choose a checklist to begin.';
  document.getElementById('routine-progress-label').textContent = 'Ready when you are.';
  document.getElementById('routine-progress').setAttribute('aria-valuenow', '0');
  document.getElementById('routine-progress').firstElementChild.style.transform = 'scaleX(0)';
  document.getElementById('routine-restart').disabled = true;
  document.dispatchEvent(new CustomEvent('hub:progress', { detail: [] }));
  let source = 'demo';
  let localWarning = '';
  let loadedRoutines = [];
  if (cloudWorkspace.user && !cloudWorkspace.ready) {
    sourceBadge.textContent = 'ACCOUNT';
    document.getElementById('routine-data-note').textContent = 'Private checklists are waiting for your account connection.';
    notice.textContent = cloudWorkspace.status;
    dialog.dataset.source = 'account';
    dialog.dataset.ready = 'true';
    return;
  }
  if (cloudWorkspace.active) {
    loadedRoutines = cloudWorkspace.routines;
    source = 'account';
  }
  // Personal data is requested only from a loopback server; /private/ is excluded from Git.
  if (!loadedRoutines.length && ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname)) {
    try {
      loadedRoutines = await readData('./private/routines.json');
      source = 'private';
    } catch {
      localWarning = 'Personal checklists could not be loaded. Showing demo examples.';
    }
  }
  if (!loadedRoutines.length) loadedRoutines = await readData('./routines.demo.json');
  if (current !== loadGeneration) return;
  routines = loadedRoutines.map(updateRoutineSections);
  storageKey = `thehub:routines:${source}:v1`;
  workspaceKey = `thehub:workspace:${source}:v1`;
  dialog.dataset.source = source;
  selectionKey = `thehub:selection:${workspaceIdentity()}:v1`;
  localOverride = false;
  storageAvailable = true;
  try {
    state = source === 'account' ? cloudWorkspace.progress : parseProgress(localStorage.getItem(storageKey));
    if (source !== 'account') {
      const raw = localStorage.getItem(workspaceKey);
      if (raw) {
        const workspace = readWorkspace(JSON.parse(raw));
        routines = workspace.routines;
        state = workspace.progress;
        localOverride = true;
      }
    }
  } catch {
    storageAvailable = false;
    state = parseProgress(null);
    localWarning = 'Saved progress could not be read. You can use the checklists for this visit.';
  }
  sourceBadge.textContent = source === 'account' ? 'PRIVATE / YOUR ACCOUNT' : localOverride ? 'CUSTOM / THIS BROWSER' : source === 'private' ? 'PERSONAL / THIS PC' : 'DEMO / SAMPLE DATA';
  document.getElementById('routine-data-note').textContent = source === 'account' ? 'Your personal checklists. Available on devices signed into your account.' : localOverride ? 'Your edited checklists, saved in this browser. Export a backup to keep a copy.' : source === 'private' ? 'Your real checklists. Loaded only from this PC.' : 'Example checklists. Your personal lists are not on this website.';
  notice.textContent = source === 'account' ? cloudWorkspace.status : localWarning || 'Ticks stay in this browser. Nothing is sent to an account.';
  list.replaceChildren();
  for (const [index, routine] of routines.entries()) {
    const card = make('button', 'routine-card');
    card.type = 'button';
    card.dataset.routine = routine.id;
    card.setAttribute('aria-pressed', 'false');
    card.append(make('span', 'routine-index', `${String(index + 1).padStart(2, '0')} / CHECKLIST`), make('span', 'routine-card-name', routine.name));
    const track = make('span', 'routine-mini-track');
    track.setAttribute('aria-hidden', 'true');
    track.append(make('span', 'routine-mini-fill'));
    card.append(make('span', 'routine-count'), track);
    card.addEventListener('click', () => selectRoutine(routine));
    list.append(card);
    const option = document.createElement('option');
    option.value = routine.id;
    option.textContent = routine.name;
    picker.append(option);
  }
  picker.disabled = list.inert;
  let remembered;
  try { remembered = localStorage.getItem(selectionKey); } catch { /* A blocked preference store does not affect progress. */ }
  const preferred = routines.find(routine => routine.id === remembered) || routines[0];
  const plans = calendarState?.ready && calendarState.scope === workspaceIdentity() ? calendarState.today.plans : [];
  selectRoutine(plans.length && !routineRelevant(preferred.name, plans) ? routines.find(routine => routineRelevant(routine.name, plans)) || preferred : preferred, false);
  dialog.dataset.ready = 'true';
}

window.addEventListener('storage', event => {
  if (inAccount()) return;
  if (event.key === workspaceKey || event.key === null && localOverride) { initialiseRoutines(); return; }
  if (localOverride) return;
  if (!storageAvailable || (event.key !== storageKey && event.key !== null) || !selected) return;
  try {
    state = parseProgress(localStorage.getItem(storageKey));
    updateProgress();
    notice.textContent = 'Progress updated from another tab.';
  } catch {
    storageAvailable = false;
    notice.textContent = 'Progress from another tab could not be read. Your current ticks are unchanged.';
  }
});

createRoutineTools({
  select: id => { const routine = routines.find(routine => routine.id === id); if (routine) selectRoutine(routine); },
  snapshot() {
    const account = inAccount();
    if (!selected || account && !cloudWorkspace.canEdit) throw new Error('Wait for your account and ticks to finish syncing, then try again.');
    if (!account && !storageAvailable) throw new Error('Browser storage is unavailable or unreadable. Your saved data is unchanged.');
    const progress = account ? cloudWorkspace.progress : latestProgress();
    return { routines: structuredClone(account ? cloudWorkspace.routines || routines : routines), progress,
      identity: workspaceIdentity(),
      selectedId: selected.id, revision: account ? cloudWorkspace.revision : JSON.stringify(routines),
      destination: account ? 'your signed-in account' : 'this browser', account };
  },
  async commit(next, baseline, restoredProgress) {
    if (baseline.account) await cloudWorkspace.replace(next, baseline, restoredProgress);
    else {
      if (!selected || inAccount() || baseline.identity !== workspaceIdentity()) throw new Error('The workspace changed. Reopen checklist control.');
      const raw = localStorage.getItem(workspaceKey);
      const latest = raw ? readWorkspace(JSON.parse(raw)) : { routines, progress: parseProgress(localStorage.getItem(storageKey)) };
      if (JSON.stringify(latest.routines) !== baseline.revision || localOverride && !raw) throw new Error('Checklists changed in another tab. Reopen checklist control before saving.');
      if (restoredProgress && JSON.stringify(latest.progress) !== JSON.stringify(baseline.progress)) throw new Error('Progress changed in another tab. Open the backup again before restoring.');
      const cleaned = cleanRoutines(next);
      // One record keeps definitions and ticks together, even if storage is full.
      try { localStorage.setItem(workspaceKey, JSON.stringify({ routines: cleaned, progress: keepProgress(cleaned, restoredProgress || latest.progress) })); }
      catch { throw new Error('Browser storage could not save. Your draft is still here. Free some space and try again.'); }
      await initialiseRoutines();
    }
  },
  identity: workspaceIdentity
});

document.addEventListener('hub:medicationprogress', event => {
  if (!selected || event.detail.scope !== workspaceIdentity()) return;
  medicationProgress = new Map(event.detail.progress);
  updateProgress();
});
document.addEventListener('hub:cloudprogress', () => {
  if (!inAccount() || !cloudWorkspace.active || !selected) return;
  state = cloudWorkspace.progress;
  updateProgress();
});

function refreshProgressDay() {
  if (selected && progressDay !== lisbonDay()) updateProgress();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshProgressDay(); });
setInterval(refreshProgressDay, 30000);
