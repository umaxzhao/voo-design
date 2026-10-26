/** Claim before sending so store notifications and effect remounts cannot resend. */
export function consumePendingAgentIntent(store, send) {
  const state = store.getState();
  const pending = state.pendingAgentIntent;
  if (!pending?.prompt?.trim()) return false;
  state.clearPendingAgentIntent();
  send(pending.prompt, pending.node);
  return true;
}

/**
 * Claims the welcome-screen generation handoff exactly once. The dashboard
 * writes one `pendingGeneration` object; the agent panel takes it on mount (or
 * on the next store notification) and sends it as a full generation turn.
 */
export function consumePendingGeneration(store, send) {
  const state = store.getState();
  const pending = state.pendingGeneration;
  if (!pending?.prompt?.trim()) return false;
  state.clearPendingGeneration();
  send(pending);
  return true;
}
