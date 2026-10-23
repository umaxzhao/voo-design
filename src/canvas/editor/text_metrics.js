/**
 * Text measurement for the canvas renderer.
 *
 * Wrapping, line height and letter spacing all have to agree between the
 * layout pass and the paint pass, so both read these functions rather than
 * each doing their own arithmetic. Pure measurement: nothing here draws.
 *
 * `respectsLetterSpacing` exists because Canvas2D's `letterSpacing` is not
 * universally supported; where it is missing the width is summed per glyph
 * instead, which is slower but correct.
 */

// Import the constant from its owner so deferred generation cannot create a
// cross-chunk re-export cycle through the full scene-model facade.
import { LINE_HEIGHT_RATIO } from "./scene_model_core.js";
import { textLines } from "./scene_model_groups.js";
import { TextLayoutCache } from "./text_layout_cache.js";

/** The canvas font string for a text node: style and weight precede size. */
export function textFont(node) {
  const italic = node.italic ? "italic " : "";
  // Numeric (variable) weights pass through; "normal" drops out for the
  // canonical 400, "bold" keeps the CSS keyword the canvas accepts.
  const weight =
    node.fontWeight === "bold" || node.fontWeight === "normal"
      ? node.fontWeight === "bold"
        ? "bold "
        : ""
      : Number.isFinite(Number(node.fontWeight)) && node.fontWeight !== ""
        ? `${node.fontWeight} `
        : "";
  return `${italic}${weight}${node.fontSize}px ${node.fontFamily}`;
}

/** Line box height in doc px; legacy nodes keep the original 1.25 ratio. */
export function textLineHeight(node) {
  return node.fontSize * (node.lineHeight ?? LINE_HEIGHT_RATIO);
}

/**
 * Whether a context's measureText already honors `ctx.letterSpacing`.
 *
 * Chrome does (99+); the fake contexts in tests do not, so line widths fall
 * back to adding the spacing manually. Probed once per context — the probe
 * measures a two-letter string with and without spacing.
 */
const letterSpacingSupport = new WeakMap();

function respectsLetterSpacing(ctx) {
  let supported = letterSpacingSupport.get(ctx);
  if (supported === undefined) {
    supported = false;
    if ("letterSpacing" in ctx) {
      const previous = ctx.letterSpacing;
      ctx.letterSpacing = "0px";
      const tight = ctx.measureText("MM").width;
      ctx.letterSpacing = "8px";
      supported = ctx.measureText("MM").width > tight;
      ctx.letterSpacing = previous;
    }
    letterSpacingSupport.set(ctx, supported);
  }
  return supported;
}

/** Width of one line in px, including letterSpacing however the ctx applies it. */
export function measureLineWidth(ctx, line, letterSpacing) {
  const width = ctx.measureText(line || " ").width;
  if (!letterSpacing || respectsLetterSpacing(ctx)) return width;
  return width + letterSpacing * line.length;
}

/** Closing marks that kinsoku never lets open a wrapped line. */
const NO_LINE_START = /[。，、；：？！）】〉》」』”’%!?,.:;)\]}]/;
/** Opening marks that kinsoku never lets end a wrapped line. */
const NO_LINE_END = /[（【〈《「『“‘([{]/;
/**
 * A character whose run contains CJK (or CJK punctuation): those wraps break
 * between characters under kinsoku, not between whitespace words.
 */
const hasCjk = (value) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3000-\u303F\uFF00-\uFFEF]/u.test(value);

/**
 * Splits text into atomic break units. Latin words are kept whole; CJK characters
 * and punctuation are split individually so line-breaks can occur between glyphs.
 */
export function breakUnits(text) {
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
    const units = [];
    for (const { segment, isWordLike } of segmenter.segment(text)) {
      if (isWordLike && !hasCjk(segment)) {
        units.push(segment);
      } else {
        for (const ch of segment) {
          units.push(ch);
        }
      }
    }
    return units;
  }
  return [...text];
}

/**
 * The lines a text node paints, wrapped to its box when it has a fixed width.
 *
 * A node with `boxWidth > 0` is a Figma-style text box: paragraphs wrap at
 * word boundaries to fit the box, overlong words are hard-broken, and explicit
 * newlines still start a fresh line. Auto-width nodes (boxWidth 0) keep the
 * historical single-line-per-paragraph behaviour. Both the painter and the
 * measurer use this so the drawn box, the hit-test box and the textarea
 * overlay agree. Wrapping measures each line by bisect rather than by every
 * prefix — a CJK paragraph hard-broke character by character otherwise, one
 * Canvas2D measure per glyph while the user types.
 */
function wrapTextLines(ctx, node) {
  const boxWidth = node.boxWidth ?? 0;
  if (!(boxWidth > 0)) return textLines(node);
  const letterSpacing = node.letterSpacing ?? 0;
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${letterSpacing}px`;
  const fit = (value) =>
    measureLineWidth(ctx, value, letterSpacing) <= boxWidth;
  const wrapped = [];
  for (const paragraph of textLines(node)) {
    if (paragraph === "") {
      wrapped.push("");
      continue;
    }
    let line = "";
    for (const token of splitParagraph(paragraph, hasCjk(paragraph))) {
      if (!token) continue;
      if (line && fit(`${line} ${token}`)) {
        line += ` ${token}`;
      } else if (fit(token)) {
        if (line) wrapped.push(line);
        line = token;
      } else {
        // The token is wider than the box on its own: hard-break it into the
        // widest chunks that fit.
        if (line) {
          wrapped.push(line);
          line = "";
        }
        const units = hasCjk(token) ? breakUnits(token) : [...token];
        let index = 0;
        while (index < units.length) {
          if (units[index] === " " && wrapped.length > 0) {
            index += 1;
            continue;
          }
          if (!fit(units[index])) {
            units.splice(index, 1, ...units[index]);
          }
          // Bisect the widest run that fits the box.
          let lo = 1;
          let hi = units.length - index;
          let best = 1;
          while (lo <= hi) {
            const mid = Math.floor((lo + hi) / 2);
            if (fit(units.slice(index, index + mid).join(""))) {
              best = mid;
              lo = mid + 1;
            } else {
              hi = mid - 1;
            }
          }
          if (best < 1) best = 1;
          // Kinsoku: a closing mark may not open the next line — glue it to
          // the chunk (which may slightly overflow, like the rule expects).
          while (
            index + best < units.length &&
            NO_LINE_START.test(units[index + best])
          ) {
            best += 1;
          }
          // Kinsoku: an opening mark may not end the line — back up so it moves to next line.
          while (
            best > 1 &&
            NO_LINE_END.test(units[index + best - 1])
          ) {
            best -= 1;
          }
          wrapped.push(units.slice(index, index + best).join(""));
          index += best;
        }
      }
    }
    if (line) wrapped.push(line);
  }
  return wrapped;
}

// Context identity isolates different metric providers (including export canvases).
// One shared budget bounds all contexts; weak IDs do not retain canvas objects.
const layouts = new TextLayoutCache();
const contextIds = new WeakMap();
let nextContextId = 0;
const observedFonts = new WeakSet();

export function clearTextLayoutCache() {
  layouts.clear();
}

export function getTextLayout(ctx, node) {
  const fonts = globalThis.document?.fonts;
  if (fonts?.addEventListener && !observedFonts.has(fonts)) {
    observedFonts.add(fonts);
    fonts.addEventListener("loadingdone", clearTextLayoutCache);
    fonts.addEventListener("loadingerror", clearTextLayoutCache);
  }
  if (!contextIds.has(ctx)) contextIds.set(ctx, ++nextContextId);
  const font = textFont(node);
  const spacing = node.letterSpacing ?? 0;
  const key = JSON.stringify([
    contextIds.get(ctx), String(node.text ?? ""), font,
    textLineHeight(node), spacing, node.boxWidth ?? 0,
    // These Canvas2D properties can also affect shaping.
    ctx.direction, ctx.fontKerning, ctx.fontStretch, ctx.fontVariantCaps,
    ctx.textRendering, ctx.lang,
  ]);
  const cached = layouts.get(key);
  if (cached) return cached;
  ctx.save();
  try {
    ctx.font = font;
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${spacing}px`;
    const lines = Object.freeze(wrapTextLines(ctx, node));
    const widths = Object.freeze(lines.map((line) => measureLineWidth(ctx, line, spacing)));
    const metrics = ctx.measureText("M");
    const ascent = metrics.fontBoundingBoxAscent ?? node.fontSize * 0.8;
    const descent = metrics.fontBoundingBoxDescent ?? node.fontSize * 0.2;
    const value = Object.freeze({
      lines, widths,
      baseline: (textLineHeight(node) - ascent - descent) / 2 + ascent,
    });
    layouts.set(key, value);
    return value;
  } finally {
    ctx.restore();
  }
}

export function layoutTextLines(ctx, node) {
  return getTextLayout(ctx, node).lines;
}

/**
 * Tokens a paragraph wraps between. Spaced scripts split on whitespace as
 * ever; a CJK run breaks between every character (kinsoku decides closed
 * lines) with no whitespace to split on.
 */
function splitParagraph(paragraph, fragmented) {
  if (!fragmented) return paragraph.split(/\s+/);
  // No whitespace splitting for CJK: return one token (its dots become break
  // opportunities during the hard-break bisect).
  return [paragraph];
}

/**
 * Measures a text node against the context's font metrics.
 *
 * The width covers the widest line plus letterSpacing and the stroke (which
 * straddles the glyph outline, half a width on each side); the height is one
 * line box per line. Hit-testing and the resize handles read this box, so it
 * must match what drawTextNode paints.
 */
export function measureText(ctx, node) {
  ctx.save();
  ctx.font = textFont(node);
  const letterSpacing = node.letterSpacing ?? 0;
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${letterSpacing}px`;
  const { lines, widths } = getTextLayout(ctx, node);
  const strokeWidth = node.stroke ? (node.strokeWidth ?? 0) : 0;

  // 直排: each line is a column of stacked characters; columns advance right
  // to left, so the box is columns × column pitch wide and the longest
  // column tall.
  if (node.direction === "vertical") {
    const charAdvance = node.fontSize + letterSpacing;
    const columnPitch = textLineHeight(node);
    const maxChars = Math.max(1, ...lines.map((line) => [...line].length));
    const size = {
      width: Math.ceil(lines.length * columnPitch + strokeWidth),
      height: Math.ceil(maxChars * charAdvance + strokeWidth),
    };
    ctx.restore();
    return size;
  }

  let width = 0;
  for (const lineWidth of widths) {
    width = Math.max(width, lineWidth);
  }
  ctx.restore();
  const boxWidth = node.boxWidth ?? 0;
  // A fixed text box keeps its width even while its text is shorter than it.
  const measuredWidth = boxWidth > 0 ? Math.max(boxWidth, width) : width;
  return {
    width: Math.ceil(measuredWidth + strokeWidth),
    height: Math.ceil(lines.length * textLineHeight(node)),
  };
}
