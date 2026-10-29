// Native dialogs own focus and accessibility; this controller owns the visual journey.
function createCoreTransition(panel) {
  const core = document.querySelector('.core-art');
  const dock = panel.querySelector('.routine-optic');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const duration = { travel: 720, handoff: 120, close: 520 };
  duration.open = duration.travel;
  const handoffStart = duration.travel - duration.handoff;
  const easing = 'cubic-bezier(.4, 0, .2, 1)';
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

  function copyArtwork(original, prefix) {
    const svg = original.cloneNode(true);
    const originals = [original, ...original.querySelectorAll('*')];
    const copies = [svg, ...svg.querySelectorAll('*')];
    const poses = new Map();
    for (const animation of original.getAnimations({ subtree: true })) {
      const target = animation.effect.target;
      if (!target.classList.contains('eye-gaze')) poses.set(target, getComputedStyle(target).transform);
    }
    const ids = new Map();
    for (const node of copies) if (node.id) { ids.set(node.id, `${prefix}-${node.id}`); node.id = `${prefix}-${node.id}`; }
    copies.forEach((node, index) => {
      for (const attribute of [...node.attributes]) {
        if (attribute.value.includes('url(#')) node.setAttribute(attribute.name, attribute.value.replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${ids.get(id) || id})`));
      }
      if (node.classList.contains('core-progress-fill')) {
        node.style.strokeDashoffset = getComputedStyle(originals[index]).strokeDashoffset;
        node.style.transition = 'none';
      }
      if (poses.has(originals[index])) {
        node.style.transform = poses.get(originals[index]);
        node.style.animation = 'none';
        node.style.transition = 'none';
      }
    });
    const gaze = original.querySelector('.eye-gaze');
    if (gaze) {
      const pose = new DOMMatrix(getComputedStyle(gaze).transform);
      svg.querySelector('.eye-gaze').style.transform = pose.toString();
    }
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
    const eye = core.querySelector('.eye-art');
    const view = eye.viewBox.baseVal;
    const matrix = eye.getScreenCTM();
    // A nested SVG reports artwork bounds; docking needs its full viewBox viewport.
    const origin = new DOMPoint(view.x, view.y).matrixTransform(matrix);
    const scale = target.width / (view.width * Math.hypot(matrix.a, matrix.b));
    const destination = { left: target.left - (origin.x - source.left) * scale, top: target.top - (origin.y - source.top) * scale, width: source.width * scale };
    const svg = copyArtwork(core, 'flight');
    const rings = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    rings.classList.add('flight-rings');
    for (const child of [...svg.children]) {
      if (child.tagName.toLowerCase() !== 'defs' && !child.classList.contains('eye-art')) rings.append(child);
    }
    svg.insertBefore(rings, svg.querySelector('.eye-art'));
    rings.style.transformOrigin = '300px 300px';
    rings.style.transformBox = 'view-box';
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
    const compact = `translate(${(source.width - destination.width) / 2}px, ${(source.height - destination.width) / 2}px) scale(${destination.width / source.width})`;
    svg.style.filter = getComputedStyle(core).filter;
    animate(svg, opening ? [
      { transform: 'none' },
      { transform: compact, offset: .28 },
      { transform }
    ] : [
      { transform },
      { transform: 'none' }
    ], { duration: opening ? duration.travel : duration.close, easing });
    // Fold the outer frame inside the eye before it approaches the header words.
    animate(rings, opening ? [{ transform: 'scale(1)' }, { transform: 'scale(.42)' }] : [
      { transform: 'scale(.42)' }, { transform: 'scale(1)' }
    ], { duration: opening ? duration.travel * .28 : duration.close, easing });
    // Blend during the final approach so no stationary fade remains after arrival.
    if (opening) animate(svg, [{ opacity: 1 }, { opacity: 0 }], {
      duration: duration.handoff, delay: handoffStart, easing: 'linear'
    });
    if (!opening) {
      // Blend into the home layer before landing, so the title never gets a final layer jump.
      animate(svg, [{ opacity: 0 }, { opacity: 1, offset: .2 }, { opacity: 1, offset: .72 }, { opacity: 0, offset: .94 }, { opacity: 0 }], { duration: duration.close, easing: 'linear' });
      animate(core, [{ transform, transformOrigin: '0 0' }, { transform: 'none', transformOrigin: '0 0' }], { duration: duration.close, easing });
      for (const element of [core, ...document.querySelectorAll('.gyro, .core-reticle')]) {
        const opacity = getComputedStyle(element).opacity;
        animate(element, [{ visibility: 'visible', opacity: 0 }, { visibility: 'visible', opacity: 0, offset: .72 }, { visibility: 'visible', opacity, offset: .94 }, { visibility: 'visible', opacity }], { duration: duration.close, easing: 'linear' });
      }
    }
  }

  function play(opening) {
    const currentStyle = getComputedStyle(panel);
    const interrupted = { transform: currentStyle.transform, opacity: currentStyle.opacity };
    const childOpacity = [...panel.children].map(element => getComputedStyle(element).opacity);
    const backdropOpacity = getComputedStyle(panel, '::backdrop').opacity;
    clear();
    panel.style.setProperty('--core-backdrop-opacity', opening ? '1' : backdropOpacity);
    phase = opening ? 'opening' : 'closing';
    panel.dataset.transition = phase;
    document.body.dataset.corePhase = phase;
    const current = generation;
    try {
      const source = core.getBoundingClientRect();
      panelSize = [panel.clientWidth, panel.clientHeight];
      if (opening) prepareDock();
      else {
        // Return with the gaze the user was seeing in the header.
        const gaze = core.querySelector('.eye-gaze');
        const pose = new DOMMatrix(getComputedStyle(dock.querySelector('.eye-gaze')).transform);
        gaze.style.transition = 'none';
        gaze.style.transform = pose.toString();
        getComputedStyle(gaze).transform;
        gaze.style.removeProperty('transition');
      }
      opticFlight(source, opening);
      animate(panel, opening ? [
        { transform: 'translateY(16px)', opacity: 0 },
        { transform: 'none', opacity: 1 }
      ] : [
        interrupted,
        { transform: 'translateY(12px)', opacity: 0 }
      ], { duration: opening ? 320 : 180, easing });
      [...panel.children].forEach((element, index) => animate(element, opening ? [
        { opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }
      ] : [{ opacity: childOpacity[index] }, { opacity: 0 }], {
        duration: opening ? 180 : 130, delay: opening ? 60 + index * 25 : 0,
        easing: opening ? easing : 'ease-out'
      }));
      animate(dock, opening ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], {
        duration: opening ? duration.handoff : 180, delay: opening ? handoffStart : 0, easing: 'linear'
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
