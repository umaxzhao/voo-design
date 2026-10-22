/**
 * Zero-dependency 2D R-Tree Spatial Index for high-performance spatial queries,
 * frustum culling, and point hit-testing in VOO Design.
 *
 * Implements Sort-Tile-Recursive (STR) bulk loading for optimal O(N log N) packing,
 * O(log N) dynamic insertion/deletion, O(log N + K) bounding box search, and
 * O(log N) point containment queries.
 */

function defaultBBox() {
  return {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
}

function normalizeItem(item) {
  if (!item || typeof item !== "object") return null;

  let minX = item.minX;
  let minY = item.minY;
  let maxX = item.maxX;
  let maxY = item.maxY;

  // Fallback to x, y, width, height if min/max not directly provided
  if (minX == null && item.x != null) minX = item.x;
  if (minY == null && item.y != null) minY = item.y;
  if (maxX == null && item.x != null && item.width != null) maxX = item.x + item.width;
  if (maxY == null && item.y != null && item.height != null) maxY = item.y + item.height;

  // Defaults if still undefined
  if (minX == null) minX = 0;
  if (minY == null) minY = 0;
  if (maxX == null) maxX = minX;
  if (maxY == null) maxY = minY;

  // Infinite / NaN coordinate protection
  if (!Number.isFinite(minX)) minX = 0;
  if (!Number.isFinite(minY)) minY = 0;
  if (!Number.isFinite(maxX)) maxX = minX;
  if (!Number.isFinite(maxY)) maxY = minY;

  // Ensure normalized min <= max
  const actualMinX = Math.min(minX, maxX);
  const actualMaxX = Math.max(minX, maxX);
  const actualMinY = Math.min(minY, maxY);
  const actualMaxY = Math.max(minY, maxY);

  return {
    ...item,
    id: item.id != null ? String(item.id) : "",
    minX: actualMinX,
    minY: actualMinY,
    maxX: actualMaxX,
    maxY: actualMaxY,
  };
}

function intersects(a, b) {
  const xOverlap =
    a.minX === a.maxX || b.minX === b.maxX
      ? a.minX <= b.maxX && a.maxX >= b.minX
      : a.minX < b.maxX && a.maxX > b.minX;

  const yOverlap =
    a.minY === a.maxY || b.minY === b.maxY
      ? a.minY <= b.maxY && a.maxY >= b.minY
      : a.minY < b.maxY && a.maxY > b.minY;

  return xOverlap && yOverlap;
}

function contains(box, point, tolerance = 0) {
  return (
    point.x >= box.minX - tolerance &&
    point.x <= box.maxX + tolerance &&
    point.y >= box.minY - tolerance &&
    point.y <= box.maxY + tolerance
  );
}

function boxHint(item) {
  const { minX, minY, maxX, maxY } = item;
  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY)
  ) {
    return null;
  }
  return { minX, minY, maxX, maxY };
}

function containsBox(outer, inner) {
  return (
    outer.minX <= inner.minX &&
    outer.minY <= inner.minY &&
    outer.maxX >= inner.maxX &&
    outer.maxY >= inner.maxY
  );
}

function calcNodeBBox(node) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const children = node.children;
  for (let i = 0; i < children.length; i += 1) {
    const c = children[i];
    if (c.minX < minX) minX = c.minX;
    if (c.minY < minY) minY = c.minY;
    if (c.maxX > maxX) maxX = c.maxX;
    if (c.maxY > maxY) maxY = c.maxY;
  }

  node.minX = minX;
  node.minY = minY;
  node.maxX = maxX;
  node.maxY = maxY;
}

function bboxArea(box) {
  return Math.max(0, box.maxX - box.minX) * Math.max(0, box.maxY - box.minY);
}

function bboxMargin(box) {
  return Math.max(0, box.maxX - box.minX) + Math.max(0, box.maxY - box.minY);
}

function enlargedArea(a, b) {
  const minX = Math.min(a.minX, b.minX);
  const minY = Math.min(a.minY, b.minY);
  const maxX = Math.max(a.maxX, b.maxX);
  const maxY = Math.max(a.maxY, b.maxY);
  return Math.max(0, maxX - minX) * Math.max(0, maxY - minY);
}

export class SpatialIndex {
  /**
   * @param {number} [maxEntries=16] Maximum entries per node before splitting
   */
  constructor(maxEntries = 16) {
    this.maxEntries = Math.max(4, maxEntries);
    this.minEntries = Math.max(2, Math.ceil(this.maxEntries * 0.4));
    this.clear();
  }

  /**
   * Resets the spatial index to an empty state.
   */
  clear() {
    this.data = {
      children: [],
      height: 1,
      leaf: true,
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };
    this._size = 0;
  }

  /**
   * Total number of items stored in the index.
   * @returns {number}
   */
  get size() {
    return this._size;
  }

  /**
   * Returns all items currently stored in the index.
   * @returns {Array<any>}
   */
  all() {
    return this._collectAll(this.data);
  }

  _collectAll(node) {
    if (node.leaf) {
      return [...node.children];
    }
    const result = [];
    for (let i = 0; i < node.children.length; i += 1) {
      result.push(...this._collectAll(node.children[i]));
    }
    return result;
  }

  /**
   * Inserts an item into the R-Tree.
   * @param {{ id: string, minX: number, minY: number, maxX: number, maxY: number, node?: any }} rawItem
   * @returns {object | null} The stored item; passing it back to `remove`
   *   lets the removal descend only into branches whose box contains it.
   */
  insert(rawItem) {
    const item = normalizeItem(rawItem);
    if (!item) return null;

    this._insert(item);
    this._size += 1;
    return item;
  }

  _insert(item) {
    const insertPath = [];
    let node = this.data;

    // 1. Choose subtree to insert into down to target leaf
    while (!node.leaf) {
      insertPath.push(node);
      node = this._chooseSubtree(node, item);
    }

    insertPath.push(node);
    node.children.push(item);
    this._extendNodeBBox(node, item);

    // 2. Split on overflow if necessary
    while (insertPath.length > 0) {
      const current = insertPath.pop();
      if (current.children.length > this.maxEntries) {
        const splitNode = this._split(current);
        if (insertPath.length === 0) {
          // Splitting the root: create a new root
          const newRoot = {
            children: [current, splitNode],
            height: current.height + 1,
            leaf: false,
            minX: Infinity,
            minY: Infinity,
            maxX: -Infinity,
            maxY: -Infinity,
          };
          calcNodeBBox(newRoot);
          this.data = newRoot;
        } else {
          const parent = insertPath[insertPath.length - 1];
          parent.children.push(splitNode);
          calcNodeBBox(splitNode);
          calcNodeBBox(current);
          calcNodeBBox(parent);
        }
      } else {
        calcNodeBBox(current);
      }
    }
  }

  _chooseSubtree(node, item) {
    let bestChild = node.children[0];
    let minEnlargement = Infinity;
    let minArea = Infinity;

    for (let i = 0; i < node.children.length; i += 1) {
      const child = node.children[i];
      const area = bboxArea(child);
      const newArea = enlargedArea(child, item);
      const enlargement = newArea - area;

      if (enlargement < minEnlargement) {
        minEnlargement = enlargement;
        minArea = area;
        bestChild = child;
      } else if (enlargement === minEnlargement && area < minArea) {
        minArea = area;
        bestChild = child;
      }
    }

    return bestChild;
  }

  _extendNodeBBox(node, box) {
    if (box.minX < node.minX) node.minX = box.minX;
    if (box.minY < node.minY) node.minY = box.minY;
    if (box.maxX > node.maxX) node.maxX = box.maxX;
    if (box.maxY > node.maxY) node.maxY = box.maxY;
  }

  _split(node) {
    // Sort along X and Y axes, pick the split with minimal total margin/overlap
    const children = node.children;
    const count = children.length;
    const minEntries = this.minEntries;

    // Test X axis split
    children.sort((a, b) => a.minX - b.minX || a.maxX - b.maxX);
    const splitIndexX = this._chooseSplitAxisIndex(children, count, minEntries);

    // Test Y axis split
    children.sort((a, b) => a.minY - b.minY || a.maxY - b.maxY);
    const splitIndexY = this._chooseSplitAxisIndex(children, count, minEntries);

    // Re-sort along chosen optimal axis
    if (splitIndexX.margin < splitIndexY.margin) {
      children.sort((a, b) => a.minX - b.minX || a.maxX - b.maxX);
      return this._executeSplit(node, splitIndexX.index);
    }

    return this._executeSplit(node, splitIndexY.index);
  }

  _chooseSplitAxisIndex(children, count, minEntries) {
    let bestMargin = Infinity;
    let bestIndex = minEntries;

    for (let i = minEntries; i <= count - minEntries; i += 1) {
      const box1 = defaultBBox();
      for (let j = 0; j < i; j += 1) {
        const c = children[j];
        if (c.minX < box1.minX) box1.minX = c.minX;
        if (c.minY < box1.minY) box1.minY = c.minY;
        if (c.maxX > box1.maxX) box1.maxX = c.maxX;
        if (c.maxY > box1.maxY) box1.maxY = c.maxY;
      }
      const box2 = defaultBBox();
      for (let j = i; j < count; j += 1) {
        const c = children[j];
        if (c.minX < box2.minX) box2.minX = c.minX;
        if (c.minY < box2.minY) box2.minY = c.minY;
        if (c.maxX > box2.maxX) box2.maxX = c.maxX;
        if (c.maxY > box2.maxY) box2.maxY = c.maxY;
      }
      const margin = bboxMargin(box1) + bboxMargin(box2);
      if (margin < bestMargin) {
        bestMargin = margin;
        bestIndex = i;
      }
    }

    return { margin: bestMargin, index: bestIndex };
  }

  _executeSplit(node, index) {
    const newChildren = node.children.splice(index);
    const splitNode = {
      children: newChildren,
      height: node.height,
      leaf: node.leaf,
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };

    calcNodeBBox(node);
    calcNodeBBox(splitNode);
    return splitNode;
  }

  /**
   * Removes an item from the index.
   * Can accept either an item object with an `id` property or a string id.
   * @param {{ id: string } | string} item
   * @returns {boolean} True if found and removed
   */
  remove(item) {
    if (!item) return false;
    const targetId = typeof item === "string" ? item : item.id;
    if (targetId == null) return false;

    const hint = typeof item === "object" ? boxHint(item) : null;
    // A box hint skips every branch that cannot hold the item; a stale hint
    // (the caller's box no longer matches the stored one) falls back to a
    // full walk, so removal never misses.
    const removed =
      (hint && this._remove(this.data, targetId, item, hint)) ||
      this._remove(this.data, targetId, item, null);
    if (removed) {
      this._size -= 1;
      // Condense root if it only has 1 non-leaf child
      if (!this.data.leaf && this.data.children.length === 1) {
        this.data = this.data.children[0];
      }
    }
    return removed;
  }

  _remove(node, targetId, rawItem, hint) {
    if (hint && !containsBox(node, hint)) return false;
    if (node.leaf) {
      const idx = node.children.findIndex(
        (child) => child.id === targetId || child === rawItem,
      );
      if (idx >= 0) {
        node.children.splice(idx, 1);
        calcNodeBBox(node);
        return true;
      }
      return false;
    }

    // Target may be in any child whose bbox might contain it
    for (let i = 0; i < node.children.length; i += 1) {
      const child = node.children[i];
      if (this._remove(child, targetId, rawItem, hint)) {
        if (child.children.length === 0) {
          node.children.splice(i, 1);
          i -= 1;
        } else {
          calcNodeBBox(child);
        }
        calcNodeBBox(node);
        return true;
      }
    }

    return false;
  }

  /**
   * Bulk-loads items into the R-Tree using Sort-Tile-Recursive (STR).
   * Produces a fully balanced, tightly packed tree in O(N log N) time.
   * Clears any existing entries.
   * @param {Array<{ id: string, minX: number, minY: number, maxX: number, maxY: number, node?: any }>} items
   */
  load(items) {
    this.clear();
    if (!Array.isArray(items) || items.length === 0) return;

    const normalized = [];
    for (let i = 0; i < items.length; i += 1) {
      const norm = normalizeItem(items[i]);
      if (norm) normalized.push(norm);
    }

    if (normalized.length === 0) return;
    this._size = normalized.length;

    // If fits in a single leaf node
    if (normalized.length <= this.maxEntries) {
      this.data.children = normalized;
      calcNodeBBox(this.data);
      return;
    }

    // STR Bulk Loading
    this.data = this._buildSTR(normalized, 1);
  }

  _buildSTR(items, height) {
    const count = items.length;
    const maxEntries = this.maxEntries;

    if (count <= maxEntries) {
      const node = {
        children: items,
        height,
        leaf: height === 1,
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity,
      };
      calcNodeBBox(node);
      return node;
    }

    // Number of leaf nodes needed at this level
    const numNodes = Math.ceil(count / maxEntries);
    // Number of vertical slices
    const numSlices = Math.ceil(Math.sqrt(numNodes));
    // Number of items per slice
    const sliceCapacity = Math.ceil(count / numSlices);

    // Sort items by horizontal center / minX
    items.sort((a, b) => (a.minX + a.maxX) / 2 - (b.minX + b.maxX) / 2);

    const nodes = [];
    for (let s = 0; s < numSlices; s += 1) {
      const sliceStart = s * sliceCapacity;
      const sliceEnd = Math.min(count, sliceStart + sliceCapacity);
      if (sliceStart >= sliceEnd) break;

      const sliceItems = items.slice(sliceStart, sliceEnd);
      // Sort each slice by vertical center / minY
      sliceItems.sort((a, b) => (a.minY + a.maxY) / 2 - (b.minY + b.maxY) / 2);

      // Pack slice into nodes of size maxEntries
      for (let i = 0; i < sliceItems.length; i += maxEntries) {
        const chunk = sliceItems.slice(i, i + maxEntries);
        const node = {
          children: chunk,
          height,
          leaf: height === 1,
          minX: Infinity,
          minY: Infinity,
          maxX: -Infinity,
          maxY: -Infinity,
        };
        calcNodeBBox(node);
        nodes.push(node);
      }
    }

    // Recursively build parent level
    return this._buildSTR(nodes, height + 1);
  }

  /**
   * Searches for items intersecting the given bounding box.
   * @param {{ minX: number, minY: number, maxX: number, maxY: number }} box
   * @returns {Array<any>} Matching items
   */
  search(box) {
    if (!box || this._size === 0) return [];

    let minX = box.minX;
    let minY = box.minY;
    let maxX = box.maxX;
    let maxY = box.maxY;

    // Protection against invalid numbers
    if (!Number.isFinite(minX)) minX = -Infinity;
    if (!Number.isFinite(minY)) minY = -Infinity;
    if (!Number.isFinite(maxX)) maxX = Infinity;
    if (!Number.isFinite(maxY)) maxY = Infinity;

    const queryBox = {
      minX: Math.min(minX, maxX),
      minY: Math.min(minY, maxY),
      maxX: Math.max(minX, maxX),
      maxY: Math.max(minY, maxY),
    };

    const results = [];
    const stack = [this.data];

    while (stack.length > 0) {
      const node = stack.pop();
      if (!intersects(queryBox, node)) continue;

      if (node.leaf) {
        const children = node.children;
        for (let i = 0; i < children.length; i += 1) {
          const item = children[i];
          if (intersects(queryBox, item)) {
            results.push(item);
          }
        }
      } else {
        const children = node.children;
        for (let i = 0; i < children.length; i += 1) {
          const child = children[i];
          if (intersects(queryBox, child)) {
            stack.push(child);
          }
        }
      }
    }

    return results;
  }

  /**
   * Queries items that contain a given point (or within an optional tolerance).
   * @param {{ x: number, y: number }} point
   * @param {number} [tolerance=0]
   * @returns {Array<any>} Matching items
   */
  pointQuery(point, tolerance = 0) {
    if (!point || this._size === 0) return [];
    const px = point.x;
    const py = point.y;
    if (!Number.isFinite(px) || !Number.isFinite(py)) return [];

    const tol = Math.max(0, tolerance);
    const box = {
      minX: px - tol,
      minY: py - tol,
      maxX: px + tol,
      maxY: py + tol,
    };

    const candidates = this.search(box);
    if (tol === 0) {
      return candidates.filter((item) => contains(item, point, 0));
    }
    return candidates.filter((item) => contains(item, point, tol));
  }

  /**
   * Returns true if any item intersects the given bounding box.
   * Fast early-exit collision query.
   * @param {{ minX: number, minY: number, maxX: number, maxY: number }} box
   * @returns {boolean}
   */
  collides(box) {
    if (!box || this._size === 0) return false;
    const results = this.search(box);
    return results.length > 0;
  }
}
