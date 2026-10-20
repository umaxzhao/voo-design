/**
 * Scene Grid Array Evaluation & Validation Module.
 *
 * Single source of truth for 2D/3D Grid Array modifiers.
 * Contract:
 * - Single source node, referenced by targetId.
 * - rows >= 1, cols >= 1, layers >= 1 (finite integers).
 *   Total count is rows * cols * layers (including canonical source at r0_c0_l0).
 * - Safe integer validation before allocation to prevent memory/overflow attacks.
 * - Local step spacing: step.x (X offset per col), step.y (Y offset per row), step.z (Z offset per layer).
 *   Pure 2D target requires step.z === 0 and layers === 1.
 * - Stable instance identification:
 *   modifierId is persistent.
 *   Cell IDs: `${sourceId}__grid_${modifierId}_r${row}_c${col}_l${layer}`.
 *   Cell coordinate IDs are strictly stable: resizing rows or cols does not re-index other cells.
 * - Pure non-destructive evaluation: returns expanded nodes during evaluation without mutating doc.nodes.
 * - Immutable identity fields on updates (id, targetId, type).
 */

export const GRID_MODIFIER_TYPE = "gridArray";

/**
 * Builds the canonical stable instance ID for a grid cell.
 * row >= 0, col >= 0, layer >= 0.
 * If (row === 0 && col === 0 && layer === 0), returns sourceId.
 */
export function getGridArrayCellId(sourceId, modifierId, row, col, layer = 0) {
  if (typeof sourceId !== "string" || !sourceId.trim()) {
    throw new TypeError("sourceId must be a non-empty string");
  }
  if (typeof modifierId !== "string" || !modifierId.trim()) {
    throw new TypeError("modifierId must be a non-empty string");
  }
  if (!Number.isInteger(row) || row < 0) {
    throw new TypeError("row must be an integer >= 0");
  }
  if (!Number.isInteger(col) || col < 0) {
    throw new TypeError("col must be an integer >= 0");
  }
  if (!Number.isInteger(layer) || layer < 0) {
    throw new TypeError("layer must be an integer >= 0");
  }
  if (row === 0 && col === 0 && layer === 0) {
    return sourceId;
  }
  return `${sourceId}__grid_${modifierId}_r${row}_c${col}_l${layer}`;
}

/**
 * Validates a single grid array modifier object against its target node.
 * Throws TypeError if invalid.
 */
export function validateGridArrayModifier(modifier, targetNode = null) {
  if (!modifier || typeof modifier !== "object" || Array.isArray(modifier)) {
    throw new TypeError("Modifier configuration must be an object");
  }
  if (modifier.type !== GRID_MODIFIER_TYPE) {
    throw new TypeError(`Unsupported modifier type: ${modifier.type}`);
  }
  if (typeof modifier.id !== "string" || !modifier.id.trim()) {
    throw new TypeError("Modifier id must be a non-empty string");
  }
  if (typeof modifier.targetId !== "string" || !modifier.targetId.trim()) {
    throw new TypeError("Modifier targetId must be a non-empty string");
  }

  // Dimension validations
  if (
    !Number.isInteger(modifier.rows) ||
    modifier.rows < 1 ||
    !Number.isFinite(modifier.rows)
  ) {
    throw new TypeError("Modifier rows must be an integer >= 1");
  }
  if (
    !Number.isInteger(modifier.cols) ||
    modifier.cols < 1 ||
    !Number.isFinite(modifier.cols)
  ) {
    throw new TypeError("Modifier cols must be an integer >= 1");
  }
  const layers = modifier.layers !== undefined ? modifier.layers : 1;
  if (!Number.isInteger(layers) || layers < 1 || !Number.isFinite(layers)) {
    throw new TypeError("Modifier layers must be an integer >= 1");
  }

  // Safe integer overflow guard before allocation
  const totalCount = modifier.rows * modifier.cols * layers;
  if (!Number.isSafeInteger(totalCount) || totalCount < 1) {
    throw new TypeError(
      "Modifier grid dimensions exceed safe allocation bounds",
    );
  }

  // Step spacing validations
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

  if (targetNode && !is3dCapable && (Math.abs(z) > 1e-9 || layers > 1)) {
    throw new TypeError(
      `Cannot apply 3D z-offset (${z}) or layers (${layers}) to 2D target node "${targetNode.id}"`,
    );
  }

  // Validate optional animations array:
  // Only spacing properties ('step.x', 'step.y', 'step.z') may be animated.
  // Counts (rows, cols, layers) remain strictly static.
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
 * Normalizes a single grid array modifier object.
 */
export function normalizeGridArrayModifier(modifier, targetNode = null) {
  validateGridArrayModifier(modifier, targetNode);
  const layers = modifier.layers !== undefined ? modifier.layers : 1;
  const normalized = {
    id: modifier.id.trim(),
    type: GRID_MODIFIER_TYPE,
    targetId: modifier.targetId.trim(),
    rows: modifier.rows,
    cols: modifier.cols,
    layers,
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
 * Validates a patch candidate for updating an existing grid array modifier.
 * Ensures immutable identity fields cannot be modified.
 */
export function validateGridModifierPatch(current, patch, targetNode) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new TypeError("Modifier patch must be an object");
  }

  const allowedKeys = new Set(["rows", "cols", "layers", "step", "animations"]);
  for (const key of Object.keys(patch)) {
    if (!allowedKeys.has(key)) {
      throw new TypeError(`Cannot patch unsupported property: "${key}"`);
    }
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
    rows: patch.rows !== undefined ? patch.rows : current.rows,
    cols: patch.cols !== undefined ? patch.cols : current.cols,
    layers: patch.layers !== undefined ? patch.layers : (current.layers ?? 1),
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

  return normalizeGridArrayModifier(merged, targetNode);
}

/**
 * Computes 3D local offset for a grid cell transformed into editor space coordinates.
 */
function computeGridCellOffset3D(step, col, row, layer, node) {
  const localX = (step.x ?? 0) * col;
  const localY = (step.y ?? 0) * row;
  const localZ = (step.z ?? 0) * layer;

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

  const degToRad = Math.PI / 180;
  const eulerX = -totalRotX * degToRad;
  const eulerY = totalRotY * degToRad;
  const eulerZ = -totalRotZ * degToRad;

  const localVec = {
    x: localX,
    y: -localY,
    z: localZ,
  };

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

  return {
    dx: xWorld,
    dy: -yWorld,
    dz: zWorld,
  };
}

/**
 * Pure evaluation: evaluates grid array modifier on a single node and returns all cell instances.
 */
export function evaluateGridArrayForNode(node, mod, assignedInstanceIds) {
  const { rows, cols, layers = 1, step, id: modifierId } = mod;
  if (rows <= 1 && cols <= 1 && layers <= 1) {
    return [node];
  }

  const is3d = Boolean(
    node.spatial ||
    node.model ||
    node.geometry ||
    node.is3d ||
    node.kind === "threeScene" ||
    node.kind === "model3d" ||
    node.kind === "mesh3d",
  );

  const rotDeg = Number.isFinite(node.rotation) ? node.rotation : 0;
  const rotRad = (rotDeg * Math.PI) / 180;
  const cosTheta = Math.cos(rotRad);
  const sinTheta = Math.sin(rotRad);

  const instances = [];

  for (let l = 0; l < layers; l++) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r === 0 && c === 0 && l === 0) {
          instances.push(node);
          continue;
        }

        const instanceId = getGridArrayCellId(node.id, modifierId, r, c, l);
        if (assignedInstanceIds.has(instanceId)) {
          throw new TypeError(
            `Derived instance ID collision: "${instanceId}" already exists in document`,
          );
        }
        assignedInstanceIds.add(instanceId);

        let offsetX, offsetY, offsetZ;
        if (is3d) {
          const d3 = computeGridCellOffset3D(step, c, r, l, node);
          offsetX = d3.dx;
          offsetY = d3.dy;
          offsetZ = d3.dz;
        } else {
          if (Math.abs(rotDeg) > 1e-6) {
            const localX = step.x * c;
            const localY = step.y * r;
            offsetX = localX * cosTheta - localY * sinTheta;
            offsetY = localX * sinTheta + localY * cosTheta;
          } else {
            offsetX = step.x * c;
            offsetY = step.y * r;
          }
          offsetZ = (step.z ?? 0) * l;
        }

        const instance = {
          ...node,
          id: instanceId,
          x: node.x + offsetX,
          y: node.y + offsetY,
          arrayInstance: {
            modifierId,
            sourceId: node.id,
            type: GRID_MODIFIER_TYPE,
            row: r,
            col: c,
            layer: l,
          },
        };

        if (node.spatial || Math.abs(offsetZ) > 1e-9) {
          const curZ = node.spatial?.z ?? 0;
          instance.spatial = {
            ...(node.spatial ?? {}),
            z: curZ + offsetZ,
          };
        }

        instances.push(instance);
      }
    }
  }

  return instances;
}
