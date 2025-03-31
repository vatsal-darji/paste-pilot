const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  clipboard,
  globalShortcut,
  ipcMain,
  screen,
} = require("electron");
const path = require("path");
const Store = require("electron-store").default;

// Initialize store for saving clipboard history
const store = new Store({
  name: "clipboard-history",
  defaults: {
    history: [],
  },
});

// Global variables
let mainWindow;
let tray = null;
let clipboardHistory = store.get("history") || [];
const maxHistoryItems = 20;
let isPolling = true;
let lastClipboardContent = "";
let isWindowFocused = false;

// Create the main application window
const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 350,
    height: 400,
    icon: path.join(__dirname, "../../clipboard.png"),
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false,
    skipTaskbar: true, //dont show in the taskbar, only in tray
    alwaysOnTop: false,
  });

  mainWindow.loadFile(path.join(__dirname, "../rederers/index.html"));

  mainWindow.on("blur", () => {
    isWindowFocused = false;
    setTimeout(() => {
      if (!isWindowFocused && mainWindow.isVisible()) {
        mainWindow.hide();
      }
    }, 100); //timeout function so it does not cause issues when clicked on the window itself
  });

  mainWindow.on("focus", () => {
    isWindowFocused = true;
  });

  // Hide window instead of closing when user clicks X
  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
    return true;
  });
};

// Create system tray icon
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
        mainWindow.webContents.send("history-updated", clipboardHistory);
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip("Clipboard Manager");
  tray.setContextMenu(contextMenu);

  // Show app on tray icon click
  tray.on("click", () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
};

const showWindowAtCursor = () => {
  if (!mainWindow) return;

  // Get cursor position
  const cursorPosition = screen.getCursorScreenPoint();
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = mainWindow.getBounds();

  // Determine position for window
  let x = cursorPosition.x - width / 2;
  let y = cursorPosition.y + 20; // Show just below cursor

  // Make sure window is within the screen bounds
  if (x < 0) x = 0;
  if (y < 0) y = 0;
  if (x + width > primaryDisplay.workAreaSize.width) {
    x = primaryDisplay.workAreaSize.width - width;
  }
  if (y + height > primaryDisplay.workAreaSize.height) {
    y = primaryDisplay.workAreaSize.height - height;
  }

  // Position and show the window
  mainWindow.setPosition(x, y);
  mainWindow.show();
  mainWindow.focus(); // Ensure window is focused
};

// Start monitoring clipboard for changes
const startPollingClipboard = () => {
  try {
    lastClipboardContent = clipboard.readText();
  } catch (error) {
    console.error("Error reading initial clipboard content:", error);
    lastClipboardContent = "";
  }

  // Check clipboard at regular intervals
  const checkClipboard = () => {
    if (!isPolling) return;

    try {
      // Force clipboard refresh to ensure we get the latest content
      // This is important for detecting clipboard changes from other applications
      let currentContent = "";
      try {
        currentContent = clipboard.readText("clipboard");
      } catch (e) {
        // Sometimes readText may fail, try alternative approach
        currentContent = clipboard.readText();
      }

      // Only update if content has changed and isn't empty
      if (currentContent && currentContent !== lastClipboardContent) {
        console.log(
          "New clipboard content detected:",
          currentContent.substring(0, 30) + "..."
        );

        lastClipboardContent = currentContent;

        // Avoid duplicates by removing any existing identical entry
        clipboardHistory = clipboardHistory.filter(
          (item) => item.text !== currentContent
        );

        // Add new item to the beginning of the array
        clipboardHistory.unshift({
          text: currentContent,
          timestamp: Date.now(),
        });

        // Limit history size
        if (clipboardHistory.length > maxHistoryItems) {
          clipboardHistory = clipboardHistory.slice(0, maxHistoryItems);
        }

        // Save to store
        store.set("history", clipboardHistory);

        // Update renderer
        if (mainWindow) {
          mainWindow.webContents.send("history-updated", clipboardHistory);
        }
      }
    } catch (error) {
      console.error("Error checking clipboard:", error);
    }

    // Check again after a short delay
    setTimeout(checkClipboard, 300); // Checking more frequently
  };

  checkClipboard();
};

// IPC Handlers
const setupIPCHandlers = () => {
  // Get initial history
  ipcMain.handle("get-clipboard-history", () => clipboardHistory);

  // Set clipboard content
  ipcMain.on("set-clipboard", (event, text) => {
    clipboard.writeText(text);
    lastClipboardContent = text; // Update last known content to prevent re-adding
  });

  // Delete item from history
  ipcMain.on("delete-item", (event, index) => {
    clipboardHistory.splice(index, 1);
    store.set("history", clipboardHistory);
    mainWindow.webContents.send("history-updated", clipboardHistory);
  });
};

// Register global shortcut
function registerShortcuts() {
  // Ctrl+Alt+V to show window
  globalShortcut.register("CommandOrControl+Alt+V", () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      showWindowAtCursor();
    }
  });
}

// App lifecycle events
app.whenReady().then(() => {
  createWindow();
  createTray();
  setupIPCHandlers();
  registerShortcuts();
  startPollingClipboard();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
