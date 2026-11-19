/* Service worker : Révision disponible hors connexion.
   Le réseau d'abord (les nouveaux QCM arrivent tout de suite), la copie gardée si pas de connexion. */
const VERSION = 'revision-v10';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'data/qcm/index.json',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('revision-') && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const memoire = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (url.origin !== location.origin && !memoire) return;
  const cle = url.origin === location.origin ? url.pathname : req.url;   // sans « ?t=… »
  e.respondWith(fetch(req).then(r => {
    if (r.ok) { const copie = r.clone(); caches.open(VERSION).then(c => c.put(cle, copie)); }
    return r;
  }).catch(async () => (await caches.match(cle)) || (req.mode === 'navigate' ? caches.match('index.html') : new Response('', { status: 504 }))));
});
