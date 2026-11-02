/**
 * Warp mesh helpers and tool switching state patches.
 *
 * Extracted from editor_engine.js to isolate mesh construction and cross-tool
 * conversion semantics for Perspective, Distort, and Puppet Warp.
 */

import { TOOL } from "./editor_constants.js";
import { buildPuppetMesh } from "./puppet_warp.js";
import {
  defaultPerspectiveCorners,
  isDefaultPerspectiveCorners,
  isDefaultControlMesh,
  perspectiveCornersToWarpMesh,
  warpMeshToPerspectiveCorners,
} from "./perspective_geometry.js";

export function createControlMesh(isCurve) {
  const points = [];
  const cols = 3;
  const rows = 3;
  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= cols; column += 1) {
      points.push({
        x: column / cols,
        y: row / rows,
        origU: column / cols,
        origV: row / rows,
      });
    }
  }
  return { cols, rows, points, isCurve };
}

export function isControlMesh(mesh) {
  return (
    Number.isFinite(mesh?.cols) &&
    mesh.cols >= 1 &&
    Number.isFinite(mesh?.rows) &&
    mesh.rows >= 1 &&
    Array.isArray(mesh?.points) &&
    mesh.points.length === (mesh.cols + 1) * (mesh.rows + 1) &&
    !isPuppetMesh(mesh)
  );
}

/**
 * Puppet meshes are told apart from the coarse Mesh/Distort control grid by
 * their density, so the builder and this predicate must read the same number.
 */
export const PUPPET_MESH_SPAN = 32;
const PUPPET_MESH_POINTS = (PUPPET_MESH_SPAN + 1) * (PUPPET_MESH_SPAN + 1);

export function isPuppetMesh(mesh) {
  return (
    mesh?.cols === PUPPET_MESH_SPAN &&
    mesh?.rows === PUPPET_MESH_SPAN &&
    Array.isArray(mesh.points) &&
    mesh.points.length === PUPPET_MESH_POINTS
  );
}

/**
 * Warp formats are converted or preserved seamlessly between transform tools.
 * Conversion semantics (see transform-model-shared-storage-misread.md):
 *  - PERSPECTIVE -> DISTORT: Converts active perspective quad to an equivalent 16-point
 *    bicubic control mesh (mathematically exact bilinear conversion) so the trapezoid
 *    is 100% visually preserved without jumping back to an unwarped rectangle.
 *  - DISTORT -> PERSPECTIVE: Extracts the 4 outer corner points of the active mesh
 *    to preserve corner positions in parametric perspective.
 *  - Switching tools is an interaction mode change and does not commit an undo step.
 */
export function warpPatchForTool(
  node,
  nextTool,
  previousTool,
  bitmapSourceOf = null,
) {
  if (nextTool === TOOL.PERSPECTIVE) {
    let corners = node.perspectiveCorners;
    const hasActiveMesh =
      isControlMesh(node.warpMesh) && !isDefaultControlMesh(node.warpMesh);

    if (
      previousTool === TOOL.DISTORT ||
      previousTool === TOOL.PUPPET_WARP ||
      hasActiveMesh
    ) {
      if (hasActiveMesh) {
        corners = warpMeshToPerspectiveCorners(node.warpMesh);
      }
    }
    if (!corners || corners.length !== 4) {
      corners = defaultPerspectiveCorners();
    }
    return {
      perspectiveCorners: corners,
      warpMesh: null,
      puppetPins: null,
      lastWarpTool: TOOL.PERSPECTIVE,
    };
  }

  if (nextTool === TOOL.PUPPET_WARP) {
    const keepPuppetState = isPuppetMesh(node.warpMesh);
    const bitmap = bitmapSourceOf ? bitmapSourceOf(node) : null;
    return {
      perspectiveCorners: null,
      warpMesh: keepPuppetState
        ? node.warpMesh
        : buildPuppetMesh({
            cols: PUPPET_MESH_SPAN,
            rows: PUPPET_MESH_SPAN,
            jitter: 0,
            bitmap,
          }),
      puppetPins: keepPuppetState ? (node.puppetPins ?? []) : [],
      lastWarpTool: TOOL.PUPPET_WARP,
    };
  }

  const isDistort = nextTool === TOOL.DISTORT;
  const isCurve = isDistort;
  let mesh = null;

  const hasActiveCorners =
    node.perspectiveCorners &&
    node.perspectiveCorners.length === 4 &&
    !isDefaultPerspectiveCorners(node.perspectiveCorners);

  // If coming from perspective with an active quad deformation, ALWAYS convert it
  // to the equivalent 16-point bicubic warpMesh.
  if (previousTool === TOOL.PERSPECTIVE || hasActiveCorners) {
    if (hasActiveCorners) {
      mesh = perspectiveCornersToWarpMesh(node.perspectiveCorners, isCurve);
    }
  }

  if (!mesh) {
    if (isControlMesh(node.warpMesh)) {
      mesh = { ...node.warpMesh, isCurve };
    } else {
      mesh = createControlMesh(isCurve);
    }
  }

  return {
    perspectiveCorners: null,
    warpMesh: mesh,
    puppetPins: null,
    lastWarpTool: nextTool,
  };
}
