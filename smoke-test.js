// Run in the browser console with the Hub open, then call testHub().
async function testHub() {
  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }
  const apps = [...document.querySelectorAll('.app')];
  const dialog = document.getElementById('app-dialog');
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
  return { passed: true, apps: apps.length, viewport: `${innerWidth}x${innerHeight}` };
}
