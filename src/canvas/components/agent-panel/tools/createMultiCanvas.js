/**
 * Tool: create_multi_canvas — create a set of Design (imageAsset) pages for a
 * multi-canvas artifact (deck, storyboard, series) and group them with an
 * auto-flowing layout.
 *
 * Creates `count` Design nodes, configures each with the brief/skill/style,
 * groups them into one group laid out in an auto-flowing grid (default 6 per
 * row), and opens them together in the design editor as multiple canvases.
 * Each page is then generated (generate_layout) one at a time.
 */

import {
  createToolFromDescriptor,
  getWorkflowToolDefinition,
} from "./tool_descriptor.js";
import { NODE_TYPE } from "../../../nodes/node_enums.js";
import { createToolError, TOOL_ERROR_CODE } from "./errors.js";
import { buildStyleAnchor, applyStyleAnchorToPrompt } from "../style-seed.js";
import { resolveDesignSystem } from "../../../design_systems.js";
import { inferUiLayout } from "../../../layout_intent.js";
import { layoutCanvasSize } from "../../../layout_geometry.js";
import {
  adoptIntoAgentGroup,
  resolveAgentOutputGroup,
} from "./agent-output-group.js";

const def = getWorkflowToolDefinition("create_multi_canvas");

export default createToolFromDescriptor(def, {
  async execute(args, context) {
    // Resolve the dependency before capturing a workspace snapshot.
    const { layoutSkill } = await import("../../../layout_skills_data.js");
    const store = context.getStore();
    const designSystemChoice =
      store.agentDesignSystem && store.agentDesignSystem !== "auto"
        ? store.agentDesignSystem
        : (args.designSystem ?? "auto");
    let designSystem;
    try {
      designSystem = resolveDesignSystem(designSystemChoice, {
        prompt: args.prompt,
      });
    } catch (error) {
      throw createToolError(TOOL_ERROR_CODE.ARGS_INVALID, error.message);
    }
    const count = Math.max(1, Math.min(24, Number(args.count) || 1));
    if (count < 1) {
      throw createToolError(
        TOOL_ERROR_CODE.ARGS_INVALID,
        "count must be at least 1.",
        {
          missing: { args: ["count"] },
          suggestion: {
            tool: null,
            args: {},
            note: "Provide a count between 1 and 24.",
          },
        },
      );
    }

    const brief =
      args.projectBrief ||
      context?.projectBrief ||
      context?.brief ||
      (typeof context?.getBrief === "function" ? context.getBrief() : null) ||
      (typeof context?.getCanvasState === "function"
        ? context.getCanvasState()?.projectBrief
        : null) ||
      store?.projectBrief ||
      null;

    const firstItemPrompt =
      Array.isArray(args.prompts) && args.prompts.length > 0
        ? args.prompts[0]
        : args.prompt;
    const inferred = inferUiLayout(
      `${args.prompt ?? ""} ${firstItemPrompt ?? ""}`,
    );
    const skill =
      args.skill === "ppt" ? "deck" : args.skill || inferred?.skill || "poster";
    const media = args.media || inferred?.media || layoutSkill(skill).media;

    const styleAnchor = args.consistent
      ? await buildStyleAnchor({
          prompt: firstItemPrompt,
          brief,
          style: args.style,
          extractor: args.styleExtractor || context?.styleExtractor,
        })
      : null;

    const nodeIds = [];
    let placementAnchor = null;
    let anchorWidth = 300;

    for (let i = 0; i < count; i += 1) {
      // Park pages side by side initially; group-layout re-arranges them.
      const x = placementAnchor ? placementAnchor.x + anchorWidth + 80 : 160;
      const y = 160;
      const nodeId = store.addNode(NODE_TYPE.IMAGE_EDITOR, { x, y });

      const itemPrompt =
        Array.isArray(args.prompts) && args.prompts[i]
          ? args.prompts[i]
          : args.prompt;
      const basePrompt = `${i + 1}. ${itemPrompt}`;

      const aiPrompt =
        args.consistent && styleAnchor && i > 0
          ? applyStyleAnchorToPrompt(basePrompt, styleAnchor, i + 1, 1)
          : basePrompt;

      const patch = {
        aiPrompt,
        layoutSkill: skill,
        layoutMedia: media,
        layoutDesignSystem: designSystemChoice,
        layoutResolvedDesignSystem: designSystem.id,
      };
      if (args.style) patch.layoutStyle = args.style;
      if (styleAnchor) patch.styleAnchor = styleAnchor;
      store.updateNodeData(nodeId, patch);
      nodeIds.push(nodeId);
      placementAnchor = { x, y };
    }

    // Group + auto-layout the pages.
    const outputGroupId = resolveAgentOutputGroup(store, context.agentNodeId);
    const adoptedIntoGroup = outputGroupId
      ? adoptIntoAgentGroup(store, context.agentNodeId, nodeIds)
      : [];
    let groupId = outputGroupId;
    if (
      !outputGroupId &&
      (skill === "deck" || args.autoGroup !== false) &&
      typeof store.groupNodesAsLayout === "function"
    ) {
      groupId = store.groupNodesAsLayout(nodeIds, { cols: args.cols || 6 });
    }

    if (skill === "deck" && groupId && store.createPresentation) {
      store.createPresentation(nodeIds, {
        ownerId: groupId,
        ...layoutCanvasSize({ layoutMedia: media }),
      });
    }

    // Open them together in the design editor as multiple canvases.
    if (typeof store.openMultiImageEditor === "function") {
      store.openMultiImageEditor(nodeIds, { groupId });
    }

    return {
      groupId,
      nodeIds: [...nodeIds],
      count: nodeIds.length,
      pageIds: nodeIds,
      ...(adoptedIntoGroup.length > 0 ? { adoptedIntoGroup } : {}),
      ...(skill === "deck" && groupId ? { presentationId: groupId } : {}),
      ...(styleAnchor ? { styleAnchor, anchor: styleAnchor } : {}),
    };
  },

  presentCall(args) {
    return {
      title: `Create ${args.count || "?"}-page multi-canvas`,
      icon: "layout-grid",
    };
  },

  presentResult(_args, result) {
    return {
      title: `${result.count} page(s) created${result.groupId ? ", grouped" : ""}`,
      status: "completed",
    };
  },
});
