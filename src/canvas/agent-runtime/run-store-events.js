/** Event-stream migration into recoverable AgentRun records seam. */

import {
  AGENT_RUN_STATUS,
  AGENT_STEP_STATUS,
  AGENT_STOP_REASON,
  CHANGESET_STATUS,
  createAgentRun,
  createAgentStep,
  createChangeSet,
} from "./run-store-model.js";

/**
 * Build a minimal AgentRun record from an existing event stream (the shape
 * persisted by agentHistory.js / emitted by useAgentLoop). This lets old
 * conversations be inspected as task records without a full runtime rewrite
 * (spec §10: "旧 Agent 会话可读取，但不强制转换为可恢复任务").
 *
 * @param {Array<Object>} events - The agent panel event stream.
 * @param {Object} [opts]
 * @param {string} [opts.objective] - Fallback objective (e.g. first user message).
 * @returns {import("./run-store.js").AgentRun}
 */
export function buildRunsFromEvents(events, opts = {}) {
  const run = createAgentRun({
    objective: opts.objective || "",
    status: AGENT_RUN_STATUS.COMPLETED,
  });

  let step = null;
  for (const event of Array.isArray(events) ? events : []) {
    if (!event || typeof event !== "object") continue;
    const item = event.item;
    if (!item) continue;

    if (item.type === "user_message") {
      // A real user message wins over the caller's fallback objective.
      if (typeof item.text === "string" && item.text) {
        run.objective = item.text;
      }
      continue;
    }

    if (item.type === "command_execution" || item.type === "mcp_tool_call") {
      // A tool call begins a new step on its first emission.
      if (!step || step.toolCalls.some((t) => t.id === item.id)) {
        step = createAgentStep({
          runId: run.id,
          objective: item.command || item.title || "tool step",
          toolCalls: [],
        });
        run.steps.push(step);
      }
      step.toolCalls.push({
        id: item.id,
        command: item.command,
        args: item.arguments,
      });
      run.changeSets.push(
        createChangeSet({
          runId: run.id,
          stepId: step.id,
          toolName: item.command || "",
          args: item.arguments || {},
          result: item.result ?? null,
          error: item.error ?? null,
          status:
            item.status === "failed"
              ? CHANGESET_STATUS.FAILED
              : item.status === "completed"
                ? CHANGESET_STATUS.COMMITTED
                : CHANGESET_STATUS.PENDING,
        }),
      );
      step.status =
        item.status === "failed"
          ? AGENT_STEP_STATUS.FAILED
          : item.status === "completed"
            ? AGENT_STEP_STATUS.COMPLETED
            : AGENT_STEP_STATUS.RUNNING;
    }

    if (item.type === "error") {
      if (item.code === "maxSteps") {
        run.status = AGENT_RUN_STATUS.STOPPED;
        run.stopReason = AGENT_STOP_REASON.MAX_STEPS;
        if (step) {
          step.status = AGENT_STEP_STATUS.STOPPED;
          step.stopReason = AGENT_STOP_REASON.MAX_STEPS;
        }
      } else if (item.code === "stopped") {
        run.status = AGENT_RUN_STATUS.CANCELLED;
        run.stopReason = AGENT_STOP_REASON.CANCELLED;
        if (step) {
          step.status = AGENT_STEP_STATUS.CANCELLED;
          step.stopReason = AGENT_STOP_REASON.CANCELLED;
        }
      } else if (item.code === "budgetExhausted") {
        run.status = AGENT_RUN_STATUS.FAILED;
        run.stopReason = AGENT_STOP_REASON.BUDGET_EXHAUSTED;
        if (step) {
          step.status = AGENT_STEP_STATUS.FAILED;
          step.stopReason = AGENT_STOP_REASON.BUDGET_EXHAUSTED;
        }
      } else if (item.code === "turnFailed") {
        run.status = AGENT_RUN_STATUS.FAILED;
        run.stopReason = AGENT_STOP_REASON.ERROR;
        if (step) {
          step.status = AGENT_STEP_STATUS.FAILED;
          step.stopReason = AGENT_STOP_REASON.ERROR;
        }
      }
    }
  }

  run.updatedAt = Date.now();
  return run;
}
