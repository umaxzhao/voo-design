/** Pure edge detection and bounded Live Wire pathfinding for Magnetic Lasso. */

import { createIndexedMinHeap } from "./magnetic_lasso_heap.js";
import {
  MAGNETIC_LASSO_LIMITS,
  clampInteger,
  finitePoint,
  positiveInteger,
} from "./magnetic_lasso_geometry.js";

export {
  MAGNETIC_LASSO_LIMITS,
  MAGNETIC_LASSO_SETTINGS,
  clampLiveWireRoi,
  extractRgbaRoi,
} from "./magnetic_lasso_geometry.js";

const SQRT_TWO = Math.SQRT2;
const NEIGHBORS = Object.freeze([
  [-1, -1, SQRT_TWO],
  [0, -1, 1],
  [1, -1, SQRT_TWO],
  [-1, 0, 1],
  [1, 0, 1],
  [-1, 1, SQRT_TWO],
  [0, 1, 1],
  [1, 1, SQRT_TWO],
]);

function scalarAt(values, width, height, x, y) {
  const safeX = Math.max(0, Math.min(width - 1, x));
  const safeY = Math.max(0, Math.min(height - 1, y));
  return values[safeY * width + safeX];
}

function scharrAt(values, width, height, x, y) {
  const topLeft = scalarAt(values, width, height, x - 1, y - 1);
  const top = scalarAt(values, width, height, x, y - 1);
  const topRight = scalarAt(values, width, height, x + 1, y - 1);
  const left = scalarAt(values, width, height, x - 1, y);
  const right = scalarAt(values, width, height, x + 1, y);
  const bottomLeft = scalarAt(values, width, height, x - 1, y + 1);
  const bottom = scalarAt(values, width, height, x, y + 1);
  const bottomRight = scalarAt(values, width, height, x + 1, y + 1);
  return {
    x:
      -3 * topLeft +
      3 * topRight -
      10 * left +
      10 * right -
      3 * bottomLeft +
      3 * bottomRight,
    y:
      -3 * topLeft -
      10 * top -
      3 * topRight +
      3 * bottomLeft +
      10 * bottom +
      3 * bottomRight,
  };
}

/** Computes normalized Scharr strength/direction from premultiplied RGBA. */
export function computeScharrGradient(
  rgba,
  width,
  height,
  { alphaWeight = 0.75 } = {},
) {
  positiveInteger(width, "width");
  positiveInteger(height, "height");
  if (!(rgba instanceof Uint8Array || rgba instanceof Uint8ClampedArray)) {
    throw new TypeError("rgba must be a Uint8Array or Uint8ClampedArray");
  }
  if (rgba.length !== width * height * 4) {
    throw new RangeError("rgba length does not match the gradient dimensions");
  }
  if (!Number.isFinite(alphaWeight) || alphaWeight < 0) {
    throw new RangeError("alphaWeight must be a non-negative number");
  }

  const pixelCount = width * height;
  const luminance = new Float32Array(pixelCount);
  const alpha = new Float32Array(pixelCount);
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    const a = rgba[offset + 3] / 255;
    alpha[index] = rgba[offset + 3];
    luminance[index] =
      (0.2126 * rgba[offset] +
        0.7152 * rgba[offset + 1] +
        0.0722 * rgba[offset + 2]) *
      a;
  }

  const strength = new Float32Array(pixelCount);
  const directionX = new Float32Array(pixelCount);
  const directionY = new Float32Array(pixelCount);
  let maximum = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const lumaGradient = scharrAt(luminance, width, height, x, y);
      const alphaGradient = scharrAt(alpha, width, height, x, y);
      const lumaMagnitude = Math.hypot(lumaGradient.x, lumaGradient.y);
      const alphaMagnitude =
        Math.hypot(alphaGradient.x, alphaGradient.y) * alphaWeight;
      const chosen =
        alphaMagnitude > lumaMagnitude ? alphaGradient : lumaGradient;
      const magnitude = Math.max(lumaMagnitude, alphaMagnitude);
      strength[index] = magnitude;
      if (magnitude > 0) {
        const chosenMagnitude = Math.hypot(chosen.x, chosen.y) || 1;
        directionX[index] = chosen.x / chosenMagnitude;
        directionY[index] = chosen.y / chosenMagnitude;
      }
      maximum = Math.max(maximum, magnitude);
    }
  }
  if (maximum > 0) {
    for (let index = 0; index < pixelCount; index += 1) {
      strength[index] /= maximum;
    }
  }

  return Object.freeze({
    width,
    height,
    strength,
    directionX,
    directionY,
    maximum,
    hasUsableEdge: maximum > 0,
  });
}

function transitionCost(gradient, nextIndex, dx, dy, stepLength, contrast) {
  const strength = gradient.strength[nextIndex];
  const alignment = Math.abs(
    (dx * gradient.directionX[nextIndex] +
      dy * gradient.directionY[nextIndex]) /
      stepLength,
  );
  const edgePenalty = (1 - strength) * (8 + contrast * 16);
  return stepLength * (0.05 + edgePenalty + alignment * 2);
}

/** Builds one shortest-path tree inside an already bounded gradient ROI. */
export function buildLiveWireTree(
  gradient,
  anchor,
  { contrast = 0.5, maxVisited = MAGNETIC_LASSO_LIMITS.MAX_ROI_PIXELS } = {},
) {
  if (!gradient?.strength || !gradient?.directionX || !gradient?.directionY) {
    throw new TypeError("gradient must be a Scharr gradient result");
  }
  const width = positiveInteger(gradient.width, "gradient.width");
  const height = positiveInteger(gradient.height, "gradient.height");
  const pixelCount = width * height;
  if (pixelCount > MAGNETIC_LASSO_LIMITS.MAX_ROI_PIXELS) {
    throw new RangeError(
      "Live Wire gradient exceeds the hard ROI pixel budget",
    );
  }
  positiveInteger(maxVisited, "maxVisited");
  finitePoint(anchor, "anchor");
  const startX = clampInteger(anchor.x, 0, width - 1);
  const startY = clampInteger(anchor.y, 0, height - 1);
  const startIndex = startY * width + startX;
  const distances = new Float32Array(pixelCount);
  distances.fill(Number.POSITIVE_INFINITY);
  const predecessors = new Int32Array(pixelCount);
  predecessors.fill(-1);
  const visited = new Uint8Array(pixelCount);

  if (!gradient.hasUsableEdge) {
    distances[startIndex] = 0;
    return Object.freeze({
      width,
      height,
      startIndex,
      distances,
      predecessors,
      visitedCount: 0,
      allocatedPixels: pixelCount,
      hasUsableEdge: false,
    });
  }

  const heap = createIndexedMinHeap(pixelCount);
  distances[startIndex] = 0;
  heap.pushOrDecrease(startIndex, 0);
  let visitedCount = 0;
  const visitLimit = Math.min(pixelCount, maxVisited);

  while (heap.size > 0 && visitedCount < visitLimit) {
    const current = heap.pop();
    if (!current || visited[current.node]) continue;
    visited[current.node] = 1;
    visitedCount += 1;
    const x = current.node % width;
    const y = Math.floor(current.node / width);
    for (const [dx, dy, stepLength] of NEIGHBORS) {
      const nextX = x + dx;
      const nextY = y + dy;
      if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) {
        continue;
      }
      const nextIndex = nextY * width + nextX;
      if (visited[nextIndex]) continue;
      const nextDistance =
        current.cost +
        transitionCost(gradient, nextIndex, dx, dy, stepLength, contrast);
      if (nextDistance >= distances[nextIndex]) continue;
      distances[nextIndex] = nextDistance;
      predecessors[nextIndex] = current.node;
      heap.pushOrDecrease(nextIndex, nextDistance);
    }
  }

  return Object.freeze({
    width,
    height,
    startIndex,
    distances,
    predecessors,
    visitedCount,
    allocatedPixels: pixelCount,
    hasUsableEdge: true,
  });
}

/** Finds a stable high-gradient endpoint close to the user's raw cursor. */
export function findMagneticTarget(
  gradient,
  cursor,
  {
    radius = MAGNETIC_LASSO_LIMITS.DEFAULT_TARGET_RADIUS,
    previousTarget = null,
    hysteresisBonus = 0.12,
  } = {},
) {
  finitePoint(cursor, "cursor");
  const width = positiveInteger(gradient?.width, "gradient.width");
  const height = positiveInteger(gradient?.height, "gradient.height");
  const centerX = clampInteger(cursor.x, 0, width - 1);
  const centerY = clampInteger(cursor.y, 0, height - 1);
  const searchRadius = Math.max(0, Math.floor(radius));
  let best = { x: centerX, y: centerY, score: Number.NEGATIVE_INFINITY };

  for (
    let y = Math.max(0, centerY - searchRadius);
    y <= Math.min(height - 1, centerY + searchRadius);
    y += 1
  ) {
    for (
      let x = Math.max(0, centerX - searchRadius);
      x <= Math.min(width - 1, centerX + searchRadius);
      x += 1
    ) {
      const distance = Math.hypot(x - centerX, y - centerY);
      if (distance > searchRadius) continue;
      const index = y * width + x;
      const isPrevious = previousTarget?.x === x && previousTarget?.y === y;
      const score =
        gradient.strength[index] -
        distance / Math.max(1, searchRadius) +
        (isPrevious ? hysteresisBonus : 0);
      if (score > best.score) best = { x, y, score };
    }
  }
  return Object.freeze(best);
}

/** Deterministic Bresenham fallback for flat or exhausted edge maps. */
export function straightLinePath(start, end) {
  finitePoint(start, "start");
  finitePoint(end, "end");
  let x = Math.round(start.x);
  let y = Math.round(start.y);
  const targetX = Math.round(end.x);
  const targetY = Math.round(end.y);
  const dx = Math.abs(targetX - x);
  const dy = Math.abs(targetY - y);
  const sx = x < targetX ? 1 : -1;
  const sy = y < targetY ? 1 : -1;
  let error = dx - dy;
  const path = [];
  while (path.length < MAGNETIC_LASSO_LIMITS.MAX_PATH_POINTS) {
    path.push([x, y]);
    if (x === targetX && y === targetY) return path;
    const doubled = error * 2;
    if (doubled > -dy) {
      error -= dy;
      x += sx;
    }
    if (doubled < dx) {
      error += dx;
      y += sy;
    }
  }
  throw new RangeError("Straight path exceeded its hard point budget");
}

/** Backtracks one cursor path; flat/unreachable maps degrade to a straight line. */
export function traceLiveWirePath(tree, target) {
  finitePoint(target, "target");
  const width = positiveInteger(tree?.width, "tree.width");
  const height = positiveInteger(tree?.height, "tree.height");
  const targetX = clampInteger(target.x, 0, width - 1);
  const targetY = clampInteger(target.y, 0, height - 1);
  const start = [tree.startIndex % width, Math.floor(tree.startIndex / width)];
  if (!tree.hasUsableEdge) {
    return straightLinePath(
      { x: start[0], y: start[1] },
      { x: targetX, y: targetY },
    );
  }

  let index = targetY * width + targetX;
  if (!Number.isFinite(tree.distances[index])) {
    return straightLinePath(
      { x: start[0], y: start[1] },
      { x: targetX, y: targetY },
    );
  }
  const reversed = [];
  while (reversed.length < MAGNETIC_LASSO_LIMITS.MAX_PATH_POINTS) {
    reversed.push([index % width, Math.floor(index / width)]);
    if (index === tree.startIndex) return reversed.reverse();
    index = tree.predecessors[index];
    if (index < 0) break;
  }
  return straightLinePath(
    { x: start[0], y: start[1] },
    { x: targetX, y: targetY },
  );
}
