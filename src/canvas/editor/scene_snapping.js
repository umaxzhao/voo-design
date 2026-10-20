/**
 * Calculates alignment snapping, grid snapping (rectangular & isometric),
 * pixel-perfect rounding, and active visual guide lines for an object
 * being moved or resized on the Image Editor canvas.
 */

import { nodeAABB } from "./scene_geometry.js";

const SNAP_THRESHOLD_PX = 6;
const SQRT3_OVER_2 = Math.sqrt(3) / 2;

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

  const baseThreshold = options.tolerance ?? SNAP_THRESHOLD_PX;
  const threshold = Math.max(3, baseThreshold / zoom);

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

  // Sibling nodes
  if (snapToObjects) {
    for (const node of doc.nodes ?? []) {
      if (moving.has(node.id) || node.visible === false) continue;
      const box = nodeAABB(node);
      siblingBoxes.push(box);

      targetsX.push(
        { pos: box.x },
        { pos: box.x + box.width / 2 },
        { pos: box.x + box.width },
      );
      targetsY.push(
        { pos: box.y },
        { pos: box.y + box.height / 2 },
        { pos: box.y + box.height },
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
        }
      }
    }

    // 4. Equidistant Gap Snapping (Figma & Affinity parity)
    if (snapEqualSpacing && siblingBoxes.length >= 2) {
      // Horizontal equidistant gaps
      const sortedX = [...siblingBoxes].sort((a, b) => a.x - b.x);
      for (let i = 0; i < sortedX.length - 1; i += 1) {
        const b1 = sortedX[i];
        const b2 = sortedX[i + 1];
        const gap = b2.x - (b1.x + b1.width);
        if (gap > 4) {
          const targetRight = b2.x + b2.width + gap;
          const distRight = Math.abs(rect.x - targetRight);
          if (distRight <= threshold && distRight < bestDistX) {
            bestDistX = distRight;
            snappedX = targetRight;
            activeGuideX = targetRight;
          }
          const targetLeft = b1.x - gap - rect.width;
          const distLeft = Math.abs(rect.x - targetLeft);
          if (distLeft <= threshold && distLeft < bestDistX) {
            bestDistX = distLeft;
            snappedX = targetLeft;
            activeGuideX = targetLeft + rect.width;
          }
        }
      }

      // Vertical equidistant gaps
      const sortedY = [...siblingBoxes].sort((a, b) => a.y - b.y);
      for (let i = 0; i < sortedY.length - 1; i += 1) {
        const b1 = sortedY[i];
        const b2 = sortedY[i + 1];
        const gap = b2.y - (b1.y + b1.height);
        if (gap > 4) {
          const targetBelow = b2.y + b2.height + gap;
          const distBelow = Math.abs(rect.y - targetBelow);
          if (distBelow <= threshold && distBelow < bestDistY) {
            bestDistY = distBelow;
            snappedY = targetBelow;
            activeGuideY = targetBelow;
          }
          const targetAbove = b1.y - gap - rect.height;
          const distAbove = Math.abs(rect.y - targetAbove);
          if (distAbove <= threshold && distAbove < bestDistY) {
            bestDistY = distAbove;
            snappedY = targetAbove;
            activeGuideY = targetAbove + rect.height;
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
    guides.push({ type: "v", pos: activeGuideX });
  }
  if (activeGuideY !== null) {
    guides.push({ type: "h", pos: activeGuideY });
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
