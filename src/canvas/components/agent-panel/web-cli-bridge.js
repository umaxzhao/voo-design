import { CLI_BRIDGE_CHANNEL, CLI_BRIDGE_EVENT, CLI_BRIDGE_MESSAGE } from "../../../shared/cli_bridge_protocol.js";
const CONNECT_TIMEOUT_MS = 1500;
const SOCKET_OPEN = 1;

/** The `vooDesktop.localCli` surface over one loopback WebSocket. */
export function createWebCliBridge({
  url,
  WebSocketImpl,
  connectTimeoutMs = CONNECT_TIMEOUT_MS,
  onDisconnect = () => {},
}) {
  let socket = null;
  let opening = null;
  let cancelOpening = () => {};
  let nextId = 1;
  const pending = new Map();
  const textListeners = new Set();

  function failPending(reason) {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(new Error(reason));
    }
    pending.clear();
  }

  function onMessage(event) {
    let frame;
    try {
      frame = JSON.parse(event.data);
    } catch (error) {
      console.warn("[cli-bridge] Ignoring malformed frame", error);
      return;
    }
    if (frame.type === CLI_BRIDGE_MESSAGE.RESULT) {
      const entry = pending.get(frame.id);
      if (!entry) return;
      pending.delete(frame.id);
      clearTimeout(entry.timer);
      if (frame.ok) entry.resolve(frame.value);
      else entry.reject(new Error(frame.error || "cli.failed"));
      return;
    }
    if (
      frame.type === CLI_BRIDGE_MESSAGE.EVENT &&
      frame.channel === CLI_BRIDGE_EVENT.TEXT
    ) {
      for (const listener of textListeners) {
        try {
          listener(frame.payload);
        } catch (error) {
          // One faulty listener must not stop the others or the socket.
          console.warn("[cli-bridge] Text listener failed", error);
        }
      }
    }
  }

  function open() {
    if (socket?.readyState === SOCKET_OPEN) return Promise.resolve(true);
    opening ??= new Promise((resolve) => {
      let candidate;
      try { candidate = new WebSocketImpl(url); }
      catch { resolve(false); queueMicrotask(() => { opening = null; }); return; }
      let settled = false;
      const settle = (ok) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        opening = null;
        resolve(ok);
      };
      cancelOpening = () => { settle(false); candidate.close(); };
      const timer = setTimeout(() => {
        candidate.close();
        settle(false);
      }, connectTimeoutMs);
      candidate.addEventListener("open", () => {
        if (settled) { candidate.close(); return; }
        socket = candidate;
        settle(true);
      });
      candidate.addEventListener("error", () => { settle(false); candidate.close(); });
      candidate.addEventListener("close", () => {
        if (socket === candidate) {
          socket = null;
          failPending("cli.bridgeDisconnected");
          onDisconnect();
        }
        settle(false);
      });
      candidate.addEventListener("message", onMessage);
    });
    return opening;
  }

  function invoke(channel, ...args) {
    if (socket?.readyState !== SOCKET_OPEN) {
      return Promise.reject(new Error("cli.bridgeDisconnected"));
    }
    const id = String(nextId++);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("cli.bridgeTimeout"));
      }, [CLI_BRIDGE_CHANNEL.ADVANCE, CLI_BRIDGE_CHANNEL.RUN_TEXT].includes(channel) ? 15 * 60 * 1000 :
        channel === CLI_BRIDGE_CHANNEL.DSH_INSTALL ? 120000 : 15000);
      pending.set(id, { resolve, reject, timer });
      socket.send(
        JSON.stringify({ type: CLI_BRIDGE_MESSAGE.INVOKE, id, channel, args }),
      );
    });
  }

  /** Dials if needed; a failure is a result, not a rejection. */
  async function invokeDsh(channel, options) {
    try {
      if (!(await open())) {
        return { ok: false, code: "cli.bridgeDisconnected" };
      }
      return await invoke(channel, options);
    } catch (error) {
      return { ok: false, code: "cli.failed", error: String(error?.message || error) };
    }
  }

  return {
    isOpen: () => socket?.readyState === SOCKET_OPEN,
    open,
    /** Dials if needed, then connects. Failures are reported in the result, never thrown. */
    async connect() {
      try {
        if (!(await open())) {
          return { ok: false, transport: "web_loopback", error: "cli.bridgeDisconnected" };
        }
        const value = await invoke(CLI_BRIDGE_CHANNEL.CONNECT);
        return { ok: true, transport: "web_loopback", value };
      } catch (error) {
        return { ok: false, transport: "web_loopback", error: error.message };
      }
    },
    close() {
      cancelOpening();
      const current = socket;
      socket = null;
      failPending("cli.bridgeClosed");
      current?.close();
    },
    advance: (options) => invoke(CLI_BRIDGE_CHANNEL.ADVANCE, options),
    cancel: (options) => invoke(CLI_BRIDGE_CHANNEL.CANCEL, options),
    runText: (cliId, options) => invoke(CLI_BRIDGE_CHANNEL.RUN_TEXT, cliId, options),
    dshStatus: (options) => invokeDsh(CLI_BRIDGE_CHANNEL.DSH_STATUS, options),
    dshInstall: (options) => invokeDsh(CLI_BRIDGE_CHANNEL.DSH_INSTALL, options),
    checkStatus: (cliId, options) => invoke("voo:cli-status", cliId, options),
    checkAll: async () => {
      await open();
      return invoke(CLI_BRIDGE_CHANNEL.CHECK_ALL);
    },
    onText(listener) {
      textListeners.add(listener);
      return () => textListeners.delete(listener);
    },
  };
}
