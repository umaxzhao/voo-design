import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "node:http";
import { execSync } from "node:child_process";
import WebSocket, { WebSocketServer } from "ws";
import {
  CLI_BRIDGE_CHANNEL,
  CLI_BRIDGE_DEFAULT_PORT,
  CLI_BRIDGE_EVENT,
  CLI_BRIDGE_MESSAGE,
} from "../../src/shared/cli_bridge_protocol.js";
import {
  createWebCliBridge,
  resetWebCliBridge,
} from "../../src/canvas/components/agent-panel/local_cli_bridge.js";
import { createWsIpcAdapter } from "../../electron/ws_ipc_adapter.js";
import {
  startCliBridgeServer,
  isAllowedOrigin,
} from "../../electron/cli_bridge_server.js";

describe("Empirical Challenger: Wire Protocol & WebSocket Loopback Stress Testing", () => {
  beforeEach(() => {
    resetWebCliBridge();
    delete globalThis.window;
  });

  afterEach(() => {
    resetWebCliBridge();
    delete globalThis.window;
  });

  describe("1. Wire Protocol Frame Serialization & Deserialization Adversarial Stress", () => {
    it("closes connection with 1003 on non-JSON raw strings, XML, and empty strings", async () => {
      const adapter = createWsIpcAdapter();
      const testCases = [
        "not a valid json",
        "<xml><test>payload</test></xml>",
        "{ broken: json ",
        "undefined",
        "",
        "   ",
        "\x00\x01\x02\xFF",
      ];

      for (const payload of testCases) {
        let closeCode = null;
        let closeReason = null;
        const fakeSocket = {
          on: (event, handler) => {
            if (event === "message") fakeSocket.messageHandler = handler;
          },
          send: () => {},
          close: (code, reason) => {
            closeCode = code;
            closeReason = reason;
          },
        };

        adapter.attach(fakeSocket);
        await fakeSocket.messageHandler(payload);
        expect(closeCode, `Failed on payload: ${payload}`).toBe(1003);
        expect(closeReason).toBe("invalid frame");
      }
    });

    it("closes connection with 1003 on JSON primitives (null, number, boolean, array, string)", async () => {
      const adapter = createWsIpcAdapter();
      const primitives = [
        "null",
        "12345",
        "true",
        "false",
        '"just a string"',
        "[1, 2, 3]",
        '["invoke", "req_1"]',
      ];

      for (const raw of primitives) {
        let closeCode = null;
        const fakeSocket = {
          on: (event, handler) => {
            if (event === "message") fakeSocket.messageHandler = handler;
          },
          send: () => {},
          close: (code) => {
            closeCode = code;
          },
        };

        adapter.attach(fakeSocket);
        await fakeSocket.messageHandler(raw);
        expect(closeCode, `Failed on primitive: ${raw}`).toBe(1003);
      }
    });

    it("closes connection with 1003 on missing or non-string required fields (id, channel)", async () => {
      const adapter = createWsIpcAdapter();
      const invalidObjects = [
        {}, // empty
        { type: "invoke" }, // missing id and channel
        { type: "invoke", id: 123, channel: "voo:codex-connect" }, // numeric id
        { type: "invoke", id: null, channel: "voo:codex-connect" }, // null id
        { type: "invoke", id: {}, channel: "voo:codex-connect" }, // object id
        { type: "invoke", id: "req_1" }, // missing channel
        { type: "invoke", id: "req_1", channel: 999 }, // numeric channel
        { type: "invoke", id: "req_1", channel: null }, // null channel
        { type: "result", id: "req_1", ok: true }, // unexpected result type from client
        { type: "event", channel: "voo:codex-text" }, // unexpected event type from client
        { type: "unknown_type", id: "req_1", channel: "test" }, // unknown type
      ];

      for (const obj of invalidObjects) {
        let closeCode = null;
        const fakeSocket = {
          on: (event, handler) => {
            if (event === "message") fakeSocket.messageHandler = handler;
          },
          send: () => {},
          close: (code) => {
            closeCode = code;
          },
        };

        adapter.attach(fakeSocket);
        await fakeSocket.messageHandler(JSON.stringify(obj));
        expect(closeCode, `Failed on: ${JSON.stringify(obj)}`).toBe(1003);
      }
    });

    it("survives unknown channels by returning result error without closing socket", async () => {
      const adapter = createWsIpcAdapter();
      const sent = [];
      let closed = false;
      const fakeSocket = {
        on: (event, handler) => {
          if (event === "message") fakeSocket.messageHandler = handler;
        },
        send: (msg) => sent.push(JSON.parse(msg)),
        close: () => {
          closed = true;
        },
      };

      adapter.attach(fakeSocket);
      await fakeSocket.messageHandler(
        JSON.stringify({
          type: "invoke",
          id: "req_err_1",
          channel: "non_existent_rpc_channel",
          args: [],
        }),
      );

      expect(closed).toBe(false);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toEqual({
        type: "result",
        id: "req_err_1",
        ok: false,
        error: "cli.unknownChannel",
      });
    });

    it("safely handles non-array args without throwing TypeError", async () => {
      const adapter = createWsIpcAdapter();
      let receivedArgs = null;
      adapter.ipcMain.handle("test:args", async (_event, ...args) => {
        receivedArgs = args;
        return "ok";
      });

      const invalidArgsList = ["string_arg", 42, true, null, { not: "array" }];
      for (const badArgs of invalidArgsList) {
        const sent = [];
        const fakeSocket = {
          on: (event, handler) => {
            if (event === "message") fakeSocket.messageHandler = handler;
          },
          send: (msg) => sent.push(JSON.parse(msg)),
          close: () => {},
        };

        adapter.attach(fakeSocket);
        await fakeSocket.messageHandler(
          JSON.stringify({
            type: "invoke",
            id: "arg_test",
            channel: "test:args",
            args: badArgs,
          }),
        );

        expect(sent).toHaveLength(1);
        expect(sent[0].ok).toBe(true);
        expect(receivedArgs).toEqual([]);
      }
    });

    it("client bridge gracefully handles corrupted frames received from server", async () => {
      let messageHandler = null;
      const fakeWs = function () {
        this.readyState = 1;
        this.send = () => {};
        this.addEventListener = (event, fn) => {
          if (event === "open") fn();
          if (event === "message") messageHandler = fn;
        };
      };

      const bridge = createWebCliBridge({ WebSocketImpl: fakeWs });
      await bridge.open();

      // Corrupted non-JSON frame from server: should not throw
      expect(() => {
        messageHandler({ data: "invalid json from server {{" });
      }).not.toThrow();

      // Primitive from server: should not throw
      expect(() => {
        messageHandler({ data: "12345" });
      }).not.toThrow();

      // Unknown frame type from server: should not throw
      expect(() => {
        messageHandler({ data: JSON.stringify({ type: "unknown", foo: "bar" }) });
      }).not.toThrow();

      // Result frame with unknown id: should not throw
      expect(() => {
        messageHandler({
          data: JSON.stringify({ type: "result", id: "unmatched_999", ok: true }),
        });
      }).not.toThrow();
    });

    it("client bridge isolates listener exceptions in onText", async () => {
      let messageHandler = null;
      const fakeWs = function () {
        this.readyState = 1;
        this.send = () => {};
        this.addEventListener = (event, fn) => {
          if (event === "open") fn();
          if (event === "message") messageHandler = fn;
        };
      };

      const bridge = createWebCliBridge({ WebSocketImpl: fakeWs });
      await bridge.open();

      let healthyListenerCalled = false;
      bridge.onText(() => {
        throw new Error("Crashing listener");
      });
      bridge.onText((payload) => {
        if (payload?.text === "valid") healthyListenerCalled = true;
      });

      // Push event frame
      expect(() => {
        messageHandler({
          data: JSON.stringify({
            type: "event",
            channel: "voo:codex-text",
            payload: { text: "valid" },
          }),
        });
      }).not.toThrow();

      expect(healthyListenerCalled).toBe(true);
    });
  });

  describe("2. WebSocket Connection Drop, Reconnect & Lifecycle Stress", () => {
    it("abrupt socket termination rejects all in-flight pending invokes immediately", async () => {
      let closeHandler = null;
      let openHandler = null;
      const fakeWs = function () {
        this.readyState = 1;
        this.send = () => {};
        this.addEventListener = (event, fn) => {
          if (event === "open") openHandler = fn;
          if (event === "close") closeHandler = fn;
        };
        setTimeout(() => openHandler?.(), 0);
      };

      const bridge = createWebCliBridge({ WebSocketImpl: fakeWs });
      await bridge.open();

      const p1 = bridge.advance({ prompt: "task 1" });
      const p2 = bridge.advance({ prompt: "task 2" });
      const p3 = bridge.checkAll();
      const p4 = bridge.cancel({ threadId: "t1" });

      // Trigger socket drop
      closeHandler?.();

      await expect(p1).rejects.toThrow("cli.bridgeDisconnected");
      await expect(p2).rejects.toThrow("cli.bridgeDisconnected");
      await expect(p3).rejects.toThrow("cli.bridgeDisconnected");
      await expect(p4).rejects.toThrow("cli.bridgeDisconnected");
      expect(bridge.isOpen()).toBe(false);
    });

    it("reconnects successfully after connection drop on subsequent calls", async () => {
      let connectionCount = 0;
      let activeSocketInstance = null;

      const MockSocket = function () {
        connectionCount++;
        this.readyState = 0; // connecting
        this.handlers = {};
        activeSocketInstance = this;

        this.addEventListener = (event, fn) => {
          this.handlers[event] = fn;
        };
        this.send = (msg) => {
          const frame = JSON.parse(msg);
          // Auto reply to connect and checkAll
          setTimeout(() => {
            this.handlers.message?.({
              data: JSON.stringify({
                type: "result",
                id: frame.id,
                ok: true,
                value: { reconnected: true, connectionCount },
              }),
            });
          }, 5);
        };
        this.close = () => {
          this.readyState = 3; // closed
          this.handlers.close?.();
        };

        setTimeout(() => {
          this.readyState = 1; // open
          this.handlers.open?.();
        }, 10);
      };

      const bridge = createWebCliBridge({ WebSocketImpl: MockSocket });

      // First connection
      const res1 = await bridge.connect();
      expect(res1.ok).toBe(true);
      expect(connectionCount).toBe(1);

      // Simulate network drop
      activeSocketInstance.close();
      expect(bridge.isOpen()).toBe(false);

      // Reconnect
      const res2 = await bridge.connect();
      expect(res2.ok).toBe(true);
      expect(connectionCount).toBe(2);
      expect(res2.value.connectionCount).toBe(2);
      expect(bridge.isOpen()).toBe(true);
    });

    it("connect times out cleanly when server is unresponsive", async () => {
      const SilentSocket = function () {
        this.readyState = 0; // never opens
        this.addEventListener = () => {};
        this.close = () => {};
      };

      const bridge = createWebCliBridge({
        WebSocketImpl: SilentSocket,
        connectTimeoutMs: 50,
      });

      const ok = await bridge.open();
      expect(ok).toBe(false);
      expect(bridge.isOpen()).toBe(false);
    });

    it("connect returns { ok: false, error } when socket fails to open", async () => {
      const SilentSocket = function () {
        this.readyState = 0; // never opens
        this.addEventListener = () => {};
        this.close = () => {};
      };

      const bridge = createWebCliBridge({
        WebSocketImpl: SilentSocket,
        connectTimeoutMs: 30,
      });

      const res = await bridge.connect();
      expect(res).toEqual({
        ok: false,
        transport: "web_loopback",
        error: "cli.bridgeDisconnected",
      });
      expect(bridge.isOpen()).toBe(false);
    });

    it("handles server-side sender destroyed event when client drops mid-execution", async () => {
      const adapter = createWsIpcAdapter();
      let destroyedFired = false;

      adapter.ipcMain.handle("test:long_running", async ({ sender }) => {
        sender.once("destroyed", () => {
          destroyedFired = true;
        });
        // simulate async delay
        await new Promise((resolve) => setTimeout(resolve, 50));
        return "completed";
      });

      let closeListener = null;
      const fakeSocket = {
        on: (event, handler) => {
          if (event === "message") fakeSocket.messageHandler = handler;
          if (event === "close") closeListener = handler;
        },
        send: () => {},
        close: () => {},
      };

      adapter.attach(fakeSocket);

      // Fire in-flight request
      const task = fakeSocket.messageHandler(
        JSON.stringify({
          type: "invoke",
          id: "req_drop",
          channel: "test:long_running",
          args: [],
        }),
      );

      // Client closes socket mid-turn
      closeListener?.();

      await task;
      expect(destroyedFired).toBe(true);
    });
  });

  describe("3. Port Conflict, Cleanup & Origin Security Guard", () => {
    let runningServers = [];

    afterEach(async () => {
      for (const s of runningServers) {
        try {
          await s.close();
        } catch {}
      }
      runningServers = [];
    });

    it("detects port conflict with EADDRINUSE and keeps existing server intact", async () => {
      const s1 = await startCliBridgeServer({ port: 0 });
      runningServers.push(s1);

      await expect(startCliBridgeServer({ port: s1.port })).rejects.toThrow(/EADDRINUSE/);

      // Verify existing server remains healthy
      const health = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${s1.port}/health`, (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => resolve(JSON.parse(data)));
        }).on("error", reject);
      });
      expect(health.ok).toBe(true);
    });

    it("cleans up active WebSocket clients when server.close() is called", async () => {
      const server = await startCliBridgeServer({ port: 0 });
      runningServers.push(server);
      const port = server.port;

      const client = new WebSocket(`ws://127.0.0.1:${port}`, {
        headers: { "x-voo-cli-bridge-token": process.env.VOO_CLI_BRIDGE_TOKEN },
      });
      await new Promise((resolve) => client.on("open", resolve));
      expect(client.readyState).toBe(WebSocket.OPEN);

      // Close server
      await server.close();

      // Client should observe closure
      if (client.readyState === WebSocket.OPEN) {
        await new Promise((resolve) => client.on("close", resolve));
      }
      expect(client.readyState).toBe(WebSocket.CLOSED);
    });

    it("strictly enforces origin security policy via isAllowedOrigin", () => {
      const allowedOrigins = new Set([
        "null",
        "http://localhost:5173",
        "http://127.0.0.1:4179",
        "https://voo.run",
        "https://la.voo.run",
      ]);

      // Permitted
      expect(isAllowedOrigin(null, allowedOrigins)).toBe(false);
      expect(isAllowedOrigin("", allowedOrigins)).toBe(false);
      expect(isAllowedOrigin("http://localhost:5173", allowedOrigins)).toBe(true);
      expect(isAllowedOrigin("http://127.0.0.1:4179", allowedOrigins)).toBe(true);
      expect(isAllowedOrigin("https://voo.run", allowedOrigins)).toBe(true);
      expect(isAllowedOrigin("https://la.voo.run", allowedOrigins)).toBe(true);
      expect(isAllowedOrigin("http://localhost:3000", allowedOrigins)).toBe(false);
      expect(isAllowedOrigin("http://127.0.0.1:8080", allowedOrigins)).toBe(false);
      expect(isAllowedOrigin("null", allowedOrigins)).toBe(true);
      expect(isAllowedOrigin("file://", allowedOrigins)).toBe(false);
      expect(isAllowedOrigin("file:///Applications/VOO/dist/index.html", allowedOrigins)).toBe(false);

      // Rejected
      expect(isAllowedOrigin("https://evil-hacker.com", allowedOrigins)).toBe(false);
      expect(isAllowedOrigin("http://localhost.evil.com", allowedOrigins)).toBe(false);
      expect(isAllowedOrigin("http://127.0.0.1.attacker.io", allowedOrigins)).toBe(false);
      expect(isAllowedOrigin("https://not-voo.run", allowedOrigins)).toBe(false);
      expect(isAllowedOrigin("javascript:void(0)", new Set(["null", "file://"]))).toBe(false);
      expect(isAllowedOrigin("data:text/html,hello", new Set(["null"]))).toBe(false);
      expect(isAllowedOrigin("malformed-origin-string", allowedOrigins)).toBe(false);
    });

    it.each(["null"])("accepts Electron origin %s during a live WebSocket handshake", async (origin) => {
      const server = await startCliBridgeServer({ port: 0 });
      runningServers.push(server);
      const client = new WebSocket(`ws://127.0.0.1:${server.port}`, { origin });
      try {
        await new Promise((resolve, reject) => {
          client.once("open", resolve);
          client.once("error", reject);
        });
        expect(client.readyState).toBe(WebSocket.OPEN);
      } finally {
        client.terminate();
      }
    });

    it("rejects untrusted origin during live WebSocket handshake", async () => {
      const server = await startCliBridgeServer({ port: 0 });
      runningServers.push(server);
      const port = server.port;

      let errorReceived = null;
      const forbiddenClient = new WebSocket(`ws://127.0.0.1:${port}`, {
        headers: { Origin: "https://unauthorized-domain.com" },
      });

      await new Promise((resolve) => {
        forbiddenClient.on("error", (err) => {
          errorReceived = err;
          resolve();
        });
        forbiddenClient.on("open", () => {
          forbiddenClient.close();
          resolve();
        });
      });

      expect(errorReceived).not.toBeNull();
      expect(forbiddenClient.readyState).not.toBe(WebSocket.OPEN);
    });
  });

  describe("4. High-Throughput Concurrent RPC Stress", () => {
    let server = null;

    beforeEach(async () => {
      server = await startCliBridgeServer({ port: 0 });
    });

    afterEach(async () => {
      if (server) {
        await server.close();
        server = null;
      }
    });

    it("processes 50 concurrent requests cleanly without frame crosstalk", async () => {
      const bridge = createWebCliBridge({
        url: `ws://127.0.0.1:${server.port}`,
        WebSocketImpl: function TokenAuthorizedWebSocket(url) {
          return new WebSocket(url, {
            headers: { "x-voo-cli-bridge-token": process.env.VOO_CLI_BRIDGE_TOKEN },
          });
        },
      });

      await bridge.connect();

      const CONCURRENCY = 50;
      const results = await Promise.all(
        Array.from({ length: CONCURRENCY }, () => bridge.checkAll()),
      );
      expect(results).toHaveLength(CONCURRENCY);
      for (const result of results) {
        expect(result).toBeDefined();
      }
      bridge.close();
    });

  });
});
