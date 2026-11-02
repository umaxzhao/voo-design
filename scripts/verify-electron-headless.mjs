import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

async function run() {
  // Mock Electron module
  const mockIpcMainHandlers = new Map();
  const mockIpcRendererListeners = new Map();
  let mockExposedApi = null;
  let mockMainWindow = null;
  const createdWindows = [];
  let appReadyCallback = null;
  const appEventListeners = new Map();
  let menuTemplate = null;

  const mockApp = {
    name: "VOO Design",
    whenReady: () => ({
      then: (cb) => {
        appReadyCallback = cb;
        return Promise.resolve();
      },
    }),
    on: (event, cb) => {
      appEventListeners.set(event, cb);
    },
    quit: () => {},
  };

  class MockWebContents {
    constructor() {
      this.sentEvents = [];
      this.session = {
        webRequest: {
          onHeadersReceived: null,
        },
      };
      this.windowOpenHandler = null;
    }
    send(channel, ...args) {
      this.sentEvents.push({ channel, args });
      const listeners = mockIpcRendererListeners.get(channel) || [];
      for (const fn of listeners) {
        fn({}, ...args);
      }
    }
    setWindowOpenHandler(handler) {
      this.windowOpenHandler = handler;
    }
  }

  class MockBrowserWindow {
    constructor(options) {
      this.options = options;
      this.webContents = new MockWebContents();
      this.loadedUrl = null;
      this.loadedFile = null;
      this.eventListeners = new Map();
      this.destroyed = false;
      createdWindows.push(this);
      mockMainWindow = this;
    }
    loadURL(url) {
      this.loadedUrl = url;
    }
    loadFile(file) {
      this.loadedFile = file;
    }
    on(event, cb) {
      this.eventListeners.set(event, cb);
    }
    isDestroyed() {
      return this.destroyed;
    }
    static getAllWindows() {
      return createdWindows.filter((w) => !w.isDestroyed());
    }
  }

  const mockMenu = {
    buildFromTemplate: (template) => {
      menuTemplate = template;
      return { template };
    },
    setApplicationMenu: (menu) => {
      mockMenu.currentMenu = menu;
    },
  };

  const mockDialog = {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    showSaveDialog: async () => ({ canceled: true, filePath: null }),
  };

  const mockIpcMain = {
    handle: (channel, handler) => {
      mockIpcMainHandlers.set(channel, handler);
    },
  };

  const mockContextBridge = {
    exposeInMainWorld: (apiKey, apiObj) => {
      mockExposedApi = { apiKey, apiObj };
    },
  };

  const mockIpcRenderer = {
    invoke: async (channel, ...args) => {
      const handler = mockIpcMainHandlers.get(channel);
      if (!handler) {
        throw new Error(`Unhandled IPC invoke channel: ${channel}`);
      }
      return await handler({}, ...args);
    },
    on: (channel, listener) => {
      if (!mockIpcRendererListeners.has(channel)) {
        mockIpcRendererListeners.set(channel, []);
      }
      mockIpcRendererListeners.get(channel).push(listener);
    },
    removeListener: (channel, listener) => {
      const list = mockIpcRendererListeners.get(channel) || [];
      const idx = list.indexOf(listener);
      if (idx !== -1) list.splice(idx, 1);
    },
  };

  // Setup require interception for "electron"
  const originalRequire = Module.prototype.require;
  Module.prototype.require = function (id) {
    if (id === "electron") {
      return {
        app: mockApp,
        BrowserWindow: MockBrowserWindow,
        Menu: mockMenu,
        dialog: mockDialog,
        ipcMain: mockIpcMain,
        contextBridge: mockContextBridge,
        ipcRenderer: mockIpcRenderer,
      };
    }
    return originalRequire.apply(this, arguments);
  };

  // 1. Run main.cjs
  const mainPath = path.resolve("electron/main.cjs");
  const preloadPath = path.resolve("electron/preload.cjs");

  console.log("=== Electron Headless Validation ===");
  console.log(`[1] Loading main process script: ${mainPath}`);
  require(mainPath);

  if (!appReadyCallback) {
    console.error("FAIL: app.whenReady callback not registered.");
    process.exit(1);
  }

  // Trigger app ready
  appReadyCallback();

  console.log("[2] MainWindow created with preferences:");
  console.log("   - webPreferences:", mockMainWindow.options.webPreferences);

  // Check preload exists
  const configuredPreload = mockMainWindow.options.webPreferences?.preload;
  console.log(`[3] Checking preload path: ${configuredPreload}`);
  if (!configuredPreload || !fs.existsSync(configuredPreload)) {
    console.error("FAIL: Configured preload script does not exist on disk:", configuredPreload);
    process.exit(1);
  } else {
    console.log("   ✓ Preload script exists on disk.");
  }

  // Check loaded source
  console.log(`[4] Window loaded destination:`, {
    loadedFile: mockMainWindow.loadedFile,
    loadedUrl: mockMainWindow.loadedUrl,
  });

  // 2. Run preload.cjs
  console.log(`[5] Loading preload script: ${preloadPath}`);
  require(preloadPath);

  if (!mockExposedApi) {
    console.error("FAIL: contextBridge.exposeInMainWorld was not called.");
    process.exit(1);
  }

  console.log(`   ✓ Exposed API object: "${mockExposedApi.apiKey}" with keys:`, Object.keys(mockExposedApi.apiObj));

  // 3. Validate IPC Contract
  console.log("[6] Validating IPC contract between preload and main...");
  const registeredHandlers = Array.from(mockIpcMainHandlers.keys());
  console.log("   - Registered ipcMain handlers:", registeredHandlers);

  const requiredChannels = ["dialog:openFile", "dialog:saveFile", "fs:readFile", "fs:writeFile"];
  const missingChannels = requiredChannels.filter(c => !mockIpcMainHandlers.has(c));
  if (missingChannels.length > 0) {
    console.error("FAIL: Missing required ipcMain handlers:", missingChannels);
    process.exit(1);
  } else {
    console.log("   ✓ All required IPC channels are handled by main.cjs.");
  }

  // Test IPC round-trip
  console.log("[7] Testing round-trip IPC handlers...");
  const testTempFile = path.resolve("scripts/.test-temp-file.txt");
  try {
    await mockExposedApi.apiObj.writeFile(testTempFile, "Hello Electron Security Check");
    const readBack = await mockExposedApi.apiObj.readFile(testTempFile);
    if (readBack === "Hello Electron Security Check") {
      console.log("   ✓ fs:writeFile and fs:readFile round-trip succeeded.");
    } else {
      console.error("FAIL: Round-trip content mismatch:", readBack);
      process.exit(1);
    }
  } finally {
    if (fs.existsSync(testTempFile)) fs.unlinkSync(testTempFile);
  }

  // Test onMenuAction dispatch
  console.log("[8] Testing menu action dispatch...");
  let receivedAction = null;
  const unsub = mockExposedApi.apiObj.onMenuAction((action) => {
    receivedAction = action;
  });

  // Find and trigger a menu action from template
  let undoItem = null;
  for (const menu of menuTemplate) {
    if (menu.submenu) {
      for (const item of menu.submenu) {
        if (item.label === "Undo") undoItem = item;
      }
    }
  }

  if (!undoItem || typeof undoItem.click !== "function") {
    console.error("FAIL: Undo menu item with click handler not found.");
    process.exit(1);
  }

  undoItem.click();
  if (receivedAction === "edit:undo") {
    console.log("   ✓ Menu action dispatch (edit:undo) succeeded through onMenuAction listener.");
  } else {
    console.error("FAIL: Did not receive expected action: edit:undo, got:", receivedAction);
    process.exit(1);
  }
  unsub();

  // 4. CSP & Protocol Security Evaluation
  console.log("[9] Evaluating CSP and Protocol Security...");
  const indexHtmlContent = fs.readFileSync(path.resolve("dist/index.html"), "utf-8");
  const hasMetaCsp = indexHtmlContent.includes("http-equiv=\"Content-Security-Policy\"") || indexHtmlContent.includes("http-equiv='Content-Security-Policy'");
  const mainSource = fs.readFileSync(mainPath, "utf-8");
  const hasHeaderCsp = mainSource.includes("onHeadersReceived") || mainSource.includes("Content-Security-Policy");
  const hasWindowOpenHandler = mainSource.includes("setWindowOpenHandler");
  const hasWillNavigate = mainSource.includes("will-navigate");
  const contextIsolation = mockMainWindow.options.webPreferences?.contextIsolation;
  const nodeIntegration = mockMainWindow.options.webPreferences?.nodeIntegration;
  const sandbox = mockMainWindow.options.webPreferences?.sandbox;

  console.log("Security Audit Results:");
  console.log(`- contextIsolation: ${contextIsolation} (Expected: true) -> ${contextIsolation === true ? "PASS" : "FAIL"}`);
  console.log(`- nodeIntegration: ${nodeIntegration} (Expected: false) -> ${nodeIntegration === false ? "PASS" : "FAIL"}`);
  console.log(`- sandbox: ${sandbox} (Recommended: true, Actual: ${sandbox})`);
  console.log(`- Meta CSP in dist/index.html: ${hasMetaCsp}`);
  console.log(`- Header CSP in electron/main.cjs: ${hasHeaderCsp}`);
  console.log(`- Navigation restriction (setWindowOpenHandler / will-navigate): ${hasWindowOpenHandler || hasWillNavigate}`);

  console.log("=== Electron Headless Validation Finished ===");
}

run().catch((err) => {
  console.error("Headless validation error:", err);
  process.exit(1);
});
