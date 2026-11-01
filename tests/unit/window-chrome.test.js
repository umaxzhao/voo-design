import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
const require = createRequire(import.meta.url);
const { windowChromeOptions, attachWindowChrome, registerWindowControls } = require("../../electron/window-chrome.cjs");
const { createCloseGuard } = require("../../electron/close-guard.cjs");

function fixture() {
  const handlers = new Map();
  const contents = Object.assign(new EventEmitter(), { mainFrame: {}, isDestroyed: () => false,
    send: vi.fn(), executeJavaScript: vi.fn(async () => true) });
  let maximized = false;
  const win = Object.assign(new EventEmitter(), {
    webContents: contents, isDestroyed: () => false, isMaximized: () => maximized,
    minimize: vi.fn(), maximize: vi.fn(() => { maximized = true; win.emit("maximize"); }),
    unmaximize: vi.fn(() => { maximized = false; win.emit("unmaximize"); }),
    close: vi.fn(), setAutoHideMenuBar: vi.fn(), setMenuBarVisibility: vi.fn(),
  });
  registerWindowControls({ ipcMain: { handle: (key, callback) => handlers.set(key, callback) }, getWindow: () => win });
  const event = { sender: contents, senderFrame: contents.mainFrame };
  return { win, handlers, event };
}

describe("native desktop window chrome", () => {
  it.each(["linux", "win32"])("uses frameless %s chrome without an Alt-revealed native menu", platform => {
    expect(windowChromeOptions(platform)).toEqual({ frame: false, autoHideMenuBar: false });
    const { win } = fixture();
    attachWindowChrome(win, platform);
    expect(win.setMenuBarVisibility).toHaveBeenCalledWith(false);
    expect(win.setAutoHideMenuBar).toHaveBeenCalledWith(false);
    win.maximize(); win.unmaximize();
    expect(win.webContents.send.mock.calls).toEqual([["window:maximized", true], ["window:maximized", false]]);
  });

  it("retains native macOS traffic lights and the application menu", () => {
    expect(windowChromeOptions("darwin")).toMatchObject({ titleBarStyle: "hiddenInset", trafficLightPosition: { x: 14, y: 14 } });
    const { win } = fixture(); attachWindowChrome(win, "darwin");
    expect(win.setMenuBarVisibility).not.toHaveBeenCalled();
  });

  it("dispatches minimize, maximize/restore and close to the owning window", () => {
    const { win, handlers, event } = fixture();
    handlers.get("window:minimize")(event); expect(win.minimize).toHaveBeenCalledOnce();
    expect(handlers.get("window:toggleMaximize")(event)).toEqual({ maximized: true });
    expect(handlers.get("window:toggleMaximize")(event)).toEqual({ maximized: false });
    expect(handlers.get("window:isMaximized")(event)).toBe(false);
    handlers.get("window:close")(event); expect(win.close).toHaveBeenCalledOnce();
  });

  it("refuses other windows and nested frames", () => {
    const { handlers, event } = fixture();
    expect(() => handlers.get("window:close")({ ...event, sender: {} })).toThrow("owning main frame");
    expect(() => handlers.get("window:minimize")({ ...event, senderFrame: {} })).toThrow("owning main frame");
  });

  it("lets the existing close guard keep dirty work open", async () => {
    const { win, handlers, event } = fixture();
    let destroyed = false;
    win.close.mockImplementation(() => {
      let prevented = false;
      win.emit("close", { preventDefault: () => { prevented = true; } });
      if (!prevented) destroyed = true;
    });
    const dialog = { showMessageBox: vi.fn(async () => ({ response: 0 })) };
    createCloseGuard({ app: { getLocale: () => "en" }, dialog, getWindow: () => win }).attach(win);
    handlers.get("window:close")(event);
    await vi.waitFor(() => expect(dialog.showMessageBox).toHaveBeenCalledOnce());
    expect(destroyed).toBe(false);
    dialog.showMessageBox.mockResolvedValue({ response: 1 });
    handlers.get("window:close")(event);
    await vi.waitFor(() => expect(destroyed).toBe(true));
  });
});
