function createFitness(panel) {
  const el = id => document.getElementById(`fitness-${id}`);
  let model, account, busy = false, owner, message = '', loadError = '', day;
  function render() {
    if (model) day = model.lisbonDay();
    document.dispatchEvent(new CustomEvent('hub:fitnesssync', { detail: busy }));
    el('signin').hidden = Boolean(account?.uid);
    el('retry').hidden = !loadError && !account?.error;
    el('date').textContent = day ? new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${day}T12:00:00Z`)) : 'Today';
    el('status').textContent = loadError || account?.error || (busy ? 'Saving reps…' : message || (!account?.uid ? 'Sign in to save your progress across devices.' : !account.ready ? 'Loading your Fitness…' : !account.canWrite ? 'Offline copy. Connect to add reps.' : 'Synced to your account.'));
    el('close').disabled = busy;
    if (!model) return;
    const saved = account?.ready ? account.records.get(day) : null;
    let complete = 0;
    for (const exercise of model.exercises) {
      const row = panel.querySelector(`[data-exercise="${exercise.id}"]`);
      const count = saved?.[exercise.id] ?? 0;
      row.querySelector('output').textContent = count;
      row.querySelector('progress').value = Math.min(count, exercise.goal);
      row.dataset.complete = String(count >= exercise.goal);
      row.querySelector('.fitness-result').textContent = count >= exercise.goal ? 'Daily goal complete' : `${exercise.goal - count} reps to go`;
      if (count >= exercise.goal) complete++;
      for (const button of row.querySelectorAll('button')) button.disabled = busy || !account?.canWrite || (Number(button.dataset.delta) < 0 ? count === 0 : count >= 5000);
    }
    el('summary').textContent = complete === 2 ? 'Both goals complete. Well done!' : `${complete} of 2 daily goals complete`;
  }
  async function adjust(exercise, delta) {
    if (busy || !account?.canWrite || !model) return;
    const uid = account.uid;
    const savedDay = model.lisbonDay();
    busy = true; message = ''; render();
    try {
      await account.adjust(savedDay, exercise, delta);
      if (uid === account.uid) message = '';
    } catch (error) {
      if (uid === account.uid) message = error.code === 'permission-denied' ? 'Could not save reps. Fitness account rules need to be enabled.' : 'Could not save reps. Check your connection and try again.';
    } finally { if (uid === account.uid) busy = false; render(); }
  }
  function canNavigate() { return !busy; }
  function close() { if (canNavigate()) panel.close(); }
  el('close').addEventListener('click', close);
  panel.addEventListener('submit', event => { event.preventDefault(); close(); });
  panel.addEventListener('cancel', event => { if (!canNavigate()) event.preventDefault(); });
  panel.addEventListener('click', event => {
    if (event.target !== panel) return;
    const rect = panel.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
  });
  el('signin').addEventListener('click', () => { if (!busy) { panel.close(); document.getElementById('account-launch').click(); } });
  el('retry').addEventListener('click', () => { if (account) account.retry(); else location.reload(); });
  setInterval(render, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  import('./fitness-model.mjs?v=calendar-grid-1').then(module => {
    model = module;
    for (const exercise of model.exercises) {
      const row = panel.querySelector(`[data-exercise="${exercise.id}"]`);
      for (const button of row.querySelectorAll('button')) button.addEventListener('click', () => adjust(exercise.id, Number(button.dataset.delta)));
    }
    return import('./cloud-fitness.js?v=calendar-grid-1');
  }).then(module => {
    const changed = () => {
      if (owner !== account?.uid) { owner = account?.uid; busy = false; message = ''; }
      render();
    };
    account = module.createFitnessAccount(changed); changed();
  }).catch(() => { loadError = 'Fitness could not load. Reload the page to try again.'; render(); });
  render();
  return { open() { render(); panel.showModal(); }, canNavigate };
}
