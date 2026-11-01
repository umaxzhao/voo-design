/**
 * Offline-first local model asset loader & Chrome browser cache manager.
 *
 * Implements tiered on-demand loading and persistent browser caching:
 * 1. Native Electron IPC (`electronAPI.loadModelBytes`) directly from disk (0 network).
 * 2. Chrome CacheStorage (`caches.open`) matching localUrl, fallbackUrl, or canonical filename.
 * 3. Chrome IndexedDB (`voo_browser_model_cache`) for environments where CacheStorage
 *    is unavailable (e.g. non-secure IP contexts or restricted sandboxes).
 * 4. On-demand streaming download via fetch() with real-time percentage progress.
 * 5. Automatic caching into Chrome (CacheStorage + IndexedDB) upon completed download,
 *    so subsequent runs in the browser are completely offline and instantaneous.
 */

import { isHtmlModelResponse, isValidCachedModelResponse, isValidModelPayload } from "./model-asset-payload.js";

export const DEFAULT_MODEL_CACHE_NAME = "voo-models-cache-v1";
const IDB_NAME = "voo_browser_model_cache";
const IDB_STORE = "models";

/**
 * Resolves a model asset's local URL relative to the active document origin.
 *
 * @param {string} filename - The file name of the model (e.g. "rmbg-1.4-fp16.onnx").
 * @returns {string} The resolved local URL.
 */
export function resolveLocalModelUrl(filename) {
  if (typeof window !== "undefined" && window.location?.href) {
    try {
      return new URL(`models/${filename}`, window.location.href).href;
    } catch {
      // Fall through to relative path
    }
  }
  return `/models/${filename}`;
}

/**
 * Opens or accesses the Chrome CacheStorage bucket safely.
 */
async function getCacheStorage(cacheName = DEFAULT_MODEL_CACHE_NAME) {
  if (typeof caches === "undefined" || typeof caches.open !== "function") {
    return null;
  }
  try {
    return await caches.open(cacheName);
  } catch (err) {
    console.warn("[model_asset_loader] CacheStorage open failed:", err);
    return null;
  }
}

/**
 * Opens or accesses the IndexedDB database for model binary persistence.
 */
function openModelDatabase() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(IDB_NAME, 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function getIndexedDbModel(key) {
  const db = await openModelDatabase();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result && req.result.bytes) {
          resolve(new Uint8Array(req.result.bytes));
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function putIndexedDbModel(key, bytes, meta = {}) {
  const db = await openModelDatabase();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      store.put({
        key,
        bytes: buffer,
        updatedAt: Date.now(),
        ...meta,
      });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

async function deleteIndexedDbModel(key) {
  const db = await openModelDatabase();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      store.delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Checks browser caches or native IPC availability without reading whole native models.
 * The native result is capability-only: this API cannot cheaply certify a particular file.
 *
 * @param {object} options
 * @param {string} options.filename - The model file name (e.g. "rmbg-1.4-fp16.onnx").
 * @param {string} [options.fallbackUrl] - The remote model URL.
 * @param {string} [options.cacheName] - Name of the CacheStorage bucket.
 * @returns {Promise<boolean>}
 */
export async function isModelAssetCached({
  filename,
  fallbackUrl,
  cacheName = DEFAULT_MODEL_CACHE_NAME,
}) {
  // Preserve native UI behavior without reading a 100MB model for a badge.
  // Capability is not proof this particular optional weight is installed.
  if (typeof window !== "undefined" && window.electronAPI?.loadModelBytes) return true;

  const localUrl = resolveLocalModelUrl(filename);
  const cacheKeys = [localUrl, fallbackUrl, `/models/${filename}`, filename].filter(Boolean);

  // 2. Chrome CacheStorage check
  const cache = await getCacheStorage(cacheName);
  if (cache) {
    for (const key of cacheKeys) {
      try {
        const match = await cache.match(key);
        if (match && await isValidCachedModelResponse(match)) return true;
        if (match) await cache.delete(key);
      } catch {
        // continue
      }
    }
  }

  // 3. Chrome IndexedDB check
  for (const key of cacheKeys) {
    try {
      const data = await getIndexedDbModel(key);
      if (isValidModelPayload(data)) return true;
      if (data) await deleteIndexedDbModel(key);
    } catch {
      // continue
    }
  }

  return false;
}

/**
 * Deletes a cached model asset from Chrome CacheStorage and IndexedDB.
 */
export async function deleteModelAsset({
  filename,
  fallbackUrl,
  cacheName = DEFAULT_MODEL_CACHE_NAME,
}) {
  const localUrl = resolveLocalModelUrl(filename);
  const cacheKeys = [localUrl, fallbackUrl, `/models/${filename}`, filename].filter(Boolean);

  const cache = await getCacheStorage(cacheName);
  if (cache) {
    for (const key of cacheKeys) {
      await cache.delete(key).catch(() => {});
    }
  }

  for (const key of cacheKeys) {
    await deleteIndexedDbModel(key).catch(() => {});
  }
  return true;
}

/**
 * Loads the raw binary bytes of an ONNX model.
 * In the browser, downloads on demand and caches to Chrome.
 *
 * @param {object} options
 * @param {string} options.filename - The model file name (e.g. "rmbg-1.4-fp16.onnx").
 * @param {string} [options.fallbackUrl] - Remote URL to fall back to if local asset is missing.
 * @param {string} [options.cacheName] - Name of the CacheStorage bucket.
 * @param {(progress: { phase: string, loaded: number, total: number, percent?: number }) => void} [options.onProgress]
 * @returns {Promise<Uint8Array>}
 */
export async function loadModelAssetBytes({
  filename,
  fallbackUrl,
  cacheName = DEFAULT_MODEL_CACHE_NAME,
  onProgress,
  signal,
}) {
  signal?.throwIfAborted();
  // 1. Native Electron direct disk loader (zero network, instant I/O)
  if (typeof window !== "undefined" && window.electronAPI?.loadModelBytes) {
    try {
      const buffer = await window.electronAPI.loadModelBytes(filename);
      if (buffer && buffer.byteLength > 0) {
        onProgress?.({ phase: "loaded", loaded: 1, total: 1, percent: 100 });
        return new Uint8Array(buffer);
      }
    } catch (err) {
      console.warn(`[model_asset_loader] Electron disk read failed for ${filename}:`, err);
    }
  }

  const localUrl = resolveLocalModelUrl(filename);
  const cacheKeys = [localUrl, fallbackUrl, `/models/${filename}`, filename].filter(Boolean);

  // 2. Check Chrome CacheStorage
  const cache = await getCacheStorage(cacheName);
  if (cache) {
    for (const key of cacheKeys) {
      try {
        const cached = await cache.match(key);
        if (cached) {
          const buffer = await cached.arrayBuffer();
          if (buffer && isValidModelPayload(new Uint8Array(buffer))) {
            onProgress?.({ phase: "cached", loaded: buffer.byteLength, total: buffer.byteLength, percent: 100 });
            return new Uint8Array(buffer);
          }
          await cache.delete(key);
        }
      } catch {
        // continue to next key
      }
    }
  }

  // 3. Check Chrome IndexedDB fallback
  for (const key of cacheKeys) {
    try {
      const idbBytes = await getIndexedDbModel(key);
      if (isValidModelPayload(idbBytes)) {
        onProgress?.({ phase: "cached", loaded: idbBytes.byteLength, total: idbBytes.byteLength, percent: 100 });
        return idbBytes;
      }
      if (idbBytes) await deleteIndexedDbModel(key);
    } catch {
      // continue
    }
  }

  // 4. On-demand download from local static asset URL
  try {
    const response = await (signal ? fetch(localUrl, { signal }) : fetch(localUrl));
    if (response.ok) {
      const bytes = await streamResponseAndCache(response, cacheKeys, cache, onProgress, signal);
      return bytes;
    }
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    // Local fetch failed (e.g. not found or restricted), try remote fallback
  }

  // 5. Fallback to remote CDN if provided
  if (fallbackUrl) {
    const response = await (signal ? fetch(fallbackUrl, { signal }) : fetch(fallbackUrl));
    if (!response.ok) {
      throw new Error(`modelAssetFetchFailed:${response.status} for ${filename}`);
    }
    return await streamResponseAndCache(response, cacheKeys, cache, onProgress, signal);
  }

  throw new Error(`modelAssetNotFound:${filename}`);
}

/**
 * Streams the response body with progress tracking and caches the result into Chrome.
 */
async function streamResponseAndCache(response, cacheKeys, cache, onProgress, signal) {
  signal?.throwIfAborted();
  if (isHtmlModelResponse(response)) {
    await response.body?.cancel?.();
    throw new Error("modelAssetInvalidResponse");
  }
  const total = Number(response.headers.get("content-length")) || 0;
  const reader = response.body?.getReader();

  let bytes;
  if (!reader) {
    const buffer = await response.arrayBuffer();
    bytes = new Uint8Array(buffer);
    if (!isValidModelPayload(bytes)) throw new Error("modelAssetInvalidResponse");
    onProgress?.({ phase: "loaded", loaded: bytes.byteLength, total: bytes.byteLength, percent: 100 });
  } else {
    const chunks = [];
    let loaded = 0;
    for (;;) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : undefined;
      onProgress?.({ phase: "downloading", loaded, total, percent });
    }

    bytes = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    if (!isValidModelPayload(bytes)) throw new Error("modelAssetInvalidResponse");
    onProgress?.({ phase: "loaded", loaded: bytes.byteLength, total: bytes.byteLength, percent: 100 });
  }

  signal?.throwIfAborted();
  // Read historical aliases, but persist one canonical copy per storage tier.
  // Duplicating a 110 MB model for every alias caused large renderer allocations.
  const canonicalKeys = cacheKeys.slice(0, 1);
  if (cache) {
    for (const key of canonicalKeys) {
      try {
        const cachedResponse = new Response(bytes, {
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Length": String(bytes.byteLength),
          },
        });
        await cache.put(key, cachedResponse);
      } catch (err) {
        console.warn(`[model_asset_loader] Failed to put into cache for ${key}:`, err);
      }
    }
  }

  // Persist into Chrome IndexedDB
  for (const key of canonicalKeys) {
    signal?.throwIfAborted();
    try {
      await putIndexedDbModel(key, bytes);
    } catch (err) {
      console.warn(`[model_asset_loader] Failed to put into IndexedDB for ${key}:`, err);
    }
  }

  return bytes;
}
