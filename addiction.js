function createAddictionHelper(panel, health) {
  const prefix = 'thehub:addiction-helper:v1:';
  const settingsKey = prefix + 'settings';
  const cravingKey = prefix + 'craving-until';
  const cravingLength = 5 * 60 * 1000;
  const dayFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Lisbon', dateStyle: 'short' });
  const clockFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const displayDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', dateStyle: 'long' });
  const rowDate = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric' });
  const money = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });
  const element = id => document.getElementById(`addiction-${id}`);
  const counters = [
    { key: 'cigarettes', add: element('log-cigarette'), undo: element('undo-cigarette') },
    { key: 'coffees', add: element('log-coffee'), undo: element('undo-coffee') }
  ];
  const fields = { coffeeCutoff: element('cutoff-time'), pouchPrice: element('price'), pouchCigarettes: element('per-pouch'), baseline: element('baseline') };
  const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
  let model;
  let account;
  let notice = '';
  let migrating = false;
  let cravingUntil = 0;
  let ticking;
  try { cravingUntil = Number(localStorage.getItem(cravingKey)) || 0; } catch {}

  const today = (now = new Date()) => dayFormat.format(now);
  const synced = () => Boolean(account?.uid && account.ready);

  function localDays() {
    const days = new Map();
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      const day = key?.startsWith(prefix) ? key.slice(prefix.length) : '';
      if (!model.validDay(day)) continue;
      const record = JSON.parse(localStorage.getItem(key));
      if (record?.owner && record.owner !== account?.uid) continue;
      days.set(day, model.readDay(record));
    }
    return days;
  }
  function localSettings() {
    const saved = localStorage.getItem(settingsKey);
    return saved === null ? null : model.readSettings(JSON.parse(saved));
  }
  const currentDays = () => synced() ? account.days : localDays();
  function currentSettings() {
    if (synced() && account.settings) return account.settings;
    try { return localSettings() ?? model.defaultSettings; } catch { return model.defaultSettings; }
  }

  function renderCraving() {
    const left = cravingUntil - Date.now();
    const running = left > 0;
    const seconds = Math.ceil(Math.max(0, running ? left : cravingLength) / 1000);
    element('timer').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    element('craving').textContent = running ? 'Stop timer' : 'Start 5-minute timer';
    element('craving').setAttribute('aria-pressed', String(running));
    if (cravingUntil && !running) {
      cravingUntil = 0;
      try { localStorage.removeItem(cravingKey); } catch {}
      element('timer-note').textContent = 'Craving passed. Well done.';
    } else if (running) element('timer-note').textContent = 'Breathe slowly, drink some water and wait it out.';
    clearTimeout(ticking);
    if (running && panel.open) ticking = setTimeout(renderCraving, 1000);
  }
  function setCraving(running) {
    cravingUntil = running ? Date.now() + cravingLength : 0;
    try {
      if (running) localStorage.setItem(cravingKey, String(cravingUntil));
      else localStorage.removeItem(cravingKey);
    } catch {}
    if (!running) element('timer-note').textContent = 'Most cravings fade within a few minutes.';
    renderCraving();
  }

  function renderHistory(days, day, settings) {
    const rows = model.recentDays(days, health?.lozengeDays?.() ?? new Map(), day);
    element('history').replaceChildren(...rows.map((row, index) => {
      const line = document.createElement('tr');
      const label = document.createElement('th');
      label.scope = 'row';
      label.textContent = index === 0 ? 'Today' : index === 1 ? 'Yesterday' : rowDate.format(new Date(`${row.day}T12:00:00Z`));
      line.append(label);
      for (const key of ['cigarettes', 'coffees', 'lozenges']) {
        const cell = document.createElement('td');
        cell.textContent = row[key];
        if (key === 'cigarettes') cell.dataset.state = row.cigarettes ? 'smoked' : 'clear';
        if (key === 'coffees' && row.coffees >= model.COFFEE_LIMIT) cell.dataset.state = 'limit';
        line.append(cell);
      }
      return line;
    }));
    const saved = model.savings(rows, settings, model.firstDay(days, day));
    element('savings').textContent = saved === null
      ? 'Add your tobacco price, cigarettes per pouch and how many you smoked a day in Helper settings to see what you save.'
      : `${money.format(saved)} saved in the last 7 days`;
  }

  function render() {
    const now = new Date();
    const day = today(now);
    element('date').dateTime = day;
    element('date').textContent = displayDate.format(now);
    renderCraving();
    if (!model) return;
    let days;
    try { days = currentDays(); } catch { days = new Map(); notice = 'Saved counts could not be read on this device.'; }
    const settings = currentSettings();
    const counts = days.get(day) ?? { cigarettes: 0, coffees: 0 };
    element('cigarettes').textContent = `${plural(counts.cigarettes, 'cigarette')} today`;
    const streak = model.smokeFreeStreak(days, day);
    element('streak').textContent = `Smoke-free · ${plural(streak.current, 'day')} · Best ${streak.best}`;
    element('coffees').textContent = `${counts.coffees} / ${model.COFFEE_LIMIT} coffees today`;
    element('coffee-progress').value = Math.min(counts.coffees, model.COFFEE_LIMIT);
    const late = model.pastCutoff(settings.coffeeCutoff, clockFormat.format(now));
    element('cutoff').textContent = !settings.coffeeCutoff ? 'No cut-off time set' : late ? `Past ${settings.coffeeCutoff} · skip coffee for better sleep` : `No coffee after ${settings.coffeeCutoff}`;
    element('cutoff').dataset.warning = String(late);
    for (const { key, add, undo } of counters) {
      add.disabled = key === 'coffees' && counts.coffees >= model.COFFEE_LIMIT;
      undo.disabled = !counts[key];
    }
    const stock = health?.nicotineState();
    element('lozenges').textContent = stock?.count === undefined ? 'Not connected' : `${plural(stock.count, 'lozenge')} today`;
    element('lozenge-status').textContent = stock?.message ?? 'Open Health to connect your lozenge stock.';
    element('lozenge-status').dataset.warning = String(Boolean(stock?.low));
    element('log-lozenge').disabled = !stock?.canRecord;
    element('undo-lozenge').disabled = !stock?.canUndo;
    renderHistory(days, day, settings);
    element('device').textContent = synced() ? navigator.onLine ? 'Cigarettes and coffee sync to your account.'
      : 'Offline. Account changes will sync when you reconnect.'
      : account?.uid ? account.error || 'Connecting to your account… Counts are saved on this device until then.'
        : 'Signed out: cigarette and coffee counts are saved on this device.';
    element('status').textContent = notice;
  }

  function fillSettings() {
    if (!model) return;
    const settings = currentSettings();
    for (const [key, input] of Object.entries(fields)) input.value = settings[key] ?? '';
  }

  // Counts made while signed out or before sync was enabled move into the account once.
  async function migrate() {
    if (migrating || !model || !synced() || !navigator.onLine) return;
    let days;
    let savedSettings;
    try { days = localDays(); savedSettings = localStorage.getItem(settingsKey); } catch { return; }
    if (!days.size && savedSettings === null) return;
    const owner = account.uid;
    migrating = true;
    try {
      const transfer = async () => {
        for (const day of days.keys()) {
          if (!synced() || account.uid !== owner) return;
          const key = prefix + day;
          let saved = localStorage.getItem(key);
          if (saved === null) continue;
          const record = JSON.parse(saved);
          if (record.owner && record.owner !== owner) continue;
          const counts = model.readDay(record);
          if (record.importId || counts.cigarettes || counts.coffees) {
            const id = record.importId ?? crypto.randomUUID();
            if (!record.importId) {
              saved = JSON.stringify({ ...counts, owner, importId: id });
              localStorage.setItem(key, saved);
            }
            await account.importDay(day, id, counts);
          }
          if (localStorage.getItem(key) === saved) localStorage.removeItem(key);
        }
        if (!synced() || account.uid !== owner) return;
        if (savedSettings !== null && localStorage.getItem(settingsKey) === savedSettings) {
          if (!account.settings) await account.importSettings(model.readSettings(JSON.parse(savedSettings)));
          if (localStorage.getItem(settingsKey) === savedSettings) localStorage.removeItem(settingsKey);
        }
        if (days.size) notice = 'Counts from this device were added to your account.';
      };
      // Serialize imports from open tabs that share browser storage.
      if (navigator.locks) await navigator.locks.request(prefix + 'import', transfer);
      else await transfer();
    } catch {
      notice = 'Counts on this device could not be added to your account yet.';
    } finally {
      migrating = false;
      render();
    }
  }

  function change(key, delta) {
    if (!model) return;
    const day = today();
    let current;
    try { current = currentDays().get(day) ?? { cigarettes: 0, coffees: 0 }; } catch { notice = 'Saved counts could not be read on this device.'; render(); return; }
    const next = current[key] + delta;
    if (next < 0 || delta > 0 && key === 'coffees' && current.coffees >= model.COFFEE_LIMIT) return;
    notice = key === 'coffees' && delta > 0 && next === model.COFFEE_LIMIT ? 'Daily coffee limit reached.' : '';
    if (synced()) {
      account.add(day, { [key]: delta }).catch(() => { notice = 'That change was not saved to your account. Try again.'; render(); });
    } else {
      try {
        const storageKey = prefix + day;
        const record = JSON.parse(localStorage.getItem(storageKey));
        if (record?.owner && record.owner !== account?.uid) {
          notice = 'Sign back into the original account to finish transferring today’s device counts.';
        } else localStorage.setItem(storageKey, JSON.stringify({ ...record, ...current, [key]: next }));
      }
      catch { notice = 'The count could not be saved on this device.'; }
    }
    render();
  }

  function saveSettings(event) {
    event.preventDefault();
    if (!model) return;
    const number = input => input.value === '' ? null : Number(input.value);
    const values = { coffeeCutoff: fields.coffeeCutoff.value || null, pouchPrice: number(fields.pouchPrice), pouchCigarettes: number(fields.pouchCigarettes), baseline: number(fields.baseline) };
    try { model.readSettings(values); }
    catch { notice = 'Check the settings: price up to €1000, whole numbers for cigarettes.'; render(); return; }
    if (synced()) {
      notice = 'Saving settings…';
      account.saveSettings(values).then(() => { notice = 'Settings saved to your account.'; render(); })
        .catch(() => { notice = 'Settings could not be saved to your account. Try again.'; render(); });
    } else {
      try { localStorage.setItem(settingsKey, JSON.stringify(values)); notice = 'Settings saved on this device.'; }
      catch { notice = 'Settings could not be saved on this device.'; }
    }
    render();
  }

  for (const counter of counters) {
    counter.add.addEventListener('click', () => change(counter.key, 1));
    counter.undo.addEventListener('click', () => change(counter.key, -1));
  }
  async function updateLozenge(save, startTimer) {
    notice = '';
    if (!await save()) notice = 'The lozenge record could not be updated. Check Health and try again.';
    else if (startTimer && cravingUntil <= Date.now()) setCraving(true);
    render();
  }
  element('log-lozenge').addEventListener('click', () => updateLozenge(health.logNicotine, true));
  element('undo-lozenge').addEventListener('click', () => updateLozenge(health.undoNicotine, false));
  element('craving').addEventListener('click', () => setCraving(cravingUntil <= Date.now()));
  element('settings-form').addEventListener('submit', saveSettings);
  panel.addEventListener('close', () => clearTimeout(ticking));
  document.addEventListener('hub:healthchange', () => { if (panel.open) render(); });
  window.addEventListener('storage', event => {
    if (event.key !== null && !event.key?.startsWith(prefix)) return;
    if (event.key === cravingKey || event.key === null) cravingUntil = Number(event.newValue) || 0;
    if (panel.open) render();
  });
  window.addEventListener('online', () => { migrate(); if (panel.open) render(); });
  window.addEventListener('offline', () => { if (panel.open) render(); });
  document.addEventListener('visibilitychange', () => { if (panel.open && !document.hidden) render(); });
  setInterval(() => { if (panel.open) render(); }, 30000);

  import('./habits-model.mjs?v=2').then(module => {
    model = module;
    render();
    return import('./cloud-habits.js?v=2');
  }).then(module => {
    account = module.createHabitsAccount(() => {
      migrate();
      // Never overwrite fields while the settings form is open.
      if (!element('settings').open) fillSettings();
      if (panel.open) render();
    });
  }).catch(() => { if (!model) notice = 'Addiction Helper could not load. Reload the page to try again.'; render(); });

  return {
    open() {
      migrate();
      render();
      fillSettings();
      panel.showModal();
      renderCraving();
    }
  };
}
