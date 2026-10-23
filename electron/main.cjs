const { app, BrowserWindow, Menu, dialog, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

let mainWindow = null;

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
    },
  });

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

  setupMenu();
}

function dispatchMenuAction(action) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("menu:action", action);
  }
}

function setupMenu() {
  const isMac = process.platform === "darwin";

  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { label: "About VOO Design", click: () => dispatchMenuAction("help:about") },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "New Document",
          accelerator: "CmdOrCtrl+N",
          click: () => dispatchMenuAction("file:new"),
        },
        {
          label: "Open...",
          accelerator: "CmdOrCtrl+O",
          click: () => dispatchMenuAction("file:open"),
        },
        { type: "separator" },
        {
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          click: () => dispatchMenuAction("file:save"),
        },
        {
          label: "Save As...",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => dispatchMenuAction("file:saveAs"),
        },
        { type: "separator" },
        {
          label: "Export PNG...",
          accelerator: "CmdOrCtrl+Shift+E",
          click: () => dispatchMenuAction("export:png"),
        },
        {
          label: "Export SVG...",
          click: () => dispatchMenuAction("export:svg"),
        },
        {
          label: "Export PSD...",
          click: () => dispatchMenuAction("export:psd"),
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        {
          label: "Undo",
          accelerator: "CmdOrCtrl+Z",
          click: () => dispatchMenuAction("edit:undo"),
        },
        {
          label: "Redo",
          accelerator: "CmdOrCtrl+Shift+Z",
          click: () => dispatchMenuAction("edit:redo"),
        },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        {
          label: "Duplicate",
          accelerator: "CmdOrCtrl+D",
          click: () => dispatchMenuAction("edit:duplicate"),
        },
        {
          label: "Delete",
          accelerator: "Backspace",
          click: () => dispatchMenuAction("edit:delete"),
        },
        { type: "separator" },
        {
          label: "Select All",
          accelerator: "CmdOrCtrl+A",
          click: () => dispatchMenuAction("edit:selectAll"),
        },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Fit to Screen",
          accelerator: "CmdOrCtrl+0",
          click: () => dispatchMenuAction("view:fit"),
        },
        {
          label: "Actual Size (100%)",
          accelerator: "CmdOrCtrl+1",
          click: () => dispatchMenuAction("view:actualSize"),
        },
        {
          label: "Zoom to Selection",
          accelerator: "CmdOrCtrl+2",
          click: () => dispatchMenuAction("view:zoomSelection"),
        },
        { type: "separator" },
        {
          label: "Zoom In",
          accelerator: "CmdOrCtrl+Plus",
          click: () => dispatchMenuAction("view:zoomIn"),
        },
        {
          label: "Zoom Out",
          accelerator: "CmdOrCtrl+-",
          click: () => dispatchMenuAction("view:zoomOut"),
        },
        { type: "separator" },
        { role: "toggledevtools" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [
              { type: "separator" },
              { role: "front" },
              { type: "separator" },
              { role: "window" },
            ]
          : [{ role: "close" }]),
      ],
    },
  ];

  template.push({ label: app.getLocale?.().startsWith("zh") ? "帮助" : "Help", submenu: [{ label: app.getLocale?.().startsWith("zh") ? "新手引导" : "Welcome tour", click: () => dispatchMenuAction("help:onboarding") }, { label: app.getLocale?.().startsWith("zh") ? "关于 VOO Design" : "About VOO Design", click: () => dispatchMenuAction("help:about") }] });
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

ipcMain.handle("app:version", () => app.getVersion());

// IPC Handlers
ipcMain.handle("dialog:openFile", async (_, options = {}) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: options.filters || [
      { name: "VOO Design Document", extensions: ["voo", "json"] },
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
      { name: "VOO Design Document", extensions: ["voo", "json"] },
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

// Models are read by name from a fixed set of bundled directories. The name
// comes from the renderer, so it is accepted only as a bare file name that is
// on the allowlist, and the resolved path must stay inside the directory.
const BUNDLED_MODEL_FILES = new Set([
  "lama_512_fp16.onnx",
  "lama_512_int8.onnx",
  "rmbg-1.4-fp16.onnx",
  "realesrgan-compact-2x.onnx",
  "realesrgan-compact-4x.onnx",
  "isnet-general-fp16.onnx",
  "u2netp.onnx",
]);

function bundledModelDirs() {
  const dirs = [
    path.join(__dirname, "../dist/models"),
    path.join(__dirname, "../public/models"),
    path.join(app.getAppPath(), "models"),
    path.join(app.getAppPath(), "dist/models"),
    path.join(app.getAppPath(), "public/models"),
  ];
  if (process.resourcesPath) {
    dirs.push(path.join(process.resourcesPath, "models"));
  }
  return dirs;
}

function resolveBundledModelPath(modelName) {
  if (typeof modelName !== "string" || !BUNDLED_MODEL_FILES.has(modelName)) {
    throw new Error(`model:loadBytes rejected unknown model: ${String(modelName)}`);
  }
  for (const dir of bundledModelDirs()) {
    const fullPath = path.resolve(dir, modelName);
    if (path.dirname(fullPath) !== path.resolve(dir)) continue;
    if (fs.existsSync(fullPath)) return fullPath;
  }
  return null;
}

ipcMain.handle("model:loadBytes", async (_, modelName) => {
  const fullPath = resolveBundledModelPath(modelName);
  if (!fullPath) return null;
  const buf = await fs.promises.readFile(fullPath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
});

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

// Reuse the external MCP/CLI bridge; the renderer registers its canvas there.
let cliBridge = null;
let cliBridgeStartup = Promise.resolve();
let cliBridgeShutdown = null;
let cliBridgeQuitComplete = false;

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
    cliBridgeShutdown = cliBridgeStartup.then(async () => {
      if (cliBridge) await cliBridge.close();
    }).catch((err) => {
      console.warn("[electron] Could not close CLI bridge:", err);
    }).finally(() => {
      cliBridge = null;
      cliBridgeQuitComplete = true;
      app.quit();
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
