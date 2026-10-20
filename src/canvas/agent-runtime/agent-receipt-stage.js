/**
 * Agent Receipt Stage — post-execution receipts, side-effects, and UI presentation.
 *
 * Owns side-effects (discovered tools, revision tracking, agent editor focus),
 * monetary cost recording, ChangeSet closing, circuit-breaker updates, and
 * presentation event emits.
 *
 * React-free module: all callbacks, stores, and registries are injected.
 *
 * @module agent-runtime/agent-receipt-stage
 */

import {
  extractTargetObjectIds,
  recordObservedObject,
  recordObservedObjects,
} from "../components/agent-panel/staleRevision.js";
import { touchesPixels } from "../components/agent-panel/canvas_glance.js";
import { computeFinalCost } from "./agent-tool-stage.js";
import { closeChangeSet } from "./agent-changeset-stage.js";
import {
  EVENT_TYPE,
  ITEM_TYPE,
  STATUS,
  APPROVAL_MODE,
  REVIEW_STATUS,
} from "../components/agent-panel/eventTypes.js";
import { recordToolCallOnStep } from "./plan-model.js";

/**
 * Handles canvas revision observation and discovered tool activation after a successful tool call.
 */
export function handleToolSideEffects({
  toolName,
  args,
  result,
  isMutatingTool,
  activeToolNamesRef,
  observedRevsRef,
  agentModifiedIdsRef,
  getStore,
}) {
  if (!result.success) return;

  // A tool that hands the user an editor as the deliverable of the turn
  // (edit_generated_image, generate_layout) must also put the agent into that
  // editor's AI context. App.jsx hides the panel whenever an editor covers the canvas and
  // `editorAiContext` is false, so without this the run's own report — and the
  // turn still writing it — vanishes behind the editor it just opened. Every
  // editor-opening tool already reports the fact in `editorOpened`; keying the
  // side effect off that contract here, at the one seam every tool call passes
  // through, covers the tools that exist and the next one that forgets.
  if (result.result?.editorOpened === true) {
    const liveStore = getStore ? getStore() : null;
    if (liveStore) {
      liveStore.setEditorAiContext(true);
    }
  }

  if (toolName === "tool_search" && result.result?.tools) {
    for (const found of result.result.tools) {
      if (!activeToolNamesRef.current.includes(found.name)) {
        activeToolNamesRef.current.push(found.name);
      }
    }
  }

  if (
    toolName === "list_nodes" ||
    toolName === "observe_canvas" ||
    toolName === "get_node"
  ) {
    const liveStore = getStore ? getStore() : null;
    if (liveStore?.nodes) {
      recordObservedObjects(observedRevsRef.current, liveStore.nodes);
    }
  }

  if (isMutatingTool) {
    const targetIds = extractTargetObjectIds(toolName, args);
    for (const tid of targetIds) {
      agentModifiedIdsRef.current.add(tid);
    }
    const liveStore = getStore ? getStore() : null;
    if (liveStore?.nodes) {
      for (const tid of targetIds) {
        const node = liveStore.nodes.find((n) => n.id === tid);
        if (node) {
          recordObservedObject(observedRevsRef.current, node);
        }
      }
    }
  }
}

/**
 * Executes post-execution canvas glance if tool touched pixels.
 */
export async function executeCanvasGlance({
  toolName,
  result,
  cancelledRef,
  signal,
  glanceAtCanvas,
  emit,
  t,
  toolCallId,
}) {
  if (
    result.success &&
    touchesPixels(toolName) &&
    !cancelledRef.current &&
    !signal.aborted
  ) {
    const looked = await glanceAtCanvas(
      `The editor's page after ${toolName}. Check it against what was asked before continuing.`,
    );
    if (looked) {
      emit({
        type: EVENT_TYPE.ITEM_COMPLETED,
        item: {
          id: `${toolCallId}-glance`,
          type: ITEM_TYPE.REASONING,
          text: t("agent.glance.after", { tool: toolName }),
          status: STATUS.COMPLETED,
        },
      });
    }
  }
}

/**
 * Finalizes cost accounting, updates the ChangeSet, records breaker state, and updates plan.
 */
export function finalizeToolAccounting({
  run,
  runStore,
  currentStepIdRef,
  changeSetId,
  result,
  toolName,
  toolCallId,
  _args,
  estCost,
  isCostEstimated,
  undoData,
  verifyOutcome,
  approvalMode,
  registry,
  recordCost,
  failureBreaker,
  pendingPlanFailureRef,
  state,
}) {
  const isUnverified = verifyOutcome?.status === "unverifiable";
  const reviewable =
    ((approvalMode === APPROVAL_MODE.AUTO_REVIEW &&
      registry.isReviewable(toolName)) ||
      isUnverified) &&
    result.success;

  const { finalCost, finalEstimated } = computeFinalCost(
    result,
    estCost,
    isCostEstimated,
  );

  if (finalCost > 0) {
    recordCost(run.id, finalCost, finalEstimated, {
      toolName,
      stepId: currentStepIdRef.current,
    });
  }

  closeChangeSet({
    runStore,
    runId: run.id,
    changeSetId,
    result,
    reviewable,
    finalCost,
    finalEstimated,
    undoData,
    isUnverified,
    verifyOutcome,
  });

  if (changeSetId) {
    runStore.updateChangeSet(run.id, changeSetId, {
      verificationStatus: verifyOutcome?.status ?? "unverified",
    });
  }

  if (
    toolName === "update_plan" &&
    result.success &&
    result.result?.deliverables
  ) {
    runStore.updateRun(run.id, {
      deliverableRequirements: result.result.deliverables,
    });
  }

  const verifierRejected =
    Boolean(verifyOutcome) &&
    !verifyOutcome.ok &&
    verifyOutcome.status !== "unverifiable";
  const failureTrip = verifierRejected
    ? null
    : failureBreaker.record(toolName, result.success, result.error);
  if (failureTrip && !state.repeatedFailure) {
    state.repeatedFailure = failureTrip;
    state.continueLoop = false;
  }

  if (toolName !== "update_plan") {
    const currentPlan = runStore.getRun(run.id)?.plan;
    if (currentPlan) {
      const recorded = recordToolCallOnStep(currentPlan, {
        toolName,
        callId: toolCallId,
      });
      if (recorded.stepId) {
        runStore.updateRun(run.id, { plan: recorded.plan });
        state.latestPlanItems = recorded.plan.steps;
        if (!result.success) {
          pendingPlanFailureRef.current = {
            stepId: recorded.stepId,
            toolName,
          };
        }
      }
    }
  }

  return { reviewable };
}

/**
 * Emits completion and pending-review events to the UI.
 */
export function emitToolPresentation({
  toolCallId,
  toolName,
  args,
  result,
  reviewable,
  handler,
  undoData,
  emit,
}) {
  const resultPresentation =
    result.success && handler?.presentResult
      ? handler.presentResult(args, result.result) || {
          title: "Completed",
          status: STATUS.COMPLETED,
        }
      : {
          title:
            result.error?.message || (result.success ? "Completed" : "Failed"),
          status: result.success ? STATUS.COMPLETED : STATUS.FAILED,
        };

  emit({
    type: EVENT_TYPE.ITEM_COMPLETED,
    item: {
      id: toolCallId,
      type: ITEM_TYPE.COMMAND_EXECUTION,
      command: toolName,
      status:
        resultPresentation.status ||
        (result.success ? STATUS.COMPLETED : STATUS.FAILED),
      result: result.result,
      error: result.error,
      reviewStatus: reviewable ? REVIEW_STATUS.PENDING : REVIEW_STATUS.NONE,
      ...resultPresentation,
    },
  });

  if (reviewable) {
    emit({
      type: EVENT_TYPE.REVIEW_PENDING,
      item: {
        id: toolCallId,
        type: ITEM_TYPE.COMMAND_EXECUTION,
        command: toolName,
        arguments: args,
        title: resultPresentation.title || toolName,
        reviewStatus: REVIEW_STATUS.PENDING,
        undoData,
        affectedObjects: undoData?.affectedObjects || [],
      },
    });
  }
}
