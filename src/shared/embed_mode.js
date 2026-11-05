/**
 * One embed-mode rule for every surface.
 *
 * The page is embedded when the query carries `embed` or `minimal`; the value
 * is irrelevant (`?embed`, `?embed=1` and `?embed=true` all count). The canvas
 * MCP link and the chrome both read this helper so they cannot disagree.
 */

/**
 * Whether a search string asks for the embedded editor.
 * @param {string} search - `window.location.search` (a leading `?` is optional).
 * @returns {boolean}
 */
export function isEmbedQuery(search) {
  try {
    const params = new URLSearchParams(typeof search === "string" ? search : "");
    return params.has("embed") || params.has("minimal");
  } catch {
    return false;
  }
}

/** Embed state for the current page; `false` outside a browser. */
export function isEmbedPage() {
  if (typeof window === "undefined" || !window.location) return false;
  return isEmbedQuery(window.location.search);
}

/**
 * The harness side panel asks for the FULL editor chrome (title bar, mint
 * frame) while still auto-opening a project and linking the canvas. This is
 * separate from `embed`/`minimal`, which keep the minimal webview chrome.
 */
export function isHarnessQuery(search) {
  try {
    const params = new URLSearchParams(typeof search === "string" ? search : "");
    return params.has("harness") || params.has("panel");
  } catch {
    return false;
  }
}

/** Harness-panel state for the current page; `false` outside a browser. */
export function isHarnessPage() {
  if (typeof window === "undefined" || !window.location) return false;
  return isHarnessQuery(window.location.search);
}
