/** Claim before sending so store notifications and effect remounts cannot resend. */
export function consumePendingAgentIntent(store, send) {
  const state = store.getState();
  const pending = state.pendingAgentIntent;
  if (!pending?.prompt?.trim()) return false;
  state.clearPendingAgentIntent();
  send(pending.prompt, pending.node);
  return true;
}
