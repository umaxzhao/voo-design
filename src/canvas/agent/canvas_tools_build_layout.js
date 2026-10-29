/** Bulk creation uses the same editor creation and measurement pipeline as the individual tools. */
import { createShape, TOOL_ERROR } from "./canvas_tools.js";
import { createFrame } from "./canvas_tools_layout.js";
import { createPath } from "./canvas_tools_geometry.js";
import { normalizeAutoLayout } from "../editor/scene_auto_layout.js";
import { parseSvgPath } from "../editor/editor_svg_parse.js";

const strings = ["name", "fill", "stroke", "text", "fontFamily", "color", "d"];
const numbers = ["x", "y", "width", "height", "strokeWidth", "cornerRadius", "opacity", "fontSize", "lineHeight", "letterSpacing"];
const nodeProperties = {
  type: { type: "string", enum: ["frame", "rect", "ellipse", "text", "line", "path"] },
  ...Object.fromEntries(strings.map(key => [key, { type: "string" }])),
  ...Object.fromEntries(numbers.map(key => [key, { type: "number" }])),
  fontWeight: { anyOf: [{ type: "string" }, { type: "number" }] },
  align: { type: "string", enum: ["left", "center", "right"] },
  shadow: { type: "object", properties: {
    enabled: { type: "boolean" }, color: { type: "string" },
    blur: { type: "number" }, offsetX: { type: "number" }, offsetY: { type: "number" }, opacity: { type: "number" },
  }, additionalProperties: false },
  autoLayout: { type: "object", properties: {
    layout: { type: "string", enum: ["none", "horizontal", "vertical"] },
    gap: { type: "number" }, padding: { type: "number" },
  }, additionalProperties: false },
  children: { type: "array", items: { $ref: "#/$defs/node" } },
};
export const BUILD_LAYOUT_SCHEMA = {
  type: "function",
  function: {
    name: "build_layout",
    description: "Create a complete tree of up to 200 editable layers in one undoable batch. Supported types: frame, rect, ellipse, text, line and path (path requires SVG d data). For one poster, screen or composed page, make one top-level frame and put its artwork, vector paths and text in that frame's children so the result moves as one composition; use type=text for editable copy. Use separate top-level nodes only when they should be independent. All x/y coordinates are absolute canvas coordinates, including children (parentId establishes ownership, not a coordinate offset). Auto-layout may reposition children. autoLayout accepts create_frame's layout, gap and padding. Text is measured after its typography is applied; width is the wrapping box. Lines run from (x,y) to (x+width,y+height). After creating a composition, call capture_canvas and inspect_layout before finishing. Returns {created:[{id,name,type}],count}. You may batch multiple tool calls in one step.",
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
      if (!nodeProperties.type.enum.includes(node.type)) invalid(`${at}.type must be frame, rect, ellipse, text or line`);
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
      for (const key of ["shadow", "autoLayout"]) {
        const value = node[key];
        if (value === undefined) continue;
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
    type, children, autoLayout, color, d,
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
    ...(autoLayout?.padding !== undefined ? {
      padding: Number(typeof autoLayout.padding === "object" ? autoLayout.padding?.top ?? 0 : autoLayout.padding),
    } : {}),
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
  if (type === "text") { patch.boxWidth = node.width; if (color !== undefined) patch.fill = color; }
  editor.updateNode(result.layerId, patch);
  return result.layerId;
}

export function buildLayout(args = {}) {
  validate(args);
  const editor = typeof window !== "undefined" ? window.__vooEditor : null;
  if (!editor) throw Object.assign(new Error(TOOL_ERROR.NO_EDITOR), { code: TOOL_ERROR.NO_EDITOR });
  if (args.parentId) {
    const parent = editor.getNode?.(args.parentId);
    if (!parent) invalid(`parentId '${args.parentId}' was not found`);
    if (!(parent.kind === "group" || parent.type === "frame" || parent.isFrame || parent.frame || parent.containerType === "frame")) invalid("parentId must reference a frame or group");
  }
  const created = [];
  const restores = [];
  const batched = typeof editor.beginBatch === "function" && typeof editor.endBatch === "function";
  if (batched) editor.beginBatch();
  try {
    // Suppress helper commits even for older hosts without history batching.
    for (const key of ["commitEditorDocument", "commit"]) {
      const original = editor[key];
      if (typeof original !== "function") continue;
      editor[key] = () => {};
      restores.push(() => { editor[key] = original; });
    }
    function create(nodes, parentId) {
      for (const node of nodes) {
        const { type, children } = node;
        const id = createLayoutNode(editor, node, parentId);
        created.push({ id, name: node.name, type });
        if (children?.length) create(children, id);
      }
    }
    if (!batched && typeof editor.mute === "function") editor.mute(() => create(args.nodes, args.parentId));
    else create(args.nodes, args.parentId);
  } finally {
    for (const restore of restores.reverse()) restore();
    if (batched) editor.endBatch();
    if (created.length) editor.commitEditorDocument?.({ message: "AI: Build layout" });
  }
  return { created, count: created.length };
}
