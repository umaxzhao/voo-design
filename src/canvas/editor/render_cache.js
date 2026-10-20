/**
 * Small bounded canvas caches shared by the 2D node renderer.
 *
 * Entries are intentionally keyed by immutable render inputs, not by a frame
 * counter. The caller supplies the document revision, so undo/redo invalidates
 * every entry without retaining old document snapshots.
 */

const CACHE_LIMITS = {
  boolean: 24,
  customBlend: 24,
  softPath: 32,
};

const caches = new Map(
  Object.keys(CACHE_LIMITS).map((name) => [name, new Map()]),
);

export function renderSignature(value) {
  return JSON.stringify(value);
}

/** Returns an LRU entry and moves it to the newest position. */
export function getRenderCache(kind, key) {
  const cache = caches.get(kind);
  if (!cache) return null;
  const value = cache.get(key);
  if (!value) return null;
  cache.delete(key);
  cache.set(key, value);
  return value;
}

/** Stores a canvas in a small LRU so zooming cannot grow memory forever. */
export function setRenderCache(kind, key, canvas) {
  const cache = caches.get(kind);
  const limit = CACHE_LIMITS[kind];
  if (!cache || !limit) return;
  if (cache.has(key)) cache.delete(key);
  while (cache.size >= limit) cache.delete(cache.keys().next().value);
  cache.set(key, canvas);
}

/** Test-only invalidation; production entries age out through their LRU. */
export function clearRenderCaches() {
  for (const cache of caches.values()) cache.clear();
}
