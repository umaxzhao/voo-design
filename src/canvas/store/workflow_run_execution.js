/**
 * The single run status, hydration, and terminal path.
 *
 * performRun is the one shared path for Run, Batch, Agent, confirmation, and
 * recovery: it opens a durable execution, drives the executor with an
 * onNodeStatus handler, and settles exactly one async-final commit (one undo
 * entry per agent batch). startRun / onlyNodeIds / continueOnError /
 * apiConcurrency semantics and the durable execution hooks are unchanged.
 *
 * Pure logic — zero React dependencies.
 *
 * @module store/workflow_run_execution
 */

import { captureError } from "../../shared/error_collector.js";
import { RunError } from "../engine/executor_errors.js";
import { isParallelApiNode } from "../engine/graph.js";
import { IDLE_RUN, scheduleSave } from "./persistence.js";
import { isInSidePanel } from "../rpc.js";
import { createAsyncFinalCommit } from "./async-final-commit.js";
import {
  openWorkflowExecution,
  refreshWorkflowExecutionRecovery,
} from "../agent-runtime/workflow-execution-boundary.js";
import {
  checkSerialExecutionGate,
  isSubmissionUncertain,
} from "../../shared/workflow-execution-contract.js";
import { createRunNodeStatusHandler } from "./workflow_run_node_status.js";
import { workflowAssetRetentionNodes } from "./workflow_asset_retention.js";

/**
 * Runs an approved request through the one status, hydration, and terminal
 * path shared by Run, Batch, Agent, confirmation, and recovery.
 */
export async function performRun(
  get,
  set,
  executionStore,
  {
    onlyNodeId,
    onlyNodeIds,
    startFromNodeId,
    preserveOrder,
    apiConcurrency,
    continueOnError,
    resumeExecutionId,
    agentContext,
    identityLock,
    signal,
  } = {},
) {
  const finalCommit = createAsyncFinalCommit(get, "workflow.async.run");
  let waitingForRecoveryConfirmation = false;
  const requestedIds = onlyNodeIds ?? (onlyNodeId ? [onlyNodeId] : null);
  const requestedNodes = requestedIds
    ? requestedIds
        .map((id) => get().nodes.find((node) => node.id === id))
        .filter(Boolean)
    : null;
  // Only independent API jobs may join an in-flight run; other nodes share
  // the chat conversation and must wait for its owner.
  const apiNodeRequest = Boolean(
    requestedNodes &&
    requestedNodes.length > 0 &&
    requestedNodes.every((node) => isParallelApiNode(node)),
  );
  const gateCheck = checkSerialExecutionGate({
    currentStatus: get().run.status,
    isParallelJob: apiNodeRequest,
  });
  if (!gateCheck.ok) {
    return { status: "ignored" };
  }
  const concurrentApiNode = get().run.status === "running" && apiNodeRequest;

  if (!concurrentApiNode) {
    set({
      run: {
        ...IDLE_RUN,
        status: "running",
        stopRequested: false,
        error: null,
        resumeFrom: null,
        activeNodeId: null,
        pendingRequest: null,
        recovery: resumeExecutionId
          ? {
              ...get().run.recovery,
              executionId: resumeExecutionId,
              status: "resuming",
            }
          : null,
        // Who owns the run state. A standalone API-node batch may retire it
        // when its last job ends; a concurrent API-node job that joined an
        // in-flight run must leave the state to whoever owns it.
        runOwner: apiNodeRequest ? "api" : "serial",
      },
    });
  }

  const targetWorkflowId = get().workflowId;
  const initialNodes = get().nodes;
  const initialEdges = get().edges;

  let execution;
  try {
    execution = await openWorkflowExecution({
      executionStore,
      workflowId: targetWorkflowId,
      nodes: initialNodes,
      edges: initialEdges,
      options: {
        onlyNodeId,
        onlyNodeIds,
        startFromNodeId,
        preserveOrder,
        apiConcurrency,
        continueOnError,
        resumeExecutionId,
        agentContext,
        identityLock,
      },
    });
  } catch (err) {
    if (!concurrentApiNode && get().workflowId === targetWorkflowId) {
      set({
        run: {
          ...IDLE_RUN,
          status: "idle",
          error: { code: "prepareFailed", message: err?.message },
        },
      });
    }
    throw err;
  }
  // A replay returns its receipt without entering the engine or provider.
  if (execution.replayed) {
    if (!concurrentApiNode && get().workflowId === targetWorkflowId) {
      set({
        run: {
          ...IDLE_RUN,
          status: "idle",
        },
      });
    }
    return {
      executionId: execution.id,
      execution: execution.record,
      replayed: true,
    };
  }

  // Guard: if workflow switched while preparing execution, do not continue on the new workflow
  if (get().workflowId !== targetWorkflowId) {
    if (!concurrentApiNode && get().run.status === "running") {
      set({
        run: {
          ...IDLE_RUN,
          status: "idle",
        },
      });
    }
    await execution
      .pauseForConfirmation(
        new Error(
          `Workflow changed from ${targetWorkflowId} to ${get().workflowId} during preparation`,
        ),
      )
      .catch(() => {});
    return {
      executionId: execution.id,
      execution: execution.record,
      cancelled: true,
    };
  }

  const resumedNodeIds = resumeExecutionId
    ? execution.unfinishedNodeIds()
    : null;
  const resumedRequest = resumeExecutionId ? execution.request : null;
  const effectiveApiConcurrency =
    apiConcurrency ?? resumedRequest?.apiConcurrency ?? undefined;
  const effectiveContinueOnError =
    continueOnError ?? resumedRequest?.continueOnError ?? undefined;
  const effectivePreserveOrder =
    preserveOrder ?? resumedRequest?.preserveOrder ?? false;
  // A resumed execution replays the identity lock persisted with its durable
  // request; a fresh run uses the lock resolved at the run entry.
  const effectiveIdentityLock =
    identityLock ?? resumedRequest?.identityLock ?? null;

  if (apiNodeRequest) {
    set({ activeApiRuns: get().activeApiRuns + 1 });
  }

  const onNodeStatus = createRunNodeStatusHandler({
    get,
    set,
    execution,
    targetWorkflowId,
    finalCommit,
    initialNodes,
    initialEdges,
  });

  try {
    const { runWorkflow } = await import("../engine/executor.js");
    const summary = await runWorkflow({
      getGraph: () => {
        if (get().workflowId !== targetWorkflowId) {
          return { nodes: initialNodes, edges: initialEdges };
        }
        return { nodes: get().nodes, edges: get().edges };
      },
      // A Batch node runs its members at its own pace (serial by default),
      // without the user having to change the global setting first.
      settings:
        effectiveApiConcurrency === undefined
          ? get().settings
          : { ...get().settings, apiConcurrency: effectiveApiConcurrency },
      context: {
        inSidePanel: isInSidePanel(),
        hostPlatform: get().platform.id,
        workflowId: targetWorkflowId,
        execution,
        // The Agent Gen node's Run branch needs the live store to dispatch its
        // tools, and the run's signal so a stop cancels that turn too.
        getStore: get,
        signal,
        // The run's resolved brand constraint, appended to every generation
        // prompt by the node executor. Null means no lock resolved.
        identityLock: effectiveIdentityLock,
        // Resolve at eviction time: users may have edited or switched projects
        // while generation was waiting for the provider.
        getAssetRetentionNodes: () => workflowAssetRetentionNodes(get()),
      },
      onlyNodeId: resumeExecutionId ? undefined : onlyNodeId,
      onlyNodeIds: resumedNodeIds ?? onlyNodeIds,
      startFromNodeId: resumeExecutionId ? undefined : startFromNodeId,
      preserveOrder: Boolean(effectivePreserveOrder),
      // "Continue on error" turns the fail-fast executor into a skip-on-error
      // run; the failed nodes are reported back for a one-click retry.
      skipOnError:
        effectiveContinueOnError ?? get().settings?.continueOnError === true,
      shouldStop: () =>
        // Agent cancellation must reach the scheduler, not only the LLM loop.
        signal?.aborted ||
        get().run.stopRequested ||
        get().workflowId !== targetWorkflowId,
      onNodeStatus,
    });
    const hasUncertainty =
      Boolean(
        summary?.uncertainError &&
        isSubmissionUncertain(summary.uncertainError),
      ) ||
      Object.values(execution?.record?.nodes ?? {}).some(
        (node) =>
          node.attemptState === "submission-uncertain" ||
          node.attemptState === "submitting",
      );
    if (hasUncertainty) {
      const failure =
        summary?.uncertainError ??
        new RunError("providerSubmissionUncertain", null, {
          message: "A remote job submission response was lost.",
        });
      waitingForRecoveryConfirmation = true;
      await execution.pauseForConfirmation(failure);
      if (!concurrentApiNode && get().workflowId === targetWorkflowId) {
        set({
          run: {
            ...IDLE_RUN,
            failedNodeIds: summary?.failedNodeIds ?? [],
          },
        });
        await refreshWorkflowExecutionRecovery({
          executionStore,
          workflowId: targetWorkflowId,
          get,
          set,
        });
      }
    } else {
      await execution.complete(summary);
      if (!apiNodeRequest && get().workflowId === targetWorkflowId) {
        set({
          run: {
            ...IDLE_RUN,
            executionId: execution.id,
            status: summary.stopped ? "stopped" : "idle",
            failedNodeIds: summary.failedNodeIds ?? [],
          },
        });
      }
    }
  } catch (error) {
    // Keep the original message for non-RunError failures: a programming or
    // storage error surfaced as a bare "generic" used to be undebuggable.
    const failure =
      error instanceof RunError ||
      (error &&
        typeof error === "object" &&
        typeof error.code === "string" &&
        "nodeId" in error)
        ? error
        : new RunError("generic", null, { message: error?.message });
    if (isSubmissionUncertain(failure)) {
      waitingForRecoveryConfirmation = true;
      await execution.pauseForConfirmation(failure);
      if (!concurrentApiNode && get().workflowId === targetWorkflowId) {
        set({ run: { ...IDLE_RUN } });
        await refreshWorkflowExecutionRecovery({
          executionStore,
          workflowId: targetWorkflowId,
          get,
          set,
        });
      }
    } else {
      await execution.fail(failure);
    }
    if (
      !concurrentApiNode &&
      !waitingForRecoveryConfirmation &&
      get().workflowId === targetWorkflowId
    ) {
      set({
        run: {
          executionId: execution?.id ?? null,
          status: "error",
          stopRequested: false,
          error: {
            code: failure.code,
            nodeId: failure.nodeId,
            message: failure.message,
            providerId: failure.providerId,
          },
          resumeFrom: failure.nodeId,
          // The banner keeps pointing at the node that failed. Graph-level
          // failures (emptyGraph, cycle) name no node — offering "retry failed
          // (1)" for a null node id would retry nothing.
          activeNodeId: failure.nodeId,
          failedNodeIds: failure.nodeId ? [failure.nodeId] : [],
        },
      });

      // A run failure used to live and die in this state object: the catch
      // above never rethrows, so nothing downstream ever saw it, and the
      // remote channel never learned that a run had failed. Capture from here,
      // at the one point where the failure becomes user-visible state.
      //
      // The guard above is the same one the state write uses, and it matters:
      // a joined concurrent API-node batch leaves the state alone, so
      // capturing outside it would report one failure once per participant.
      // captureError fans out through the listener in main.jsx, so the
      // unreportable-error filter, the signature cooldown and the session cap
      // all still apply — this is a capture point, not a second reporting path.
      captureError({
        error: error ?? failure,
        message: failure.message || "",
        source: `run:${failure.code || "failed"}`,
        code: failure.code ?? null,
      });
    }
  } finally {
    if (apiNodeRequest && get().workflowId === targetWorkflowId) {
      const remaining = Math.max(0, get().activeApiRuns - 1);
      set({ activeApiRuns: remaining });
      // Only an API-node batch that owns the run state may retire it. A job
      // that joined an in-flight run leaves the state alone — resetting here
      // used to clear the banner and the "running" gate while the serial run
      // was still going, letting a second serial run slip into the same
      // conversation, and wipe a just-written failure list.
      if (
        remaining === 0 &&
        get().run.runOwner === "api" &&
        !waitingForRecoveryConfirmation
      ) {
        set({ run: { ...IDLE_RUN } });
      }
    }
    // A run can finish in the standalone tab immediately before the user
    // returns to an in-page panel. Wait for the graph and result ids to
    // reach IndexedDB so the other canvas never reloads stale placeholders.
    await scheduleSave(get, { immediate: true });
  }
  // Agent tools need the settled durable result, not the legacy "started"
  // envelope or live canvas state, which can now belong to another workflow.
  return { executionId: execution.id, execution: execution.record };
}
