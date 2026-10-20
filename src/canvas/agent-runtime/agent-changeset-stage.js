/**
 * Agent ChangeSet Stage — transaction lifecycle, undo tracking, and tool context.
 *
 * Owns ChangeSet opening, workflow consistency assertion, tool execution context
 * assembly, before/after snapshotting for reviewable tools, and ChangeSet closing.
 *
 * React-free module: all store accessors, signals, and registries are injected.
 *
 * @module agent-runtime/agent-changeset-stage
 */

import { generateIdempotencyKey } from "../components/agent-panel/idempotentRetry.js";
import {
  captureAffectedSnapshot,
  diffAffectedObjects,
} from "../components/agent-panel/changesetReview.js";
import { createCanvasPixelAdapter } from "../components/agent-panel/canvasPixelAdapter.js";
import { CHANGESET_STATUS } from "./run-store.js";
import {
  recordObservedObject,
  recordObservedObjects,
} from "../components/agent-panel/staleRevision.js";

/**
 * Opens a pending ChangeSet record for a tool call.
 */
export function openChangeSet({
  runStore,
  runId,
  stepId,
  toolName,
  args,
  toolCallId,
}) {
  const idempotencyKey = generateIdempotencyKey({
    runId,
    stepId,
    toolName,
    args,
  });

  const changeSet = runStore.addChangeSet(runId, {
    stepId,
    toolName,
    args,
    idempotencyKey,
    toolCallId,
    status: CHANGESET_STATUS.PENDING,
  });

  return {
    changeSetId: changeSet?.id ?? null,
    idempotencyKey,
  };
}

/**
 * Validates that active store workflow matches target workflow before tool execution.
 * Aborts and records failure if mismatched.
 */
export function validateWorkflowConsistency({
  targetWorkflowId,
  activeStore,
  toolName,
  runStore,
  runId,
  changeSetId,
  controller,
}) {
  if (
    targetWorkflowId &&
    activeStore?.workflowId &&
    activeStore.workflowId !== targetWorkflowId
  ) {
    const mismatchError = new Error(
      `WORKFLOW_MISMATCH: Cannot execute tool ${toolName}; active workflow changed from ${targetWorkflowId} to ${activeStore.workflowId}`,
    );
    if (changeSetId) {
      runStore.resolveChangeSet(runId, changeSetId, {
        status: CHANGESET_STATUS.FAILED,
        error: {
          message: mismatchError.message,
          code: "WORKFLOW_MISMATCH",
        },
      });
    }
    controller?.abort(mismatchError);
    throw mismatchError;
  }
}

/**
 * Assembles the toolContext object passed to tool.execute().
 */
export function createToolExecutionContext({
  getStore,
  targetWorkflowId,
  registry,
  signal,
  runStore,
  runId,
  stepId,
  observedRevs,
  changeSetId,
  idempotencyKey,
  toolCallId,
  activeStore,
  llm,
  onRequestUserInput,
}) {
  const canvasPixelAdapter = createCanvasPixelAdapter(activeStore);

  return {
    getStore: () => {
      if (!getStore) {
        throw new Error(
          "Store accessor not configured. Pass getStore to useAgentLoop.",
        );
      }
      const store = getStore();
      if (
        targetWorkflowId &&
        store.workflowId &&
        store.workflowId !== targetWorkflowId
      ) {
        throw new Error(
          `WORKFLOW_MISMATCH: Agent run belongs to workflow ${targetWorkflowId}, but active workflow is ${store.workflowId}`,
        );
      }
      return store;
    },
    /**
     * The Agent Gen node this session is bound to, when any. Nodes created by a
     * bound session are adopted into that node's output Group (see createNode).
     */
    agentNodeId: activeStore?.agentSessionNodeId ?? null,
    workflowId: targetWorkflowId,
    getRegistry: () => registry,
    signal,
    runStore,
    runId,
    stepId,
    observedRevs,
    recordObservedObject: (obj) => recordObservedObject(observedRevs, obj),
    recordObservedObjects: (objs) => recordObservedObjects(observedRevs, objs),
    changeSetId,
    idempotencyKey,
    rasterizeCanvas: (options) => canvasPixelAdapter.rasterizeCanvas(options),
    getCanvasPixels: (region) => canvasPixelAdapter.getCanvasPixels(region),
    executionContext: {
      agentRunId: runId,
      agentStepId: stepId,
      toolCallId,
      workflowId: targetWorkflowId,
      idempotencyKey,
      changeSetId,
    },
    llm,
    ...(onRequestUserInput
      ? {
          requestUserResponse: (question, options) =>
            onRequestUserInput(question, options),
        }
      : {}),
  };
}

/**
 * Captures pre-execution snapshot for reviewable tools.
 */
export function captureBeforeSnapshot({ isReviewable, getStore }) {
  if (!isReviewable || !getStore) return null;
  const store = getStore();
  return store ? captureAffectedSnapshot(store) : null;
}

/**
 * Computes undo diff for reviewable tools after successful execution.
 */
export function computeChangeSetUndo({
  isReviewable,
  resultSuccess,
  beforeSnapshot,
  getStore,
}) {
  if (!isReviewable || !resultSuccess || !beforeSnapshot || !getStore) {
    return null;
  }
  const afterStore = getStore();
  const afterSnapshot = captureAffectedSnapshot(afterStore);
  return diffAffectedObjects(beforeSnapshot, afterSnapshot);
}

/**
 * Closes the ChangeSet record with outcome, cost, undo data, and verifier info.
 */
export function closeChangeSet({
  runStore,
  runId,
  changeSetId,
  result,
  reviewable,
  finalCost,
  finalEstimated,
  undoData,
  isUnverified,
  verifyOutcome,
}) {
  if (!changeSetId) return;

  runStore.updateChangeSet(runId, changeSetId, {
    status: !result.success
      ? CHANGESET_STATUS.FAILED
      : reviewable
        ? CHANGESET_STATUS.PENDING_REVIEW
        : CHANGESET_STATUS.COMMITTED,
    result: result.result,
    error: result.error,
    cost: finalCost,
    estimated: finalEstimated,
    ...(undoData
      ? { undoData, affectedObjects: undoData.affectedObjects }
      : {}),
    ...(isUnverified
      ? {
          unverified: true,
          verificationStatus: "unverifiable",
          verificationIssues: verifyOutcome?.issues,
        }
      : {}),
    ...(result.result?.nodeId ? { nodeId: result.result.nodeId } : {}),
    ...(result.result?.taskId ? { taskId: result.result.taskId } : {}),
  });
}
