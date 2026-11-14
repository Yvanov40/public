// =====================================================================================
//  Verrou — identifiant et mot de passe pour le Suivi et les simulateurs
//  (module commun, recopié tel quel au tout début de suivi/, audit/, pvi/, succession/ et immo/,
//   entre les repères « verrou : début » et « verrou : fin ». Modifier ici, puis recopier.)
// -------------------------------------------------------------------------------------
//  Principe :
//   • l'identifiant et le mot de passe sont créés sur chaque appareil (menu ⋯ du Suivi) ;
//   • quand l'appli se verrouille (après X minutes sans utilisation, ou à la demande), toutes
//     les données des applis gardées par le navigateur — dossiers, simulations, clé GitHub —
//     sont chiffrées (AES-GCM 256 bits, clé tirée du mot de passe par PBKDF2, 600 000 tours)
//     puis effacées en clair ;
//   • à la connexion, elles sont déchiffrées et l'appli repart ;
//   • tant que c'est verrouillé, aucune des applis ne démarre : seul l'écran de connexion s'affiche.
//  Mot de passe oublié : on efface les données de l'appareil ; elles reviennent de GitHub
//  (il faut alors recoller la clé GitHub). Le fichier sur GitHub, lui, n'est pas concerné.
//  Rangement : localStorage « verrou-config » (réglages, sel, contrôle), « verrou-session » (fin de session) ;
//  IndexedDB « verrou » : le coffre chiffré, et la clé de la session ouverte (non exportable).
// =====================================================================================
(function () {
  "use strict";
  var CFG = "verrou-config", SES = "verrou-session", ESSAIS = "verrou-essais";
  // les données protégées (les préférences d'affichage restent en clair)
  var PROTEGEES = /^(suivi-gp-(donnees|github$|fichier)|audit-(dossiers|transmission)|pvi-(dossiers|etat|scenarios)|succession-dossiers|succ-dossier|immo-(dossiers|etat))/;
  var lire = function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  var cfg = lire(CFG);
  var maintenant = function () { return Date.now(); };
  var finSession = function () { return +localStorage.getItem(SES) || 0; };

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
  function deriver(identifiant, mdp, sel, tours) {
    var enc = new TextEncoder();
    var selComplet = new Uint8Array([].concat(Array.from(deb64(sel)), Array.from(enc.encode(String(identifiant).trim().toLowerCase()))));
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
  // le mot de passe est-il le bon ? (on déchiffre un petit texte de contrôle)
  function verifier(identifiant, mdp) {
    return deriver(identifiant, mdp, cfg.sel, cfg.tours).then(function (cle) {
      return dechiffrer(cle, cfg.controle).then(function (t) { if (t !== "verrou-ok") throw new Error("non"); return cle; });
    });
  }

  // ---------------------------------------------------------------- sceller / ouvrir
  function clesProtegees() { var l = []; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (PROTEGEES.test(k)) l.push(k); } return l; }
  // chiffre toutes les données protégées dans le coffre, puis les efface en clair
  function sceller(cle) {
    localStorage.setItem(SES, "0");
    var cles = clesProtegees();
    if (!cles.length) return idbEffacer("cle");
    var contenu = {}; cles.forEach(function (k) { contenu[k] = localStorage.getItem(k); });
    return idbLire("coffre").then(function (ancien) {
      // un coffre déjà là (rare : verrouillage interrompu) : on garde ce qui n'a pas été rendu
      var suite = ancien ? dechiffrer(cle, ancien).then(function (t) { var a = JSON.parse(t); for (var k in a) if (!(k in contenu)) contenu[k] = a[k]; }, function () {}) : Promise.resolve();
      return suite;
    }).then(function () { return chiffrer(cle, JSON.stringify(contenu)); })
      .then(function (boite) { return idbEcrire("coffre", boite); })
      .then(function () { cles.forEach(function (k) { localStorage.removeItem(k); }); return idbEffacer("cle"); });
  }
  // rend les données en clair et ouvre la session
  function ouvrir(cle) {
    return idbLire("coffre").then(function (boite) {
      if (!boite) return;
      return dechiffrer(cle, boite).then(function (t) {
        var contenu = JSON.parse(t);
        for (var k in contenu) localStorage.setItem(k, contenu[k]);
        return idbEffacer("coffre");
      });
    }).then(function () { return idbEcrire("cle", cle); })
      .then(function () { localStorage.setItem(SES, String(maintenant() + delai())); localStorage.removeItem(ESSAIS); });
  }
  var delai = function () { return Math.max(1, +(cfg && cfg.delai) || 15) * 60000; };

  // ---------------------------------------------------------------- styles (écran de connexion et réglages)
  var CSS = [
    ".vr-fond{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:20px;background:#0c2d39;font:15px/1.45 'IBM Plex Sans','Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c2a30}",
    ".vr-fond.voile{background:rgba(10,20,25,.5)}",
    ".vr-carte{background:#fbfaf7;width:min(400px,100%);border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.35);padding:26px 24px 22px;display:grid;gap:12px;max-height:92vh;overflow:auto}",
    ".vr-carte h1,.vr-carte h2{margin:0;font:600 24px/1.2 'EB Garamond',Georgia,serif;color:#0c2d39}.vr-carte h2{font-size:21px}",
    ".vr-logo{width:52px;height:52px;border-radius:14px;background:#0c2d39;display:grid;place-items:center;color:#e3c27f;font-size:26px}",
    ".vr-carte p{margin:0;font-size:13px;color:#7c7466}",
    ".vr-carte label{display:grid;gap:4px;font-size:12.5px;color:#7c7466}",
    ".vr-carte input,.vr-carte select{font:inherit;font-size:16px;padding:11px 12px;border:1px solid #d9d2c4;border-radius:11px;background:#fff;color:#1c2a30;width:100%;box-sizing:border-box}",
    ".vr-carte input:focus{outline:2px solid #e3c27f;border-color:#a77d2f}",
    ".vr-bt{font:inherit;font-size:15px;border:1px solid #d9d2c4;background:#fff;color:#0c2d39;border-radius:11px;padding:11px 14px;cursor:pointer}",
    ".vr-bt.plein{background:#0c2d39;border-color:#0c2d39;color:#fff;font-weight:600}.vr-bt.rouge{color:#b4473b}",
    ".vr-bt:disabled{opacity:.5;cursor:wait}",
    ".vr-lien{border:0;background:none;color:#7c7466;font:inherit;font-size:13px;text-decoration:underline;cursor:pointer;justify-self:start;padding:0}",
    ".vr-erreur{color:#b4473b!important;font-weight:600}",
    ".vr-ok{color:#2f7d5b!important;font-weight:600}",
    ".vr-sep{border-top:1px solid #e2dacb;margin:4px 0}",
    "@media (prefers-color-scheme:dark){.vr-carte{background:#16262d;color:#e8e3d9}.vr-carte h1,.vr-carte h2{color:#9cc3d1}.vr-carte input,.vr-carte select,.vr-bt{background:#0f1b20;border-color:#27404a;color:#e8e3d9}.vr-bt.plein{background:#3d6f80;border-color:#3d6f80}}"
  ].join("\n");
  function poserStyle(doc) { var s = doc.createElement("style"); s.textContent = CSS; (doc.head || doc.documentElement).appendChild(s); }
  function el(tag, attrs, enfants) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) { if (k.slice(0, 2) === "on") e[k] = attrs[k]; else if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k]); }
    [].concat(enfants || []).forEach(function (c) { if (c != null && c !== false) e.append(c); });
    return e;
  }

  // ---------------------------------------------------------------- l'écran de connexion
  function ecranConnexion() {
    var NOMS = { suivi: "Suivi des dossiers", audit: "Audit civil et fiscal", pvi: "Plus-value immobilière", succession: "Simulateur de succession", immo: "Investissement immobilier" };
    var dossier = (location.pathname.match(/\/([a-z]+)\/(?:index\.html)?$/) || [])[1];
    var titre = NOMS[dossier] || "Mes applis";
    document.documentElement.innerHTML = "<head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1'><title></title></head><body style='margin:0'></body>";
    document.title = titre + " · connexion";
    poserStyle(document);
    var essais = lire(ESSAIS) || { n: 0, jusqua: 0 };
    var champId = el("input", { type: "text", autocomplete: "username", autocapitalize: "none", spellcheck: "false" });
    var champMdp = el("input", { type: "password", autocomplete: "current-password" });
    var msg = el("p", { "aria-live": "polite" });
    var bt = el("button", { type: "submit", class: "vr-bt plein" }, "Se connecter");
    var form = el("form", { class: "vr-carte" }, [
      el("div", { class: "vr-logo", "aria-hidden": "true" }, "🔒"),
      el("h1", null, titre),
      el("p", null, "Vos dossiers et simulations sont chiffrés sur cet appareil."),
      el("label", null, ["Identifiant", champId]),
      el("label", null, ["Mot de passe", champMdp]),
      msg, bt,
      el("button", { type: "button", class: "vr-lien", onclick: oubli }, "Mot de passe oublié ?")
    ]);
    form.onsubmit = function (e) {
      e.preventDefault();
      var attente = (lire(ESSAIS) || {}).jusqua || 0;
      if (attente > maintenant()) { msg.className = "vr-erreur"; msg.textContent = "Trop d'essais : réessayez dans " + Math.ceil((attente - maintenant()) / 1000) + " s."; return; }
      bt.disabled = true; msg.className = ""; msg.textContent = "Vérification…";
      verifier(champId.value, champMdp.value).then(function (cle) {
        msg.textContent = "Ouverture…";
        return ouvrir(cle).then(function () { location.reload(); });
      }, function () {
        var e2 = lire(ESSAIS) || { n: 0 }; e2.n = (e2.n || 0) + 1;
        if (e2.n >= 5) { e2.jusqua = maintenant() + 30000 * Math.pow(2, e2.n - 5); }
        localStorage.setItem(ESSAIS, JSON.stringify(e2));
        bt.disabled = false; msg.className = "vr-erreur"; msg.textContent = "Identifiant ou mot de passe incorrect."; champMdp.select();
      });
    };
    var fond = el("div", { class: "vr-fond" }, form);
    document.body.append(fond);
    setTimeout(function () { champId.focus(); }, 50);
    function oubli() {
      form.replaceChildren(
        el("h2", null, "Mot de passe oublié"),
        el("p", null, "Le mot de passe ne peut pas être retrouvé : c'est lui qui chiffre les données. Vous pouvez effacer les données de cet appareil et repartir de votre fichier sur GitHub, qui n'est pas touché."),
        el("p", null, "Il faudra recoller votre clé GitHub dans le Suivi, puis créer un nouvel identifiant et mot de passe. Les simulations déjà enregistrées dans votre fichier de suivi reviendront."),
        el("button", { type: "button", class: "vr-bt rouge", onclick: function () {
          if (!confirm("Effacer les données de cet appareil et retirer le mot de passe ?")) return;
          Promise.all([idbEffacer("coffre"), idbEffacer("cle")]).catch(function () {}).then(function () {
            clesProtegees().forEach(function (k) { localStorage.removeItem(k); });
            [CFG, SES, ESSAIS].forEach(function (k) { localStorage.removeItem(k); });
            location.reload();
          });
        } }, "Effacer les données de cet appareil"),
        el("button", { type: "button", class: "vr-bt", onclick: function () { location.reload(); } }, "Retour"));
    }
  }

  // ---------------------------------------------------------------- démarrage
  var actif = !!(cfg && cfg.actif && cfg.sel && cfg.controle);
  if (actif && maintenant() >= finSession()) {
    // verrouillé : l'appli ne démarre pas (on arrête le chargement de la page)
    try { window.stop(); } catch (e) {}
    try { document.execCommand && document.execCommand("Stop"); } catch (e) {}
    // une session restée ouverte (navigateur fermé sans verrouiller) : on chiffre ce qui traîne en clair
    idbLire("cle").then(function (cle) { return cle ? sceller(cle) : null; }).catch(function () {})
      .then(ecranConnexion).catch(function () {});
    window.Verrou = { actif: true, verrouille: true };
    return;
  }

  // ---------------------------------------------------------------- session ouverte : on suit l'activité
  var dernier = 0;
  function activite() {
    if (!actif) return;
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
  if (actif) {
    ["pointerdown", "keydown", "wheel", "touchstart"].forEach(function (ev) { addEventListener(ev, activite, { passive: true, capture: true }); });
    setInterval(function () { if (maintenant() >= finSession()) verrouiller(); }, 20000);
    document.addEventListener("visibilitychange", function () { if (!document.hidden && maintenant() >= finSession()) verrouiller(); });
    // une autre fenêtre a verrouillé
    addEventListener("storage", function (e) { if (e.key === SES && maintenant() >= finSession()) location.reload(); });
  }

  // ---------------------------------------------------------------- réglages (appelés depuis le menu du Suivi)
  var DELAIS = [[5, "5 minutes"], [15, "15 minutes"], [60, "1 heure"], [240, "4 heures"]];
  function selectDelai(v) { return el("select", null, DELAIS.map(function (d) { return el("option", { value: d[0], selected: +v === d[0] ? "selected" : null }, d[1]); })); }
  function reglages() {
    if (!document.getElementById("vr-style")) { var s = document.createElement("style"); s.id = "vr-style"; s.textContent = CSS; document.head.appendChild(s); }
    var fond = el("div", { class: "vr-fond voile", onclick: function (e) { if (e.target === fond) fond.remove(); } });
    var carte = el("div", { class: "vr-carte", role: "dialog", "aria-modal": "true" });
    fond.append(carte); document.body.append(fond);
    var fermer = el("button", { type: "button", class: "vr-bt", onclick: function () { fond.remove(); } }, "Fermer");
    var msg = el("p", { "aria-live": "polite" });
    function erreur(t) { msg.className = "vr-erreur"; msg.textContent = t; }
    function ok(t) { msg.className = "vr-ok"; msg.textContent = t; }
    function occupe(b, oui) { b.disabled = oui; }
    if (!actif) {
      var id = el("input", { type: "text", autocomplete: "username", autocapitalize: "none", spellcheck: "false" });
      var m1 = el("input", { type: "password", autocomplete: "new-password" }), m2 = el("input", { type: "password", autocomplete: "new-password" });
      var d = selectDelai(15);
      var bt = el("button", { type: "button", class: "vr-bt plein" }, "Activer");
      bt.onclick = function () {
        if (id.value.trim().length < 3) return erreur("Identifiant : 3 caractères au moins.");
        if (m1.value.length < 8) return erreur("Mot de passe : 8 caractères au moins.");
        if (m1.value !== m2.value) return erreur("Les deux mots de passe ne sont pas identiques.");
        occupe(bt, true); msg.className = ""; msg.textContent = "Création…";
        var sel = b64(crypto.getRandomValues(new Uint8Array(16))), tours = 600000;
        deriver(id.value, m1.value, sel, tours).then(function (cle) {
          return chiffrer(cle, "verrou-ok").then(function (controle) {
            cfg = { actif: true, sel: sel, tours: tours, delai: +d.value, controle: { iv: controle.iv, ct: b64(controle.ct) }, cree: new Date().toISOString() };
            localStorage.setItem(CFG, JSON.stringify(cfg));
            return idbEcrire("cle", cle);
          });
        }).then(function () {
          actif = true; localStorage.setItem(SES, String(maintenant() + delai()));
          ok("C'est activé. L'appli se verrouillera après " + d.selectedOptions[0].textContent + " sans utilisation.");
          carte.replaceChildren(el("h2", null, "Identifiant et mot de passe"), msg, el("p", null, "Notez-les en lieu sûr : ils ne peuvent pas être retrouvés."), fermer);
          setTimeout(function () { location.reload(); }, 2500);
        }, function (e) { occupe(bt, false); erreur("Impossible : " + e.message); });
      };
      carte.append(el("h2", null, "Identifiant et mot de passe"),
        el("p", null, "Sur cet appareil, l'appli demandera un identifiant et un mot de passe. Après un temps sans utilisation, elle se verrouille : vos dossiers, simulations et votre clé GitHub sont alors chiffrés dans le navigateur."),
        el("p", null, "Ils sont propres à chaque appareil : refaites ce réglage sur votre téléphone et vos autres ordinateurs (vous pouvez reprendre les mêmes)."),
        el("label", null, ["Identifiant", id]), el("label", null, ["Mot de passe (8 caractères au moins)", m1]), el("label", null, ["Confirmez le mot de passe", m2]),
        el("label", null, ["Verrouiller après", d]), msg, bt, fermer);
      setTimeout(function () { id.focus(); }, 50);
      return;
    }
    // déjà activé : délai, verrouiller, changer, retirer
    var d2 = selectDelai(cfg.delai);
    d2.onchange = function () { cfg.delai = +d2.value; localStorage.setItem(CFG, JSON.stringify(cfg)); localStorage.setItem(SES, String(maintenant() + delai())); ok("Délai enregistré."); };
    var idA = el("input", { type: "text", autocomplete: "username", autocapitalize: "none" }), mA = el("input", { type: "password", autocomplete: "current-password" });
    var n1 = el("input", { type: "password", autocomplete: "new-password" }), n2 = el("input", { type: "password", autocomplete: "new-password" });
    var btChanger = el("button", { type: "button", class: "vr-bt" }, "Changer le mot de passe");
    btChanger.onclick = function () {
      if (n1.value.length < 8) return erreur("Nouveau mot de passe : 8 caractères au moins.");
      if (n1.value !== n2.value) return erreur("Les deux nouveaux mots de passe ne sont pas identiques.");
      occupe(btChanger, true); msg.className = ""; msg.textContent = "Vérification…";
      verifier(idA.value, mA.value).then(function () {
        var sel = b64(crypto.getRandomValues(new Uint8Array(16)));
        return deriver(idA.value, n1.value, sel, cfg.tours).then(function (cle) {
          return chiffrer(cle, "verrou-ok").then(function (c) {
            cfg.sel = sel; cfg.controle = { iv: c.iv, ct: b64(c.ct) }; localStorage.setItem(CFG, JSON.stringify(cfg));
            return idbEcrire("cle", cle);
          });
        });
      }).then(function () { occupe(btChanger, false); [mA, n1, n2].forEach(function (x) { x.value = ""; }); ok("Mot de passe changé."); },
        function () { occupe(btChanger, false); erreur("Identifiant ou mot de passe actuel incorrect."); });
    };
    var btRetirer = el("button", { type: "button", class: "vr-bt rouge" }, "Retirer la protection");
    btRetirer.onclick = function () {
      occupe(btRetirer, true);
      verifier(idA.value, mA.value).then(function () {
        if (!confirm("Retirer l'identifiant et le mot de passe sur cet appareil ?")) { occupe(btRetirer, false); return; }
        return Promise.all([idbEffacer("cle"), idbEffacer("coffre")]).then(function () { [CFG, SES, ESSAIS].forEach(function (k) { localStorage.removeItem(k); }); location.reload(); });
      }, function () { occupe(btRetirer, false); erreur("Saisissez d'abord votre identifiant et votre mot de passe actuels."); });
    };
    carte.append(el("h2", null, "Identifiant et mot de passe"),
      el("p", null, "Protection active sur cet appareil."),
      el("button", { type: "button", class: "vr-bt plein", onclick: verrouiller }, "🔒 Verrouiller maintenant"),
      el("label", null, ["Verrouiller après", d2]),
      el("div", { class: "vr-sep" }),
      el("p", null, "Pour changer le mot de passe ou retirer la protection :"),
      el("label", null, ["Identifiant", idA]), el("label", null, ["Mot de passe actuel", mA]),
      el("label", null, ["Nouveau mot de passe", n1]), el("label", null, ["Confirmez le nouveau", n2]),
      msg, btChanger, btRetirer, fermer);
  }
  window.Verrou = { actif: actif, verrouille: false, reglages: reglages, verrouiller: verrouiller };
})();
