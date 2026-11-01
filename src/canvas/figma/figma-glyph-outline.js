/**
 * Glyph outlines of a Figma text node, placed exactly as Figma laid them out.
 *
 * Figma stores each glyph's outline in em units (about 1 for a full font size)
 * with y pointing up, plus the glyph's position in the text box with y pointing
 * down, from the layout Figma computed. Scaling by the font size and flipping y
 * reproduces the designer's line breaks, baselines and spacing exactly, and the
 * result does not depend on which fonts the machine has installed.
 *
 * Coordinates are read as raw float32 values. Rounding them, as the general
 * path decoder does for display, would be off by about a pixel at 150px.
 */

import { figmaObject } from "./figma-value.js";

/** Path command byte -> SVG letter and the number of coordinates it takes. */
const COMMANDS = {
  0: { letter: "Z", count: 0 },
  1: { letter: "M", count: 2 },
  2: { letter: "L", count: 2 },
  3: { letter: "Q", count: 4 },
  4: { letter: "C", count: 6 },
};

function blobBytes(blobs, index) {
  if (typeof index !== "number" || index < 0) return null;
  const value = blobs[index];
  if (value instanceof Uint8Array) return value;
  const bytes = figmaObject(value)?.bytes;
  return bytes instanceof Uint8Array ? bytes : null;
}

/**
 * Path text for one glyph blob, with every coordinate mapped through `map`.
 * Numbers keep full precision, so the mapping does not round the outline.
 */
export function exactGlyphPath(blob, map) {
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const parts = [];
  let offset = 0;
  let hasSubpath = false;
  while (offset < blob.length) {
    const command = COMMANDS[blob[offset]];
    offset += 1;
    if (!command) return null;
    if (command.count === 0) {
      // Native glyph streams can start with a redundant close. Canvas ignores
      // it, but SVG/Path2D rejects a path that does not begin with a move.
      if (hasSubpath) parts.push("Z");
      continue;
    }
    if (command.letter === "M") hasSubpath = true;
    if (!hasSubpath) return null;
    const byteLength = command.count * 4;
    if (offset + byteLength > blob.length) return null;
    const numbers = [];
    for (let index = 0; index < command.count; index += 2) {
      const rawX = view.getFloat32(offset, true), rawY = view.getFloat32(offset + 4, true);
      if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return null;
      const [x, y] = map(rawX, rawY);
      numbers.push(x, y);
      offset += 8;
    }
    parts.push(`${command.letter}${numbers.join(" ")}`);
  }
  return parts.join(" ");
}

/**
 * Path text for every glyph of a TEXT record, in the text box's own space.
 * Returns an empty string when the record carries no glyph layout.
 */
export function textOutlinePath(raw, blobs) {
  const glyphs = Array.isArray(raw.derivedTextData?.glyphs) ? raw.derivedTextData.glyphs : [];
  const parts = [];
  for (const glyph of glyphs) {
    const blob = blobBytes(blobs, glyph.commandsBlob);
    const origin = figmaObject(glyph.position);
    if (!blob || !origin || !(glyph.fontSize > 0) || !Number.isFinite(glyph.fontSize) || glyph.rotation) return "";
    const size = glyph.fontSize;
    const originX = Number(origin.x);
    const originY = Number(origin.y);
    if (!Number.isFinite(originX) || !Number.isFinite(originY)) return "";
    const path = exactGlyphPath(blob, (x, y) => [originX + x * size, originY - y * size]);
    if (path === null) return "";
    parts.push(path);
  }
  return parts.filter(Boolean).join(" ");
}
