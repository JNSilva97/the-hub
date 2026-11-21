function createMediaLibrary() {
  const panels = new Map(['games', 'entertainment'].map(domain => [domain, document.getElementById(`${domain}-dialog`)]));
  const names = { games: 'Games', entertainment: 'Entertainment' };
  const labels = { active: 'In progress', planned: 'Up next', completed: 'Finished', paused: 'On hold', dropped: 'Dropped' };
  const typeNames = { game: 'Game', movie: 'Movie', series: 'Series', anime: 'Anime', video: 'Video', special: 'Special', other: 'Unsorted' };
  const state = new Map([...panels.keys()].map(domain => [domain, { filter: 'all', query: '', type: 'all', category: '', editing: null, baseline: '', selected: null }]));
  let model, account, busy = false, owner, notice = '', failure = '', importDomain, importOwner, preview = [];
  const previewPanel = document.getElementById('library-import-dialog');
  const node = (tag, text, className) => { const n = document.createElement(tag); n.textContent = text; if (className) n.className = className; return n; };
  const find = (domain, part) => panels.get(domain).querySelector(`[data-part="${part}"]`);
  const values = domain => Object.fromEntries(new FormData(find(domain, 'editor')));
  const dirty = () => [...state.keys()].some(domain => state.get(domain).editing && JSON.stringify(values(domain)) !== state.get(domain).baseline);
  const canNavigate = () => !busy && !dirty();
  function syncGuard() { document.dispatchEvent(new CustomEvent('hub:librarysync', { detail: !canNavigate() })); }
  const items = domain => model && account?.ready ? [...account.entries].filter(([, entry]) => model.domainOf(entry) === domain) : [];
  function status() {
    return failure || account?.error || (busy ? 'Saving to your account…' : !account?.uid ? 'Sign in to build your private library.' : !account.ready ? navigator.onLine ? 'Loading your library…' : 'Offline. Open your library online once on this device.' : !account.canWrite ? 'Offline copy. Connect to save changes.' : notice || 'Synced to your account.');
  }
  function render() {
    syncGuard();
    for (const [domain, panel] of panels) {
      const s = state.get(domain), all = items(domain);
      find(domain, 'status').textContent = status();
      find(domain, 'signin').hidden = Boolean(account?.uid);
      find(domain, 'retry').hidden = !failure && !account?.error;
      for (const button of panel.querySelectorAll('[data-write]')) button.disabled = busy || !model || !account?.canWrite;
      find(domain, 'close').disabled = busy;
      find(domain, 'cancel').disabled = busy;
      find(domain, 'editor').hidden = !s.editing;
      find(domain, 'hero-actions').hidden = Boolean(s.editing);
      find(domain, 'collection').hidden = Boolean(s.editing);
      find(domain, 'subtitle').textContent = domain === 'games' ? 'Your next adventure starts here.' : 'A little less scrolling. A little more watching.';
      find(domain, 'stats').textContent = `${all.length} titles · ${all.filter(([, e]) => e.status === 'active').length} in progress · ${all.filter(([, e]) => e.status === 'completed').length} finished`;
      if (!model || s.editing) continue;
      const category = find(domain, 'category');
      category.replaceChildren(new Option('All collections', ''), ...[...new Set(all.map(([, e]) => e.category).filter(Boolean))].sort().map(c => new Option(c, c)));
      category.value = s.category;
      for (const button of panel.querySelectorAll('[data-filter]')) button.setAttribute('aria-pressed', String(s.filter === button.dataset.filter));
      find(domain, 'pick').disabled = busy || !all.some(([, e]) => ['planned', 'active', 'paused'].includes(e.status));
      const shown = all.filter(([, e]) => (s.filter === 'all' || e.status === s.filter) && (s.type === 'all' || e.kind === s.type) && (!s.category || e.category === s.category) && `${e.title} ${e.category} ${e.platform} ${e.notes}`.toLocaleLowerCase().includes(s.query.toLocaleLowerCase()));
      const order = { active: 0, planned: 1, paused: 2, completed: 3, dropped: 4 };
      shown.sort((a, b) => order[a[1].status] - order[b[1].status] || b[1].updatedAt - a[1].updatedAt || a[1].title.localeCompare(b[1].title));
      find(domain, 'count').textContent = `${shown.length} ${shown.length === 1 ? 'title' : 'titles'}`;
      const cards = find(domain, 'cards'); cards.replaceChildren();
      for (const [id, entry] of shown) {
        const card = node('article', '', 'library-card'); card.dataset.entry = id; card.dataset.kind = entry.kind;
        if (id === s.selected) card.classList.add('library-picked');
        const art = node('div', '', 'library-art'); art.setAttribute('aria-hidden', 'true');
        art.style.setProperty('--card-hue', String([...entry.title].reduce((n, c) => n + c.charCodeAt(0), 0) % 360));
        art.append(node('span', entry.title.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase(), 'library-monogram'), node('span', typeNames[entry.kind], 'library-type'));
        const body = node('div', '', 'library-card-body');
        const meta = node('div', '', 'library-card-meta'); meta.append(node('span', labels[entry.status], `library-badge status-${entry.status}`));
        if (entry.rating) meta.append(node('span', `${entry.rating}/10`, 'library-rating'));
        const title = node('h3', entry.title); body.append(meta, title);
        const detail = [entry.category, entry.platform].filter(Boolean).join(' · ');
        if (detail) body.append(node('p', detail, 'library-card-detail'));
        if (model.serial(entry)) body.append(node('p', `${entry.season ? `Season ${entry.season}` : 'Season not set'} · ${entry.episode ? `Episode ${entry.episode}` : 'Episode not set'}`, 'library-position'));
        if (entry.kind === 'game') {
          const progress = document.createElement('progress'); progress.max = 100; progress.value = entry.progress; progress.setAttribute('aria-label', `${entry.title}: ${entry.progress}% complete`);
          body.append(progress, node('p', `${entry.progress}% complete`, 'library-position'));
        }
        const actions = node('div', '', 'library-card-actions');
        const action = (text, run, write = true) => { const b = node('button', text); b.type = 'button'; b.disabled = busy || write && !account?.canWrite; b.addEventListener('click', run); return b; };
        if (entry.status === 'planned' || entry.status === 'paused') actions.append(action(domain === 'games' ? 'Play next' : 'Watch next', () => quick(domain, id, e => ({ ...e, status: 'active' }))));
        else if (entry.status === 'active' && model.serial(entry)) actions.append(action('Next episode', () => quick(domain, id, e => ({ ...e, episode: Math.min(50000, e.episode + 1) }))));
        else if (entry.status === 'active') actions.append(action('Mark finished', () => quick(domain, id, e => ({ ...e, status: 'completed', progress: e.kind === 'game' ? 100 : e.progress }))));
        actions.append(action('Details', () => edit(domain, id), false)); body.append(actions); card.append(art, body); cards.append(card);
      }
      find(domain, 'empty').hidden = shown.length > 0;
      find(domain, 'empty-title').textContent = all.length ? 'No titles match this view.' : domain === 'games' ? 'Make room for your next adventure.' : 'Your watchlist, all in one place.';
      find(domain, 'empty-copy').textContent = all.length ? 'Try another filter or a different search.' : 'Add a title or import your existing list. Your library stays in your account.';
    }
  }
  async function write(run, success) {
    if (busy || !account?.canWrite) return false;
    const uid = account.uid;
    busy = true; failure = ''; notice = ''; render();
    try { const result = await run(); if (uid !== account.uid) return false; notice = typeof success === 'function' ? success(result) : success; return true; }
    catch (error) { if (uid === account.uid) failure = error.code === 'permission-denied' ? 'Could not save. Library account rules need to be enabled.' : error.message || 'Could not save. Try again.'; return false; }
    finally { if (uid === account.uid) busy = false; render(); }
  }
  async function quick(domain, id, change) {
    const entry = account.entries.get(id);
    if (!entry) return;
    await write(() => account.save(id, change(entry), entry.revision), 'Progress saved.');
  }
  function edit(domain, id) {
    if (busy || !model) return;
    const s = state.get(domain), saved = id ? account?.entries.get(id) : null;
    if (id && !saved) return;
    const entry = saved || model.newEntry(domain === 'games' ? 'game' : 'movie');
    s.editing = { id, revision: saved?.revision ?? 0 };
    const form = find(domain, 'editor');
    for (const key of ['title', 'kind', 'status', 'category', 'platform', 'rating', 'progress', 'season', 'episode', 'notes']) form.elements.namedItem(key).value = entry[key];
    s.baseline = JSON.stringify(values(domain));
    find(domain, 'editor-title').textContent = id ? 'Title details' : 'Add a title';
    updateFields(domain); render(); form.elements.title.focus();
  }
  function updateFields(domain) {
    const kind = find(domain, 'editor').elements.kind.value;
    for (const field of panels.get(domain).querySelectorAll('[data-field]')) field.hidden = field.dataset.field === 'game' ? kind !== 'game' : !model?.serial({ kind });
  }
  async function save(domain) {
    const s = state.get(domain); if (!s.editing || busy || !model || !account?.canWrite) return;
    const uid = account.uid;
    const data = values(domain), previous = s.editing;
    const entry = { ...model.newEntry(data.kind), ...data, ...Object.fromEntries(['rating', 'progress', 'season', 'episode'].map(k => [k, Number(data[k])])) };
    if (entry.status === 'completed' && entry.kind === 'game') entry.progress = 100;
    let id;
    try {
      id = previous.id || await model.entryId(entry); model.readEntry(id, entry);
      if (!previous.id && [...account.entries.values()].some(e => model.entryKey(e) === model.entryKey(entry))) throw new Error('This title is already in your library. Open its Details instead.');
    } catch (error) { failure = error.message; render(); return; }
    if (uid !== account.uid || s.editing !== previous) return;
    if (await write(() => account.save(id, entry, previous.revision), 'Title saved.') && uid === account.uid) { s.editing = null; s.baseline = ''; render(); find(domain, 'add').focus(); }
  }
  function close(domain) {
    if (!canNavigate()) { notice = busy ? 'Saving. Please wait.' : 'Save or Cancel your changes before leaving.'; render(); return; }
    state.get(domain).editing = null; render(); panels.get(domain).close();
  }
  function cancel(domain) { if (!busy) { state.get(domain).editing = null; failure = ''; render(); find(domain, 'add').focus(); } }
  async function previewFile(domain, file) {
    if (!file || !model || !account?.canWrite || busy) return;
    importOwner = account.uid; importDomain = domain; failure = ''; notice = '';
    try {
      if (file.size > 2000000) throw new Error('Choose a list smaller than 2 MB.');
      const text = await file.text();
      const packet = text.trim().startsWith('{') ? JSON.parse(text) : null;
      const parsed = packet && Array.isArray(packet.games) && Array.isArray(packet.entertainment)
        ? [...model.parseList(text, 'games'), ...model.parseList(text, 'entertainment')]
        : model.parseList(text, domain);
      if (parsed.length > 300) throw new Error('Import up to 300 titles at a time.');
      const known = new Set([...account.entries.values()].map(model.entryKey));
      preview = await Promise.all(parsed.map(async entry => ({ id: await model.entryId(entry), entry, exists: known.has(model.entryKey(entry)) })));
      if (importOwner !== account.uid) return;
      const list = document.getElementById('library-import-list'); list.replaceChildren();
      preview.forEach((item, index) => {
        const label = node('label', '', 'library-import-row'), input = document.createElement('input'); input.type = 'checkbox'; input.value = index; input.checked = !item.exists; input.disabled = item.exists;
        const copy = node('span', ''); copy.append(node('strong', item.entry.title), node('small', `${typeNames[item.entry.kind]} · ${labels[item.entry.status]}${item.entry.season ? ` · Season ${item.entry.season}` : ''}${item.exists ? ' · Already in your library' : ''}`));
        label.append(input, copy); list.append(label);
      });
      document.getElementById('library-import-summary').textContent = `${preview.filter(i => !i.exists).length} new titles. Existing titles will stay unchanged. Review your selection before importing.`;
      document.getElementById('library-import-status').textContent = '';
      document.getElementById('library-import-save').disabled = !preview.some(i => !i.exists);
      previewPanel.showModal();
    } catch (error) { failure = error.message || 'Could not read this list.'; render(); }
  }
  async function commitImport() {
    if (busy || importOwner !== account?.uid) return;
    const selected = [...previewPanel.querySelectorAll('input:checked')].map(i => preview[Number(i.value)]).filter(i => i && !i.exists);
    if (!selected.length) { document.getElementById('library-import-status').textContent = 'Select at least one new title.'; return; }
    for (const b of previewPanel.querySelectorAll('button, input')) b.disabled = true;
    document.getElementById('library-import-status').textContent = 'Importing your titles…';
    if (await write(() => account.importEntries(selected), added => `${added} titles imported.`)) { previewPanel.close(); preview = []; }
    else document.getElementById('library-import-status').textContent = failure;
    for (const b of previewPanel.querySelectorAll('button, input')) b.disabled = false;
    [...previewPanel.querySelectorAll('input')].forEach((input, i) => { input.disabled = preview[i]?.exists ?? false; });
  }
  for (const [domain, panel] of panels) {
    const s = state.get(domain);
    find(domain, 'close').addEventListener('click', () => close(domain));
    panel.addEventListener('cancel', event => { event.preventDefault(); close(domain); });
    panel.addEventListener('submit', event => { if (event.target === find(domain, 'editor')) { event.preventDefault(); save(domain); } });
    panel.addEventListener('click', event => { if (event.target !== panel) return; const r = panel.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(domain); });
    // The close form also supports the shared browser smoke check.
    panel.querySelector('.library-close-form').addEventListener('submit', event => { event.preventDefault(); close(domain); });
    find(domain, 'add').addEventListener('click', () => edit(domain));
    find(domain, 'cancel').addEventListener('click', () => cancel(domain));
    find(domain, 'editor').addEventListener('input', () => { updateFields(domain); syncGuard(); });
    find(domain, 'search').addEventListener('input', event => { s.query = event.target.value; render(); });
    find(domain, 'type').addEventListener('change', event => { s.type = event.target.value; render(); });
    find(domain, 'category').addEventListener('change', event => { s.category = event.target.value; render(); });
    for (const button of panel.querySelectorAll('[data-filter]')) button.addEventListener('click', () => { s.filter = button.dataset.filter; render(); });
    find(domain, 'import').addEventListener('click', () => find(domain, 'file').click());
    find(domain, 'file').addEventListener('change', event => { previewFile(domain, event.target.files[0]); event.target.value = ''; });
    find(domain, 'pick').addEventListener('click', () => {
      const planned = items(domain).filter(([, e]) => e.status === 'planned');
      const choices = planned.length ? planned : items(domain).filter(([, e]) => ['active', 'paused'].includes(e.status)); if (!choices.length) return;
      const choice = choices[Math.floor(Math.random() * choices.length)];
      s.selected = choice[0]; s.filter = choice[1].status; s.query = ''; s.category = ''; s.type = 'all';
      find(domain, 'search').value = ''; find(domain, 'type').value = 'all'; render();
      panel.querySelector('.library-picked')?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      notice = `Picked for you: ${account.entries.get(s.selected).title}`; find(domain, 'status').textContent = notice;
    });
    find(domain, 'signin').addEventListener('click', () => { if (!canNavigate()) return; panel.close(); document.getElementById('account-launch').click(); });
    find(domain, 'retry').addEventListener('click', () => { failure = ''; if (account) account.retry(); else location.reload(); });
  }
  document.getElementById('library-import-save').addEventListener('click', commitImport);
  document.getElementById('library-import-cancel').addEventListener('click', () => { if (!busy) { preview = []; previewPanel.close(); } });
  previewPanel.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  import('./library-model.mjs?v=library-1').then(m => { model = m; render(); return import('./cloud-library.js?v=library-1'); }).then(m => {
    const changed = () => {
      if (owner !== account?.uid) {
        owner = account?.uid; busy = false; notice = failure = ''; preview = []; previewPanel.close();
        document.getElementById('library-import-list').replaceChildren();
        document.getElementById('library-import-summary').textContent = '';
        document.getElementById('library-import-status').textContent = '';
        for (const [domain, s] of state) {
          s.editing = null; s.baseline = ''; s.selected = null; s.query = ''; s.category = ''; s.type = s.filter = 'all';
          find(domain, 'editor').reset(); find(domain, 'search').value = ''; find(domain, 'type').value = 'all';
        }
      }
      render();
    };
    account = m.createLibraryAccount(changed); changed();
  }).catch(() => { failure = 'Your library could not load. Reload to try again.'; render(); });
  render();
  return { open(domain) { if (canNavigate()) { render(); panels.get(domain).showModal(); } }, canNavigate };
}
