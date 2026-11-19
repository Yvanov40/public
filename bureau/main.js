// « Mes applis » pour ordinateur (Windows et Mac) : les applis en ligne dans des fenêtres à elles.
//   - L'accueil s'ouvre au lancement ; chaque appli (Suivi, Audit…) s'ouvre dans sa propre fenêtre, comme dans le navigateur.
//   - Les applis se mettent à jour d'elles-mêmes (elles viennent du site) ; elles restent disponibles hors connexion une fois ouvertes.
//   - Exports : la fenêtre « Enregistrer sous » du système. Impression : celle du système (et le PDF).
//   - Les liens vers d'autres sites s'ouvrent dans le navigateur habituel.
const { app, BrowserWindow, Menu, shell, screen } = require("electron");
const path = require("path");
const fs = require("fs");

const ACCUEIL = "https://yvanov40.github.io/public/";
const estDesApplis = (url) => { try { const u = new URL(url); return u.origin === "https://yvanov40.github.io" && u.pathname.startsWith("/public/"); } catch (e) { return false; } };

// taille et place des fenêtres, d'une fois sur l'autre (une par appli)
const fichierPlaces = () => path.join(app.getPath("userData"), "fenetres.json");
let places = {};
try { places = JSON.parse(fs.readFileSync(fichierPlaces(), "utf8")); } catch (e) { places = {}; }
const cleFenetre = (url) => { try { return new URL(url).pathname.split("/")[2] || "accueil"; } catch (e) { return "accueil"; } };
function placeVisible(p) {
  return p && screen.getAllDisplays().some((d) => p.x < d.workArea.x + d.workArea.width - 80 && p.x + p.width > d.workArea.x + 80 && p.y >= d.workArea.y - 20 && p.y < d.workArea.y + d.workArea.height - 80);
}

function nouvelleFenetre(url, cle) {
  const p = places[cle];
  const f = new BrowserWindow({
    ...(placeVisible(p) ? p : { width: cle === "accueil" ? 760 : 1360, height: cle === "accueil" ? 820 : 900 }),
    minWidth: 360, minHeight: 480,
    backgroundColor: "#0c2d39",
    title: "Mes applis",
    icon: path.join(__dirname, "build", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: true }
  });
  if (p && p.max) f.maximize();
  const garder = () => {
    if (f.isDestroyed()) return;
    places[cle] = { ...(f.isMaximized() ? places[cle] || {} : f.getBounds()), max: f.isMaximized() };
    try { fs.writeFileSync(fichierPlaces(), JSON.stringify(places)); } catch (e) { /* rien */ }
  };
  f.on("close", garder);
  // liens : une appli s'ouvre dans sa fenêtre (réutilisée si elle est déjà ouverte), le reste dans le navigateur
  f.webContents.setWindowOpenHandler(({ url }) => {
    if (estDesApplis(url)) { ouvrir(url); return { action: "deny" }; }
    if (/^https?:|^mailto:|^tel:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  f.webContents.on("will-navigate", (e, url) => { if (!estDesApplis(url)) { e.preventDefault(); if (/^https?:|^mailto:|^tel:/i.test(url)) shell.openExternal(url); } });
  // pas de connexion au premier lancement : une page d'attente qui réessaie
  f.webContents.on("did-fail-load", (e, code, desc, urlRatee, principal) => {
    if (!principal || code === -3) return;
    f.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(`<!doctype html><meta charset="utf-8"><title>Mes applis</title>
      <body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0c2d39;color:#f5efe4;font:16px system-ui;text-align:center">
      <div><h1 style="font:600 26px Georgia,serif;color:#a57d2f">Pas de connexion</h1><p>Les applis s’ouvrent dès que le réseau revient.</p>
      <p style="opacity:.7">Nouvel essai dans quelques secondes…</p></div></body>`));
    setTimeout(() => { if (!f.isDestroyed()) f.loadURL(urlRatee); }, 8000);
  });
  f.loadURL(url);
  return f;
}

const fenetres = new Map();   // une fenêtre par appli
function ouvrir(url) {
  const cle = cleFenetre(url);
  const deja = fenetres.get(cle);
  if (deja && !deja.isDestroyed()) {
    if (deja.isMinimized()) deja.restore();
    deja.focus();
    if (cleFenetre(deja.webContents.getURL()) !== cle || new URL(url).hash) deja.loadURL(url);
    return deja;
  }
  const f = nouvelleFenetre(url, cle);
  fenetres.set(cle, f);
  f.on("closed", () => fenetres.delete(cle));
  return f;
}

function menu() {
  const mac = process.platform === "darwin";
  const actuelle = () => BrowserWindow.getFocusedWindow();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(mac ? [{ label: "Mes applis", submenu: [{ role: "about", label: "À propos de Mes applis" }, { type: "separator" }, { role: "hide", label: "Masquer" }, { role: "quit", label: "Quitter" }] }] : []),
    { label: "Fichier", submenu: [
      { label: "Accueil", accelerator: "CmdOrCtrl+Shift+H", click: () => ouvrir(ACCUEIL) },
      { label: "Imprimer…", accelerator: "CmdOrCtrl+P", click: () => actuelle() && actuelle().webContents.print() },
      { type: "separator" },
      mac ? { role: "close", label: "Fermer la fenêtre" } : { role: "quit", label: "Quitter" }
    ] },
    { label: "Édition", submenu: [{ role: "undo", label: "Annuler" }, { role: "redo", label: "Rétablir" }, { type: "separator" }, { role: "cut", label: "Couper" }, { role: "copy", label: "Copier" }, { role: "paste", label: "Coller" }, { role: "selectAll", label: "Tout sélectionner" }] },
    { label: "Affichage", submenu: [
      { label: "Page précédente", accelerator: mac ? "Cmd+[" : "Alt+Left", click: () => actuelle() && actuelle().webContents.navigationHistory.goBack() },
      { role: "reload", label: "Recharger" }, { role: "forceReload", label: "Recharger (sans le cache)" }, { type: "separator" },
      { role: "zoomIn", label: "Zoom avant" }, { role: "zoomOut", label: "Zoom arrière" }, { role: "resetZoom", label: "Taille réelle" }, { type: "separator" },
      { role: "togglefullscreen", label: "Plein écran" }, { role: "toggleDevTools", label: "Outils de développement" }
    ] },
    { label: "Fenêtre", submenu: [{ role: "minimize", label: "Réduire" }, { role: "zoom", label: "Agrandir" }] }
  ]));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { const f = fenetres.get("accueil") || [...fenetres.values()][0]; if (f) { if (f.isMinimized()) f.restore(); f.focus(); } else ouvrir(ACCUEIL); });
  app.whenReady().then(() => { menu(); ouvrir(ACCUEIL); });
  app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) ouvrir(ACCUEIL); });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}
