/** Resize constraints for VOO Design: pin / stretch / centre / scale children as their frame resizes. */
import { reconcileBooleanDocument } from "./boolean-node-reconcile.js";
import { DEFAULT_CONSTRAINTS, normalizeConstraints, constraintsEqual } from "./constraint-values.js";
export { HORIZONTAL_CONSTRAINTS, VERTICAL_CONSTRAINTS, DEFAULT_CONSTRAINTS,
  normalizeConstraints, constraintsEqual } from "./constraint-values.js";

/**
 * Resize constraints (Figma / Pen parity).
 *
 * Every VOO node stores an absolute box in document coordinates. Groups are
 * folders and the page is the root frame, so "the parent" of a node is either
 * its group (`node.parentId`) or the page itself (top-level nodes). When a
 * frame is resized, each *direct child that carries an explicit*
 * `node.constraints` object is re-resolved against the old and new parent
 * boxes. Nodes without `constraints` are left untouched, which keeps every
 * pre-constraints document behaving exactly as it did before this module
 * existed (the page resize path keeps its historical centring for those).
 *
 * ## Constraint semantics
 *
 * | stored value             | horizontal meaning                  | vertical meaning                    |
 * |--------------------------|-------------------------------------|-------------------------------------|
 * | `left` / `top`           | keep distance from leading edge     | keep distance from top edge         |
 * | `right` / `bottom`       | keep distance from trailing edge    | keep distance from bottom edge      |
 * | `leftRight` / `topBottom`| keep both offsets; width grows by Δ | keep both offsets; height grows by Δ|
 * | `center`                 | keep the centre offset (not ratio)  | keep the centre offset              |
 * | `scale`                  | scale offset and size by parent Δ   | scale offset and size by parent Δ   |
 *
 * The stored shape is axis-native — `horizontal` uses `left`/`right`,
 * `vertical` uses `top`/`bottom` — so the panel and the document read like the
 * Figma property (`Left & right`, `Top & bottom`). Tolerant reads accept the
 * aliases `"left-right"`/`"stretch"` -> `leftRight`, `"top-bottom"` ->
 * `topBottom`, `"centre"`/`"middle"` -> `center`, and the cross-axis slips
 * `"left"` -> vertical `top`, `"right"` -> vertical `bottom`. Unknown values
 * fall back to the default `left` / `top`; `normalizeConstraints(null)` is the
 * default object, never null, so call sites can read `.horizontal` directly.
 *
 * Other document choices, made explicit:
 * - **Auto-layout parent**: a group with `autoLayout` owns its *flow* children,
 *   so constraints are skipped for children with
 *   `layoutPosition !== "absolute"` (reflowAutoLayout has authority there).
 *   Absolutely positioned children are out of that flow and *are* resolved by
 *   their constraints.
 * - Invisible and locked nodes still carry geometry, so their constraints are
 *   resolved too; visibility/lock do not change layout.
 * - `reflowConstraints` is pure and idempotent. The input contract is that
 *   constrained children still hold their *pre-resize* boxes; when the caller
 *   has already resized/centred the document it passes `beforeBoxes`, and
 *   replaying the call with the same boxes returns the same document
 *   reference. An unchanged parent box is a no-op that returns the input.
 * - The parent box itself is written when `parentId` names a node; top-level
 *   reflow writes the page `width`/`height` from `newBox`.
 */

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonNegative(value, fallback = 0) {
  return Math.max(0, finiteNumber(value, fallback));
}

/** Whether a node carries explicit constraints (used to gate the resize hook). */
export function hasConstraints(node) {
  return Boolean(node?.constraints);
}

function toBox(value) {
  if (!value) return null;
  const width = Number(value.width);
  const height = Number(value.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return {
    x: finiteNumber(value.x),
    y: finiteNumber(value.y),
    width,
    height,
  };
}

function boxesEqual(a, b) {
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height
  );
}

/** Resolves one axis: leading offset, stretch, centre offset or proportional scale. */
function resolveAxis(mode, offset, size, oldSize, newSize) {
  switch (mode) {
    case "right":
    case "bottom":
      // Keep the distance to the trailing edge: move by the parent's delta.
      return { offset: offset + (newSize - oldSize), size };
    case "leftRight":
    case "topBottom":
      // Both edges pinned: the child grows/shrinks with the parent.
      return { offset, size: Math.max(0, size + (newSize - oldSize)) };
    case "center":
      // Keep the centre offset (Figma's "Center"), not the centre ratio.
      return { offset: offset + (newSize - oldSize) / 2, size };
    case "scale": {
      if (oldSize <= 0) return { offset, size };
      const ratio = newSize / oldSize;
      if (!Number.isFinite(ratio) || ratio < 0) return { offset, size };
      return { offset: offset * ratio, size: Math.max(0, size * ratio) };
    }
    case "left":
    case "top":
    default:
      // Keep the distance to the leading edge.
      return { offset, size };
  }
}

/**
 * Applies constraints to one child box. Pure; boxes are absolute document
 * coordinates. Tolerant: non-finite parent sizes fall back to "no movement"
 * by treating the new size as the old size.
 */
export function applyConstraints(
  childBox,
  oldParentBox,
  newParentBox,
  constraints,
) {
  const child = toBox(childBox) ?? { x: 0, y: 0, width: 0, height: 0 };
  const oldParent = toBox(oldParentBox);
  const newParent = toBox(newParentBox);
  const modes = normalizeConstraints(constraints);
  if (!oldParent || !newParent) {
    return {
      x: child.x,
      y: child.y,
      width: child.width,
      height: child.height,
    };
  }
  const oldWidth = nonNegative(oldParent.width);
  const oldHeight = nonNegative(oldParent.height);
  const newWidth = nonNegative(newParent.width);
  const newHeight = nonNegative(newParent.height);
  const horizontal = resolveAxis(
    modes.horizontal,
    child.x - oldParent.x,
    nonNegative(child.width),
    oldWidth,
    newWidth,
  );
  const vertical = resolveAxis(
    modes.vertical,
    child.y - oldParent.y,
    nonNegative(child.height),
    oldHeight,
    newHeight,
  );
  return {
    x: newParent.x + horizontal.offset,
    y: newParent.y + vertical.offset,
    width: horizontal.size,
    height: vertical.size,
  };
}

/**
 * Suggests the closest constraint pair for a node's current position inside a
 * parent box. Used by the panel to preselect a sensible value when a node has
 * no stored constraints; it never changes document geometry.
 */
export function defaultConstraintsFor(node, parentBox) {
  const parent = toBox(parentBox);
  if (!node || !parent || parent.width <= 0 || parent.height <= 0) {
    return { ...DEFAULT_CONSTRAINTS };
  }
  const child = toBox(node) ?? { x: 0, y: 0, width: 0, height: 0 };
  const infer = (offset, size, parentSize, leading, trailing, stretch) => {
    const trailingOffset = parentSize - (offset + size);
    const centreOffset = offset + size / 2 - parentSize / 2;
    if (Math.abs(offset) <= 0.5 && Math.abs(trailingOffset) <= 0.5) {
      return stretch;
    }
    if (Math.abs(trailingOffset) <= 0.5) return trailing;
    if (Math.abs(centreOffset) <= 0.5) return "center";
    return leading;
  };
  return {
    horizontal: infer(
      child.x - parent.x,
      child.width,
      parent.width,
      "left",
      "right",
      "leftRight",
    ),
    vertical: infer(
      child.y - parent.y,
      child.height,
      parent.height,
      "top",
      "bottom",
      "topBottom",
    ),
  };
}

function sameBox(node, resolved) {
  return (
    node.x === resolved.x &&
    node.y === resolved.y &&
    node.width === resolved.width &&
    node.height === resolved.height
  );
}

function beforeBoxLookup(beforeBoxes) {
  if (beforeBoxes instanceof Map) return beforeBoxes;
  if (beforeBoxes && typeof beforeBoxes === "object") {
    return new Map(Object.entries(beforeBoxes));
  }
  return null;
}

/**
 * Repositions the direct children of a resized parent according to their
 * constraints.
 *
 * @param {object} doc Document (never mutated).
 * @param {object} options
 * @param {string|null} [options.parentId] Group id, or null/undefined for the
 *   page's top-level nodes.
 * @param {object} options.oldBox Parent box before the resize.
 * @param {object} options.newBox Parent box after the resize.
 * @param {Map|object} [options.beforeBoxes] Child boxes captured *before* the
 *   parent box changed. The page-resize hook resizes the document first (which
 *   historically centres every node), so it passes the pre-resize boxes here;
 *   callers that still hold pre-resize boxes can omit it.
 * @returns {object} The same document reference when nothing changed, else a
 *   new document with constrained children (and the parent/page box) resolved.
 */
export function reflowConstraints(
  doc,
  { parentId = null, oldBox, newBox, beforeBoxes = null } = {},
) {
  if (!doc?.nodes || !Array.isArray(doc.nodes)) return doc;
  const oldParent = toBox(oldBox);
  const newParent = toBox(newBox);
  if (!oldParent || !newParent) return doc;
  // Unchanged parent geometry is a no-op by contract: the resize never
  // happened, so constraints have nothing to react to.
  if (boxesEqual(oldParent, newParent)) return doc;

  const targetParentId = parentId ?? null;
  const before = beforeBoxLookup(beforeBoxes);
  const nodes = doc.nodes;
  const parentNode =
    targetParentId === null
      ? null
      : (nodes.find((candidate) => candidate.id === targetParentId) ?? null);
  let changed = false;
  let nextNodes = nodes.map((node) => {
    if (targetParentId === null) {
      if (node.parentId) return node;
    } else if (node.parentId !== targetParentId) {
      return node;
    }
    if (!node.constraints) return node;
    // Auto-layout owns its flow children; constraints only apply to the
    // absolute ones it deliberately excludes from the flow.
    if (parentNode?.autoLayout && node.layoutPosition !== "absolute") {
      return node;
    }
    const source = before?.get(node.id) ?? node;
    const resolved = applyConstraints(
      source,
      oldParent,
      newParent,
      node.constraints,
    );
    if (sameBox(node, resolved)) return node;
    changed = true;
    return { ...node, ...resolved };
  });

  const resolvedParentBox = {
    x: newParent.x,
    y: newParent.y,
    width: newParent.width,
    height: newParent.height,
  };
  if (parentNode && !sameBox(parentNode, resolvedParentBox)) {
    nextNodes = nextNodes.map((node) =>
      node.id === targetParentId ? { ...node, ...resolvedParentBox } : node,
    );
    changed = true;
  }
  if (
    targetParentId === null &&
    (doc.width !== newParent.width || doc.height !== newParent.height)
  ) {
    changed = true;
  }

  if (!changed) return doc;
  const result = {
    ...doc,
    ...(targetParentId === null
      ? { width: newParent.width, height: newParent.height }
      : {}),
    nodes: nextNodes,
  };
  const beforeDocument = before ? { ...doc, nodes: nodes.map((node) => before.get(node.id) ?? node) } : doc;
  return reconcileBooleanDocument(beforeDocument, result, { inheritChildren: true });
}

/**
 * Returns a new document with `nodeId`'s constraints set (normalized). Missing
 * node or identical constraints return the input document reference.
 */
export function withConstraints(doc, nodeId, constraints) {
  if (!doc?.nodes || !Array.isArray(doc.nodes)) return doc;
  const next = normalizeConstraints(constraints);
  let changed = false;
  const nodes = doc.nodes.map((node) => {
    if (node.id !== nodeId) return node;
    if (node.constraints && constraintsEqual(node.constraints, next)) {
      return node;
    }
    changed = true;
    return { ...node, constraints: next };
  });
  return changed ? { ...doc, nodes } : doc;
}

/** Clears a node's constraints (used by "remove constraint" style flows). */
export function withoutConstraints(doc, nodeId) {
  if (!doc?.nodes || !Array.isArray(doc.nodes)) return doc;
  let changed = false;
  const nodes = doc.nodes.map((node) => {
    if (node.id !== nodeId || !node.constraints) return node;
    changed = true;
    const { constraints: _removed, ...rest } = node;
    return rest;
  });
  return changed ? { ...doc, nodes } : doc;
}
