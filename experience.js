// Decorative effects and quick access. Checklist data stays in routines.js.
(() => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const motionAllowed = () => !reducedMotion.matches && !document.body.classList.contains('motion-paused');
  const introTemplate = document.querySelector('.access-sequence').cloneNode(true);
  const replay = document.getElementById('replay-intro');
  const settingsMotion = document.getElementById('settings-motion');
  const settingsSound = document.getElementById('settings-sound');
  const interfaceSound = typeof createInterfaceSound === 'function' ? createInterfaceSound() : undefined;
  let soundEnabled = false;
  async function playTone(kind = 'select') {
    if (!soundEnabled || document.hidden) return;
    try {
      if (!interfaceSound) throw new Error('Sound unavailable');
      await interfaceSound.play(kind);
    } catch {
      soundEnabled = false;
      settingsSound.setAttribute('aria-pressed', 'false');
      settingsSound.textContent = 'Unavailable';
    }
  }
  settingsSound.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    settingsSound.setAttribute('aria-pressed', String(soundEnabled));
    settingsSound.textContent = soundEnabled ? 'On' : 'Off';
    if (!soundEnabled) interfaceSound?.silence();
  });
  document.addEventListener('click', event => {
    if (!event.isTrusted) return;
    const target = event.target.closest('button, input[type="checkbox"]');
    if (!target) return;
    const kind = target.matches('.app, #routines-launch, #command-launch, #replay-intro, #settings-sound, #routine-restart') || target.closest('#command-results') ? 'open' : target.matches('.routine-exit, .close, .restart-keep') ? 'close' : 'select';
    playTone(kind);
  });
  document.addEventListener('keydown', event => {
    if (event.isTrusted && event.key === 'Escape' && !event.repeat && document.querySelector('dialog[open]')) playTone('close');
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) interfaceSound?.silence(); });
  settingsMotion.addEventListener('click', () => document.querySelector('.motion-toggle').click());
  let bootTimers = [];

  function stageIntro() {
    bootTimers.forEach(clearTimeout);
    const intro = document.querySelector('.access-sequence');
    if (!intro || !motionAllowed()) return;
    const status = intro.querySelector('.access-status');
    bootTimers = ['ASSEMBLING WORKSPACE', 'CALIBRATING OPTICS', 'YOUR INTERFACE IS READY'].map((text, index) => setTimeout(() => {
      if (intro.isConnected) status.textContent = text;
    }, 650 + index * 650));
  }
  function updateMotionControls() {
    settingsMotion.disabled = reducedMotion.matches;
    settingsMotion.setAttribute('aria-pressed', String(motionAllowed()));
    settingsMotion.textContent = motionAllowed() ? 'On' : 'Off';
    document.getElementById('settings-motion-note').textContent = reducedMotion.matches ? 'Reduced motion is enabled on your device.' : 'Optical rings and interface transitions.';
    replay.disabled = !motionAllowed();
    replay.title = replay.disabled ? 'Enable motion to replay the intro' : 'Replay the opening sequence';
    if (!motionAllowed()) document.querySelectorAll('.app').forEach(app => {
      app.style.removeProperty('--spot-x');
      app.style.removeProperty('--spot-y');
    });
  }
  replay.addEventListener('click', () => {
    if (!motionAllowed()) return;
    document.querySelector('.access-sequence')?.remove();
    document.body.prepend(introTemplate.cloneNode(true));
    document.body.classList.remove('interface-ready');
    stageIntro();
  });
  reducedMotion.addEventListener('change', updateMotionControls);
  document.querySelector('.motion-toggle').addEventListener('click', updateMotionControls);
  stageIntro();
  updateMotionControls();

  const skyline = document.querySelector('.city-buildings');
  [28, 46, 33, 72, 49, 100, 65, 38, 58, 80, 43, 67, 93, 51, 76, 36, 60, 85, 47, 32].forEach((height, index) => {
    const tower = document.createElement('span');
    tower.style.setProperty('--height', `${height}%`);
    tower.style.setProperty('--offset', `${index % 3 * 5}px`);
    skyline.append(tower);
  });

  // One render per pointer frame; no continuous JavaScript animation loop.
  const optic = document.querySelector('.core-art');
  const clearGaze = () => { optic.style.removeProperty('--eye-x'); optic.style.removeProperty('--eye-y'); };
  const aimPoint = (x, y) => {
    if (!motionAllowed() || document.hidden || document.querySelector('dialog[open]')) return;
    const center = optic.getBoundingClientRect();
    optic.style.setProperty('--eye-x', `${Math.max(-13, Math.min(13, (x - center.left - center.width / 2) / 24))}px`);
    optic.style.setProperty('--eye-y', `${Math.max(-8, Math.min(8, (y - center.top - center.height * .45) / 30))}px`);
  };
  const aim = target => { const bounds = target.getBoundingClientRect(); aimPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2); };
  let gazeFrame;
  document.querySelector('.workspace').addEventListener('pointermove', event => {
    if (!motionAllowed() || document.hidden || event.pointerType !== 'mouse' || document.querySelector('dialog[open]')) return;
    cancelAnimationFrame(gazeFrame);
    gazeFrame = requestAnimationFrame(() => aimPoint(event.clientX, event.clientY));
  });
  document.querySelector('.workspace').addEventListener('pointerleave', () => { cancelAnimationFrame(gazeFrame); clearGaze(); });
  reducedMotion.addEventListener('change', clearGaze);
  document.addEventListener('hub:motionchange', clearGaze);
  document.addEventListener('visibilitychange', clearGaze);
  for (const app of document.querySelectorAll('.app')) {
    app.addEventListener('pointerenter', () => aim(app));
    app.addEventListener('focus', () => aim(app));
    app.addEventListener('blur', clearGaze);
    app.addEventListener('click', () => {
      const settings = app.dataset.icon === 'settings';
      document.getElementById('interface-settings').hidden = !settings;
      document.getElementById('app-description').textContent = settings ? 'Set the atmosphere of your terminal.' : app.dataset.icon === 'notes' ? 'Notes couldn’t load. Reload the page to try again. Your saved notes have not been changed.' : 'This module is coming later. Your checklists are ready in Routines.';
    });
    let frame;
    app.addEventListener('pointermove', event => {
      if (!motionAllowed() || event.pointerType !== 'mouse') return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = app.getBoundingClientRect();
        app.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
        app.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
      });
    });
    app.addEventListener('pointerleave', () => {
      cancelAnimationFrame(frame);
      app.style.removeProperty('--spot-x');
      app.style.removeProperty('--spot-y');
    });
  }

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
    if (document.getElementById('checklist-control').open) return;
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
  document.addEventListener('visibilitychange', () => document.body.classList.toggle('window-hidden', document.hidden));
})();
