const dialog = document.getElementById('app-dialog');
const routinesDialog = document.getElementById('routines-dialog');
const routinesLauncher = document.getElementById('routines-launch');
const retryButton = document.getElementById('routine-retry');
const scriptUrl = new URL(document.currentScript.src);
const routinesUrl = new URL('./routines.js', scriptUrl);
routinesUrl.search = scriptUrl.search;
let routinesModule;
let loadingRoutines = false;

function dismissAccess() {
  document.querySelector('.access-sequence')?.remove();
  document.body.classList.add('interface-ready');
}

document.addEventListener('pointerdown', dismissAccess, { once: true });
document.addEventListener('keydown', dismissAccess, { once: true });

const motionToggle = document.querySelector('.motion-toggle');
motionToggle.addEventListener('click', () => {
  dismissAccess();
  const paused = document.body.classList.toggle('motion-paused');
  motionToggle.setAttribute('aria-pressed', String(paused));
  motionToggle.textContent = paused ? 'Resume motion' : 'Pause motion';
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
    document.getElementById('app-title').textContent = button.querySelector('.app-name').textContent;
    document.getElementById('app-icon').replaceChildren(button.querySelector('.tile').cloneNode(true));
    dialog.showModal();
  });
}

routinesLauncher.addEventListener('click', () => {
  routinesDialog.showModal();
});
for (const panel of [dialog, routinesDialog]) {
  panel.addEventListener('click', event => {
    if (event.target !== panel) return;
    const bounds = panel.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) panel.close();
  });
}

async function loadRoutines() {
  if (loadingRoutines) return;
  loadingRoutines = true;
  retryButton.hidden = true;
  routinesDialog.dataset.ready = 'false';
  document.getElementById('routine-source').textContent = 'LOADING';
  const notice = document.getElementById('routine-notice');
  notice.setAttribute('role', 'status');
  notice.textContent = 'Loading checklists…';
  try {
    routinesModule ??= await import(routinesUrl.href);
    await routinesModule.initialiseRoutines();
  } catch {
    document.getElementById('routine-source').textContent = 'UNAVAILABLE';
    document.getElementById('routine-data-note').textContent = 'Your saved ticks have not been changed.';
    notice.setAttribute('role', 'alert');
    notice.textContent = location.protocol === 'file:' ? 'Open the PC version at http://127.0.0.1:8765/ using the local server.' : 'Couldn’t load the checklists. Check your connection and try again.';
    retryButton.hidden = false;
  } finally {
    loadingRoutines = false;
  }
}
retryButton.addEventListener('click', () => {
  // Reload clears the browser's cached failures for the module and its imports.
  if (!routinesModule) location.reload();
  else loadRoutines();
});
loadRoutines();
