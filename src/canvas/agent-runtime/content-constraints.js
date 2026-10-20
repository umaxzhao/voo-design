/**
 * Content constraints and fine-grained lock semantics for agent operations.
 *
 * Provides pure validation and summary routines for document nodes under
 * partial or full locks (locked, lockPosition, lockImagePixels, lockTransparency).
 *
 * Pure logic — zero React dependencies.
 *
 * @module agent-runtime/content-constraints
 */

import { isLockedByGroup } from "../editor/scene_model_groups.js";
import { layerDisplayName } from "../editor/command_table/helpers.js";

/**
 * Attributes that constitute spatial/geometric position changes.
 */
export const POSITION_PROPERTIES = Object.freeze(
  new Set(["x", "y", "rotation", "scaleX", "scaleY", "points", "boxWidth"]),
);

/**
 * Attributes that constitute dimensional sizing changes.
 */
export const DIMENSION_PROPERTIES = Object.freeze(
  new Set(["width", "height", "w", "h"]),
);

/**
 * Attributes that mutate bitmap pixel content or trigger bitmap regeneration.
 */
export const PIXEL_PROPERTIES = Object.freeze(
  new Set(["imageId", "dataUrl", "bitmap", "src", "pixels"]),
);

/**
 * Custom error class for layer lock constraint violations.
 */
export class LayerLockError extends Error {
  /**
   * @param {string} code - "LAYER_LOCKED"
   * @param {string} message - Human-readable violation message
   * @param {Object} details - Structured violation details
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = "LayerLockError";
    this.code = code;
    this.targetId = details.targetId ?? null;
    this.targetName = details.targetName ?? null;
    this.lockType = details.lockType ?? "locked";
    this.attemptedProperties = details.attemptedProperties ?? [];
    this.missing = { layer: ["unlocked"] };
    this.suggestion = {
      tool: null,
      args: {},
      note: `Ask the user to unlock ${details.targetName || "the layer"} (or its ${details.lockType}) in the layers panel, then retry.`,
    };
  }
}

/**
 * Inspects a patch against a node's lock state.
 *
 * Rules:
 * 1. Fully locked (node.locked or group locked): refuses ALL mutations (except harmless no-ops).
 * 2. Position locked (node.lockPosition): refuses geometric moves (x, y, rotation, points, etc.)
 *    and dimension changes (width, height), but PERMITS styling/content changes (e.g. text,
 *    fontSize, fill, color, opacity, fontFamily).
 * 3. Pixel locked (node.lockImagePixels): refuses pixel buffer / imageId replacement,
 *    but PERMITS metadata, styling, positioning, and renaming.
 * 4. Transparency locked (node.lockTransparency): informational for brush/stamp engines.
 *
 * @param {Object} node - Document layer node
 * @param {Object} patch - Proposed property changes
 * @param {Object} [doc=null] - Document (for checking inherited group lock)
 * @returns {{ allowed: boolean, violation?: string, lockType?: string, properties?: string[] }}
 */
export function checkPatchLockViolation(node, patch, doc = null) {
  if (!node || !patch || typeof patch !== "object") {
    return { allowed: true };
  }

  const patchKeys = Object.keys(patch);
  if (patchKeys.length === 0) {
    return { allowed: true };
  }

  // 1. Full Lock Check (node.locked or locked by ancestor folder)
  const isFullLocked =
    Boolean(node.locked) || (doc ? isLockedByGroup(doc, node) : false);
  const targetLabel = node.id
    ? `"${layerDisplayName(node)}" (${node.id})`
    : `"${layerDisplayName(node)}"`;
  if (isFullLocked) {
    return {
      allowed: false,
      lockType: "locked",
      violation: `Layer ${targetLabel} is fully locked and cannot be modified.`,
      properties: patchKeys,
    };
  }

  // 2. Position Lock Check (node.lockPosition)
  if (node.lockPosition) {
    const forbiddenPosKeys = patchKeys.filter(
      (key) => POSITION_PROPERTIES.has(key) || DIMENSION_PROPERTIES.has(key),
    );
    if (forbiddenPosKeys.length > 0) {
      return {
        allowed: false,
        lockType: "lockPosition",
        violation: `Layer ${targetLabel} has its position locked; cannot modify [${forbiddenPosKeys.join(", ")}].`,
        properties: forbiddenPosKeys,
      };
    }
  }

  // 3. Pixel Lock Check (node.lockImagePixels)
  if (node.lockImagePixels) {
    const forbiddenPixelKeys = patchKeys.filter((key) =>
      PIXEL_PROPERTIES.has(key),
    );
    if (forbiddenPixelKeys.length > 0) {
      return {
        allowed: false,
        lockType: "lockImagePixels",
        violation: `Layer ${targetLabel} has its pixels locked; cannot replace or alter bitmap pixels [${forbiddenPixelKeys.join(", ")}].`,
        properties: forbiddenPixelKeys,
      };
    }
  }

  return { allowed: true };
}

/**
 * Asserts that a proposed patch does not violate the target layer's lock constraints.
 * Throws a structured LayerLockError if violated.
 *
 * @param {Object} node
 * @param {Object} patch
 * @param {Object} [doc=null]
 * @throws {LayerLockError}
 */
export function assertPatchAllowed(node, patch, doc = null) {
  const result = checkPatchLockViolation(node, patch, doc);
  if (!result.allowed) {
    throw new LayerLockError("LAYER_LOCKED", result.violation, {
      targetId: node?.id,
      targetName: layerDisplayName(node),
      lockType: result.lockType,
      attemptedProperties: result.properties,
    });
  }
}

/**
 * Extracts a read-only constraints summary from the document for agent awareness.
 * Used by get_editor_context and agent context assemblies.
 *
 * @param {Object} doc - Current editor document
 * @returns {{
 *   lockedLayers: Array<{ id: string, name: string, kind: string, lockTypes: string[] }>,
 *   hasLockedLayers: boolean,
 *   allowsExplorationOn: string[]
 * }}
 */
export function extractEditorConstraintsSummary(doc) {
  if (!doc || !Array.isArray(doc.nodes)) {
    return {
      lockedLayers: [],
      hasLockedLayers: false,
      allowsExplorationOn: ["all"],
    };
  }

  const lockedLayers = [];

  for (const node of doc.nodes) {
    if (!node) continue;
    const lockTypes = [];
    if (node.locked || isLockedByGroup(doc, node)) lockTypes.push("locked");
    if (node.lockPosition) lockTypes.push("lockPosition");
    if (node.lockImagePixels) lockTypes.push("lockImagePixels");
    if (node.lockTransparency) lockTypes.push("lockTransparency");

    if (lockTypes.length > 0) {
      lockedLayers.push({
        id: node.id,
        name: layerDisplayName(node),
        kind: node.kind ?? "unknown",
        lockTypes,
      });
    }
  }

  const allowsExplorationOn =
    lockedLayers.length > 0
      ? ["unlocked_layers", "unlocked_backgrounds", "unlocked_copy"]
      : ["all"];

  return {
    lockedLayers,
    hasLockedLayers: lockedLayers.length > 0,
    allowsExplorationOn,
  };
}
