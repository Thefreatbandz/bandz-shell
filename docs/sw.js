/* Bandz Shell service worker — offline PWA for the SHELL only.
   Game/WASM cores are heavy and stream on demand (never cached).
   v2: network-first for the shell core so updates actually reach
   installed phones; cache-first for everything else. */
const V = 'bandz-shell-v2';
const CORE = ['./', 'index.html', 'app.js', 'manifest.json', 'icon.svg', 'stackz.json'];
const NETWORK_FIRST = ['', 'index.html', 'app.js', 'stackz.json'];
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
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  const tail = url.pathname.split('/').pop();
  if (NETWORK_FIRST.indexOf(tail) !== -1) {
    // shell core: try network, refresh the cache, fall back to cache offline
    e.respondWith(
      fetch(e.request).then((r) => {
        const copy = r.clone();
        caches.open(V).then((c) => c.put(e.request, copy)).catch(() => {});
        return r;
      }).catch(() => caches.match(e.request).then((hit) => hit || caches.match('index.html')))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).catch(() => caches.match('index.html')))
  );
});
