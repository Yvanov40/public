// Service de l'appli « Suivi des dossiers » : permet l'installation et l'ouverture hors connexion.
// La page est toujours prise sur Internet en priorité (pour recevoir les mises à jour) ;
// la copie gardée ne sert que sans réseau. Les échanges avec GitHub ne sont jamais mis en cache.
const CACHE = "suivi-v1";
const FICHIERS = ["./", "./index.html", "./manifest.webmanifest", "./icone-192.png", "./icone-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((cles) => Promise.all(cles.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;  // GitHub, polices : réseau direct
  e.respondWith(
    fetch(e.request)
      .then((reponse) => {
        const copie = reponse.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copie));
        return reponse;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});
