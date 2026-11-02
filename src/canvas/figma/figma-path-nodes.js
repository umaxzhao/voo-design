/**
 * Turns a decoded Figma vector into one editable voo_design pen path.
 *
 * The decoders (figma-vector.js) yield SVG-style path text in the node's own
 * space: `M`, `L`, `Q`, `C` and `Z` with absolute coordinates. This module keeps
 * the bezier handles, so the result stays a real path the pen tool can reshape.
 *
 * Sub-paths become contours inside one `points` array. The last point of each
 * closed contour carries `close: true`, which is how the renderer tells them
 * apart and fills holes with the node's fill rule.
 */

import { createPenNode } from "../editor/scene_model_paths.js";
import { decodeFigmaVector, decodeFigmaVectorNetwork } from "./figma-vector.js";
import { figmaArray, figmaObject } from "./figma-value.js";

const TOKEN_PATTERN = /[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
const ARGUMENT_COUNT = { M: 2, L: 2, Q: 4, C: 6, Z: 0 };
const SAME_POINT_EPSILON = 1e-6;

function samePoint(a, b) {
  return Math.abs(a.x - b.x) < SAME_POINT_EPSILON && Math.abs(a.y - b.y) < SAME_POINT_EPSILON;
}

/** Splits path text into commands with their numeric arguments, repeats included. Fast state machine parser. */
function readCommands(pathData) {
  if (!pathData) return [];
  const commands = [];
  let index = 0;
  const len = pathData.length;
  let currentLetter = null;
  let currentArgs = [];
  let expectedCount = 0;

  while (index < len) {
    const ch = pathData.charCodeAt(index);
    // Skip whitespace and commas
    if (ch === 32 || ch === 44 || ch === 9 || ch === 10 || ch === 13) {
      index++;
      continue;
    }
    // Check if command letter
    if ((ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122)) {
      if (currentLetter && currentArgs.length > 0) {
        commands.push({ letter: currentLetter, args: currentArgs });
        currentArgs = [];
      }
      currentLetter = pathData[index].toUpperCase();
      expectedCount = ARGUMENT_COUNT[currentLetter] ?? 0;
      index++;
      if (expectedCount === 0) {
        commands.push({ letter: currentLetter, args: [] });
        currentLetter = null;
      }
      continue;
    }
    // Parse number
    const start = index;
    if (ch === 45 || ch === 43) { // '-' or '+'
      index++;
    }
    while (index < len) {
      const c = pathData.charCodeAt(index);
      if ((c >= 48 && c <= 57) || c === 46 || c === 101 || c === 69 || c === 45 || c === 43) {
        index++;
      } else {
        break;
      }
    }
    const num = Number(pathData.slice(start, index));
    if (Number.isFinite(num)) {
      currentArgs.push(num);
      if (currentLetter && currentArgs.length === expectedCount) {
        commands.push({ letter: currentLetter, args: currentArgs });
        currentArgs = [];
      }
    }
  }
  if (currentLetter && currentArgs.length > 0) {
    commands.push({ letter: currentLetter, args: currentArgs });
  }
  return commands;
}

/**
 * Builds contours of anchors `{x, y, in, out}` from path text. Handles are
 * relative offsets, as the pen model stores them; quadratic segments are raised
 * to cubic so one anchor format covers both.
 */
export function parseFigmaPathContours(pathData) {
  const contours = [];
  let current = null;
  let pen = { x: 0, y: 0 };
  let start = pen;

  const startContour = (point) => {
    current = { anchors: [{ x: point.x, y: point.y, in: null, out: null }], closed: false };
    contours.push(current);
  };
  const ensureContour = () => {
    if (!current || current.closed) startContour(pen);
  };
  const addCurve = (control1, control2, to) => {
    ensureContour();
    const last = current.anchors[current.anchors.length - 1];
    last.out = [control1.x - last.x, control1.y - last.y];
    current.anchors.push({
      x: to.x,
      y: to.y,
      in: [control2.x - to.x, control2.y - to.y],
      out: null,
    });
    pen = to;
  };

  for (const { letter, args } of readCommands(pathData)) {
    if (letter === "M") {
      pen = { x: args[0], y: args[1] };
      start = pen;
      startContour(pen);
    } else if (letter === "L") {
      ensureContour();
      current.anchors.push({ x: args[0], y: args[1], in: null, out: null });
      pen = { x: args[0], y: args[1] };
    } else if (letter === "C") {
      addCurve(
        { x: args[0], y: args[1] },
        { x: args[2], y: args[3] },
        { x: args[4], y: args[5] },
      );
    } else if (letter === "Q") {
      const quadControl = { x: args[0], y: args[1] };
      const to = { x: args[2], y: args[3] };
      const from = pen;
      addCurve(
        { x: from.x + (2 / 3) * (quadControl.x - from.x), y: from.y + (2 / 3) * (quadControl.y - from.y) },
        { x: to.x + (2 / 3) * (quadControl.x - to.x), y: to.y + (2 / 3) * (quadControl.y - to.y) },
        to,
      );
    } else if (letter === "Z") {
      if (current) current.closed = true;
      pen = start;
    }
  }
  return contours.filter((contour) => contour.anchors.length > 1);
}

/**
 * Closes each contour the way a fill needs: a last anchor that lands back on the
 * first is folded into it, and the closing point is marked with `close`.
 */
function closeContour(contour, forceClosed) {
  const closed = contour.closed || forceClosed;
  const anchors = contour.anchors;
  if (closed && anchors.length > 2 && samePoint(anchors[anchors.length - 1], anchors[0])) {
    const duplicate = anchors.pop();
    anchors[0].in = duplicate.in;
  }
  return anchors.map((anchor, index) => ({
    ...anchor,
    close: closed && index === anchors.length - 1,
  }));
}

function windingRuleOf(node) {
  const geometry = figmaObject(figmaArray(node.fillGeometry)[0]);
  return geometry?.windingRule === "ODD" ? "evenodd" : "nonzero";
}

/**
 * The decoded path text for a Figma vector: flattened geometry first, which is
 * what Figma renders, then the editable network for shapes shipped without it.
 */
export function decodeVectorPath(node, blobs) {
  return decodeFigmaVector(node, blobs) ?? decodeFigmaVectorNetwork(node, blobs);
}

/**
 * Builds one editable pen node from a Figma vector, positioned at `box`. Returns
 * null when the vector has no decodable geometry, so the caller can approximate.
 */
export function vectorToPenNode(node, box, blobs, colors) {
  const pathData = decodeVectorPath(node, blobs);
  if (!pathData) return null;
  const filled = figmaArray(node.fillGeometry).length > 0;
  return penNodeFromPathText(pathData, box, colors, {
    filled,
    fillRule: windingRuleOf(node),
  });
}

/**
 * One pen node from SVG-style path text whose coordinates are local to `box`.
 * `filled` closes every contour the way a fill needs; `fillRule` is the node's
 * fill rule. Returns null when the text has no contours.
 */
export function penNodeFromPathText(pathData, box, colors, { filled, fillRule }) {
  const contours = parseFigmaPathContours(pathData);
  if (contours.length === 0) return null;

  const anchors = contours.flatMap((contour) =>
    closeContour(contour, filled || pathData.includes("Z")).map((anchor) => ({
      ...anchor,
      x: box.x + anchor.x,
      y: box.y + anchor.y,
    })),
  );
  return {
    ...createPenNode(anchors, colors.stroke, colors.strokeWidth),
    fill: colors.fill,
    fillRule,
  };
}
