/**
 * Canvas tools for bidirectional agent-canvas execution.
 * Allows local and cloud agents (Claude Code, Codex, Antigravity) to inspect
 * layer trees and execute transactional canvas mutations (geometry, styling,
 * text, auto-layout) with visual focus feedback and undo/redo synchronization.
 */

import { getSetting } from "../../shared/settings.js";
import {
  placeImageInEditor,
  runImageJob,
} from "./image_generation.js";
import { generateImageWeb, webImageStatusLine } from "./web_image_gen.js";
import {
  CANVAS_TOOL_GEOMETRY_SCHEMAS,
  captureCanvas,
  createPath,
  placeImage,
} from "./canvas_tools_geometry.js";
import {
  setAgentFocusNode,
} from "../editor/chrome_stage_overlays.js";
import {
  DESIGN_TOOL_EXECUTORS,
  DESIGN_TOOL_SCHEMAS,
} from "./canvas_tools_design_system.js";

import { COMPONENT_TOOL_SCHEMAS, COMPONENT_TOOL_EXECUTORS } from "./canvas_tools_components.js";
import { TEXT_PATH_TOOL_SCHEMAS, TEXT_PATH_TOOL_EXECUTORS } from "./canvas_tools_text_path.js";
import { CANVAS_TOOL_LAYOUT_SCHEMAS, LAYOUT_TOOL_EXECUTORS } from "./canvas_tools_layout.js";
import { CANVAS_TOOL_PLAN_SCHEMAS, PLAN_TOOL_EXECUTORS } from "./canvas_tools_plan.js";
import { SCENE_OPS_TOOL_SCHEMAS, SCENE_OPS_TOOL_EXECUTORS } from "./canvas_tools_scene_ops.js";

import { LINT_TOOL_SCHEMA, lintDesignTool } from "./design_quality/lint_tool.js";

export const AGENT_SETTING = Object.freeze({
  API_KEY: "agent.apiKey",
  BASE_URL: "agent.baseUrl",
  MODEL: "agent.model",
  IMAGE_PROVIDER_ID: "agent.imageProviderId",
  IMAGE_MODEL_ID: "agent.imageModelId",
  TEXT_PROVIDER_ID: "agent.text.providerId",
  TEXT_MODEL_ID: "agent.text.modelId",
  LLM_PROVIDER_ID: "agent.llm.providerId",
  LLM_MODEL_ID: "agent.llm.modelId",
  CONFIRM_BEFORE_IMAGE: "agent.confirmBeforeImage",
  USE_SELECTION_BY_DEFAULT: "agent.useSelectionByDefault",
  DEFAULT_IMAGE_SIZE: "agent.defaultImageSize",
  MAX_STEPS: "agent.maxSteps",
  STYLE_NOTE: "agent.styleNote",
});

export const AGENT_DEFAULTS = Object.freeze({
  confirmBeforeImage: true,
  useSelectionByDefault: true,
  defaultImageSize: "1024x1024",
  // Native CLI tools yield one model step per MCP call (including token setup).
  maxSteps: 64,
  styleNote: "",
});

export const IMAGE_SIZE_PRESETS = Object.freeze(["1024x1024", "1024x1536", "1536x1024"]);

export const TOOL_ERROR = Object.freeze({
  NO_EDITOR: "agentNoEditor",
  NO_IMAGE_MODEL: "agentNoImageModel",
  CANCELLED: "agentCancelled",
  NODE_NOT_FOUND: "agentNodeNotFound",
  INVALID_ARGS: "agentInvalidArgs",
});

export const CANVAS_TOOL_SCHEMAS = Object.freeze([
  {
    type: "function",
    function: {
      name: "generate_image",
      description:
        "Generate one image and place it as a new image layer on the open canvas. When a layer is selected and useSelection is not false, the selected image is the reference.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string" },
          size: { type: "string", description: "Optional, for example 1024x1024." },
          useSelection: { type: "boolean" },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "describe_selection",
      description: "Report which layer is currently selected on the canvas.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "inspect_layer_tree",
      description:
        "Inspect the canvas hierarchy and metadata of a specific layer or the whole canvas document. " +
        "Each returned node has id, kind, parentId, geometry, style, and nested children up to depth. " +
        "Call this before editing so you know the existing layers.",
      parameters: {
        type: "object",
        properties: {
          layerId: { type: "string", description: "Optional target layer ID. If omitted, inspects root or selection." },
          depth: { type: "number", description: "Optional max traversal depth below the target (default 4)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mutate_layer_layout",
      description: "Update the position, size, or rotation of a canvas layer.",
      parameters: {
        type: "object",
        properties: {
          layerId: { type: "string" },
          patch: {
            type: "object",
            properties: {
              x: { type: "number" },
              y: { type: "number" },
              width: { type: "number" },
              height: { type: "number" },
              rotation: { type: "number" },
            },
          },
        },
        required: ["layerId", "patch"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mutate_layer_style",
      description: "Update visual style attributes (fills, strokes, strokeWidth, cornerRadius, opacity).",
      parameters: {
        type: "object",
        properties: {
          layerId: { type: "string" },
          patch: {
            type: "object",
            properties: {
              fills: { type: "array" },
              strokes: { type: "array" },
              strokeWidth: { type: "number" },
              cornerRadius: { type: "number" },
              opacity: { type: "number" },
            },
          },
        },
        required: ["layerId", "patch"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mutate_layer_text",
      description: "Update typography and text content on a text layer.",
      parameters: {
        type: "object",
        properties: {
          layerId: { type: "string" },
          patch: {
            type: "object",
            properties: {
              textContent: { type: "string" },
              fontSize: { type: "number" },
              fontFamily: { type: "string" },
              fontWeight: { type: "string" },
              textAlign: { type: "string" },
            },
          },
        },
        required: ["layerId", "patch"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mutate_auto_layout",
      description: "Configure or update Auto-Layout properties on a frame or group layer.",
      parameters: {
        type: "object",
        properties: {
          layerId: { type: "string" },
          config: {
            type: "object",
            properties: {
              enabled: { type: "boolean" },
              direction: { type: "string", enum: ["horizontal", "vertical"] },
              gap: { type: "number" },
              padding: { type: "number" },
              wrap: { type: "boolean" },
              alignment: { type: "string" },
            },
            required: ["enabled"],
          },
        },
        required: ["layerId", "config"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "batch_mutate_layers",
      description: "Execute multiple layer mutations in a single atomic undoable transaction.",
      parameters: {
        type: "object",
        properties: {
          mutations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["layout", "style", "text", "autoLayout"] },
                layerId: { type: "string" },
                patch: { type: "object" },
              },
              required: ["type", "layerId", "patch"],
            },
          },
        },
        required: ["mutations"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_image_web",
      description:
        "Generate images in the user's signed-in Chrome via ChatGPT or Gemini and place them on the canvas. Requires the VOO Design desktop app and the VOO Chrome extension.",
      parameters: {
        type: "object",
        properties: {
          provider: { type: "string", enum: ["chatgpt", "gemini"] },
          prompt: { type: "string" },
          count: { type: "integer", minimum: 1, maximum: 4 },
          x: { type: "number" },
          y: { type: "number" },
          width: { type: "number" },
        },
        required: ["provider", "prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_shape",
      description: "Create a new rectangle, ellipse, or text layer on the canvas.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["rect", "ellipse", "text"] },
          x: { type: "number" },
          y: { type: "number" },
          width: { type: "number" },
          height: { type: "number" },
          text: { type: "string", description: "Text content for text layers." },
          fill: { type: "string" },
          name: { type: "string" },
        },
        required: ["kind", "x", "y", "width", "height"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_layers",
      description: "Delete one or more layers from the canvas.",
      parameters: {
        type: "object",
        properties: {
          layerIds: { type: "array", items: { type: "string" } },
        },
        required: ["layerIds"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "duplicate_layer",
      description: "Duplicate a single layer and select the copy.",
      parameters: {
        type: "object",
        properties: {
          layerId: { type: "string" },
        },
        required: ["layerId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "select_layers",
      description: "Replace the current selection with the given layers.",
      parameters: {
        type: "object",
        properties: {
          layerIds: { type: "array", items: { type: "string" } },
        },
        required: ["layerIds"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "group_layers",
      description: "Group two or more layers into a new folder.",
      parameters: {
        type: "object",
        properties: {
          layerIds: { type: "array", items: { type: "string" } },
          name: { type: "string" },
        },
        required: ["layerIds"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reorder_layer",
      description: "Move a layer to the front, back, or a specific stack index.",
      parameters: {
        type: "object",
        properties: {
          layerId: { type: "string" },
          position: {
            anyOf: [
              { type: "string", enum: ["front", "back"] },
              { type: "number" },
            ],
          },
        },
        required: ["layerId", "position"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rename_layer",
      description: "Rename a layer.",
      parameters: {
        type: "object",
        properties: {
          layerId: { type: "string" },
          name: { type: "string" },
        },
        required: ["layerId", "name"],
      },
    },
  },
  ...DESIGN_TOOL_SCHEMAS,
  ...CANVAS_TOOL_GEOMETRY_SCHEMAS,
  ...COMPONENT_TOOL_SCHEMAS,
  ...TEXT_PATH_TOOL_SCHEMAS,
  ...CANVAS_TOOL_LAYOUT_SCHEMAS,
  ...CANVAS_TOOL_PLAN_SCHEMAS,
  ...SCENE_OPS_TOOL_SCHEMAS, LINT_TOOL_SCHEMA,
]);

function requireEditor() {
  const editor = typeof window !== "undefined" ? window.__vooEditor : null;
  if (!editor) throw Object.assign(new Error(TOOL_ERROR.NO_EDITOR), { code: TOOL_ERROR.NO_EDITOR });
  return editor;
}

/** Data URL of the selected image layer, or null when nothing usable is selected. */
function selectedReference(editor) {
  const selectedId = editor.getSelectedId?.() ?? null;
  if (!selectedId) return null;
  return editor.exportNodePng?.(selectedId) ?? null;
}

async function generateImage(args, { signal } = {}) {
  const editor = requireEditor();
  const providerId = getSetting(AGENT_SETTING.IMAGE_PROVIDER_ID);
  const modelId = getSetting(AGENT_SETTING.IMAGE_MODEL_ID);
  if (!providerId || !modelId) {
    throw Object.assign(new Error(TOOL_ERROR.NO_IMAGE_MODEL), { code: TOOL_ERROR.NO_IMAGE_MODEL });
  }
  const useSelection = args.useSelection ?? getSetting(AGENT_SETTING.USE_SELECTION_BY_DEFAULT) ?? AGENT_DEFAULTS.useSelectionByDefault;
  const reference = useSelection === false ? null : selectedReference(editor);
  const size = args.size || getSetting(AGENT_SETTING.DEFAULT_IMAGE_SIZE) || AGENT_DEFAULTS.defaultImageSize;
  if (getSetting(AGENT_SETTING.CONFIRM_BEFORE_IMAGE) !== false && !window.confirm(`Generate image: "${args.prompt}"?`)) {
    throw Object.assign(new Error(TOOL_ERROR.CANCELLED), { code: TOOL_ERROR.CANCELLED });
  }
  const { taskId, urls } = await runImageJob({
    signal,
    providerId,
    request: {
      model: modelId,
      prompt: args.prompt,
      size,
      ...(reference ? { image: reference } : {}),
      n: 1,
    },
  });
  signal?.throwIfAborted();
  await placeImageInEditor(editor, urls[0], null);
  return { taskId, placed: true };
}

function placementPoint(args, index, span) {
  const hasX = Number.isFinite(args.x);
  const hasY = Number.isFinite(args.y);
  if (!hasX && !hasY && index === 0) return null;
  return {
    x: (hasX ? args.x : 0) + index * (span + 24),
    y: hasY ? args.y : 0,
  };
}

async function generateImageWebTool(args, { signal } = {}) {
  requireEditor();
  if (args.provider !== "chatgpt" && args.provider !== "gemini") {
    throw Object.assign(new Error("invalidProvider"), { code: "invalidProvider" });
  }
  const count = Math.min(4, Math.max(1, Math.round(Number(args.count) || 1)));
  const result = await generateImageWeb(
    { provider: args.provider, prompt: args.prompt, count },
    {
      signal,
      onProgress: (event) => {
        if (signal?.aborted) return;
        const statusLine = webImageStatusLine(args.provider, event.stage);
        globalThis.window?.dispatchEvent?.(
          new CustomEvent("voo:web-image-progress", {
            detail: { ...event, provider: args.provider, statusLine },
          }),
        );
      },
    },
  );
  signal?.throwIfAborted();
  if (result?.ok === false) {
    throw Object.assign(new Error(result.error || result.code || "needsDesktopApp"), {
      code: result.code || "needsDesktopApp",
    });
  }
  const images = Array.isArray(result?.images) ? result.images : [];
  const span = Number.isFinite(args.width) ? args.width : images[0]?.width || 512;
  const layerIds = [];
  for (let index = 0; index < images.length; index += 1) {
    signal?.throwIfAborted();
    const image = images[index];
    const point = placementPoint(args, index, span);
    const sourceWidth = image.width || (Number.isFinite(args.width) ? args.width : 512);
    const sourceHeight = image.height || sourceWidth;
    const width = Number.isFinite(args.width) ? args.width : undefined;
    const height =
      width !== undefined
        ? Math.max(1, Math.round(width * (sourceHeight / sourceWidth)))
        : undefined;
    const placed = await placeImage({
      url: image.dataUrl,
      ...(point ? { x: point.x, y: point.y } : {}),
      ...(width !== undefined ? { width, height } : {}),
    });
    if (placed.layerId) layerIds.push(placed.layerId);
  }
  return { ok: true, provider: args.provider, layerIds };
}

function describeSelection() {
  const editor = requireEditor();
  return {
    selectedId: editor.getSelectedId?.() ?? null,
    selectedIds: editor.getSelectedIds?.() ?? [],
  };
}

/** Extracts sanitized node descriptor for agent inspection. */
function sanitizeNode(node) {
  if (!node) return null;
  return {
    id: node.id,
    name: node.name || node.type || "Layer",
    kind: node.kind || node.type || "node",
    parentId: node.parentId || null,
    type: node.type || "node",
    x: node.x ?? 0,
    y: node.y ?? 0,
    width: node.width ?? 0,
    height: node.height ?? 0,
    rotation: node.rotation ?? 0,
    opacity: node.opacity ?? 1,
    cornerRadius: node.cornerRadius ?? 0,
    fills: node.fills || (node.fill ? [node.fill] : []),
    strokes: node.strokes || (node.stroke && node.strokeWidth ? [node.stroke] : []),
    strokeWidth: node.strokeWidth || 0,
    textContent: node.text || node.textContent || "",
    fontSize: node.fontSize,
    autoLayout: node.autoLayout || null,
    ...(node.fillVariableId ? { fillVariableId: node.fillVariableId } : {}),
    ...(node.strokeVariableId ? { strokeVariableId: node.strokeVariableId } : {}),
    ...(node.styleIds ? { styleIds: node.styleIds } : {}),
  };
}

/** Default traversal depth below the inspected root (schema and README agree on 4). */
const INSPECT_DEFAULT_DEPTH = 4;

function inspectLayerTree(args = {}) {
  const editor = requireEditor();
  const doc = editor.getDoc?.() || null;
  const nodes = doc?.nodes || [];

  const depthArg = Number(args.depth);
  const depth = Number.isFinite(depthArg) ? Math.max(0, Math.floor(depthArg)) : INSPECT_DEFAULT_DEPTH;

  // Children index, so recursion is O(nodes) instead of rescanning per node.
  const childrenOf = new Map();
  for (const node of nodes) {
    if (!node.parentId || node.parentId === node.id) continue;
    const list = childrenOf.get(node.parentId);
    if (list) list.push(node);
    else childrenOf.set(node.parentId, [node]);
  }

  const buildSubtree = (node, remainingDepth) => {
    const sanitized = sanitizeNode(node);
    if (remainingDepth > 0) {
      sanitized.children = (childrenOf.get(node.id) || []).map((child) =>
        buildSubtree(child, remainingDepth - 1),
      );
    }
    return sanitized;
  };

  const targetId = args.layerId || editor.getSelectedId?.();
  if (targetId) {
    const target = nodes.find((n) => n.id === targetId);
    if (!target) {
      throw Object.assign(new Error(TOOL_ERROR.NODE_NOT_FOUND), { code: TOOL_ERROR.NODE_NOT_FOUND });
    }
    const root = buildSubtree(target, depth);
    return {
      root,
      children: root.children ?? [],
      totalCount: nodes.length,
      depth,
    };
  }

  // If no targetId, return top-level layers as nested subtrees
  const topLevel = nodes
    .filter((n) => !n.parentId)
    .map((n) => buildSubtree(n, depth));
  return {
    layers: topLevel,
    totalCount: nodes.length,
    depth,
  };
}

function mutateLayerLayout(args) {
  const editor = requireEditor();
  const { layerId, patch } = args;
  const node = editor.getNode?.(layerId);
  if (!node) {
    throw Object.assign(new Error(TOOL_ERROR.NODE_NOT_FOUND), { code: TOOL_ERROR.NODE_NOT_FOUND });
  }

  setAgentFocusNode(node, "AI: Updating layout");

  editor.updateNode?.(layerId, patch);
  editor.commitEditorDocument?.({ message: "AI: Mutate Layer Layout" });

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("voo:agent-focus-node", {
        detail: { layerId, status: "Updating layout", patch },
      }),
    );
  }

  return { ok: true, layerId, updated: patch };
}

function mutateLayerStyle(args) {
  const editor = requireEditor();
  const { layerId, patch } = args;
  const node = editor.getNode?.(layerId);
  if (!node) {
    throw Object.assign(new Error(TOOL_ERROR.NODE_NOT_FOUND), { code: TOOL_ERROR.NODE_NOT_FOUND });
  }

  setAgentFocusNode(node, "AI: Updating style");

  editor.updateNode?.(layerId, patch);
  editor.commitEditorDocument?.({ message: "AI: Mutate Layer Style" });

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("voo:agent-focus-node", {
        detail: { layerId, status: "Updating style", patch },
      }),
    );
  }

  return { ok: true, layerId, updated: patch };
}

function mutateLayerText(args) {
  const editor = requireEditor();
  const { layerId, patch } = args;
  const node = editor.getNode?.(layerId);
  if (!node) {
    throw Object.assign(new Error(TOOL_ERROR.NODE_NOT_FOUND), { code: TOOL_ERROR.NODE_NOT_FOUND });
  }

  setAgentFocusNode(node, "AI: Updating text");

  const normalizedPatch = {
    ...patch,
    text: patch.textContent ?? patch.text,
  };

  editor.updateNode?.(layerId, normalizedPatch);
  editor.commitEditorDocument?.({ message: "AI: Mutate Layer Text" });

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("voo:agent-focus-node", {
        detail: { layerId, status: "Updating text", patch: normalizedPatch },
      }),
    );
  }

  return { ok: true, layerId, updated: normalizedPatch };
}

function mutateAutoLayout(args) {
  const editor = requireEditor();
  const { layerId, config } = args;
  const node = editor.getNode?.(layerId);
  if (!node) {
    throw Object.assign(new Error(TOOL_ERROR.NODE_NOT_FOUND), { code: TOOL_ERROR.NODE_NOT_FOUND });
  }

  setAgentFocusNode(node, "AI: Auto Layout");

  const patch = { autoLayout: config };
  editor.updateNode?.(layerId, patch);
  editor.commitEditorDocument?.({ message: "AI: Mutate Auto Layout" });

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("voo:agent-focus-node", {
        detail: { layerId, status: "Auto Layout", config },
      }),
    );
  }

  return { ok: true, layerId, autoLayout: config };
}

function batchMutateLayers(args) {
  const editor = requireEditor();
  const { mutations = [] } = args;
  if (!Array.isArray(mutations) || mutations.length === 0) {
    return { ok: true, count: 0 };
  }

  const updates = mutations.map((m) => {
    const node = editor.getNode?.(m.layerId);
    if (node) {
      setAgentFocusNode(node, `AI: Batch ${m.type}`);
    }
    const patch = m.patch || {};
    if (m.type === "text" && patch.textContent) {
      patch.text = patch.textContent;
    } else if (m.type === "autoLayout") {
      return { id: m.layerId, autoLayout: patch };
    }
    return { id: m.layerId, ...patch };
  });

  editor.updateNodes?.(updates);
  editor.commitEditorDocument?.({ message: "AI: Batch Mutate Layers" });

  return { ok: true, count: updates.length };
}

function invalidArgs(message = TOOL_ERROR.INVALID_ARGS) {
  const full = message === TOOL_ERROR.INVALID_ARGS ? message : `${TOOL_ERROR.INVALID_ARGS}: ${message}`;
  throw Object.assign(new Error(full), { code: TOOL_ERROR.INVALID_ARGS });
}

function nodeNotFound() {
  throw Object.assign(new Error(TOOL_ERROR.NODE_NOT_FOUND), { code: TOOL_ERROR.NODE_NOT_FOUND });
}

function requireLayerId(value) {
  if (typeof value !== "string" || value.trim() === "") {
    invalidArgs(`Invalid argument "layerId": expected a non-empty string, got ${JSON.stringify(value)}`);
  }
  return value;
}

function requireLayerIds(value, { min = 1 } = {}) {
  if (!Array.isArray(value) || value.length < min) {
    invalidArgs(`Invalid argument "layerIds": expected an array of at least ${min} id(s), got ${JSON.stringify(value)}`);
  }
  const ids = [...new Set(value)];
  if (ids.some((id) => typeof id !== "string" || id.trim() === "")) {
    invalidArgs(`Invalid argument "layerIds": expected non-empty string ids, got ${JSON.stringify(value)}`);
  }
  return ids;
}

function requireNode(editor, layerId) {
  const node = editor.getNode?.(layerId);
  if (!node) nodeNotFound();
  return node;
}

function isGroupNode(node) {
  return node?.kind === "group" || node?.type === "group";
}

function createShape(args = {}) {
  const editor = requireEditor();
  const { kind, x, y, width, height, text, fill, name } = args;
  if (!["rect", "ellipse", "text"].includes(kind)) {
    invalidArgs(`Invalid argument "kind": expected one of rect, ellipse, text, got ${JSON.stringify(kind)}`);
  }
  if (![x, y, width, height].every((value) => Number.isFinite(value))) {
    invalidArgs(`Invalid argument "x"/"y"/"width"/"height": expected finite numbers, got ${JSON.stringify({ x, y, width, height })}`);
  }
  if (text !== undefined && typeof text !== "string") {
    invalidArgs(`Invalid argument "text": expected a string, got ${JSON.stringify(text)}`);
  }
  if (fill !== undefined && typeof fill !== "string") {
    invalidArgs(`Invalid argument "fill": expected a string, got ${JSON.stringify(fill)}`);
  }
  if (name !== undefined && typeof name !== "string") {
    invalidArgs(`Invalid argument "name": expected a string, got ${JSON.stringify(name)}`);
  }

  let node;
  if (kind === "rect") {
    node = editor.addRectAt?.({ x, y });
  } else if (kind === "ellipse") {
    node = editor.addEllipseAt?.({ x, y });
  } else {
    node = editor.addTextAt?.({ x, y }, text ?? "");
  }
  if (!node?.id) invalidArgs(`Invalid argument: failed to create shape node`);

  const patch = { width, height };
  if (name !== undefined) patch.name = name;
  if (fill !== undefined) patch.fill = fill;
  editor.updateNode?.(node.id, patch);
  editor.commitEditorDocument?.({ message: "AI: Create shape" });

  return { ok: true, layerId: node.id };
}

function deleteLayers(args = {}) {
  const editor = requireEditor();
  const layerIds = requireLayerIds(args.layerIds);
  layerIds.forEach((layerId) => requireNode(editor, layerId));

  if (typeof editor.removeIds === "function") {
    editor.removeIds(layerIds);
  } else {
    layerIds.forEach((layerId) => editor.removeNode?.(layerId));
  }
  editor.commitEditorDocument?.({ message: "AI: Delete layers" });

  return { ok: true, count: layerIds.length };
}

function duplicateLayer(args = {}) {
  const editor = requireEditor();
  const layerId = requireLayerId(args.layerId);
  requireNode(editor, layerId);

  editor.selectExactly?.([layerId]);
  editor.duplicateSelected?.();
  const newLayerId = editor.getSelectedId?.() ?? null;

  return { ok: true, layerId: newLayerId };
}

function selectLayers(args = {}) {
  const editor = requireEditor();
  const layerIds = requireLayerIds(args.layerIds, { min: 0 });
  layerIds.forEach((layerId) => requireNode(editor, layerId));

  editor.selectExactly?.(layerIds);
  return { ok: true, layerIds };
}

function groupLayers(args = {}) {
  const editor = requireEditor();
  const layerIds = requireLayerIds(args.layerIds, { min: 2 });
  layerIds.forEach((layerId) => requireNode(editor, layerId));
  if (args.name !== undefined && typeof args.name !== "string") {
    invalidArgs(`Invalid argument "name": expected a string, got ${JSON.stringify(args.name)}`);
  }

  const docBefore = editor.getDoc?.();
  const groupsBefore = new Set((docBefore?.nodes || []).filter(isGroupNode).map((node) => node.id));

  editor.selectExactly?.(layerIds);
  const result = editor.groupSelection?.();

  let groupId = typeof result === "string" ? result : result?.id ?? null;
  if (!groupId) {
    const selectedId = editor.getSelectedId?.();
    if (selectedId && !layerIds.includes(selectedId)) groupId = selectedId;
  }
  if (!groupId) {
    const nodesAfter = editor.getDoc?.()?.nodes || [];
    const newGroups = nodesAfter.filter((node) => isGroupNode(node) && !groupsBefore.has(node.id));
    const containing = newGroups.find((group) =>
      nodesAfter.some((node) => node.parentId === group.id && layerIds.includes(node.id)),
    );
    groupId = containing?.id ?? newGroups.at(-1)?.id ?? null;
  }

  if (groupId && args.name !== undefined) {
    editor.updateNode?.(groupId, { name: args.name });
    editor.commitEditorDocument?.({ message: "AI: Group Layers" });
  }

  return { ok: true, groupId };
}

function reorderLayer(args = {}) {
  const editor = requireEditor();
  const layerId = requireLayerId(args.layerId);
  requireNode(editor, layerId);

  let position = args.position;
  if (typeof position === "string") {
    position = position.toLowerCase();
    if (position !== "front" && position !== "back") {
      invalidArgs(`Invalid argument "position": expected "front", "back", or a number, got ${JSON.stringify(args.position)}`);
    }
  } else if (typeof position === "number" && Number.isFinite(position)) {
    position = Math.round(position);
  } else {
    invalidArgs(`Invalid argument "position": expected "front", "back", or a finite number, got ${JSON.stringify(args.position)}`);
  }

  if (position === "front") {
    editor.moveToFront?.([layerId]);
  } else if (position === "back") {
    editor.moveToBack?.([layerId]);
  } else {
    editor.reorderNodeTo?.(layerId, position);
  }

  return { ok: true, layerId, position };
}

function renameLayer(args = {}) {
  const editor = requireEditor();
  const layerId = requireLayerId(args.layerId);
  requireNode(editor, layerId);
  if (typeof args.name !== "string" || args.name.trim() === "") {
    invalidArgs(`Invalid argument "name": expected a non-empty string, got ${JSON.stringify(args.name)}`);
  }

  editor.updateNode?.(layerId, { name: args.name });
  editor.commitEditorDocument?.({ message: "AI: Rename Layer" });

  return { ok: true, layerId, name: args.name };
}

const EXECUTORS = Object.freeze({
  generate_image: generateImage,
  generate_image_web: generateImageWebTool,
  describe_selection: describeSelection,
  inspect_layer_tree: inspectLayerTree,
  mutate_layer_layout: mutateLayerLayout,
  mutate_layer_style: mutateLayerStyle,
  mutate_layer_text: mutateLayerText,
  mutate_auto_layout: mutateAutoLayout,
  batch_mutate_layers: batchMutateLayers,
  create_shape: createShape,
  delete_layers: deleteLayers,
  duplicate_layer: duplicateLayer,
  select_layers: selectLayers,
  group_layers: groupLayers,
  reorder_layer: reorderLayer,
  rename_layer: renameLayer,
  ...DESIGN_TOOL_EXECUTORS,
  ...COMPONENT_TOOL_EXECUTORS,
  ...TEXT_PATH_TOOL_EXECUTORS,
  ...LAYOUT_TOOL_EXECUTORS,
  ...PLAN_TOOL_EXECUTORS,
  ...SCENE_OPS_TOOL_EXECUTORS, lint_design: lintDesignTool,
  create_path: createPath,
  place_image: placeImage,
  capture_canvas: captureCanvas,
});

/** Runs a canvas tool by name; an unknown name is an error, not a silent no-op. */
export async function executeCanvasTool(name, args, context = {}) {
  context.signal?.throwIfAborted();
  const executor = EXECUTORS[name];
  if (!executor) throw new Error(`unknown tool: ${name}`);
  return executor(args, context);
}
