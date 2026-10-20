/**
 * The hosted editor's optional link to the desktop app.
 *
 * The app-served page (http://127.0.0.1:<port>/editor/) reaches the app
 * because it *is* the app's page. The hosted page at https://voo.run is a
 * stranger to the machine, and has to be let in: the app's panel server
 * allowlists this exact origin (`src/shared/desktop_app_origin.js`) and this
 * module is the page's half of that link — dial, verify, and hand the canvas
 * the same bridge contract the app-served page already uses, so provider
 * credentials and the agent/CLI configuration come from the app instead of
 * being configured a second time.
 *
 * Why it is opt-in rather than automatic. A public origin dialling 127.0.0.1
 * makes Chrome raise its Local Network Access prompt ("Apps on device"),
 * once per origin. Dialling on load would put that prompt in front of every
 * visitor, most of whom never run the app — the same reason the CLI bridge
 * dials only after the user picks a CLI agent (`shouldDialCliBridge`). So the
 * page dials only after the user asks for it, and remembers that answer.
 *
 * Safari blocks the dial as mixed content outright; Chrome and Firefox allow
 * it once the permission is granted. Nothing here needs to know that — a
 * failed dial is just an unavailable app.
 */

import { DESKTOP_EDITOR_PORT } from "../shared/messages.js";
import { HOSTED_EDITOR_ORIGIN } from "../shared/desktop_app_origin.js";

/** Page-local preference: has this user asked to run on the desktop app? */
const LINK_FLAG_KEY = "ciw.desktopAppLink";

/** How long a probe waits for the app's panel link before calling it absent. */
const PROBE_TIMEOUT_MS = 1500;

/**
 * The app's panel link, the same socket the app-served page dials. The port is
 * the fixed `DESKTOP_EDITOR_PORT`; a build that overrides `VOO_EDITOR_PORT`
 * binds elsewhere and is simply not found, which reads as "no app running".
 */
export function desktopAppWsUrl() {
  return `ws://127.0.0.1:${DESKTOP_EDITOR_PORT}/`;
}

/** True on the hosted editor, the only page origin the app admits. */
export function isHostedEditorPage(origin = globalThis.location?.origin) {
  return origin === HOSTED_EDITOR_ORIGIN;
}

/**
 * The stored preference, read straight from `localStorage`.
 *
 * Deliberately not `getSetting`: this has to answer before the settings
 * transport exists (environment detection runs first), and it must not travel
 * through `BG.SETTINGS_SET`, whose allowlist would reject an unlisted key.
 * The value is page-local by nature — it describes this browser's link to a
 * machine-local socket, not a preference to sync between surfaces.
 */
export function isDesktopAppLinkEnabled() {
  try {
    return globalThis.localStorage?.getItem(LINK_FLAG_KEY) === "1";
  } catch {
    // Storage denied: the link stays off, which is the safe default.
    return false;
  }
}

/** Persists the preference. A denied write leaves the link off. */
export function setDesktopAppLinkEnabled(enabled) {
  try {
    if (enabled) globalThis.localStorage?.setItem(LINK_FLAG_KEY, "1");
    else globalThis.localStorage?.removeItem(LINK_FLAG_KEY);
  } catch {
    return false;
  }
  return true;
}

/** True when the page should run against the app instead of its own stores. */
export function shouldUseDesktopApp(origin = globalThis.location?.origin) {
  return isHostedEditorPage(origin) && isDesktopAppLinkEnabled();
}

/**
 * Dials the app once to find out whether it is running, then hangs up.
 *
 * Resolves false for every failure shape — closed, refused, blocked, timed
 * out, no `WebSocket` at all — because the caller only ever asks one question:
 * is the app there. Nothing is logged: a user who enabled the link and then
 * closed the app must not get a console full of dial failures on every load.
 *
 * @param {object} [options]
 * @param {number} [options.timeoutMs] how long to wait before giving up
 * @param {typeof WebSocket} [options.WebSocketImpl] injected in tests
 * @returns {Promise<boolean>}
 */
export function probeDesktopApp({
  timeoutMs = PROBE_TIMEOUT_MS,
  WebSocketImpl = globalThis.WebSocket,
} = {}) {
  return new Promise((resolve) => {
    if (typeof WebSocketImpl !== "function") {
      resolve(false);
      return;
    }
    let socket = null;
    let settled = false;
    const settle = (reachable) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Only a socket that is still opening or open needs closing; closing any
      // other state is either a no-op or a throw, and the answer is already
      // decided by now.
      if (socket && socket.readyState <= 1) socket.close();
      resolve(reachable);
    };
    const timer = setTimeout(() => settle(false), timeoutMs);
    try {
      socket = new WebSocketImpl(desktopAppWsUrl());
    } catch {
      // A malformed or refused URL throws synchronously in some browsers.
      settle(false);
      return;
    }
    socket.addEventListener("open", () => settle(true));
    socket.addEventListener("error", () => settle(false));
    socket.addEventListener("close", () => settle(false));
  });
}
