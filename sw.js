// Bump this version whenever a public app file changes; install the complete release atomically.
const prefix = `the-hub:${new URL(self.registration.scope).pathname}:`;
const cacheName = `${prefix}daily-8`;
const files = [
  './', 'index.html', 'manifest.webmanifest',
  'styles/base.css', 'styles/shell.css', 'styles/core.css', 'styles/access.css',
  'styles/panels.css', 'styles/routines.css', 'styles/routine-tools.css', 'styles/notes.css', 'styles/motion.css',
  'core-progress.js', 'core-transition.js', 'notes.js', 'interface.js', 'interface-sound.js',
  'pointer-effects.js', 'experience.js', 'install.js', 'routines.js', 'routine-model.mjs',
  'routine-tools.js', 'workspace-model.mjs', 'cloud.js', 'cloud-notes.js', 'notes-model.mjs', 'firebase-config.mjs', 'routines.demo.json',
  'assets/fonts/orbitron-latin.woff2', 'assets/fonts/rajdhani-latin-600.woff2',
  'assets/icons/hub-180.png', 'assets/icons/hub-192.png', 'assets/icons/hub-512.png',
  'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js'
].map(file => new URL(file, self.registration.scope).href);
const publicFiles = new Set(files);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    try { await cache.addAll(files.map(url => new Request(url, { cache: 'reload' }))); }
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
    return await cache.match(url.href) || fetch(event.request);
  })());
});
