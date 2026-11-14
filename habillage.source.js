// =====================================================================================
//  Habillage commun — la même apparence et le même panneau « Apparence » dans toutes les applis
//  (module commun, recopié tel quel au début de audit/, pvi/, succession/, immo/ et revision/,
//   entre les repères « habillage : début » et « habillage : fin ». Modifier ici, puis recopier.)
// -------------------------------------------------------------------------------------
//  • Par défaut, chaque appli reprend l'apparence du Suivi des dossiers (couleurs, fond, polices,
//    thème clair ou sombre, taille d'affichage, coins, relief), lue dans la mémoire du navigateur.
//  • On peut aussi régler une apparence propre aux applis (commune à toutes) : panneau « Apparence ».
//  • Chaque appli garde ses propres noms de couleurs : window.HABILLAGE (posé juste avant ce bloc)
//    dit quelle variable CSS de l'appli reçoit quelle couleur commune, et comment s'écrit son thème.
//  Rangement : localStorage « applis-apparence » = { suivre, principale, accent, fond, texte, titres, theme, taille, coins, relief }
// =====================================================================================
(function () {
  "use strict";
  var C = window.HABILLAGE;
  if (!C) return;
  var CLE = "applis-apparence";
  var POLICES = {
    plex: ['"IBM Plex Sans", "Segoe UI", Roboto, Helvetica, Arial, sans-serif', "IBM+Plex+Sans:wght@400;500;600", "IBM Plex Sans"],
    inter: ['"Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif', "Inter:wght@400;500;600", "Inter"],
    nunito: ['"Nunito", "Segoe UI", Roboto, Helvetica, Arial, sans-serif', "Nunito:wght@400;600;700", "Nunito"],
    systeme: ['system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', "", "Celle de l'appareil"],
    lora: ['"Lora", Georgia, "Times New Roman", serif', "Lora:wght@400;500;600", "Lora"],
    garamond: ['"EB Garamond", Garamond, Georgia, "Times New Roman", serif', "EB+Garamond:wght@500;600", "EB Garamond"],
    playfair: ['"Playfair Display", Georgia, "Times New Roman", serif', "Playfair+Display:wght@500;600", "Playfair Display"],
    georgia: ['Georgia, "Times New Roman", serif', "", "Georgia"]
  };
  var FONDS = {   // en clair : fond de page, cartes, bordures, sections
    creme: { fond: "#f7f4ee", carte: "#fffdf9", bordure: "#e2dacb", section: "#efe9de" },
    blanc: { fond: "#f4f5f7", carte: "#ffffff", bordure: "#e1e4e8", section: "#e8ebef" },
    gris:  { fond: "#ecebe8", carte: "#f8f7f5", bordure: "#d6d3cc", section: "#dedbd4" }
  };
  var SOMBRE = { fond: "#0f1b20", carte: "#16262d", bordure: "#27404a", section: "#1b2e36", texte: "#e8e3d9", discret: "#9aa7a9", champ: "#0f1b20" };
  var PALETTES = [
    ["Bleu nuit et or", "#0c2d39", "#a77d2f"], ["Sapin et cuivre", "#17392b", "#b0672c"], ["Bordeaux et or", "#4a1626", "#b08a3c"],
    ["Ardoise et corail", "#27323d", "#d9634c"], ["Bleu roi et acier", "#1d3f8a", "#6f7b8c"], ["Prune et rose", "#3b2143", "#c2577d"],
    ["Noir et orange", "#1b1b1f", "#e07b1a"], ["Canard et sable", "#0f4c5c", "#c49a52"]
  ];
  var DEFAUT = { principale: "#0c2d39", accent: "#a77d2f", fond: "creme", texte: "plex", titres: "garamond", theme: "auto", taille: 100, coins: "arrondis", relief: "normal" };
  var rvb = function (h) { var n = parseInt(String(h).replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  var melange = function (a, b, part) { var x = rvb(a), y = rvb(b); return "#" + x.map(function (v, i) { return Math.round(v * (1 - part) + y[i] * part).toString(16).padStart(2, "0"); }).join(""); };
  var lireJSON = function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };

  // ---------------------------------------------------------------- les réglages : ceux du Suivi, ou ceux des applis
  function duSuivi() {
    var a = lireJSON("suivi-gp-apparence") || {}, p = a.page || {}, th = "auto";
    try { th = localStorage.getItem("suivi-gp-theme") || "auto"; } catch (e) {}
    return { principale: a.principale || DEFAUT.principale, accent: a.accent || DEFAUT.accent, fond: a.fond || DEFAUT.fond, texte: a.texte || DEFAUT.texte, titres: a.titres || DEFAUT.titres,
      theme: th, taille: +p.taille || 100, coins: p.coins || "arrondis", relief: p.relief || "normal" };
  }
  function reglages() {
    var p = lireJSON(CLE) || {};
    if (p.suivre !== false) { var s = duSuivi(); s.suivre = true; return s; }
    var r = {}; for (var k in DEFAUT) r[k] = p[k] != null ? p[k] : DEFAUT[k];
    r.suivre = false; return r;
  }
  function garder(changes) {
    var p = lireJSON(CLE) || {};
    if (changes.suivre === false && p.suivre !== false) { var s = duSuivi(); for (var k in s) if (p[k] == null) p[k] = s[k]; }   // on part de l'apparence du Suivi
    for (var c in changes) p[c] = changes[c];
    try { localStorage.setItem(CLE, JSON.stringify(p)); } catch (e) {}
    appliquer();
  }
  var tel = window.matchMedia("(max-width: 900px)"), systemeSombre = window.matchMedia("(prefers-color-scheme: dark)");
  // comme dans le Suivi : « auto » = clair sur téléphone, le réglage du système sur ordinateur
  var sombre = function (r) { return r.theme === "sombre" || (r.theme === "auto" && !tel.matches && systemeSombre.matches); };

  // ---------------------------------------------------------------- appliquer
  function appliquer() {
    var r = reglages(), nuit = sombre(r) && !C.sansSombre, f = FONDS[r.fond] || FONDS.creme;   // sansSombre : appli prévue pour le clair seulement
    // les couleurs communes, en clair ou en sombre
    var c = nuit ? {
      principale: r.principale, principaleTexte: melange(r.principale, "#ffffff", 0.6), accent: melange(r.accent, "#ffffff", 0.25), accentTexte: melange(r.accent, "#ffffff", 0.3),
      barre: melange(r.principale, "#000000", 0.55), fond: SOMBRE.fond, carte: SOMBRE.carte, champ: SOMBRE.champ, bordure: SOMBRE.bordure, section: SOMBRE.section, texte: SOMBRE.texte, discret: SOMBRE.discret
    } : {
      principale: r.principale, principaleTexte: r.principale, accent: r.accent, accentTexte: r.accent,
      barre: r.principale, fond: f.fond, carte: f.carte, champ: "#ffffff", bordure: f.bordure, section: f.section, texte: "#1c2a30", discret: "#6f6b63"
    };
    c.sans = (POLICES[r.texte] || POLICES.plex)[0];
    c.serif = (POLICES[r.titres] || POLICES.garamond)[0];
    // le thème, tel que l'appli l'écrit (data-theme="dark", "sombre"…)
    if (C.theme) {
      var el = document.documentElement;
      if (nuit) el.setAttribute(C.theme.attr, C.theme.sombre);
      else if (C.theme.clair) el.setAttribute(C.theme.attr, C.theme.clair); else el.removeAttribute(C.theme.attr);
    }
    // polices (chargées à la demande)
    [r.texte, r.titres].forEach(function (k) {
      var p = POLICES[k]; if (!p || !p[1] || document.getElementById("hb-police-" + k)) return;
      var l = document.createElement("link"); l.id = "hb-police-" + k; l.rel = "stylesheet"; l.href = "https://fonts.googleapis.com/css2?family=" + p[1] + "&display=swap";
      document.head.appendChild(l);
    });
    // les variables de l'appli reçoivent les couleurs communes (!important : elles l'emportent sur ses propres réglages)
    var css = ":root{--hb-barre:" + c.barre + ";--hb-principale:" + c.principale + ";--hb-accent:" + c.accent + ";--hb-accent-texte:" + c.accentTexte + ";--hb-sans:" + c.sans + ";--hb-serif:" + c.serif + ";color-scheme:" + (nuit ? "dark" : "light");
    for (var cle in C.vars) C.vars[cle].forEach(function (v) { if (c[cle] != null) css += ";" + v + ":" + c[cle] + " !important"; });
    css += "}";
    if (+r.taille && +r.taille !== 100) css += "html{zoom:" + (r.taille / 100) + "}";
    var cartes = C.cartes || ".carte,.card";
    if (r.coins === "droits") css += "html *:not(i):not(.point):not(input[type=radio]):not(.hb-rond){border-radius:3px!important}";
    if (r.coins === "ronds") css += ":is(" + cartes + ",button,input,select,textarea){border-radius:18px!important}";
    if (r.relief === "plat") css += "html *:not(.hb-garder-ombre){box-shadow:none!important}";
    if (r.relief === "ombres") css += ":is(" + cartes + "){box-shadow:" + (nuit ? "0 4px 14px rgba(0,0,0,.35)" : "0 1px 2px rgba(12,45,57,.08),0 4px 14px rgba(12,45,57,.10)") + "!important}";
    css += (typeof C.css === "function" ? C.css(c, nuit) : C.css || "");
    css += PANNEAU_CSS;
    var st = document.getElementById("habillage");
    if (!st) { st = document.createElement("style"); st.id = "habillage"; (document.head || document.documentElement).appendChild(st); }
    st.textContent = css;
    var meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute("content", c.barre);
    etat = { reglages: r, couleurs: c, sombre: nuit, police: (POLICES[r.texte] || POLICES.plex)[2], policeTitres: (POLICES[r.titres] || POLICES.garamond)[2] };
    if (typeof C.apres === "function") try { C.apres(etat); } catch (e) {}
  }
  var etat = null;

  // ---------------------------------------------------------------- le panneau « Apparence » (le même partout)
  var PANNEAU_CSS = [
    ".hb-voile{position:fixed;inset:0;z-index:2147482000;background:rgba(10,20,25,.45);display:flex;align-items:flex-start;justify-content:center;padding:5vh 14px 14px}",
    ".hb-fen{background:var(--hb-fond,#f7f4ee);color:var(--hb-texte,#1c2a30);width:min(560px,100%);max-height:90vh;display:flex;flex-direction:column;border-radius:16px;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.3);font:14px/1.45 var(--hb-sans)}",
    ".hb-tete{display:flex;align-items:center;gap:10px;padding:12px 16px;background:var(--hb-barre);color:#fff}.hb-tete b{flex:1;font:600 19px var(--hb-serif)}",
    ".hb-x{border:0;background:none;color:#fff;font-size:24px;line-height:1;cursor:pointer}",
    ".hb-corps{padding:14px 16px 18px;overflow-y:auto;display:grid;gap:12px}",
    ".hb-titre{margin:4px 0 -4px;font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--hb-discret,#7c7466);font-weight:600}",
    ".hb-choix{display:flex;flex-wrap:wrap;gap:6px}",
    ".hb-bt{font:inherit;font-size:13.5px;border:1px solid var(--hb-bordure,#e2dacb);background:var(--hb-carte,#fff);color:inherit;border-radius:999px;padding:7px 13px;cursor:pointer}",
    ".hb-bt.on{border-color:var(--hb-principale);background:var(--hb-principale);color:#fff;font-weight:600}",
    ".hb-pal{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}",
    ".hb-pal button{border:1px solid var(--hb-bordure,#e2dacb);background:var(--hb-carte,#fff);color:inherit;border-radius:10px;padding:7px;cursor:pointer;font:inherit;font-size:11.5px;display:grid;gap:5px;text-align:left}",
    ".hb-pal button.on{outline:2px solid var(--hb-accent);outline-offset:-2px}",
    ".hb-pal i{display:flex;height:16px;border-radius:5px;overflow:hidden}.hb-pal i span{flex:2}.hb-pal i span+span{flex:1}",
    ".hb-coul{display:grid;grid-template-columns:1fr 1fr;gap:10px}.hb-coul label{display:flex;align-items:center;gap:8px;font-size:13px}",
    ".hb-coul input{width:44px;height:32px;border:1px solid var(--hb-bordure,#e2dacb);border-radius:8px;padding:2px;background:none;cursor:pointer}",
    ".hb-suivre{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:12px;background:var(--hb-section,#efe9de);cursor:pointer}",
    ".hb-suivre input{width:20px;height:20px;margin:1px 0 0;accent-color:var(--hb-principale);flex:none}",
    ".hb-suivre small{display:block;color:var(--hb-discret,#7c7466);font-size:12px}",
    ".hb-aide{margin:0;font-size:12px;color:var(--hb-discret,#7c7466)}",
    ".hb-lien{border:0;background:none;color:var(--hb-discret,#7c7466);text-decoration:underline;cursor:pointer;font:inherit;font-size:13px;justify-self:start;padding:0}",
    "@media (max-width:700px){.hb-voile{align-items:flex-end;padding:0}.hb-fen{border-radius:18px 18px 0 0;max-height:90vh}.hb-pal{grid-template-columns:repeat(2,minmax(0,1fr))}}"
  ].join("");
  function h(tag, attrs, enfants) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) { if (k.slice(0, 2) === "on") e[k] = attrs[k]; else if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k]); }
    [].concat(enfants || []).forEach(function (x) { if (x != null && x !== false) e.append(x); });
    return e;
  }
  var voile = null;
  function panneau() {
    var c = etat.couleurs;
    voile = voile || h("div", { class: "hb-voile", onclick: function (e) { if (e.target === voile) voile.remove(); } });
    voile.style.setProperty("--hb-fond", c.fond); voile.style.setProperty("--hb-carte", c.carte); voile.style.setProperty("--hb-texte", c.texte);
    voile.style.setProperty("--hb-bordure", c.bordure); voile.style.setProperty("--hb-section", c.section); voile.style.setProperty("--hb-discret", c.discret);
    document.body.append(voile);
    dessiner();
  }
  function dessiner() {
    var r = reglages(), lib = !r.suivre;
    var choix = function (titre, cle, options) {
      return [h("p", { class: "hb-titre" }, titre), h("div", { class: "hb-choix" }, options.map(function (o) {
        return h("button", { type: "button", class: "hb-bt" + (String(r[cle]) === String(o[0]) ? " on" : ""), disabled: lib ? null : "disabled", onclick: function () { garder(ob(cle, o[0])); dessiner(); } }, o[1]);
      }))];
    };
    var ob = function (k, v) { var o = {}; o[k] = v; return o; };
    var polices = function (titre, cle, liste) { return choix(titre, cle, liste.map(function (k) { return [k, POLICES[k][2]]; })); };
    var corps = [
      h("label", { class: "hb-suivre" }, [h("input", { type: "checkbox", checked: r.suivre ? "checked" : null, onchange: function (e) { garder({ suivre: e.target.checked }); dessiner(); } }),
        h("span", null, ["Comme le Suivi des dossiers", h("small", null, r.suivre ? "Couleurs, fond, polices, thème, taille et coins viennent du Suivi (menu ⋯ › Apparence). Décochez pour régler ici une apparence propre aux applis." : "Apparence propre aux applis (Audit, Succession, Plus-value, Investissement, Révision) : elle vaut pour toutes.")])])
    ];
    if (lib) {
      corps.push(h("p", { class: "hb-titre" }, "Palettes"), h("div", { class: "hb-pal" }, PALETTES.map(function (p) {
        return h("button", { type: "button", class: r.principale.toLowerCase() === p[1] && r.accent.toLowerCase() === p[2] ? "on" : "", onclick: function () { garder({ principale: p[1], accent: p[2] }); dessiner(); } },
          [h("i", null, [h("span", { style: "background:" + p[1] }), h("span", { style: "background:" + p[2] })]), p[0]]);
      })));
      corps.push(h("div", { class: "hb-coul" }, [
        h("label", null, [h("input", { type: "color", value: r.principale, oninput: function (e) { garder({ principale: e.target.value }); } }), "Couleur principale"]),
        h("label", null, [h("input", { type: "color", value: r.accent, oninput: function (e) { garder({ accent: e.target.value }); } }), "Couleur d'accent"])]));
    }
    corps = corps.concat(
      choix("Thème", "theme", [["auto", "Automatique"], ["clair", "Clair"], ["sombre", "Sombre"]]),
      choix("Fond", "fond", [["creme", "Crème"], ["blanc", "Blanc"], ["gris", "Gris"]]),
      polices("Police du texte", "texte", ["plex", "inter", "nunito", "systeme"]),
      polices("Police des titres", "titres", ["garamond", "lora", "playfair", "georgia", "plex"]),
      choix("Taille de l'affichage", "taille", [[90, "Petite"], [100, "Normale"], [110, "Grande"], [125, "Très grande"]]),
      choix("Coins", "coins", [["arrondis", "Arrondis"], ["ronds", "Très arrondis"], ["droits", "Droits"]]),
      choix("Relief", "relief", [["plat", "Plat"], ["normal", "Normal"], ["ombres", "Ombres portées"]]));
    if (C.sansSombre) corps.push(h("p", { class: "hb-aide" }, "Cette appli reste en clair, même avec le thème sombre."));
    if (C.note) corps.push(h("p", { class: "hb-aide" }, C.note));
    if (lib) corps.push(h("button", { type: "button", class: "hb-lien", onclick: function () { try { localStorage.removeItem(CLE); } catch (e) {} garder({ suivre: true }); dessiner(); } }, "↺ Revenir à l'apparence du Suivi"));
    voile.replaceChildren(h("div", { class: "hb-fen", role: "dialog", "aria-modal": "true", "aria-label": "Apparence" }, [
      h("div", { class: "hb-tete" }, [h("b", null, "Apparence"), h("button", { type: "button", class: "hb-x", "aria-label": "Fermer", onclick: function () { voile.remove(); } }, "×")]),
      h("div", { class: "hb-corps" }, corps)]));
  }

  // ---------------------------------------------------------------- démarrage
  appliquer();
  tel.addEventListener("change", appliquer);
  systemeSombre.addEventListener("change", appliquer);
  // changement fait dans une autre fenêtre (le Suivi, ou une autre appli)
  addEventListener("storage", function (e) { if (e.key === CLE || e.key === "suivi-gp-apparence" || e.key === "suivi-gp-theme") { appliquer(); if (voile && voile.parentNode) dessiner(); } });
  // si l'appli réécrit son thème elle-même, on remet le nôtre
  if (C.theme) new MutationObserver(function () {
    var att = document.documentElement.getAttribute(C.theme.attr), voulu = etat && etat.sombre ? C.theme.sombre : (C.theme.clair || null);
    if (att !== voulu) { if (voulu == null) document.documentElement.removeAttribute(C.theme.attr); else document.documentElement.setAttribute(C.theme.attr, voulu); }
  }).observe(document.documentElement, { attributes: true, attributeFilter: [C.theme.attr] });
  function installer() {
    var b = C.bouton && C.bouton();
    if (b) { b.title = "Apparence"; b.onclick = function (e) { e.preventDefault(); e.stopPropagation(); panneau(); }; }
    appliquer();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installer); else installer();
  addEventListener("keydown", function (e) { if (e.key === "Escape" && voile && voile.parentNode) voile.remove(); });
  window.Habillage = { etat: function () { return etat; }, ouvrir: function () { panneau(); }, appliquer: appliquer };
})();
