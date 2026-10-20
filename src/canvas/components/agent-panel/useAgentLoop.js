/**
 * Agent Loop — the core turn/step/tool-dispatch cycle.
 *
 * Adapted from Codex's agent loop pattern:
 *   Turn = user input → zero or more Steps
 *   Step = one LLM request + tool dispatch
 *   Loop continues while the model emits tool calls.
 *
 * Key design decisions (from Codex harness analysis):
 *   - Stateless requests: full history sent every step (no previous_response_id)
 *   - Token usage: track consumption, with an optional explicit session cap
 *   - Context compaction: summarize old turns when the window fills
 *   - Deferred tool discovery: core tools always visible, specialized tools
 *     found on demand via tool_search (Codex ToolExposure::Deferred)
 *   - Approval gates: pause for user confirmation based on policy
 *   - Streaming: text deltas render immediately; tool calls buffer then execute
 *   - Session persistence: restore the conversation after a reload
 *
 * Everything except the React state bridging is headless: the turn pipeline
 * lives in src/canvas/agent-runtime/agent-turn-runner.js (+ siblings), and
 * run control, review resolution, session persistence, the run-store init,
 * and the canvas glance are React-free modules under src/canvas/agent-runtime/
 * wired here through injected refs, config, and callbacks.
 *
 * @module agent-panel/useAgentLoop
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { APPROVAL_MODE, createEmptyUsage } from "./eventTypes.js";
import { useSendMessage } from "./useAgentSendMessage.js";
import { getWorkflowExecutionState } from "../../../shared/workflow-execution-contract.js";
import { ensureAgentRunStore } from "../../agent-runtime/agent-run-store-init.js";
import { ensureAgentRegistry } from "../../agent-runtime/agent-registry-init.js";
import { glanceAtCanvasNow } from "../../agent-runtime/agent-canvas-glance.js";
import {
  abandonAgentRun,
  cancelAgentTurn,
  pauseAgentRun,
  resumeAgentRun,
  takeoverAgentRun,
} from "../../agent-runtime/agent-run-control.js";
import { resolveAgentReview } from "../../agent-runtime/agent-review-resolution.js";
import { mergeReplan } from "../../agent-runtime/plan-model.js";
import {
  emitAgentEvent,
  persistSession,
  resetAgentSession,
  restoreAgentSession,
  setAgentSessionState,
} from "../../agent-runtime/agent-session.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum steps per turn to prevent infinite tool-call loops. */
const MAX_STEPS_PER_TURN = 20;

/** Cumulative usage is not a context limit; long sessions are uncapped by default. */
const DEFAULT_TOKEN_BUDGET = Infinity;

/** Compact when a single request's input tokens exceed this (DeepSeek 256K context, leave margin). */
const DEFAULT_COMPACT_THRESHOLD = 120_000;

/** Persistence key prefix; full key = `${prefix}:messages` / `${prefix}:events`. */
const DEFAULT_STORAGE_PREFIX = "voo.agent";

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * React hook providing the agent loop interface.
 *
 * @param {Object} options
 * @param {string} options.apiKey - DeepSeek API key.
 * @param {string} [options.model] - Model name override.
 * @param {string} [options.baseUrl] - API base URL override.
 * @param {string} [options.approvalMode] - One of APPROVAL_MODE values.
 * @param {(messages: Array, canvasState: Object) => string} options.assembleSystemPrompt
 * @param {() => Object} options.getCanvasState - Snapshot current canvas for context.
 * @param {(callId: string, toolName: string, args: Object) => Promise<boolean>} options.requestApproval
 * @param {() => Object} [options.getStore] - Returns the workflow store state for tool execution.
 * @param {number} [options.tokenBudget] - Optional total token cap (default unlimited).
 * @param {number} [options.compactThreshold] - Compact when input tokens exceed this (default 120K).
 * @param {number} [options.maxStepsPerTurn] - Maximum model/tool steps per turn (default 20).
 * @param {string[]} [options.preactivateTools] - Deferred tool names to activate
 *   without a tool_search round trip. The goal mode uses this so the tool its
 *   pipeline depends on (generate_layout for Design) is
 *   in the very first request instead of costing a discovery step.
 * @param {string} [options.storagePrefix] - localStorage prefix for session persistence.
 * @returns {AgentLoopInterface}
 */
export function useAgentLoop({
  apiKey,
  model,
  reasoningEffort,
  baseUrl,
  approvalMode = APPROVAL_MODE.AUTO_CREATE,
  providerId,
  assembleSystemPrompt,
  getCanvasState,
  requestApproval,
  requestPlanApproval,
  planReviewEnabled = false,
  getStore,
  onRequestUserInput,
  approvedBudget = null,
  pricingTable = null,
  tokenBudget = DEFAULT_TOKEN_BUDGET,
  compactThreshold = DEFAULT_COMPACT_THRESHOLD,
  maxStepsPerTurn = MAX_STEPS_PER_TURN,
  preactivateTools = null,
  storagePrefix = DEFAULT_STORAGE_PREFIX,
  // Run history persists under its own prefix even when the session prefix is
  // null (AgentPanel passes null and relies on this). Pass runStoragePrefix:
  // null explicitly for a memory-only run store.
  runStoragePrefix = storagePrefix ?? "voo.agent.runs",
  registry = null,
}) {
  const [events, setEvents] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [budgetUsed, setBudgetUsed] = useState(0);
  const [spentBudget, setSpentBudget] = useState(0);
  const spentBudgetRef = useRef(0);
  const approvedBudgetRef = useRef(approvedBudget);
  approvedBudgetRef.current = approvedBudget;
  const pricingTableRef = useRef(pricingTable);
  pricingTableRef.current = pricingTable;
  const abortRef = useRef(null);
  /** The canvas thumbnail the model has already been shown, if any. */
  const lastGlanceRef = useRef(null);
  /** Set by cancel() so the loop can tell a user stop from a normal finish. */
  const cancelledRef = useRef(false);
  const registryRef = useRef(registry);
  if (registry && !registryRef.current) registryRef.current = registry;
  const messagesRef = useRef([]);
  const usageRef = useRef(createEmptyUsage());
  /** Cumulative input+output tokens across the session. */
  const budgetUsedRef = useRef(0);
  /** Tool names active in requests: direct tools + deferred tools found by search. */
  const activeToolNamesRef = useRef(null);
  const reminderSentRef = useRef(false);

  // ── Task records (AgentRun/AgentStep/ChangeSet) ────────────────────────────
  /** Persistent store of recoverable task records; created on first use. */
  const runStoreRef = useRef(null);
  const currentRunIdRef = useRef(null);
  const currentStepIdRef = useRef(null);
  const verifyRetryCountRef = useRef(new Map());
  const observedRevsRef = useRef(new Map());
  const agentModifiedIdsRef = useRef(new Set());
  const staleReplanCountRef = useRef(new Map());
  // Deferred plan-step failure: set when a tool fails on an in_progress plan
  // step, cleared when the model retries that tool or replans, and applied
  // only when the turn ends without a retry (see the run-close section).
  const pendingPlanFailureRef = useRef(null);
  /** Bumped after every run-store mutation so consumers see fresh lists. */
  const [runsVersion, setRunsVersion] = useState(0);

  const ensureRunStore = useCallback(
    () =>
      ensureAgentRunStore({
        runStoreRef,
        storagePrefix: runStoragePrefix,
        getStore,
      }),
    [getStore, runStoragePrefix],
  );

  const bumpRuns = useCallback(() => setRunsVersion((v) => v + 1), []);

  // Hydrate the task center as soon as the hook mounts, rather than waiting
  // for the first chat message. This also marks orphaned in-flight runs after
  // an app restart while keeping the execution loop independent of panel UI.
  useEffect(() => {
    ensureRunStore();
    bumpRuns();
  }, [ensureRunStore, bumpRuns]);

  const persist = useCallback(
    () =>
      persistSession({
        storagePrefix,
        messagesRef,
        budgetUsedRef,
        events,
        getStore,
      }),
    [storagePrefix, events, getStore],
  );

  const ensureRegistry = useCallback(
    () =>
      ensureAgentRegistry({
        registryRef,
        pricingTableRef,
        activeToolNamesRef,
        preactivateTools,
      }),
    [preactivateTools],
  );

  /**
   * Emit an event to the UI layer and persist.
   */
  const emit = useCallback(
    (event) => emitAgentEvent({ setEvents, storagePrefix }, event),
    [storagePrefix],
  );

  const glanceAtCanvas = useCallback(
    (note, { mergeIntoLast = false } = {}) =>
      glanceAtCanvasNow({
        note,
        mergeIntoLast,
        approvalMode,
        apiKey,
        providerId,
        model,
        getStore,
        lastGlanceRef,
        messagesRef,
      }),
    [apiKey, providerId, model, approvalMode, getStore],
  );

  /**
   * Send a user message and run the full agent turn (see useAgentSendMessage).
   */
  const sendMessage = useSendMessage({
    isRunning,
    setIsRunning,
    abortRef,
    cancelledRef,
    persist,
    model,
    reasoningEffort,
    apiKey,
    baseUrl,
    providerId,
    approvalMode,
    assembleSystemPrompt,
    getCanvasState,
    requestApproval,
    requestPlanApproval,
    planReviewEnabled,
    getStore,
    onRequestUserInput,
    tokenBudget,
    compactThreshold,
    maxStepsPerTurn,
    storagePrefix,
    messagesRef,
    usageRef,
    budgetUsedRef,
    activeToolNamesRef,
    reminderSentRef,
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
    setBudgetUsed,
    setSpentBudget,
    emit,
    ensureRegistry,
    ensureRunStore,
    bumpRuns,
    glanceAtCanvas,
  });

  /** Cancel the current turn. */
  const cancel = useCallback(
    () =>
      cancelAgentTurn({
        cancelledRef,
        abortRef,
        runStoreRef,
        currentRunIdRef,
        bumpRuns,
      }),
    [bumpRuns],
  );

  const resumeRun = useCallback(
    (runId) =>
      resumeAgentRun(runId, {
        isRunning,
        ensureRunStore,
        sendMessage,
        getStore,
      }),
    [ensureRunStore, getStore, isRunning, sendMessage],
  );

  const abandonRun = useCallback(
    (runId) => abandonAgentRun(runId, { ensureRunStore, bumpRuns }),
    [bumpRuns, ensureRunStore],
  );

  const pauseRun = useCallback(
    (runId = currentRunIdRef.current) =>
      pauseAgentRun(runId, { ensureRunStore, bumpRuns }),
    [bumpRuns, ensureRunStore],
  );

  const takeoverRun = useCallback(
    (runId) => takeoverAgentRun(runId, { ensureRunStore, resumeRun }),
    [ensureRunStore, resumeRun],
  );

  /**
   * Resolve a plan review whose live in-memory promise is gone (the page was
   * reloaded while the run waited on the gate). The pending review is
   * persisted on the AgentRun, so the card can still act on it: cancel stops
   * the run; approve / edit-and-run applies the plan and resumes via the same
   * run-center path (`resumeAgentRun`).
   */
  const applyPersistedPlanReview = useCallback(
    (runId, decision) => {
      const store = ensureRunStore();
      const run = store.getRun(runId);
      if (!run || !run.planReview?.pending) return false;

      if (!decision?.approved) {
        store.updateRun(runId, {
          planReview: {
            ...run.planReview,
            pending: false,
            cancelledAt: Date.now(),
          },
        });
        abandonAgentRun(runId, { ensureRunStore, bumpRuns });
        return true;
      }

      let plan = run.plan;
      if (Array.isArray(decision.editedSteps) && decision.editedSteps.length > 0) {
        try {
          plan = mergeReplan(run.plan, decision.editedSteps);
        } catch {
          return false;
        }
      }
      store.updateRun(runId, {
        plan,
        planReview: { pending: false, plan, approvedAt: Date.now() },
      });
      bumpRuns();
      void resumeRun(runId);
      return true;
    },
    [bumpRuns, ensureRunStore, resumeRun],
  );

  const resolveReview = useCallback(
    (toolCallId, accepted, options = {}) =>
      resolveAgentReview(toolCallId, accepted, options, {
        runStoreRef,
        getStore,
        bumpRuns,
        emit,
      }),
    [emit, bumpRuns, getStore],
  );

  /** Clear conversation history and events. */
  const reset = useCallback(
    () =>
      resetAgentSession({
        storagePrefix,
        messagesRef,
        usageRef,
        budgetUsedRef,
        spentBudgetRef,
        reminderSentRef,
        activeToolNamesRef,
        cancelledRef,
        currentRunIdRef,
        currentStepIdRef,
        observedRevsRef,
        agentModifiedIdsRef,
        staleReplanCountRef,
        setBudgetUsed,
        setSpentBudget,
        setEvents,
      }),
    [storagePrefix],
  );

  /** Restore a saved session. */
  const setSessionState = useCallback(
    (payload) =>
      setAgentSessionState(
        {
          messagesRef,
          usageRef,
          budgetUsedRef,
          reminderSentRef,
          cancelledRef,
          activeToolNamesRef,
          setBudgetUsed,
          setEvents,
        },
        payload,
      ),
    [],
  );

  /** Try to restore a persisted session; returns true if one existed. */
  const restoreSession = useCallback(
    () => restoreAgentSession({ storagePrefix, setSessionState }),
    [storagePrefix, setSessionState],
  );

  return {
    events,
    messages: messagesRef.current,
    isRunning,
    sendMessage,
    cancel,
    reset,
    setSessionState,
    restoreSession,
    budgetUsed,
    tokenBudget,
    spentBudget,
    approvedBudget: approvedBudgetRef.current,
    observedRevs: observedRevsRef.current,
    /** Persistent task records (AgentRun), newest first. */
    runs: runStoreRef.current?.listRuns() ?? [],
    /** The AgentRun backing the current turn, or null. */
    activeRun: currentRunIdRef.current
      ? (runStoreRef.current?.getRun(currentRunIdRef.current) ?? null)
      : null,
    /** Current workflow execution state derived canonically from activeRun. */
    executionState: currentRunIdRef.current
      ? getWorkflowExecutionState(
          runStoreRef.current?.getRun(currentRunIdRef.current),
        )
      : null,
    /** Bumped on every run-store mutation — include in deps to re-read runs. */
    runsVersion,
    /** Resolve a pending auto-review: accept or mark-for-revert. */
    resolveReview,
    resumeRun,
    abandonRun,
    takeoverRun,
    pauseRun,
    /** Resolve a plan review recovered from a reloaded run record. */
    applyPersistedPlanReview,
  };
}
