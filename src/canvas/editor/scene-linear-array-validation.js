/**
 * Scene Linear Array Validation & Normalization Module.
 *
 * Single source of truth for structural integrity of linear array modifiers.
 * Enforces fail-fast semantics:
 * - modifier set validation (no explicit null, must be array, no null elements)
 * - unsupported modifier types rejected
 * - target existence required (no silent drop)
 * - modifier ID uniqueness
 * - single modifier per target
 * - ID collision checks (canonical node IDs and derived slot IDs)
 * - count >= 1 and finite numeric step coordinates
 * - 2D vs 3D type safety (step.z must be 0 for purely 2D targets)
 * - immutable identity fields on updates (id, targetId, type)
 */

import {
  GRID_MODIFIER_TYPE,
  normalizeGridArrayModifier,
  getGridArrayCellId,
} from "./scene-grid-array.js";
import {
  CIRCULAR_MODIFIER_TYPE,
  normalizeCircularArrayModifier,
  getCircularArraySlotId,
} from "./scene-circular-array-validation.js";

export const MODIFIER_TYPE = Object.freeze({
  LINEAR_ARRAY: "linearArray",
  GRID_ARRAY: GRID_MODIFIER_TYPE,
  CIRCULAR_ARRAY: CIRCULAR_MODIFIER_TYPE,
});

/**
 * Validates a single modifier object against its target node.
 * Throws TypeError if invalid.
 */
export function validateLinearArrayModifier(modifier, targetNode = null) {
  if (modifier?.enabled !== undefined && typeof modifier.enabled !== "boolean") {
    throw new TypeError("Modifier enabled must be a boolean");
  }
  if (!modifier || typeof modifier !== "object" || Array.isArray(modifier)) {
    throw new TypeError("Modifier configuration must be an object");
  }
  if (modifier.type !== MODIFIER_TYPE.LINEAR_ARRAY) {
    throw new TypeError(`Unsupported modifier type: ${modifier.type}`);
  }
  if (typeof modifier.id !== "string" || !modifier.id.trim()) {
    throw new TypeError("Modifier id must be a non-empty string");
  }
  if (typeof modifier.targetId !== "string" || !modifier.targetId.trim()) {
    throw new TypeError("Modifier targetId must be a non-empty string");
  }
  if (
    !Number.isInteger(modifier.count) ||
    modifier.count < 1 ||
    !Number.isFinite(modifier.count)
  ) {
    throw new TypeError("Modifier count must be an integer >= 1");
  }

  const step = modifier.step;
  if (!step || typeof step !== "object" || Array.isArray(step)) {
    throw new TypeError("Modifier step must be an object { x, y, z? }");
  }
  if (!Number.isFinite(step.x) || !Number.isFinite(step.y)) {
    throw new TypeError("Modifier step.x and step.y must be finite numbers");
  }
  const z = step.z !== undefined ? step.z : 0;
  if (!Number.isFinite(z)) {
    throw new TypeError("Modifier step.z must be a finite number if provided");
  }

  // 2D vs 3D fail-fast check:
  // If targetNode is known and is purely 2D (no spatial, model, geometry, or 3d flag) and z !== 0
  const is3dCapable = targetNode
    ? Boolean(
        targetNode.spatial ||
          targetNode.model ||
          targetNode.geometry ||
          targetNode.is3d ||
          targetNode.kind === "threeScene" ||
          targetNode.kind === "model3d" ||
          targetNode.kind === "mesh3d",
      )
    : true;

  if (targetNode && !is3dCapable && Math.abs(z) > 1e-9) {
    throw new TypeError(
      `Cannot apply 3D z-offset (${z}) to 2D target node "${targetNode.id}"`,
    );
  }

  // Validate optional animations array:
  // Only spacing properties ('step.x', 'step.y', 'step.z') may be animated.
  // Counts remain strictly static.
  // 2D targets fail fast if animating 'step.z'.
  if (modifier.animations !== undefined) {
    if (!Array.isArray(modifier.animations)) {
      throw new TypeError("Modifier animations must be an array");
    }
    const allowedProperties = new Set(["step.x", "step.y", "step.z"]);
    for (const track of modifier.animations) {
      if (!track || typeof track !== "object" || Array.isArray(track)) {
        throw new TypeError("Animation track must be an object");
      }
      if (!allowedProperties.has(track.property)) {
        throw new TypeError(
          `Cannot animate non-spacing modifier property "${track.property}". Counts remain static.`,
        );
      }
      if (track.property === "step.z" && targetNode && !is3dCapable) {
        throw new TypeError(
          `Cannot animate 3D step.z on 2D target node "${targetNode.id}"`,
        );
      }
      if (!Array.isArray(track.keyframes)) {
        throw new TypeError("Animation track keyframes must be an array");
      }
      for (const kf of track.keyframes) {
        if (!kf || typeof kf !== "object") {
          throw new TypeError("Keyframe must be an object");
        }
        if (!Number.isFinite(kf.time) || kf.time < 0 || !Number.isFinite(kf.value)) {
          throw new TypeError(
            "Keyframes require finite non-negative time and numeric value",
          );
        }
      }
    }
  }

  return true;
}

/**
 * Builds the canonical stable instance ID for a given slot.
 * slotIndex must be integer >= 1.
 */
export function getLinearArraySlotId(sourceId, modifierId, slotIndex) {
  if (typeof sourceId !== "string" || !sourceId) {
    throw new TypeError("sourceId must be a non-empty string");
  }
  if (typeof modifierId !== "string" || !modifierId) {
    throw new TypeError("modifierId must be a non-empty string");
  }
  if (!Number.isInteger(slotIndex) || slotIndex < 1) {
    throw new TypeError("slotIndex must be an integer >= 1");
  }
  return `${sourceId}__arr_${modifierId}_s${slotIndex}`;
}

/**
 * Normalizes a single linear array modifier object.
 */
export function normalizeLinearArrayModifier(modifier, targetNode = null) {
  validateLinearArrayModifier(modifier, targetNode);
  const normalized = {
    id: modifier.id.trim(),
    type: MODIFIER_TYPE.LINEAR_ARRAY,
    targetId: modifier.targetId.trim(),
    ...(modifier.enabled !== undefined ? { enabled: modifier.enabled } : {}),
    count: modifier.count,
    step: {
      x: modifier.step.x,
      y: modifier.step.y,
      z: modifier.step.z !== undefined ? modifier.step.z : 0,
    },
  };
  if (Array.isArray(modifier.animations) && modifier.animations.length > 0) {
    normalized.animations = modifier.animations.map((track) => ({
      property: track.property,
      keyframes: [...track.keyframes]
        .map((kf) => ({
          time: kf.time,
          value: kf.value,
          ...(kf.easing ? { easing: kf.easing } : {}),
        }))
        .sort((a, b) => a.time - b.time),
    }));
  }
  return normalized;
}

/**
 * Validates and normalizes an entire modifier collection against the document nodes.
 * Fails fast on:
 * - non-array or null collection
 * - null or non-object items
 * - unsupported modifier types
 * - missing target nodes
 * - duplicate modifier IDs
 * - multiple modifiers targeting the same source node
 * - derived slot ID collision with canonical node IDs
 *
 * @param {Array<object>} modifiers - Raw modifier list from doc or serialization
 * @param {Array<object>} nodes - Canonical document nodes
 * @returns {Array<object>} Normalized modifiers
 */
export function validateAndNormalizeModifierCollection(modifiers, nodes = []) {
  if (modifiers === null) {
    throw new TypeError("Modifiers collection cannot be null");
  }
  if (modifiers === undefined) {
    return [];
  }
  if (!Array.isArray(modifiers)) {
    throw new TypeError("doc.modifiers must be an array");
  }
  if (modifiers.length === 0) {
    return [];
  }

  const nodeMap = new Map((nodes || []).map((n) => [n.id, n]));
  const canonicalIds = new Set((nodes || []).map((n) => n.id));
  const seenModIds = new Set();
  const seenTargets = new Set();
  const normalized = [];

  for (let i = 0; i < modifiers.length; i++) {
    const mod = modifiers[i];
    if (!mod || typeof mod !== "object" || Array.isArray(mod)) {
      throw new TypeError(`Modifier at index ${i} must be an object`);
    }

    if (
      mod.type !== MODIFIER_TYPE.LINEAR_ARRAY &&
      mod.type !== MODIFIER_TYPE.GRID_ARRAY &&
      mod.type !== MODIFIER_TYPE.CIRCULAR_ARRAY
    ) {
      throw new TypeError(
        `Unsupported modifier type: "${mod.type}" at index ${i}`,
      );
    }

    const trimmedId = typeof mod.id === "string" ? mod.id.trim() : "";
    if (!trimmedId) {
      throw new TypeError(`Modifier at index ${i} has empty or invalid id`);
    }

    if (seenModIds.has(trimmedId)) {
      throw new TypeError(`Duplicate modifier id detected: "${trimmedId}"`);
    }
    seenModIds.add(trimmedId);

    const targetId =
      typeof mod.targetId === "string" ? mod.targetId.trim() : "";
    if (!targetId) {
      throw new TypeError(
        `Modifier "${trimmedId}" has empty or invalid targetId`,
      );
    }

    const targetNode = nodeMap.get(targetId);
    if (!targetNode) {
      throw new TypeError(
        `Modifier target node not found: "${targetId}" for modifier "${trimmedId}"`,
      );
    }

    if (seenTargets.has(targetId)) {
      throw new TypeError(
        `Multiple linear array modifiers targeting the same node: "${targetId}"`,
      );
    }
    seenTargets.add(targetId);

    const isGrid = mod.type === MODIFIER_TYPE.GRID_ARRAY;
    const isCircular = mod.type === MODIFIER_TYPE.CIRCULAR_ARRAY;
    const norm = isGrid
      ? normalizeGridArrayModifier(mod, targetNode)
      : isCircular
        ? normalizeCircularArrayModifier(mod, targetNode)
        : normalizeLinearArrayModifier(mod, targetNode);

    // Guard against collision of derived slot/cell IDs with canonical node IDs
    if (!isGrid) {
      for (let slot = 1; slot < norm.count; slot++) {
        const slotId = isCircular
          ? getCircularArraySlotId(targetId, norm.id, slot)
          : getLinearArraySlotId(targetId, norm.id, slot);
        if (canonicalIds.has(slotId)) {
          throw new TypeError(
            `Derived slot ID collision: "${slotId}" matches an existing canonical node ID`,
          );
        }
      }
    } else {
      const layers = norm.layers ?? 1;
      for (let l = 0; l < layers; l++) {
        for (let r = 0; r < norm.rows; r++) {
          for (let c = 0; c < norm.cols; c++) {
            if (r === 0 && c === 0 && l === 0) continue;
            const cellId = getGridArrayCellId(targetId, norm.id, r, c, l);
            if (canonicalIds.has(cellId)) {
              throw new TypeError(
                `Derived slot ID collision: "${cellId}" matches an existing canonical node ID`,
              );
            }
          }
        }
      }
    }

    normalized.push(norm);
  }

  return normalized;
}

/**
 * Validates a patch candidate for updating an existing modifier.
 * Ensures immutable identity fields cannot be modified.
 */
export function validateModifierPatch(current, patch, targetNode) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new TypeError("Modifier patch must be an object");
  }

  // Strictly enforce supported patch keys, PER MODIFIER KIND. A patch may only touch properties
  // its own kind actually has, so this stays a whitelist rather than a permissive pass-through.
  const isCircularPatch = current?.type === MODIFIER_TYPE.CIRCULAR_ARRAY;
  const allowedKeys = isCircularPatch
    ? new Set(["enabled", "count", "radius", "startAngle", "arcSpan"])
    : new Set(["enabled", "count", "step", "animations"]);
  for (const key of Object.keys(patch)) {
    if (!allowedKeys.has(key)) {
      throw new TypeError(`Cannot patch unsupported property: "${key}"`);
    }
  }

  if (isCircularPatch) {
    // Circular fields are flat and `animations` is not an allowed key above, so a patch cannot
    // introduce an animation this kind does not support.
    return normalizeCircularArrayModifier({ ...current, ...patch }, targetNode);
  }

  if (patch.step !== undefined) {
    if (
      !patch.step ||
      typeof patch.step !== "object" ||
      Array.isArray(patch.step)
    ) {
      throw new TypeError("Modifier step must be an object");
    }
  }

  const merged = {
    ...current,
    ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    count: patch.count !== undefined ? patch.count : current.count,
    step: {
      ...current.step,
      ...(patch.step ?? {}),
    },
    ...(patch.animations !== undefined
      ? { animations: patch.animations }
      : current.animations !== undefined
        ? { animations: current.animations }
        : {}),
  };

  return normalizeLinearArrayModifier(merged, targetNode);
}
