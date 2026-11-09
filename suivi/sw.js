// =====================================================================================
//  sw.js — le « service » de l'appli Suivi des dossiers (en anglais : service worker)
// =====================================================================================
//  Un service est un petit programme que le navigateur garde en arrière-plan pour une appli.
//  Il se place entre l'appli et Internet : chaque fois que l'appli demande un fichier
//  (sa page, une icône…), la demande passe par lui. Ici il sert à deux choses :
//    1. que l'appli s'ouvre même sans connexion (il garde une copie des fichiers) ;
//    2. que l'appli soit « installable » sur le téléphone ou l'ordinateur (le navigateur
//       exige un service pour proposer l'installation).
//  Il ne garde JAMAIS de copie de vos données : elles viennent de GitHub, en direct.
//
//  Ce fichier est enregistré par index.html (tout en bas : navigator.serviceWorker.register("sw.js")).
//  Comme il est dans le dossier suivi/, il ne s'occupe que des adresses …/public/suivi/…
// =====================================================================================

// Nom de la « boîte » où sont rangées les copies. Changer ce nom (suivi-v2, suivi-v3…)
// oblige tous les appareils à tout recopier : utile si on veut repartir sur des copies neuves.
const VERSION = "suivi-v1";

// La liste des fichiers de l'appli à copier dès l'installation, pour pouvoir s'ouvrir hors connexion.
// "./" veut dire « ce dossier-ci » (suivi/), c'est-à-dire la page d'accueil de l'appli.
const LOCAL = ["./", "./index.html", "./manifest.webmanifest", "./icone-192.png", "./icone-512.png", "./icone-maskable-512.png"];

// ---- 1. Installation : le navigateur vient de découvrir ce service (ou une nouvelle version) ----
// « addEventListener("install", …) » veut dire : « quand l'évènement install arrive, fais ceci ».
self.addEventListener("install", (e) => {
  // e.waitUntil(...) demande au navigateur d'attendre la fin du travail avant de dire « installé ».
  // « async () => { … } » est une fonction qui peut attendre (await) des opérations lentes.
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);                       // on ouvre (ou crée) la boîte de copies
    await Promise.all(LOCAL.map((u) => c.add(u).catch(() => {}))); // on copie chaque fichier de la liste ;
                                                                // .catch(() => {}) : si un fichier manque, on continue quand même
    self.skipWaiting();                                         // on prend le relais tout de suite, sans attendre
  })());                                                        // que toutes les fenêtres de l'appli soient fermées
});

// ---- 2. Activation : la nouvelle version prend la main ----
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    // caches.keys() donne la liste de toutes les boîtes de copies du site.
    // On jette les anciennes boîtes du Suivi (suivi-v0…), mais pas celles des autres applis.
    for (const k of await caches.keys()) if (k.startsWith("suivi-") && k !== VERSION) await caches.delete(k);
    await self.clients.claim();                                 // les fenêtres déjà ouvertes passent sous ce service
  })());
});

// ---- 3. Chaque demande de fichier passe par ici ----
self.addEventListener("fetch", (e) => {
  const req = e.request;                       // la demande : quelle adresse, quel type…
  if (req.method !== "GET") return;            // on ne s'occupe que des lectures (GET) ; les envois (PUT vers GitHub…)
                                               // passent sans intervention. « return » = on laisse faire le navigateur.
  const url = new URL(req.url);                // on découpe l'adresse en morceaux (site, chemin…)
  if (url.origin !== self.location.origin) return;  // autre site (GitHub, polices…) : pas de copie, toujours en direct

  // e.respondWith(...) : c'est nous qui fournissons la réponse.
  e.respondWith((async () => {
    try {
      // D'abord Internet : on va chercher la version la plus récente du fichier.
      // { cache: "no-cache" } force le navigateur à vérifier auprès du serveur (pas de vieille copie).
      const res = await fetch(req, { cache: "no-cache" });
      // Si la réponse est bonne (res.ok), on en range une copie pour la prochaine fois hors connexion.
      // res.clone() : une réponse ne peut être lue qu'une fois, on en fait donc un double.
      if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
      return res;                              // et on donne la réponse fraîche à l'appli
    } catch (err) {
      // Pas de connexion (le fetch a échoué) : on cherche la copie gardée.
      // ignoreSearch : on ignore ce qui suit le « ? » dans l'adresse.
      // Si on ne trouve rien et que c'est l'ouverture d'une page (navigate), on donne la page de l'appli.
      // Response.error() : en dernier recours, on répond « erreur ».
      return (await caches.match(req, { ignoreSearch: true })) || (req.mode === "navigate" ? await caches.match("./index.html") : null) || Response.error();
    }
  })());
});
