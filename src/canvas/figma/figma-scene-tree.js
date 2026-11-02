import { figmaObject as asObject, figmaArray as asArray, figmaNumber as asNumber, figmaString as asString, figmaGuid as guidKey } from "./figma-value.js";
import { expandInstances } from "./figma-instances.js";
import { resolveFigmaTransforms } from "./figma-node-transform.js";
import { COORDINATE_CONTAINER_TYPES, STRUCTURAL_TYPES } from "./figma-node-types.js";
import { canvasBackgroundHex } from "./figma-scene-paints.js";
function readNode(change) {
  const key = guidKey(change.guid);
  if (!key) return null;
  const parentIndex = asObject(change.parentIndex);
  const transform = asObject(change.transform);
  const size = asObject(change.size);
  return {
    key,
    parentKey: parentIndex ? guidKey(parentIndex.guid) : null,
    position: asString(parentIndex?.position),
    type: change.type === "FRAME" && change.resizeToFit === true ? "GROUP" : asString(change.type, "NONE"),
    coordinateOrigin: COORDINATE_CONTAINER_TYPES.has(change.type),
    name: asString(change.name, "Layer"),
    x: asNumber(transform?.m02),
    y: asNumber(transform?.m12),
    w: Math.max(1, asNumber(size?.x, 1)),
    h: Math.max(1, asNumber(size?.y, 1)),
    raw: change,
    children: [],
  };
}

function byPosition(a, b) {
  return a.position < b.position ? -1 : a.position > b.position ? 1 : 0;
}

/**
 * Rebuilds the parent/child tree from the flat `nodeChanges` list. Returns the
 * top-level layers: those whose parent is missing or is a document/canvas record.
 */
export function buildTopLevel(message) {
  const nodes = new Map();
  for (const entry of expandInstances(asArray(message.nodeChanges))) {
    const change = asObject(entry);
    const node = change ? readNode(change) : null;
    if (node) nodes.set(node.key, node);
  }
  resolveFigmaTransforms(nodes);
  // Document and canvas records are structural: a layer parented to either
  // (or to nothing) is top level, whether or not a canvas record exists.
  const roots = [];
  for (const node of nodes.values()) {
    if (STRUCTURAL_TYPES.has(node.type)) continue;
    const parent = node.parentKey ? nodes.get(node.parentKey) : null;
    if (!parent || STRUCTURAL_TYPES.has(parent.type)) {
      node.canvasKey = parent?.type === "CANVAS" ? parent.key : null;
      roots.push(node);
    } else {
      parent.children.push(node);
    }
  }
  for (const node of nodes.values()) node.children.sort(byPosition);
  // Figma pages in their own order; each one becomes a single editor page.
  const canvases = [...nodes.values()]
    .filter((node) => node.type === "CANVAS")
    .sort(byPosition)
    .map((node) => ({ key: node.key, name: node.name, background: canvasBackgroundHex(node.raw) }));
  return { roots: roots.sort(byPosition), canvases };
}
