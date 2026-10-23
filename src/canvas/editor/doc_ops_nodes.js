import { journalNodes, nodesTracked } from "../../engine-wasm/journal.js";
import { hitTestMetadata, orderedCandidates } from "./hit_test_candidates.js";
import {
  createImageNode,
  isGroupNode,
  isHiddenByGroup,
  isLockedByGroup,
  isRegionNode,
  NODE_KIND,
  syncBooleanNode,
} from "./scene_model.js";
import { toNodeLocal } from "./scene_geometry.js";
import { regionLocalPoint } from "./doc_ops_regions.js";
import { projectOntoPath } from "./editor_pen_math.js";

export function withNodes(doc, rawNodes, changes = null) {
  let nodes = rawNodes;
  const booleanContainers = rawNodes?.filter(
    (n) => n.kind === NODE_KIND.BOOLEAN,
  );
  if (booleanContainers && booleanContainers.length > 0) {
    const childrenMap = new Map();
    for (const node of rawNodes) {
      if (node.parentId) {
        if (!childrenMap.has(node.parentId)) childrenMap.set(node.parentId, []);
        childrenMap.get(node.parentId).push(node);
      }
    }
    nodes = rawNodes.map((node) => {
      if (node.kind === NODE_KIND.BOOLEAN) {
        const children = childrenMap.get(node.id);
        if (children && children.length > 0) {
          return syncBooleanNode(node, children);
        }
      }
      return node;
    });
  }
  journalNodes(doc.nodes, nodes, nodes === rawNodes ? changes : null);
  return { ...doc, nodes };
}

/**
 * Merges fields onto the document itself (the crop rect, background colour…)
 * and returns a new document. Unknown keys are carried verbatim, so callers
 * can store any document-level state this way.
 */
export function updateDocument(doc, patch) {
  return { ...doc, ...patch };
}

/**
 * The index a node entering its parent group should land at: right after the
 * group's last contiguous member, so the folder's block stays together and
 * the new member paints at the group's stacking slot — never on top of the
 * layers above the folder (Photoshop keeps a group's content as one block).
 * Returns -1 when the node has no parent group in the document.
 */
export function groupBlockInsertIndex(doc, node) {
  const groupId = node.parentId;
  if (!groupId) return -1;
  const groupIndex = doc.nodes.findIndex(
    (candidate) => candidate.id === groupId,
  );
  if (groupIndex < 0) return -1;
  let index = groupIndex + 1;
  while (index < doc.nodes.length && doc.nodes[index].parentId === groupId) {
    index += 1;
  }
  return index;
}

export function addNode(doc, node) {
  if (isRegionNode(node)) return withNodes(doc, [...doc.nodes, node]);
  const blockIndex = groupBlockInsertIndex(doc, node);
  const firstRegion = doc.nodes.findIndex(isRegionNode);
  if (blockIndex >= 0) {
    // A member joins its parent's block; the region plane stays above it.
    const capped =
      firstRegion < 0 ? blockIndex : Math.min(blockIndex, firstRegion);
    const nodes = [...doc.nodes];
    nodes.splice(capped, 0, node);
    return withNodes(doc, nodes);
  }
  if (firstRegion < 0) return withNodes(doc, [...doc.nodes, node]);
  const nodes = [...doc.nodes];
  nodes.splice(firstRegion, 0, node);
  return withNodes(doc, nodes);
}

export function updateNode(doc, id, patch) {
  const changes = nodesTracked(doc.nodes) ? [] : null;
  return withNodes(
    doc,
    doc.nodes.map((node, z) => {
      if (node.id !== id) return node;
      const updated = {
        ...node,
        ...patch,
        ...(Object.hasOwn(patch, "fill") &&
        !Object.hasOwn(patch, "fillVariableId")
          ? { fillVariableId: null }
          : {}),
        ...(Object.hasOwn(patch, "stroke") &&
        !Object.hasOwn(patch, "strokeVariableId")
          ? { strokeVariableId: null }
          : {}),
      };
      if (patch.pen === true || (patch.kind === "path" && node.kind !== "path")) {
        delete updated.cornerRadius;
        delete updated.poly;
        delete updated.polyKind;
        delete updated.sides;
        delete updated.spikes;
        delete updated.innerRatio;
        delete updated.line;
      }
      for (const key of Object.keys(patch)) {
        if (patch[key] === undefined) {
          delete updated[key];
        }
      }
      changes?.push({ node: updated, z });
      return updated;
    }),
    changes,
  );
}

export function updateNodes(doc, updates) {
  if (!updates) return doc;
  let patchMap;
  if (updates instanceof Map) {
    patchMap = updates;
  } else if (Array.isArray(updates)) {
    if (updates.length === 0) return doc;
    patchMap = new Map();
    for (const item of updates) {
      if (!item || !item.id) continue;
      patchMap.set(item.id, item.patch ?? item);
    }
  } else if (typeof updates === "object") {
    patchMap = new Map();
    for (const [id, patch] of Object.entries(updates)) {
      patchMap.set(id, patch);
    }
  } else {
    return doc;
  }

  if (patchMap.size === 0) return doc;

  const changes = nodesTracked(doc.nodes) ? [] : null;
  return withNodes(
    doc,
    doc.nodes.map((node, z) => {
      const patch = patchMap.get(node.id);
      if (!patch) return node;
      const updated = {
        ...node,
        ...patch,
        ...(Object.hasOwn(patch, "fill") &&
        !Object.hasOwn(patch, "fillVariableId")
          ? { fillVariableId: null }
          : {}),
        ...(Object.hasOwn(patch, "stroke") &&
        !Object.hasOwn(patch, "strokeVariableId")
          ? { strokeVariableId: null }
          : {}),
      };
      if (patch.pen === true || (patch.kind === "path" && node.kind !== "path")) {
        delete updated.cornerRadius;
        delete updated.poly;
        delete updated.polyKind;
        delete updated.sides;
        delete updated.spikes;
        delete updated.innerRatio;
        delete updated.line;
      }
      for (const key of Object.keys(patch)) {
        if (patch[key] === undefined) {
          delete updated[key];
        }
      }
      changes?.push({ node: updated, z });
      return updated;
    }),
    changes,
  );
}

export function removeNode(doc, id) {
  const target = doc.nodes.find((node) => node.id === id);
  if (!target || target.locked || isLockedByGroup(doc, target)) return doc;
  return withNodes(
    doc,
    doc.nodes.filter((node) => node.id !== id),
  );
}

/** A copy of a node, offset so the duplicate is visibly on top of the original. */
export function duplicateNode(doc, id, offset) {
  const node = doc.nodes.find((candidate) => candidate.id === id);
  if (!node || node.locked) return { doc, id: null };
  const copy = {
    ...node,
    id: crypto.randomUUID(),
    x: node.x + offset,
    y: node.y + offset,
    // A duplicate is never the locked base image, whatever it was copied from.
    locked: false,
    points: node.points
      ? node.points.map((point) =>
          Array.isArray(point)
            ? [...point]
            : {
                ...point,
                in: point.in ? [...point.in] : null,
                out: point.out ? [...point.out] : null,
              },
        )
      : undefined,
  };
  if (copy.points === undefined) delete copy.points;
  return { doc: addNode(doc, copy), id: copy.id };
}

/** Topmost selectable node under a document-space point. */
export function nodeAtPoint(
  doc,
  point,
  { includeLocked = false, reject = null, spatialIndex = null, zoom = 1 } = {},
) {
  if (!doc?.nodes || doc.nodes.length === 0) return null;

  const index = spatialIndex ?? doc.spatialIndex ?? doc._spatialIndex;
  let candidateNodes = null;

  if (index) {
    const querySlop = Math.max(24, 24 / Math.max(0.1, zoom));
    const candidates = index.pointQuery
      ? index.pointQuery(point, querySlop)
      : index.search({
          minX: point.x - querySlop,
          minY: point.y - querySlop,
          maxX: point.x + querySlop,
          maxY: point.y + querySlop,
        });

    const metadata = hitTestMetadata(doc.nodes);
    if (candidates.length === 0 && !metadata.hasFillInstance) return null;
    candidateNodes = orderedCandidates(doc.nodes, candidates, metadata.fills);
  }

  const nodesToTest = candidateNodes ?? doc.nodes;
  const isReverse = !candidateNodes;
  const length = nodesToTest.length;

  for (let i = 0; i < length; i += 1) {
    const node = isReverse ? nodesToTest[length - 1 - i] : nodesToTest[i];
    // A group is a folder, not a mark: its box covers its members, so testing
    // it would swallow every click meant for them.
    if (isGroupNode(node)) continue;
    // A boolean container with active children is hit-tested through its children,
    // which hold the actual vector outlines.
    if (
      node.kind === NODE_KIND.BOOLEAN &&
      hitTestMetadata(doc.nodes).parents.has(node.id)
    ) {
      continue;
    }
    if (!node.visible || isHiddenByGroup(doc, node)) continue;
    // Sound has no box to be inside: it is reached from Layers and the
    // timeline, never from the stage.
    if ((node.locked || isLockedByGroup(doc, node)) && !includeLocked) continue;
    if (isRegionNode(node)) {
      // A region lives in its host image's pixels, so the hit test has to go
      // through that image's transform: map the click into the host's local
      // space and test against the region's own local box there.
      const local = regionLocalPoint(doc, node, point);
      if (
        local &&
        local.x >= node.x &&
        local.x <= node.x + node.width &&
        local.y >= node.y &&
        local.y <= node.y + node.height
      ) {
        return node;
      }
      continue;
    }
    if (
      node.kind === NODE_KIND.CANVAS_INSTANCE &&
      node.instance?.layoutMode === "fill"
    ) {
      // A fill instance paints across the host page, regardless of its stored box.
      if (
        point.x >= 0 &&
        point.x <= doc.width &&
        point.y >= 0 &&
        point.y <= doc.height &&
        !reject?.(node, point)
      )
        return node;
      continue;
    }
    // Test in the node's local box space so a rotated or sheared node is hit
    // where it is actually painted; identity-transformed nodes (regions
    // included) get the plain axis-aligned test back.
    const local = toNodeLocal(node, point);
    const screenTolerance = node.width <= 2 || node.height <= 2 ? 6 : 4;
    const effectiveSlop = Math.max(
      screenTolerance / Math.max(0.1, zoom),
      ((node.strokeWidth ?? 0) / 2),
    );
    const slop = effectiveSlop;
    if (
      local.x >= -slop &&
      local.x <= node.width + slop &&
      local.y >= -slop &&
      local.y <= node.height + slop
    ) {
      if (node.kind === NODE_KIND.ELLIPSE) {
        const rx = node.width / 2;
        const ry = node.height / 2;
        if (rx <= 0 || ry <= 0) continue;
        const nx = (local.x - rx) / rx;
        const ny = (local.y - ry) / ry;
        if (nx * nx + ny * ny > 1) continue;
      }
      if (
        node.kind === NODE_KIND.PATH &&
        node.points &&
        node.points.length >= 2 &&
        (!node.fill || node.fill === "none" || node.fill === "transparent")
      ) {
        const scaleX = node.baseWidth ? node.width / node.baseWidth : 1;
        const scaleY = node.baseHeight ? node.height / node.baseHeight : 1;
        const scaledLocal = { x: local.x / scaleX, y: local.y / scaleY };
        const best = projectOntoPath(node.points, scaledLocal);
        if (!best || best.dist * Math.min(scaleX, scaleY) > slop) continue;
      }
      // The pixel-level veto: paint layers are mostly transparent, so their
      // transparent texels must let the click fall through to nodes below.
      if (reject?.(node, point)) continue;
      return node;
    }
  }
  return null;
}

/**
 * The topmost visible image node whose box contains the document-space
 * point, or null. The pixel tools all anchor on an image this way, so a
 * selection made from a path lands on the layer the path is drawn over.
 */
export function imageNodeUnder(doc, point) {
  for (let index = doc.nodes.length - 1; index >= 0; index -= 1) {
    const node = doc.nodes[index];
    if (!node.visible || node.kind !== NODE_KIND.IMAGE) continue;
    if (
      point.x >= node.x &&
      point.x <= node.x + node.width &&
      point.y >= node.y &&
      point.y <= node.y + node.height
    ) {
      return node;
    }
  }
  return null;
}

/**
 * Scales a bitmap to fit the page and wraps it in a centred image node.
 * Shared by inserted files, opened base images and connected extra layers.
 */
export function makeCentredImageNode(doc, bitmap, { imageId, src }) {
  const maxWidth = doc.width * 0.8;
  const maxHeight = doc.height * 0.8;
  const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  return createImageNode({
    x: doc.width / 2 - width / 2,
    y: doc.height / 2 - height / 2,
    width,
    height,
    imageId: imageId ?? null,
    src: imageId ? null : src,
  });
}
