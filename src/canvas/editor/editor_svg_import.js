/**
 * Pure logic SVG importer converting SVG XML markup into editor scene nodes.
 *
 * Supports <path>, <rect>, <circle>, <ellipse>, <line>, <polyline>, <polygon>,
 * <text>, and <g> elements with styling (fill, stroke, opacity, transforms).
 * Operates without requiring browser DOM (runs in Node unit tests and browser).
 */

import {
  createBooleanNode,
  createEllipseNode,
  createGroupNode,
  createPenNode,
  createRectNode,
  createTextNode,
  NODE_KIND,
} from "./scene_model.js";
import { parseSvgPath } from "./editor_svg_parse.js";
import {
  measureSvgTextWidth,
  calculateSvgTextAnchorOffset,
} from "./editor_svg_text.js";

/** Checks if a string contains valid SVG markup. */
export function isSvgString(str) {
  if (typeof str !== "string") return false;
  const trimmed = str.trim();
  return (
    (trimmed.startsWith("<svg") && trimmed.includes("</svg>")) ||
    (trimmed.startsWith("<?xml") &&
      trimmed.includes("<svg") &&
      trimmed.includes("</svg>"))
  );
}

/** Parses XML/HTML attributes from an attribute string. */
function parseAttributes(attrStr) {
  const attrs = {};
  if (!attrStr) return attrs;
  const re = /([a-zA-Z0-9_:-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^>\s]+)))?/g;
  let match;
  while ((match = re.exec(attrStr)) !== null) {
    const key = match[1];
    const val = match[2] ?? match[3] ?? match[4] ?? "";
    attrs[key] = val;
  }
  return attrs;
}

/** Parses inline CSS style string into an object. */
function parseInlineStyle(styleStr) {
  const styles = {};
  if (!styleStr || typeof styleStr !== "string") return styles;
  const parts = styleStr.split(";");
  for (const part of parts) {
    const colonIdx = part.indexOf(":");
    if (colonIdx === -1) continue;
    const prop = part.slice(0, colonIdx).trim().toLowerCase();
    const val = part.slice(colonIdx + 1).trim();
    if (prop && val) styles[prop] = val;
  }
  return styles;
}

/** Resolves an effective attribute considering inline style then presentation attribute. */
function getStyleOrAttr(attrs, style, key, attrKey = key) {
  return style[key] ?? attrs[attrKey] ?? undefined;
}

/** Parses a numeric value, ignoring 'px' or other units. */
function parseNum(val, defaultVal = 0) {
  if (val == null) return defaultVal;
  const num = parseFloat(val);
  return Number.isFinite(num) ? num : defaultVal;
}

/** Normalizes SVG font-weight into numeric weight consistent with TEXT_FONT_WEIGHTS. */
function normalizeSvgFontWeight(rawWeight) {
  if (rawWeight == null) return undefined;
  const str = String(rawWeight).trim().toLowerCase();
  if (!str) return undefined;
  if (str === "bold") return 700;
  if (str === "normal") return 400;
  if (str === "bolder") return 800;
  if (str === "lighter") return 300;
  const num = parseInt(str, 10);
  return Number.isFinite(num) ? num : 400;
}

/** Parses transform attribute e.g. matrix(...), translate(...), scale(...), rotate(...). */
function parseTransform(transformStr) {
  if (!transformStr || typeof transformStr !== "string") return null;
  const transforms = [];
  const re = /([a-zA-Z]+)\s*\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(transformStr)) !== null) {
    const name = m[1].toLowerCase();
    const args = m[2]
      .split(/[\s,]+/)
      .map(parseFloat)
      .filter(Number.isFinite);
    transforms.push({ name, args });
  }
  return transforms;
}

/** Multiplies two 2D affine transform matrices [a, b, c, d, tx, ty]. */
function multiplyMatrix(m1, m2) {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

/** Transforms a point (x, y) by matrix [a, b, c, d, tx, ty]. */
function applyTransformToPoint(x, y, matrix) {
  if (!matrix) return { x, y };
  return {
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  };
}

/** Converts transform list into a single affine matrix [a, b, c, d, tx, ty]. */
function resolveTransformMatrix(transforms) {
  if (!transforms || transforms.length === 0) return null;
  let current = [1, 0, 0, 1, 0, 0];
  for (const { name, args } of transforms) {
    let next = null;
    switch (name) {
      case "matrix":
        if (args.length >= 6) {
          next = [args[0], args[1], args[2], args[3], args[4], args[5]];
        }
        break;
      case "translate":
        next = [1, 0, 0, 1, args[0] || 0, args[1] || 0];
        break;
      case "scale":
        next = [args[0] ?? 1, 0, 0, args[1] ?? args[0] ?? 1, 0, 0];
        break;
      case "rotate": {
        const rad = ((args[0] || 0) * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const cx = args[1] || 0;
        const cy = args[2] || 0;
        if (cx !== 0 || cy !== 0) {
          const t1 = [1, 0, 0, 1, cx, cy];
          const rot = [cos, sin, -sin, cos, 0, 0];
          const t2 = [1, 0, 0, 1, -cx, -cy];
          next = multiplyMatrix(t1, multiplyMatrix(rot, t2));
        } else {
          next = [cos, sin, -sin, cos, 0, 0];
        }
        break;
      }
      default:
        break;
    }
    if (next) current = multiplyMatrix(current, next);
  }
  return current;
}

/** Lightweight SVG tag tree parser. */
function parseSvgTree(svgString) {
  const root = { tag: "root", attrs: {}, children: [], text: "" };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<(\/)?([a-zA-Z0-9:_-]+)([^>]*?)(\/)?>|([^<]+)/g;
  let match;

  while ((match = re.exec(svgString)) !== null) {
    if (match[0].startsWith("<!--")) continue;
    if (match[5]) {
      const text = match[5].trim();
      if (text && stack.length > 0) {
        const top = stack[stack.length - 1];
        top.text = top.text ? `${top.text} ${text}` : text;
      }
      continue;
    }

    const isClosing = Boolean(match[1]);
    const rawTag = match[2] || "";
    const tagName = rawTag.split(":").pop().toLowerCase();
    const attrStr = match[3] || "";
    const isSelfClosing = Boolean(match[4]);

    if (isClosing) {
      if (
        [
          "path",
          "rect",
          "circle",
          "ellipse",
          "line",
          "polyline",
          "polygon",
        ].includes(tagName)
      ) {
        continue;
      }
      if (stack.length > 1) {
        const lastIdx = stack.map((n) => n.tag).lastIndexOf(tagName);
        if (lastIdx > 0) {
          stack.splice(lastIdx);
        } else {
          stack.pop();
        }
      }
    } else {
      const attrs = parseAttributes(attrStr);
      const node = { tag: tagName, attrs, children: [], text: "" };
      if (stack.length > 0) {
        stack[stack.length - 1].children.push(node);
      }
      if (
        !isSelfClosing &&
        ![
          "path",
          "rect",
          "circle",
          "ellipse",
          "line",
          "polyline",
          "polygon",
        ].includes(tagName)
      ) {
        stack.push(node);
      }
    }
  }

  const svgNode = root.children.find((c) => c.tag === "svg") || root;
  return svgNode;
}

const NAMED_COLORS = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  cyan: "#00ffff",
  magenta: "#ff00ff",
  gray: "#808080",
  grey: "#808080",
  orange: "#ffa500",
  purple: "#800080",
  transparent: "transparent",
};

function normalizeColor(raw) {
  if (!raw) return "#000000";
  const str = String(raw).trim();
  if (NAMED_COLORS[str.toLowerCase()]) {
    return NAMED_COLORS[str.toLowerCase()];
  }
  return str;
}

function parseCoordPercent(val, defaultVal = 0) {
  if (val == null) return defaultVal;
  const str = String(val).trim();
  if (str.endsWith("%")) {
    const num = parseFloat(str);
    return Number.isFinite(num) ? num / 100 : defaultVal;
  }
  const num = parseFloat(str);
  return Number.isFinite(num) ? num : defaultVal;
}

function resolveGradient(def, defsMap) {
  if (!def) return null;
  const tag = def.tag;
  if (tag !== "lineargradient" && tag !== "radialgradient") return null;

  let stops = [];
  let current = def;
  const visited = new Set();
  while (current && !visited.has(current)) {
    visited.add(current);
    const stopElements = current.children.filter((c) => c.tag === "stop");
    if (stopElements.length > 0 && stops.length === 0) {
      stops = stopElements;
    }
    const href = current.attrs.href || current.attrs["xlink:href"];
    if (href && href.startsWith("#")) {
      current = defsMap?.get(href.slice(1));
    } else {
      break;
    }
  }

  if (stops.length === 0) return null;

  const parsedStops = stops.map((stop, index) => {
    const style = parseInlineStyle(stop.attrs.style);
    const rawColor = getStyleOrAttr(stop.attrs, style, "stop-color", "stop-color") || "#000000";
    const rawOpacity = getStyleOrAttr(stop.attrs, style, "stop-opacity", "stop-opacity");
    let color = normalizeColor(rawColor);
    const opacity = rawOpacity !== undefined ? Math.max(0, Math.min(1, parseNum(rawOpacity, 1))) : 1;
    if (opacity < 1 && color.startsWith("#") && (color.length === 7 || color.length === 4)) {
      if (color.length === 4) {
        color = `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
      }
      const alphaHex = Math.round(opacity * 255).toString(16).padStart(2, "0");
      color = `${color}${alphaHex}`.toUpperCase();
    }
    let offset = stop.attrs.offset;
    let pos = 0;
    if (offset !== undefined) {
      const offsetStr = String(offset).trim();
      if (offsetStr.endsWith("%")) {
        pos = parseNum(offsetStr, 0);
      } else {
        const num = parseNum(offsetStr, 0);
        pos = num <= 1 && num >= 0 ? num * 100 : num;
      }
    } else {
      pos = stops.length > 1 ? (index / (stops.length - 1)) * 100 : 0;
    }
    return { color, position: Math.max(0, Math.min(100, pos)) };
  });

  const stopStrings = parsedStops
    .sort((a, b) => a.position - b.position)
    .map((s) => `${s.color} ${Math.round(s.position)}%`);

  if (tag === "radialgradient") {
    const cx = Math.round(parseCoordPercent(def.attrs.cx ?? def.attrs.fx, 0.5) * 100);
    const cy = Math.round(parseCoordPercent(def.attrs.cy ?? def.attrs.fy, 0.5) * 100);
    if (cx !== 50 || cy !== 50) {
      return `radial-gradient(circle at ${cx}% ${cy}%, ${stopStrings.join(", ")})`;
    }
    return `radial-gradient(circle, ${stopStrings.join(", ")})`;
  }

  const x1 = parseCoordPercent(def.attrs.x1, 0);
  const y1 = parseCoordPercent(def.attrs.y1, 0);
  const x2 = parseCoordPercent(def.attrs.x2, 1);
  const y2 = parseCoordPercent(def.attrs.y2, 0);
  const dx = x2 - x1;
  const dy = y2 - y1;
  let angle = 90;
  if (dx !== 0 || dy !== 0) {
    angle = Math.round(((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360);
  }
  return `linear-gradient(${angle}deg, ${stopStrings.join(", ")})`;
}

function resolvePaintServer(value, defsMap) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.toLowerCase().startsWith("url(")) return value;
  const match = /^url\(["']?#([^"')]+)["']?\)/i.exec(trimmed);
  if (!match) return value;
  const def = defsMap?.get(match[1]);
  if (!def) return value;
  const gradient = resolveGradient(def, defsMap);
  return gradient || value;
}

function collectElementText(element) {
  let result = element.text || "";
  for (const child of element.children) {
    if (child.tag === "tspan" || child.tag === "text") {
      const childText = collectElementText(child);
      if (childText) {
        result = result ? `${result} ${childText}` : childText;
      }
    }
  }
  return result.trim();
}

function buildDefsMap(root) {
  const map = new Map();
  function visit(node) {
    if (node.attrs && node.attrs.id) {
      map.set(String(node.attrs.id).trim(), node);
    }
    for (const child of node.children) {
      visit(child);
    }
  }
  visit(root);
  return map;
}

/** Parses stroke and fill visual styling attributes. */
function parsePaintProps(attrs, inherited = {}, defsMap = null) {
  const style = parseInlineStyle(attrs.style);
  const rawFill = getStyleOrAttr(attrs, style, "fill");
  const rawStroke = getStyleOrAttr(attrs, style, "stroke");
  const rawStrokeWidth = getStyleOrAttr(
    attrs,
    style,
    "stroke-width",
    "stroke-width",
  );
  const rawOpacity = getStyleOrAttr(attrs, style, "opacity");
  const rawLineCap = getStyleOrAttr(
    attrs,
    style,
    "stroke-linecap",
    "stroke-linecap",
  );
  const rawLineJoin = getStyleOrAttr(
    attrs,
    style,
    "stroke-linejoin",
    "stroke-linejoin",
  );
  const rawDash = getStyleOrAttr(
    attrs,
    style,
    "stroke-dasharray",
    "stroke-dasharray",
  );

  let fill = rawFill !== undefined ? rawFill : inherited.fill;
  fill = resolvePaintServer(fill, defsMap);
  if (fill === "none") fill = "transparent";
  if (!fill && fill !== "transparent" && inherited.fill === undefined) {
    fill = "#000000";
  }

  let stroke = rawStroke !== undefined ? rawStroke : inherited.stroke;
  stroke = resolvePaintServer(stroke, defsMap);
  if (stroke === "none") stroke = "transparent";

  const strokeWidth =
    rawStrokeWidth !== undefined
      ? parseNum(rawStrokeWidth, 1)
      : (inherited.strokeWidth ?? (stroke && stroke !== "transparent" ? 1 : 0));

  const opacity =
    rawOpacity !== undefined
      ? Math.max(0, Math.min(1, parseNum(rawOpacity, 1)))
      : (inherited.opacity ?? 1);

  const strokeCap = rawLineCap || inherited.strokeCap || "round";
  const strokeJoin = rawLineJoin || inherited.strokeJoin || "round";
  const strokeDash =
    rawDash && rawDash !== "none" ? "dashed" : inherited.strokeDash || "solid";

  return {
    fill: fill || "transparent",
    stroke: stroke || "transparent",
    strokeWidth,
    opacity,
    strokeCap,
    strokeJoin,
    strokeDash,
  };
}

/** Normalises parsed SVG shapes into editor scene nodes. */
export function parseSvgStringToNodes(svgString) {
  if (!svgString || typeof svgString !== "string") {
    return { nodes: [], bounds: null, width: 0, height: 0 };
  }

  const svgTree = parseSvgTree(svgString);
  const defsMap = buildDefsMap(svgTree);
  const nodes = [];

  const svgAttrs = svgTree.attrs || {};
  let vbX = 0;
  let vbY = 0;
  let vbWidth = parseNum(svgAttrs.width, 0);
  let vbHeight = parseNum(svgAttrs.height, 0);

  if (svgAttrs.viewBox) {
    const parts = svgAttrs.viewBox
      .split(/[\s,]+/)
      .map(parseFloat)
      .filter(Number.isFinite);
    if (parts.length >= 4) {
      vbX = parts[0];
      vbY = parts[1];
      vbWidth = parts[2];
      vbHeight = parts[3];
    }
  }

  function parseShapeNode(element, matrix, currentPaint, clipId = null, groupId = null) {
    const { tag, attrs } = element;
    if (tag === "path") {
      const d = attrs.d;
      if (!d) return null;
      const rawAnchors = parseSvgPath(d);
      if (!rawAnchors || rawAnchors.length === 0) return null;

      const anchors = rawAnchors.map((a) => {
        const pt = applyTransformToPoint(a.x, a.y, matrix);
        let inHandle = null;
        let outHandle = null;
        if (a.in) {
          const inPt = applyTransformToPoint(a.x + a.in[0], a.y + a.in[1], matrix);
          inHandle = [inPt.x - pt.x, inPt.y - pt.y];
        }
        if (a.out) {
          const outPt = applyTransformToPoint(a.x + a.out[0], a.y + a.out[1], matrix);
          outHandle = [outPt.x - pt.x, outPt.y - pt.y];
        }
        return {
          x: pt.x,
          y: pt.y,
          in: inHandle,
          out: outHandle,
          close: Boolean(a.close),
          ...(a.moveTo ? { moveTo: true } : {}),
        };
      });

      const penNode = createPenNode(anchors, currentPaint.stroke, currentPaint.strokeWidth);
      penNode.fill = currentPaint.fill;
      penNode.opacity = currentPaint.opacity;
      penNode.strokeCap = currentPaint.strokeCap;
      penNode.strokeJoin = currentPaint.strokeJoin;
      penNode.strokeDash = currentPaint.strokeDash;
      if (groupId) penNode.parentId = groupId;
      if (clipId) penNode.clipTo = clipId;
      return penNode;
    }

    if (tag === "rect") {
      const x = parseNum(attrs.x, 0);
      const y = parseNum(attrs.y, 0);
      const w = parseNum(attrs.width, 0);
      const h = parseNum(attrs.height, 0);
      const style = parseInlineStyle(attrs.style);
      const rxVal = attrs.rx ?? attrs.ry ?? style.rx ?? style.ry ?? style["border-radius"];
      const rx = parseNum(rxVal, 0);
      if (w <= 0 || h <= 0) return null;

      const p1 = applyTransformToPoint(x, y, matrix);
      const p2 = applyTransformToPoint(x + w, y + h, matrix);

      const rectNode = createRectNode({
        x: Math.min(p1.x, p2.x),
        y: Math.min(p1.y, p2.y),
        width: Math.abs(p2.x - p1.x),
        height: Math.abs(p2.y - p1.y),
        fill: currentPaint.fill,
        stroke: currentPaint.stroke,
        strokeWidth: currentPaint.strokeWidth,
      });
      rectNode.cornerRadius = rx;
      rectNode.opacity = currentPaint.opacity;
      if (groupId) rectNode.parentId = groupId;
      if (clipId) rectNode.clipTo = clipId;
      return rectNode;
    }

    if (tag === "circle" || tag === "ellipse") {
      let cx = parseNum(attrs.cx, 0);
      let cy = parseNum(attrs.cy, 0);
      let rx = tag === "circle" ? parseNum(attrs.r, 0) : parseNum(attrs.rx, 0);
      let ry = tag === "circle" ? parseNum(attrs.r, 0) : parseNum(attrs.ry, 0);
      if (rx <= 0 || ry <= 0) return null;

      const p1 = applyTransformToPoint(cx - rx, cy - ry, matrix);
      const p2 = applyTransformToPoint(cx + rx, cy + ry, matrix);

      const ellipseNode = createEllipseNode({
        x: Math.min(p1.x, p2.x),
        y: Math.min(p1.y, p2.y),
        width: Math.abs(p2.x - p1.x),
        height: Math.abs(p2.y - p1.y),
        stroke: currentPaint.stroke,
        strokeWidth: currentPaint.strokeWidth,
      });
      ellipseNode.fill = currentPaint.fill;
      ellipseNode.opacity = currentPaint.opacity;
      if (groupId) ellipseNode.parentId = groupId;
      if (clipId) ellipseNode.clipTo = clipId;
      return ellipseNode;
    }

    if (tag === "line") {
      const x1 = parseNum(attrs.x1, 0);
      const y1 = parseNum(attrs.y1, 0);
      const x2 = parseNum(attrs.x2, 0);
      const y2 = parseNum(attrs.y2, 0);
      const pt1 = applyTransformToPoint(x1, y1, matrix);
      const pt2 = applyTransformToPoint(x2, y2, matrix);

      const penNode = createPenNode(
        [
          { x: pt1.x, y: pt1.y },
          { x: pt2.x, y: pt2.y },
        ],
        currentPaint.stroke !== "transparent" ? currentPaint.stroke : currentPaint.fill || "#000000",
        currentPaint.strokeWidth || 1,
      );
      penNode.opacity = currentPaint.opacity;
      if (groupId) penNode.parentId = groupId;
      if (clipId) penNode.clipTo = clipId;
      return penNode;
    }

    if (tag === "polyline" || tag === "polygon") {
      const pointsStr = attrs.points || "";
      const coords = pointsStr
        .split(/[\s,]+/)
        .map(parseFloat)
        .filter(Number.isFinite);
      if (coords.length < 4) return null;
      const anchors = [];
      for (let i = 0; i < coords.length; i += 2) {
        const pt = applyTransformToPoint(coords[i], coords[i + 1], matrix);
        anchors.push({ x: pt.x, y: pt.y });
      }
      if (tag === "polygon" && anchors.length > 0) {
        anchors[anchors.length - 1].close = true;
      }
      const penNode = createPenNode(anchors, currentPaint.stroke, currentPaint.strokeWidth);
      penNode.fill = tag === "polygon" ? currentPaint.fill : "transparent";
      penNode.opacity = currentPaint.opacity;
      if (groupId) penNode.parentId = groupId;
      if (clipId) penNode.clipTo = clipId;
      return penNode;
    }

    return null;
  }

  function resolveMaskOrClip(refAttr, matrix, parentClipId = null) {
    if (!refAttr) return null;
    const match = /^url\(["']?#([^"')]+)["']?\)/i.exec(String(refAttr).trim());
    if (!match) return null;
    const def = defsMap.get(match[1]);
    if (!def || !def.children || def.children.length === 0) return null;

    const currentTransform = resolveTransformMatrix(parseTransform(def.attrs?.transform));
    const defMatrix = matrix && currentTransform ? multiplyMatrix(matrix, currentTransform) : currentTransform || matrix;

    const shapes = [];
    for (const child of def.children) {
      const childPaint = parsePaintProps(child.attrs || {}, {}, defsMap);
      const childTransform = resolveTransformMatrix(parseTransform(child.attrs?.transform));
      const childMatrix = defMatrix && childTransform ? multiplyMatrix(defMatrix, childTransform) : childTransform || defMatrix;
      const shapeNode = parseShapeNode(child, childMatrix, childPaint);
      if (shapeNode) shapes.push(shapeNode);
    }
    if (shapes.length === 0) return null;

    if (def.tag === "clippath") {
      if (shapes.length === 1) {
        const clipBase = shapes[0];
        clipBase.maskBase = true;
        clipBase.fill = clipBase.fill && clipBase.fill !== "transparent" && clipBase.fill !== "none" ? clipBase.fill : "#ffffff";
        if (parentClipId) clipBase.clipTo = parentClipId;
        nodes.push(clipBase);
        return clipBase.id;
      }
      const booleanClip = createBooleanNode(shapes, "union");
      booleanClip.op = "union";
      booleanClip.maskBase = true;
      booleanClip.fill = "#ffffff";
      if (parentClipId) booleanClip.clipTo = parentClipId;
      nodes.push(booleanClip);
      return booleanClip.id;
    }

    if (def.tag === "mask") {
      const parentClip = parentClipId ? nodes.find((n) => n.id === parentClipId) : null;
      if (parentClip && shapes[0]?.kind === "rect") {
        shapes[0].x = parentClip.x;
        shapes[0].y = parentClip.y;
        shapes[0].width = parentClip.width;
        shapes[0].height = parentClip.height;
        shapes[0].cornerRadius = parentClip.cornerRadius;
      }
      if (shapes.length === 1) {
        const maskBase = shapes[0];
        maskBase.maskBase = true;
        maskBase.maskType = def.attrs?.["mask-type"] || "luminance";
        if (!maskBase.fill || maskBase.fill === "transparent" || maskBase.fill === "none") {
          maskBase.fill = "#ffffff";
        }
        if (parentClipId) maskBase.clipTo = parentClipId;
        nodes.push(maskBase);
        return maskBase.id;
      }
      const booleanMask = createBooleanNode(shapes, "subtract");
      booleanMask.op = "subtract";
      booleanMask.maskBase = true;
      booleanMask.maskType = def.attrs?.["mask-type"] || "luminance";
      if (!booleanMask.fill || booleanMask.fill === "transparent" || booleanMask.fill === "none") {
        booleanMask.fill = "#ffffff";
      }
      if (parentClipId) booleanMask.clipTo = parentClipId;
      nodes.push(booleanMask);
      return booleanMask.id;
    }
    return null;
  }

  function walk(
    element,
    inheritedStyle = {},
    parentMatrix = null,
    parentGroupId = null,
    currentClipId = null,
  ) {
    const { tag, attrs, children, text } = element;
    if (["defs", "clippath", "mask", "symbol", "metadata"].includes(tag)) {
      return;
    }

    const currentTransform = resolveTransformMatrix(
      parseTransform(attrs.transform),
    );
    const matrix =
      parentMatrix && currentTransform
        ? multiplyMatrix(parentMatrix, currentTransform)
        : currentTransform || parentMatrix;

    const paint = parsePaintProps(attrs, inheritedStyle, defsMap);
    const style = parseInlineStyle(attrs.style);
    const clipAttr = attrs["clip-path"] || style["clip-path"];
    const maskAttr = attrs["mask"] || style["mask"];
    const elemClipId = resolveMaskOrClip(clipAttr, matrix, currentClipId);
    const elemMaskId = resolveMaskOrClip(maskAttr, matrix, elemClipId || currentClipId);
    const effectiveClipId = elemMaskId || elemClipId || currentClipId;

    if (tag === "use") {
      const href = attrs.href || attrs["xlink:href"];
      if (href && href.startsWith("#")) {
        const target = defsMap.get(href.slice(1));
        if (target) {
          const useX = parseNum(attrs.x, 0);
          const useY = parseNum(attrs.y, 0);
          let useMatrix = matrix;
          if (useX !== 0 || useY !== 0) {
            const tr = [1, 0, 0, 1, useX, useY];
            useMatrix = useMatrix ? multiplyMatrix(useMatrix, tr) : tr;
          }
          walk(target, paint, useMatrix, parentGroupId, effectiveClipId);
        }
      }
      return;
    }

    if (tag === "g") {
      let groupId = parentGroupId;
      if (attrs.id && !groupId) {
        const group = createGroupNode({ x: 0, y: 0, width: 0, height: 0 });
        group.name = attrs.id;
        nodes.push(group);
        groupId = group.id;
      }
      for (const child of children) {
        walk(child, paint, matrix, groupId, effectiveClipId);
      }
      return;
    }

    if (tag === "path") {
      const node = parseShapeNode(element, matrix, paint, effectiveClipId, parentGroupId);
      if (node) nodes.push(node);
      return;
    }

    if (tag === "rect") {
      const node = parseShapeNode(element, matrix, paint, effectiveClipId, parentGroupId);
      if (node) nodes.push(node);
      return;
    }

    if (tag === "circle" || tag === "ellipse") {
      const node = parseShapeNode(element, matrix, paint, effectiveClipId, parentGroupId);
      if (node) nodes.push(node);
      return;
    }

    if (tag === "line") {
      const node = parseShapeNode(element, matrix, paint, effectiveClipId, parentGroupId);
      if (node) nodes.push(node);
      return;
    }

    if (tag === "polyline" || tag === "polygon") {
      const node = parseShapeNode(element, matrix, paint, effectiveClipId, parentGroupId);
      if (node) nodes.push(node);
      return;
    }

    if (tag === "text") {
      const positionedTspans = children.filter(
        (c) => c.tag === "tspan" && (c.attrs.x !== undefined || c.attrs.y !== undefined),
      );
      if (positionedTspans.length > 0) {
        for (const tspan of children.filter((c) => c.tag === "tspan")) {
          const tContent = (tspan.text || "").trim();
          if (!tContent) continue;
          const tAttrs = { ...attrs, ...tspan.attrs };
          const tStyle = parseInlineStyle(tAttrs.style);
          const tPaint = parsePaintProps(tAttrs, paint, defsMap);
          const tx = parseNum(tAttrs.x, attrs.x ? parseNum(attrs.x, 0) : 0);
          const ty = parseNum(tAttrs.y, attrs.y ? parseNum(attrs.y, 0) : 0);
          const tFontSize = parseNum(tAttrs["font-size"] ?? tAttrs.fontSize ?? tStyle["font-size"] ?? tStyle.fontSize, 16);
          const tFontFamily = tAttrs["font-family"] ?? tAttrs.fontFamily ?? tStyle["font-family"] ?? tStyle.fontFamily;
          const cleanTFontFamily = tFontFamily ? tFontFamily.replace(/['"]/g, "").trim() : "sans-serif";
          const rawTFontWeight = tAttrs["font-weight"] ?? tAttrs.fontWeight ?? tStyle["font-weight"] ?? tStyle.fontWeight;
          const tFontWeight = normalizeSvgFontWeight(rawTFontWeight);
          const tFontStyle = tAttrs["font-style"] ?? tAttrs.fontStyle ?? tStyle["font-style"] ?? tStyle.fontStyle;
          const tLetterSpacing = parseNum(tAttrs["letter-spacing"] ?? tAttrs.letterSpacing ?? tStyle["letter-spacing"] ?? tStyle.letterSpacing, 0);
          const textAnchor =
            tAttrs["text-anchor"] ??
            tAttrs.textAnchor ??
            tAttrs.textanchor ??
            tStyle["text-anchor"] ??
            tStyle.textAnchor ??
            tStyle.textanchor;

          const textWidth = measureSvgTextWidth(tContent, tFontSize, cleanTFontFamily, tFontWeight, tLetterSpacing);
          const anchorOffsetX = calculateSvgTextAnchorOffset(textAnchor, textWidth);

          const tpt = applyTransformToPoint(tx + anchorOffsetX, ty - tFontSize, matrix);
          const textNode = createTextNode({
            x: tpt.x,
            y: tpt.y,
            text: tContent,
            fontSize: tFontSize,
            fill: tPaint.fill !== "transparent" && tPaint.fill !== "none" ? tPaint.fill : "#000000",
          });
          textNode.width = Math.ceil(Math.round(textWidth * 1000) / 1000);
          textNode.height = Math.ceil(tFontSize * 1.25);
          if (tFontFamily) textNode.fontFamily = cleanTFontFamily;
          if (tFontWeight != null) textNode.fontWeight = tFontWeight;
          if (tFontStyle) textNode.fontStyle = tFontStyle;
          if (tFontStyle === "italic") textNode.italic = true;
          if (tLetterSpacing) textNode.letterSpacing = tLetterSpacing;
          if (textAnchor === "middle") textNode.align = "center";
          else if (textAnchor === "end") textNode.align = "right";
          textNode.opacity = tPaint.opacity;
          if (parentGroupId) textNode.parentId = parentGroupId;
          if (effectiveClipId) textNode.clipTo = effectiveClipId;
          nodes.push(textNode);
        }
        return;
      }
      const content = collectElementText(element) || attrs["aria-label"] || "";
      if (!content.trim()) return;
      const x = parseNum(attrs.x, 0);
      const y = parseNum(attrs.y, 0);
      const style = parseInlineStyle(attrs.style);
      const fontSize = parseNum(attrs["font-size"] ?? attrs.fontSize ?? style["font-size"] ?? style.fontSize, 16);
      const fontFamily = attrs["font-family"] ?? attrs.fontFamily ?? style["font-family"] ?? style.fontFamily;
      const cleanFontFamily = fontFamily ? fontFamily.replace(/['"]/g, "").trim() : "sans-serif";
      const rawFontWeight = attrs["font-weight"] ?? attrs.fontWeight ?? style["font-weight"] ?? style.fontWeight;
      const fontWeight = normalizeSvgFontWeight(rawFontWeight);
      const fontStyle = attrs["font-style"] ?? attrs.fontStyle ?? style["font-style"] ?? style.fontStyle;
      const letterSpacing = parseNum(attrs["letter-spacing"] ?? attrs.letterSpacing ?? style["letter-spacing"] ?? style.letterSpacing, 0);
      const textAnchor =
        attrs["text-anchor"] ??
        attrs.textAnchor ??
        attrs.textanchor ??
        style["text-anchor"] ??
        style.textAnchor ??
        style.textanchor;

      const textWidth = measureSvgTextWidth(content, fontSize, cleanFontFamily, fontWeight, letterSpacing);
      const anchorOffsetX = calculateSvgTextAnchorOffset(textAnchor, textWidth);

      // SVG y is a baseline; editor text positions are the top of the box.
      const pt = applyTransformToPoint(x + anchorOffsetX, y - fontSize, matrix);
      const textNode = createTextNode({
        x: pt.x,
        y: pt.y,
        text: content,
        fontSize,
        fill: paint.fill !== "transparent" && paint.fill !== "none" ? paint.fill : "#000000",
      });
      textNode.width = Math.ceil(Math.round(textWidth * 1000) / 1000);
      textNode.height = Math.ceil(fontSize * 1.25);
      if (fontFamily) textNode.fontFamily = cleanFontFamily;
      if (fontWeight != null) textNode.fontWeight = fontWeight;
      if (fontStyle) textNode.fontStyle = fontStyle;
      if (fontStyle === "italic") textNode.italic = true;
      if (letterSpacing) textNode.letterSpacing = letterSpacing;
      if (textAnchor === "middle") textNode.align = "center";
      else if (textAnchor === "end") textNode.align = "right";
      textNode.opacity = paint.opacity;
      if (parentGroupId) textNode.parentId = parentGroupId;
      if (effectiveClipId) textNode.clipTo = effectiveClipId;
      nodes.push(textNode);
      return;
    }
  }

  const rootPaint = parsePaintProps(svgAttrs, {}, defsMap);
  const rootMatrix = resolveTransformMatrix(parseTransform(svgAttrs.transform));
  for (const child of svgTree.children) {
    walk(child, rootPaint, rootMatrix, null, null);
  }

  // Calculate overall bounding box of generated nodes
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    if (node.kind === NODE_KIND.GROUP) continue;
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + (node.width || 0));
    maxY = Math.max(maxY, node.y + (node.height || 0));
  }

  const bounds =
    Number.isFinite(minX) && Number.isFinite(minY)
      ? {
          x: minX,
          y: minY,
          width: Math.max(1, maxX - minX),
          height: Math.max(1, maxY - minY),
        }
      : { x: vbX, y: vbY, width: vbWidth || 100, height: vbHeight || 100 };

  return {
    nodes,
    bounds,
    width: vbWidth || bounds.width,
    height: vbHeight || bounds.height,
  };
}
