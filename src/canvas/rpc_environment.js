import {
  CANVAS_MODE,
  hasDesktopApis,
  resolveHostOrigin,
} from "./environment.js";

/**
 * Chrome rejects every extension API call with this once the extension has
 * been reloaded underneath a still-running page. Left unhandled it surfaces as
 * an unhandled promise rejection instead of something the user can act on.
 */
export const CONTEXT_GONE = /Extension context invalidated/i;

/** Carries the adapter's error code so the UI can localize it. */
export class RpcError extends Error {
  constructor(code, message, details) {
    super(message ?? code);
    this.name = "RpcError";
    this.code = code;
    if (details) this.details = details;
  }
}

/** Translates a dead extension context into an actionable error code. */
export async function guarded(run) {
  try {
    return await run();
  } catch (error) {
    if (CONTEXT_GONE.test(error?.message ?? "")) {
      throw new RpcError("extensionReloaded");
    }
    throw error;
  }
}

let environment = null;

/**
 * Installs the detected environment. Called once from main.jsx before the app
 * renders, so every call below can stay synchronous about its choice.
 */
export function setEnvironment(next) {
  environment = next;
}

/**
 * The current environment. Before detection finishes only the synchronous
 * signals are available, which still separates frames from extension pages —
 * the bridge/standalone distinction resolves to standalone until then.
 */
export function getEnvironment() {
  if (environment) return environment;
  if (hasDesktopApis()) return { mode: CANVAS_MODE.DESKTOP, bridge: null };
  const win = globalThis.window;
  if (win && win.parent !== win) {
    const hasExtensionApis = Boolean(globalThis.chrome?.runtime?.id);
    return {
      mode: CANVAS_MODE.FRAME,
      hosted: !hasExtensionApis,
      hostOrigin: resolveHostOrigin(),
      bridge: null,
    };
  }
  if (globalThis.chrome?.runtime?.id) {
    return { mode: CANVAS_MODE.EXTENSION, bridge: null };
  }
  return { mode: CANVAS_MODE.STANDALONE, bridge: null };
}

/** True while running as any extension-origin page. */
export function hasChromeApis() {
  return Boolean(globalThis.chrome?.runtime?.id);
}

export function isInSidePanel() {
  return getEnvironment().mode !== CANVAS_MODE.FRAME;
}

export function isStandaloneTab() {
  return (
    isInSidePanel() &&
    new URLSearchParams(globalThis.window?.location?.search ?? "").get(
      "mode",
    ) === "tab"
  );
}

/** A chat host is reachable in every mode except standalone. */
export function isHostAvailable() {
  return getEnvironment().mode !== CANVAS_MODE.STANDALONE;
}
