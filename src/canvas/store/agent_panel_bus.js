/**
 * Event bus between long-running store actions and the agent drawer.
 *
 * Layout generation is started from the Design editor's prompt bar, not from
 * the agent panel, so its progress has no agent turn to ride on. The action
 * publishes here and the open drawer subscribes, which keeps the store free
 * of React state and lets the panel render one timeline for both sources.
 *
 * Deliberately module-level rather than zustand state: these events are a
 * stream, not a value — persisting them in the store would make every chunk a
 * canvas re-render.
 */

/** @typedef {{ type: string, payload: object, at: number }} AgentPanelEvent */

/**
 * Event names published by `generateLayout`. They live with the bus rather
 * than with the panel so a store action never has to reach into a component
 * folder to name what it emits.
 */
export const LAYOUT_EVENT = {
  /** A run started; payload: { nodeId, prompt }. */
  START: "layout.start",
  /** Reasoning tokens; payload: { text } — the accumulated reasoning. */
  THINKING: "stream.thinking",
  /** Stage change; payload: { nodeId, stage }. */
  STAGE: "layout.stage",
  /** Design decision milestone; payload: { nodeId, step, message, decision }. */
  DECISION: "layout.decision",
  /** Extracted reference palette; payload: { nodeId, palette, colors }. */
  PALETTE: "layout.palette",
  /** Design critique result; payload: { nodeId, score, issues, critique }. */
  CRITIQUE: "layout.critique",
  /** The run finished and the layout was parsed into layers. */
  DONE: "layout.done",
  /** The run failed; payload: { nodeId, code, message }. */
  ERROR: "layout.error",
};

const listeners = new Set();

/**
 * Subscribes to the bus. Returns the unsubscribe function, so a React effect
 * can return it directly.
 */
export function subscribeAgentPanel(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Publishes one event to every subscriber.
 *
 * A throwing subscriber must not take the generation down with it — the run
 * that emitted this is mid-stream — so the failure is reported and the
 * remaining subscribers still receive the event.
 */
export function emitAgentPanelEvent(type, payload = {}) {
  const event = { type, payload, at: Date.now() };
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch (error) {
      console.error("[agent-panel-bus] listener failed", type, error);
    }
  }
}

/** Test helper: drops every subscriber. */
export function resetAgentPanelBus() {
  listeners.clear();
}
