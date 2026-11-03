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

const NAMED_ENTITIES = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
]);
const ENTITY_RE = /&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g;

/**
 * Decodes XML character references in one pass, so "&amp;#39;" becomes "&#39;"
 * and not "'". Unknown named entities are kept as written.
 */
export function decodeXmlEntities(value) {
  return String(value).replace(ENTITY_RE, (match, body) => {
    if (body[0] === "#") {
      const isHex = body[1] === "x" || body[1] === "X";
      const code = isHex ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES.get(body) ?? match;
  });
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
