// One storage entry per note keeps edits to different notes independent across tabs.
function createInstantNotes(panel) {
  const editor = document.getElementById('note-text');
  const search = document.getElementById('notes-search');
  const list = document.getElementById('note-list');
  const status = document.getElementById('notes-status');
  const deleteDialog = document.getElementById('note-delete-dialog');
  const undoDelete = document.getElementById('note-undo-delete');
  const personal = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
  const prefix = `thehub:notes:${personal ? 'private' : 'demo'}:v1:`;
  const notes = new Map();
  const revisions = new Map();
  const unsaved = new Set();
  const editedHere = new Set();
  // Keep failed local saves in this tab even when switching accounts or notebooks.
  const localRecovery = new Map();
  const library = document.getElementById('notes-library');
  const mobile = matchMedia('(max-width: 700px)');
  const browse = document.getElementById('notes-browse');
  const newButton = document.getElementById('note-new');
  const headingActions = panel.querySelector('.notes-actions');
  const phoneActions = document.getElementById('notes-phone-actions');
  function updateBrowse() {
    library.querySelector('summary').textContent = library.open && mobile.matches ? 'Back to note' : 'Browse notes';
    browse.textContent = library.open ? 'Back to note' : 'All notes';
    browse.setAttribute('aria-expanded', String(library.open));
  }
  function arrangeNoteActions() {
    library.open = !mobile.matches;
    if (mobile.matches) phoneActions.append(newButton);
    else headingActions.insertBefore(newButton, headingActions.querySelector('form'));
    updateBrowse();
  }
  arrangeNoteActions();
  mobile.addEventListener('change', arrangeNoteActions);
  library.addEventListener('toggle', updateBrowse);
  browse.addEventListener('click', () => {
    library.open = !library.open;
    updateBrowse();
    if (library.open) {
      search.value = ''; renderList();
      (list.querySelector('[aria-pressed="true"]') || list.querySelector('button'))?.focus();
    } else editor.focus({ preventScroll: true });
  });
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const importDialog = document.getElementById('notes-import-dialog');
  let cloud;
  let accountId = '';
  let accountMode = false;
  let copying;
  let selected;
  let loaded = false;
  let warning = '';
  let closing;
  let pendingDelete;
  let lastDeleted;
  const title = note => note.text.trim().split(/\r?\n/)[0].slice(0, 80) || 'New note';

  function parse(raw, id) {
    const note = JSON.parse(raw);
    if (note?.version !== 1 || note.id !== id || !/^[a-f0-9-]{36}$/.test(id) || !Number.isSafeInteger(note.updatedAt) || note.updatedAt < 0) throw new Error('Invalid note.');
    if (note.deleted === true) return note;
    if (note.deleted !== undefined && note.deleted !== false || typeof note.text !== 'string' || note.text.length > 50000) throw new Error('Invalid note.');
    return note;
  }

  function tell(message, failed = false) {
    const text = warning ? `${message} ${warning}` : message;
    if (status.textContent !== text) status.textContent = text;
    status.dataset.warning = String(failed || Boolean(warning));
  }

  function renderList() {
    const focused = document.activeElement.closest?.('#note-list button')?.dataset.note;
    const query = search.value.trim().toLocaleLowerCase();
    const branches = new Map();
    if (accountMode) for (const note of notes.values()) if (note.parent) branches.set(note.parent, (branches.get(note.parent) || 0) + 1);
    list.replaceChildren();
    for (const note of [...notes.values()].sort((a, b) => b.updatedAt - a.updatedAt)) {
      if (query && !note.text.toLocaleLowerCase().includes(query)) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.note = note.id;
      button.setAttribute('aria-pressed', String(note.id === selected));
      const heading = document.createElement('strong');
      heading.textContent = title(note);
      const preview = document.createElement('span');
      preview.textContent = (branches.get(note.parent) > 1 ? 'Concurrent version · ' : '') + (note.text.trim().split(/\r?\n/).slice(1).join(' ').trim().slice(0, 100) || 'Open and keep writing');
      button.append(heading, preview);
      button.addEventListener('click', () => select(note.id));
      list.append(button);
    }
    document.getElementById('notes-empty').hidden = list.children.length > 0;
    if (focused) list.querySelector(`[data-note="${focused}"]`)?.focus({ preventScroll: true });
  }

  function updateHeading() {
    document.getElementById('note-name').textContent = title(notes.get(selected));
    document.getElementById('note-count').textContent = `${editor.value.length.toLocaleString('en-GB')} / 50,000`;
    document.getElementById('note-delete').disabled = !notes.get(selected).text && !revisions.has(selected);
  }

  function select(id) {
    selected = id;
    editor.value = notes.get(id).text;
    updateHeading();
    renderList();
    if (mobile.matches) { library.open = false; updateBrowse(); }
    tell(accountMode ? cloud.status : unsaved.has(id) ? 'Not saved. Keep this tab open and copy your text before leaving.' : revisions.has(id) ? 'Saved in this browser.' : 'Start typing. Your note saves automatically.', unsaved.has(id));
    if (panel.open) {
      editor.focus({ preventScroll: true });
      editor.setSelectionRange(editor.value.length, editor.value.length);
    }
  }

  function newNote() {
    search.value = '';
    const empty = [...notes.values()].find(note => !note.text);
    const note = empty || { version: 1, id: crypto.randomUUID(), text: '', updatedAt: Date.now() };
    notes.set(note.id, note);
    select(note.id);
  }

  function load() {
    if (accountMode) { refreshCloud(); return; }
    loaded = true;
    try {
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (!key?.startsWith(prefix)) continue;
        const raw = localStorage.getItem(key);
        try {
          const note = parse(raw, key.slice(prefix.length));
          if (!note.deleted) notes.set(note.id, note);
          revisions.set(note.id, raw);
        } catch { warning = 'Some saved notes could not be read. Their stored data is unchanged.'; }
      }
    } catch { warning = 'Storage is unavailable. Keep this tab open and copy your text before leaving.'; }
    for (const [id, draft] of [...localRecovery]) {
      let recovered = draft;
      if (revisions.has(id) && notes.get(id)?.text !== draft.text) {
        recovered = { ...draft, id: crypto.randomUUID() };
        localRecovery.delete(id); localRecovery.set(recovered.id, recovered);
      }
      notes.set(recovered.id, recovered); unsaved.add(recovered.id);
    }
    const saved = [...notes.values()].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (!personal) {
      const samples = ['A place for your next idea\nCapture a thought, a plan or something to remember. These are sample notes; your edits stay in this browser.', 'Nightfall ideas\nA city after dark. Blue light. A clear next move.'];
      for (const [index, text] of samples.entries()) {
        const id = `00000000-0000-4000-8000-00000000000${index + 1}`;
        if (!revisions.has(id)) notes.set(id, { version: 1, id, text, updatedAt: 0 });
      }
    }
    if (saved) { select(saved.id); if (!unsaved.has(saved.id)) tell('Saved notes loaded from this browser.'); }
    else newNote();
    document.getElementById('notes-source').textContent = personal ? 'PERSONAL / THIS PC' : 'DEMO / THIS BROWSER';
    document.getElementById('notes-data-note').textContent = 'These local notes stay in this browser. Nothing is sent to your account.';
  }

  function store(note) {
    if (accountMode) {
      const staged = cloud.stage(note);
      notes.delete(note.id); notes.set(staged.id, staged);
      return staged;
    }
    const originalId = note.id;
    try {
      const current = localStorage.getItem(prefix + note.id);
      if (current !== (revisions.get(note.id) ?? null)) {
        // Preserve both texts when another tab changed the same note before this write.
        if (current !== null) {
          try {
            const stored = parse(current, note.id);
            if (stored.deleted) notes.delete(note.id);
            else notes.set(note.id, stored);
            revisions.set(note.id, current);
          } catch { /* Leave unreadable stored data untouched. */ }
        }
        note.id = crypto.randomUUID();
      }
      const raw = JSON.stringify(note);
      localStorage.setItem(prefix + note.id, raw);
      revisions.set(note.id, raw);
      unsaved.delete(note.id);
      tell(note.id === originalId ? 'Saved in this browser.' : 'Saved your version as a separate note to keep both edits.');
    } catch {
      unsaved.add(note.id);
      tell('Not saved. Keep this tab open and copy your text before leaving.', true);
    }
    if (note.id !== originalId) { unsaved.delete(originalId); editedHere.delete(originalId); }
    localRecovery.delete(originalId);
    if (unsaved.has(note.id)) localRecovery.set(note.id, { ...note });
    else localRecovery.delete(note.id);
    editedHere.add(note.id);
    notes.set(note.id, note);
    return note;
  }

  function saveDraft() {
    const note = store({ ...notes.get(selected), text: editor.value, updatedAt: Date.now() });
    selected = note.id;
    updateHeading();
    renderList();
  }

  editor.addEventListener('input', saveDraft);
  search.addEventListener('input', renderList);
  document.getElementById('note-new').addEventListener('click', newNote);

  function forget(id) {
    if (!accountMode) localRecovery.delete(id);
    notes.delete(id);
    unsaved.delete(id);
    editedHere.delete(id);
    if (selected === id) {
      search.value = '';
      const next = [...notes.values()].sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (next) select(next.id);
      else newNote();
    } else renderList();
  }

  document.getElementById('note-delete').addEventListener('click', () => {
    if (!selected || deleteDialog.open) return;
    pendingDelete = { note: { ...notes.get(selected) }, revision: revisions.get(selected) ?? null };
    document.getElementById('note-delete-description').textContent = `Delete “${title(pendingDelete.note)}” ${accountMode ? 'from your account on all devices' : 'from this browser'}? You can undo the last deletion until you reload this page or delete another note. Concurrent edits are kept separately.`;
    deleteDialog.showModal();
  });
  deleteDialog.addEventListener('close', () => { if (!deleteDialog.open) pendingDelete = undefined; });
  document.getElementById('note-delete-confirm').addEventListener('click', () => {
    if (!deleteDialog.open || !pendingDelete || !panel.open) return;
    const { note, revision } = pendingDelete;
    pendingDelete = undefined;
    deleteDialog.close();
    try {
      if (accountMode) {
        if (JSON.stringify(cloud.notes.get(note.id)) !== JSON.stringify(note)) { tell('This note changed on another device. Review it before deleting.', true); return; }
        cloud.stage({ ...note, updatedAt: Date.now() }, true);
        lastDeleted = note; undoDelete.hidden = false;
        forget(note.id); tell(cloud.status); return;
      }
      if (localStorage.getItem(prefix + note.id) !== revision) {
        tell('This note changed in another tab. Review it before deleting.', true);
        return;
      }
      // Keep only deletion metadata so stale tabs cannot silently resurrect this ID.
      const raw = JSON.stringify({ version: 1, id: note.id, deleted: true, updatedAt: Date.now() });
      localStorage.setItem(prefix + note.id, raw);
      revisions.set(note.id, raw);
      lastDeleted = note;
      undoDelete.hidden = false;
      undoDelete.setAttribute('aria-label', `Undo deletion of ${title(note)}`);
      forget(note.id);
      tell('Note deleted. Undo is available for this visit, until the next deletion.');
    } catch { tell('Couldn’t delete this note. Your text is still here. Try again.', true); }
  });
  undoDelete.addEventListener('click', () => {
    if (!lastDeleted) return;
    const restored = store({ ...lastDeleted, id: crypto.randomUUID(), updatedAt: Date.now() });
    lastDeleted = undefined;
    undoDelete.hidden = true;
    search.value = '';
    select(restored.id);
    if (!unsaved.has(restored.id)) tell(accountMode ? cloud.status : 'Note restored and saved in this browser.');
  });
  window.addEventListener('storage', event => {
    if (accountMode) return;
    if (!loaded || (event.key !== null && !event.key.startsWith(prefix))) return;
    if (event.key === null || event.newValue === null) {
      const ids = event.key === null ? [...notes.keys()] : [event.key.slice(prefix.length)];
      for (const id of ids) {
        if (notes.has(id)) { unsaved.add(id); localRecovery.set(id, { ...notes.get(id) }); }
        revisions.delete(id);
      }
      tell('Saved notes were cleared in another tab. Your open copies are kept here. Copy your text before leaving.', true);
      return;
    }
    const id = event.key.slice(prefix.length);
    try {
      const incoming = parse(event.newValue, id);
      const local = notes.get(id);
      if (incoming.deleted) {
        const wasSelected = selected === id;
        const keepCopy = local && (unsaved.has(id) || editedHere.has(id) && revisions.get(id) !== event.oldValue);
        if (pendingDelete?.note.id === id) { pendingDelete = undefined; deleteDialog.close(); }
        revisions.set(id, event.newValue);
        let copy;
        if (keepCopy) copy = store({ ...local, id: crypto.randomUUID() });
        forget(id);
        if (copy) {
          if (wasSelected) select(copy.id);
          if (!unsaved.has(copy.id)) tell('Deleted in another tab. Your newer edit was kept as a separate note.');
        } else tell('Note deleted in another tab.');
        return;
      }
      const keepDraft = local && local.text !== incoming.text && (unsaved.has(id) || editedHere.has(id) || id === selected && panel.open && document.activeElement === editor && editor.value);
      notes.set(id, incoming);
      revisions.set(id, event.newValue);
      if (keepDraft) {
        const copy = store({ ...local, id: crypto.randomUUID() });
        unsaved.delete(id);
        editedHere.delete(id);
        if (id === selected) selected = copy.id;
        if (!unsaved.has(copy.id)) tell('Saved your version as a separate note to keep both edits.');
      } else if (id === selected) {
        editor.value = incoming.text;
      }
      updateHeading();
      renderList();
    } catch { tell('A note from another tab could not be read. Your text is unchanged.', true); }
  });

  window.addEventListener('beforeunload', event => {
    if ([...localRecovery.values()].some(note => note.text)) {
      event.preventDefault(); event.returnValue = '';
    }
  });

  function resetView() {
    loaded = false; selected = undefined; warning = ''; pendingDelete = lastDeleted = copying = undefined;
    notes.clear(); revisions.clear(); unsaved.clear(); editedHere.clear();
    editor.value = ''; search.value = ''; list.replaceChildren();
    document.getElementById('note-name').textContent = 'New note';
    document.getElementById('note-count').textContent = '0 / 50,000';
    document.getElementById('note-delete').disabled = true;
    undoDelete.hidden = true; deleteDialog.close(); importDialog.close();
    undoDelete.removeAttribute('aria-label');
    document.getElementById('note-delete-description').textContent = '';
    document.getElementById('notes-import-description').textContent = '';
  }
  function refreshCloud() {
    if (!cloud) return;
    const identity = cloud.user?.uid || '';
    if (identity !== accountId) { accountId = identity; accountMode = Boolean(identity); resetView(); }
    if (accountMode && cloud.error && !cloud.notes.size) {
      const message = cloud.error;
      resetView(); accountMode = false; warning = message;
    }
    document.getElementById('notes-account').textContent = !identity ? 'Private access' : accountMode ? 'Account notes' : 'Open account notes';
    document.getElementById('notes-account').disabled = Boolean(identity && accountMode);
    document.getElementById('notes-account').hidden = Boolean(identity && accountMode);
    document.getElementById('notes-local').hidden = !identity || !accountMode;
    document.getElementById('notes-import').hidden = !identity || !accountMode;
    document.getElementById('notes-import').disabled = !cloud.ready;
    document.getElementById('notes-retry').hidden = !accountMode || !cloud.error;
    document.getElementById('note-new').disabled = accountMode && !cloud.ready;
    browse.disabled = accountMode && !cloud.ready;
    editor.readOnly = accountMode && !cloud.ready;
    if (!accountMode) { if (panel.open && !loaded) load(); return; }
    const empty = notes.get(selected);
    const incoming = cloud.notes;
    notes.clear(); for (const [id, note] of incoming) notes.set(id, note);
    if (empty && !empty.text && !incoming.has(empty.id)) notes.set(empty.id, empty);
    if (!notes.has(selected)) selected = [...notes.values()].sort((a, b) => b.updatedAt - a.updatedAt)[0]?.id;
    loaded = true;
    document.getElementById('notes-source').textContent = 'PRIVATE / YOUR ACCOUNT';
    document.getElementById('notes-data-note').textContent = 'Your account notes sync across devices. Concurrent versions are kept separately.';
    if (selected) {
      if (editor.value !== notes.get(selected).text) editor.value = notes.get(selected).text;
      updateHeading(); renderList();
    } else if (cloud.ready) newNote();
    else { editor.value = ''; renderList(); }
    tell(cloud.status, Boolean(cloud.error));
    document.getElementById('note-delete').disabled = !cloud.ready || !selected || !notes.get(selected)?.text;
  }
  document.getElementById('notes-account').addEventListener('click', () => {
    if (!cloud?.user) { document.getElementById('account-launch').click(); return; }
    resetView(); accountMode = true;
    if (cloud.error) cloud.retry();
    refreshCloud();
  });
  document.getElementById('notes-local').addEventListener('click', () => { resetView(); accountMode = false; refreshCloud(); load(); });
  document.getElementById('notes-retry').addEventListener('click', () => cloud?.retry());
  document.getElementById('notes-import').addEventListener('click', () => {
    if (!cloud?.user || !cloud.ready) return;
    try {
      const candidates = [];
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (!key?.startsWith(prefix)) continue;
        const note = parse(localStorage.getItem(key), key.slice(prefix.length));
        if (!note.deleted && note.text.trim() && ![...cloud.notes.values()].some(saved => saved.text === note.text)) candidates.push(note);
      }
      copying = { uid: cloud.user.uid, notes: candidates };
      document.getElementById('notes-import-description').textContent = `Copy ${candidates.length} saved local note(s) to ${cloud.user.email || 'your Google account'} in Firebase? Local originals stay here. Unedited sample notes are excluded. These copies will sync to devices signed into this account.`;
      document.getElementById('notes-import-confirm').disabled = !candidates.length;
      importDialog.showModal();
    } catch { tell('Local notes could not be read. Nothing was copied or removed.', true); }
  });
  document.getElementById('notes-import-confirm').addEventListener('click', () => {
    if (!copying || copying.uid !== cloud?.user?.uid || !cloud.ready) return;
    try {
      if (copying.notes.some(note => JSON.stringify(parse(localStorage.getItem(prefix + note.id), note.id)) !== JSON.stringify(note))) {
        importDialog.close(); tell('Local notes changed. Open Copy local notes again to review them.', true); return;
      }
    } catch { importDialog.close(); tell('Local notes could not be read. Nothing was copied.', true); return; }
    const copied = copying; copying = undefined; importDialog.close();
    for (const note of copied.notes) cloud.stage({ ...note, id: crypto.randomUUID(), parent: '', updatedAt: Date.now() });
    refreshCloud();
  });
  importDialog.addEventListener('close', () => { copying = undefined; });
  import('./cloud-notes.js?v=notes-sync-1').then(module => { cloud = module.createCloudNotes(refreshCloud); refreshCloud(); }).catch(() => {
    if (panel.open) tell('Account sync could not load. Local notes still work; reopen online to retry.', true);
  });

  function close() {
    if (accountMode) cloud?.flush();
    if (!panel.open) return;
    if (closing || reducedMotion.matches || document.hidden || document.body.classList.contains('motion-paused') || typeof panel.animate !== 'function') {
      closing?.cancel();
      closing = undefined;
      panel.close();
      return;
    }
    const style = getComputedStyle(panel);
    const animation = panel.animate([{ opacity: style.opacity, transform: style.transform }, { opacity: 0, transform: 'translateY(8px) scale(.985)' }], { duration: 160, easing: 'ease-out' });
    closing = animation;
    animation.finished.then(() => { if (closing === animation) { closing = undefined; panel.close(); } }).catch(() => {});
  }
  panel.querySelector('form').addEventListener('submit', event => { event.preventDefault(); close(); });
  panel.addEventListener('cancel', event => { event.preventDefault(); close(); });
  panel.addEventListener('close', () => {
    closing?.cancel();
    closing = undefined;
    if (!panel.open && deleteDialog.open) deleteDialog.close();
  });
  const settleClose = () => { if (closing) close(); };
  reducedMotion.addEventListener('change', settleClose);
  document.addEventListener('hub:motionchange', settleClose);
  document.addEventListener('visibilitychange', () => { if (document.hidden) settleClose(); });
  return {
    open() {
      closing?.cancel();
      closing = undefined;
      if (!loaded) load();
      if (mobile.matches) { library.open = false; updateBrowse(); }
      if (!panel.open) panel.showModal();
      editor.focus({ preventScroll: true });
      editor.setSelectionRange(editor.value.length, editor.value.length);
    }, close
  };
}
