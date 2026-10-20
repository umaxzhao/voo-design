/**
 * Agent Tool Stage — tool execution, approval gating, verified dispatch, and cost accounting.
 *
 * React-free module: all callbacks, stores, and registries are injected.
 *
 * @module agent-runtime/agent-tool-stage
 */

import {
  createToolError,
  TOOL_ERROR_CODE,
} from "../components/agent-panel/tools/errors.js";
import { assertCanDispatchTool } from "../../shared/workflow-execution-contract.js";
import {
  runVerifier,
  MAX_VERIFY_RETRIES,
} from "../components/agent-panel/verifier.js";
import {
  AGENT_RUN_STATUS,
  AGENT_STEP_STATUS,
  AGENT_STOP_REASON,
} from "./run-store.js";
import { dispatchAgentTool } from "./agent-loop-controller.js";

/**
 * Safely parses the JSON arguments from an LLM tool call delta/record.
 */
export function parseToolArguments(toolCall) {
  try {
    const args = JSON.parse(toolCall.function.arguments);
    return { ok: true, args };
  } catch {
    return {
      ok: false,
      args: {},
      error: createToolError(
        TOOL_ERROR_CODE.ARGS_INVALID,
        `Failed to parse arguments: ${toolCall.function.arguments}`,
        {
          missing: { args: [] },
          suggestion: {
            tool: "request_user_input",
            args: {},
            note: "Ask the user to clarify the arguments, then retry the tool call.",
          },
        },
      ),
    };
  }
}

/**
 * Checks approval policy and prompts user if required by policy.
 */
export async function checkApprovalGating({
  registry,
  toolName,
  approvalMode,
  requestApproval,
  toolCallId,
  args,
  costInfo,
  signal,
  isCancelled,
  executionStatus,
}) {
  if (registry.needsApproval(toolName, approvalMode)) {
    const approved = await requestApproval?.(
      toolCallId,
      toolName,
      args,
      costInfo,
    );
    const postApprovalCheck = assertCanDispatchTool({
      signal,
      isCancelled,
      executionStatus,
    });
    if (!postApprovalCheck.canDispatch) {
      return {
        approved: false,
        aborted: true,
        reason: postApprovalCheck.error?.message || "Operation cancelled",
      };
    }
    if (!approved) {
      return {
        approved: false,
        aborted: false,
        denialResult: {
          success: false,
          error: createToolError(
            TOOL_ERROR_CODE.DENIED_BY_USER,
            "User denied this operation.",
            {
              missing: { approval: ["user"] },
              suggestion: {
                tool: null,
                args: {},
                note: "Explain what you were about to do and ask the user how to proceed.",
              },
            },
          ),
        },
      };
    }
  }

  return { approved: true };
}

/**
 * Dispatches tool through the injected dispatcher and executes the verifier if configured.
 */
export async function executeToolWithVerification({
  toolDispatcher,
  toolName,
  args,
  toolContext,
  toolCapabilities,
  verifyRetryCount,
  preExecutionState,
  undoData,
  runId,
  runStore,
  currentStepId,
  registry,
  getStore,
  changeSetId,
}) {
  let result = await dispatchAgentTool({
    toolDispatcher,
    toolName,
    args,
    context: toolContext,
  });

  let verifyOutcome = null;
  let stepVerificationFailure = false;
  let verificationExceededFailed = false;
  let verificationFailureIssues = [];

  if (result.success && toolCapabilities?.verify) {
    const currentRetries = verifyRetryCount.get(toolName) || 0;
    verifyOutcome = await runVerifier({
      toolName,
      args,
      result: result.result || result,
      context: {
        ...toolContext,
        preExecutionState,
        undoData,
        store: getStore ? getStore() : null,
        changeSetId,
        runId,
        runStore,
      },
      registry,
      retryCount: currentRetries,
    });

    if (verifyOutcome && verifyOutcome.status === "unverifiable") {
      verifyRetryCount.delete(toolName);
      if (currentStepId) {
        runStore.updateStep(runId, currentStepId, {
          verification: {
            ok: false,
            verified: false,
            canContinue: true,
            status: "unverifiable",
            unverified: true,
            issues: verifyOutcome.issues || [],
          },
        });
      }
      result = {
        ...result,
        verified: false,
        canContinue: true,
        unverified: true,
        verificationStatus: "unverifiable",
      };
    } else if (
      verifyOutcome &&
      verifyOutcome.status === "needs_human_judgment"
    ) {
      verifyRetryCount.delete(toolName);
      if (currentStepId) {
        runStore.updateStep(runId, currentStepId, {
          verification: {
            ok: false,
            verified: false,
            canContinue: true,
            status: "needs_human_judgment",
            issues: verifyOutcome.issues || [],
          },
        });
      }
      result = {
        ...result,
        verified: false,
        canContinue: true,
        verificationStatus: "needs_human_judgment",
        issues: verifyOutcome.issues || [],
      };
    } else if (
      verifyOutcome &&
      (!verifyOutcome.canContinue || !verifyOutcome.ok)
    ) {
      const nextRetry = currentRetries + 1;
      verifyRetryCount.set(toolName, nextRetry);

      if (nextRetry > MAX_VERIFY_RETRIES) {
        verificationExceededFailed = true;
        verificationFailureIssues = verifyOutcome.issues || [];
        if (currentStepId) {
          runStore.updateStep(runId, currentStepId, {
            status: AGENT_STEP_STATUS.FAILED,
            stopReason: AGENT_STOP_REASON.ERROR,
            verification: {
              ok: false,
              verified: false,
              canContinue: false,
              status: "failed",
              issues: verifyOutcome.issues,
              retries: nextRetry,
              maxRetries: MAX_VERIFY_RETRIES,
              failed: true,
            },
          });
        }
        runStore.updateRun(runId, {
          status: AGENT_RUN_STATUS.FAILED,
          stopReason: AGENT_STOP_REASON.ERROR,
          issues: verifyOutcome.issues,
        });
      } else {
        stepVerificationFailure = true;
        if (currentStepId) {
          runStore.updateStep(runId, currentStepId, {
            verification: {
              ok: false,
              verified: false,
              canContinue: false,
              status: "failed",
              issues: verifyOutcome.issues,
              retries: nextRetry,
              maxRetries: MAX_VERIFY_RETRIES,
            },
          });
        }
      }

      result = {
        ...result,
        success: false,
        ok: false,
        verified: false,
        canContinue: false,
        verificationStatus: "failed",
        issues: verifyOutcome.issues,
        error: createToolError(
          TOOL_ERROR_CODE.OPERATION_FAILED || "VERIFICATION_FAILED",
          `Verification failed (${verifyOutcome.issues.length} issue(s)): ${verifyOutcome.issues.map((i) => i.evidence || i.message || JSON.stringify(i)).join("; ")}. Please correct and retry.`,
          {
            suggestion: {
              tool: toolName,
              args,
              note:
                verifyOutcome.issues
                  .map((i) => i.suggestion)
                  .filter(Boolean)
                  .join("; ") || "Fix verification issues and retry.",
            },
          },
        ),
        result: {
          ...(result.result || {}),
          ok: false,
          verified: false,
          canContinue: false,
          issues: verifyOutcome.issues,
        },
      };
    } else if (verifyOutcome && verifyOutcome.ok) {
      verifyRetryCount.delete(toolName);
      if (currentStepId) {
        runStore.updateStep(runId, currentStepId, {
          verification: {
            ok: true,
            verified: true,
            canContinue: true,
            status: "verified",
            issues: [],
          },
        });
      }
      result = {
        ...result,
        verified: true,
        canContinue: true,
        verificationStatus: "verified",
      };
    }
  }

  return {
    result,
    verifyOutcome,
    stepVerificationFailure,
    verificationExceededFailed,
    verificationFailureIssues,
  };
}

/**
 * Calculates final monetary cost from tool execution receipt or fallback estimation.
 */
export function computeFinalCost(result, estCost, isCostEstimated) {
  const actualCredits =
    result.creditsCharged ??
    result.result?.creditsCharged ??
    result.result?.credits ??
    result.credits ??
    (result.headers?.get
      ? result.headers.get("x-voo-credits-charged")
      : null) ??
    result.headers?.["x-voo-credits-charged"] ??
    result.headers?.["X-VOO-Credits-Charged"] ??
    null;

  if (
    actualCredits !== null &&
    actualCredits !== undefined &&
    !isNaN(Number(actualCredits))
  ) {
    return {
      finalCost: Number(actualCredits),
      finalEstimated: false,
    };
  }

  return {
    finalCost: estCost,
    finalEstimated: isCostEstimated,
  };
}
