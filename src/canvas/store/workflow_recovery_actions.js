import { waitForWebRecoveryConnection } from "../agent-runtime/web-recovery-connection.js";
import { refreshWorkflowExecutionRecovery } from "../agent-runtime/workflow-execution-boundary.js";
import { checkSerialExecutionGate } from "../../shared/workflow-execution-contract.js";

/**
 * Durable recovery controls. Every continuation delegates to the same
 * performRun boundary as Run, Batch, and Agent execution.
 */
export function createWorkflowRecoveryActions(
  set,
  get,
  { executionStore, performRun },
) {
  async function resumeDurableExecution({ requireConfirmation }) {
    const recovery = get().run.recovery;
    const allowedStatuses = requireConfirmation
      ? new Set(["awaiting-confirmation", "paused"])
      : new Set(["ready"]);
    const gate = checkSerialExecutionGate({ currentStatus: get().run?.status });
    if (
      !recovery?.executionId ||
      !allowedStatuses.has(recovery.status) ||
      !gate.ok
    ) {
      return { status: "ignored" };
    }
    set({
      run: {
        ...get().run,
        recovery: { ...recovery, status: "resuming" },
      },
    });
    if (recovery.webPlatforms?.length) {
      const workflowId = get().workflowId;
      const isCurrent = () =>
        get().workflowId === workflowId &&
        get().run.recovery?.executionId === recovery.executionId &&
        get().run.recovery?.status === "resuming" &&
        checkSerialExecutionGate({ currentStatus: get().run?.status }).ok;
      try {
        if (!(await waitForWebRecoveryConnection({ isCurrent })))
          return { status: "ignored" };
      } catch (error) {
        if (error?.code !== "extensionRequired") {
          if (isCurrent()) set({ run: { ...get().run, recovery } });
          throw error;
        }
        if (isCurrent())
          set({
            run: {
              ...get().run,
              recovery: {
                ...recovery,
                status: "paused",
                reason: "web-connection-required",
                connectionError: error?.code ?? "generic",
              },
            },
          });
        return { status: "paused" };
      }
      // The user may edit the route while Chrome reconnects. Replan against
      // the current graph before any run or durable-state transition begins.
      await refreshRecovery(workflowId);
      const current = get().run.recovery;
      const paidApprovalMatches =
        requireConfirmation &&
        recovery.reason === "new-paid-submit" &&
        current?.reason === recovery.reason &&
        current.billableCount === recovery.billableCount;

      if (
        get().workflowId !== workflowId ||
        current?.executionId !== recovery.executionId ||
        !(
          current.status === "ready" ||
          (paidApprovalMatches && current.status === "awaiting-confirmation")
        ) ||
        !checkSerialExecutionGate({ currentStatus: get().run?.status }).ok
      )
        return { status: "ignored" };
      set({
        run: { ...get().run, recovery: { ...current, status: "resuming" } },
      });
    }
    const result = await performRun(get, set, executionStore, {
      resumeExecutionId: recovery.executionId,
    });
    return { status: "started", ...result };
  }

  // Kept as a closure so actions inside this factory can call it directly;
  // tests construct a plain get() that does not carry the merged action set.
  async function refreshRecovery(workflowId = get().workflowId) {
    return refreshWorkflowExecutionRecovery({
      executionStore,
      workflowId,
      get,
      set,
    });
  }

  return {
    refreshDurableExecutionRecovery: refreshRecovery,

    /** Resumes only work that cannot create another paid provider task. */
    async autoResumeDurableExecution() {
      return resumeDurableExecution({ requireConfirmation: false });
    },

    /** Continues a recovered run after the user accepts its paid-risk boundary. */
    async confirmDurableExecutionRecovery() {
      return resumeDurableExecution({ requireConfirmation: true });
    },

    /** Hides a resumable recovery for this session without deleting its record. */
    deferDurableExecutionRecovery() {
      set({
        run: {
          ...get().run,
          recoverableExecutionId: null,
          resumeFrom: null,
          recovery: null,
        },
      });
    },

    /**
     * Permanently clears a blocked recovery. `resumeDurableExecution` only
     * accepts `ready`/`awaiting-confirmation` records, so a blocked plan is
     * unreachable by every action; hiding it in memory made the same notice
     * return on each launch. Marks the durable record dismissed and re-reads
     * the snapshot so the next launch stays quiet.
     */
    async dismissBlockedDurableExecution() {
      const recovery = get().run.recovery;
      if (recovery?.status !== "blocked" || !recovery.executionId) {
        return { status: "ignored" };
      }
      const workflowId = get().workflowId;
      try {
        await executionStore.dismiss(recovery.executionId, workflowId);
        await refreshRecovery(workflowId);
      } catch (error) {
        set({ durableExecutionError: error?.message ?? String(error) });
        return { status: "error" };
      }
      return { status: "dismissed" };
    },

    dismissDurableExecutionError() {
      set({ durableExecutionError: null });
    },
  };
}
