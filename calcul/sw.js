// Service de l'appli Calcul (service worker) : garde une copie des fichiers pour que l'appli
// s'ouvre sans connexion, et la rend installable. Les feuilles restent dans l'appareil (localStorage).
// Changer VERSION (calcul-v2, calcul-v3…) à chaque modification : c'est ce qui met à jour les appareils.
const VERSION = "calcul-v16";
const LOCAL = ["./", "./index.html", "./manifest.webmanifest", "./icone-192.png", "./icone-512.png", "./icone-maskable-512.png", "./vendor/jspdf.umd.min.js"];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await Promise.all(LOCAL.map((u) => c.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("calcul-") && k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

// D'abord Internet (version la plus récente), sinon la copie gardée.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req, { cache: "no-cache" });
      if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
      return res;
    } catch (err) {
      return (await caches.match(req, { ignoreSearch: true })) || (req.mode === "navigate" ? await caches.match("./index.html") : null) || Response.error();
    }
  })());
});
