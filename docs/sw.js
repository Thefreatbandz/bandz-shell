/* Bandz Shell service worker — offline PWA for the SHELL only.
   Game/WASM cores are heavy and stream on demand (never cached). */
const V = 'bandz-shell-v1';
const CORE = ['./', 'index.html', 'app.js', 'manifest.json', 'icon.svg', 'stackz.json'];
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(V).then((c) => Promise.all(CORE.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).catch(() => caches.match('index.html')))
  );
});
