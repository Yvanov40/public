// Le lien entre la fenêtre (main.js) et le cadre (cadre.html) : les ordres du menu et des raccourcis.
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("cadre", {
  surOrdre: (f) => ipcRenderer.on("ordre", (e, ordre, arg) => f(ordre, arg))
});
