/**
 * Thin facade composing the workflow run action sub-factories.
 *
 * Split from the original monolith along two seams — the node-status
 * hydration/persistence handler and the single run execution path — each in
 * its own module under the 400-line budget. This file stays the single
 * public entry so importers (workflow_store, tests) and the source-metadata
 * readers (consumer_registry, durable-execution-store, undo-action-contracts,
 * async-history-contract) do not change.
 *
 * The (set, get) Zustand closure contract is preserved; performRun is passed
 * through unchanged so recovery/confirmation/start all share one path.
 *
 * Pure logic — zero React dependencies.
 *
 * @module store/workflow_run_actions
 */

import { NODE_TYPE, RUN_STATUS } from "../nodes/types.js";
import { normalizeConcurrency } from "../../shared/concurrency.js";
import { scheduleSave } from "./persistence.js";
import { createDurableExecutionStore } from "../agent-runtime/durable-execution-store.js";
import { createWorkflowRecoveryActions } from "./workflow_recovery_actions.js";
import { isWorkflowReadOnly } from "./workflow_readonly.js";
import { requestWorkflowExecution } from "../agent-runtime/workflow-execution-boundary.js";
import { performRun } from "./workflow_run_execution.js";
import { loadGlobalBrands } from "../agent-runtime/global-memory.js";
import { resolveRunIdentityLock } from "../agent-runtime/identity-lock.js";

export { getWorkflowExecutionState } from "../../shared/workflow-execution-contract.js";

/**
 * Longest edge of each generated image sampled for the identity check. A
 * palette read from a 256px preview is the same reading as from the full
 * original, and the cap keeps the post-run check from ever becoming the run's
 * performance cliff.
 */
export const IDENTITY_COMPLIANCE_MAX_EDGE = 256;

/**
 * The nearest ancestor Group of a node, walking `parentNode` membership, or
 * null when the node is not inside a Group. Used to resolve a Group-level
 * identity lock for a Batch run.
 *
 * @param {{id: string, parentNode?: string|null}} node
 * @param {Array} nodes
 * @returns {object|null}
 */
function nearestGroupNode(node, nodes) {
  if (!node || !Array.isArray(nodes)) return null;
  const byId = new Map(nodes.map((candidate) => [candidate.id, candidate]));
  const visited = new Set([node.id]);
  let parentId = node.parentNode;
  while (parentId) {
    if (visited.has(parentId)) return null;
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) return null;
    if (parent.type === NODE_TYPE.GROUP) return parent;
    parentId = parent.parentNode;
  }
  return null;
}

/**
 * The data patch that moves one host-driven generation node onto the VOO
 * Cloud gateway, or null when the node has nothing to switch. API-mode nodes
 * and node kinds without an API route are left exactly as they are.
 *
 * @param {object} node a workflow node
 * @param {object} vocab node vocabulary and the cloud defaults
 * @returns {object|null}
 */
export function hostedNodeCloudPatch(
  node,
  {
    EXECUTION_MODE,
    NODE_TYPE,
    PROVIDER_ID,
    defaultVideoModelId,
    defaultImageModelId,
  },
) {
  if (node.type !== NODE_TYPE.GENERATE && node.type !== NODE_TYPE.VIDEO) {
    return null;
  }
  if (node.data?.executionMode === EXECUTION_MODE.API) return null;
  return {
    executionMode: EXECUTION_MODE.API,
    providerId: PROVIDER_ID.AI_302,
    modelId:
      node.data?.modelId ||
      (node.type === NODE_TYPE.VIDEO
        ? defaultVideoModelId
        : defaultImageModelId),
  };
}

export function createWorkflowRunActions(
  set,
  get,
  { executionStore = createDurableExecutionStore() } = {},
) {
  return {
    ...createWorkflowRecoveryActions(set, get, {
      executionStore,
      performRun,
    }),

    /**
     * Starts a run — or parks it behind the Ask confirmation card when Ask
     * mode is on and the run bills remote calls. Returns the outcome so agent
     * tools and callers can react instead of assuming it started.
     */
    async startRun(opts = {}) {
      if (isWorkflowReadOnly(get()))
        return { status: "ignored", reason: "readOnly" };
      return requestWorkflowExecution({
        get,
        set,
        executionStore,
        options: opts,
        performRun,
      });
    },

    /**
     * Runs the generator nodes wired into a Batch node, in topological order.
     *
     * It delegates to the same gate every other run goes through, so Ask
     * mode, stop, continue-on-error and gallery collection all behave
     * identically — the Batch node only decides *which* nodes run and *how
     * many at once*.
     *
     * After a run that actually started, and only when a lock resolved and the
     * caller injected a `readIdentitySamples` pixel reader, the stills the
     * members produced are checked against that lock and the outcome is stored
     * on the Batch node as `data.identityCompliance`. The reader is injected
     * because the store is DOM-free; without it the check is skipped, never
     * faked.
     */
    async runBatchNode(
      nodeId,
      { onlyFailed = false, readIdentitySamples = null } = {},
    ) {
      if (isWorkflowReadOnly(get()))
        return { status: "ignored", reason: "readOnly" };
      const origin = get();
      const workflowId = origin.workflowId;
      const workflowHistories = origin.workflowHistories;
      const isCurrent = () => {
        const current = get();
        return (
          current.workflowId === workflowId &&
          current.workflowHistories === workflowHistories &&
          !isWorkflowReadOnly(current)
        );
      };
      const node = origin.nodes.find((candidate) => candidate.id === nodeId);
      if (!node) return { status: "ignored" };
      // Imported on demand, like the other graph helpers the store reaches
      // for: keeping it out of the static graph avoids dragging the node
      // vocabulary into every consumer of the run actions.
      const { collectBatchMembers } =
        await import("../engine/batch_members.js");
      if (!isCurrent()) return { status: "ignored", reason: "projectChanged" };
      // Keep the batch's full membership for the post-run verdict; a partial
      // retry still has to judge the whole current result set, or an untouched
      // member's drift would silently disappear from the Batch node.
      const batchMemberIds = collectBatchMembers(
        nodeId,
        get().nodes,
        get().edges,
      );
      let memberIds = batchMemberIds;
      if (onlyFailed) {
        const byId = new Map(get().nodes.map((n) => [n.id, n]));
        memberIds = memberIds.filter(
          (id) => byId.get(id)?.data?.status === RUN_STATUS.ERROR,
        );
      }
      if (memberIds.length === 0) {
        if (!onlyFailed) {
          get().updateNodeData(nodeId, {
            status: RUN_STATUS.ERROR,
            error: { code: "batchNoMembers" },
          });
        }
        return { status: "ignored" };
      }
      // Clear any previous outcome with the rest of the run lifecycle state:
      // a rerun must never keep showing the last run's drift.
      get().updateNodeData(nodeId, {
        status: RUN_STATUS.IDLE,
        error: null,
        identityCompliance: null,
      });
      // Resolve the run-scoped brand constraint once, here at the run entry,
      // so the durable request, the run context and every member prompt share
      // the same lock. When nothing resolves, the option is omitted entirely.
      const identityLock = resolveRunIdentityLock({
        batchNode: node,
        groupNode: nearestGroupNode(node, get().nodes),
        projectBrief: get().projectBrief ?? null,
        globalBrands: loadGlobalBrands(),
      });
      // Load the post-run check only for a brand-constrained batch. Resolve it
      // before execution, so a failed chunk cannot follow a paid generation.
      const identityCheck =
        identityLock && typeof readIdentitySamples === "function"
          ? await import("./batch-identity-compliance.js")
          : null;
      if (!isCurrent()) return { status: "ignored", reason: "projectChanged" };
      const result = await requestWorkflowExecution({
        get,
        set,
        executionStore,
        performRun,
        options: {
          onlyNodeIds: memberIds,
          preserveOrder: true,
          apiConcurrency: normalizeConcurrency(
            node.data?.concurrency ?? node.data?.apiConcurrency,
            1,
          ),
          ...(identityLock ? { identityLock } : {}),
        },
      });
      if (result?.status === "started" && identityCheck && isCurrent()) {
        const compliance = await identityCheck.recordBatchIdentityCompliance({
          get,
          batchNodeId: nodeId,
          memberIds: batchMemberIds,
          lock: identityLock,
          readIdentitySamples,
          maxEdge: IDENTITY_COMPLIANCE_MAX_EDGE,
        });
        if (compliance?.status === "drift") {
          const driftedMembers = new Set(
            compliance.issues.map((issue) => issue.targetId).filter(Boolean),
          ).size;
          set({
            run: {
              ...get().run,
              identityDrift: { nodeId, count: driftedMembers },
            },
          });
        }
      }
      return result;
    },

    /** Executes the request parked by Ask mode. */
    async confirmRun() {
      if (isWorkflowReadOnly(get()))
        return { status: "ignored", reason: "readOnly" };
      const pending = get().run.pendingRequest;
      if (!pending) return { status: "ignored" };
      set({ run: { ...get().run, pendingRequest: null } });
      const result = await performRun(get, set, executionStore, pending);
      return { status: "started", ...result };
    },

    cancelRunConfirm() {
      set({ run: { ...get().run, pendingRequest: null } });
    },

    /**
     * Re-routes every host-driven generation node onto the VOO Cloud gateway.
     *
     * The escape hatch the run button offers when a workflow built for a chat
     * host opens without one (standalone web, extension missing): API nodes
     * run without a host, so the switch turns "blocked with no way forward"
     * into "runnable on credits". The account cloud route table is applied
     * too, so later nodes inherit the gateway instead of the built-in default.
     *
     * @returns {Promise<number>} how many nodes were switched
     */
    async switchHostedNodesToCloud() {
      if (isWorkflowReadOnly(get())) return 0;
      const { EXECUTION_MODE, NODE_TYPE } = await import("../nodes/types.js");
      const {
        DEFAULT_API_IMAGE_MODEL_ID,
        DEFAULT_API_VIDEO_MODEL_ID,
        PROVIDER_ID,
      } = await import("../../shared/providers.js");
      const { applyAccountCloudRoutes } =
        await import("../components/onboarding/account_defaults.js");
      await applyAccountCloudRoutes();
      let switched = 0;
      for (const node of get().nodes) {
        const patch = hostedNodeCloudPatch(node, {
          EXECUTION_MODE,
          NODE_TYPE,
          PROVIDER_ID,
          defaultVideoModelId: DEFAULT_API_VIDEO_MODEL_ID,
          defaultImageModelId: DEFAULT_API_IMAGE_MODEL_ID,
        });
        if (!patch) continue;
        get().updateNodeData(node.id, patch);
        switched += 1;
      }
      return switched;
    },

    /** Re-runs exactly the nodes that failed in the last run, in dependency order. */
    async retryFailedNodes() {
      if (isWorkflowReadOnly(get()))
        return { status: "ignored", reason: "readOnly" };
      const failedNodeIds = get().run.failedNodeIds;
      if (!Array.isArray(failedNodeIds) || failedNodeIds.length === 0) {
        return { status: "ignored" };
      }
      // A failed node can be gone by the time the user presses Retry — deleted,
      // or removed by an undo while another run was in flight. Retry is scoped
      // to the nodes still on the canvas, so a partially deleted failure list
      // still re-runs exactly its surviving members.
      //
      // When none of them survive, stop here instead of calling down. The run
      // planner resolves `onlyNodeIds` against the current graph, so an
      // all-missing request produces an empty plan: it opens a durable
      // execution, runs nothing, and then writes the terminal "idle" state that
      // clears `failedNodeIds` and `error`. The user pressed Retry on a visible
      // failure and got a silent no-op that also destroyed the explanation.
      // Leaving `run` untouched keeps the failure and its Retry affordance on
      // screen and spends no execution, so nothing is billed and nothing is lost.
      const nodeIdsOnCanvas = new Set(get().nodes.map((node) => node.id));
      const liveNodeIds = failedNodeIds.filter((nodeId) =>
        nodeIdsOnCanvas.has(nodeId),
      );
      if (liveNodeIds.length === 0) {
        return { status: "ignored", reason: "retryTargetsMissing" };
      }
      return requestWorkflowExecution({
        get,
        set,
        executionStore,
        performRun,
        options: { onlyNodeIds: liveNodeIds },
      });
    },

    async dismissRunFailures() {
      set({ run: { ...get().run, failedNodeIds: [] } });
      const workflowId = get().workflowId;
      const executionId =
        get().run?.executionId ??
        get().durableExecutionRecovery?.latestExecutionId ??
        get().run?.recoverableExecutionId;
      if (executionId && workflowId && executionStore?.dismiss) {
        try {
          await executionStore.dismiss(executionId, workflowId);
        } catch {
          // Best-effort durable dismissal
        }
      }
    },

    async startTextGeneration(nodeId) {
      if (isWorkflowReadOnly(get())) return;
      const { generateNodeText } = await import("./text_generation.js");
      await generateNodeText(get, nodeId);
      await scheduleSave(get, { immediate: true });
    },

    /** Splits a storyboard node's upstream story into shots. */
    async startStoryboardSplit(nodeId) {
      if (isWorkflowReadOnly(get())) return;
      const { generateStoryboardShots } = await import("./storyboard_split.js");
      await generateStoryboardShots(get, nodeId);
      await scheduleSave(get, { immediate: true });
    },

    requestStop() {
      set({ run: { ...get().run, stopRequested: true } });
    },

    stopRun() {
      set({ run: { ...get().run, stopRequested: true } });
    },

    dismissRunError() {
      set({ run: { ...get().run, status: "idle", error: null } });
    },

    /** Clears the run-level identity-drift banner; the Batch node keeps its own. */
    dismissIdentityDrift() {
      set({ run: { ...get().run, identityDrift: null } });
    },
  };
}
