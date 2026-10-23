/**
 * Layout-side canvas tools: alignment, distribution, frames, grouping and
 * history. Registered by extending CANVAS_TOOL_SCHEMAS / LAYOUT_TOOL_EXECUTORS.
 */

import { TOOL_ERROR } from "./canvas_tools.js";
import {
  alignNodes,
  distributeSpacingNodes,
} from "../editor/align_ops.js";
import { nodeAABB } from "../editor/scene_geometry.js";

const ALIGN_TYPES = Object.freeze([
  "left",
  "center",
  "right",
  "top",
  "middle",
  "bottom",
]);
const RELATIVE_TO = Object.freeze(["selection", "first", "parent"]);
const DISTRIBUTE_AXES = Object.freeze(["horizontal", "vertical"]);
const FRAME_LAYOUTS = Object.freeze(["none", "horizontal", "vertical"]);

function requireEditor() {
  const editor = typeof window !== "undefined" ? window.__vooEditor : null;
  if (!editor) throw Object.assign(new Error(TOOL_ERROR.NO_EDITOR), { code: TOOL_ERROR.NO_EDITOR });
  return editor;
}

function invalidArgs(message) {
  throw Object.assign(new Error(message || TOOL_ERROR.INVALID_ARGS), {
    code: TOOL_ERROR.INVALID_ARGS,
  });
}

function nodeNotFound(message) {
  throw Object.assign(new Error(message || TOOL_ERROR.NODE_NOT_FOUND), {
    code: TOOL_ERROR.NODE_NOT_FOUND,
  });
}

function getDocument(editor) {
  const doc = editor.getDoc?.() ?? editor.getDocument?.() ?? null;
  if (!doc || !Array.isArray(doc.nodes)) invalidArgs();
  return doc;
}

function getNode(editor, layerId) {
  return (
    editor.getNode?.(layerId) ??
    getDocument(editor).nodes.find((node) => node.id === layerId) ??
    null
  );
}

function requireNode(editor, layerId) {
  const node = getNode(editor, layerId);
  if (!node) nodeNotFound();
  return node;
}

function requireLayerId(value) {
  if (typeof value !== "string" || value.trim() === "") invalidArgs();
  return value;
}

function requireLayerIds(value, { min = 1 } = {}) {
  if (!Array.isArray(value) || value.length < min) invalidArgs();
  const ids = [...new Set(value)];
  if (ids.some((id) => typeof id !== "string" || id.trim() === "")) invalidArgs();
  if (ids.length < min) invalidArgs();
  return ids;
}

function requireNodes(editor, layerIds, options) {
  return requireLayerIds(layerIds, options).map((layerId) => requireNode(editor, layerId));
}

function commitDocument(editor, next, message) {
  if (typeof editor.setDoc === "function") {
    editor.setDoc(next, { name: message });
    return;
  }
  if (typeof editor.updateDocument === "function") {
    editor.updateDocument(next, { name: message });
    return;
  }
  if (typeof editor.setDocument === "function") {
    editor.setDocument(next, { name: message });
    return;
  }
  if (typeof editor.applyDocument === "function") {
    editor.applyDocument(next, { name: message });
    return;
  }
  const current = editor.getDoc?.() ?? editor.getDocument?.() ?? null;
  if (current && typeof current === "object") {
    for (const [key, value] of Object.entries(next)) current[key] = value;
    editor.commitEditorDocument?.({ message });
    editor.requestRender?.();
    return;
  }
  invalidArgs();
}

function boundsOf(node) {
  const box = nodeAABB(node);
  return {
    x: Number.isFinite(box?.x) ? box.x : node.x ?? 0,
    y: Number.isFinite(box?.y) ? box.y : node.y ?? 0,
    width: Number.isFinite(box?.width) ? box.width : node.width ?? 0,
    height: Number.isFinite(box?.height) ? box.height : node.height ?? 0,
  };
}

function unionBounds(nodes) {
  const boxes = nodes.map(boundsOf);
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function parentBounds(editor, nodes) {
  const parentIds = new Set(nodes.map((node) => node.parentId ?? null));
  if (parentIds.size === 1) {
    const parentId = [...parentIds][0];
    if (parentId) {
      const parent = getNode(editor, parentId);
      if (parent) return boundsOf(parent);
    } else {
      const doc = getDocument(editor);
      if (Number.isFinite(doc.width) && Number.isFinite(doc.height)) {
        return { x: 0, y: 0, width: doc.width, height: doc.height };
      }
    }
  }
  return unionBounds(nodes);
}

function positionFor(box, target, align) {
  let x = box.x;
  let y = box.y;
  if (align === "left") {
    x = target.x;
  } else if (align === "center") {
    x = Math.round(target.x + (target.width - box.width) / 2);
  } else if (align === "right") {
    x = target.x + target.width - box.width;
  } else if (align === "top") {
    y = target.y;
  } else if (align === "middle") {
    y = Math.round(target.y + (target.height - box.height) / 2);
  } else if (align === "bottom") {
    y = target.y + target.height - box.height;
  }
  return { x, y };
}

function applyPatches(editor, patches, message) {
  if (patches.length === 0) return 0;
  for (const { id, patch } of patches) {
    editor.updateNode?.(id, patch);
  }
  editor.commitEditorDocument?.({ message });
  return patches.length;
}

function alignLayers(args = {}) {
  const editor = requireEditor();
  const nodes = requireNodes(editor, args.layerIds, { min: 1 });
  const align = args.align;
  if (!ALIGN_TYPES.includes(align)) invalidArgs();
  const relativeTo = args.relativeTo ?? "selection";
  if (!RELATIVE_TO.includes(relativeTo)) invalidArgs();

  let patches;
  if (relativeTo === "selection") {
    patches = alignNodes(nodes, align);
  } else {
    const target =
      relativeTo === "first"
        ? boundsOf(nodes[0])
        : parentBounds(editor, nodes);
    patches = [];
    for (const node of nodes) {
      const box = boundsOf(node);
      const next = positionFor(box, target, align);
      if (next.x !== node.x || next.y !== node.y) {
        patches.push({ id: node.id, patch: next });
      }
    }
  }

  const moved = applyPatches(editor, patches, "AI: Align Layers");
  return { ok: true, align, relativeTo, moved };
}

function distributeLayers(args = {}) {
  const editor = requireEditor();
  const nodes = requireNodes(editor, args.layerIds, { min: 3 });
  const axis = args.axis;
  if (!DISTRIBUTE_AXES.includes(axis)) invalidArgs();

  let spacing = null;
  if (args.spacing !== undefined && args.spacing !== null) {
    if (!Number.isFinite(Number(args.spacing))) invalidArgs();
    spacing = Number(args.spacing);
  }

  const patches = distributeSpacingNodes(nodes, {
    axis,
    ...(spacing !== null ? { gap: spacing } : {}),
  });
  const moved = applyPatches(editor, patches, "AI: Distribute Layers");
  return { ok: true, axis, spacing, moved };
}

function createFrameNode(editor, x, y) {
  if (typeof editor.addFrameAt === "function") {
    return { node: editor.addFrameAt({ x, y }), rect: false };
  }
  if (typeof editor.addRectAt === "function") {
    return { node: editor.addRectAt({ x, y }), rect: true };
  }
  invalidArgs("The editor cannot create frame or rectangle nodes");
  return null;
}

function applyAutoLayout(editor, layerId, config) {
  editor.updateNode?.(layerId, { autoLayout: config });
  editor.commitEditorDocument?.({ message: "AI: Mutate Auto Layout" });
  return config;
}

export function createFrame(args = {}) {
  const editor = requireEditor();
  const { x, y, width, height, name, fill } = args;
  if (![x, y, width, height].every((value) => Number.isFinite(value))) invalidArgs();
  if (name !== undefined && typeof name !== "string") invalidArgs();
  if (fill !== undefined && typeof fill !== "string") invalidArgs();

  const layout = args.layout ?? "none";
  if (!FRAME_LAYOUTS.includes(layout)) invalidArgs();
  const gap = args.gap === undefined ? undefined : Number(args.gap);
  const padding = args.padding === undefined ? undefined : Number(args.padding);
  if (gap !== undefined && !Number.isFinite(gap)) invalidArgs();
  if (padding !== undefined && !Number.isFinite(padding)) invalidArgs();

  const { node, rect } = createFrameNode(editor, x, y);
  if (!node?.id) nodeNotFound();

  const patch = { x, y, width, height };
  if (name !== undefined) patch.name = name;
  if (fill !== undefined) patch.fill = fill;
  if (rect) {
    patch.isFrame = true;
    patch.frame = true;
    patch.containerType = "frame";
  }
  editor.updateNode?.(node.id, patch);
  editor.commitEditorDocument?.({ message: "AI: Create frame" });

  if (layout !== "none") {
    const config = { direction: layout };
    if (gap !== undefined) config.gap = gap;
    if (padding !== undefined) config.padding = padding;
    applyAutoLayout(editor, node.id, config);
  }

  return { ok: true, layerId: node.id };
}

function isGroupLike(node) {
  return (
    node?.kind === "group" ||
    node?.type === "group" ||
    node?.isFrame === true ||
    node?.frame === true ||
    node?.containerType === "frame"
  );
}

function ungroupLayers(args = {}) {
  const editor = requireEditor();
  const groupId = requireLayerId(args.groupId);
  const group = requireNode(editor, groupId);
  if (!isGroupLike(group)) invalidArgs(`${groupId} is not a group or frame`);

  const doc = getDocument(editor);
  const released = doc.nodes
    .filter((node) => node.parentId === groupId)
    .map((node) => node.id);

  if (typeof editor.ungroupSelection === "function") {
    editor.selectExactly?.([groupId]);
    editor.ungroupSelection();
    return { ok: true, groupId, released };
  }

  const nodes = doc.nodes
    .filter((node) => node.id !== groupId)
    .map((node) => {
      if (node.parentId !== groupId) return node;
      const { parentId, ...rest } = node;
      return rest;
    });
  commitDocument(editor, { ...doc, nodes }, "AI: Ungroup Layers");
  return { ok: true, groupId, released };
}

function nodeKind(node) {
  return node?.kind || node?.type || "node";
}

function matchesKind(node, kind) {
  const wanted = kind.toLowerCase();
  const kinds = [node?.kind, node?.type].filter(
    (value) => typeof value === "string" && value,
  );
  if (
    node?.isFrame === true ||
    node?.frame === true ||
    node?.containerType === "frame"
  ) {
    kinds.push("frame");
  }
  return kinds.some((value) => value.toLowerCase() === wanted);
}

function findLayers(args = {}) {
  const editor = requireEditor();
  if (args.name !== undefined && typeof args.name !== "string") invalidArgs();
  if (args.kind !== undefined && typeof args.kind !== "string") invalidArgs();
  const name = typeof args.name === "string" ? args.name.toLowerCase() : null;
  const kind = typeof args.kind === "string" && args.kind.trim() !== ""
    ? args.kind.trim()
    : null;

  const doc = getDocument(editor);
  const layers = doc.nodes
    .filter((node) => {
      if (name !== null && !String(node.name ?? "").toLowerCase().includes(name)) {
        return false;
      }
      return kind === null || matchesKind(node, kind);
    })
    .map((node) => ({
      id: node.id,
      name: node.name ?? nodeKind(node),
      kind: nodeKind(node),
      bounds: boundsOf(node),
    }));

  return { ok: true, layers };
}

function normalizeSteps(value) {
  if (value === undefined || value === null) return 1;
  const steps = Number(value);
  if (!Number.isInteger(steps) || steps < 1) invalidArgs();
  return steps;
}

async function undo(args = {}) {
  const editor = requireEditor();
  const steps = normalizeSteps(args.steps);
  if (typeof editor.undo !== "function") invalidArgs("The editor does not support undo");
  for (let index = 0; index < steps; index += 1) {
    await editor.undo();
  }
  return { ok: true, steps };
}

async function redo(args = {}) {
  const editor = requireEditor();
  const steps = normalizeSteps(args.steps);
  if (typeof editor.redo !== "function") invalidArgs("The editor does not support redo");
  for (let index = 0; index < steps; index += 1) {
    await editor.redo();
  }
  return { ok: true, steps };
}

export const CANVAS_TOOL_LAYOUT_SCHEMAS = Object.freeze([
  {
    type: "function",
    function: {
      name: "align_layers",
      description:
        "Align one or more layers along an edge or center line. relativeTo controls the " +
        "reference box: the whole selection, the first listed layer, or the shared parent frame.",
      parameters: {
        type: "object",
        properties: {
          layerIds: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            description: "Layer IDs to align.",
          },
          align: {
            type: "string",
            enum: [...ALIGN_TYPES],
            description: "Edge or center line to align to.",
          },
          relativeTo: {
            type: "string",
            enum: [...RELATIVE_TO],
            description:
              "Reference box: selection bounds (default), the first layer's bounds, or the shared parent's bounds.",
          },
        },
        required: ["layerIds", "align"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "distribute_layers",
      description:
        "Distribute three or more layers along an axis. With spacing, the first layer stays " +
        "anchored and each following layer is placed at that fixed gap; without spacing, the " +
        "outermost layers stay anchored and the gaps between all layers are equalized.",
      parameters: {
        type: "object",
        properties: {
          layerIds: {
            type: "array",
            items: { type: "string" },
            minItems: 3,
            description: "Layer IDs to distribute (at least three).",
          },
          axis: {
            type: "string",
            enum: [...DISTRIBUTE_AXES],
            description: "Axis along which the layers are distributed.",
          },
          spacing: {
            type: "number",
            description:
              "Optional fixed edge-to-edge gap in pixels. Omit to equalize the existing spacing.",
          },
        },
        required: ["layerIds", "axis"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_frame",
      description:
        "Create a rectangle/frame at exact geometry and optionally enable Auto-Layout " +
        "(horizontal or vertical) with a gap and padding.",
      parameters: {
        type: "object",
        properties: {
          x: { type: "number", description: "Frame origin x." },
          y: { type: "number", description: "Frame origin y." },
          width: { type: "number", description: "Frame width." },
          height: { type: "number", description: "Frame height." },
          name: { type: "string", description: "Optional layer name." },
          fill: { type: "string", description: "Optional fill colour." },
          layout: {
            type: "string",
            enum: [...FRAME_LAYOUTS],
            description: "Auto-Layout direction; 'none' leaves the frame unmanaged.",
          },
          gap: {
            type: "number",
            description: "Optional spacing between Auto-Layout children.",
          },
          padding: {
            type: "number",
            description: "Optional inner padding for Auto-Layout.",
          },
        },
        required: ["x", "y", "width", "height"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ungroup_layers",
      description:
        "Ungroup a group or frame, releasing its direct children into the parent level.",
      parameters: {
        type: "object",
        properties: {
          groupId: {
            type: "string",
            description: "ID of the group or frame to ungroup.",
          },
        },
        required: ["groupId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_layers",
      description:
        "Read-only layer search by case-insensitive name substring and/or kind. " +
        "Returns matching ids, names, kinds, and bounds.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Optional case-insensitive name substring.",
          },
          kind: {
            type: "string",
            description: "Optional layer kind (rect, text, image, group, frame, ...).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "undo",
      description: "Undo editor history steps (default one).",
      parameters: {
        type: "object",
        properties: {
          steps: {
            type: "integer",
            minimum: 1,
            description: "Optional number of undo steps (default 1).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "redo",
      description: "Redo editor history steps (default one).",
      parameters: {
        type: "object",
        properties: {
          steps: {
            type: "integer",
            minimum: 1,
            description: "Optional number of redo steps (default 1).",
          },
        },
      },
    },
  },
]);

export const LAYOUT_TOOL_EXECUTORS = Object.freeze({
  align_layers: alignLayers,
  distribute_layers: distributeLayers,
  create_frame: createFrame,
  ungroup_layers: ungroupLayers,
  find_layers: findLayers,
  undo,
  redo,
});
