/**
 * Public entry for opening a Pen `.pen` document: bytes in, a v1 `.voo`
 * envelope out, plus everything the UI wants to tell the user about the import.
 *
 * The steps are separate on purpose: parsing validates the file, asset
 * resolution turns sibling image files into data URLs, and conversion turns
 * the Pen scene into editor nodes. Any of them can report warnings; only a
 * file that is not a readable Pen document throws (`PenImportError`, with a
 * user-presentable message the open dialog can show).
 */

import { parsePenDocument } from "./pen_document.js";
import { collectPenAssetRefs, resolvePenAssets } from "./pen_assets.js";
import { penDocumentToVooFile } from "./pen_to_voo.js";
import { BUNDLED_FONTS } from "../editor/font_loader.js";
import { isGoogleFamily } from "../editor/google_fonts_index.js";

/** Combines warning lists, adding the counts of identical messages. */
export function mergeWarnings(...lists) {
  const merged = new Map();
  for (const list of lists) {
    for (const warning of list ?? []) {
      if (!warning || typeof warning.message !== "string") continue;
      merged.set(warning.message, (merged.get(warning.message) ?? 0) + (warning.count ?? 1));
    }
  }
  return [...merged].map(([message, count]) => ({ message, count }));
}

function isFontAvailable(family) {
  if (!family) return true;
  return (
    BUNDLED_FONTS.some((font) => font.family === family) ||
    isGoogleFamily(family)
  );
}

function withAvailability(fonts) {
  return (fonts ?? []).map((font) => ({
    ...font,
    available: isFontAvailable(font.family),
  }));
}

/**
 * Converts `.pen` bytes into the `.voo` shape `openVooSource` loads.
 *
 * @param {Uint8Array|ArrayBuffer|string} bytes the file contents (JSON)
 * @param {object} [options]
 * @param {string} [options.fileName] the picked file's name (label only)
 * @param {string} [options.filePath] the file's absolute path, for sibling assets
 * @param {object} [options.dirHandle] web File System directory handle, for siblings
 * @param {object} [options.fileHandle] web File System file handle (picked file)
 * @param {Function} [options.readSibling] explicit `(relativeUrl) => bytes` hook
 * @param {Function} [options.measureText] optional text measurer for layout sizes
 * @param {string} [options.pageLabel] label the imported page gets
 * @returns {Promise<{vooFile: object, warnings: Array, fonts: Array, missingFonts: Array, layerCount: number}>}
 */
export async function penBytesToVooFile(bytes, options = {}) {
  const parsed = parsePenDocument(bytes);
  const refs = collectPenAssetRefs(parsed.document);
  const resolved = await resolvePenAssets(refs, {
    filePath: options.filePath ?? null,
    dirHandle: options.dirHandle ?? null,
    fileHandle: options.fileHandle ?? null,
    readSibling: options.readSibling ?? null,
  });
  const converted = penDocumentToVooFile(parsed.document, {
    assets: resolved.assets,
    measureText: options.measureText,
    pageLabel: options.pageLabel ?? "Pen Import",
  });
  const fonts = withAvailability(converted.fonts);
  return {
    vooFile: converted.vooFile,
    warnings: mergeWarnings(parsed.warnings, resolved.warnings, converted.warnings),
    fonts,
    missingFonts: fonts.filter((font) => !font.available),
    layerCount: converted.layerCount,
  };
}
