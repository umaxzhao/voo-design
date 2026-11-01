import { LINE_HEIGHT_RATIO } from "./scene_model_core.js";

/** Geometry and paint can change without replacing the imported glyph layout. */
export function importedTextSignature(node) {
  return JSON.stringify([
    node.text ?? "", node.fontFamily, node.fontSize, String(node.fontWeight ?? "normal"),
    Boolean(node.italic), Boolean(node.underline), node.align ?? "left",
    node.lineHeight ?? LINE_HEIGHT_RATIO, node.letterSpacing ?? 0, node.boxWidth ?? 0,
    node.direction ?? "horizontal", node.textCase ?? "original",
    node.paragraphSpacing ?? 0, node.baselineShift ?? 0, node.highlight ?? null,
  ]);
}

/** Use the original appearance only while its editable typography still matches. */
export function importedTextCache(node) {
  if (node.kind !== "text") return null;
  const cache = node.figmaText;
  if (!cache || node.textPath || !(cache.width > 0) || !(cache.height > 0) ||
      typeof cache.path !== "string" || !cache.path ||
      cache.signature !== importedTextSignature(node)) return null;
  return cache;
}
