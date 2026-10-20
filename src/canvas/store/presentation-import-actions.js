import { NODE_TYPE } from "../nodes/types.js";
import { t } from "../../shared/i18n.js";
import { isWorkflowReadOnly } from "./workflow_readonly.js";

/** Import ownership spans both module loading and asynchronous file parsing. */
export function createPresentationImportActions(set, get) {
  return {
    async importPresentationPptx(
      bufferOrBlob,
      { position = { x: 0, y: 0 }, filename = "presentation.pptx" } = {},
    ) {
      const initial = get();
      if (isWorkflowReadOnly(initial)) return null;
      const { workflowId, workflowHistories } = initial;
      const requireCurrentSession = () => {
        const state = get();
        // A -> B -> A retains the workflow ID but replaces its history owner.
        if (
          state.workflowId !== workflowId ||
          state.workflowHistories !== workflowHistories ||
          isWorkflowReadOnly(state)
        ) {
          throw Object.assign(
            new Error(t("error.presentationImportSuperseded")),
            {
              code: "OPERATION_ABORTED",
            },
          );
        }
        return state;
      };
      const { parsePptxDeck } =
        await import("../presentation/presentation-conversion.js");
      requireCurrentSession();
      const deck = await parsePptxDeck(bufferOrBlob);
      const state = requireCurrentSession();
      if (!deck?.pages?.length) return null;
      const nodeId = `slides-${crypto.randomUUID()}`;
      const previewNode = {
        id: nodeId,
        type: NODE_TYPE.PREVIEW,
        position,
        data: {
          mediaType: "slides",
          title: filename,
          pages: deck.pages,
          layoutWidth: deck.width,
          layoutHeight: deck.height,
        },
      };
      set({
        nodes: [
          ...state.nodes.map((node) =>
            node.selected ? { ...node, selected: false } : node,
          ),
          { ...previewNode, selected: true },
        ],
      });
      return get().convertSlidesPreview(nodeId);
    },
  };
}
