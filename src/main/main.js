const { app, BrowserWindow, clipboard, ipcMain, Tray } = require("electron");
const path = require("path");
const Store = require("electron-store").default;

//to store the history
const store = new Store({
  name: "clipboard-history",
  defaults: { history: [] },
});

let mainWindow;
let clipboardHistory = store.get("history") || [];
let lastClipboardContent = clipboard.readText();
let tray = null;

const startMonitoringClipboard = () => {
  setInterval(() => {
    const currentText = clipboard.readText();

    //if there is some new text copied
    if (currentText && currentText !== lastClipboardContent) {
      console.log("New clipboard content:", currentText);
      lastClipboardContent = currentText;
    }

    //add to history and avoiding duplicates
    if (!clipboardHistory.some((item) => item.text !== currentText)) {
      clipboardHistory.unshift({
        text: currentText,
        timestamp: Date.now(),
      });
      //limit to 25 copies
      if (clipboardHistory.length > 25) {
        clipboardHistory = clipboardHistory.slice(0, 25);
      }

      store.set("history", clipboardHistory);
      //to notify renderer if the window exists
      if (mainWindow) {
        mainWindow.webContents.send("clipboard-updated", clipboardHistory);
      }
    }
  }, 500); //check every 500 miliseconds
};

ipcMain.handle("get-clipboard-history", () => clipboardHistory);

ipcMain.on("set-clipboard", (_, text) => {
  clipboard.writeText(text);
  lastClipboardContent = text; // Prevent detecting this as a new copy
});

const createTray = () => {
  tray = new Tray(path.join(__dirname, "../../clipboard.png"));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show Clipboard Manager",
      click: () => mainWindow.show(),
    },
    {
      label: "Clear History",
      click: () => {
        clipboardHistory = [];
        store.set("history", clipboardHistory);
        mainWindow.webContents.send("clipboard-updated", clipboardHistory);
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => app.quit(),
    },
  ]);

  tray.setToolTip("Clipboard Manager");
  tray.setContextMenu(contextMenu);

  // Click on tray icon to show/hide window
  tray.on("click", () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });
};

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    height: 500,
    width: 500,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"), //in order to use the preload
    },
  });

  mainWindow.loadFile(path.join(__dirname, "../rederers/index.html")); //loads the ui

  //hide instead of close
  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
    return true;
  });

  console.log("current: ", clipboard.readText());
};

ipcMain.handle("get-clipboard-text", () => {
  return clipboard.readText();
});

app.whenReady().then(() => {
  createWindow();
  createTray();
  startMonitoringClipboard();

  // Register Ctrl+Alt+V to show/hide window
  globalShortcut.register("CommandOrControl+Alt+V", () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Unregister shortcuts when quitting
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

// Set a flag when actually quitting
app.on("before-quit", () => {
  app.isQuitting = true;
});
