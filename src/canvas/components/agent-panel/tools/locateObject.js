/**
 * Tool: locate_object — find a described object in the open editor's picture.
 *
 * The bridge hands over the layer's pixels, a vision model answers with a
 * normalised box, and only the box travels back into the conversation. That
 * split is deliberate: the agent loop can keep running a text-only model and
 * still act on what is actually in the picture.
 */

import { TOOL_APPROVAL_LEVEL } from "../eventTypes.js";
import { createToolError, TOOL_ERROR_CODE } from "./errors.js";
import { createEditorRecoverySuggestion } from "./editor-recovery-suggestion.js";
import { PROVIDER_ID, visionModelFor } from "../../../../shared/providers.js";
import { locateObjectInImage, toDocumentBox } from "../visionLocate.js";

export default {
  spec: {
    name: "locate_object",
    description:
      "Find a described object inside the open editor's image and return its bounding box in document pixels. Pass the box straight to select_object to turn it into a pixel-accurate selection. Use this whenever the user names an object ('the dog', 'the logo') instead of giving coordinates — it is the only way to learn where something is in the picture.",
    parameters: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description:
            "What to find, in the user's own words ('the red car', 'the person on the left').",
        },
        nodeId: {
          type: "string",
          description: "Image layer to look at (omit to use the selected one).",
        },
      },
      required: ["description"],
      additionalProperties: false,
    },
  },

  // Reading pixels changes nothing, but it does send them to a model.
  approvalLevel: TOOL_APPROVAL_LEVEL.EXTERNAL_API,

  async execute(args, context) {
    const description = String(args?.description ?? "").trim();
    if (!description) {
      throw createToolError(
        TOOL_ERROR_CODE.ARGS_INVALID,
        "locate_object needs a description of what to find.",
        { missing: { args: ["description"] } },
      );
    }

    const store = context.getStore();
    if (typeof store.runEditorCommand !== "function") {
      throw createToolError(
        TOOL_ERROR_CODE.EDITOR_NOT_OPEN,
        "The image editor is not open — open it before locating objects in it.",
        {
          missing: { editor: ["open"] },
          suggestion: createEditorRecoverySuggestion(),
        },
      );
    }

    const llm = context.llm ?? {};
    const model = visionModelFor(llm.providerId, llm.model);
    if (!model || !llm.apiKey) {
      // The model relays this note to the user, so it names the route that is
      // actually in the settings picker: VOO Cloud on a credits run, and the
      // vendor's own vision model when the user supplied the key.
      const onVooCredits = llm.providerId === PROVIDER_ID.CREDITS;
      throw createToolError(
        TOOL_ERROR_CODE.VISION_NOT_AVAILABLE,
        "No model that can see images is configured, so the object cannot be located from its description.",
        {
          missing: { provider: ["vision"] },
          suggestion: {
            tool: "select_region",
            args: {},
            note: onVooCredits
              ? "Ask the user for a rectangle in document pixels, or to pick a vision model on VOO Cloud in settings."
              : "Ask the user for a rectangle in document pixels, or to pick a vision model (DeepSeek V4 Flash Vision) in settings.",
          },
        },
      );
    }

    const exported = await store.runEditorCommand({
      tool: "export_node_png",
      args: { nodeId: args.nodeId, maxEdge: 1024 },
    });

    const answer = await locateObjectInImage({
      description,
      dataUrl: exported.dataUrl,
      apiKey: llm.apiKey,
      model,
      baseUrl: llm.baseUrl,
      signal: context.signal,
    });

    if (!answer.found) {
      // Not an error: "it is not in this picture" is a real answer, and the
      // model should relay it or ask, not retry the same call.
      return {
        found: false,
        nodeId: exported.nodeId,
        description,
        note: "The vision model did not find that object in this layer. Ask the user to describe it differently, or to select it by hand.",
      };
    }

    return {
      found: true,
      nodeId: exported.nodeId,
      label: answer.label || description,
      box: toDocumentBox(answer.box, exported.rect),
      normalized: answer.box,
      model,
    };
  },

  presentCall(args) {
    return {
      title: `Locate "${(args?.description ?? "").slice(0, 40)}"`,
      icon: "search",
    };
  },

  presentResult(_args, result) {
    if (!result?.found) return { title: "Locate object — not found" };
    const { width, height } = result.box;
    return { title: `Located ${result.label} — ${width}×${height}` };
  },
};
