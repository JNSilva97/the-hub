// Bump this version whenever a public app file changes; install the complete release atomically.
const prefix = `the-hub:${new URL(self.registration.scope).pathname}:`;
const cacheName = `${prefix}calendar-options-1`;
const files = [
  'fitness.js', 'fitness-model.mjs', 'cloud-fitness.js', 'styles/fitness.css',
  'calendar.js', 'calendar-model.mjs', 'cloud-calendar.js', 'styles/calendar.css',
  './', 'index.html', 'manifest.webmanifest', 'health.js', 'styles/health.css', 'addiction.js', 'styles/addiction.css', 'habits-model.mjs', 'cloud-habits.js', 'checklist-picker.js',
  'styles/base.css', 'styles/shell.css', 'styles/core.css', 'styles/access.css',
  'styles/panels.css', 'styles/routines.css', 'styles/routine-tools.css', 'styles/notes.css', 'styles/motion.css',
  'core-progress.js', 'notes.js', 'interface.js', 'interface-sound.js',
  'pointer-effects.js', 'experience.js', 'install.js', 'routines.js', 'routine-model.mjs',
  'routine-tools.js', 'workspace-model.mjs', 'cloud.js', 'cloud-health.js', 'cloud-notes.js', 'notes-model.mjs', 'firebase-config.mjs', 'routines.demo.json',
  'assets/fonts/orbitron-latin.woff2', 'assets/fonts/rajdhani-latin-600.woff2',
  'assets/audio/interface-glide.mp3', 'assets/audio/interface-tap.mp3',
  'assets/icons/hub-180.png', 'assets/icons/hub-192.png', 'assets/icons/hub-512.png',
  'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js'
].map(file => new URL(file, self.registration.scope).href);
// The PC keeps its own clips. The public site caches only the previews it actually plays.
const local = ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(self.registration.scope).hostname);
const localAudio = local ? ['assets/audio/mixkit-startup.mp3', 'assets/audio/mixkit-open.mp3', 'assets/audio/mixkit-close.mp3']
  .map(file => new URL(file, self.registration.scope).href) : [];
const hostedAudio = new Set([914, 901, 3114].map(id => `https://assets.mixkit.co/active_storage/sfx/${id}/${id}-preview.mp3`));
const publicFiles = new Set([...files, ...localAudio, ...hostedAudio]);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    try {
      await cache.addAll(files.map(url => new Request(url, { cache: 'reload' })));
      await Promise.allSettled(localAudio.map(url => cache.add(new Request(url, { cache: 'reload' }))));
    }
    catch (error) { await caches.delete(cacheName); throw error; }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith(prefix) && key !== cacheName) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  url.search = '';
  // Never cache account requests, credentials, private files or arbitrary external responses.
  if (event.request.method !== 'GET' || !publicFiles.has(url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(url.href);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (hostedAudio.has(url.href) && response.ok && response.type === 'cors') {
      // A full cache should not interrupt playback.
      try { await cache.put(url.href, response.clone()); } catch {}
    }
    return response;
  })());
});
