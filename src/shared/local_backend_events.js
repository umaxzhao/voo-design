/**
 * One process owns a managed backend's lifecycle (the Electron main process),
 * but two very different places care about it: the provider layer, which boots a
 * stopped backend on demand, and the canvas run banner, which should say so
 * while the node waits instead of looking stuck.
 *
 * The provider runs in the same page as the canvas in the desktop/standalone
 * host, so a window event is the whole channel they need. Extension and hosted
 * hosts have no managed backend to start, and an event with no listener costs
 * nothing.
 */

export const LOCAL_BACKEND_STARTING_EVENT = "voo-local-backend-starting";

/** Announces that a managed backend is booting; a no-op without a DOM. */
export function announceLocalBackendStarting(kind) {
  try {
    globalThis.window?.dispatchEvent(
      new CustomEvent(LOCAL_BACKEND_STARTING_EVENT, { detail: { kind } }),
    );
  } catch {
    // No window (service worker) or no CustomEvent: the boot still happens.
  }
}

/** Calls `onStart(kind)` whenever a managed backend begins booting. */
export function onLocalBackendStarting(onStart) {
  const target = globalThis.window;
  if (typeof onStart !== "function" || !target?.addEventListener) {
    return () => {};
  }
  const listener = (event) => onStart(event?.detail?.kind ?? null);
  target.addEventListener(LOCAL_BACKEND_STARTING_EVENT, listener);
  return () =>
    target.removeEventListener(LOCAL_BACKEND_STARTING_EVENT, listener);
}
