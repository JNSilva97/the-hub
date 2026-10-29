const dialog = document.getElementById('app-dialog');
const routinesDialog = document.getElementById('routines-dialog');
const routinesLauncher = document.getElementById('routines-launch');
const retryButton = document.getElementById('routine-retry');
const notesDialog = document.getElementById('notes-dialog');
const instantNotes = typeof createInstantNotes === 'function' ? createInstantNotes(notesDialog) : undefined;
const scriptUrl = new URL(document.currentScript.src);
const routinesUrl = new URL('./routines.js', scriptUrl);
routinesUrl.search = scriptUrl.search;
let routinesModule;
let routinesLoadVersion = 0;
const routineTransition = typeof createCoreTransition === 'function' ? createCoreTransition(routinesDialog) : {
  open: () => routinesDialog.showModal(), close: () => routinesDialog.close()
};

function dismissAccess() {
  document.querySelector('.access-sequence')?.remove();
  document.body.classList.add('interface-ready');
}

document.addEventListener('pointerdown', dismissAccess);
document.addEventListener('keydown', dismissAccess);

const motionToggle = document.querySelector('.motion-toggle');
motionToggle.addEventListener('click', () => {
  dismissAccess();
  const paused = document.body.classList.toggle('motion-paused');
  motionToggle.setAttribute('aria-pressed', String(paused));
  motionToggle.textContent = paused ? 'Resume motion' : 'Pause motion';
  document.dispatchEvent(new Event('hub:motionchange'));
});

const clock = document.getElementById('clock');
const date = document.getElementById('date');
const timeFormat = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' });
const dateFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Lisbon' });

function updateClock() {
  const now = new Date();
  clock.textContent = timeFormat.format(now);
  clock.dateTime = now.toISOString();
  date.textContent = dateFormat.format(now);
}
updateClock();
setInterval(updateClock, 1000);

// App routing belongs here; visual effects only observe the resulting clicks.
function openApp(button) {
  const icon = button.dataset.icon;
  if (icon === 'notes' && instantNotes) { instantNotes.open(); return; }
  const settings = icon === 'settings';
  document.getElementById('app-title').textContent = button.querySelector('.app-name').textContent;
  document.getElementById('app-icon').replaceChildren(button.querySelector('.tile').cloneNode(true));
  document.getElementById('interface-settings').hidden = !settings;
  document.getElementById('app-description').textContent = settings ? 'Set the atmosphere of your terminal.' : icon === 'notes' ? 'Notes couldn’t load. Reload the page to try again. Your saved notes have not been changed.' : 'This module is coming later. Your checklists are ready in Routines.';
  dialog.showModal();
}
for (const button of document.querySelectorAll('.app')) button.addEventListener('click', () => openApp(button));

// Phone navigation reaches the existing actions without changing modal or draft handling.
const phoneLayout = matchMedia('(max-width: 700px)');
const appGrid = document.querySelector('.apps');
const appButtons = [...appGrid.querySelectorAll('.app')];
const futureSpaces = document.getElementById('future-spaces');
const futureGrid = futureSpaces.querySelector('.future-grid');
const futureApps = appButtons.filter(button => !['notes', 'settings'].includes(button.dataset.icon));
for (const button of futureApps) {
  const label = button.querySelector('.app-meta');
  label.textContent = 'COMING SOON';
  label.removeAttribute('aria-hidden');
}
function arrangePhoneApps() {
  futureSpaces.hidden = !phoneLayout.matches;
  if (phoneLayout.matches) futureApps.forEach(button => futureGrid.append(button));
  else { appButtons.forEach(button => appGrid.append(button)); futureSpaces.open = false; }
}
phoneLayout.addEventListener('change', arrangePhoneApps);
arrangePhoneApps();
document.getElementById('phone-routines').addEventListener('click', () => routinesLauncher.click());
for (const icon of ['notes', 'settings']) {
  document.getElementById(`phone-${icon}`).addEventListener('click', () => document.querySelector(`.app[data-icon="${icon}"]`).click());
}

routinesLauncher.addEventListener('click', () => {
  routineTransition.open();
});
for (const panel of [dialog, routinesDialog, notesDialog, document.getElementById('note-delete-dialog'), document.getElementById('notes-import-dialog'), document.getElementById('command-dialog'), document.getElementById('restart-dialog')]) {
  panel.addEventListener('click', event => {
    if (event.target !== panel) return;
    const bounds = panel.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
      if (panel === routinesDialog) routineTransition.close();
      else if (panel === notesDialog && instantNotes) instantNotes.close();
      else panel.close();
    }
  });
}

async function loadRoutines() {
  const current = ++routinesLoadVersion;
  retryButton.hidden = true;
  routinesDialog.dataset.ready = 'false';
  document.getElementById('routine-source').textContent = 'LOADING';
  const notice = document.getElementById('routine-notice');
  notice.setAttribute('role', 'status');
  notice.textContent = 'Loading checklists…';
  try {
    routinesModule ??= await import(routinesUrl.href);
    if (current !== routinesLoadVersion) return;
    await routinesModule.initialiseRoutines();
  } catch {
    if (current !== routinesLoadVersion) return;
    document.getElementById('routine-source').textContent = 'UNAVAILABLE';
    document.getElementById('routine-data-note').textContent = 'Your saved ticks have not been changed.';
    notice.setAttribute('role', 'alert');
    notice.textContent = location.protocol === 'file:' ? 'Open the PC version at http://127.0.0.1:8765/ using the local server.' : 'Couldn’t load the checklists. Check your connection and try again.';
    retryButton.hidden = false;
  }
}
document.addEventListener('hub:workspacechange', loadRoutines);
retryButton.addEventListener('click', () => {
  // Reload clears the browser's cached failures for the module and its imports.
  if (!routinesModule) location.reload();
  else loadRoutines();
});
loadRoutines();

// Search uses the same launchers as the homepage and phone actions.
(() => {
  const palette = document.getElementById('command-dialog');
  const search = document.getElementById('command-search');
  const results = document.getElementById('command-results');
  let commands = [];
  function renderResults() {
    results.replaceChildren();
    const query = search.value.trim().toLocaleLowerCase();
    for (const command of commands.filter(item => `${item.name} ${item.kind}`.toLocaleLowerCase().includes(query))) {
      const button = document.createElement('button');
      button.type = 'button';
      const label = document.createElement('span');
      label.textContent = command.name;
      const kind = document.createElement('small');
      kind.textContent = command.kind;
      button.append(label, kind);
      button.addEventListener('click', () => {
        palette.close();
        command.run();
      });
      results.append(button);
    }
    document.getElementById('command-empty').hidden = results.children.length > 0;
  }
  function openPalette() {
    if (!document.getElementById('checklist-control').hidden || document.getElementById('backup-dialog').open) return;
    if (palette.open) { palette.close(); return; }
    for (const panel of document.querySelectorAll('dialog[open]')) panel.close();
    const launch = target => { target.focus(); target.click(); };
    const routines = document.getElementById('routines-launch');
    commands = [{ name: 'Routines', kind: 'Checklists', run: () => launch(routines) }];
    for (const card of document.querySelectorAll('.routine-card')) commands.push({
      name: card.querySelector('.routine-card-name').textContent,
      kind: 'Checklist', run: () => { launch(routines); card.click(); }
    });
    for (const app of document.querySelectorAll('.app')) commands.push({
      name: app.querySelector('.app-name').textContent, kind: app.dataset.icon === 'settings' ? 'Interface' : app.dataset.icon === 'notes' ? 'Notebook' : 'Coming soon', run: () => launch(app)
    });
    search.value = '';
    renderResults();
    palette.showModal();
    search.focus();
  }
  document.getElementById('command-launch').addEventListener('click', openPalette);
  search.addEventListener('input', renderResults);
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !event.altKey) {
      event.preventDefault();
      openPalette();
    }
  });
  palette.addEventListener('keydown', event => {
    const buttons = [...results.children];
    if (['ArrowDown', 'ArrowUp'].includes(event.key) && buttons.length) {
      event.preventDefault();
      const index = buttons.indexOf(document.activeElement);
      const next = index === -1 ? (event.key === 'ArrowDown' ? 0 : buttons.length - 1) : (index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length;
      buttons[next].focus();
    } else if (event.key === 'Enter' && event.target === search) {
      event.preventDefault();
      buttons[0]?.click();
    }
  });
})();
