/**
 * Decoded bitmaps for the editor's image nodes.
 *
 * Image nodes persist only an `imageId`; the bytes live in IndexedDB and the
 * object URL that fed the decoder dies with the panel. The cache therefore
 * owns the whole lifecycle — fetch the blob, decode it once, hand the same
 * bitmap to every frame, and revoke the URLs on dispose.
 */

import { getImageBlobMap } from "../store/db.js";
import { emitPersistenceAlert } from "./editor_persist_events.js";
import {
  createAssetPlaceholder,
  isAssetPlaceholder,
  registerUnavailableCache,
} from "./asset_unavailable.js";

export { isAssetFailed, retryAssetLoad } from "./asset_unavailable.js";

export const BITMAP_CACHE_MAX = 128;
export const BITMAP_BYTE_BUDGET_MAX = 256 * 1024 * 1024; // 256MB budget

export function estimateImageBytes(image) {
  if (!image) return 0;
  const w = image.naturalWidth || image.width || 0;
  const h = image.naturalHeight || image.height || 0;
  return w * h * 4;
}

/** Contract alias used by PROJECT.md / performance tests. */
export const calculateBitmapBytes = estimateImageBytes;

export function createBitmapCache({
  onLoad,
  onEvict,
  host = null,
  resolveImage = null,
  maxEntries = BITMAP_CACHE_MAX,
  maxBytes = BITMAP_BYTE_BUDGET_MAX,
} = {}) {
  /** id or src → HTMLImageElement, once decoded. */
  const bitmaps = new Map();
  /** Keys currently being decoded, so a redraw does not queue a second load. */
  const pending = new Set();
  /** Failed asset key -> node: the placeholder stands in until a reload. */
  const failed = new Map();
  const urlByKey = new Map();
  let disposed = false;
  let pinnedKeys = new Set();
  let totalBytes = 0;

  function revokeKeyUrl(key) {
    const url = urlByKey.get(key);
    if (url) {
      URL.revokeObjectURL(url);
      urlByKey.delete(key);
    }
  }

  const instanceRecord = {
    hasFailed: (key) => failed.has(key),
    retry: (key) => retryAsset(key),
  };
  const unregisterUnavailable = registerUnavailableCache(instanceRecord);

  const keyOf = (node) => node.imageId ?? node.src ?? null;

  function touch(key, image) {
    const prev = bitmaps.get(key);
    if (prev) {
      totalBytes -= estimateImageBytes(prev);
    }
    bitmaps.delete(key);
    bitmaps.set(key, image);
    totalBytes += estimateImageBytes(image);
  }

  function evict() {
    while (bitmaps.size > maxEntries || totalBytes > maxBytes) {
      const key = [...bitmaps.keys()].find(
        (candidate) => !pinnedKeys.has(candidate),
      );
      if (!key) return;
      const image = bitmaps.get(key);
      bitmaps.delete(key);
      if (image) {
        totalBytes = Math.max(0, totalBytes - estimateImageBytes(image));
      }
      revokeKeyUrl(key);
      onEvict?.(image);
    }
  }

  async function decode(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      if (!url.startsWith("data:") && !url.startsWith("blob:")) {
        image.crossOrigin = "anonymous";
      }
      image.onload = () => resolve(image);
      image.onerror = (e) =>
        reject(new Error("Image decode failed: " + e.message));
      image.src = url;
      if (image.complete && image.naturalWidth > 0) {
        resolve(image);
      }
    });
  }

  async function load(key, node) {
    pending.add(key);
    try {
      let url = node.src;
      if (!url && node.imageId) {
        const blobs = await getImageBlobMap([node.imageId]);
        const blob = blobs.get(node.imageId);
        if (blob) {
          url = URL.createObjectURL(blob);
          const prev = urlByKey.get(key);
          if (prev && prev !== url) {
            URL.revokeObjectURL(prev);
          }
          urlByKey.set(key, url);
        }
      }
      if (!url && node.imageId) {
        const resolver =
          typeof resolveImage === "function"
            ? resolveImage
            : typeof host?.resolveImage === "function"
              ? (id) => host.resolveImage(id)
              : null;
        if (resolver) {
          url = resolver(node.imageId) ?? null;
        }
      }
      if (!url) {
        markAssetFailed(key, node);
        return;
      }
      const image = downscaleForDisplay(await decode(url));
      if (disposed) {
        revokeKeyUrl(key);
        return;
      }
      touch(key, image);
      if (failed.has(key)) {
        failed.delete(key);
        emitPersistenceAlert({ type: "asset-restored", assetKey: key });
      }
      evict();
      onLoad?.();
    } catch {
      revokeKeyUrl(key);
      // A single unreadable image must not take the document down: the node
      // falls back to a centred placeholder and the layer offers a reload.
      markAssetFailed(key, node);
    } finally {
      pending.delete(key);
    }
  }

  /**
   * Records a failed load, stands a placeholder in for picture nodes (a matte
   * stand-in without a document box stays invisible — compositing a glyph as
   * alpha would corrupt every mask that shares the asset), and alerts the UI
   * exactly once per failure, not once per redraw.
   */
  function markAssetFailed(key, node) {
    if (disposed) return;
    const wasFailed = failed.has(key);
    failed.set(key, node);
    if (!bitmaps.has(key) && Number(node?.width) > 0 && Number(node?.height) > 0) {
      touch(key, createAssetPlaceholder(node));
    }
    onLoad?.();
    if (!wasFailed) {
      emitPersistenceAlert({ type: "asset-unavailable", assetKey: key });
    }
  }

  /** Drops the placeholder and re-runs the load; resolves true when restored. */
  function retryAsset(key) {
    if (disposed || !failed.has(key)) return Promise.resolve(false);
    const node = failed.get(key);
    const current = bitmaps.get(key);
    if (current) {
      bitmaps.delete(key);
      // Only a real bitmap owns a GPU texture; the placeholder does not.
      if (!isAssetPlaceholder(current)) onEvict?.(current);
    }
    revokeKeyUrl(key);
    return load(key, node).then(() => !failed.has(key));
  }

  return {
    /** The bitmap for a node, kicking off a load the first time it is asked for. */
    get(node) {
      const key = keyOf(node);
      if (!key) return undefined;
      const cached = bitmaps.get(key);
      if (cached) {
        touch(key, cached);
        return cached;
      }
      if (!pending.has(key)) void load(key, node);
      return undefined;
    },

    /**
     * The decoded alpha matte for an image node, loaded the same lazy way.
     * Mattes share the IndexedDB image store, so a plain `{imageId}` stand-in
     * node drives the existing load path.
     */
    getMask(node) {
      if (!node.maskId) return undefined;
      return this.get({ imageId: node.maskId });
    },

    /** Registers an already-decoded bitmap, e.g. one just inserted by the user. */
    put(node, image) {
      const key = keyOf(node);
      if (key) {
        touch(key, image);
        evict();
      }
    },

    /** Primes the cache with a matte the engine just produced. */
    putMask(maskId, image) {
      touch(maskId, image);
      evict();
    },

    /** Drops an image that was persisted for an aborted edit. */
    delete(key) {
      const image = bitmaps.get(key);
      bitmaps.delete(key);
      pinnedKeys.delete(key);
      revokeKeyUrl(key);
      if (image) {
        totalBytes = Math.max(0, totalBytes - estimateImageBytes(image));
        onEvict?.(image);
      }
    },

    /** Protect current-document and history-referenced images from LRU eviction. */
    setPinnedKeys(keys) {
      pinnedKeys = new Set(keys);
      evict();
    },

    /** Diagnostics for tests and memory tooling. */
    stats() {
      return {
        size: bitmaps.size,
        totalBytes,
        maxEntries,
        maxBytes,
        pinnedCount: pinnedKeys.size,
      };
    },

    /** Resolves once every image node in the document has been tried. */
    async preload(nodes) {
      await Promise.all(
        nodes.flatMap((node) => {
          const jobs = [];
          if (keyOf(node) && !bitmaps.has(keyOf(node))) {
            jobs.push(load(keyOf(node), node));
          }
          if (node.maskId && !bitmaps.has(node.maskId)) {
            jobs.push(load(node.maskId, { imageId: node.maskId }));
          }
          return jobs;
        }),
      );
    },

    dispose() {
      disposed = true;
      failed.clear();
      unregisterUnavailable();
      for (const url of urlByKey.values()) {
        URL.revokeObjectURL(url);
      }
      urlByKey.clear();
      for (const image of bitmaps.values()) onEvict?.(image);
      bitmaps.clear();
      pending.clear();
    },
  };
}

/** Longest side, in pixels, a picture keeps on the editor canvas. */
export const DISPLAY_MAX_SIDE = 2048;

/**
 * A picture larger than DISPLAY_MAX_SIDE is drawn once onto a canvas at that
 * size, so the editor holds and draws far fewer pixels. The stored file keeps
 * full resolution; only the decoded copy in the editor is smaller. Smaller
 * pictures are returned as they are.
 */
export function downscaleForDisplay(image, maxSide = DISPLAY_MAX_SIDE) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const longest = Math.max(width, height);
  if (!(longest > maxSide) || typeof document === "undefined") return image;
  const scale = maxSide / longest;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) return image;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Decodes a File/Blob into a bitmap plus the object URL that has to be revoked. */
export async function decodeBlob(blob) {
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = (e) =>
        reject(new Error("Blob decode failed: " + e.message));
      image.src = url;
      if (image.complete && image.naturalWidth > 0) resolve(image);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Decodes a File/Blob into an ImageBitmap, skipping the `<img>` element and
 * its Blob URL round-trip (plan 1.8). Falls back to decodeBlob where
 * createImageBitmap is unavailable or rejects.
 */
export async function decodeBlobToBitmap(blob) {
  if (typeof createImageBitmap !== "function") return decodeBlob(blob);
  try {
    return await createImageBitmap(blob);
  } catch {
    return decodeBlob(blob);
  }
}

/** Decodes a File/Blob, data URL, blob URL, or image URL string safely without fetch. */
export async function decodeImageSource(source) {
  if (!source) throw new Error("No image source provided to decode");
  if (source instanceof Blob || source instanceof File) {
    return decodeBlob(source);
  }
  if (typeof source === "string") {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (!source.startsWith("data:") && !source.startsWith("blob:")) {
        img.crossOrigin = "anonymous";
      }
      img.onload = () => resolve(img);
      img.onerror = (e) =>
        reject(new Error("Source decode failed: " + e.message));
      img.src = source;
      if (img.complete && img.naturalWidth > 0) resolve(img);
    });
  }
  throw new Error("Invalid image source type");
}

/**
 * A node's own colour at a document point, over the sample-size window.
 * `fill` shapes answer directly; a bitmap node reads its pixels (scaled from
 * the node box to the bitmap). Null for transparent/absent so the source
 * average skips that layer. This is what makes the eyedropper Source picker
 * (current / below / all) sample genuinely different layer sets, instead of
 * always reading the composited canvas.
 */
export function nodeColorAt(node, docPoint, radius, cache) {
  if (typeof node.fill === "string" && node.fill !== "transparent") {
    const match = /^#([0-9a-f]{6})$/i.exec(node.fill);
    if (match) {
      const value = parseInt(match[1], 16);
      return {
        r: (value >> 16) & 255,
        g: (value >> 8) & 255,
        b: value & 255,
      };
    }
  }
  const bitmap = node.imageId ? cache.get(node) : null;
  if (!bitmap) return null;
  const bw = bitmap.naturalWidth ?? bitmap.width;
  const bh = bitmap.naturalHeight ?? bitmap.height;
  if (!(bw > 0) || !(bh > 0) || !(node.width > 0) || !(node.height > 0))
    return null;
  const nx = ((docPoint.x - node.x) / node.width) * bw;
  const ny = ((docPoint.y - node.y) / node.height) * bh;
  const sx = Math.max(0, Math.floor(nx - radius));
  const sy = Math.max(0, Math.floor(ny - radius));
  const w = Math.max(1, Math.min(radius * 2 + 1, bw - sx));
  const h = Math.max(1, Math.min(radius * 2 + 1, bh - sy));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const cx = canvas.getContext("2d");
  if (!cx) return null;
  cx.drawImage(bitmap, sx, sy, w, h, 0, 0, w, h);
  const { data } = cx.getImageData(0, 0, w, h);
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    sumR += data[i];
    sumG += data[i + 1];
    sumB += data[i + 2];
    count += 1;
  }
  if (count === 0) return null;
  return { r: sumR / count, g: sumG / count, b: sumB / count };
}
