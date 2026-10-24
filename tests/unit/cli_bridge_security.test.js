import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { startCliBridgeServer } from "../../electron/cli_bridge_server.js";
import { createWsIpcAdapter } from "../../electron/ws_ipc_adapter.js";

const servers = [];

async function startServer() {
  const server = await startCliBridgeServer({ port: 0 });
  servers.push(server);
  return server;
}

function connect(port, options = {}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`, options);
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

async function expectRefused(port, options) {
  await expect(connect(port, options)).rejects.toThrow();
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("CLI bridge security", () => {
  it("accepts an exact configured origin", async () => {
    const server = await startServer();
    const socket = await connect(server.port, { origin: "http://localhost:5173" });
    socket.close();
  });

  it("refuses a localhost port outside the origin allowlist", async () => {
    const server = await startServer();
    await expectRefused(server.port, { origin: "http://localhost:3000" });
  });

  it("refuses a missing Origin without the session token", async () => {
    const server = await startServer();
    await expectRefused(server.port);
  });

  it("accepts a missing Origin with the session token", async () => {
    const server = await startServer();
    const socket = await connect(server.port, {
      headers: { "x-voo-cli-bridge-token": process.env.VOO_CLI_BRIDGE_TOKEN },
    });
    socket.close();
  });

  it("rejects an unlisted IPC channel", async () => {
    const adapter = createWsIpcAdapter();
    const sent = [];
    const socket = {
      on(event, handler) { if (event === "message") this.onMessage = handler; },
      send(payload) { sent.push(JSON.parse(payload)); },
      close() {},
    };
    adapter.attach(socket);
    await socket.onMessage(JSON.stringify({
      type: "invoke", id: "1", channel: "private:channel", args: [],
    }));
    expect(sent).toEqual([{
      type: "result", id: "1", ok: false, error: "cli.unknownChannel",
    }]);
  });
});
