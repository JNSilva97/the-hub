// Native dialogs own focus and accessibility; this controller owns the visual journey.
function createCoreTransition(panel) {
  const core = document.querySelector('.core-art');
  const dock = panel.querySelector('.routine-optic');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const duration = { shrink: 200, travel: 480, close: 520 };
  duration.open = duration.shrink + duration.travel;
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
    // Match the visible ring itself. Firefox and Chromium report different CTMs for nested SVGs.
    const ring = core.querySelector('.eye-ring').getBoundingClientRect();
    const target = dock.querySelector('.eye-ring').getBoundingClientRect();
    const scale = target.width / ring.width;
    const eyeX = ring.left + ring.width / 2;
    const eyeY = ring.top + ring.height / 2;
    const compactX = (eyeX - source.left) * (1 - scale);
    const compactY = (eyeY - source.top) * (1 - scale);
    const travelX = target.left + target.width / 2 - eyeX;
    const travelY = target.top + target.height / 2 - eyeY;
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
    const transform = `translate(${compactX + travelX}px, ${compactY + travelY}px) scale(${scale})`;
    const compact = `translate(${compactX}px, ${compactY}px) scale(${scale})`;
    svg.style.filter = getComputedStyle(core).filter;
    animate(svg, opening ? [
      { transform: 'none', easing },
      { transform: compact, offset: duration.shrink / duration.open, easing },
      { transform }
    ] : [
      { transform },
      { transform: 'none' }
    ], { duration: opening ? duration.open : duration.close, easing: opening ? 'linear' : easing });
    // Shrink and remove the decorative frame before the eye starts travelling.
    animate(rings, opening ? [{ transform: 'scale(1)' }, { transform: 'scale(.42)' }] : [
      { transform: 'scale(.42)' }, { transform: 'scale(1)' }
    ], { duration: opening ? duration.shrink : duration.close, easing });
    if (opening) {
      svg.style.opacity = '1';
      animate(rings, [{ opacity: 1 }, { opacity: 0 }], {
        duration: 80, delay: duration.shrink - 80, easing: 'linear'
      });
    }
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
      // Reveal the matching header eye only when the fully visible flight lands.
      animate(dock, opening ? [{ opacity: 0 }, { opacity: 0 }] : [{ opacity: 1 }, { opacity: 0 }], {
        duration: opening ? duration.open : 180, easing: 'linear'
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
