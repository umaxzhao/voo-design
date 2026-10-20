/**
 * Agent Panel event protocol — adapted from OpenAI Codex SDK.
 *
 * These types define the streaming event contract between the agent loop and
 * the UI layer. They are implementation-agnostic: the same event shapes work
 * whether the backend is DeepSeek, OpenAI, or a local model.
 *
 * Source reference: codex/sdk/typescript/src/events.ts + items.ts
 */

// ─── Event Types ──────────────────────────────────────────────────────────────

/** Emitted once when a new conversation thread starts. */
export const EVENT_TYPE = {
  THREAD_STARTED: "thread.started",
  TURN_STARTED: "turn.started",
  TURN_COMPLETED: "turn.completed",
  TURN_FAILED: "turn.failed",
  ITEM_STARTED: "item.started",
  ITEM_UPDATED: "item.updated",
  ITEM_COMPLETED: "item.completed",
  /** A mutating tool executed under auto-review now awaits post-hoc review. */
  REVIEW_PENDING: "review.pending",
  /** A pending review was accepted or reverted by the user. */
  REVIEW_RESOLVED: "review.resolved",
  ERROR: "error",
};

// ─── Item Types ───────────────────────────────────────────────────────────────

/**
 * Canonical item type vocabulary. Each item in the conversation has exactly one
 * of these types, which determines how the UI renders it.
 */
export const ITEM_TYPE = {
  /** Natural-language text from the user. */
  USER_MESSAGE: "user_message",
  /** Natural-language text from the assistant. */
  AGENT_MESSAGE: "agent_message",
  /** Model reasoning / chain-of-thought summary. */
  REASONING: "reasoning",
  /** A canvas operation (create node, connect, edit, delete, run). */
  COMMAND_EXECUTION: "command_execution",
  /** A structural change to the workflow graph. */
  FILE_CHANGE: "file_change",
  /** An external API call (image generation, video generation). */
  MCP_TOOL_CALL: "mcp_tool_call",
  /** Web search invocation. */
  WEB_SEARCH: "web_search",
  /** A plan / checklist tracked across the turn. */
  TODO_LIST: "todo_list",
  /** A non-fatal error surfaced as an item. */
  ERROR: "error",
};

// ─── Status ───────────────────────────────────────────────────────────────────

/** Lifecycle status for items that have async execution. */
export const STATUS = {
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  FAILED: "failed",
};

// ─── Approval ─────────────────────────────────────────────────────────────────

/**
 * Approval policy levels, adapted from Codex's 5-level approval system.
 *
 * IMPORTANT: Approval policies are ORTHOGONAL to sandbox/execution modes.
 * Plan mode (update_plan tool) is a task visibility mechanism, not a restriction.
 *
 * - `never`: Block all mutations — read-only observation only.
 * - `on-request`: Only approve when the model explicitly asks via request_user_input.
 * - `suggest`: Surface every non-read-only operation for the user to confirm
 *   (the UI's per-operation prompt); until the host wires real prompting this
 *   behaves like the strictest safe mode — everything but read-only needs
 *   approval.
 * - `auto-create`: Auto-approve canvas mutations; external API + destructive need approval.
 * - `full-auto`: Auto-approve everything except destructive operations.
 * - `auto-review`: Execute first, flag for post-hoc review (future enhancement).
 */
export const APPROVAL_MODE = {
  NEVER: "never",
  ON_REQUEST: "on-request",
  SUGGEST: "suggest",
  AUTO_CREATE: "auto-create",
  FULL_AUTO: "full-auto",
  AUTO_REVIEW: "auto-review",
};

/** Per-tool approval classification. */
export const TOOL_APPROVAL_LEVEL = {
  /** Read-only queries — never need approval. */
  READ_ONLY: "read-only",
  /** Structural canvas changes — approved in auto-create and above. */
  CANVAS_MUTATION: "canvas-mutation",
  /** External API calls (generate image/video) — approved in full-auto only. */
  EXTERNAL_API: "external-api",
  /** Destructive operations (delete node, reset workflow) — always need approval. */
  DESTRUCTIVE: "destructive",
  /** Explicit approval required (e.g. project brief mutation) — always requires approval. */
  REQUIRES_APPROVAL: "requires-approval",
};

/**
 * Post-hoc review lifecycle for tools executed under the auto-review mode.
 * A change moves PENDING → ACCEPTED | REVERTED through the user's review UI;
 * the same transitions are recorded on the run's ChangeSet records.
 */
export const REVIEW_STATUS = {
  /** Not subject to post-hoc review (read-only tools). */
  NONE: "none",
  /** Executed; awaiting the user's accept/revert decision. */
  PENDING: "pending",
  /** Reviewed and kept. */
  ACCEPTED: "accepted",
  /** Reviewed and marked for rollback. */
  REVERTED: "reverted",
};

// ─── Token Usage ──────────────────────────────────────────────────────────────

/** Token usage counters for a completed turn. */
export function createEmptyUsage() {
  return {
    input_tokens: 0,
    cached_input_tokens: 0,
    output_tokens: 0,
    reasoning_output_tokens: 0,
  };
}
