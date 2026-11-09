// Ancien service commun (racine) : remplacé par un service propre à chaque appli (suivi/, audit/, revision/).
// Il se retire de lui-même et vide ses copies.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!/^(suivi|audit)-/.test(k)) await caches.delete(k);
    await self.registration.unregister();
    for (const c of await self.clients.matchAll({ type: "window" })) c.navigate(c.url);
  })());
});
