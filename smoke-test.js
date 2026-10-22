// Run in the browser console with the Hub open, then call testHub().
async function testHub() {
  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }
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
    motionToggle.click();
    assert(motionToggle.getAttribute('aria-pressed') === 'true', 'Pause state is incorrect.');
    assert(getComputedStyle(ring).animationName === 'none', 'Ambient motion did not stop.');
    motionToggle.click();
    assert(motionToggle.getAttribute('aria-pressed') === 'false', 'Resume state is incorrect.');
    assert(getComputedStyle(ring).animationName === 'orbit', 'Ambient motion did not resume.');
  }
  assert(apps.length === 8, 'The home screen must show eight apps.');
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
    assert(dialog.open, 'App did not open.');
    assert(document.getElementById('app-title').textContent === app.querySelector('.app-name').textContent, 'Wrong app title.');
    assert(dialog.contains(document.activeElement), 'Focus did not enter the app.');
    dialog.querySelector('form').requestSubmit();
    await new Promise(resolve => requestAnimationFrame(resolve));
    assert(!dialog.open, 'App did not close.');
    assert(document.activeElement === app, 'Focus did not return to the app icon.');
  }
  const routines = document.getElementById('routines-dialog');
  for (let attempt = 0; routines.dataset.ready !== 'true' && attempt < 40; attempt++) await new Promise(resolve => setTimeout(resolve, 100));
  assert(routines.dataset.ready === 'true', 'Routines did not load.');
  assert(routines.querySelectorAll('.routine-card').length === 5, 'Five checklist cards should be available.');
  const routinesLauncher = document.getElementById('routines-launch');
  routinesLauncher.scrollIntoView({ block: 'center' });
  const launcherBounds = routinesLauncher.getBoundingClientRect();
  const hit = document.elementFromPoint(launcherBounds.left + launcherBounds.width / 2, launcherBounds.top + launcherBounds.height / 2);
  assert(hit && routinesLauncher.contains(hit), 'Another layer blocks the Routines button.');
  routinesLauncher.focus();
  routinesLauncher.click();
  assert(routines.open, 'Routines did not open.');
  routines.querySelector('.routine-exit').click();
  for (let attempt = 0; routines.open && attempt < 30; attempt++) await new Promise(resolve => setTimeout(resolve, 50));
  assert(!routines.open, 'Routines did not close.');
  assert(document.activeElement === routinesLauncher, 'Focus did not return to Routines.');
  return { passed: true, apps: apps.length + 1, checklists: 5, source: routines.dataset.source, viewport: `${innerWidth}x${innerHeight}` };
}
