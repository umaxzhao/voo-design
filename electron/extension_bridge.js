/**
 * The client's link to the VOO extension running in the user's own Chrome.
 *
 * The desktop app cannot sign in to Google — an embedded browser is refused,
 * and no amount of User-Agent work changes that — while the user's Chrome is
 * already signed in and already runs this extension. So platform work is
 * handed over the link instead of being driven here: the client owns the
 * canvas, Chrome owns the chat pages.
 *
 * The extension dials in; a server cannot reach into Chrome. Bound to
 * loopback only, and browser connections' Origin is checked against the known
 * extension ids. A local process can forge that header, so this check is a
 * browser-origin boundary rather than local-process authentication.
 */

import { WebSocketServer } from "ws";
import { DESKTOP_LINK_PORT, LINK } from "../src/shared/messages.js";
import { isAllowedOrigin } from "../src/shared/loopback_guard.js";
import {
  DEV_EXTENSION_ID,
  PUBLISHED_EXTENSION_ID,
} from "../src/shared/extension_id.js";

/** How long a job may sit unacknowledged before it is treated as lost. */
const ACK_TIMEOUT_MS = 15000;

function allowedOrigins() {
  return new Set(
    [DEV_EXTENSION_ID, PUBLISHED_EXTENSION_ID]
      .filter(Boolean)
      .map((id) => `chrome-extension://${id}`),
  );
}

export default class ExtensionBridge {
  /**
   * @param {object} deps
   * @param {(name: string, payload: object) => void} deps.onRelay job
   *        outcomes and event envelopes, forwarded to the canvas
   * @param {(tabs: object) => void} deps.onTabs which platforms are open
   * @param {(linked: boolean) => void} deps.onLink connection state changes
   * @param {() => void} deps.onFocus bring this window to the front — the
   *        extension sends it when something from Chrome lands on the canvas
   */
  constructor({
    onRelay,
    onTabs,
    onLink,
    onFocus,
    onAgentConfig,
    onAgentStream,
    onAgentStreamCancel,
    onCliInvoke,
    port,
    ackTimeoutMs,
  } = {}) {
    const configured = Number(process.env.VOO_LINK_PORT);
    this.port =
      port ??
      (Number.isInteger(configured) && configured > 0
        ? configured
        : DESKTOP_LINK_PORT);
    this.ackTimeoutMs =
      Number.isFinite(ackTimeoutMs) && ackTimeoutMs > 0
        ? ackTimeoutMs
        : ACK_TIMEOUT_MS;
    this.onRelay = onRelay ?? (() => {});
    this.onTabs = onTabs ?? (() => {});
    this.onLink = onLink ?? (() => {});
    this.onFocus = onFocus ?? (() => {});
    this.onAgentConfig = onAgentConfig ?? null;
    this.onAgentStream = onAgentStream ?? null;
    this.onAgentStreamCancel = onAgentStreamCancel ?? null;
    this.onCliInvoke = onCliInvoke ?? null;
    this.server = null;
    this.socket = null;
    this.pending = new Map();
    this.nextId = 0;
  }

  /** True once an extension has connected and not yet gone away. */
  get linked() {
    return Boolean(this.socket && this.socket.readyState === 1);
  }

  start() {
    if (this.server) return;
    const origins = allowedOrigins();

    this.server = new WebSocketServer({
      host: "127.0.0.1",
      port: this.port,
      verifyClient: ({ origin }) => isAllowedOrigin(origin, origins),
    });

    this.server.on("connection", (socket) => {
      // One extension at a time: a second Chrome profile connecting would
      // race the first for every job. Newest wins, which matches the user's
      // most recent intent.
      this.socket?.close();
      this.socket = socket;
      this.onLink(true);

      socket.on("message", (raw) => this.receive(raw));
      socket.on("close", () => {
        if (this.socket !== socket) return;
        this.socket = null;
        this.onLink(false);
        this.failAllPending("extensionDisconnected");
      });
      socket.on("error", () => {});
    });

    this.server.on("error", (error) => {
      // Almost always EADDRINUSE from a second client instance. Say so — the
      // symptom otherwise is "the extension never connects", with no clue.
      console.error(
        `Extension link cannot listen on ${this.port}: ${error.message}`,
      );
    });
  }

  receive(raw) {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return; // Not ours; ignore rather than tear the link down.
    }

    switch (message?.type) {
      case LINK.ACK: {
        const settle = this.pending.get(message.id);
        if (!settle) return;
        this.pending.delete(message.id);
        settle(message);
        return;
      }
      case LINK.RELAY:
        this.onRelay(message.name, message.payload);
        return;
      case LINK.TABS:
        this.onTabs(message.tabs ?? {});
        return;
      case LINK.PING:
        this.send({ type: LINK.PONG });
        return;
      case LINK.FOCUS:
        this.onFocus();
        return;
      case LINK.AGENT_CONFIG: {
        void Promise.resolve()
          .then(() => (this.onAgentConfig ? this.onAgentConfig() : null))
          .then((summary) => {
            this.send({ type: LINK.ACK, id: message.id, ok: true, summary });
          })
          .catch((error) => {
            this.send({
              type: LINK.ACK,
              id: message.id,
              ok: false,
              error: error?.message || "configFailed",
            });
          });
        return;
      }
      case LINK.AGENT_STREAM: {
        this.send({ type: LINK.ACK, id: message.id, ok: true });
        if (this.onAgentStream) {
          this.onAgentStream({
            jobId: message.jobId,
            providerId: message.providerId,
            model: message.model,
            messages: message.messages,
            tools: message.tools,
            reasoningEffort: message.reasoningEffort,
            onChunk: (chunk) => {
              this.send({
                type: LINK.AGENT_STREAM_CHUNK,
                jobId: message.jobId,
                chunk,
              });
            },
            onDone: (outcome) => {
              this.send({
                type: LINK.AGENT_STREAM_DONE,
                jobId: message.jobId,
                ...outcome,
              });
            },
          });
        } else {
          this.send({
            type: LINK.AGENT_STREAM_DONE,
            jobId: message.jobId,
            ok: false,
            error: "notSupported",
          });
        }
        return;
      }
      case LINK.AGENT_STREAM_CANCEL: {
        this.onAgentStreamCancel?.(message.jobId);
        return;
      }
      case LINK.CLI_INVOKE: {
        void Promise.resolve()
          .then(() => {
            if (!this.onCliInvoke) throw new Error("cliNotSupported");
            return this.onCliInvoke(message.channel, message.args);
          })
          .then((value) => {
            this.send({ type: LINK.ACK, id: message.id, ok: true, value });
          })
          .catch((error) => {
            this.send({
              type: LINK.ACK,
              id: message.id,
              ok: false,
              error: error?.message || "cli.failed",
            });
          });
        return;
      }
      default:
    }
  }

  send(message) {
    if (!this.linked) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  failAllPending(code) {
    for (const settle of this.pending.values()) {
      settle({ ok: false, error: code });
    }
    this.pending.clear();
  }

  /**
   * Hands one platform job to the extension and resolves when it accepts.
   * The outcome itself arrives later as a relayed BG.PLATFORM_JOB_DONE, the
   * same shape the canvas already waits for.
   */
  route({ platform, envelope, jobId, activate, allowCreate }) {
    if (!this.linked) throw new Error("extensionNotLinked");

    const id = (this.nextId += 1);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("extensionAckTimeout"));
      }, this.ackTimeoutMs);

      this.pending.set(id, (reply) => {
        clearTimeout(timer);
        if (reply.ok) resolve();
        else reject(new Error(reply.error ?? "generic"));
      });

      this.send({
        type: LINK.JOB,
        id,
        platform,
        envelope,
        jobId,
        activate,
        allowCreate,
      });
    });
  }

  /** Pushes a CLI event (e.g. voo:codex-text) to the connected extension. */
  pushCliEvent(channel, payload) {
    return this.send({ type: LINK.CLI_EVENT, channel, payload });
  }

  /** Asks Chrome to open or focus a platform's tab. */
  openPlatform(platform) {
    return this.send({ type: LINK.OPEN, platform });
  }

  stop() {
    this.socket?.close();
    this.socket = null;
    this.server?.close();
    this.server = null;
  }
}
