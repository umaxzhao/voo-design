/** Merge only rectangles with identical cross-axis edges: their union stays exact. */
function mergeAligned(rectangles, horizontal) {
  const groups = new Map();
  for (const rect of rectangles) {
    const key = horizontal ? `${rect.top}:${rect.bottom}` : `${rect.left}:${rect.right}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(rect);
  }
  const start = horizontal ? "left" : "top";
  const end = horizontal ? "right" : "bottom";
  const result = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a[start] - b[start]);
    let merged = null;
    for (const rect of group) {
      if (merged && rect[start] <= merged[end]) merged[end] = Math.max(merged[end], rect[end]);else {
        merged = {
          ...rect
        };
        result.push(merged);
      }
    }
  }
  return result;
}

/** Reduce CSS path parsing for dense grids without filling gaps between artwork. */
export function hitRegionPath(rectangles) {
  const merged = mergeAligned(mergeAligned(rectangles, true), false);
  const paths = merged.map(({
    left,
    top,
    right,
    bottom
  }) => `M${left} ${top}H${right}V${bottom}H${left}Z`);
  return `path("${paths.join(" ") || "M0 0Z"}")`;
}

/** Retain unchanged row unions when a drag replaces only a few immutable nodes. */
export function createHitRegionCache() {
  let previousKey = null;
  let ancestors = new Map();
  const entries = new Map();
  const groups = new Map();
  const invalidate = entry => {
    if (!entry?.rect) return;
    const group = groups.get(entry.key);
    group.boxes.delete(entry.node.id);
    group.merged = null;
    if (!group.boxes.size) groups.delete(entry.key);
  };
  return (nodes, key, rectOf) => {
    const nextAncestors = new Map();
    for (const node of nodes) {
      if (node.isFrame || node.kind === "group" || node.kind === "boolean") nextAncestors.set(node.id, node);
    }
    const ancestryChanged = nextAncestors.size !== ancestors.size || [...nextAncestors].some(([id, node]) => ancestors.get(id) !== node);
    if (key !== previousKey || ancestryChanged) {
      entries.clear();
      groups.clear();
    }
    previousKey = key;
    ancestors = nextAncestors;
    const seen = new Set();
    for (const node of nodes) {
      seen.add(node.id);
      const previous = entries.get(node.id);
      if (previous?.node === node) continue;
      invalidate(previous);
      const rect = rectOf(node);
      const rowKey = rect ? `${rect.top}:${rect.bottom}` : null;
      entries.set(node.id, {
        node,
        key: rowKey,
        rect
      });
      if (!rect) continue;
      if (!groups.has(rowKey)) groups.set(rowKey, {
        boxes: new Map(),
        merged: null
      });
      const group = groups.get(rowKey);
      group.boxes.set(node.id, rect);
      group.merged = null;
    }
    for (const [id, entry] of entries) {
      if (seen.has(id)) continue;
      invalidate(entry);
      entries.delete(id);
    }
    const rectangles = [];
    for (const group of groups.values()) {
      group.merged ??= mergeAligned([...group.boxes.values()], true);
      rectangles.push(...group.merged);
    }
    return hitRegionPath(rectangles);
  };
}
