import { NODE_KIND } from "./scene_model.js";

/** XML escaping and number formatting shared by the SVG writers. */
const ESCAPE_RE = /[&<>"']/g;
const ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeXml(value) {
  return String(value).replace(ESCAPE_RE, (ch) => ESCAPE_MAP[ch]);
}

export function number(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

export function svgNodeTransform(node) {
  const rotation = node?.rotation ?? 0;
  const shear = node?.shear ?? 0;
  const isImage = node?.kind === NODE_KIND.IMAGE;
  const flipH = !isImage && Boolean(node?.flipH);
  const flipV = !isImage && Boolean(node?.flipV);
  if (!rotation && !shear && !flipH && !flipV) return "";
  const cx = (node?.x ?? 0) + (node?.width ?? 0) / 2;
  const cy = (node?.y ?? 0) + (node?.height ?? 0) / 2;
  if (!shear && !flipH && !flipV) {
    return `transform="rotate(${number(rotation)} ${number(cx)} ${number(cy)})"`;
  }
  const parts = [`translate(${number(cx)} ${number(cy)})`];
  if (rotation) parts.push(`rotate(${number(rotation)})`);
  if (shear) parts.push(`skewX(${number(shear)})`);
  if (flipH || flipV) parts.push(`scale(${flipH ? -1 : 1} ${flipV ? -1 : 1})`);
  parts.push(`translate(${number(-cx)} ${number(-cy)})`);
  return `transform="${parts.join(" ")}"`;
}
