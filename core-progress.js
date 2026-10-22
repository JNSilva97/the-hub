// The checklist owns the data; this readout only displays its progress events.
(() => {
  const panel = document.getElementById('routines-dialog');
  const layer = document.querySelector('.core-progress-rings');
  const readout = document.getElementById('core-signals');
  const list = document.getElementById('core-signal-list');
  const summary = document.getElementById('core-summary');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const rings = new Map();
  const pendingCompletions = new Set();
  let latest = [];
  let signature = '';
  let pulses = [];
  const complete = signal => signal.total > 0 && signal.done === signal.total;

  function pulse(element) {
    if (document.hidden || reducedMotion.matches || document.body.classList.contains('motion-paused') || typeof element.animate !== 'function') return;
    const animation = element.animate([
      { transform: 'scale(.65)', opacity: 0 },
      { opacity: .85, offset: .2 },
      { transform: 'scale(2.45)', opacity: 0 }
    ], { duration: 950, easing: 'cubic-bezier(.16, 1, .3, 1)' });
    pulses.push(animation);
    animation.finished.catch(() => {}).finally(() => { pulses = pulses.filter(value => value !== animation); });
  }

  function buildRings(signals) {
    layer.replaceChildren();
    list.replaceChildren();
    rings.clear();
    const spacing = Math.min(12, 124 / Math.max(1, signals.length - 1));
    signals.forEach((signal, index) => {
      const color = index % 2 ? '#51a9ff' : '#8bdfff';
      const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      track.setAttribute('cx', '300');
      track.setAttribute('cy', '300');
      track.setAttribute('r', String(260 - spacing * index));
      track.setAttribute('pathLength', '100');
      track.setAttribute('class', 'core-progress-track');
      const fill = track.cloneNode();
      fill.setAttribute('class', 'core-progress-fill');
      fill.dataset.checklist = signal.id;
      fill.style.stroke = color;
      layer.append(track, fill);
      const item = document.createElement('li');
      item.dataset.checklist = signal.id;
      item.style.setProperty('--signal-color', color);
      const name = document.createElement('span');
      name.className = 'core-signal-name';
      name.textContent = `${String(index + 1).padStart(2, '0')} / ${signal.name}`;
      const count = document.createElement('span');
      count.className = 'core-signal-count';
      item.append(name, count);
      list.append(item);
      rings.set(signal.id, { fill, count, item });
    });
  }

  function render() {
    const nextSignature = JSON.stringify(latest.map(signal => [signal.id, signal.name]));
    if (signature !== nextSignature) {
      signature = nextSignature;
      buildRings(latest);
    }
    for (const signal of latest) {
      const { fill, count, item } = rings.get(signal.id);
      const offset = signal.total ? 100 - signal.done / signal.total * 100 : 100;
      fill.style.strokeDashoffset = String(offset);
      fill.dataset.complete = String(complete(signal));
      item.dataset.complete = String(complete(signal));
      count.textContent = `${signal.done} / ${signal.total}${complete(signal) ? ' · READY' : ''}`;
    }
    readout.hidden = !latest.length;
    summary.textContent = `${latest.filter(complete).length} / ${latest.length} CHECKLISTS READY`;
    if (pendingCompletions.size) pulse(document.querySelector('.core-art > .core-energy'));
    pendingCompletions.clear();
  }

  document.addEventListener('hub:progress', event => {
    const previous = new Map(latest.map(signal => [signal.id, signal]));
    latest = event.detail;
    if (!latest.length) { stopPulses(); render(); return; }
    let newlyComplete = false;
    for (const signal of latest) {
      if (!complete(signal)) pendingCompletions.delete(signal.id);
      else if (previous.has(signal.id) && !complete(previous.get(signal.id))) {
        pendingCompletions.add(signal.id);
        newlyComplete = true;
      }
    }
    if (panel.open || document.body.hasAttribute('data-core-phase')) {
      if (newlyComplete) pulse(panel.querySelector('.core-energy'));
    } else render();
  });

  // Keep the departing ring values until the returning artwork reaches home.
  panel.addEventListener('close', () => { if (!panel.open && latest.length) render(); });
  function stopPulses() {
    pulses.forEach(animation => animation.cancel());
    pendingCompletions.clear();
  }
  reducedMotion.addEventListener('change', stopPulses);
  document.addEventListener('hub:motionchange', stopPulses);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopPulses(); });
})();
