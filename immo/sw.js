/* =====================================================================================
   immo/sw.js — service hors connexion du simulateur d'investissement immobilier
   Il garde une copie de l'appli sur l'appareil : elle s'ouvre même sans Internet.
   Le réseau d'abord (on a toujours la dernière version), la copie seulement hors connexion.
   ===================================================================================== */
const VERSION = "immo-v2";
const LOCAL = ["./", "./index.html", "./moteur.js", "./manifest.webmanifest", "./icone-192.png", "./icone-512.png", "./icone-maskable-512.png", "./apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await Promise.all(LOCAL.map((u) => c.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("immo-") && k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req, { cache: "no-cache" });
      // les bibliothèques d'export (vendor/) sont gardées dès leur premier usage
      if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
      return res;
    } catch (er) {
      return (await caches.match(req, { ignoreSearch: true })) || (req.mode === "navigate" ? await caches.match("./index.html") : null) || Response.error();
    }
  })());
});
