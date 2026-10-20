/**
 * Tool: generate_layout — generate an HTML layout in the design editor.
 *
 * The "layout" channel of a skill: creates (or reuses) an imageAsset editor
 * node, configures its layout skill/media/style/direction, and triggers VOO's
 * layout generator, which streams an HTML layout into the design editor as
 * editable layers. This is the design-editor path — distinct from generate_image
 * (which renders a bitmap via an image API).
 */

import {
  createToolFromDescriptor,
  getWorkflowToolDefinition,
} from "./tool_descriptor.js";
import { NODE_TYPE } from "../../../nodes/node_enums.js";
import { createToolError, TOOL_ERROR_CODE } from "./errors.js";
import { getExistingIdempotentRecord } from "../idempotentRetry.js";
import { layoutMedia } from "../../../layout-media-presets.js";
import { resolveDesignSystem } from "../../../design_systems.js";
import { inferUiLayout } from "../../../layout_intent.js";
import { adoptIntoAgentGroup } from "./agent-output-group.js";
import { readCapturedEditorTarget } from "../editor-request-intent.js";

const def = getWorkflowToolDefinition("generate_layout");

function capturedReferenceNodeId(context) {
  const objective = context.runStore?.getRun?.(context.runId)?.objective;
  const marker =
    typeof objective === "string"
      ? objective.match(/^\[Design reference node: ([^\]\n]+)\]$/m)
      : null;
  return marker?.[1] ?? null;
}

/** Resolve the immutable Design target captured when the user sent the turn. */
function editorTurnTarget(context) {
  const objective = context.runStore?.getRun?.(context.runId)?.objective;
  try {
    return readCapturedEditorTarget(objective)?.nodeId ?? null;
  } catch {
    throw createToolError(
      TOOL_ERROR_CODE.ARGS_INVALID,
      "The captured Design Editor target is invalid.",
    );
  }
}

export default createToolFromDescriptor(def, {
  async execute(args, context) {
    if (typeof args.prompt !== "string" || !args.prompt.trim()) {
      throw createToolError(
        TOOL_ERROR_CODE.EMPTY_PROMPT,
        "Layout generation could not start without a prompt.",
        { missing: { args: ["prompt"] } },
      );
    }
    if ((args.width == null) !== (args.height == null)) {
      throw createToolError(
        TOOL_ERROR_CODE.ARGS_INVALID,
        "Canvas width and height must be provided together.",
        { missing: { args: [args.width == null ? "width" : "height"] } },
      );
    }
    // Load before reading the current workspace or allocating any nodes.
    const { layoutSkill } = await import("../../../layout_skills_data.js");
    const store = context.getStore();
    const position = args.position || { x: 300, y: 300 };
    const idempotentNodeId = getExistingIdempotentRecord(context)?.nodeId;
    const editorTargetNodeId = editorTurnTarget(context);
    const referenceNodeId =
      capturedReferenceNodeId(context) ?? args.referenceNodeId ?? null;
    if (
      referenceNodeId &&
      !store.nodes?.some((item) => item.id === referenceNodeId)
    ) {
      throw createToolError(
        TOOL_ERROR_CODE.NODE_NOT_FOUND,
        "Reference design not found.",
      );
    }
    if (
      editorTargetNodeId &&
      args.nodeId &&
      args.nodeId !== editorTargetNodeId
    ) {
      throw createToolError(
        TOOL_ERROR_CODE.ARGS_INVALID,
        "This Design Editor request belongs to a different document.",
      );
    }
    const reusableNodeId =
      args.nodeId ||
      editorTargetNodeId ||
      (store.nodes?.some((node) => node.id === idempotentNodeId)
        ? idempotentNodeId
        : null);
    const existingNode = store.nodes?.find(
      (node) => node.id === reusableNodeId,
    );
    if (reusableNodeId && !existingNode) {
      throw createToolError(
        TOOL_ERROR_CODE.NODE_NOT_FOUND,
        "Design node not found.",
      );
    }
    const preferredSystem = store.agentDesignSystem;
    const designSystemChoice =
      preferredSystem && preferredSystem !== "auto"
        ? preferredSystem
        : (args.designSystem ??
          existingNode?.data?.layoutDesignSystem ??
          "auto");
    let designSystem;
    try {
      designSystem = resolveDesignSystem(designSystemChoice, {
        prompt: args.prompt,
      });
    } catch (error) {
      throw createToolError(TOOL_ERROR_CODE.ARGS_INVALID, error.message, {
        details: { designSystem: designSystemChoice },
      });
    }
    const created = !reusableNodeId;
    const nodeId =
      reusableNodeId || store.addNode(NODE_TYPE.IMAGE_EDITOR, position);
    const adoptedIntoGroup = created
      ? adoptIntoAgentGroup(store, context.agentNodeId, [nodeId])
      : [];

    const inferred = inferUiLayout(args.prompt);
    const skill = args.skill || inferred?.skill || "poster";
    const media =
      args.media ||
      (skill === "ui" && inferred?.media === "mobile"
        ? "mobile"
        : layoutSkill(skill).media);
    const preset = layoutMedia(media);
    const patch = {
      aiPrompt: args.prompt,
      layoutSkill: skill,
      layoutMedia: media,
      layoutDesignSystem: designSystemChoice,
      layoutResolvedDesignSystem: designSystem.id,
      // An in-editor request should land its first editable draft promptly.
      // The user can still request a separate critique after seeing it.
      ...(editorTargetNodeId || referenceNodeId
        ? { layoutAutoImprove: false }
        : {}),
    };
    if (args.width && args.height) {
      patch.layoutWidth = args.width;
      patch.layoutHeight = args.height;
    } else if (created) {
      patch.layoutWidth = preset.width;
      patch.layoutHeight = preset.height;
    }
    if (args.style) patch.layoutStyle = args.style;
    if (args.direction) patch.layoutDirection = args.direction;
    if (args.layoutModel) patch.layoutModel = args.layoutModel;
    store.updateNodeData(nodeId, patch);

    // Trigger the layout generator: streams HTML into the design editor and
    // opens it (openImageEditor) — the layout resolves into editable layers.
    if (typeof store.generateLayout === "function") {
      const ok = await store.generateLayout(nodeId, { referenceNodeId });
      if (!ok) {
        // Async generation replaces store snapshots; read the completed node
        // rather than the snapshot captured before its error was recorded.
        const error = context
          .getStore()
          .nodes?.find((node) => node.id === nodeId)?.data?.error;
        throw createToolError(
          error?.code || TOOL_ERROR_CODE.GENERATOR_UNAVAILABLE,
          error?.message || "Layout generation did not create editable layers.",
          {
            details: { nodeId },
            suggestion: {
              tool: "generate_layout",
              args: {
                nodeId,
                prompt: args.prompt,
                skill: args.skill,
                media,
                designSystem: designSystemChoice,
              },
              note: "Check the node error and retry with a supported layout model.",
            },
          },
        );
      }
      return {
        nodeId,
        channel: "layout",
        skill,
        designSystem: designSystem.id,
        editorOpened: true,
        ...(adoptedIntoGroup.length > 0 ? { adoptedIntoGroup } : {}),
      };
    }

    throw createToolError(
      TOOL_ERROR_CODE.GENERATOR_UNAVAILABLE,
      "Layout generator is not available in this environment.",
      {
        missing: { store: ["generateLayout"] },
        suggestion: {
          tool: null,
          args: {},
          note: "Report the environment limitation to the user.",
        },
      },
    );
  },

  presentCall(args) {
    return {
      title: `Generate layout (${args.skill || "poster"})`,
      icon: "layout",
    };
  },

  presentResult(_args, _result) {
    return {
      title: `Layout generated in design editor`,
      status: "completed",
    };
  },
});
