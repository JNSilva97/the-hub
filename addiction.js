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
  const fields = { pouchPrice: element('price'), pouchCigarettes: element('per-pouch'), baseline: element('baseline') };
  const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
  let model;
  let account;
  let notice = '';
  let migrating = false;
  let cravingUntil = 0;
  let ticking;
  let lastMinute;
  let quitSaving = false;
  let quitSince = 0;
  try { cravingUntil = Number(localStorage.getItem(cravingKey)) || 0; } catch {}

  const today = (now = new Date()) => dayFormat.format(now);
  const synced = () => Boolean(account?.uid && account.ready);
  const quitKey = () => prefix + 'quit:' + (account?.uid ?? 'guest');
  const pad = value => String(value).padStart(2, '0');

  function readQuit(saved) {
    const data = JSON.parse(saved);
    return data && Array.isArray(data.logs) ? data : { base: null, logs: [] };
  }

  function pendingQuit() {
    const keys = account?.uid ? [quitKey(), prefix + 'quit:guest'] : [quitKey()];
    for (const key of keys) {
      const saved = localStorage.getItem(key);
      const record = readQuit(saved);
      if (record.base || record.logs.length) return { key, saved, ...record };
    }
    return null;
  }

  function renderQuit() {
    let localSince;
    try {
      const record = pendingQuit();
      localSince = record?.logs.filter(log => log.at > (record.adjustedAt ?? 0)).at(-1)?.at ?? record?.base;
    } catch {}
    const since = Math.max(synced() ? account.quitSince ?? 0 : 0, localSince ?? 0);
    const started = model?.validSmokeTime(since);
    quitSince = since;
    const seconds = started ? Math.max(0, Math.floor((Date.now() - since) / 1000)) : 0;
    const days = Math.floor(seconds / 86400);
    const hours = pad(Math.floor(seconds / 3600) % 24);
    const minutes = pad(Math.floor(seconds / 60) % 60);
    element('elapsed').textContent = started ? `${days}d  ${hours}:${minutes}:${pad(seconds % 60)}` : '—';
    element('quit-controls').hidden = false;
    element('start-quit').hidden = Boolean(started);
    element('quit-edit').textContent = started ? 'Edit start time' : 'Set an earlier start';
    const locked = !model || quitSaving || Boolean(account?.uid && (!synced() || account.pending || migrating || !navigator.onLine));
    element('save-quit').disabled = element('start-quit').disabled = locked;
    element('quit-input').disabled = element('cancel-quit').disabled = quitSaving;
    element('quit-note').textContent = !started ? 'Start now or log a cigarette to begin.'
      : synced() && account.quitSince === since && !account.pending ? 'Synced to your account · resets when you log a cigarette.'
      : account?.uid ? 'Saved on this device · waiting to sync.'
      : 'Saved on this device until you sign in.';
  }

  async function startQuit(at) {
    if (quitSaving || !model?.validSmokeTime(at) || at > Date.now()) return;
    notice = '';
    quitSaving = true;
    render();
    try {
      const key = quitKey();
      const correctedAt = Date.now();
      if (account?.uid) {
        if (!synced() || pendingQuit() || migrating) throw new Error('Wait for Habits to sync before changing the timer.');
        await account.setQuitStart(at, correctedAt);
      } else {
        const record = readQuit(localStorage.getItem(key));
        localStorage.setItem(key, JSON.stringify({ ...record, base: at, adjustedAt: Math.max(correctedAt, ...record.logs.map(log => log.at)) }));
      }
      element('quit-date').open = false;
      element('elapsed').focus();
      notice = 'Timer updated. Cigarette counts were not changed.';
    } catch (error) { notice = error.code === 'permission-denied' ? 'The timer could not sync. Its previous start is unchanged. The account rules need updating.' : error.message || 'The timer could not be saved.'; }
    finally { quitSaving = false; render(); }
  }

  function changeQuit(day, delta, at) {
    const storageKey = quitKey();
    try {
      const { base, logs, adjustedAt = 0 } = readQuit(localStorage.getItem(storageKey));
      const todayLogs = logs.filter(log => log.day === day);
      const anchor = logs.findLast(log => log.day < day && log.at > adjustedAt)?.at ?? base;
      if (delta > 0) todayLogs.push({ day, at: Math.max(at, adjustedAt + 1) });
      else todayLogs.pop();
      localStorage.setItem(storageKey, JSON.stringify({ base: anchor, logs: todayLogs, ...(adjustedAt ? { adjustedAt } : {}) }));
    } catch {
      notice = 'The cigarette was recorded, but the timer could not be saved on this device.';
    }
  }

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
    element('timer').textContent = `${Math.floor(seconds / 60)}:${pad(seconds % 60)}`;
    element('craving').textContent = running ? 'Stop timer' : 'Start 5-minute timer';
    element('craving').setAttribute('aria-pressed', String(running));
    element('craving-card').style.setProperty('--timer-progress', String(seconds / (cravingLength / 1000)));
    if (cravingUntil && !running) {
      cravingUntil = 0;
      try { localStorage.removeItem(cravingKey); } catch {}
      element('timer-note').textContent = 'Five minutes complete.';
    } else if (running) element('timer-note').textContent = 'Breathe slowly, drink some water and wait it out.';
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
        if (key === 'coffees' && row.coffees > model.COFFEE_GOAL) cell.dataset.state = 'over-goal';
        line.append(cell);
      }
      return line;
    }));
    const saved = model.savings(rows, settings, model.firstDay(days, day));
    element('savings').textContent = saved === null
      ? 'Add your tobacco price, cigarettes per pouch and how many you smoked a day in Habits settings to see what you save.'
      : `${money.format(saved)} saved in the last 7 days`;
  }

  function render() {
    const now = new Date();
    const day = today(now);
    lastMinute = Math.floor(now.getTime() / 60000);
    element('date').dateTime = day;
    element('date').textContent = displayDate.format(now);
    renderCraving();
    renderQuit();
    if (!model) {
      element('status').textContent = notice;
      return;
    }
    let days;
    try { days = currentDays(); } catch { days = new Map(); notice = 'Saved counts could not be read on this device.'; }
    const settings = currentSettings();
    const counts = days.get(day) ?? { cigarettes: 0, coffees: 0 };
    element('cigarettes').textContent = `${plural(counts.cigarettes, 'cigarette')} today`;
    const streak = model.smokeFreeStreak(days, day);
    element('streak').textContent = `Smoke-free · ${plural(streak.current, 'day')} · Best ${streak.best}`;
    element('coffees').textContent = `${counts.coffees} / ${model.COFFEE_GOAL} coffees today`;
    element('coffee-progress').value = Math.min(counts.coffees, model.COFFEE_GOAL);
    const coffeeWindow = model.coffeeWindow(day, clockFormat.format(now));
    const warnings = [];
    if (counts.coffees > model.COFFEE_GOAL) warnings.push(`Above your ${model.COFFEE_GOAL}-coffee goal`);
    if (coffeeWindow === 'closed') warnings.push('Past the 17:00 cut-off');
    const cutoff = element('cutoff');
    const coffeeStatus = warnings.length ? `Warning · ${warnings.join(' · ')}` : {
      'open': 'Coffee until 17:00',
      'weekend': 'No time cut-off today · Friday or Saturday',
      'holiday-eve': 'No time cut-off today · holiday eve'
    }[coffeeWindow];
    if (cutoff.textContent !== coffeeStatus) cutoff.textContent = coffeeStatus;
    element('coffee').dataset.warning = cutoff.dataset.warning = String(warnings.length > 0);
    for (const { key, add, undo } of counters) {
      add.disabled = quitSaving || counts[key] >= model.MAX_DAILY_COUNT;
      undo.disabled = quitSaving || !counts[key];
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
    let quit;
    try { days = localDays(); savedSettings = localStorage.getItem(settingsKey); quit = pendingQuit(); } catch { return; }
    if (!days.size && savedSettings === null && !quit) return;
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
        if (quit && !account.pending && localStorage.getItem(quit.key) === quit.saved) {
          const base = model.validSmokeTime(quit.base) ? quit.base : null;
          const logs = quit.logs.map((log, index) => ({ ...log, index })).filter(log => model.validDay(log.day) && model.validSmokeTime(log.at));
          try {
            const id = quit.importId ?? crypto.randomUUID();
            const saved = quit.importId ? quit.saved : JSON.stringify({ base: quit.base, logs: quit.logs, ...(quit.adjustedAt ? { adjustedAt: quit.adjustedAt } : {}), importId: id });
            if (!quit.importId) localStorage.setItem(quit.key, saved);
            await account.importQuit(base, logs, id, logs[0]?.day ?? today(), quit.adjustedAt);
            if (localStorage.getItem(quit.key) === saved) localStorage.removeItem(quit.key);
          } catch {
            notice = 'Time without smoking is saved here. Account timer sync could not finish.';
          }
        }
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
    const now = new Date();
    const day = today(now);
    let current;
    try { current = currentDays().get(day) ?? { cigarettes: 0, coffees: 0 }; } catch { notice = 'Saved counts could not be read on this device.'; render(); return; }
    const next = current[key] + delta;
    if (next < 0 || next > model.MAX_DAILY_COUNT) return;
    notice = '';
    if (synced()) {
      const owner = account.uid;
      const canUseLocalTimer = account.quitSince === null;
      const save = key === 'cigarettes' ? account.recordSmoke(day, delta, now.getTime()).catch(async error => {
        if (error.code !== 'permission-denied' || !canUseLocalTimer || account.uid !== owner || delta < 0) throw error;
        await account.add(day, { cigarettes: delta });
        if (account.uid === owner) changeQuit(day, delta, now.getTime());
      }) : account.add(day, { [key]: delta });
      save.then(() => {
        if (account.uid !== owner) return;
        if (key === 'cigarettes' && delta < 0 && canUseLocalTimer) changeQuit(day, delta, now.getTime());
        render();
      }).catch(() => {
        if (account.uid !== owner) return;
        notice = 'That change was not saved to your account. Try again.';
        render();
      });
    } else {
      try {
        const storageKey = prefix + day;
        const record = JSON.parse(localStorage.getItem(storageKey));
        if (record?.owner && record.owner !== account?.uid) {
          notice = 'Sign back into the original account to finish transferring today’s device counts.';
        } else {
          localStorage.setItem(storageKey, JSON.stringify({ ...record, ...current, [key]: next }));
          if (key === 'cigarettes') changeQuit(day, delta, now.getTime());
        }
      }
      catch { notice = 'The count could not be saved on this device.'; }
    }
    render();
  }

  function saveSettings(event) {
    event.preventDefault();
    if (!model) return;
    const number = input => input.value === '' ? null : Number(input.value);
    const values = { coffeeCutoff: model.defaultSettings.coffeeCutoff, pouchPrice: number(fields.pouchPrice), pouchCigarettes: number(fields.pouchCigarettes), baseline: number(fields.baseline) };
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
  element('start-quit').addEventListener('click', () => startQuit(Date.now()));
  element('save-quit').addEventListener('click', () => {
    const input = element('quit-input');
    const at = new Date(input.value).getTime();
    input.setCustomValidity(model?.validSmokeTime(at) && at <= Date.now() ? '' : 'Enter a date and time in the past.');
    if (input.reportValidity()) startQuit(at);
  });
  element('quit-input').addEventListener('input', event => event.target.setCustomValidity(''));
  element('quit-edit').addEventListener('click', () => {
    if (element('quit-date').open) return;
    const date = new Date(quitSince || Date.now());
    element('quit-input').value = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    element('quit-input').setCustomValidity('');
  });
  element('cancel-quit').addEventListener('click', () => { element('quit-date').open = false; });
  window.addEventListener('beforeunload', event => { if (quitSaving) { event.preventDefault(); event.returnValue = ''; } });
  element('settings-form').addEventListener('submit', saveSettings);
  panel.addEventListener('close', () => { if (!panel.open) clearInterval(ticking); });
  document.addEventListener('hub:healthchange', () => { if (panel.open) render(); });
  window.addEventListener('storage', event => {
    if (event.key !== null && !event.key?.startsWith(prefix)) return;
    if (event.key === cravingKey || event.key === null) cravingUntil = Number(event.newValue) || 0;
    if (panel.open) render();
  });
  window.addEventListener('online', () => { migrate(); if (panel.open) render(); });
  window.addEventListener('offline', () => { if (panel.open) render(); });
  document.addEventListener('visibilitychange', () => { if (panel.open && !document.hidden) render(); });
  const modelReady = import('./habits-model.mjs?v=quick-add-1').then(module => {
    model = module;
    render();
  }).catch(() => { notice = 'Habits could not load. Reload the page to try again.'; render(); });
  modelReady.then(() => {
    if (model) return import('./cloud-habits.js?v=quick-add-1');
  }).then(module => {
    if (!module) return;
    account = module.createHabitsAccount(() => {
      migrate();
      // Never overwrite fields while the settings form is open.
      if (!element('settings').open) fillSettings();
      if (panel.open) render();
    });
  }).catch(() => { render(); });

  let openSequence = 0;
  function open() {
    openSequence++;
    migrate();
    render();
    fillSettings();
    panel.showModal();
    clearInterval(ticking);
    ticking = setInterval(() => {
      if (lastMinute !== Math.floor(Date.now() / 60000)) render();
      else { renderQuit(); renderCraving(); }
    }, 1000);
  }
  return {
    open,
    async openAndLogCoffee() {
      open();
      const current = openSequence;
      if (!model) await modelReady;
      if (!model || !panel.open || openSequence !== current) return;
      element('log-coffee').click();
      element('coffee').scrollIntoView({ block: 'center' });
      const undo = element('undo-coffee');
      if (!undo.disabled) undo.focus({ preventScroll: true });
    }
  };
}
