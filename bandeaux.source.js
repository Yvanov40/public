// =====================================================================================
//  Bandeaux du haut et du bas — pour l'application Android / iPhone, où la page s'étend sous
//  la barre d'état (heure, batterie) et sous la barre de navigation (◁ ○ □).
//  Deux bandes de la couleur de la barre de l'appli recouvrent ces zones : rien n'y passe dessous,
//  et l'on ne clique jamais « derrière » les boutons du téléphone. Sur ordinateur ou dans un
//  navigateur, ces zones mesurent 0 : rien ne change. (Module commun, recopié tel quel dans chaque
//  appli, dans le <head>, entre les repères « bandeaux : début » et « bandeaux : fin ». Modifier ici, puis recopier.)
//  La couleur suit celle de l'en-tête de l'appli, tout de suite quand on la personnalise.
// =====================================================================================
(function () {
  "use strict";
  if (window.__bandeaux) return; window.__bandeaux = true;
  var css = ""
    // env() : navigateur et WebView récents ; --safe-area-inset-* : valeurs posées par l'application Capacitor
    + ":root{--bandeau-haut:max(env(safe-area-inset-top,0px),var(--safe-area-inset-top,0px));"
    + "--bandeau-bas:max(env(safe-area-inset-bottom,0px),var(--safe-area-inset-bottom,0px))}"
    + "html::before,html::after{content:'';position:fixed;left:0;right:0;pointer-events:none;background:var(--bandeau,var(--hb-barre,#0c2d39))}"
    + "html::before{top:0;height:var(--bandeau-haut);z-index:2147483600}"
    // en bas, sous les barres et fenêtres de l'appli (qui ont déjà leur marge), mais au-dessus du contenu
    + "html::after{bottom:0;height:var(--bandeau-bas);z-index:14}"
    + "@media (max-width:760px){html,body{overflow-x:clip}}"   // pas de glissement de côté sur téléphone
    + "@media print{html::before,html::after{display:none}}";
  var s = document.createElement("style"); s.id = "bandeaux-style"; s.textContent = css;
  (document.head || document.documentElement).appendChild(s);
  var ENTETES = "header.haut,header.top,header.entete,body>header";
  var minuteur = 0;
  function maj() {
    clearTimeout(minuteur);
    minuteur = setTimeout(function () {
      var h = document.querySelector(ENTETES), c = "";
      if (h) { c = getComputedStyle(h).backgroundColor; if (/rgba\(.*,\s*0\)$|transparent/.test(c)) c = ""; }
      var r = document.documentElement.style, avant = r.getPropertyValue("--bandeau").trim();
      if (c === avant) return;   // rien à changer (et pas de boucle avec l'observateur ci-dessous)
      if (c) r.setProperty("--bandeau", c); else r.removeProperty("--bandeau");
    }, 60);
  }
  document.addEventListener("DOMContentLoaded", function () {
    maj();
    try {   // personnalisation (styles ajoutés, thème jour / nuit) : la couleur suit
      new MutationObserver(maj).observe(document.head, { childList: true, subtree: true, characterData: true });
      // couleurs posées dans l'attribut style de la page (Personnaliser), classes, thème…
      new MutationObserver(maj).observe(document.documentElement, { attributes: true });
      new MutationObserver(maj).observe(document.body, { attributes: true });
      document.addEventListener("visibilitychange", maj);
      if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", maj);
    } catch (e) {}
  });
  window.addEventListener("load", maj);
})();
