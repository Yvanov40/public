// Service commun aux applis du dépôt (même adresse) : « Suivi des dossiers » (index.html) et « Audit civil et fiscal » (gp.html).
// (La « Révision de la base » a son propre service dans revision/.)
// Pages : Internet d'abord, pour recevoir les mises à jour ; la copie gardée ne sert que hors connexion.
// Bibliothèques des CDN : copie gardée d'abord. Les échanges avec GitHub ne sont jamais gardés.
const VERSION = "depot-v6";
const LOCAL = [
  "./", "./index.html", "./manifest.webmanifest", "./icone-192-v2.png", "./icone-512-v2.png", "./icone-maskable-512-v2.png",
  "./gp.html", "./manifest.json", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png"
];
const CDN = [
  "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await Promise.all(LOCAL.map((u) => c.add(u).catch(() => {})));
    await Promise.all(CDN.map((u) => c.add(new Request(u, { mode: "cors" })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname === "api.github.com") return;                       // données : toujours en direct
  if (url.origin === self.location.origin && url.pathname.includes("/revision/")) return;  // la Révision a son propre service
  // bibliothèques et polices des CDN : copie gardée d'abord
  if (url.origin !== self.location.origin) {
    if (!/cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com/.test(url.hostname)) return;
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === "opaque") (await caches.open(VERSION)).put(req, res.clone());
      return res;
    })());
    return;
  }
  // fichiers du site (pages, icônes, manifestes) : Internet d'abord, copie si hors connexion — chacun sous sa propre adresse
  e.respondWith((async () => {
    try {
      const res = await fetch(req, { cache: "no-cache" });
      if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === "navigate") return (await caches.match(url.pathname.endsWith("gp.html") ? "./gp.html" : "./index.html")) || Response.error();
      return Response.error();
    }
  })());
});
