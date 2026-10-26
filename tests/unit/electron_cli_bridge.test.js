import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { DEFAULT_CLI_BRIDGE_ORIGINS } from "../../electron/cli_bridge_server.js";

function boot(startCliBridgeServer, env = {}) {
  const events = new Map();
  let ready;
  let retry;
  const app = {
    whenReady: () => ({ then: (cb) => { ready = cb; } }),
    on: (name, cb) => events.set(name, cb),
    quit: vi.fn(),
  };
  const window = { once() {}, on() {}, loadURL() {}, webContents: {} };
  const BrowserWindow = vi.fn(function () { return window; });
  const importModule = async (id) => {
    if (id === "./cli_bridge_server.js") return { startCliBridgeServer, DEFAULT_CLI_BRIDGE_ORIGINS };
    if (id.includes("cli_bridge_protocol")) return { CLI_BRIDGE_DEFAULT_PORT: 4179 };
    return { registerLocalCliIpc() {}, registerWebImageIpc() {} };
  };
  const source = fs.readFileSync("electron/main.cjs", "utf8").replaceAll("import(", "importModule(");
  vm.runInNewContext(source, {
    require: (id) => {
      if (id === "electron") return {
        app, BrowserWindow, ipcMain: { handle() {} },
        Menu: { buildFromTemplate() {}, setApplicationMenu() {} },
      };
      if (id === "node:path") return path;
      if (id === "node:fs") return fs;
      if (id === "./packaged_smoke.cjs") return () => {};
      return { registerWorkspaceIpc() {}, setupUpdater() {} };
    },
    __dirname: path.resolve("electron"),
    process: { env, platform: "linux" },
    console: { info: vi.fn(), warn: vi.fn() },
    setTimeout(callback) { retry = callback; return 1; },
    clearTimeout() { retry = null; }, importModule,
  });
  return { ready, app, events, BrowserWindow, retry: () => retry?.() };
}

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

describe("Electron external MCP bridge lifecycle", () => {
  it("starts the default bridge with its default channel registration and closes once on quit", async () => {
    const close = vi.fn(async () => {});
    const start = vi.fn(async () => ({ port: 4179, close }));
    const main = boot(start);
    main.ready();
    await flush();
    expect(main.BrowserWindow).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledWith({ host: "127.0.0.1", port: 4179, origins: [...DEFAULT_CLI_BRIDGE_ORIGINS] });
    const event = { preventDefault: vi.fn() };
    const shutdown = main.events.get("before-quit")(event);
    main.events.get("before-quit")(event);
    await shutdown;
    expect(close).toHaveBeenCalledOnce();
    expect(main.app.quit).toHaveBeenCalledOnce();
    main.events.get("before-quit")(event);
    expect(close).toHaveBeenCalledOnce();
  });

  it("reuses an occupied port without owning its shutdown", async () => {
    const start = vi.fn(async () => { throw Object.assign(new Error("occupied"), { code: "EADDRINUSE" }); });
    const main = boot(start, { VOO_CLI_BRIDGE_PORT: "4180", VOO_CLI_BRIDGE_ORIGINS: " https://example.org, " });
    main.ready();
    await flush();
    expect(start.mock.calls[0][0]).toEqual({ host: "127.0.0.1", port: 4180, origins: [...DEFAULT_CLI_BRIDGE_ORIGINS, "https://example.org"] });
    await main.events.get("before-quit")({ preventDefault() {} });
    expect(main.app.quit).toHaveBeenCalledOnce();
  });

  it("waits for startup before shutting down when quit races with listen", async () => {
    let resolveStart;
    const close = vi.fn(async () => {});
    const main = boot(() => new Promise((resolve) => { resolveStart = resolve; }));
    main.ready();
    await flush();
    const shutdown = main.events.get("before-quit")({ preventDefault() {} });
    expect(main.app.quit).not.toHaveBeenCalled();
    resolveStart({ port: 4179, close });
    await shutdown;
    expect(close).toHaveBeenCalledOnce();
    expect(main.app.quit).toHaveBeenCalledOnce();
  });

  it("acquires the bridge after the previous owner exits and cancels retries on quit", async () => {
    const close = vi.fn(async () => {});
    const start = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("occupied"), { code: "EADDRINUSE" }))
      .mockResolvedValue({ port: 4179, close });
    const main = boot(start);
    main.ready();
    await flush();
    main.retry();
    await flush();
    expect(start).toHaveBeenCalledTimes(2);
    await main.events.get("before-quit")({ preventDefault() {} });
    main.retry();
    expect(close).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledTimes(2);
  });
});
