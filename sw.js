const CACHE = 'ws-v21';
const ASSETS = ['./', 'index.html', 'app.css', 'data.js', 'calc.js', 'begriffe.js', 'app.js', 'icon.svg', 'icon-192.png', 'icon-512.png', 'manifest.json'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(a => new Request(a, { cache: 'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
// Netz zuerst, damit Updates sofort ankommen; Cache nur offline
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(res => {
    const c = res.clone(); caches.open(CACHE).then(cache => cache.put(e.request, c));
    return res;
  }).catch(() => caches.match(e.request)));
});
