import { elementFor } from "./skia_adapter_elements.js";
import { isPlainRect } from "./render_plain_rects.js";

const elements = new WeakMap();

/** Immutable, parentless solid rectangles have no resource or group dependency. */
export function cachedElementFor(node, index, offsetX, offsetY, resolveImageUrl, doc, parentId = null) {
  if (!isPlainRect(node)) return elementFor(node, index, offsetX, offsetY, resolveImageUrl, doc);
  const cached = elements.get(node);
  if (cached && cached.index === index && cached.offsetX === offsetX && cached.offsetY === offsetY && cached.parentId === parentId) return cached.element;
  const raw = elementFor(node, index, offsetX, offsetY, resolveImageUrl, doc);
  const element = parentId ? { ...raw, parentId } : raw;
  elements.set(node, { index, offsetX, offsetY, parentId, element });
  return element;
}
