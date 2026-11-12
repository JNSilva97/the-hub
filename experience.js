// Intro, sound and atmosphere. Navigation lives in interface.js.
(() => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const motionAllowed = () => !reducedMotion.matches && !document.body.classList.contains('motion-paused');
  const introTemplate = document.querySelector('.access-sequence').cloneNode(true);
  const replay = document.getElementById('replay-intro');
  const settingsMotion = document.getElementById('settings-motion');
  const settingsSound = document.getElementById('settings-sound');
  const interfaceSound = typeof createInterfaceSound === 'function' ? createInterfaceSound() : undefined;
  const soundPreference = 'thehub:interface-sound:v1';
  let soundEnabled = false;
  try { soundEnabled = localStorage.getItem(soundPreference) === 'on'; } catch {}
  let startupPending = soundEnabled;
  const showSoundSetting = (label = soundEnabled ? 'On' : 'Off') => {
    settingsSound.setAttribute('aria-pressed', String(soundEnabled));
    settingsSound.textContent = label;
  };
  async function playTone(kind, automatic = false) {
    if (!soundEnabled || document.hidden) return false;
    try {
      if (!interfaceSound) throw new Error('Sound unavailable');
      return await interfaceSound.play(kind, automatic);
    } catch {
      soundEnabled = false;
      showSoundSetting('Unavailable');
      return false;
    }
  }
  showSoundSetting();
  if (startupPending) {
    interfaceSound?.prepare().catch(() => {});
    playTone('startup', true).then(played => { if (played) startupPending = false; });
  }
  settingsSound.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    try { localStorage.setItem(soundPreference, soundEnabled ? 'on' : 'off'); } catch {}
    showSoundSetting();
    if (soundEnabled) interfaceSound?.prepare().catch(() => {});
    else interfaceSound?.silence();
  });
  const openControls = '[aria-haspopup="dialog"], #routine-restart, #backup-launch, #account-launch, #control-launch, #backup-restore, #note-delete, #notes-import, #notes-account, #medication-open-health, #health-open-care, #health-sign-in';
  const closeControls = '.routine-exit, .close, .restart-keep';
  document.addEventListener('click', event => {
    if (!event.isTrusted) return;
    const target = event.target.closest('button, input[type="checkbox"]');
    const playStartup = startupPending && !target;
    startupPending = false;
    if (playStartup || target === replay) { playTone('startup'); return; }
    if (!target) return;
    const check = target.matches('input[type="checkbox"], [aria-pressed], [aria-checked]');
    if (!check && target.matches(closeControls)) playTone('close');
    else if (!check && (target.matches(openControls) || target.closest('#command-results'))) playTone('open');
    else playTone('select');
  });
  document.addEventListener('keydown', event => {
    if (!event.isTrusted || event.repeat) return;
    if (event.key === 'Escape' && document.querySelector('dialog[open]')) {
      startupPending = false;
      playTone('close');
    }
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
    }, 210 + index * 210));
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
