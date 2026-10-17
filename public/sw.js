// Asset cache for repeat visits. Vite's /assets/* are content-hashed: cache-first is always safe. Other static files (basis
// transcoder, models, audio) are stale-while-revalidate. Pages, /ws and /health are never touched.
const CACHE = 'hs-assets-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || !/^\/(assets|basis|models|textures|audio)\//.test(u.pathname)) return;
  const hashed = u.pathname.startsWith('/assets/');
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(r);
    if (hit && hashed) return hit;
    const net = fetch(r).then((res) => { if (res.ok) c.put(r, res.clone()); return res; });
    return hit || net;
  }));
});
