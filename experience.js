// Intro, sound and atmosphere. Navigation lives in interface.js.
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
    const kind = target.matches('.app, #routines-launch, #phone-routines, #phone-notes, #phone-settings, #command-launch, #replay-intro, #settings-sound, #routine-restart') || target.closest('#command-results') ? 'open' : target.matches('.routine-exit, .close, .restart-keep') ? 'close' : 'select';
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

  document.addEventListener('visibilitychange', () => document.body.classList.toggle('window-hidden', document.hidden));
})();
