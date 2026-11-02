/**
 * Pure evaluation and validation routines for 2D/3D Linear Array modifiers.
 *
 * Contract:
 * - Single source node, referenced by targetId.
 * - count is the total number of displayed instances including the source (count >= 1).
 *   When count === 1, only the original source is evaluated/displayed.
 * - Local step offset: step.x, step.y, and optional step.z for 3D/spatial nodes.
 *   For pure 2D nodes, step.z must be 0 (fail-fast if non-zero step.z applied to 2D-only node).
 * - Stable instance identification:
 *   modifierId is persistent.
 *   Slot indices i = 1 .. (count - 1) generate stable IDs `${sourceId}__arr_${modifierId}_s${i}`.
 *   Slot identity does not re-number existing slots if count is decreased and increased again.
 * - Pure non-destructive evaluation: returns expanded nodes during evaluation without mutating doc.nodes.
 * - Source properties (model.rotation, model.scale, native source geometry, etc.) are preserved.
 * - Fail-fast on invalid parameters, cycles, missing sources, conflicting modifier IDs.
 */

export {
  MODIFIER_TYPE,
  validateLinearArrayModifier,
  getLinearArraySlotId,
  normalizeLinearArrayModifier,
  validateAndNormalizeModifierCollection,
  validateModifierPatch,
} from "./scene-linear-array-validation.js";

import {
  MODIFIER_TYPE,
  getLinearArraySlotId,
  validateAndNormalizeModifierCollection,
} from "./scene-linear-array-validation.js";
import { evaluateGridArrayForNode } from "./scene-grid-array.js";
import { evaluateCircularArrayForNode } from "./scene-circular-array.js";

/**
 * Pure evaluation: evaluates linear array modifiers on a list of document nodes.
 *
 * @param {Array<object>} nodes - Document canonical nodes.
 * @param {Array<object>} modifiers - Document modifiers list (or doc.modifiers).
 * @returns {Array<object>} Expanded nodes array with derived array instances.
/**
 * Computes 3D local step offset transformed into editor space coordinates.
 * In VOO:
 * - spatial rotation is in degrees: spatial.rotationX, spatial.rotationY, node.rotation (Z).
 * - model3d adds model.rotation.x, model.rotation.y, model.rotation.z.
 * - In Three.js world space (see getNodeWorldTransform in three-scene-model.js):
 *   worldRotX = -(spatial.rotationX + modelRotX)
 *   worldRotY = (spatial.rotationY + modelRotY)
 *   worldRotZ = -(spatial.rotationZ + modelRotZ)
 *   World space has Y up, whereas Editor space has Y down (editorY = -worldY).
 *   Therefore, local vector (stepX, stepY, stepZ) rotated by world Euler (worldRotX, worldRotY, worldRotZ, "XYZ")
 *   yields (dx_world, dy_world, dz_world).
 *   Converting back to editor displacement: dx_editor = dx_world, dy_editor = -dy_world, dz_editor = dz_world.
 */
export function computeStep3D(step, slot, node) {
  const localX = (step.x ?? 0) * slot;
  const localY = (step.y ?? 0) * slot;
  const localZ = (step.z ?? 0) * slot;

  const spatial = node.spatial ?? {};
  const rotX = Number.isFinite(spatial.rotationX) ? spatial.rotationX : 0;
  const rotY = Number.isFinite(spatial.rotationY) ? spatial.rotationY : 0;
  const rotZ = Number.isFinite(node.rotation) ? node.rotation : 0;

  const modelRot = node.kind === "model3d" ? node.model?.rotation : null;
  const mRotX = Number.isFinite(modelRot?.x) ? modelRot.x : 0;
  const mRotY = Number.isFinite(modelRot?.y) ? modelRot.y : 0;
  const mRotZ = Number.isFinite(modelRot?.z) ? modelRot.z : 0;

  const totalRotX = rotX + mRotX;
  const totalRotY = rotY + mRotY;
  const totalRotZ = rotZ + mRotZ;

  if (
    Math.abs(totalRotX) < 1e-6 &&
    Math.abs(totalRotY) < 1e-6 &&
    Math.abs(totalRotZ) < 1e-6
  ) {
    return { dx: localX, dy: localY, dz: localZ };
  }

  // World Euler angles (deg to rad, with Y reflection signs)
  const degToRad = Math.PI / 180;
  const eulerX = -totalRotX * degToRad;
  const eulerY = totalRotY * degToRad;
  const eulerZ = -totalRotZ * degToRad;

  // Local step vector in object frame (where local Y is up in 3D object space):
  // Since editor step has step.y down, in standard 3D object frame local_y_obj = -localY.
  const localVec = {
    x: localX,
    y: -localY,
    z: localZ,
  };

  // Rotate by Euler angles (order XYZ, matching Three.js Euler.applyMatrix4 / makeRotationFromEuler):
  const cA = Math.cos(eulerX);
  const sA = Math.sin(eulerX);
  const cB = Math.cos(eulerY);
  const sB = Math.sin(eulerY);
  const cC = Math.cos(eulerZ);
  const sC = Math.sin(eulerZ);

  const m00 = cB * cC;
  const m01 = -cB * sC;
  const m02 = sB;

  const m10 = sA * sB * cC + cA * sC;
  const m11 = -sA * sB * sC + cA * cC;
  const m12 = -sA * cB;

  const m20 = -cA * sB * cC + sA * sC;
  const m21 = cA * sB * sC + sA * cC;
  const m22 = cA * cB;

  const vx = localVec.x;
  const vy = localVec.y;
  const vz = localVec.z;

  const xWorld = m00 * vx + m01 * vy + m02 * vz;
  const yWorld = m10 * vx + m11 * vy + m12 * vz;
  const zWorld = m20 * vx + m21 * vy + m22 * vz;

  // Convert back to editor displacement: dy_editor = -yWorld
  return {
    dx: xWorld,
    dy: -yWorld,
    dz: zWorld,
  };
}

/**
 * Pure evaluation: evaluates linear array modifiers on a list of document nodes.
 *
 * @param {Array<object>} nodes - Document canonical nodes.
 * @param {Array<object>} modifiers - Document modifiers list (or doc.modifiers).
 * @returns {Array<object>} Expanded nodes array with derived array instances.
 */
export function evaluateLinearArrayModifiers(nodes, modifiers = []) {
  if (!Array.isArray(nodes)) {
    throw new TypeError("Nodes must be an array");
  }
  if (modifiers === null) {
    throw new TypeError("Modifiers collection cannot be null");
  }
  if (modifiers === undefined) {
    return nodes;
  }
  if (!Array.isArray(modifiers)) {
    throw new TypeError("Modifiers must be an array");
  }
  if (modifiers.length === 0) {
    return nodes;
  }

  // Validate modifier set uniqueness and target existence using single source of truth
  const validatedModifiers = validateAndNormalizeModifierCollection(
    modifiers,
    nodes,
  );
  if (validatedModifiers.length === 0) {
    return nodes;
  }

  const canonicalIds = new Set(nodes.map((n) => n.id));
  const targetModifiers = new Map(
    validatedModifiers.map((m) => [m.targetId, m]),
  );

  let expanded = false;
  const result = [];
  const assignedInstanceIds = new Set(canonicalIds);

  for (const node of nodes) {
    const mod = targetModifiers.get(node.id);
    if (!mod || mod.enabled === false) {
      result.push(node);
      continue;
    }

    if (mod.type === MODIFIER_TYPE.GRID_ARRAY) {
      expanded = true;
      const gridInstances = evaluateGridArrayForNode(
        node,
        mod,
        assignedInstanceIds,
      );
      result.push(...gridInstances);
      continue;
    }

      if (mod.type === MODIFIER_TYPE.CIRCULAR_ARRAY) {
        if (mod.count > 1) expanded = true;
        result.push(...evaluateCircularArrayForNode(node, mod, assignedInstanceIds));
        continue;
      }

    result.push(node);
    if (mod.count <= 1) {
      continue;
    }

    expanded = true;
    const { count, step, id: modifierId } = mod;
    const is3d = Boolean(
      node.spatial ||
      node.model ||
      node.geometry ||
      node.is3d ||
      node.kind === "threeScene" ||
      node.kind === "model3d" ||
      node.kind === "mesh3d",
    );

    // 2D Rotation setup
    const rotDeg = Number.isFinite(node.rotation) ? node.rotation : 0;
    const rotRad = (rotDeg * Math.PI) / 180;
    const cosTheta = Math.cos(rotRad);
    const sinTheta = Math.sin(rotRad);

    for (let slot = 1; slot < count; slot++) {
      const instanceId = getLinearArraySlotId(node.id, modifierId, slot);
      if (assignedInstanceIds.has(instanceId)) {
        throw new TypeError(
          `Derived instance ID collision: "${instanceId}" already exists in document`,
        );
      }
      assignedInstanceIds.add(instanceId);

      let offsetX, offsetY, offsetZ;
      if (is3d) {
        const d3 = computeStep3D(step, slot, node);
        offsetX = d3.dx;
        offsetY = d3.dy;
        offsetZ = d3.dz;
      } else {
        if (Math.abs(rotDeg) > 1e-6) {
          const localX = step.x * slot;
          const localY = step.y * slot;
          offsetX = localX * cosTheta - localY * sinTheta;
          offsetY = localX * sinTheta + localY * cosTheta;
        } else {
          offsetX = step.x * slot;
          offsetY = step.y * slot;
        }
        offsetZ = (step.z ?? 0) * slot;
      }

      // Clone node and apply translation
      const instance = {
        ...node,
        id: instanceId,
        x: node.x + offsetX,
        y: node.y + offsetY,
        // Mark as derived instance with source linkage
        arrayInstance: {
          modifierId,
          sourceId: node.id,
          slot,
        },
      };

      // If node has 3D spatial properties or 3D offset, advance spatial coordinates
      if (node.spatial || Math.abs(offsetZ) > 1e-9) {
        const curZ = node.spatial?.z ?? 0;
        instance.spatial = {
          ...(node.spatial ?? {}),
          z: curZ + offsetZ,
        };
      }

      result.push(instance);
    }
  }

  return expanded ? result : nodes;
}
