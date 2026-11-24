function createCalendar(panel, openChecklist) {
  const el = id => document.getElementById(`calendar-${id}`);
  const format = (day, options) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options }).format(new Date(`${day}T12:00:00Z`));
  const node = (tag, text, className) => { const element = document.createElement(tag); element.textContent = text; if (className) element.className = className; return element; };
  let model, account, selected, anchor, owner, editingWeekly = false, busy = false, notice = '', failed = false, loadError = '';
  let draft = [], details = {}, baseline, revision = 0, lastDay;
  const snapshot = () => JSON.stringify([draft, model?.planTypes.map(({ id }) => details[id]) ?? []]);
  const dirty = () => baseline !== undefined && snapshot() !== baseline;
  const id = () => editingWeekly ? `repeat-${model.weekday(selected)}` : selected;
  const records = () => account?.records ?? new Map();
  function loadDraft() {
    if (!model || !selected) return;
    const all = records();
    const plan = editingWeekly ? all.get(id()) : model.plansForDay(all, selected);
    draft = [...(plan?.plans ?? [])];
    details = { ...plan?.details };
    baseline = snapshot(); revision = all.get(id())?.revision ?? 0;
  }
  function emit() {
    if (!model) return;
    const day = model.lisbonDay();
    const all = records();
    document.dispatchEvent(new CustomEvent('hub:calendarchange', { detail: {
      scope: account?.uid ? `account:${account.uid}` : null, ready: Boolean(account?.ready), active: all.size > 0,
      today: { ...model.plansForDay(all, day), label: model.planNames(model.plansForDay(all, day).plans) },
      tomorrow: { ...model.plansForDay(all, model.addDays(day, 1)), label: model.planNames(model.plansForDay(all, model.addDays(day, 1)).plans) }
    } }));
  }
  function render() {
    const unsafe = busy || dirty();
    document.dispatchEvent(new CustomEvent('hub:calendarsync', { detail: unsafe }));
    const ready = Boolean(model && account?.uid && account.ready);
    const locked = !ready || !account.canWrite || busy;
    el('signin').hidden = Boolean(account?.uid);
    el('retry').hidden = !loadError && !account?.error;
    el('fields').disabled = locked;
    el('save').disabled = locked || !dirty();
    el('cancel').disabled = busy || !dirty() && !failed;
    el('cancel').textContent = failed && !dirty() ? 'Reload plan' : 'Cancel';
    el('close').disabled = busy;
    for (const name of ['previous', 'next', 'today', 'mode-day', 'mode-weekly']) el(name).disabled = !model || busy;
    for (const check of el('plan-options').querySelectorAll('input[type="checkbox"]')) {
      const plan = check.value;
      check.checked = draft.includes(plan);
      el(`details-${plan}`).hidden = !check.checked;
      for (const field of ['time', 'note']) {
        const input = el(`${field}-${plan}`);
        const value = details[plan]?.[field] ?? '';
        if (input.value !== value) input.value = value;
      }
    }
    el('mode-day').setAttribute('aria-pressed', String(!editingWeekly));
    el('mode-weekly').setAttribute('aria-pressed', String(editingWeekly));
    const custom = selected && records().get(selected)?.mode === 'custom';
    el('follow').hidden = editingWeekly || !custom;
    el('follow').disabled = locked || dirty();
    const status = loadError || account?.error || (busy ? 'Saving your plans…' : !account?.uid ? 'Sign in to save your plans across devices.'
      : !ready ? 'Loading your Calendar…' : !account.canWrite ? 'Offline copy. Connect to save changes.'
      : notice || (dirty() ? 'Unsaved changes. Save or Cancel.' : 'Synced to your account.'));
    el('status').textContent = status;
    el('status').dataset.error = String(Boolean(failed || loadError || account?.error));
    if (!model) return;
    if (!selected) return;
    const today = model.lisbonDay();
    const dates = model.weekDates(anchor);
    el('week-title').textContent = `${format(dates[0], { day: 'numeric', month: 'short' })} – ${format(dates[6], { day: 'numeric', month: 'short', year: 'numeric' })}`;
    const focusDay = el('week').contains(document.activeElement) ? document.activeElement.dataset.day : undefined;
    const weekRecords = records();
    el('week').replaceChildren(...dates.map(day => {
      const plans = model.plansForDay(weekRecords, day);
      const button = node('button', '', 'calendar-day'); button.type = 'button'; button.dataset.day = day;
      button.setAttribute('aria-pressed', String(day === selected));
      if (day === today) button.setAttribute('aria-current', 'date');
      button.append(node('span', format(day, { weekday: 'short' })), node('strong', format(day, { day: 'numeric' })));
      const agenda = node('span', '', 'calendar-agenda-plans');
      const events = ready ? model.planTypes.filter(plan => plans.plans.includes(plan.id)) : [];
      events.sort((a, b) => (plans.details?.[a.id]?.time || '99:99').localeCompare(plans.details?.[b.id]?.time || '99:99'));
      for (const plan of events) {
        const { time } = plans.details?.[plan.id] ?? {};
        const entry = node('span', '', 'calendar-agenda-entry');
        entry.dataset.plan = plan.id;
        entry.append(node('b', plan.name));
        if (time) {
          const clock = node('time', time);
          clock.dateTime = time;
          entry.append(' ', clock);
        }
        agenda.append(entry);
      }
      if (!events.length) agenda.append(node('small', ready ? 'No plans' : 'Sign in to plan'));
      button.append(agenda);
      button.addEventListener('click', () => navigate(() => { selected = day; loadDraft(); }));
      return button;
    }));
    if (focusDay) el('week').querySelector(`[data-day="${focusDay}"]`)?.focus({ preventScroll: true });
    el('day-title').textContent = format(selected, { weekday: 'long', day: 'numeric', month: 'long' });
    el('mode-weekly').textContent = `Every ${format(selected, { weekday: 'long' })}`;
    const source = model.plansForDay(records(), selected).source;
    el('source').textContent = editingWeekly ? 'Repeat these plans on this weekday. Custom dates keep their own plans.'
      : source === 'custom' ? 'A custom plan for this date. Uncheck every plan to keep the day free.'
      : 'Following your weekly pattern. Saving here changes only this date.';
    el('save').textContent = editingWeekly ? 'Save weekly pattern' : 'Save this date';
    const relevant = [node('li', draft.length ? 'Getting Ready' : 'No extra preparation selected')];
    for (const [plan, title] of [['office', 'Office Preparation'], ['training', 'Muay Thai Preparation']]) {
      if (!draft.includes(plan)) continue;
      const item = node('li', '', 'calendar-checklist-link');
      const open = node('button', 'Open checklist');
      open.type = 'button';
      open.disabled = busy;
      open.setAttribute('aria-label', `Open ${title}`);
      open.addEventListener('click', () => {
        if (!canNavigate()) { el('save').focus(); return; }
        if (!openChecklist(plan, () => panel.close())) {
          notice = `${title} is unavailable. Check your lists in Goals.`;
          render();
          el('checklists').querySelector(`[aria-label="Open ${title}"]`)?.focus();
        }
      });
      item.append(node('span', title), open);
      relevant.push(item);
    }
    el('checklists').replaceChildren(...relevant);
  }
  function navigate(run) {
    if (!canNavigate()) return;
    notice = ''; failed = false; run(); render();
  }
  function canNavigate() {
    if (!busy && !dirty()) return true;
    notice = busy ? 'Saving your plans. Please wait.' : 'Save or Cancel your changes before leaving this day.';
    render(); return false;
  }
  async function save(followWeekly = false) {
    if (!account?.canWrite || busy) return;
    const uid = account.uid;
    busy = true; notice = ''; failed = false; render();
    try {
      const savedDetails = Object.fromEntries(draft
        .filter(plan => details[plan]?.time || details[plan]?.note.trim())
        .map(plan => [plan, { time: details[plan].time, note: details[plan].note.trim() }]));
      await account.save(id(), { mode: followWeekly ? 'weekly' : 'custom', plans: followWeekly ? [] : draft,
        details: followWeekly ? {} : savedDetails }, revision);
      if (uid !== account.uid) return;
      baseline = snapshot(); busy = false; loadDraft();
      notice = followWeekly ? 'This date now follows your weekly pattern.' : editingWeekly ? 'Weekly pattern saved.' : 'Plans saved for this date.';
    } catch (error) { if (uid === account.uid) { notice = error.message || 'Your plans could not be saved. Your draft is still here.'; failed = true; } }
    finally { if (uid === account.uid) busy = false; render(); emit(); }
  }
  function close() { if (canNavigate()) panel.close(); }
  function open(day) {
    if (panel.open) { if (day && model?.validDay(day)) navigate(() => { selected = anchor = day; editingWeekly = false; loadDraft(); }); return; }
    if (model && day && model.validDay(day)) { selected = anchor = day; editingWeekly = false; loadDraft(); }
    render(); panel.showModal();
  }
  el('close').addEventListener('click', close);
  panel.addEventListener('submit', event => { event.preventDefault(); close(); });
  panel.addEventListener('cancel', event => { if (!canNavigate()) event.preventDefault(); });
  panel.addEventListener('click', event => {
    if (event.target !== panel) return;
    const bounds = panel.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
  });
  el('previous').addEventListener('click', () => navigate(() => { anchor = selected = model.addDays(anchor, -7); loadDraft(); }));
  el('next').addEventListener('click', () => navigate(() => { anchor = selected = model.addDays(anchor, 7); loadDraft(); }));
  el('today').addEventListener('click', () => navigate(() => { selected = anchor = model.lisbonDay(); loadDraft(); }));
  el('mode-day').addEventListener('click', () => navigate(() => { editingWeekly = false; loadDraft(); }));
  el('mode-weekly').addEventListener('click', () => navigate(() => { editingWeekly = true; loadDraft(); }));
  el('save').addEventListener('click', () => save());
  el('follow').addEventListener('click', () => save(true));
  el('cancel').addEventListener('click', () => { notice = ''; failed = false; loadDraft(); render(); });
  el('retry').addEventListener('click', () => { if (account) account.retry(); else location.reload(); });
  el('signin').addEventListener('click', () => { if (!canNavigate()) return; panel.close(); document.getElementById('account-launch').click(); });
  document.addEventListener('hub:opencalendar', event => open(event.detail?.day));
  document.addEventListener('hub:calendarrequest', emit);
  window.addEventListener('beforeunload', event => { if (busy || dirty()) { event.preventDefault(); event.returnValue = ''; } });
  function refreshDay() {
    if (!model) return;
    const day = model.lisbonDay();
    if (lastDay !== day) { lastDay = day; render(); emit(); }
  }
  setInterval(refreshDay, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDay(); });
  import('./calendar-model.mjs?v=calendar-checklist-links-1').then(module => {
    model = module; selected = anchor = lastDay = model.lisbonDay();
    el('plan-options').replaceChildren(...model.planTypes.map(plan => {
      const label = node('label', '', 'calendar-plan-option');
      const check = node('input', ''); check.type = 'checkbox'; check.id = `calendar-plan-${plan.id}`; check.value = plan.id;
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); icon.setAttribute('aria-hidden', 'true');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', `#${plan.icon}`); icon.append(use);
      const copy = node('span', ''); copy.append(node('strong', plan.name), node('small', plan.description));
      check.addEventListener('change', () => {
        draft = model.planTypes.map(plan => plan.id).filter(id => el(`plan-${id}`).checked);
        if (!check.checked) delete details[plan.id];
        notice = ''; failed = false; render();
      });
      const fields = node('div', '', 'calendar-plan-details');
      fields.id = `calendar-details-${plan.id}`; fields.hidden = true;
      const time = node('input', ''); time.type = 'time';
      const note = node('input', ''); note.type = 'text'; note.maxLength = 120;
      time.id = `calendar-time-${plan.id}`; note.id = `calendar-note-${plan.id}`;
      for (const [input, caption] of [[time, 'Time (Lisbon, optional)'], [note, 'Note (optional)']]) {
        const field = node('label', caption);
        input.setAttribute('aria-label', `${plan.name} ${caption}`);
        input.addEventListener('input', () => {
          if (time.value || note.value) details[plan.id] = { time: time.value, note: note.value };
          else delete details[plan.id];
          notice = ''; failed = false; render();
        });
        field.append(input); fields.append(field);
      }
      label.append(check, icon, copy);
      const option = node('div', '');
      option.append(label, fields); return option;
    }));
    render();
    return import('./cloud-calendar.js?v=calendar-checklist-links-1');
  }).then(module => {
    const changed = () => {
      if (account?.uid !== owner) { owner = account?.uid; draft = []; details = {}; baseline = snapshot(); busy = false; notice = ''; failed = false; editingWeekly = false; selected = anchor = model.lisbonDay(); }
      if (!dirty() && !busy) loadDraft();
      render(); emit();
    };
    account = module.createCalendarAccount(changed); changed();
  }).catch(() => { loadError = 'Calendar could not load. Reload to try again. Your other modules are available.'; render(); });
  render();
  return { open, close, canNavigate };
}
