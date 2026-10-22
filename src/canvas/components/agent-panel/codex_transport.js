import { CLI_TRANSPORT } from "../../../shared/cli-agents.js";
import { NATIVE_AGENT_CLI_IDS } from "../../../shared/cli_bridge_protocol.js";
import { cliTransport, ensureLocalCliBridge } from "./local_cli_bridge.js";

const NATIVE_AGENT_CLIS = new Set(NATIVE_AGENT_CLI_IDS);

const sessions = new WeakMap();

function abortError() {
  return new DOMException("Stopped", "AbortError");
}

async function cancelNativeRequest(entry, preserveFailure) {
  try {
    await entry.bridge.cancel({
      sessionId: entry.sessionId,
      requestId: entry.requestId,
    });
  } catch (error) {
    // IPC teardown can reject both advance and cancel. Preserve the original
    // failure (especially AbortError), while exposing cleanup diagnostics.
    if (!preserveFailure) throw error;
    console.warn("[codex-transport] Native session cleanup failed", error);
  }
}

export async function closeCodexSession(signal) {
  const entry = signal && sessions.get(signal);
  if (!entry) return;
  sessions.delete(signal);
  await entry.bridge.cancel({
    sessionId: entry.sessionId,
    requestId: entry.requestId,
  });
}

/** Adapt native CLI/MCP turns to the existing VOO model-step interface. */
export async function* streamCodexCompletion({
  messages,
  tools = [],
  model,
  reasoningEffort,
  signal,
}) {
  // Desktop IPC, or the loopback CLI bridge when this is a browser.
  const bridge = await ensureLocalCliBridge();
  // A link that carries the CLI's configuration but not the right to run it
  // would answer `advance` with a link-protocol error, which says nothing a
  // user can act on. A stored choice can reach this path — the linked desktop
  // reports its own preferred provider — so name the link instead.
  if (cliTransport() === CLI_TRANSPORT.READS_ONLY)
    throw new Error("agent.connection.linkReadsOnly");
  if (!bridge?.advance || !bridge?.onText)
    throw new Error("agent.connection.desktopOnly");
  if (signal?.aborted) throw abortError();
  const [cliId, ...modelParts] = String(model ?? "").split(":");
  if (!NATIVE_AGENT_CLIS.has(cliId))
    throw new Error("agent.connection.unsupported");
  const requestId = crypto.randomUUID();
  const previous = signal && sessions.get(signal);
  const entry = {
    bridge,
    requestId,
    sessionId: previous?.sessionId,
    textLength: previous?.textLength ?? 0,
  };
  if (signal) sessions.set(signal, entry);
  const queue = [];
  let wake = null;
  let finished = false;
  let failed = false;
  const push = (item) => {
    queue.push(item);
    wake?.();
    wake = null;
  };
  const unsubscribe = bridge.onText((event) => {
    if (event?.requestId === requestId && typeof event.text === "string")
      push({ text: event.text, offset: event.offset });
  });
  const abort = () => {
    void bridge
      .cancel({ sessionId: entry.sessionId, requestId })
      .catch(() => {});
    push({ error: abortError() });
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    // IPC can throw before returning a promise during a renderer teardown.
    // Keep submission inside the same cleanup boundary as streaming failures.
    const pending = bridge.advance({
      requestId,
      cliId,
      sessionId: entry.sessionId,
      model: modelParts.join(":"),
      ...(reasoningEffort != null ? { reasoningEffort } : {}),
      messages,
      tools,
    });
    void pending.then(
      (result) => push({ result }),
      (error) => push({ error }),
    );
    while (!finished) {
      if (!queue.length)
        await new Promise((resolve) => {
          wake = resolve;
        });
      const item = queue.shift();
      if (item.error) throw item.error;
      if (item.text) {
        const offset = item.offset ?? entry.textLength;
        // Keep contiguous text only; the boundary snapshot fills missing events.
        const text =
          offset <= entry.textLength
            ? item.text.slice(entry.textLength - offset)
            : "";
        if (text) {
          entry.textLength += text.length;
          yield {
            choices: [{ delta: { content: text }, finish_reason: null }],
          };
        }
      }
      if (item.result) {
        // Real Electron IPC may deliver the invoke result before text events.
        // Reconcile across tool steps without repeating already rendered text.
        const remaining = item.result.text?.slice(entry.textLength);
        if (remaining) {
          entry.textLength += remaining.length;
          yield {
            choices: [{ delta: { content: remaining }, finish_reason: null }],
          };
        }
        if (!item.result.ok)
          throw new Error(
            item.result.error || item.result.code || "cli.failed",
          );
        entry.sessionId = item.result.sessionId;
        // Failed native steps must discard the session, not leave it waiting
        // for tool receipts that the next model request can never provide.
        finished = true;
        if (item.result.done && signal) sessions.delete(signal);
        yield {
          choices: [
            {
              delta: item.result.toolCalls
                ? { tool_calls: item.result.toolCalls }
                : {},
              finish_reason: item.result.done ? "stop" : "tool_calls",
            },
          ],
          usage: null,
        };
      }
    }
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    unsubscribe();
    signal?.removeEventListener("abort", abort);
    // Cancel only an unfinished turn. A completed turn has nothing to tear down,
    // and a teardown failure after success must not be reported as the turn failing.
    if (!finished) {
      if (signal) sessions.delete(signal);
      await cancelNativeRequest(entry, failed);
    } else if (signal) {
      sessions.delete(signal);
    }
  }
}
