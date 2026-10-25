import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const children = [];
const mcpServers = [];

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal()),
  spawn: vi.fn(() => {
    // A fake `codex app-server` that answers every JSON-RPC call with a result.
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = vi.fn(() => child.emit("exit"));
    child.stdin.on("data", (chunk) => {
      for (const line of String(chunk).split("\n").filter(Boolean)) {
        const frame = JSON.parse(line);
        if (frame.id == null) continue;
        const result =
          frame.method === "account/read" ? { account: { id: "a" } } : { data: [] };
        child.stdout.write(`${JSON.stringify({ id: frame.id, result })}\n`);
      }
    });
    children.push(child);
    return child;
  }),
}));

vi.mock("../../electron/agent_mcp_server.js", () => ({
  startAgentMcpServer: vi.fn(async () => {
    const mcp = { url: "http://127.0.0.1:0", close: vi.fn(async () => {}) };
    mcpServers.push(mcp);
    return mcp;
  }),
}));

const { registerCodexAgentIpc } = await import("../../electron/codex_agent_bridge.js");
const { startCliBridgeServer, registerCliBridgeChannels } = await import(
  "../../electron/cli_bridge_server.js"
);

const EVENT = { sender: { id: 1, isDestroyed: () => false, once() {} } };

/** Registers the codex agent channels against a capturing ipcMain facade. */
function registerCodex(extra = {}) {
  const handlers = new Map();
  const ipcMain = { handle: (channel, fn) => handlers.set(channel, fn) };
  const registration = registerCodexAgentIpc({
    ipcMain,
    app: {},
    findBinary: () => "/fake/codex",
    findClaudeBinary: () => null,
    findAntigravityBinary: () => null,
    isAuthorized: () => true,
    ...extra,
  });
  return { handlers, registration };
}

let scratch;
let previousTmpdir;

beforeEach(async () => {
  children.length = 0;
  mcpServers.length = 0;
  scratch = await mkdtemp(path.join(tmpdir(), "voo-dispose-test-"));
  previousTmpdir = process.env.TMPDIR;
  // The bridge creates its work dir under os.tmpdir(); isolate it per test.
  process.env.TMPDIR = scratch;
});

afterEach(async () => {
  process.env.TMPDIR = previousTmpdir;
  await rm(scratch, { recursive: true, force: true });
});

describe("codex agent bridge dispose", () => {
  it("connect then dispose kills the child, closes the MCP server and removes the temp dir", async () => {
    const { handlers, registration } = registerCodex();
    const result = await handlers.get("voo:codex-connect")(EVENT, {});
    expect(result.ok).toBe(true);
    expect(children).toHaveLength(1);
    expect(mcpServers).toHaveLength(1);
    expect(await readdir(scratch)).toHaveLength(1);

    await registration.dispose();

    expect(children[0].kill).toHaveBeenCalled();
    expect(mcpServers[0].close).toHaveBeenCalledOnce();
    expect(await readdir(scratch)).toEqual([]);
  });

  it("is safe when connect never ran", async () => {
    const { registration } = registerCodex();
    await expect(registration.dispose()).resolves.toBeUndefined();
    expect(children).toHaveLength(0);
  });

  it("is idempotent", async () => {
    const { handlers, registration } = registerCodex();
    await handlers.get("voo:codex-connect")(EVENT, {});
    await registration.dispose();
    await expect(registration.dispose()).resolves.toBeUndefined();
    expect(mcpServers[0].close).toHaveBeenCalledOnce();
  });

  it("refuses new connections after dispose", async () => {
    const { handlers, registration } = registerCodex();
    await registration.dispose();
    const result = await handlers.get("voo:codex-connect")(EVENT, {});
    expect(result).toEqual({ ok: false, code: "cli.connectionClosed" });
    expect(children).toHaveLength(0);
  });

  it("still runs the Electron before-quit path through the same disposer", async () => {
    let quit;
    const app = { once: (name, cb) => name === "before-quit" && (quit = cb) };
    const { handlers } = registerCodex({ app });
    await handlers.get("voo:codex-connect")(EVENT, {});
    quit();
    await vi.waitFor(() => expect(mcpServers[0].close).toHaveBeenCalledOnce());
    expect(children[0].kill).toHaveBeenCalled();
    await vi.waitFor(async () => expect(await readdir(scratch)).toEqual([]));
  });
});

describe("standalone bridge close()", () => {
  const startBridge = () => {
    let handlers;
    return startCliBridgeServer({
      port: 0,
      // Wire the codex channels with stubbed binaries; the facade is unused
      // because the test calls the captured handlers directly.
      register: () => {
        const registered = registerCodex();
        handlers = registered.handlers;
        return registered.registration;
      },
    }).then((bridge) => ({ bridge, handlers: () => handlers }));
  };

  it("connect then close() releases the child, MCP server and temp dir", async () => {
    const { bridge, handlers } = await startBridge();
    await handlers().get("voo:codex-connect")(EVENT, {});
    expect(await readdir(scratch)).toHaveLength(1);

    await bridge.close();

    expect(children[0].kill).toHaveBeenCalled();
    expect(mcpServers[0].close).toHaveBeenCalledOnce();
    expect(await readdir(scratch)).toEqual([]);
  });

  it("close() without connect is safe, and twice is safe", async () => {
    const { bridge } = await startBridge();
    await bridge.close();
    await bridge.close();
    expect(children).toHaveLength(0);
  });

  it("close() tolerates a registrar that returns nothing", async () => {
    const bridge = await startCliBridgeServer({ port: 0, register: () => {} });
    await expect(bridge.close()).resolves.toBeUndefined();
  });

  it("default channel registration exposes a dispose function", async () => {
    const ipcMain = { handle() {} };
    const registration = registerCliBridgeChannels({ ipcMain });
    expect(registration.dispose).toBeTypeOf("function");
    await registration.dispose();
  });
});
