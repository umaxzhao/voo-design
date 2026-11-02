/**
 * Copy / paste appearance between layers (Figma's "Copy properties").
 *
 * Pure module: gathers the visual fields of a node, filters them for the
 * target's kind, and selects layers that share a fill/stroke/font/kind. The
 * engine controller wraps these in one undo entry.
 */

/** Fields a "copy properties" carries. Order is irrelevant; reads are defensive. */
export const STYLE_FIELDS = Object.freeze([
  "fill",
  "fills",
  "fillOpacity",
  "fillBlendMode",
  "stroke",
  "strokeFills",
  "strokeWidth",
  "strokeOpacity",
  "strokeAlign",
  "strokeStyle",
  "strokeDashed",
  "strokeJoin",
  "strokeCap",
  "opacity",
  "blendMode",
  "effects",
  "cornerRadius",
  "cornerRadii",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "italic",
  "underline",
  "strikeThrough",
  "lineHeight",
  "letterSpacing",
  "paragraphSpacing",
  "textAlign",
  "verticalAlign",
  "textCase",
  "textDecoration",
]);

const TEXT_ONLY = new Set([
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "italic",
  "underline",
  "strikeThrough",
  "lineHeight",
  "letterSpacing",
  "paragraphSpacing",
  "textAlign",
  "verticalAlign",
  "textCase",
  "textDecoration",
]);

const PAINT_ONLY = new Set([
  "fill",
  "fills",
  "fillOpacity",
  "fillBlendMode",
  "stroke",
  "strokeFills",
  "strokeWidth",
  "strokeOpacity",
  "strokeAlign",
  "strokeStyle",
  "strokeDashed",
  "strokeJoin",
  "strokeCap",
  "cornerRadius",
  "cornerRadii",
]);

const PAINT_KINDS = new Set(["rect", "ellipse", "path", "text", "boolean", "image", "group", "frame"]);

function clone(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((entry) => ({ ...entry }));
  if (typeof value === "object") return { ...value };
  return value;
}

/** The subset of `node` that "paste properties" would write. */
export function copyStyleFrom(node) {
  if (!node) return null;
  const style = {};
  for (const field of STYLE_FIELDS) {
    if (node[field] !== undefined) style[field] = clone(node[field]);
  }
  return Object.keys(style).length ? style : null;
}

/** Drop fields the target kind cannot paint with (text fields for a rect ...). */
export function styleForKind(style, kind) {
  if (!style) return null;
  const isText = kind === "text";
  const paints = PAINT_KINDS.has(kind);
  const result = {};
  for (const [field, value] of Object.entries(style)) {
    if (!isText && TEXT_ONLY.has(field)) continue;
    if (!paints && PAINT_ONLY.has(field)) continue;
    result[field] = clone(value);
  }
  return result;
}

/** `{...doc, nodes}` with the style applied to every id; same object when empty. */
export function pasteStyleInto(doc, ids, style) {
  const wanted = new Set(ids ?? []);
  if (!doc || !wanted.size || !style) return doc;
  let changed = false;
  const nodes = (doc.nodes ?? []).map((node) => {
    if (!wanted.has(node.id)) return node;
    const patch = styleForKind(style, node.kind);
    if (!patch || Object.keys(patch).length === 0) return node;
    changed = true;
    return { ...node, ...patch };
  });
  return changed ? { ...doc, nodes } : doc;
}

function primaryFill(node) {
  const paint = Array.isArray(node?.fills) && node.fills.length ? node.fills[0] : null;
  return paint?.fill ?? node?.fill ?? null;
}

function sameString(a, b) {
  return typeof a === "string" && typeof b === "string" ? a.toUpperCase() === b.toUpperCase() : a === b;
}

export const SELECT_SAME_CRITERIA = Object.freeze(["fill", "stroke", "font", "kind"]);

/**
 * Ids of every layer that shares the given property with `source`. Returns an
 * empty array when the source has nothing comparable (e.g. a transparent fill).
 */
export function selectSame(doc, source, criteria) {
  if (!doc || !source || !SELECT_SAME_CRITERIA.includes(criteria)) return [];
  const nodes = doc.nodes ?? [];
  const matches = (node) => {
    if (!node || node.id === source.id) return false;
    switch (criteria) {
      case "fill": {
        const value = primaryFill(source);
        return value != null && sameString(primaryFill(node), value);
      }
      case "stroke":
        return source.stroke != null && sameString(node.stroke, source.stroke);
      case "font":
        return (
          typeof source.fontFamily === "string" &&
          sameString(node.fontFamily, source.fontFamily) &&
          node.fontSize === source.fontSize &&
          node.fontWeight === source.fontWeight
        );
      case "kind":
        return node.kind === source.kind;
      default:
        return false;
    }
  };
  const ids = nodes.filter(matches).map((node) => node.id);
  return ids;
}
