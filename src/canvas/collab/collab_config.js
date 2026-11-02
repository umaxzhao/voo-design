/**
 * Collaboration runtime config, fetched from the hosting server.
 *
 * The TURN relay the P2P transport needs to cross restrictive NATs is not in
 * the bundle: its credential is deliberately never committed to the source
 * tree, and the same file is what the hosted page and the desktop app both
 * read so neither drifts. The transport already reads `__VOO_ICE_SERVERS__`
 * and `__VOO_SIGNALING_URL__` off the global at connect time — this module
 * installs them once, before any session starts.
 *
 * Best effort: if the server is unreachable (or this is a local dev build with
 * no config) the session falls back to the built-in STUN list, which is the
 * pre-TURN behaviour.
 */

let loaded = null;

/** Absolute config URL; same origin for the hosted page, main-process fetch for the desktop app. */
const CONFIG_URL = "https://voo.run/editor/collab-config.json";

/** Default timeout for the collab config request (3 seconds). */
export const COLLAB_CONFIG_TIMEOUT_MS = 3000;

/** Fetches and parses the config, or null when it is unavailable or times out. */
async function fetchConfig({ timeoutMs = COLLAB_CONFIG_TIMEOUT_MS } = {}) {
  const desktopFetch = globalThis.vooDesktop?.fetchJson;
  if (desktopFetch) {
    // Desktop renderer runs under `voo://app`, so it cannot cross-origin
    // fetch the config itself — the main process has no origin policy.
    try {
      const res = await Promise.race([
        desktopFetch(CONFIG_URL),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("collab config timeout")),
            timeoutMs,
          ),
        ),
      ]);
      if (res?.ok && res.data) return res.data;
      return null;
    } catch (err) {
      console.warn(
        "[collab] Desktop config fetch failed or timed out:",
        err?.message || err,
      );
      return null;
    }
  }
  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller?.abort();
      reject(new Error("collab config timeout"));
    }, timeoutMs);
  });
  try {
    const fetchPromise = fetch(
      CONFIG_URL,
      controller ? { signal: controller.signal } : undefined,
    );
    const res = await Promise.race([fetchPromise, timeoutPromise]);
    if (timer) clearTimeout(timer);
    if (res?.ok) return await res.json();
  } catch (err) {
    if (timer) clearTimeout(timer);
    console.warn(
      "[collab] Config fetch failed or timed out, falling back to built-in ICE:",
      err?.message || err,
    );
  }
  return null;
}

/** Loads the config once and installs the globals the transport reads. */
export async function loadCollabConfig({
  timeoutMs = COLLAB_CONFIG_TIMEOUT_MS,
} = {}) {
  if (loaded) return loaded;
  loaded = (async () => {
    try {
      const config = await fetchConfig({ timeoutMs });
      if (!config) return true;
      if (Array.isArray(config.iceServers) && config.iceServers.length) {
        globalThis.__VOO_ICE_SERVERS__ = config.iceServers;
      }
      if (typeof config.signalingUrl === "string") {
        globalThis.__VOO_SIGNALING_URL__ = config.signalingUrl;
      }
    } catch {
      // Nothing sensible to do with a bad config; keep the defaults.
    }
    return true;
  })();
  return loaded;
}
