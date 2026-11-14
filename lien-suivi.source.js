// =====================================================================================
//  Lien avec le Suivi des dossiers — module commun, recopié tel quel dans pvi/ et succession/
//  (chaque appli reste autonome : ce bloc est collé dans sa page, entre les repères
//   « lien-suivi : début » et « lien-suivi : fin ». Modifier ici, puis recopier.)
// -------------------------------------------------------------------------------------
//  Ce qu'il fait :
//   • plusieurs simulations enregistrées dans l'appli (au lieu d'une seule) ;
//   • chacune peut être rattachée à un client du Suivi ;
//   • le Suivi lit ces simulations (même site, même mémoire du navigateur), les enregistre
//     dans suivi_gp.json (donc GitHub et vos autres appareils), et les montre dans la fiche du client ;
//   • le Suivi peut ouvrir une simulation précise : adresse « …/pvi/?ouvrir=IDENTIFIANT ».
//  Comment : l'appli garde son travail en cours dans ses propres clés (ex. « pvi-etat ») ;
//  ce module recopie ces clés dans la simulation ouverte, toutes les secondes et demie.
//  Rangement : localStorage[cle] = { courant: id, liste: { id: { nom, maj, data, client, nomFixe } }, effaces: { id: date } }
//  (même forme que les dossiers de l'Audit, « audit-dossiers-v1 »)
// =====================================================================================
(function () {
  var C = window.LIEN_SUIVI;            // réglages propres à l'appli, posés juste avant ce bloc
  if (!C) return;
  var CLE = C.cle;
  var maintenant = function () { return new Date().toISOString(); };
  var uid = function () { return "S" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); };
  function lire() {
    try { var s = JSON.parse(localStorage.getItem(CLE)); if (s && s.liste) { s.effaces = s.effaces || {}; return s; } } catch (e) {}
    return { courant: null, liste: {}, effaces: {} };
  }
  function ecrire(s) { try { localStorage.setItem(CLE, JSON.stringify(s)); } catch (e) {} }
  // le travail en cours de l'appli, tel qu'elle le range elle-même
  function natif() {
    var o = {};
    C.cles.forEach(function (k) { var v = null; try { v = JSON.parse(localStorage.getItem(k)); } catch (e) {} o[k] = v; });
    return o;
  }
  function poserNatif(data) {
    C.cles.forEach(function (k) {
      var v = data ? data[k] : null;
      try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
    });
  }
  function nomPar(rec) {
    if (rec.nomFixe) return rec.nom;
    var auto = rec.data ? C.nomAuto(rec.data) : "";
    if (auto && rec.client && auto.toLowerCase() === rec.client.toLowerCase()) auto = "";
    return rec.client ? rec.client + (auto ? " · " + auto : "") : (auto || (rec.nom !== "Nouvelle simulation" && rec.nom) || "Simulation");
  }

  // ---- 1. au démarrage, AVANT l'appli : on pose la simulation demandée (ou la dernière ouverte) ----
  var s = lire();
  var demande = null;
  try { demande = new URLSearchParams(location.search).get("ouvrir"); } catch (e) {}
  if (demande && s.liste[demande]) s.courant = demande;
  if (!s.courant || !s.liste[s.courant]) {
    // première fois : le travail en cours devient la première simulation
    var n = natif(), plein = C.cles.some(function (k) { return n[k] != null; });
    var id0 = uid();
    s.liste[id0] = { nom: "Simulation", maj: maintenant(), data: plein ? n : null };
    s.liste[id0].nom = nomPar(s.liste[id0]);
    s.courant = id0;
  }
  var courant = s.courant;
  var rec = s.liste[courant];
  if (rec.data == null && C.vierge) rec.data = C.vierge(rec);
  rec.nom = nomPar(rec);
  poserNatif(rec.data);
  ecrire(s);
  if (demande) try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
  var vu = JSON.stringify(natif());

  // ---- 2. en continu : ce que l'appli a changé part dans la simulation ouverte ----
  var parti = false;   // on change de simulation : la page va se recharger, plus rien à recopier
  function capter() {
    if (parti) return;
    var n = natif(), j = JSON.stringify(n);
    if (j === vu) return;
    vu = j;
    var s = lire(), r = s.liste[courant];
    if (!r) { if (s.effaces[courant]) return; r = { nom: "Simulation" }; }   // retirée ailleurs pendant qu'on travaillait : on la garde
    r.data = n; r.maj = maintenant(); r.nom = nomPar(r);
    s.liste[courant] = r; s.courant = courant;
    ecrire(s); majBouton();
  }
  setInterval(capter, 1500);
  addEventListener("pagehide", capter);
  document.addEventListener("visibilitychange", function () { if (document.hidden) capter(); });
  // le Suivi (ou une autre fenêtre) a écrit : client changé, ou version plus récente reçue de GitHub
  addEventListener("storage", function (e) {
    if (e.key !== CLE) return;
    var r = lire().liste[courant];
    if (r && r.data && JSON.stringify(r.data) !== vu && JSON.stringify(r.data) !== JSON.stringify(natif())) {
      capter();   // d'abord ce qu'on a en cours…
      var r2 = lire().liste[courant];
      if (r2 && JSON.stringify(r2.data) !== vu) { parti = true; poserNatif(r2.data); location.reload(); return; }   // …puis la version reçue
    }
    majBouton(); if (voile && voile.parentNode) dessiner();
  });

  // ---- 3. clients connus du Suivi (lus dans sa mémoire, sur ce navigateur) ----
  function clientsSuivi() {
    var noms = {};
    try {
      var d = JSON.parse(localStorage.getItem("suivi-gp-donnees")) || {};
      // d'abord les noms des dossiers (écrits comme dans le Suivi), puis les clients sans dossier
      (d.dossiers || []).forEach(function (x) { if (x && x.client) { var k = String(x.client).trim(); if (!noms[k.toLowerCase()]) noms[k.toLowerCase()] = k; } });
      Object.keys(d.clients || {}).forEach(function (k) { if (!noms[k.trim().toLowerCase()]) noms[k.trim().toLowerCase()] = k.trim(); });
    } catch (e) {}
    return Object.keys(noms).map(function (k) { return noms[k]; }).sort(function (a, b) { return a.localeCompare(b, "fr"); });
  }

  // ---- 4. le bouton « Simulations » et sa fenêtre ----
  var bouton = null, voile = null;
  var h = function (tag, attrs, enfants) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) { if (k === "onclick" || k === "oninput" || k === "onchange") e[k] = attrs[k]; else if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k]); }
    [].concat(enfants || []).forEach(function (c) { if (c != null && c !== false) e.append(c); });
    return e;
  };
  function majBouton() {
    if (!bouton) return;
    var r = lire().liste[courant] || {};
    bouton.querySelector(".ls-nom").textContent = r.client ? "👤 " + r.client : "Simulations";
    bouton.title = (r.nom || "Simulation") + (r.client ? " — rattachée à " + r.client : " — pas rattachée à un client");
  }
  function ouvrir(id, nouvelle) {
    capter();
    var s = lire();
    if (nouvelle) {
      id = uid();
      s.liste[id] = { nom: "Nouvelle simulation", maj: maintenant(), data: null, client: nouvelle.client || "" };
    }
    s.courant = id; ecrire(s);
    var r = s.liste[id];
    if (r.data == null && C.vierge) r.data = C.vierge(r);
    if (r.data != null) ecrire(s);
    parti = true;
    poserNatif(r.data);
    location.reload();
  }
  function dessiner() {
    var s = lire(), r = s.liste[courant] || {};
    var clients = clientsSuivi();
    var dl = h("datalist", { id: "ls-clients" }, clients.map(function (n) { return h("option", { value: n }); }));
    var champNom = h("input", { type: "text", value: r.nom || "", placeholder: "Nom de la simulation" });
    champNom.onchange = function () { var s = lire(), x = s.liste[courant]; if (!x) return; x.nom = champNom.value.trim() || nomPar(Object.assign({}, x, { nomFixe: false })); x.nomFixe = !!champNom.value.trim(); x.maj = maintenant(); ecrire(s); majBouton(); };
    var champClient = h("input", { type: "text", value: r.client || "", list: "ls-clients", placeholder: clients.length ? "Choisir un client du Suivi…" : "Nom du client" });
    var lier = function (nom) {
      var s = lire(), x = s.liste[courant]; if (!x) return;
      var connu = clients.find(function (c) { return c.toLowerCase() === nom.toLowerCase(); });
      x.client = connu || nom; x.maj = maintenant(); x.nom = nomPar(x); ecrire(s); majBouton(); dessiner();
    };
    var autres = Object.keys(s.liste).filter(function (id) { return id !== courant; })
      .sort(function (a, b) { return String(s.liste[b].maj || "").localeCompare(String(s.liste[a].maj || "")); });
    var date = function (x) { return x.maj ? new Date(x.maj).toLocaleDateString("fr-FR") : ""; };
    var fen = h("div", { class: "ls-fen", role: "dialog", "aria-modal": "true", "aria-label": "Simulations" }, [
      h("div", { class: "ls-tete" }, [h("b", null, "Simulations"), h("button", { type: "button", class: "ls-x", "aria-label": "Fermer", onclick: fermer }, "×")]),
      h("div", { class: "ls-corps" }, [
        h("p", { class: "ls-titre" }, "Simulation ouverte"),
        h("label", { class: "ls-champ" }, [h("span", null, "Nom"), champNom]),
        h("label", { class: "ls-champ" }, [h("span", null, "Client du Suivi"), champClient, dl]),
        h("div", { class: "ls-ligne-bt" }, [
          h("button", { type: "button", class: "ls-bt ls-plein", onclick: function () { var v = champClient.value.trim(); if (v) lier(v); } }, r.client ? "Changer de client" : "Rattacher"),
          r.client ? h("button", { type: "button", class: "ls-bt", onclick: function () { lier(""); } }, "Détacher") : null]),
        h("p", { class: "ls-aide" }, clients.length
          ? "La simulation apparaîtra dans la fiche du client, dans le Suivi, et sera enregistrée avec votre fichier de suivi."
          : "Ouvrez le Suivi une fois sur ce navigateur pour retrouver ici la liste de vos clients."),
        h("button", { type: "button", class: "ls-bt ls-large", onclick: function () { ouvrir(null, { client: "" }); } }, "＋ Nouvelle simulation"),
        r.client ? h("button", { type: "button", class: "ls-bt ls-large", onclick: function () { ouvrir(null, { client: r.client }); } }, "＋ Nouvelle simulation pour " + r.client) : null,
        autres.length ? h("p", { class: "ls-titre" }, "Autres simulations") : null,
        h("div", { class: "ls-liste" }, autres.map(function (id) {
          var x = s.liste[id];
          return h("div", { class: "ls-item" }, [
            h("button", { type: "button", class: "ls-ouvrir", onclick: function () { ouvrir(id); } }, [h("b", null, x.nom || "Simulation"), h("small", null, (x.client ? "👤 " + x.client + " · " : "") + date(x))]),
            h("button", { type: "button", class: "ls-suppr", title: "Supprimer", "aria-label": "Supprimer", onclick: function () {
              if (!confirm("Supprimer « " + (x.nom || "Simulation") + " » ?\nElle sera aussi retirée de votre fichier de suivi (et de vos autres appareils).")) return;
              var s = lire(); delete s.liste[id]; s.effaces[id] = maintenant(); ecrire(s); dessiner();
            } }, "🗑")]);
        }))])]);
    voile.replaceChildren(fen);
  }
  function fermer() { if (voile) voile.remove(); }
  function panneau() {
    capter();
    voile = voile || h("div", { class: "ls-voile", onclick: function (e) { if (e.target === voile) fermer(); } });
    document.body.append(voile);
    dessiner();
  }
  addEventListener("keydown", function (e) { if (e.key === "Escape" && voile && voile.parentNode) fermer(); });
  function installer() {
    var st = document.createElement("style");
    st.textContent = [
      ".ls-voile{position:fixed;inset:0;z-index:9999;background:rgba(10,20,25,.42);display:flex;align-items:flex-start;justify-content:center;padding:6vh 14px 14px;font-size:14px;line-height:1.4}",
      ".ls-fen{background:#fbfaf7;color:#1c2a30;width:min(480px,100%);max-height:86vh;display:flex;flex-direction:column;border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,.3);overflow:hidden;font-family:inherit}",
      ".ls-tete{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#0c2d39;color:#fff}.ls-tete b{font-size:17px}",
      ".ls-x{border:0;background:none;color:#fff;font-size:24px;line-height:1;cursor:pointer;padding:0 4px}",
      ".ls-corps{padding:12px 16px 16px;overflow-y:auto;display:grid;gap:8px}",
      ".ls-titre{margin:6px 0 0;font-size:11.5px;text-transform:uppercase;letter-spacing:.04em;color:#7c7466;font-weight:600}",
      ".ls-champ{display:grid;gap:3px}.ls-champ span{font-size:12px;color:#7c7466}",
      ".ls-champ input{font:inherit;font-size:15px;padding:9px 11px;border:1px solid #d9d2c4;border-radius:10px;background:#fff;color:inherit;width:100%;box-sizing:border-box}",
      ".ls-ligne-bt{display:flex;gap:8px;flex-wrap:wrap}",
      ".ls-bt{font:inherit;font-size:14px;border:1px solid #d9d2c4;background:#fff;color:#0c2d39;border-radius:10px;padding:8px 12px;cursor:pointer}",
      ".ls-plein{background:#0c2d39;border-color:#0c2d39;color:#fff}.ls-large{width:100%;text-align:left}",
      ".ls-aide{margin:0;font-size:12px;color:#7c7466}",
      ".ls-liste{display:grid;gap:6px}.ls-item{display:flex;gap:6px}",
      ".ls-ouvrir{flex:1;min-width:0;text-align:left;display:grid;gap:1px;font:inherit;border:1px solid #e2dacb;background:#fff;border-radius:10px;padding:8px 10px;cursor:pointer;color:inherit}",
      ".ls-ouvrir b{font-weight:600;color:#0c2d39;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.ls-ouvrir small{font-size:12px;color:#7c7466}",
      ".ls-suppr{width:40px;border:1px solid #e2dacb;background:#fff;border-radius:10px;cursor:pointer}",
      ".ls-bouton .ls-nom{max-width:16ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;vertical-align:bottom}",
      "@media (prefers-color-scheme: dark){.ls-fen{background:#16262d;color:#e8e3d9}.ls-champ input,.ls-bt,.ls-ouvrir,.ls-suppr{background:#0f1b20;border-color:#27404a;color:#e8e3d9}.ls-ouvrir b,.ls-bt{color:#e8e3d9}.ls-plein{background:#3d6f80;border-color:#3d6f80}}",
      "@media (max-width:700px){.ls-voile{align-items:flex-end;padding:0}.ls-fen{border-radius:18px 18px 0 0;max-height:88vh}.ls-bouton .ls-nom{display:none!important}}"
    ].join("\n");
    document.head.append(st);
    bouton = C.bouton();          // l'appli fabrique le bouton à son image
    if (!bouton) return;
    bouton.classList.add("ls-bouton");
    bouton.onclick = panneau;
    majBouton();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installer); else installer();
  window.lienSuivi = { ouvrirPanneau: panneau, courant: function () { return courant; } };
})();
