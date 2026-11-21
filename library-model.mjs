export const kinds = ['game', 'movie', 'series', 'anime', 'video', 'special', 'other'];
export const statuses = ['active', 'planned', 'completed', 'paused', 'dropped'];
export const domainOf = entry => entry.kind === 'game' ? 'games' : 'entertainment';
export const entryKey = entry => `${entry.kind}:${entry.title.trim().normalize('NFKC').toLocaleLowerCase()}`;
export const serial = entry => ['series', 'anime', 'video'].includes(entry.kind);
export function universeName(entry) {
  const category = entry.category.trim();
  const key = category.toLowerCase().replace(/[’']/g, "'");
  const names = {
    'mcu universe': 'Marvel Cinematic Universe',
    "netflix's marvel universe": 'Marvel · Netflix',
    'old marvel universe': 'Marvel · Legacy TV',
    "marvel's sony universe": 'Marvel · Sony',
    'dcu': 'DC Universe (DCU)',
    'dceu': 'DC Extended Universe (DCEU)',
    "matt reeves's batman": 'The Batman · Matt Reeves',
    'dc universe [misc]': 'DC · Other stories'
  };
  if (names[key]) return names[key];
  if (category) return category.replace(/\s+Universe$/i, '').trim();
  return { movie: 'Movies · Standalone', series: 'Series · Standalone', anime: 'Anime · Standalone', video: 'Videos & Abridged', special: 'Specials · Standalone', other: 'Other titles' }[entry.kind] || 'Games';
}
export function universeGroups(entries) {
  const groups = new Map();
  for (const item of entries) {
    const name = universeName(item[1]);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(item);
  }
  const priority = ['Marvel Cinematic Universe', 'Marvel · Netflix', 'Marvel · Legacy TV', 'Marvel · Sony', 'DC Universe (DCU)', 'DC Extended Universe (DCEU)', 'The Batman · Matt Reeves', 'DC · Other stories'];
  return [...groups].map(([name, items]) => ({ name, items })).sort((a, b) => {
    const rank = name => { const i = priority.indexOf(name); return i === -1 ? name.includes('Standalone') || name === 'Videos & Abridged' || name === 'Other titles' ? 100 : 50 : i; };
    return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name);
  });
}
export function readEntry(id, data) {
  const keys = ['version', 'revision', 'kind', 'title', 'status', 'category', 'notes', 'platform', 'rating', 'progress', 'season', 'episode', 'updatedAt'];
  if (!/^entry-[a-f0-9]{32}$/.test(id) || !data || Object.keys(data).length !== keys.length || Object.keys(data).some(k => !keys.includes(k))
    || data.version !== 1 || !Number.isInteger(data.revision) || data.revision < 1 || data.revision > 1000000000
    || !kinds.includes(data.kind) || !statuses.includes(data.status)
    || typeof data.title !== 'string' || !data.title.trim() || data.title.length > 180
    || ['category', 'platform'].some(k => typeof data[k] !== 'string' || data[k].length > 100)
    || typeof data.notes !== 'string' || data.notes.length > 3000
    || !Number.isInteger(data.rating) || data.rating < 0 || data.rating > 10
    || !Number.isInteger(data.progress) || data.progress < 0 || data.progress > 100
    || ['season', 'episode'].some(k => !Number.isInteger(data[k]) || data[k] < 0 || data[k] > 50000)
    || !Number.isSafeInteger(data.updatedAt) || data.updatedAt < 0) throw new Error('This title has invalid details. Check the fields and try again.');
  return { ...data, title: data.title.trim() };
}
export const newEntry = (kind, title = '') => ({ version: 1, revision: 1, kind, title, status: 'planned', category: '', notes: '', platform: '', rating: 0, progress: 0, season: 0, episode: 0, updatedAt: 0 });
export async function entryId(entry) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(entryKey(entry)));
  return 'entry-' + [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
export function parseList(text, domain) {
  if (typeof text !== 'string' || text.length > 2000000) throw new Error('Choose a text or JSON list smaller than 2 MB.');
  let entries;
  if (text.trim().startsWith('{')) {
    const data = JSON.parse(text);
    if (data.version !== 1 || !Array.isArray(data[domain])) throw new Error('This file does not contain the selected library.');
    entries = data[domain];
  } else {
    entries = []; let kind = domain === 'games' ? 'game' : 'other', category = '', finishedGames = false;
    for (let line of text.split(/\r?\n/)) {
      line = line.trim();
      if (!line || /^-{5,}$/.test(line)) continue;
      if (domain === 'games') {
        if (/^games$/i.test(line)) continue;
        if (/^complete$/i.test(line)) { finishedGames = true; continue; }
        const match = line.match(/^([^:]+):\s*(.+)$/);
        const item = newEntry('game', match ? match[2] : line);
        item.category = match ? match[1] : ''; item.status = finishedGames ? 'completed' : 'active';
        // Keep custom setup names in notes rather than treating them as progress.
        if (/^(Action|RPG\/Strategy):/i.test(line)) {
          const split = item.title.indexOf(' - ');
          if (split !== -1) { item.notes = item.title.slice(split + 3); item.title = item.title.slice(0, split); }
        }
        entries.push(item); continue;
      }
      const heading = line.replace(/^-+\s*/, '').replace(/:$/, '').trim();
      if (/^(Anime|Series|Movies|Specials|Youtube \[Abridged\]|DC Series|Netflix Series)$/i.test(heading)) {
        kind = /anime/i.test(heading) ? 'anime' : /movies/i.test(heading) ? 'movie' : /specials/i.test(heading) ? 'special' : /youtube/i.test(heading) ? 'video' : 'series';
        if (!line.startsWith('-')) category = '';
        continue;
      }
      if (/^-{2,}\s*\S/.test(line)) { category = heading; kind = /Netflix's Marvel|Old Marvel/i.test(heading) ? 'series' : 'other'; continue; }
      line = line.replace(/^-\s*/, '');
      const match = line.match(/^(.*?)\s+-\s*(.*?)\s*$/);
      const title = match ? match[1] : line, info = match ? match[2] : '';
      const item = newEntry(/\[Movie\]/i.test(title) ? 'movie' : kind, title);
      item.category = category;
      const season = info.match(/\bS(\d+)\b/i), episode = info.match(/\bEpisode\s+(\d+)\b/i);
      if (season) item.season = Number(season[1]);
      if (episode) item.episode = Number(episode[1]);
      item.status = /complete/i.test(info) ? season ? 'paused' : 'completed' : season || episode ? 'active' : 'planned';
      item.notes = info && !(season || episode) && !/^Complete\s*!?$/i.test(info) ? `From your list: ${info}` : season && /complete/i.test(info) ? `Season ${item.season} complete. Whole series not marked finished.` : '';
      if (kind === 'other' && item.kind === 'other') item.notes = [item.notes, 'Choose a type when you review this title.'].filter(Boolean).join('\n');
      entries.push(item);
    }
  }
  if (entries.length > 300) throw new Error('Import up to 300 titles at a time.');
  const unique = new Map();
  for (const entry of entries) {
    const clean = readEntry('entry-' + '0'.repeat(32), entry);
    if (domainOf(clean) !== domain) throw new Error('Choose the list for this module.');
    unique.set(entryKey(clean), clean);
  }
  return [...unique.values()];
}
