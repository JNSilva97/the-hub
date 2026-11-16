function createAddictionHelper(panel, health) {
  const coffeeLimit = 3;
  const prefix = 'thehub:addiction-helper:v1:';
  const dayFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon', dateStyle: 'short' });
  const displayDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', dateStyle: 'long' });
  const element = id => document.getElementById(`addiction-${id}`);
  const counters = [
    { key: 'cigarettes', label: 'cigarette', add: element('log-cigarette'), undo: element('undo-cigarette') },
    { key: 'coffees', label: 'coffee', limit: coffeeLimit, add: element('log-coffee'), undo: element('undo-coffee') }
  ];
  const lozenge = element('log-lozenge');
  const undoLozenge = element('undo-lozenge');
  let shownDay;
  let notice = '';

  function read(day) {
    const saved = JSON.parse(localStorage.getItem(prefix + day) ?? '{"cigarettes":0,"coffees":0}');
    if (!counters.every(({ key, limit }) => Number.isSafeInteger(saved?.[key]) && saved[key] >= 0 && saved[key] <= (limit ?? Number.MAX_SAFE_INTEGER))) {
      throw new Error('Unreadable daily counts');
    }
    return saved;
  }

  function render() {
    const now = new Date();
    const day = dayFormat.format(now);
    if (shownDay !== day) notice = '';
    shownDay = day;
    element('date').dateTime = day;
    element('date').textContent = displayDate.format(now);
    let saved;
    try { saved = read(day); }
    catch { notice = 'Saved counts could not be read on this device.'; }
    for (const { key, label, limit, add, undo } of counters) {
      const count = saved?.[key];
      element(key).textContent = count === undefined ? 'Count unavailable' :
        limit ? `${count} / ${limit} coffees today` : `${count} ${label}${count === 1 ? '' : 's'} today`;
      add.disabled = count === undefined || count >= (limit ?? Number.MAX_SAFE_INTEGER);
      undo.disabled = !count;
    }
    element('coffee-progress').value = saved?.coffees ?? 0;
    element('status').textContent = notice;
    const stock = health?.nicotineState();
    lozenge.disabled = !stock?.canRecord;
    undoLozenge.disabled = !stock?.canUndo;
    element('lozenges').textContent = stock?.count === undefined ? 'Not connected' : `${stock.count} lozenge${stock.count === 1 ? '' : 's'} today`;
    element('lozenge-status').textContent = stock?.message ?? 'Open Health to connect your lozenge stock.';
  }

  function countChange(counter, delta) {
    const day = dayFormat.format(new Date());
    try {
      const saved = read(day);
      const next = saved[counter.key] + delta;
      if (next >= 0 && next <= (counter.limit ?? Number.MAX_SAFE_INTEGER)) {
        saved[counter.key] = next;
        localStorage.setItem(prefix + day, JSON.stringify(saved));
        notice = next === coffeeLimit && counter.key === 'coffees' && delta > 0 ? 'Daily coffee limit reached.' : '';
      }
    } catch { notice = 'The count could not be saved on this device.'; }
    render();
  }

  for (const counter of counters) {
    counter.add.addEventListener('click', () => countChange(counter, 1));
    counter.undo.addEventListener('click', () => countChange(counter, -1));
  }
  async function updateLozenge(save) {
    notice = '';
    if (!await save()) notice = 'The lozenge record could not be updated. Check Health and try again.';
    render();
  }
  lozenge.addEventListener('click', () => updateLozenge(health.logNicotine));
  undoLozenge.addEventListener('click', () => updateLozenge(health.undoNicotine));
  document.addEventListener('hub:healthchange', () => { if (panel.open) render(); });
  window.addEventListener('storage', event => {
    if (panel.open && (event.key === null || event.key === prefix + shownDay)) render();
  });
  document.addEventListener('visibilitychange', () => { if (panel.open && !document.hidden) render(); });
  setInterval(() => { if (panel.open && dayFormat.format(new Date()) !== shownDay) render(); }, 15000);
  return {
    open() {
      render();
      panel.showModal();
    }
  };
}
