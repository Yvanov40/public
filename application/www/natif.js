// Injecté par l'application Android dans chaque page des applis (Suivi, Audit, Succession…).
// Le navigateur intégré d'Android ne sait ni télécharger un fichier créé par la page, ni imprimer :
//   - un export (Excel, PowerPoint, PDF, sauvegarde JSON) s'ouvre dans le menu Android « Partager / Enregistrer » ;
//   - « Imprimer » ouvre l'impression d'Android (qui sait aussi « Enregistrer au format PDF »).
(function () {
  if (window.__natifApplis) return;
  window.__natifApplis = true;
  var C = window.Capacitor, P = C && C.Plugins;
  document.documentElement.classList.add("appli-android");
  function base64(blob) {
    return new Promise(function (ok, ko) { var r = new FileReader(); r.onload = function () { ok(String(r.result).split(",")[1] || ""); }; r.onerror = ko; r.readAsDataURL(blob); });
  }
  function partager(href, nom) {
    nom = String(nom || "fichier").replace(/[\\/:*?"<>|]+/g, "-");
    return fetch(href).then(function (r) { return r.blob(); }).then(base64).then(function (data) {
      return P.Filesystem.writeFile({ path: nom, data: data, directory: "CACHE" });
    }).then(function (f) {
      return P.Share.share({ title: nom, files: [f.uri], dialogTitle: "Enregistrer ou envoyer « " + nom + " »" });
    }).catch(function (e) { if (!/cancel/i.test(String(e && e.message))) alert("Export impossible : " + (e && e.message || e)); });
  }
  function estExport(a) { return a && a.hasAttribute && a.hasAttribute("download") && /^(blob|data):/i.test(a.href || ""); }
  var clic = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (estExport(this) && P) { partager(this.href, this.getAttribute("download")); return; } return clic.apply(this, arguments); };
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a") : null;
    if (estExport(a) && P) { e.preventDefault(); e.stopPropagation(); partager(a.href, a.getAttribute("download")); }
  }, true);
  if (window.AppliAndroid) window.print = function () { window.AppliAndroid.imprimer(document.title || "Document"); };
})();
