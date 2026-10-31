import { describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import http from "node:http";
import { once } from "node:events";
import { startCliBridgeServer } from "../../electron/cli_bridge_server.js";
import { CLI_BRIDGE_CHANNEL as C, CLI_BRIDGE_EVENT as E } from "../../src/shared/cli_bridge_protocol.js";

describe("Loopback preview HTTP boundary", () => {
  it("requires an unguessable source session, rejects cross-site snapshots and DNS rebinding, and never caches images", async () => {
    const bridge = await startCliBridgeServer({ port: 0 });
    const socket = new WebSocket(`ws://127.0.0.1:${bridge.port}`, { headers: { "x-voo-cli-bridge-token": bridge.token } });
    try {
      await once(socket, "open");
      const call = (channel, args = []) => new Promise(resolve => {
        socket.once("message", data => resolve(JSON.parse(data).value));
        socket.send(JSON.stringify({ type: "invoke", id: channel, channel, args }));
      });
      await call(C.MCP_REGISTER_CANVAS, [{ documentId: "document-a" }]);
      const { previewUrl } = await call(C.MCP_STATUS);
      const page = await fetch(previewUrl);
      expect(page.status).toBe(200);
      expect(page.headers.get("cache-control")).toBe("no-store");
      expect(page.headers.get("referrer-policy")).toBe("no-referrer");
      expect(page.headers.get("content-security-policy")).toContain("default-src 'none'");
      expect(await page.text()).not.toContain(bridge.token);
      expect((await fetch(`${previewUrl}/snapshot`, { headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
      expect((await fetch(previewUrl, { method: "POST" })).status).toBe(405);
      const missing = new URL(previewUrl);
      missing.pathname = `/preview/${"0".repeat(48)}`;
      expect((await fetch(missing)).status).toBe(410);
      const rebound = await new Promise((resolve, reject) => {
        http.get(previewUrl, { headers: { host: "attacker.example" } }, response => {
          response.resume(); resolve(response.statusCode);
        }).on("error", reject);
      });
      expect(rebound).toBe(403);
      socket.on("message", data => {
        const frame = JSON.parse(data);
        if (frame.channel !== E.MCP_TOOL_CALL) return;
        socket.send(JSON.stringify({ type: "invoke", id: "image", channel: C.MCP_TOOL_RESULT,
          args: [{ id: frame.payload.id, ok: true, value: { dataUrl: "data:image/png;base64,AAAA", width: 1, height: 1 } }] }));
      });
      const snapshot = await fetch(`${previewUrl}/snapshot`);
      expect(snapshot.headers.get("access-control-allow-origin")).toBeNull();
      expect(snapshot.headers.get("cache-control")).toBe("no-store");
      expect(await snapshot.json()).toMatchObject({ dataUrl: "data:image/png;base64,AAAA", width: 1 });
    } finally { socket.close(); await bridge.close(); }
  });
});
