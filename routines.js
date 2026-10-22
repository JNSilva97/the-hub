import { validateRoutines, parseProgress, groupKey, itemKey, getActiveItems, getProgress, restartRoutine } from './routine-model.mjs?v=field-1';

const dialog = document.getElementById('routines-dialog');
const list = document.getElementById('routine-list');
const content = document.getElementById('routine-content');
const notice = document.getElementById('routine-notice');
const sourceBadge = document.getElementById('routine-source');
const restartDialog = document.getElementById('restart-dialog');
const field = document.getElementById('field-mode');
const fieldButton = document.getElementById('field-complete');
const fieldUndo = document.getElementById('field-undo');
const review = document.getElementById('routine-review');
let fieldKey;
let lastFieldCheck;
let fieldAnimation;
const fieldReducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
fieldReducedMotion.addEventListener('change', () => fieldAnimation?.cancel());
document.addEventListener('hub:motionchange', () => fieldAnimation?.cancel());
document.addEventListener('visibilitychange', () => { if (document.hidden) fieldAnimation?.cancel(); });
let pendingRestart;
let routines = [];
let selected;
let state;
let storageKey;
let storageAvailable = true;

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
  // shortcut: merge before saving; simultaneous tab writes need transactional storage.
  if (!storageAvailable) return state;
  try {
    return parseProgress(localStorage.getItem(storageKey));
  } catch {
    storageAvailable = false;
    return state;
  }
}

function save() {
  if (!storageAvailable) {
    notice.textContent = 'Browser storage is unavailable. Your ticks will last for this visit only.';
    return;
  }
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
    notice.textContent = 'Progress saved in this browser.';
  } catch {
    storageAvailable = false;
    notice.textContent = 'Browser storage is unavailable. Your ticks will last for this visit only.';
  }
}

function updateProgress() {
  const signals = [];
  for (const input of content.querySelectorAll('input[data-check]')) input.checked = state.checks[input.dataset.check] === true;
  for (const input of content.querySelectorAll('input[data-group]')) {
    input.checked = state.optional[input.dataset.group] === true;
    input.closest('.check-section').querySelector('.check-items').hidden = !input.checked;
  }
  for (const routine of routines) {
    const progress = getProgress(routine, state);
    const card = list.querySelector(`[data-routine="${routine.id}"]`);
    card.querySelector('.routine-count').textContent = `${progress.done} / ${progress.total}`;
    card.querySelector('.routine-mini-fill').style.transform = `scaleX(${progress.percent / 100})`;
    signals.push({ id: routine.id, name: routine.name, ...progress });
  }
  const progress = getProgress(selected, state);
  content.closest('.routine-detail').dataset.complete = String(progress.total > 0 && progress.done === progress.total);
  document.getElementById('routine-progress-label').textContent = progress.done === progress.total && progress.total ? 'All set. You’re ready.' : `${progress.done} of ${progress.total} ready`;
  const bar = document.getElementById('routine-progress');
  bar.setAttribute('aria-valuenow', progress.percent);
  bar.firstElementChild.style.transform = `scaleX(${progress.percent / 100})`;
  document.getElementById('routine-restart').disabled = !Object.entries(state.checks).some(([key, checked]) => key.startsWith(`${selected.id}/`) && checked);
  updateField(progress);
  document.dispatchEvent(new CustomEvent('hub:progress', { detail: signals }));
}

function updateField(progress) {
  const items = getActiveItems(selected, state);
  const remaining = items.filter(item => state.checks[item.key] !== true);
  const next = remaining[0];
  const previousKey = fieldKey;
  fieldKey = next?.key;
  field.hidden = false;
  const position = next ? items.findIndex(item => item.key === fieldKey) + 1 : progress.done;
  document.getElementById('field-position').textContent = `${String(position).padStart(2, '0')} / ${String(progress.total).padStart(2, '0')}`;
  document.getElementById('field-group').textContent = next ? next.group : progress.total ? 'CHECKLIST COMPLETE' : 'NO ACTIVE ITEMS';
  document.getElementById('field-title').textContent = next?.label || (progress.total ? 'All set. You’re ready.' : 'Choose your checklist extras.');
  document.getElementById('field-next').textContent = remaining[1] ? `Up next: ${remaining[1].label}` : next ? 'Last item. You’re nearly there.' : progress.total ? 'Everything on this checklist is taken care of.' : 'Open the checklist below to include an optional section.';
  fieldButton.firstChild.textContent = next ? 'Mark done ' : 'Review checklist ';
  const canUndo = lastFieldCheck && state.checks[lastFieldCheck.key] === true;
  fieldUndo.hidden = !canUndo;
  document.getElementById('field-receipt').textContent = canUndo ? `Done: ${lastFieldCheck.label}` : 'One thing at a time.';
  for (const input of content.querySelectorAll('input[data-check]')) {
    input.closest('.check-row').dataset.next = String(input.dataset.check === fieldKey);
  }
  if (previousKey && previousKey !== fieldKey) {
    fieldAnimation?.cancel();
    if (!document.hidden && !fieldReducedMotion.matches && !document.body.classList.contains('motion-paused') && typeof field.animate === 'function') {
      fieldAnimation = field.querySelector('.field-copy').animate([{ opacity: .3, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.16, 1, .3, 1)' });
    }
  }
}

fieldButton.addEventListener('click', () => {
  if (!selected) return;
  if (!fieldKey) {
    review.open = true;
    review.querySelector('summary').focus();
    return;
  }
  state = latestProgress();
  const item = getActiveItems(selected, state).find(item => item.key === fieldKey);
  // A second tab may have disabled this optional section since it was displayed.
  if (item && state.checks[item.key] !== true) {
    state.checks[item.key] = true;
    lastFieldCheck = item;
    save();
  }
  updateProgress();
});

fieldUndo.addEventListener('click', () => {
  if (!lastFieldCheck) return;
  state = latestProgress();
  state.checks[lastFieldCheck.key] = false;
  lastFieldCheck = undefined;
  save();
  updateProgress();
  fieldButton.focus({ preventScroll: true });
});

function selectRoutine(routine) {
  selected = routine;
  fieldKey = undefined;
  lastFieldCheck = undefined;
  fieldAnimation?.cancel();
  for (const button of list.children) button.setAttribute('aria-pressed', String(button.dataset.routine === routine.id));
  document.getElementById('routine-name').textContent = routine.name;
  document.getElementById('routine-description').textContent = routine.description;
  content.replaceChildren();
  for (const group of routine.groups) {
    const section = make('section', 'check-section');
    const body = make('div', 'check-items');
    if (group.optional) {
      const label = make('label', 'optional-group');
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.dataset.group = groupKey(routine, group);
      toggle.checked = state.optional[groupKey(routine, group)] === true;
      body.hidden = !toggle.checked;
      toggle.addEventListener('change', () => {
        state = latestProgress();
        state.optional[groupKey(routine, group)] = toggle.checked;
        body.hidden = !toggle.checked;
        save();
        updateProgress();
      });
      label.append(toggle, make('span', '', `Include ${group.title}`));
      section.append(label);
    } else {
      section.append(make('h4', 'check-section-title', group.title));
    }
    for (const item of group.items) {
      const label = make('label', 'check-row');
      const input = document.createElement('input');
      input.type = 'checkbox';
      const key = itemKey(routine, group, item);
      input.dataset.check = key;
      input.checked = state.checks[key] === true;
      input.addEventListener('change', () => {
        state = latestProgress();
        state.checks[key] = input.checked;
        save();
        updateProgress();
      });
      label.append(input, make('span', '', item.label));
      body.append(label);
    }
    section.append(body);
    content.append(section);
  }
  updateProgress();
}

document.getElementById('routine-restart').addEventListener('click', () => {
  if (!selected || restartDialog.open) return;
  pendingRestart = selected;
  document.getElementById('restart-description').textContent = `Clear the ticks in ${selected.name}? Your other checklists and optional section choices will stay as they are.`;
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
  if (review.open) content.querySelector('input')?.focus();
  else fieldButton.focus({ preventScroll: true });
});
restartDialog.addEventListener('close', () => { if (!restartDialog.open) pendingRestart = undefined; });

export async function initialiseRoutines() {
  routines = [];
  let source = 'demo';
  let localWarning = '';
  // Personal data is requested only from a loopback server; /private/ is excluded from Git.
  if (['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname)) {
    try {
      routines = await readData('./private/routines.json');
      source = 'private';
    } catch {
      localWarning = 'Personal checklists could not be loaded. Showing demo examples.';
    }
  }
  if (!routines.length) routines = await readData('./routines.demo.json');
  storageKey = `thehub:routines:${source}:v1`;
  storageAvailable = true;
  try {
    state = parseProgress(localStorage.getItem(storageKey));
  } catch {
    storageAvailable = false;
    state = parseProgress(null);
    localWarning = 'Saved progress could not be read. You can use the checklists for this visit.';
  }
  sourceBadge.textContent = source === 'private' ? 'PERSONAL / THIS PC' : 'DEMO / SAMPLE DATA';
  document.getElementById('routine-data-note').textContent = source === 'private' ? 'Your real checklists. Loaded only from this PC.' : 'Example checklists. Your personal lists are not on this website.';
  notice.textContent = localWarning || 'Ticks stay in this browser. Nothing is sent to an account.';
  list.replaceChildren();
  for (const [index, routine] of routines.entries()) {
    const card = make('button', 'routine-card');
    card.type = 'button';
    card.dataset.routine = routine.id;
    card.setAttribute('aria-pressed', 'false');
    card.append(make('span', 'routine-index', `0${index + 1} / CHECKLIST`), make('span', 'routine-card-name', routine.name));
    const track = make('span', 'routine-mini-track');
    track.setAttribute('aria-hidden', 'true');
    track.append(make('span', 'routine-mini-fill'));
    card.append(make('span', 'routine-count'), track);
    card.addEventListener('click', () => selectRoutine(routine));
    list.append(card);
  }
  selectRoutine(routines[0]);
  dialog.dataset.source = source;
  dialog.dataset.ready = 'true';
}

window.addEventListener('storage', event => {
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
