/**
 * Pluggable credential storage for the API providers.
 *
 * The provider modules run in two places: the extension's service worker,
 * where credentials live in chrome.storage, and the standalone hosted editor,
 * where they live in web storage on the voo.run origin. Both expose the
 * chrome.storage area shape (`get`/`set`/`remove` with object payloads), so
 * the providers themselves stay storage-agnostic.
 *
 * The default factory reads chrome.storage; a hosted page installs a
 * localStorage/sessionStorage factory at startup (see
 * canvas/credential_store_web.js).
 */

let areaFactory = (name) => globalThis.chrome?.storage?.[name] ?? null;

/**
 * Replaces the area factory. `next(name)` receives "local" or "session" and
 * returns a chrome.storage-like area, or null when unavailable.
 */
export function setCredentialAreaFactory(next) {
  areaFactory = next;
}

/** The named credential area, or null when this context has none. */
export function credentialArea(name) {
  const area = areaFactory(name);
  if (area) return area;
  const storage = name === "session" ? globalThis.sessionStorage : globalThis.localStorage;
  if (!storage) return null;
  return {
    async get(key) { const raw = storage.getItem(key); return { [key]: raw ? JSON.parse(raw) : undefined }; },
    async set(values) { for (const [key, value] of Object.entries(values)) storage.setItem(key, JSON.stringify(value)); },
    async remove(key) { storage.removeItem(key); },
  };
}
