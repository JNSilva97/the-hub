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

for (const button of document.querySelectorAll('.app')) {
  button.addEventListener('click', () => {
    if (button.dataset.icon === 'notes' && instantNotes) { instantNotes.open(); return; }
    document.getElementById('app-title').textContent = button.querySelector('.app-name').textContent;
    document.getElementById('app-icon').replaceChildren(button.querySelector('.tile').cloneNode(true));
    dialog.showModal();
  });
}

routinesLauncher.addEventListener('click', () => {
  routineTransition.open();
});
for (const panel of [dialog, routinesDialog, notesDialog, document.getElementById('note-delete-dialog'), document.getElementById('command-dialog'), document.getElementById('restart-dialog')]) {
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
