/**
 * Event/item id generator for the agent turn pipeline.
 *
 * Extracted from useAgentLoop so the React-free turn modules can mint ids
 * without importing the hook.
 *
 * @module agent-runtime/agent-event-ids
 */

let _idCounter = 0;

/** Mint a unique, chronologically sortable id with a readable prefix. */
export function generateAgentEventId(prefix) {
  return `${prefix}_${Date.now()}_${++_idCounter}`;
}
