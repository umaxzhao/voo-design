/**
 * Main components and their instances, the Figma way.
 *
 * `extractComponent` turns selected layers into a main component (a frame of
 * its own) and leaves an instance in their place. `detachInstance` is the
 * reverse: it puts the component's layers back into the host as ordinary
 * layers. Both are pure: the editor shell decides where the new frame goes.
 */
import { moveAffectedIds } from "./doc_ops_move.js";
import { createDocument } from "./scene_doc_factory.js";
import { normalizeCornerRadius } from "./scene_model_core.js";
import {
  createCanvasInstanceNode,
  getCanvasType,
} from "./canvas-composition-model.js";
import { applyInstanceOverrides } from "./instance-overrides.js";
import {
  getInstanceCamera,
  getInstanceView,
  hasInstanceView,
} from "./instance-view.js";

const newId = () => globalThis.crypto.randomUUID();

/** Points that reference other layers, so a copy can be rewired. */
const REFERENCE_FIELDS = Object.freeze(["parentId", "clipTo"]);

const TEXT_CHAR_WIDTH = 0.6;
const TEXT_LINE_HEIGHT = 1.2;

function cameraRotationDelta(base, camera) {
  const angles = ({ position, target }) => {
    const x = position.x - target.x;
    const y = position.y - target.y;
    const z = position.z - target.z;
    return {
      yaw: (Math.atan2(x, z) * 180) / Math.PI,
      pitch: (Math.atan2(-y, Math.hypot(x, z)) * 180) / Math.PI,
    };
  };
  const from = angles(base);
  const to = angles(camera);
  return { yaw: to.yaw - from.yaw, pitch: to.pitch - from.pitch };
}

/**
 * The box a layer occupies. Auto-sized text may not carry a measured size, so
 * it is estimated from its font size; anything else needs a real size.
 */
function boxOf(node) {
  if (node.kind === "group") return null;
  if (node.width > 0 && node.height > 0) return node;
  if (node.kind !== "text") return null;
  const lines = String(node.text ?? "").split("\n");
  const fontSize = node.fontSize || 16;
  const widest = Math.max(1, ...lines.map((line) => line.length));
  return {
    x: node.x,
    y: node.y,
    width:
      node.boxWidth > 0 ? node.boxWidth : widest * fontSize * TEXT_CHAR_WIDTH,
    height: lines.length * fontSize * (node.lineHeight || TEXT_LINE_HEIGHT),
  };
}

function unionBounds(nodes) {
  const boxes = nodes.map(boxOf).filter(Boolean);
  if (boxes.length === 0) return null;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Turn the selected layers (and everything that travels with them: group
 * children, clipped layers) into a main component.
 *
 * @returns {{ master: object, instance: object, doc: object }}
 */
export function extractComponent(hostDoc, selectedIds, { name }) {
  const hostType = getCanvasType(hostDoc);
  const ids = new Set(moveAffectedIds(hostDoc, selectedIds));
  if (ids.size === 0) throw new RangeError("Select at least one layer");
  const members = hostDoc.nodes.filter((node) => ids.has(node.id));
  const bounds = unionBounds(members);
  if (!bounds) throw new RangeError("The selection has no visible area");

  const width = Math.max(1, Math.round(bounds.width));
  const height = Math.max(1, Math.round(bounds.height));
  const frame = createDocument(width, height, "transparent", {
    canvasType: hostType,
  });
  const master = {
    ...frame,
    nodes: members.map((node) => ({
      ...node,
      x: node.x - bounds.x,
      y: node.y - bounds.y,
    })),
  };
  const instance = createCanvasInstanceNode({
    sourceCanvasId: master.canvasId,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    name,
  });
  // The instance takes the place of the lowest selected layer.
  const insertAt = hostDoc.nodes.findIndex((node) => ids.has(node.id));
  const rest = hostDoc.nodes.filter((node) => !ids.has(node.id));
  const before = hostDoc.nodes
    .slice(0, insertAt)
    .filter((node) => !ids.has(node.id)).length;
  const nodes = [...rest.slice(0, before), instance, ...rest.slice(before)];
  return { master, instance, doc: { ...hostDoc, nodes } };
}

/** How a component's frame is laid into its instance's box. */
export function instanceFit(sourceDoc, instanceNode) {
  const sourceWidth = Math.max(1, sourceDoc.width || 1);
  const sourceHeight = Math.max(1, sourceDoc.height || 1);
  const scaleX = instanceNode.width / sourceWidth;
  const scaleY = instanceNode.height / sourceHeight;
  if (instanceNode.instance?.layoutMode === "fill") {
    return { scaleX, scaleY, left: 0, top: 0 };
  }
  const scale = Math.min(scaleX, scaleY);
  return {
    scaleX: scale,
    scaleY: scale,
    left: (instanceNode.width - sourceWidth * scale) / 2,
    top: (instanceNode.height - sourceHeight * scale) / 2,
  };
}

function mapTrack(track, fit, origin) {
  const map = {
    x: (value) => origin.x + value * fit.scaleX,
    y: (value) => origin.y + value * fit.scaleY,
    width: (value) => value * fit.scaleX,
    height: (value) => value * fit.scaleY,
  }[track.property];
  if (!map) return track;
  return {
    ...track,
    keyframes: track.keyframes.map((frame) => ({
      ...frame,
      value: map(frame.value),
    })),
  };
}

/**
 * Replace an instance with the component's layers, placed and scaled as the
 * instance drew them. An instance's own view (3D) becomes the objects'
 * rotation.
 */
export function detachInstance(hostDoc, instanceId, componentDoc) {
  const instanceNode = hostDoc.nodes.find((node) => node.id === instanceId);
  if (instanceNode?.kind !== "canvasInstance")
    throw new TypeError("Only an instance can be detached");
  if (!componentDoc || !Array.isArray(componentDoc.nodes))
    throw new TypeError("The main component is not available");
  // What the instance drew, overrides included, is what stays behind.
  const sourceDoc = applyInstanceOverrides(componentDoc, instanceNode.instance);
  const fit = instanceFit(sourceDoc, instanceNode);
  const origin = {
    x: instanceNode.x + fit.left,
    y: instanceNode.y + fit.top,
  };
  const uniform = Math.min(fit.scaleX, fit.scaleY);
  const idMap = new Map(sourceDoc.nodes.map((node) => [node.id, newId()]));
  const view = hasInstanceView(instanceNode.instance)
    ? getInstanceView(instanceNode.instance)
    : null;
  const camera = getInstanceCamera(instanceNode.instance);
  const baseCamera = componentDoc.scene3d?.camera;
  const cameraDelta =
    camera && baseCamera ? cameraRotationDelta(baseCamera, camera) : null;
  const cameraZoom = camera && baseCamera ? camera.zoom / baseCamera.zoom : 1;
  const projectCameraPoint = (x, y) =>
    camera && baseCamera
      ? {
          x: baseCamera.target.x + (x - camera.target.x) * cameraZoom,
          y: baseCamera.target.y + (y - camera.target.y) * cameraZoom,
        }
      : { x, y };

  const copies = sourceDoc.nodes.map((node) => {
    const cameraPoint = projectCameraPoint(node.x, node.y);
    const copy = {
      ...node,
      id: idMap.get(node.id),
      x: origin.x + cameraPoint.x * fit.scaleX,
      y: origin.y + cameraPoint.y * fit.scaleY,
      width: node.width * fit.scaleX * cameraZoom,
      height: node.height * fit.scaleY * cameraZoom,
    };
    for (const field of REFERENCE_FIELDS) {
      if (node[field]) copy[field] = idMap.get(node[field]) ?? null;
    }
    if (Number.isFinite(node.fontSize)) copy.fontSize = node.fontSize * uniform;
    if (Number.isFinite(node.strokeWidth))
      copy.strokeWidth = node.strokeWidth * uniform;
    if (Number.isFinite(node.cornerRadius)) {
      copy.cornerRadius = node.cornerRadius * uniform;
    } else if (node.cornerRadius && typeof node.cornerRadius === "object") {
      copy.cornerRadius = normalizeCornerRadius(
        Object.fromEntries(
          ["tl", "tr", "br", "bl"].map((corner) => [
            corner,
            Number.isFinite(node.cornerRadius[corner])
              ? node.cornerRadius[corner] * uniform
              : 0,
          ]),
        ),
      );
    }
    if (node.spatial) {
      copy.spatial = {
        ...node.spatial,
        ...(Number.isFinite(node.spatial.z)
          ? { z: node.spatial.z * uniform }
          : {}),
      };
    }
    if (Array.isArray(node.animations))
      copy.animations = node.animations.map((track) =>
        mapTrack(track, fit, origin),
      );
    // Only top-level layers carry the instance's own opacity and visibility.
    if (!node.parentId) {
      copy.opacity = (node.opacity ?? 1) * (instanceNode.opacity ?? 1);
      if (instanceNode.visible === false) copy.visible = false;
    }
    if (
      (view || cameraDelta) &&
      (node.kind === "mesh3d" || node.kind === "model3d")
    ) {
      copy.spatial = {
        ...copy.spatial,
        rotationX:
          (copy.spatial?.rotationX ?? 0) +
          (view?.rotationX ?? 0) +
          (cameraDelta?.pitch ?? 0),
        rotationY:
          (copy.spatial?.rotationY ?? 0) +
          (view?.rotationY ?? 0) +
          (cameraDelta?.yaw ?? 0),
      };
      copy.rotation = (node.rotation ?? 0) + (view?.rotationZ ?? 0);
    }
    return copy;
  });

  const at = hostDoc.nodes.findIndex((node) => node.id === instanceId);
  const nodes = [
    ...hostDoc.nodes.slice(0, at),
    ...copies,
    ...hostDoc.nodes.slice(at + 1),
  ];
  const topLevelIds = copies.filter((copy) => !copy.parentId).map((c) => c.id);
  return { doc: { ...hostDoc, nodes }, ids: topLevelIds };
}

/** Which main components a frame uses, and how many instances of each. */
export function countInstances(docs) {
  const counts = new Map();
  for (const doc of docs) {
    for (const node of doc?.nodes ?? []) {
      if (node.kind !== "canvasInstance") continue;
      counts.set(
        node.sourceCanvasId,
        (counts.get(node.sourceCanvasId) ?? 0) + 1,
      );
    }
  }
  return counts;
}
