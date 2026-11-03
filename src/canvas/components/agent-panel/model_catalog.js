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
        id: "antigravity:claude-sonnet-5-5-high",
        label: "Claude Sonnet 5.5 (High)",
      },
      {
        id: "antigravity:claude-opus-5-5-high",
        label: "Claude Opus 5.5 (High)",
      },
      { id: "antigravity:gpt-oss-120b-medium", label: "GPT-OSS 120B (Medium)" },
    ],
  },
];

/**
 * Image generation model groups for Image Mode.
 * Per interaction requirements: "GPT 网页" and "Gemini 网页" MUST be at the very top.
 */
export const IMAGE_MODEL_GROUPS = [
  {
    cliId: "web",
    name: "网页免 Key 生图",
    models: [
      { id: "web:chatgpt", label: "GPT 网页" },
      { id: "web:gemini", label: "Gemini 网页" },
    ],
  },
  {
    cliId: "302",
    name: "302.AI",
    models: [
      { id: "302:doubao-seedream-5-0-pro-260628", label: "Seedream 5.0 Pro" },
      { id: "302:qwen-image-3.0-pro", label: "Qwen 3.0 Pro" },
      { id: "302:gemini-3.1-flash-image-preview", label: "Gemini 3.1 Flash Image" },
    ],
  },
  {
    cliId: "dashscope",
    name: "DashScope (百炼)",
    models: [
      { id: "dashscope:qwen-image-3.0-pro", label: "通义万相 3.0 Pro" },
      { id: "dashscope:qwen-image-plus", label: "通义万相 Plus" },
    ],
  },
  {
    cliId: "volcengine",
    name: "火山方舟",
    models: [
      { id: "volcengine:doubao-seedream-5-0-pro-260628", label: "豆包 Seedream 5.0 Pro" },
    ],
  },
  {
    cliId: "zhipu",
    name: "智谱 AI",
    models: [
      { id: "zhipu:cogview-3-plus", label: "CogView 3 Plus" },
    ],
  },
];

export const DEFAULT_DESIGN_MODEL = "antigravity:gemini-3.8-flash-high";
export const DEFAULT_IMAGE_MODEL = "web:chatgpt";

export function isWebImageModel(modelId) {
  return (
    typeof modelId === "string" &&
    (modelId.startsWith("web:") || modelId === "chatgpt" || modelId === "gemini")
  );
}

/** Model groups filtered by mode (design vs image). */
export function availableModelGroups(customGroups, mode = "design") {
  if (mode === "image") {
    const custom = customGroups ?? customModelGroups(undefined, undefined, "image");
    return [...IMAGE_MODEL_GROUPS, ...custom];
  }
  const custom = customGroups ?? customModelGroups();
  return [
    ...CLI_MODEL_GROUPS.map((group) => ({
      ...group,
      models: getDiscoveredModels(group.cliId) ?? group.models,
    })),
    ...custom,
  ];
}

function platformProviderId(cliId) {
  if (cliId === "claude") return "claude-cli";
  if (cliId === "codex") return "cli";
  if (cliId === "antigravity") return "antigravity-cli";
  return cliId;
}

function splitModelLabel(label) {
  const str = String(label ?? "");
  if (str.includes("网页") || str.startsWith("Seedream") || str.startsWith("Qwen") || str.startsWith("CogView")) {
    return { modelName: str, tier: "" };
  }
  const compact = str.replace(/^(?:Claude|Gemini)\s+/i, "");
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
  const searchGroups = [...groups, ...IMAGE_MODEL_GROUPS];
  for (const group of searchGroups) {
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
  const searchGroups = [...groups, ...IMAGE_MODEL_GROUPS];
  for (const group of searchGroups) {
    const model = group.models.find((entry) => entry.id === modelId);
    if (model) return { group, model };
  }
  return null;
}

/** True when the id resolves to a catalog entry the picker can display. */
export function isKnownModel(modelId, groups = availableModelGroups()) {
  return Boolean(findModelGroup(modelId, groups));
}
