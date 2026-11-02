/**
 * Bridge client for the app-served editor page: talks to the desktop app
 * over the loopback panel link.
 *
 * The floating panel loads the app's editor at http://127.0.0.1:<port>/ while
 * the app runs, so the workflow on a chat page is the app's own. This module
 * is the transport: the same bridge shape the hosted editor gets from the
 * extension worker (`call`, `callJob`, `onEvent`), but over a WebSocket to
 * the app, which executes every operation against the app's own storage.
 *
 * The socket is re-established after a drop (the app restarts, the link
 * blips); calls made while it is down fail fast with `desktopUnreachable`
 * instead of hanging.
 */

import { PANEL } from "../shared/messages.js";

const RECONNECT_MS = 1500;
const CALL_TIMEOUT_MS = 60000;
// Video generation can sit queued for minutes before the first status answer;
// a 7-minute fallback would abandon a healthy long job.
const JOB_TIMEOUT_MS = 600000;

/** Carries the app's error code so the UI can localize it. */
export class DesktopWebError extends Error {
  constructor(code, message, details) {
    super(message ?? code);
    this.name = "DesktopWebError";
    this.code = code;
    if (details) this.details = details;
  }
}

export function createDesktopWebBridge({
  wsUrl,
  reconnectMs = RECONNECT_MS,
  callTimeoutMs = CALL_TIMEOUT_MS,
  jobTimeoutMs = JOB_TIMEOUT_MS,
} = {}) {
  let socket = null;
  let seq = 0;
  let closed = false;
  let reconnectTimer = null;
  let resolveReady;
  /** Callers waiting for the link to come up, so a call made during the app's
   *  startup window waits for the dial instead of failing instantly. */
  let openWaiters = [];
  const pending = new Map();
  const eventListeners = new Map();
  const connectionListeners = new Set();
  let connected = false;
  /** Resolves once the first connection is established. */
  const ready = new Promise((resolve) => {
    resolveReady = resolve;
  });

  function notifyConnection(value) {
    connected = value;
    connectionListeners.forEach((listener) => listener(value));
  }

  function notifyOpen() {
    const waiters = openWaiters;
    openWaiters = [];
    for (const waiter of waiters) waiter();
  }

  /**
   * Resolves once a connection is up, or rejects after `timeoutMs`. Waiting
   * for the dial matters: the panel often loads while the app is restarting,
   * and the very first store calls would otherwise fail before the link has
   * had a chance to come up.
   */
  function whenOpen(timeoutMs) {
    if (socket?.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        openWaiters = openWaiters.filter((waiter) => waiter !== done);
        reject(new DesktopWebError("desktopUnreachable"));
      }, timeoutMs);
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      openWaiters.push(done);
    });
  }

  function dispatchEvent(frame) {
    if (frame?.type !== PANEL.EVENT) return;
    eventListeners
      .get(frame.name)
      ?.forEach((listener) => listener(frame.payload));
  }

  function failPending(code) {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new DesktopWebError(code));
    }
    pending.clear();
  }

  function scheduleReconnect() {
    if (closed || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, reconnectMs);
  }

  function connect() {
    if (closed) return;
    if (socket && socket.readyState <= WebSocket.OPEN) return;
    let next;
    try {
      next = new WebSocket(wsUrl);
    } catch {
      scheduleReconnect();
      return;
    }
    socket = next;
    socket.addEventListener("open", () => {
      if (socket !== next) return;
      resolveReady?.();
      resolveReady = null;
      notifyOpen();
      notifyConnection(true);
    });
    socket.addEventListener("message", (event) => {
      if (socket !== next) return;
      let frame;
      try {
        frame = JSON.parse(event.data);
      } catch {
        return;
      }
      if (frame?.type === PANEL.ACK && frame.id !== undefined) {
        const entry = pending.get(frame.id);
        if (!entry) return;
        pending.delete(frame.id);
        clearTimeout(entry.timer);
        if (frame.ok === false) {
          entry.reject(
            new DesktopWebError(frame.error ?? "generic", frame.message),
          );
        } else {
          entry.resolve(frame);
        }
        return;
      }
      dispatchEvent(frame);
    });
    const drop = () => {
      if (socket !== next) return;
      socket = null;
      notifyConnection(false);
      failPending("desktopUnreachable");
      scheduleReconnect();
    };
    socket.addEventListener("close", drop);
    socket.addEventListener("error", drop);
  }

  /**
   * One request/response round trip. If the link is not up yet — the panel
   * often loads while the app is restarting — the call waits for the dial to
   * complete rather than failing instantly; only a genuinely unreachable app
   * rejects.
   */
  function call(type, payload = {}) {
    const id = `${Date.now().toString(36)}-${(seq += 1)}`;
    const outcome = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new DesktopWebError("desktopCallTimeout"));
      }, callTimeoutMs);
      pending.set(id, { resolve, reject, timer });
    });

    const sendOn = (current) => {
      if (!current || current.readyState !== WebSocket.OPEN) return false;
      try {
        current.send(
          JSON.stringify({
            type: PANEL.CALL,
            id,
            request: { type, ...payload },
          }),
        );
        return true;
      } catch {
        return false;
      }
    };

    if (sendOn(socket)) return outcome;
    void whenOpen(callTimeoutMs)
      .then(() => {
        if (!sendOn(socket)) {
          const entry = pending.get(id);
          if (entry) {
            clearTimeout(entry.timer);
            pending.delete(id);
            entry.reject(new DesktopWebError("desktopUnreachable"));
          }
        }
      })
      .catch((error) => {
        const entry = pending.get(id);
        if (entry) {
          clearTimeout(entry.timer);
          pending.delete(id);
          entry.reject(error);
        }
      });
    return outcome;
  }

  /**
   * Starts a job whose outcome arrives later as a pushed event, mirroring
   * bridge.js's callJob: the request only has to be accepted, then the first
   * event matching `doneType` + `jobId` settles the promise.
   */
  async function callJob(
    type,
    payload,
    doneType,
    { timeout = jobTimeoutMs } = {},
  ) {
    const jobId = crypto.randomUUID();
    let unsubscribe = () => {};
    let timer;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
    const outcome = new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        cleanup();
        reject(new DesktopWebError("jobTimeout"));
      }, timeout);
      const listener = (message) => {
        if (message?.jobId !== jobId) return;
        cleanup();
        if (message.ok) resolve(message);
        else
          reject(
            new DesktopWebError(
              message.error ?? "generic",
              message.message,
              message.details,
            ),
          );
      };
      unsubscribe = onEvent(doneType, listener);
    });
    try {
      // Job failures and the call acknowledgement use independent frames.
      // Observe both immediately, including when the acknowledgement stalls.
      const [, result] = await Promise.all([
        call(type, { ...payload, jobId }),
        outcome,
      ]);
      return result;
    } finally {
      cleanup();
    }
  }

  function onEvent(name, listener) {
    if (!eventListeners.has(name)) eventListeners.set(name, new Set());
    eventListeners.get(name).add(listener);
    return () => eventListeners.get(name)?.delete(listener);
  }

  connect();
  return {
    call,
    callJob,
    onEvent,
    ready,
    /** Unlike `ready`, this reports every reconnect to session-bound clients. */
    onConnectionChange(listener) {
      connectionListeners.add(listener);
      listener(connected);
      return () => connectionListeners.delete(listener);
    },
    /** Tears the bridge down for good (page unload). */
    close() {
      closed = true;
      clearTimeout(reconnectTimer);
      failPending("desktopUnreachable");
      socket?.close();
      socket = null;
      notifyConnection(false);
      connectionListeners.clear();
    },
  };
}
