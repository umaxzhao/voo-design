// Seam: Shape, boolean, and brush node builders.
import { NODE_KIND, newId, createDefaultAdjustments, getBaseDefaults } from "./scene_model_core.js";

export function createAdjustmentNode({ x = 0, y = 0, width = 0, height = 0, adjustments = null, name = null, adjustmentKind = null } = {}) {
  return {
    ...getBaseDefaults(),
    id: newId(),
    kind: NODE_KIND.ADJUSTMENT,
    x,
    y,
    width,
    height,
    ...(name ? { name } : {}),
    adjustments: adjustments ?? createDefaultAdjustments(),
    adjustmentKind: adjustmentKind ?? null,
  };
}

export function isAdjustmentNode(node) {
  return node?.kind === NODE_KIND.ADJUSTMENT;
}

/** The gradient kinds the renderer can paint. */
export function createRectNode({ x, y, width, height, fill = "#999999", stroke = "#ffffff", strokeWidth = 0 }) {
  return {
    ...getBaseDefaults(),
    id: newId(),
    kind: NODE_KIND.RECT,
    x,
    y,
    width,
    height,
    fill,
    stroke,
    strokeWidth,
    /** Rounded corners, in px — 0 paints the plain sharp box. */
    cornerRadius: 0,
  };
}

/**
 * An ellipse, field-for-field the rect's sibling: same box, same fill/stroke
 * convention, minus the corner radius an ellipse has no use for.
 */
export function createEllipseNode({ x, y, width, height, fill = "#999999", stroke = "#ffffff", strokeWidth = 0 }) {
  return {
    ...getBaseDefaults(),
    id: newId(),
    kind: NODE_KIND.ELLIPSE,
    x,
    y,
    width,
    height,
    // Match the rect's default so a freshly drawn ellipse is visible; the
    // properties panel still lets the user take the fill away.
    fill,
    stroke,
    strokeWidth,
  };
}

/**
 * The four ways shapes combine, in the order the toolbar shows them.
 *
 * These are the names Canvas2D's composite operations and Skia's path ops
 * both already use, so neither renderer has to translate.
 */
export const BOOLEAN_OPERATIONS = ["union", "subtract", "intersect", "exclude"];

/** Which node kinds can take part — the ones that are a closed outline. */
export const BOOLEAN_SOURCE_KINDS = [NODE_KIND.RECT, NODE_KIND.ELLIPSE, NODE_KIND.BOOLEAN, NODE_KIND.PATH];

/**
 * Whether these nodes can be combined.
 *
 * Two is the minimum that means anything, and every one of them has to be a
 * shape with an outline: an image or a text box has no boundary to intersect
 * against, and combining one would quietly drop it.
 */
export function canCombine(nodes) {
  return (nodes?.length ?? 0) >= 2 && nodes.every((node) => BOOLEAN_SOURCE_KINDS.includes(node.kind) && !node.locked);
}

/**
 * One source shape, in the coordinates of the boolean node that owns it.
 *
 * The parts are stored rather than a combined outline, because the outline is
 * the renderer's to compute — Skia intersects real paths, which is exact
 * where a polygon approximation of an ellipse would not be. It also keeps the
 * result editable: the parts are still there to be changed or pulled apart.
 */
/**
 * One source shape, in the coordinates of the boolean node that owns it.
 *
 * The parts are stored rather than a combined outline, because the outline is
 * the renderer's to compute — Skia intersects real paths, which is exact
 * where a polygon approximation of an ellipse would not be. It also keeps the
 * result editable: the parts are still there to be changed or pulled apart.
 */
export function booleanSourceOf(node, originX, originY) {
  return {
    id: node.id,
    type: node.kind,
    x: node.x - originX,
    y: node.y - originY,
    w: node.width,
    h: node.height,
    rotation: node.rotation ?? 0,
    ...(node.kind === NODE_KIND.RECT ? { cornerRadius: node.cornerRadius ?? 0 } : {}),
    ...(node.kind === NODE_KIND.PATH
      ? {
          points: node.points ?? [],
          baseWidth: node.baseWidth ?? node.width,
          baseHeight: node.baseHeight ?? node.height,
        }
      : {}),
    // A boolean inside a boolean keeps its own operation and parts, which is
    // what lets results nest.
    ...(node.kind === NODE_KIND.BOOLEAN ? { booleanOperation: node.operation, booleanSources: node.sources } : {}),
  };
}

/**
 * Recalculates a boolean container node's bounding box and source shapes
 * from its active child nodes in document coordinates.
 */
export function syncBooleanNode(booleanNode, childNodes) {
  if (!childNodes || childNodes.length === 0) return booleanNode;
  const x = Math.min(...childNodes.map((node) => node.x));
  const y = Math.min(...childNodes.map((node) => node.y));
  const right = Math.max(...childNodes.map((node) => node.x + node.width));
  const bottom = Math.max(...childNodes.map((node) => node.y + node.height));
  return {
    ...booleanNode,
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
    sources: childNodes.map((child) => booleanSourceOf(child, x, y)),
  };
}

/**
 * Combines shapes into one boolean node.
 *
 * `nodes` must be in document order, bottom first — the order decides what
 * `subtract` means (everything above is taken out of the bottom shape) and
 * which shape's paint the result keeps. Taking the bottom shape's fill and
 * stroke is what every vector editor does: the operation changes the outline,
 * not the paint, and the bottom shape's paint is what the stack was already
 * showing underneath.
 */
export function createBooleanNode(nodes, operation, parentId = null) {
  const x = Math.min(...nodes.map((node) => node.x));
  const y = Math.min(...nodes.map((node) => node.y));
  const right = Math.max(...nodes.map((node) => node.x + node.width));
  const bottom = Math.max(...nodes.map((node) => node.y + node.height));
  const [bottomMost] = nodes;

  return {
    ...getBaseDefaults(),
    id: newId(),
    kind: NODE_KIND.BOOLEAN,
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
    operation: BOOLEAN_OPERATIONS.includes(operation) ? operation : "union",
    sources: nodes.map((node) => booleanSourceOf(node, x, y)),
    fill: bottomMost.fill ?? "transparent",
    ...(bottomMost.gradient ? { gradient: bottomMost.gradient } : {}),
    stroke: bottomMost.stroke,
    strokeWidth: bottomMost.strokeWidth,
    parentId,
  };
}

/**
 * The default brush hardness: a fully hard edge, the historical stroke look.
 * 0 is the softest airbrush the renderer stamps; anything between fades a
 * solid core of that fraction of the radius out to a transparent edge.
 */
export const DEFAULT_BRUSH_HARDNESS = 1;

/**
 * The pixel brush's starting hardness. Softer than the path-node default so a
 * fresh stroke reads as Photoshop-style soft paint — a solid core fading to a
 * transparent edge — instead of an opaque marker.
 */
export const DEFAULT_SOFT_BRUSH_HARDNESS = 0.6;

/**
 * A path node's hardness: a finite number clamped to 0..1. Documents written
 * before the field existed — or carrying junk — read back as fully hard, so
 * old strokes render pixel-identically.
 */
export function normalizePathHardness(value) {
  if (!Number.isFinite(value)) return DEFAULT_BRUSH_HARDNESS;
  return Math.min(1, Math.max(0, value));
}

/**
 * A freehand stroke.
 *
 * `points` are stored relative to the node's own box and sized against
 * `baseWidth`/`baseHeight`, so resizing the node stretches the stroke without
 * ever rewriting the sampled path.
 */
