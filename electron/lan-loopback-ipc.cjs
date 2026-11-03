const path = require("node:path");
const fs = require("node:fs");

function registerLoopbackIpc(ipcMain, app, getWindow) {
  let service = null, starting = null;
  const assertOwner = event => {
    if (!getWindow() || event.sender !== getWindow().webContents) throw new Error("Untrusted loopback request");
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
    return { address: service.address, port: service.port, room: service.room,
      hostToken: service.hostToken, guestToken: service.guestToken };
  });
  ipcMain.handle("collab:loopback-stop", async event => { assertOwner(event); await stop(); });
  return { stop };
}

module.exports = { registerLoopbackIpc };
