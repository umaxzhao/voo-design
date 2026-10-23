/**
 * Maps a decoded Figma `Message` onto voo_design pages.
 *
 * Follows the structure of voo-canvas's MVP importer (figma-node-mapper.ts),
 * but emits this editor's scene nodes directly:
 *  - each top-level frame becomes one page sized to the frame, its background
 *    painted as the page's first layer;
 *  - loose top-level shapes share one page sized to their bounds;
 *  - frames and sections set a coordinate origin for their children; groups do
 *    not, matching Figma's own coordinate rules;
 *  - nested containers become group nodes, members link back through parentId;
 *  - rectangles, ellipses, text and image fills map to their editor nodes.
 *
 * Rotation, gradients, vector paths, boolean operations and effects degrade to
 * axis-aligned boxes; each approximated layer is counted in `warnings`.
 */

import { VOO_FILE_FORMAT } from "../../../electron/voo_format.js";
import { createDocument, createImageNode } from "../editor/scene_doc_factory.js";
import {
  createEllipseNode,
  createRectNode,
} from "../editor/scene_model_node_builders.js";
import { createGroupNode } from "../editor/scene_model_groups.js";
import { NODE_KIND } from "../editor/scene_model_core.js";
import { createTextNode } from "../editor/scene_model_text_effects.js";
import { imageBytesToDataUrl, parseFigFile } from "./fig-file.js";
import { isFigContainer, parseFigContainer } from "./fig-kiwi.js";
import { extractFigZip } from "./fig-zip-reader.js";
import { penNodeFromPathText, vectorToPenNode } from "./figma-path-nodes.js";
import { textOutlinePath } from "./figma-glyph-outline.js";
import { textStyleOf } from "./figma-text.js";
import { formatGradient } from "../color_picker/gradient_fill.js";
import { blendModeOf, effectsOf, paintBlendOf } from "./figma-effects.js";
import { expandInstances } from "./figma-instances.js";
import { BUNDLED_FONTS } from "../editor/font_loader.js";
import { isGoogleFamily } from "../editor/google_fonts_index.js";

/** Figma node types that act as containers with their own children. */
const CONTAINER_TYPES = new Set([
  "FRAME",
  "GROUP",
  "COMPONENT",
  "COMPONENT_SET",
  "INSTANCE",
  "SECTION",
  "SYMBOL",
]);
/** Containers whose children are positioned relative to them (groups are not). */
const COORDINATE_CONTAINER_TYPES = new Set([
  "FRAME",
  "COMPONENT",
  "COMPONENT_SET",
  "INSTANCE",
  "SECTION",
  "SYMBOL",
]);
/** Types whose geometry is a path; decoded to pen paths, with a box as the fallback. */
const VECTOR_TYPES = new Set(["VECTOR", "LINE", "STAR", "POLYGON", "REGULAR_POLYGON", "BOOLEAN_OPERATION", "BRUSH"]);
const RECT_TYPES = new Set(["RECTANGLE", "ROUNDED_RECTANGLE"]);
const ELLIPSE_TYPES = new Set(["ELLIPSE"]);
/** Structural records that never map to a layer. */
const STRUCTURAL_TYPES = new Set(["DOCUMENT", "CANVAS", "SLICE"]);

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Uint8Array)
    ? value
    : null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asNumber(value, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function channelHex(unit) {
  const clamped = Math.min(1, Math.max(0, unit));
  return Math.round(clamped * 255).toString(16).padStart(2, "0");
}

/** A CANVAS record's page background as opaque hex, or null when it has none. */
function canvasBackgroundHex(raw) {
  const color = asObject(raw?.backgroundColor);
  if (!color) return null;
  return `#${channelHex(asNumber(color.r))}${channelHex(asNumber(color.g))}${channelHex(asNumber(color.b))}`;
}

function guidKey(guid) {
  const value = asObject(guid);
  return value ? `${asNumber(value.sessionID)}:${asNumber(value.localID)}` : null;
}

function hashHex(hash) {
  if (!(hash instanceof Uint8Array) || hash.length === 0) return null;
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** First visible solid paint as `#rrggbb` (or `#rrggbbaa` when translucent). */
function solidPaintHex(paints) {
  for (const entry of asArray(paints)) {
    const paint = asObject(entry);
    if (!paint || paint.visible === false || paint.type !== "SOLID") continue;
    const color = asObject(paint.color);
    if (!color) continue;
    const alpha = asNumber(color.a, 1) * asNumber(paint.opacity, 1);
    const rgb = `#${channelHex(asNumber(color.r))}${channelHex(asNumber(color.g))}${channelHex(asNumber(color.b))}`;
    return alpha >= 0.999 ? rgb : `${rgb}${channelHex(alpha)}`;
  }
  return null;
}

/** Figma gradient paint types the editor can draw, mapped to the editor gradient kind. */
const GRADIENT_KINDS = Object.freeze({
  GRADIENT_LINEAR: "linear",
  GRADIENT_RADIAL: "radial",
  GRADIENT_ANGULAR: "angular",
  GRADIENT_DIAMOND: "diamond",
});

/** Converts one gradient stop; stops without a colour are dropped. */
function gradientStopOf(stop) {
  const color = asObject(stop?.color);
  if (!color) return null;
  const rgb = `#${channelHex(asNumber(color.r))}${channelHex(asNumber(color.g))}${channelHex(asNumber(color.b))}`;
  return {
    color: rgb,
    opacity: asNumber(color.a, 1) * 100,
    position: asNumber(stop.position) * 100,
  };
}

/**
 * The editor CSS gradient for the first visible gradient paint, or null.
 *
 * Figma places a gradient with a transform from its unit space to the node box;
 * the gradient axis runs from (0, 0.5) to (1, 0.5) in that space. Linear
 * gradients keep that axis as their start and end points (percent of the box),
 * so the editor draws the same direction the designer set.
 */
function gradientPaintFill(paints) {
  for (const entry of asArray(paints)) {
    const paint = asObject(entry);
    if (!paint || paint.visible === false) continue;
    const kind = GRADIENT_KINDS[paint.type];
    if (!kind) continue;
    // Decoded paints carry the stops as `stops`; older exports name them `gradientStops`.
    const stops = asArray(paint.stops ?? paint.gradientStops).map(gradientStopOf).filter(Boolean);
    if (stops.length < 2) continue;
    const matrix = asObject(paint.transform) ?? {};
    const m = (key, fallback) => asNumber(matrix[key], fallback);
    if (kind === "linear") {
      const geometry = {
        centerX: 50,
        centerY: 50,
        startX: (m("m02", 0) + m("m01", 0) * 0.5) * 100,
        startY: (m("m12", 0) + m("m11", 1) * 0.5) * 100,
        endX: (m("m00", 1) + m("m01", 0) * 0.5 + m("m02", 0)) * 100,
        endY: (m("m10", 0) + m("m11", 1) * 0.5 + m("m12", 0)) * 100,
      };
      return formatGradient("linear", "90deg", stops, geometry);
    }
    const geometry = {
      centerX: (m("m02", 0) + (m("m00", 1) + m("m01", 0)) / 2) * 100,
      centerY: (m("m12", 0) + (m("m10", 0) + m("m11", 1)) / 2) * 100,
      width: 100,
      height: 100,
    };
    return formatGradient(kind, "0deg", stops, geometry);
  }
  return null;
}

/** The first visible image paint, if any. */
function imagePaint(paints) {
  for (const entry of asArray(paints)) {
    const paint = asObject(entry);
    if (paint && paint.visible !== false && paint.type === "IMAGE") return paint;
  }
  return null;
}

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
    type: asString(change.type, "NONE"),
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
function buildTopLevel(message) {
  const nodes = new Map();
  for (const entry of expandInstances(asArray(message.nodeChanges))) {
    const change = asObject(entry);
    const node = change ? readNode(change) : null;
    if (node) nodes.set(node.key, node);
  }
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

function applyCommon(node, ctx, layer) {
  const opacity = asNumber(node.raw.opacity, 1);
  if (opacity < 1) layer.opacity = Math.max(0, opacity);
  if (node.raw.visible === false) layer.visible = false;
  layer.blendMode = blendModeOf(node.raw);
  if (layer.blendMode === "source-over") {
    layer.blendMode = paintBlendOf(node.raw) ?? "source-over";
  }
  const { effects, layerBlur, backgroundBlur, noise } = effectsOf(node.raw);
  if (effects) layer.effects = effects;
  if (layerBlur > 0) layer.layerBlur = layerBlur;
  if (backgroundBlur > 0) layer.backgroundBlur = backgroundBlur;
  if (noise) layer.noise = noise;
  return layer;
}

function noteFont(ctx, font) {
  const entry = ctx.fonts.get(font.family) ?? { family: font.family, styles: new Set(), count: 0 };
  entry.styles.add(font.style);
  entry.count += 1;
  ctx.fonts.set(font.family, entry);
}

function note(ctx, message) {
  ctx.warnings.set(message, (ctx.warnings.get(message) ?? 0) + 1);
}

/** A single painted leaf: text, image, ellipse or rectangle (approximations included). */
function buildLeaf(node, box, ctx) {
  const fills = node.raw.fillPaints;
  const strokes = node.raw.strokePaints;
  if (node.type === "TEXT") {
    const text = asString(asObject(node.raw.textData)?.characters);
    if (!text) return null;
    const fontSize = asNumber(node.raw.fontSize, 0) > 0 ? asNumber(node.raw.fontSize) : undefined;
    const style = textStyleOf(node.raw, fontSize);
    noteFont(ctx, style.figmaFont);
    // Glyph outlines carry Figma's own layout, so the text looks as designed
    // whether or not its font is installed here.
    const outline = penNodeFromPathText(
      textOutlinePath(node.raw, ctx.blobs),
      box,
      { fill: solidPaintHex(fills) ?? "#000000", stroke: "transparent", strokeWidth: 0 },
      { filled: true, fillRule: "nonzero" },
    );
    if (outline) return applyCommon(node, ctx, { ...outline, name: node.name, figmaText: text });
    const { figmaFont, ...fields } = style;
    return applyCommon(node, ctx, {
      ...createTextNode({
        x: box.x,
        y: box.y,
        text,
        fill: solidPaintHex(fills) ?? "#000000",
        fontSize,
      }),
      ...fields,
      figmaFont,
      name: node.name,
    });
  }

  const image = imagePaint(fills);
  if (image) {
    const imageId = hashHex(asObject(image.image)?.hash);
    const bytes = imageId ? ctx.images.get(imageId) : undefined;
    if (bytes) {
      const assetId = `img-${imageId}`;
      ctx.assets[assetId] = imageBytesToDataUrl(bytes);
      return applyCommon(node, ctx, { ...createImageNode({ ...box, imageId: assetId, name: node.name }) });
    }
    note(ctx, "image-fill-missing");
  }

  if (VECTOR_TYPES.has(node.type)) {
    const pen = vectorToPenNode(node.raw, box, ctx.blobs, vectorColors(node.raw));
    if (pen) return applyCommon(node, ctx, { ...pen, name: node.name });
    note(ctx, `approximated:${node.type}`);
  }

  const fill = solidPaintHex(fills) ?? gradientPaintFill(fills) ?? "transparent";
  const strokeColor = solidPaintHex(strokes);
  const stroke = strokeColor ?? "transparent";
  const strokeWidth = strokeColor && asNumber(node.raw.strokeWeight) > 0 ? asNumber(node.raw.strokeWeight) : 0;

  if (ELLIPSE_TYPES.has(node.type)) {
    return applyCommon(node, ctx, { ...createEllipseNode({ ...box, fill, stroke, strokeWidth }), name: node.name });
  }

  if (!RECT_TYPES.has(node.type) && !CONTAINER_TYPES.has(node.type) && !VECTOR_TYPES.has(node.type)) {
    note(ctx, `approximated:${node.type}`);
  }
  const rect = createRectNode({ ...box, fill, stroke, strokeWidth });
  const radius = asNumber(node.raw.cornerRadius);
  if (radius > 0) rect.cornerRadius = radius;
  return applyCommon(node, ctx, { ...rect, name: node.name });
}

/**
 * Colours for a decoded vector. Geometry that already carries Figma's stroke
 * outline is one filled region: a stroke-only outline takes the stroke colour,
 * a filled shape keeps its fill colour.
 */
function vectorColors(raw) {
  const fillColor = solidPaintHex(raw.fillPaints);
  const strokeColor = solidPaintHex(raw.strokePaints);
  const hasFill = asArray(raw.fillGeometry).length > 0;
  const hasOutline = hasFill || asArray(raw.strokeGeometry).length > 0;
  if (hasOutline) {
    const color = hasFill ? fillColor ?? strokeColor : strokeColor ?? fillColor;
    return { fill: color ?? "transparent", stroke: "transparent", strokeWidth: 0 };
  }
  return {
    fill: fillColor ?? "transparent",
    stroke: strokeColor ?? "transparent",
    strokeWidth: strokeColor && asNumber(raw.strokeWeight) > 0 ? asNumber(raw.strokeWeight) : 0,
  };
}

function hasOwnPaint(node) {
  return solidPaintHex(node.raw.fillPaints) !== null || solidPaintHex(node.raw.strokePaints) !== null || imagePaint(node.raw.fillPaints) !== null;
}

function isFrameContainer(type) {
  return (
    type === "FRAME" ||
    type === "COMPONENT" ||
    type === "COMPONENT_SET" ||
    type === "INSTANCE" ||
    type === "SECTION" ||
    type === "SYMBOL"
  );
}

/**
 * Emits one node and its subtree into `out`, preserving Frame vs Group semantics
 * and full multi-level container nesting. `originX/Y` is the coordinate origin
 * of the node's parent space; `parentId` links to a parent Frame or Group.
 */
/**
 * A Figma mask is a node flagged `mask: true`. Only leaf shapes mask: a frame's
 * `maskType` is a clip of its own children, which the editor already does with
 * `clipContent`.
 */
function isMaskLeaf(node) {
  return node.raw.mask === true && !CONTAINER_TYPES.has(node.type);
}

/**
 * Emits a container's children in stacking order. A Figma mask clips the
 * siblings above it (up to the next mask), and the editor's `clipTo` needs its
 * clip base below the layers it clips, which is the order Figma already gives.
 * Each covered sibling therefore points `clipTo` at the mask.
 */
function emitChildren(children, originX, originY, parentId, out, ctx) {
  let activeMask = null;
  for (const child of children) {
    if (isMaskLeaf(child)) {
      const before = out.length;
      emitNode(child, originX, originY, parentId, out, ctx);
      activeMask = out[before] ?? null;
      if (activeMask) {
        activeMask.maskBase = true;
        // NodeChange.maskType is the MaskType enum: ALPHA, OUTLINE, LUMINANCE.
        if (child.raw.maskType === "LUMINANCE") activeMask.maskType = "luminance";
        note(ctx, "mask-applied");
      }
      continue;
    }
    const before = out.length;
    emitNode(child, originX, originY, parentId, out, ctx);
    if (!activeMask) continue;
    for (const emitted of out.slice(before)) {
      if (emitted.kind !== NODE_KIND.GROUP) emitted.clipTo = activeMask.id;
    }
  }
}

function emitNode(node, originX, originY, parentId, out, ctx) {
  const absX = originX + node.x;
  const absY = originY + node.y;
  const box = { x: absX, y: absY, width: node.w, height: node.h };
  const childOriginX = COORDINATE_CONTAINER_TYPES.has(node.type) ? absX : originX;
  const childOriginY = COORDINATE_CONTAINER_TYPES.has(node.type) ? absY : originY;

  if (CONTAINER_TYPES.has(node.type) && node.children.length > 0) {
    const isFrame = isFrameContainer(node.type);
    const group = applyCommon(node, ctx, {
      ...createGroupNode({ ...box, parentId: parentId ?? null }),
      name: node.name,
      isFrame,
      frame: isFrame,
      containerType: isFrame ? "frame" : "group",
      ...(isFrame && asNumber(node.raw.cornerRadius) > 0 ? { cornerRadius: asNumber(node.raw.cornerRadius) } : {}),
      ...(isFrame && node.raw.clipContent !== false ? { clipContent: true } : {}),
    });
    out.push(group);
    if (hasOwnPaint(node)) {
      const painted = buildLeaf(node, box, ctx);
      if (painted) {
        out.push({
          ...painted,
          parentId: group.id,
          name: isFrame ? `${node.name} Background` : node.name,
          isFrameBackground: isFrame,
        });
      }
    }
    emitChildren(node.children, childOriginX, childOriginY, group.id, out, ctx);
    return;
  }

  if (CONTAINER_TYPES.has(node.type)) {
    const isFrame = isFrameContainer(node.type);
    const group = applyCommon(node, ctx, {
      ...createGroupNode({ ...box, parentId: parentId ?? null }),
      name: node.name,
      isFrame,
      frame: isFrame,
      containerType: isFrame ? "frame" : "group",
      ...(isFrame && asNumber(node.raw.cornerRadius) > 0 ? { cornerRadius: asNumber(node.raw.cornerRadius) } : {}),
      ...(isFrame && node.raw.clipContent !== false ? { clipContent: true } : {}),
    });
    out.push(group);
    if (hasOwnPaint(node)) {
      const painted = buildLeaf(node, box, ctx);
      if (painted) {
        out.push({
          ...painted,
          parentId: group.id,
          name: isFrame ? `${node.name} Background` : node.name,
          isFrameBackground: isFrame,
        });
      }
    }
    return;
  }

  const leaf = buildLeaf(node, box, ctx);
  if (!leaf) return;
  leaf.parentId = parentId ?? null;
  out.push(leaf);
  for (const extra of extraPaintLayers(node, box, leaf.kind)) {
    extra.parentId = parentId ?? null;
    out.push(extra);
  }
}

/**
 * Figma stacks several fill paints on one layer, each with its own blend mode and
 * opacity; the editor has one fill per node. The first paint is the node itself,
 * and every further visible solid paint becomes its own node stacked above it.
 * Only rectangles and ellipses are split: a vector path already draws all paints.
 */
function extraPaintLayers(node, box, kind) {
  if (kind !== "rect" && kind !== "ellipse") return [];
  const solids = asArray(node.raw.fillPaints).filter(
    (paint) => asObject(paint) && paint.visible !== false && paint.type === "SOLID",
  );
  return solids.slice(1).map((paint) => {
    // The paint's opacity goes on the layer below, so the colour is read alone.
    const fill = solidPaintHex([{ ...paint, opacity: 1 }]) ?? "transparent";
    const layer =
      kind === "ellipse"
        ? createEllipseNode({ ...box, fill, stroke: "transparent", strokeWidth: 0 })
        : createRectNode({ ...box, fill, stroke: "transparent", strokeWidth: 0 });
    const opacity = asNumber(paint.opacity, 1);
    if (opacity < 1) layer.opacity = Math.max(0, opacity);
    layer.blendMode = blendModeOf(paint);
    layer.name = node.name;
    return layer;
  });
}

/**
 * Emits one top-level object of a Figma page.
 * Keeps Frames as Frames and Groups as Groups, with all multi-level children
 * nested cleanly under their parentId rather than being flattened or forced into
 * an unwanted single wrapper. Symbol definitions put layers directly on the page.
 */
function emitPageRoot(root, originX, originY, out, ctx) {
  if (root.type === "SYMBOL") {
    const absX = originX + root.x;
    const absY = originY + root.y;
    for (const child of root.children) {
      emitNode(child, absX, absY, null, out, ctx);
    }
    return;
  }
  emitNode(root, originX, originY, null, out, ctx);
}

function canvasPage(roots, label, ctx, background = "transparent") {
  const minX = roots.length > 0 ? Math.min(...roots.map((node) => node.x)) : 0;
  const minY = roots.length > 0 ? Math.min(...roots.map((node) => node.y)) : 0;
  const maxX = roots.length > 0 ? Math.max(...roots.map((node) => node.x + node.w)) : 0;
  const maxY = roots.length > 0 ? Math.max(...roots.map((node) => node.y + node.h)) : 0;
  const nodes = [];
  for (const root of roots) emitPageRoot(root, -minX, -minY, nodes, ctx);
  return { label, width: maxX - minX, height: maxY - minY, nodes, left: minX, top: minY, background };
}

/**
 * Fonts the file uses, most used first. `available` marks families the editor
 * can load: bundled ones, and Google Fonts fetched on demand. The rest render with
 * a fallback face until the designer installs them.
 */
function fontSummary(fonts) {
  return [...fonts.values()]
    .map((entry) => ({
      family: entry.family,
      styles: [...entry.styles],
      count: entry.count,
      available: BUNDLED_FONTS.some((font) => font.family === entry.family) || isGoogleFamily(entry.family),
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Maps a decoded message to editor pages. Returns null when the file holds no
 * mappable layers, so the caller can report an empty import instead of
 * opening a blank document.
 *
 * @param {object} message decoded Kiwi `Message` (`nodeChanges` etc.)
 * @param {Map<string, Uint8Array>} images archive images keyed by content hash
 */
export function figmaMessageToPages(message, images = new Map()) {
  const ctx = { images, assets: {}, warnings: new Map(), blobs: asArray(message.blobs), fonts: new Map() };
  const { roots, canvases } = buildTopLevel(message);
  const byCanvas = new Map();
  for (const root of roots) {
    const key = root.canvasKey ?? "";
    byCanvas.set(key, [...(byCanvas.get(key) ?? []), root]);
  }
  const names = new Map(canvases.map((canvas) => [canvas.key, canvas.name]));
  const backgrounds = new Map(canvases.map((canvas) => [canvas.key, canvas.background]));
  const order = [...canvases.map((canvas) => canvas.key), ""];
  // One editor page per Figma canvas: its frames and loose shapes share one page.
  const pages = order
    .filter((key) => byCanvas.has(key))
    .map((key) => canvasPage(byCanvas.get(key), names.get(key) || "Page 1", ctx, backgrounds.get(key) ?? "transparent"));
  if (pages.length === 0) return null;

  const layerCount = pages.reduce((total, page) => total + page.nodes.length, 0);
  return {
    pages: pages.map((page) => ({
      ...page,
      width: Math.max(1, Math.round(page.width)),
      height: Math.max(1, Math.round(page.height)),
    })),
    assets: ctx.assets,
    layerCount,
    warnings: [...ctx.warnings].map(([message, count]) => ({ message, count })),
    fonts: fontSummary(ctx.fonts),
  };
}

/**
 * Builds the `.voo` v2 envelope for a mapped Figma file, shaped the way
 * `saveVooProject` writes a multi-page document, so the same open path loads it.
 */
/**
 * Prunes redundant AST fields (nodeChanges, blobs, etc.) from figSource.message
 * to save tens of megabytes during postMessage structured cloning and memory retention.
 * (voo-to-fig.js does not use these fields when saving).
 */
export function pruneFigSource(figSource) {
  if (!figSource || typeof figSource !== "object") return figSource;
  const message = { ...(figSource.message ?? {}) };
  delete message.nodeChanges;
  delete message.blobs;
  delete message.nodeChangeOrder;
  delete message.originFileKey;
  delete message.ackID;
  return {
    version: figSource.version,
    schema: figSource.schema,
    message,
  };
}

/**
 * Parses `.fig` bytes with progressive streaming events and yields.
 * Emits progress, headers, image asset buffers, and node chunks.
 */
export async function figBytesToVooFileStreaming(bytes, options = {}) {
  const {
    onProgress = null,
    onHeader = null,
    onAsset = null,
    onChunk = null,
    chunkSize = 800,
  } = options;

  // 1. Unpacking stage (0% - 20%)
  if (onProgress) {
    onProgress({ stage: "unpacking", percent: 5, message: "Unpacking Figma archive..." });
  }

  let canvas = bytes;
  let images = new Map();
  const isZip =
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04;

  if (isZip) {
    const archive = await extractFigZip(bytes, ({ current, total }) => {
      if (onProgress) {
        const pct = Math.min(20, Math.round(5 + (15 * current) / Math.max(1, total)));
        onProgress({ stage: "unpacking", percent: pct, message: `Extracting archive entry ${current}/${total}...` });
      }
    });
    canvas = archive.canvas;
    images = archive.images;
  }

  if (onProgress) {
    onProgress({ stage: "unpacking", percent: 20, message: "Archive unpacked" });
  }

  // Stream image assets if onAsset callback provided
  if (onAsset && images.size > 0) {
    for (const [hash, imgBytes] of images) {
      const assetId = `img-${hash}`;
      const copy = imgBytes.buffer.slice(
        imgBytes.byteOffset,
        imgBytes.byteOffset + imgBytes.byteLength,
      );
      onAsset({ assetId, buffer: copy });
    }
  }

  // 2. Kiwi decoding stage (20% - 50%)
  if (onProgress) {
    onProgress({ stage: "kiwi", percent: 25, message: "Decoding Kiwi schema & AST..." });
  }

  if (!isFigContainer(canvas)) {
    throw new Error("Unsupported file: expected a native Figma .fig document");
  }

  const parsed = await parseFigContainer(canvas);

  if (onProgress) {
    onProgress({ stage: "kiwi", percent: 45, message: "Kiwi container decoded" });
  }

  // Yield to keep thread responsive
  await new Promise((resolve) => setTimeout(resolve, 0));

  // 3. Topology & instance indexing stage (50% - 65%)
  if (onProgress) {
    onProgress({ stage: "topology", percent: 50, message: "Indexing instances & tree hierarchy..." });
  }

  const message = parsed.message;
  const ctx = { images, assets: {}, warnings: new Map(), blobs: asArray(message?.blobs), fonts: new Map() };
  const { roots, canvases } = buildTopLevel(message);
  const byCanvas = new Map();
  for (const root of roots) {
    const key = root.canvasKey ?? "";
    byCanvas.set(key, [...(byCanvas.get(key) ?? []), root]);
  }
  const names = new Map(canvases.map((canvas) => [canvas.key, canvas.name]));
  const backgrounds = new Map(canvases.map((canvas) => [canvas.key, canvas.background]));
  const order = [...canvases.map((canvas) => canvas.key), ""];
  const activeKeys = order.filter((key) => byCanvas.has(key));

  if (activeKeys.length === 0) {
    throw new Error("figma-no-layers");
  }

  const pagesMeta = activeKeys.map((key) => {
    const canvasRoots = byCanvas.get(key) || [];
    const minX = canvasRoots.length > 0 ? Math.min(...canvasRoots.map((n) => n.x)) : 0;
    const minY = canvasRoots.length > 0 ? Math.min(...canvasRoots.map((n) => n.y)) : 0;
    const maxX = canvasRoots.length > 0 ? Math.max(...canvasRoots.map((n) => n.x + n.w)) : 0;
    const maxY = canvasRoots.length > 0 ? Math.max(...canvasRoots.map((n) => n.y + n.h)) : 0;
    const width = Math.max(1, Math.round(maxX - minX));
    const height = Math.max(1, Math.round(maxY - minY));
    return {
      id: crypto.randomUUID(),
      key,
      label: names.get(key) || "Page 1",
      background: backgrounds.get(key) ?? "transparent",
      minX,
      minY,
      width,
      height,
      roots: canvasRoots,
    };
  });

  if (onProgress) {
    onProgress({ stage: "topology", percent: 60, message: "Page topology ready" });
  }

  // Emit PAGE_HEADER
  if (onHeader) {
    onHeader(
      pagesMeta.map((p) => ({
        id: p.id,
        name: p.label,
        bounds: { x: p.minX, y: p.minY, width: p.width, height: p.height },
      })),
    );
  }

  // 4. Node mapping & chunk streaming (65% - 95%)
  if (onProgress) {
    onProgress({ stage: "nodes", percent: 65, message: "Mapping scene nodes..." });
  }

  const pages = [];
  let totalLayerCount = 0;

  for (let pIdx = 0; pIdx < pagesMeta.length; pIdx++) {
    const meta = pagesMeta[pIdx];
    const pageNodes = [];
    for (const root of meta.roots) {
      emitPageRoot(root, -meta.minX, -meta.minY, pageNodes, ctx);
    }
    totalLayerCount += pageNodes.length;

    if (pageNodes.length === 0) {
      if (onChunk) {
        onChunk({
          pageId: meta.id,
          nodes: [],
          isFirstScreen: pIdx === 0,
        });
      }
    } else {
      for (let i = 0; i < pageNodes.length; i += chunkSize) {
        const chunk = pageNodes.slice(i, i + chunkSize);
        const isFirstScreen = pIdx === 0 && i === 0;
        if (onChunk) {
          onChunk({
            pageId: meta.id,
            nodes: chunk,
            isFirstScreen,
          });
        }

        // Yield to event loop every chunk (every 500-1000 nodes)
        await new Promise((resolve) => setTimeout(resolve, 0));

        if (onProgress) {
          const pct = Math.min(
            95,
            Math.round(65 + (30 * (i + chunk.length)) / Math.max(1, pageNodes.length)),
          );
          onProgress({
            stage: "nodes",
            percent: pct,
            message: `Converting scene nodes (${totalLayerCount} layers)...`,
          });
        }
      }
    }

    const sceneDoc = createDocument(meta.width, meta.height, meta.background);
    sceneDoc.nodes = pageNodes;
    pages.push({
      id: meta.id,
      label: meta.label,
      canvasType: "design",
      sceneDoc,
      layout: null,
      left: meta.minX,
      top: meta.minY,
    });
  }

  // 5. Finalizing VOO envelope (95% - 100%)
  if (onProgress) {
    onProgress({ stage: "nodes", percent: 98, message: "Finalizing VOO document..." });
  }

  const placed = pages.filter((page) => Number.isFinite(page.left) && Number.isFinite(page.top));
  const minLeft = Math.min(...placed.map((page) => page.left), 0);
  const minTop = Math.min(...placed.map((page) => page.top), 0);
  const editorArtboardLayouts = {};
  for (const page of pages) {
    if (!Number.isFinite(page.left) || !Number.isFinite(page.top)) continue;
    editorArtboardLayouts[page.id] = {
      x: Math.round(page.left - minLeft),
      y: Math.round(page.top - minTop),
      width: page.sceneDoc.width,
      height: page.sceneDoc.height,
    };
    delete page.left;
    delete page.top;
  }

  const document = {
    ...pages[0].sceneDoc,
    pages,
    editorArtboardLayouts,
    editorCamera: { panX: 0, panY: 0, zoom: 1 },
    editingNodeId: pages[0].id,
  };

  const vooFile = {
    format: VOO_FILE_FORMAT,
    version: 2,
    kind: "design",
    document,
    assets: ctx.assets,
  };

  const figSource = pruneFigSource({
    version: parsed.version,
    schema: parsed.schema,
    message: parsed.message,
  });

  const warnings = [...ctx.warnings].map(([msg, count]) => ({ message: msg, count }));
  const fonts = fontSummary(ctx.fonts);

  if (onProgress) {
    onProgress({ stage: "nodes", percent: 100, message: "Import complete" });
  }

  return {
    vooFile,
    layerCount: totalLayerCount,
    warnings,
    fonts,
    figSource,
  };
}

/**
 * Parses `.fig` bytes and returns the `.voo` envelope for them. Fails fast with
 * `figma-no-layers` when the file holds nothing that maps to a layer.
 */
export async function figBytesToVooFile(bytes) {
  return figBytesToVooFileStreaming(bytes);
}

export function figmaMessageToVooFile(message, images) {
  const mapped = figmaMessageToPages(message, images);
  if (!mapped) return null;

  const pages = mapped.pages.map((page) => {
    const sceneDoc = createDocument(page.width, page.height, page.background ?? "transparent");
    sceneDoc.nodes = page.nodes;
    return { id: crypto.randomUUID(), label: page.label, canvasType: "design", sceneDoc, layout: null, left: page.left, top: page.top };
  });
  // Keep each frame where it sat on the Figma canvas, relative to the top-left-most frame.
  const placed = pages.filter((page) => Number.isFinite(page.left) && Number.isFinite(page.top));
  const minLeft = Math.min(...placed.map((page) => page.left), 0);
  const minTop = Math.min(...placed.map((page) => page.top), 0);
  const editorArtboardLayouts = {};
  for (const page of pages) {
    if (!Number.isFinite(page.left) || !Number.isFinite(page.top)) continue;
    editorArtboardLayouts[page.id] = {
      x: Math.round(page.left - minLeft),
      y: Math.round(page.top - minTop),
      width: page.sceneDoc.width,
      height: page.sceneDoc.height,
    };
    delete page.left;
    delete page.top;
  }
  const document = {
    ...pages[0].sceneDoc,
    pages,
    editorArtboardLayouts,
    editorCamera: { panX: 0, panY: 0, zoom: 1 },
    editingNodeId: pages[0].id,
  };

  return {
    vooFile: {
      format: VOO_FILE_FORMAT,
      version: 2,
      kind: "design",
      document,
      assets: mapped.assets,
    },
    layerCount: mapped.layerCount,
    warnings: mapped.warnings,
    fonts: mapped.fonts,
  };
}
