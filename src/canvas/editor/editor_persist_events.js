/**
 * Persistence alert bus: the non-blocking channel from editor storage
 * failures (quota exceeded, unreachable assets) to the UI state layer.
 *
 * The engine's background persist queues (matte + paint) catch their errors
 * here instead of swallowing them in a console line; the image-editor panel
 * subscribes and renders an actionable, persistent warning. Delivery is
 * synchronous fan-out with per-listener isolation: a failing listener can
 * never throw into a persist catch or the render loop.
 *
 * Pure logic — zero React, zero DOM dependencies.
 *
 * @module editor/editor_persist_events
 */

/** @typedef {{ type: "persist-quota" | "persist-failed" | "asset-unavailable" | "asset-restored", source?: string, nodeId?: string, assetKey?: string }} PersistAlert */

/** @type {Set<(alert: PersistAlert) => void>} */
const listeners = new Set();

/**
 * Subscribes to persistence alerts. Returns the unsubscribe function so a
 * component effect can hand it straight to React's cleanup.
 */
export function subscribePersistenceAlert(listener) {
  if (typeof listener !== "function") {
    throw new TypeError("subscribePersistenceAlert requires a listener function");
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Fan-out one alert. Listener errors are contained (console-warned) — the
 * persist path that reports a failure must never fail on top of it.
 */
export function emitPersistenceAlert(alert) {
  if (!alert || typeof alert.type !== "string") return;
  for (const listener of listeners) {
    try {
      listener(alert);
    } catch (error) {
      console.warn("persistence alert listener failed", error);
    }
  }
}

/**
 * True for the IndexedDB / storage quota family across browsers: Chrome and
 * Firefox raise DOMException names, Safari surfaces legacy codes, and some
 * wrappers only keep a quota message.
 */
export function isQuotaExceededError(error) {
  const name = typeof error?.name === "string" ? error.name : "";
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") {
    return true;
  }
  if (error?.code === 1014 || error?.code === 22 || error?.code === 102) {
    return true;
  }
  return /quota/i.test(typeof error?.message === "string" ? error.message : "");
}
