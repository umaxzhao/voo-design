/**
 * Tool: look_at_canvas — see the page as it currently stands.
 *
 * The loop already slips a thumbnail in after every pixel edit; this is the
 * deliberate look — "did that work", "what is on this page" — that the model
 * can take at any point, including before it decides what to do.
 */

import { TOOL_APPROVAL_LEVEL } from "../eventTypes.js";
import { createToolError, TOOL_ERROR_CODE } from "./errors.js";
import { createEditorRecoverySuggestion } from "./editor-recovery-suggestion.js";
import { PROVIDER_ID, visionModelFor } from "../../../../shared/providers.js";
import { describeImage } from "../visionLocate.js";

const DEFAULT_QUESTION =
  "Describe what is on this page: the subject, the layout, and anything that looks broken or unfinished.";

export default {
  spec: {
    name: "look_at_canvas",
    description:
      "Look at the open editor's page as it currently renders and answer a question about it. Use it to check your own work after an edit ('did the fill leave a visible seam?'), to judge a generated layout before handing it over, or to see what is on a page you did not create. You cannot see the canvas any other way.",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description:
            "What you want to know about the picture. Defaults to a general description.",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },

  // Reading pixels changes nothing, but it does send them to a model.
  approvalLevel: TOOL_APPROVAL_LEVEL.EXTERNAL_API,

  async execute(args, context) {
    const store = context.getStore();
    if (typeof store.runEditorCommand !== "function") {
      throw createToolError(
        TOOL_ERROR_CODE.EDITOR_NOT_OPEN,
        "The image editor is not open — there is no page to look at.",
        {
          missing: { editor: ["open"] },
          suggestion: createEditorRecoverySuggestion(),
        },
      );
    }

    const llm = context.llm ?? {};
    const model = visionModelFor(llm.providerId, llm.model);
    if (!model || !llm.apiKey) {
      // The note is user-directed copy the model relays, so it must name the
      // route the user will actually find in settings: on VOO credits the
      // upstream name is not a row, while an own-key user does need the
      // vendor's model name to pick.
      const onVooCredits = llm.providerId === PROVIDER_ID.CREDITS;
      throw createToolError(
        TOOL_ERROR_CODE.VISION_NOT_AVAILABLE,
        "No model that can see images is configured, so the canvas cannot be looked at.",
        {
          missing: { provider: ["vision"] },
          suggestion: {
            tool: "get_editor_context",
            args: {},
            note: onVooCredits
              ? "Read the layer structure instead, or ask the user to pick a vision model on VOO Cloud in settings."
              : "Read the layer structure instead, or ask the user to pick a vision model (DeepSeek V4 Flash Vision) in settings.",
          },
        },
      );
    }

    const exported = await store.runEditorCommand({
      tool: "export_canvas_png",
      args: { maxEdge: 768 },
    });

    const observation = await describeImage({
      question: String(args?.question ?? "").trim() || DEFAULT_QUESTION,
      dataUrl: exported.dataUrl,
      apiKey: llm.apiKey,
      model,
      baseUrl: llm.baseUrl,
      signal: context.signal,
    });

    return { observation, page: exported.page, model };
  },

  presentCall(args) {
    const question = String(args?.question ?? "").trim();
    return {
      title: question ? `Look: ${question.slice(0, 44)}` : "Look at the canvas",
      icon: "eye",
    };
  },

  presentResult(_args, result) {
    return {
      title: result?.observation?.slice(0, 60) || "Looked at the canvas",
    };
  },
};
