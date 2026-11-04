const CUSTOM_PLATFORMS = new Set(["linux", "win32"]);

/** Keep macOS on native chrome; Linux & Windows own the whole frame. */
exports.windowChromeOptions = function windowChromeOptions(platform) {
  return CUSTOM_PLATFORMS.has(platform)
    ? { frame: false, autoHideMenuBar: false }
    : { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 14, y: 14 } };
};

exports.attachWindowChrome = function attachWindowChrome(win, platform) {
  if (!CUSTOM_PLATFORMS.has(platform)) return;
  // The application menu stays installed so its accelerators keep working, but
  // it never paints a second bar above the editor (Alt must not reveal it).
  win.setAutoHideMenuBar(false);
  win.setMenuBarVisibility(false);
  const publish = () => {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send("window:maximized", win.isMaximized());
    }
  };
  win.on("maximize", publish);
  win.on("unmaximize", publish);
};

exports.registerWindowControls = function registerWindowControls({ ipcMain, getWindow }) {
  const ownedWindow = (event) => {
    const win = getWindow();
    if (!win || win.isDestroyed()) throw new Error("Window unavailable");
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) {
      throw new Error("Window controls require the owning main frame");
    }
    return win;
  };
  ipcMain.handle("window:isMaximized", (event) => ownedWindow(event).isMaximized());
  ipcMain.handle("window:minimize", (event) => { ownedWindow(event).minimize(); });
  ipcMain.handle("window:toggleMaximize", (event) => {
    const win = ownedWindow(event);
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return { maximized: win.isMaximized() };
  });
  // close() goes through the shared unsaved-work guard, never destroy().
  ipcMain.handle("window:close", (event) => { ownedWindow(event).close(); });
};
