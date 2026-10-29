import { cleanRoutines, createBackup, parseBackup, countItems, removedItems, MAX_BACKUP_BYTES } from './workspace-model.mjs?v=control-1';

// Keep the native select as the data source; all visible choices stay inside The Hub.
export function createChecklistPicker(select) {
  const container = document.createElement('div');
  container.id = select.id + '-menu';
  container.className = 'checklist-picker' + (select.classList.contains('routine-picker') ? ' routine-picker' : '');
  select.classList.remove('routine-picker');
  select.classList.add('checklist-native');
  select.hidden = true;
  select.after(container);
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'checklist-picker-toggle';
  const choices = document.createElement('div');
  choices.id = select.id + '-choices';
  choices.className = 'checklist-picker-choices';
  choices.hidden = true;
  choices.setAttribute('role', 'group');
  const label = select.getAttribute('aria-label') || 'Choose checklist';
  choices.setAttribute('aria-label', label);
  trigger.setAttribute('aria-controls', choices.id);
  trigger.setAttribute('aria-expanded', 'false');
  container.append(trigger, choices);
  const disabled = () => select.matches(':disabled') || !select.options.length;
  function close(restoreFocus = false) {
    choices.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus && !disabled()) trigger.focus({ preventScroll: true });
  }
  function refresh() {
    trigger.textContent = select.selectedOptions[0]?.textContent || 'Choose checklist';
    trigger.setAttribute('aria-label', label + ': ' + trigger.textContent);
    trigger.disabled = disabled();
    const buttons = [...select.options].map(option => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'checklist-choice';
      button.dataset.value = option.value;
      button.textContent = option.textContent;
      button.disabled = option.disabled;
      button.setAttribute('aria-pressed', String(option.selected));
      button.addEventListener('click', () => {
        if (disabled()) return;
        close(true);
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        refresh();
      });
      return button;
    });
    choices.replaceChildren(...buttons);
    if (disabled()) close();
  }
  function open() {
    if (disabled()) return;
    refresh();
    choices.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
  }
  trigger.addEventListener('click', () => { if (choices.hidden) open(); else close(); });
  container.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !choices.hidden) {
      event.preventDefault();
      event.stopImmediatePropagation();
      close(true);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || disabled()) return;
    event.preventDefault();
    const wasClosed = choices.hidden;
    if (wasClosed) open();
    const buttons = [...choices.querySelectorAll('button:not(:disabled)')];
    if (!buttons.length) return;
    let index = buttons.indexOf(document.activeElement);
    if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = buttons.length - 1;
    else if (wasClosed) index = Math.max(0, buttons.findIndex(button => button.dataset.value === select.value));
    else index = (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[index].focus();
  }, true);
  document.addEventListener('pointerdown', event => { if (!container.contains(event.target)) close(); });
  container.addEventListener('focusout', event => { if (!container.contains(event.relatedTarget)) close(); });
  select.addEventListener('change', refresh);
  const observer = new MutationObserver(refresh);
  observer.observe(select, { childList: true, subtree: true, characterData: true, attributes: true });
  const fieldset = select.closest('fieldset');
  if (fieldset) observer.observe(fieldset, { attributes: true, attributeFilter: ['disabled'] });
  select.closest('dialog')?.addEventListener('close', () => close());
  refresh();
  return { refresh, close, focus: () => trigger.focus() };
}

// Drafts own their IDs; text edits and moves never change saved tick identities.
export function createRoutineTools(workspace) {
  const panel = document.getElementById('checklist-control');
  const backup = document.getElementById('backup-dialog');
  const reader = document.getElementById('routine-reader');
  const navigation = document.getElementById('routine-list');
  const picker = document.getElementById('routine-picker');
  const editor = document.getElementById('checklist-editor');
  const chooser = document.getElementById('editor-list');
  const editorPicker = createChecklistPicker(chooser);
  const message = document.getElementById('control-status');
  const preview = document.getElementById('restore-preview');
  const confirmation = document.getElementById('control-confirm');
  const file = document.getElementById('backup-file');
  let baseline, draft, chosen = 0, restored, busy = false, epoch = 0, confirmAction, backupIdentity;
  const id = prefix => `${prefix}-${crypto.randomUUID()}`;
  const item = () => ({ id: id('i'), label: 'New item' });
  const group = () => ({ id: id('g'), title: 'New section', optional: false, items: [item()] });
  const dirty = () => baseline && draft && JSON.stringify(draft) !== JSON.stringify(baseline.routines);
  const status = text => { (backup.open ? document.getElementById('backup-status') : message).textContent = text; };
  const button = (text, action, label = text) => {
    const node = document.createElement('button');
    node.type = 'button'; node.textContent = text; node.setAttribute('aria-label', label);
    node.addEventListener('click', action);
    return node;
  };
  function input(label, value, change) {
    const wrapper = document.createElement('label');
    const caption = document.createElement('span'); caption.textContent = label;
    const node = document.createElement('input'); node.value = value; node.maxLength = 240; node.required = true;
    node.addEventListener('input', () => change(node.value));
    wrapper.append(caption, node);
    return wrapper;
  }
  function actions(array, index, kind, rerender) {
    const bar = document.createElement('div'); bar.className = 'editor-actions';
    for (const [text, step] of [['↑', -1], ['↓', 1]]) {
      const move = button(text, () => {
        [array[index], array[index + step]] = [array[index + step], array[index]];
        if (kind === 'checklist') chosen += step;
        rerender();
      }, `Move ${kind} ${index + 1} ${step < 0 ? 'up' : 'down'}`);
      move.disabled = index + step < 0 || index + step >= array.length; bar.append(move);
    }
    const remove = button('Remove', () => {
      array.splice(index, 1); if (kind === 'checklist') chosen = Math.min(chosen, draft.length - 1);
      rerender(); status('Removed from your draft. Save will ask before deleting saved items.');
    }, `Remove ${kind} ${index + 1}`);
    remove.disabled = array.length <= 1; bar.append(remove);
    return bar;
  }
  function render() {
    chooser.replaceChildren();
    draft.forEach((routine, index) => { const option = document.createElement('option'); option.value = index; option.textContent = routine.name; chooser.append(option); });
    chooser.value = chosen;
    editorPicker.refresh();
    const routine = draft[chosen];
    editor.replaceChildren();
    const details = document.createElement('div'); details.className = 'editor-details';
    details.append(input('Checklist name', routine.name, value => { routine.name = value; chooser.options[chosen].textContent = value; editorPicker.refresh(); }), input('Description', routine.description, value => { routine.description = value; }), actions(draft, chosen, 'checklist', render));
    editor.append(details);
    routine.groups.forEach((section, sectionIndex) => {
      const card = document.createElement('fieldset'); card.className = 'editor-section';
      const legend = document.createElement('legend'); legend.textContent = `Section ${sectionIndex + 1}`; card.append(legend);
      card.append(input('Section title', section.title, value => { section.title = value; }));
      const optional = document.createElement('label'); optional.className = 'editor-optional';
      const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.checked = section.optional;
      toggle.addEventListener('change', () => { section.optional = toggle.checked; });
      optional.append(toggle, document.createTextNode('Optional section'));
      card.append(optional, actions(routine.groups, sectionIndex, 'section', render));
      section.items.forEach((entry, index) => {
        const row = document.createElement('div'); row.className = 'editor-item';
        row.append(input(`Item ${index + 1}`, entry.label, value => { entry.label = value; }), actions(section.items, index, 'item', render));
        card.append(row);
      });
      const add = button('+ Add item', () => { section.items.push(item()); render(); });
      add.disabled = section.items.length >= 100; card.append(add); editor.append(card);
    });
    const add = button('+ Add section', () => { routine.groups.push(group()); render(); });
    add.disabled = routine.groups.length >= 12; editor.append(add);
    document.getElementById('editor-add-list').disabled = draft.length >= 20;
  }
  function ask(title, description, label, action) {
    document.getElementById('control-confirm-title').textContent = title;
    document.getElementById('control-confirm-description').textContent = description;
    document.getElementById('control-confirm-yes').textContent = label;
    confirmAction = action; confirmation.showModal();
  }
  function close() {
    if (busy) return;
    if (dirty()) ask('Discard your draft?', 'Your saved checklists and ticks will stay as they are.', 'Discard draft', exitEditor);
    else exitEditor();
  }
  function exitEditor() {
    editorPicker.close();
    panel.hidden = true; reader.hidden = false; navigation.inert = false; picker.disabled = !picker.options.length;
    document.getElementById('control-launch').hidden = false; document.getElementById('backup-launch').disabled = false;
    if (baseline && draft) workspace.select(draft[chosen]?.id);
    baseline = draft = undefined; editor.replaceChildren(); chooser.replaceChildren();
    if (document.getElementById('routines-dialog').open) document.getElementById('control-launch').focus();
  }
  function reset() {
    epoch++; baseline = draft = restored = undefined; confirmAction = undefined;
    preview.hidden = true; file.value = ''; editor.replaceChildren(); chooser.replaceChildren();
    for (const id of ['control-destination', 'backup-destination', 'backup-status', 'restore-summary', 'control-confirm-title', 'control-confirm-description', 'control-status']) document.getElementById(id).textContent = '';
    confirmation.close(); exitEditor(); backup.close();
  }
  async function save(next, progress, targetBaseline = baseline) {
    if (busy) return;
    const current = epoch;
    busy = true; panel.setAttribute('aria-busy', 'true');
    document.getElementById('control-fields').disabled = true; document.getElementById('backup-fields').disabled = true;
    status('Saving… Keep this tab open.');
    try {
      await workspace.commit(next, targetBaseline, progress);
      if (current !== epoch) return;
      if (!panel.hidden) { baseline = workspace.snapshot(); draft = structuredClone(baseline.routines); }
      restored = undefined; preview.hidden = true; file.value = ''; if (draft) { chosen = Math.min(chosen, draft.length - 1); render(); }
      status('Saved. Your checklists and ticks are ready.');
    } catch (error) { if (current === epoch) status(error.message || 'Could not save. Your draft is still here.'); }
    finally { busy = false; panel.removeAttribute('aria-busy'); document.getElementById('control-fields').disabled = false; document.getElementById('backup-fields').disabled = false; }
  }
  document.getElementById('control-launch').addEventListener('click', () => {
    try {
      baseline = workspace.snapshot(); draft = structuredClone(baseline.routines); chosen = Math.max(0, draft.findIndex(routine => routine.id === baseline.selectedId)); epoch++;
      restored = undefined; preview.hidden = true; file.value = '';
      document.getElementById('control-destination').textContent = `Editing ${baseline.destination}. Changes apply when you save. Notes are separate.`;
      render(); status('Rename, reorder or add items. Existing ticks follow their items.'); panel.hidden = false; reader.hidden = true; navigation.inert = true; picker.disabled = true; document.getElementById('control-launch').hidden = true; document.getElementById('backup-launch').disabled = true; editorPicker.focus();
    } catch (error) { document.getElementById('routine-notice').textContent = error.message; }
  });
  document.getElementById('control-close').addEventListener('click', close);
  const routinesDialog = document.getElementById('routines-dialog');
  routinesDialog.addEventListener('cancel', event => { if (!panel.hidden) { event.preventDefault(); event.stopImmediatePropagation(); close(); } }, true);
  routinesDialog.addEventListener('click', event => {
    if (panel.hidden) return;
    const bounds = routinesDialog.getBoundingClientRect();
    const outside = event.target === routinesDialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom);
    if (outside || event.target.closest('form[method="dialog"]')) { event.preventDefault(); event.stopImmediatePropagation(); close(); }
  }, true);
  routinesDialog.addEventListener('close', reset);
  document.getElementById('backup-launch').addEventListener('click', () => {
    if (!panel.hidden) { status('Finish editing before opening backups.'); return; }
    try {
      const current = workspace.snapshot(); backupIdentity = current.identity;
      document.getElementById('backup-destination').textContent = `Backup destination: ${current.destination}.`;
      restored = undefined; preview.hidden = true; file.value = ''; epoch++;
      backup.showModal(); status('Download your saved checklists or open a backup to restore.');
    } catch (error) { document.getElementById('routine-notice').textContent = error.message; }
  });
  function closeBackup() { if (!busy) backup.close(); }
  document.getElementById('backup-close').addEventListener('click', closeBackup);
  backup.addEventListener('cancel', event => { event.preventDefault(); closeBackup(); });
  backup.addEventListener('close', () => { epoch++; restored = undefined; preview.hidden = true; file.value = ''; document.getElementById('backup-status').textContent = ''; document.getElementById('restore-summary').textContent = ''; document.getElementById('backup-destination').textContent = ''; });
  confirmation.addEventListener('close', () => { if (!confirmation.open) confirmAction = undefined; });
  document.getElementById('control-confirm-yes').addEventListener('click', () => { const action = confirmAction; confirmAction = undefined; confirmation.close(); action?.(); });
  chooser.addEventListener('change', () => { chosen = Number(chooser.value); render(); });
  document.getElementById('editor-add-list').addEventListener('click', () => { draft.push({ id: id('r'), name: 'New checklist', description: 'Your next steps.', groups: [group()] }); chosen = draft.length - 1; render(); });
  document.getElementById('editor-save').addEventListener('click', () => {
    if (![...editor.querySelectorAll('input')].every(input => input.reportValidity())) return;
    let cleaned;
    try { cleaned = cleanRoutines(draft); } catch { status('Use 1–20 checklists, 1–12 sections per list and 1–100 items per section. Every text field needs 1–240 characters.'); return; }
    const removed = removedItems(baseline.routines, cleaned);
    if (removed) ask('Remove saved items?', `${removed} item${removed === 1 ? '' : 's'} and their saved ticks will be removed from ${baseline.destination}. Export a backup first if you need a copy.`, 'Save and remove', () => save(cleaned));
    else save(cleaned);
  });
  document.getElementById('backup-export').addEventListener('click', () => {
    try {
      const current = workspace.snapshot();
      const data = createBackup(current.routines, current.progress);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `the-hub-checklists-${new Date().toISOString().slice(0, 10)}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status('Backup downloaded: saved checklists and ticks. Unsaved edits and Notes are not included.');
    } catch (error) { status(error.message); }
  });
  file.addEventListener('change', async () => {
    const selected = file.files[0]; const current = ++epoch;
    restored = undefined; preview.hidden = true;
    if (!selected) return;
    try {
      if (selected.size > MAX_BACKUP_BYTES) throw new Error('Choose a backup smaller than 2 MB.');
      const text = await selected.text();
      if (current !== epoch || !backup.open) return;
      const parsed = parseBackup(text);
      const currentWorkspace = workspace.snapshot();
      restored = { ...parsed, baseline: currentWorkspace };
      document.getElementById('restore-summary').textContent = `${parsed.routines.length} checklists · ${countItems(parsed.routines)} items · ${Object.values(parsed.progress.checks).filter(Boolean).length} saved ticks. This replaces the checklists and ticks in ${currentWorkspace.destination}. Your Notes stay as they are.`;
      preview.hidden = false; status('Backup checked. Review the replacement before restoring.');
    } catch (error) { if (current === epoch) status(error.message); }
  });
  document.getElementById('backup-restore').addEventListener('click', () => {
    if (!restored) return;
    ask('Replace checklists and ticks?', `This replaces all saved checklists and ticks in ${restored.baseline.destination}. Download a backup first if you need the current version.`, 'Replace from backup', () => {
      save(restored.routines, restored.progress, restored.baseline);
    });
  });
  document.addEventListener('hub:workspacechange', () => { if (baseline && workspace.identity() !== baseline.identity || backup.open && workspace.identity() !== backupIdentity) reset(); });
  window.addEventListener('beforeunload', event => { if (dirty() || busy) { event.preventDefault(); event.returnValue = ''; } });
}
