import { randomUUID } from "node:crypto";
import { createToolTurn } from "./agent_tool_turn.js";
const OUTPUT_METHODS = new Set([
  "item/agentMessage/delta",
  "item/reasoning/textDelta",
  "item/reasoning/summaryTextDelta",
  "item/commandExecution/outputDelta",
  "item/fileChange/outputDelta",
]);

/**
 * The model host fetches image URLs itself, so only data: and https: URLs can
 * travel. A renderer blob: object URL (the canvas image cache) is meaningless
 * outside that renderer and fails the whole turn with an opaque 400
 * ("Expected a valid URL") — fail here instead, naming the real cause.
 */
function transportableImageUrl(part) {
  const url = part.image_url.url;
  if (/^(data:image\/|https:\/\/)/.test(url)) return url;
  throw new Error(
    `Image block carries a non-transportable URL (${url.slice(0, 16)}…); send a data: URL instead.`,
  );
}

/** Convert chat history without discarding image blocks or tool receipts. */
export function codexInput(messages) {
  const input = [];
  for (const message of messages ?? []) {
    if (message.role === "system") continue;
    const parts = Array.isArray(message.content)
      ? message.content
      : [{ type: "text", text: message.content ?? "" }];
    input.push({
      type: "text",
      text: `[${message.role}]${message.tool_call_id ? ` tool=${message.tool_call_id}` : ""}`,
      text_elements: [],
    });
    for (const part of parts) {
      if (part.type === "text" && part.text)
        input.push({ type: "text", text: part.text, text_elements: [] });
      if (part.type === "image_url" && part.image_url?.url)
        input.push({ type: "image", url: transportableImageUrl(part) });
    }
    if (message.tool_calls)
      input.push({
        type: "text",
        text: JSON.stringify(message.tool_calls),
        text_elements: [],
      });
  }
  return input;
}

/**
 * Pause at each MCP tool request and let useAgentLoop perform the operation.
 * The next model step returns the real receipt to that same MCP request.
 * This preserves VOO's existing approval, undo, cancellation and history gates.
 */
export function createCodexAgentSession({
  connection,
  tools,
  onText,
  onFinish,
}) {
  const id = randomUUID();
  const progressMarkers = new Set();
  let threadId = null;
  let turnId = null;
  let ended = false;
  let unsubscribe = () => {};
  const turn = createToolTurn({
    onIdleTimeout: () => session.close("cli.requestTimeout"),
  });
  const hasProgress = (method, params) => {
    if (OUTPUT_METHODS.has(method))
      return typeof params.delta === "string" && params.delta.length > 0;
    const itemId =
      method === "turn/started"
        ? params.turn?.id
        : method === "item/started" || method === "item/completed"
          ? params.item?.id
          : null;
    if (typeof itemId !== "string" || !itemId) return false;
    const marker = `${method}:${itemId}`;
    if (progressMarkers.has(marker)) return false;
    progressMarkers.add(marker);
    return true;
  };
  const session = {
    id,
    tools,
    async start({ model, messages, mcpUrl, cwd, reasoningEffort }) {
      const canvasAgent = tools.length > 0;
      const instructions = messages
        .filter((message) => message.role === "system")
        .map((message) => message.content)
        .join("\n");
      const baseInstructions = canvasAgent
        ? `${instructions}\nYou are VOO's primary design agent. Operate the live canvas exclusively through the voo MCP server. First call list_tools to inspect available tool schemas, then call_tool to execute them. Use tool_search to discover additional tools. Do not use shell or filesystem tools to modify the canvas. Tool results are real execution receipts.`
        : `${instructions}\nReturn the requested content directly. Do not call tools or wrap the answer in a Markdown code fence.`;
      const result = await connection.call("thread/start", {
        model,
        cwd,
        ephemeral: true,
        sandbox: "read-only",
        approvalPolicy: "never",
        baseInstructions,
        config: {
          ...(canvasAgent && {
            mcp_servers: {
              voo: {
                url: `${mcpUrl}/${id}`,
                bearer_token_env_var: "VOO_AGENT_MCP_TOKEN",
                startup_timeout_sec: 30,
                required: true,
                // MCP forwards tool intents; VOO still approves actual mutations.
                default_tools_approval_mode: "approve",
                tool_timeout_sec: 3600,
              },
            },
          }),
          web_search: "disabled",
          mcp_optional_startup_grace_ms: 0,
        },
      });
      threadId = result.thread.id;
      if (ended) throw new Error("cli.cancelled");
      unsubscribe = connection.subscribe(({ method, params }) => {
        if (params?.threadId !== threadId || ended) return;
        // Only real output or a new lifecycle step proves progress. Empty
        // deltas, status heartbeats and repeated markers cannot keep a stuck
        // turn alive indefinitely.
        if (hasProgress(method, params)) turn.refreshTimeout();
        if (
          method === "item/agentMessage/delta" &&
          typeof params.delta === "string" &&
          params.delta.length > 0
        ) {
          onText(params.delta, turn.appendText(params.delta));
        }
        if (method === "turn/started") turnId = params.turn.id;
        if (method === "turn/completed") {
          ended = true;
          const error = params.turn.error?.message;
          turn.complete(
            error || (params.turn.status === "failed" ? "cli.failed" : null),
            error || "cli.sessionClosed",
          );
          unsubscribe();
          onFinish();
        }
      });
      try {
        const turn = await connection.call("turn/start", {
          threadId,
          input: codexInput(messages),
          ...(reasoningEffort !== undefined && { effort: reasoningEffort }),
        });
        turnId = turn.turn.id;
        if (ended)
          await connection.call("turn/interrupt", { threadId, turnId });
      } catch (error) {
        session.close(error.message);
        throw error;
      }
    },
    callTool(name, args) {
      if (ended) return Promise.reject(new Error("cli.sessionClosed"));
      return turn.requestTool(name, args);
    },
    advance({ messages, tools: nextTools }) {
      return turn.advance({
        messages,
        isEnded: () => ended,
        onAccepted: () => {
          session.tools = nextTools;
        },
      });
    },
    close(error = "cli.cancelled") {
      if (ended) return;
      ended = true;
      unsubscribe();
      turn.abort(error);
      if (threadId && turnId)
        void connection
          .call("turn/interrupt", { threadId, turnId })
          .catch(() => {});
      onFinish();
    },
  };
  return session;
}
