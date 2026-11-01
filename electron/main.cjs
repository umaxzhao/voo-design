const { app, BrowserWindow, Menu, dialog, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

let mainWindow = null;
const closeGuard = require("./close-guard.cjs").createCloseGuard({ app, dialog, getWindow: () => mainWindow });

function createMainWindow() {
  const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#000000",
    show: isDev,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
    },
  });

  closeGuard.attach(mainWindow);
  require("./packaged_smoke.cjs")(app, mainWindow);

  const showWindow = () => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  };

  mainWindow.once("ready-to-show", showWindow);
  // Guarantee window becomes visible even if ready-to-show is delayed or skipped
  setTimeout(showWindow, 1200);

  const devServerUrl = process.env.VITE_DEV_SERVER_URL || (isDev ? "http://localhost:5173" : null);

  if (devServerUrl) {
    const loadPromise = mainWindow.loadURL(devServerUrl);
    if (loadPromise && typeof loadPromise.catch === "function") {
      loadPromise.catch(() => {
        const indexPath = path.join(__dirname, "../dist/index.html");
        if (fs.existsSync(indexPath)) {
          mainWindow.loadFile(indexPath);
        }
        showWindow();
      });
    }

    if (mainWindow.webContents && typeof mainWindow.webContents.on === "function") {
      mainWindow.webContents.on("did-fail-load", (event, errorCode, errorDescription, validatedURL) => {
        if (validatedURL && validatedURL.includes("localhost:5173")) {
          const indexPath = path.join(__dirname, "../dist/index.html");
          if (fs.existsSync(indexPath)) {
            mainWindow.loadFile(indexPath);
          }
        }
        showWindow();
      });
    }
  } else {
    // A packaged app with no build output cannot run; fail loudly instead of
    // opening a blank window pointed at a dev server that does not exist.
    const indexPath = path.join(__dirname, "../dist/index.html");
    if (!fs.existsSync(indexPath)) {
      throw new Error(`Missing build output: ${indexPath}. Run "npm run build" first.`);
    }
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  require("./native-menu.cjs")({ app, Menu, dispatchMenuAction, platform: process.platform });
}

function dispatchMenuAction(action) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("menu:action", action);
  }
}


ipcMain.handle("app:version", () => app.getVersion());

// IPC Handlers
ipcMain.handle("dialog:openFile", async (_, options = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: options.filters || [
      { name: "VOO Design Document / Snapshot", extensions: ["voo", "zip", "json"] },
      { name: "Image Files", extensions: ["png", "jpg", "jpeg", "webp", "svg", "psd"] },
      { name: "Figma Files", extensions: ["fig"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const filePath = result.filePaths[0];
  // Bytes for every format: the renderer decodes text, binary .voo and images itself.
  return { filePath, bytes: await fs.promises.readFile(filePath) };
});

ipcMain.handle("dialog:saveFile", async (_, { content, defaultPath, filters } = {}) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultPath || "Untitled.voo",
    filters: filters || [
      { name: "VOO Design Document / Snapshot", extensions: ["voo", "zip", "json"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (result.canceled || !result.filePath) return null;
  if (content !== undefined) {
    await fs.promises.writeFile(result.filePath, content, "utf-8");
  }
  return result.filePath;
});

ipcMain.handle("fs:readFile", async (_, filePath) => {
  return await fs.promises.readFile(filePath, "utf-8");
});

ipcMain.handle("fs:readBinary", async (_, filePath) => {
  return await fs.promises.readFile(filePath);
});

ipcMain.handle("fs:writeBinary", async (_, filePath, bytes) => {
  await fs.promises.writeFile(filePath, bytes);
  return true;
});

ipcMain.handle("fs:writeFile", async (_, filePath, content) => {
  await fs.promises.writeFile(filePath, content, "utf-8");
  return true;
});

// Optional local model bytes are read through a fixed-file IPC boundary.
require("./client-models.cjs").registerClientModelIpc(ipcMain, app);
// Register Local CLI Bridge IPC Handlers
import("./local_backend_bridge.js").then(({ registerLocalCliIpc }) => {
  registerLocalCliIpc(ipcMain, { app });
}).catch((err) => {
  console.warn("[electron] Could not register local CLI IPC:", err);
});

// Web image generation: the user's signed-in Chrome, via the extension bridge.
import("./web_image_ipc.js").then(({ registerWebImageIpc }) => {
  registerWebImageIpc(ipcMain, {
    getWindow: () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null),
  });
}).catch((err) => {
  console.warn("[electron] Could not register web image IPC:", err);
});
// Register Workspace Manager IPC Handlers
try {
  const { registerWorkspaceIpc } = require("./workspace_manager.cjs");
  registerWorkspaceIpc(ipcMain, () => mainWindow);
} catch (err) {
  console.warn("[electron] Could not register workspace IPC:", err);
}

// The desktop owns the bridge; an explicitly launched web bridge may share it.
let cliBridge = null;
let cliBridgeStartup = Promise.resolve();
let cliBridgeShutdown = null;
let cliBridgeQuitComplete = false;
let cliBridgeRetry = null;

async function startDesktopCliBridge() {
  try {
    const { startCliBridgeServer, DEFAULT_CLI_BRIDGE_ORIGINS } = await import("./cli_bridge_server.js");
    const { CLI_BRIDGE_DEFAULT_PORT } = await import("../src/shared/cli_bridge_protocol.js");
    const rawPort = process.env.VOO_CLI_BRIDGE_PORT;
    const port = rawPort ? Number(rawPort) : CLI_BRIDGE_DEFAULT_PORT;
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      throw new Error(`Invalid VOO_CLI_BRIDGE_PORT: ${rawPort}`);
    }
    const extraOrigins = (process.env.VOO_CLI_BRIDGE_ORIGINS ?? "")
      .split(",").map((origin) => origin.trim()).filter(Boolean);
    try {
      cliBridge = await startCliBridgeServer({
        host: "127.0.0.1", port,
        origins: [...DEFAULT_CLI_BRIDGE_ORIGINS, ...extraOrigins],
      });
      console.info(`[electron] CLI bridge listening on ws://127.0.0.1:${cliBridge.port}`);
    } catch (err) {
      if (err.code !== "EADDRINUSE") throw err;
      console.info(`[electron] Reusing existing CLI bridge on ws://127.0.0.1:${port}`);
      // A pre-existing web/legacy MCP bridge can exit independently. Keep
      // trying to acquire the port so the renderer can reconnect to the app.
      if (!cliBridgeShutdown) cliBridgeRetry = setTimeout(() => {
        cliBridgeRetry = null;
        cliBridgeStartup = startDesktopCliBridge();
      }, 2000);
    }
  } catch (err) {
    console.warn("[electron] Could not start CLI bridge:", err);
  }
}

app.on("before-quit", (event) => {
  if (cliBridgeQuitComplete) return;
  event.preventDefault();
  // Wait for in-flight startup too, so quitting during listen cannot leak a server.
  if (!cliBridgeShutdown) {
    cliBridgeShutdown = (async () => {
      // Decide about unsaved work before stopping services. Cancelling quit
      // must leave the live editor and its CLI bridge connected.
      if (!await closeGuard.confirm()) { cliBridgeShutdown = null; return; }
      clearTimeout(cliBridgeRetry);
      cliBridgeRetry = null;
      await cliBridgeStartup;
      if (cliBridge) await cliBridge.close();
      cliBridge = null;
      cliBridgeQuitComplete = true;
      app.quit();
    })().catch((err) => {
      cliBridgeShutdown = null;
      console.warn("[electron] Could not close CLI bridge:", err);
    });
  }
  return cliBridgeShutdown;
});

app.whenReady().then(() => {
  cliBridgeStartup = startDesktopCliBridge();
  createMainWindow();
  require("./updater.cjs").setupUpdater({ app, ipcMain, getWindow: () => mainWindow });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
