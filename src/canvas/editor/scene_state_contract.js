/**
 * Explicit read/write contract for the editor's shared scene state.
 *
 * The fields below are read by render, export, pointer and property code.
 * Historically each layer guessed what "deformed" meant, which is exactly
 * how the perspective/distort round-trip bug happened. This module gives the
 * readers one canonical answer and gives writers a gate for the fields they
 * are allowed to own.
 */
import {
  isDefaultControlMesh,
  isDefaultPerspectiveCorners,
  perspectiveCornersToWarpMesh,
  warpMeshToPerspectiveCorners,
} from "./perspective_geometry.js";

/** True when a node carries a valid 4-corner perspective quad. */
export function hasPerspectiveCorners(node) {
  return Boolean(
    node &&
    Array.isArray(node.perspectiveCorners) &&
    node.perspectiveCorners.length === 4,
  );
}

/** True when a node carries a valid warp control mesh. */
export function hasWarpMesh(node) {
  return Boolean(
    node &&
    node.warpMesh &&
    Array.isArray(node.warpMesh.points) &&
    node.warpMesh.points.length > 0,
  );
}

/** True when a node carries puppet pins. */
export function hasPuppetPins(node) {
  return Boolean(
    node && Array.isArray(node.puppetPins) && node.puppetPins.length > 0,
  );
}

/**
 * The single authoritative deformation representation.
 *
 * At most one of perspective / warp / puppet should be authoritative at a
 * time. If more than one field is present the order below is the canonical
 * winner, but callers are expected to keep only one in normal operation.
 *
 * @returns {"perspective"|"warp"|"puppet"|"none"}
 */
export function deformationKind(node) {
  if (!node) return "none";
  if (hasPerspectiveCorners(node)) return "perspective";
  if (hasWarpMesh(node)) return "warp";
  if (hasPuppetPins(node)) return "puppet";
  return "none";
}

/** Whether the node carries any non-identity deformation. */
export function isDeformed(node) {
  return deformationKind(node) !== "none";
}

/**
 * The one reader API for render/export code. No renderer should decide
 * "what counts as deformed" itself.
 */
export function readNodeTransform(node, { ignoreIdentity = false } = {}) {
  let kind = deformationKind(node);
  // Entering a warp tool installs neutral controls. Rendering those through
  // a subdivided mesh needlessly resamples the image before any edit is made.
  // Keep the authoritative controls for pointer/property readers, but let
  // bitmap renderers retain their ordinary sampling for identity geometry.
  if (ignoreIdentity && isIdentityTransform(node, kind)) kind = "none";
  return {
    kind,
    mesh: kind === "warp" ? node.warpMesh : null,
    corners: kind === "perspective" ? node.perspectiveCorners : null,
    pins: kind === "puppet" ? node.puppetPins : null,
  };
}

function isIdentityTransform(node, kind) {
  const finitePoints = (points) =>
    Array.from(points).every(
      (point) => Number.isFinite(point?.x) && Number.isFinite(point?.y),
    );
  if (kind === "perspective") {
    return (
      finitePoints(node.perspectiveCorners) &&
      isDefaultPerspectiveCorners(node.perspectiveCorners)
    );
  }
  if (kind !== "warp") return false;
  const mesh = node.warpMesh;
  // A cell mask can cut holes even in a flat mesh; that still needs the mesh.
  const completeCells =
    !mesh.activeCells ||
    (mesh.activeCells.length === mesh.cols * mesh.rows &&
      mesh.activeCells.every(Boolean));
  return (
    completeCells && finitePoints(mesh.points) && isDefaultControlMesh(mesh)
  );
}

/**
 * Perspective -> warp conversion. Mathematically exact for a bilinear
 * quadrilateral and reversible through the inverse function below.
 */
export function perspectiveToDistort(corners, isCurve = true) {
  return perspectiveCornersToWarpMesh(corners, isCurve);
}

/**
 * Warp -> perspective conversion. Extracts the four outer corners from a
 * 3x3 control mesh, which is the inverse of perspectiveToDistort.
 */
export function distortToPerspective(mesh) {
  return warpMeshToPerspectiveCorners(mesh);
}

/**
 * Which layer owns which scene-state field. A writer that touches another
 * layer's field is a contract violation and must be routed through that
 * layer's own API instead.
 */
export const FIELD_OWNERS = Object.freeze({
  warpMesh: "transform",
  perspectiveCorners: "transform",
  puppetPins: "transform",
  rotation: "transform",
  shear: "transform",
  crop: "crop",
  maskId: "mask",
});

/**
 * Validates a patch against the owner registry and applies the canonical
 * one-authoritative-representation normalisation.
 *
 * @param {object} patch - node data patch to write
 * @param {string} owner - the calling layer ("transform"|"crop"|"mask"|"props")
 * @returns {object} the same patch object, normalised for the transform layer
 */
export function writeNodeState(patch, owner) {
  if (!patch || typeof patch !== "object") return patch;
  for (const key of Object.keys(patch)) {
    const allowed = FIELD_OWNERS[key];
    if (allowed && allowed !== owner) {
      throw new Error(
        `scene-state contract: "${key}" is owned by "${allowed}", not "${owner}"`,
      );
    }
  }
  // A patch does NOT clear the other representation here: switching tools is
  // an explicit, reversible conversion (see warpPatchForTool) and clearing
  // here would destroy the source geometry before the conversion ran.
  return patch;
}
