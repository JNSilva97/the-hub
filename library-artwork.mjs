const normalise = text => String(text || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const cleanTitle = title => title.replace(/\s*\[(?:Movie|Netflix)\]\s*/gi, '').replace(/\s+Remastered$/i, '').trim();
const medium = kind => kind === 'game' ? 'video game' : kind === 'movie' || kind === 'special' ? 'film' : kind === 'anime' ? 'anime television series' : kind === 'series' ? 'television series' : '';
export function artworkSearch(entry) {
  const url = new URL('https://en.wikipedia.org/w/api.php');
  url.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', generator: 'search', gsrsearch: `${cleanTitle(entry.title)} ${medium(entry.kind)}`.trim(), gsrlimit: '5', prop: 'pageimages|description|info', inprop: 'url', piprop: 'thumbnail|name', pilicense: 'any', pithumbsize: '500' });
  return url.href;
}
export function chooseArtwork(entry, pages) {
  const wanted = normalise(cleanTitle(entry.title));
  const options = [];
  for (const page of Array.isArray(pages) ? pages : []) {
    if (!page?.thumbnail?.source || !page.fullurl) continue;
    let image, source;
    try { image = new URL(page.thumbnail.source); source = new URL(page.fullurl); } catch { continue; }
    if (image.protocol !== 'https:' || !['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(image.hostname) || source.protocol !== 'https:' || source.hostname !== 'en.wikipedia.org' || !source.pathname.startsWith('/wiki/')) continue;
    const title = normalise(page.title.replace(/\s*\([^)]*\)\s*$/, ''));
    // Never turn a similar sequel, a performer or a franchise page into the cover.
    if (title !== wanted) continue;
    const context = `${page.title} ${page.description || ''}`.toLowerCase();
    if (entry.catalogueYear && !context.includes(String(entry.catalogueYear))) continue;
    if (/\b(actor|actress|politician|novel|comic book|disambiguation)\b/.test(context) && !/\b(film|series|game|anime)\b/.test(context)) continue;
    const isGame = /video game|computer game/.test(context), isShow = /television|tv series|anime|web series/.test(context), isFilm = /\bfilm\b/.test(context);
    if (!entry.iconOnly && (entry.kind === 'game' && !isGame || entry.kind === 'series' && !isShow || entry.kind === 'anime' && !isShow || entry.kind === 'movie' && !isFilm)) continue;
    if (entry.kind === 'other' && !isGame && !isShow && !isFilm && !(entry.iconOnly && /franchise|role-playing|fictional|media/.test(context))) continue;
    const score = 100 + (normalise(page.title) === wanted ? 10 : 0) + (entry.kind === 'anime' && /anime/.test(context) ? 5 : 0);
    options.push({ score, url: image.href, source: source.href, title: page.title });
  }
  options.sort((a, b) => b.score - a.score);
  if (!options.length || options.length > 1 && options[0].score === options[1].score) return null;
  const { score, ...result } = options[0];
  return { ...result, provider: 'Wikipedia' };
}

const catalogueName = title => normalise(cleanTitle(title)).replace(/^marvel s?\s+|^marvels\s+/, '').replace(/^the\s+/, '').replace(/\bpresents\s+/g, '').replace(/\s+/g, '');
function sameTitle(a, b) {
  const x = catalogueName(a), y = catalogueName(b);
  if (x === y) return true;
  if (x.length < 8 || Math.abs(x.length - y.length) > 1 || (x.match(/\d+/g) || []).join() !== (y.match(/\d+/g) || []).join()) return false;
  // Allow one spelling error, never a different sequel number.
  let previous = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const row = [i];
    for (let j = 1; j <= y.length; j++) row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    previous = row;
  }
  return previous[y.length] <= 1;
}
function aliases(entry) {
  const names = [cleanTitle(entry.title)];
  const parts = names[0].split(':');
  if (parts.length > 1 && normalise(entry.category).replace(/ universe$/, '') === normalise(parts[0])) names.push(parts.slice(1).join(':').trim());
  return names;
}
export function artworkEntry(entry) {
  const name = normalise(entry.title);
  if (name === 'avengers assemble') return { ...entry, title: 'The Avengers', kind: 'movie', catalogueId: 'tt0848228', catalogueYear: 2012 };
  if (name === 'one piece netflix') return { ...entry, title: 'One Piece', kind: 'series', catalogueId: 'tt11737520', catalogueYear: 2023 };
  if (name === 'it s always sunny philadelphia') return { ...entry, title: "It's Always Sunny in Philadelphia", kind: 'series' };
  if (name === 'casa de papel') return { ...entry, title: 'Money Heist', kind: 'series' };
  if (name === 'por do sol' && /Mist.rio do Colar/i.test(entry.notes || '')) return { ...entry, title: 'Sunset: The Mystery of the Necklace of São Cajó', kind: 'movie', catalogueId: 'tt24634274', catalogueYear: 2023 };
  if (entry.kind === 'other') {
    const hints = { venom: 'movie', 'sonic the hedgehog': 'movie', 'the boys': 'series', castlevania: 'series', 'the boys gen v': 'series', 'the boys diabolical': 'series' };
    if (hints[name]) return { ...entry, kind: hints[name] };
  }
  return entry;
}
export function chooseCatalogueArtwork(entry, metas, type) {
  const year = entry.title.match(/\((\d{4})\)/)?.[1];
  const names = aliases(entry).map(title => title.replace(/\s*\(\d{4}\)$/, ''));
  for (const meta of Array.isArray(metas) ? metas : []) {
    if (meta.type !== type || !/^tt\d+$/.test(meta.id || '') || entry.catalogueId && meta.id !== entry.catalogueId || !names.some(name => sameTitle(name, meta.name)) || year && !String(meta.releaseInfo || meta.year || '').startsWith(year)) continue;
    try {
      const url = new URL(meta.poster);
      if (url.protocol !== 'https:' || !['images.metahub.space', 'image.tmdb.org', 'm.media-amazon.com'].includes(url.hostname)) continue;
      return { url: url.href, source: `https://www.imdb.com/title/${meta.id}/`, title: meta.name, provider: 'Cinemeta' };
    } catch { /* Missing poster. */ }
  }
  return null;
}
export function chooseTvArtwork(entry, results) {
  for (const result of Array.isArray(results) ? results : []) {
    const show = result.show;
    if (!show || entry.catalogueId && show.externals?.imdb !== entry.catalogueId || !aliases(entry).some(title => sameTitle(title, show.name))) continue;
    try {
      const url = new URL(show.image?.medium || show.image?.original), source = new URL(show.url);
      if (url.protocol !== 'https:' || url.hostname !== 'static.tvmaze.com' || source.protocol !== 'https:' || source.hostname !== 'www.tvmaze.com') continue;
      return { url: url.href, source: source.href, title: show.name, provider: 'TVmaze' };
    } catch { /* Missing poster. */ }
  }
  return null;
}
export async function resolveArtwork(original, { fetcher = fetch, signal, skip = [], related = false } = {}) {
  const entry = artworkEntry(original);
  if (normalise(entry.title) === 'split fiction' && entry.kind === 'game' && !skip.includes('Steam')) return {
    url: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2001120/5a3209f496e911ff2fa6dccd58c682c89632d09b/capsule_616x353.jpg',
    source: 'https://store.steampowered.com/app/2001120/', title: 'Split Fiction', provider: 'Steam'
  };
  if (normalise(entry.title).replace(/\s/g, '') === 'labynight' && !skip.includes('World of Darkness')) return {
    url: 'https://images.ctfassets.net/u73tyf0fa8v1/1hCovFlBB754nWRCYVfiY7/c5799941aafc9ec3498e4fb8059e2b1f/worldofdarkness-streaming-la_by_night.jpg?w=500&fm=webp&q=80',
    source: 'https://www.paradoxinteractive.com/games/world-of-darkness/products/entertainment#night-falls-over-the-city-of-angels', title: 'L.A. by Night', provider: 'World of Darkness'
  };
  const get = async url => {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (signal?.aborted) return null;
      try {
        const response = await fetcher(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (response.ok) return await response.json();
        if (attempt === 0 && [429, 503].includes(response.status)) { await new Promise(resolve => setTimeout(resolve, 1500)); continue; }
        return null;
      } catch { return null; }
    }
    return null;
  };
  const relatedIcon = async () => {
    if (related || signal?.aborted) return null;
    let parent;
    if (/\s+Abridged$/i.test(entry.title)) parent = { ...entry, title: entry.title.replace(/\s+Abridged$/i, ''), kind: 'anime' };
    else if (/^pok.mon\b/i.test(entry.title) && entry.kind === 'game') parent = { ...entry, title: 'Pokémon', kind: 'other', iconOnly: true };
    else if (/[:\s]+Part\s+\d+$/i.test(entry.title)) parent = { ...entry, title: entry.title.replace(/[:\s]+Part\s+\d+$/i, ''), catalogueId: undefined };
    else if (/World of Darkness/i.test(entry.category)) parent = { ...entry, title: 'World of Darkness', kind: 'other', iconOnly: true };
    if (!parent) return null;
    const found = await resolveArtwork(parent, { fetcher, signal, skip, related: true });
    return found ? { ...found, role: 'Universe icon' } : null;
  };
  if (entry.iconOnly) {
    if (signal?.aborted || skip.includes('Wikipedia')) return null;
    const data = await get(artworkSearch(entry));
    return chooseArtwork(entry, data?.query?.pages);
  }
  if (entry.kind !== 'game' && !skip.includes('Cinemeta')) {
    const serial = ['series', 'anime', 'video'].includes(entry.kind) || entry.season > 0 || entry.episode > 0;
    const types = serial ? ['series'] : entry.kind === 'other' ? ['movie', 'series'] : ['movie'];
    const candidates = [];
    if (entry.catalogueId) {
      const type = serial ? 'series' : 'movie';
      const data = await get(`https://v3-cinemeta.strem.io/meta/${type}/${entry.catalogueId}.json`);
      const found = chooseCatalogueArtwork(entry, data?.meta ? [data.meta] : [], type);
      if (found) return found;
    }
    for (const type of types) {
      for (const title of aliases(entry)) {
        if (signal?.aborted) return null;
        const data = await get(`https://v3-cinemeta.strem.io/catalog/${type}/top/search=${encodeURIComponent(title)}.json`);
        const found = chooseCatalogueArtwork(entry, data?.metas, type);
        if (found) { candidates.push(found); break; }
      }
    }
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) return relatedIcon(); // Unsorted title with both a film and a series.
  }
  if (entry.kind !== 'game' && !['movie', 'special'].includes(entry.kind) && !skip.includes('TVmaze') && !signal?.aborted) {
    for (const title of aliases(entry)) {
      const data = await get(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(title)}`);
      const found = chooseTvArtwork(entry, data);
      if (found) return found;
    }
  }
  if (signal?.aborted || skip.includes('Wikipedia')) return relatedIcon();
  const data = await get(artworkSearch(entry));
  return chooseArtwork(entry, data?.query?.pages) || relatedIcon();
}
export function customArtwork(entry) {
  const escape = text => String(text).replace(/[\u0000-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const hue = [...entry.title].reduce((n, c) => n * 31 + c.charCodeAt(0), 0) >>> 0;
  const lines = [''];
  for (const word of entry.title.split(/\s+/)) {
    if (lines[lines.length - 1].length + word.length > 21 && lines.length < 5) lines.push('');
    lines[lines.length - 1] += (lines[lines.length - 1] ? ' ' : '') + word;
  }
  const game = entry.kind === 'game';
  const glyph = game ? '<rect x="112" y="115" width="136" height="90" rx="28"/><path d="M137 160h34m-17-17v34m45-22h1m18 12h1"/>' : '<rect x="112" y="110" width="136" height="100" rx="10"/><path d="m166 137 36 23-36 23ZM112 130h136m-103-20v20m35-20v20m35-20v20"/>';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 480"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="hsl(${hue % 360} 45% 23%)"/><stop offset="1" stop-color="#071322"/></linearGradient></defs><rect width="360" height="480" fill="url(#g)"/><circle cx="320" cy="45" r="120" fill="none" stroke="#ffffff16" stroke-width="32"/><path d="M28 28h40M28 28v40m264 384h40m0 0v-40" fill="none" stroke="#ffffff55" stroke-width="2"/><g fill="none" stroke="#daf0ff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>${lines.map((line, i) => `<text x="180" y="${275 + i * 30}" text-anchor="middle" fill="#eaf5ff" font-family="sans-serif" font-size="22" font-weight="600">${escape(line)}</text>`).join('')}<text x="180" y="447" text-anchor="middle" fill="#a8c5dc" font-family="sans-serif" font-size="10" letter-spacing="3">PERSONAL LIBRARY</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function createArtworkLoader() {
  let generation = 0, active = 0, queue = [];
  const cache = new Map(), observed = new Map(), controllers = new Set();
  const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    for (const item of entries) if (item.isIntersecting) {
      observer.unobserve(item.target);
      const request = observed.get(item.target); observed.delete(item.target);
      if (request) { queue.push(request); pump(); }
    }
  }, { rootMargin: '180px' }) : null;
  function apply(request, artwork) {
    if (!artwork || request.generation !== generation || !request.art.isConnected) return;
    const image = document.createElement('img');
    image.alt = ''; image.decoding = 'async'; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
    image.addEventListener('load', () => {
      if (request.generation !== generation || !request.art.isConnected) return;
      request.art.dataset.artwork = 'loaded';
      request.source.href = artwork.source; request.source.hidden = false;
      request.source.textContent = `${artwork.role || 'Image'} · ${artwork.provider || 'Wikipedia'}`;
      request.source.title = `Image source: ${artwork.title}`;
    }, { once: true });
    image.addEventListener('error', () => {
      image.remove(); request.art.dataset.artwork = 'fallback'; request.source.hidden = true;
      if (request.generation !== generation || !request.art.isConnected) return;
      const skip = [...(request.skip || []), artwork.provider || 'Wikipedia'];
      cache.delete(`${request.entry.kind}:${request.entry.title}`);
      queue.push({ ...request, skip }); pump();
    }, { once: true });
    request.art.prepend(image); image.src = artwork.url;
  }
  function pump() {
    while (active < 2 && queue.length) {
      const request = queue.shift();
      if (!request.art.isConnected || request.generation !== generation) continue;
      const key = `${request.entry.kind}:${request.entry.title}`;
      if (cache.has(key)) { apply(request, cache.get(key)); continue; }
      active++;
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
      controllers.add(controller);
      resolveArtwork(request.entry, { signal: controller.signal, skip: request.skip }).then(artwork => {
        if (request.generation !== generation) return;
        if (artwork) cache.set(key, artwork);
        apply(request, artwork);
      }).catch(() => { /* Leave failed lookups retryable when the list is reopened. */ }).finally(() => {
        clearTimeout(timeout); controllers.delete(controller); active--; pump();
      });
    }
  }
  return {
    observe(art, source, entry, domain) {
      const request = { art, source, entry, domain, generation };
      const fallback = document.createElement('img'); fallback.className = 'library-custom-art'; fallback.alt = ''; fallback.referrerPolicy = 'no-referrer'; fallback.loading = 'lazy'; fallback.src = customArtwork(entry);
      art.prepend(fallback); art.dataset.artwork = 'custom';
      const key = `${entry.kind}:${entry.title}`;
      if (cache.has(key)) { queueMicrotask(() => apply(request, cache.get(key))); return; }
      if (observer) { observed.set(art, request); observer.observe(art); }
      else { queue.push(request); pump(); }
    },
    resetView(domain) {
      for (const [art, request] of observed) if (request.domain === domain) { observer?.unobserve(art); observed.delete(art); }
      queue = queue.filter(request => request.domain !== domain);
    },
    clear() {
      generation++; observer?.disconnect(); observed.clear(); queue = []; cache.clear();
      for (const controller of controllers) controller.abort();
    }
  };
}
