/**
 * Rate limiter for relaying a token stream across a message channel.
 *
 * A chat completion emits a chunk every few milliseconds. Posting one runtime
 * message per chunk floods the channel and makes the receiving canvas
 * re-render hundreds of times a second, so pushes are coalesced: the first one
 * goes out immediately (the user sees the stream start), the rest at most
 * once per `flushMs`, and `finish` always sends the last state so the receiver
 * never ends up behind the final answer.
 *
 * Each push carries the ACCUMULATED text rather than a delta, which is what
 * makes coalescing safe — dropping an intermediate state loses nothing.
 */

/** Default coalescing window: fast enough to read, cheap enough to post. */
export const STREAM_FLUSH_MS = 120;

/**
 * @param {(state: object) => void} send posts one state across the channel
 * @param {{ flushMs?: number, now?: () => number }} [options]
 * @returns {{ push: (state: object) => void, finish: () => void }}
 */
export function createStreamRelay(
  send,
  { flushMs = STREAM_FLUSH_MS, now = Date.now } = {},
) {
  let lastSentAt = -Infinity;
  let pendingState = null;
  let sentState = null;

  const emit = (state) => {
    lastSentAt = now();
    pendingState = null;
    sentState = state;
    send(state);
  };

  return {
    push(state) {
      if (now() - lastSentAt >= flushMs) emit(state);
      else pendingState = state;
    },
    /** Flushes whatever the window swallowed, if it differs from the last send. */
    finish() {
      if (!pendingState) return;
      if (
        sentState &&
        pendingState.text === sentState.text &&
        pendingState.reasoning === sentState.reasoning
      ) {
        pendingState = null;
        return;
      }
      emit(pendingState);
    },
  };
}
