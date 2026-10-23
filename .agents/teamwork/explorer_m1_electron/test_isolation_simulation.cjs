const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const assert = require("assert");

// Mocking electron exactly as adversarial_isolation_electron_safety.test.js does
const ipcMainHandlers = new Map();
const ipcRendererListeners = new Map();
let exposedApi = null;
let mainWindowInstance = null;
let appReadyCb = null;

const mockApp = {
  name: "VOO Design",
  whenReady: () => ({
    then: (cb) => {
      appReadyCb = cb;
      return Promise.resolve();
    },
  }),
  on: () => {},
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
  loadURL() {}
  loadFile() {}
  on() {}
  once() {}
  show() {}
  isDestroyed() { return this.destroyed; }
  static getAllWindows() { return [mainWindowInstance]; }
}

const mockMenu = {
  buildFromTemplate: (tpl) => ({ template: tpl }),
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
  // Test that requiring proposed_workspace_manager with mock electron works
  const wm = require("./proposed_workspace_manager.cjs");
  wm.registerWorkspaceIpc(mockIpcMain, () => mainWindowInstance);

  assert(ipcMainHandlers.has("workspace:getConfig"));
  assert(ipcMainHandlers.has("workspace:chooseDir"));
  assert(ipcMainHandlers.has("workspace:setDir"));
  assert(ipcMainHandlers.has("workspace:scanFiles"));
  assert(ipcMainHandlers.has("workspace:readFileBytes"));
  assert(ipcMainHandlers.has("workspace:writeFileBytes"));
  assert(ipcMainHandlers.has("workspace:renameFile"));
  assert(ipcMainHandlers.has("workspace:moveToTrash"));
  assert(ipcMainHandlers.has("workspace:deletePermanently"));
  assert(ipcMainHandlers.has("workspace:revealInFinder"));

  console.log("✓ All workspace IPC handlers registered successfully with mock electron");
} finally {
  Module.prototype.require = originalReq;
}
