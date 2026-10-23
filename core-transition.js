// Native dialogs own focus and accessibility; this controller owns the visual journey.
function createCoreTransition(panel) {
  const core = document.querySelector('.core-art');
  const dock = panel.querySelector('.routine-optic');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const duration = { open: 880, close: 520 };
  const easing = 'cubic-bezier(.65, 0, .2, 1)';
  const returnEasing = 'cubic-bezier(.4, 0, .2, 1)';
  panel.style.setProperty('--core-return-duration', `${duration.close}ms`);
  let animations = [];
  let overlay;
  let phase = '';
  let generation = 0;
  let panelSize;
  const motionAllowed = () => !reducedMotion.matches && !document.body.classList.contains('motion-paused') && !document.hidden;

  function clear() {
    generation++;
    animations.forEach(animation => animation.cancel());
    animations = [];
    overlay?.remove();
    overlay = undefined;
    panel.removeAttribute('data-transition');
  }

  function finish() {
    const closing = phase === 'closing';
    clear();
    phase = panel.open && !closing ? 'open' : '';
    if (phase) document.body.dataset.corePhase = phase;
    else delete document.body.dataset.corePhase;
    if (closing && panel.open) panel.close();
  }

  function animate(element, frames, options = {}) {
    const animation = element.animate(frames, { duration: duration.open, easing, fill: 'both', ...options });
    animations.push(animation);
    return animation;
  }

  function geometry() {
    const source = core.getBoundingClientRect();
    const target = panel.getBoundingClientRect();
    // Quick access may open Routines while the home core is outside the viewport.
    const x = Math.max(32, Math.min(innerWidth - 32, source.left + source.width / 2));
    const y = Math.max(32, Math.min(innerHeight - 32, source.top + source.height / 2));
    const size = Math.min(source.width * .86, innerWidth - 32, innerHeight - 32);
    return { source, folded: `translate(${x - target.left - target.width / 2}px, ${y - target.top - target.height / 2}px) scale(${size / target.width}, ${size / target.height})` };
  }

  function copyArtwork(original, prefix) {
    const svg = original.cloneNode(true);
    const originals = [original, ...original.querySelectorAll('*')];
    const copies = [svg, ...svg.querySelectorAll('*')];
    const ids = new Map();
    for (const node of copies) if (node.id) { ids.set(node.id, `${prefix}-${node.id}`); node.id = `${prefix}-${node.id}`; }
    copies.forEach((node, index) => {
      for (const attribute of [...node.attributes]) node.setAttribute(attribute.name, attribute.value.replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${ids.get(id) || id})`));
      if (node.classList.contains('core-progress-fill')) {
        node.style.strokeDashoffset = getComputedStyle(originals[index]).strokeDashoffset;
        node.style.transition = 'none';
      }
      if (originals[index].getAnimations().length || node.classList.contains('eye-gaze')) {
        node.style.transform = getComputedStyle(originals[index]).transform;
        node.style.animation = 'none';
        node.style.transition = 'none';
      }
    });
    return svg;
  }

  function prepareDock() {
    const eye = copyArtwork(core.querySelector('.eye-art'), 'dock');
    for (const name of ['x', 'y', 'width', 'height']) eye.removeAttribute(name);
    dock.replaceChildren(eye);
  }

  function opticFlight(source, opening) {
    // A manual popover places decorative artwork above the modal without taking focus.
    if (!('showPopover' in HTMLElement.prototype)) return;
    const target = dock.getBoundingClientRect();
    const eye = core.querySelector('.eye-art').getBoundingClientRect();
    const scale = target.width / eye.width;
    const destination = { left: target.left - (eye.left - source.left) * scale, top: target.top - (eye.top - source.top) * scale, width: source.width * scale };
    const svg = copyArtwork(core, 'flight');
    svg.removeAttribute('class');
    Object.assign(svg.style, { left: `${source.left}px`, top: `${source.top}px`, width: `${source.width}px`, height: `${source.height}px` });
    overlay = document.createElement('div');
    overlay.className = 'core-flight';
    overlay.setAttribute('popover', 'manual');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.inert = true;
    overlay.append(svg);
    document.body.append(overlay);
    overlay.showPopover();
    const transform = `translate(${destination.left - source.left}px, ${destination.top - source.top}px) scale(${destination.width / source.width})`;
    if (!opening) svg.style.filter = getComputedStyle(core).filter;
    animate(svg, opening ? [
      { transform: 'none' },
      { transform }
    ] : [
      { transform },
      { transform: 'none' }
    ], { duration: opening ? duration.open : duration.close, easing: opening ? easing : returnEasing });
    if (opening) animate(svg, [{ opacity: 1 }, { opacity: 1, offset: .8 }, { opacity: 0 }], { duration: duration.open, easing: 'linear' });
    if (!opening) {
      // Blend into the home layer before landing, so the title never gets a final layer jump.
      animate(svg, [{ opacity: 0 }, { opacity: 1, offset: .2 }, { opacity: 1, offset: .72 }, { opacity: 0, offset: .94 }, { opacity: 0 }], { duration: duration.close, easing: 'linear' });
      animate(core, [{ transform, transformOrigin: '0 0' }, { transform: 'none', transformOrigin: '0 0' }], { duration: duration.close, easing: returnEasing });
      for (const element of [core, ...document.querySelectorAll('.gyro, .core-reticle')]) {
        const opacity = getComputedStyle(element).opacity;
        animate(element, [{ visibility: 'visible', opacity: 0 }, { visibility: 'visible', opacity: 0, offset: .72 }, { visibility: 'visible', opacity, offset: .94 }, { visibility: 'visible', opacity }], { duration: duration.close, easing: 'linear' });
      }
    }
  }

  function play(opening) {
    const currentStyle = getComputedStyle(panel);
    const interrupted = { transform: currentStyle.transform, borderRadius: currentStyle.borderRadius, opacity: currentStyle.opacity };
    const childOpacity = [...panel.children].map(element => getComputedStyle(element).opacity);
    const backdropOpacity = getComputedStyle(panel, '::backdrop').opacity;
    clear();
    panel.style.setProperty('--core-backdrop-opacity', opening ? '1' : backdropOpacity);
    phase = opening ? 'opening' : 'closing';
    panel.dataset.transition = phase;
    document.body.dataset.corePhase = phase;
    const current = generation;
    try {
      const { source, folded } = geometry();
      panelSize = [panel.clientWidth, panel.clientHeight];
      if (opening) prepareDock();
      opticFlight(source, opening);
      animate(panel, opening ? [
        { transform: folded, borderRadius: '50%', opacity: 0 },
        { opacity: 1, offset: .18 },
        { transform: 'none', borderRadius: '3px', opacity: 1 }
      ] : [
        interrupted,
        { transform: folded, borderRadius: '50%', opacity: 0 }
      ], { duration: opening ? duration.open : duration.close, easing: opening ? easing : returnEasing });
      [...panel.children].forEach((element, index) => animate(element, opening ? [
        { opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }
      ] : [{ opacity: childOpacity[index] }, { opacity: 0 }], {
        duration: opening ? 360 : 130, delay: opening ? 330 + index * 40 : 0,
        easing: opening ? easing : 'ease-out'
      }));
      animate(dock, opening ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], {
        duration: 180, delay: opening ? 700 : 0
      });
      Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
        if (generation === current) finish();
      });
    } catch {
      finish();
    }
  }

  function open() {
    if (panel.open && phase !== 'closing') return;
    clear();
    panel.showModal();
    panel.scrollTop = 0;
    if (motionAllowed()) play(true);
    else { prepareDock(); phase = 'open'; document.body.dataset.corePhase = 'open'; }
  }

  function close() {
    if (!panel.open) return;
    if (!motionAllowed() || phase === 'closing') { phase = 'closing'; finish(); }
    else play(false);
  }

  panel.querySelector('form[method="dialog"]').addEventListener('submit', event => { event.preventDefault(); close(); });
  panel.addEventListener('cancel', event => { event.preventDefault(); close(); });
  panel.addEventListener('close', () => {
    // Programmatic navigation can close the dialog during either journey.
    if (!panel.open) { phase = ''; finish(); }
  });
  window.addEventListener('resize', () => { if (animations.length) finish(); });
  // Late checklist downloads can change the modal size during the unfolding.
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => {
    if (animations.length && panelSize && (panel.clientWidth !== panelSize[0] || panel.clientHeight !== panelSize[1])) finish();
  }).observe(panel);
  reducedMotion.addEventListener('change', () => { if (!motionAllowed()) finish(); });
  document.addEventListener('hub:motionchange', () => { if (!motionAllowed()) finish(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) finish(); });
  prepareDock();
  return { open, close };
}
