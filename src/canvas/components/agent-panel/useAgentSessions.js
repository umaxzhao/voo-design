import { useState, useCallback, useEffect, useRef } from "react";
import {
  createEmptySession,
  loadStoredSessions,
  saveStoredSessions,
  upsertSession,
  deleteSessionFromList,
} from "./agentHistory.js";
import { useWorkflowStore } from "../../store/workflow_store.js";

const SESSION_PERSIST_INTERVAL_MS = 500;

/**
 * Surfaces a session-history write failure through the existing localized save-error contract.
 *
 * `saveStoredSessions` already returns a structured outcome (`agentHistory.js:82`) and the banner
 * already knows how to render one: `banner_state.js:21` maps either `"quota_exceeded"` or an object
 * whose `.code` is that, to `quotaExceeded`, which `run_banner.jsx:144` renders as the localized
 * `error.quotaExceeded`. Any other failure code already falls through to the generic `saveError`
 * banner, so this needs no new state, no new string, and no banner change.
 *
 * Every other persistence path already reports here — `agent-turn-runner.js:102` and `:218`,
 * `agent-session.js:56`, `agent-run-store-init.js:29`. This one discarded the outcome, so a quota
 * failure lost a conversation with no indication at all.
 *
 * SUCCESS IS A DELIBERATE NO-OP, and must stay one. `setSaveError` is an unconditional
 * `set({ saveError })` with no ownership token, so clearing it here would erase an unrelated
 * in-flight error raised by another path (`persistence.js:345`, `save-queue.js:18`,
 * `workflow_documents.js:513`). History writes are debounced, so a clear-on-success would race those
 * on every turn. The cost is that a history failure stays until another path overwrites it or the
 * user dismisses it (`run_banner.jsx` offers a close action).
 *
 * The store call is deliberately NOT optional-chained: `useWorkflowStore.getState().setSaveError` is
 * a required part of the store this module already depends on, so a missing method should fail loudly
 * here rather than silently swallow a persistence failure — which is the very bug this fixes.
 *
 * @param {{ ok?: boolean, code?: string, error?: string } | undefined} outcome as returned by
 *   `saveStoredSessions`
 * @returns {void}
 *
 * Exported so `tests/agent_history_save_error.test.js` can exercise this exact function against the
 * real banner contract. The hook's own signature is unchanged.
 */
export function reportHistorySaveFailure(outcome) {
  if (!outcome || outcome.ok !== false) return;
  useWorkflowStore.getState().setSaveError(outcome);
}

/**
 * Initial state for a namespace. A node-bound session resumes that node's most
 * recent stored conversation, so switching nodes (which remounts the panel)
 * does not silently start over. The global panel keeps its existing
 * fresh-session behaviour.
 */
function initialSessionState(agentNodeId) {
  const stored = loadStoredSessions(agentNodeId);
  if (agentNodeId && stored.length > 0) {
    return {
      sessions: stored,
      currentSessionId: stored[0].id,
      resume: stored[0],
    };
  }
  return {
    sessions: stored,
    currentSessionId: createEmptySession(undefined, agentNodeId).id,
    resume: null,
  };
}

export function useAgentSessions({
  events,
  messages,
  budgetUsed = 0,
  spentBudget = 0,
  isRunning,
  reset,
  setSessionState,
  stickToBottomRef,
  setReviews,
  setLayoutItems,
  reviewEventsSeenRef,
  setHistoryOpen,
  agentNodeId = null,
}) {
  // The node id namespaces the stored session list, so an Agent node's chat
  // history never mixes with the global panel or another node's.
  const initialRef = useRef(null);
  if (initialRef.current === null) {
    initialRef.current = initialSessionState(agentNodeId);
  }
  const [sessions, setSessions] = useState(initialRef.current.sessions);
  const [currentSessionId, setCurrentSessionId] = useState(
    initialRef.current.currentSessionId,
  );
  const persistAtRef = useRef(0);
  const persistTimerRef = useRef(null);
  // The throttle timer can outlive the render that armed it, so the snapshot it will write is held
  // here and refreshed on every effect run. Without this, a render arriving while a timer is pending
  // is discarded whole: the timer fires holding the values captured when it was armed, and nothing
  // later corrects it, because React will not re-run the effect for unchanged dependencies.
  const pendingRef = useRef(null);
  // The persist step, kept reachable from `handleNewChat` so a session switch can commit the
  // outgoing session's pending turn instead of dropping it.
  const persistNowRef = useRef(null);
  // Sessions and the active id as of the last commit, used to avoid re-inserting a removed one.
  const latestRef = useRef({ sessions, currentSessionId });

  // Restore the resumed conversation once, after the loop's setSessionState is
  // available. Guarded by a ref so it never re-runs and clobbers live state.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (resumedRef.current) return;
    resumedRef.current = true;
    const resume = initialRef.current?.resume;
    if (!resume) return;
    setSessionState({
      events: resume.events || [],
      messages: resume.messages || [],
      budget: resume.budget,
      spentBudget: resume.spentBudget,
    });
  }, [setSessionState]);

  useEffect(() => {
    latestRef.current = { sessions, currentSessionId };
  }, [sessions, currentSessionId]);

  useEffect(() => {
    if (events.length === 0) return;
    // Refresh the pending snapshot on EVERY run, including the throttled path below that returns
    // early. The timer then writes the newest turn rather than the one it was armed with. The 500 ms
    // cadence itself is untouched: only the source of the written values changed.
    pendingRef.current = {
      id: currentSessionId,
      agentNodeId,
      events,
      messages,
      budget: budgetUsed,
      spentBudget,
    };
    const persistNow = () => {
      const pending = pendingRef.current;
      if (!pending) return;
      pendingRef.current = null;
      // A snapshot whose session is neither stored nor active has been removed; re-inserting it
      // would resurrect a deleted conversation.
      const { sessions: known, currentSessionId: active } = latestRef.current;
      if (pending.id !== active && !known.some((s) => s.id === pending.id))
        return;
      persistAtRef.current = Date.now();
      setSessions((prev) => {
        const next = upsertSession(prev, {
          id: pending.id,
          agentNodeId: pending.agentNodeId,
          events: pending.events,
          messages: pending.messages,
          budget: pending.budget,
          spentBudget: pending.spentBudget,
        });
        reportHistorySaveFailure(saveStoredSessions(next, agentNodeId));
        return next;
      });
    };
    persistNowRef.current = persistNow;
    const elapsed = Date.now() - persistAtRef.current;
    if (elapsed >= SESSION_PERSIST_INTERVAL_MS) {
      persistNow();
      return;
    }
    if (persistTimerRef.current) return;
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      persistNow();
    }, SESSION_PERSIST_INTERVAL_MS - elapsed);
  }, [
    events,
    messages,
    budgetUsed,
    spentBudget,
    currentSessionId,
    agentNodeId,
  ]);

  useEffect(
    () => () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    },
    [],
  );

  /**
   * Commit any outstanding write before the active session changes.
   *
   * Both session-switching entry points call this, so neither can drop the conversation it is
   * leaving. The timer is disarmed rather than left to fire, because the snapshot it holds is
   * exactly what has just been committed; a later render for the incoming session re-arms it.
   */
  const flushPending = useCallback(() => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    persistNowRef.current?.();
  }, []);

  const handleNewChat = useCallback(() => {
    if (isRunning) return;
    flushPending();
    const fresh = createEmptySession(undefined, agentNodeId);
    setCurrentSessionId(fresh.id);
    if (stickToBottomRef) stickToBottomRef.current = true;
    setReviews({});
    setLayoutItems([]);
    if (reviewEventsSeenRef) reviewEventsSeenRef.current = new Set();
    reset();
    setHistoryOpen(false);
  }, [
    flushPending,
    isRunning,
    reset,
    setHistoryOpen,
    setLayoutItems,
    setReviews,
    stickToBottomRef,
    reviewEventsSeenRef,
    agentNodeId,
  ]);

  const handleSelectSession = useCallback(
    (sess) => {
      if (isRunning) return;
      // Without this, the next effect replaces the pending snapshot with the session being switched
      // TO, and the session being left never receives its newest turn.
      flushPending();
      setCurrentSessionId(sess.id);
      if (stickToBottomRef) stickToBottomRef.current = true;
      setReviews({});
      setLayoutItems([]);
      if (reviewEventsSeenRef) reviewEventsSeenRef.current = new Set();
      setSessionState({
        events: sess.events || [],
        messages: sess.messages || [],
        budget: sess.budget,
        spentBudget: sess.spentBudget,
      });
      setHistoryOpen(false);
    },
    [
      flushPending,
      isRunning,
      setHistoryOpen,
      setLayoutItems,
      setReviews,
      setSessionState,
      stickToBottomRef,
      reviewEventsSeenRef,
    ],
  );

  const handleDeleteSession = useCallback(
    (e, sessId) => {
      e.stopPropagation();
      // Discard any outstanding write for the session being removed, so neither the pending timer
      // nor a later flush can re-insert it after the delete.
      if (pendingRef.current?.id === sessId) pendingRef.current = null;
      setSessions((prev) => {
        const next = deleteSessionFromList(prev, sessId);
        reportHistorySaveFailure(saveStoredSessions(next, agentNodeId));
        return next;
      });
      if (currentSessionId === sessId) {
        handleNewChat();
      }
    },
    [currentSessionId, handleNewChat, agentNodeId],
  );

  return {
    sessions,
    setSessions,
    currentSessionId,
    setCurrentSessionId,
    handleNewChat,
    handleSelectSession,
    handleDeleteSession,
  };
}
