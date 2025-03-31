const { contextBridge, ipcRenderer } = require("electron");

//this is to use built in node modules as well as apis to the renderer. we cant directly use it there.
contextBridge.exposeInMainWorld("clipboardAPI", {
  getClipboardText: () => ipcRenderer.invoke("get-clipboard-text"),
  getHistory: () => ipcRenderer.invoke("get-clipboard-history"),
  setClipboard: (text) => ipcRenderer.send("set-clipboard", text),
  onHistoryUpdate: (callback) => {
    ipcRenderer.on("clipboard-updated", (_, history) => callback(history));
    return () => ipcRenderer.removeAllListeners("clipboard-updated");
  },
});
