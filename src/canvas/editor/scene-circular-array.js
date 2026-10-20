/**
 * Circular array — evaluation into derived instances.
 *
 * Mirrors `evaluateLinearArrayModifiers` so the circular array is a new KIND in the existing modifier
 * architecture rather than a parallel mechanism. It reuses the linear array's local-to-editor mapping
 * (`computeStep3D`) instead of re-deriving the Euler rotation: that mapping is ~60 lines of sign-sensitive
 * matrix work, and a second copy would drift from the first the moment either is touched. This is why the
 * one shared hunk this feature needs is a single `export` on that existing helper — a lawful extraction, not
 * a new behaviour.
 *
 * SLOT MODEL. Slot 0 is the SOURCE: it keeps its own id and is returned untouched at its own coordinates, so
 * the canonical node stays editable and unmoved. Slots 1..count-1 are clones carrying the established
 * `arrayInstance` linkage. `count` includes the source.
 *
 * NO UP-AXIS CHANGE. The 2D path rotates the local offset by the node's own Z rotation, and the 3D path goes
 * through `computeStep3D`, exactly as the linear array does. A circular array is a different arrangement of
 * the same local-offset contract, so it inherits that mapping rather than inventing one.
 *
 * @module scene-circular-array
 */

import {
  CIRCULAR_MODIFIER_TYPE,
  circularSlotOffset,
  getCircularArraySlotId,
} from "./scene-circular-array-validation.js";
import { computeStep3D } from "./scene-linear-array.js";

/** Node kinds whose local offsets live in the 3D object frame rather than the flat editor plane. */
function isSpatialNode(node) {
  return Boolean(
    node.spatial ||
    node.model ||
    node.geometry ||
    node.is3d ||
    node.kind === "threeScene" ||
    node.kind === "model3d" ||
    node.kind === "mesh3d",
  );
}

/**
 * One circular slot's displacement in EDITOR space.
 *
 * `local` is the slot's offset in the target's own frame, already produced by
 * `circularSlotOffset`. Slot 0 is zero by construction, so it needs no transform and is never displaced.
 *
 * @param {{x:number, y:number, z:number}} local
 * @param {object} node the source node
 * @returns {{dx:number, dy:number, dz:number}}
 */
export function circularLocalToEditor(local, node) {
  if (isSpatialNode(node)) {
    // Slot multiplier is 1: `local` is already this slot's own vector. Reusing the linear helper keeps one
    // authoritative implementation of the rotation and of the editor/world Y flip.
    return computeStep3D(local, 1, node);
  }
  const rotDeg = Number.isFinite(node.rotation) ? node.rotation : 0;
  if (Math.abs(rotDeg) > 1e-6) {
    const rotRad = (rotDeg * Math.PI) / 180;
    const cosTheta = Math.cos(rotRad);
    const sinTheta = Math.sin(rotRad);
    return {
      dx: local.x * cosTheta - local.y * sinTheta,
      dy: local.x * sinTheta + local.y * cosTheta,
      dz: local.z ?? 0,
    };
  }
  return { dx: local.x, dy: local.y, dz: local.z ?? 0 };
}

/**
 * Expands one node's circular modifier into the node plus its derived ring clones.
 *
 * @param {object} node the source node
 * @param {object} mod a normalized circular array modifier
 * @param {Set<string>} assignedInstanceIds mutated with every derived id, for collision detection
 * @returns {Array<object>}
 */
export function evaluateCircularArrayForNode(node, mod, assignedInstanceIds) {
  // Slot 0 is the source itself: same id, same coordinates, still editable and unmoved.
  const instances = [node];
  if (mod.count <= 1) {
    return instances;
  }

  const modifierId = mod.id;
  for (let slot = 1; slot <= mod.count - 1; slot += 1) {
    const instanceId = getCircularArraySlotId(node.id, modifierId, slot);
    if (assignedInstanceIds.has(instanceId)) {
      throw new TypeError(
        `Derived instance ID collision: "${instanceId}" already exists in document`,
      );
    }
    assignedInstanceIds.add(instanceId);

    const local = circularSlotOffset(mod, slot);
    const { dx, dy, dz } = circularLocalToEditor(local, node);

    const instance = {
      ...node,
      id: instanceId,
      x: node.x + dx,
      y: node.y + dy,
      // Same linkage shape as the linear array, so selection, undo and persistence treat a circular clone
      // exactly like a linear one.
      arrayInstance: {
        modifierId,
        sourceId: node.id,
        slot,
      },
    };

    if (node.spatial || Math.abs(dz) > 1e-9) {
      const curZ = node.spatial?.z ?? 0;
      instance.spatial = {
        ...(node.spatial ?? {}),
        z: curZ + dz,
      };
    }

    instances.push(instance);
  }
  return instances;
}

/**
 * Expands every circular modifier across a node list.
 *
 * Mirrors `evaluateLinearArrayModifiers`'s contract: non-array nodes and a null collection are faults, an
 * undefined collection means "nothing to do", and the original array is returned when nothing expanded.
 *
 * @param {Array<object>} nodes
 * @param {Array<object>} [modifiers] the full modifier collection; non-circular entries are ignored here
 * @returns {Array<object>}
 */
export function evaluateCircularArrayModifiers(nodes, modifiers = []) {
  if (!Array.isArray(nodes)) {
    throw new TypeError("Nodes must be an array");
  }
  if (modifiers === null) {
    throw new TypeError("Modifiers collection cannot be null");
  }
  if (modifiers === undefined) return nodes;
  if (!Array.isArray(modifiers)) {
    throw new TypeError("Modifiers must be an array");
  }

  const circular = modifiers.filter(
    (m) => m && m.type === CIRCULAR_MODIFIER_TYPE,
  );
  if (circular.length === 0) return nodes;

  const byTarget = new Map(circular.map((m) => [m.targetId, m]));
  const assignedInstanceIds = new Set(nodes.map((n) => n.id));
  const result = [];
  let expanded = false;

  for (const node of nodes) {
    const mod = byTarget.get(node.id);
    if (!mod) {
      result.push(node);
      continue;
    }
    if (mod.count > 1) expanded = true;
    result.push(
      ...evaluateCircularArrayForNode(node, mod, assignedInstanceIds),
    );
  }

  return expanded ? result : nodes;
}
