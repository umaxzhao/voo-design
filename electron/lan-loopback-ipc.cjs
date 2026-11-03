const path = require("node:path");
const fs = require("node:fs");
const { fileURLToPath } = require("node:url");

function isTrustedEditorUrl(value, app) {
  try {
    const url = new URL(value);
    if (url.protocol === "file:") {
      return path.resolve(fileURLToPath(url)) === path.resolve(app.getAppPath(), "dist", "index.html");
    }
    const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
    const devUrl = process.env.VITE_DEV_SERVER_URL || (isDev ? "http://localhost:5173" : null);
    if (!devUrl) return false;
    const expected = new URL(devUrl);
    return ["http:", "https:"].includes(expected.protocol) && !url.username && !url.password &&
      url.origin === expected.origin && url.pathname === expected.pathname;
  } catch { return false; }
}

function registerLoopbackIpc(ipcMain, app, getWindow) {
  let service = null, starting = null;
  const assertOwner = event => {
    const window = getWindow(), owner = window?.webContents, frame = event?.senderFrame;
    if (!owner || owner.isDestroyed?.() || event?.sender !== owner || !frame || frame.isDestroyed?.() || frame !== owner.mainFrame ||
        !isTrustedEditorUrl(frame.url, app)) throw new Error("Untrusted loopback request");
  };
  async function stop() {
    if (starting) await starting;
    if (service) { const current = service; service = null; await current.close(); }
  }
  ipcMain.handle("collab:loopback-start", async event => {
    assertOwner(event);
    if (!fs.existsSync(path.join(app.getAppPath(), "dist", "index.html"))) throw new Error("Editor build unavailable");
    if (!service && !starting) starting = import("./lan-loopback-signaling.js").then(({ startLoopbackSignaling }) =>
      startLoopbackSignaling({ staticRoot: path.join(app.getAppPath(), "dist") })).then(value => { service = value; })
      .finally(() => { starting = null; });
    if (starting) await starting;
    try { assertOwner(event); }
    catch (error) { await stop(); throw error; }
    return { address: service.address, port: service.port, room: service.room,
      hostToken: service.hostToken, guestToken: service.guestToken };
  });
  ipcMain.handle("collab:loopback-stop", async event => { assertOwner(event); await stop(); });
  return { stop };
}

module.exports = { registerLoopbackIpc };
