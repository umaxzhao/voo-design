/**
 * Writes one VOO page as a native Figma document, reusing the schema and
 * version of the `.fig` it was opened from. Only what this editor can carry
 * into Figma is written: groups (as frames), rectangles, rounded rectangles
 * and ellipses with solid fills and strokes. Text is not written, because
 * Figma text needs glyph outlines this editor does not produce. Everything
 * else is reported by `figSaveLosses` before the file is written.
 */
import { parseGradient, isCssGradient } from "../color_picker/gradient_fill.js";
import { NODE_KIND } from "../editor/scene_doc_factory.js";

/** Layers written here live in their own session; the file's DOCUMENT and CANVAS use session 0. */
const LAYER_SESSION_ID = 1;
const DOCUMENT_GUID = { sessionID: 0, localID: 0 };
const CANVAS_GUID = { sessionID: 0, localID: 1 };
const IDENTITY = { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 };
const HEX_COLOR = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i;
/** Fractional positions are two printable characters, so this is the most siblings one parent can hold. */
const MAX_SIBLINGS = 94 * 94;

/** Message fields that describe the source file's own records; a new file must not carry them. */
const SOURCE_ONLY_MESSAGE_FIELDS = ["nodeChanges", "blobs", "nodeChangeOrder", "originFileKey", "ackID"];

const WRITABLE_KINDS = new Set([NODE_KIND.GROUP, NODE_KIND.RECT, NODE_KIND.ELLIPSE]);
/** Region nodes are slice markers for export, not design content. They are not reported as losses. */
const SILENT_KINDS = new Set([NODE_KIND.REGION]);

/** `#rrggbb` or `#rrggbbaa` as a Figma colour; null for anything else (including "transparent"). */
export function parseHexColor(value) {
  const match = typeof value === "string" ? HEX_COLOR.exec(value) : null;
  if (!match) return null;
  const hex = match[1];
  const channel = (offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255;
  const alpha = match[2] ? parseInt(match[2], 16) / 255 : 1;
  return { r: channel(0), g: channel(2), b: channel(4), a: alpha };
}

/** A solid paint for a VOO fill or stroke, or none. */
function solidPaints(value) {
  const color = parseHexColor(value);
  if (!color) return [];
  return [{ type: "SOLID", color: { r: color.r, g: color.g, b: color.b, a: 1 }, opacity: color.a, visible: true, blendMode: "NORMAL" }];
}

function paintOf(fill, opacity = 1, visible = true, blendMode = "source-over") {
  const blend = blendMode === "source-over" ? "NORMAL" : blendMode.replaceAll("-", "_").toUpperCase();
  if (!isCssGradient(fill)) return solidPaints(fill).map((paint) => ({
    ...paint, opacity: paint.opacity * opacity, visible, blendMode: blend,
  }));
  const gradient = parseGradient(fill);
  // Native Figma paints have no representation for the SVG mesh composite.
  // Report this through figSaveLosses instead of failing on absent ramp stops.
  if (gradient.type === "mesh") return [];
  const kinds = { linear: "GRADIENT_LINEAR", radial: "GRADIENT_RADIAL", angular: "GRADIENT_ANGULAR", diamond: "GRADIENT_DIAMOND" };
  const stops = gradient.stops.map((stop) => ({
    position: stop.position / 100,
    color: { ...parseHexColor(stop.color), a: (stop.opacity ?? 100) / 100 },
  }));
  const g = gradient.geometry ?? gradient;
  if (gradient.type !== "linear") {
    const width = (g.width ?? 100) / 100, height = (g.height ?? 100) / 100;
    return [{ type: kinds[gradient.type], stops, opacity, visible, blendMode: blend,
      transform: { m00: width, m10: 0, m01: 0, m11: height,
        m02: (g.centerX ?? 50) / 100 - width / 2, m12: (g.centerY ?? 50) / 100 - height / 2 } }];
  }
  if (g.startX === undefined) {
    const radians = parseFloat(gradient.angle) * Math.PI / 180;
    const dx = Math.sin(radians), dy = -Math.cos(radians);
    g.startX = 50 - dx * 50; g.endX = 50 + dx * 50;
    g.startY = 50 - dy * 50; g.endY = 50 + dy * 50;
  }
  const sx = (g.startX ?? 0) / 100, sy = (g.startY ?? 50) / 100;
  const ex = (g.endX ?? 100) / 100, ey = (g.endY ?? 50) / 100;
  const dx = ex - sx, dy = ey - sy;
  return [{ type: kinds[gradient.type] ?? kinds[gradient.kind] ?? "GRADIENT_LINEAR",
    stops, opacity, visible, blendMode: blend,
    transform: { m00: dx, m10: dy, m01: -dy, m11: dx, m02: sx + dy / 2, m12: sy - dx / 2 } }];
}

function fillsOf(node) {
  if (Array.isArray(node.fills)) return node.fills.flatMap((paint) =>
    paintOf(paint.fill, paint.opacity, paint.visible, paint.blendMode));
  return paintOf(node.fill, node.fillOpacity ?? 1, node.fillHidden !== true, node.fillBlendMode);
}

/** Whether a fill can be written: absent, transparent, or a plain hex colour. */
function hasSupportedFill(node) {
  const supported = (fill) => fill === undefined || fill === null || fill === "transparent" || parseHexColor(fill) !== null ||
    (isCssGradient(fill) && parseGradient(fill).type !== "mesh");
  return Array.isArray(node.fills) ? node.fills.every(paint => paint.visible === false || supported(paint.fill)) : node.fillHidden === true || supported(node.fill);
}

/** SVG meshes also have no native Figma stroke paint; do not silently omit them. */
function hasUnsupportedMeshStroke(node) {
  if (node.visible === false || node.opacity === 0) return false;
  const lost = (stroke) => stroke.visible !== false && stroke.strokeWidth > 0 &&
    stroke.strokeOpacity !== 0 && isCssGradient(stroke.stroke) && parseGradient(stroke.stroke).type === "mesh";
  return (node.strokeHidden !== true && lost(node)) || (node.strokes ?? []).some(lost);
}

function isWritable(node) {
  return WRITABLE_KINDS.has(node.kind);
}

/**
 * What a Figma save of this page would drop, as `{ key, params }` entries.
 * Kept next to `buildFigContainer` so the warning and the file never disagree.
 */
export function figSaveLosses(sceneDoc, { pageCount } = {}) {
  const losses = [];
  if (pageCount > 1) losses.push({ key: "save.loss.pages" });
  const nodes = sceneDoc?.nodes ?? [];
  const kinds = new Set(
    nodes
      .filter((node) => !isWritable(node) && !SILENT_KINDS.has(node.kind))
      .map((node) => node.kind),
  );
  if (kinds.size > 0) losses.push({ key: "fig.save.lossKinds", params: { kinds: [...kinds].join(", ") } });
  const unsupportedFills = nodes.filter((node) => isWritable(node) && (!hasSupportedFill(node) || hasUnsupportedMeshStroke(node))).length;
  if (unsupportedFills > 0) losses.push({ key: "fig.save.lossFills", params: { count: unsupportedFills } });
  return losses;
}

/** Figma's fractional position for the n-th sibling, in order. */
function positionKey(index) {
  if (index >= MAX_SIBLINGS) throw new Error("fig-too-many-siblings");
  return String.fromCharCode(33 + Math.floor(index / 94)) + String.fromCharCode(33 + (index % 94));
}

/** The nearest ancestor that is written as a Figma frame, or null for the page root. */
function writtenParentId(node, byId) {
  let id = node.parentId;
  while (id) {
    const parent = byId.get(id);
    if (!parent) return null;
    if (parent.kind === NODE_KIND.GROUP) return parent.id;
    id = parent.parentId;
  }
  return null;
}

function layerRecord({ guid, parentGuid, position, node, origin }) {
  const base = {
    guid,
    phase: "CREATED",
    parentIndex: { guid: parentGuid, position },
    name: node.name || "Layer",
    visible: node.visible !== false,
    opacity: Math.min(1, Math.max(0, node.opacity ?? 1)),
    size: { x: node.width, y: node.height },
    transform: { ...IDENTITY, m02: node.x - origin.x, m12: node.y - origin.y },
    strokeAlign: "INSIDE",
    strokeWeight: node.strokeWidth > 0 ? node.strokeWidth : 0,
    fillPaints: fillsOf(node),
    ...(node.maskBase ? { mask: true, maskType: node.maskType === "luminance" ? "LUMINANCE" : "ALPHA" } : {}),
    strokePaints: node.strokeWidth > 0 ? solidPaints(node.stroke) : [],
  };
  if (node.kind === NODE_KIND.GROUP) {
    return { ...base, type: "FRAME", frameMaskDisabled: true };
  }
  if (node.kind === NODE_KIND.ELLIPSE) {
    return { ...base, type: "ELLIPSE" };
  }
  if (node.cornerRadius > 0) {
    return { ...base, type: "ROUNDED_RECTANGLE", cornerRadius: node.cornerRadius };
  }
  return { ...base, type: "RECTANGLE" };
}

/**
 * Builds a container (`schema`, `version`, `message`) for one page. Children of
 * a group keep their absolute VOO position, converted to be relative to the frame.
 */
export function buildFigContainer(sceneDoc, template, { pageName = "Page 1" } = {}) {
  const nodes = sceneDoc?.nodes ?? [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const childrenOf = new Map();
  for (const node of nodes) {
    if (!isWritable(node)) continue;
    const key = writtenParentId(node, byId) ?? "";
    childrenOf.set(key, [...(childrenOf.get(key) ?? []), node]);
  }

  const layers = [];
  let nextLocalId = 1;
  const emitChildren = (parentKey, parentGuid, origin) => {
    (childrenOf.get(parentKey) ?? []).forEach((node, index) => {
      const guid = { sessionID: LAYER_SESSION_ID, localID: nextLocalId };
      nextLocalId += 1;
      layers.push(layerRecord({ guid, parentGuid, position: positionKey(index), node, origin }));
      if (node.kind === NODE_KIND.GROUP) emitChildren(node.id, guid, { x: node.x, y: node.y });
    });
  };
  emitChildren("", CANVAS_GUID, { x: 0, y: 0 });

  const background = parseHexColor(sceneDoc?.backgroundColor) ?? { r: 1, g: 1, b: 1, a: 1 };
  const document = {
    guid: DOCUMENT_GUID,
    phase: "CREATED",
    type: "DOCUMENT",
    name: "Document",
    visible: true,
    opacity: 1,
    transform: IDENTITY,
    documentColorProfile: "SRGB",
  };
  const canvas = {
    guid: CANVAS_GUID,
    phase: "CREATED",
    parentIndex: { guid: DOCUMENT_GUID, position: "!" },
    type: "CANVAS",
    name: pageName,
    visible: true,
    opacity: 1,
    transform: IDENTITY,
    backgroundOpacity: 1,
    backgroundColor: background,
    strokeWeight: 0,
    strokeAlign: "CENTER",
    strokeJoin: "BEVEL",
  };

  // Only the file's own envelope is kept; the layers, blobs and ids that pointed
  // at the source document are replaced, so nothing refers to records that are gone.
  const envelope = { ...(template.message ?? {}) };
  for (const key of SOURCE_ONLY_MESSAGE_FIELDS) delete envelope[key];
  return {
    version: template.version,
    schema: template.schema,
    message: { ...envelope, nodeChanges: [document, canvas, ...layers], blobs: [] },
  };
}
