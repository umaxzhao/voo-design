const queues = new WeakMap();

/**
 * A canvas's progress and completion saves share one revision stream.
 * Concurrent CAS writes from the same store used to treat their own older
 * progress snapshot as a remote edit and overwrite just-generated results.
 */
export function enqueueDocumentSave(get, write) {
  const workflowId = get().workflowId;
  const previous = queues.get(get) ?? Promise.resolve();
  const next = previous.then(async () => {
    if (get().workflowId !== workflowId) return;
    try {
      await write(get, workflowId);
    } catch (error) {
      // Save failure must remain visible and cannot poison the next request.
      console.warn("Workflow save failed", error);
      if (get().workflowId === workflowId) get().setSaveError(true);
    }
  });
  queues.set(get, next);
  void next.then(() => {
    if (queues.get(get) === next) queues.delete(get);
  });
  return next;
}
