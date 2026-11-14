// =====================================================================================
//  Verrou — un compte (identifiant + mot de passe) pour ouvrir le Suivi depuis n'importe quel appareil
//  (module commun, recopié tel quel au tout début de suivi/, audit/, pvi/, succession/ et immo/,
//   entre les repères « verrou : début » et « verrou : fin ». Modifier ici, puis recopier.)
// -------------------------------------------------------------------------------------
//  Le site est public, mais il ne contient aucune donnée : le fichier de suivi est dans un dépôt
//  GitHub privé, qu'on ne lit qu'avec une clé d'accès GitHub. Le compte sert à retrouver cette clé :
//   • le fichier « suivi/comptes/<empreinte de l'identifiant>.json », publié avec le site, contient
//     les réglages GitHub (dont la clé) CHIFFRÉS avec le mot de passe (AES-GCM 256 bits, clé tirée
//     du mot de passe et de l'identifiant par PBKDF2, 600 000 tours). Sans le mot de passe, il est illisible ;
//   • à la connexion, l'appli télécharge ce fichier, le déchiffre, et se branche sur GitHub ;
//   • le Suivi demande toujours la connexion ; les simulateurs, dès qu'un compte a servi sur l'appareil ;
//   • après X minutes sans utilisation (ou « Se déconnecter »), tout ce que le navigateur garde
//     (dossiers, simulations, clé GitHub) est chiffré avec la même clé, puis effacé en clair.
//  Mot de passe oublié : il ne peut pas être retrouvé ; on recrée le compte à partir de la clé GitHub.
//  Rangement : localStorage « verrou-config » (compte, sel, contrôle, délai), « verrou-session » (fin de session) ;
//  IndexedDB « verrou » : le coffre chiffré, et la clé de la session ouverte (non exportable).
// =====================================================================================
(function () {
  "use strict";
  var CFG = "verrou-config", SES = "verrou-session", ESSAIS = "verrou-essais", GH = "suivi-gp-github";
  // les données protégées (les préférences d'affichage restent en clair)
  var PROTEGEES = /^(suivi-gp-(donnees|github$|fichier)|audit-(dossiers|transmission)|pvi-(dossiers|etat|scenarios)|succession-dossiers|succ-dossier|immo-(dossiers|etat))/;
  var TOURS = 600000;
  var lire = function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  var cfg = lire(CFG);
  var maintenant = function () { return Date.now(); };
  var finSession = function () { return +localStorage.getItem(SES) || 0; };
  var delai = function () { return Math.max(1, +(cfg && cfg.delai) || 15) * 60000; };
  // où est publié le site (ex. yvanov40.github.io/public/…) : pour écrire le fichier du compte
  var SITE = (function () {
    var p = location.pathname.split("/").filter(Boolean);
    return { proprietaire: location.hostname.split(".")[0], depot: location.hostname.endsWith("github.io") ? p[0] : null };
  })();
  var DOSSIER_COMPTES = "../suivi/comptes/";

  // ---------------------------------------------------------------- petite base IndexedDB
  function base() {
    return new Promise(function (ok, ko) {
      var r = indexedDB.open("verrou", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("kv"); };
      r.onsuccess = function () { ok(r.result); }; r.onerror = function () { ko(r.error); };
    });
  }
  function idb(mode, fn) {
    return base().then(function (db) { return new Promise(function (ok, ko) {
      var t = db.transaction("kv", mode), s = t.objectStore("kv"), r = fn(s);
      t.oncomplete = function () { ok(r && r.result); db.close(); }; t.onerror = function () { ko(t.error); db.close(); };
    }); });
  }
  var idbLire = function (k) { return idb("readonly", function (s) { return s.get(k); }); };
  var idbEcrire = function (k, v) { return idb("readwrite", function (s) { s.put(v, k); }); };
  var idbEffacer = function (k) { return idb("readwrite", function (s) { s.delete(k); }); };

  // ---------------------------------------------------------------- chiffrement
  var b64 = function (buf) { var s = "", o = new Uint8Array(buf); for (var i = 0; i < o.length; i++) s += String.fromCharCode(o[i]); return btoa(s); };
  var deb64 = function (t) { var s = atob(t), o = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) o[i] = s.charCodeAt(i); return o; };
  var normal = function (id) { return String(id || "").trim().toLowerCase(); };
  // nom du fichier du compte : empreinte de l'identifiant (l'identifiant lui-même n'apparaît nulle part)
  function empreinte(id) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode("suivi-gp:" + normal(id))).then(function (h) {
      return Array.from(new Uint8Array(h)).map(function (x) { return x.toString(16).padStart(2, "0"); }).join("").slice(0, 32);
    });
  }
  function deriver(id, mdp, sel, tours) {
    var enc = new TextEncoder();
    var selComplet = new Uint8Array([].concat(Array.from(deb64(sel)), Array.from(enc.encode(normal(id)))));
    return crypto.subtle.importKey("raw", enc.encode(mdp), "PBKDF2", false, ["deriveKey"]).then(function (k) {
      return crypto.subtle.deriveKey({ name: "PBKDF2", salt: selComplet, iterations: tours, hash: "SHA-256" }, k, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    });
  }
  function chiffrer(cle, texte) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, cle, new TextEncoder().encode(texte)).then(function (ct) { return { iv: b64(iv), ct: ct }; });
  }
  function dechiffrer(cle, boite) {
    var ct = typeof boite.ct === "string" ? deb64(boite.ct) : boite.ct;
    return crypto.subtle.decrypt({ name: "AES-GCM", iv: deb64(boite.iv) }, cle, ct).then(function (b) { return new TextDecoder().decode(b); });
  }

  // ---------------------------------------------------------------- le fichier du compte (publié avec le site)
  // { v: 1, sel, tours, iv, ct }  — ct = réglages GitHub chiffrés
  function lireCompteDistant(hash) {
    return fetch(DOSSIER_COMPTES + hash + ".json", { cache: "no-store" }).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("reseau");
      return r.json();
    });
  }
  // écrire le fichier du compte dans le dépôt du site, avec la clé GitHub si elle y a accès
  function publierCompte(hash, contenu, gh) {
    if (!SITE.depot || !gh || !gh.cle) return Promise.reject(new Error("droits"));
    var url = "https://api.github.com/repos/" + SITE.proprietaire + "/" + SITE.depot + "/contents/suivi/comptes/" + hash + ".json";
    var ent = { "Authorization": "Bearer " + gh.cle, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    return fetch(url, { headers: ent, cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
      .then(function (exist) {
        var corps = { message: "Compte du Suivi : mise à jour", content: btoa(JSON.stringify(contenu, null, 1)) };
        if (exist && exist.sha) corps.sha = exist.sha;
        return fetch(url, { method: "PUT", headers: Object.assign({ "Content-Type": "application/json" }, ent), body: JSON.stringify(corps) });
      }).then(function (r) { if (!r.ok) throw new Error(r.status === 403 || r.status === 404 ? "droits" : "code " + r.status); });
  }
  function supprimerCompteDistant(hash, gh) {
    if (!SITE.depot || !gh || !gh.cle) return Promise.reject(new Error("droits"));
    var url = "https://api.github.com/repos/" + SITE.proprietaire + "/" + SITE.depot + "/contents/suivi/comptes/" + hash + ".json";
    var ent = { "Authorization": "Bearer " + gh.cle, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    return fetch(url, { headers: ent, cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (exist) {
      if (!exist) return;
      return fetch(url, { method: "DELETE", headers: Object.assign({ "Content-Type": "application/json" }, ent), body: JSON.stringify({ message: "Compte du Suivi : suppression", sha: exist.sha }) })
        .then(function (r) { if (!r.ok) throw new Error("droits"); });
    });
  }
  // fabrique le fichier du compte : les réglages GitHub chiffrés avec le mot de passe
  function fabriquerCompte(id, mdp, gh) {
    var sel = b64(crypto.getRandomValues(new Uint8Array(16)));
    return deriver(id, mdp, sel, TOURS).then(function (cle) {
      return chiffrer(cle, JSON.stringify(gh)).then(function (b) { return { cle: cle, contenu: { v: 1, sel: sel, tours: TOURS, iv: b.iv, ct: b64(b.ct) } }; });
    });
  }

  // ---------------------------------------------------------------- sceller / ouvrir les données de l'appareil
  function clesProtegees() { var l = []; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (PROTEGEES.test(k)) l.push(k); } return l; }
  function sceller(cle) {
    localStorage.setItem(SES, "0");
    var cles = clesProtegees();
    if (!cles.length) return idbEffacer("cle");
    var contenu = {}; cles.forEach(function (k) { contenu[k] = localStorage.getItem(k); });
    return idbLire("coffre").then(function (ancien) {
      return ancien ? dechiffrer(cle, ancien).then(function (t) { var a = JSON.parse(t); for (var k in a) if (!(k in contenu)) contenu[k] = a[k]; }, function () {}) : null;
    }).then(function () { return chiffrer(cle, JSON.stringify(contenu)); })
      .then(function (boite) { return idbEcrire("coffre", boite); })
      .then(function () { cles.forEach(function (k) { localStorage.removeItem(k); }); return idbEffacer("cle"); });
  }
  function ouvrirSession(cle) {
    return idbLire("coffre").then(function (boite) {
      if (!boite) return;
      return dechiffrer(cle, boite).then(function (t) {
        var contenu = JSON.parse(t);
        for (var k in contenu) localStorage.setItem(k, contenu[k]);
      }, function () { /* coffre d'un autre compte ou d'un ancien mot de passe : illisible, on repart de GitHub */ })
        .then(function () { return idbEffacer("coffre"); });
    }).then(function () { return idbEcrire("cle", cle); })
      .then(function () { localStorage.setItem(SES, String(maintenant() + delai())); localStorage.removeItem(ESSAIS); });
  }
  function effacerAppareil() {
    return Promise.all([idbEffacer("coffre"), idbEffacer("cle")]).catch(function () {}).then(function () {
      clesProtegees().forEach(function (k) { localStorage.removeItem(k); });
      [CFG, SES, ESSAIS].forEach(function (k) { localStorage.removeItem(k); });
    });
  }

  // ---------------------------------------------------------------- se connecter
  //  1. si ce compte a déjà servi ici : vérification sur l'appareil (marche hors connexion) ;
  //  2. sinon (ou si le mot de passe a changé ailleurs) : on télécharge le fichier du compte.
  function connecter(id, mdp) {
    return empreinte(id).then(function (hash) {
      var local = cfg && cfg.compte === hash && cfg.sel ? deriver(id, mdp, cfg.sel, cfg.tours).then(function (cle) {
        return dechiffrer(cle, cfg.controle).then(function (t) { return { cle: cle, gh: JSON.parse(t) }; });
      }) : Promise.reject(new Error("pas ici"));
      return local.catch(function () {
        return lireCompteDistant(hash).then(function (compte) {
          if (!compte) throw new Error("inconnu");
          return deriver(id, mdp, compte.sel, compte.tours || TOURS).then(function (cle) {
            return dechiffrer(cle, compte).then(function (t) {
              var autre = cfg && (cfg.compte !== hash || cfg.sel !== compte.sel);
              cfg = { actif: true, compte: hash, sel: compte.sel, tours: compte.tours || TOURS, controle: { iv: compte.iv, ct: compte.ct }, delai: (cfg && cfg.delai) || 15 };
              localStorage.setItem(CFG, JSON.stringify(cfg));
              // un autre compte (ou un ancien mot de passe) avait servi ici : on ne garde rien de lui
              var menage = autre ? Promise.all([idbEffacer("coffre"), idbEffacer("cle")]).then(function () { clesProtegees().forEach(function (k) { localStorage.removeItem(k); }); }) : Promise.resolve();
              return menage.then(function () { return { cle: cle, gh: JSON.parse(t) }; });
            });
          });
        });
      });
    }).then(function (r) {
      return ouvrirSession(r.cle).then(function () {
        // réglages GitHub : ceux du compte (on garde la date d'expiration notée par le Suivi si c'est la même clé)
        var ici = lire(GH);
        localStorage.setItem(GH, JSON.stringify(Object.assign({}, r.gh, ici && ici.cle === r.gh.cle && ici.expiration ? { expiration: ici.expiration } : {})));
        localStorage.removeItem("suivi-gp-github-pause");
      });
    });
  }

  // ---------------------------------------------------------------- styles
  var CSS = [
    ".vr-fond{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:20px;background:#0c2d39;font:15px/1.45 'IBM Plex Sans','Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c2a30;overflow:auto}",
    ".vr-fond.voile{background:rgba(10,20,25,.5)}",
    ".vr-carte{background:#fbfaf7;width:min(420px,100%);border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.35);padding:26px 24px 22px;display:grid;gap:12px;max-height:92vh;overflow:auto}",
    ".vr-carte h1,.vr-carte h2{margin:0;font:600 24px/1.2 'EB Garamond',Georgia,serif;color:#0c2d39}.vr-carte h2{font-size:21px}",
    ".vr-logo{width:52px;height:52px;border-radius:14px;background:#0c2d39;display:grid;place-items:center;color:#e3c27f;font-size:26px}",
    ".vr-carte p{margin:0;font-size:13px;color:#7c7466}",
    ".vr-carte label{display:grid;gap:4px;font-size:12.5px;color:#7c7466}",
    ".vr-carte input,.vr-carte select{font:inherit;font-size:16px;padding:11px 12px;border:1px solid #d9d2c4;border-radius:11px;background:#fff;color:#1c2a30;width:100%;box-sizing:border-box}",
    ".vr-carte input:focus{outline:2px solid #e3c27f;border-color:#a77d2f}",
    ".vr-bt{font:inherit;font-size:15px;border:1px solid #d9d2c4;background:#fff;color:#0c2d39;border-radius:11px;padding:11px 14px;cursor:pointer;text-align:center;text-decoration:none}",
    ".vr-bt.plein{background:#0c2d39;border-color:#0c2d39;color:#fff;font-weight:600}.vr-bt.rouge{color:#b4473b}",
    ".vr-bt:disabled{opacity:.5;cursor:wait}",
    ".vr-lien{border:0;background:none;color:#7c7466;font:inherit;font-size:13px;text-decoration:underline;cursor:pointer;justify-self:start;padding:0}",
    ".vr-erreur{color:#b4473b!important;font-weight:600}.vr-ok{color:#2f7d5b!important;font-weight:600}",
    ".vr-sep{border-top:1px solid #e2dacb;margin:4px 0}",
    ".vr-encart{background:#f3e9d4;border-radius:10px;padding:10px 12px;display:grid;gap:8px}",
    "@media (prefers-color-scheme:dark){.vr-carte{background:#16262d;color:#e8e3d9}.vr-carte h1,.vr-carte h2{color:#9cc3d1}.vr-carte input,.vr-carte select,.vr-bt{background:#0f1b20;border-color:#27404a;color:#e8e3d9}.vr-bt.plein{background:#3d6f80;border-color:#3d6f80}.vr-encart{background:#3a3020}}"
  ].join("\n");
  function poserStyle() { if (document.getElementById("vr-style")) return; var s = document.createElement("style"); s.id = "vr-style"; s.textContent = CSS; (document.head || document.documentElement).appendChild(s); }
  function el(tag, attrs, enfants) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) { if (k.slice(0, 2) === "on") e[k] = attrs[k]; else if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k]); }
    [].concat(enfants || []).forEach(function (c) { if (c != null && c !== false) e.append(c); });
    return e;
  }
  var NOMS = { suivi: "Suivi des dossiers", audit: "Audit civil et fiscal", pvi: "Plus-value immobilière", succession: "Simulateur de succession", immo: "Investissement immobilier" };
  var dossierApp = (location.pathname.match(/\/([a-z]+)\/(?:index\.html)?$/) || [])[1];
  var estSuivi = dossierApp === "suivi";

  // ---------------------------------------------------------------- l'écran de connexion
  function ecranConnexion() {
    var titre = NOMS[dossierApp] || "Mes applis";
    document.documentElement.innerHTML = "<head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'><title></title></head><body style='margin:0'></body>";
    document.title = titre + " · connexion";
    poserStyle();
    var champId = el("input", { type: "text", autocomplete: "username", autocapitalize: "none", spellcheck: "false" });
    var champMdp = el("input", { type: "password", autocomplete: "current-password" });
    var msg = el("p", { "aria-live": "polite" });
    var bt = el("button", { type: "submit", class: "vr-bt plein" }, "Se connecter");
    var form = el("form", { class: "vr-carte" }, [
      el("div", { class: "vr-logo", "aria-hidden": "true" }, "🔒"),
      el("h1", null, titre),
      el("p", null, "Connectez-vous pour accéder à vos dossiers."),
      el("label", null, ["Identifiant", champId]),
      el("label", null, ["Mot de passe", champMdp]),
      msg, bt,
      el("button", { type: "button", class: "vr-lien", onclick: aide }, "Mot de passe oublié ou première connexion ?")
    ]);
    form.onsubmit = function (e) {
      e.preventDefault();
      var attente = (lire(ESSAIS) || {}).jusqua || 0;
      if (attente > maintenant()) { msg.className = "vr-erreur"; msg.textContent = "Trop d'essais : réessayez dans " + Math.ceil((attente - maintenant()) / 1000) + " s."; return; }
      if (!champId.value.trim() || !champMdp.value) { msg.className = "vr-erreur"; msg.textContent = "Saisissez votre identifiant et votre mot de passe."; return; }
      bt.disabled = true; msg.className = ""; msg.textContent = "Vérification…";
      connecter(champId.value, champMdp.value).then(function () { msg.textContent = "Ouverture…"; location.reload(); }, function (er) {
        bt.disabled = false; msg.className = "vr-erreur";
        if (er && er.message === "reseau" || er instanceof TypeError) { msg.textContent = "Connexion impossible : vérifiez Internet (la première connexion sur un appareil a besoin du réseau)."; return; }
        var e2 = lire(ESSAIS) || { n: 0 }; e2.n = (e2.n || 0) + 1;
        if (e2.n >= 5) e2.jusqua = maintenant() + 30000 * Math.pow(2, e2.n - 5);
        localStorage.setItem(ESSAIS, JSON.stringify(e2));
        msg.textContent = "Identifiant ou mot de passe incorrect."; champMdp.select();
      });
    };
    document.body.append(el("div", { class: "vr-fond" }, form));
    setTimeout(function () { champId.focus(); }, 50);
    // première connexion ou mot de passe oublié : on passe par la clé GitHub
    function aide() {
      form.replaceChildren(
        el("h2", null, "Première connexion, mot de passe oublié"),
        el("p", null, "Le compte se crée (ou se recrée) à partir de votre clé d'accès GitHub, celle qui ouvre votre dépôt privé : sans elle, impossible de voir le fichier."),
        el("p", null, "Ouvrez le Suivi avec la clé GitHub, puis menu ⋯ › Identifiant et mot de passe : choisissez votre identifiant et votre (nouveau) mot de passe."),
        el("button", { type: "button", class: "vr-bt plein", onclick: function () {
          // ouverture sans compte : l'appli démarre vide, sans données ni clé ; il faudra coller la clé GitHub
          // (un compte avait servi ici : ses données chiffrées sont illisibles sans le mot de passe, on les retire)
          (actif ? effacerAppareil() : Promise.resolve()).then(function () {
            localStorage.setItem(SES, String(maintenant() + 30 * 60000));
            localStorage.setItem("verrou-sans-compte", "1");
            location.href = "../suivi/";
          });
        } }, "Ouvrir le Suivi avec ma clé GitHub"),
        actif ? el("p", null, "Les données chiffrées gardées sur cet appareil seront effacées (elles reviennent de GitHub).") : null,
        el("button", { type: "button", class: "vr-bt", onclick: function () { location.reload(); } }, "Retour"));
    }
  }

  // ---------------------------------------------------------------- démarrage
  var actif = !!(cfg && cfg.actif && cfg.sel && cfg.controle);
  var sansCompte = localStorage.getItem("verrou-sans-compte") === "1";
  // le Suivi demande toujours la connexion ; les simulateurs, dès qu'un compte a servi ici
  var exige = estSuivi || actif;
  if (exige && maintenant() >= finSession()) {
    try { window.stop(); } catch (e) {}
    localStorage.removeItem("verrou-sans-compte");
    idbLire("cle").then(function (cle) { return cle ? sceller(cle) : null; }).catch(function () {})
      .then(ecranConnexion).catch(function () {});
    window.Verrou = { actif: actif, verrouille: true };
    return;
  }

  // ---------------------------------------------------------------- session ouverte : on suit l'activité
  var dernier = 0;
  function activite() {
    var t = maintenant();
    if (t - dernier < 15000) return;
    dernier = t;
    if (t < finSession()) localStorage.setItem(SES, String(t + delai()));
  }
  function verrouiller() {
    return idbLire("cle").then(function (cle) { return cle ? sceller(cle) : (localStorage.setItem(SES, "0"), null); })
      .catch(function () { localStorage.setItem(SES, "0"); })
      .then(function () { location.reload(); });
  }
  if (exige) {
    ["pointerdown", "keydown", "wheel", "touchstart"].forEach(function (ev) { addEventListener(ev, activite, { passive: true, capture: true }); });
    setInterval(function () { if (maintenant() >= finSession()) verrouiller(); }, 20000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden && maintenant() >= finSession()) verrouiller(); });
    addEventListener("storage", function (e) { if (e.key === SES && maintenant() >= finSession()) location.reload(); });
  }

  // ---------------------------------------------------------------- réglages du compte (menu ⋯ du Suivi)
  var DELAIS = [[5, "5 minutes"], [15, "15 minutes"], [60, "1 heure"], [240, "4 heures"]];
  function selectDelai(v) { return el("select", null, DELAIS.map(function (d) { return el("option", { value: d[0], selected: +v === d[0] ? "selected" : null }, d[1]); })); }
  // après publication impossible (clé GitHub sans accès au dépôt du site) : on donne le fichier à déposer
  function encartDepot(hash, contenu) {
    var blob = new Blob([JSON.stringify(contenu, null, 1)], { type: "application/json" });
    var lienFichier = el("a", { class: "vr-bt plein", href: URL.createObjectURL(blob), download: hash + ".json" }, "1. Télécharger le fichier du compte");
    var lienDepot = SITE.depot ? el("a", { class: "vr-bt", href: "https://github.com/" + SITE.proprietaire + "/" + SITE.depot + "/upload/main/suivi/comptes", target: "_blank", rel: "noopener" }, "2. Le déposer sur GitHub (dossier suivi/comptes)") : null;
    return el("div", { class: "vr-encart" }, [
      el("p", null, "Votre clé GitHub n'a pas le droit d'écrire dans le dépôt du site : déposez vous-même le fichier du compte (il est chiffré, rien n'y est lisible)."),
      lienFichier, lienDepot,
      el("p", null, "Sur GitHub : glissez le fichier tel quel, puis « Commit changes ». Il sera actif une minute plus tard.")]);
  }
  function reglages() {
    poserStyle();
    var fond = el("div", { class: "vr-fond voile", onclick: function (e) { if (e.target === fond) fond.remove(); } });
    var carte = el("div", { class: "vr-carte", role: "dialog", "aria-modal": "true" });
    fond.append(carte); document.body.append(fond);
    var fermer = el("button", { type: "button", class: "vr-bt", onclick: function () { fond.remove(); } }, "Fermer");
    var msg = el("p", { "aria-live": "polite" });
    var erreur = function (t) { msg.className = "vr-erreur"; msg.textContent = t; };
    var ok = function (t) { msg.className = "vr-ok"; msg.textContent = t; };
    var gh = lire(GH);
    if (!actif) {
      if (!gh || !gh.cle) {
        carte.append(el("h2", null, "Identifiant et mot de passe"),
          el("p", null, "Branchez d'abord le Suivi sur GitHub (menu ⋯ › GitHub) avec votre clé d'accès : le compte sert justement à retrouver cette clé depuis n'importe quel appareil."), fermer);
        return;
      }
      var id = el("input", { type: "text", autocomplete: "username", autocapitalize: "none", spellcheck: "false" });
      var m1 = el("input", { type: "password", autocomplete: "new-password" }), m2 = el("input", { type: "password", autocomplete: "new-password" });
      var d = selectDelai(15);
      var bt = el("button", { type: "button", class: "vr-bt plein" }, "Créer le compte");
      bt.onclick = function () {
        if (normal(id.value).length < 3) return erreur("Identifiant : 3 caractères au moins.");
        if (m1.value.length < 12) return erreur("Mot de passe : 12 caractères au moins (le fichier du compte est public, chiffré par ce mot de passe).");
        if (m1.value !== m2.value) return erreur("Les deux mots de passe ne sont pas identiques.");
        bt.disabled = true; msg.className = ""; msg.textContent = "Création…";
        var hash;
        empreinte(id.value).then(function (h) { hash = h; return lireCompteDistant(h).catch(function () { return null; }); })
          .then(function (existe) {
            if (existe && !confirm("Ce compte existe déjà : le remplacer par ce nouveau mot de passe ?")) throw new Error("annule");
            return fabriquerCompte(id.value, m1.value, gh);
          }).then(function (f) {
            cfg = { actif: true, compte: hash, sel: f.contenu.sel, tours: f.contenu.tours, controle: { iv: f.contenu.iv, ct: f.contenu.ct }, delai: +d.value };
            localStorage.setItem(CFG, JSON.stringify(cfg)); localStorage.removeItem("verrou-sans-compte");
            actif = true;
            return idbEcrire("cle", f.cle).then(function () {
              localStorage.setItem(SES, String(maintenant() + delai()));
              return publierCompte(hash, f.contenu, gh).then(function () {
                carte.replaceChildren(el("h2", null, "Compte créé"), el("p", { class: "vr-ok" }, "Votre compte est publié. D'ici une minute, vous pourrez vous connecter depuis n'importe quel appareil avec cet identifiant et ce mot de passe."),
                  el("p", null, "Notez-les en lieu sûr : le mot de passe ne peut pas être retrouvé."), fermer);
              }, function () {
                carte.replaceChildren(el("h2", null, "Compte prêt, à déposer"), encartDepot(hash, f.contenu),
                  el("p", null, "Sur cet appareil, la connexion marche déjà."), fermer);
              });
            });
          }).catch(function (e) { bt.disabled = false; if (e.message !== "annule") erreur("Impossible : " + e.message); else msg.textContent = ""; });
      };
      carte.append(el("h2", null, "Identifiant et mot de passe"),
        el("p", null, "Avec un compte, il suffit d'un identifiant et d'un mot de passe pour ouvrir le Suivi sur n'importe quel appareil : plus besoin de recoller la clé GitHub."),
        el("p", null, "Le compte est un petit fichier publié avec le site, qui contient vos réglages GitHub chiffrés par le mot de passe. Choisissez-le long (12 caractères au moins, une phrase par exemple)."),
        el("label", null, ["Identifiant", id]), el("label", null, ["Mot de passe", m1]), el("label", null, ["Confirmez le mot de passe", m2]),
        el("label", null, ["Déconnexion automatique après", d]), msg, bt, fermer);
      setTimeout(function () { id.focus(); }, 50);
      return;
    }
    // compte actif
    var d2 = selectDelai(cfg.delai);
    d2.onchange = function () { cfg.delai = +d2.value; localStorage.setItem(CFG, JSON.stringify(cfg)); localStorage.setItem(SES, String(maintenant() + delai())); ok("Délai enregistré."); };
    var idA = el("input", { type: "text", autocomplete: "username", autocapitalize: "none" }), mA = el("input", { type: "password", autocomplete: "current-password" });
    var n1 = el("input", { type: "password", autocomplete: "new-password" }), n2 = el("input", { type: "password", autocomplete: "new-password" });
    var verifierActuel = function () {
      return empreinte(idA.value).then(function (h) {
        if (h !== cfg.compte) throw new Error("non");
        return deriver(idA.value, mA.value, cfg.sel, cfg.tours).then(function (cle) { return dechiffrer(cle, cfg.controle).then(function () { return h; }); });
      });
    };
    var btChanger = el("button", { type: "button", class: "vr-bt" }, "Changer le mot de passe");
    btChanger.onclick = function () {
      if (n1.value.length < 12) return erreur("Nouveau mot de passe : 12 caractères au moins.");
      if (n1.value !== n2.value) return erreur("Les deux nouveaux mots de passe ne sont pas identiques.");
      btChanger.disabled = true; msg.className = ""; msg.textContent = "Vérification…";
      verifierActuel().then(function (hash) {
        return fabriquerCompte(idA.value, n1.value, lire(GH) || {}).then(function (f) {
          cfg.sel = f.contenu.sel; cfg.tours = f.contenu.tours; cfg.controle = { iv: f.contenu.iv, ct: f.contenu.ct };
          localStorage.setItem(CFG, JSON.stringify(cfg));
          return idbEcrire("cle", f.cle).then(function () {
            return publierCompte(hash, f.contenu, lire(GH)).then(function () { ok("Mot de passe changé, sur tous vos appareils."); },
              function () { carte.insertBefore(encartDepot(hash, f.contenu), fermer); ok("Mot de passe changé sur cet appareil ; déposez le fichier pour les autres."); });
          });
        });
      }).then(function () { btChanger.disabled = false; [mA, n1, n2].forEach(function (x) { x.value = ""; }); },
        function () { btChanger.disabled = false; erreur("Identifiant ou mot de passe actuel incorrect."); });
    };
    var btSupprimer = el("button", { type: "button", class: "vr-bt rouge" }, "Supprimer le compte");
    btSupprimer.onclick = function () {
      verifierActuel().then(function (hash) {
        if (!confirm("Supprimer ce compte ? Il faudra de nouveau la clé GitHub pour ouvrir le Suivi.")) return;
        return supprimerCompteDistant(hash, lire(GH)).catch(function () { alert("Le fichier du compte n'a pas pu être retiré du site : supprimez « suivi/comptes/" + hash + ".json » sur GitHub."); })
          .then(function () { return Promise.all([idbEffacer("cle"), idbEffacer("coffre")]); })
          .then(function () { [CFG, ESSAIS].forEach(function (k) { localStorage.removeItem(k); }); location.reload(); });
      }, function () { erreur("Saisissez d'abord votre identifiant et votre mot de passe actuels."); });
    };
    carte.append(el("h2", null, "Votre compte"),
      el("p", null, "Vous êtes connecté. Le Suivi demandera l'identifiant et le mot de passe à la prochaine ouverture, ou après le délai ci-dessous sans utilisation."),
      el("button", { type: "button", class: "vr-bt plein", onclick: verrouiller }, "🔒 Se déconnecter"),
      el("button", { type: "button", class: "vr-bt", onclick: function () {
        if (!confirm("Se déconnecter et effacer de cet appareil les données gardées par le navigateur (elles restent sur GitHub) ? À faire sur un ordinateur qui n'est pas le vôtre.")) return;
        effacerAppareil().then(function () { location.reload(); });
      } }, "Se déconnecter et oublier cet appareil"),
      el("label", null, ["Déconnexion automatique après", d2]),
      el("div", { class: "vr-sep" }),
      el("p", null, "Pour changer le mot de passe ou supprimer le compte :"),
      el("label", null, ["Identifiant", idA]), el("label", null, ["Mot de passe actuel", mA]),
      el("label", null, ["Nouveau mot de passe", n1]), el("label", null, ["Confirmez le nouveau", n2]),
      msg, btChanger, btSupprimer, fermer);
  }
  // nouvelle clé GitHub collée dans le Suivi (l'ancienne a expiré) : on met le compte à jour, avec la clé de la session
  function majCompte(gh) {
    if (!actif) return Promise.resolve(false);
    return idbLire("cle").then(function (cle) {
      if (!cle) return false;
      return chiffrer(cle, JSON.stringify(gh)).then(function (b) {
        var contenu = { v: 1, sel: cfg.sel, tours: cfg.tours, iv: b.iv, ct: b64(b.ct) };
        cfg.controle = { iv: contenu.iv, ct: contenu.ct }; localStorage.setItem(CFG, JSON.stringify(cfg));
        return publierCompte(cfg.compte, contenu, gh).then(function () { return true; }, function () { return "deposer"; });
      });
    }).catch(function () { return false; });
  }
  window.Verrou = { actif: actif, verrouille: false, reglages: reglages, verrouiller: verrouiller, majCompte: majCompte, sansCompte: sansCompte };
})();
