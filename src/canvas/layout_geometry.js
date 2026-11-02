import { layoutMedia } from "./layout-media-presets.js";

/** Aspect ratios the size picker offers; the canvas stays the source of truth. */
export const LAYOUT_RATIOS = [
  "1:1",
  "3:4",
  "4:3",
  "16:9",
  "9:16",
  "2:3",
  "3:2",
];

function greatestCommonDivisor(a, b) {
  return b ? greatestCommonDivisor(b, a % b) : a;
}

/** 1080×1440 → "3:4". Rounds so near-integer ratios stay readable. */
export function simplifyRatio(width, height) {
  const w = Math.round(width);
  const h = Math.round(height);
  const divisor = greatestCommonDivisor(w, h) || 1;
  return `${w / divisor}:${h / divisor}`;
}

/**
 * The canvas size a generated layout must match.
 *
 * The Design editor's own canvas is the source of truth: once a document
 * exists (opened / resized in the editor), its dimensions win. Before that,
 * the media preset (or an explicit override) supplies the default the editor
 * will open with.
 */
export function layoutCanvasSize(nodeData) {
  const doc = nodeData?.editorDoc;
  if (
    doc &&
    Number.isFinite(doc.width) &&
    doc.width > 0 &&
    Number.isFinite(doc.height) &&
    doc.height > 0
  ) {
    return { width: Math.round(doc.width), height: Math.round(doc.height) };
  }
  const media = layoutMedia(nodeData?.layoutMedia);
  return {
    width: nodeData?.layoutWidth ?? media.width,
    height: nodeData?.layoutHeight ?? media.height,
  };
}
