import { SpatialIndex } from "./spatial_index.js";

const SAME_KEYS = ["id", "nodes", "x", "y", "width", "height", "isCanvasRoot"];

/** Keep one geometry index per workspace; selection wrappers are not geometry. */
export function createWorkspaceSpatialIndex(defaultOffset = 0) {
  let previous = [];
  let index = null;
  return (docs, layouts) => {
    const next = docs.map(doc => {
      const id = doc.id || doc.canvasId;
      const layout = (id ? layouts?.get(id) : null) ?? { x: defaultOffset, y: defaultOffset };
      return {
        id, nodes: doc.nodes, x: layout.x ?? 0, y: layout.y ?? 0,
        width: doc.width || 1024, height: doc.height || 1024,
        isCanvasRoot: doc.isCanvasRoot,
      };
    });
    if (previous.length === next.length && next.every((doc, at) =>
      SAME_KEYS.every(key => doc[key] === previous[at][key]))) return index;
    previous = next;
    if (!next.length) { index = null; return index; }
    const items = [];
    for (const doc of next) {
      if (!doc.isCanvasRoot) items.push({
        id: `frame-${doc.id}`, minX: doc.x, minY: doc.y,
        maxX: doc.x + doc.width, maxY: doc.y + doc.height,
        isFrame: true, docId: doc.id,
      });
      for (const node of doc.nodes ?? []) {
        if (!node) continue;
        const x = (node.x ?? 0) + doc.x, y = (node.y ?? 0) + doc.y;
        items.push({
          id: node.id, minX: x, minY: y,
          maxX: x + (node.width ?? 0), maxY: y + (node.height ?? 0),
          node, docId: doc.id,
        });
      }
    }
    // Bulk packing avoids thousands of incremental R-tree splits on real edits.
    index = new SpatialIndex();
    index.load(items);
    return index;
  };
}
