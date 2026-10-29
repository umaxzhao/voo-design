/** Public compatibility entry point for component tools. */
import { VARIABLE_TYPES } from "../editor/scene_variables.js";
import { setInstanceOverride, resetInstanceOverrides, swapInstance } from "./canvas_tools_component_instances.js";
import { createComponentVariant, createComponentVariantsBatch, listComponentVariants, createComponentVariantMatrix, listInstanceVariantProperties, setInstanceVariant } from "./canvas_tools_component_variants.js";
import { createVariableCollection, addVariableMode, createVariable, setVariableValueTool, setActiveMode } from "./canvas_tools_component_variables.js";
export { duplicateComponentMaster } from "../editor/component_variants.js";

export const COMPONENT_TOOL_SCHEMAS = Object.freeze([
  {
    type: "function",
    function: {
      name: "set_instance_override",
      description:
        "Override part of a component instance. With childId, patch overrides a component layer " +
        "(text: string, fill: hex colour, visible: boolean); a null value removes that override. " +
        "Without childId, patch adjusts the instance's own record (layoutMode, playbackMode, " +
        "playbackStart, cameraId, poster); null clears cameraId/poster.",
      parameters: {
        type: "object",
        properties: {
          instanceId: { type: "string" },
          childId: {
            type: "string",
            description: "Optional layer id inside the component.",
          },
          patch: {
            type: "object",
            description:
              "With childId: { text?, fill?, visible? }. Without childId: { layoutMode?, " +
              "playbackMode?, playbackStart?, cameraId?, poster? }.",
            properties: {
              text: { type: "string", description: "Text override; null removes it." },
              fill: { type: "string", description: "Hex colour override; null removes it." },
              visible: { type: "boolean", description: "Visibility override; null removes it." },
              layoutMode: { type: "string" },
              playbackMode: { type: "string" },
              playbackStart: { type: "number" },
              cameraId: { type: "string", description: "Camera id; null clears it." },
              poster: { type: "string", description: "Poster URL; null clears it." },
            },
          },
        },
        required: ["instanceId", "patch"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reset_instance_overrides",
      description: "Clear every layer override of a component instance.",
      parameters: {
        type: "object",
        properties: { instanceId: { type: "string" } },
        required: ["instanceId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "swap_instance",
      description:
        "Point an existing component instance at a different main component. Keeps its box, " +
        "resets layer overrides.",
      parameters: {
        type: "object",
        properties: {
          instanceId: { type: "string" },
          componentId: { type: "string" },
        },
        required: ["instanceId", "componentId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_component_variant",
      description:
        "Duplicate a main component as another variant in the same variant group. The first " +
        "variant is named Default when the source has no variant name yet.",
      parameters: {
        type: "object",
        properties: {
          sourceComponentId: { type: "string", description: "Main component to duplicate." },
          variantName: { type: "string", description: "Name of the new variant, for example Dark." },
          name: { type: "string", description: "Optional display name for the new component." },
        },
        required: ["sourceComponentId", "variantName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_component_variants_batch",
      description: "Create multiple sibling component variants from property sets in one document transaction. Each result reports created or error.",
      parameters: {
        type: "object",
        properties: {
          sourceComponentId: { type: "string", description: "Main component to duplicate." },
          variants: {
            type: "array",
            description: "Variant property maps, for example [{ State: 'Default' }, { State: 'Hover' }].",
            items: { type: "object", additionalProperties: { type: "string" } },
          },
        },
        required: ["sourceComponentId", "variants"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_component_variants",
      description:
        "List the variants that share a component's variant group. Give componentId or " +
        "variantGroupId.",
      parameters: {
        type: "object",
        properties: {
          componentId: { type: "string", description: "Any component in the group." },
          variantGroupId: { type: "string", description: "Variant group id." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_component_variant_matrix",
      description: "Create the Cartesian product of variant axes on a component master, persisting all documents in the active canvas document.",
      parameters: {
        type: "object",
        properties: {
          sourceComponentId: { type: "string" },
          axes: { type: "object", description: "Axis names mapped to arrays of values, for example { State: [Default, Hover], Size: [M, L] }.", additionalProperties: { type: "array", items: { type: "string" } } },
        },
        required: ["sourceComponentId", "axes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_instance_variant_properties",
      description: "List the current property values and available axis values for a component instance.",
      parameters: { type: "object", properties: { instanceId: { type: "string" } }, required: ["instanceId"] },
    },
  },
  {
    type: "function",
    function: {
      name: "set_instance_variant",
      description:
        "Swap a component instance to a named variant or property map from the same group. Keeps the " +
        "instance's box and resets layer overrides (same behaviour as swap_instance).",
      parameters: {
        type: "object",
        properties: {
          instanceId: { type: "string" },
          variantName: { type: "string" },
          properties: { type: "object", description: "Variant property map, for example { State: Hover }.", additionalProperties: { type: "string" } },
        },
        required: ["instanceId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_variable_collection",
      description:
        "Create a variable collection with an optional list of extra modes. A Default mode is " +
        "always created first.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Collection name." },
          modes: {
            type: "array",
            description: "Optional additional modes: mode name strings or { id?, name? } objects.",
            items: {
              anyOf: [
                { type: "string" },
                {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                  },
                },
              ],
            },
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_variable_mode",
      description:
        "Add a mode to a variable collection; every variable's value is copied from the default " +
        "mode. Returns modeId and modeName.",
      parameters: {
        type: "object",
        properties: {
          collectionId: { type: "string", description: "Target collection id." },
          name: { type: "string", description: "New mode name." },
        },
        required: ["collectionId", "name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_variable",
      description:
        "Create a typed variable (color, number, string, boolean) in a collection. " +
        "valuesByMode maps mode ids to values; missing modes fall back to the default mode's value.",
      parameters: {
        type: "object",
        properties: {
          collectionId: { type: "string" },
          type: { type: "string", enum: [...VARIABLE_TYPES], description: "Variable type: one of color, number, string, boolean (VARIABLE_TYPES)." },
          name: { type: "string" },
          value: {
            description:
              "Optional initial value for every mode; valuesByMode overrides individual modes.",
          },
          valuesByMode: {
            type: "object",
            description:
              "Optional { [modeId]: value } map. Missing modes inherit the default mode's value.",
          },
        },
        required: ["collectionId", "type", "name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_variable_value",
      description: "Set a variable's value for one mode (default mode when modeId is omitted).",
      parameters: {
        type: "object",
        properties: {
          variableId: { type: "string" },
          modeId: { type: "string" },
          value: {},
        },
        required: ["variableId", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_active_mode",
      description:
        "Switch a collection's active mode and re-resolve bound properties. Give exactly one of " +
        "collectionId or layerId (layerId switches the collection its bound variable belongs to). " +
        "modeId must be one of that collection's modes.",
      parameters: {
        type: "object",
        properties: {
          layerId: { type: "string", description: "Layer bound to a variable in the target collection." },
          collectionId: { type: "string", description: "Target collection id." },
          modeId: { type: "string", description: "Mode to activate." },
        },
        required: ["modeId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_frame_slot",
      description:
        "Mark a frame or container as a design system component slot with recommended component names (or clear it with null).",
      parameters: {
        type: "object",
        properties: {
          frameId: { type: "string", description: "Target frame or container ID." },
          slot: {
            type: "array",
            items: { type: "string" },
            description: "List of recommended component names, e.g. ['Button', 'IconButton'], or null to clear.",
          },
        },
        required: ["frameId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_frame_slot",
      description: "Get the declared component slot recommendations for a frame.",
      parameters: {
        type: "object",
        properties: {
          frameId: { type: "string", description: "Target frame ID." },
        },
        required: ["frameId"],
      },
    },
  },
]);

export function setFrameSlot(args = {}, context = {}) {
  context.signal?.throwIfAborted();
  const editor = context.editor ?? (typeof window !== "undefined" ? window.__vooEditor : null);
  if (!editor) throw new Error("agentNoEditor");
  const frameId = String(args.frameId ?? "").trim();
  if (!frameId) throw new Error("frameId is required");

  const doc = editor.getDocument?.() ?? editor.getDoc?.() ?? null;
  const node = doc?.nodes?.find?.((n) => n.id === frameId);
  if (!node) throw new Error(`Node not found: ${frameId}`);

  let slot = null;
  if (Array.isArray(args.slot)) {
    slot = args.slot.map(String).filter((s) => s.trim().length > 0);
  } else if (typeof args.slot === "string" && args.slot.trim()) {
    slot = [args.slot.trim()];
  }

  editor.updateNode?.(frameId, { slot: slot && slot.length > 0 ? slot : null });
  editor.commitEditorDocument?.({ message: "AI: Configure component slot" });
  return { ok: true, frameId, slot: slot && slot.length > 0 ? slot : null };
}

export function getFrameSlot(args = {}, context = {}) {
  context.signal?.throwIfAborted();
  const editor = context.editor ?? (typeof window !== "undefined" ? window.__vooEditor : null);
  if (!editor) throw new Error("agentNoEditor");
  const frameId = String(args.frameId ?? "").trim();
  if (!frameId) throw new Error("frameId is required");

  const doc = editor.getDocument?.() ?? editor.getDoc?.() ?? null;
  const node = doc?.nodes?.find?.((n) => n.id === frameId);
  if (!node) throw new Error(`Node not found: ${frameId}`);

  return { ok: true, frameId, slot: node.slot ?? null };
}

export const COMPONENT_TOOL_EXECUTORS = Object.freeze({
  set_instance_override: setInstanceOverride,
  reset_instance_overrides: resetInstanceOverrides,
  swap_instance: swapInstance,
  create_component_variant: createComponentVariant,
  create_component_variants_batch: createComponentVariantsBatch,
  list_component_variants: listComponentVariants,
  create_component_variant_matrix: createComponentVariantMatrix,
  list_instance_variant_properties: listInstanceVariantProperties,
  set_instance_variant: setInstanceVariant,
  create_variable_collection: createVariableCollection,
  add_variable_mode: addVariableMode,
  create_variable: createVariable,
  set_variable_value: setVariableValueTool,
  set_active_mode: setActiveMode,
  set_frame_slot: setFrameSlot,
  get_frame_slot: getFrameSlot,
});
