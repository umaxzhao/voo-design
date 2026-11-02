/**
 * Pure direction planner for the outpaint (image extension) gesture.
 *
 * Outpaint grows the picture into a new margin the model paints. Which side of
 * the original the margin lands on is a framing decision, and until now the
 * gesture had no opinion: the default rect was the node's own frame, so the
 * user had to drag first even when the subject was hugging one edge and the
 * obvious direction was the empty one opposite it.
 *
 * This module turns a saliency map into that opinion, and only that opinion:
 *
 *   `suggestOutpaintPlan()` -> which edge(s) to grow toward, plus the subject
 *   box (frame coordinates) that choice is protecting, or `null` when there is
 *   no usable saliency so callers keep today's exact behaviour.
 *
 * It never touches pixels, the composite, or the model. The byte-for-byte
 * original-pixel invariant in `outpaint_composite.js` is untouched: saliency
 * can only influence which side we expand toward and by how much.
 *
 * SIDE SELECTION
 * The "emptiest" side is the one that is BOTH farthest from the subject's
 * weighted centroid AND carries the least subject mass in the band hugging
 * that edge. Each side scores `normalizedCentroidDistance - subjectMassNearEdge`
 * (both in [0, 1]); the highest score wins and ties fall back to the canonical
 * side order of `outpaint_geometry.js`. Then every side the subject would be
 * too close to for `minMargin` breathing room is added to the plan, so the
 * suggestion can never leave the subject pinched against a new edge.
 *
 * Deterministic by construction: no randomness, no iteration order over a Set,
 * floats in, plain data out.
 */

import { subjectBounds } from "./subject-bounds.js";
import { OUTPAINT_HANDLES } from "./outpaint_geometry.js";

/** Default minimum empty margin kept around the subject, as a frame fraction. */
export const OUTPAINT_MIN_MARGIN = 0.08;

/**
 * How far the overlay's default rect grows on each preferred side, as a frame
 * fraction. Big enough to be a usable head start, small enough that the user's
 * own drag still owns the final framing.
 */
export const OUTPAINT_DEFAULT_GROWTH = 0.25;

/**
 * The growth sides, in canonical order and drawn from the gesture's own handle
 * vocabulary so the two can never drift apart.
 */
export const OUTPAINT_DIRECTION_SIDES = Object.freeze(
  OUTPAINT_HANDLES.filter((handle) =>
    ["left", "right", "top", "bottom"].includes(handle),
  ),
);

/**
 * Fraction of a frame dimension that counts as "near an edge" when weighing
 * how much subject mass sits against that edge.
 */
const EDGE_BAND_FRACTION = 0.15;

function isPositiveFinite(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function requireFiniteRect(rect) {
  if (!rect || typeof rect !== "object") {
    throw new TypeError("outpaint_direction: a rect is required");
  }
  for (const field of ["x", "y", "width", "height"]) {
    if (!Number.isFinite(rect[field])) {
      throw new TypeError(`outpaint_direction: rect.${field} must be a finite number`);
    }
  }
  if (!(rect.width > 0) || !(rect.height > 0)) {
    throw new RangeError("outpaint_direction: rect must have a positive size");
  }
}

/**
 * The subject's weighted bounding box and centroid, mapped from the saliency
 * grid onto the caller's frame dimensions, or `null` for unusable input.
 *
 * The saliency producer works at its own analysis resolution (`readImageRgba`'s
 * capped size), while the frame is in document pixels; both describe the same
 * picture, so a plain linear map is exact for a framing decision. Every
 * unusable shape — missing weights, a length/dimension mismatch, an all-zero
 * map, a non-positive frame — collapses to `null` so the caller never has to
 * distinguish "no signal" from "bad signal".
 *
 * @param {{weights: ArrayLike<number>, width: number, height: number}} saliency
 * @param {number} width frame width in document pixels
 * @param {number} height frame height in document pixels
 * @returns {{x: number, y: number, width: number, height: number, cx: number, cy: number}|null}
 */
export function saliencySubjectBox(saliency, width, height) {
  if (!saliency || typeof saliency !== "object") return null;
  const { weights, width: gridWidth, height: gridHeight } = saliency;
  if (!weights || typeof weights.length !== "number") return null;
  if (!Number.isInteger(gridWidth) || gridWidth <= 0) return null;
  if (!Number.isInteger(gridHeight) || gridHeight <= 0) return null;
  if (weights.length !== gridWidth * gridHeight) return null;
  if (!isPositiveFinite(width) || !isPositiveFinite(height)) return null;

  const subject = subjectBounds(weights, gridWidth, gridHeight);
  if (!subject) return null;

  const scaleX = width / gridWidth;
  const scaleY = height / gridHeight;
  return {
    x: subject.x * scaleX,
    y: subject.y * scaleY,
    width: subject.width * scaleX,
    height: subject.height * scaleY,
    cx: subject.cx * scaleX,
    cy: subject.cy * scaleY,
  };
}

/**
 * Fraction of subject mass sitting in the band hugging each edge.
 *
 * Only pixels at or above `subjectBounds`' own threshold count, which keeps
 * the saliency producer's radial centre prior from masquerading as subject
 * weight along the top/bottom edges. Returns `null` when the map has no
 * positive mass at all.
 */
function edgeMassFractions(saliency) {
  const { weights, width, height } = saliency;
  let maxWeight = 0;
  for (let i = 0; i < weights.length; i += 1) {
    if (weights[i] > maxWeight) maxWeight = weights[i];
  }
  if (!(maxWeight > 0)) return null;

  const threshold = Math.max(1e-4, maxWeight * 0.08);
  const bandX = Math.max(1, Math.round(width * EDGE_BAND_FRACTION));
  const bandY = Math.max(1, Math.round(height * EDGE_BAND_FRACTION));
  let total = 0;
  let left = 0;
  let right = 0;
  let top = 0;
  let bottom = 0;

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const weight = weights[row + x];
      if (!(weight >= threshold)) continue;
      total += weight;
      if (x < bandX) left += weight;
      if (x >= width - bandX) right += weight;
      if (y < bandY) top += weight;
      if (y >= height - bandY) bottom += weight;
    }
  }
  if (!(total > 0)) return null;
  return {
    left: left / total,
    right: right / total,
    top: top / total,
    bottom: bottom / total,
  };
}

/**
 * The default outpaint direction for a saliency map, or `null` when there is no
 * usable signal.
 *
 * @param {object} [args]
 * @param {{weights: ArrayLike<number>, width: number, height: number}} [args.saliency]
 * @param {number} args.width frame width in document pixels
 * @param {number} args.height frame height in document pixels
 * @param {number} [args.minMargin] minimum empty margin kept around the subject, as a frame fraction
 * @returns {{preferredSides: string[], subjectBox: {x: number, y: number, width: number, height: number}, reason: string}|null}
 */
export function suggestOutpaintPlan({
  saliency,
  width,
  height,
  minMargin = OUTPAINT_MIN_MARGIN,
} = {}) {
  if (!isPositiveFinite(width) || !isPositiveFinite(height)) {
    throw new TypeError(
      "suggestOutpaintPlan: width and height must be positive finite numbers",
    );
  }
  if (typeof minMargin !== "number" || !Number.isFinite(minMargin) || minMargin < 0) {
    throw new TypeError(
      "suggestOutpaintPlan: minMargin must be a finite number >= 0",
    );
  }

  const box = saliencySubjectBox(saliency, width, height);
  if (!box) return null;

  const masses = edgeMassFractions(saliency);
  const distances = {
    left: box.cx / width,
    right: 1 - box.cx / width,
    top: box.cy / height,
    bottom: 1 - box.cy / height,
  };

  // Highest score wins; strict `>` keeps the first side in canonical order on
  // an exact tie, so an ambiguous map still yields one stable answer.
  let primary = OUTPAINT_DIRECTION_SIDES[0];
  let bestScore = -Infinity;
  for (const side of OUTPAINT_DIRECTION_SIDES) {
    const score = distances[side] - (masses?.[side] ?? 0);
    if (score > bestScore) {
      bestScore = score;
      primary = side;
    }
  }

  // Keep the subject from being pinched against any new edge: grow that side
  // too whenever the current margin is thinner than the requested minimum.
  const marginX = minMargin * width;
  const marginY = minMargin * height;
  const preferred = new Set([primary]);
  if (box.x < marginX) preferred.add("left");
  if (width - (box.x + box.width) < marginX) preferred.add("right");
  if (box.y < marginY) preferred.add("top");
  if (height - (box.y + box.height) < marginY) preferred.add("bottom");

  const preferredSides = OUTPAINT_DIRECTION_SIDES.filter((side) =>
    preferred.has(side),
  );
  const extraSides = preferredSides.filter((side) => side !== primary);
  return {
    preferredSides,
    subjectBox: {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    },
    reason:
      extraSides.length === 0
        ? `emptiest_side_${primary}`
        : `emptiest_side_${primary}_margin_${extraSides.join("_")}`,
  };
}

/**
 * Grows `rect` on its preferred sides by `growth` (a frame fraction per side),
 * then guarantees the plan's subject keeps `minMargin` of empty space on every
 * side. Outward-only by construction: the result always contains `rect`, so the
 * original image can never be cropped away by the default.
 *
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @param {{preferredSides: string[], subjectBox: {x: number, y: number, width: number, height: number}}} plan
 * @param {{growth?: number, minMargin?: number}} [options]
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export function defaultOutpaintRect(
  rect,
  plan,
  { growth = OUTPAINT_DEFAULT_GROWTH, minMargin = OUTPAINT_MIN_MARGIN } = {},
) {
  requireFiniteRect(rect);
  if (!plan || typeof plan !== "object" || !Array.isArray(plan.preferredSides)) {
    throw new TypeError("defaultOutpaintRect: a plan with preferredSides is required");
  }
  if (typeof growth !== "number" || !Number.isFinite(growth) || growth < 0) {
    throw new TypeError("defaultOutpaintRect: growth must be a finite number >= 0");
  }
  if (typeof minMargin !== "number" || !Number.isFinite(minMargin) || minMargin < 0) {
    throw new TypeError("defaultOutpaintRect: minMargin must be a finite number >= 0");
  }

  const growX = growth * rect.width;
  const growY = growth * rect.height;
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;
  for (const side of plan.preferredSides) {
    if (side === "left") left = Math.min(left, rect.x - growX);
    else if (side === "right") right = Math.max(right, rect.x + rect.width + growX);
    else if (side === "top") top = Math.min(top, rect.y - growY);
    else if (side === "bottom") bottom = Math.max(bottom, rect.y + rect.height + growY);
  }

  const grown = {
    x: Math.round(left),
    y: Math.round(top),
    width: Math.round(right - left),
    height: Math.round(bottom - top),
  };
  const box = plan.subjectBox;
  if (!box || typeof box !== "object") return grown;
  const subject = {
    x: rect.x + box.x,
    y: rect.y + box.y,
    width: box.width,
    height: box.height,
  };
  return expandRectToIncludeSubject(grown, subject, {
    marginX: minMargin * rect.width,
    marginY: minMargin * rect.height,
  });
}

/**
 * Expands `rect` (outward only) until it contains `subject` with at least
 * `marginX` / `marginY` pixels of empty space on every side. Unusable subjects
 * pass the rect through untouched, which is what keeps the non-saliency path
 * byte-for-byte identical to today.
 *
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @param {{x: number, y: number, width: number, height: number}|null} subject
 * @param {{marginX?: number, marginY?: number}} [options] absolute pixel margins
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export function expandRectToIncludeSubject(
  rect,
  subject,
  { marginX = 0, marginY = 0 } = {},
) {
  requireFiniteRect(rect);
  if (typeof marginX !== "number" || !Number.isFinite(marginX) || marginX < 0) {
    throw new TypeError("expandRectToIncludeSubject: marginX must be finite and >= 0");
  }
  if (typeof marginY !== "number" || !Number.isFinite(marginY) || marginY < 0) {
    throw new TypeError("expandRectToIncludeSubject: marginY must be finite and >= 0");
  }
  if (!subject || typeof subject !== "object") {
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }
  const sx = Number(subject.x);
  const sy = Number(subject.y);
  const sw = Number(subject.width);
  const sh = Number(subject.height);
  if (!Number.isFinite(sx) || !Number.isFinite(sy) || !(sw > 0) || !(sh > 0)) {
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }

  // floor/ceil on the margin boundaries make the guarantee conservative: the
  // result can overshoot by a sub-pixel, never fall short of `marginX/Y`.
  const left = Math.min(rect.x, Math.floor(sx - marginX));
  const top = Math.min(rect.y, Math.floor(sy - marginY));
  const right = Math.max(rect.x + rect.width, Math.ceil(sx + sw + marginX));
  const bottom = Math.max(rect.y + rect.height, Math.ceil(sy + sh + marginY));
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

/**
 * The rect an outpaint run should actually composite for a given saliency map.
 *
 * This is the run-time protection half of the feature: the user's rect is kept
 * verbatim when the map is unusable, and otherwise grown outward just enough
 * that the subject keeps `minMargin` of empty space on every side. It never
 * shrinks the rect — outpaint only ever adds margin — so the user's framing
 * decision is preserved and the byte-for-byte composite contract is untouched.
 *
 * `frameX`/`frameY` place the frame in document coordinates; the saliency
 * subject box is mapped from the analysis grid onto `frameWidth`x`frameHeight`.
 *
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @param {{weights: ArrayLike<number>, width: number, height: number}|null} saliency
 * @param {{frameX?: number, frameY?: number, frameWidth: number, frameHeight: number, minMargin?: number}} options
 * @returns {{x: number, y: number, width: number, height: number}}
 */
export function protectRectForSaliency(
  rect,
  saliency,
  {
    frameX = 0,
    frameY = 0,
    frameWidth,
    frameHeight,
    minMargin = OUTPAINT_MIN_MARGIN,
  } = {},
) {
  requireFiniteRect(rect);
  if (!isPositiveFinite(frameWidth) || !isPositiveFinite(frameHeight)) {
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }
  if (typeof minMargin !== "number" || !Number.isFinite(minMargin) || minMargin < 0) {
    throw new TypeError("protectRectForSaliency: minMargin must be finite and >= 0");
  }
  const box = saliencySubjectBox(saliency, frameWidth, frameHeight);
  if (!box) return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  return expandRectToIncludeSubject(
    rect,
    {
      x: frameX + box.x,
      y: frameY + box.y,
      width: box.width,
      height: box.height,
    },
    {
      marginX: minMargin * frameWidth,
      marginY: minMargin * frameHeight,
    },
  );
}
