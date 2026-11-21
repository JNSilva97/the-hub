const normalise = text => String(text || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const cleanTitle = title => title.replace(/\s*\[Movie\]\s*/gi, '').trim();
const medium = kind => kind === 'game' ? 'video game' : kind === 'movie' || kind === 'special' ? 'film' : kind === 'anime' ? 'anime television series' : kind === 'series' ? 'television series' : '';
export function artworkSearch(entry) {
  const url = new URL('https://en.wikipedia.org/w/api.php');
  url.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', generator: 'search', gsrsearch: `${cleanTitle(entry.title)} ${medium(entry.kind)}`.trim(), gsrlimit: '5', prop: 'pageimages|description|info', inprop: 'url', piprop: 'thumbnail|name', pilicense: 'any', pithumbsize: '500' });
  return url.href;
}
export function chooseArtwork(entry, pages) {
  const wanted = normalise(cleanTitle(entry.title));
  const options = [];
  for (const page of pages || []) {
    if (!page?.thumbnail?.source || !page.fullurl) continue;
    let image, source;
    try { image = new URL(page.thumbnail.source); source = new URL(page.fullurl); } catch { continue; }
    if (image.protocol !== 'https:' || !['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(image.hostname) || source.protocol !== 'https:' || source.hostname !== 'en.wikipedia.org' || !source.pathname.startsWith('/wiki/')) continue;
    const title = normalise(page.title.replace(/\s*\([^)]*\)\s*$/, ''));
    // Never turn a similar sequel, a performer or a franchise page into the cover.
    if (title !== wanted) continue;
    const context = `${page.title} ${page.description || ''}`.toLowerCase();
    if (/\b(actor|actress|politician|novel|comic book|disambiguation)\b/.test(context) && !/\b(film|series|game|anime)\b/.test(context)) continue;
    const isGame = /video game|computer game/.test(context), isShow = /television|tv series|anime|web series/.test(context), isFilm = /\bfilm\b/.test(context);
    if (entry.kind === 'game' && !isGame || entry.kind === 'series' && !isShow || entry.kind === 'anime' && !isShow || entry.kind === 'movie' && !isFilm) continue;
    if (entry.kind === 'other' && !isGame && !isShow && !isFilm) continue;
    const score = 100 + (normalise(page.title) === wanted ? 10 : 0) + (entry.kind === 'anime' && /anime/.test(context) ? 5 : 0);
    options.push({ score, url: image.href, source: source.href, title: page.title });
  }
  options.sort((a, b) => b.score - a.score);
  if (!options.length || options.length > 1 && options[0].score === options[1].score) return null;
  const { score, ...result } = options[0];
  return result;
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
      request.source.title = `Image source: ${artwork.title}`;
    }, { once: true });
    image.addEventListener('error', () => { image.remove(); request.art.dataset.artwork = 'fallback'; request.source.hidden = true; }, { once: true });
    request.art.prepend(image); image.src = artwork.url;
  }
  function pump() {
    while (active < 2 && queue.length) {
      const request = queue.shift();
      if (!request.art.isConnected || request.generation !== generation) continue;
      const key = `${request.entry.kind}:${request.entry.title}`;
      if (cache.has(key)) { apply(request, cache.get(key)); continue; }
      active++;
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 8000);
      controllers.add(controller);
      fetch(artworkSearch(request.entry), { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' }).then(response => {
        if (!response.ok) throw new Error('Image lookup unavailable.');
        return response.json();
      }).then(data => {
        if (request.generation !== generation) return;
        const artwork = chooseArtwork(request.entry, data.query?.pages);
        cache.set(key, artwork); apply(request, artwork);
      }).catch(() => { if (request.generation === generation) cache.set(key, null); }).finally(() => {
        clearTimeout(timeout); controllers.delete(controller); active--; pump();
      });
    }
  }
  return {
    observe(art, source, entry, domain) {
      const request = { art, source, entry, domain, generation };
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
