import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import Module from "node:module";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

describe("Adversarial Challenger: Runtime Isolation & Artifact Leaks", () => {
  const distDir = path.resolve("dist");
  const assetsDir = path.join(distDir, "assets");

  it("dist directory exists and contains index.html and assets", () => {
    expect(fs.existsSync(distDir)).toBe(true);
    expect(fs.existsSync(path.join(distDir, "index.html"))).toBe(true);
    expect(fs.existsSync(assetsDir)).toBe(true);
  });

  it("strictly zero parent repository path leaks in production build artifacts", () => {
    // Set VOO_LEAK_CHECK_PATH to a local path that must never appear in the build.
    const parentRepoString = process.env.VOO_LEAK_CHECK_PATH;
    if (!parentRepoString) return;
    const files = fs.readdirSync(assetsDir);
    const leakingFiles = [];

    for (const f of files) {
      const fullPath = path.join(assetsDir, f);
      const stat = fs.statSync(fullPath);
      if (stat.isFile() && (f.endsWith(".js") || f.endsWith(".css") || f.endsWith(".html"))) {
        const content = fs.readFileSync(fullPath, "utf-8");
        if (content.includes(parentRepoString)) {
          leakingFiles.push(f);
        }
      }
    }

    expect(leakingFiles).toEqual([]);
  });

  it("strictly zero hardcoded /Users/ or absolute filesystem path leaks in dist", () => {
    const files = fs.readdirSync(assetsDir);
    const leakingFiles = [];

    for (const f of files) {
      if (f.startsWith("ort.")) continue; // exclude vendor minified onnx runtime
      const fullPath = path.join(assetsDir, f);
      const stat = fs.statSync(fullPath);
      if (stat.isFile() && (f.endsWith(".js") || f.endsWith(".css"))) {
        const content = fs.readFileSync(fullPath, "utf-8");
        // Look for literal quoted user paths like "/Users/..."
        if (content.match(/["']\/Users\/[^"']+["']/)) {
          leakingFiles.push(f);
        }
      }
    }

    expect(leakingFiles).toEqual([]);
  });

  it("all static/dynamic imports and CSS url references resolve without 404s", () => {
    const files = fs.readdirSync(assetsDir);
    const jsFiles = files.filter((f) => f.endsWith(".js"));
    const cssFiles = files.filter((f) => f.endsWith(".css"));
    const missing = [];

    // Check CSS font and asset URLs
    for (const cssFile of cssFiles) {
      const cssContent = fs.readFileSync(path.join(assetsDir, cssFile), "utf-8");
      const urlMatches = [...cssContent.matchAll(/url\(([^)]+)\)/g)];
      for (const m of urlMatches) {
        const clean = m[1].replace(/['"]/g, "").trim();
        if (clean.startsWith("data:")) continue;
        const target = path.resolve(assetsDir, clean);
        if (!fs.existsSync(target)) {
          missing.push({ source: cssFile, ref: clean, resolved: target });
        }
      }
    }

    // Check JS module imports
    for (const jsFile of jsFiles) {
      const code = fs.readFileSync(path.join(assetsDir, jsFile), "utf-8");
      // Static imports
      for (const m of code.matchAll(/from\s*["'](\.[^"']+)["']/g)) {
        const target = path.resolve(assetsDir, m[1]);
        if (!fs.existsSync(target)) missing.push({ source: jsFile, ref: m[1], resolved: target });
      }
      // Dynamic imports
      for (const m of code.matchAll(/import\s*\(\s*["'](\.[^"']+)["']\s*\)/g)) {
        const target = path.resolve(assetsDir, m[1]);
        if (!fs.existsSync(target)) missing.push({ source: jsFile, ref: m[1], resolved: target });
      }
      // Vite preload
      for (const m of code.matchAll(/__vitePreload\(\(\)\s*=>\s*import\(["'](\.[^"']+)["']\)/g)) {
        const target = path.resolve(assetsDir, m[1]);
        if (!fs.existsSync(target)) missing.push({ source: jsFile, ref: m[1], resolved: target });
      }
      // Assets instantiated via new URL
      for (const m of code.matchAll(/new\s+URL\(["'](\.[^"']+)["'],\s*import\.meta\.url\)/g)) {
        const target = path.resolve(assetsDir, m[1]);
        if (!fs.existsSync(target)) missing.push({ source: jsFile, ref: m[1], resolved: target });
      }
    }

    expect(missing).toEqual([]);
  });

  it("ONNX Runtime WASM exists and is non-empty", () => {
    // The external ONNX export loads the public copy through wasmPaths.
    const onnxWasm = path.join(distDir, "ort/ort-wasm-simd-threaded.jsep.wasm");
    expect(fs.existsSync(onnxWasm)).toBe(true);
    expect(fs.statSync(onnxWasm).size).toBeGreaterThan(20000000);
    const header = fs.readFileSync(onnxWasm).subarray(0, 4);
    expect([...header]).toEqual([0, 97, 115, 109]);
    const bundledWasm = fs.readdirSync(assetsDir).filter((name) => name.endsWith(".wasm"));
    // ONNX stays external; the opt-in native scene core is a separate small asset.
    expect(bundledWasm.filter(name => !/^voo_engine_bg-[\w-]+\.wasm$/.test(name))).toEqual([]);
    expect(bundledWasm).toHaveLength(1);
    const engine = fs.readFileSync(path.join(assetsDir, bundledWasm[0]));
    expect(WebAssembly.validate(engine)).toBe(true);
    expect(engine.length).toBeLessThan(100 * 1024);
  });
});

describe("Adversarial Challenger: Electron Headless Boot & IPC Contracts", () => {
  const mainScriptPath = path.resolve("electron/main.cjs");
  const preloadScriptPath = path.resolve("electron/preload.cjs");

  it("electron/main.cjs and electron/preload.cjs exist on disk", () => {
    expect(fs.existsSync(mainScriptPath)).toBe(true);
    expect(fs.existsSync(preloadScriptPath)).toBe(true);
  });

  it("validates electron headless initialization, window config, and IPC contracts", async () => {
    const ipcMainHandlers = new Map();
    const ipcRendererListeners = new Map();
    let exposedApi = null;
    let mainWindowInstance = null;
    let appReadyCb = null;
    let menuTemplate = null;

    const appEvents = new Map();
    const mockApp = {
      name: "VOO Design",
      whenReady: () => ({
        then: (cb) => {
          appReadyCb = cb;
          return Promise.resolve();
        },
      }),
      on: (event, cb) => appEvents.set(event, cb),
      quit: () => {},
    };

    class MockWebContents {
      constructor() {
        this.sent = [];
      }
      send(channel, ...args) {
        this.sent.push({ channel, args });
        const list = ipcRendererListeners.get(channel) || [];
        for (const fn of list) fn({}, ...args);
      }
    }

    class MockBrowserWindow {
      constructor(options) {
        this.options = options;
        this.webContents = new MockWebContents();
        this.destroyed = false;
        mainWindowInstance = this;
      }
      loadURL(url) {
        this.loadedUrl = url;
      }
      loadFile(file) {
        this.loadedFile = file;
      }
      on() {}
      once() {}
      show() {}
      isDestroyed() {
        return this.destroyed;
      }
      static getAllWindows() {
        return [mainWindowInstance];
      }
    }

    const mockMenu = {
      buildFromTemplate: (tpl) => {
        menuTemplate = tpl;
        return { template: tpl };
      },
      setApplicationMenu: () => {},
    };

    const mockDialog = {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      showSaveDialog: async () => ({ canceled: true, filePath: null }),
    };

    const mockIpcMain = {
      handle: (ch, fn) => {
        ipcMainHandlers.set(ch, fn);
      },
    };

    const mockContextBridge = {
      exposeInMainWorld: (key, obj) => {
        exposedApi = { key, obj };
      },
    };

    const mockIpcRenderer = {
      invoke: async (ch, ...args) => {
        const handler = ipcMainHandlers.get(ch);
        if (!handler) throw new Error(`Missing handler for ${ch}`);
        return await handler({}, ...args);
      },
      on: (ch, fn) => {
        if (!ipcRendererListeners.has(ch)) ipcRendererListeners.set(ch, []);
        ipcRendererListeners.get(ch).push(fn);
      },
      removeListener: (ch, fn) => {
        const list = ipcRendererListeners.get(ch) || [];
        const idx = list.indexOf(fn);
        if (idx !== -1) list.splice(idx, 1);
      },
    };

    const originalReq = Module.prototype.require;
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
      return originalReq.apply(this, arguments);
    };

    try {
      // 1. Require main
      require(mainScriptPath);
      expect(typeof appReadyCb).toBe("function");

      // Trigger app.whenReady()
      appReadyCb();

      // Check window preferences
      expect(mainWindowInstance).toBeDefined();
      const webPrefs = mainWindowInstance.options.webPreferences;
      expect(webPrefs.contextIsolation).toBe(true);
      expect(webPrefs.nodeIntegration).toBe(false);
      expect(path.isAbsolute(webPrefs.preload)).toBe(true);
      expect(fs.existsSync(webPrefs.preload)).toBe(true);

      // 2. Require preload
      require(preloadScriptPath);
      expect(exposedApi).toBeDefined();
      expect(exposedApi.key).toBe("electronAPI");
      expect(exposedApi.obj.isElectron).toBe(true);
      expect(typeof exposedApi.obj.openFileDialog).toBe("function");
      expect(typeof exposedApi.obj.saveFileDialog).toBe("function");
      expect(typeof exposedApi.obj.readFile).toBe("function");
      expect(typeof exposedApi.obj.writeFile).toBe("function");
      expect(typeof exposedApi.obj.onMenuAction).toBe("function");

      // 3. Verify IPC contract channels
      expect(ipcMainHandlers.has("dialog:openFile")).toBe(true);
      expect(ipcMainHandlers.has("dialog:saveFile")).toBe(true);
      expect(ipcMainHandlers.has("fs:readFile")).toBe(true);
      expect(ipcMainHandlers.has("fs:writeFile")).toBe(true);

      // 4. Test fs round-trip
      const tempFile = path.resolve("tests/unit/.test-ipc-roundtrip.json");
      try {
        const testData = JSON.stringify({ version: "1.0.0", test: true });
        await exposedApi.obj.writeFile(tempFile, testData);
        const readContent = await exposedApi.obj.readFile(tempFile);
        expect(readContent).toBe(testData);
      } finally {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      }

      // 5. Test Menu Action Dispatch
      let actionReceived = null;
      const unsub = exposedApi.obj.onMenuAction((act) => {
        actionReceived = act;
      });

      // Find 'Save' in menu template
      let saveItem = null;
      for (const m of menuTemplate) {
        if (m.submenu) {
          for (const item of m.submenu) {
            if (item.label === "Save") saveItem = item;
          }
        }
      }
      expect(saveItem).toBeDefined();
      saveItem.click();
      expect(actionReceived).toBe("file:save");
      unsub();
    } finally {
      await appEvents.get("before-quit")?.({ preventDefault() {} });
      Module.prototype.require = originalReq;
    }
  });

  it("surfaces security vulnerabilities: Missing CSP, unconstrained fs IPC, and missing navigation guards", () => {
    const mainContent = fs.readFileSync(mainScriptPath, "utf-8");
    const indexHtmlContent = fs.readFileSync(path.resolve("dist/index.html"), "utf-8");

    // 1. Content Security Policy (CSP) Check
    const hasHeaderCsp = mainContent.includes("onHeadersReceived") || mainContent.includes("Content-Security-Policy");
    const hasMetaCsp = indexHtmlContent.includes("Content-Security-Policy");

    // EMPIRICAL OBSERVATION: Neither main.cjs nor index.html enforces a Content Security Policy
    expect(hasHeaderCsp).toBe(false);
    expect(hasMetaCsp).toBe(false);

    // 2. Navigation Restrictions (setWindowOpenHandler / will-navigate) Check
    const hasWindowOpenHandler = mainContent.includes("setWindowOpenHandler");
    const hasWillNavigate = mainContent.includes("will-navigate");

    // EMPIRICAL OBSERVATION: Navigation restrictions are missing
    expect(hasWindowOpenHandler).toBe(false);
    expect(hasWillNavigate).toBe(false);

    // 3. Unconstrained fs IPC
    // fs:readFile and fs:writeFile do not validate or constrain filePath against allowed directories
    const hasPathValidation = mainContent.includes("normalize") && mainContent.includes("startsWith");
    expect(hasPathValidation).toBe(false);
  });
});
