import { NODE_TYPE } from "./nodes/types.js";

/**
 * Pure template-UGC helpers: capturing a selection as a template, stripping
 * transient state, and laying a template back onto a canvas. No storage, no
 * React — the store layer and the IndexedDB wrapper live next to it.
 *
 * A template is a list of plain node objects (type + durable data, positions
 * relative to nothing — absolute as saved). Applying translates the root
 * nodes so the template's bounding-box centre lands on the requested point;
 * group children keep their group-relative positions and follow their group.
 */

/**
 * Node-level keys that are selection/measurement noise. position and
 * parentNode are layout data, not noise: the template stores positions
 * absolute-as-saved (group children stay group-relative) so applying can
 * translate roots onto a target centre while group hierarchy survives.
 */
const STRIP_NODE_KEYS = new Set([
  "selected",
  "dragging",
  "resizing",
  "measured",
  "extent",
]);

/** data-level keys that are run/session state, never template material. */
const STRIP_DATA_KEYS = new Set([
  // Run lifecycle.
  "status",
  "stage",
  "error",
  "results",
  "selectedIndex",
  "remoteJob",
  "combineProgress",
  "combineTotal",
  // Version/history trails.
  "versions",
  "selectedVersionId",
  "layoutVersions",
  "selectedLayoutVersionId",
  "layoutHtml",
  "layoutReview",
  // Session-specific asset references and documents.
  "imageIds",
  "removedImageIds",
  "pinnedIds",
  "imageId",
  "origin",
  "sourceNodeId",
  "editorDoc",
  "referenceImages",
  "logoImageId",
  "remoteAssetUrls",
]);

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Collects the nodes a template should capture from a selection: every
 * selected node, plus the full subtree of any selected group.
 *
 * A captured node whose group is not captured becomes standalone — its
 * position is converted from group-relative to absolute so it does not float
 * off when applied elsewhere.
 */
export function collectTemplateNodes(allNodes, selectedIds) {
  if (!Array.isArray(allNodes) || !Array.isArray(selectedIds)) return [];
  const byId = new Map(allNodes.map((node) => [node.id, node]));
  const captured = new Set();
  const queue = selectedIds.filter((id) => byId.has(id));
  while (queue.length > 0) {
    const id = queue.pop();
    if (captured.has(id)) continue;
    captured.add(id);
    // A group drags its whole subtree along, any depth.
    if (byId.get(id)?.type === NODE_TYPE.GROUP) {
      for (const node of allNodes) {
        if (node.parentNode === id) queue.push(node.id);
      }
    }
  }

  const result = [];
  for (const id of captured) {
    const node = byId.get(id);
    if (!node) continue;
    const copy = { ...node };
    if (copy.parentNode && !captured.has(copy.parentNode)) {
      const parent = byId.get(copy.parentNode);
      if (parent) {
        copy.position = {
          x: (parent.position?.x ?? 0) + (copy.position?.x ?? 0),
          y: (parent.position?.y ?? 0) + (copy.position?.y ?? 0),
        };
      }
      delete copy.parentNode;
      delete copy.extent;
    }
    result.push(copy);
  }
  return result;
}

/**
 * Deep-clones nodes and strips everything transient or session-specific.
 * Layout fields survive: position (absolute for roots, group-relative for
 * children) and parentNode are what let layoutTemplateNodes place the
 * template on a target centre without flattening groups.
 */
export function serializeTemplateNodes(nodes) {
  return (nodes ?? []).map((node) => {
    const clean = {};
    for (const [key, value] of Object.entries(node)) {
      if (STRIP_NODE_KEYS.has(key)) continue;
      clean[key] = deepClone(value);
    }
    if (clean.data && typeof clean.data === "object") {
      const data = {};
      for (const [key, value] of Object.entries(clean.data)) {
        if (STRIP_DATA_KEYS.has(key)) continue;
        data[key] = deepClone(value);
      }
      clean.data = data;
    }
    return clean;
  });
}

/**
 * Lays a template onto a canvas: clones every node with a fresh id and
 * translates the root nodes so the template's bounding-box centre lands on
 * `center`. Group children keep their group-relative positions (groups move,
 * children ride along) and their parentNode refs are remapped to the clone.
 *
 * @returns {Array} ready-to-append node objects, or [] for an empty template.
 */
export function layoutTemplateNodes(templateNodes, center) {
  const nodes = templateNodes ?? [];
  const roots = nodes.filter((node) => !node.parentNode);
  if (roots.length === 0) return [];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of roots) {
    const x = node.position?.x ?? 0;
    const y = node.position?.y ?? 0;
    const w = node.width ?? 245;
    const h = node.height ?? 180;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }
  const offsetX = (center?.x ?? 0) - (minX + maxX) / 2;
  const offsetY = (center?.y ?? 0) - (minY + maxY) / 2;

  const idMap = new Map();
  for (const node of nodes) {
    idMap.set(node.id, `${node.type}-${crypto.randomUUID()}`);
  }

  // Calculate ancestor nesting depth to guarantee parents precede children regardless of original array order
  const parentMap = new Map(nodes.map((n) => [n.id, n.parentNode]));
  const getDepth = (id, visited = new Set()) => {
    if (!id || visited.has(id)) return 0;
    visited.add(id);
    const parent = parentMap.get(id);
    return parent ? 1 + getDepth(parent, visited) : 0;
  };

  const depthMap = new Map(nodes.map((n) => [n.id, getDepth(n.id)]));
  const ordered = [...nodes].sort((a, b) => {
    const depthA = depthMap.get(a.id) ?? 0;
    const depthB = depthMap.get(b.id) ?? 0;
    if (depthA !== depthB) return depthA - depthB;
    return 0;
  });

  const clones = ordered.map((node) => {
    const newId = idMap.get(node.id);
    const clone = deepClone(node);
    clone.id = newId;
    clone.selected = false;
    if (clone.parentNode) {
      clone.parentNode = idMap.get(clone.parentNode) ?? clone.parentNode;
    } else if (clone.position) {
      clone.position = {
        x: (clone.position.x ?? 0) + offsetX,
        y: (clone.position.y ?? 0) + offsetY,
      };
    }
    if (clone.data?.styleAnchorId && idMap.has(clone.data.styleAnchorId)) {
      clone.data.styleAnchorId = idMap.get(clone.data.styleAnchorId);
    }
    return clone;
  });
  return clones;
}
