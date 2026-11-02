import { commitEditorAction } from "../undo-action-contracts.js";
import { TOOL } from "./editor_constants.js";
import { rollbackDrawingGesture, selectDrawingDraft } from "./drawing-gesture-transaction.js";

/** Pointer placement and the DOM overlay share one commit/cancel boundary. */
export function finishTextPlacement(api, finished) {
  api.setTextDraftRect?.(null);
  selectDrawingDraft(api, finished.id);
  api.setTool(TOOL.SELECT);
  api.beginTextEdit(finished.id, {
    commitPlacement: () => commitEditorAction("editor.pointer.draw", () => api.commit()),
    cancelPlacement: finished.drawingRollback ? () => rollbackDrawingGesture(api, finished) : null,
  });
}
