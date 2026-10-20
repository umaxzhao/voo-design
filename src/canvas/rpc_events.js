import { isEnvelope } from "../shared/messages.js";
import { CANVAS_MODE } from "./environment.js";
import { getEnvironment, RpcError } from "./rpc_environment.js";

export const pending = new Map();
export const eventListeners = new Map();
/** Desktop stand-in for chrome.runtime.onMessage listeners. */
export const desktopMessageListeners = new Set();

export function dispatchEvent(envelope) {
  eventListeners
    .get(envelope.name)
    ?.forEach((listener) => listener(envelope.payload));
}

// Desktop transport: the main process relays both content-script events and
// job outcomes over one channel, mirroring what runtime broadcasts did.
globalThis.vooDesktop?.onMessage?.((message) => {
  if (isEnvelope(message)) {
    if (message.kind === "event") dispatchEvent(message);
    return;
  }
  desktopMessageListeners.forEach((listener) => listener(message));
});

// Frame transport: envelopes from the host content script. Guarded so the
// module stays importable outside a DOM (unit tests run in plain Node).
globalThis.window?.addEventListener("message", (event) => {
  const { mode, hostOrigin } = getEnvironment();
  if (mode !== CANVAS_MODE.FRAME) return;
  if (hostOrigin && event.origin !== hostOrigin) return;
  if (!isEnvelope(event.data)) return;

  const envelope = event.data;

  if (envelope.kind === "response") {
    const entry = pending.get(envelope.id);
    if (!entry) return;
    pending.delete(envelope.id);
    clearTimeout(entry.timer);
    if (envelope.error)
      entry.reject(
        new RpcError(
          envelope.error.code,
          envelope.error.message,
          envelope.error.details,
        ),
      );
    else entry.resolve(envelope.result);
    return;
  }

  if (envelope.kind === "event") dispatchEvent(envelope);
});

// Extension pages additionally receive runtime broadcasts from content scripts.
if (globalThis.chrome?.runtime?.id) {
  chrome.runtime.onMessage.addListener((message) => {
    if (isEnvelope(message) && message.kind === "event") dispatchEvent(message);
  });
}

export function onHostEvent(name, listener) {
  const env = getEnvironment();
  if (env.bridge) return env.bridge.onEvent(name, listener);
  if (!eventListeners.has(name)) eventListeners.set(name, new Set());
  eventListeners.get(name).add(listener);
  return () => eventListeners.get(name)?.delete(listener);
}
