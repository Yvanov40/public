// « Mes applis » pour ordinateur (Windows et Mac) : une seule fenêtre, ouverte en grand.
//   - L'appli choisie occupe toute la fenêtre ; la liste des applis glisse depuis la gauche
//     (petite flèche en haut à gauche, ou souris contre le bord gauche) — voir cadre.html.
//   - Chaque appli ouverte reste chargée : on la retrouve là où on l'avait laissée.
//   - Les applis viennent du site : elles se mettent à jour d'elles-mêmes (et restent disponibles hors connexion une fois ouvertes).
//   - Exports : la fenêtre « Enregistrer sous » du système. Impression : celle du système (et le PDF).
//   - Les liens vers d'autres sites s'ouvrent dans le navigateur habituel.
//   - Pas de barre de titre : elle apparaît quand la souris touche le haut de la fenêtre (voir barreDuHaut).
const { app, BrowserWindow, Menu, shell, screen, ipcMain } = require("electron");
const path = require("path");

const SITE = "https://yvanov40.github.io/public/";
const IDS = ["suivi", "audit", "succession", "pvi", "immo", "revision"];
const estDesApplis = (url) => { try { const u = new URL(url); return u.origin === "https://yvanov40.github.io" && u.pathname.startsWith("/public/"); } catch (e) { return false; } };
const appliDe = (url) => { try { const id = new URL(url).pathname.split("/")[2]; return IDS.includes(id) ? id : null; } catch (e) { return null; } };
const externe = (url) => { if (/^(https?|mailto|tel):/i.test(url)) shell.openExternal(url); };

let fenetre = null;
const ordre = (o, arg) => { if (fenetre && !fenetre.isDestroyed()) fenetre.webContents.send("ordre", o, arg); };

function creerFenetre() {
  fenetre = new BrowserWindow({
    width: 1400, height: 900, minWidth: 480, minHeight: 480, show: false,
    backgroundColor: "#0c2d39", title: "Mes applis",
    icon: path.join(__dirname, "build", "icon.png"),
    autoHideMenuBar: true,
    titleBarStyle: "hidden",   // sans barre de titre (la fenêtre reste redimensionnable) ; la nôtre apparaît au survol du haut
    ...(process.platform === "darwin" ? { trafficLightPosition: { x: 14, y: 11 } } : {}),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, webviewTag: true }
  });
  if (process.platform === "darwin") fenetre.setWindowButtonVisibility(false);
  const etat = () => ordre("etat-fenetre", { agrandie: fenetre.isMaximized(), plein: fenetre.isFullScreen() });
  fenetre.on("maximize", etat); fenetre.on("unmaximize", etat); fenetre.on("enter-full-screen", etat); fenetre.on("leave-full-screen", etat);
  barreDuHaut(fenetre);
  fenetre.once("ready-to-show", () => { fenetre.setBounds(screen.getPrimaryDisplay().workArea); fenetre.maximize(); fenetre.show(); });   // ouverte en grand
  fenetre.loadFile(path.join(__dirname, "cadre.html"));
  fenetre.webContents.on("will-navigate", (e) => e.preventDefault());
  fenetre.on("closed", () => { fenetre = null; });
}

// la barre du haut : la souris contre le bord du haut la fait apparaître, elle s'efface quand la souris s'éloigne.
//   (Les pages des applis gardent les mouvements de la souris pour elles : on regarde donc où est le pointeur, quatre fois par seconde.)
function barreDuHaut(f) {
  let visible = false, depuis = 0;
  const minuteur = setInterval(() => {
    if (f.isDestroyed()) { clearInterval(minuteur); return; }
    if (!f.isFocused() && !visible) return;
    const p = screen.getCursorScreenPoint(), b = f.getContentBounds();
    const dedans = p.x >= b.x && p.x < b.x + b.width && p.y >= b.y - 2 && p.y < b.y + b.height;
    const y = p.y - b.y;
    if (!visible && dedans && y <= 4) { if (!depuis) depuis = Date.now(); else if (Date.now() - depuis >= 120) { visible = true; depuis = 0; montrer(true); } }
    else if (!visible) depuis = 0;
    else if (visible && (!dedans || y > 44)) { if (!depuis) depuis = Date.now(); else if (Date.now() - depuis >= 450) { visible = false; depuis = 0; montrer(false); } }
    else depuis = 0;
  }, 60);
  function montrer(v) {
    ordre("barre", v);
    if (process.platform === "darwin") f.setWindowButtonVisibility(v);
  }
}
ipcMain.on("fenetre", (e, action) => {
  if (!fenetre) return;
  if (action === "reduire") fenetre.minimize();
  else if (action === "agrandir") { if (fenetre.isFullScreen()) fenetre.setFullScreen(false); else if (fenetre.isMaximized()) fenetre.unmaximize(); else fenetre.maximize(); }
  else if (action === "fermer") fenetre.close();
});

// les pages des applis (dans le cadre) : liens entre applis, liens extérieurs, fenêtres
app.on("web-contents-created", (e, wc) => {
  wc.on("will-attach-webview", (ev, prefs, params) => {   // seules les applis du site peuvent être chargées dans le cadre
    delete prefs.preload; prefs.nodeIntegration = false; prefs.contextIsolation = true;
    if (!estDesApplis(params.src)) ev.preventDefault();
  });
  if (wc.getType() !== "webview") return;
  wc.setWindowOpenHandler(({ url }) => {
    const id = appliDe(url);
    if (id) ordre("appli", { id, url });
    else if (estDesApplis(url)) wc.loadURL(url);
    else externe(url);
    return { action: "deny" };
  });
  wc.on("will-navigate", (ev, url) => {
    if (!estDesApplis(url)) { ev.preventDefault(); externe(url); return; }
    const id = appliDe(url), ici = appliDe(wc.getURL());
    if (id && ici && id !== ici) { ev.preventDefault(); ordre("appli", { id, url }); }   // un lien vers une autre appli : on passe à elle
  });
});

function menu() {
  const mac = process.platform === "darwin";
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(mac ? [{ label: "Mes applis", submenu: [{ role: "about", label: "À propos de Mes applis" }, { type: "separator" }, { role: "hide", label: "Masquer" }, { role: "quit", label: "Quitter" }] }] : []),
    { label: "Fichier", submenu: [
      { label: "Liste des applis", accelerator: "CmdOrCtrl+Shift+A", click: () => ordre("panneau") },
      ...IDS.map((id, i) => ({ label: ["Suivi", "Audit", "Succession", "Plus-value", "Investissement", "Révision"][i], accelerator: "CmdOrCtrl+" + (i + 1), click: () => ordre("numero", i) })),
      { type: "separator" },
      { label: "Imprimer…", accelerator: "CmdOrCtrl+P", click: () => ordre("imprimer") },
      { type: "separator" },
      mac ? { role: "close", label: "Fermer la fenêtre" } : { role: "quit", label: "Quitter" }
    ] },
    { label: "Édition", submenu: [{ role: "undo", label: "Annuler" }, { role: "redo", label: "Rétablir" }, { type: "separator" }, { role: "cut", label: "Couper" }, { role: "copy", label: "Copier" }, { role: "paste", label: "Coller" }, { role: "selectAll", label: "Tout sélectionner" }] },
    { label: "Affichage", submenu: [
      { label: "Page précédente", accelerator: mac ? "Cmd+[" : "Alt+Left", click: () => ordre("retour") },
      { label: "Recharger", accelerator: "CmdOrCtrl+R", click: () => ordre("recharger") },
      { label: "Recharger (sans le cache)", accelerator: "CmdOrCtrl+Shift+R", click: () => ordre("recharger-fort") },
      { type: "separator" },
      { label: "Zoom avant", accelerator: "CmdOrCtrl+=", click: () => ordre("zoom", 0.5) },
      { label: "Zoom arrière", accelerator: "CmdOrCtrl+-", click: () => ordre("zoom", -0.5) },
      { label: "Taille réelle", accelerator: "CmdOrCtrl+0", click: () => ordre("zoom", 0) },
      { type: "separator" },
      { role: "togglefullscreen", label: "Plein écran (sans barre de titre)" },
      { label: "Outils de développement", accelerator: mac ? "Alt+Cmd+I" : "Ctrl+Shift+I", click: () => ordre("outils") }
    ] },
    { label: "Fenêtre", submenu: [{ role: "minimize", label: "Réduire" }, { role: "zoom", label: "Agrandir" }] }
  ]));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { if (fenetre) { if (fenetre.isMinimized()) fenetre.restore(); fenetre.focus(); } else creerFenetre(); });
  app.whenReady().then(() => { menu(); creerFenetre(); });
  app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) creerFenetre(); });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}
