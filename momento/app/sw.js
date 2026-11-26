/* מומנטו – אפליקציית אורחים: עבודה גם כשהקליטה באולם חלשה */
const CACHE = 'momento-app-v1';
const FILES = ['./', './index.html', './app.css?v=1', './app.js?v=1', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', '../shared/base.css?v=1', '../shared/store.js?v=1'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then((r) => {
    if (r.status === 200 && new URL(e.request.url).origin === location.origin) { const c = r.clone(); caches.open(CACHE).then((cc) => cc.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))));
});
