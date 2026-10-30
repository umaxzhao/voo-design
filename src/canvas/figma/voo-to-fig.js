/**
 * Writes one VOO page as a native Figma document, reusing the schema and
 * version of the `.fig` it was opened from. Editable layers are serialized
 * using the same Kiwi records the importer reads; unsupported layer kinds are
 * reported by `figSaveLosses` before the file is written.
 */
import { parseGradient, isCssGradient } from "../color_picker/gradient_fill.js";
import { NODE_KIND } from "../editor/scene_doc_factory.js";
import { bytesToBase64 } from "../../shared/base64.js";
import { pathData } from "../editor/editor_svg_shapes.js";
import { parseFigmaPathContours } from "./figma-path-nodes.js";

/** Layers written here live in their own session; the file's DOCUMENT and CANVAS use session 0. */
const LAYER_SESSION_ID = 1;
const DOCUMENT_GUID = { sessionID: 0, localID: 0 };
const CANVAS_GUID = { sessionID: 0, localID: 1 };
const IDENTITY = { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 };
const HEX_COLOR = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i;
/** Fractional positions are two printable characters, so this is the most siblings one parent can hold. */
const MAX_SIBLINGS = 94 * 94;

const WRITABLE_KINDS = new Set([NODE_KIND.GROUP, NODE_KIND.RECT, NODE_KIND.ELLIPSE, NODE_KIND.TEXT, NODE_KIND.IMAGE, NODE_KIND.PATH]);
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

function paintOf(fill, opacity = 1, visible = true, blendMode = "source-over", imageAsset = null) {
  const blend = blendMode === "source-over" ? "NORMAL" : blendMode.replaceAll("-", "_").toUpperCase();
  if (imageAsset) {
    return [{
      type: "IMAGE",
      opacity,
      visible,
      blendMode: blend,
      transform: IDENTITY,
      image: { hash: imageAsset.hash, name: imageAsset.name ?? "Image" },
      imageScaleMode: "FILL",
      imageShouldColorManage: true,
      originalImageWidth: imageAsset.width ?? 0,
      originalImageHeight: imageAsset.height ?? 0,
    }];
  }
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

function fillsOf(node, imageAssets) {
  if (node.kind === NODE_KIND.IMAGE && node.imageId) {
    return paintOf(null, 1, true, node.blendMode, imageAssets.get(node.imageId));
  }
  if (Array.isArray(node.fills)) return node.fills.flatMap((paint) =>
    paintOf(paint.fill, paint.opacity, paint.visible, paint.blendMode, imageAssets.get(paint.imageId)));
  return paintOf(node.fill, node.fillOpacity ?? 1, node.fillHidden !== true, node.fillBlendMode,
    imageAssets.get(node.imageId));
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

function layerRecord({ guid, parentGuid, position, node, origin, imageAssets, blobs }) {
  const isText = node.kind === NODE_KIND.TEXT;
  const fontName = isText ? figmaFontName(node) : null;
  const fontSize = Math.max(1, node.fontSize ?? 16);
  const base = {
    guid,
    phase: "CREATED",
    parentIndex: { guid: parentGuid, position },
    name: node.name || "Layer",
    visible: node.visible !== false,
    opacity: Math.min(1, Math.max(0, node.opacity ?? 1)),
    size: {
      x: isText && node.boxWidth > 0 ? node.boxWidth : Math.max(1, node.width),
      y: isText ? Math.max(node.height, fontSize * 1.2, 1) : node.height,
    },
    transform: { ...IDENTITY, m02: node.x - origin.x, m12: node.y - origin.y },
    strokeAlign: "INSIDE",
    strokeWeight: node.strokeWidth > 0 ? node.strokeWidth : 0,
    fillPaints: fillsOf(node, imageAssets),
    ...(node.maskBase ? { mask: true, maskType: node.maskType === "luminance" ? "LUMINANCE" : "ALPHA" } : {}),
    strokePaints: node.strokeWidth > 0 ? solidPaints(node.stroke) : [],
  };
  if (isText) {
    return {
      ...base,
      type: "TEXT",
      fontSize,
      fontName: { ...fontName, postscript: node.figmaFont?.postscript ?? "" },
      textData: { characters: String(node.text ?? "") },
      textAlignHorizontal: ({ left: "LEFT", center: "CENTER", right: "RIGHT" })[node.align] ?? "LEFT",
      textAlignVertical: "TOP",
      textDecoration: node.underline ? "UNDERLINE" : "NONE",
      textAutoResize: node.boxWidth > 0 ? "HEIGHT" : "WIDTH_AND_HEIGHT",
      textUserLayoutVersion: 5,
      textExplicitLayoutVersion: 1,
      fontVersion: node.figmaFont?.version ?? "",
      fontVariations: [],
      fontVariantCommonLigatures: true,
      fontVariantContextualLigatures: true,
      textBidiVersion: 1,
      textDecorationSkipInk: true,
      autoRename: true,
      textTracking: 0,
      lineHeight: { value: Math.max(0, node.lineHeight ?? 1.2) * 100, units: "PERCENT" },
      letterSpacing: { value: node.letterSpacing ?? 0, units: "PIXELS" },
      paragraphIndent: node.paragraphIndent ?? 0,
      paragraphSpacing: node.paragraphSpacing ?? 0,
    };
  }
  if (node.kind === NODE_KIND.PATH) {
    const localPath = pathData({ ...node, x: 0, y: 0, rotation: 0, flipH: false, flipV: false });
    const contours = parseFigmaPathContours(localPath);
    if (contours.length === 0) throw new Error("fig-path-has-no-geometry");
    const commandsBlob = blobs.push({ bytes: encodeFigmaPath(localPath) }) - 1;
    const vectorNetworkBlob = blobs.push({ bytes: encodeVectorNetwork(contours) }) - 1;
    const hasFill = base.fillPaints.length > 0 && contours.some((contour) => contour.closed);
    return {
      ...base,
      type: "VECTOR",
      fillGeometry: hasFill
        ? [{ windingRule: node.fillRule === "evenodd" ? "ODD" : "NONZERO", commandsBlob, styleID: 0 }]
        : [],
      vectorData: {
        vectorNetworkBlob,
        normalizedSize: { x: Math.max(node.width, 1), y: Math.max(node.height, 1) },
        styleOverrideTable: [],
      },
    };
  }
  if (node.kind === NODE_KIND.GROUP) {
    const isFrame = node.isFrame === true || node.frame === true || node.containerType === "frame";
    return {
      ...base,
      type: isFrame ? "FRAME" : "GROUP",
      ...(isFrame ? { frameMaskDisabled: node.clipContent === false } : {}),
      ...autoLayoutFields(isFrame ? node.autoLayout : null),
    };
  }
  if (node.kind === NODE_KIND.ELLIPSE) {
    return { ...base, type: "ELLIPSE" };
  }
  if (node.cornerRadius > 0) {
    return { ...base, type: "ROUNDED_RECTANGLE", cornerRadius: node.cornerRadius };
  }
  return { ...base, type: "RECTANGLE" };
}

function encodeFigmaPath(path) {
  const tokens = path.match(/[A-Za-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) ?? [];
  const commandSizes = { M: 2, L: 2, Q: 4, C: 6, Z: 0 };
  const encoded = [];
  let index = 0;
  while (index < tokens.length) {
    const letter = tokens[index++].toUpperCase();
    const command = ({ Z: 0, M: 1, L: 2, Q: 3, C: 4 })[letter];
    const count = commandSizes[letter];
    if (command === undefined || count === undefined) throw new Error("fig-path-command-unsupported");
    encoded.push(command);
    for (let valueIndex = 0; valueIndex < count; valueIndex += 1) {
      if (index >= tokens.length || /^[A-Za-z]$/.test(tokens[index])) throw new Error("fig-path-command-incomplete");
      const buffer = new ArrayBuffer(4);
      new DataView(buffer).setFloat32(0, Number(tokens[index++]), true);
      encoded.push(...new Uint8Array(buffer));
    }
  }
  return new Uint8Array(encoded);
}

function encodeVectorNetwork(contours) {
  const vertices = [];
  const segments = [];
  for (const contour of contours) {
    const start = vertices.length;
    vertices.push(...contour.anchors);
    for (let index = 0; index < contour.anchors.length - 1; index += 1) {
      segments.push({ start: start + index, end: start + index + 1,
        startTangent: contour.anchors[index].out, endTangent: contour.anchors[index + 1].in });
    }
    if (contour.closed) {
      segments.push({ start: start + contour.anchors.length - 1, end: start,
        startTangent: contour.anchors.at(-1).out, endTangent: contour.anchors[0].in });
    }
  }
  const bytes = new Uint8Array(16 + vertices.length * 12 + segments.length * 28);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, vertices.length, true);
  view.setUint32(4, segments.length, true);
  view.setUint32(8, 0, true);
  view.setUint32(12, 0, true);
  let offset = 16;
  for (const vertex of vertices) {
    view.setFloat32(offset, vertex.x, true);
    view.setFloat32(offset + 4, vertex.y, true);
    view.setUint32(offset + 8, 0, true);
    offset += 12;
  }
  for (const segment of segments) {
    view.setUint32(offset, segment.start, true);
    view.setFloat32(offset + 4, segment.startTangent?.[0] ?? 0, true);
    view.setFloat32(offset + 8, segment.startTangent?.[1] ?? 0, true);
    view.setUint32(offset + 12, segment.end, true);
    view.setFloat32(offset + 16, segment.endTangent?.[0] ?? 0, true);
    view.setFloat32(offset + 20, segment.endTangent?.[1] ?? 0, true);
    view.setUint32(offset + 24, 0, true);
    offset += 28;
  }
  return bytes;
}

function autoLayoutFields(layout) {
  if (!layout) return {};
  const direction = layout.direction === "horizontal" ? "HORIZONTAL" : "VERTICAL";
  const padding = typeof layout.padding === "number"
    ? { top: layout.padding, right: layout.padding, bottom: layout.padding, left: layout.padding }
    : (layout.padding ?? {});
  const justify = ({ start: "MIN", center: "CENTER", end: "MAX", "space-between": "SPACE_BETWEEN", "space-evenly": "SPACE_EVENLY" })[layout.justifyContent] ?? "MIN";
  const align = ({ start: "MIN", center: "CENTER", end: "MAX", baseline: "BASELINE" })[layout.alignItems] ?? "MIN";
  const primaryMode = direction === "HORIZONTAL" ? layout.widthMode : layout.heightMode;
  const counterMode = direction === "HORIZONTAL" ? layout.heightMode : layout.widthMode;
  const sizing = (mode) => mode === "hug" ? "RESIZE_TO_FIT" : "FIXED";
  return {
    stackMode: direction,
    stackSpacing: layout.gap ?? 0,
    stackCounterSpacing: layout.crossGap ?? 0,
    stackPrimaryAlignItems: justify,
    stackCounterAlignItems: align,
    stackPrimarySizing: sizing(primaryMode),
    stackCounterSizing: sizing(counterMode),
    stackHorizontalPadding: padding.left ?? 0,
    stackVerticalPadding: padding.top ?? 0,
    stackPaddingRight: padding.right ?? 0,
    stackPaddingBottom: padding.bottom ?? 0,
    stackWrap: layout.wrap ? "WRAP" : "NO_WRAP",
  };
}

function newOriginFileKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return bytesToBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function figmaFontName(node) {
  if (node.figmaFont?.family) {
    return { family: node.figmaFont.family, style: node.figmaFont.style ?? "Regular" };
  }
  const family = String(node.fontFamily ?? "Inter")
    .split(",")[0]
    .trim()
    .replace(/^['"]|['"]$/g, "") || "Inter";
  const weight = String(node.fontWeight ?? "400");
  const style = ({
    "100": "Thin", "200": "Extra Light", "300": "Light", "400": "Regular",
    normal: "Regular", "500": "Medium", "600": "Semi Bold", "700": "Bold",
    "800": "Extra Bold", "900": "Black",
  })[weight] ?? "Regular";
  return { family, style: `${style}${node.italic ? " Italic" : ""}` };
}

/**
 * Builds a container (`schema`, `version`, `message`) for one page. Children of
 * a group keep their absolute VOO position, converted to be relative to the frame.
 */
export function buildFigContainer(sceneDoc, template, { pageName = "Page 1", imageAssets = new Map() } = {}) {
  const nodes = sceneDoc?.nodes ?? [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const childrenOf = new Map();
  for (const node of nodes) {
    if (!isWritable(node)) continue;
    const key = writtenParentId(node, byId) ?? "";
    childrenOf.set(key, [...(childrenOf.get(key) ?? []), node]);
  }

  const layers = [];
  const blobs = [];
  let nextLocalId = 1;
  const emitChildren = (parentKey, parentGuid, origin) => {
    (childrenOf.get(parentKey) ?? []).forEach((node, index) => {
      const guid = { sessionID: LAYER_SESSION_ID, localID: nextLocalId };
      nextLocalId += 1;
      layers.push(layerRecord({ guid, parentGuid, position: positionKey(index), node, origin, imageAssets, blobs }));
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

  return {
    version: template.version,
    schema: template.schema,
    message: {
      type: "NODE_CHANGES",
      sessionID: 0,
      ackID: 0,
      originFileKey: newOriginFileKey(),
      nodeChanges: [document, canvas, ...layers],
      blobs,
      nodeChangeOrder: "GUID",
    },
  };
}
