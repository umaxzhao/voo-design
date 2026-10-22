/**
 * A VOO agent turn run by the Claude Code CLI.
 *
 * Same contract as codex_agent_session.js (start / callTool / advance /
 * close), so the agent MCP server and the IPC/bridge channel treat both CLIs
 * alike. Claude runs headless (`-p`) with stream-json on stdin and stdout, and
 * reaches VOO's canvas tools only through the voo MCP server.
 *
 * The page driving this may be a browser (the loopback CLI bridge), so the
 * flags below are the line between "operate the canvas" and "run code on this
 * machine":
 *
 *   --restricted --tools ""   no Bash, file, web or other built-in tool; user,
 *                             project and local settings (hooks included) are
 *                             not loaded
 *   --strict-mcp-config       no MCP server except VOO's
 *   --permission-mode dontAsk + --allowedTools (the two voo tools)
 *                             those run; anything else is refused outright
 *                             rather than waiting on a prompt nobody answers
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createToolTurn } from "./agent_tool_turn.js";
import { resolveClaudeCliModel } from "../src/shared/cli-agents.js";

/** Reasoning effort levels `claude --effort` accepts. */
export const CLAUDE_EFFORTS = Object.freeze([
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

const VOO_MCP_TOOLS = ["mcp__voo__list_tools", "mcp__voo__call_tool"];
const STDERR_TAIL_CHARS = 2000;
const STREAM_PROGRESS_FIELDS = new Map([
  ["text_delta", "text"],
  ["thinking_delta", "thinking"],
  ["input_json_delta", "partial_json"],
  ["signature_delta", "signature"],
]);
const AGENT_INSTRUCTIONS =
  "You are VOO's primary design agent. Operate the live canvas exclusively through the voo MCP server: call list_tools to inspect the available tool schemas, then call_tool to execute them. Use tool_search to discover additional tools. Tool results are real execution receipts.";

/** Claude image block for a chat image URL; renderer-local URLs cannot travel. */
function claudeImage(url) {
  const inline = /^data:(image\/[^;]+);base64,(.+)$/s.exec(url);
  if (inline) {
    return {
      type: "image",
      source: { type: "base64", media_type: inline[1], data: inline[2] },
    };
  }
  if (url.startsWith("https://")) {
    return { type: "image", source: { type: "url", url } };
  }
  throw new Error(
    `Image block carries a non-transportable URL (${url.slice(0, 16)}…); send a data: URL instead.`,
  );
}

/** The chat history as one stream-json user message (system goes elsewhere). */
export function claudeInput(messages) {
  const content = [];
  for (const message of messages ?? []) {
    if (message.role === "system") continue;
    const parts = Array.isArray(message.content)
      ? message.content
      : [{ type: "text", text: message.content ?? "" }];
    content.push({
      type: "text",
      text: `[${message.role}]${message.tool_call_id ? ` tool=${message.tool_call_id}` : ""}`,
    });
    for (const part of parts) {
      if (part.type === "text" && part.text)
        content.push({ type: "text", text: part.text });
      if (part.type === "image_url" && part.image_url?.url)
        content.push(claudeImage(part.image_url.url));
    }
    if (message.tool_calls)
      content.push({ type: "text", text: JSON.stringify(message.tool_calls) });
  }
  return { type: "user", message: { role: "user", content } };
}

/** The `claude` argv for one headless, canvas-only agent turn. */
export function claudeArgs({ model, mcpConfigPath, systemPrompt, effort }) {
  const cliModel = resolveClaudeCliModel(model);
  return [
    "-p",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--restricted",
    "--tools",
    "",
    "--strict-mcp-config",
    "--mcp-config",
    mcpConfigPath,
    "--permission-mode",
    "dontAsk",
    "--permission-prompts",
    "none",
    "--allowedTools",
    VOO_MCP_TOOLS.join(","),
    "--no-session-persistence",
    "--model",
    cliModel,
    "--append-system-prompt",
    systemPrompt,
    ...(effort !== undefined ? ["--effort", effort] : []),
  ];
}

export function createClaudeAgentSession({
  bin,
  tools,
  onText,
  onFinish,
  spawnProcess = spawn,
}) {
  const id = randomUUID();
  let child = null;
  let mcpConfigPath = null;
  let ended = false;
  let stderr = "";
  const progressMessages = new Set();
  const turn = createToolTurn({
    onIdleTimeout: () => session.close("cli.requestTimeout"),
  });

  const cleanUp = () => {
    if (!mcpConfigPath) return;
    const target = mcpConfigPath;
    mcpConfigPath = null;
    void rm(target, { force: true }).catch((error) =>
      console.warn("[claude-agent] MCP config cleanup failed", error),
    );
  };

  /** The CLI ended the turn (a result, or the process went away). */
  const finish = (error) => {
    if (ended) return;
    ended = true;
    turn.complete(error, error || "cli.sessionClosed");
    child?.stdin?.end();
    cleanUp();
    onFinish();
  };

  const handleEvent = (event) => {
    // Claude may buffer deltas after MCP failure or cancellation. A terminal
    // turn must never publish them or restart its idle timer.
    if (ended) return;
    const streamEvent = event.type === "stream_event" ? event.event : null;
    const messageId = streamEvent?.message?.id;
    if (
      streamEvent?.type === "message_start" &&
      typeof messageId === "string" &&
      messageId &&
      !progressMessages.has(messageId)
    ) {
      progressMessages.add(messageId);
      turn.refreshTimeout();
    }
    // UI/status heartbeats and empty/replayed events are not model progress.
    // Thinking and tool-input deltas count even when no text is rendered yet.
    if (streamEvent?.type === "content_block_delta") {
      const field = STREAM_PROGRESS_FIELDS.get(streamEvent.delta?.type);
      const progress = field ? streamEvent.delta?.[field] : null;
      if (typeof progress === "string" && progress.length > 0)
        turn.refreshTimeout();
    }
    if (event.type === "system" && event.subtype === "init") {
      const voo = event.mcp_servers?.find((server) => server.name === "voo");
      if (voo?.status === "failed") session.close("cli.mcpUnavailable");
      return;
    }
    if (
      event.type === "stream_event" &&
      event.event?.type === "content_block_delta" &&
      event.event.delta?.type === "text_delta" &&
      event.event.delta.text
    ) {
      const delta = event.event.delta.text;
      onText(delta, turn.appendText(delta));
      return;
    }
    if (event.type === "result") {
      finish(
        event.is_error ? event.result || event.subtype || "cli.failed" : null,
      );
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
    async start({ model, messages, mcpUrl, cwd, token, reasoningEffort }) {
      if (
        reasoningEffort !== undefined &&
        !CLAUDE_EFFORTS.includes(reasoningEffort)
      )
        throw new Error("cli.invalidReasoningEffort");
      // Built before spawning so a bad image fails the request, not the CLI.
      const input = claudeInput(messages);
      // The bearer token lives in a private file, not on the command line
      // where any local user could read it from the process list.
      mcpConfigPath = path.join(cwd, `mcp-${id}.json`);
      await writeFile(
        mcpConfigPath,
        JSON.stringify({
          mcpServers: {
            voo: {
              type: "http",
              url: `${mcpUrl}/${id}`,
              headers: { Authorization: `Bearer ${token}` },
            },
          },
        }),
        { mode: 0o600 },
      );
      if (ended) throw new Error("cli.cancelled");
      const instructions = messages
        .filter((message) => message.role === "system")
        .map((message) => message.content)
        .join("\n");
      child = spawnProcess(
        bin,
        claudeArgs({
          model,
          mcpConfigPath,
          systemPrompt: `${instructions}\n${AGENT_INSTRUCTIONS}`,
          effort: reasoningEffort,
        }),
        { cwd, stdio: ["pipe", "pipe", "pipe"] },
      );
      readLines(child.stdout);
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderr = (stderr + chunk).slice(-STDERR_TAIL_CHARS);
      });
      child.on("error", (error) =>
        session.close(
          error.code === "ENOENT" ? "cli.notInstalled" : error.message,
        ),
      );
      child.on("exit", (code, signal) =>
        finish(stderr.trim() || `cli.exited:${code ?? signal}`),
      );
      // stdin stays open until the result: closing it early ends the turn.
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
      if (child && child.exitCode === null && !child.killed)
        child.kill("SIGTERM");
      cleanUp();
      onFinish();
    },
  };
  return session;
}
