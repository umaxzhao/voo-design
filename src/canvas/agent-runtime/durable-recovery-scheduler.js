export const DURABLE_RECOVERY_NOTICE_MS = 1000;

function afterVisibleRecoveryNotice(callback) {
  const requestFrame = globalThis.requestAnimationFrame;
  if (typeof requestFrame !== "function") {
    globalThis.setTimeout(callback, DURABLE_RECOVERY_NOTICE_MS);
    return;
  }
  // Starting the notice timer after two paints guarantees the restored state
  // reached the screen. Hidden tabs pause here instead of recovering unseen.
  requestFrame(() => {
    requestFrame(() => {
      globalThis.setTimeout(callback, DURABLE_RECOVERY_NOTICE_MS);
    });
  });
}

/**
 * Keeps the recovery projection visible long enough to be noticed before safe
 * automatic work starts. The workflow guard prevents a delayed callback from
 * crossing documents.
 */
export function scheduleAutomaticWorkflowRecovery({ get, set, workflowId }) {
  afterVisibleRecoveryNotice(() => {
    if (get().workflowId !== workflowId) return;
    void get()
      .autoResumeDurableExecution()
      .catch((error) => {
        if (get().workflowId !== workflowId) return;
        set({ durableExecutionError: error?.message ?? String(error) });
      });
  });
}
