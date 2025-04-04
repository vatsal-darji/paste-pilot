const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  clipboard,
  globalShortcut,
  ipcMain,
  screen,
  nativeImage,
} = require("electron");
const path = require("path");
const Store = require("electron-store");

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
const maxHistoryItems = 30;
let isPolling = true;
let lastClipboardContent = "";
let isWindowFocused = false;

// Create the main application window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 350,
    height: 400,
    icon: path.join(__dirname, "../assets/clipboard.png"),
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
}

// Create system tray icon
function createTray() {
  tray = new Tray(path.join(__dirname, "../assets/clipboard.png"));

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
}

function showWindowAtCursor() {
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
}

// Start monitoring clipboard for changes
function startPollingClipboard() {
  try {
    lastClipboardContent = clipboard.readText();
    lastClipboardImage = clipboard.readImage();
  } catch (error) {
    console.error("Error reading initial clipboard content:", error);
    lastClipboardContent = "";
    lastClipboardImage = null;
  }

  // Check clipboard at regular intervals
  const checkClipboard = () => {
    if (!isPolling) return;

    try {
      // Force clipboard refresh to ensure we get the latest content
      // This is important for detecting clipboard changes from other applications
      let currentContent = "";

      currentContent = clipboard.readText("clipboard");
      let currentImage = clipboard.readImage();
      let hasImageContent = !currentImage.isEmpty(); //has image content

      // Determine if image has changed
      let hasImageChanged =
        hasImageContent &&
        (!lastClipboardImage ||
          currentImage.toDataURL() !== lastClipboardImage.toDataURL());

      // Only update if content has changed and isn't empty
      if (currentContent && currentContent !== lastClipboardContent) {
        console.log(
          "New clipboard content detected:",
          currentContent.substring(0, 30) + "..."
        );

        lastClipboardContent = currentContent;
        lastClipboardImage = null; //reset the image when the text is detected

        // Avoid duplicates by removing any existing identical entry
        clipboardHistory = clipboardHistory.filter(
          (item) => item.type !== "text" || item.text !== currentContent
        );

        // Add new item to the beginning of the array
        clipboardHistory.unshift({
          type: "text",
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
      } else if (hasImageContent && hasImageChanged) {
        lastClipboardImage = currentImage;
        lastClipboardContent = ""; //reset text when image is copied

        //convert image to base64 for display and storage
        const base64Image = currentImage.toPNG().toString("base64");

        //add to history
        clipboardHistory.unshift({
          type: "image",
          ImageData: base64Image,
          timestamp: Date.now(),
        });
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
}

// IPC Handlers
function setupIPCHandlers() {
  // Get initial history
  ipcMain.handle("get-clipboard-history", () => clipboardHistory);

  // Set clipboard content
  ipcMain.on("set-clipboard", (event, item) => {
    if (typeof item === "object" && item.type) {
      if (item.type === "text" && item.text) {
        clipboard.writeText(item.text);
        lastClipboardContent = item.text;
        lastClipboardImage = null;
      } else if (item.type === "image" && item.ImageData) {
        try {
          const buffer = Buffer.from(item.ImageData, "base64");
          const image = nativeImage.createFromBuffer(buffer);
          clipboard.writeImage(image);
          lastClipboardImage = image;
          lastClipboardContent = "";
        } catch (error) {
          console.error("Failed to set image clipboard:", error);
        }
      }
    } else if (typeof item === "string") {
      // Legacy support for text-only
      clipboard.writeText(item);
      lastClipboardContent = item;
      lastClipboardImage = null;
    }
  });

  // Delete item from history
  ipcMain.on("delete-item", (event, index) => {
    clipboardHistory.splice(index, 1);
    store.set("history", clipboardHistory);
    mainWindow.webContents.send("history-updated", clipboardHistory);
  });
}

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
