// =====================================================================================
//  Disposition commune — le même bouton « Personnaliser » et la même barre d'exports dans les simulateurs
//  (module commun, recopié tel quel dans audit/, pvi/, succession/ et immo/, entre les repères
//   « disposition : début » et « disposition : fin ». Modifier ici, puis recopier.)
// -------------------------------------------------------------------------------------
//  • Un bouton « Personnaliser » ouvre une fenêtre à deux onglets :
//      Apparence   (couleurs, polices, thème, taille, coins : module « habillage ») ;
//      Mise en page (côte à côte, inversée, une colonne, résultats d'abord, pas à pas ; part de la
//                    colonne de saisie, largeur, navigation, densité ; nom du cabinet et logo des exports).
//  • Puis trois boutons : PowerPoint, PDF, Excel — un clic, un fichier.
//  • Les réglages valent pour toutes les applis : localStorage « applis-disposition ».
//  • Chaque appli dit (window.DISPOSITION, posé avant ce bloc) :
//      appliquer(etat)  : comment elle se met en page avec ces réglages ;
//      barre()          : { conteneur, avant, classe, classeExport, classeTexte } — où poser les boutons ;
//      exports          : { pptx, pdf, xlsx } — les fonctions qui produisent chaque fichier ;
//      titreExcel (bulle du bouton Excel), app (identifiant : la largeur de saisie est gardée par appli), defaut, sansNavigation,
//      mises (la liste des mises en page proposées), plus() (réglages en plus).
//  • Sur <html> : data-mise, data-largeur, data-nav, data-densite et la variable --part (en %).
// =====================================================================================
(function () {
  "use strict";
  var C = window.DISPOSITION;
  if (!C) return;
  var CLE = "applis-disposition";
  var DEFAUT = { mise: "cote", part: 40, largeur: "standard", nav: "barre", densite: "confortable", cabinet: "", logo: "" };
  function brut() { try { return JSON.parse(localStorage.getItem(CLE)) || {}; } catch (e) { return {}; } }
  function lire() {
    var p = brut(), r = {};
    for (var k in DEFAUT) r[k] = p[k] != null ? p[k] : (C.defaut && C.defaut[k] != null ? C.defaut[k] : DEFAUT[k]);
    // la largeur de la colonne de saisie est propre à chaque appli (les formulaires n'ont pas la même largeur)
    if (C.app) r.part = p["part-" + C.app] != null ? p["part-" + C.app] : (C.defaut && C.defaut.part) || DEFAUT.part;
    if (C.mises && C.mises.indexOf(r.mise) < 0) r.mise = C.mises[0];
    return r;
  }
  var etat = lire();
  function garder(changes) {
    var p = brut();
    for (var k in changes) p[k === "part" && C.app ? "part-" + C.app : k] = changes[k];
    try { localStorage.setItem(CLE, JSON.stringify(p)); } catch (e) { if (changes.logo) alert("Image trop lourde pour être gardée : choisissez un logo plus léger."); }
    appliquer();
  }
  function appliquer() {
    etat = lire();
    var r = document.documentElement;
    r.setAttribute("data-mise", etat.mise); r.setAttribute("data-largeur", etat.largeur); r.setAttribute("data-nav", etat.nav); r.setAttribute("data-densite", etat.densite);
    r.style.setProperty("--part", Math.max(25, Math.min(70, +etat.part || 40)) + "%");
    if (typeof C.appliquer === "function") try { C.appliquer(etat); } catch (e) { console.error(e); }
  }

  // ---------------------------------------------------------------- icônes
  var I = {
    reglages: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
    pptx: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M8 13V9M12 13V7M16 13v-2"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
    xlsx: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>'
  };

  // ---------------------------------------------------------------- la fenêtre (même cadre que « Apparence » : classes hb-*)
  var CSS = [
    ".dp-schemas{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}",
    ".dp-schema{border:1px solid var(--hb-bordure,#e2dacb);background:var(--hb-carte,#fff);border-radius:12px;padding:9px;cursor:pointer;text-align:left;display:grid;gap:5px;color:inherit;font:inherit}",
    ".dp-schema.on{outline:2px solid var(--hb-principale,#0c2d39);outline-offset:-2px}",
    ".dp-schema b{font-size:13px}.dp-schema small{font-size:11px;color:var(--hb-discret,#7c7466);line-height:1.3}",
    ".dp-mini{display:flex;gap:3px;height:30px}.dp-mini i{display:block;border-radius:3px;background:var(--hb-bordure,#d9d2c4)}.dp-mini i.r{background:var(--hb-accent,#a77d2f);opacity:.75}",
    ".dp-curseur{display:flex;align-items:center;gap:12px}.dp-curseur input{flex:1;accent-color:var(--hb-accent,#a77d2f)}.dp-curseur b{min-width:44px;text-align:right}",
    ".dp-champ{width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid var(--hb-bordure,#e2dacb);border-radius:10px;background:var(--hb-carte,#fff);font:inherit;color:inherit}",
    ".dp-logo{border:1.5px dashed var(--hb-bordure,#cfc6b4);border-radius:12px;padding:12px;text-align:center;cursor:pointer;background:none;font:inherit;color:inherit;display:grid;gap:6px;justify-items:center}",
    ".dp-logo img{max-height:56px;max-width:100%}",
    ".dp-bouton svg{width:18px;height:18px;flex:none}",
    "@media (max-width:700px){.dp-schemas{grid-template-columns:repeat(2,minmax(0,1fr))}}"
  ].join("");
  function h(tag, attrs, enfants) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) { if (k.slice(0, 2) === "on") e[k] = attrs[k]; else if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k]); }
    [].concat(enfants || []).forEach(function (x) { if (x != null && x !== false) e.append(x); });
    return e;
  }
  var MISES = {
    cote: ["Côte à côte", "Saisie à gauche, résultats à droite", [[3, ""], [2, "r"]]],
    inverse: ["Inversée", "Résultats à gauche", [[2, "r"], [3, ""]]],
    colonne: ["Une colonne", "Résultats sous la saisie", "col"],
    resultats: ["Résultats d'abord", "Une colonne, résultats en haut", "colr"],
    pas: ["Pas à pas", "Une étape à la fois", "pas"]
  };
  function mini(m) {
    var b = h("span", { class: "dp-mini" });
    var bloc = function (cls, flex, parent) { var i = h("i", { class: cls }); i.style.flex = String(flex); (parent || b).append(i); return i; };
    if (m === "col" || m === "colr") { b.style.flexDirection = "column"; b.style.gap = "2px"; bloc(m === "colr" ? "r" : "", 1); bloc(m === "colr" ? "" : "r", 1); }
    else if (m === "pas") { b.style.flexDirection = "column"; b.style.gap = "2px"; var t = h("span"); t.style.cssText = "display:flex;gap:2px;height:7px"; bloc("r", 1, t); bloc("", 1, t); bloc("", 1, t); b.append(t); bloc("", 1); }
    else m.forEach(function (x) { bloc(x[1], x[0]); });
    return b;
  }
  var voile = null;
  function panneau(onglet) {
    if (!onglet) { try { onglet = sessionStorage.getItem("applis-onglet"); } catch (e) {} }
    if (onglet === "apparence" && window.Habillage) { window.Habillage.ouvrir(); return; }
    if (!document.getElementById("dp-style")) { var s = document.createElement("style"); s.id = "dp-style"; s.textContent = CSS; document.head.appendChild(s); }
    voile = voile || h("div", { class: "hb-voile", onclick: function (e) { if (e.target === voile) voile.remove(); } });
    var c = window.Habillage && window.Habillage.etat() && window.Habillage.etat().couleurs;
    if (c) ["fond", "carte", "texte", "bordure", "section", "discret"].forEach(function (k) { if (c[k]) voile.style.setProperty("--hb-" + k, c[k]); });
    document.body.append(voile);
    dessiner();
  }
  function dessiner() {
    var e = etat;
    var choix = function (titre, cle, options) {
      return [h("p", { class: "hb-titre" }, titre), h("div", { class: "hb-choix" }, options.map(function (o) {
        return h("button", { type: "button", class: "hb-bt" + (String(e[cle]) === String(o[0]) ? " on" : ""), onclick: function () { var x = {}; x[cle] = o[0]; garder(x); dessiner(); } }, o[1]);
      }))];
    };
    var curseur = h("input", { type: "range", min: 25, max: 70, step: 1, value: e.part, "aria-label": "Part de la colonne de saisie" });
    var valeur = h("b", null, e.part + " %");
    curseur.oninput = function () { valeur.textContent = curseur.value + " %"; garder({ part: +curseur.value }); };
    var fichier = h("input", { type: "file", accept: "image/png,image/jpeg", style: "display:none" });
    fichier.onchange = function () {
      var f = fichier.files[0]; if (!f) return;
      // le logo est réduit (largeur 480 px au plus) pour rester léger
      var img = new Image(), url = URL.createObjectURL(f);
      img.onload = function () {
        var k = Math.min(1, 480 / img.width), cv = document.createElement("canvas");
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        garder({ logo: cv.toDataURL("image/png") }); dessiner();
      };
      img.src = url;
    };
    var nomCab = h("input", { type: "text", class: "dp-champ", placeholder: "Nom du cabinet", value: e.cabinet || "" });
    nomCab.onchange = function () { garder({ cabinet: nomCab.value.trim() }); };
    var mises = C.mises || Object.keys(MISES);
    var cote = e.mise === "cote" || e.mise === "inverse" || e.mise === "pas";
    var corps = [].concat(
      [h("p", { class: "hb-titre" }, "Disposition"),
       h("div", { class: "dp-schemas" }, mises.map(function (k) {
         var m = MISES[k];
         return h("button", { type: "button", class: "dp-schema" + (e.mise === k ? " on" : ""), onclick: function () { garder({ mise: k }); dessiner(); } }, [mini(m[2]), h("b", null, m[0]), h("small", null, m[1])]);
       }))],
      cote ? [h("p", { class: "hb-titre" }, "Largeur de la colonne de saisie"), h("div", { class: "dp-curseur" }, [curseur, valeur])] : [],
      choix("Largeur de la page", "largeur", [["etroite", "Étroite"], ["standard", "Standard"], ["large", "Large"], ["ecran", "Tout l'écran"]]),
      C.sansNavigation ? [] : choix("Navigation entre les étapes", "nav", [["barre", "Barre en haut"], ["laterale", "Menu latéral"], ["masquee", "Masquée"]]),
      choix("Densité", "densite", [["compacte", "Compacte"], ["confortable", "Confortable"], ["aeree", "Aérée"]]),
      [h("p", { class: "hb-titre" }, "Exports : nom du cabinet"), nomCab,
       h("p", { class: "hb-titre" }, "Exports : logo"),
       h("button", { type: "button", class: "dp-logo", onclick: function () { fichier.click(); } }, e.logo ? [h("img", { src: e.logo, alt: "" }), h("span", null, "Changer d'image")] : h("span", null, "Choisir une image (PNG ou JPG)")),
       e.logo ? h("button", { type: "button", class: "hb-lien", onclick: function () { garder({ logo: "" }); dessiner(); } }, "Retirer le logo") : null,
       fichier]);
    if (typeof C.plus === "function") { var x = C.plus(); if (x) corps.push(x); }
    corps.push(h("p", { class: "hb-aide" }, "Ces réglages valent pour tous les simulateurs, sur cet appareil."),
      h("button", { type: "button", class: "hb-lien", onclick: function () { var p = brut(); try { localStorage.setItem(CLE, JSON.stringify({ cabinet: p.cabinet || "", logo: p.logo || "" })); } catch (er) {} appliquer(); dessiner(); } }, "↺ Mise en page par défaut"));
    voile.replaceChildren(h("div", { class: "hb-fen", role: "dialog", "aria-modal": "true", "aria-label": "Personnaliser" }, [
      h("div", { class: "hb-tete" }, [
        window.Habillage ? h("div", { class: "hb-onglets", role: "tablist" }, [
          h("button", { type: "button", role: "tab", onclick: function () { voile.remove(); try { sessionStorage.setItem("applis-onglet", "apparence"); } catch (er) {} window.Habillage.ouvrir(); } }, "Apparence"),
          h("button", { type: "button", class: "on", role: "tab", "aria-selected": "true" }, "Mise en page")]) : h("b", null, "Mise en page"),
        h("button", { type: "button", class: "hb-x", "aria-label": "Fermer", onclick: function () { voile.remove(); } }, "×")]),
      h("div", { class: "hb-corps" }, corps)]));
  }

  // ---------------------------------------------------------------- la barre : Personnaliser, PowerPoint, PDF, Excel
  function installerBarre() {
    var B = C.barre && C.barre();
    if (!B || !B.conteneur) return;
    if (!document.getElementById("dp-style")) { var s = document.createElement("style"); s.id = "dp-style"; s.textContent = CSS; document.head.appendChild(s); }
    var bouton = function (id, icone, texte, titre, faire) {
      var b = h("button", { type: "button", class: (B.classe || "") + " dp-bouton", "data-dpb": id, title: titre, "aria-label": titre });
      b.innerHTML = icone + "<span" + (B.classeTexte ? ' class="' + B.classeTexte + '"' : "") + ">" + texte + "</span>";
      b.onclick = function (ev) { ev.preventDefault(); ev.stopPropagation(); faire(b); };
      return b;
    };
    var lancer = function (type) {
      return function (b) {
        var f = C.exports && C.exports[type]; if (!f || b.disabled) return;
        b.disabled = true; b.style.opacity = ".6";
        Promise.resolve().then(f).catch(function (er) { console.error(er); alert("Export impossible : " + (er && er.message || er)); })
          .then(function () { b.disabled = false; b.style.opacity = ""; });
      };
    };
    var liste = [bouton("reglages", I.reglages, "Personnaliser", "Personnaliser : apparence et mise en page", function () { panneau(); })];
    var ex = function (id, icone, texte, titre) { var b = bouton(id, icone, texte, titre, lancer(id)); if (B.classeExport) b.className = B.classeExport + " dp-bouton"; return b; };
    if (C.exports && C.exports.pptx) liste.push(ex("pptx", I.pptx, "PowerPoint", "Télécharger la présentation PowerPoint"));
    if (C.exports && C.exports.pdf) liste.push(ex("pdf", I.pdf, "PDF", "Imprimer ou enregistrer en PDF"));
    if (C.exports && C.exports.xlsx) liste.push(ex("xlsx", I.xlsx, "Excel", C.titreExcel || "Télécharger le classeur Excel"));
    liste.forEach(function (b) { if (B.avant && B.avant.parentNode === B.conteneur) B.conteneur.insertBefore(b, B.avant); else B.conteneur.append(b); });
  }

  appliquer();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { installerBarre(); appliquer(); });
  else { installerBarre(); appliquer(); }
  addEventListener("storage", function (e) { if (e.key === CLE) { appliquer(); if (voile && voile.parentNode) dessiner(); } });
  addEventListener("keydown", function (e) { if (e.key === "Escape" && voile && voile.parentNode) voile.remove(); });
  // pour les exports : le nom du cabinet et le logo
  window.Disposition = { etat: function () { return etat; }, ouvrir: panneau, appliquer: appliquer, cabinet: function () { return etat.cabinet || ""; }, logo: function () { return etat.logo || ""; } };
})();
