/**
 * Scene-graph extraction for the code exporter.
 *
 * Pure module: no React, no DOM, no store access. It turns a scene document
 * plus a selection into an ordered render tree with document bounds, so the
 * Tailwind / HTML / React / CSS writers only have to format what it returns.
 *
 * The document model is the one the canvas already draws: `doc.nodes` is a flat
 * bottom-first list and nesting is expressed with `parentId` links. Groups store
 * absolute child boxes, so a child is positioned relative to the group's own
 * origin at export time.
 */

import { NODE_KIND, effectivePage } from "../editor/scene_model.js";
import { resolveCornerRadii } from "../editor/scene_model_core.js";
import { estimateTextSize } from "../editor/text_fidelity.js";

export const CODEGEN_FORMATS = Object.freeze(["html", "react", "css"]);
export const CODEGEN_SCOPES = Object.freeze(["selection", "page"]);

/** Node kinds that paint pixels and therefore define a selection's bounds. */
const BOUNDS_KINDS = new Set([
  NODE_KIND.IMAGE,
  NODE_KIND.RECT,
  NODE_KIND.ELLIPSE,
  NODE_KIND.PATH,
  NODE_KIND.TEXT,
  NODE_KIND.VIDEO,
  NODE_KIND.BOOLEAN,
  NODE_KIND.CANVAS_INSTANCE,
]);

const TRANSPARENT_VALUES = /^(?:transparent|none|initial|inherit)$/i;
const UNSAFE_CSS = /[;{}<>]|url\s*\(|expression\s*\(|@import/i;
const SAFE_CSS_VALUE = /^[\w#.,()%\s+-]+$/;
const GRADIENT_FILL = /^(?:linear|radial|conic)-gradient\s*\(/i;

export function isVisibleNode(node) {
  return Boolean(node) && node.visible !== false;
}

/**
 * A node's painted size. Text nodes are measured lazily by the renderer and may
 * carry a zero width/height before their first paint, so the same heuristic the
 * canvas uses is applied here instead of exporting a zero-sized box.
 */
export function measuredLayerSize(node) {
  if (!node) return { width: 0, height: 0 };
  const width = Number.isFinite(node.width) ? Math.max(0, node.width) : 0;
  const height = Number.isFinite(node.height) ? Math.max(0, node.height) : 0;
  if (node.kind !== NODE_KIND.TEXT || (width > 0 && height > 0)) {
    return { width, height };
  }
  const measured = estimateTextSize(node.text, node.fontSize, node.boxWidth, {
    lineHeight: node.lineHeight,
    letterSpacing: node.letterSpacing,
  });
  return {
    width: width > 0 ? width : node.boxWidth || measured.width,
    height: height > 0 ? height : measured.height,
  };
}

/**
 * The set of nodes a scope renders.
 *
 * Selection scope mirrors the canvas: selecting a group's painted members also
 * selects the group folder, so handoff keeps the original design structure.
 * Page scope renders every node.
 */
export function selectSceneNodes(doc, selectedIds) {
  const all = Array.isArray(doc?.nodes) ? doc.nodes : [];
  const ids = Array.isArray(selectedIds)
    ? selectedIds.filter((id) => typeof id === "string" && id)
    : [];
  if (ids.length === 0) return { nodes: all, selected: false };

  const selected = new Set(ids);
  for (const node of [...all].reverse()) {
    if (node.kind !== NODE_KIND.GROUP) continue;
    const members = all.filter((candidate) => candidate.parentId === node.id);
    if (members.length > 0 && members.every((member) => selected.has(member.id))) {
      selected.add(node.id);
    }
  }
  const byId = new Map(all.map((node) => [node.id, node]));
  const nodes = all.filter((node) => {
    let current = node;
    const visited = new Set();
    while (current && !visited.has(current.id)) {
      if (selected.has(current.id)) return true;
      visited.add(current.id);
      current = byId.get(current.parentId);
    }
    return false;
  });
  return { nodes, selected: true };
}

function unionBounds(nodes) {
  const drawable = nodes.filter(
    (node) => BOUNDS_KINDS.has(node.kind) && isVisibleNode(node),
  );
  if (drawable.length === 0) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const node of drawable) {
    const size = measuredLayerSize(node);
    left = Math.min(left, node.x);
    top = Math.min(top, node.y);
    right = Math.max(right, node.x + size.width);
    bottom = Math.max(bottom, node.y + size.height);
  }
  if (![left, top, right, bottom].every(Number.isFinite)) return null;
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

/**
 * Builds the ordered render scene for one export.
 *
 * `emptySelection` means the caller asked for a selection export but nothing was
 * selected; the caller falls back to the whole page and reports a warning.
 */
export function buildScene(doc, { selectedIds = null, scope = "selection" } = {}) {
  if (!doc || !Array.isArray(doc.nodes)) throw new Error("codegen-no-document");
  const page = effectivePage(doc);
  const wantsSelection = scope !== "page";
  const picked = wantsSelection
    ? selectSceneNodes(doc, selectedIds)
    : { nodes: doc.nodes, selected: false };
  const emptySelection = wantsSelection && !picked.selected;
  const emptyDrawable =
    wantsSelection &&
    picked.selected &&
    unionBounds(picked.nodes) === null;
  const nodes = picked.nodes;
  const included = new Set(nodes.map((node) => node.id));
  const childrenOf = new Map();
  const roots = [];
  for (const node of nodes) {
    if (node.parentId && included.has(node.parentId)) {
      const children = childrenOf.get(node.parentId) ?? [];
      children.push(node);
      childrenOf.set(node.parentId, children);
    } else {
      roots.push(node);
    }
  }
  const selectedBounds = picked.selected ? unionBounds(nodes) : null;
  const useSelectionBounds = Boolean(selectedBounds) && !emptyDrawable;
  const bounds = useSelectionBounds
    ? selectedBounds
    : { x: page.x, y: page.y, width: page.width, height: page.height };
  const usePageBackground =
    scope === "page" || emptySelection || emptyDrawable;
  const pageBackground = usePageBackground
    ? backgroundValue(doc.backgroundColor)
    : null;
  return {
    page,
    bounds,
    background: pageBackground ?? "transparent",
    nodes,
    roots: roots.filter(isVisibleNode),
    childrenOf,
    selected: picked.selected,
    wantsSelection,
    emptySelection: emptySelection || emptyDrawable,
  };
}

/**
 * A node's stroke can paint outside its box; vector nodes are wrapped in an SVG
 * sized to the stroked outline, so the exported box grows by the same amount.
 */
export function vectorStrokePadding(node) {
  if (node?.kind !== NODE_KIND.PATH && node?.kind !== NODE_KIND.BOOLEAN) return 0;
  if (
    !(node.strokeWidth > 0) ||
    !node.stroke ||
    node.stroke === "transparent" ||
    node.stroke === "none"
  ) {
    return 0;
  }
  return Math.ceil(Number(node.strokeWidth) || 0);
}

/** The painted box in page coordinates plus the stroke padding for vector nodes. */
export function nodePaintBox(node, origin) {
  const padding = vectorStrokePadding(node);
  const size = measuredLayerSize(node);
  const x = Number.isFinite(node.x) ? node.x : 0;
  const y = Number.isFinite(node.y) ? node.y : 0;
  return {
    left: x - padding - origin.x,
    top: y - padding - origin.y,
    width: Math.max(0, size.width + padding * 2),
    height: Math.max(0, size.height + padding * 2),
    padding,
  };
}

/** Corner radii clamped to what the box can actually carry. */
export function nodeRadii(node) {
  if (!node || (node.kind !== NODE_KIND.RECT && node.kind !== NODE_KIND.IMAGE)) {
    return null;
  }
  const radii = resolveCornerRadii(node.cornerRadius, node.width, node.height);
  if (!radii) return null;
  if (radii.isUniform) {
    return radii.uniformRadius > 0 ? { uniform: radii.uniformRadius } : null;
  }
  if (radii.tl > 0 || radii.tr > 0 || radii.br > 0 || radii.bl > 0) {
    return { tl: radii.tl, tr: radii.tr, br: radii.br, bl: radii.bl };
  }
  return null;
}

/**
 * A CSS-safe colour value, or null for transparent/missing/unsafe input. This
 * is the single gate every fill/stroke passes before it reaches generated CSS.
 */
export function colorValue(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || TRANSPARENT_VALUES.test(trimmed)) return null;
  if (UNSAFE_CSS.test(trimmed) || !SAFE_CSS_VALUE.test(trimmed)) return null;
  return trimmed;
}

export function isGradientFill(value) {
  return typeof value === "string" && GRADIENT_FILL.test(value.trim());
}

/**
 * A page background is allowed to be a solid colour or a gradient; both are
 * validated so a hand-edited document cannot inject raw CSS into the export.
 */
export function backgroundValue(value) {
  if (isGradientFill(value)) {
    const trimmed = value.trim();
    return UNSAFE_CSS.test(trimmed) ? null : trimmed;
  }
  return colorValue(value);
}

/** Rounds export geometry to two decimals and never emits `-0`. */
export function codeNumber(value, fallback = 0) {
  const number = Number.isFinite(value) ? value : fallback;
  const rounded = Math.round(number * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/** A length as a CSS string: numbers are px, strings are already unit-tagged. */
export function codeLength(value) {
  return typeof value === "string" ? value : `${codeNumber(value)}px`;
}

export function slugify(value, fallback = "layer") {
  const slug = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return slug || fallback;
}

const RESERVED_WORDS = new Set([
  "await", "break", "case", "catch", "class", "const", "continue", "debugger",
  "default", "delete", "do", "else", "enum", "export", "extends", "false",
  "finally", "for", "function", "if", "implements", "import", "in",
  "instanceof", "interface", "let", "new", "null", "package", "private",
  "protected", "public", "return", "static", "super", "switch", "this",
  "throw", "true", "try", "typeof", "var", "void", "while", "with", "yield",
]);

/** A valid PascalCase React component name derived from a file name hint. */
export function componentName(base) {
  const pascal = String(base ?? "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  const safe = /^[A-Za-z_$]/.test(pascal) ? pascal : `Design${pascal}`;
  const component = safe || "DesignExport";
  return RESERVED_WORDS.has(component.toLowerCase()) ? `${component}Design` : component;
}

/**
 * The base file name hint for an export. Page scope prefers the document name;
 * a single selected root uses its layer name. Everything else is "design" or
 * "selection" so the download never depends on a random canvas id.
 */
export function suggestedBaseName(scene, doc) {
  if (scene.wantsSelection && !scene.emptySelection) {
    if (scene.roots.length === 1) {
      return slugify(scene.roots[0].name || scene.roots[0].kind, "selection");
    }
    return "selection";
  }
  return slugify(doc?.name || doc?.title || "design", "design");
}
