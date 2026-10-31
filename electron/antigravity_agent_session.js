import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createToolTurn } from "./agent_tool_turn.js";
import {
  addVooMcpServer,
  getDefaultMcpConfigPath,
} from "./antigravity_mcp_config.js";

const STDERR_TAIL_CHARS = 2000;

export const ANTIGRAVITY_MODEL_ALIASES = Object.freeze({
  "gemini-2.5-flash": "gemini-3.8-flash-high",
  "gemini-2.5-pro": "gemini-3.8-flash-high",
  "claude-3-7-sonnet": "claude-sonnet-5-5-high",
  "claude-sonnet-4-6": "claude-sonnet-5-5-high",
  "claude-opus-4-6-thinking": "claude-opus-5-5-high",
});

/**
 * Builds the argv for spawning Antigravity in headless sandboxed stream mode.
 */
export function antigravityArgs({ model, effort } = {}) {
  const resolvedModel = (model && ANTIGRAVITY_MODEL_ALIASES[model]) || model;
  const hasApiKey = Boolean(process.env.GEMINI_API_KEY);
  return [
    "--sandbox",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    ...(!hasApiKey ? ["--settings", '{"modelProvider":""}'] : []),
    ...(resolvedModel ? ["--model", resolvedModel] : []),
    ...(effort !== undefined ? ["--effort", effort] : []),
  ];
}

export const AGENT_INSTRUCTIONS =
  "You are VOO's primary design agent. Operate the live canvas exclusively through the voo MCP server: call list_tools to inspect the available tool schemas, then call_tool to execute them. Tool results are real execution receipts.";

/**
 * Normalizes messages into the NDJSON user event that agy stream-json expects.
 */
export function antigravityInput(messages) {
  const content = [
    {
      type: "text",
      text: `[system instruction]\n${AGENT_INSTRUCTIONS}`,
    },
  ];
  for (const message of messages ?? []) {
    if (message.role === "system") {
      content.push({
        type: "text",
        text: `[system instruction]\n${message.content ?? ""}`,
      });
      continue;
    }
    const parts = Array.isArray(message.content)
      ? message.content
      : [{ type: "text", text: message.content ?? "" }];
    content.push({
      type: "text",
      text: `[${message.role}]${message.tool_call_id ? ` tool=${message.tool_call_id}` : ""}`,
    });
    for (const part of parts) {
      if (part.type === "text" && part.text) {
        content.push({ type: "text", text: part.text });
      }
    }
    if (message.tool_calls) {
      content.push({
        type: "text",
        text: JSON.stringify(message.tool_calls),
      });
    }
  }
  return {
    event: "user",
    message: {
      role: "user",
      content,
    },
  };
}

/**
 * Manages an Antigravity agent session for one or more turns.
 */
export function createAntigravityAgentSession({
  bin,
  tools,
  onText,
  onFinish,
  spawnProcess = spawn,
  configPath = getDefaultMcpConfigPath(),
}) {
  const id = randomUUID();
  let child = null;
  let ended = false;
  let stderr = "";
  const turn = createToolTurn({
    onIdleTimeout: () => session.close("cli.requestTimeout"),
  });

  const finish = (error) => {
    if (ended) return;
    ended = true;
    turn.complete(error, error || "cli.sessionClosed");
    child?.stdin?.end();
    onFinish();
  };

  const handleEvent = (event) => {
    turn.refreshTimeout();
    if (event.event === "step_update" && event.step_update?.text_delta) {
      const delta = event.step_update.text_delta;
      onText(delta, turn.appendText(delta));
      return;
    }
    if (event.event === "result") {
      const result = event.result;
      if (result?.response) {
        const currentLen = turn.appendText("");
        if (currentLen === 0) {
          turn.appendText(result.response);
          onText?.(result.response, 0);
        }
      }
      finish(result?.status === "ERROR" ? result.error || "cli.failed" : null);
    }
  };

  const readLines = (stream) => {
    let buffer = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          session.close("cli.invalidOutput");
          return;
        }
        handleEvent(event);
      }
    });
  };

  const session = {
    id,
    tools,
    async start({
      model,
      messages,
      mcpUrl,
      cwd,
      token,
      reasoningEffort,
      projectPath,
    }) {
      const targetCwd = projectPath || cwd || process.cwd();
      const input = antigravityInput(messages);

      // Register the live VOO canvas MCP server entry
      await addVooMcpServer({
        serverUrl: `${mcpUrl}/${id}`,
        token,
        configPath,
      });

      if (ended) throw new Error("cli.cancelled");

      child = spawnProcess(
        bin,
        antigravityArgs({
          model,
          effort: reasoningEffort,
        }),
        {
          cwd: targetCwd,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );

      readLines(child.stdout);
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderr = (stderr + chunk).slice(-STDERR_TAIL_CHARS);
      });
      child.on("error", (error) => {
        session.close(
          error.code === "ENOENT" ? "cli.notInstalled" : error.message,
        );
      });
      child.on("exit", (code, signal) => {
        finish(stderr.trim() || `cli.exited:${code ?? signal}`);
      });

      child.stdin.write(`${JSON.stringify(input)}\n`);
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
      turn.abort(error);
      if (child && child.exitCode === null && !child.killed) {
        child.kill("SIGTERM");
      }
      onFinish();
    },
  };

  return session;
}
