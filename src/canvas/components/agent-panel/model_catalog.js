/**
 * Model catalog shared by the agent panel and the welcome dashboard.
 *
 * Keeping the catalog here (instead of inside `canvas_agent_panel.jsx`) lets the
 * welcome screen show the same real provider/model list without importing the
 * whole agent runtime. The panel re-exports these symbols for backwards
 * compatibility with existing tests and callers.
 */
import { customModelGroups } from "../../agent/custom-model-groups.js";

/** Available CLI agent model groups for selection. */
export const CLI_MODEL_GROUPS = [
  {
    cliId: "claude",
    name: "Claude Code",
    models: [
      { id: "claude:claude-opus-5-5", label: "Claude Opus 5.5" },
      { id: "claude:sonnet", label: "Claude Sonnet" },
      { id: "claude:haiku", label: "Claude Haiku" },
      { id: "claude:opus", label: "Claude Opus" },
      { id: "claude:best", label: "Claude Best" },
      { id: "claude:default", label: "Claude Default" },
    ],
  },
  {
    cliId: "codex",
    name: "Codex",
    models: [
      { id: "codex:gpt-6-astra", label: "GPT-6 Astra" },
      { id: "codex:gpt-5.6-terra", label: "GPT-5.6 Terra" },
      { id: "codex:gpt-5.6-sol", label: "GPT-5.6 Sol" },
      { id: "codex:gpt-5.6-luna", label: "GPT-5.6 Luna" },
    ],
  },
  {
    cliId: "antigravity",
    name: "Antigravity",
    models: [
      { id: "antigravity:gemini-3.8-flash-high", label: "Gemini 3.8 Flash (High)" },
      { id: "antigravity:gemini-3.8-flash-medium", label: "Gemini 3.8 Flash (Medium)" },
      { id: "antigravity:gemini-3.8-flash-low", label: "Gemini 3.8 Flash (Low)" },
      { id: "antigravity:claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Thinking)" },
      { id: "antigravity:claude-opus-4-6-thinking", label: "Claude Opus 4.6 (Thinking)" },
      { id: "antigravity:gpt-oss-120b-medium", label: "GPT-OSS 120B (Medium)" },
    ],
  },
];

/** CLI groups plus the user's custom API providers (same order as the panel menu). */
export function availableModelGroups(customGroups = customModelGroups()) {
  return [...CLI_MODEL_GROUPS, ...customGroups];
}

export function getModelDisplayLabel(modelId) {
  if (!modelId) return "Flash";
  for (const group of availableModelGroups()) {
    for (const model of group.models) {
      if (model.id === modelId) {
        return `${group.name} · ${model.label.replace(/^Claude\s+|Gemini\s+/, "")}`;
      }
    }
  }
  const parts = String(modelId).split(":");
  if (parts.length >= 2) {
    const cli = parts[0];
    const rest = parts.slice(1).join(":");
    return `${cli.charAt(0).toUpperCase() + cli.slice(1)} · ${rest}`;
  }
  return modelId;
}

/** Group that owns a model id, or null for a model that is not in the catalog. */
export function findModelGroup(modelId, groups = availableModelGroups()) {
  if (!modelId) return null;
  for (const group of groups) {
    const model = group.models.find((entry) => entry.id === modelId);
    if (model) return { group, model };
  }
  return null;
}

/** True when the id resolves to a catalog entry the picker can display. */
export function isKnownModel(modelId, groups = availableModelGroups()) {
  return Boolean(findModelGroup(modelId, groups));
}
