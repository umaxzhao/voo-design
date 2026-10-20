// Resolve the actual solid surface behind a text layer before measuring contrast.

import { NODE_KIND } from "../../../editor/scene_doc_factory.js";
import { parseRgb } from "./critique-color.js";

function containsText(surface, text) {
  const left = Number(surface.x ?? 0);
  const top = Number(surface.y ?? 0);
  const right = left + Number(surface.width ?? surface.w ?? 0);
  const bottom = top + Number(surface.height ?? surface.h ?? 0);
  const textLeft = Number(text.x ?? 0);
  const textTop = Number(text.y ?? 0);
  const textRight = textLeft + Number(text.width ?? text.w ?? 0);
  const textBottom = textTop + Number(text.height ?? text.h ?? 0);
  return (
    left <= textLeft + 1 &&
    top <= textTop + 1 &&
    right >= textRight - 1 &&
    bottom >= textBottom - 1
  );
}

function opaqueSolidColor(node) {
  const color = node.fill ?? node.backgroundColor ?? node.bg;
  if (Number(node.opacity ?? 1) < 1 || !parseRgb(color)) return null;
  if (/^rgba\([^)]*,\s*(?:0?\.\d+|0)\s*\)$/i.test(String(color))) return null;
  return color;
}

/** Returns null when an image or translucent paint makes contrast uncertain. */
export function textBackgroundColor(text, nodeIndex, nodes, pageColor) {
  const explicit = text.backgroundColor ?? text.bg;
  if (explicit) return explicit;
  for (let index = nodeIndex - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (!node || !containsText(node, text)) continue;
    if (node.kind === NODE_KIND.IMAGE || node.kind === "image") return null;
    if (
      node.kind !== NODE_KIND.RECT &&
      node.kind !== NODE_KIND.ELLIPSE &&
      node.kind !== "rect" &&
      node.kind !== "ellipse"
    )
      continue;
    const color = opaqueSolidColor(node);
    if (color) return color;
    if (node.fill && node.fill !== "transparent") return null;
  }
  return pageColor;
}
