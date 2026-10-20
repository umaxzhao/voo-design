/**
 * FNV-1a pixel hashing outside regions for mutation verification.
 *
 * @module agent-panel/observer_hash
 */

import { normalizeRegion } from "./observer_geometry.js";

/**
 * Computes a deterministic 32-bit FNV-1a hash of pixels OUTSIDE a given selection region.
 *
 * @param {HTMLCanvasElement|ImageData|Object} pixelSource
 * @param {{ x: number, y: number, width: number, height: number }} region
 * @returns {string} 8-character hex hash string
 */
export function computeOutsideRegionHash(pixelSource, region) {
  if (!pixelSource) return "";
  let width = 0;
  let height = 0;
  let data = null;

  if (typeof HTMLCanvasElement !== "undefined" && pixelSource instanceof HTMLCanvasElement) {
    const ctx = pixelSource.getContext("2d");
    if (!ctx) return "";
    const imgData = ctx.getImageData(0, 0, pixelSource.width, pixelSource.height);
    width = imgData.width;
    height = imgData.height;
    data = imgData.data;
  } else if (pixelSource.data && typeof pixelSource.width === "number" && typeof pixelSource.height === "number") {
    width = pixelSource.width;
    height = pixelSource.height;
    data = pixelSource.data;
  } else if (pixelSource.pixels && typeof pixelSource.width === "number" && typeof pixelSource.height === "number") {
    width = pixelSource.width;
    height = pixelSource.height;
    data = pixelSource.pixels;
  } else if (Array.isArray(pixelSource)) {
    width = pixelSource[0]?.length || 0;
    height = pixelSource.length;
    data = pixelSource.flat();
  } else {
    return String(JSON.stringify(pixelSource));
  }

  const norm = normalizeRegion(region);
  const rx = norm.x;
  const ry = norm.y;
  const rw = norm.width;
  const rh = norm.height;

  let hash = 0x811c9dc5;
  const len = width * height;

  for (let i = 0; i < len; i++) {
    const x = i % width;
    const y = Math.floor(i / width);
    if (x >= rx && x < rx + rw && y >= ry && y < ry + rh) {
      continue;
    }
    const byteIndex = i * 4;
    for (let c = 0; c < 4; c++) {
      hash ^= (data[byteIndex + c] || 0);
      hash = Math.imul(hash, 0x01000193);
    }
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}
