/**
 * Extension identity used by the hosted editor to reach this extension.
 *
 * A web page talks to an extension by ID (`chrome.runtime.sendMessage(id, …)`),
 * so the hosted editor must know it. The dev build's ID is pinned by the
 * manifest `key` field; the published ID is assigned by the Chrome Web Store
 * and filled in here at release time. The `?extid=` override exists for dev
 * setups that load a differently-keyed build.
 */

/** ID derived from the manifest `key` — stable for every unpacked dev install. */
export const DEV_EXTENSION_ID = "iippbemfbmjdkfpjbhjcfcbcmmjidaim";

/** Chrome Web Store ID. Placeholder until the listing exists. */
export const PUBLISHED_EXTENSION_ID = "";

const OVERRIDE_PARAM = "extid";
const OVERRIDE_STORAGE_KEY = "ciw.extensionId";

/**
 * IDs to probe, most specific first: query param, a persisted choice, the
 * published listing, then the dev key. Empty entries are dropped.
 */
export function candidateExtensionIds() {
  const ids = [];
  try {
    const fromQuery = new URLSearchParams(globalThis.location?.search).get(
      OVERRIDE_PARAM,
    );
    if (fromQuery) ids.push(fromQuery);
    const stored = globalThis.localStorage?.getItem(OVERRIDE_STORAGE_KEY);
    if (stored) ids.push(stored);
  } catch {
    // Storage access can throw in third-party frames; the constants still apply.
  }
  if (PUBLISHED_EXTENSION_ID) ids.push(PUBLISHED_EXTENSION_ID);
  ids.push(DEV_EXTENSION_ID);
  return [...new Set(ids)];
}
