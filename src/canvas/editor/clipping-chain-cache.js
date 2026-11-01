import { isImagePaint } from "./render-paint-style.js";

const caches = new WeakMap();
const MAX_ENTRIES = 128;
const MAX_PIXELS = 16 * 1024 * 1024;

export function clippingResources(nodes, bitmapOf, maskOf) {
  const resources = [];
  const add = bitmap => resources.push(bitmap ?? null, bitmap?.__warpTextureVersion ?? 0);
  for (const node of nodes) {
    if (node.kind === "video") return null;
    if (node.kind === "image" || node.imageId || node.src) add(bitmapOf?.(node));
    if (isImagePaint(node.fill)) add(bitmapOf?.({ ...node, imageId: undefined, src: node.fill }));
    for (const paint of node.fills ?? []) {
      if (isImagePaint(paint.fill)) add(bitmapOf?.({ ...node, imageId: undefined, src: paint.fill }));
      else if (paint.imageId) add(bitmapOf?.({ ...node, imageId: paint.imageId }));
    }
    if (node.maskId) add(maskOf?.(node));
  }
  return resources;
}

export function sameClippingResources(left, right) {
  return left !== null && right !== null && left.length === right.length && left.every((value, index) => value === right[index]);
}

export function cachedClippingChain(doc, key) {
  const cache = caches.get(doc);
  const value = cache?.entries.get(key);
  if (!value) return null;
  cache.entries.delete(key);
  cache.entries.set(key, value);
  return value;
}

/** Bound retained bitmap memory, while allowing independent masks to coexist. */
export function rememberClippingChain(doc, key, value) {
  const pixels = value.canvas.width * value.canvas.height;
  if (pixels > MAX_PIXELS) return;
  let cache = caches.get(doc);
  if (!cache) { cache = { entries: new Map(), pixels: 0 }; caches.set(doc, cache); }
  const previous = cache.entries.get(key);
  if (previous) cache.pixels -= previous.pixels;
  cache.entries.delete(key);
  cache.entries.set(key, { ...value, pixels });
  cache.pixels += pixels;
  while (cache.entries.size > MAX_ENTRIES || cache.pixels > MAX_PIXELS) {
    const oldest = cache.entries.keys().next().value;
    cache.pixels -= cache.entries.get(oldest).pixels;
    cache.entries.delete(oldest);
  }
}
