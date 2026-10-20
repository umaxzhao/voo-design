/**
 * Series style consistency anchor builder and prompt composition (style-seed).
 *
 * Builds a deterministic style anchor { styleDescription, palette, composition, characterNotes }
 * from a prompt and project brief, and formats/applies consistency clauses across multi-item series.
 * Exposes an injectable extractor seam for image-based/vision extraction, defaulting to prompt-derived extraction.
 *
 * Pure logic — zero React dependencies.
 *
 * @module agent-panel/style-seed
 */

import {
  extractPalette,
  extractStyleDescription,
  extractComposition,
  extractCharacterNotes,
  extractPromptStyleAnchor,
  normalizeStyleAnchor,
} from "./style-seed-extract.js";

export {
  extractPalette,
  extractStyleDescription,
  extractComposition,
  extractCharacterNotes,
  extractPromptStyleAnchor,
  normalizeStyleAnchor,
};

/**
 * Builds a style anchor from the first item's prompt plus project brief.
 *
 * Supports an injectable extractor seam for vision/model extraction.
 *
 * @param {Object} [options]
 * @param {string} [options.prompt]
 * @param {Object} [options.brief]
 * @param {string} [options.style]
 * @param {Function} [options.extractor]
 * @param {Function} [customExtractor]
 * @returns {Promise<{ styleDescription: string, palette: string[], composition: string, characterNotes: string }>}
 */
export async function buildStyleAnchor(options = {}, customExtractor = null) {
  const opts = typeof options === "string" ? { prompt: options } : (options || {});
  const extractor = customExtractor || opts.extractor || null;

  if (typeof extractor === "function") {
    const customResult = await extractor(opts);
    if (customResult && typeof customResult === "object") {
      return normalizeStyleAnchor(customResult, opts);
    }
  }

  return extractPromptStyleAnchor(opts);
}

/**
 * Formats a style anchor into an explicit reference clause.
 *
 * @param {Object} anchor
 * @param {number} [referenceIndex=1]
 * @returns {string}
 */
export function formatStyleAnchorReference(anchor, referenceIndex = 1) {
  if (!anchor || typeof anchor !== "object") return "";

  const clauses = [];
  if (anchor.styleDescription) {
    clauses.push(`style: ${anchor.styleDescription}`);
  }
  if (Array.isArray(anchor.palette) && anchor.palette.length > 0) {
    clauses.push(`palette: ${anchor.palette.join(", ")}`);
  }
  if (anchor.composition) {
    clauses.push(`composition: ${anchor.composition}`);
  }
  if (anchor.characterNotes) {
    clauses.push(`characters: ${anchor.characterNotes}`);
  }

  const details = clauses.length > 0 ? clauses.join("; ") : "established visual style";
  return `keep style/characters consistent with item ${referenceIndex}: ${details}`;
}

/**
 * Applies the style anchor to subsequent item prompts (itemIndex > 1).
 * Leaves item 1 (or index <= 1) untouched.
 *
 * @param {string} prompt
 * @param {Object} anchor
 * @param {number} [itemIndex=2]
 * @param {number} [referenceIndex=1]
 * @returns {string}
 */
export function applyStyleAnchorToPrompt(
  prompt,
  anchor,
  itemIndex = 2,
  referenceIndex = 1,
) {
  const base = String(prompt || "").trim();
  if (itemIndex <= 1 || !anchor) return base;

  const reference = formatStyleAnchorReference(anchor, referenceIndex);
  if (!reference) return base;

  return `${base} (${reference})`;
}
