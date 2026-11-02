import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "node:http";
import WebSocket from "ws";
import {
  CLI_BRIDGE_CHANNEL,
  CLI_BRIDGE_DEFAULT_PORT,
  CLI_BRIDGE_EVENT,
  CLI_BRIDGE_MESSAGE,
  NATIVE_AGENT_CLI_IDS,
} from "../../src/shared/cli_bridge_protocol.js";
import {
  createWebCliBridge,
  ensureLocalCliBridge,
  cliTransport,
  getLocalCliBridge,
  resetWebCliBridge,
} from "../../src/canvas/components/agent-panel/local_cli_bridge.js";
import { createWsIpcAdapter } from "../../electron/ws_ipc_adapter.js";
import { startCliBridgeServer } from "../../electron/cli_bridge_server.js";
import { streamCodexCompletion } from "../../src/canvas/components/agent-panel/codex_transport.js";
import {
  registerBridgeChannelsWithoutCliSpawn,
  STUB_CONNECT_RESULT,
} from "./helpers/cli_bridge_test_server.js";

/** Real-socket tests share a generous ceiling; it is a safety margin, not the fix. */
const REAL_SOCKET_TEST_TIMEOUT_MS = 20000;

describe("CLI Bridge Protocol & Dual-Channel Transport", () => {
  beforeEach(() => {
    resetWebCliBridge();
    delete globalThis.window;
  });

  afterEach(() => {
    resetWebCliBridge();
    delete globalThis.window;
  });

  describe("1. Protocol Constants & Frame Types", () => {
    it("defines standard loopback port and native agents", () => {
      expect(CLI_BRIDGE_DEFAULT_PORT).toBe(4179);
      expect(NATIVE_AGENT_CLI_IDS).toContain("claude");
      expect(NATIVE_AGENT_CLI_IDS).toContain("codex");
      expect(NATIVE_AGENT_CLI_IDS).toContain("antigravity");
      expect(NATIVE_AGENT_CLI_IDS).toContain("opencode");
    });

    it("defines required bridge channels and event names", () => {
      expect(CLI_BRIDGE_CHANNEL.CONNECT).toBe("voo:codex-connect");
      expect(CLI_BRIDGE_CHANNEL.ADVANCE).toBe("voo:codex-advance");
      expect(CLI_BRIDGE_CHANNEL.CANCEL).toBe("voo:codex-cancel");
      expect(CLI_BRIDGE_CHANNEL.CHECK_ALL).toBe("voo:cli-check-all");
      expect(CLI_BRIDGE_EVENT.TEXT).toBe("voo:codex-text");
      expect(CLI_BRIDGE_MESSAGE.INVOKE).toBe("invoke");
      expect(CLI_BRIDGE_MESSAGE.RESULT).toBe("result");
      expect(CLI_BRIDGE_MESSAGE.EVENT).toBe("event");
    });
  });

  describe("2. WS IPC Adapter Frame Parsing & Wire Routing", () => {
    it("routes invoke frames to handlers and returns result frame", async () => {
      const adapter = createWsIpcAdapter();
      adapter.ipcMain.handle("test:echo", async (_event, message) => {
        return `echo:${message}`;
      });

      const messagesSent = [];
      const fakeSocket = {
        on: (event, handler) => {
          if (event === "message") fakeSocket.messageHandler = handler;
        },
        send: (payload) => messagesSent.push(JSON.parse(payload)),
        close: () => {},
      };

      adapter.attach(fakeSocket);

      // Invoke handler
      await fakeSocket.messageHandler(
        JSON.stringify({
          type: "invoke",
          id: "req_1",
          channel: "test:echo",
          args: ["hello"],
        }),
      );

      expect(messagesSent).toHaveLength(1);
      expect(messagesSent[0]).toEqual({
        type: "result",
        id: "req_1",
        ok: true,
        value: "echo:hello",
      });
    });

    it("returns error result frame when channel is unknown", async () => {
      const adapter = createWsIpcAdapter();
      const messagesSent = [];
      const fakeSocket = {
        on: (event, handler) => {
          if (event === "message") fakeSocket.messageHandler = handler;
        },
        send: (payload) => messagesSent.push(JSON.parse(payload)),
        close: () => {},
      };

      adapter.attach(fakeSocket);

      await fakeSocket.messageHandler(
        JSON.stringify({
          type: "invoke",
          id: "req_2",
          channel: "unknown:channel",
          args: [],
        }),
      );

      expect(messagesSent).toHaveLength(1);
      expect(messagesSent[0]).toEqual({
        type: "result",
        id: "req_2",
        ok: false,
        error: "cli.unknownChannel",
      });
    });

    it("pushes event frames to socket when sender.send is called", async () => {
      const adapter = createWsIpcAdapter();
      let capturedSender = null;
      adapter.ipcMain.handle("test:subscribe", async ({ sender }) => {
        capturedSender = sender;
        return { ok: true };
      });

      const messagesSent = [];
      const fakeSocket = {
        on: (event, handler) => {
          if (event === "message") fakeSocket.messageHandler = handler;
        },
        send: (payload) => messagesSent.push(JSON.parse(payload)),
        close: () => {},
      };

      adapter.attach(fakeSocket);

      await fakeSocket.messageHandler(
        JSON.stringify({
          type: "invoke",
          id: "sub_1",
          channel: "test:subscribe",
          args: [],
        }),
      );

      expect(capturedSender).not.toBeNull();
      capturedSender.send(CLI_BRIDGE_EVENT.TEXT, { text: "chunk 1", threadId: "t1" });

      expect(messagesSent).toHaveLength(2);
      expect(messagesSent[1]).toEqual({
        type: "event",
        channel: "voo:codex-text",
        payload: { text: "chunk 1", threadId: "t1" },
      });
    });

    it("closes socket with 1003 on malformed JSON or invalid frame type", async () => {
      const adapter = createWsIpcAdapter();
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

      // Malformed JSON
      await fakeSocket.messageHandler("not-valid-json{{{");
      expect(closeCode).toBe(1003);

      closeCode = null;
      // Missing id or channel
      await fakeSocket.messageHandler(JSON.stringify({ type: "invoke" }));
      expect(closeCode).toBe(1003);
    });
  });

  describe("3. Client Web Bridge & Disconnection Handling", () => {
    it("rejects invoke immediately when socket is not open", async () => {
      const bridge = createWebCliBridge({ url: "ws://127.0.0.1:9999", WebSocketImpl: WebSocket });
      expect(bridge.isOpen()).toBe(false);

      await expect(bridge.advance({ prompt: "hello" })).rejects.toThrow("cli.bridgeDisconnected");
    });

    it("gracefully fails pending invokes with cli.bridgeDisconnected on socket close", async () => {
      let closeHandler = null;
      let openHandler = null;
      const fakeWs = function () {
        this.readyState = 1; // open
        this.send = () => {};
        this.addEventListener = (event, fn) => {
          if (event === "open") openHandler = fn;
          if (event === "close") closeHandler = fn;
        };
        setTimeout(() => openHandler?.(), 5);
      };

      const bridge = createWebCliBridge({ WebSocketImpl: fakeWs });
      await bridge.open();
      expect(bridge.isOpen()).toBe(true);

      const pendingCall = bridge.advance({ cliId: "claude", prompt: "test" });
      // Simulate socket disconnection
      closeHandler?.();

      await expect(pendingCall).rejects.toThrow("cli.bridgeDisconnected");
      expect(bridge.isOpen()).toBe(false);
    });

    it("respects lazy dial policy: dial: false never dials", async () => {
      let dialed = false;
      const fakeWs = function () {
        dialed = true;
      };

      globalThis.window = {};
      const res = await ensureLocalCliBridge({ dial: false, WebSocketImpl: fakeWs });
      expect(res).toBeNull();
      expect(dialed).toBe(false);
    });
  });

  describe("4. Desktop IPC Detection & Transport Resolution", () => {
    it("prefers desktopBridge when window.vooDesktop.localCli is present", async () => {
      let advanced = false;
      globalThis.window = {
        vooDesktop: {
          localCli: {
            connect: async () => ({ ok: true, version: "2.0.0" }),
            advance: async (opts) => {
              advanced = true;
              return { ok: true, threadId: opts.threadId };
            },
            cancel: async () => ({ ok: true }),
            checkAll: async () => ({ claude: { ready: true } }),
            onText: (fn) => {
              fn({ text: "desktop chunk" });
              return () => {};
            },
          },
        },
      };

      const bridge = getLocalCliBridge();
      expect(bridge).not.toBeNull();
      expect(cliTransport()).toBe("runnable");

      const connectResult = await bridge.connect();
      expect(connectResult).toEqual({ ok: true, version: "2.0.0" });

      const advResult = await bridge.advance({ threadId: "d1" });
      expect(advResult.ok).toBe(true);
      expect(advanced).toBe(true);
    });
  });

  describe("5. End-to-End Real Bridge Server & Client Roundtrip", () => {
    let serverInstance = null;

    afterEach(async () => {
      if (serverInstance) {
        await serverInstance.close();
        serverInstance = null;
      }
    });

    it("starts server, answers /health, and conducts full RPC roundtrip", async () => {
      serverInstance = await startCliBridgeServer({
        port: 0,
        host: "127.0.0.1",
        register: registerBridgeChannelsWithoutCliSpawn,
      });
      const port = serverInstance.port;

      // 1. Check HTTP /health
      const health = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/health`, (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => resolve(JSON.parse(data)));
        }).on("error", reject);
      });
      expect(health).toEqual({ ok: true, version: "1.0.0", service: "voo-cli-bridge" });

      // 2. Connect client web bridge
      const TokenAuthorizedWebSocket = function (url) {
        return new WebSocket(url, {
          headers: { "x-voo-cli-bridge-token": process.env.VOO_CLI_BRIDGE_TOKEN },
        });
      };
      const bridge = createWebCliBridge({
        url: `ws://127.0.0.1:${port}`,
        WebSocketImpl: TokenAuthorizedWebSocket,
      });

      const connectRes = await bridge.connect();
      expect(connectRes.ok).toBe(true);
      expect(connectRes.transport).toBe("web_loopback");
      expect(connectRes.value).toEqual(STUB_CONNECT_RESULT);

      // 3. checkAll
      const checkRes = await bridge.checkAll();
      expect(checkRes).toBeDefined();
      expect(checkRes.claude).toBeDefined();
      expect(checkRes.codex).toBeDefined();
      expect(checkRes.antigravity).toBeDefined();

      // 5. cancel
      const cancelRes = await bridge.cancel({ threadId: "test_thread_1" });
      expect(cancelRes.ok).toBe(true);

      bridge.close();
    }, REAL_SOCKET_TEST_TIMEOUT_MS);
  });

  describe("6. Codex Transport Stream Generator", () => {
    it("adapts bridge events into async generator stream and completes cleanly", async () => {
      let textListener = null;
      const mockBridge = {
        advance: async (options) => {
          setTimeout(() => {
            textListener?.({ requestId: options.requestId, text: "Hello" });
            textListener?.({ requestId: options.requestId, text: " World" });
          }, 10);
          return { ok: true, threadId: options.threadId, text: "Hello World", done: true };
        },
        cancel: async () => ({ ok: true }),
        onText: (fn) => {
          textListener = fn;
          return () => {
            textListener = null;
          };
        },
      };

      globalThis.window = {
        vooDesktop: {
          localCli: mockBridge,
        },
      };

      const chunks = [];
      for await (const chunk of streamCodexCompletion({
        cliId: "claude",
        model: "claude:claude-opus-5-5",
        prompt: "Say hi",
      })) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      const textCollected = chunks
        .map((c) => c.choices?.[0]?.delta?.content ?? "")
        .join("");
      expect(textCollected).toBe("Hello World");
      expect(chunks[chunks.length - 1].choices[0].finish_reason).toBe("stop");
    });
  });
});
