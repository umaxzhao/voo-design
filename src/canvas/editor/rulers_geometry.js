/**
 * Ruler and guide geometry — pure helpers, no React and no DOM.
 *
 * The editor's camera is `{ zoom, panX, panY }`, where `panX/panY` is the
 * screen offset of the document origin. A guide is stored in document space
 * (`{ id, type: "v" | "h", pos }`) because that is what `doc.guides` persists
 * and what the snapping engine consumes.
 *
 * Every screen↔document conversion here takes `{ zoom, pan }` where
 * `screen = pos * zoom + pan`. The artboard/page origin therefore sits at
 * `pan`; callers that render a page inside a shared free canvas pass
 * `pan = camera.pan + layout * camera.zoom`, so the rulers keep reading page
 * document coordinates while the camera moves.
 */

/** Ruler strip thickness in CSS pixels (Figma uses 20). */
export const RULER_SIZE = 20;

/** Pointer slop, in screen pixels, for hitting a 1px guide line. */
export const GUIDE_HIT_SLOP = 6;

/** Minimum screen distance between two labelled ruler ticks. */
export const MIN_LABEL_SPACING_PX = 48;

/** Minimum screen distance between two unlabelled (minor) ruler ticks. */
export const MIN_MINOR_SPACING_PX = 6;

/** How far zoomed-out ruler labels are still readable before switching steps. */
const NICE_STEPS = Object.freeze([
  1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000,
  100000, 250000, 500000, 1000000,
]);

/** Guide types as stored in `doc.guides` — vertical and horizontal. */
export const GUIDE_TYPES = Object.freeze({ VERTICAL: "v", HORIZONTAL: "h" });

/** Type ordering used by every reducer so the rendered list is stable. */
const GUIDE_TYPE_ORDER = Object.freeze({ v: 0, h: 1 });

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function safeZoom(zoom) {
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}

/**
 * Smallest "nice" step (1/2/5/10/25/50/…) whose screen length is at least
 * `minSpacingPx` at the given zoom. Ruler density is therefore a function of
 * zoom alone, which is what makes labels readable at 5% and at 3200%.
 */
export function niceStepForZoom(zoom, minSpacingPx = MIN_LABEL_SPACING_PX) {
  const minimumDocSpan = Math.max(1, minSpacingPx) / safeZoom(zoom);
  for (const step of NICE_STEPS) {
    if (step * safeZoom(zoom) >= Math.max(1, minSpacingPx)) return step;
  }
  // Past 1,000,000 units the decade pattern is nearest anyway: round up to a
  // power of ten so a wildly zoomed-out canvas keeps drawing.
  const decade = 10 ** Math.ceil(Math.log10(minimumDocSpan));
  return Math.max(decade, 1000000);
}

/** Document coordinate → screen pixel for one axis. */
export function docToScreen(pos, { zoom = 1, pan = 0 } = {}) {
  return finiteOr(pos, 0) * safeZoom(zoom) + finiteOr(pan, 0);
}

/** Screen pixel → document coordinate for one axis. */
export function screenToDoc(pixel, { zoom = 1, pan = 0 } = {}) {
  return (finiteOr(pixel, 0) - finiteOr(pan, 0)) / safeZoom(zoom);
}

/** The document interval currently visible in a `length`-pixel axis. */
export function visibleDocRange(length, { zoom = 1, pan = 0 } = {}) {
  const start = screenToDoc(0, { zoom, pan });
  const end = screenToDoc(Math.max(0, finiteOr(length, 0)), { zoom, pan });
  return { start, end };
}

function tickLabel(pos) {
  const rounded = Math.round(pos);
  // Guards against `-0` labels left of the origin.
  return String(rounded === 0 ? 0 : rounded);
}

/**
 * Generates the ruler's tick marks for one axis.
 *
 * @param {Object} params
 * @param {number} params.length Screen length of the ruler, in CSS px.
 * @param {number} [params.zoom=1] Camera zoom.
 * @param {number} [params.pan=0] Screen offset of document coordinate 0.
 * @param {number} [params.minLabelPx] Minimum gap between two labels.
 * @param {number} [params.minMinorPx] Minimum gap between two minor ticks.
 * @returns {{ majorStep:number, minorStep:number, ticks:Array<{pos:number, at:number, major:boolean, label:(string|null)}> }}
 */
export function generateRulerTicks({
  length,
  zoom = 1,
  pan = 0,
  minLabelPx = MIN_LABEL_SPACING_PX,
  minMinorPx = MIN_MINOR_SPACING_PX,
} = {}) {
  const pxLength = Math.max(0, finiteOr(length, 0));
  if (pxLength <= 0) {
    return { majorStep: niceStepForZoom(zoom, minLabelPx), minorStep: 0, ticks: [] };
  }
  const camera = { zoom, pan };
  const { start, end } = visibleDocRange(pxLength, camera);
  const majorStep = niceStepForZoom(zoom, minLabelPx);
  const minorStep = Math.min(majorStep, niceStepForZoom(zoom, minMinorPx));

  const ticks = [];
  if (minorStep > 0) {
    const firstMinor = Math.floor(start / minorStep) * minorStep;
    const lastMinor = Math.ceil(end / minorStep) * minorStep;
    const minorCount = Math.round((lastMinor - firstMinor) / minorStep);
    for (let index = 0; index <= minorCount; index += 1) {
      const pos = firstMinor + index * minorStep;
      const at = docToScreen(pos, camera);
      if (at < -2 || at > pxLength + 2) continue;
      const major = Math.abs(pos / majorStep - Math.round(pos / majorStep)) < 1e-6;
      ticks.push({
        pos,
        at,
        major,
        label: major ? tickLabel(pos) : null,
      });
    }
  }
  return { majorStep, minorStep, ticks };
}

/** True when a dragged guide should be removed: dropped back on a ruler. */
export function isOverRulerStrip(point, { showRulers = true, size = RULER_SIZE } = {}) {
  if (!showRulers) return false;
  const x = finiteOr(point?.x, Infinity);
  const y = finiteOr(point?.y, Infinity);
  return x <= size || y <= size;
}

/**
 * Guide position from a pointer on the ruler / canvas, in document space.
 *
 * `type: "v"` is a vertical guide (dragged out of the left ruler, positioned
 * by x); `type: "h"` is horizontal (top ruler, positioned by y).
 */
export function guidePosFromScreen({ type, x, y }, camera = {}) {
  return type === GUIDE_TYPES.VERTICAL
    ? screenToDoc(x, camera)
    : screenToDoc(y, camera);
}

/** Screen coordinate of a guide's line along its axis. */
export function guideScreenPos(guide, camera = {}) {
  return docToScreen(Number(guide?.pos), camera);
}

/**
 * Finds the guide under a canvas point, in screen space.
 *
 * `panX`/`panY` are separate because the shared free canvas pans in two
 * dimensions; a vertical guide is hit-tested against x only and a horizontal
 * guide against y only.
 *
 * @returns {{guide:Object, axisScreen:number, distance:number}|null}
 */
export function hitTestGuides(
  guides,
  point,
  { zoom = 1, panX = 0, panY = 0, slop = GUIDE_HIT_SLOP } = {},
) {
  if (!Array.isArray(guides) || guides.length === 0) return null;
  const x = finiteOr(point?.x, NaN);
  const y = finiteOr(point?.y, NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  let best = null;
  for (const guide of guides) {
    if (!isValidGuide(guide)) continue;
    const at =
      guide.type === GUIDE_TYPES.VERTICAL
        ? docToScreen(guide.pos, { zoom, pan: panX })
        : docToScreen(guide.pos, { zoom, pan: panY });
    const distance =
      guide.type === GUIDE_TYPES.VERTICAL ? Math.abs(at - x) : Math.abs(at - y);
    if (distance > Math.max(0, finiteOr(slop, 0))) continue;
    if (!best || distance < best.distance) {
      best = { guide, axisScreen: at, distance };
    }
  }
  return best;
}

/** A guide is only usable when its type and finite position are set. */
export function isValidGuide(guide) {
  return Boolean(
    guide &&
      (guide.type === GUIDE_TYPES.VERTICAL || guide.type === GUIDE_TYPES.HORIZONTAL) &&
      Number.isFinite(Number(guide.pos)),
  );
}

/** Normalises a raw `doc.guides` entry, or returns null when it is unusable. */
export function normaliseGuide(raw, index = 0) {
  if (!raw || typeof raw !== "object") return null;
  const type =
    raw.type === GUIDE_TYPES.VERTICAL ||
    raw.type === "vertical" ||
    raw.orientation === "vertical"
      ? GUIDE_TYPES.VERTICAL
      : raw.type === GUIDE_TYPES.HORIZONTAL ||
          raw.type === "horizontal" ||
          raw.orientation === "horizontal"
        ? GUIDE_TYPES.HORIZONTAL
        : null;
  const pos = Number(raw.pos ?? raw.position);
  if (!type || !Number.isFinite(pos)) return null;
  const id =
    typeof raw.id === "string" && raw.id.length > 0
      ? raw.id
      : `guide-${index + 1}`;
  return { id, type, pos };
}

/** Validates and normalises the persisted guide list from a document. */
export function readDocumentGuides(doc) {
  const raw = Array.isArray(doc?.guides) ? doc.guides : [];
  const usedIds = new Set();
  const guides = [];
  raw.forEach((entry, index) => {
    const guide = normaliseGuide(entry, index);
    if (!guide || usedIds.has(guide.id)) return;
    usedIds.add(guide.id);
    guides.push(guide);
  });
  return sortGuides(guides);
}

/** Deterministic ordering: vertical guides first, then by position, then id. */
export function sortGuides(guides) {
  if (!Array.isArray(guides)) return [];
  return [...guides].sort((a, b) => {
    const typeDelta =
      (GUIDE_TYPE_ORDER[a.type] ?? 9) - (GUIDE_TYPE_ORDER[b.type] ?? 9);
    if (typeDelta !== 0) return typeDelta;
    if (a.pos !== b.pos) return a.pos - b.pos;
    return String(a.id).localeCompare(String(b.id));
  });
}

/** Next unused guide id — stable enough for React keys and undo snapshots. */
export function nextGuideId(guides, prefix = "guide") {
  const used = new Set((guides ?? []).map((guide) => guide?.id));
  let index = 1;
  while (used.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

/** Builds a guide: `{ type, pos }` in, `{ id, type, pos }` out. */
export function createGuide({ type, pos, id = null }, existing = []) {
  const normalised = normaliseGuide({ id, type, pos });
  if (!normalised) return null;
  // Ids are React keys and undo identity, so a collision gets a fresh id
  // instead of overwriting another guide.
  const used = new Set((existing ?? []).map((guide) => guide?.id));
  if (!id || used.has(normalised.id)) {
    normalised.id = nextGuideId(existing);
  }
  return normalised;
}

/** Immutable add — returns a sorted copy with the new guide appended. */
export function addGuide(guides, guide) {
  const current = Array.isArray(guides) ? guides : [];
  const next = guide?.id ? guide : createGuide(guide ?? {}, current);
  if (!next || current.some((entry) => entry?.id === next.id)) return current;
  return sortGuides([...current, normaliseGuide(next) ?? next]);
}

/** Immutable update of one guide's position. */
export function updateGuide(guides, id, pos) {
  const current = Array.isArray(guides) ? guides : [];
  const value = Number(pos);
  if (!Number.isFinite(value)) return current;
  let changed = false;
  const next = current.map((guide) => {
    if (guide?.id !== id) return guide;
    if (guide.pos === value) return guide;
    changed = true;
    return { ...guide, pos: value };
  });
  return changed ? sortGuides(next) : current;
}

/** Alias that reads better at the pointer-drag call sites. */
export const moveGuide = updateGuide;

/** Immutable removal. */
export function removeGuide(guides, id) {
  const current = Array.isArray(guides) ? guides : [];
  if (!current.some((guide) => guide?.id === id)) return current;
  return current.filter((guide) => guide?.id !== id);
}

/** Immutable clear-all (the "View → Clear guides" action). */
export function clearGuides() {
  return [];
}

/** Serialisable shape written back into `doc.guides` / the `.voo` file. */
export function serialiseGuides(guides) {
  if (!Array.isArray(guides) || guides.length === 0) return [];
  return sortGuides(guides)
    .map((guide) => normaliseGuide(guide))
    .filter(Boolean)
    .map(({ id, type, pos }) => ({ id, type, pos }));
}

/**
 * The value a guide drag would write for a pointer delta, keeping the number
 * an integer when the grid asks for it (Figma keeps guides sub-pixel, VOO
 * rounds to `pixelSnap` so a guide lands on a whole document unit at 100%).
 */
export function roundedGuidePos(pos, { pixelSnap = true } = {}) {
  const value = Number(pos);
  if (!Number.isFinite(value)) return null;
  return pixelSnap ? Math.round(value) : value;
}
