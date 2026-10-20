// Seam: Region and container node relationships and queries.
/* eslint-disable no-unused-vars */
import {
  REGION_PALETTE,
  REGION_COLOR,
  getRegionColor,
  MIN_REGION_SIZE,
  LEGACY_DOC_VERSION,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  LINE_HEIGHT_RATIO,
  TEXT_FONT_WEIGHTS,
  TEXT_ALIGNS,
  DEFAULT_TEXT_STYLE,
  MIN_DOC_SIZE,
  BLEND_MODES,
  normalizeBlendMode,
  MAX_SHEAR_DEG,
  normalizeCornerRadius,
  normalizeRotationDeg,
  normalizeNodeTransform,
  hasBlendModes,
  DEFAULT_ADJUSTMENTS,
  isDefaultAdjustments,
  deepEqual,
  normalizePoints,
  parseAdjustmentValue,
  HUE_BAND_KEYS,
  normalizeHueSatBands,
  DOC_VERSION,
  NODE_KIND,
  DEFAULT_BLEND_MODE,
  newId,
  createDefaultAdjustments,
  getBaseDefaults,
  createDocument,
  createImageNode,
} from "./scene_model_core.js";
import { normalizeAdjustments } from "./scene_model_adjustments.js";
import { normalizeGradientStops, normalizeMixerRow, normalizeInkRow, normalizeColorBalanceZone, normalizeHexColor, BASE_DEFAULTS, DEFAULT_PAGE_BACKGROUND, effectivePage } from "./scene_model_geometry.js";

function findNode(doc, id) {
  return doc.nodes.find((node) => node.id === id) ?? null;
}
import { createAdjustmentNode, isAdjustmentNode, createRectNode, createEllipseNode, BOOLEAN_OPERATIONS, BOOLEAN_SOURCE_KINDS, canCombine, booleanSourceOf, syncBooleanNode, createBooleanNode, DEFAULT_BRUSH_HARDNESS, DEFAULT_SOFT_BRUSH_HARDNESS, normalizePathHardness } from "./scene_model_node_builders.js";
import { createPathNode, pathBounds, normalisePenAnchor, cubicExtrema1D, penAnchorsBounds, createPenNode } from "./scene_model_paths.js";
import { createTextNode, normalizeColourOrNull, normalizeTextShadow, normalizeDropShadow, normalizeOuterGlow, normalizeBevel, normalizeFill, normalizeStroke, normalizeInnerShadow, normalizeInnerGlow, normalizeSatin, normalizeGradientOverlay, normalizeEffects, normalizeTextStyle } from "./scene_model_text_effects.js";

/**
 * A reference region.
 *
 * Unlike every other node this one is never painted into the exported picture:
 * it is an instruction about the picture. Its box is turned into percentages
 * and travels to the model as prompt text, which is why it carries a `label`
 * and no styling of its own.
 */
/**
 * What a region asks the model to do with the area it covers.
 *
 * Every region used to mean the same thing — put this here — but that is only
 * one of the three things people actually draw a box for, and the other two
 * matter most when generating *from* a picture rather than from nothing:
 *
 *   place  put the described element inside this box (the original meaning)
 *   keep   leave this area as it already is in the source picture
 *   clear  keep this area free of the thing described
 *
 * They compile into separate sections rather than one list, because a model
 * follows three short instructions far better than one list it has to read
 * intent out of.
 */
/* eslint-enable no-unused-vars */
export const REGION_INTENTS = ["place", "keep", "clear"];

/** Documents written before intents existed all meant `place`. */
export const DEFAULT_REGION_INTENT = "place";

export function normalizeRegionIntent(value) {
  return REGION_INTENTS.includes(value) ? value : DEFAULT_REGION_INTENT;
}

/**
 * Re-anchors an image node's warp controls onto node-local ratios.
 *
 * Perspective corners and mesh-warp points are node-local 0..1 ratios of the
 * node's box (the same host-local convention regions use), so a node that
 * moves, scales or rotates carries its grid with it. From v2 on, the write
 * path stores them as these ratios and, when `legacy` is false, they are left
 * untouched — never re-anchored — which is what makes the round-trip an
 * idempotent fixpoint and removes the save/load drift.
 *
 * A v1 document (`legacy === true`) may still hold absolute document-space
 * coordinates: any point outside 0..1 is converted once, on read, so saved
 * documents from the earlier format land on the same picture. (In-box values
 * are ratios in both versions and round-trip unchanged.)
 */
export function normalizeWarpControls(node, legacy = false) {
  const result = {};
  if (Array.isArray(node.warpMesh?.points)) {
    const points = node.warpMesh.points;
    const absolute = legacy && points.some((p) => p.x > 1 || p.y > 1 || p.x < 0 || p.y < 0);
    const width = node.width || 1;
    const height = node.height || 1;
    result.warpMesh = {
      cols: node.warpMesh.cols || 3,
      rows: node.warpMesh.rows || 3,
      points: points.map((p) =>
        absolute
          ? {
              x: (p.x - node.x) / width,
              y: (p.y - node.y) / height,
              origU: p.origU ?? (p.x - node.x) / width,
              origV: p.origV ?? (p.y - node.y) / height,
            }
          : { x: p.x, y: p.y, origU: p.origU ?? p.x, origV: p.origV ?? p.y },
      ),
    };
  }
  if (Array.isArray(node.perspectiveCorners) && node.perspectiveCorners.length === 4) {
    const corners = node.perspectiveCorners;
    const absolute = legacy && corners.some((c) => c.x > 1 || c.y > 1 || c.x < 0 || c.y < 0);
    const width = node.width || 1;
    const height = node.height || 1;
    result.perspectiveCorners = corners.map((c) => (absolute ? { x: (c.x - node.x) / width, y: (c.y - node.y) / height } : { x: c.x, y: c.y }));
  }
  if (Array.isArray(node.puppetPins)) {
    result.puppetPins = node.puppetPins
      .filter((pin) => pin && typeof pin.id === "string")
      .map((pin) => ({
        id: pin.id,
        x: Number.isFinite(pin.x) ? pin.x : (pin.restX ?? 0),
        y: Number.isFinite(pin.y) ? pin.y : (pin.restY ?? 0),
        restX: Number.isFinite(pin.restX) ? pin.restX : (pin.x ?? 0),
        restY: Number.isFinite(pin.restY) ? pin.restY : (pin.y ?? 0),
      }));
  }
  return result;
}

/**
 * A region annotates one picture, never the page: it lives on the image it
 * was drawn on (`hostId`), and its box — and its freehand `points`, when
 * the free-form region tool drew it — are in that image's own pixels, so the
 * annotation follows the picture through moves, resizes and rotations
 * without any bookkeeping. The renderer maps it back to document space
 * through the host image's transform. `parentId` keeps its ordinary group
 * meaning, so a region can sit inside a folder like any other node.
 */
export function createRegionNode({ x, y, width, height, label, intent, hostId = null, parentId = null, points, shape, color, colorName }) {
  return {
    ...BASE_DEFAULTS,
    id: newId(),
    kind: NODE_KIND.REGION,
    x,
    y,
    width,
    height,
    label: label ?? "",
    intent: normalizeRegionIntent(intent),
    hostId,
    parentId,
    color,
    colorName,
    // "ellipse" renders the box as an elliptical outline; absent stays a box.
    ...(shape === "ellipse" ? { shape: "ellipse" } : {}),
    ...(Array.isArray(points) && points.length > 0 ? { points: points.map((point) => ({ x: point.x, y: point.y })) } : {}),
  };
}

export function isRegionNode(node) {
  return node?.kind === NODE_KIND.REGION;
}

/**
 * A group: a folder in the layers panel, not a mark on the page.
 *
 * Membership is a `parentId` on each child, and children keep their
 * document-space coordinates — the group itself is never painted, hit-tested,
 * or exported, which is why neither renderer needs to know it exists. Its box
 * is the union of its members' boxes, kept for the layers panel and the
 * selection outline. Groups nest: a group's own `parentId` points at the
 * folder above it.
 */
export function createGroupNode({ x, y, width, height, parentId = null }) {
  return {
    ...getBaseDefaults(),
    id: newId(),
    kind: NODE_KIND.GROUP,
    x,
    y,
    width,
    height,
    parentId,
  };
}

export function isGroupNode(node) {
  return node?.kind === NODE_KIND.GROUP;
}

export function isBooleanNode(node) {
  return node?.kind === NODE_KIND.BOOLEAN;
}

export function isContainerNode(node) {
  return node?.kind === NODE_KIND.GROUP || node?.kind === NODE_KIND.BOOLEAN;
}

/** The direct children of a group or boolean node, in document (paint) order. */
export function groupChildren(doc, groupId) {
  return doc.nodes.filter((node) => node.parentId === groupId);
}

export function booleanChildren(doc, booleanId) {
  return doc.nodes.filter((node) => node.parentId === booleanId);
}

/** True when the node is a child of any boolean container. */
export function isInsideBooleanGroup(doc, node) {
  let current = node;
  const seen = new Set([node?.id]);
  while (current?.parentId && !seen.has(current.parentId)) {
    seen.add(current.parentId);
    const parent = findNode(doc, current.parentId);
    if (!parent) return false;
    if (parent.kind === NODE_KIND.BOOLEAN) return true;
    current = parent;
  }
  return false;
}

/**
 * Every node inside a group or boolean container, at any depth, in document order.
 * Nested containers appear too — their own members follow them in the walk.
 */
export function groupDescendants(doc, groupId) {
  const out = [];
  const walk = (id) => {
    for (const child of groupChildren(doc, id)) {
      out.push(child);
      if (isContainerNode(child)) walk(child.id);
    }
  };
  walk(groupId);
  return out;
}

/**
 * The topmost container (group or boolean) a node sits inside, or null when it lives at the root.
 * A malformed chain (a cycle, or a parent that is not a container) stops the walk
 * rather than looping forever.
 */
export function topLevelGroupOf(doc, node) {
  let current = node;
  const seen = new Set([node?.id]);
  while (current?.parentId) {
    if (seen.has(current.parentId)) return null;
    seen.add(current.parentId);
    const parent = findNode(doc, current.parentId);
    if (!isContainerNode(parent)) return null;
    current = parent;
  }
  return current === node ? null : current;
}

/** True when any folder above the node is hidden — the node paints nothing. */
export function isHiddenByGroup(doc, node) {
  let current = node;
  const seen = new Set();
  while (current?.parentId && !seen.has(current.parentId)) {
    seen.add(current.parentId);
    const parent = findNode(doc, current.parentId);
    if (!parent) return false;
    if (parent.visible === false) return true;
    current = parent;
  }
  return false;
}

/** True when any folder above the node is locked — the node must not move. */
export function isLockedByGroup(doc, node) {
  let current = node;
  const seen = new Set();
  while (current?.parentId && !seen.has(current.parentId)) {
    seen.add(current.parentId);
    const parent = findNode(doc, current.parentId);
    if (!parent) return false;
    if (parent.locked) return true;
    current = parent;
  }
  return false;
}

/**
 * A region's label, split into the name and the detail under it.
 *
 * One field holds both, rather than two fields holding one each: a region is
 * written in one go, in one box, and splitting the storage would mean a
 * second input, a second serialised field and a migration for every document
 * already written. The first line is the name — short enough to sit in the
 * chip on the canvas — and everything after it elaborates.
 *
 * Blank lines inside the detail are dropped, so a stray double return does
 * not reach the model as an empty instruction.
 */
export function regionParts(label) {
  const lines = String(label ?? "")
    .split("\n")
    .map((line) => line.trim());
  const name = lines.find(Boolean) ?? "";
  const detail = lines.slice(lines.indexOf(name) + 1).filter(Boolean);
  return { name, detail };
}

/** What the canvas chip shows: the name alone, however long the rest is. */
export function regionName(label) {
  return regionParts(label).name;
}

/**
 * The regions of a document as fractions of the page.
 *
 * Normalising here rather than at prompt time keeps the stored node data
 * independent of the picture's pixel size, so the instruction stays true after
 * the image is re-rendered at another resolution.
 */
export function regionsOf(doc) {
  if (!doc.width || !doc.height) return [];
  return doc.nodes.filter(isRegionNode).map((node, index) => {
    const colorInfo = node.color ? { hex: node.color, name: node.colorName || node.color } : getRegionColor(index);
    return {
      id: node.id,
      label: node.label ?? "",
      intent: normalizeRegionIntent(node.intent),
      color: colorInfo.hex,
      colorName: colorInfo.name,
      x: node.x / doc.width,
      y: node.y / doc.height,
      width: node.width / doc.width,
      height: node.height / doc.height,
    };
  });
}

/**
 * Every layer carrying a description, with its place on the page.
 *
 * Positions are fractions of the page rather than pixels, so the same layout
 * reads the same whatever size the document is — and the caller can describe
 * where something sits without knowing the resolution.
 *
 * Regions are excluded: they carry instructions through their own intent
 * ("put this here", "keep this clear"), and compiling them twice would say
 * the same thing in two voices.
 */
export function promptLayersOf(doc) {
  if (!doc.width || !doc.height) return [];
  return doc.nodes
    .filter((node) => !isRegionNode(node) && typeof node.prompt === "string" && node.prompt.trim().length > 0)
    .map((node) => ({
      kind: node.kind,
      prompt: node.prompt.trim(),
      x: node.x / doc.width,
      y: node.y / doc.height,
      width: node.width / doc.width,
      height: node.height / doc.height,
    }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * The image a rectangle is drawn over, or null when it covers none.
 *
 * Topmost wins, because that is the one the user can see under their box —
 * document order is bottom to top, so the search runs backwards. Overlap is
 * enough rather than containment: a region drawn slightly past an edge still
 * means the picture it mostly sits on.
 */
export function imageUnderRect(doc, rect) {
  if (!doc?.nodes || !rect) return null;
  for (let i = doc.nodes.length - 1; i >= 0; i -= 1) {
    const node = doc.nodes[i];
    if (node.kind !== NODE_KIND.IMAGE || node.visible === false) continue;
    const overlaps = rect.x < node.x + node.width && rect.x + rect.width > node.x && rect.y < node.y + node.height && rect.y + rect.height > node.y;
    if (overlaps) return node;
  }
  return null;
}

export function textLines(node) {
  return String(node.text ?? "").split("\n");
}
