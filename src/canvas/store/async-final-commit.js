import { commitWorkflowHistory } from "../undo-action-contracts.js";

/**
 * Creates the single history boundary shared by async workflow generators.
 * Call commit only after a result is ready to land. Repeated successful node
 * completions within one workflow run still represent one user action.
 */
export function createAsyncFinalCommit(get, actionId) {
  let committed = false;
  const initialWorkflowId =
    typeof get === "function" ? get()?.workflowId : get?.workflowId;

  return {
    commit(options = {}) {
      if (committed) return false;
      const currentWorkflowId =
        typeof get === "function" ? get()?.workflowId : get?.workflowId;
      if (
        initialWorkflowId &&
        currentWorkflowId &&
        initialWorkflowId !== currentWorkflowId
      ) {
        // Document switched during async execution: do not commit history into the newly active document
        return false;
      }

      commitWorkflowHistory(get, actionId, {
        workflowId: initialWorkflowId,
        ...options,
      });
      committed = true;
      return true;
    },
  };
}
