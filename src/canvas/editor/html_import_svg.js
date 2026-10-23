// Converts inline HTML SVG into editable scene shapes at its CSS box.

import { parseInlineStyle } from "./html_import_style.js";
import { NODE_KIND } from "./scene_model.js";
import { parseSvgStringToNodes } from "./editor_svg_import.js";

const SVG_TAGS = new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "defs",
  "clippath",
  "mask",
]);

function escapeAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

function serializeSvgTree(element, inheritedOpacity = 1, inheritedColor = "#000000") {
  const tag = String(element.tag ?? "").toLowerCase();
  if (!SVG_TAGS.has(tag)) return "";
  const attrs = { ...element.attrs };
  const style = parseInlineStyle(element.style);
  const color = style.color ?? attrs.color ?? inheritedColor;
  for (const key of ["fill", "stroke"]) {
    if (attrs[key] === "currentColor") attrs[key] = color;
  }
  // CSS classes and currentColor are resolved by the browser measurement pass.
  const paint = {};
  for (const key of ["fill", "stroke", "strokeWidth", "strokeLinecap", "strokeLinejoin", "fillRule", "fillOpacity", "strokeOpacity", "opacity", "color"]) {
    if (style[key] != null) {
      const name = key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
      const value = style[key];
      paint[name] = value === "currentColor" ? color : value;
    }
  }
  const opacity = inheritedOpacity * Math.max(0, Math.min(1, Number(style.opacity ?? attrs.opacity ?? 1)));
  paint.opacity = opacity;
  if (Object.keys(paint).length) attrs.style = `${attrs.style ?? ""};${Object.entries(paint).map(([key, value]) => `${key}:${value}`).join(";")}`;
  const attributes = Object.entries(attrs)
    .filter(([name]) => /^[a-zA-Z][a-zA-Z0-9:_-]*$/.test(name))
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join("");
  const text = String(element.text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;");
  const children = (element.children ?? []).map(child => serializeSvgTree(child, opacity, color)).join("");
  return `<${tag}${attributes}>${text}${children}</${tag}>`;
}

function viewBoxOrigin(element) {
  const values = String(element.attrs?.viewBox ?? element.attrs?.viewbox ?? "")
    .split(/[\s,]+/)
    .map(Number);
  return values.length === 4 && values.every(Number.isFinite)
    ? { x: values[0], y: values[1] }
    : { x: 0, y: 0 };
}

/** SVG paths and shapes stay editable and retain their nested group identity. */
export function importInlineSvg(element, box, parentId) {
  const markup = serializeSvgTree(element);
  const parsed = parseSvgStringToNodes(markup);
  if (!parsed.nodes.length) return [];
  const origin = viewBoxOrigin(element);
  const scaleX = box.width / (parsed.width || box.width);
  const scaleY = box.height / (parsed.height || box.height);
  const strokeScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;

  return parsed.nodes.map((node) => {
    node.x = box.x + (node.x - origin.x) * scaleX;
    node.y = box.y + (node.y - origin.y) * scaleY;
    node.width *= scaleX;
    node.height *= scaleY;
    if (node.kind === NODE_KIND.PATH) {
      node.baseWidth = node.width;
      node.baseHeight = node.height;
      node.points = node.points.map((point) => ({
        ...point,
        x: point.x * scaleX,
        y: point.y * scaleY,
        in: point.in?.map((value, index) => value * (index ? scaleY : scaleX)),
        out: point.out?.map(
          (value, index) => value * (index ? scaleY : scaleX),
        ),
      }));
    }
    if (node.strokeWidth) node.strokeWidth *= strokeScale;
    if (node.fontSize) node.fontSize *= scaleY;
    if (node.kind === NODE_KIND.GROUP) {
      node.x = box.x;
      node.y = box.y;
      node.width = box.width;
      node.height = box.height;
    }
    if (!node.parentId && parentId) node.parentId = parentId;
    return node;
  });
}
