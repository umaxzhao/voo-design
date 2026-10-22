/**
 * A minimal MCP (Model Context Protocol) stdio client.
 *
 * This is the transport Pencil uses: a local coding agent (`codex mcp-server`)
 * runs as an MCP server over stdin/stdout speaking newline-delimited JSON-RPC,
 * and a client calls the tools it exposes. The agent is the server; the app
 * (here, VOO's desktop main process) is the client.
 *
 * This module is pure: it takes a "write" function and emits parsed frames, so
 * it is testable under plain node without a live process. The Electron layer
 * only supplies the spawned process's stdin/stdout.
 *
 * The server spews `codex/event` notifications between requests; those are
 * surfaced through `onEvent` so a UI can show progress, but the caller waits
 * on the response whose `id` matches its request.
 */

/** Options for one session. Matches the `codex` tool's input schema. */
export function codexSessionArgs({
  prompt,
  cwd,
  model,
  sandbox = "read-only",
}) {
  const args = { prompt, cwd };
  if (model) args.model = model;
  // read-only is the safest default: a text-generation call must never run
  // arbitrary shell commands the prompt happens to mention.
  args.sandbox = sandbox || "read-only";
  args["approval-policy"] = "never";
  return args;
}

/**
 * Creates a stateful MCP client over a duplex byte stream.
 *
 * @param {object} io
 * @param {(chunk: string) => void} io.write writes one line (no newline) to
 *   the server.
 * @param {(frame: object) => void} [io.onEvent] receives `codex/event` and
 *   other server notifications (never the request/response echoes).
 * @returns {{
 *   feed: (chunk: string) => void,
 *   call: (method: string, params?: object, id?: number) => Promise<object>,
 *   close: () => void,
 * }}
 */
export function createMcpClient({ write, onEvent }) {
  let nextId = 1;
  let buffer = "";
  const pending = new Map();

  function parseLine(line) {
    if (!line.trim()) return null;
    try {
      return JSON.parse(line);
    } catch {
      return null; // tolerate a partial/garbled frame
    }
  }

  function settle(frame) {
    const id = frame?.id;
    if (id == null) return false;
    const entry = pending.get(id);
    if (!entry) return false;
    pending.delete(id);
    if (frame.error) {
      entry.reject(new Error(frame.error.message || "mcp.error"));
    } else {
      entry.resolve(frame.result ?? {});
    }
    return true;
  }

  return {
    feed(chunk) {
      buffer += chunk;
      let nl;
      // Servers may send several newline-delimited frames in one write.
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        const frame = parseLine(line);
        if (!frame) continue;
        // A response to one of our requests settles its promise.
        if (settle(frame)) continue;
        // Any other server-initiated frame is a notification/event.
        if (frame.method && frame.method !== "notifications/initialized") {
          onEvent?.(frame);
        }
      }
    },

    call(method, params = {}, idOverride, timeoutMs = 2500) {
      const id = typeof idOverride === "number" ? idOverride : nextId++;
      return new Promise((resolve, reject) => {
        let timer = null;
        if (timeoutMs > 0) {
          timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error("mcp.timeout"));
          }, timeoutMs);
        }
        pending.set(id, {
          resolve: (val) => {
            if (timer) clearTimeout(timer);
            resolve(val);
          },
          reject: (err) => {
            if (timer) clearTimeout(timer);
            reject(err);
          },
        });
        try {
          write(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
        } catch (error) {
          if (timer) clearTimeout(timer);
          pending.delete(id);
          reject(error);
        }
      });
    },

    close() {
      for (const { reject } of pending.values()) {
        reject(new Error("mcp.closed"));
      }
      pending.clear();
    },
  };
}

/**
 * Extracts the text result from an MCP `tools/call` response.
 *
 * Codex returns `{ content: [{ type: "text", text }], structuredContent }`.
 * Any text block in `content` is the answer; `structuredContent.content` is a
 * fallback for servers that only fill that in.
 */
export function textFromToolResult(result) {
  if (!result) return "";
  const parts = Array.isArray(result.content)
    ? result.content
        .map((item) => (item.type === "text" ? item.text : ""))
        .filter(Boolean)
    : [];
  if (parts.length > 0) return parts.join("\n");
  if (typeof result.structuredContent?.content === "string") {
    return result.structuredContent.content;
  }
  return "";
}

/**
 * Runs one codex session as a one-shot: initialize, call the `codex` tool,
 * resolve with its text. Kept as a convenience for callers that only need one
 * answer per process.
 */
export async function runCodexSession(io, { prompt, cwd, model }) {
  const client = createMcpClient({ write: io.write, onEvent: io.onEvent });
  const wrapped = { client, text: null };
  await client.call("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "voo", version: "1" },
  });
  const result = await client.call("tools/call", {
    name: "codex",
    arguments: codexSessionArgs({ prompt, cwd, model }),
  });
  wrapped.text = textFromToolResult(result);
  return wrapped;
}
