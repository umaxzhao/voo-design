/** Coordinates shared by the editor, the WebGL viewport, and camera controls. */
import {
  createDefaultScene3d,
  getNodeSpatial,
} from "./canvas-composition-model.js";
import { evaluateLinearArrayModifiers } from "./scene-linear-array.js";
import { isEvaluatedFrame } from "./scene-evaluated-frame.js";

const VISIBLE_KINDS = new Set([
  "rect",
  "ellipse",
  "path",
  "boolean",
  "text",
  "image",
  "video",
  "model3d",
  "mesh3d",
  "canvasInstance",
]);

/** Front-on transparent camera aligned pixel-for-pixel with the 2D page. */
export function projectSceneToXY(doc) {
  const camera = createDefaultScene3d(doc.width, doc.height).camera;
  // The 3D camera frames 60% of the page height on each side. A 1.2 zoom
  // reduces that span to exactly half the page height, matching Canvas2D.
  return {
    ...doc,
    scene3d: {
      ...doc.scene3d,
      backgroundColor: "transparent",
      camera: { ...camera, zoom: 1.2 },
    },
  };
}

export function editorPointToWorld(point, doc) {
  return {
    x: point.x - doc.width / 2,
    y: doc.height / 2 - point.y,
    z: point.z ?? 0,
  };
}

export function worldPointToEditor(point, doc) {
  return {
    x: point.x + doc.width / 2,
    y: doc.height / 2 - point.y,
    z: point.z,
  };
}

export function getNodeWorldTransform(node, doc) {
  const spatial = getNodeSpatial(node);
  const modelRotation = node.kind === "model3d" ? node.model?.rotation : null;
  const modelAxis = (axis) =>
    Number.isFinite(modelRotation?.[axis]) ? modelRotation[axis] : 0;
  const position = editorPointToWorld(
    {
      x: spatial.x + spatial.width / 2,
      y: spatial.y + spatial.height / 2,
      z: spatial.z,
    },
    doc,
  );
  return {
    position,
    // Editor Y is down. Reflecting it changes the sign of X and Z rotations.
    rotation: {
      x: -(spatial.rotationX + modelAxis("x")),
      y: spatial.rotationY + modelAxis("y"),
      z: -(spatial.rotationZ + modelAxis("z")),
    },
    width: Math.max(1, spatial.width),
    height: Math.max(1, spatial.height),
  };
}

export function getRenderableSceneNodes(doc) {
  // Only an authenticated evaluated frame (via private WeakSet) is considered already evaluated.
  // For canonical documents (or unauthenticated frames), doc.modifiers must be evaluated.
  const authenticatedEvaluated = isEvaluatedFrame(doc);
  const nodes =
    !authenticatedEvaluated && doc?.modifiers !== undefined
      ? evaluateLinearArrayModifiers(doc?.nodes ?? [], doc.modifiers)
      : (doc?.nodes ?? []);
  return nodes.filter(
    (node) => VISIBLE_KINDS.has(node.kind) && node.visible !== false && node.id,
  );
}

export function getSceneNodeTree(doc) {
  const nodes = doc?.nodes ?? [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const children = new Map();
  const roots = [];
  for (const node of nodes) {
    if (!node.id || node.kind === "region") continue;
    const parentId = node.parentId;
    if (
      parentId &&
      parentId !== node.id &&
      byId.get(parentId)?.kind === "group"
    ) {
      const siblings = children.get(parentId) ?? [];
      siblings.push(node);
      children.set(parentId, siblings);
    } else {
      roots.push(node);
    }
  }
  const visit = (entries, ancestors = new Set()) =>
    [...entries].reverse().map((node) => ({
      node,
      children:
        node.kind === "group" && !ancestors.has(node.id)
          ? visit(children.get(node.id) ?? [], new Set([...ancestors, node.id]))
          : [],
    }));
  return visit(roots);
}
