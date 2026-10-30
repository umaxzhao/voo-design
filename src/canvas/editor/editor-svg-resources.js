import { nodesToSvg } from "./editor_svg.js";
import { createSvgRasterResolver } from "./svg-raster-effects.js";

/** SVG images must own their bytes rather than depend on a live cache or blob URL. */
export function exportSvgNodes(nodes, { cache = null, maskTools = null, measureCtx = null } = {}) {
  const images = new Map(), sizes = new Map(), masks = new Map();
  const encoded = new WeakMap();
  const encode = bitmap => {
    if (encoded.has(bitmap)) return encoded.get(bitmap);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.naturalWidth || bitmap.width;
    canvas.height = bitmap.naturalHeight || bitmap.height;
    try {
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("SVG bitmap embedding requires a 2D context");
      ctx.drawImage(bitmap, 0, 0);
      const url = canvas.toDataURL("image/png");
      encoded.set(bitmap, url);
      return url;
    } finally { canvas.width = canvas.height = 0; }
  };
  for (const node of nodes) {
    if (node.kind !== "image") continue;
    const bitmap = cache?.get(node);
    if (bitmap && node.imageId) {
      images.set(node.imageId, encode(bitmap));
      sizes.set(node.imageId, { width: bitmap.naturalWidth || bitmap.width, height: bitmap.naturalHeight || bitmap.height });
    }
    const mask = maskTools?.maskSourceOf?.(node) ?? cache?.getMask?.(node);
    if (mask && node.maskId) masks.set(node.maskId, encode(mask));
  }
  return nodesToSvg(nodes, {
    bitmapOf: id => images.get(id), bitmapSizeOf: id => sizes.get(id),
    maskOf: id => masks.get(id), measureCtx,
    rasterOf: createSvgRasterResolver({
      bitmapOf: node => cache?.get(node),
      maskOf: node => maskTools?.maskSourceOf?.(node) ?? cache?.getMask?.(node),
    }),
  });
}
