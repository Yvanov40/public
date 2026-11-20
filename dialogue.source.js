// =====================================================================================
//  Dialogues communs — à la place des fenêtres du système (confirm, alert, prompt), peu jolies,
//  surtout dans l'application pour ordinateur. (Module commun, recopié tel quel dans chaque appli,
//  dans le <head>, entre les repères « dialogue : début » et « dialogue : fin ». Modifier ici, puis recopier.)
// -------------------------------------------------------------------------------------
//  Trois fonctions, qui rendent une promesse (on écrit « await demander(…) ») :
//    demander(message, options) → true / false        (confirm)
//        options : { ok: "Supprimer", annuler: "Annuler", titre, danger: true }
//        Sans « ok » : « Supprimer », « Effacer »… est déduit du message ; sinon « OK ».
//    avertir(message, options)  → (rien)              (alert)
//    saisir(message, valeur, options) → texte ou null (prompt)
//  Entrée valide, Échap annule, un clic à côté annule. Les couleurs suivent celles de l'appli
//  (variables --bleu, --or, --carte, --texte si elles existent ; sinon or et bleu par défaut).
// =====================================================================================
(function () {
  "use strict";
  if (window.demander) return;
  var css = ""
    + ".dlg-voile{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:16px;background:rgba(8,24,31,.42);"
    + "backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);opacity:0;transition:opacity .14s ease}"
    + ".dlg-voile.on{opacity:1}"
    + ".dlg{width:min(440px,100%);max-height:calc(100vh - 32px);overflow:auto;background:var(--carte,#fffdf8);color:var(--texte,#1d2a30);"
    + "border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.28),0 0 0 1px rgba(0,0,0,.05);padding:20px 22px 16px;"
    + "font:inherit;font-size:14.5px;line-height:1.5;transform:translateY(8px) scale(.98);transition:transform .14s ease}"
    + ".dlg-voile.on .dlg{transform:none}"
    + ".dlg h3{margin:0 0 6px;font-size:17px;font-weight:650;color:var(--bleu,#0c2d39)}"
    + ".dlg p{margin:0 0 6px;white-space:pre-wrap;overflow-wrap:anywhere}"
    + ".dlg input,.dlg textarea{width:100%;box-sizing:border-box;margin:8px 0 2px;padding:9px 12px;border:1px solid var(--bordure,#d9d2c3);border-radius:10px;"
    + "background:var(--fond,#fff);color:inherit;font:inherit;outline:none}"
    + ".dlg textarea{resize:none;line-height:1.4;display:block}"
    + ".dlg input:focus,.dlg textarea:focus{border-color:var(--or,#a57d2f);box-shadow:0 0 0 3px rgba(165,125,47,.18)}"
    + ".dlg-boutons{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;margin-top:14px}"
    + ".dlg-boutons button{border:0;border-radius:10px;padding:9px 16px;font:inherit;font-size:14px;font-weight:600;cursor:pointer}"
    + ".dlg-non{background:transparent;color:var(--bleu,#0c2d39);box-shadow:inset 0 0 0 1px var(--bordure,#d9d2c3)}"
    + ".dlg-non:hover{background:rgba(12,45,57,.06)}"
    + ".dlg-oui{background:var(--bleu,#0c2d39);color:#fff}"
    + ".dlg-oui:hover{filter:brightness(1.15)}"
    + ".dlg-oui.danger{background:#a8452f}"
    + ".dlg-boutons button:focus-visible{outline:2px solid var(--or,#a57d2f);outline-offset:2px}"
    + "@media (max-width:480px){.dlg-boutons button{flex:1 1 auto}}";
  function style() {
    if (document.getElementById("dlg-style")) return;
    var s = document.createElement("style"); s.id = "dlg-style"; s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }
  var VERBES = /^\s*(Supprimer|Effacer|Retirer|Vider|Remplacer|Écraser|Déconnecter|Réinitialiser)\b/i;
  function ouvrir(message, o, champ) {
    style();
    return new Promise(function (fin) {
      var avant = document.activeElement;
      var voile = document.createElement("div"); voile.className = "dlg-voile";
      var boite = document.createElement("div"); boite.className = "dlg"; boite.setAttribute("role", "dialog"); boite.setAttribute("aria-modal", "true");
      if (o.titre) { var h = document.createElement("h3"); h.textContent = o.titre; boite.appendChild(h); }
      var p = document.createElement("p"); p.textContent = String(message == null ? "" : message); boite.appendChild(p);
      var saisie = null;
      if (champ) {
        // zone: true → une zone de texte (textarea) : c'est le champ où les claviers Android acceptent toujours la saisie glissée
        if (o.zone) { saisie = document.createElement("textarea"); saisie.rows = 2; saisie.className = "dlg-zone"; }
        else { saisie = document.createElement("input"); saisie.type = "text"; }
        saisie.value = champ.valeur == null ? "" : String(champ.valeur); saisie.setAttribute("autocapitalize", "sentences"); boite.appendChild(saisie); }   // (pas d’autocomplete="off" : sur Android, il coupe les suggestions et la saisie glissée du clavier)
      var zone = document.createElement("div"); zone.className = "dlg-boutons";
      var non = null;
      if (o.annuler !== false) { non = document.createElement("button"); non.type = "button"; non.className = "dlg-non"; non.textContent = o.annuler || "Annuler"; zone.appendChild(non); }
      var oui = document.createElement("button"); oui.type = "button"; oui.className = "dlg-oui" + (o.danger ? " danger" : ""); oui.textContent = o.ok || "OK"; zone.appendChild(oui);
      boite.appendChild(zone); voile.appendChild(boite); document.body.appendChild(voile);
      requestAnimationFrame(function () { voile.classList.add("on"); });
      var fini = false;
      function fermer(r) {
        if (fini) return; fini = true;
        if (saisie) champ.lu = o.zone ? saisie.value.replace(/\s*\n\s*/g, " ") : saisie.value;
        document.removeEventListener("keydown", touche, true);
        voile.classList.remove("on");
        setTimeout(function () { voile.remove(); try { if (avant && avant.focus) avant.focus(); } catch (e) {} }, 140);
        fin(r);
      }
      function touche(e) {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fermer(o.annuler === false ? true : false); }
        else if (e.key === "Enter" && !e.shiftKey && (document.activeElement === saisie || !zone.contains(document.activeElement) || document.activeElement === oui)) { e.preventDefault(); e.stopPropagation(); fermer(true); }
        else if (e.key === "Tab") {   // le focus reste dans la fenêtre
          var l = [saisie, non, oui].filter(Boolean), i = l.indexOf(document.activeElement);
          e.preventDefault(); l[(i + (e.shiftKey ? l.length - 1 : 1)) % l.length].focus();
        }
      }
      document.addEventListener("keydown", touche, true);
      oui.addEventListener("click", function () { fermer(true); });
      if (non) non.addEventListener("click", function () { fermer(false); });
      voile.addEventListener("mousedown", function (e) { if (e.target === voile) fermer(o.annuler === false ? true : false); });
      setTimeout(function () { if (saisie) { saisie.focus(); saisie.select(); } else oui.focus(); }, 20);
    });
  }
  window.demander = function (message, o) {
    o = o || {};
    if (!o.ok) { var m = VERBES.exec(String(message || "")); if (m) { o.ok = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase(); if (o.danger == null) o.danger = /^(supprimer|effacer|vider|écraser)$/i.test(m[1]); } }
    return ouvrir(message, o);
  };
  window.avertir = function (message, o) { o = o || {}; o.annuler = false; return ouvrir(message, o).then(function () {}); };
  window.saisir = function (message, valeur, o) {
    o = o || {};
    var champ = { valeur: valeur };
    return ouvrir(message, o, champ).then(function (ok) {
      return ok ? champ.lu : null;
    });
  };
})();
