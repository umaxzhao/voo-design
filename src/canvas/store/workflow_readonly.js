/**
 * Pure read-only barrier check for workflow actions.
 *
 * Keeps the read-only contract isolated from workflow_history_actions so
 * mock.module in isolated unit tests does not inadvertently strip this helper.
 */
export function isWorkflowReadOnly(state) {
  if (!state) return false;
  if (state.readOnly) return true;
  if (state.collabReadOnly) return true;
  if (typeof state.collabSession?.getSnapshot === "function") {
    if (state.collabSession.getSnapshot().readOnly) return true;
  }
  return false;
}
