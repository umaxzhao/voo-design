/**
 * Headless "Run == one Agent turn" for the Agent Gen node.
 *
 * The node's standing `brief` is the objective; the turn runs through the same
 * React-free pipeline as the panel (`runAgentTurn` + `buildTurnContext`) with a
 * synthetic context: no React state, no UI, FULL_AUTO approval (pressing Run is
 * the authorisation) and a prompt that forbids re-entering this node.
 *
 * @module agent-runtime/agent-node-turn
 */

import {
  APPROVAL_MODE,
  createEmptyUsage,
} from "../components/agent-panel/eventTypes.js";
import { resolveAgentLlmConfig } from "../components/agent-panel/agentLlmConfig.js";
import { AGENT_RUN_STATUS } from "./run-store.js";
import { ensureAgentRegistry } from "./agent-registry-init.js";
import { ensureAgentRunStore } from "./agent-run-store-init.js";
import { buildTurnContext } from "./agent-turn-context.js";
import { runAgentTurn } from "./agent-turn-runner.js";
import {
  formatAgentNodeContext,
  formatAgentResponseLanguage,
} from "../components/agent-panel/useContextAssembly.js";
import { NODE_TYPE, RUN_STATUS } from "../nodes/node_enums.js";
import { RunError } from "../engine/executor_errors.js";
import { getLocale, t } from "../../shared/i18n.js";

/** Steps a single Run turn may take. Kept modest: Run is a one-shot objective. */
const MAX_STEPS_PER_RUN_TURN = 8;

/**
 * The system prompt for a headless run turn. It reuses the panel's node context
 * block (brief + Group + six-channel routing) and adds the no-user rules.
 */
export function buildAgentNodeRunPrompt(agentNodeId, canvasState) {
  const nodeContext = formatAgentNodeContext({
    ...canvasState,
    agentNodeId,
  });
  return `You are VOO AI Assistant running one headless turn for an Agent Gen node.
No user is watching this turn: nobody can answer a question or approve a step.
Do not call request_user_input. Do not ask for confirmation — act.

${nodeContext}

${formatAgentResponseLanguage(canvasState.locale)}

## Run rules
- Use the standing brief above as the objective and deliver the artifact(s).
- Never call run_workflow on the Agent Gen node itself (that is the node running
  you — it would recurse). When you need to execute generators you created,
  call run_workflow with their explicit nodeIds only.
- Nodes you create are adopted into the bound Group automatically; do not spend
  a step wiring them by hand.
- Finish in as few steps as possible: create, then run, then stop.`;
}

/** Canvas snapshot shape the prompt builder and loop expect. */
function snapshotCanvasState(getStore) {
  const store = getStore?.() ?? {};
  return {
    nodes: store.nodes ?? [],
    edges: store.edges ?? [],
    name: store.name ?? "",
    projectBrief: store.projectBrief ?? null,
    projectMemory: store.projectMemory ?? null,
    locale: getLocale(),
    selectedNodes: [],
  };
}

/**
 * Run one headless Agent turn for an Agent Gen node.
 *
 * @param {Object} params
 * @param {string} params.nodeId - The Agent Gen node to run.
 * @param {() => Object} params.getStore - Returns the workflow store state.
 * @param {AbortSignal} [params.signal] - Cancels the turn.
 * @param {(patch: Object) => void} [params.onStage] - Receives node stage text.
 * @returns {Promise<{status: string}>}
 */
export async function runAgentNodeTurn({
  nodeId,
  getStore,
  signal,
  onStage,
} = {}) {
  const store = getStore?.();
  const node = store?.nodes?.find((candidate) => candidate.id === nodeId);
  if (!node || node.type !== NODE_TYPE.AGENT) {
    throw new RunError("nodeMissing", nodeId);
  }
  const objective = String(node.data?.brief ?? "").trim();
  if (!objective) {
    throw new RunError("agentNodeBriefRequired", nodeId, {
      message: "Agent Gen node needs a brief before it can run.",
    });
  }

  const config = await resolveAgentLlmConfig();
  if (!config?.configured || !config?.apiKey) {
    throw new RunError("agentNodeProviderRequired", nodeId, {
      message: "No configured agent model is available for this run.",
    });
  }

  // Bind the session to this node for the duration of the turn so every node
  // the turn creates is adopted into this node's Group. Restore whatever the
  // panel had bound when the turn ends.
  const previousSessionNode = store.agentSessionNodeId ?? null;
  store.setAgentSessionNode?.(nodeId);

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  const setStage = (stage) => onStage?.({ stage });
  const noop = () => {};
  const emit = (event) => {
    // The run banner owns node progress; surface only coarse stages here.
    if (event?.type === "turn.started") setStage("agent_turn");
    if (event?.type === "turn.completed") setStage(null);
  };

  const messagesRef = { current: [] };
  const usageRef = { current: createEmptyUsage() };
  const budgetUsedRef = { current: 0 };
  const activeToolNamesRef = { current: null };
  const reminderSentRef = { current: false };
  const cancelledRef = { current: false };
  const currentRunIdRef = { current: null };
  const currentStepIdRef = { current: null };
  const verifyRetryCountRef = { current: new Map() };
  const observedRevsRef = { current: new Map() };
  const agentModifiedIdsRef = { current: new Set() };
  const staleReplanCountRef = { current: new Map() };
  const pendingPlanFailureRef = { current: null };
  const spentBudgetRef = { current: 0 };
  const approvedBudgetRef = { current: null };
  const pricingTableRef = { current: null };
  const runStoreRef = { current: null };
  const registryRef = { current: null };

  const ctx = buildTurnContext({
    model: config.model,
    reasoningEffort: config.reasoningEffort,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    providerId: config.providerId,
    approvalMode: APPROVAL_MODE.FULL_AUTO,
    assembleSystemPrompt: () =>
      buildAgentNodeRunPrompt(nodeId, snapshotCanvasState(getStore)),
    getCanvasState: () => snapshotCanvasState(getStore),
    // Nobody can approve in a headless run; FULL_AUTO means this is never hit.
    requestApproval: async () => true,
    onRequestUserInput: async () => null,
    getStore,
    tokenBudget: Infinity,
    compactThreshold: 120_000,
    maxStepsPerTurn: MAX_STEPS_PER_RUN_TURN,
    t,
    storagePrefix: null,
    messagesRef,
    usageRef,
    budgetUsedRef,
    activeToolNamesRef,
    reminderSentRef,
    cancelledRef,
    currentRunIdRef,
    currentStepIdRef,
    verifyRetryCountRef,
    observedRevsRef,
    agentModifiedIdsRef,
    staleReplanCountRef,
    pendingPlanFailureRef,
    spentBudgetRef,
    approvedBudgetRef,
    pricingTableRef,
    runStoreRef,
    setBudgetUsed: noop,
    setSpentBudget: noop,
    controller,
    emit,
    ensureRegistry: () =>
      ensureAgentRegistry({
        registryRef,
        pricingTableRef,
        activeToolNamesRef,
        preactivateTools: null,
      }),
    ensureRunStore: () =>
      ensureAgentRunStore({ runStoreRef, storagePrefix: null, getStore }),
    bumpRuns: noop,
    // A canvas glance needs the panel's message plumbing; skip it headlessly.
    glanceAtCanvas: async () => {},
  });

  try {
    await runAgentTurn(objective, {}, ctx);

    const run = currentRunIdRef.current
      ? runStoreRef.current?.getRun(currentRunIdRef.current)
      : null;
    if (run?.status === AGENT_RUN_STATUS.FAILED) {
      const failed = run.stopReason ? ` (${run.stopReason})` : "";
      throw new RunError("generic", nodeId, {
        message: `Agent turn failed${failed}`,
      });
    }
    const status =
      run?.status === AGENT_RUN_STATUS.CANCELLED ||
      run?.status === AGENT_RUN_STATUS.STOPPED
        ? RUN_STATUS.SKIPPED
        : RUN_STATUS.SUCCESS;
    return { status, runId: currentRunIdRef.current ?? null };
  } finally {
    if (signal) signal.removeEventListener("abort", onAbort);
    store.setAgentSessionNode?.(previousSessionNode);
  }
}
