/** Bulk creation uses the same editor creation and measurement pipeline as the individual tools. */
import { acquireAuthoring, createAuthoringTimeline } from "./authoring-timeline.js";
import { createShape, TOOL_ERROR } from "./canvas_tools.js";
import { createFrame } from "./canvas_tools_layout.js";
import { createPath } from "./canvas_tools_geometry.js";
import { normalizeAutoLayout } from "../editor/scene_auto_layout.js";
import { parseSvgPath } from "../editor/editor_svg_parse.js";
import { commitEditorDocument } from "../undo-action-contracts.js";

const strings = ["name", "fill", "stroke", "text", "fontFamily", "color", "d"];
const numbers = ["x", "y", "width", "height", "strokeWidth", "cornerRadius", "opacity", "fontSize", "lineHeight", "letterSpacing"];
const DISTRIBUTIONS = ["start", "center", "end", "space-between", "space-around", "space-evenly"];
const nodeProperties = {
  type: { type: "string", enum: ["frame", "rect", "ellipse", "text", "line", "path"] },
  ...Object.fromEntries(strings.map(key => [key, { type: "string" }])),
  ...Object.fromEntries(numbers.map(key => [key, { type: "number" }])),
  textSizing: { type: "string", enum: ["auto", "fixed"] },
  fontWeight: { anyOf: [{ type: "string" }, { type: "number" }] },
  align: { type: "string", enum: ["left", "center", "right"] },
  layoutPosition: { type: "string", enum: ["flow", "absolute"] },
  layoutWidth: { type: "string", enum: ["fixed", "hug", "fill"] },
  layoutHeight: { type: "string", enum: ["fixed", "hug", "fill"] },
  shadow: { type: "object", properties: {
    enabled: { type: "boolean" }, color: { type: "string" },
    blur: { type: "number" }, offsetX: { type: "number" }, offsetY: { type: "number" }, opacity: { type: "number" },
  }, additionalProperties: false },
  autoLayout: { type: "object", properties: {
    layout: { type: "string", enum: ["none", "horizontal", "vertical"] },
    direction: { type: "string", enum: ["horizontal", "vertical"] },
    gap: { type: "number" }, crossGap: { type: "number" },
    padding: { anyOf: [
      { type: "number" },
      { type: "object", properties: { top: { type: "number" }, right: { type: "number" }, bottom: { type: "number" }, left: { type: "number" } }, additionalProperties: false },
    ] },
    wrap: { type: "boolean" },
    alignItems: { type: "string", enum: ["start", "center", "end", "stretch"] },
    justifyContent: { type: "string", enum: DISTRIBUTIONS },
    alignContent: { type: "string", enum: DISTRIBUTIONS },
    widthMode: { type: "string", enum: ["fixed", "hug"] },
    heightMode: { type: "string", enum: ["fixed", "hug"] },
    minWidth: { type: "number", minimum: 0 }, maxWidth: { type: "number", minimum: 0 },
    minHeight: { type: "number", minimum: 0 }, maxHeight: { type: "number", minimum: 0 },
  }, additionalProperties: false },
  children: { type: "array", items: { $ref: "#/$defs/node" } },
};
export const BUILD_LAYOUT_SCHEMA = {
  type: "function",
  function: {
    name: "build_layout",
    description: "Create a complete tree of up to 200 editable layers in one undoable batch. Supported types: frame, rect, ellipse, text, line and path (path requires SVG d data). For one poster, screen or composed page, make one top-level frame and put its artwork, vector paths and text in that frame's children so the result moves as one composition; use type=text for editable copy. Text defaults to auto sizing from its content; set textSizing:'fixed' only when a text layer should wrap to its width. Use separate top-level nodes only when they should be independent. All x/y coordinates are absolute canvas coordinates, including children (parentId establishes ownership, not a coordinate offset). Frame autoLayout supports direction, wrapping, item/cross gaps, per-side padding, alignment, distribution, fixed/hug sizing and min/max. Child layoutWidth/layoutHeight accept fixed, hug or fill; layoutPosition accepts flow or absolute. Text is measured after its typography is applied. Lines run from (x,y) to (x+width,y+height). After creating a composition, call capture_canvas and inspect_layout before finishing. Returns {created:[{id,name,type}],count}. You may batch multiple tool calls in one step.",
    parameters: {
      type: "object",
      properties: { parentId: { type: "string" }, nodes: { type: "array", minItems: 1, maxItems: 200, items: { $ref: "#/$defs/node" } } },
      required: ["nodes"], additionalProperties: false,
      $defs: { node: { type: "object", properties: nodeProperties, required: ["type", "name", "x", "y", "width", "height"], additionalProperties: false } },
    },
  },
};

function invalid(message) {
  throw Object.assign(new Error(`${TOOL_ERROR.INVALID_ARGS}: ${message}`), { code: TOOL_ERROR.INVALID_ARGS });
}

function validateAutoLayout(value, at) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${at} must be an object`);
  const allowed = new Set([
    "layout", "direction", "gap", "crossGap", "padding", "wrap", "alignItems",
    "justifyContent", "alignContent", "widthMode", "heightMode",
    "minWidth", "maxWidth", "minHeight", "maxHeight",
  ]);
  for (const [key, entry] of Object.entries(value)) {
    if (!allowed.has(key)) invalid(`${at}.${key} is unsupported`);
    if (["layout", "direction"].includes(key) && !["none", "horizontal", "vertical"].includes(entry)) invalid(`${at}.${key} is invalid`);
    if (["gap", "crossGap", "minWidth", "maxWidth", "minHeight", "maxHeight"].includes(key) && (!Number.isFinite(entry) || entry < 0)) invalid(`${at}.${key} must be a non-negative finite number`);
    if (key === "padding") {
      if (typeof entry === "number") {
        if (!Number.isFinite(entry) || entry < 0) invalid(`${at}.padding must be non-negative`);
      } else if (!entry || typeof entry !== "object" || Array.isArray(entry)) invalid(`${at}.padding must be a number or per-side object`);
      else for (const [side, amount] of Object.entries(entry)) {
        if (!["top", "right", "bottom", "left"].includes(side) || !Number.isFinite(amount) || amount < 0) invalid(`${at}.padding.${side} must be a non-negative finite side value`);
      }
    }
    if (key === "wrap" && typeof entry !== "boolean") invalid(`${at}.wrap must be a boolean`);
    if (key === "alignItems" && !["start", "center", "end", "stretch"].includes(entry)) invalid(`${at}.alignItems is invalid`);
    if (["justifyContent", "alignContent"].includes(key) && !DISTRIBUTIONS.includes(entry)) invalid(`${at}.${key} is invalid`);
    if (["widthMode", "heightMode"].includes(key) && !["fixed", "hug"].includes(entry)) invalid(`${at}.${key} must be fixed or hug`);
  }
}

// Validate the entire tree before the first write, including total size and cycles.
function validate(args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) invalid("expected {parentId?, nodes}");
  for (const key of Object.keys(args)) if (!["parentId", "nodes"].includes(key)) invalid(`${key} is unsupported`);
  if (args.parentId !== undefined && (typeof args.parentId !== "string" || !args.parentId.trim())) invalid("parentId must be a non-empty string");
  let count = 0;
  function visit(nodes, path) {
    if (!Array.isArray(nodes) || !nodes.length) invalid(`${path} must be a non-empty array`);
    for (const [i, node] of nodes.entries()) {
      const at = `${path}[${i}]`;
      if (++count > 200) invalid("nodes must contain at most 200 nodes in total");
      if (!node || typeof node !== "object" || Array.isArray(node)) invalid(`${at} must be a node object`);
      for (const key of Object.keys(node)) if (!(key in nodeProperties)) invalid(`${at}.${key} is unsupported`);
      if (!nodeProperties.type.enum.includes(node.type)) invalid(`${at}.type must be frame, rect, ellipse, text, line or path`);
      if (typeof node.name !== "string" || !node.name.trim()) invalid(`${at}.name must be a non-empty string`);
      for (const key of ["x", "y", "width", "height"]) if (!Number.isFinite(node[key])) invalid(`${at}.${key} must be a finite number`);
      for (const key of strings) if (node[key] !== undefined && typeof node[key] !== "string") invalid(`${at}.${key} must be a string`);
      for (const key of numbers) if (node[key] !== undefined && !Number.isFinite(node[key])) invalid(`${at}.${key} must be a finite number`);
      for (const key of ["width", "height", "strokeWidth", "cornerRadius"]) if (node[key] < 0) invalid(`${at}.${key} must be non-negative`);
      if (node.type === "path") {
        if (typeof node.d !== "string" || !node.d.trim()) invalid(`${at}.d is required for path nodes`);
        let points;
        try {
          points = parseSvgPath(node.d);
        } catch (error) {
          invalid(`${at}.d is invalid: ${error.message}`);
        }
        if (points.length < 2) invalid(`${at}.d must describe at least two path points`);
      } else if (node.d !== undefined) {
        invalid(`${at}.d is only supported for path nodes`);
      }
      if (node.opacity !== undefined && (node.opacity < 0 || node.opacity > 1)) invalid(`${at}.opacity must be between 0 and 1`);
      for (const key of ["fontSize", "lineHeight"]) if (node[key] !== undefined && node[key] <= 0) invalid(`${at}.${key} must be positive`);
      if (node.fontWeight !== undefined && !(["normal", "bold"].includes(node.fontWeight) || /^(?:[1-9]00)$/.test(String(node.fontWeight)))) invalid(`${at}.fontWeight must be normal, bold or 100–900`);
      if (node.align !== undefined && !nodeProperties.align.enum.includes(node.align)) invalid(`${at}.align must be left, center or right`);
      if (node.textSizing !== undefined && !nodeProperties.textSizing.enum.includes(node.textSizing)) invalid(`${at}.textSizing must be auto or fixed`);
      if (node.textSizing !== undefined && node.type !== "text") invalid(`${at}.textSizing requires a text node`);
      for (const key of ["layoutPosition", "layoutWidth", "layoutHeight"]) {
        if (node[key] !== undefined && !nodeProperties[key].enum.includes(node[key])) invalid(`${at}.${key} is invalid`);
      }
      for (const key of ["shadow", "autoLayout"]) {
        const value = node[key];
        if (value === undefined) continue;
        if (key === "autoLayout") {
          validateAutoLayout(value, `${at}.autoLayout`);
          continue;
        }
        if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${at}.${key} must be an object`);
        const props = nodeProperties[key].properties;
        for (const [field, entry] of Object.entries(value)) {
          const schema = props[field];
          if (!schema || typeof entry !== schema.type || (schema.type === "number" && !Number.isFinite(entry)) || (schema.enum && !schema.enum.includes(entry))) invalid(`${at}.${key}.${field} is invalid`);
        }
      }
      if (node.autoLayout !== undefined && node.type !== "frame") invalid(`${at}.autoLayout requires a frame`);
      if (node.children !== undefined) {
        if (node.type !== "frame") invalid(`${at}.children requires a frame`);
        if (!Array.isArray(node.children)) invalid(`${at}.children must be an array`);
        if (node.children.length) visit(node.children, `${at}.children`);
      }
    }
  }
  visit(args.nodes, "nodes");
}

/** Shared native creation path for bulk layout and HTML streaming. */
export function createLayoutNode(editor, node, parentId) {
  const {
    type, children, autoLayout, color, d, textSizing,
    key, htmlKey, htmlSource, parentKey, imagePrompt,
    layoutPosition, layoutWidth, layoutHeight, fillOpacity, strokeOpacity,
    ...style
  } = node;
  // HTML uses the scene's direction/per-side padding, while create_frame's
  // public arguments use layout/scalar padding. Preserve the full scene config
  // in the post-creation patch without passing objects to numeric arguments.
  const direction = autoLayout?.direction ?? autoLayout?.layout;
  const layout = ["horizontal", "vertical"].includes(direction) ? direction : "none";
  const frameLayout = {
    layout,
    ...(autoLayout?.gap !== undefined ? { gap: Number(autoLayout.gap) } : {}),
    ...(typeof autoLayout?.padding === "number" ? { padding: autoLayout.padding } : {}),
  };
  const result = type === "frame" ? createFrame({ ...style, ...frameLayout }, editor)
    : type === "path" ? createPath({ ...style, d }, editor)
    : type === "line" ? createPath({ ...style, fill: "none", d: `M 0 0 L ${node.width} ${node.height}` }, editor)
    : createShape({ ...style, kind: type }, editor);
  const patch = { ...style, ...(parentId ? { parentId } : {}) };
  for (const [field, value] of Object.entries({ layoutPosition, layoutWidth, layoutHeight, fillOpacity, strokeOpacity })) {
    if (value !== undefined) patch[field] = value;
  }
  if (type === "frame" && layout !== "none") {
    patch.autoLayout = normalizeAutoLayout({ ...autoLayout, direction: layout });
  }
  if (type === "text") {
    const importedBoxWidth = Number(style.boxWidth);
    patch.boxWidth = textSizing === "fixed"
      ? node.width
      : Number.isFinite(importedBoxWidth) && importedBoxWidth > 0 ? importedBoxWidth : 0;
    if (color !== undefined) patch.fill = color;
  }
  editor.updateNode(result.layerId, patch);
  return result.layerId;
}

/** Restore public interaction state after a failed tree build. */
function restoreBuildContext(editor, context) {
  if (context.tool !== undefined && editor.getTool?.() !== context.tool) editor.setTool?.(context.tool);
  if (context.isolation !== undefined && editor.getIsolationGroupId?.() !== context.isolation) {
    editor.exitGroup?.();
    const visited = new Set();
    // enterGroup follows visible selection boundaries, so repeatedly entering
    // the saved container restores a nested isolation through public APIs.
    while (editor.getIsolationGroupId?.() !== context.isolation) {
      const current = editor.getIsolationGroupId?.();
      if (!context.isolation || visited.has(current) || !editor.enterGroup?.(context.isolation)) {
        throw new Error("build-layout-isolation-restore-failed");
      }
      visited.add(current);
    }
  }
  if (context.kind === "background") editor.selectBackground?.();
  else if (context.groupId) {
    // selectGroup explicitly exits isolation. Inside an isolated container,
    // selecting its original member recreates the same promoted Group context.
    if (context.isolation) editor.select?.(context.ids?.[0] ?? context.groupId);
    else editor.selectGroup?.(context.groupId);
  } else if (Array.isArray(context.ids)) editor.selectExactly?.(context.ids);
}

function* buildLayoutSteps(args = {}, editor = typeof window !== "undefined" ? window.__vooEditor : null) {
  validate(args);
  if (!editor) throw Object.assign(new Error(TOOL_ERROR.NO_EDITOR), { code: TOOL_ERROR.NO_EDITOR });
  if (args.parentId) {
    const parent = editor.getNode?.(args.parentId);
    if (!parent) invalid(`parentId '${args.parentId}' was not found`);
    if (!(parent.kind === "group" || parent.type === "frame" || parent.isFrame || parent.frame || parent.containerType === "frame")) invalid("parentId must reference a frame or group");
  }
  const release = acquireAuthoring(editor);
  const created = [];
  const restores = [];
  const readDocument = () => editor.getDocument?.() ?? editor.getDoc?.();
  const before = readDocument();
  const canRestoreDocument = before && typeof editor.setDoc === "function";
  const selectedGroup = editor.getSelectedGroup?.();
  const context = {
    ids: editor.getSelectedIds?.()?.slice(),
    kind: editor.getSelection?.()?.kind ?? (editor.isBackgroundSelected?.() ? "background" : null),
    groupId: selectedGroup?.id,
    isolation: editor.getIsolationGroupId?.(),
    tool: editor.getTool?.(),
  };
  const batched = typeof editor.beginBatch === "function" && typeof editor.endBatch === "function";
  if (batched) editor.beginBatch();
  try {
    try {
      // Suppress helper commits even for older hosts without history batching.
      for (const key of ["commitEditorDocument", "commit"]) {
        const original = editor[key];
        if (typeof original !== "function") continue;
        editor[key] = () => {};
        restores.push(() => { editor[key] = original; });
      }
      function* create(nodes, parentId) {
        for (const node of nodes) {
          const { type, children } = node;
          yield node;
          const id = createLayoutNode(editor, node, parentId);
          created.push({ id, name: node.name, type });
          yield { ...node, id };
          if (children?.length) yield* create(children, id);
        }
      }
      yield* create(args.nodes, args.parentId);
    } finally {
      for (const restore of restores.reverse()) restore();
      if (batched) editor.endBatch();
      // Older adapters without public document replacement retain their
      // original history hook; current engines commit through setDoc below.
      if (!canRestoreDocument && created.length) editor.commitEditorDocument?.({ message: "AI: Build layout" });
    }
    if (canRestoreDocument && created.length) {
      commitEditorDocument("editor.layer.add", editor.setDoc, readDocument());
    }
  } catch (error) {
    // The whole tree was validated first, but host creation/measurement can
    // still fail mid-build. Never publish its partial nodes as a successful edit.
    if (canRestoreDocument && (!before.canvasId || readDocument()?.canvasId === before.canvasId)) {
      try {
        editor.setDoc(before, { commit: false });
        restoreBuildContext(editor, context);
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], "build-layout-rollback-failed");
      }
    }
    throw error;
  } finally { release(); }
  return { created, count: created.length };
}


/** Synchronous domain entry retained for nonvisual callers. */
export function buildLayout(args = {}) {
  const steps = buildLayoutSteps(args);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

/** Agent entry presents the same validated operations between real paint frames. */
export async function buildLayoutForAgent(args = {}, context = {}) {
  const editor = context.editor ?? (typeof window !== "undefined" ? window.__vooEditor : null);
  if (!editor) return buildLayout(args);
  const timeline = createAuthoringTimeline(editor, { signal: context.signal });
  const steps = buildLayoutSteps(args, editor);
  const count = nodes => (nodes ?? []).reduce((total, node) => total + 1 + count(node.children), 0);
  // Validation in the generator runs before walking potentially cyclic input.
  let step;
  try {
    context.signal?.throwIfAborted();
    step = steps.next();
    timeline.begin(count(args.nodes));
    while (!step.done) {
      await timeline.before(step.value);
      timeline.assertCurrent();
      const applied = steps.next();
      await timeline.after(applied.value);
      timeline.assertCurrent();
      step = steps.next();
    }
    return step.value;
  } catch (error) {
    // Throw into the transaction, including an abort during cursor travel, so
    // all created layers roll back and helper commits are restored together.
    if (step && !step.done) steps.throw(error);
    throw error;
  } finally {
    steps.return();
    timeline.finish();
  }
}
