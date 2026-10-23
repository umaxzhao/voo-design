/**
 * Calculates alignment snapping, grid snapping (rectangular & isometric),
 * pixel-perfect rounding, and active visual guide lines for an object
 * being moved or resized on the Image Editor canvas.
 */

import { nodeAABB } from "./scene_geometry.js";
import { getSetting } from "../../shared/settings.js";

/** Screen-space distance to acquire a snap (Figma/Affinity tactile feel). */
export const SNAP_ACQUIRE_PX = 5;
/** Screen-space distance to keep a snap once acquired (hysteresis). */
export const SNAP_RELEASE_PX = 9;
/** @deprecated Prefer SNAP_ACQUIRE_PX; kept for callers that override tolerance. */
const SNAP_THRESHOLD_PX = SNAP_ACQUIRE_PX;
const SQRT3_OVER_2 = Math.sqrt(3) / 2;

/** Persisted settings keys that drive the snapping options below. */
export const SNAP_SETTING_KEYS = Object.freeze({
  snapToGrid: "voo.editor.snapToGrid",
  showGuides: "voo.editor.showGuides",
});

/** Size used when "snap to grid" is on but no grid overlay has been drawn. */
export const DEFAULT_GRID_SNAP_SIZE = 32;

/**
 * Builds the `options` object `snapNodeBounds` expects.
 *
 * Kept pure so the reachability of grid/guide snapping is unit-testable
 * without an engine or a settings store. `snapToObjects` and guide snapping
 * stay on by default: the ruler only adds reachability, it must not regress
 * the object/guide snapping the editor already had.
 */
export function buildSnapOptions({
  grid = null,
  snapToGrid = false,
  showGuides = true,
  activeSnap = false,
} = {}) {
  const size = Number(grid?.size);
  return {
    enabled: true,
    snapToObjects: true,
    snapToGuides: showGuides !== false,
    snapToGrid: snapToGrid === true,
    activeSnap: activeSnap === true,
    grid: {
      type: grid?.type === "isometric" ? "isometric" : "rectangular",
      size: Number.isFinite(size) && size > 0 ? size : DEFAULT_GRID_SNAP_SIZE,
    },
  };
}

/**
 * The snapping options the pointer handlers should pass right now.
 *
 * Reads the persisted toggles synchronously (the settings module keeps a
 * module-load cache), so flipping "Snap to grid" in the zoom bar takes effect
 * on the very next gesture without restarting the engine; the grid overlay
 * only supplies the grid type/size.
 */
export function editorSnapOptions({ grid = null, activeSnap = false } = {}) {
  return buildSnapOptions({
    grid,
    snapToGrid: getSetting(SNAP_SETTING_KEYS.snapToGrid) === true,
    showGuides: getSetting(SNAP_SETTING_KEYS.showGuides) !== false,
    activeSnap,
  });
}

function getOverlapCenter(min1, size1, min2, size2) {
  const overlapMin = Math.max(min1, min2);
  const overlapMax = Math.min(min1 + size1, min2 + size2);
  if (overlapMax > overlapMin) {
    return (overlapMin + overlapMax) / 2;
  }
  return (min1 + size1 / 2 + min2 + size2 / 2) / 2;
}

function hasVerticalProximity(b1, b2, maxDist = 450) {
  const overlap = Math.min(b1.y + b1.height, b2.y + b2.height) - Math.max(b1.y, b2.y);
  if (overlap > 0) return true;
  const vertDist = Math.max(b1.y, b2.y) - Math.min(b1.y + b1.height, b2.y + b2.height);
  return vertDist <= maxDist;
}

function hasHorizontalProximity(b1, b2, maxDist = 450) {
  const overlap = Math.min(b1.x + b1.width, b2.x + b2.width) - Math.max(b1.x, b2.x);
  if (overlap > 0) return true;
  const horizDist = Math.max(b1.x, b2.x) - Math.min(b1.x + b1.width, b2.x + b2.width);
  return horizDist <= maxDist;
}

/**
 * Snaps bounding box coordinates and generates guide lines.
 *
 * @param {Object} params
 * @param {Object} params.doc The current scene document
 * @param {string} [params.activeId] Node ID currently being dragged/moved
 * @param {Array<string>} [params.activeIds] Set of node IDs being dragged/moved together
 * @param {Object} params.rect Proposed bounding box { x, y, width, height }
 * @param {number} [params.zoom=1] Current viewport zoom level
 * @param {string|null} [params.handle=null] Resize handle direction ('nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w')
 * @param {Object} [params.options={}] Snapping configuration options
 * @returns {{ x: number, y: number, width: number, height: number, deltaX: number, deltaY: number, guides: Array<Object> }}
 */
export function snapNodeBounds({
  doc,
  activeId,
  activeIds,
  rect,
  zoom = 1,
  handle = null,
  options = {},
}) {
  if (!rect || !doc) {
    return {
      x: rect?.x ?? 0,
      y: rect?.y ?? 0,
      width: rect?.width ?? 0,
      height: rect?.height ?? 0,
      deltaX: 0,
      deltaY: 0,
      guides: [],
    };
  }

  // Master switch
  if (options.enabled === false) {
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      deltaX: 0,
      deltaY: 0,
      guides: [],
    };
  }

  const snapToGrid = Boolean(options.snapToGrid);
  const snapToObjects = options.snapToObjects !== false;
  const snapToGuides = options.snapToGuides !== false;
  const snapToPixel = Boolean(options.snapToPixel);
  const snapEqualSpacing = options.snapEqualSpacing !== false;
  const gridType = options.grid?.type || "rectangular";
  const gridSize = Math.max(1, options.grid?.size || 10);

  // Hysteresis: easier to stay snapped than to acquire, preventing flutter at
  // the threshold boundary while dragging along an alignment.
  const acquirePx = options.tolerance ?? SNAP_ACQUIRE_PX;
  const releasePx = options.releaseTolerance ?? SNAP_RELEASE_PX;
  const acquireThreshold = Math.max(3, acquirePx / zoom);
  const releaseThreshold = Math.max(acquireThreshold + 1, releasePx / zoom);
  const threshold = options.activeSnap ? releaseThreshold : acquireThreshold;

  const targetsX = [];
  const targetsY = [];
  const guides = [];

  // Canvas boundaries
  if (snapToObjects) {
    targetsX.push({ pos: 0 }, { pos: doc.width / 2 }, { pos: doc.width });
    targetsY.push({ pos: 0 }, { pos: doc.height / 2 }, { pos: doc.height });
  }

  const moving = new Set(activeIds ?? (activeId ? [activeId] : []));
  const siblingBoxes = [];

  // Sibling nodes — only a local neighborhood. Full-document scans made every
  // drag frame O(N) for alignment and O(N²) for gaps on 1000+ node pages.
  if (snapToObjects) {
    const totalNodes = doc.nodes?.length ?? 0;
    const neighborMargin = Math.max(
      0,
      Number(options.neighborhoodMargin) ||
        Math.max(rect.width * 3, rect.height * 3, 1000 / Math.max(zoom || 1, 1e-6)),
    );
    const neighborBox = {
      minX: rect.x - neighborMargin,
      minY: rect.y - neighborMargin,
      maxX: rect.x + rect.width + neighborMargin,
      maxY: rect.y + rect.height + neighborMargin,
    };

    const index = options.spatialIndex ?? doc.spatialIndex ?? doc._spatialIndex;
    let candidates = null;
    if (index && typeof index.search === "function" && totalNodes > 32) {
      const hits = index.search(neighborBox);
      candidates = [];
      for (let i = 0; i < hits.length; i += 1) {
        const node = hits[i].node ?? hits[i];
        if (!node?.id || moving.has(node.id) || node.visible === false) continue;
        candidates.push(node);
      }
    }

    const nodes = candidates ?? doc.nodes ?? [];
    for (const node of nodes) {
      if (moving.has(node.id) || node.visible === false) continue;
      const box = nodeAABB(node);
      if (
        candidates == null &&
        totalNodes > 32 &&
        (box.x + box.width < neighborBox.minX ||
          box.x > neighborBox.maxX ||
          box.y + box.height < neighborBox.minY ||
          box.y > neighborBox.maxY)
      ) {
        continue;
      }
      siblingBoxes.push(box);
      targetsX.push(
        { pos: box.x, box },
        { pos: box.x + box.width / 2, box },
        { pos: box.x + box.width, box },
      );
      targetsY.push(
        { pos: box.y, box },
        { pos: box.y + box.height / 2, box },
        { pos: box.y + box.height, box },
      );
    }
  }

  // User persistent guide lines
  if (snapToGuides) {
    for (const guide of doc.guides ?? []) {
      if (guide.type === "v" && Number.isFinite(guide.pos)) {
        targetsX.push({ pos: guide.pos });
      } else if (guide.type === "h" && Number.isFinite(guide.pos)) {
        targetsY.push({ pos: guide.pos });
      }
    }
  }

  let snappedX = rect.x;
  let snappedY = rect.y;
  let snappedWidth = rect.width;
  let snappedHeight = rect.height;
  let bestDistX = Infinity;
  let bestDistY = Infinity;
  let activeGuideX = null;
  let activeGuideY = null;
  let activeTargetBoxX = null;
  let activeTargetBoxY = null;
  let gapGuidesX = null;
  let gapGuidesY = null;

  // 1. Evaluate Rectangular Grid Snapping
  if (snapToGrid && gridType === "rectangular") {

    if (handle) {
      if (handle.includes("w")) {
        const near = Math.round(rect.x / gridSize) * gridSize;
        const dist = Math.abs(rect.x - near);
        if (dist <= threshold && dist < bestDistX) {
          bestDistX = dist;
          snappedX = near;
          snappedWidth = rect.width - (near - rect.x);
          activeGuideX = near;
        }
      } else if (handle.includes("e")) {
        const edge = rect.x + rect.width;
        const near = Math.round(edge / gridSize) * gridSize;
        const dist = Math.abs(edge - near);
        if (dist <= threshold && dist < bestDistX) {
          bestDistX = dist;
          snappedWidth = near - rect.x;
          activeGuideX = near;
        }
      }

      if (handle.includes("n")) {
        const near = Math.round(rect.y / gridSize) * gridSize;
        const dist = Math.abs(rect.y - near);
        if (dist <= threshold && dist < bestDistY) {
          bestDistY = dist;
          snappedY = near;
          snappedHeight = rect.height - (near - rect.y);
          activeGuideY = near;
        }
      } else if (handle.includes("s")) {
        const edge = rect.y + rect.height;
        const near = Math.round(edge / gridSize) * gridSize;
        const dist = Math.abs(edge - near);
        if (dist <= threshold && dist < bestDistY) {
          bestDistY = dist;
          snappedHeight = near - rect.y;
          activeGuideY = near;
        }
      }
    } else {
      const xCandidates = [
        { val: rect.x, offset: 0 },
        { val: rect.x + rect.width / 2, offset: rect.width / 2 },
        { val: rect.x + rect.width, offset: rect.width },
      ];
      for (const { val, offset } of xCandidates) {
        const near = Math.round(val / gridSize) * gridSize;
        const dist = Math.abs(val - near);
        if (dist <= threshold && dist < bestDistX) {
          bestDistX = dist;
          snappedX = near - offset;
          activeGuideX = near;
        }
      }

      const yCandidates = [
        { val: rect.y, offset: 0 },
        { val: rect.y + rect.height / 2, offset: rect.height / 2 },
        { val: rect.y + rect.height, offset: rect.height },
      ];
      for (const { val, offset } of yCandidates) {
        const near = Math.round(val / gridSize) * gridSize;
        const dist = Math.abs(val - near);
        if (dist <= threshold && dist < bestDistY) {
          bestDistY = dist;
          snappedY = near - offset;
          activeGuideY = near;
        }
      }
    }
  }

  // 2. Evaluate Isometric Grid Snapping (O(1) Hexagonal Lattice)
  if (snapToGrid && gridType === "isometric") {
    const isoSize = Math.max(1, options.grid?.size || 30);
    const dx = isoSize * SQRT3_OVER_2;
    const dy = isoSize / 2;

    const findNearestIsoVertex = (px, py) => {
      const r = Math.round(py / dy);
      const isOdd = Math.abs(r % 2) === 1;
      const xOffset = isOdd ? dx : 0;
      const c = Math.round((px - xOffset) / (2 * dx));
      const isoX = c * 2 * dx + xOffset;
      const isoY = r * dy;
      return { x: isoX, y: isoY, dist: Math.hypot(px - isoX, py - isoY) };
    };

    if (handle) {
      const targetPoint = {
        x: handle.includes("e") ? rect.x + rect.width : rect.x,
        y: handle.includes("s") ? rect.y + rect.height : rect.y,
      };
      const nearest = findNearestIsoVertex(targetPoint.x, targetPoint.y);
      if (nearest.dist <= threshold * 1.5) {
        if (handle.includes("e")) snappedWidth = nearest.x - rect.x;
        if (handle.includes("w")) {
          snappedWidth = rect.width - (nearest.x - rect.x);
          snappedX = nearest.x;
        }
        if (handle.includes("s")) snappedHeight = nearest.y - rect.y;
        if (handle.includes("n")) {
          snappedHeight = rect.height - (nearest.y - rect.y);
          snappedY = nearest.y;
        }
        guides.push({
          type: "isometric",
          x: nearest.x,
          y: nearest.y,
          angle: 30,
        });
      }
    } else {
      const nearest = findNearestIsoVertex(rect.x, rect.y);
      if (nearest.dist <= threshold * 1.5) {
        snappedX = nearest.x;
        snappedY = nearest.y;
        bestDistX = nearest.dist;
        bestDistY = nearest.dist;
        guides.push({
          type: "isometric",
          x: nearest.x,
          y: nearest.y,
          angle: 30,
        });
      }
    }
  }

  // 3. Evaluate Objects & Guidelines Snapping
  if (handle) {
    const hasW = handle.includes("w");
    const hasE = handle.includes("e");
    const hasN = handle.includes("n");
    const hasS = handle.includes("s");

    if (hasW) {
      const edge = rect.x;
      for (const target of targetsX) {
        const dist = Math.abs(edge - target.pos);
        if (dist <= threshold && dist < bestDistX) {
          bestDistX = dist;
          activeGuideX = target.pos;
          activeTargetBoxX = target.box ?? null;
          const dX = target.pos - edge;
          snappedX = target.pos;
          snappedWidth = rect.width - dX;
        }
      }
    } else if (hasE) {
      const edge = rect.x + rect.width;
      for (const target of targetsX) {
        const dist = Math.abs(edge - target.pos);
        if (dist <= threshold && dist < bestDistX) {
          bestDistX = dist;
          activeGuideX = target.pos;
          activeTargetBoxX = target.box ?? null;
          const dX = target.pos - edge;
          snappedWidth = rect.width + dX;
        }
      }
    }

    if (hasN) {
      const edge = rect.y;
      for (const target of targetsY) {
        const dist = Math.abs(edge - target.pos);
        if (dist <= threshold && dist < bestDistY) {
          bestDistY = dist;
          activeGuideY = target.pos;
          activeTargetBoxY = target.box ?? null;
          const dY = target.pos - edge;
          snappedY = target.pos;
          snappedHeight = rect.height - dY;
        }
      }
    } else if (hasS) {
      const edge = rect.y + rect.height;
      for (const target of targetsY) {
        const dist = Math.abs(edge - target.pos);
        if (dist <= threshold && dist < bestDistY) {
          bestDistY = dist;
          activeGuideY = target.pos;
          activeTargetBoxY = target.box ?? null;
          const dY = target.pos - edge;
          snappedHeight = rect.height + dY;
        }
      }
    }
  } else {
    const movingXEdges = [
      { edge: rect.x, offset: 0 },
      { edge: rect.x + rect.width / 2, offset: rect.width / 2 },
      { edge: rect.x + rect.width, offset: rect.width },
    ];

    const movingYEdges = [
      { edge: rect.y, offset: 0 },
      { edge: rect.y + rect.height / 2, offset: rect.height / 2 },
      { edge: rect.y + rect.height, offset: rect.height },
    ];

    for (const { edge, offset } of movingXEdges) {
      for (const target of targetsX) {
        const dist = Math.abs(edge - target.pos);
        if (dist <= threshold && dist < bestDistX) {
          bestDistX = dist;
          snappedX = target.pos - offset;
          activeGuideX = target.pos;
          activeTargetBoxX = target.box ?? null;
        }
      }
    }

    for (const { edge, offset } of movingYEdges) {
      for (const target of targetsY) {
        const dist = Math.abs(edge - target.pos);
        if (dist <= threshold && dist < bestDistY) {
          bestDistY = dist;
          snappedY = target.pos - offset;
          activeGuideY = target.pos;
          activeTargetBoxY = target.box ?? null;
        }
      }
    }

    // 4. Equidistant Gap Snapping (Figma & Affinity parity)
    if (snapEqualSpacing && siblingBoxes.length >= 2) {
      // Horizontal equidistant gaps
      const sortedX = [...siblingBoxes].sort((a, b) => a.x - b.x);
      const hPairs = [];
      for (let i = 0; i < sortedX.length; i += 1) {
        const b1 = sortedX[i];
        for (let j = i + 1; j < sortedX.length; j += 1) {
          const b2 = sortedX[j];
          if (b2.x < b1.x + b1.width) continue;
          if (hasVerticalProximity(b1, b2, 100)) {
            hPairs.push({ b1, b2, gap: b2.x - (b1.x + b1.width) });
            break;
          }
        }
      }

      const candidateHPairs = hPairs.filter(
        ({ b1, b2 }) =>
          hasVerticalProximity(b1, rect, 450) || hasVerticalProximity(b2, rect, 450),
      );

      for (const { b1, b2, gap } of candidateHPairs) {
        // Append Right: b1 -> b2 -> rect
        if (gap > 4) {
          const targetRight = b2.x + b2.width + gap;
          const distRight = Math.abs(rect.x - targetRight);
          if (distRight <= threshold && distRight <= bestDistX) {
            bestDistX = distRight;
            snappedX = targetRight;
            activeGuideX = targetRight;
            activeTargetBoxX = null;

            const allMinY = Math.max(b1.y, b2.y, rect.y);
            const allMaxY = Math.min(
              b1.y + b1.height,
              b2.y + b2.height,
              rect.y + rect.height,
            );
            const commonY = allMaxY > allMinY ? (allMinY + allMaxY) / 2 : null;
            const yA =
              commonY ?? getOverlapCenter(b1.y, b1.height, b2.y, b2.height);
            const yB =
              commonY ?? getOverlapCenter(b2.y, b2.height, rect.y, rect.height);
            const roundedGap = Math.round(gap);

            // Chain discovery to the left of b1
            let currLeft = b1;
            const chainLeft = [];
            for (let k = sortedX.indexOf(b1) - 1; k >= 0; k -= 1) {
              const prev = sortedX[k];
              if (hasVerticalProximity(prev, currLeft, 100)) {
                const prevGap = currLeft.x - (prev.x + prev.width);
                if (Math.abs(prevGap - gap) <= 1.5) {
                  const prevY =
                    commonY ??
                    getOverlapCenter(prev.y, prev.height, currLeft.y, currLeft.height);
                  chainLeft.unshift({
                    type: "gap_h",
                    x1: prev.x + prev.width,
                    x2: currLeft.x,
                    y: prevY,
                    gap: roundedGap,
                    label: `${roundedGap}px`,
                    pos: Math.round((prev.x + prev.width + currLeft.x) / 2),
                  });
                  currLeft = prev;
                } else {
                  break;
                }
              }
            }

            gapGuidesX = [
              ...chainLeft,
              {
                type: "gap_h",
                x1: b1.x + b1.width,
                x2: b2.x,
                y: yA,
                gap: roundedGap,
                label: `${roundedGap}px`,
                pos: Math.round((b1.x + b1.width + b2.x) / 2),
              },
              {
                type: "gap_h",
                x1: b2.x + b2.width,
                x2: targetRight,
                y: yB,
                gap: roundedGap,
                label: `${roundedGap}px`,
                pos: Math.round((b2.x + b2.width + targetRight) / 2),
              },
            ];
          }

          // Append Left: rect -> b1 -> b2
          const targetLeft = b1.x - gap - rect.width;
          const distLeft = Math.abs(rect.x - targetLeft);
          if (distLeft <= threshold && distLeft <= bestDistX) {
            bestDistX = distLeft;
            snappedX = targetLeft;
            activeGuideX = targetLeft;
            activeTargetBoxX = null;

            const allMinY = Math.max(b1.y, b2.y, rect.y);
            const allMaxY = Math.min(
              b1.y + b1.height,
              b2.y + b2.height,
              rect.y + rect.height,
            );
            const commonY = allMaxY > allMinY ? (allMinY + allMaxY) / 2 : null;
            const yA =
              commonY ?? getOverlapCenter(rect.y, rect.height, b1.y, b1.height);
            const yB =
              commonY ?? getOverlapCenter(b1.y, b1.height, b2.y, b2.height);
            const roundedGap = Math.round(gap);

            // Chain discovery to the right of b2
            let currRight = b2;
            const chainRight = [];
            for (let k = sortedX.indexOf(b2) + 1; k < sortedX.length; k += 1) {
              const next = sortedX[k];
              if (hasVerticalProximity(currRight, next, 100)) {
                const nextGap = next.x - (currRight.x + currRight.width);
                if (Math.abs(nextGap - gap) <= 1.5) {
                  const nextY =
                    commonY ??
                    getOverlapCenter(currRight.y, currRight.height, next.y, next.height);
                  chainRight.push({
                    type: "gap_h",
                    x1: currRight.x + currRight.width,
                    x2: next.x,
                    y: nextY,
                    gap: roundedGap,
                    label: `${roundedGap}px`,
                    pos: Math.round((currRight.x + currRight.width + next.x) / 2),
                  });
                  currRight = next;
                } else {
                  break;
                }
              }
            }

            gapGuidesX = [
              {
                type: "gap_h",
                x1: targetLeft + rect.width,
                x2: b1.x,
                y: yA,
                gap: roundedGap,
                label: `${roundedGap}px`,
                pos: Math.round((targetLeft + rect.width + b1.x) / 2),
              },
              {
                type: "gap_h",
                x1: b1.x + b1.width,
                x2: b2.x,
                y: yB,
                gap: roundedGap,
                label: `${roundedGap}px`,
                pos: Math.round((b1.x + b1.width + b2.x) / 2),
              },
              ...chainRight,
            ];
          }
        }

        // In-Between Insertion: b1 -> rect -> b2
        if (gap > rect.width + 8) {
          const midGap = (gap - rect.width) / 2;
          const targetMid = b1.x + b1.width + midGap;
          const distMid = Math.abs(rect.x - targetMid);
          if (distMid <= threshold && distMid <= bestDistX) {
            bestDistX = distMid;
            snappedX = targetMid;
            activeGuideX = targetMid;
            activeTargetBoxX = null;

            const allMinY = Math.max(b1.y, b2.y, rect.y);
            const allMaxY = Math.min(
              b1.y + b1.height,
              b2.y + b2.height,
              rect.y + rect.height,
            );
            const commonY = allMaxY > allMinY ? (allMinY + allMaxY) / 2 : null;
            const yA =
              commonY ?? getOverlapCenter(b1.y, b1.height, rect.y, rect.height);
            const yB =
              commonY ?? getOverlapCenter(rect.y, rect.height, b2.y, b2.height);
            const roundedGap = Math.round(midGap);

            gapGuidesX = [
              {
                type: "gap_h",
                x1: b1.x + b1.width,
                x2: targetMid,
                y: yA,
                gap: roundedGap,
                label: `${roundedGap}px`,
                pos: Math.round((b1.x + b1.width + targetMid) / 2),
              },
              {
                type: "gap_h",
                x1: targetMid + rect.width,
                x2: b2.x,
                y: yB,
                gap: roundedGap,
                label: `${roundedGap}px`,
                pos: Math.round((targetMid + rect.width + b2.x) / 2),
              },
            ];
          }
        }
      }

      // Vertical equidistant gaps
      const sortedY = [...siblingBoxes].sort((a, b) => a.y - b.y);
      const vPairs = [];
      for (let i = 0; i < sortedY.length; i += 1) {
        const b1 = sortedY[i];
        for (let j = i + 1; j < sortedY.length; j += 1) {
          const b2 = sortedY[j];
          if (b2.y < b1.y + b1.height) continue;
          if (hasHorizontalProximity(b1, b2, 100)) {
            vPairs.push({ b1, b2, gap: b2.y - (b1.y + b1.height) });
            break;
          }
        }
      }

      const candidateVPairs = vPairs.filter(
        ({ b1, b2 }) =>
          hasHorizontalProximity(b1, rect, 450) || hasHorizontalProximity(b2, rect, 450),
      );

      for (const { b1, b2, gap } of candidateVPairs) {
        // Append Below: b1 -> b2 -> rect
        if (gap > 4) {
          const targetBelow = b2.y + b2.height + gap;
          const distBelow = Math.abs(rect.y - targetBelow);
          if (distBelow <= threshold && distBelow <= bestDistY) {
            bestDistY = distBelow;
            snappedY = targetBelow;
            activeGuideY = targetBelow;
            activeTargetBoxY = null;

            const allMinX = Math.max(b1.x, b2.x, rect.x);
            const allMaxX = Math.min(
              b1.x + b1.width,
              b2.x + b2.width,
              rect.x + rect.width,
            );
            const commonX = allMaxX > allMinX ? (allMinX + allMaxX) / 2 : null;
            const xA =
              commonX ?? getOverlapCenter(b1.x, b1.width, b2.x, b2.width);
            const xB =
              commonX ?? getOverlapCenter(b2.x, b2.width, rect.x, rect.width);
            const roundedGap = Math.round(gap);

            // Chain discovery above b1
            let currAbove = b1;
            const chainAbove = [];
            for (let k = sortedY.indexOf(b1) - 1; k >= 0; k -= 1) {
              const prev = sortedY[k];
              if (hasHorizontalProximity(prev, currAbove, 100)) {
                const prevGap = currAbove.y - (prev.y + prev.height);
                if (Math.abs(prevGap - gap) <= 1.5) {
                  const prevX =
                    commonX ??
                    getOverlapCenter(prev.x, prev.width, currAbove.x, currAbove.width);
                  chainAbove.unshift({
                    type: "gap_v",
                    y1: prev.y + prev.height,
                    y2: currAbove.y,
                    x: prevX,
                    gap: roundedGap,
                    label: `${roundedGap}px`,
                    pos: Math.round((prev.y + prev.height + currAbove.y) / 2),
                  });
                  currAbove = prev;
                } else {
                  break;
                }
              }
            }

            gapGuidesY = [
              ...chainAbove,
              {
                type: "gap_v",
                y1: b1.y + b1.height,
                y2: b2.y,
                x: xA,
                gap: roundedGap,
                label: `${roundedGap}px`,
                pos: Math.round((b1.y + b1.height + b2.y) / 2),
              },
              {
                type: "gap_v",
                y1: b2.y + b2.height,
                y2: targetBelow,
                x: xB,
                gap: roundedGap,
                label: `${roundedGap}px`,
                pos: Math.round((b2.y + b2.height + targetBelow) / 2),
              },
            ];
          }

          // Append Above: rect -> b1 -> b2
          const targetAbove = b1.y - gap - rect.height;
          const distAbove = Math.abs(rect.y - targetAbove);
          if (distAbove <= threshold && distAbove <= bestDistY) {
            bestDistY = distAbove;
            snappedY = targetAbove;
            activeGuideY = targetAbove;
            activeTargetBoxY = null;

            const allMinX = Math.max(b1.x, b2.x, rect.x);
            const allMaxX = Math.min(
              b1.x + b1.width,
              b2.x + b2.width,
              rect.x + rect.width,
            );
            const commonX = allMaxX > allMinX ? (allMinX + allMaxX) / 2 : null;
            const xA =
              commonX ?? getOverlapCenter(rect.x, rect.width, b1.x, b1.width);
            const xB =
              commonX ?? getOverlapCenter(b1.x, b1.width, b2.x, b2.width);
            const roundedGap = Math.round(gap);

            // Chain discovery below b2
            let currBelow = b2;
            const chainBelow = [];
            for (let k = sortedY.indexOf(b2) + 1; k < sortedY.length; k += 1) {
              const next = sortedY[k];
              if (hasHorizontalProximity(currBelow, next, 100)) {
                const nextGap = next.y - (currBelow.y + currBelow.height);
                if (Math.abs(nextGap - gap) <= 1.5) {
                  const nextX =
                    commonX ??
                    getOverlapCenter(currBelow.x, currBelow.width, next.x, next.width);
                  chainBelow.push({
                    type: "gap_v",
                    y1: currBelow.y + currBelow.height,
                    y2: next.y,
                    x: nextX,
                    gap: roundedGap,
                    label: `${roundedGap}px`,
                    pos: Math.round((currBelow.y + currBelow.height + next.y) / 2),
                  });
                  currBelow = next;
                } else {
                  break;
                }
              }
            }

            gapGuidesY = [
              {
                type: "gap_v",
                y1: targetAbove + rect.height,
                y2: b1.y,
                x: xA,
                gap: roundedGap,
                label: `${roundedGap}px`,
                pos: Math.round((targetAbove + rect.height + b1.y) / 2),
              },
              {
                type: "gap_v",
                y1: b1.y + b1.height,
                y2: b2.y,
                x: xB,
                gap: roundedGap,
                label: `${roundedGap}px`,
                pos: Math.round((b1.y + b1.height + b2.y) / 2),
              },
              ...chainBelow,
            ];
          }
        }

        // In-Between Insertion: b1 -> rect -> b2
        if (gap > rect.height + 8) {
          const midGap = (gap - rect.height) / 2;
          const targetMid = b1.y + b1.height + midGap;
          const distMid = Math.abs(rect.y - targetMid);
          if (distMid <= threshold && distMid <= bestDistY) {
            bestDistY = distMid;
            snappedY = targetMid;
            activeGuideY = targetMid;
            activeTargetBoxY = null;

            const allMinX = Math.max(b1.x, b2.x, rect.x);
            const allMaxX = Math.min(
              b1.x + b1.width,
              b2.x + b2.width,
              rect.x + rect.width,
            );
            const commonX = allMaxX > allMinX ? (allMinX + allMaxX) / 2 : null;
            const xA =
              commonX ?? getOverlapCenter(b1.x, b1.width, rect.x, rect.width);
            const xB =
              commonX ?? getOverlapCenter(rect.x, rect.width, b2.x, b2.width);
            const roundedGap = Math.round(midGap);

            gapGuidesY = [
              {
                type: "gap_v",
                y1: b1.y + b1.height,
                y2: targetMid,
                x: xA,
                gap: roundedGap,
                label: `${roundedGap}px`,
                pos: Math.round((b1.y + b1.height + targetMid) / 2),
              },
              {
                type: "gap_v",
                y1: targetMid + rect.height,
                y2: b2.y,
                x: xB,
                gap: roundedGap,
                label: `${roundedGap}px`,
                pos: Math.round((targetMid + rect.height + b2.y) / 2),
              },
            ];
          }
        }
      }
    }
  }

  // 5. Pixel-Perfect Coordinate Rounding
  if (snapToPixel) {
    snappedX = Math.round(snappedX);
    snappedY = Math.round(snappedY);
    snappedWidth = Math.round(snappedWidth);
    snappedHeight = Math.round(snappedHeight);
  }

  if (activeGuideX !== null) {
    const guide = { type: "v", pos: activeGuideX };
    // Object-to-object segments (Figma/Affinity); canvas/grid snaps keep full span.
    if (activeTargetBoxX) {
      const peer = activeTargetBoxX;
      guide.startY = Math.min(rect.y, peer.y) - 8;
      guide.endY =
        Math.max(rect.y + rect.height, peer.y + peer.height) + 8;
    }
    guides.push(guide);
  }
  if (gapGuidesX && gapGuidesX.length > 0) {
    guides.push(...gapGuidesX);
    const firstGap = gapGuidesX[0];
    guides.push({
      type: "gap",
      axis: "h",
      gap: firstGap.gap,
      label: firstGap.label,
      pos: firstGap.gap,
      spans: gapGuidesX.map((g) => ({
        start: g.x1,
        end: g.x2,
        cross: g.y,
        gap: g.gap,
        label: g.label,
      })),
    });
  }

  if (activeGuideY !== null) {
    const guide = { type: "h", pos: activeGuideY };
    if (activeTargetBoxY) {
      const peer = activeTargetBoxY;
      guide.startX = Math.min(rect.x, peer.x) - 8;
      guide.endX =
        Math.max(rect.x + rect.width, peer.x + peer.width) + 8;
    }
    guides.push(guide);
  }
  if (gapGuidesY && gapGuidesY.length > 0) {
    guides.push(...gapGuidesY);
    const firstGap = gapGuidesY[0];
    guides.push({
      type: "gap",
      axis: "v",
      gap: firstGap.gap,
      label: firstGap.label,
      pos: firstGap.gap,
      spans: gapGuidesY.map((g) => ({
        start: g.y1,
        end: g.y2,
        cross: g.x,
        gap: g.gap,
        label: g.label,
      })),
    });
  }

  return {
    x: snappedX,
    y: snappedY,
    width: snappedWidth,
    height: snappedHeight,
    deltaX: snappedX - rect.x,
    deltaY: snappedY - rect.y,
    guides,
  };
}
