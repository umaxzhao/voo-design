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
import {
  setAgentFocusNode,
} from "../editor/chrome_stage_overlays.js";

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
  maxSteps: 8,
  styleNote: "",
});

export const IMAGE_SIZE_PRESETS = Object.freeze(["1024x1024", "1024x1536", "1536x1024"]);

export const TOOL_ERROR = Object.freeze({
  NO_EDITOR: "agentNoEditor",
  NO_IMAGE_MODEL: "agentNoImageModel",
  CANCELLED: "agentCancelled",
  NODE_NOT_FOUND: "agentNodeNotFound",
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
        "Inspect the canvas hierarchy and metadata of a specific layer or the whole canvas document.",
      parameters: {
        type: "object",
        properties: {
          layerId: { type: "string", description: "Optional target layer ID. If omitted, inspects root or selection." },
          depth: { type: "number", description: "Optional max traversal depth, default 4." },
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

async function generateImage(args) {
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
    providerId,
    request: {
      model: modelId,
      prompt: args.prompt,
      size,
      ...(reference ? { image: reference } : {}),
      n: 1,
    },
  });
  await placeImageInEditor(editor, urls[0], null);
  return { taskId, placed: true };
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
    type: node.type || "node",
    x: node.x ?? 0,
    y: node.y ?? 0,
    width: node.width ?? 0,
    height: node.height ?? 0,
    rotation: node.rotation ?? 0,
    opacity: node.opacity ?? 1,
    cornerRadius: node.cornerRadius ?? 0,
    fills: node.fills || [],
    strokes: node.strokes || [],
    strokeWidth: node.strokeWidth || 0,
    textContent: node.text || node.textContent || "",
    fontSize: node.fontSize,
    autoLayout: node.autoLayout || null,
  };
}

function inspectLayerTree(args = {}) {
  const editor = requireEditor();
  const doc = editor.getDoc?.() || null;
  const nodes = doc?.nodes || [];

  const targetId = args.layerId || editor.getSelectedId?.();
  if (targetId) {
    const target = nodes.find((n) => n.id === targetId);
    if (!target) {
      throw Object.assign(new Error(TOOL_ERROR.NODE_NOT_FOUND), { code: TOOL_ERROR.NODE_NOT_FOUND });
    }
    const children = nodes.filter((n) => n.parentId === targetId).map(sanitizeNode);
    return {
      root: sanitizeNode(target),
      children,
      totalCount: nodes.length,
    };
  }

  // If no targetId, return top-level layers
  const topLevel = nodes.filter((n) => !n.parentId).map(sanitizeNode);
  return {
    layers: topLevel,
    totalCount: nodes.length,
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

const EXECUTORS = Object.freeze({
  generate_image: generateImage,
  describe_selection: describeSelection,
  inspect_layer_tree: inspectLayerTree,
  mutate_layer_layout: mutateLayerLayout,
  mutate_layer_style: mutateLayerStyle,
  mutate_layer_text: mutateLayerText,
  mutate_auto_layout: mutateAutoLayout,
  batch_mutate_layers: batchMutateLayers,
});

/** Runs a canvas tool by name; an unknown name is an error, not a silent no-op. */
export async function executeCanvasTool(name, args) {
  const executor = EXECUTORS[name];
  if (!executor) throw new Error(`unknown tool: ${name}`);
  return executor(args);
}
