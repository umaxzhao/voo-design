import { resolveCornerRadii } from "./scene_model_core.js";
import { NODE_KIND } from "./scene_model.js";
import { escapeXml, number, svgNodeTransform } from "./editor_svg_xml.js";
import { roundedRectPathData } from "./editor_svg_image.js";
import { isCssGradient, parseGradient } from "../color_picker/gradient_fill.js";
import { isMeshGradient } from "../color_picker/mesh_gradient.js";
import {
  dashPatternFor,
  effectiveStrokeCap,
  normalizeStrokeProps,
} from "./stroke_style.js";
import { arrowheadGeometry } from "./shape_geometry.js";
import { arrowheadSize } from "./render_path_node.js";

export function isImagePaint(style) {
  return (
    typeof style === "string" &&
    /^(?:blob:|data:image\/|https?:|file:)/i.test(style)
  );
}

/** Assigns a stable gradient or pattern id per unique fill string. */
export function gradientDefs(nodes) {
  const defs = [];
  const ids = new Map();
  nodes.forEach((node) => {
    if (typeof node.fill !== "string") return;
    if (isMeshGradient(node.fill) && !ids.has(node.fill)) {
      const id = `mesh${ids.size}`;
      ids.set(node.fill, id);
      const source = node.fill.trim().match(/^url\(["']?(.*?)["']?\)$/i)?.[1];
      defs.push(`<pattern id="${id}" width="1" height="1" patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox">` +
        `<image href="${escapeXml(source)}" width="1" height="1" preserveAspectRatio="none"/></pattern>`);
    } else if (isCssGradient(node.fill) && !ids.has(node.fill)) {
      const id = `g${ids.size}`;
      ids.set(node.fill, id);
      const parsed = parseGradient(node.fill);
      if (!parsed?.stops) return;
      const stops = parsed.stops
        .map(
          (stop) =>
            `    <stop offset="${number(stop.position)}%" stop-color="${stop.color}"${
              stop.opacity != null && stop.opacity < 100
                ? ` stop-opacity="${number(stop.opacity / 100)}"`
                : ""
            }/>`,
        )
        .join("\n");
      if (parsed.type === "radial") {
        // The editor stores ellipse diameters as percentages of the node bounds.
        // Transform a unit circle to preserve both edited radii and the centre.
        const geometry = parsed.geometry ?? {};
        const cx = (geometry.centerX ?? 50) / 100;
        const cy = (geometry.centerY ?? 50) / 100;
        const rx = (geometry.width ?? 100) / 200;
        const ry = (geometry.height ?? 100) / 200;
        defs.push(
          `<radialGradient id="${id}" cx="0" cy="0" r="1" gradientTransform="translate(${number(cx)} ${number(cy)}) scale(${number(rx)} ${number(ry)})">\n${stops}\n  </radialGradient>`,
        );
      } else {
        let angle = 180;
        if (typeof parsed.angle === "number" && Number.isFinite(parsed.angle)) {
          angle = parsed.angle;
        } else if (typeof parsed.angle === "string") {
          const match = parsed.angle.match(/(-?\d+(?:\.\d+)?)/);
          if (match) {
            angle = parseFloat(match[1]);
          } else if (/to right/i.test(parsed.angle)) {
            angle = 90;
          } else if (/to left/i.test(parsed.angle)) {
            angle = 270;
          } else if (/to bottom/i.test(parsed.angle)) {
            angle = 180;
          } else if (/to top/i.test(parsed.angle)) {
            angle = 0;
          }
        }
        const rad = (angle * Math.PI) / 180;
        const dx = Math.sin(rad) * 0.5;
        const dy = -Math.cos(rad) * 0.5;
        const x1 = Math.round((0.5 - dx) * 1000) / 1000;
        const y1 = Math.round((0.5 - dy) * 1000) / 1000;
        const x2 = Math.round((0.5 + dx) * 1000) / 1000;
        const y2 = Math.round((0.5 + dy) * 1000) / 1000;
        defs.push(
          `<linearGradient id="${id}" x1="${number(x1)}" y1="${number(y1)}" x2="${number(x2)}" y2="${number(y2)}">\n${stops}\n  </linearGradient>`,
        );
      }
    } else if (isImagePaint(node.fill) && !ids.has(node.fill)) {
      const id = `pat${ids.size}`;
      ids.set(node.fill, id);
      defs.push(
        `<pattern id="${id}" width="1" height="1" patternUnits="objectBoundingBox">\n` +
        `    <image href="${escapeXml(node.fill)}" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none"/>\n` +
        `  </pattern>`,
      );
    }
  });
  return {
    defs,
    idOf: (fill) => (ids.has(fill) ? `url(#${ids.get(fill)})` : null),
  };
}

export function shapeAttributes(node, idOf) {
  const fill = idOf(node.fill) ?? escapeXml(node.fill ?? "none");
  const parts = [`fill="${fill}"`];
  const isMultiContour =
    Array.isArray(node.points) &&
    node.points.some((p, idx) => p?.close && idx < node.points.length - 1);
  if (node.fillRule != null || isMultiContour) {
    parts.push(`fill-rule="${escapeXml(node.fillRule ?? "evenodd")}"`);
  }
  if (node.strokeHidden !== true && node.strokeWidth > 0 && node.stroke && node.stroke !== "transparent") {
    parts.push(
      `stroke="${idOf(node.stroke) ?? escapeXml(node.stroke)}" stroke-width="${number(node.strokeWidth)}"`,
    );
    const style = normalizeStrokeProps(node);
    const join =
      node.strokeJoin ??
      (node.kind === NODE_KIND.RECT ? "miter" : style.join);
    parts.push(
      `stroke-linecap="${effectiveStrokeCap(style.cap, style.dash)}"`,
      `stroke-linejoin="${join}"`,
    );
    if (join === "miter") {
      parts.push(`stroke-miterlimit="${number(style.miterLimit)}"`);
    }
    const dash = dashPatternFor(style.dash, node.strokeWidth);
    if (dash.length > 0) {
      parts.push(`stroke-dasharray="${dash.map(number).join(" ")}"`);
    }
  }
  if (node.fillOpacity != null && node.fillOpacity < 1) parts.push(`fill-opacity="${number(node.fillOpacity)}"`);
  if (node.strokeOpacity != null && node.strokeOpacity < 1) parts.push(`stroke-opacity="${number(node.strokeOpacity)}"`);
  if (node.opacity != null && node.opacity < 1)
    parts.push(`opacity="${number(node.opacity)}"`);
  const transformAttr = svgNodeTransform(node);
  if (transformAttr) parts.push(transformAttr);
  return parts.join(" ");
}

/** Path `d` for relative path points and pen anchors, including cubic handles. */
export function pathData(node) {
  const points = node.points ?? [];
  if (points.length === 0) return "";
  const scaleX = node.baseWidth ? node.width / node.baseWidth : 1;
  const scaleY = node.baseHeight ? node.height / node.baseHeight : 1;
  const at = (point, handle = null) => {
    const x = Array.isArray(point) ? point[0] : point.x;
    const y = Array.isArray(point) ? point[1] : point.y;
    return `${number(node.x + (x + (handle?.[0] ?? 0)) * scaleX)} ${number(node.y + (y + (handle?.[1] ?? 0)) * scaleY)}`;
  };
  const commands = [];
  let contourStart = 0;

  while (contourStart < points.length) {
    const firstAnchor = points[contourStart];
    commands.push(`M${at(firstAnchor)}`);

    if (firstAnchor.close) {
      commands.push("Z");
      contourStart += 1;
      continue;
    }

    let i = contourStart + 1;
    while (i < points.length) {
      const from = points[i - 1];
      const to = points[i];
      if (from.out || to.in) {
        commands.push(
          `C${at(from, from.out)} ${at(to, to.in)} ${at(to)}`,
        );
      } else {
        commands.push(`L${at(to)}`);
      }
      if (to.close) {
        if (to.out || firstAnchor.in) {
          commands.push(
            `C${at(to, to.out)} ${at(firstAnchor, firstAnchor.in)} ${at(firstAnchor)}`,
          );
        }
        commands.push("Z");
        i += 1;
        break;
      }
      i += 1;
    }
    contourStart = i;
  }
  return commands.join(" ");
}

/** Path `d` for a polygon/star: straight `L` segments through every vertex plus `Z`. */
export function polyPathData(node) {
  const points = node.points ?? [];
  if (points.length === 0) return "";
  const scaleX = node.baseWidth ? node.width / node.baseWidth : 1;
  const scaleY = node.baseHeight ? node.height / node.baseHeight : 1;
  return (
    points
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"}${number(node.x + point[0] * scaleX)} ${number(node.y + point[1] * scaleY)}`,
      )
      .join(" ") + " Z"
  );
}

/** SVG `d` for a filled ribbon ring from `buildStrokeRibbon`. */
export function ribbonPathData(ribbon) {
  return `${ribbon
    .map((point, index) => `${index === 0 ? "M" : "L"}${point[0]} ${point[1]}`)
    .join(" ")} z`;
}

/** Attributes for a filled ribbon polygon. */
export function ribbonAttributes(node, idOf = () => null) {
  const parts = [`fill="${idOf(node.stroke) ?? escapeXml(node.stroke)}"`];
  if (node.strokeOpacity != null && node.strokeOpacity < 1)
    parts.push(`fill-opacity="${number(node.strokeOpacity)}"`);
  if (node.opacity != null && node.opacity < 1)
    parts.push(`opacity="${number(node.opacity)}"`);
  const transformAttr = svgNodeTransform(node);
  if (transformAttr) parts.push(transformAttr);
  return parts.join(" ");
}

export function arrowheadSvgElements(node, idOf = () => null) {
  const points = node.points ?? [];
  if (!(node.strokeWidth > 0) || node.strokeHidden || points.length < 2 || (!node.arrow && !node.arrowStart)) return [];
  const scaleX = node.baseWidth ? node.width / node.baseWidth : 1;
  const scaleY = node.baseHeight ? node.height / node.baseHeight : 1;
  const at = (index) => {
    const pt = points[index];
    const px = Array.isArray(pt) ? pt[0] : (pt?.x ?? 0);
    const py = Array.isArray(pt) ? pt[1] : (pt?.y ?? 0);
    return {
      x: node.x + px * scaleX,
      y: node.y + py * scaleY,
    };
  };
  const size = arrowheadSize(node.strokeWidth || 1, node.arrowSize);
  const elements = [];
  const buildHead = (tipIndex, step) => {
    const tip = at(tipIndex);
    const back = at(tipIndex + step);
    const angle = Math.atan2(tip.y - back.y, tip.x - back.x);
    const geometry = arrowheadGeometry(tip, angle, size, node.arrowCap);
    const strokeColor = idOf(node.stroke) ?? escapeXml(node.stroke || "#000000");
    const opacity = (node.opacity ?? 1) * (node.strokeOpacity ?? 1);
    const alpha = opacity < 1 ? ` opacity="${number(opacity)}"` : "";
    const strokeW = number(node.strokeWidth || 1);
    if (geometry.kind === "lines") {
      const [barb1, barb2] = geometry.barbs;
      elements.push(
        `<path d="M${number(tip.x)} ${number(tip.y)} L${number(barb1.x)} ${number(barb1.y)} M${number(tip.x)} ${number(tip.y)} L${number(barb2.x)} ${number(barb2.y)}" fill="none" stroke="${strokeColor}" stroke-width="${strokeW}" stroke-linecap="round" stroke-linejoin="round"${alpha}/>`,
      );
    } else if (geometry.kind === "circle") {
      elements.push(
        `<circle cx="${number(geometry.center.x)}" cy="${number(geometry.center.y)}" r="${number(geometry.radius)}" fill="${strokeColor}"${alpha}/>`,
      );
    } else if (geometry.kind === "polygon") {
      const d =
        geometry.points
          .map((p, i) => `${i === 0 ? "M" : "L"}${number(p.x)} ${number(p.y)}`)
          .join(" ") + " Z";
      elements.push(`<path d="${d}" fill="${strokeColor}"${alpha}/>`);
    }
  };
  if (node.arrow || node.arrowEnd !== false) {
    buildHead(points.length - 1, -1);
  }
  if (node.arrowStart) {
    buildHead(0, 1);
  }
  return elements;
}

export function renderBooleanSource(node, source, fillAttr) {
  const sx = node.x + source.x;
  const sy = node.y + source.y;
  const rotAttr = source.rotation
    ? ` transform="rotate(${number(source.rotation)} ${number(sx + source.w / 2)} ${number(sy + source.h / 2)})"`
    : "";
  if (source.type === NODE_KIND.ELLIPSE) {
    return `<ellipse cx="${number(sx + source.w / 2)}" cy="${number(sy + source.h / 2)}" rx="${number(source.w / 2)}" ry="${number(source.h / 2)}" ${fillAttr}${rotAttr}/>`;
  }
  if (source.type === NODE_KIND.PATH && source.points?.length > 0) {
    const d = pathData({
      x: sx,
      y: sy,
      width: source.w,
      height: source.h,
      points: source.points,
      baseWidth: source.baseWidth,
      baseHeight: source.baseHeight,
    });
    return `<path d="${d}" ${fillAttr}${rotAttr}/>`;
  }
  const radii = resolveCornerRadii(source.cornerRadius, source.w, source.h);
  if (radii.isUniform) {
    const radius =
      radii.uniformRadius > 0 ? ` rx="${number(radii.uniformRadius)}"` : "";
    return `<rect x="${number(sx)}" y="${number(sy)}" width="${number(source.w)}" height="${number(source.h)}"${radius} ${fillAttr}${rotAttr}/>`;
  }
  return `<path d="${roundedRectPathData(sx, sy, source.w, source.h, radii)}" ${fillAttr}${rotAttr}/>`;
}

export function booleanSourceToPathData(node, source) {
  const sx = node.x + source.x;
  const sy = node.y + source.y;
  if (source.type === NODE_KIND.ELLIPSE) {
    const cx = sx + source.w / 2;
    const cy = sy + source.h / 2;
    const rx = source.w / 2;
    const ry = source.h / 2;
    return `M ${number(cx - rx)} ${number(cy)} A ${number(rx)} ${number(ry)} 0 1 0 ${number(cx + rx)} ${number(cy)} A ${number(rx)} ${number(ry)} 0 1 0 ${number(cx - rx)} ${number(cy)} Z`;
  }
  if (source.type === NODE_KIND.PATH && source.points?.length > 0) {
    return pathData({
      x: sx,
      y: sy,
      width: source.w,
      height: source.h,
      points: source.points,
      baseWidth: source.baseWidth,
      baseHeight: source.baseHeight,
    });
  }
  const radii = resolveCornerRadii(source.cornerRadius, source.w, source.h);
  return roundedRectPathData(sx, sy, source.w, source.h, radii);
}
