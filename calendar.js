function createCalendar(panel, openChecklist) {
  const el = id => document.getElementById(`calendar-${id}`);
  const format = (day, options) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options }).format(new Date(`${day}T12:00:00Z`));
  const node = (tag, text, className) => { const element = document.createElement(tag); element.textContent = text; if (className) element.className = className; return element; };
  let model, account, selected, anchor, owner, editingWeekly = false, busy = false, notice = '', failed = false, loadError = '';
  let draft = [], details = {}, customPlans = [], baseline, revision = 0, lastDay;
  let hourly = false;
  let fullDay = false;
  let checklistProgress = [], nextChecklist;
  const lisbonTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const snapshot = () => JSON.stringify([draft, model?.planTypes.map(({ id }) => details[id]) ?? [], customPlans]);
  const dirty = () => baseline !== undefined && snapshot() !== baseline;
  const id = () => editingWeekly ? `repeat-${model.weekday(selected)}` : selected;
  const records = () => account?.records ?? new Map();
  function loadDraft() {
    if (!model || !selected) return;
    const all = records();
    const plan = editingWeekly ? all.get(id()) : model.plansForDay(all, selected);
    draft = [...(plan?.plans ?? [])];
    details = { ...plan?.details };
    customPlans = (plan?.events ?? []).map(event => ({ ...event }));
    baseline = snapshot(); revision = all.get(id())?.revision ?? 0;
    renderCustomPlans();
  }
  function renderCustomPlans() {
    const list = el('custom-list');
    list.replaceChildren(...customPlans.map((event, index) => {
      const plan = node('fieldset', '', 'calendar-custom-plan');
      plan.append(node('legend', `Custom plan ${index + 1}`));
      for (const [key, caption, length] of [['title', 'Plan name', 60], ['time', 'Time (Lisbon, optional)'], ['note', 'Note (optional)', 120]]) {
        const label = node('label', caption);
        const input = node('input', '');
        input.type = key === 'time' ? 'time' : 'text';
        if (length) input.maxLength = length;
        if (key === 'title') input.required = true;
        input.value = event[key];
        input.addEventListener('input', () => {
          event[key] = input.value;
          notice = ''; failed = false; render();
        });
        label.append(input); plan.append(label);
      }
      const remove = node('button', 'Remove');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove custom plan ${index + 1}`);
      remove.addEventListener('click', () => {
        customPlans.splice(index, 1);
        notice = ''; failed = false; renderCustomPlans(); render();
        el('add-plan').focus();
      });
      plan.append(remove);
      return plan;
    }));
  }
  function scheduledPlans(plans, details = {}, events = []) {
    return [
      ...model.planTypes.filter(plan => plans.includes(plan.id))
        .map(plan => ({ id: plan.id, title: plan.name, ...details[plan.id] })),
      ...events
    ].sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
  }
  function renderToday() {
    const brief = el('today-brief');
    brief.hidden = !fullDay || selected !== model?.lisbonDay();
    if (brief.hidden) return;
    const ready = account?.uid && account.ready;
    const plans = ready ? scheduledPlans(draft, details, customPlans) : [];
    const now = lisbonTime.format(new Date());
    const next = plans.find(plan => plan.time && plan.time >= now) ?? plans.find(plan => !plan.time);
    const title = next?.time ? `${next.time} · ${next.title}` : next?.title;
    el('next-plan').textContent = title ?? (!account?.uid ? 'Sign in to see your plans.' : !ready
      ? 'Your plans are unavailable right now.' : plans.length ? 'No more plans today.' : 'No plans today.');
    const checklist = next?.id && checklistProgress.find(item => model.routinePlan(item.name) === next.id);
    const remaining = checklist ? Math.max(0, checklist.total - checklist.done) : 0;
    const preparation = el('next-preparation');
    preparation.hidden = !checklist;
    preparation.textContent = checklist ? `${checklist.name} · ${remaining ? `${remaining} ${remaining === 1 ? 'item' : 'items'} left` : 'Ready'}` : '';
    const planId = checklist ? next.id : undefined;
    if (planId !== nextChecklist) el('next-feedback').hidden = true;
    nextChecklist = planId;
    const button = el('next-checklist');
    button.hidden = !nextChecklist;
    button.disabled = busy;
    button.setAttribute('aria-label', checklist ? `Open ${checklist.name}` : 'Open checklist');
  }
  function renderHourly(ready, locked) {
    const list = el('hour-list');
    const activeHour = list.contains(document.activeElement) ? document.activeElement.dataset.hour : undefined;
    const events = customPlans.map((plan, index) => ({ ...plan, index })).filter(plan => plan.title.trim());
    const plans = ready ? scheduledPlans(draft, details, events) : [];
    const untimed = plans.filter(plan => !plan.time);
    const group = el('untimed');
    group.hidden = !untimed.length;
    group.replaceChildren(node('h4', 'No time set'), ...untimed.map(plan => scheduleEntry(plan, locked)));
    list.replaceChildren(...Array.from({ length: 24 }, (_, hour) => {
      const time = `${String(hour).padStart(2, '0')}:00`;
      const row = node('li', '', 'calendar-hour');
      row.dataset.slot = time;
      row.tabIndex = -1;
      row.append(node('span', time, 'calendar-hour-label'));
      const entries = node('div', '', 'calendar-hour-entries');
      for (const plan of plans.filter(plan => plan.time?.slice(0, 2) === time.slice(0, 2))) entries.append(scheduleEntry(plan, locked));
      row.append(entries);
      if (ready) {
        const add = node('button', '+', 'calendar-hour-add');
        add.type = 'button';
        add.dataset.hour = time;
        add.setAttribute('aria-label', `Add plan at ${time}`);
        add.disabled = locked || customPlans.length >= model.maxCustomPlans;
        add.addEventListener('click', () => addCustomPlan(time));
        row.append(add);
      }
      return row;
    }));
    if (activeHour) list.querySelector(`[data-hour="${activeHour}"]`)?.focus({ preventScroll: true });
  }
  function scheduleEntry(plan, locked) {
    const entry = node('div', '', 'calendar-schedule-entry');
    entry.dataset.kind = plan.id ?? 'custom';
    if (plan.time) {
      const time = node('time', plan.time);
      time.dateTime = plan.time;
      entry.append(time);
    }
    entry.append(node('strong', plan.title));
    if (!locked) {
      const edit = node('button', 'Edit', 'calendar-schedule-edit');
      edit.type = 'button';
      edit.setAttribute('aria-label', `Edit ${plan.title}`);
      edit.addEventListener('click', () => {
        if (fullDay) leaveFullDay();
        const target = plan.id ? el(`time-${plan.id}`) : el('custom-list').children[plan.index]?.querySelector('input');
        target?.focus({ preventScroll: true });
        target?.scrollIntoView({ block: 'center' });
      });
      entry.append(edit);
    }
    if (plan.note) entry.append(node('small', plan.note));
    return entry;
  }
  function jumpToHour(slot) {
    const list = el('hour-list');
    const row = list.querySelector(`[data-slot="${slot}"]`);
    row?.focus({ preventScroll: true });
    if (fullDay) row?.scrollIntoView({ block: 'start' });
    else if (row) list.scrollTop = row.offsetTop;
  }
  function leaveFullDay() {
    fullDay = false;
    render();
    panel.scrollTop = 0;
    el('week').querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
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
    el('save').disabled = locked || !dirty() || customPlans.some(event => !event.title.trim());
    const atLimit = customPlans.length >= model?.maxCustomPlans;
    el('add-plan').disabled = locked || atLimit;
    el('event-limit').hidden = !atLimit;
    el('cancel').disabled = busy || !dirty() && !failed;
    el('cancel').textContent = failed && !dirty() ? 'Reload plan' : 'Cancel';
    el('close').disabled = busy;
    el('full-day').disabled = !model || busy;
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
      const events = ready ? scheduledPlans(plans.plans, plans.details, plans.events) : [];
      for (const plan of events) {
        const { time } = plan;
        const entry = node('span', '', 'calendar-agenda-entry');
        entry.dataset.kind = plan.id ?? 'custom';
        if (plan.id) entry.dataset.plan = plan.id;
        entry.append(node('b', plan.title));
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
    const scheduleDate = editingWeekly ? el('mode-weekly').textContent : format(selected, { weekday: 'short', day: 'numeric', month: 'short' });
    panel.toggleAttribute('data-full-day', fullDay);
    el('hourly-toggle').hidden = fullDay;
    el('back-to-week').hidden = !fullDay;
    el('schedule-title').textContent = hourly || fullDay ? `${scheduleDate} · Lisbon time` : 'Day schedule';
    el('hourly').hidden = !(hourly || fullDay);
    el('hourly-toggle').setAttribute('aria-expanded', String(hourly));
    el('hourly-toggle').textContent = hourly ? 'Hide hours' : 'Show hours';
    if (hourly || fullDay) renderHourly(ready, locked);
    renderToday();
    el('mode-weekly').textContent = `Every ${format(selected, { weekday: 'long' })}`;
    const source = model.plansForDay(records(), selected).source;
    el('source').textContent = editingWeekly ? 'Repeat these plans on this weekday. Custom dates keep their own plans.'
      : source === 'custom' ? 'Changes apply only to this date.'
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
    if (!account?.canWrite || busy || !followWeekly && customPlans.some(event => !event.title.trim())) return;
    const uid = account.uid;
    busy = true; notice = ''; failed = false; render();
    try {
      const savedDetails = Object.fromEntries(draft
        .filter(plan => details[plan]?.time || details[plan]?.note.trim())
        .map(plan => [plan, { time: details[plan].time, note: details[plan].note.trim() }]));
      const events = followWeekly ? [] : customPlans.map(event => ({
        title: event.title.trim(), time: event.time, note: event.note.trim()
      }));
      const keepEventField = events.length || records().get(id())?.events?.length;
      await account.save(id(), { mode: followWeekly ? 'weekly' : 'custom', plans: followWeekly ? [] : draft,
        details: followWeekly ? {} : savedDetails, ...(keepEventField ? { events } : {}) }, revision);
      if (uid !== account.uid) return;
      baseline = snapshot(); busy = false; loadDraft();
      notice = followWeekly ? 'This date now follows your weekly pattern.' : editingWeekly ? 'Weekly pattern saved.' : 'Plans saved for this date.';
    } catch (error) { if (uid === account.uid) { notice = error.message || 'Your plans could not be saved. Your draft is still here.'; failed = true; } }
    finally { if (uid === account.uid) busy = false; render(); emit(); }
  }
  function close() {
    if (fullDay && dirty()) { leaveFullDay(); canNavigate(); return; }
    if (canNavigate()) {
      if (fullDay) leaveFullDay();
      panel.close();
    }
  }
  function open(day) {
    if (panel.open) { if (day && model?.validDay(day)) navigate(() => { selected = anchor = day; editingWeekly = false; loadDraft(); }); return; }
    if (model && day && model.validDay(day)) { selected = anchor = day; editingWeekly = false; loadDraft(); }
    render(); panel.showModal();
  }
  el('close').addEventListener('click', close);
  panel.addEventListener('submit', event => { event.preventDefault(); close(); });
  panel.addEventListener('cancel', event => {
    if (fullDay) { event.preventDefault(); leaveFullDay(); }
    else if (!canNavigate()) event.preventDefault();
  });
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
  function addCustomPlan(time = '') {
    if (!account?.canWrite || busy || customPlans.length >= model.maxCustomPlans) return;
    if (fullDay) leaveFullDay();
    customPlans.push({ title: '', time, note: '' });
    notice = ''; failed = false; renderCustomPlans(); render();
    el('custom-list').lastElementChild.querySelector('input').focus();
  }
  el('add-plan').addEventListener('click', () => addCustomPlan());
  el('full-day').addEventListener('click', () => {
    if (!model || panel.open || !canNavigate()) return;
    selected = anchor = model.lisbonDay();
    editingWeekly = false;
    el('next-feedback').hidden = true;
    loadDraft();
    fullDay = true;
    open();
    panel.scrollTop = 0;
    el('back-to-week').focus({ preventScroll: true });
  });
  el('back-to-week').addEventListener('click', leaveFullDay);
  el('next-checklist').addEventListener('click', () => {
    if (!nextChecklist) return;
    const plan = nextChecklist;
    if (!canNavigate()) {
      leaveFullDay();
      el('save').focus();
      return;
    }
    if (!openChecklist(plan, () => { leaveFullDay(); panel.close(); })) {
      el('next-feedback').hidden = false;
      el('next-feedback').textContent = 'This checklist is unavailable. Try opening Goals.';
    }
  });
  document.addEventListener('hub:progress', event => {
    checklistProgress = event.detail;
    renderToday();
  });
  el('hourly-toggle').addEventListener('click', () => {
    if (!model) return;
    hourly = !hourly;
    render();
  });
  for (const button of el('hourly').querySelectorAll('[data-calendar-jump]')) {
    button.addEventListener('click', () => jumpToHour(button.dataset.calendarJump));
  }
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
    else if (fullDay) renderToday();
  }
  setInterval(refreshDay, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDay(); });
  import('./calendar-model.mjs?v=calendar-today-1').then(module => {
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
    return import('./cloud-calendar.js?v=calendar-today-1');
  }).then(module => {
    const changed = () => {
      if (account?.uid !== owner) { owner = account?.uid; draft = []; details = {}; customPlans = []; baseline = snapshot(); busy = false; notice = ''; failed = false; editingWeekly = false; selected = anchor = model.lisbonDay(); }
      if (!dirty() && !busy) loadDraft();
      render(); emit();
    };
    account = module.createCalendarAccount(changed); changed();
  }).catch(() => { loadError = 'Calendar could not load. Reload to try again. Your other modules are available.'; render(); });
  render();
  return { open, close, canNavigate };
}
