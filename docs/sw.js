/* Bandz Shell service worker — offline PWA.
   Shell core: network-first (updates reach installed phones), cache fallback.
   Everything else same-origin (arcade engines, pages, libs): cache-first AND
   cached on fetch — so after one online visit the arcade works with no wifi.
   Game data itself lives in IndexedDB (see arcade/idb.js), not here.
   v3: engine-file caching for offline mode. */
const V = 'bandz-shell-v3';
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
  // everything else same-origin: cache-first, and cache a copy on fetch
  // so arcade engines work offline after one online visit
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
      if (r && r.ok) {
        const copy = r.clone();
        caches.open(V).then((c) => c.put(e.request, copy)).catch(() => {});
      }
      return r;
    }).catch(() => caches.match('index.html')))
  );
});
