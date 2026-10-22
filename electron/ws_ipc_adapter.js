/**
 * An `ipcMain`-shaped facade over WebSocket connections.
 *
 * Lets bridge handlers registered against an ipcMain interface run
 * identically over WebSocket connections without duplicating logic.
 */

import { CLI_BRIDGE_MESSAGE } from "../src/shared/cli_bridge_protocol.js";

/** WebSocket close code for a frame that does not follow the protocol. */
const CLOSE_INVALID_FRAME = 1003;

export function createWsIpcAdapter() {
  const handlers = new Map();
  let nextSenderId = 1;

  function createSender(socket) {
    const id = nextSenderId++;
    let destroyed = false;
    const destroyListeners = [];

    const onClose = () => {
      destroyed = true;
      for (const listener of destroyListeners.splice(0)) {
        try {
          listener();
        } catch {}
      }
    };

    if (typeof socket.on === "function") {
      socket.on("close", onClose);
    } else if (typeof socket.addEventListener === "function") {
      socket.addEventListener("close", onClose);
    }

    return {
      id,
      isDestroyed: () => destroyed,
      send(channel, payload) {
        if (destroyed) return;
        try {
          socket.send(
            JSON.stringify({ type: CLI_BRIDGE_MESSAGE.EVENT, channel, payload }),
          );
        } catch {
          // ignore send error on broken socket
        }
      },
      once(eventName, listener) {
        if (eventName !== "destroyed") return;
        if (destroyed) listener();
        else destroyListeners.push(listener);
      },
    };
  }

  async function dispatch(sender, frame) {
    const handler = handlers.get(frame.channel);
    if (!handler) throw new Error("cli.unknownChannel");
    const args = Array.isArray(frame.args) ? frame.args : [];
    return handler({ sender }, ...args);
  }

  return {
    ipcMain: {
      handle(channel, handler) {
        if (handlers.has(channel)) {
          throw new Error(`Channel already handled: ${channel}`);
        }
        handlers.set(channel, handler);
      },
      removeHandler(channel) {
        handlers.delete(channel);
      },
    },

    /** Serves one connection: invoke frames in, result and event frames out. */
    attach(socket) {
      const sender = createSender(socket);

      const onData = async (data) => {
        let frame;
        try {
          const raw = typeof data === "string" ? data : (data?.data ?? data).toString();
          frame = JSON.parse(raw);
        } catch {
          try {
            socket.close(CLOSE_INVALID_FRAME, "invalid frame");
          } catch {}
          return;
        }

        if (
          !frame ||
          frame.type !== CLI_BRIDGE_MESSAGE.INVOKE ||
          typeof frame.id !== "string" ||
          typeof frame.channel !== "string"
        ) {
          try {
            socket.close(CLOSE_INVALID_FRAME, "invalid frame");
          } catch {}
          return;
        }

        let reply;
        try {
          reply = { ok: true, value: await dispatch(sender, frame) };
        } catch (error) {
          reply = { ok: false, error: error?.message || "cli.failed" };
        }

        if (sender.isDestroyed()) return;

        try {
          socket.send(
            JSON.stringify({
              type: CLI_BRIDGE_MESSAGE.RESULT,
              id: frame.id,
              ...reply,
            }),
          );
        } catch {
          // socket closed while sending
        }
      };

      if (typeof socket.on === "function") {
        socket.on("message", onData);
      } else if (typeof socket.addEventListener === "function") {
        socket.addEventListener("message", (event) => onData(event.data));
      }

      return sender;
    },
  };
}
