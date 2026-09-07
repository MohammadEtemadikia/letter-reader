/**
 * Bridges the sandboxed renderer to the one main-process capability it needs
 * beyond the local HTTP server: opening the persistent letters.xlsx file (or
 * revealing it in Finder/Explorer) in the user's own default app, which a
 * browser download link can't do — it can only save a fresh copy each time.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("letterReader", {
  openOutputFile: () => ipcRenderer.invoke("open-output-file"),
  openOutputFolder: () => ipcRenderer.invoke("open-output-folder"),
});
