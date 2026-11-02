/**
 * Cross-panel change notification.
 *
 * The same workflow can be open in several places at once — the side panel on a
 * ChatGPT tab, the floating window on a Gemini tab — and each one holds its own
 * in-memory copy that it autosaves wholesale. Without a signal, the last writer
 * would silently overwrite the other's edits.
 *
 * The channel depends on where this canvas runs:
 *
 *  - extension pages (and the extension's own frames) share
 *    `chrome.storage.local`, whose `onChanged` fires across all of them;
 *  - hosted pages (voo.run/editor with the extension) announce through the
 *    worker (`bg.syncAnnounce`), which writes the same storage marker and
 *    relays it back over the bridge port;
 *  - the desktop app and its served panel pages announce through the app's
 *    main process, which owns the marker and fans it out to every canvas;
 *  - standalone pages have neither, so a `BroadcastChannel` links the tabs of
 *    the same browser profile.
 *
 * Only a tiny marker travels through any of them; the document itself stays in
 * IndexedDB (extension-origin or local, depending on the mode).
 */

import { BG, isEnvelope } from "../../shared/messages.js";
import { getEnvironment } from "../rpc.js";

const CHANNEL_KEY = "ciw.lastWrite";
const BROADCAST_CHANNEL = "ciw.sync";

/** Absent outside the extension (local preview); syncing is then a no-op. */
const storage = globalThis.chrome?.storage;

/** The desktop app's main process owns the marker for its canvases. */
const desktopBridge = globalThis.vooDesktop?.callBackground
  ? globalThis.vooDesktop
  : null;

/** Identifies this panel so it can ignore the echo of its own writes. */
const writerId = crypto.randomUUID();

function broadcastChannel() {
  if (typeof BroadcastChannel === "undefined") return null;
  return new BroadcastChannel(BROADCAST_CHANNEL);
}

/**
 * Tells the other panels that this one wrote.
 *
 * The revision travels along so a listener can tell an update it is missing
 * from one it has already overtaken.
 */
export function announceWrite(workflowId, rev = 0) {
  const marker = { workflowId, rev, writerId, at: Date.now() };
  const env = getEnvironment();
  if (env.bridge) {
    env.bridge
      .call(BG.SYNC_ANNOUNCE, { workflowId, rev, writerId })
      .catch(() => {
        // Losing a notification only costs a manual refresh in the other panel.
      });
    return;
  }
  if (desktopBridge) {
    desktopBridge
      .callBackground(BG.SYNC_ANNOUNCE, { workflowId, rev, writerId })
      .catch(() => {
        // Losing a notification only costs a manual refresh in the app canvas.
      });
    return;
  }
  if (storage) {
    // Fail-safe cross-tab sync announcement; missing or restricted storage is non-fatal.
    storage.local.set({ [CHANNEL_KEY]: marker }).catch(() => {});
    return;
  }
  const channel = broadcastChannel();
  channel?.postMessage(marker);
  channel?.close();
}

/**
 * Subscribes to writes made by *other* panels.
 * @param {(write: {workflowId: string, rev: number, at: number}) => void} listener
 * @returns {() => void} unsubscribe
 */
export function onRemoteWrite(listener) {
  const env = getEnvironment();
  if (env.bridge) {
    // The worker relays storage writes of CHANNEL_KEY under its own name.
    return env.bridge.onEvent(CHANNEL_KEY, (value) => {
      if (!value || value.writerId === writerId) return;
      listener(value);
    });
  }
  if (desktopBridge?.onMessage) {
    // The app's main process pushes the marker to every canvas, its own and
    // any linked panel pages.
    return desktopBridge.onMessage((message) => {
      if (!isEnvelope(message)) return;
      if (message.kind !== "event" || message.name !== CHANNEL_KEY) return;
      const value = message.payload;
      if (!value || value.writerId === writerId) return;
      listener(value);
    });
  }
  if (storage) {
    const handler = (changes, area) => {
      if (area !== "local") return;
      const value = changes[CHANNEL_KEY]?.newValue;
      if (!value || value.writerId === writerId) return;
      listener(value);
    };

    storage.onChanged.addListener(handler);
    return () => storage.onChanged.removeListener(handler);
  }
  const channel = broadcastChannel();
  if (!channel) return () => {};
  channel.onmessage = (event) => {
    const value = event.data;
    if (!value || value.writerId === writerId) return;
    listener(value);
  };
  return () => channel.close();
}
