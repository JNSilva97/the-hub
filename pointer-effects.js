// Pointer lighting and gaze share one frame: read positions first, then update styles.
(() => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const eye = document.querySelector('.core-art .eye-art');
  const gaze = eye.querySelector('.eye-gaze');
  let frame, point, activeApp;
  const motionAllowed = () => !document.hidden && !reducedMotion.matches && !document.body.classList.contains('motion-paused');

  function clearLight(app) {
    app?.style.removeProperty('--spot-x');
    app?.style.removeProperty('--spot-y');
  }

  function reset() {
    cancelAnimationFrame(frame);
    frame = undefined;
    point = undefined;
    clearLight(activeApp);
    activeApp = undefined;
    gaze.style.removeProperty('transform');
  }

  function render() {
    frame = undefined;
    if (!point || !motionAllowed()) return;
    const rect = eye.getBoundingClientRect();
    const appRect = activeApp?.getBoundingClientRect();

    if (rect?.width) {
      const x = Number(Math.max(-13, Math.min(13, (point.x - rect.left - rect.width / 2) / rect.width * 18)).toFixed(2));
      const y = Number(Math.max(-8, Math.min(8, (point.y - rect.top - rect.height / 2) / rect.height * 12)).toFixed(2));
      const transform = `translate(${x}px, ${y}px)`;
      if (gaze.style.transform !== transform) gaze.style.transform = transform;
    }
    if (appRect) {
      activeApp.style.setProperty('--spot-x', `${point.x - appRect.left}px`);
      activeApp.style.setProperty('--spot-y', `${point.y - appRect.top}px`);
    }
  }

  function schedule() {
    if (frame === undefined) frame = requestAnimationFrame(render);
  }

  document.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || !motionAllowed()) return;
    const app = event.target.closest('.app');
    if (app !== activeApp) { clearLight(activeApp); activeApp = app; }
    point = { x: event.clientX, y: event.clientY };
    schedule();
  });
  document.addEventListener('pointerout', event => {
    if (!event.relatedTarget) reset();
    else if (activeApp && !activeApp.contains(event.relatedTarget)) {
      clearLight(activeApp);
      activeApp = undefined;
    }
  });
  document.addEventListener('focusin', event => {
    if (!event.target.matches('.app') || !motionAllowed()) return;
    cancelAnimationFrame(frame);
    frame = undefined;
    const rect = event.target.getBoundingClientRect();
    clearLight(activeApp);
    activeApp = undefined;
    point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    render();
  });
  reducedMotion.addEventListener('change', reset);
  document.addEventListener('hub:motionchange', reset);
  document.addEventListener('visibilitychange', reset);
})();
