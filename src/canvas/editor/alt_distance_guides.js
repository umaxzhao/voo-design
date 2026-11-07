import { nodeAABB } from "./scene_geometry.js";

/**
 * Computes Figma-style distance measurement gap guides between a selected node
 * and a target (hovered) node when Alt/Option is held.
 *
 * @param {Object} selectedNode - The currently selected scene node
 * @param {Object} targetNode - The hovered scene node to measure against
 * @returns {Array<Object>} Array of gap guides ({ type: "gap_h" | "gap_v", ... })
 */
export function computeAltDistanceGuides(selectedNode, targetNode) {
  if (!selectedNode || !targetNode || selectedNode.id === targetNode.id) return [];
  const boxA = nodeAABB(selectedNode);
  const boxB = nodeAABB(targetNode);
  if (!boxA || !boxB) return [];

  const guides = [];

  // Check if boxA is inside boxB (e.g. child inside parent frame)
  const isInside =
    boxA.x >= boxB.x - 1 &&
    boxA.y >= boxB.y - 1 &&
    boxA.x + boxA.width <= boxB.x + boxB.width + 1 &&
    boxA.y + boxA.height <= boxB.y + boxB.height + 1;

  if (isInside) {
    const midX = Math.round(boxA.x + boxA.width / 2);
    const midY = Math.round(boxA.y + boxA.height / 2);

    const topDist = Math.round(boxA.y - boxB.y);
    if (topDist > 0) {
      guides.push({ type: "gap_v", x: midX, y1: boxB.y, y2: boxA.y, label: `${topDist}` });
    }
    const bottomDist = Math.round((boxB.y + boxB.height) - (boxA.y + boxA.height));
    if (bottomDist > 0) {
      guides.push({ type: "gap_v", x: midX, y1: boxA.y + boxA.height, y2: boxB.y + boxB.height, label: `${bottomDist}` });
    }
    const leftDist = Math.round(boxA.x - boxB.x);
    if (leftDist > 0) {
      guides.push({ type: "gap_h", y: midY, x1: boxB.x, x2: boxA.x, label: `${leftDist}` });
    }
    const rightDist = Math.round((boxB.x + boxB.width) - (boxA.x + boxA.width));
    if (rightDist > 0) {
      guides.push({ type: "gap_h", y: midY, x1: boxA.x + boxA.width, x2: boxB.x + boxB.width, label: `${rightDist}` });
    }
    return guides;
  }

  // Check if boxB is inside boxA
  const isTargetInside =
    boxB.x >= boxA.x - 1 &&
    boxB.y >= boxA.y - 1 &&
    boxB.x + boxB.width <= boxA.x + boxA.width + 1 &&
    boxB.y + boxB.height <= boxA.y + boxA.height + 1;

  if (isTargetInside) {
    return computeAltDistanceGuides(targetNode, selectedNode);
  }

  const aRight = boxA.x + boxA.width;
  const aBottom = boxA.y + boxA.height;
  const bRight = boxB.x + boxB.width;
  const bBottom = boxB.y + boxB.height;

  // Horizontal separation
  if (aRight < boxB.x) {
    const gap = Math.round(boxB.x - aRight);
    const overlapY1 = Math.max(boxA.y, boxB.y);
    const overlapY2 = Math.min(aBottom, bBottom);
    const crossY = overlapY1 <= overlapY2 ? Math.round((overlapY1 + overlapY2) / 2) : Math.round((boxA.y + boxB.y) / 2);
    guides.push({ type: "gap_h", x1: aRight, x2: boxB.x, y: crossY, label: `${gap}` });
  } else if (bRight < boxA.x) {
    const gap = Math.round(boxA.x - bRight);
    const overlapY1 = Math.max(boxA.y, boxB.y);
    const overlapY2 = Math.min(aBottom, bBottom);
    const crossY = overlapY1 <= overlapY2 ? Math.round((overlapY1 + overlapY2) / 2) : Math.round((boxA.y + boxB.y) / 2);
    guides.push({ type: "gap_h", x1: bRight, x2: boxA.x, y: crossY, label: `${gap}` });
  }

  // Vertical separation
  if (aBottom < boxB.y) {
    const gap = Math.round(boxB.y - aBottom);
    const overlapX1 = Math.max(boxA.x, boxB.x);
    const overlapX2 = Math.min(aRight, bRight);
    const crossX = overlapX1 <= overlapX2 ? Math.round((overlapX1 + overlapX2) / 2) : Math.round((boxA.x + boxB.x) / 2);
    guides.push({ type: "gap_v", y1: aBottom, y2: boxB.y, x: crossX, label: `${gap}` });
  } else if (bBottom < boxA.y) {
    const gap = Math.round(boxA.y - bBottom);
    const overlapX1 = Math.max(boxA.x, boxB.x);
    const overlapX2 = Math.min(aRight, bRight);
    const crossX = overlapX1 <= overlapX2 ? Math.round((overlapX1 + overlapX2) / 2) : Math.round((boxA.x + boxB.x) / 2);
    guides.push({ type: "gap_v", y1: bBottom, y2: boxA.y, x: crossX, label: `${gap}` });
  }

  return guides;
}
