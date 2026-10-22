/**
 * The pause-at-every-tool-call handshake shared by the native agent sessions
 * (Codex app-server, Claude Code).
 *
 * A native CLI runs its own agent loop and reaches VOO's canvas tools through
 * the agent MCP server. Each MCP tool request parks here as a tool call handed
 * to useAgentLoop; the loop's next model step (`advance`) carries the real
 * receipt back to that same MCP request. VOO's approval, undo, cancellation
 * and history gates therefore apply to every CLI agent unchanged.
 */

import { randomUUID } from "node:crypto";

/** A step that makes no progress for this long is treated as stuck. */
export const MODEL_IDLE_TIMEOUT_MS = 180000;

export function createToolTurn({ onIdleTimeout }) {
  const pendingTools = new Map();
  const queued = [];
  let waiter = null;
  let busy = false;
  let timeout = null;
  let text = "";

  const refreshTimeout = () => {
    clearTimeout(timeout);
    if (waiter) timeout = setTimeout(onIdleTimeout, MODEL_IDLE_TIMEOUT_MS);
  };

  const publish = (result) => {
    // Invoke responses can overtake text events across Electron's isolated
    // worlds. Every boundary carries an authoritative cumulative snapshot.
    const step = { ...result, text };
    clearTimeout(timeout);
    // A terminal event invalidates tool intents that have not reached VOO yet.
    // Otherwise cancellation can deliver a queued mutation before its error.
    if (step.done) queued.length = 0;
    if (waiter) {
      const resolve = waiter;
      waiter = null;
      resolve(step);
    } else queued.push(step);
  };

  const rejectPending = (reason) => {
    for (const pending of pendingTools.values())
      pending.reject(new Error(reason));
    pendingTools.clear();
  };

  /** Hands every receipt in `messages` back to the MCP request awaiting it. */
  const deliverReceipts = (messages) => {
    // useAgentLoop can compact or rebuild history between steps. Match
    // outstanding call IDs instead of assuming history only ever grows.
    const firstReceipt = messages.findIndex(
      (message) =>
        message.role === "tool" && pendingTools.has(message.tool_call_id),
    );
    const additions = firstReceipt < 0 ? [] : messages.slice(firstReceipt);
    // Auto-glances created after an edit accompany its receipt as MCP image
    // content, so the agent observes actual pixels before its next action.
    const images = additions
      .flatMap((message) =>
        Array.isArray(message.content) ? message.content : [],
      )
      .filter((part) => part.type === "image_url")
      .map((part) =>
        /^data:(image\/[^;]+);base64,(.+)$/s.exec(part.image_url?.url ?? ""),
      )
      .filter(Boolean)
      .map((match) => ({ type: "image", mimeType: match[1], data: match[2] }));
    for (const message of additions) {
      const pending = pendingTools.get(message.tool_call_id);
      if (message.role !== "tool" || !pending) continue;
      pendingTools.delete(message.tool_call_id);
      pending.resolve({
        content: [
          {
            type: "text",
            text:
              typeof message.content === "string"
                ? message.content
                : JSON.stringify(message.content),
          },
          ...images,
        ],
      });
    }
  };

  return {
    refreshTimeout,

    /** Records streamed model text; returns the offset it starts at. */
    appendText(delta) {
      const offset = text.length;
      text += delta;
      return offset;
    },

    /** Parks one MCP tool request until VOO returns its receipt. */
    requestTool(name, args) {
      const callId = randomUUID();
      return new Promise((resolve, reject) => {
        pendingTools.set(callId, { resolve, reject });
        publish({
          done: false,
          toolCalls: [
            {
              index: 0,
              id: callId,
              type: "function",
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        });
      });
    },

    /** One model step: deliver receipts, then wait for the next boundary. */
    async advance({ messages, isEnded, onAccepted }) {
      if (busy) throw new Error("cli.sessionBusy");
      busy = true;
      try {
        onAccepted?.();
        deliverReceipts(messages);
        if (queued.length) return queued.shift();
        if (isEnded()) throw new Error("cli.sessionClosed");
        return await new Promise((resolve) => {
          waiter = resolve;
          refreshTimeout();
        });
      } finally {
        busy = false;
      }
    },

    /** The CLI finished the turn: fail parked requests, then report done. */
    complete(error, rejectReason) {
      rejectPending(rejectReason);
      publish({ done: true, error });
    },

    /** VOO ended the turn: report done first, then fail parked requests. */
    abort(error) {
      publish({ done: true, error });
      rejectPending(error);
    },
  };
}
