function createCalendar(panel) {
  const el = id => document.getElementById(`calendar-${id}`);
  const format = (day, options) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...options }).format(new Date(`${day}T12:00:00Z`));
  const node = (tag, text, className) => { const element = document.createElement(tag); element.textContent = text; if (className) element.className = className; return element; };
  let model, account, selected, anchor, owner, editingWeekly = false, busy = false, notice = '', failed = false, loadError = '';
  let draft = [], baseline = '[]', revision = 0, lastDay;
  const dirty = () => JSON.stringify(draft) !== baseline;
  const id = () => editingWeekly ? `repeat-${model.weekday(selected)}` : selected;
  const records = () => account?.records ?? new Map();
  function loadDraft() {
    if (!model || !selected) return;
    const all = records();
    draft = [...(editingWeekly ? all.get(id())?.plans ?? [] : model.plansForDay(all, selected).plans)];
    baseline = JSON.stringify(draft); revision = all.get(id())?.revision ?? 0;
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
    for (const input of el('plan-options').querySelectorAll('input')) input.checked = draft.includes(input.value);
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
    el('week').replaceChildren(...dates.map(day => {
      const plans = model.plansForDay(records(), day);
      const button = node('button', '', 'calendar-day'); button.type = 'button'; button.dataset.day = day;
      button.setAttribute('aria-pressed', String(day === selected));
      button.setAttribute('aria-label', `${format(day, { weekday: 'long', day: 'numeric', month: 'long' })}: ${ready ? model.planNames(plans.plans) || 'No plans' : 'Sign in to plan'}`);
      if (day === today) button.setAttribute('aria-current', 'date');
      button.append(node('span', format(day, { weekday: 'short' })), node('strong', format(day, { day: 'numeric' })), node('small', ready ? model.planNames(plans.plans) || 'No plans' : '—'));
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
    const relevant = [];
    if (draft.length) relevant.push('Getting Ready');
    if (draft.includes('office')) relevant.push('Office Preparation');
    if (draft.includes('training')) relevant.push('Muay Thai Preparation');
    el('checklists').replaceChildren(...(relevant.length ? relevant : ['No extra preparation selected']).map(name => node('li', name)));
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
      await account.save(id(), { mode: followWeekly ? 'weekly' : 'custom', plans: followWeekly ? [] : draft }, revision);
      if (uid !== account.uid) return;
      baseline = JSON.stringify(draft); busy = false; loadDraft();
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
  import('./calendar-model.mjs?v=routine-visibility-1').then(module => {
    model = module; selected = anchor = lastDay = model.lisbonDay();
    el('plan-options').replaceChildren(...model.planTypes.map(plan => {
      const label = node('label', '', 'calendar-plan-option');
      const check = node('input', ''); check.type = 'checkbox'; check.id = `calendar-plan-${plan.id}`; check.value = plan.id;
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); icon.setAttribute('aria-hidden', 'true');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', `#${plan.icon}`); icon.append(use);
      const copy = node('span', ''); copy.append(node('strong', plan.name), node('small', plan.description));
      check.addEventListener('change', () => { draft = model.planTypes.map(plan => plan.id).filter(id => el(`plan-${id}`).checked); notice = ''; failed = false; render(); });
      label.append(check, icon, copy); return label;
    }));
    render();
    return import('./cloud-calendar.js?v=routine-visibility-1');
  }).then(module => {
    const changed = () => {
      if (account?.uid !== owner) { owner = account?.uid; draft = []; baseline = '[]'; busy = false; notice = ''; failed = false; editingWeekly = false; selected = anchor = model.lisbonDay(); }
      if (!dirty() && !busy) loadDraft();
      render(); emit();
    };
    account = module.createCalendarAccount(changed); changed();
  }).catch(() => { loadError = 'Calendar could not load. Reload to try again. Your other modules are available.'; render(); });
  render();
  return { open, close, canNavigate };
}
