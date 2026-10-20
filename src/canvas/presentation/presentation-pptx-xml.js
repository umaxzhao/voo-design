export const XML_HEADER =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
import {
  normalizeCornerRadius,
  resolveCornerRadii,
} from "../editor/scene_model_core.js";
import { bundledFamilyOf } from "../editor/font_loader.js";
const DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const PRESENTATION_NS =
  "http://schemas.openxmlformats.org/presentationml/2006/main";
const RELATIONSHIP_NS =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
export const PRESENTATION_NAMESPACES = `xmlns:a="${DRAWING_NS}" xmlns:r="${RELATIONSHIP_NS}" xmlns:p="${PRESENTATION_NS}"`;
export const GROUP_SHAPE =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
export const COLOR_MAP =
  '<p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="lt1"/>';

/** XML 1.0 excludes controls and lone surrogates. */
export function xmlText(value) {
  return [...String(value ?? "")]
    .filter((char) => {
      const code = char.codePointAt(0);
      return (
        code === 9 ||
        code === 10 ||
        code === 13 ||
        (code >= 32 && code <= 0xd7ff) ||
        (code >= 0xe000 && code <= 0xfffd) ||
        code >= 0x10000
      );
    })
    .join("")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function relationships(entries) {
  const body = entries
    .map(
      ([id, type, target]) =>
        `<Relationship Id="${xmlText(id)}" Type="${RELATIONSHIP_NS}/${type}" Target="${xmlText(target)}"/>`,
    )
    .join("");
  return `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${body}</Relationships>`;
}

const FONT_WEIGHT_NUMERIC = {
  thin: 100,
  hairline: 100,
  "extra-light": 200,
  "ultra-light": 200,
  light: 300,
  normal: 400,
  regular: 400,
  medium: 500,
  "semi-bold": 600,
  "demi-bold": 600,
  semibold: 600,
  bold: 700,
  bolder: 700,
  "extra-bold": 800,
  "ultra-bold": 800,
  extrabold: 800,
  black: 900,
  heavy: 900,
};

function textBoldWeight(node) {
  if (node.fontWeight === "bold" || node.fontWeight === "bolder") return 1;
  if (node.fontWeight === "normal") return 0;
  if (
    typeof node.fontWeight === "string" &&
    node.fontWeight.toLowerCase() in FONT_WEIGHT_NUMERIC
  ) {
    return FONT_WEIGHT_NUMERIC[node.fontWeight.toLowerCase()] >= 550 ? 1 : 0;
  }
  const numeric = Number(node.fontWeight);
  return Number.isFinite(numeric) && numeric >= 550 ? 1 : 0;
}

function transform(node, scale) {
  const rotation = node.rotation
    ? ` rot="${Math.round(node.rotation * 60000)}"`
    : "";
  const isImage = node?.kind === "image";
  const flipH = !isImage && (node.flipH || node.flipX) ? ' flipH="1"' : "";
  const flipV = !isImage && (node.flipV || node.flipY) ? ' flipV="1"' : "";
  return `<a:xfrm${rotation}${flipH}${flipV}><a:off x="${Math.round(node.x * scale)}" y="${Math.round(node.y * scale)}"/><a:ext cx="${Math.round(node.width * scale)}" cy="${Math.round(node.height * scale)}"/></a:xfrm>`;
}

const CSS_NAMED_COLORS = {
  black: "000000",
  white: "FFFFFF",
  red: "FF0000",
  green: "008000",
  blue: "0000FF",
  yellow: "FFFF00",
  cyan: "00FFFF",
  magenta: "FF00FF",
  gray: "808080",
  grey: "808080",
  silver: "C0C0C0",
  maroon: "800000",
  olive: "808000",
  purple: "800080",
  teal: "008080",
  navy: "000080",
  orange: "FFA500",
  pink: "FFC0CB",
  gold: "FFD700",
  coral: "FF7F50",
  salmon: "FA8072",
  indigo: "4B0082",
  violet: "EE82EE",
  brown: "A52A2A",
  lime: "00FF00",
};

export function parseColor(value) {
  if (
    value === "transparent" ||
    value === null ||
    value === undefined ||
    value === "none"
  )
    return { hex: "000000", alpha: 0 };
  if (typeof value !== "string") return null;
  const hex = /^#([\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.exec(value);
  if (hex) {
    const raw =
      hex[1].length <= 4
        ? [...hex[1]].map((digit) => digit.repeat(2)).join("")
        : hex[1];
    return {
      hex: raw.slice(0, 6).toUpperCase(),
      alpha: raw.length === 8 ? parseInt(raw.slice(6), 16) / 255 : 1,
    };
  }
  const rgb =
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i.exec(
      value,
    );
  if (rgb && !rgb.slice(1, 4).some((channel) => Number(channel) > 255)) {
    return {
      hex: rgb
        .slice(1, 4)
        .map((channel) => Number(channel).toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase(),
      alpha: rgb[4] === undefined ? 1 : Number(rgb[4]),
    };
  }
  const hsl =
    /^hsla?\(\s*(\d+)(?:deg)?\s*,\s*(\d+)%\s*,\s*(\d+)%(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i.exec(
      value,
    );
  if (hsl) {
    const h = Number(hsl[1]) / 360;
    const s = Number(hsl[2]) / 100;
    const l = Number(hsl[3]) / 100;
    const a = hsl[4] === undefined ? 1 : Number(hsl[4]);
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        let val = t;
        if (val < 0) val += 1;
        if (val > 1) val -= 1;
        if (val < 1 / 6) return p + (q - p) * 6 * val;
        if (val < 1 / 2) return q;
        if (val < 2 / 3) return p + (q - p) * (2 / 3 - val) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    const toHex = (c) =>
      Math.round(c * 255)
        .toString(16)
        .padStart(2, "0")
        .toUpperCase();
    return { hex: `${toHex(r)}${toHex(g)}${toHex(b)}`, alpha: a };
  }
  const named = CSS_NAMED_COLORS[value.toLowerCase()];
  if (named) {
    return { hex: named, alpha: 1 };
  }
  return null;
}

function solidFill(value, opacity = 1) {
  const color = parseColor(value);
  if (!color || color.alpha * opacity <= 0) return "<a:noFill/>";
  const alpha = color.alpha * opacity;
  return `<a:solidFill><a:srgbClr val="${color.hex}">${alpha < 1 ? `<a:alpha val="${Math.round(alpha * 100000)}"/>` : ""}</a:srgbClr></a:solidFill>`;
}

function rectGeometryXml(node, scale) {
  const cornerRadius = normalizeCornerRadius(node.cornerRadius);
  const radii = resolveCornerRadii(cornerRadius, node.width, node.height);
  const hasAny = radii.tl > 0 || radii.tr > 0 || radii.br > 0 || radii.bl > 0;
  if (!hasAny) {
    return '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
  }
  if (radii.isUniform) {
    const minDim = Math.min(node.width, node.height);
    const adj =
      minDim > 0
        ? Math.round(Math.min(50000, (radii.uniformRadius / minDim) * 100000))
        : 0;
    return `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${adj}"/></a:avLst></a:prstGeom>`;
  }
  const w = Math.round(node.width * scale);
  const h = Math.round(node.height * scale);
  const tl = Math.round(radii.tl * scale);
  const tr = Math.round(radii.tr * scale);
  const br = Math.round(radii.br * scale);
  const bl = Math.round(radii.bl * scale);
  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="${w}" b="${h}"/><a:pathLst><a:path w="${w}" h="${h}"><a:moveTo><a:pt x="${tl}" y="0"/></a:moveTo><a:lnTo><a:pt x="${w - tr}" y="0"/></a:lnTo>${tr > 0 ? `<a:arcTo wR="${tr}" hR="${tr}" stAng="16200000" swAng="5400000"/>` : ""}<a:lnTo><a:pt x="${w}" y="${h - br}"/></a:lnTo>${br > 0 ? `<a:arcTo wR="${br}" hR="${br}" stAng="0" swAng="5400000"/>` : ""}<a:lnTo><a:pt x="${bl}" y="${h}"/></a:lnTo>${bl > 0 ? `<a:arcTo wR="${bl}" hR="${bl}" stAng="5400000" swAng="5400000"/>` : ""}<a:lnTo><a:pt x="0" y="${tl}"/></a:lnTo>${tl > 0 ? `<a:arcTo wR="${tl}" hR="${tl}" stAng="10800000" swAng="5400000"/>` : ""}<a:close/></a:path></a:pathLst></a:custGeom>`;
}

function pathGeometryXml(node, scale) {
  const points = node.points ?? [];
  const w = Math.round(node.width * scale);
  const h = Math.round(node.height * scale);
  if (!points.length) {
    return '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
  }
  const baseW =
    Number.isFinite(node.baseWidth) && node.baseWidth > 0
      ? node.baseWidth
      : null;
  const baseH =
    Number.isFinite(node.baseHeight) && node.baseHeight > 0
      ? node.baseHeight
      : null;
  const scaleX = (baseW ? node.width / baseW : 1) * scale;
  const scaleY = (baseH ? node.height / baseH : 1) * scale;

  const ptCoord = (point, handle = null) => {
    const rawX = Array.isArray(point) ? point[0] : point.x;
    const rawY = Array.isArray(point) ? point[1] : point.y;
    const hx = handle?.[0] ?? 0;
    const hy = handle?.[1] ?? 0;
    return {
      x: Math.round((rawX + hx) * scaleX),
      y: Math.round((rawY + hy) * scaleY),
    };
  };

  const start = ptCoord(points[0]);
  let pathBody = `<a:moveTo><a:pt x="${start.x}" y="${start.y}"/></a:moveTo>`;

  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    const end = ptCoord(to);
    if (from.out || to.in) {
      const c1 = ptCoord(from, from.out);
      const c2 = ptCoord(to, to.in);
      pathBody += `<a:cubicBezTo><a:pt x="${c1.x}" y="${c1.y}"/><a:pt x="${c2.x}" y="${c2.y}"/><a:pt x="${end.x}" y="${end.y}"/></a:cubicBezTo>`;
    } else {
      pathBody += `<a:lnTo><a:pt x="${end.x}" y="${end.y}"/></a:lnTo>`;
    }
  }

  const last = points[points.length - 1];
  const isClosed = isClosedPath(node);
  if (isClosed) {
    if (last.out || points[0].in) {
      const c1 = ptCoord(last, last.out);
      const c2 = ptCoord(points[0], points[0].in);
      pathBody += `<a:cubicBezTo><a:pt x="${c1.x}" y="${c1.y}"/><a:pt x="${c2.x}" y="${c2.y}"/><a:pt x="${start.x}" y="${start.y}"/></a:cubicBezTo>`;
    }
    pathBody += "<a:close/>";
  }

  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="${w}" b="${h}"/><a:pathLst><a:path w="${w}" h="${h}">${pathBody}</a:path></a:pathLst></a:custGeom>`;
}

export function isClosedPath(node) {
  const points = node.points ?? [];
  const last = points[points.length - 1];
  return Boolean(
    node.closed ||
      node.poly ||
      last?.close === true ||
      points.some((p) => p?.close === true),
  );
}

export function resolveStrokeAlign(node) {
  if (
    node.kind === "rect" ||
    node.kind === "ellipse" ||
    node.kind === "image"
  ) {
    return node.strokeAlign ?? "inside";
  }
  if (node.kind === "path") {
    return node.strokeAlign ?? "center";
  }
  return node.strokeAlign ?? "center";
}

function strokeCapAttr(node) {
  const rawCap = node.strokeCap ?? (node.kind === "path" ? "round" : null);
  if (!rawCap) return "";
  const cap = node.strokeDash === "dotted" ? "round" : rawCap;
  if (cap === "round") return ' cap="rnd"';
  if (cap === "square") return ' cap="sq"';
  if (cap === "butt") return ' cap="flat"';
  return "";
}

function strokeDashXml(dash) {
  if (dash === "dashed") return '<a:prstDash val="dash"/>';
  if (dash === "dotted") return '<a:prstDash val="dot"/>';
  if (dash === "solid") return '<a:prstDash val="solid"/>';
  return "";
}

function strokeJoinXml(node) {
  const join = node.strokeJoin ?? (node.kind === "path" ? "round" : null);
  if (join === "round") return "<a:round/>";
  if (join === "bevel") return "<a:bevel/>";
  if (join === "miter") {
    const lim =
      Number.isFinite(node.strokeMiterLimit) && node.strokeMiterLimit >= 1
        ? Math.round(node.strokeMiterLimit * 100000)
        : null;
    return lim ? `<a:miter lim="${lim}"/>` : "<a:miter/>";
  }
  return "";
}

function arrowEndType(cap) {
  if (!cap || cap === "lines") return "arrow";
  if (cap === "triangle" || cap === "filled") return "triangle";
  if (cap === "circle") return "oval";
  if (cap === "diamond") return "diamond";
  return null;
}

function arrowSizeName(size) {
  if (size === "sm" || size === "med" || size === "lg") return size;
  if (typeof size === "number") {
    if (size <= 10) return "sm";
    if (size >= 18) return "lg";
  }
  return "med";
}

function arrowEndsXml(node) {
  if (node.kind !== "path") return "";
  const headType = node.arrowStart ? arrowEndType(node.arrowCap) : null;
  const tailType =
    node.arrow || node.arrowEnd ? arrowEndType(node.arrowCap) : null;
  if (!headType && !tailType) return "";
  const size = arrowSizeName(node.arrowSize);
  const headXml = headType
    ? `<a:headEnd type="${headType}" w="${size}" len="${size}"/>`
    : "";
  const tailXml = tailType
    ? `<a:tailEnd type="${tailType}" w="${size}" len="${size}"/>`
    : "";
  return `${headXml}${tailXml}`;
}

export function lineXml(node, scale, isShape = true) {
  if (!node.strokeWidth || node.strokeWidth <= 0) {
    return isShape ? "<a:ln><a:noFill/></a:ln>" : "";
  }
  const w = Math.round(node.strokeWidth * scale);
  const cap = strokeCapAttr(node);
  const align = resolveStrokeAlign(node);
  const algnAttr = ` algn="${align === "inside" ? "in" : "ctr"}"`;
  const fill = solidFill(node.stroke, node.opacity ?? 1);
  const dash = strokeDashXml(node.strokeDash);
  const join = strokeJoinXml(node);
  const arrows = arrowEndsXml(node);
  return `<a:ln w="${w}"${cap}${algnAttr}>${fill}${dash}${join}${arrows}</a:ln>`;
}

export function booleanGeometryXml(node, scale) {
  const sources = node.sources ?? [];
  const w = Math.round(node.width * scale);
  const h = Math.round(node.height * scale);
  if (!sources.length) {
    return '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
  }
  let pathBody = "";
  for (const source of sources) {
    const sw = (source.w ?? source.width ?? 0) * scale;
    const sh = (source.h ?? source.height ?? 0) * scale;
    const sx = (source.x ?? 0) * scale;
    const sy = (source.y ?? 0) * scale;
    const kind = source.type ?? source.kind ?? "rect";
    if (kind === "ellipse") {
      const rx = sw / 2;
      const ry = sh / 2;
      const cx = sx + rx;
      const cy = sy + ry;
      const kx = rx * 0.5522847498;
      const ky = ry * 0.5522847498;
      const p0 = { x: Math.round(cx), y: Math.round(cy - ry) };
      const p1 = { x: Math.round(cx + rx), y: Math.round(cy) };
      const p2 = { x: Math.round(cx), y: Math.round(cy + ry) };
      const p3 = { x: Math.round(cx - rx), y: Math.round(cy) };
      pathBody += `<a:moveTo><a:pt x="${p0.x}" y="${p0.y}"/></a:moveTo>`;
      pathBody += `<a:cubicBezTo><a:pt x="${Math.round(cx + kx)}" y="${Math.round(cy - ry)}"/><a:pt x="${Math.round(cx + rx)}" y="${Math.round(cy - ky)}"/><a:pt x="${p1.x}" y="${p1.y}"/></a:cubicBezTo>`;
      pathBody += `<a:cubicBezTo><a:pt x="${Math.round(cx + rx)}" y="${Math.round(cy + ky)}"/><a:pt x="${Math.round(cx + kx)}" y="${Math.round(cy + ry)}"/><a:pt x="${p2.x}" y="${p2.y}"/></a:cubicBezTo>`;
      pathBody += `<a:cubicBezTo><a:pt x="${Math.round(cx - kx)}" y="${Math.round(cy + ry)}"/><a:pt x="${Math.round(cx - rx)}" y="${Math.round(cy + ky)}"/><a:pt x="${p3.x}" y="${p3.y}"/></a:cubicBezTo>`;
      pathBody += `<a:cubicBezTo><a:pt x="${Math.round(cx - rx)}" y="${Math.round(cy - ky)}"/><a:pt x="${Math.round(cx - kx)}" y="${Math.round(cy - ry)}"/><a:pt x="${p0.x}" y="${p0.y}"/></a:cubicBezTo>`;
      pathBody += "<a:close/>";
    } else if (
      kind === "path" &&
      Array.isArray(source.points) &&
      source.points.length > 0
    ) {
      const baseW =
        Number.isFinite(source.baseWidth) && source.baseWidth > 0
          ? source.baseWidth
          : null;
      const baseH =
        Number.isFinite(source.baseHeight) && source.baseHeight > 0
          ? source.baseHeight
          : null;
      const scaleX =
        (baseW ? (source.w ?? source.width) / baseW : 1) * scale;
      const scaleY =
        (baseH ? (source.h ?? source.height) / baseH : 1) * scale;
      const ptCoord = (pt, handle = null) => {
        const rawX = Array.isArray(pt) ? pt[0] : pt.x;
        const rawY = Array.isArray(pt) ? pt[1] : pt.y;
        const hx = handle?.[0] ?? 0;
        const hy = handle?.[1] ?? 0;
        return {
          x: Math.round(sx + (rawX + hx) * scaleX),
          y: Math.round(sy + (rawY + hy) * scaleY),
        };
      };
      const pts = source.points;
      const start = ptCoord(pts[0]);
      pathBody += `<a:moveTo><a:pt x="${start.x}" y="${start.y}"/></a:moveTo>`;
      for (let i = 1; i < pts.length; i += 1) {
        const from = pts[i - 1];
        const to = pts[i];
        const end = ptCoord(to);
        if (from.out || to.in) {
          const c1 = ptCoord(from, from.out);
          const c2 = ptCoord(to, to.in);
          pathBody += `<a:cubicBezTo><a:pt x="${c1.x}" y="${c1.y}"/><a:pt x="${c2.x}" y="${c2.y}"/><a:pt x="${end.x}" y="${end.y}"/></a:cubicBezTo>`;
        } else {
          pathBody += `<a:lnTo><a:pt x="${end.x}" y="${end.y}"/></a:lnTo>`;
        }
      }
      pathBody += "<a:close/>";
    } else {
      const rx = Math.round(sx);
      const ry = Math.round(sy);
      const rw = Math.round(sw);
      const rh = Math.round(sh);
      pathBody += `<a:moveTo><a:pt x="${rx}" y="${ry}"/></a:moveTo>`;
      pathBody += `<a:lnTo><a:pt x="${rx + rw}" y="${ry}"/></a:lnTo>`;
      pathBody += `<a:lnTo><a:pt x="${rx + rw}" y="${ry + rh}"/></a:lnTo>`;
      pathBody += `<a:lnTo><a:pt x="${rx}" y="${ry + rh}"/></a:lnTo>`;
      pathBody += "<a:close/>";
    }
  }
  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="${w}" b="${h}"/><a:pathLst><a:path w="${w}" h="${h}">${pathBody}</a:path></a:pathLst></a:custGeom>`;
}

export function shapeGeometryXml(node, scale) {
  if (node.kind === "ellipse") {
    return '<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>';
  }
  if (node.kind === "path") {
    return pathGeometryXml(node, scale);
  }
  if (node.kind === "boolean") {
    return booleanGeometryXml(node, scale);
  }
  return rectGeometryXml(node, scale);
}

export function shapeXml(id, node, scale) {
  const geometryXml = shapeGeometryXml(node, scale);
  const stroke = lineXml(node, scale, true);
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xmlText(node.name ?? node.kind)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${transform(node, scale)}${geometryXml}${solidFill(node.fill, node.opacity ?? 1)}${stroke}</p:spPr></p:sp>`;
}

export function resolvePptxTypeface(fontStack) {
  if (!fontStack || typeof fontStack !== "string") return "Arial";
  if (fontStack.startsWith("system-ui") || fontStack.startsWith("-apple-system")) {
    return "Arial";
  }
  const bundled = bundledFamilyOf(fontStack);
  if (bundled) return bundled;
  const match = fontStack.match(/^['"]?([^,'"]+)['"]?/);
  const first = match ? match[1].trim() : "";
  if (!first || first.toLowerCase().includes("sans-serif") || first.toLowerCase().includes("system-ui")) {
    return "Arial";
  }
  return first;
}

export function textXml(id, node, scale) {
  const color = solidFill(node.fill, node.opacity ?? 1);
  const fontSize = Math.max(
    100,
    Math.round(((node.fontSize * scale) / 12700) * 100),
  );
  const family = resolvePptxTypeface(node.fontFamily);
  const face = xmlText(family);
  const align =
    { left: "l", center: "ctr", right: "r", justify: "just" }[node.align] ??
    "l";
  const linePercent = Math.round((node.lineHeight ?? 1.25) * 100000);
  const spacing =
    node.letterSpacing != null && node.letterSpacing !== 0
      ? ` spc="${Math.round(((node.letterSpacing * scale) / 12700) * 100)}"`
      : "";
  const runProperties = `<a:rPr sz="${fontSize}" b="${textBoldWeight(node)}" i="${node.italic ? 1 : 0}"${node.underline ? ' u="sng"' : ""}${spacing} dirty="0">${color}<a:latin typeface="${face}"/><a:ea typeface="${face}"/></a:rPr>`;
  const paragraphs = String(node.text ?? "")
    .split(/\r\n|\r|\n/)
    .map(
      (line) =>
        `<a:p><a:pPr algn="${align}"><a:lnSpc><a:spcPct val="${linePercent}"/></a:lnSpc></a:pPr><a:r>${runProperties}<a:t xml:space="preserve">${xmlText(line)}</a:t></a:r><a:endParaRPr sz="${fontSize}"/></a:p>`,
    )
    .join("");
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xmlText(node.name ?? node.text)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${transform(node, scale)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="${node.boxWidth > 0 ? "square" : "none"}" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;
}

export function pictureXml(id, node, relationshipId, scale, sourceRect = null) {
  const alpha =
    (node.opacity ?? 1) < 1
      ? `<a:alphaModFix amt="${Math.round(node.opacity * 100000)}"/>`
      : "";
  const geometryXml = rectGeometryXml(node, scale);
  const cropXml = sourceRect
    ? `<a:srcRect l="${Math.round(sourceRect.left * 100000)}" t="${Math.round(sourceRect.top * 100000)}" r="${Math.round(sourceRect.right * 100000)}" b="${Math.round(sourceRect.bottom * 100000)}"/>`
    : "";
  const fillXml =
    node.fill && node.fill !== "transparent" && node.fill !== "none"
      ? solidFill(node.fill, node.opacity ?? 1)
      : "";
  const strokeXml = lineXml(node, scale, false);
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${xmlText(node.name ?? "Image")}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${relationshipId}">${alpha}</a:blip>${cropXml}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${transform(node, scale)}${geometryXml}${fillXml}${strokeXml}</p:spPr></p:pic>`;
}

export function slideXml(shapes, background) {
  const fill = solidFill(background === "transparent" ? "#ffffff" : background);
  return `${XML_HEADER}<p:sld ${PRESENTATION_NAMESPACES}><p:cSld><p:bg><p:bgPr>${fill}<a:effectLst/></p:bgPr></p:bg><p:spTree>${GROUP_SHAPE}${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

export function notesXml(notes) {
  const body = String(notes ?? "")
    .split(/\r\n|\r|\n/)
    .map(
      (line) =>
        `<a:p><a:r><a:t xml:space="preserve">${xmlText(line)}</a:t></a:r></a:p>`,
    )
    .join("");
  const text = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes"/><p:cNvSpPr txBox="1"/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="4114800"/><a:ext cx="5486400" cy="4114800"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/>${body}</p:txBody></p:sp>`;
  return `${XML_HEADER}<p:notes ${PRESENTATION_NAMESPACES}><p:cSld><p:spTree>${GROUP_SHAPE}${text}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;
}

export function themeXml(deck = null) {
  let primaryFont = "Arial";
  const colors = {
    dk1: "141414",
    lt1: "FFFFFF",
    dk2: "333333",
    lt2: "F3F3F3",
    accent1: "A7FFD4",
    accent2: "E5B2FF",
    accent3: "A3A3A3",
    accent4: "737373",
    accent5: "525252",
    accent6: "404040",
    hlink: "A7FFD4",
    folHlink: "E5B2FF",
  };

  if (deck?.pages && Array.isArray(deck.pages)) {
    const fonts = [];
    const discoveredColors = [];
    for (const page of deck.pages) {
      const nodes = page.doc?.nodes;
      if (Array.isArray(nodes)) {
        for (const n of nodes) {
          if (n.fontFamily) fonts.push(n.fontFamily);
          const parsed = parseColor(n.fill);
          if (
            parsed &&
            parsed.hex &&
            parsed.hex !== "FFFFFF" &&
            parsed.hex !== "000000"
          ) {
            discoveredColors.push(parsed.hex);
          }
        }
      }
    }
    if (fonts.length > 0) {
      primaryFont = resolvePptxTypeface(fonts[0]);
    }
    if (discoveredColors.length > 0) {
      colors.accent1 = discoveredColors[0];
      if (discoveredColors[1]) colors.accent2 = discoveredColors[1];
    }
  }

  const scheme = Object.entries(colors)
    .map(([key, color]) => `<a:${key}><a:srgbClr val="${color}"/></a:${key}>`)
    .join("");
  const fontFace = xmlText(primaryFont);
  const font = `<a:latin typeface="${fontFace}"/><a:ea typeface="${fontFace}"/><a:cs typeface="${fontFace}"/>`;
  const fill = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  const line = `<a:ln w="9525">${fill}<a:prstDash val="solid"/></a:ln>`;
  return `${XML_HEADER}<a:theme xmlns:a="${DRAWING_NS}" name="VOO"><a:themeElements><a:clrScheme name="VOO">${scheme}</a:clrScheme><a:fontScheme name="VOO"><a:majorFont>${font}</a:majorFont><a:minorFont>${font}</a:minorFont></a:fontScheme><a:fmtScheme name="VOO"><a:fillStyleLst>${fill.repeat(3)}</a:fillStyleLst><a:lnStyleLst>${line.repeat(3)}</a:lnStyleLst><a:effectStyleLst>${"<a:effectStyle><a:effectLst/></a:effectStyle>".repeat(3)}</a:effectStyleLst><a:bgFillStyleLst>${fill.repeat(3)}</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
}
