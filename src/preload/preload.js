const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("clipboardAPI", {
  getHistory: () => ipcRenderer.invoke("get-clipboard-history"),
  setClipboard: (item) => ipcRenderer.send("set-clipboard", item),
  deleteItem: (index) => ipcRenderer.send("delete-item", index),
  onHistoryUpdate: (callback) => {
    ipcRenderer.on("history-updated", (event, history) => callback(history));
    return () => {
      ipcRenderer.removeAllListeners("history-updated");
    };
  },
});
