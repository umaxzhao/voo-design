/**
 * Auto-review resolution for agent tool calls.
 *
 * Extracted from useAgentLoop (AO3c). React-free: change sets live in the
 * injected RunStore, rollback runs against the injected store snapshot.
 *
 * @module agent-runtime/agent-review-resolution
 */

import { rollbackChangeSet } from "../components/agent-panel/changesetReview.js";
import { EVENT_TYPE, REVIEW_STATUS } from "../components/agent-panel/eventTypes.js";
import {
  CHANGESET_STATUS,
  resolveChangeSetReview,
} from "./run-store.js";

/**
 * Resolve a pending auto-review for one tool call. Accept keeps the change
 * (ChangeSet → accepted); revert records the intent to roll back
 * (ChangeSet → reverted — executing the rollback needs undo-data, a later
 * phase). Returns false when no matching pending review exists.
 */
export function resolveAgentReview(
  toolCallId,
  accepted,
  options = {},
  { runStoreRef, getStore, bumpRuns, emit },
) {
  if (!runStoreRef.current) return false;

  // Search all persisted runs, not just the active one: a review card from
  // a previous run must remain resolvable after the user starts a new
  // message/run (reviewer finding F2).
  let match = null;
  for (const run of runStoreRef.current.listRuns()) {
    const cs = runStoreRef.current.findChangeSetByToolCall(
      run.id,
      toolCallId,
    );
    if (cs) {
      match = { runId: run.id, cs };
      break;
    }
  }
  if (!match || match.cs.status !== CHANGESET_STATUS.PENDING_REVIEW)
    return false;

  const store = getStore ? getStore() : null;
  let revertResult = null;

  if (!accepted) {
    // Full rollback
    revertResult = rollbackChangeSet(store, match.cs, options);
  } else if (options?.rejectedObjectIds?.length) {
    // Partial accept: revert only the rejected objects
    revertResult = rollbackChangeSet(store, match.cs, {
      ...options,
      objectIds: options.rejectedObjectIds,
    });
  }

  const totalAffectedCount = match.cs.undoData?.affectedObjects?.length || 0;
  const isFullRevert =
    !accepted ||
    (Boolean(options?.rejectedObjectIds?.length) &&
      totalAffectedCount > 0 &&
      options.rejectedObjectIds.length >= totalAffectedCount);

  const finalStatus = isFullRevert
    ? CHANGESET_STATUS.REVERTED
    : CHANGESET_STATUS.ACCEPTED;

  runStoreRef.current.updateChangeSet(match.runId, match.cs.id, {
    ...resolveChangeSetReview(match.cs, !isFullRevert),
    status: finalStatus,
    revertResult,
    skippedObjects: revertResult?.skipped || [],
  });
  bumpRuns();
  emit({
    type: EVENT_TYPE.REVIEW_RESOLVED,
    item: {
      id: toolCallId,
      command: match.cs.toolName,
      reviewStatus: isFullRevert
        ? REVIEW_STATUS.REVERTED
        : REVIEW_STATUS.ACCEPTED,
      revertResult,
      skipped: revertResult?.skipped || [],
    },
  });
  return true;
}
