/**
 * Agent Stale Revision Stage — detects concurrent edits and prompts resolution.
 *
 * React-free module: store accessors, prompt callbacks, and translation injected.
 *
 * @module agent-runtime/agent-stale-stage
 */

import {
  createToolError,
  TOOL_ERROR_CODE,
} from "../components/agent-panel/tools/errors.js";
import {
  checkStaleRevision,
  recordObservedObject,
  recordObservedObjects,
  MAX_STALE_REPLAN_RETRIES,
} from "../components/agent-panel/staleRevision.js";
import { AGENT_RUN_STATUS, AGENT_STEP_STATUS } from "./run-store.js";

/**
 * Checks for stale canvas revisions before mutating tools run, prompting for resolution if needed.
 */
export async function resolveStaleRevision({
  toolName,
  args,
  activeStore,
  observedRevs,
  agentModifiedIds,
  staleReplanCount,
  runStore,
  runId,
  currentStepId,
  bumpRuns,
  onRequestUserInput,
  t,
}) {
  const staleCheck = checkStaleRevision({
    toolName,
    args,
    store: activeStore,
    observedRevs,
    agentModifiedIds,
  });

  if (!staleCheck.hasConflict) {
    return { hasConflict: false };
  }

  const conflict = staleCheck.conflict;
  const replanCount = staleReplanCount.get(conflict.objectId) || 0;

  if (replanCount < MAX_STALE_REPLAN_RETRIES) {
    staleReplanCount.set(conflict.objectId, replanCount + 1);
    const conflictError = createToolError(
      TOOL_ERROR_CODE.STALE_REVISION_CONFLICT,
      `Execution blocked: ${conflict.summary} Target revision is stale (read rev: ${conflict.readRev}, current rev: ${conflict.currentRev}). Re-plan with the latest state.`,
      {
        details: conflict,
        suggestion: {
          tool: "list_nodes",
          args: {},
          note: "Re-observe canvas state to get current revisions, then re-plan the modification.",
        },
      },
    );
    return {
      hasConflict: true,
      shouldRetry: true,
      conflictResult: { success: false, conflict, error: conflictError },
    };
  }

  // Conflict persisted after max replan retries -> prompt user
  runStore.setRunStatus(runId, AGENT_RUN_STATUS.WAITING_INPUT);
  if (currentStepId) {
    runStore.updateStep(runId, currentStepId, {
      status: AGENT_STEP_STATUS.WAITING_INPUT,
    });
  }
  bumpRuns();

  const actorKey =
    conflict.modifiedBy === "collab"
      ? "actorCollab"
      : conflict.modifiedBy === "agent"
        ? "actorAgent"
        : "actorUser";

  const question = t("agent.staleRevision.conflictQuestion", {
    name: conflict.name,
    actor: t(`agent.staleRevision.${actorKey}`),
  });
  const options = [
    t("agent.staleRevision.optionOverwrite"),
    t("agent.staleRevision.optionAbandon"),
    t("agent.staleRevision.optionReobserve"),
  ];

  let userResponse = null;
  if (onRequestUserInput) {
    userResponse = await onRequestUserInput(question, options);
  }

  let selectedIndex = -1;
  if (
    typeof userResponse === "number" &&
    userResponse >= 0 &&
    userResponse < options.length
  ) {
    selectedIndex = userResponse;
  } else if (userResponse && typeof userResponse === "object") {
    if (
      typeof userResponse.index === "number" &&
      userResponse.index >= 0 &&
      userResponse.index < options.length
    ) {
      selectedIndex = userResponse.index;
    } else if (
      typeof userResponse.id === "number" &&
      userResponse.id >= 0 &&
      userResponse.id < options.length
    ) {
      selectedIndex = userResponse.id;
    } else if (typeof userResponse.value === "string") {
      selectedIndex = options.findIndex(
        (opt) =>
          opt === userResponse.value ||
          opt.trim() === userResponse.value.trim(),
      );
    }
  } else if (typeof userResponse === "string") {
    selectedIndex = options.findIndex(
      (opt) => opt === userResponse || opt.trim() === userResponse.trim(),
    );
  }

  if (selectedIndex === 0) {
    staleReplanCount.delete(conflict.objectId);
    const latestObj =
      activeStore?.nodes?.find((n) => n.id === conflict.objectId) ??
      activeStore?.edges?.find((e) => e.id === conflict.objectId) ??
      null;
    if (latestObj) {
      recordObservedObject(observedRevs, latestObj);
    }
    runStore.setRunStatus(runId, AGENT_RUN_STATUS.RUNNING);
    if (currentStepId) {
      runStore.updateStep(runId, currentStepId, {
        status: AGENT_STEP_STATUS.RUNNING,
      });
    }
    bumpRuns();
    return { hasConflict: true, overwrite: true };
  }

  if (selectedIndex === 1) {
    staleReplanCount.delete(conflict.objectId);
    runStore.setRunStatus(runId, AGENT_RUN_STATUS.RUNNING);
    if (currentStepId) {
      runStore.updateStep(runId, currentStepId, {
        status: AGENT_STEP_STATUS.RUNNING,
      });
    }
    bumpRuns();
    return {
      hasConflict: true,
      abandoned: true,
      conflictResult: {
        success: false,
        abandoned: true,
        error: createToolError(
          TOOL_ERROR_CODE.OPERATION_ABORTED,
          "Step abandoned by user due to conflicting modification.",
        ),
      },
    };
  }

  if (selectedIndex === 2) {
    staleReplanCount.delete(conflict.objectId);
    if (activeStore?.nodes) {
      recordObservedObjects(observedRevs, activeStore.nodes);
    }
    runStore.setRunStatus(runId, AGENT_RUN_STATUS.RUNNING);
    if (currentStepId) {
      runStore.updateStep(runId, currentStepId, {
        status: AGENT_STEP_STATUS.RUNNING,
      });
    }
    bumpRuns();
    return {
      hasConflict: true,
      reobserve: true,
      conflictResult: {
        success: false,
        reobserve: true,
        error: createToolError(
          TOOL_ERROR_CODE.STALE_REVISION_CONFLICT,
          "User requested agent to re-observe the canvas state before proceeding.",
          {
            details: conflict,
            suggestion: { tool: "list_nodes", args: {} },
          },
        ),
      },
    };
  }

  return { hasConflict: true, shouldBreak: true };
}
