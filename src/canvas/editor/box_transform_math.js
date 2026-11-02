/**
 * Pure bounding box transform gesture math shared between the image editor and clip editor.
 *
 * Provides coordinate-system-agnostic mathematics for:
 * 1. Handle classification and opposite-handle mapping
 * 2. Vector rotation / inverse-rotation
 * 3. Box resizing with aspect ratio preservation and centre-pinned scaling
 * 4. Rotation angle calculation with magnetic cardinal or step snapping
 *
 * Kept completely free of DOM, React, and Canvas APIs so it is directly testable
 * in Node.js and reusable across pixel and percentage coordinate systems.
 */

export const OPPOSITE_HANDLE = Object.freeze({
  nw: "se",
  n: "s",
  ne: "sw",
  e: "w",
  se: "nw",
  s: "n",
  sw: "ne",
  w: "e",
});

export const CORNER_HANDLES = Object.freeze(["nw", "ne", "se", "sw"]);
export const EDGE_HANDLES = Object.freeze(["n", "e", "s", "w"]);
export const ALL_HANDLES = Object.freeze([
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
]);

/**
 * Decomposes a handle name into affected edges.
 */
export function edgesOfHandle(handle) {
  return {
    left: handle === "nw" || handle === "w" || handle === "sw",
    right: handle === "ne" || handle === "e" || handle === "se",
    top: handle === "nw" || handle === "n" || handle === "ne",
    bottom: handle === "sw" || handle === "s" || handle === "se",
  };
}

/**
 * Rotates a 2D vector by an angle in degrees.
 * Positive degrees rotate clockwise in screen coordinates (y-down).
 */
export function rotateVector(vec, degrees) {
  if (!degrees) return { x: vec.x, y: vec.y };
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: vec.x * cos - vec.y * sin,
    y: vec.x * sin + vec.y * cos,
  };
}

/**
 * Inverse-rotates a 2D vector by an angle in degrees (equivalent to rotateVector(vec, -degrees)).
 * Maps a screen/parent coordinate delta into the element's un-rotated local coordinate frame.
 */
export function unrotateVector(vec, degrees) {
  return rotateVector(vec, -degrees);
}

/**
 * Rotates a 2D vector by an angle in radians.
 */
export function rotateVectorRad(vec, rad) {
  if (!rad) return { x: vec.x, y: vec.y };
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: vec.x * cos - vec.y * sin,
    y: vec.x * sin + vec.y * cos,
  };
}

/**
 * Inverse-rotates a 2D vector by an angle in radians.
 */
export function unrotateVectorRad(vec, rad) {
  return rotateVectorRad(vec, -rad);
}

/**
 * Un-rotates a point around a center point by an angle in radians.
 * Equivalent to mapping a stage point into the un-rotated local frame of a rotated box.
 */
export function unrotatePointAroundCenterRad(point, center, rad) {
  if (!rad) return { x: point.x, y: point.y };
  const unrotated = unrotateVectorRad(
    { x: point.x - center.x, y: point.y - center.y },
    rad,
  );
  return { x: unrotated.x + center.x, y: unrotated.y + center.y };
}

/**
 * Transforms a point in a box's local space (top-left at box.x, box.y) to parent/stage space,
 * rotating around the box's center.
 */
export function mapPointFromBoxLocal(box, point, rotation = 0) {
  const qx = box.x + point.x;
  const qy = box.y + point.y;
  if (!rotation) return { x: qx, y: qy };
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const dx = qx - cx;
  const dy = qy - cy;
  return {
    x: cx + cos * dx - sin * dy,
    y: cy + sin * dx + cos * dy,
  };
}

/**
 * Transforms a point from parent/stage space to a box's local space.
 */
export function mapPointToBoxLocal(box, point, rotation = 0) {
  if (!rotation) return { x: point.x - box.x, y: point.y - box.y };
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const qx = point.x - cx;
  const qy = point.y - cy;
  const ux = cos * qx + sin * qy;
  const uy = -sin * qx + cos * qy;
  return {
    x: cx + ux - box.x,
    y: cy + uy - box.y,
  };
}

/**
 * Computes handle centers in the same coordinate space as `rect` ({ x, y, width, height }).
 *
 * Four corners, no edge midpoints — Figma's model for a layer. There is one
 * handle set for the whole editor: `drawSelection` paints these and the
 * pointer hit-test reads the same list, so a resize affordance is never
 * reachable without being drawn, nor drawn without being reachable. Dragging an
 * edge moves the node; resizing happens from a corner.
 */
export function calculateHandlePoints(rect) {
  const midX = rect.x + rect.width / 2;
  const midY = rect.y + rect.height / 2;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  return [
    { handle: "nw", x: rect.x, y: rect.y },
    { handle: "n", x: midX, y: rect.y },
    { handle: "ne", x: right, y: rect.y },
    { handle: "e", x: right, y: midY },
    { handle: "se", x: right, y: bottom },
    { handle: "s", x: midX, y: bottom },
    { handle: "sw", x: rect.x, y: bottom },
    { handle: "w", x: rect.x, y: midY },
  ];
}

export const handlePoints = calculateHandlePoints;

/**
 * The point on `rect` diametrically opposite `handle`, in the same space.
 *
 * Computed straight from the rect rather than looked up in a handle list: the
 * list holds only the four corners the UI offers, but the resize *math* still
 * accepts an edge handle from every non-pointer caller (the W/H number fields,
 * a script driving the engine). Asking the list would hand those callers
 * `undefined` for the anchor and crash the drag.
 */
export function oppositeHandlePoint(rect, handle) {
  const opposite = OPPOSITE_HANDLE[handle];
  if (!opposite) return null;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  // `includes` rather than `===`: "nw" has to read as both a west and a north
  // edge, which an exact match against "w"/"n" would miss and drop to centre.
  return {
    handle: opposite,
    x: opposite.includes("w")
      ? rect.x
      : opposite.includes("e")
        ? right
        : rect.x + rect.width / 2,
    y: opposite.includes("n")
      ? rect.y
      : opposite.includes("s")
        ? bottom
        : rect.y + rect.height / 2,
  };
}

/**
 * Tests which handle is under a point within a given tolerance.
 */
export function findHandleAtPoint(rect, point, tolerance) {
  for (const candidate of calculateHandlePoints(rect)) {
    if (
      Math.abs(point.x - candidate.x) <= tolerance &&
      Math.abs(point.y - candidate.y) <= tolerance
    ) {
      return candidate.handle;
    }
  }
  return null;
}

export const handleAtPoint = findHandleAtPoint;

/**
 * The handle under a point from a precomputed `{ handle, x, y }` list, or null.
 * Distance is Euclidean within `tolerance`, in the list's own space.
 */
export function handleFromPoints(points, point, tolerance) {
  for (const candidate of points) {
    const dx = point.x - candidate.x;
    const dy = point.y - candidate.y;
    if (dx * dx + dy * dy <= tolerance * tolerance) {
      return candidate.handle;
    }
  }
  return null;
}

/**
 * Resizes an un-rotated box in local space given a handle and a local delta.
 *
 * Supports:
 * - `keepRatio`: locks the original aspect ratio (corner drag follows dominant axis; edge drag scales orthogonal axis)
 * - `fromCentre`: expands symmetrically around center (Alt key)
 * - `minWidth` / `minHeight`: clamps dimensions (never below minimums, prevents negative mirroring)
 * - `maxWidth` / `maxHeight`: optional upper boundary clamps
 */
export function resizeBoxLocal(rect, handle, delta, options = {}) {
  const {
    keepRatio = false,
    fromCentre = false,
    minWidth = 1,
    minHeight = 1,
    maxWidth = Infinity,
    maxHeight = Infinity,
  } = options;

  const edges = edgesOfHandle(handle);
  if (!edges.left && !edges.right && !edges.top && !edges.bottom) {
    return { ...rect };
  }

  let { x, y, width, height } = rect;
  let dx = delta.x;
  let dy = delta.y;

  const growX = fromCentre ? 2 : 1;
  const growY = fromCentre ? 2 : 1;

  if (keepRatio && rect.width > 0 && rect.height > 0) {
    const ratio = rect.width / rect.height;
    const hasHoriz = edges.left || edges.right;
    const hasVert = edges.top || edges.bottom;

    if (hasHoriz && hasVert) {
      // Corner handle drag: drive off dominant axis
      const signX = edges.left ? -1 : 1;
      const signY = edges.top ? -1 : 1;
      if (Math.abs(dx * signX) * (1 / ratio) > Math.abs(dy * signY)) {
        dy = (signY * (dx * signX)) / ratio;
      } else {
        dx = signX * (dy * signY) * ratio;
      }

      if (edges.right) width += dx * growX;
      if (edges.left) width -= dx * growX;
      if (edges.bottom) height += dy * growY;
      if (edges.top) height -= dy * growY;

      const minW = Math.max(minWidth, minHeight * ratio);
      const minH = minW / ratio;
      const maxW = Math.min(maxWidth, maxHeight * ratio);
      const maxH = maxW / ratio;

      if (width < minW || height < minH) {
        width = minW;
        height = minH;
      } else if (width > maxW || height > maxH) {
        width = maxW;
        height = maxH;
      }

      if (fromCentre) {
        x = rect.x + (rect.width - width) / 2;
        y = rect.y + (rect.height - height) / 2;
      } else {
        if (edges.left) x = rect.x + rect.width - width;
        if (edges.top) y = rect.y + rect.height - height;
      }

      return { x, y, width, height };
    } else if (hasHoriz) {
      // Edge handle (left or right)
      if (edges.right) width += dx * growX;
      if (edges.left) width -= dx * growX;

      const minW = Math.max(minWidth, minHeight * ratio);
      const maxW = Math.min(maxWidth, maxHeight * ratio);

      width = Math.max(minW, Math.min(maxW, width));
      height = width / ratio;

      if (fromCentre) {
        x = rect.x + (rect.width - width) / 2;
        y = rect.y + (rect.height - height) / 2;
      } else {
        if (edges.left) x = rect.x + rect.width - width;
        y = rect.y + (rect.height - height) / 2;
      }

      return { x, y, width, height };
    } else if (hasVert) {
      // Edge handle (top or bottom)
      if (edges.bottom) height += dy * growY;
      if (edges.top) height -= dy * growY;

      const minH = Math.max(minHeight, minWidth / ratio);
      const maxH = Math.min(maxHeight, maxWidth / ratio);

      height = Math.max(minH, Math.min(maxH, height));
      width = height * ratio;

      if (fromCentre) {
        x = rect.x + (rect.width - width) / 2;
        y = rect.y + (rect.height - height) / 2;
      } else {
        if (edges.top) y = rect.y + rect.height - height;
        x = rect.x + (rect.width - width) / 2;
      }

      return { x, y, width, height };
    }
  }

  if (edges.right) width += dx * growX;
  if (edges.left) width -= dx * growX;
  if (edges.bottom) height += dy * growY;
  if (edges.top) height -= dy * growY;

  width = Math.max(minWidth, Math.min(maxWidth, width));
  height = Math.max(minHeight, Math.min(maxHeight, height));

  if (fromCentre) {
    x = rect.x + rect.width / 2 - width / 2;
    y = rect.y + rect.height / 2 - height / 2;
  } else {
    if (edges.left) x = rect.x + rect.width - width;
    if (edges.top) y = rect.y + rect.height - height;
  }

  return { x, y, width, height };
}

/**
 * Resizes a box with an arbitrary rotation in parent/screen space.
 *
 * 1. Screen delta is un-rotated into the local coordinate frame.
 * 2. `resizeBoxLocal` resizes the box in that frame.
 * 3. Local center displacement is rotated forward and re-anchored so that
 *    either the center (if `fromCentre`) or the pinned opposite handle stays fixed.
 */
export function resizeBoxWithTransform({
  rect,
  handle,
  delta,
  rotation = 0,
  keepRatio = false,
  fromCentre = false,
  minWidth = 1,
  minHeight = 1,
  maxWidth = Infinity,
  maxHeight = Infinity,
}) {
  const localDelta = unrotateVector(delta, rotation);
  const localResized = resizeBoxLocal(
    { x: 0, y: 0, width: rect.width, height: rect.height },
    handle,
    localDelta,
    { keepRatio, fromCentre, minWidth, minHeight, maxWidth, maxHeight },
  );

  const opposite = OPPOSITE_HANDLE[handle] || "center";
  const edges = edgesOfHandle(opposite);
  const ax = edges.left ? 0 : edges.right ? 1 : 0.5;
  const ay = edges.top ? 0 : edges.bottom ? 1 : 0.5;

  const anchor = fromCentre
    ? { x: localResized.width / 2, y: localResized.height / 2 }
    : { x: ax * localResized.width, y: ay * localResized.height };

  const pinned = { x: anchor.x + localResized.x, y: anchor.y + localResized.y };
  const docBefore = mapPointFromBoxLocal(rect, pinned, rotation);
  const unshifted = mapPointFromBoxLocal(
    { x: 0, y: 0, width: localResized.width, height: localResized.height },
    anchor,
    rotation,
  );

  return {
    x: docBefore.x - unshifted.x,
    y: docBefore.y - unshifted.y,
    width: localResized.width,
    height: localResized.height,
  };
}

/**
 * Normalizes an angle in degrees into (-180, 180].
 */
export function normalizeAngle180(degrees) {
  const wrapped = ((degrees % 360) + 360) % 360;
  return wrapped > 180 ? wrapped - 360 : wrapped;
}

/**
 * Normalizes an angle in degrees into [0, 360).
 */
export function normalizeAngle360(degrees) {
  return ((degrees % 360) + 360) % 360;
}

/**
 * Calculates rotation from center to pointer with optional snap options.
 *
 * @param {Object} params
 * @param {{ x: number, y: number }} params.center - Center of rotation
 * @param {{ x: number, y: number }} params.pointer - Current pointer position
 * @param {number} [params.stalkOffset=90] - Degree offset (90° means stalk is straight up)
 * @param {boolean} [params.snap180=false] - If true, returns normalized to (-180, 180]; otherwise [0, 360)
 * @param {number|null} [params.stepInterval=null] - Fixed step interval to round to (e.g. 15 for Shift-key snap)
 * @param {number[]} [params.magneticAngles=[]] - Magnetic cardinal snap targets (e.g. [0, 45, 90, 135, ...])
 * @param {number} [params.magneticTolerance=4] - Degree threshold for magnetic snapping
 */
export function calculateRotationAngle({
  center,
  pointer,
  stalkOffset = 90,
  snap180 = false,
  stepInterval = null,
  magneticAngles = null,
  magneticTolerance = 4,
}) {
  const angleRad = Math.atan2(pointer.y - center.y, pointer.x - center.x);
  let deg = (angleRad * 180) / Math.PI + stalkOffset;

  if (Array.isArray(magneticAngles) && magneticAngles.length > 0) {
    const normDeg = normalizeAngle360(deg);
    for (const target of magneticAngles) {
      const normalizedTarget = normalizeAngle360(target);
      const directDistance = Math.abs(normDeg - normalizedTarget);
      const angularDistance = Math.min(directDistance, 360 - directDistance);
      if (angularDistance < magneticTolerance) {
        deg = normalizedTarget;
        break;
      }
    }
  } else if (typeof stepInterval === "number" && stepInterval > 0) {
    deg = Math.round(deg / stepInterval) * stepInterval;
  }

  return snap180 ? normalizeAngle180(deg) : normalizeAngle360(deg);
}
