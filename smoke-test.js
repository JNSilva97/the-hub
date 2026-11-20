// Run in the browser console with the Hub open, then call testHub().
async function testHub() {
  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }
  const future = document.getElementById('future-spaces');
  const futureWasOpen = future?.open;
  if (future && !future.hidden) future.open = true;
  const apps = [...document.querySelectorAll('.app')];
  const dialog = document.getElementById('app-dialog');
  const access = document.querySelector('.access-sequence');
  if (access) {
    assert(getComputedStyle(access).pointerEvents === 'none', 'Intro blocks interaction.');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    assert(!access.isConnected, 'Keyboard input did not dismiss the intro.');
    assert(getComputedStyle(apps[0]).opacity === '1', 'Intro animation still hides keyboard controls.');
  }
  const motionToggle = document.querySelector('.motion-toggle');
  const ring = document.querySelector('.orbit-slow');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    assert(getComputedStyle(ring).animationName === 'none', 'Reduced motion was ignored.');
  } else {
    const paused = () => motionToggle.getAttribute('aria-pressed') === 'true';
    const wasPaused = paused();
    try {
      if (!wasPaused) motionToggle.click();
      assert(paused(), 'Pause state is incorrect.');
      assert(getComputedStyle(ring).animationName === 'none', 'Ambient motion did not stop.');
      motionToggle.click();
      assert(!paused(), 'Resume state is incorrect.');
      assert(getComputedStyle(ring).animationName === 'orbit', 'Ambient motion did not resume.');
    } finally {
      if (paused() !== wasPaused) motionToggle.click();
    }
  }
  assert(apps.length === 8, 'The home screen must show eight modules.');
  assert(/^\d{2}:\d{2}$/.test(document.getElementById('clock').textContent), 'Clock is missing.');
  assert(document.documentElement.scrollWidth <= innerWidth, 'Horizontal overflow.');
  for (const app of apps) {
    const bounds = app.getBoundingClientRect();
    assert(bounds.width >= 44 && bounds.height >= 44, 'App touch target is too small.');
    const labelBounds = app.querySelector('.app-name').getBoundingClientRect();
    assert(labelBounds.left >= bounds.left && labelBounds.right <= bounds.right, 'App label does not fit.');
    assert(document.querySelector(app.querySelector('use').getAttribute('href')), 'App icon is missing.');
    app.focus();
    app.click();
    const notes = app.dataset.icon === 'notes';
    const special = { notes: 'notes-dialog', goals: 'routines-dialog', habits: 'addiction-dialog', calendar: 'calendar-dialog' }[app.dataset.icon];
    const active = special ? document.getElementById(special) : dialog;
    assert(active.open, 'App did not open.');
    assert(special || document.getElementById('app-title').textContent === app.querySelector('.app-name').textContent, 'Wrong app title.');
    assert(active.contains(document.activeElement), 'Focus did not enter the app.');
    active.querySelector('form').requestSubmit();
    for (let attempt = 0; active.open && attempt < 30; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
    assert(!active.open, 'App did not close.');
    assert(document.activeElement === app, 'Focus did not return to the app icon.');
  }
  const routines = document.getElementById('routines-dialog');
  for (let attempt = 0; routines.dataset.ready !== 'true' && attempt < 40; attempt++) await new Promise(resolve => setTimeout(resolve, 100));
  assert(routines.dataset.ready === 'true', 'Goals did not load.');
  const checklists = routines.querySelectorAll('.routine-card').length;
  assert(checklists > 0, 'At least one checklist should be available.');
  assert(routines.querySelector('#routine-picker').options.length === checklists, 'The sidebar and checklist picker disagree.');
  const routinesLauncher = document.getElementById('routines-launch');
  routinesLauncher.scrollIntoView({ block: 'center' });
  const launcherBounds = routinesLauncher.getBoundingClientRect();
  const hit = document.elementFromPoint(launcherBounds.left + launcherBounds.width / 2, launcherBounds.top + launcherBounds.height / 2);
  assert(hit && routinesLauncher.contains(hit), 'Another layer blocks the Goals button.');
  routinesLauncher.focus();
  routinesLauncher.click();
  assert(routines.open, 'Goals did not open.');
  routines.querySelector('.routine-exit').click();
  for (let attempt = 0; routines.open && attempt < 30; attempt++) await new Promise(resolve => setTimeout(resolve, 50));
  assert(!routines.open, 'Goals did not close.');
  assert(document.activeElement === routinesLauncher, 'Focus did not return to Goals.');
  if (future) future.open = futureWasOpen;
  return { passed: true, apps: apps.length, checklists, source: routines.dataset.source, viewport: `${innerWidth}x${innerHeight}` };
}
