/* Service worker – Audit civil et fiscal (hors ligne) */
const VERSION = 'acf-v1';
const LOCAL = ['./gp.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];
const CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js'
];
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(LOCAL);
    await Promise.all(CDN.map((u) => c.add(new Request(u, { mode: 'cors' })).catch(() => {})));
    self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Page : réseau d'abord (mises à jour), cache si hors ligne
  if (req.mode === 'navigate' || url.pathname.endsWith('/gp.html')) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        const c = await caches.open(VERSION); c.put('./gp.html', res.clone());
        return res;
      } catch (err) {
        return (await caches.match('./gp.html')) || Response.error();
      }
    })());
    return;
  }
  // Bibliothèques, polices, icônes : cache d'abord
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') { const c = await caches.open(VERSION); c.put(req, res.clone()); }
      return res;
    } catch (err) {
      return Response.error();
    }
  })());
});
