export const UNDO_BOUNDARY = Object.freeze({
  ATOMIC: "atomic",
  GESTURE: "gesture",
  ASYNC_FINAL: "async-final",
});

/**
 * One cross-domain adapter registry: the workflow and the Design editor.
 */
export const UNDO_DOMAIN_ADAPTERS = Object.freeze({
  workflow: Object.freeze({
    enforcement: "enforced",
    actionBoundary: "commitWorkflowHistory(storeOrGet, actionId)",
    boundaryCalls: Object.freeze([
      "commitWorkflowHistory",
      "commitWorkflowGesture",
      "createAsyncFinalCommit",
    ]),
    roots: Object.freeze(["src/canvas/"]),
    indirectHistoryCalls: Object.freeze(["startRun"]),
    indirectHistoryInternalBoundaries: Object.freeze([
      "src/canvas/store/workflow_run_actions.js",
    ]),
    internalBoundaries: Object.freeze([
      "src/canvas/store/workflow_history_stack.js",
    ]),
    rawWriterPatterns: Object.freeze([
      "\\bpushHistory\\b",
      "\\b(?:undoStack|redoStack)\\s*:\\s*\\[\\s*\\.\\.\\.",
      "\\bset\\s*\\(\\s*\\{[^}]{0,300}?\\b(?:undoStack|redoStack)\\s*:",
      "\\.\\s*(?:undoStack|redoStack)\\s*=\\s*\\[",
    ]),
  }),
  editor: Object.freeze({
    enforcement: "enforced",
    actionBoundary: "commitEditorAction(actionId, reduce)",
    boundaryCalls: Object.freeze([
      "commitEditorAction",
      "commitEditorDocument",
      "commitOrPreviewEditorDocument",
    ]),
    roots: Object.freeze(["src/canvas/editor/"]),
    rawWriterPatterns: Object.freeze([
      "\\bsetDoc\\s*\\(",
      "\\bhistory\\.push\\s*\\(",
    ]),
  }),
});
