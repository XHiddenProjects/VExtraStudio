/* Vextra Studio – offline shell for the browser / phone version (installed with "Add to Home Screen").
   Same-origin files are served from the cache and refreshed in the background, so the app opens instantly and keeps working without a connection.
   Projects live in the browser's own storage and are never touched here. Bump CACHE with every release. */
const CACHE = 'vextra-4.7.0';
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', 'index.html', 'manifest.webmanifest', 'icon.png']).catch(() => {}))); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k.startsWith('vextra-')).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.includes('/__ext') || u.pathname.includes('/api/') || r.headers.has('range')) return;
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(r, { ignoreSearch: false });
    const net = fetch(r).then((res) => { if (res && res.ok && res.type === 'basic') c.put(r, res.clone()); return res; }).catch(() => null);
    return hit || (await net) || new Response('Offline', { status: 503, statusText: 'Offline' });
  }));
});
