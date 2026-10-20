/**
 * Session state for the agent loop: the event emitter, and
 * persist/reset/restore of the conversation, event list, and budget against
 * localStorage.
 *
 * Extracted from useAgentLoop (AO3c). React-free: state lives in injected ref
 * cells, React state updates through injected setters.
 *
 * @module agent-runtime/agent-session
 */

import { restoreSessionAccounting } from "./agent-session-accounting.js";
import { createEmptyUsage } from "../components/agent-panel/eventTypes.js";

/** Append an event to the UI event log and persist it best-effort. */
export function emitAgentEvent({ setEvents, storagePrefix }, event) {
  setEvents((prev) => {
    const next = [...prev, event];
    if (storagePrefix) {
      try {
        localStorage.setItem(`${storagePrefix}:events`, JSON.stringify(next));
      } catch {
        // best-effort
      }
    }
    return next;
  });
}

/** Persist messages/events/budget best-effort; surface quota failures. */
export function persistSession({
  storagePrefix,
  messagesRef,
  budgetUsedRef,
  events,
  getStore,
}) {
  if (!storagePrefix) return;
  try {
    localStorage.setItem(
      `${storagePrefix}:messages`,
      JSON.stringify(messagesRef.current),
    );
    localStorage.setItem(`${storagePrefix}:events`, JSON.stringify(events));
    localStorage.setItem(
      `${storagePrefix}:budget`,
      String(budgetUsedRef.current),
    );
  } catch (err) {
    const isQuota =
      err?.name === "QuotaExceededError" ||
      err?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      /quota/i.test(err?.message || "");
    getStore?.()?.setSaveError?.(isQuota ? "quota_exceeded" : true);
  }
}

/**
 * Seed a ref cell with the persisted monetary spend (best-effort).
 *
 * `createCostRecorder` writes `${storagePrefix}:spentBudget` on every charge,
 * so a reload must read it back or the approved budget check restarts at zero.
 * Only a fresh mount (ref still 0) adopts the stored value: a live session
 * already holds the true spend and must never be lowered by a stale write.
 */
export function restoreSpentBudget({
  storagePrefix,
  spentBudgetRef,
  setSpentBudget,
} = {}) {
  if (!storagePrefix || !spentBudgetRef) return false;
  if (spentBudgetRef.current > 0) return false;
  try {
    const raw = localStorage.getItem(`${storagePrefix}:spentBudget`);
    if (raw == null) return false;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return false;
    spentBudgetRef.current = value;
    setSpentBudget?.(value);
    return true;
  } catch {
    return false;
  }
}

/** Clear conversation history and events. */
export function resetAgentSession({
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
}) {
  messagesRef.current = [];
  usageRef.current = createEmptyUsage();
  budgetUsedRef.current = 0;
  setBudgetUsed(0);
  spentBudgetRef.current = 0;
  setSpentBudget(0);
  reminderSentRef.current = false;
  activeToolNamesRef.current = null;
  cancelledRef.current = false;
  currentRunIdRef.current = null;
  currentStepIdRef.current = null;
  observedRevsRef.current.clear();
  agentModifiedIdsRef.current.clear();
  staleReplanCountRef.current.clear();
  setEvents([]);
  if (storagePrefix) {
    try {
      localStorage.removeItem(`${storagePrefix}:messages`);
      localStorage.removeItem(`${storagePrefix}:events`);
      localStorage.removeItem(`${storagePrefix}:budget`);
      localStorage.removeItem(`${storagePrefix}:spentBudget`);
    } catch {
      // best-effort
    }
  }
}

/** Restore a saved session. */
export function setAgentSessionState(
  {
    messagesRef,
    usageRef,
    budgetUsedRef,
    spentBudgetRef,
    reminderSentRef,
    cancelledRef,
    activeToolNamesRef,
    setBudgetUsed,
    setSpentBudget,
    setEvents,
  },
  {
    events: nextEvents = [],
    messages: nextMessages = [],
    budget,
    spentBudget,
  } = {},
) {
  const accounting = restoreSessionAccounting({
    events: nextEvents,
    budget,
    spentBudget,
  });
  messagesRef.current = [...nextMessages];
  usageRef.current = accounting.usage;
  budgetUsedRef.current = accounting.budget;
  setBudgetUsed(accounting.budget);
  if (spentBudgetRef) {
    spentBudgetRef.current = accounting.spentBudget;
    setSpentBudget?.(accounting.spentBudget);
  }
  reminderSentRef.current = false;
  cancelledRef.current = false;
  activeToolNamesRef.current = null;
  setEvents([...nextEvents]);
}

/** Try to restore a persisted session; returns true if one existed. */
export function restoreAgentSession({ storagePrefix, setSessionState }) {
  if (!storagePrefix) return false;
  try {
    const rawMessages = localStorage.getItem(`${storagePrefix}:messages`);
    const rawEvents = localStorage.getItem(`${storagePrefix}:events`);
    if (!rawMessages) return false;
    const messages = JSON.parse(rawMessages);
    const events = JSON.parse(rawEvents || "[]");
    const budget = Number(localStorage.getItem(`${storagePrefix}:budget`) || 0);
    const spentBudget = Number(
      localStorage.getItem(`${storagePrefix}:spentBudget`) || 0,
    );
    if (Array.isArray(messages)) {
      setSessionState({ messages, events, budget, spentBudget });
      return true;
    }
  } catch {
    // Corrupt storage — ignore.
  }
  return false;
}
