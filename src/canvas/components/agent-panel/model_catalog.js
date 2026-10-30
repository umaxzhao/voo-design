/**
 * Model catalog shared by the agent panel and the welcome dashboard.
 *
 * Keeping the catalog here (instead of inside `canvas_agent_panel.jsx`) lets the
 * welcome screen show the same real provider/model list without importing the
 * whole agent runtime. The panel re-exports these symbols for backwards
 * compatibility with existing tests and callers.
 */
import { CLAUDE_MODELS, CODEX_MODELS } from "../../../shared/agent-defaults.js";
import { getDiscoveredModels } from "./model_discovery.js";
import { customModelGroups } from "../../agent/custom-model-groups.js";

/** Available CLI agent model groups for selection. */
export const CLI_MODEL_GROUPS = [
  {
    cliId: "claude",
    name: "Claude Code",
    models: CLAUDE_MODELS.map((model) => ({
      id: `claude:${model.id}`,
      label: `Claude ${model.label}`,
    })),
  },
  {
    cliId: "codex",
    name: "Codex",
    models: CODEX_MODELS.map((model) => ({
      ...model,
      id: `codex:${model.id}`,
    })),
  },
  {
    cliId: "antigravity",
    name: "Antigravity",
    models: [
      {
        id: "antigravity:gemini-3.8-flash-high",
        label: "Gemini 3.8 Flash (High)",
      },
      {
        id: "antigravity:gemini-3.8-flash-medium",
        label: "Gemini 3.8 Flash (Medium)",
      },
      {
        id: "antigravity:gemini-3.8-flash-low",
        label: "Gemini 3.8 Flash (Low)",
      },
      {
        id: "antigravity:claude-sonnet-4-6",
        label: "Claude Sonnet 4.6 (Thinking)",
      },
      {
        id: "antigravity:claude-opus-4-6-thinking",
        label: "Claude Opus 4.6 (Thinking)",
      },
      { id: "antigravity:gpt-oss-120b-medium", label: "GPT-OSS 120B (Medium)" },
    ],
  },
];

/** CLI groups plus the user's custom API providers (same order as the panel menu). */
export function availableModelGroups(customGroups = customModelGroups()) {
  return [
    ...CLI_MODEL_GROUPS.map((group) => ({
      ...group,
      models: getDiscoveredModels(group.cliId) ?? group.models,
    })),
    ...customGroups,
  ];
}

function platformProviderId(cliId) {
  if (cliId === "claude") return "claude-cli";
  if (cliId === "codex") return "cli";
  if (cliId === "antigravity") return "antigravity-cli";
  return cliId;
}

function splitModelLabel(label) {
  const compact = String(label ?? "").replace(/^(?:Claude|Gemini)\s+/i, "");
  const tier = compact.match(/\s+\((High|Medium|Low|Thinking)\)$/i);
  return {
    modelName: tier ? compact.slice(0, tier.index) : compact,
    tier: tier?.[1] ?? "",
  };
}

/** Provider mark and compact model parts for visual model-name labels. */
export function getModelDisplayParts(modelId, groups = availableModelGroups()) {
  if (!modelId)
    return {
      providerId: null,
      platformName: null,
      modelName: "Flash",
      tier: "",
    };
  for (const group of groups) {
    const model = group.models.find((entry) => entry.id === modelId);
    if (model)
      return {
        providerId: platformProviderId(group.cliId),
        platformName: group.name,
        ...splitModelLabel(model.label),
      };
  }
  const parts = String(modelId).split(":");
  if (parts.length >= 2) {
    const platformId = parts[0];
    const platformName =
      platformId.charAt(0).toUpperCase() + platformId.slice(1);
    return {
      providerId: platformProviderId(platformId),
      platformName,
      ...splitModelLabel(parts.slice(1).join(":")),
    };
  }
  return { providerId: null, platformName: null, ...splitModelLabel(modelId) };
}

/** Plain-text compact label for contexts that cannot render provider marks. */
export function getModelDisplayLabel(modelId) {
  const { modelName, tier } = getModelDisplayParts(modelId);
  return `${modelName}${tier}`;
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
