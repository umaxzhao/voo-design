import { t } from "../../../../shared/i18n.js";
import { NODE_TYPE } from "../../../nodes/node_enums.js";
import { TOOL_APPROVAL_LEVEL } from "../eventTypes.js";
import { createToolError, TOOL_ERROR_CODE } from "./errors.js";

/** Change the visible workspace without ending the Agent or editor session. */
export default {
  spec: {
    name: "show_workspace",
    description:
      "Choose what the user sees while you work: workflow graph or Design editor. The Agent conversation and any running work continue. Use surface='editor' with a Design nodeId to inspect or edit its canvas; use surface='workflow' to show graph construction or execution. Switching to workflow keeps an open Design editor mounted with unsaved edits intact.",
    parameters: {
      type: "object",
      properties: {
        surface: { type: "string", enum: ["workflow", "editor"] },
        nodeId: {
          type: "string",
          description:
            "Design node to show. Required when opening an editor session; optional when one is already open.",
        },
      },
      required: ["surface"],
      additionalProperties: false,
    },
  },
  approvalLevel: TOOL_APPROVAL_LEVEL.READ_ONLY,
  capabilities: {
    mutates: false,
    externalData: false,
    estimatedCost: 0,
    idempotent: true,
    reversible: true,
    timeout: null,
  },
  async execute(args, context) {
    const store = context.getStore();
    if (args.surface === "workflow") {
      store.setEditorSurface("workflow");
      return {
        surface: "workflow",
        editorSessionPreserved: Boolean(store.editingNodeId),
      };
    }
    if (args.surface !== "editor") {
      throw createToolError(
        TOOL_ERROR_CODE.ARGS_INVALID,
        "Unknown workspace surface.",
      );
    }
    const nodeId = args.nodeId ?? store.editingNodeId;
    const node = store.nodes?.find((item) => item.id === nodeId);
    if (!node || node.type !== NODE_TYPE.IMAGE_EDITOR) {
      throw createToolError(
        TOOL_ERROR_CODE.NODE_NOT_FOUND,
        "A Design node is required to show the editor.",
      );
    }
    if (store.editingNodeId && !(store.editingNodeIds ?? []).includes(nodeId)) {
      throw createToolError(
        TOOL_ERROR_CODE.ARGS_INVALID,
        "Save or close the current Design editor session before opening another document.",
      );
    }
    if (!store.editingNodeId) {
      if (!store.openImageEditor(nodeId)) {
        throw createToolError(
          TOOL_ERROR_CODE.EDITOR_NOT_OPEN,
          "Design editor could not open.",
        );
      }
    } else {
      store.focusEditorPage?.(nodeId);
      store.setEditorSurface("editor");
    }
    return { surface: "editor", nodeId, editorSessionPreserved: true };
  },
  presentCall(args) {
    return {
      title: t(
        args.surface === "editor"
          ? "workspace.showDesign"
          : "workspace.showWorkflow",
      ),
      icon: "layout",
    };
  },
  presentResult(args) {
    return {
      title: t(
        args.surface === "editor"
          ? "workspace.showDesign"
          : "workspace.showWorkflow",
      ),
      status: "completed",
    };
  },
};
