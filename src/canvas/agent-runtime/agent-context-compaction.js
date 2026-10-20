/**
 * Context compaction for the agent turn pipeline.
 *
 * Summarize the older part of the conversation when the context window fills,
 * keeping the most recent messages verbatim (Codex /responses/compact pattern,
 * implemented with a plain summarization call).
 *
 * Extracted from useAgentLoop (AO3b). React-free: history lives in the
 * injected messagesRef, the model call goes through an injectable transport.
 *
 * @module agent-runtime/agent-context-compaction
 */

import { chatCompletion as defaultChatCompletion } from "../components/agent-panel/deepseekApi.js";
import {
  EVENT_TYPE,
  ITEM_TYPE,
  STATUS,
} from "../components/agent-panel/eventTypes.js";
import { generateAgentEventId } from "./agent-event-ids.js";

/** Number of recent messages kept verbatim after a compaction. */
export const COMPACT_KEEP_LAST = 10;

/**
 * True when `start` is a valid first index for the verbatim suffix.
 *
 * The kept slice may not begin on a `tool` result (its issuing assistant
 * `tool_calls` turn would be dropped) and an assistant `tool_calls` turn may
 * only head the slice when every one of its results is present. Anything else
 * makes the next request fail with HTTP 400: "tool message must be preceded
 * by assistant tool_calls".
 */
function isCleanTurnStart(messages, start) {
  const first = messages[start];
  if (!first || first.role === "tool") return false;
  const calls = first.role === "assistant" ? first.tool_calls : null;
  if (!Array.isArray(calls) || calls.length === 0) return true;
  const pending = new Set(
    calls.map((call) => call?.id).filter((id) => Boolean(id)),
  );
  for (let i = start + 1; i < messages.length && pending.size > 0; i++) {
    const message = messages[i];
    if (message?.role === "tool" && pending.has(message.tool_call_id)) {
      pending.delete(message.tool_call_id);
    }
  }
  return pending.size === 0;
}

/**
 * Index of the oldest message that can be kept verbatim without splitting a
 * tool-call group. Scans back from the nominal `length - keepLast` boundary
 * until the suffix starts on a clean turn boundary. Returns 0 when no safe
 * boundary exists (nothing can be summarized).
 */
export function findCompactionBoundary(messages, keepLast = COMPACT_KEEP_LAST) {
  if (messages.length <= keepLast) return 0;
  let start = messages.length - keepLast;
  while (start > 0 && !isCleanTurnStart(messages, start)) start--;
  return start;
}

export async function compactAgentConversation({
  messagesRef,
  model,
  reasoningEffort,
  apiKey,
  baseUrl,
  emit,
  chatCompletionImpl = defaultChatCompletion,
}) {
  const messages = messagesRef.current;
  if (messages.length <= COMPACT_KEEP_LAST) return;

  // `slice(-COMPACT_KEEP_LAST)` can land in the middle of a tool-call group.
  // Keep the history on a clean turn start so the request stays valid.
  const start = findCompactionBoundary(messages);
  if (start <= 0) return;

  const keep = messages.slice(start);
  const drop = messages.slice(0, start);
  if (drop.length === 0) return;

  // Build a compact prompt from the dropped messages (strip tool payloads).
  const compactable = drop
    .map((m) => {
      if (m.role === "tool") return `[tool result for ${m.tool_call_id}]`;
      return `${m.role}: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`;
    })
    .join("\n");

  const summaryPrompt = [
    "You are compressing a conversation history for a design-workflow assistant.",
    "Summarize the following conversation into a concise factual recap that",
    "preserves: the user's goals, every action taken on the canvas (nodes created,",
    "connected, edited), generated images/videos, and any decisions or preferences",
    "the user expressed. Keep it under 300 words. Output only the summary.",
    "",
    "--- CONVERSATION TO COMPRESS ---",
    compactable,
  ].join("\n");

  let summary = "[Context was compacted.]";
  // The history is compacted on both paths, but only one of them summarised it.
  // The truncation marker above is model-visible only, so the emitted notice is
  // the user's sole evidence of what happened to their earlier turns.
  let summarized = false;
  try {
    const result = await chatCompletionImpl({
      messages: [{ role: "user", content: summaryPrompt }],
      model,
      reasoningEffort,
      apiKey,
      baseUrl,
    });
    if (result.content?.trim()) {
      summary = result.content.trim();
      summarized = true;
    }
  } catch {
    // Summarization failed — fall back to a plain truncation marker.
  }

  messagesRef.current = [
    { role: "user", content: `[Earlier conversation summary]\n${summary}` },
    ...keep,
  ];

  emit({
    type: EVENT_TYPE.ITEM_COMPLETED,
    item: {
      id: generateAgentEventId("compact"),
      type: ITEM_TYPE.ERROR,
      // Two outcomes, two codes: reporting the failed summary under
      // `contextCompacted` told the user their earlier turns were summarised
      // when they had in fact been dropped. See AGENT_RULES.md §8.1 (a test
      // blind spot the unit suite could not see) — the marker is asserted in
      // tests/agent_context_compaction.test.js, the user-visible copy is pinned
      // by the compaction branch of scripts/verify-agent-panel.mjs.
      code: summarized ? "contextCompacted" : "contextCompactionFailed",
      message: summarized
        ? "Context window was compacted — earlier turns summarized."
        : "Context window was compacted, but the summary failed — earlier turns were dropped without a recap.",
      status: summarized ? STATUS.COMPLETED : STATUS.FAILED,
    },
  });
}
