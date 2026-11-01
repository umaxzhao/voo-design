/**
 * One model step for a local CLI agent (Claude Code, Codex, Antigravity).
 *
 * The CLI runs its own loop and reports tool intents back through the transport.
 * This adapts that stream to the shape `streamChatTurn` returns, so the shared
 * agent loop in canvas_agent.js drives both kinds of model the same way.
 */

import { parseCliModelId } from "../../shared/providers/provider_cli.js";
import { streamCodexCompletion } from "../components/agent-panel/codex_transport.js";
import { CANVAS_TOOL_SCHEMAS } from "./canvas_tools.js";

/** The CLI agents that can run a native VOO turn. */
const CLI_AGENT_IDS = Object.freeze(["claude", "codex", "antigravity"]);

/** Whether a `cli:model` id names one of the CLI agents above. */
export function isCliAgentModel(model) {
  return CLI_AGENT_IDS.includes(parseCliModelId(model).cliId);
}

/**
 * @param {{ config: {model: string}, messages: object[], tools: object[],
 *           signal?: AbortSignal, onText?: (text: string) => void }} options
 * @returns {Promise<{ text: string, toolCalls: {id:string,name:string,arguments:string}[] }>}
 */
export async function streamCliStep({ config, messages, tools, signal, onText }) {
  let text = "";
  const toolCalls = [];
  for await (const chunk of streamCodexCompletion({
    model: config.model,
    reasoningEffort: config.reasoningEffort,
    messages,
    tools: tools ?? CANVAS_TOOL_SCHEMAS,
    reasoningEffort: config.reasoningEffort,
    signal,
  })) {
    const delta = chunk.choices?.[0]?.delta ?? {};
    if (delta.content) {
      text += delta.content;
      onText?.(delta.content);
    }
    for (const call of delta.tool_calls ?? []) {
      toolCalls.push({
        id: call.id,
        name: call.function?.name ?? "",
        arguments: call.function?.arguments ?? "",
      });
    }
  }
  return { text, toolCalls };
}

// HTML generation consumes this transport alongside cumulative API streams.
streamCliStep.textMode = "delta";
