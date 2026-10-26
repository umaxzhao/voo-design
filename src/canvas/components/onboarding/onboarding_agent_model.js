import { AGENT_SETTING } from "../../agent/canvas_tools.js";
import { setSetting } from "../../../shared/settings.js";

/**
 * The default `cli:model` each onboarding agent runs. The panel sends turns to
 * the local CLI for these ids, so choosing an agent selects its CLI and model.
 */
export const AGENT_DEFAULT_MODELS = Object.freeze({
  claude: "claude:claude-opus-5-5",
  codex: "codex:gpt-6-astra",
  antigravity: "antigravity:gemini-3.8-flash-high",
  "deepseek-harness": null,
});

/** Writes the default model for the chosen agent into the agent settings. */
export function applyAgentModel(agent) {
  // An external Harness connects to VOO through MCP and selects its own
  // profile model. Never persist a model route our agent runner cannot use.
  if (Object.hasOwn(AGENT_DEFAULT_MODELS, agent) && AGENT_DEFAULT_MODELS[agent] === null) return false;
  const model = AGENT_DEFAULT_MODELS[agent] ?? AGENT_DEFAULT_MODELS.claude;
  setSetting(AGENT_SETTING.MODEL, model);
  return true;
}
