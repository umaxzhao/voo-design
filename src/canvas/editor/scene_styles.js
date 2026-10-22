/**
 * Document-scoped named styles library — paint, text and effect styles.
 *
 * Model (stored on the document as `doc.styles`):
 *
 *   doc.styles = {
 *     paint: [{ id, name, value: { fill?, fillOpacity?, stroke?, strokeWidth?, strokeOpacity? } }],
 *     text:  [{ id, name, value: {
 *                fontFamily?, fontSize?, fontWeight?, italic?, underline?,
 *                align?, letterSpacing?, lineHeight?, baselineShift?, direction? } }],
 *     effect: [{ id, name, value: { effects } }],   // `effects` is node.effects
 *   }
 *
 * Node binding (kept on the node so the applied values and the style identity
 * travel together):
 *
 *   node.styleIds = { paintId?, textId?, effectId? }
 *
 * Exactly three style types exist; the type ↔ node key mapping is fixed:
 *   paint  -> node.styleIds.paintId   -> node.fill / fillOpacity / stroke / strokeWidth / strokeOpacity
 *   text   -> node.styleIds.textId    -> node.fontFamily / fontSize / fontWeight / italic / underline /
 *                                        align / letterSpacing / lineHeight / baselineShift / direction
 *   effect -> node.styleIds.effectId  -> node.effects
 *
 * Semantics:
 * - `applyStyle` writes the style's values onto the node and records the id;
 *   `applyStyle(..., null)` / `detachStyle` clears the id but *keeps* the values.
 *   Styles are patches: applying merges the style's keys onto the node and
 *   leaves unrelated node properties untouched.
 * - `updateStyle` re-materialises the new value onto every node bound to it via
 *   `resolveStyleBindings`, so one document replacement (one undo entry when
 *   committed through the host factory) updates all users.
 * - `deleteStyle` clears the reference on nodes and keeps their applied values
 *   (the same rule as detaching).
 * - Applying a paint style clears the node's fill/stroke variable bindings for
 *   the keys the style writes, so the explicit style value wins over a mode.
 *
 * Read tolerance: `normalizeStyles` / `deserializeStyles` / query helpers never
 * throw — malformed input is dropped or repaired. Mutating ops throw on
 * programmer error (missing ids, wrong types) like the other scene_* modules.
 *
 * Serialisation helpers for the Lead (`scene_model_serialization.js`):
 * `serializeStyles(doc)` -> `{ styles }` or `{}`
 * `deserializeStyles(rawDoc)` -> `{ styles }` or `{}` (normalised)
 * Call `resolveStyleBindings(doc)` once after loading a document so bound nodes
 * pick up the persisted style values.
 */

const STYLE_TYPES = Object.freeze(["paint", "text", "effect"]);

/** Style type -> `node.styleIds` key. */
export const STYLE_TYPE_KEYS = Object.freeze({
  paint: "paintId",
  text: "textId",
  effect: "effectId",
});

/** Paint fields a paint style may carry, and how they are normalised. */
export const PAINT_STYLE_KEYS = Object.freeze([
  "fill",
  "fillOpacity",
  "stroke",
  "strokeWidth",
  "strokeOpacity",
]);

/** Typography fields a text style may carry. */
export const TEXT_STYLE_KEYS = Object.freeze([
  "fontFamily",
  "fontSize",
  "fontWeight",
  "italic",
  "underline",
  "align",
  "letterSpacing",
  "lineHeight",
  "baselineShift",
  "direction",
]);

/** Effect kinds a `value.effects` object may carry. */
const EFFECT_KINDS = [
  "shadow",
  "glow",
  "innerShadow",
  "innerGlow",
  "satin",
  "bevel",
  "fill",
  "gradientOverlay",
  "stroke",
];

/** Text alignments accepted by the text model (`align`). */
const TEXT_ALIGNS = ["left", "center", "right"];
const TEXT_DIRECTIONS = ["horizontal", "vertical"];

let fallbackIdCounter = 0;

/** Stable-enough ids for documents authored without a native `crypto`. */
function makeId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}:${uuid}`;
  fallbackIdCounter += 1;
  return `${prefix}:${Date.now().toString(36)}:${fallbackIdCounter}`;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Structural equality for normalised style values (one nesting level). */
function equalStyleValues(a, b) {
  if (a === b) return true;
  if (!isObject(a) || !isObject(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!(key in b)) return false;
    const left = a[key];
    const right = b[key];
    if (isObject(left) && isObject(right)) {
      const nestedA = Object.keys(left);
      const nestedB = Object.keys(right);
      if (nestedA.length !== nestedB.length) return false;
      for (const nested of nestedA) {
        if (left[nested] !== right[nested]) return false;
      }
    } else if (left !== right) {
      return false;
    }
  }
  return true;
}

/** `{...node, styleIds}` with the key removed entirely when it becomes empty. */
function withoutStyleKey(node, key) {
  const styleIds = { ...node.styleIds };
  delete styleIds[key];
  if (Object.keys(styleIds).length === 0) {
    const copy = { ...node };
    delete copy.styleIds;
    return copy;
  }
  return { ...node, styleIds };
}

/** Paint colours are CSS colour/gradient strings (`#abc`, `transparent`, `*-gradient(...)`). */
function normalizePaintColour(value) {
  const colour = text(value);
  if (!colour || colour.length > 4096) return null;
  return colour;
}

/** Canonical normalised value for `type`, or `null` when nothing usable remains. */
function normalizeStyleValue(type, rawValue) {
  if (type === "paint") {
    if (!isObject(rawValue)) return null;
    const value = {};
    const fill = normalizePaintColour(rawValue.fill);
    if (fill) value.fill = fill;
    const fillOpacity = finiteNumber(rawValue.fillOpacity);
    if (fillOpacity !== null) value.fillOpacity = clamp(fillOpacity, 0, 1);
    const stroke = normalizePaintColour(rawValue.stroke);
    if (stroke) value.stroke = stroke;
    const strokeWidth = finiteNumber(rawValue.strokeWidth);
    if (strokeWidth !== null) value.strokeWidth = clamp(strokeWidth, 0, 100);
    const strokeOpacity = finiteNumber(rawValue.strokeOpacity);
    if (strokeOpacity !== null) value.strokeOpacity = clamp(strokeOpacity, 0, 1);
    return Object.keys(value).length > 0 ? value : null;
  }
  if (type === "text") {
    if (!isObject(rawValue)) return null;
    const value = {};
    const fontFamily = text(rawValue.fontFamily);
    if (fontFamily) value.fontFamily = fontFamily;
    const fontSize = finiteNumber(rawValue.fontSize);
    if (fontSize !== null && fontSize > 0) value.fontSize = clamp(fontSize, 1, 1000);
    const fontWeight = text(rawValue.fontWeight);
    if (/^(?:normal|bold|[1-9]00)$/.test(fontWeight)) value.fontWeight = fontWeight;
    if (typeof rawValue.italic === "boolean") value.italic = rawValue.italic;
    if (typeof rawValue.underline === "boolean") value.underline = rawValue.underline;
    const align = text(rawValue.align);
    if (TEXT_ALIGNS.includes(align)) value.align = align;
    const letterSpacing = finiteNumber(rawValue.letterSpacing);
    if (letterSpacing !== null) value.letterSpacing = clamp(letterSpacing, -10, 40);
    const lineHeight = finiteNumber(rawValue.lineHeight);
    if (lineHeight !== null && lineHeight > 0) {
      value.lineHeight = clamp(lineHeight, 0.8, 3);
    }
    const baselineShift = finiteNumber(rawValue.baselineShift);
    if (baselineShift !== null) {
      value.baselineShift = clamp(baselineShift, -100, 100);
    }
    const direction = text(rawValue.direction);
    if (TEXT_DIRECTIONS.includes(direction)) value.direction = direction;
    return Object.keys(value).length > 0 ? value : null;
  }
  if (type === "effect") {
    if (!isObject(rawValue) || !isObject(rawValue.effects)) return null;
    const effects = {};
    for (const kind of EFFECT_KINDS) {
      const candidate = rawValue.effects[kind];
      if (!isObject(candidate)) continue;
      const entry = {};
      for (const [key, field] of Object.entries(candidate)) {
        if (
          typeof field === "string" ||
          typeof field === "number" ||
          typeof field === "boolean" ||
          field === null
        ) {
          if (typeof field === "number" && !Number.isFinite(field)) continue;
          entry[key] = field;
        }
      }
      effects[kind] = entry;
    }
    return Object.keys(effects).length > 0 ? { effects } : null;
  }
  return null;
}

/** Tolerant normaliser for `doc.styles`. Never throws. */
export function normalizeStyles(value) {
  const raw = isObject(value) ? value : {};
  const result = { paint: [], text: [], effect: [] };
  for (const type of STYLE_TYPES) {
    const entries = Array.isArray(raw[type]) ? raw[type] : [];
    const seen = new Set();
    for (const entry of entries) {
      if (!isObject(entry)) continue;
      const id = text(entry.id);
      if (!id || seen.has(id)) continue;
      const styleValue = normalizeStyleValue(type, entry.value);
      if (!styleValue) continue;
      seen.add(id);
      result[type].push({ id, name: text(entry.name) || id, value: styleValue });
    }
  }
  return result;
}

/** Normalised style library of a document (empty library when absent). */
export function getStyles(doc) {
  return normalizeStyles(doc?.styles);
}

function hasStyles(styles) {
  return STYLE_TYPES.some((type) => styles[type].length > 0);
}

/** All styles of one type, in document order. */
export function listStyles(doc, type) {
  if (!STYLE_TYPES.includes(type)) return [];
  return getStyles(doc)[type];
}

/** Finds a style by type + id (normalised copy) or `null`. */
export function findStyle(doc, type, styleId) {
  if (!STYLE_TYPES.includes(type)) return null;
  const needle = text(styleId);
  if (!needle) return null;
  return getStyles(doc)[type].find((style) => style.id === needle) ?? null;
}

/** The styles a node currently uses, keyed by type (`null` when detached). */
export function stylesForNode(doc, node) {
  const styles = getStyles(doc);
  const ids = isObject(node?.styleIds) ? node.styleIds : {};
  return {
    paint: styles.paint.find((style) => style.id === ids.paintId) ?? null,
    text: styles.text.find((style) => style.id === ids.textId) ?? null,
    effect: styles.effect.find((style) => style.id === ids.effectId) ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Node value extraction / materialisation                            */
/* ------------------------------------------------------------------ */

/** Picks the style-relevant fields off a node (undefined fields omitted). */
export function styleValueFromNode(node, type) {
  if (!isObject(node)) throw new Error("style-node-missing");
  if (type === "paint") return normalizeStyleValue("paint", node);
  if (type === "text") return normalizeStyleValue("text", node);
  if (type === "effect") return normalizeStyleValue("effect", node);
  throw new Error("style-type-invalid");
}

function isPaintCapable(node) {
  return (
    node.kind !== "region" && node.kind !== "group" && node.kind !== "adjustment"
  );
}

function assertCompatible(node, type) {
  if (type === "text" && node.kind !== "text") {
    throw new Error("style-node-incompatible");
  }
  if (type === "paint" && !isPaintCapable(node)) {
    throw new Error("style-node-incompatible");
  }
  if (type === "effect" && (node.kind === "region" || node.kind === "adjustment")) {
    throw new Error("style-node-incompatible");
  }
}

/** Writes `styleValue` onto the node properties (merge semantics). */
function materialize(node, type, styleValue) {
  if (type === "paint") {
    let updated = node;
    if ("fill" in styleValue) updated = { ...updated, fillVariableId: null };
    if ("stroke" in styleValue) updated = { ...updated, strokeVariableId: null };
    return { ...updated, ...styleValue };
  }
  if (type === "text") {
    return { ...node, ...styleValue };
  }
  return { ...node, effects: styleValue.effects ?? null };
}

/** True when the style's keys already match the node's current values. */
function styleAppliedToNode(node, type, styleValue) {
  const current = styleValueFromNode(node, type);
  if (!current) return false;
  if (type === "effect") {
    return equalStyleValues(current.effects ?? {}, styleValue.effects ?? {});
  }
  for (const [key, value] of Object.entries(styleValue)) {
    if (current[key] !== value) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* CRUD                                                                */
/* ------------------------------------------------------------------ */

function requireNode(doc, nodeId) {
  const nodes = Array.isArray(doc?.nodes) ? doc.nodes : [];
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error("style-node-missing");
  return node;
}

function requireStyle(styles, type, styleId) {
  if (!STYLE_TYPES.includes(type)) throw new Error("style-type-invalid");
  const style = styles[type].find((candidate) => candidate.id === styleId);
  if (!style) throw new Error("style-missing");
  return style;
}

function withStyles(doc, styles) {
  return { ...doc, styles };
}

/**
 * Creates a style of `type`.
 * `value` wins when provided; otherwise the current node (`fromNodeId`) is
 * captured. The style is not applied to the node — call `applyStyle` for that.
 */
export function createStyle(doc, { type, name, fromNodeId = null, value } = {}) {
  if (!STYLE_TYPES.includes(type)) throw new Error("style-type-invalid");
  const styles = getStyles(doc);
  const styleId = makeId(type);
  const styleName = text(name) || `${type[0].toUpperCase()}${type.slice(1)} ${styles[type].length + 1}`;
  let styleValue;
  if (value !== undefined) {
    styleValue = normalizeStyleValue(type, value);
  } else if (fromNodeId) {
    const node = requireNode(doc, fromNodeId);
    assertCompatible(node, type);
    styleValue = styleValueFromNode(node, type);
  }
  if (!styleValue) throw new Error("style-value-invalid");
  styles[type].push({ id: styleId, name: styleName, value: styleValue });
  return withStyles(doc, styles);
}

/** Renames a style. */
export function renameStyle(doc, type, styleId, name) {
  const styles = getStyles(doc);
  const style = requireStyle(styles, type, styleId);
  const nextName = text(name);
  if (!nextName) throw new Error("style-name-invalid");
  style.name = nextName;
  return withStyles(doc, styles);
}

/**
 * Updates a style's value from `{ value }` or from a node (`{ fromNodeId }`),
 * then re-materialises the style onto every node bound to it.
 */
export function updateStyle(doc, type, styleId, { value, fromNodeId = null } = {}) {
  const styles = getStyles(doc);
  const style = requireStyle(styles, type, styleId);
  let styleValue;
  if (value !== undefined) {
    styleValue = normalizeStyleValue(type, value);
  } else if (fromNodeId) {
    const node = requireNode(doc, fromNodeId);
    assertCompatible(node, type);
    styleValue = styleValueFromNode(node, type);
  }
  if (!styleValue) throw new Error("style-value-invalid");
  style.value = styleValue;
  return resolveStyleBindings(withStyles(doc, styles));
}

/**
 * Deletes a style. Nodes that used it keep their applied values; only the
 * `styleIds` reference is cleared.
 */
export function deleteStyle(doc, type, styleId) {
  const styles = getStyles(doc);
  const style = requireStyle(styles, type, styleId);
  styles[type] = styles[type].filter((candidate) => candidate.id !== style.id);
  const key = STYLE_TYPE_KEYS[type];
  const nodes = (Array.isArray(doc.nodes) ? doc.nodes : []).map((node) =>
    node?.styleIds?.[key] === style.id ? withoutStyleKey(node, key) : node,
  );
  return withStyles({ ...doc, nodes }, styles);
}

/**
 * Applies `styleId` (or detaches with `null`) to a node. Applying writes the
 * style value onto the node; detaching keeps the values and clears the id.
 */
export function applyStyle(doc, nodeId, type, styleId) {
  if (!STYLE_TYPES.includes(type)) throw new Error("style-type-invalid");
  const node = requireNode(doc, nodeId);
  const key = STYLE_TYPE_KEYS[type];
  if (!styleId) return detachStyle(doc, nodeId, type);
  const styles = getStyles(doc);
  const style = requireStyle(styles, type, styleId);
  assertCompatible(node, type);
  const styleIds = { ...(isObject(node.styleIds) ? node.styleIds : {}), [key]: style.id };
  const updated = materialize(node, type, style.value);
  return {
    ...doc,
    nodes: doc.nodes.map((candidate) =>
      candidate.id === nodeId ? { ...updated, styleIds } : candidate,
    ),
  };
}

/** Clears a node's style reference for `type`; the applied values stay. */
export function detachStyle(doc, nodeId, type) {
  if (!STYLE_TYPES.includes(type)) throw new Error("style-type-invalid");
  const node = requireNode(doc, nodeId);
  const key = STYLE_TYPE_KEYS[type];
  if (!isObject(node.styleIds) || !(key in node.styleIds)) return doc;
  return {
    ...doc,
    nodes: doc.nodes.map((candidate) =>
      candidate.id === nodeId ? withoutStyleKey(candidate, key) : candidate,
    ),
  };
}

/**
 * Re-materialises every style reference onto its node. A reference to a deleted
 * style is cleared (values stay). Idempotent; returns the same document when
 * nothing changes so callers can use identity as a no-op check.
 */
export function resolveStyleBindings(doc) {
  if (!isObject(doc) || !Array.isArray(doc.nodes)) return doc;
  const styles = getStyles(doc);
  let changed = false;
  const nodes = doc.nodes.map((node) => {
    const ids = node?.styleIds;
    if (!isObject(ids)) return node;
    let updated = node;
    let styleIds = null;
    for (const type of STYLE_TYPES) {
      const key = STYLE_TYPE_KEYS[type];
      const styleId = ids[key];
      if (!styleId) continue;
      const style = styles[type].find((candidate) => candidate.id === styleId);
      if (!style) {
        styleIds = styleIds ?? { ...ids };
        delete styleIds[key];
        changed = true;
        continue;
      }
      if (!styleAppliedToNode(updated, type, style.value)) {
        changed = true;
        updated = materialize(updated, type, style.value);
      }
    }
    if (styleIds !== null) {
      if (Object.keys(styleIds).length > 0) {
        updated = { ...updated, styleIds };
      } else {
        updated = { ...updated };
        delete updated.styleIds;
      }
    }
    return changed ? updated : node;
  });
  return changed ? { ...doc, nodes } : doc;
}

/* ------------------------------------------------------------------ */
/* Serialisation helpers (Lead wires these)                            */
/* ------------------------------------------------------------------ */

/** `{ styles }` when the document has any styles, `{}` otherwise. */
export function serializeStyles(doc) {
  const styles = getStyles(doc);
  return hasStyles(styles) ? { styles } : {};
}

/**
 * Reads `doc.styles` from a raw record. Returns `{ styles }` normalised, or
 * `{}` when there are none. Never throws. Call `resolveStyleBindings(doc)`
 * after merging the patch to apply persisted style values to bound nodes.
 */
export function deserializeStyles(rawDoc) {
  if (!isObject(rawDoc)) return {};
  const styles = normalizeStyles(rawDoc.styles);
  return hasStyles(styles) ? { styles } : {};
}

/* ------------------------------------------------------------------ */
/* Panel action factory (engine commit glue)                           */
/* ------------------------------------------------------------------ */

/**
 * Builds the `actions` object `StyleSection` expects on top of an engine-like
 * commit path, so each action is exactly one undo entry:
 *
 *   const actions = createStylePanelActions({
 *     getDocument: () => engine.getDocument(),
 *     commit: (nextDoc, options) => engine.setDoc(nextDoc, options),
 *     getNodeId: () => selectedNodeId,
 *     historyName: "editor.history.entry.styles",
 *   });
 */
export function createStylePanelActions({
  getDocument,
  commit,
  getNodeId = null,
  historyName = null,
} = {}) {
  const run = (reduce) => {
    const current = getDocument?.();
    if (!isObject(current)) return undefined;
    const next = reduce(current);
    if (next && next !== current) {
      commit?.(next, historyName ? { name: historyName } : undefined);
      return next;
    }
    return undefined;
  };
  const currentNodeId = () =>
    typeof getNodeId === "function" ? getNodeId() : null;
  return {
    create: (type, name) =>
      run((doc) => {
        const nodeId = currentNodeId();
        if (!nodeId) return null;
        return createStyle(doc, { type, name, fromNodeId: nodeId });
      }),
    apply: (type, styleId) =>
      run((doc) => {
        const nodeId = currentNodeId();
        if (!nodeId) return null;
        return applyStyle(doc, nodeId, type, styleId);
      }),
    detach: (type) =>
      run((doc) => {
        const nodeId = currentNodeId();
        if (!nodeId) return null;
        return detachStyle(doc, nodeId, type);
      }),
    update: (type, styleId) =>
      run((doc) => {
        const nodeId = currentNodeId();
        if (!nodeId) return null;
        return updateStyle(doc, type, styleId, { fromNodeId: nodeId });
      }),
    rename: (type, styleId, name) =>
      run((doc) => renameStyle(doc, type, styleId, name)),
    delete: (type, styleId) => run((doc) => deleteStyle(doc, type, styleId)),
  };
}
