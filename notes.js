// One storage entry per note keeps edits to different notes independent across tabs.
function createInstantNotes(panel) {
  const editor = document.getElementById('note-text');
  const search = document.getElementById('notes-search');
  const list = document.getElementById('note-list');
  const status = document.getElementById('notes-status');
  const personal = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
  const prefix = `thehub:notes:${personal ? 'private' : 'demo'}:v1:`;
  const notes = new Map();
  const revisions = new Map();
  const unsaved = new Set();
  const editedHere = new Set();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let selected;
  let loaded = false;
  let warning = '';
  let closing;
  const title = note => note.text.trim().split(/\r?\n/)[0].slice(0, 80) || 'New note';

  function parse(raw, id) {
    const note = JSON.parse(raw);
    if (note?.version !== 1 || note.id !== id || !/^[a-f0-9-]{36}$/.test(id) || typeof note.text !== 'string' || note.text.length > 50000 || !Number.isSafeInteger(note.updatedAt) || note.updatedAt < 0) throw new Error('Invalid note.');
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
      preview.textContent = note.text.trim().split(/\r?\n/).slice(1).join(' ').trim().slice(0, 100) || 'Open and keep writing';
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
  }

  function select(id) {
    selected = id;
    editor.value = notes.get(id).text;
    updateHeading();
    renderList();
    tell(unsaved.has(id) ? 'Not saved. Keep this tab open and copy your text before leaving.' : revisions.has(id) ? 'Saved in this browser.' : 'Start typing. Your note saves automatically.', unsaved.has(id));
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
    loaded = true;
    try {
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (!key?.startsWith(prefix)) continue;
        const raw = localStorage.getItem(key);
        try {
          const note = parse(raw, key.slice(prefix.length));
          notes.set(note.id, note);
          revisions.set(note.id, raw);
        } catch { warning = 'Some saved notes could not be read. Their stored data is unchanged.'; }
      }
    } catch { warning = 'Storage is unavailable. Keep this tab open and copy your text before leaving.'; }
    const saved = [...notes.values()].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (!personal && !saved) {
      for (const text of ['A place for your next idea\nCapture a thought, a plan or something to remember. These are sample notes; your edits stay in this browser.', 'Nightfall ideas\nA city after dark. Blue light. A clear next move.']) {
        const note = { version: 1, id: crypto.randomUUID(), text, updatedAt: 0 };
        notes.set(note.id, note);
      }
    }
    if (saved) { select(saved.id); tell('Saved notes loaded from this browser.'); }
    else newNote();
    document.getElementById('notes-source').textContent = personal ? 'PERSONAL / THIS PC' : 'DEMO / THIS BROWSER';
  }

  function store(note) {
    const originalId = note.id;
    try {
      const current = localStorage.getItem(prefix + note.id);
      if (current !== (revisions.get(note.id) ?? null)) {
        // Preserve both texts when another tab changed the same note before this write.
        if (current !== null) {
          try {
            notes.set(note.id, parse(current, note.id));
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
  window.addEventListener('storage', event => {
    if (!loaded || (event.key !== null && !event.key.startsWith(prefix))) return;
    if (event.key === null || event.newValue === null) {
      const ids = event.key === null ? [...notes.keys()] : [event.key.slice(prefix.length)];
      for (const id of ids) {
        if (notes.has(id)) unsaved.add(id);
        revisions.delete(id);
      }
      tell('Saved notes were cleared in another tab. Your open copies are kept here. Copy your text before leaving.', true);
      return;
    }
    const id = event.key.slice(prefix.length);
    try {
      const incoming = parse(event.newValue, id);
      const local = notes.get(id);
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

  function close() {
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
  panel.addEventListener('close', () => { closing?.cancel(); closing = undefined; });
  const settleClose = () => { if (closing) close(); };
  reducedMotion.addEventListener('change', settleClose);
  document.addEventListener('hub:motionchange', settleClose);
  document.addEventListener('visibilitychange', () => { if (document.hidden) settleClose(); });
  return {
    open() {
      closing?.cancel();
      closing = undefined;
      if (!loaded) load();
      if (!panel.open) panel.showModal();
      editor.focus({ preventScroll: true });
      editor.setSelectionRange(editor.value.length, editor.value.length);
    }, close
  };
}
