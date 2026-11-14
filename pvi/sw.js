/* =====================================================================================
   pvi/sw.js — service hors connexion du simulateur de plus-value immobilière
   Il garde une copie de l'appli sur l'appareil : elle s'ouvre même sans Internet.
   Pour forcer une mise à jour des copies, augmenter VERSION (pvi-v2, pvi-v3…).
   ===================================================================================== */
const VERSION = "pvi-v4";
const LOCAL = ["./", "./index.html", "./manifest.webmanifest", "./icone-192.png", "./icone-512.png", "./icone-maskable-512.png", "./apple-touch-icon.png", "./logo.svg"];
const CDN = ["https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js"];

// Installation : on met de côté les fichiers de l'appli et la bibliothèque Excel
self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await Promise.all(LOCAL.map((u) => c.add(u).catch(() => {})));
    await Promise.all(CDN.map((u) => c.add(new Request(u, { mode: "cors" })).catch(() => {})));
    self.skipWaiting();
  })());
});
// Activation : on jette les anciennes copies de CETTE appli seulement (noms en « pvi- »)
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("pvi-") && k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Bibliothèque Excel et polices : la copie gardée d'abord
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
  // Fichiers de l'appli : Internet d'abord (pour les mises à jour), la copie si hors connexion
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
