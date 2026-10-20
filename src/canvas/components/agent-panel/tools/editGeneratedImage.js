/**
 * Tool: edit_generated_image — send a generated image into the design editor.
 *
 * Bridges the generation pipeline and the image editor: takes a generated
 * image from a generate node's results and makes it editable.
 *
 * Where it lands depends on whether a document is already open, and that is the
 * whole point of the split:
 *   - Document open: the picture joins THAT document as a new layer. It must
 *     not mint a second imageAsset node and open it, which would replace the
 *     document the user is working in with a different one.
 *   - No editor open: nothing is being edited, so the long-standing behaviour
 *     stands — create (or reuse) an imageAsset node carrying the picture and
 *     open it.
 *
 * A generation started *while* the design editor is open no longer needs this
 * tool at all: generate_image wires itself into the open node and the result
 * arrives as a layer on its own. This tool is now the explicit route for a
 * picture that already exists.
 */

import {
  createToolFromDescriptor,
  getWorkflowToolDefinition,
} from "./tool_descriptor.js";
import { NODE_TYPE } from "../../../nodes/node_enums.js";
import { createToolError, TOOL_ERROR_CODE } from "./errors.js";
import { MEDIA_KIND, placeGenerationInOpenEditor } from "./editor-place.js";
import { t } from "../../../../shared/i18n.js";

const def = getWorkflowToolDefinition("edit_generated_image");

export default createToolFromDescriptor(def, {
  async execute(args, context) {
    const store = context.getStore();

    const source = (store.nodes || []).find((n) => n.id === args.sourceNodeId);
    if (!source) {
      throw createToolError(
        TOOL_ERROR_CODE.NODE_NOT_FOUND,
        `Source node not found: ${args.sourceNodeId}`,
        {
          missing: { nodes: [args.sourceNodeId] },
          suggestion: {
            tool: "list_nodes",
            args: {},
            note: "Call list_nodes to get valid node ids, then retry.",
          },
        },
      );
    }

    // The design editor decodes its asset as a bitmap, so a video result would
    // land as an unreadable picture instead of failing loudly. Video results
    // are previewed and downloaded on their own node.
    const VIDEO_NODE_TYPES = [
      NODE_TYPE.VIDEO,
      NODE_TYPE.API_VIDEO,
      NODE_TYPE.COMBINE_VIDEO,
    ];
    if (VIDEO_NODE_TYPES.includes(source.type)) {
      throw createToolError(
        TOOL_ERROR_CODE.ARGS_INVALID,
        `Node ${args.sourceNodeId} is a "${source.type}" node — its results are videos, and the design editor edits pictures.`,
        {
          missing: { nodeData: ["imageResults"] },
          suggestion: {
            tool: null,
            args: {},
            note: "Video results are previewed on their node; there is no video editor. To edit a picture, pass an image-producing node instead.",
          },
        },
      );
    }

    const results = source.data?.results;
    if (!Array.isArray(results) || results.length === 0) {
      throw createToolError(
        TOOL_ERROR_CODE.NODE_NO_RESULTS,
        "Source node has no generated images yet. Run the workflow first (run_workflow).",
        {
          missing: { nodeData: ["results"] },
          suggestion: {
            tool: "run_workflow",
            args: {},
            note: "Run the workflow first (run_workflow) so the node has results, then retry.",
          },
        },
      );
    }

    const imageId = args.imageId || results[0];
    if (!store.images?.[imageId]) {
      throw createToolError(
        TOOL_ERROR_CODE.ASSET_MISSING,
        `Generated image ${imageId} is not available.`,
        {
          missing: { store: ["images[imageId]"] },
          suggestion: {
            tool: null,
            args: {},
            note: "Regenerate the image (run_workflow), then retry.",
          },
        },
      );
    }

    // A document is already open: the picture belongs in it, as a layer. The
    // open node is wired to the source and the store's ingestion path appends
    // the result to its `editorDoc`, which the open editor folds in. No second
    // node is created and no other document is opened.
    const placement = placeGenerationInOpenEditor(
      store,
      args.sourceNodeId,
      MEDIA_KIND.IMAGE,
    );
    if (placement.placed) {
      const receiver = (store.nodes || []).find(
        (node) => node.id === placement.receiverNodeId,
      );
      const alreadyInDocument = (
        receiver?.data?.editorDoc?.nodes ?? []
      ).some((layer) => layer.imageId === imageId);
      store.appendResultsToGalleries(args.sourceNodeId, [imageId]);
      return {
        nodeId: placement.receiverNodeId,
        imageId,
        editorOpened: true,
        layerAdded: !alreadyInDocument,
      };
    }

    // No editor open (or one that edits something else): create (or reuse) an
    // imageAsset editor node carrying this picture and open it.
    const nodeId = store.addImageNodeFromAsset(args.sourceNodeId, imageId);

    // Open the design editor so the image is available as layers.
    const open = args.open !== false;
    if (open && typeof store.openImageEditor === "function") {
      store.openImageEditor(nodeId);
    }

    return { nodeId, imageId, editorOpened: open };
  },

  presentCall(args) {
    return {
      title: t("agent.tool.editGeneratedImage.call", {
        id: args.sourceNodeId.slice(0, 8),
      }),
      icon: "layers",
    };
  },

  presentResult(_args, result) {
    if (result.layerAdded === false) {
      return {
        title: t("agent.tool.editGeneratedImage.layerPresent"),
        status: "completed",
      };
    }
    if (result.layerAdded === true) {
      return {
        title: t("agent.tool.editGeneratedImage.layerAdded"),
        status: "completed",
      };
    }
    return {
      title: t(
        result.editorOpened
          ? "agent.tool.editGeneratedImage.opened"
          : "agent.tool.editGeneratedImage.sent",
      ),
      status: "completed",
    };
  },
});
