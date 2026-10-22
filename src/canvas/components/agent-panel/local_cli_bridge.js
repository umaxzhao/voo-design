/**
 * The local CLI surface the agent talks to, in whichever shell this is.
 *
 * Desktop: the preload's `vooDesktop.localCli` (Electron IPC).
 * Browser: the same surface over the loopback CLI bridge (`npm run bridge`),
 * dialed lazily — a page that never looks for a CLI never opens a socket.
 *
 * `window.vooDesktop` itself is left untouched: other code reads its presence
 * as "this is the desktop app", which a browser with a bridge is not.
 */

import {
  CLI_BRIDGE_CHANNEL,
  CLI_BRIDGE_DEFAULT_PORT,
  CLI_BRIDGE_EVENT,
  CLI_BRIDGE_MESSAGE,
} from "../../../shared/cli_bridge_protocol.js";
import { CLI_TRANSPORT } from "../../../shared/cli-agents.js";
import { BG, EVENTS } from "../../../shared/messages.js";

/** A refused loopback port fails at once; this only bounds a hung dial. */
const CONNECT_TIMEOUT_MS = 1500;
const SOCKET_OPEN = 1;

export const CLI_BRIDGE_URL =
  import.meta.env?.VITE_CLI_BRIDGE_URL ||
  `ws://127.0.0.1:${CLI_BRIDGE_DEFAULT_PORT}`;

let webBridge = null;
let desktopLinkBridge = null;

function desktopBridge() {
  if (typeof window === "undefined") return null;
  return window.vooDesktop?.localCli ?? null;
}

/** The bridge usable right now, or null. Synchronous; never dials. */
export function getLocalCliBridge() {
  return (
    desktopBridge() ??
    desktopLinkBridge ??
    (webBridge?.isOpen() ? webBridge : null)
  );
}

/**
 * How far this page's transport can take a local CLI — the one answer every
 * surface that offers a CLI reads, so a card, a status line and the run's
 * refusal cannot disagree about it.
 *
 * `getLocalCliBridge()` is not that answer: it says a bridge exists, and the
 * desktop link hands over a full-looking one while refusing to invoke it. See
 * `CLI_TRANSPORT` in `src/shared/cli-agents.js` for what the three states
 * mean and which links produce the middle one.
 */
export function cliTransport() {
  if (desktopBridge()) return CLI_TRANSPORT.RUNNABLE;
  if (webBridge?.isOpen()) return CLI_TRANSPORT.RUNNABLE;
  if (desktopLinkBridge) {
    return desktopLinkBridge.canInvokeCli
      ? CLI_TRANSPORT.RUNNABLE
      : CLI_TRANSPORT.READS_ONLY;
  }
  return CLI_TRANSPORT.NONE;
}

export function resetDesktopLinkCliBridge() {
  desktopLinkBridge = null;
}

/** Closes the cached loopback socket and forgets it, so the next call dials again. */
export function resetWebCliBridge() {
  webBridge?.close();
  webBridge = null;
}

/**
 * The page's link and what it can do with a CLI, probed once.
 *
 * `dial: false` never opens a socket: a surface that is merely about to draw
 * itself must not make the browser ask for local-network access. Callers that
 * are reacting to the user asking to run something dial through
 * `ensureLocalCliBridge` instead.
 */
export async function resolveCliTransport() {
  await ensureLocalCliBridge({ dial: false });
  return { bridge: getLocalCliBridge(), transport: cliTransport() };
}

/**
 * CLI bridge implementation multiplexed over loopback desktop link.
 *
 * `canInvoke` is not a preference but a fact about the host that answered:
 * whichever link this is, every channel below travels as
 * `BG.DESKTOP_CLI_INVOKE`, so a link that does not forward that message can
 * serve none of them. Defaults to false — a bridge nobody vouched for must not
 * claim it can run anything.
 */
export function createDesktopLinkCliBridge({
  onHostEvent: injectedOnHostEvent,
  canInvoke = false,
} = {}) {
  const textListeners = new Set();
  let hostListenerUnsub = null;

  async function ensureListener() {
    if (hostListenerUnsub) return;
    const onHost =
      injectedOnHostEvent || (await import("../../rpc_events.js")).onHostEvent;
    if (hostListenerUnsub) return;
    hostListenerUnsub = onHost?.(EVENTS.DESKTOP_CLI_EVENT, (event) => {
      if (
        event?.channel === "voo:codex-text" ||
        event?.channel === CLI_BRIDGE_EVENT.TEXT
      ) {
        for (const listener of textListeners) {
          try {
            listener(event.payload);
          } catch {
            // ignore listener errors
          }
        }
      }
    });
  }

  const readyPromise = ensureListener();

  async function invoke(channel, ...args) {
    const { callBackground } = await import("../../rpc_background.js");
    const res = await callBackground(BG.DESKTOP_CLI_INVOKE, { channel, args });
    return res?.value;
  }

  return {
    isDesktopLink: true,
    canInvokeCli: Boolean(canInvoke),
    isOpen: () => true,
    ready: () => readyPromise,
    connect: () => invoke(CLI_BRIDGE_CHANNEL.CONNECT),
    advance: (options) => invoke(CLI_BRIDGE_CHANNEL.ADVANCE, options),
    cancel: (options) => invoke(CLI_BRIDGE_CHANNEL.CANCEL, options),
    checkAll: (options) => invoke(CLI_BRIDGE_CHANNEL.CHECK_ALL, options),
    checkStatus: (cliId, options) => invoke("voo:cli-status", cliId, options),
    launchLogin: (cliId) => invoke("voo:cli-launch-login", cliId),
    launch: (cliId, options) => invoke("voo:cli-launch", cliId, options),
    onText(listener) {
      textListeners.add(listener);
      return () => textListeners.delete(listener);
    },
  };
}

/**
 * The usable bridge, dialing the local CLI bridge first when this is a
 * browser without one. Null when neither is reachable.
 *
 * `dial: false` never opens a socket. From a public origin the first dial
 * makes Chrome ask the user for local-network access, so callers that are
 * merely probing (opening the agent panel) must only dial on user intent.
 */
export async function ensureLocalCliBridge({
  url = CLI_BRIDGE_URL,
  WebSocketImpl = globalThis.WebSocket,
  dial = true,
} = {}) {
  const ready = getLocalCliBridge();
  if (ready) return ready;

  if (typeof window !== "undefined" && !window.vooDesktop) {
    try {
      const { callBackground } = await import("../../rpc_background.js");
      const res = await callBackground(BG.DESKTOP_LINKED);
      if (res?.linked) {
        // Both links answer `BG.DESKTOP_LINKED` the same way, and only one of
        // them forwards `BG.DESKTOP_CLI_INVOKE`: the extension's runtime does,
        // the desktop app's panel link and the extension's external port stop
        // at reads. Which host answered this probe is therefore the whole
        // answer, and `callBackground` already draws that line by whether the
        // extension's own APIs are present — the same condition, read once,
        // rather than a second guess at it.
        //
        // Imported here rather than at the top: that module reaches the whole
        // environment graph, and this one is deliberately cheap to load.
        const { hasChromeApis } = await import("../../rpc_environment.js");
        desktopLinkBridge ??= createDesktopLinkCliBridge({
          canInvoke: hasChromeApis(),
        });
        return desktopLinkBridge;
      }
    } catch {
      // background probe failed or not linked
    }
  }

  if (!dial) return null;
  // Only a page dials; Node (tests, scripts) must never reach a bridge that
  // happens to be running on this machine.
  if (typeof window === "undefined" || typeof WebSocketImpl !== "function") {
    return null;
  }
  webBridge ??= createWebCliBridge({ url, WebSocketImpl });
  return (await webBridge.open()) ? webBridge : null;
}

/** The `vooDesktop.localCli` surface over one loopback WebSocket. */
export function createWebCliBridge({
  url,
  WebSocketImpl,
  connectTimeoutMs = CONNECT_TIMEOUT_MS,
}) {
  let socket = null;
  let opening = null;
  let nextId = 1;
  const pending = new Map();
  const textListeners = new Set();

  function failPending(reason) {
    for (const { reject } of pending.values()) reject(new Error(reason));
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
      const candidate = new WebSocketImpl(url);
      let settled = false;
      const settle = (ok) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        opening = null;
        resolve(ok);
      };
      const timer = setTimeout(() => {
        candidate.close();
        settle(false);
      }, connectTimeoutMs);
      candidate.addEventListener("open", () => {
        socket = candidate;
        settle(true);
      });
      candidate.addEventListener("error", () => settle(false));
      candidate.addEventListener("close", () => {
        if (socket === candidate) {
          socket = null;
          failPending("cli.bridgeDisconnected");
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
      pending.set(id, { resolve, reject });
      socket.send(
        JSON.stringify({ type: CLI_BRIDGE_MESSAGE.INVOKE, id, channel, args }),
      );
    });
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
      const current = socket;
      socket = null;
      failPending("cli.bridgeClosed");
      current?.close();
    },
    advance: (options) => invoke(CLI_BRIDGE_CHANNEL.ADVANCE, options),
    cancel: (options) => invoke(CLI_BRIDGE_CHANNEL.CANCEL, options),
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
