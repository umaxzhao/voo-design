/**
 * Pure logic SVG importer converting SVG XML markup into editor scene nodes.
 *
 * Supports <path>, <rect>, <circle>, <ellipse>, <line>, <polyline>, <polygon>,
 * <text>, and <g> elements with styling (fill, stroke, opacity, transforms).
 * Operates without requiring browser DOM (runs in Node unit tests and browser).
 */

import {
  createEllipseNode,
  createGroupNode,
  createPenNode,
  createRectNode,
  createTextNode,
  NODE_KIND,
} from "./scene_model.js";
import { parseSvgPath } from "./editor_svg_parse.js";

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

/** Parses stroke and fill visual styling attributes. */
function parsePaintProps(attrs, inherited = {}) {
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
  if (fill === "none") fill = "transparent";
  if (!fill && fill !== "transparent" && inherited.fill === undefined) {
    fill = "#000000";
  }

  let stroke = rawStroke !== undefined ? rawStroke : inherited.stroke;
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

  function walk(
    element,
    inheritedStyle = {},
    parentMatrix = null,
    parentGroupId = null,
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

    const paint = parsePaintProps(attrs, inheritedStyle);

    if (tag === "g") {
      let groupId = parentGroupId;
      if (attrs.id && !groupId) {
        const group = createGroupNode({ x: 0, y: 0, width: 0, height: 0 });
        group.name = attrs.id;
        nodes.push(group);
        groupId = group.id;
      }
      for (const child of children) {
        walk(child, paint, matrix, groupId);
      }
      return;
    }

    if (tag === "path") {
      const d = attrs.d;
      if (!d) return;
      const rawAnchors = parseSvgPath(d);
      if (!rawAnchors || rawAnchors.length === 0) return;

      const anchors = rawAnchors.map((a) => {
        const pt = applyTransformToPoint(a.x, a.y, matrix);
        let inHandle = null;
        let outHandle = null;
        if (a.in) {
          const inPt = applyTransformToPoint(
            a.x + a.in[0],
            a.y + a.in[1],
            matrix,
          );
          inHandle = [inPt.x - pt.x, inPt.y - pt.y];
        }
        if (a.out) {
          const outPt = applyTransformToPoint(
            a.x + a.out[0],
            a.y + a.out[1],
            matrix,
          );
          outHandle = [outPt.x - pt.x, outPt.y - pt.y];
        }
        return {
          x: pt.x,
          y: pt.y,
          in: inHandle,
          out: outHandle,
          close: Boolean(a.close),
        };
      });

      const penNode = createPenNode(anchors, paint.stroke, paint.strokeWidth);
      penNode.fill = paint.fill;
      penNode.opacity = paint.opacity;
      penNode.strokeCap = paint.strokeCap;
      penNode.strokeJoin = paint.strokeJoin;
      penNode.strokeDash = paint.strokeDash;
      if (parentGroupId) penNode.parentId = parentGroupId;
      nodes.push(penNode);
      return;
    }

    if (tag === "rect") {
      const x = parseNum(attrs.x, 0);
      const y = parseNum(attrs.y, 0);
      const w = parseNum(attrs.width, 0);
      const h = parseNum(attrs.height, 0);
      const rx = parseNum(attrs.rx, parseNum(attrs.ry, 0));
      if (w <= 0 || h <= 0) return;

      const p1 = applyTransformToPoint(x, y, matrix);
      const p2 = applyTransformToPoint(x + w, y + h, matrix);

      const rectNode = createRectNode({
        x: Math.min(p1.x, p2.x),
        y: Math.min(p1.y, p2.y),
        width: Math.abs(p2.x - p1.x),
        height: Math.abs(p2.y - p1.y),
        fill: paint.fill,
        stroke: paint.stroke,
        strokeWidth: paint.strokeWidth,
      });
      rectNode.cornerRadius = rx;
      rectNode.opacity = paint.opacity;
      if (parentGroupId) rectNode.parentId = parentGroupId;
      nodes.push(rectNode);
      return;
    }

    if (tag === "circle" || tag === "ellipse") {
      let cx = parseNum(attrs.cx, 0);
      let cy = parseNum(attrs.cy, 0);
      let rx = tag === "circle" ? parseNum(attrs.r, 0) : parseNum(attrs.rx, 0);
      let ry = tag === "circle" ? parseNum(attrs.r, 0) : parseNum(attrs.ry, 0);
      if (rx <= 0 || ry <= 0) return;

      const p1 = applyTransformToPoint(cx - rx, cy - ry, matrix);
      const p2 = applyTransformToPoint(cx + rx, cy + ry, matrix);

      const ellipseNode = createEllipseNode({
        x: Math.min(p1.x, p2.x),
        y: Math.min(p1.y, p2.y),
        width: Math.abs(p2.x - p1.x),
        height: Math.abs(p2.y - p1.y),
        stroke: paint.stroke,
        strokeWidth: paint.strokeWidth,
      });
      ellipseNode.fill = paint.fill;
      ellipseNode.opacity = paint.opacity;
      if (parentGroupId) ellipseNode.parentId = parentGroupId;
      nodes.push(ellipseNode);
      return;
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
        paint.stroke !== "transparent" ? paint.stroke : paint.fill || "#000000",
        paint.strokeWidth || 1,
      );
      penNode.opacity = paint.opacity;
      if (parentGroupId) penNode.parentId = parentGroupId;
      nodes.push(penNode);
      return;
    }

    if (tag === "polyline" || tag === "polygon") {
      const pointsStr = attrs.points || "";
      const coords = pointsStr
        .split(/[\s,]+/)
        .map(parseFloat)
        .filter(Number.isFinite);
      if (coords.length < 4) return;
      const anchors = [];
      for (let i = 0; i < coords.length; i += 2) {
        const pt = applyTransformToPoint(coords[i], coords[i + 1], matrix);
        anchors.push({ x: pt.x, y: pt.y });
      }
      if (tag === "polygon" && anchors.length > 0) {
        anchors[anchors.length - 1].close = true;
      }
      const penNode = createPenNode(anchors, paint.stroke, paint.strokeWidth);
      penNode.fill = tag === "polygon" ? paint.fill : "transparent";
      penNode.opacity = paint.opacity;
      if (parentGroupId) penNode.parentId = parentGroupId;
      nodes.push(penNode);
      return;
    }

    if (tag === "text") {
      const content = text || attrs["aria-label"] || "";
      if (!content.trim()) return;
      const x = parseNum(attrs.x, 0);
      const y = parseNum(attrs.y, 0);
      const pt = applyTransformToPoint(x, y, matrix);
      const fontSize = parseNum(attrs["font-size"] || attrs.fontSize, 16);
      const textNode = createTextNode({
        x: pt.x,
        y: pt.y,
        text: content,
        fontSize,
        fill: paint.fill !== "transparent" ? paint.fill : "#000000",
      });
      textNode.opacity = paint.opacity;
      if (parentGroupId) textNode.parentId = parentGroupId;
      nodes.push(textNode);
    }
  }

  for (const child of svgTree.children) {
    walk(child);
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
