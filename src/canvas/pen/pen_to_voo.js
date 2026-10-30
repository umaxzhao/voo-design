/**
 * Pen `.pen` document → VOO `.voo` envelope: a parsed Pen scene becomes one
 * editable design page, the same way the SVG and PSD importers do it.
 *
 * The Pen format is a foreign tree with its own layout model; VOO's document is
 * a flat, bottom-first node list where groups are folders (their children keep
 * absolute boxes) and auto layout is resolved into those boxes. So the job has
 * three parts:
 *
 *  1. resolve the Pen tree — refs expanded into copies, variables/themes
 *     resolved to static values, node sizes resolved (flex fill/hug sizes,
 *     text boxes, path viewBoxes);
 *  2. lay the tree out — flex frames get their children positioned here, and
 *     frames that map cleanly keep an `autoLayout` for later editing;
 *  3. flatten it — every leaf and container becomes a VOO node with a
 *     `parentId`, in pre-order (bottom-first), boxes translated to the page.
 *
 * Pen rotations are applied to the flattened leaves (VOO rotates a box around
 * its centre, Pen around its top-left; the position is adjusted so the paint
 * lands where Pen puts it), so a rotated frame keeps its rotated contents.
 *
 * Nothing here throws for a single unsupported layer: shaders, scripts, live
 * browsers and Pen's AI prompt nodes are reported in `warnings` and skipped,
 * and the rest of the document still imports. Only a document with no mappable
 * layer at all is an error.
 */

import { VOO_FILE_FORMAT } from "../../../electron/voo_format.js";
import { createDocument, createImageNode } from "../editor/scene_doc_factory.js";
import {
  createEllipseNode,
  createRectNode,
} from "../editor/scene_model_node_builders.js";
import { createGroupNode } from "../editor/scene_model_groups.js";
import { createTextNode } from "../editor/scene_model_text_effects.js";
import { createPenNode, penAnchorsBounds } from "../editor/scene_model_paths.js";
import {
  DEFAULT_FONT_SIZE,
  DEFAULT_TEXT_STYLE,
  LINE_HEIGHT_RATIO,
  normalizeCornerRadius,
  normalizeRotationDeg,
} from "../editor/scene_model_core.js";
import { parseSvgPath } from "../editor/editor_svg_parse.js";
import { PenImportError, PEN_UNSUPPORTED_TYPES } from "./pen_document.js";

const CONTAINER_TYPES = new Set(["frame", "group"]);
const SHAPE_TYPES = new Set([
  "rectangle",
  "ellipse",
  "polygon",
  "path",
  "text",
  "icon",
  "icon_font",
  "line",
  "note",
]);
const MAX_TREE_DEPTH = 64;
const MAX_REF_DEPTH = 12;
const SHAPE_FALLBACK_SIZE = 100;
const ICON_FALLBACK_SIZE = 24;
const FALLBACK_FONT_FAMILY = "system-ui, -apple-system, 'Segoe UI', sans-serif";

/** Pen blend mode names -> the editor's canvas blend modes. */
export const BLEND_MODES = {
  normal: "source-over",
  darken: "darken",
  multiply: "multiply",
  linearBurn: "linear-burn",
  colorBurn: "color-burn",
  light: "lighten",
  screen: "screen",
  linearDodge: "linear-dodge",
  colorDodge: "color-dodge",
  overlay: "overlay",
  softLight: "soft-light",
  hardLight: "hard-light",
  difference: "difference",
  exclusion: "exclusion",
  hue: "hue",
  saturation: "saturation",
  color: "color",
  luminosity: "luminosity",
};

/** VOO's fontWeight vocabulary; Pen may hand back a CSS keyword. */
const FONT_WEIGHTS = {
  normal: "normal",
  regular: "normal",
  bold: "bold",
  "100": "100",
  "200": "200",
  "300": "300",
  "400": "normal",
  "500": "500",
  "600": "600",
  "700": "700",
  "800": "800",
  "900": "900",
};

const TEXT_ALIGNS = { left: "left", center: "center", right: "right", justify: "left" };

const SIZING_PATTERN = /^(fill_container|fit_content)(?:\((-?\d+(?:\.\d+)?)\))?$/;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cloneNode(node) {
  if (!isObject(node)) return node;
  const copy = { ...node };
  if (Array.isArray(node.children)) copy.children = node.children.map(cloneNode);
  if (isObject(node.effect)) copy.effect = { ...node.effect };
  if (Array.isArray(node.effect)) copy.effect = node.effect.map((entry) => (isObject(entry) ? { ...entry } : entry));
  if (isObject(node.fill)) copy.fill = { ...node.fill };
  if (isObject(node.stroke)) copy.stroke = { ...node.stroke };
  if (isObject(node.theme)) copy.theme = { ...node.theme };
  if (isObject(node.descendants)) copy.descendants = { ...node.descendants };
  return copy;
}

/** Default theme = the first value of every declared axis. */
function defaultThemeOf(themes) {
  const theme = {};
  for (const [axis, values] of Object.entries(themes ?? {})) {
    if (Array.isArray(values) && typeof values[0] === "string") {
      theme[axis] = values[0];
    }
  }
  return theme;
}

function mergeTheme(parent, own) {
  return isObject(own) ? { ...parent, ...own } : parent;
}

function createContext(document, options) {
  const nodeById = new Map();
  const index = (children) => {
    for (const child of children ?? []) {
      if (!isObject(child)) continue;
      if (typeof child.id === "string" && !nodeById.has(child.id)) {
        nodeById.set(child.id, child);
      }
      if (Array.isArray(child.children)) index(child.children);
    }
  };
  index(document.children);
  return {
    variables: document.variables ?? {},
    themeDefaults: defaultThemeOf(document.themes),
    assets: options.assets instanceof Map ? options.assets : new Map(),
    measureText: typeof options.measureText === "function" ? options.measureText : estimateTextSize,
    warnings: new Map(),
    fonts: new Map(),
    sizes: new WeakMap(),
    specs: new WeakMap(),
    images: {},
    imageIdsByUrl: new Map(),
    imageCounter: 0,
    nodeById,
    refExpansions: 0,
  };
}

function note(ctx, message) {
  ctx.warnings.set(message, (ctx.warnings.get(message) ?? 0) + 1);
}

function warningList(warnings) {
  return [...warnings].map(([message, count]) => ({ message, count }));
}

/** Resolves one variable for a theme, following `$other` aliases. */
function resolveVariable(ctx, name, theme, seen = new Set()) {
  if (seen.has(name)) return undefined;
  seen.add(name);
  const definition = ctx.variables[name];
  if (!isObject(definition) || !Object.hasOwn(definition, "value")) {
    note(ctx, `variable-missing:${name}`);
    return undefined;
  }
  const entries = Array.isArray(definition.value)
    ? definition.value.filter(isObject)
    : [{ value: definition.value }];
  const themed = entries.find(
    (entry) =>
      isObject(entry.theme) &&
      Object.entries(entry.theme).every(([axis, value]) => theme?.[axis] === value),
  );
  const unthemed = entries.find((entry) => !entry.theme);
  const picked = themed ?? unthemed ?? entries[0];
  const value = picked?.value;
  if (typeof value === "string" && value.startsWith("$")) {
    return resolveVariable(ctx, value.slice(1), theme, seen);
  }
  return value;
}

/**
 * A raw Pen property that may be `$variable` -> its resolved value.
 * A `$`-prefixed string is only a variable when that name exists: Pen content
 * is free text, and labels like "$284,590" must not be read as a lookup.
 */
function resolveRaw(ctx, value, theme) {
  if (typeof value !== "string" || !value.startsWith("$")) return value;
  const name = value.slice(1);
  if (!Object.hasOwn(ctx.variables, name)) return value;
  return resolveVariable(ctx, name, theme);
}

/** The variable name a missing `$reference` asks for, or null. */
function missingVariable(ctx, value) {
  if (typeof value !== "string" || !value.startsWith("$")) return null;
  const name = value.slice(1);
  return Object.hasOwn(ctx.variables, name) ? null : name;
}

function numberValue(ctx, value, theme, fallback = 0) {
  const missing = missingVariable(ctx, value);
  if (missing) {
    note(ctx, `variable-missing:${missing}`);
    return fallback;
  }
  const raw = resolveRaw(ctx, value, theme);
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function stringValue(ctx, value, theme, fallback = "") {
  const raw = resolveRaw(ctx, value, theme);
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  return fallback;
}

function boolValue(ctx, value, theme, fallback = false) {
  const missing = missingVariable(ctx, value);
  if (missing) {
    note(ctx, `variable-missing:${missing}`);
    return fallback;
  }
  const raw = resolveRaw(ctx, value, theme);
  return typeof raw === "boolean" ? raw : fallback;
}

function colorValue(ctx, value, theme, fallback = null) {
  const missing = missingVariable(ctx, value);
  if (missing) {
    note(ctx, `variable-missing:${missing}`);
    return fallback;
  }
  const raw = resolveRaw(ctx, value, theme);
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (typeof raw === "number") return fallback;
  return fallback;
}

/** Parses one Pen size into `{ mode, size, fallback }`. */
function sizeSpecOf(ctx, value, theme, axis) {
  if (typeof value === "number" && Number.isFinite(value)) return { mode: "fixed", size: value };
  const missing = missingVariable(ctx, value);
  if (missing) note(ctx, `variable-missing:${missing}`);
  const raw = missing ? null : resolveRaw(ctx, value, theme);
  if (typeof raw === "number" && Number.isFinite(raw)) return { mode: "fixed", size: raw };
  if (typeof raw === "string") {
    const match = SIZING_PATTERN.exec(raw.trim());
    if (match) {
      return {
        mode: match[1] === "fill_container" ? "fill" : "hug",
        fallback: match[2] === undefined ? null : Number(match[2]),
        axis,
      };
    }
    const parsed = Number(raw);
    if (raw.trim() !== "" && Number.isFinite(parsed)) return { mode: "fixed", size: parsed };
  }
  return { mode: "hug", fallback: null, axis };
}

/** Padding in px, from a number, [v,h] or [t,r,b,l]. */
function paddingOf(ctx, node, theme) {
  const raw = node.padding;
  if (raw == null) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (Array.isArray(raw)) {
    const values = raw.map((entry) => numberValue(ctx, entry, theme, 0));
    if (values.length === 1) {
      const [all] = values;
      return { top: all, right: all, bottom: all, left: all };
    }
    if (values.length === 2) {
      return { top: values[0], right: values[1], bottom: values[0], left: values[1] };
    }
    if (values.length >= 4) {
      return { top: values[0], right: values[1], bottom: values[2], left: values[3] };
    }
    return { top: values[0] ?? 0, right: values[0] ?? 0, bottom: values[0] ?? 0, left: values[0] ?? 0 };
  }
  const all = numberValue(ctx, raw, theme, 0);
  return { top: all, right: all, bottom: all, left: all };
}

function gapOf(ctx, node, theme) {
  return Math.max(0, numberValue(ctx, node.gap, theme, 0));
}

/** Flex direction of a frame: absent means horizontal (the Pen default). */
function directionOf(node) {
  if (node.type !== "frame") return null;
  if (node.layout === "none") return null;
  if (node.layout === "vertical") return "vertical";
  return "horizontal";
}

function alignItemsOf(ctx, node, theme) {
  const raw = stringValue(ctx, node.alignItems, theme, "start");
  return raw === "center" || raw === "end" ? raw : "start";
}

function justifyContentOf(ctx, node, theme) {
  const raw = stringValue(ctx, node.justifyContent, theme, "start");
  const map = {
    start: "start",
    center: "center",
    end: "end",
    space_between: "space-between",
    space_around: "space-around",
  };
  return map[raw] ?? "start";
}

/** Whether a node is a flow child (not absolutely positioned, not hidden). */
function isFlowChild(ctx, node, theme) {
  if (node.layoutPosition === "absolute") return false;
  return boolValue(ctx, node.enabled, theme, true) !== false;
}

/* ------------------------------------------------------------------ *
 * Size resolution
 * ------------------------------------------------------------------ */

/**
 * The absolute size of every node, resolved once. Flex fill sizes are shared
 * between fill siblings here (the same arithmetic VOO's auto layout does), so
 * later passes only place boxes and never need to re-measure text.
 */
function measureChildren(children, parentInner, theme, ctx, depth) {
  for (const child of children) {
    if (!isObject(child) || typeof child.type !== "string") continue;
    measureNode(child, parentInner, theme, ctx, depth, null);
  }
}

/**
 * Resolves one node's size. `forced` carries a flex-assigned width/height for a
 * `fill_container` child: the parent's flex pass knows the share before the
 * child is measured, which is what keeps wrapping text correct.
 */
function measureNode(node, parentInner, theme, ctx, depth = 0, forced = null) {
  if (!isObject(node) || depth > MAX_TREE_DEPTH) return { width: 0, height: 0 };
  if (ctx.sizes.has(node) && !forced) return ctx.sizes.get(node);
  const nodeTheme = mergeTheme(theme, node.theme);
  const size = (() => {
    if (CONTAINER_TYPES.has(node.type)) {
      return node.type === "group"
        ? measureGroup(node, parentInner, nodeTheme, ctx, depth, forced)
        : measureFrame(node, parentInner, nodeTheme, ctx, depth, forced);
    }
    if (node.type === "text") return measureTextNode(node, parentInner, nodeTheme, ctx, forced);
    if (node.type === "note") return measureTextNode(node, parentInner, nodeTheme, ctx, forced);
    return measureShape(node, parentInner, nodeTheme, ctx, forced);
  })();
  ctx.sizes.set(node, size);
  return size;
}

function innerBoxOf(size, padding) {
  return {
    width: Math.max(0, (size?.width ?? 0) - padding.left - padding.right),
    height: Math.max(0, (size?.height ?? 0) - padding.top - padding.bottom),
  };
}

function dimensionFromSpec(spec, parentValue, fallback) {
  if (!spec) return fallback;
  if (spec.mode === "fixed") return spec.size;
  if (spec.mode === "fill") {
    if (typeof parentValue === "number" && Number.isFinite(parentValue)) return parentValue;
    if (typeof spec.fallback === "number") return spec.fallback;
    return fallback;
  }
  return typeof spec.fallback === "number" ? spec.fallback : fallback;
}

function measureFrame(node, parentInner, theme, ctx, depth, forced = null) {
  const widthSpec = forced?.width != null
    ? { mode: "fixed", size: forced.width }
    : sizeSpecOf(ctx, node.width ?? "fit_content", theme, "width");
  const heightSpec = forced?.height != null
    ? { mode: "fixed", size: forced.height }
    : sizeSpecOf(ctx, node.height ?? "fit_content", theme, "height");
  ctx.specs.set(node, { width: widthSpec, height: heightSpec });
  const padding = paddingOf(ctx, node, theme);
  const direction = directionOf(node);
  const gap = gapOf(ctx, node, theme);

  // A fixed or fill axis already has a pixel size, so its inner content box is
  // known before children are measured; a hug axis unrolls from the children.
  const knownWidth =
    widthSpec.mode === "hug"
      ? null
      : dimensionFromSpec(widthSpec, parentInner?.width, null);
  const knownHeight =
    heightSpec.mode === "hug"
      ? null
      : dimensionFromSpec(heightSpec, parentInner?.height, null);
  const knownInner = {
    width: knownWidth == null ? null : Math.max(0, knownWidth - padding.left - padding.right),
    height: knownHeight == null ? null : Math.max(0, knownHeight - padding.top - padding.bottom),
  };

  const children = Array.isArray(node.children) ? node.children : [];
  let contentWidth = 0;
  let contentHeight = 0;

  if (direction === null) {
    // Absolutely positioned children: their own boxes define a hug container.
    measureChildren(children, null, theme, ctx, depth + 1);
    for (const child of children) {
      if (!isObject(child)) continue;
      const childSize = ctx.sizes.get(child) ?? { width: 0, height: 0 };
      if (!isFlowChild(ctx, child, theme)) continue;
      const x = numberValue(ctx, child.x, theme, 0);
      const y = numberValue(ctx, child.y, theme, 0);
      contentWidth = Math.max(contentWidth, x + childSize.width);
      contentHeight = Math.max(contentHeight, y + childSize.height);
    }
  } else {
    const flow = children.filter(
      (child) => isObject(child) && isFlowChild(ctx, child, theme),
    );
    const specs = flow.map((child) =>
      sizeSpecOf(
        ctx,
        direction === "horizontal" ? (child.width ?? "fit_content") : (child.height ?? "fit_content"),
        mergeTheme(theme, child.theme),
        direction === "horizontal" ? "width" : "height",
      ),
    );
    const crossSpecs = flow.map((child) =>
      sizeSpecOf(
        ctx,
        direction === "horizontal" ? (child.height ?? "fit_content") : (child.width ?? "fit_content"),
        mergeTheme(theme, child.theme),
        direction === "horizontal" ? "height" : "width",
      ),
    );
    // Measure the fixed-size children first so the fill children can share the
    // space that is actually left over.
    const fillIndexes = [];
    for (let index = 0; index < flow.length; index += 1) {
      if (specs[index].mode === "fill" && knownInner[direction === "horizontal" ? "width" : "height"] != null) {
        fillIndexes.push(index);
        continue;
      }
      const forced = fillForced(crossSpecs[index], direction === "horizontal" ? "height" : "width", knownInner);
      measureNode(flow[index], knownInner, theme, ctx, depth + 1, forced);
    }
    if (fillIndexes.length > 0) {
      const mainKey = direction === "horizontal" ? "width" : "height";
      const crossKey = direction === "horizontal" ? "height" : "width";
      const innerMain = knownInner[mainKey];
      const fixedMain = flow.reduce((total, child, index) => {
        if (fillIndexes.includes(index)) return total;
        const size = ctx.sizes.get(child) ?? { width: 0, height: 0 };
        return total + size[mainKey];
      }, 0);
      const remaining = Math.max(
        0,
        innerMain - fixedMain - gap * Math.max(0, flow.length - 1),
      );
      const share = remaining / fillIndexes.length;
      for (const index of fillIndexes) {
        const forced = {
          ...fillForced(crossSpecs[index], crossKey, knownInner),
          [mainKey]: share,
        };
        measureNode(flow[index], knownInner, theme, ctx, depth + 1, forced);
      }
    }
    const sizes = flow.map((child) => ctx.sizes.get(child) ?? { width: 0, height: 0 });
    const mainSizes = sizes.map((size) => (direction === "horizontal" ? size.width : size.height));
    const crossSizes = sizes.map((size) => (direction === "horizontal" ? size.height : size.width));
    contentWidth =
      direction === "horizontal"
        ? mainSizes.reduce((total, value) => total + value, 0) + gap * Math.max(0, flow.length - 1)
        : Math.max(0, ...crossSizes);
    contentHeight =
      direction === "horizontal"
        ? Math.max(0, ...crossSizes)
        : mainSizes.reduce((total, value) => total + value, 0) + gap * Math.max(0, flow.length - 1);
  }

  const width =
    widthSpec.mode === "hug"
      ? padding.left + contentWidth + padding.right
      : (knownWidth ?? 0);
  const height =
    heightSpec.mode === "hug"
      ? padding.top + contentHeight + padding.bottom
      : (knownHeight ?? 0);
  return { width: Math.max(0, width), height: Math.max(0, height) };
}

/** A forced cross-axis size for a fill child, when the parent inner is known. */
function fillForced(spec, axis, knownInner) {
  if (spec?.mode !== "fill") return null;
  const value = knownInner?.[axis];
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return { [axis]: value };
}

function measureGroup(node, parentInner, theme, ctx, depth, forced = null) {
  const children = Array.isArray(node.children) ? node.children : [];
  measureChildren(children, null, theme, ctx, depth + 1);
  let maxX = 0;
  let maxY = 0;
  for (const child of children) {
    if (!isObject(child)) continue;
    const size = ctx.sizes.get(child) ?? { width: 0, height: 0 };
    const x = numberValue(ctx, child.x, theme, 0);
    const y = numberValue(ctx, child.y, theme, 0);
    maxX = Math.max(maxX, x + size.width);
    maxY = Math.max(maxY, y + size.height);
  }
  // The schema gives groups no size (the box is the children's bounds), but a
  // hand-written or future document may carry one; honour it when it does.
  const widthSpec = forced?.width != null
    ? { mode: "fixed", size: forced.width }
    : sizeSpecOf(ctx, node.width ?? "fit_content", theme, "width");
  const heightSpec = forced?.height != null
    ? { mode: "fixed", size: forced.height }
    : sizeSpecOf(ctx, node.height ?? "fit_content", theme, "height");
  const width = dimensionFromSpec(widthSpec, parentInner?.width, maxX);
  const height = dimensionFromSpec(heightSpec, parentInner?.height, maxY);
  return { width: Math.max(0, width), height: Math.max(0, height) };
}

/** Pen text style fields, resolved and mapped to the editor's vocabulary. */
function textStyleOf(ctx, node, theme) {
  const fontFamily = stringValue(ctx, node.fontFamily, theme, "") || FALLBACK_FONT_FAMILY;
  const fontSize = Math.max(1, numberValue(ctx, node.fontSize, theme, DEFAULT_FONT_SIZE));
  const rawWeight = stringValue(ctx, node.fontWeight, theme, DEFAULT_TEXT_STYLE.fontWeight);
  const fontWeight = FONT_WEIGHTS[rawWeight.toLowerCase()] ?? DEFAULT_TEXT_STYLE.fontWeight;
  const lineHeight = Math.max(0.1, numberValue(ctx, node.lineHeight, theme, LINE_HEIGHT_RATIO));
  const letterSpacing = numberValue(ctx, node.letterSpacing, theme, DEFAULT_TEXT_STYLE.letterSpacing);
  const rawAlign = stringValue(ctx, node.textAlign, theme, "left");
  const align = TEXT_ALIGNS[rawAlign] ?? "left";
  const italic = /italic|oblique/i.test(stringValue(ctx, node.fontStyle, theme, ""));
  const underline = boolValue(ctx, node.underline, theme, false);
  const textGrowth = ["auto", "fixed-width", "fixed-width-height"].includes(node.textGrowth)
    ? node.textGrowth
    : "auto";
  return {
    text: stringValue(ctx, node.content, theme, ""),
    fontFamily,
    fontSize,
    fontWeight,
    lineHeight,
    letterSpacing,
    align,
    italic,
    underline,
    textGrowth,
    rawAlign,
  };
}

function measureTextNode(node, parentInner, theme, ctx, forced) {
  const style = textStyleOf(ctx, node, theme);
  const widthSpec = forced?.width != null
    ? { mode: "fixed", size: forced.width }
    : sizeSpecOf(ctx, node.width ?? "fit_content", theme, "width");
  const heightSpec = forced?.height != null
    ? { mode: "fixed", size: forced.height }
    : sizeSpecOf(ctx, node.height ?? "fit_content", theme, "height");

  let width =
    widthSpec.mode === "hug"
      ? null
      : dimensionFromSpec(widthSpec, parentInner?.width, null);
  if (widthSpec.mode === "fill" && width == null) width = null;
  const boxWidth =
    width != null && (style.textGrowth !== "auto" || widthSpec.mode === "fill")
      ? width
      : 0;
  const measured = ctx.measureText({
    text: style.text,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    italic: style.italic,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    boxWidth,
  });
  if (width == null) width = measured.width;
  let height;
  if (heightSpec.mode === "fixed") height = heightSpec.size;
  else if (heightSpec.mode === "fill") {
    height = typeof parentInner?.height === "number" ? parentInner.height : measured.height;
  } else height = measured.height;
  ctx.textBoxes = ctx.textBoxes ?? new WeakMap();
  ctx.textBoxes.set(node, { boxWidth });
  return { width: Math.max(1, width), height: Math.max(1, height) };
}

function measureShape(node, parentInner, theme, ctx, forced) {
  const fallback =
    node.type === "icon" || node.type === "icon_font"
      ? ICON_FALLBACK_SIZE
      : node.type === "line"
        ? 1
        : SHAPE_FALLBACK_SIZE;
  const widthSpec = forced?.width != null
    ? { mode: "fixed", size: forced.width }
    : sizeSpecOf(ctx, node.width ?? "fit_content", theme, "width");
  const heightSpec = forced?.height != null
    ? { mode: "fixed", size: forced.height }
    : sizeSpecOf(ctx, node.height ?? "fit_content", theme, "height");

  let width = dimensionFromSpec(widthSpec, parentInner?.width, fallback);
  let height = dimensionFromSpec(heightSpec, parentInner?.height, node.type === "line" ? 1 : fallback);

  if (node.type === "path") {
    const bounds = rawPathBounds(node);
    if (widthSpec.mode === "hug") width = bounds?.width ?? fallback;
    if (heightSpec.mode === "hug") height = bounds?.height ?? fallback;
  }
  return { width: Math.max(0, width), height: Math.max(0, height) };
}

function rawPathBounds(node) {
  const geometry = typeof node.geometry === "string" ? node.geometry : "";
  if (!geometry) return null;
  try {
    const anchors = parseSvgPath(geometry);
    if (anchors.length === 0) return null;
    return penAnchorsBounds(anchors, 0);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Ref expansion
 * ------------------------------------------------------------------ */

/** Applies a ref's `descendants` overrides to the copied subtree. */
function applyDescendants(root, overrides) {
  if (!isObject(overrides)) return root;
  const apply = (node, path, isRoot) => {
    if (!isObject(node)) return node;
    const direct = overrides[node.id];
    const byPath = overrides[path.join("/")];
    const replacement = direct?.type ? direct : byPath?.type ? byPath : null;
    let current = node;
    if (isRoot && !replacement) {
      const override = direct ?? byPath;
      current = override ? { ...node, ...override } : node;
    } else if (replacement) {
      current = cloneNode(replacement);
    } else {
      const override = direct ?? byPath;
      if (override) current = { ...node, ...override };
    }
    if (Array.isArray(current.children)) {
      current = {
        ...current,
        children: current.children.map((child) =>
          apply(child, [...path, child?.id ?? ""], false),
        ),
      };
    }
    return current;
  };
  return apply(root, [root.id], true);
}

/** The properties a ref instance sets on top of the node it references. */
function applyRefInstance(resolved, ref, ctx) {
  const copy = cloneNode(resolved);
  if (typeof ref.id === "string") copy.id = ref.id;
  copy.x = numberValue(ctx, ref.x, ctx.themeDefaults, 0);
  copy.y = numberValue(ctx, ref.y, ctx.themeDefaults, 0);
  if (typeof ref.name === "string" && ref.name) copy.name = ref.name;
  for (const key of [
    "opacity",
    "rotation",
    "theme",
    "enabled",
    "flipX",
    "flipY",
    "layoutPosition",
    "layoutWidth",
    "layoutHeight",
    "fill",
    "stroke",
  ]) {
    if (ref[key] !== undefined) copy[key] = ref[key];
  }
  return applyDescendants(copy, ref.descendants);
}

/**
 * Clones a Pen node tree with every `ref` replaced by a copy of what it
 * references. Ref-to-ref chains resolve through the chain; a cycle or a
 * missing target is reported and the branch is dropped. The returned tree has
 * no `ref` nodes left, so later passes never special-case them.
 */
function resolvePenNode(node, ctx, stack = []) {
  if (!isObject(node)) return null;
  if (node.type === "ref") {
    const target = ctx.nodeById.get(node.ref);
    if (!target) {
      note(ctx, `ref-missing:${node.ref}`);
      return null;
    }
    if (stack.includes(node.id) || stack.length >= MAX_REF_DEPTH) {
      note(ctx, "ref-cycle");
      return null;
    }
    const resolved = resolvePenNode(target, ctx, [...stack, node.id]);
    if (!resolved) return null;
    ctx.refExpansions += 1;
    const instance = applyRefInstance(resolved, node, ctx);
    // `descendants` may swap a nested node for another component instance; the
    // replacement's `ref` is introduced after the target tree was resolved.
    if (instance.type === "ref") {
      return resolvePenNode(instance, ctx, [...stack, node.id]);
    }
    if (Array.isArray(instance.children)) {
      instance.children = instance.children
        .map((child) => resolvePenNode(child, ctx, [...stack, node.id]))
        .filter(Boolean);
    }
    return instance;
  }
  const copy = cloneNode(node);
  if (Array.isArray(node.children)) {
    copy.children = node.children
      .map((child) => resolvePenNode(child, ctx, stack))
      .filter(Boolean);
  }
  return copy;
}

/* ------------------------------------------------------------------ *
 * Paint mapping
 * ------------------------------------------------------------------ */

function alphaOf(color) {
  if (typeof color !== "string") return 1;
  const hex = color.trim().replace(/^#/, "");
  if (/^[0-9a-f]{4}$/i.test(hex)) {
    return parseInt(hex[3], 16) / 15;
  }
  if (/^[0-9a-f]{8}$/i.test(hex)) {
    return parseInt(hex.slice(6, 8), 16) / 255;
  }
  return 1;
}

function rgbOf(color) {
  if (typeof color !== "string") return "#000000";
  const hex = color.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toUpperCase();
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex}`.toUpperCase();
  if (/^[0-9a-f]{8}$/i.test(hex)) return `#${hex.slice(0, 6)}`.toUpperCase();
  return color;
}

function alphaHex(alpha) {
  const clamped = Math.min(1, Math.max(0, alpha));
  return Math.round(clamped * 255).toString(16).padStart(2, "0").toUpperCase();
}

/** Applies an extra opacity on top of a colour's own alpha. */
function colorWithAlpha(color, opacity = 1) {
  const alpha = alphaOf(color) * Math.min(1, Math.max(0, opacity));
  const rgb = rgbOf(color);
  if (/^#[0-9A-F]{6}$/i.test(rgb)) {
    return alpha >= 1 ? rgb : `${rgb}${alphaHex(alpha)}`;
  }
  return rgb;
}

function gradientCss(ctx, fill, theme) {
  const opacity = Math.min(1, Math.max(0, numberValue(ctx, fill.opacity, theme, 1)));
  const colors = Array.isArray(fill.colors) ? fill.colors.filter(isObject) : [];
  if (colors.length < 2) return null;
  const stops = colors
    .map((stop, index) => {
      const color = colorValue(ctx, stop.color, theme, "#000000");
      const position = Math.min(
        100,
        Math.max(0, numberValue(ctx, stop.position, theme, index / (colors.length - 1)) * 100),
      );
      return `${colorWithAlpha(color, opacity)} ${Number(position.toFixed(2))}%`;
    })
    .join(", ");
  const type = fill.gradientType === "radial" || fill.gradientType === "angular"
    ? fill.gradientType
    : "linear";
  const rotation = numberValue(ctx, fill.rotation, theme, 0);
  const center = {
    x: Math.min(1, Math.max(0, numberValue(ctx, fill.center?.x, theme, 0.5))),
    y: Math.min(1, Math.max(0, numberValue(ctx, fill.center?.y, theme, 0.5))),
  };
  if (type === "linear") {
    // Pen: degrees CCW from "up"; CSS: degrees clockwise from "up".
    const angle = ((-(rotation % 360) % 360) + 360) % 360;
    return `linear-gradient(${Number(angle.toFixed(2))}deg, ${stops})`;
  }
  const width = Math.min(4, Math.max(0, numberValue(ctx, fill.size?.width, theme, 1)));
  const height = Math.min(4, Math.max(0, numberValue(ctx, fill.size?.height, theme, 1)));
  const at = `${Number((center.x * 100).toFixed(2))}% ${Number((center.y * 100).toFixed(2))}%`;
  if (type === "angular") {
    const angle = ((-(rotation % 360) % 360) + 360) % 360;
    return `conic-gradient(from ${Number(angle.toFixed(2))}deg at ${at}, ${stops})`;
  }
  const radii = `${Number(((width * 100) / 2).toFixed(2))}% ${Number(((height * 100) / 2).toFixed(2))}%`;
  return `radial-gradient(ellipse ${radii} at ${at}, ${stops})`;
}

/**
 * The visible fills of a node, first significant one first.
 * Each entry is `{ kind: "color"|"gradient"|"image", value }`.
 */
function fillsOf(ctx, node, theme, { warn = true } = {}) {
  const raw = node.fill;
  if (raw == null) return [];
  const entries = Array.isArray(raw) ? raw : [raw];
  const fills = [];
  for (const entry of entries) {
    if (entry == null) continue;
    if (typeof entry === "string" || typeof entry === "number") {
      const color = colorValue(ctx, entry, theme, null);
      if (color) fills.push({ kind: "color", value: color });
      continue;
    }
    if (!isObject(entry)) continue;
    if (entry.enabled !== undefined && !boolValue(ctx, entry.enabled, theme, true)) continue;
    const type = entry.type ?? "color";
    if (type === "color") {
      const color = colorValue(ctx, entry.color, theme, null);
      if (color) fills.push({ kind: "color", value: color });
    } else if (type === "gradient") {
      const css = gradientCss(ctx, entry, theme);
      if (css) fills.push({ kind: "gradient", value: css });
      else if (warn) note(ctx, "gradient-degenerate");
    } else if (type === "image") {
      fills.push({
        kind: "image",
        value: {
          url: stringValue(ctx, entry.url, theme, ""),
          mode: entry.mode ?? "cover",
          opacity: numberValue(ctx, entry.opacity, theme, 1),
        },
      });
    } else if (warn) {
      note(ctx, `unsupported-fill:${type}`);
    }
  }
  if (warn && fills.length > 1) note(ctx, "extra-fills-dropped");
  return fills;
}

/** Resolves a Pen stroke (old `{thickness, fill}` object and the new fields). */
function strokeOf(ctx, node, theme) {
  const raw = node.stroke;
  let color = null;
  let width = null;
  let align = node.strokeAlignment;
  let cap = node.strokeLinecap;
  let join = node.strokeLinejoin;
  let dash = null;

  if (raw != null) {
    if (typeof raw === "string") {
      color = colorValue(ctx, raw, theme, null);
    } else if (Array.isArray(raw)) {
      const fills = fillsOf(ctx, { fill: raw }, theme, { warn: false });
      color = fills.find((fill) => fill.kind === "color")?.value ?? null;
    } else if (isObject(raw)) {
      if (Object.hasOwn(raw, "thickness")) {
        // Legacy stroke: { thickness, fill, align, cap, join }.
        color = colorValue(ctx, raw.fill, theme, null);
        width = thicknessOf(ctx, raw.thickness, theme);
        align = raw.align ?? align;
        cap = raw.cap ?? cap;
        join = raw.join ?? join;
      } else {
        const fills = fillsOf(ctx, { fill: raw }, theme, { warn: false });
        color = fills.find((fill) => fill.kind === "color")?.value ?? null;
      }
    }
  }
  if (width == null && node.strokeWidth != null) {
    width = thicknessOf(ctx, node.strokeWidth, theme);
  }
  if (width == null) width = 1;
  if (!color || !(width > 0)) return null;
  return {
    color,
    width,
    align: mapStrokeAlign(stringValue(ctx, align, theme, "center")),
    cap: mapStrokeCap(stringValue(ctx, cap, theme, "round")),
    join: mapStrokeJoin(stringValue(ctx, join, theme, "round")),
    dash,
  };
}

function thicknessOf(ctx, raw, theme) {
  if (raw == null) return 1;
  if (typeof raw === "number" || typeof raw === "string") {
    return numberValue(ctx, raw, theme, 1);
  }
  if (isObject(raw)) {
    const sides = ["top", "right", "bottom", "left"]
      .map((side) => numberValue(ctx, raw[side], theme, 0))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (sides.length > 0) {
      note(ctx, "stroke-width-per-side");
      return Math.max(...sides);
    }
  }
  return 1;
}

function mapStrokeAlign(value) {
  if (value === "inner") return "inside";
  if (value === "outer") return "outside";
  return "center";
}

function mapStrokeCap(value) {
  if (value === "butt" || value === "square") return value;
  return "round";
}

function mapStrokeJoin(value) {
  if (value === "miter" || value === "bevel") return value;
  return "round";
}

function blendModeOf(ctx, node, theme) {
  const raw = stringValue(ctx, node.blendMode, theme, "normal");
  return BLEND_MODES[raw] ?? "source-over";
}

/** Pen effects -> editor effect fields plus the blur fields the renderer reads. */
function effectsOf(ctx, node, theme) {
  const raw = node.effect;
  if (raw == null) return { effects: null, layerBlur: 0, backgroundBlur: 0 };
  const entries = Array.isArray(raw) ? raw : [raw];
  const effectModel = {};
  let layerBlur = 0;
  let backgroundBlur = 0;
  for (const entry of entries) {
    if (!isObject(entry)) continue;
    if (entry.enabled !== undefined && !boolValue(ctx, entry.enabled, theme, true)) continue;
    if (entry.type === "blur") {
      layerBlur = Math.max(layerBlur, numberValue(ctx, entry.radius, theme, 0));
    } else if (entry.type === "background_blur") {
      backgroundBlur = Math.max(backgroundBlur, numberValue(ctx, entry.radius, theme, 0));
    } else if (entry.type === "shadow") {
      const inner = entry.shadowType === "inner";
      const key = inner ? "innerShadow" : "shadow";
      if (effectModel[key]) {
        note(ctx, "extra-shadows-dropped");
        continue;
      }
      const color = colorValue(ctx, entry.color, theme, "#000000");
      effectModel[key] = {
        enabled: true,
        color: rgbOf(color),
        blur: Math.max(0, numberValue(ctx, entry.blur, theme, 0)),
        offsetX: numberValue(ctx, entry.offset?.x, theme, 0),
        offsetY: numberValue(ctx, entry.offset?.y, theme, 0),
        spread: 0,
        opacity: Math.round(alphaOf(color) * 100),
      };
    } else {
      note(ctx, `unsupported-effect:${entry.type}`);
    }
  }
  return {
    effects: Object.keys(effectModel).length > 0 ? effectModel : null,
    layerBlur,
    backgroundBlur,
  };
}

/** Copies paint fields onto a built node. */
function applyPaint(node, ctx, raw, theme, { includeEffects = true } = {}) {
  const fills = fillsOf(ctx, raw, theme);
  const solid = fills.find((fill) => fill.kind === "color");
  const gradient = fills.find((fill) => fill.kind === "gradient");
  const image = fills.find((fill) => fill.kind === "image");
  let imageId = null;
  if (image) {
    imageId = imageIdFor(ctx, image.value);
    if (imageId == null) {
      const fallback = solid ?? gradient;
      node.fill = fallback ? fallback.value : "transparent";
    }
  } else if (solid) {
    node.fill = solid.value;
  } else if (gradient) {
    node.fill = gradient.value;
  } else {
    node.fill = node.fill ?? "transparent";
  }
  const stroke = strokeOf(ctx, raw, theme);
  if (stroke) {
    node.stroke = stroke.color;
    node.strokeWidth = stroke.width;
    node.strokeAlign = stroke.align;
    node.strokeCap = stroke.cap;
    node.strokeJoin = stroke.join;
  } else {
    node.stroke = "transparent";
    node.strokeWidth = 0;
  }
  if (includeEffects) {
    const { effects, layerBlur, backgroundBlur } = effectsOf(ctx, raw, theme);
    if (effects) node.effects = effects;
    if (layerBlur > 0) node.layerBlur = layerBlur;
    if (backgroundBlur > 0) node.backgroundBlur = backgroundBlur;
  }
  return { node, imageId };
}

/** Registers an image fill asset and returns the editor image id it maps to. */
function imageIdFor(ctx, image) {
  const url = typeof image?.url === "string" ? image.url.trim() : "";
  if (!url) {
    note(ctx, "image-fill-empty");
    return null;
  }
  // The editor draws the bitmap stretched into the node's box; Pen's cover /
  // contain fitting cannot be reproduced from the fill record alone.
  if (image?.mode && image.mode !== "cover" && image.mode !== "stretch") {
    note(ctx, "image-fill-mode-ignored");
  }
  if (ctx.imageIdsByUrl.has(url)) return ctx.imageIdsByUrl.get(url);
  let dataUrl = null;
  if (url.startsWith("data:")) dataUrl = url;
  else if (ctx.assets.get(url)) dataUrl = ctx.assets.get(url);
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    ctx.imageIdsByUrl.set(url, null);
    note(ctx, `missing-asset:${url}`);
    return null;
  }
  ctx.imageCounter += 1;
  const imageId = `pen-img-${ctx.imageCounter}`;
  ctx.images[imageId] = dataUrl;
  ctx.imageIdsByUrl.set(url, imageId);
  return imageId;
}

/* ------------------------------------------------------------------ *
 * Layout
 * ------------------------------------------------------------------ */

/** Positions of a container's children in the container's own space. */
function layoutChildren(ctx, node, theme) {
  const size = ctx.sizes.get(node) ?? { width: 0, height: 0 };
  const children = Array.isArray(node.children) ? node.children : [];
  const positions = new Map();
  const direction = directionOf(node);

  if (direction === null) {
    for (const child of children) {
      if (!isObject(child)) continue;
      positions.set(child, {
        x: numberValue(ctx, child.x, theme, 0),
        y: numberValue(ctx, child.y, theme, 0),
      });
    }
    return positions;
  }

  const padding = paddingOf(ctx, node, theme);
  const gap = gapOf(ctx, node, theme);
  const justify = justifyContentOf(ctx, node, theme);
  const align = alignItemsOf(ctx, node, theme);
  const horizontal = direction === "horizontal";
  const flow = children.filter(
    (child) => isObject(child) && isFlowChild(ctx, child, theme),
  );
  const flowSizes = flow.map((child) => ctx.sizes.get(child) ?? { width: 0, height: 0 });
  const mainSize = (sizeOfChild) => (horizontal ? sizeOfChild.width : sizeOfChild.height);
  const crossSize = (sizeOfChild) => (horizontal ? sizeOfChild.height : sizeOfChild.width);
  const innerMain =
    (horizontal ? size.width : size.height) -
    (horizontal ? padding.left + padding.right : padding.top + padding.bottom);
  const innerCross =
    (horizontal ? size.height : size.width) -
    (horizontal ? padding.top + padding.bottom : padding.left + padding.right);
  const content = flowSizes.reduce((total, item) => total + mainSize(item), 0) +
    gap * Math.max(0, flow.length - 1);
  const free = Math.max(0, innerMain - content);
  const leading = horizontal ? padding.left : padding.top;
  const crossLeading = horizontal ? padding.top : padding.left;

  let cursor = leading;
  let extraGap = 0;
  if (justify === "center") cursor += free / 2;
  else if (justify === "end") cursor += free;
  else if (justify === "space-between" && flow.length > 1) extraGap = free / (flow.length - 1);
  else if (justify === "space-around" && flow.length > 0) {
    extraGap = free / flow.length;
    cursor += extraGap / 2;
  }

  for (let index = 0; index < flow.length; index += 1) {
    const child = flow[index];
    const childSize = flowSizes[index];
    const crossFree = Math.max(0, innerCross - crossSize(childSize));
    const cross =
      crossLeading +
      (align === "center" ? crossFree / 2 : align === "end" ? crossFree : 0);
    positions.set(child, {
      x: horizontal ? cursor : cross,
      y: horizontal ? cross : cursor,
    });
    cursor += mainSize(childSize) + gap + extraGap;
  }

  // Absolutely positioned children keep their own x/y (the Pen convention).
  for (const child of children) {
    if (!isObject(child) || positions.has(child)) continue;
    positions.set(child, {
      x: numberValue(ctx, child.x, theme, 0),
      y: numberValue(ctx, child.y, theme, 0),
    });
  }
  return positions;
}

/** The auto layout a Pen frame can keep for later editing, or null. */
function autoLayoutOf(ctx, node, theme) {
  if (node.type !== "frame") return null;
  const direction = directionOf(node);
  if (direction === null) return null;
  const justify = justifyContentOf(ctx, node, theme);
  if (justify === "space-around") return null;
  const specs = ctx.specs.get(node) ?? {};
  return {
    direction,
    gap: gapOf(ctx, node, theme),
    padding: paddingOf(ctx, node, theme),
    alignItems: alignItemsOf(ctx, node, theme),
    justifyContent: justify,
    widthMode: specs.width?.mode === "hug" ? "hug" : "fixed",
    heightMode: specs.height?.mode === "hug" ? "hug" : "fixed",
  };
}

/** Whether any visible child paints outside its frame's box. */
function hasOverflowingChildren(ctx, node, theme) {
  const size = ctx.sizes.get(node) ?? { width: 0, height: 0 };
  const positions = layoutChildren(ctx, node, theme);
  for (const child of Array.isArray(node.children) ? node.children : []) {
    if (!isObject(child) || !isFlowChild(ctx, child, theme)) continue;
    const position = positions.get(child);
    const childSize = ctx.sizes.get(child) ?? { width: 0, height: 0 };
    if (!position) continue;
    if (
      position.x < -0.5 ||
      position.y < -0.5 ||
      position.x + childSize.width > size.width + 0.5 ||
      position.y + childSize.height > size.height + 0.5
    ) {
      return true;
    }
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * Node building
 * ------------------------------------------------------------------ */

function textNodeOf(ctx, raw, theme, boxX, boxY, size) {
  const style = textStyleOf(ctx, raw, theme);
  const boxWidth = ctx.textBoxes?.get(raw)?.boxWidth ?? 0;
  const node = createTextNode({
    x: boxX,
    y: boxY,
    text: style.text,
    fill: "#000000",
    fontSize: style.fontSize,
  });
  node.fontFamily = style.fontFamily;
  node.fontWeight = style.fontWeight;
  node.lineHeight = style.lineHeight;
  node.letterSpacing = style.letterSpacing;
  node.align = style.align;
  node.italic = style.italic;
  node.underline = style.underline;
  node.width = Math.max(1, size.width);
  node.height = Math.max(1, size.height);
  node.boxWidth = boxWidth;
  if (style.rawAlign === "justify") note(ctx, "text-justify-ignored");
  if (raw.textAlignVertical && raw.textAlignVertical !== "top") {
    note(ctx, "text-vertical-align-ignored");
  }
  if (boolValue(ctx, raw.strikethrough, theme, false)) {
    note(ctx, "text-strikethrough-ignored");
  }
  if (fillsOf(ctx, raw, theme, { warn: false }).some((fill) => fill.kind === "image")) {
    // Pen paints text with an image fill through the glyphs; the editor's text
    // renderer has no image paint, so the text keeps its fallback colour.
    note(ctx, "text-image-fill-ignored");
  }
  applyPaint(node, ctx, raw, theme);
  noteFont(ctx, style.fontFamily, style.fontWeight);
  return node;
}

function noteFont(ctx, family, weight) {
  const entry = ctx.fonts.get(family) ?? { family, styles: new Set(), count: 0 };
  entry.styles.add(weight);
  entry.count += 1;
  ctx.fonts.set(family, entry);
}

function shapeNodeOf(ctx, raw, theme, boxX, boxY, size) {
  const common = { x: boxX, y: boxY, width: size.width, height: size.height };
  let node;

  // A shape whose fill is a bitmap becomes an image node, the editor's way of
  // painting pixels inside a box (rect/ellipse nodes only take colours or CSS
  // gradients). Paths and polygons have no image counterpart, so they keep a
  // colour fill and the bitmap is reported as dropped.
  const image = fillsOf(ctx, raw, theme, { warn: false }).find((fill) => fill.kind === "image");
  if (image && raw.type !== "path" && raw.type !== "polygon") {
    const imageId = imageIdFor(ctx, image.value);
    if (imageId) {
      node = createImageNode({ ...common, imageId });
      node.fill = "transparent";
      const stroke = strokeOf(ctx, raw, theme);
      if (stroke) {
        node.stroke = stroke.color;
        node.strokeWidth = stroke.width;
      }
      if (raw.cornerRadius != null) node.cornerRadius = mapCornerRadius(ctx, raw.cornerRadius, theme);
      const { effects, layerBlur, backgroundBlur } = effectsOf(ctx, raw, theme);
      if (effects) node.effects = effects;
      if (layerBlur > 0) node.layerBlur = layerBlur;
      if (backgroundBlur > 0) node.backgroundBlur = backgroundBlur;
      return node;
    }
  }
  if (image) note(ctx, "image-fill-on-vector-ignored");

  if (raw.type === "ellipse") {
    node = createEllipseNode({ ...common, fill: "transparent", stroke: "transparent", strokeWidth: 0 });
    const innerRadius = numberValue(ctx, raw.innerRadius, theme, 0);
    const startAngle = numberValue(ctx, raw.startAngle, theme, 0);
    const sweepAngle = numberValue(ctx, raw.sweepAngle, theme, 360);
    if (innerRadius > 0 || startAngle !== 0 || sweepAngle !== 360) {
      note(ctx, "ellipse-arc-approximated");
    }
    applyPaint(node, ctx, raw, theme);
  } else if (raw.type === "icon" || raw.type === "icon_font") {
    node = createRectNode({ ...common, fill: "#000000", stroke: "transparent", strokeWidth: 0 });
    applyPaint(node, ctx, raw, theme);
    if (!node.fill || node.fill === "transparent") node.fill = "#000000";
    note(ctx, "approximated:icon");
  } else if (raw.type === "line") {
    node = createRectNode({ ...common, fill: "transparent", stroke: "transparent", strokeWidth: 0 });
    node.height = Math.max(1, size.height);
    const stroke = strokeOf(ctx, raw, theme);
    const fill = fillsOf(ctx, raw, theme, { warn: false })[0];
    node.fill = stroke?.color ?? (fill && fill.kind !== "image" ? fill.value : "#000000");
  } else if (raw.type === "polygon") {
    const count = Math.max(3, Math.round(numberValue(ctx, raw.polygonCount, theme, 3)));
    const anchors = regularPolygonAnchors(count, boxX, boxY, size);
    node = createPenNode(anchors, "transparent", 0);
    node.fill = "transparent";
    applyPaint(node, ctx, raw, theme);
  } else if (raw.type === "path") {
    node = penNodeOf(ctx, raw, theme, boxX, boxY, size) ?? createRectNode({
      ...common,
      fill: "transparent",
      stroke: "transparent",
      strokeWidth: 0,
    });
    if (!node.pen) applyPaint(node, ctx, raw, theme);
  } else {
    node = createRectNode({ ...common, fill: "#999999", stroke: "transparent", strokeWidth: 0 });
    applyPaint(node, ctx, raw, theme);
  }

  if (raw.cornerRadius != null && raw.type !== "path" && raw.type !== "polygon" && raw.type !== "ellipse") {
    node.cornerRadius = mapCornerRadius(ctx, raw.cornerRadius, theme);
  }
  return node;
}

function mapCornerRadius(ctx, raw, theme) {
  const resolved = resolveRaw(ctx, raw, theme);
  if (Array.isArray(resolved)) {
    const [tl, tr, br, bl] = resolved.map((value) => Math.max(0, numberValue(ctx, value, theme, 0)));
    return normalizeCornerRadius({ tl, tr, br, bl });
  }
  return normalizeCornerRadius(numberValue(ctx, resolved, theme, 0));
}

function regularPolygonAnchors(count, boxX, boxY, size) {
  const cx = boxX + size.width / 2;
  const cy = boxY + size.height / 2;
  const rx = size.width / 2;
  const ry = size.height / 2;
  const anchors = [];
  for (let index = 0; index < count; index += 1) {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
    anchors.push({ x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry });
  }
  anchors[anchors.length - 1].close = true;
  return anchors;
}

/** Maps a Pen path's `geometry` + `viewBox` into the node's box. */
function penNodeOf(ctx, raw, theme, boxX, boxY, size) {
  const geometry = typeof raw.geometry === "string" ? raw.geometry : "";
  if (!geometry) {
    note(ctx, "path-geometry-missing");
    return null;
  }
  let anchors;
  try {
    anchors = parseSvgPath(geometry);
  } catch {
    note(ctx, "path-geometry-unreadable");
    return null;
  }
  if (!Array.isArray(anchors) || anchors.length === 0) {
    note(ctx, "path-geometry-unreadable");
    return null;
  }

  const viewBox = Array.isArray(raw.viewBox) && raw.viewBox.length === 4
    ? raw.viewBox.map(Number)
    : null;
  let source = null;
  let sx = 1;
  let sy = 1;
  if (viewBox && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
    source = { x: boxX + -viewBox[0] * (size.width / viewBox[2]), y: boxY + -viewBox[1] * (size.height / viewBox[3]) };
    sx = size.width / viewBox[2];
    sy = size.height / viewBox[3];
  } else {
    const bounds = penAnchorsBounds(anchors, 0);
    const width = bounds.width > 0 ? bounds.width : 1;
    const height = bounds.height > 0 ? bounds.height : 1;
    sx = size.width / width;
    sy = size.height / height;
    source = { x: boxX - bounds.x * sx, y: boxY - bounds.y * sy };
  }

  const mapped = anchors.map((anchor) => ({
    x: source.x + anchor.x * sx,
    y: source.y + anchor.y * sy,
    in: Array.isArray(anchor.in) ? [anchor.in[0] * sx, anchor.in[1] * sy] : null,
    out: Array.isArray(anchor.out) ? [anchor.out[0] * sx, anchor.out[1] * sy] : null,
    close: Boolean(anchor.close),
  }));
  const stroke = strokeOf(ctx, raw, theme);
  const node = createPenNode(mapped, stroke?.color ?? "transparent", stroke?.width ?? 0);
  node.fill = "transparent";
  node.fillRule = raw.fillRule === "evenodd" ? "evenodd" : "nonzero";
  const paint = applyPaint(node, ctx, raw, theme);
  if (paint.imageId) node.fill = "transparent";
  if (stroke) {
    node.strokeAlign = stroke.align;
    node.strokeCap = stroke.cap;
    node.strokeJoin = stroke.join;
  }
  return node;
}

/* ------------------------------------------------------------------ *
 * Emission
 * ------------------------------------------------------------------ */

function multiplyMatrix(left, right) {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

function translationMatrix(x, y) {
  return [1, 0, 0, 1, x, y];
}

function rotationMatrix(degrees) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [cos, sin, -sin, cos, 0, 0];
}

function applyMatrix(matrix, x, y) {
  return {
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  };
}

function matrixAngle(matrix) {
  return (Math.atan2(matrix[1], matrix[0]) * 180) / Math.PI;
}

/** VOO rotates a box around its centre; Pen rotates around its top-left. */
function placeRotatedBox(boxX, boxY, width, height, totalRotationDegrees) {
  if (Math.abs(totalRotationDegrees) < 1e-6) return { x: boxX, y: boxY, rotation: 0 };
  const radians = (totalRotationDegrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const cx = width / 2;
  const cy = height / 2;
  return {
    x: boxX + cos * cx - sin * cy - cx,
    y: boxY + sin * cx + cos * cy - cy,
    rotation: normalizeRotationDeg(totalRotationDegrees),
  };
}

/**
 * Applies the common Pen entity fields (name, opacity, visibility, blend,
 * flip, rotation) to a built node. `opacity` is the accumulated container
 * opacity, because the editor does not composite group opacity.
 */
function applyEntity(node, ctx, raw, theme, opacity) {
  if (typeof raw.name === "string" && raw.name) node.name = raw.name;
  const ownOpacity = Math.min(1, Math.max(0, numberValue(ctx, raw.opacity, theme, 1)));
  const effectiveOpacity = opacity * ownOpacity;
  if (effectiveOpacity < 1) node.opacity = effectiveOpacity;
  if (!boolValue(ctx, raw.enabled, theme, true)) node.visible = false;
  const blend = blendModeOf(ctx, raw, theme);
  if (blend !== "source-over") node.blendMode = blend;
  if (boolValue(ctx, raw.flipX, theme, false) || boolValue(ctx, raw.flipY, theme, false)) {
    note(ctx, "flip-ignored");
  }
  return { opacity: effectiveOpacity, ownOpacity, blend };
}

function emitNode(ctx, raw, state) {
  const theme = mergeTheme(state.parentTheme, raw.theme);
  const size = ctx.sizes.get(raw) ?? { width: 0, height: 0 };
  const rotation = numberValue(ctx, raw.rotation, theme, 0);
  const matrix = multiplyMatrix(
    multiplyMatrix(state.parentMatrix, translationMatrix(state.localX, state.localY)),
    rotationMatrix(-rotation),
  );

  if (PEN_UNSUPPORTED_TYPES.has(raw.type)) {
    note(ctx, `unsupported:${raw.type}`);
    return;
  }
  if (CONTAINER_TYPES.has(raw.type)) {
    emitContainer(ctx, raw, theme, size, matrix, state);
    return;
  }
  if (!SHAPE_TYPES.has(raw.type)) {
    note(ctx, `unsupported:${raw.type}`);
    return;
  }
  emitLeaf(ctx, raw, theme, size, matrix, state);
}

function emitLeaf(ctx, raw, theme, size, matrix, state) {
  const angle = matrixAngle(matrix);
  let node;
  if (raw.type === "text" || raw.type === "note") {
    node = textNodeOf(ctx, raw, theme, state.localX, state.localY, size);
  } else {
    node = shapeNodeOf(ctx, raw, theme, state.localX, state.localY, size);
  }
  // The Pen rotation pivots on the node's top-left; the editor's pivots on the
  // box centre. `matrix` carries the rotation; the box origin is the node's
  // parent-local position.
  const base = applyMatrix(state.parentMatrix, node.x, node.y);
  const placed = placeRotatedBox(base.x, base.y, node.width, node.height, angle);
  node.x = placed.x;
  node.y = placed.y;
  if (placed.rotation) node.rotation = placed.rotation;
  applyEntity(node, ctx, raw, theme, state.parentOpacity);
  if (state.parentId) node.parentId = state.parentId;
  if (raw.layoutPosition === "absolute") node.layoutPosition = "absolute";
  const layoutWidth = sizeSpecOf(ctx, raw.width ?? "fit_content", theme, "width");
  const layoutHeight = sizeSpecOf(ctx, raw.height ?? "fit_content", theme, "height");
  if (layoutWidth.mode === "fill") node.layoutWidth = "fill";
  if (layoutHeight.mode === "fill") node.layoutHeight = "fill";
  ctx.nodes.push(node);
}

function emitContainer(ctx, raw, theme, size, matrix, state) {
  const parentId = state.parentId;
  const children = Array.isArray(raw.children) ? raw.children : [];
  const angle = matrixAngle(matrix);
  // The folder's box is the unrotated box of the frame; its painted children
  // carry the rotation, so the folder is positioned at the local origin.
  const origin = applyMatrix(matrix, 0, 0);
  const opacity = Math.min(1, Math.max(0, state.parentOpacity * numberValue(ctx, raw.opacity, theme, 1)));
  const visible = boolValue(ctx, raw.enabled, theme, true) !== false;
  const blend = blendModeOf(ctx, raw, theme);
  if (blend !== "source-over") note(ctx, "container-blend-kept-on-fill");

  // The frame's own paint becomes a flat paint node in front of the folder:
  // the editor's groups are folders, not painted boxes, so a frame's fill has
  // to be its own layer. It is a sibling (not a child) and marked absolute so a
  // parent's auto layout does not flow it.
  const paint = containerPaintOf(ctx, raw, theme);
  if (paint) {
    const paintNode = buildContainerPaintNode(ctx, raw, theme, size, paint);
    if (paintNode) {
      applyEntity(paintNode, ctx, raw, theme, state.parentOpacity);
      const placedPaint = placeRotatedBox(origin.x, origin.y, paintNode.width, paintNode.height, angle);
      paintNode.x = placedPaint.x;
      paintNode.y = placedPaint.y;
      if (placedPaint.rotation) paintNode.rotation = placedPaint.rotation;
      if (parentId) paintNode.parentId = parentId;
      paintNode.layoutPosition = "absolute";
      paintNode.name = raw.name ? `${raw.name} fill` : "Frame fill";
      if (opacity < 1) paintNode.opacity = opacity;
      if (blend !== "source-over") paintNode.blendMode = blend;
      ctx.nodes.push(paintNode);
    }
  }

  const group = createGroupNode({
    x: origin.x,
    y: origin.y,
    width: Math.max(1, size.width),
    height: Math.max(1, size.height),
    parentId: parentId ?? null,
  });
  if (typeof raw.name === "string" && raw.name) group.name = raw.name;
  group.visible = visible;
  if (opacity < 1) group.opacity = opacity;
  if (boolValue(ctx, raw.flipX, theme, false) || boolValue(ctx, raw.flipY, theme, false)) {
    note(ctx, "flip-ignored");
  }
  if (raw.type === "frame") {
    const layout = autoLayoutOf(ctx, raw, theme);
    if (layout && Math.abs(angle) < 1e-6) group.autoLayout = layout;
    if (raw.clip === true && hasOverflowingChildren(ctx, raw, theme)) {
      note(ctx, "frame-clip-ignored");
    }
  }
  const layoutWidth = sizeSpecOf(ctx, raw.width ?? "fit_content", theme, "width");
  const layoutHeight = sizeSpecOf(ctx, raw.height ?? "fit_content", theme, "height");
  if (layoutWidth.mode === "fill") group.layoutWidth = "fill";
  if (layoutHeight.mode === "fill") group.layoutHeight = "fill";
  if (raw.layoutPosition === "absolute") group.layoutPosition = "absolute";
  ctx.nodes.push(group);

  const positions = layoutChildren(ctx, raw, theme);
  for (const child of children) {
    if (!isObject(child) || typeof child.type !== "string") continue;
    const position = positions.get(child) ?? {
      x: numberValue(ctx, child.x, theme, 0),
      y: numberValue(ctx, child.y, theme, 0),
    };
    emitNode(ctx, child, {
      parentId: group.id,
      parentMatrix: matrix,
      parentTheme: theme,
      parentOpacity: opacity,
      localX: position.x,
      localY: position.y,
      depth: state.depth + 1,
    });
  }
}

function containerPaintOf(ctx, raw, theme) {
  const fills = fillsOf(ctx, raw, theme);
  const stroke = strokeOf(ctx, raw, theme);
  const { effects, layerBlur, backgroundBlur } = effectsOf(ctx, raw, theme);
  const hasPaint = fills.length > 0 || Boolean(stroke) || Boolean(effects) || layerBlur > 0 || backgroundBlur > 0;
  if (!hasPaint) return null;
  return { fills, stroke, effects, layerBlur, backgroundBlur };
}

function buildContainerPaintNode(ctx, raw, theme, size, paint) {
  const image = paint.fills.find((fill) => fill.kind === "image");
  const solid = paint.fills.find((fill) => fill.kind === "color");
  const gradient = paint.fills.find((fill) => fill.kind === "gradient");
  if (image) {
    const imageId = imageIdFor(ctx, image.value);
    if (imageId) {
      const node = createImageNode({
        x: 0,
        y: 0,
        width: size.width,
        height: size.height,
        imageId,
      });
      node.fill = "transparent";
      if (paint.stroke) {
        node.stroke = paint.stroke.color;
        node.strokeWidth = paint.stroke.width;
        node.strokeAlign = paint.stroke.align;
        node.strokeCap = paint.stroke.cap;
        node.strokeJoin = paint.stroke.join;
      }
      if (raw.cornerRadius != null) node.cornerRadius = mapCornerRadius(ctx, raw.cornerRadius, theme);
      if (paint.effects) node.effects = paint.effects;
      if (paint.layerBlur > 0) node.layerBlur = paint.layerBlur;
      if (paint.backgroundBlur > 0) node.backgroundBlur = paint.backgroundBlur;
      return node;
    }
  }
  if (!solid && !gradient && !paint.stroke && !paint.effects && !(paint.layerBlur > 0)) return null;
  const node = createRectNode({
    x: 0,
    y: 0,
    width: size.width,
    height: size.height,
    fill: image ? "transparent" : solid?.value ?? gradient?.value ?? "transparent",
    stroke: paint.stroke?.color ?? "transparent",
    strokeWidth: paint.stroke?.width ?? 0,
  });
  if (paint.stroke) {
    node.strokeAlign = paint.stroke.align;
    node.strokeCap = paint.stroke.cap;
    node.strokeJoin = paint.stroke.join;
  }
  if (raw.cornerRadius != null) node.cornerRadius = mapCornerRadius(ctx, raw.cornerRadius, theme);
  if (paint.effects) node.effects = paint.effects;
  if (paint.layerBlur > 0) node.layerBlur = paint.layerBlur;
  if (paint.backgroundBlur > 0) node.backgroundBlur = paint.backgroundBlur;
  if (image) {
    // The image was requested but its bytes are missing: keep the frame's box
    // visible with the next best paint instead of dropping the layer.
    node.fill = solid?.value ?? gradient?.value ?? "transparent";
  }
  return node;
}

/* ------------------------------------------------------------------ *
 * Text estimation (used when no DOM measurement is supplied)
 * ------------------------------------------------------------------ */

function characterWidth(character, fontSize) {
  if (/[\u2E80-\u9FFF\uAC00-\uD7AF\uFF00-\uFFEF]/u.test(character)) return fontSize;
  if (character === " ") return fontSize * 0.28;
  if (/[iIl|.,:;'!]/.test(character)) return fontSize * 0.3;
  if (/[A-Z0-9]/.test(character)) return fontSize * 0.62;
  return fontSize * 0.54;
}

/** A deterministic text box estimate for hosts without a canvas. */
export function estimateTextSize({ text, fontSize, lineHeight, letterSpacing, boxWidth }) {
  const size = fontSize > 0 ? fontSize : DEFAULT_FONT_SIZE;
  const heightPerLine = (lineHeight ?? LINE_HEIGHT_RATIO) * size;
  const paragraphs = String(text ?? "").split("\n");
  const widths = [];
  for (const paragraph of paragraphs) {
    if (!(boxWidth > 0)) {
      const width = [...paragraph].reduce(
        (total, character) => total + characterWidth(character, size) + letterSpacing,
        0,
      );
      widths.push(Math.max(size * 0.5, width));
      continue;
    }
    let line = "";
    let width = 0;
    for (const character of paragraph) {
      const advance = characterWidth(character, size) + letterSpacing;
      if (width + advance > boxWidth && line) {
        widths.push(width);
        line = character;
        width = advance;
      } else {
        line += character;
        width += advance;
      }
    }
    widths.push(width);
  }
  const width = Math.max(...(widths.length ? widths : [0]));
  const lines = widths.length || 1;
  return {
    width: Math.ceil(boxWidth > 0 ? Math.max(boxWidth, width) : width),
    height: Math.ceil(lines * heightPerLine),
  };
}

/* ------------------------------------------------------------------ *
 * Public entry
 * ------------------------------------------------------------------ */

/**
 * Converts a parsed Pen document into a v1 `.voo` envelope (one design page,
 * `images` map of data URLs) plus the warnings and font summary the caller
 * reports back to the user.
 *
 * @param {object} document parsed `.pen` document
 * @param {object} [options]
 * @param {Map<string,string>} [options.assets] resolved image URL -> data URL
 * @param {Function} [options.measureText] `{text, fontSize, …} -> {width,height}`
 * @param {string} [options.pageLabel] label for the imported page
 */
export function penDocumentToVooFile(document, options = {}) {
  const ctx = createContext(document, options);

  const tree = (document.children ?? [])
    .map((child) => resolvePenNode(child, ctx, []))
    .filter(Boolean);
  if (!Array.isArray(tree) || tree.length === 0) {
    throw new PenImportError(
      "pen-empty-document",
      "This Pen document has no layers to import.",
    );
  }

  // 1. Resolve every node's size, top-down (flex fill shares, hug frames,
  //    text boxes, path geometry).
  measureChildren(tree, null, ctx.themeDefaults, ctx, 0);

  // 2. Measure the page from the resolved top-level boxes.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of tree) {
    if (!isObject(node)) continue;
    const size = ctx.sizes.get(node) ?? { width: 0, height: 0 };
    const x = numberValue(ctx, node.x, ctx.themeDefaults, 0);
    const y = numberValue(ctx, node.y, ctx.themeDefaults, 0);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + size.width);
    maxY = Math.max(maxY, y + size.height);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    minX = 0;
    minY = 0;
    maxX = 1;
    maxY = 1;
  }
  const pageWidth = Math.max(1, Math.ceil(maxX - minX));
  const pageHeight = Math.max(1, Math.ceil(maxY - minY));

  // 3. Flatten, bottom-first pre-order.
  ctx.nodes = [];
  const rootMatrix = translationMatrix(-minX, -minY);
  for (const node of tree) {
    if (!isObject(node) || typeof node.type !== "string") continue;
    emitNode(ctx, node, {
      parentId: null,
      parentMatrix: rootMatrix,
      parentTheme: ctx.themeDefaults,
      parentOpacity: 1,
      localX: numberValue(ctx, node.x, ctx.themeDefaults, 0),
      localY: numberValue(ctx, node.y, ctx.themeDefaults, 0),
      depth: 0,
    });
  }

  if (ctx.nodes.length === 0) {
    throw new PenImportError(
      "pen-empty-document",
      "This Pen document has no layers this editor can import.",
    );
  }

  const sceneDoc = createDocument(pageWidth, pageHeight, "transparent");
  sceneDoc.label = typeof options.pageLabel === "string" && options.pageLabel
    ? options.pageLabel
    : "Pen Import";
  sceneDoc.nodes = ctx.nodes;

  const fonts = [...ctx.fonts.values()]
    .map((entry) => ({
      family: entry.family,
      styles: [...entry.styles],
      count: entry.count,
    }))
    .sort((left, right) => right.count - left.count);

  return {
    vooFile: {
      format: VOO_FILE_FORMAT,
      version: 1,
      document: sceneDoc,
      images: ctx.images,
    },
    warnings: warningList(ctx.warnings),
    fonts,
    layerCount: ctx.nodes.length,
    refExpansions: ctx.refExpansions,
  };
}
