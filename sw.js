// =====================================================================================
//  sw.js (à la racine du site) — ancien service commun, qui se retire tout seul
// =====================================================================================
//  Avant, le Suivi et l'Audit vivaient tous les deux à la racine et partageaient ce service.
//  Maintenant chaque appli a son propre dossier et son propre service (suivi/sw.js, audit/sw.js,
//  revision/sw.js). Mais les appareils qui avaient déjà l'ancien service le gardent tant qu'on ne
//  lui dit pas de partir. Cette version-ci ne fait donc qu'une chose : se désinstaller.
//  Quand tous vos appareils seront passés par le site, ce fichier pourra être supprimé.
// =====================================================================================

// Installation : on prend la main immédiatement (au lieu d'attendre que les fenêtres se ferment).
self.addEventListener("install", () => self.skipWaiting());

// Activation : le nettoyage.
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    // On jette les anciennes copies de l'ancien service, en épargnant celles des nouveaux
    // services (leurs noms commencent par suivi- ou audit-). /^(suivi|audit)-/ est un « motif » :
    // il reconnaît les noms qui COMMENCENT par « suivi- » ou « audit- ».
    for (const k of await caches.keys()) if (!/^(suivi|audit)-/.test(k)) await caches.delete(k);
    await self.registration.unregister();      // on se désinscrit : le navigateur oublie ce service
    // Chaque fenêtre ouverte du site est rechargée, pour repartir proprement sans l'ancien service.
    for (const c of await self.clients.matchAll({ type: "window" })) c.navigate(c.url);
  })());
});
