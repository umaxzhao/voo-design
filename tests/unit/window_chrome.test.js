import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const {
  windowChromeOptions,
  attachWindowChrome,
  registerWindowControls,
} = createRequire(import.meta.url)("../../electron/window-chrome.cjs");

function linuxWindow() {
  const handlers = new Map();
  const mainFrame = { id: "main-frame" };
  const win = {
    destroyed: false,
    maximized: false,
    menuVisible: true,
    autoHideMenuBar: true,
    mainFrame,
    webContents: {
      destroyed: false,
      mainFrame,
      send: vi.fn(),
      isDestroyed() { return this.destroyed; },
    },
    isDestroyed() { return this.destroyed; },
    isMaximized() { return this.maximized; },
    setAutoHideMenuBar: vi.fn(function setAutoHideMenuBar(value) { this.autoHideMenuBar = value; }),
    setMenuBarVisibility: vi.fn(function setMenuBarVisibility(value) { this.menuVisible = value; }),
    on: vi.fn((event, handler) => handlers.set(event, handler)),
    minimize: vi.fn(),
    maximize: vi.fn(function maximize() {
      this.maximized = true;
      handlers.get("maximize")?.();
    }),
    unmaximize: vi.fn(function unmaximize() {
      this.maximized = false;
      handlers.get("unmaximize")?.();
    }),
    close: vi.fn(),
    destroy: vi.fn(),
  };
  return { win, handlers, mainFrame };
}

describe("Linux window chrome", () => {
  it("uses a frameless Linux window and keeps the native title bar on macOS/Windows", () => {
    expect(windowChromeOptions("linux")).toEqual({ frame: false, autoHideMenuBar: false });
    expect(windowChromeOptions("darwin")).toEqual({
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 14, y: 14 },
    });
    expect(windowChromeOptions("win32")).toEqual({
      titleBarStyle: "default",
      trafficLightPosition: { x: 14, y: 14 },
    });
  });

  it("hides the Linux menu bar without uninstalling the application menu accelerators", () => {
    const { win } = linuxWindow();
    attachWindowChrome(win, "linux");
    expect(win.setAutoHideMenuBar).toHaveBeenCalledWith(false);
    expect(win.setMenuBarVisibility).toHaveBeenCalledWith(false);
    expect(win.on).toHaveBeenCalledWith("maximize", expect.any(Function));
    expect(win.on).toHaveBeenCalledWith("unmaximize", expect.any(Function));
  });

  it("pushes the maximized state to the renderer on native transitions", () => {
    const { win, handlers } = linuxWindow();
    attachWindowChrome(win, "linux");
    win.maximized = true;
    handlers.get("maximize")();
    expect(win.webContents.send).toHaveBeenLastCalledWith("window:maximized", true);
    win.maximized = false;
    handlers.get("unmaximize")();
    expect(win.webContents.send).toHaveBeenLastCalledWith("window:maximized", false);
  });

  it("does not send to a destroyed window or renderer", () => {
    const { win, handlers } = linuxWindow();
    attachWindowChrome(win, "linux");
    win.destroyed = true;
    handlers.get("maximize")();
    expect(win.webContents.send).not.toHaveBeenCalled();
    win.destroyed = false;
    win.webContents.destroyed = true;
    handlers.get("maximize")();
    expect(win.webContents.send).not.toHaveBeenCalled();
  });

  it("leaves macOS and Windows chrome entirely to the OS", () => {
    for (const platform of ["darwin", "win32"]) {
      const { win } = linuxWindow();
      attachWindowChrome(win, platform);
      expect(win.setAutoHideMenuBar).not.toHaveBeenCalled();
      expect(win.setMenuBarVisibility).not.toHaveBeenCalled();
      expect(win.on).not.toHaveBeenCalled();
    }
  });
});

describe("Linux window control IPC", () => {
  function fixture() {
    const { win, mainFrame } = linuxWindow();
    const handlers = new Map();
    const ipcMain = { handle: vi.fn((channel, handler) => handlers.set(channel, handler)) };
    registerWindowControls({ ipcMain, getWindow: () => win });
    const event = { sender: win.webContents, senderFrame: mainFrame };
    return { win, mainFrame, handlers, event };
  }

  it("registers only the four window commands", () => {
    const { handlers } = fixture();
    expect([...handlers.keys()].sort()).toEqual([
      "window:close",
      "window:isMaximized",
      "window:minimize",
      "window:toggleMaximize",
    ]);
  });

  it("minimizes, toggles maximize/restore and reports the native state", () => {
    const { win, handlers, event } = fixture();
    expect(handlers.get("window:isMaximized")(event)).toBe(false);
    handlers.get("window:minimize")(event);
    expect(win.minimize).toHaveBeenCalledOnce();
    expect(handlers.get("window:toggleMaximize")(event)).toEqual({ maximized: true });
    expect(win.maximize).toHaveBeenCalledOnce();
    expect(handlers.get("window:isMaximized")(event)).toBe(true);
    expect(handlers.get("window:toggleMaximize")(event)).toEqual({ maximized: false });
    expect(win.unmaximize).toHaveBeenCalledOnce();
  });

  it("closes through the shared close guard path, never destroy()", () => {
    const { win, handlers, event } = fixture();
    handlers.get("window:close")(event);
    expect(win.close).toHaveBeenCalledOnce();
    expect(win.destroy).not.toHaveBeenCalled();
  });

  it("rejects IPC from a non-owning renderer or subframe", () => {
    const { win, handlers, event, mainFrame } = fixture();
    expect(() => handlers.get("window:minimize")({ ...event, sender: {} })).toThrow(/owning main frame/);
    expect(() => handlers.get("window:minimize")({ ...event, senderFrame: { id: "sub" } })).toThrow(/owning main frame/);
    expect(() => handlers.get("window:minimize")({ sender: win.webContents, senderFrame: mainFrame })).not.toThrow();
  });

  it("fails closed when the window is gone", () => {
    const { win, handlers, event } = fixture();
    win.destroyed = true;
    expect(() => handlers.get("window:isMaximized")(event)).toThrow(/Window unavailable/);
  });
});
