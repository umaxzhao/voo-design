import {
  CLI_AGENTS,
  CLI_TRANSPORT,
  VISIBLE_CLI_AGENTS,
  cliAgentForProvider,
  cliConnectionReason,
  getDiscoveredCliModels,
  setDiscoveredCliModels,
} from "../../../shared/cli-agents.js";
import { cliTransport, ensureLocalCliBridge } from "./local_cli_bridge.js";
import {
  AI_302_DEFAULT_BASE_URL,
  AI_302_TEXT_MODEL_ID,
  AI_302_TEXT_MODELS,
  APIMART_DEFAULT_BASE_URL,
  APIMART_TEXT_MODELS,
  DASHSCOPE_COMPATIBLE_BASE_URL,
  DASHSCOPE_TEXT_MODELS,
  DEEPSEEK_DEFAULT_BASE_URL,
  DEEPSEEK_TEXT_MODELS,
  MINIMAX_DEFAULT_BASE_URL,
  MINIMAX_TEXT_MODEL_ID,
  MINIMAX_TEXT_MODELS,
  MODELSCOPE_DEFAULT_BASE_URL,
  MODELSCOPE_TEXT_MODEL_ID,
  MODELSCOPE_TEXT_MODELS,
  MOONSHOT_DEFAULT_BASE_URL,
  MOONSHOT_TEXT_MODEL_ID,
  MOONSHOT_TEXT_MODELS,
  OPENROUTER_DEFAULT_BASE_URL,
  OPENROUTER_TEXT_MODELS,
  VOLCENGINE_DEFAULT_BASE_URL,
  VOLCENGINE_TEXT_MODELS,
  ZHIPU_DEFAULT_BASE_URL,
  ZHIPU_TEXT_MODELS,
  PROVIDER_ID,
} from "../../../shared/providers.js";
import {
  creditsApiBase,
  readBrowserAuthToken,
} from "../../../shared/providers/provider_credentials.js";
import { getSetting, setSetting } from "../../../shared/settings.js";
import { canonicalizeCliModelId } from "../../../shared/providers/provider_cli.js";
import { getCodexReasoningSettings } from "../../../shared/codex-reasoning.js";
import {
  getStoredCustomProviders,
  isCustomProviderId,
} from "../../../shared/custom_providers.js";
import { planFallbackChain } from "../../../shared/model-routes.js";
import { loadRecentCachedCloudCatalog } from "../../../shared/cloud_models_catalog.js";
import {
  cloudModelReleaseDate,
  isRecentCloudReleaseDate,
} from "../../../shared/cloud_model_release.js";
import { BG } from "../../../shared/messages.js";

export const AGENT_LLM_PROVIDER_KEY = "voo.agent.llmProvider";
export const AGENT_LLM_MODEL_KEY = "voo.agent.llmModel";

/** Plans fallback chain for agent LLM providers. */
export function planAgentLlmFallbackChain(candidates, options = {}) {
  return planFallbackChain(candidates, options);
}

/** Connection choices shared by settings and the conversation picker. */
export function getAgentProviders() {
  const cli = VISIBLE_CLI_AGENTS.map((agent) => ({
    id: agent.providerId,
    labelKey: agent.labelKey,
    label: agent.id,
  }));
  const api = [
    {
      id: PROVIDER_ID.DEEPSEEK,
      labelKey: "provider.deepseek.label",
      label: "DeepSeek",
    },
    {
      id: PROVIDER_ID.DASHSCOPE,
      labelKey: "provider.dashscope.label",
      label: "DashScope",
    },
    {
      id: PROVIDER_ID.VOLCENGINE,
      labelKey: "provider.volcengine.label",
      label: "火山方舟",
    },
    {
      id: PROVIDER_ID.ZHIPU,
      labelKey: "provider.zhipu.label",
      label: "智谱 AI",
    },
    {
      id: PROVIDER_ID.MOONSHOT,
      labelKey: "agent.provider.kimi",
      label: "Kimi",
    },
    {
      id: PROVIDER_ID.MINIMAX,
      labelKey: "provider.minimax.label",
      label: "MiniMax",
    },
    {
      id: PROVIDER_ID.MODELSCOPE,
      labelKey: "provider.modelscope.label",
      label: "魔搭社区",
    },
    { id: PROVIDER_ID.AI_302, labelKey: "provider.302.label", label: "302.AI" },
    {
      id: PROVIDER_ID.APIMART,
      labelKey: "provider.apimart.label",
      label: "API MART",
    },
    {
      id: PROVIDER_ID.OPENROUTER,
      labelKey: "provider.openrouter.label",
      label: "OpenRouter",
    },
  ];
  const credits = [
    {
      id: PROVIDER_ID.CREDITS,
      labelKey: "agent.connection.vooCredits",
      label: "VOO Credits",
    },
  ];
  const custom = getStoredCustomProviders().map((provider) => ({
    id: provider.id,
    label: provider.name || provider.label,
    isCustom: true,
  }));
  return [...cli, ...credits, ...api, ...custom];
}

export const AGENT_PROVIDERS = getAgentProviders();

export const AGENT_PROVIDER_MODELS = {
  ...Object.fromEntries(
    CLI_AGENTS.map((agent) => [
      agent.providerId,
      {
        name: agent.displayName,
        defaultBaseUrl: "cli:",
        defaultModel: agent.defaultModel
          ? `${agent.id}:${agent.defaultModel}`
          : "",
        models: agent.models.map((model) => ({
          ...model,
          id: `${agent.id}:${model.id}`,
        })),
      },
    ]),
  ),
  [PROVIDER_ID.CREDITS]: {
    name: "VOO Credits",
    labelKey: "agent.connection.vooCredits",
    defaultBaseUrl: creditsApiBase("deepseek"),
    defaultModel: "deepseek-v4-flash",
    models: [
      { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
      { id: "qwen3.8-flash", label: "Qwen 3.8 Flash" },
      { id: "kimi-k3", label: "Kimi 3 (K3)" },
      { id: "glm-5.3", label: "GLM 5.3" },
      { id: "deepseek-chat", label: "DeepSeek V3" },
      { id: "deepseek-reasoner", label: "DeepSeek R1" },
      { id: "qwen-plus", label: "Qwen Plus" },
      { id: "glm-4-plus", label: "GLM-4 Plus" },
    ],
  },
  [PROVIDER_ID.DEEPSEEK]: {
    name: "DeepSeek",
    defaultBaseUrl: DEEPSEEK_DEFAULT_BASE_URL,
    // Flash sees images, so a selected picture reaches the agent as pixels.
    defaultModel: "deepseek-flash",
    models: DEEPSEEK_TEXT_MODELS,
  },
  [PROVIDER_ID.ZHIPU]: {
    name: "智谱 AI",
    defaultBaseUrl: ZHIPU_DEFAULT_BASE_URL,
    defaultModel: "glm-4-plus",
    models: ZHIPU_TEXT_MODELS,
  },
  [PROVIDER_ID.DASHSCOPE]: {
    name: "DashScope",
    defaultBaseUrl: DASHSCOPE_COMPATIBLE_BASE_URL,
    // Must stay in step with DASHSCOPE_TEXT_MODELS / DASHSCOPE_TEXT_MODEL_ID
    // and with AGENT_API_PROVIDER_DEFAULTS in agent_provider_defaults.js —
    // tests/electron_package.test.js asserts this table and that one agree.
    defaultModel: "qwen3.8-flash",
    models: DASHSCOPE_TEXT_MODELS,
  },
  [PROVIDER_ID.OPENROUTER]: {
    name: "OpenRouter",
    defaultBaseUrl: OPENROUTER_DEFAULT_BASE_URL,
    defaultModel: "anthropic/claude-3.5-sonnet",
    models: OPENROUTER_TEXT_MODELS,
  },
  [PROVIDER_ID.VOLCENGINE]: {
    name: "火山方舟",
    defaultBaseUrl: VOLCENGINE_DEFAULT_BASE_URL,
    defaultModel: "doubao-1-5-pro-32k",
    models: VOLCENGINE_TEXT_MODELS,
  },
  [PROVIDER_ID.AI_302]: {
    name: "302.AI",
    defaultBaseUrl: AI_302_DEFAULT_BASE_URL,
    defaultModel: AI_302_TEXT_MODEL_ID,
    // `AI_302_TEXT_MODELS || [...]` used to sit here. `[]` is truthy, so the
    // fallback never fired and 302.AI was the one provider whose agent model
    // menu opened empty — a control the user is told to choose from and given
    // nothing in. It also carried `qwen-plus`, which 302.AI does not document.
    // The catalogue is read straight through now, and `ModelRow` states the
    // empty case rather than opening a dropdown with nothing in it.
    models: AI_302_TEXT_MODELS,
  },
  [PROVIDER_ID.APIMART]: {
    name: "API MART",
    defaultBaseUrl: APIMART_DEFAULT_BASE_URL,
    defaultModel: "claude-opus-5",
    models: APIMART_TEXT_MODELS,
  },
  [PROVIDER_ID.MINIMAX]: {
    name: "MiniMax",
    defaultBaseUrl: MINIMAX_DEFAULT_BASE_URL,
    defaultModel: MINIMAX_TEXT_MODEL_ID,
    models: MINIMAX_TEXT_MODELS,
  },
  [PROVIDER_ID.MOONSHOT]: {
    name: "Kimi",
    defaultBaseUrl: MOONSHOT_DEFAULT_BASE_URL,
    defaultModel: MOONSHOT_TEXT_MODEL_ID,
    models: MOONSHOT_TEXT_MODELS,
  },
  [PROVIDER_ID.MODELSCOPE]: {
    name: "魔搭社区",
    defaultBaseUrl: MODELSCOPE_DEFAULT_BASE_URL,
    defaultModel: MODELSCOPE_TEXT_MODEL_ID,
    models: MODELSCOPE_TEXT_MODELS,
  },
};

/** Resolve upstream credits API base URL according to selected model. */
export function resolveCreditsBaseUrl(model) {
  if (!model || model.startsWith("deepseek")) return creditsApiBase("deepseek");
  if (model.startsWith("qwen")) return creditsApiBase("dashscope");
  if (
    model.startsWith("kimi") ||
    model.startsWith("glm") ||
    model.startsWith("claude") ||
    model.startsWith("gpt")
  ) {
    return creditsApiBase("302");
  }
  if (model.startsWith("doubao")) return creditsApiBase("ark");
  if (model.startsWith("gemini")) return creditsApiBase("google");
  return creditsApiBase("deepseek");
}

/** Resolve account-specific CLI models without freezing them at module load. */
export function getAgentProviderModels(providerId) {
  const cliAgent = cliAgentForProvider(providerId);
  if (["antigravity", "opencode"].includes(cliAgent?.id)) {
    return getDiscoveredCliModels(cliAgent.id).map((model) => ({
      ...model,
      id: model.id.startsWith(`${cliAgent.id}:`)
        ? model.id
        : `${cliAgent.id}:${model.id}`,
    }));
  }
  if (providerId === PROVIDER_ID.CREDITS) {
    const staticModels = (
      AGENT_PROVIDER_MODELS[PROVIDER_ID.CREDITS]?.models ?? []
    ).filter((model) => isRecentCloudReleaseDate(cloudModelReleaseDate(model)));
    try {
      const cached = loadRecentCachedCloudCatalog();
      if (cached?.items?.length) {
        const textItems = cached.items.filter(
          (item) => (item.kind || "text") === "text",
        );
        if (textItems.length > 0) {
          const seen = new Set();
          const merged = [];
          for (const item of textItems) {
            seen.add(item.id);
            merged.push({ id: item.id, label: item.label || item.id });
          }
          for (const m of staticModels) {
            if (!seen.has(m.id)) {
              merged.push(m);
              seen.add(m.id);
            }
          }
          return merged;
        }
      }
    } catch {
      // fallback to static models
    }
    return staticModels;
  }
  if (providerId === "antigravity-cli") {
    const discovered = getDiscoveredCliModels("antigravity");
    if (discovered.length > 0) {
      return discovered.map((m) => ({
        ...m,
        id: `antigravity:${m.id}`,
      }));
    }
  }
  return AGENT_PROVIDER_MODELS[providerId]?.models ?? [];
}

/**
 * The label one model row shows in the agent's model menu.
 *
 * The credits provider is VOO's route by definition, so its model is branded
 * with VOO's name instead of the upstream the user never chose; every other
 * provider's row keeps the model's own label — that is the thing being picked.
 * A pure function so the row and its test cannot disagree about the rule.
 */
export function agentModelLabel(providerId, model, t) {
  if (providerId === PROVIDER_ID.CREDITS) return t("provider.vooCloud");
  if (model?.labelKey) return t(model.labelKey);
  return model?.label || model?.id || "";
}

/** Get the configured user preference for LLM provider (defaults to Codex). */
export function getStoredLlmProvider() {
  const stored = getSetting(AGENT_LLM_PROVIDER_KEY);
  if (typeof stored === "string" && stored) return stored;
  try {
    return localStorage.getItem(AGENT_LLM_PROVIDER_KEY) || PROVIDER_ID.CLI;
  } catch {
    return PROVIDER_ID.CLI;
  }
}

/** The provider the user actually chose, or null — never the default. */
export function explicitLlmProvider() {
  const stored = getSetting(AGENT_LLM_PROVIDER_KEY);
  if (typeof stored === "string" && stored) return stored;
  try {
    return localStorage.getItem(AGENT_LLM_PROVIDER_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * Whether resolving the agent config may dial the loopback CLI bridge.
 *
 * Dial only once the user has picked a CLI agent themselves — never for the
 * default cloud provider or unconfigured visitor on loopback/dev environments.
 */
export function shouldDialCliBridge() {
  if (typeof window === "undefined") return false;
  return Boolean(cliAgentForProvider(explicitLlmProvider()));
}

export function setStoredLlmProvider(providerId) {
  try {
    void setSetting(AGENT_LLM_PROVIDER_KEY, providerId);
    window.dispatchEvent(new CustomEvent("ciw-agent-llm-changed"));
  } catch {
    // storage unavailable
  }
}

/** Get the configured user preference for LLM model. */
export function getStoredLlmModel(providerId) {
  let model = null;
  const stored = getSetting(AGENT_LLM_MODEL_KEY);
  if (stored && typeof stored === "object" && stored[providerId]) {
    model = stored[providerId];
  } else {
    try {
      const key = `${AGENT_LLM_MODEL_KEY}.${providerId}`;
      model = localStorage.getItem(key) || null;
    } catch {
      model = null;
    }
  }
  if (providerId === "claude-cli") {
    return canonicalizeCliModelId(model);
  }
  return model;
}

export function setStoredLlmModel(providerId, modelId) {
  try {
    const canonical =
      providerId === "claude-cli" ? canonicalizeCliModelId(modelId) : modelId;
    const current = getSetting(AGENT_LLM_MODEL_KEY);
    const models = current && typeof current === "object" ? current : {};
    const next = { ...models };
    if (canonical) next[providerId] = canonical;
    else delete next[providerId];
    void setSetting(AGENT_LLM_MODEL_KEY, next);
    window.dispatchEvent(new CustomEvent("ciw-agent-llm-changed"));
  } catch {
    // storage unavailable
  }
}

/**
 * Load API key for a specific provider across credentialArea, web storage, and background config.
 */
async function loadProviderApiKey(providerId) {
  // 1. Try credentialArea
  try {
    const { credentialArea } =
      await import("../../../shared/providers/credential_store.js");
    const sessionArea = credentialArea("session");
    const localArea = credentialArea("local");
    const sessionKey = `ciw.provider.${providerId}.session`;
    const localKey = `ciw.provider.${providerId}.local`;

    if (sessionArea) {
      const s = await sessionArea.get(sessionKey);
      if (s[sessionKey]?.apiKey) return s[sessionKey].apiKey;
    }
    if (localArea) {
      const l = await localArea.get(localKey);
      if (l[localKey]?.apiKey) return l[localKey].apiKey;
    }
  } catch {
    // try next
  }

  // 2. Direct read from localStorage / sessionStorage
  try {
    const localRaw = localStorage.getItem(`ciw.provider.${providerId}.local`);
    if (localRaw) {
      const parsed = JSON.parse(localRaw);
      if (parsed?.apiKey) return parsed.apiKey;
    }
    const sessionRaw = sessionStorage.getItem(
      `ciw.provider.${providerId}.session`,
    );
    if (sessionRaw) {
      const parsed = JSON.parse(sessionRaw);
      if (parsed?.apiKey) return parsed.apiKey;
    }
  } catch {
    // try next
  }

  return null;
}

/** Fetch Agent config summary from connected desktop client (if any) without raw keys. */
async function getDesktopConfigIfLinked() {
  if (typeof window === "undefined" || window.vooDesktop) return null;
  try {
    const { callBackground } = await import("../../rpc_background.js");
    const linkedRes = await callBackground(BG.DESKTOP_LINKED);
    if (!linkedRes?.linked) return null;
    const configRes = await callBackground(BG.DESKTOP_AGENT_CONFIG);
    return configRes?.summary ?? null;
  } catch {
    return null;
  }
}

/** API connection state for settings. Returns presence only; credentials stay
 * inside the credential store and are never exposed to the card UI. */
export async function getApiProviderAvailability() {
  const desktopSummary = await getDesktopConfigIfLinked();
  // Custom gateways configured in the desktop app are not in this page's own
  // provider list, so offer the ones the linked desktop reports as well.
  const desktopCustom = Object.entries(desktopSummary?.providers ?? {})
    .filter(([id, entry]) => entry?.isCustom && isCustomProviderId(id))
    .map(([id, entry]) => ({
      id,
      label: entry.name || id,
      isCustom: true,
    }));
  // getAgentProviders already folds in this page's own custom providers, so
  // one membership check covers both built-ins and locally stored gateways.
  const localProviders = getAgentProviders();
  const providers = [
    ...localProviders,
    ...desktopCustom.filter(
      (remote) => !localProviders.some((local) => local.id === remote.id),
    ),
  ].filter((provider) => !cliAgentForProvider(provider.id));
  return await Promise.all(
    providers.map(async (provider) => {
      const localConfigured = Boolean(await loadProviderApiKey(provider.id));
      const desktopConfigured = Boolean(
        desktopSummary?.providers?.[provider.id]?.configured,
      );
      return {
        ...provider,
        configured: localConfigured || desktopConfigured,
        desktopProxy: !localConfigured && desktopConfigured,
      };
    }),
  );
}

/**
 * Resolves the active LLM provider, base URL, model name, and API key for Agent.
 * @returns {Promise<{
 *   providerId: string,
 *   providerName: string,
 *   model: string,
 *   baseUrl: string,
 *   apiKey: string|null,
 *   configured: boolean,
 *   availableProviders: Array<{ id: string, name: string, configured: boolean }>
 * }>}
 */
export async function resolveAgentLlmConfig() {
  const preferredProvider = getStoredLlmProvider();
  const desktopSummary = await getDesktopConfigIfLinked();

  // Check which providers have API keys
  const [
    deepseekKey,
    dashscopeKey,
    openrouterKey,
    volcengineKey,
    zhipuKey,
    ai302Key,
    apimartKey,
    minimaxKey,
    modelscopeKey,
  ] = await Promise.all([
    loadProviderApiKey(PROVIDER_ID.DEEPSEEK),
    loadProviderApiKey(PROVIDER_ID.DASHSCOPE),
    loadProviderApiKey(PROVIDER_ID.OPENROUTER),
    loadProviderApiKey(PROVIDER_ID.VOLCENGINE),
    loadProviderApiKey(PROVIDER_ID.ZHIPU),
    loadProviderApiKey(PROVIDER_ID.AI_302),
    loadProviderApiKey(PROVIDER_ID.APIMART),
    loadProviderApiKey(PROVIDER_ID.MINIMAX),
    loadProviderApiKey(PROVIDER_ID.MODELSCOPE),
  ]);

  const keys = {
    [PROVIDER_ID.DEEPSEEK]:
      deepseekKey ||
      (desktopSummary?.providers?.[PROVIDER_ID.DEEPSEEK]?.configured
        ? "desktop-proxy"
        : null),
    [PROVIDER_ID.DASHSCOPE]:
      dashscopeKey ||
      (desktopSummary?.providers?.[PROVIDER_ID.DASHSCOPE]?.configured
        ? "desktop-proxy"
        : null),
    [PROVIDER_ID.OPENROUTER]:
      openrouterKey ||
      (desktopSummary?.providers?.[PROVIDER_ID.OPENROUTER]?.configured
        ? "desktop-proxy"
        : null),
    [PROVIDER_ID.VOLCENGINE]:
      volcengineKey ||
      (desktopSummary?.providers?.[PROVIDER_ID.VOLCENGINE]?.configured
        ? "desktop-proxy"
        : null),
    [PROVIDER_ID.ZHIPU]:
      zhipuKey ||
      (desktopSummary?.providers?.[PROVIDER_ID.ZHIPU]?.configured
        ? "desktop-proxy"
        : null),
    [PROVIDER_ID.AI_302]:
      ai302Key ||
      (desktopSummary?.providers?.[PROVIDER_ID.AI_302]?.configured
        ? "desktop-proxy"
        : null),
    [PROVIDER_ID.APIMART]:
      apimartKey ||
      (desktopSummary?.providers?.[PROVIDER_ID.APIMART]?.configured
        ? "desktop-proxy"
        : null),
    [PROVIDER_ID.MINIMAX]:
      minimaxKey ||
      (desktopSummary?.providers?.[PROVIDER_ID.MINIMAX]?.configured
        ? "desktop-proxy"
        : null),
    [PROVIDER_ID.MODELSCOPE]:
      modelscopeKey ||
      (desktopSummary?.providers?.[PROVIDER_ID.MODELSCOPE]?.configured
        ? "desktop-proxy"
        : null),
  };

  // A custom gateway configured in the desktop app is unknown to this page:
  // `voo.custom_providers` is renderer-local. The linked desktop reports its
  // own custom entries, so merge them in rather than showing them as missing.
  const localCustomProviders = getStoredCustomProviders();
  const desktopCustomProviders = Object.entries(desktopSummary?.providers ?? {})
    .filter(([id, entry]) => entry?.isCustom && isCustomProviderId(id))
    .map(([id, entry]) => ({
      id,
      name: entry.name || id,
      defaultBaseUrl: entry.baseUrl || "",
      isCustom: true,
    }));
  const customProviders = [
    ...localCustomProviders,
    ...desktopCustomProviders.filter(
      (remote) => !localCustomProviders.some((local) => local.id === remote.id),
    ),
  ];
  const customAvailability = await Promise.all(
    customProviders.map(async (provider) => ({
      id: provider.id,
      name: provider.name || provider.label,
      configured: Boolean(
        (await loadProviderApiKey(provider.id)) ||
        desktopSummary?.providers?.[provider.id]?.configured,
      ),
    })),
  );

  // Probe local CLI status through the desktop app or the loopback bridge.
  let cliCheck = null;
  const cliBridge = await ensureLocalCliBridge({
    dial: shouldDialCliBridge(),
  });
  // Every channel of a local CLI bridge travels as `BG.DESKTOP_CLI_INVOKE`, so
  // a read-only link answers this probe with a link-protocol error rather than
  // a status. Asking it nothing is not a missing check: the desktop's own
  // summary below is the read such a link does support, and `cliTransport()`
  // reports what the link cannot do however healthy that summary looks.
  if (
    cliTransport() === CLI_TRANSPORT.RUNNABLE &&
    typeof cliBridge?.checkAll === "function"
  ) {
    try {
      cliCheck = await cliBridge.checkAll();
      if (cliBridge.connect) {
        cliCheck.codex = await cliBridge.connect();
      }
    } catch {
      cliCheck = null;
    }
  }
  if (!cliCheck && desktopSummary?.cli) {
    cliCheck = desktopSummary.cli;
  }
  // Discovery is metadata, not an authentication proof. Refresh the selected
  // CLI's catalog without substituting another provider or a pinned model.
  setDiscoveredCliModels("opencode", cliCheck?.opencode?.models ?? []);
  const cliProviderEntry = VISIBLE_CLI_AGENTS.map((agent) => {
    const reasonKey = cliConnectionReason(
      agent,
      cliCheck?.[agent.id],
      cliTransport(),
    );
    return {
      id: agent.providerId,
      name: agent.id,
      labelKey: agent.labelKey,
      configured: !reasonKey,
      reason: null,
      reasonKey,
    };
  });

  // Match the API providers exposed by the unified connection selector.
  const apiProviderIds = [
    PROVIDER_ID.DEEPSEEK,
    PROVIDER_ID.DASHSCOPE,
    PROVIDER_ID.VOLCENGINE,
    PROVIDER_ID.ZHIPU,
    PROVIDER_ID.AI_302,
    PROVIDER_ID.APIMART,
    PROVIDER_ID.MINIMAX,
    PROVIDER_ID.MODELSCOPE,
    PROVIDER_ID.OPENROUTER,
  ];
  const availableProviders = [
    ...apiProviderIds.map((id) => ({
      id,
      name: AGENT_PROVIDER_MODELS[id]?.name || id,
      configured: Boolean(keys[id]),
      desktopProxy: keys[id] === "desktop-proxy",
    })),
    {
      id: PROVIDER_ID.CREDITS,
      name: AGENT_PROVIDER_MODELS[PROVIDER_ID.CREDITS].name,
      configured: Boolean(readBrowserAuthToken()),
    },
    ...cliProviderEntry,
    ...customAvailability,
  ];

  // Explicit choices persist. Automatic/new installations use Codex on desktop
  // and never silently substitute another vendor when the subscription is unavailable.
  // On web without a runnable CLI transport, unconfigured/auto installations fall
  // back to the first configured non-CLI provider (or DeepSeek if none configured)
  // so the user is guided to configure an API key rather than installing a local binary.
  const explicit = explicitLlmProvider();
  const canUseLocalCli = cliTransport() === CLI_TRANSPORT.RUNNABLE;
  const isExplicitCli = Boolean(explicit && cliAgentForProvider(explicit));

  let resolvedPreferred = preferredProvider;
  if (
    (!explicit || explicit === "auto" || resolvedPreferred === "auto") &&
    desktopSummary?.preferredProvider &&
    desktopSummary.preferredProvider !== "auto"
  ) {
    resolvedPreferred = desktopSummary.preferredProvider;
  }
  // Test against what was actually resolved: a custom gateway inherited from
  // the desktop has no AGENT_PROVIDER_MODELS entry, so judging by the local
  // preference instead sent every desktop-chosen custom provider to the CLI.
  const preferredIsCustom = isCustomProviderId(resolvedPreferred);

  let targetProviderId;
  if (!canUseLocalCli && !isExplicitCli) {
    if (
      resolvedPreferred &&
      resolvedPreferred !== "auto" &&
      resolvedPreferred !== PROVIDER_ID.CLI &&
      !cliAgentForProvider(resolvedPreferred) &&
      (preferredIsCustom || AGENT_PROVIDER_MODELS[resolvedPreferred])
    ) {
      targetProviderId = resolvedPreferred;
    } else {
      const firstConfigured = availableProviders.find(
        (p) =>
          !cliAgentForProvider(p.id) &&
          p.id !== PROVIDER_ID.CLI &&
          p.configured,
      );
      targetProviderId = firstConfigured?.id || PROVIDER_ID.DEEPSEEK;
    }
  } else {
    targetProviderId =
      resolvedPreferred === "auto" ||
      (!preferredIsCustom && !AGENT_PROVIDER_MODELS[resolvedPreferred])
        ? PROVIDER_ID.CLI
        : resolvedPreferred;
  }

  let meta;
  let apiKey;
  let isCli = false;
  let reason = null;
  let reasonKey = null;
  if (isCustomProviderId(targetProviderId)) {
    const custom = customProviders.find(
      (provider) => provider.id === targetProviderId,
    );
    meta = {
      name: custom?.name ?? targetProviderId,
      defaultBaseUrl: custom?.defaultBaseUrl ?? "",
    };
    apiKey =
      (await loadProviderApiKey(targetProviderId)) ||
      (desktopSummary?.providers?.[targetProviderId]?.configured
        ? "desktop-proxy"
        : null);
  } else if (targetProviderId === PROVIDER_ID.CREDITS) {
    meta = AGENT_PROVIDER_MODELS[PROVIDER_ID.CREDITS];
    const token = readBrowserAuthToken();
    apiKey = token || null;
    if (!apiKey) {
      reasonKey = "agent.connection.loginRequired";
    }
  } else {
    meta =
      AGENT_PROVIDER_MODELS[targetProviderId] ||
      AGENT_PROVIDER_MODELS[PROVIDER_ID.DEEPSEEK];
    isCli = Boolean(cliAgentForProvider(targetProviderId));
    if (isCli) {
      const connection = cliProviderEntry.find(
        (entry) => entry.id === targetProviderId,
      );
      apiKey = connection.configured ? "cli-local" : null;
      reasonKey = connection.reasonKey;
    } else {
      apiKey = keys[targetProviderId] || null;
    }
  }
  const userModel = getStoredLlmModel(targetProviderId);
  const desktopModel =
    desktopSummary?.preferredProvider === targetProviderId
      ? desktopSummary.preferredModel
      : null;
  const model = userModel || desktopModel || meta.defaultModel || "";
  // OpenCode has no implicit model route: login/catalog metadata alone must
  // not enable a turn that could choose a supplier the user never selected.
  if (targetProviderId === "opencode-cli" && !model && !reasonKey) {
    apiKey = null;
    reasonKey = "agent.selectModel";
  }
  const reasoning =
    targetProviderId === PROVIDER_ID.CLI && model.startsWith("codex:")
      ? getCodexReasoningSettings(model, cliCheck?.codex?.models)
      : { reasoningEfforts: [], reasoningEffort: null };

  const fallbackCandidates = [
    ...cliProviderEntry.map((entry) => ({
      providerId: entry.id,
      name: entry.name,
      model:
        getStoredLlmModel(entry.id) ||
        AGENT_PROVIDER_MODELS[entry.id]?.defaultModel ||
        `${entry.id}:default`,
      configured: entry.configured,
      isCli: true,
    })),
    {
      providerId: PROVIDER_ID.CREDITS,
      name: AGENT_PROVIDER_MODELS[PROVIDER_ID.CREDITS]?.name,
      model:
        getStoredLlmModel(PROVIDER_ID.CREDITS) ||
        AGENT_PROVIDER_MODELS[PROVIDER_ID.CREDITS]?.defaultModel,
      configured: Boolean(readBrowserAuthToken()),
      apiKey: readBrowserAuthToken() || null,
      baseUrl: resolveCreditsBaseUrl(
        getStoredLlmModel(PROVIDER_ID.CREDITS) ||
          AGENT_PROVIDER_MODELS[PROVIDER_ID.CREDITS]?.defaultModel,
      ),
      isCli: false,
    },
    ...apiProviderIds.map((id) => ({
      providerId: id,
      name: AGENT_PROVIDER_MODELS[id]?.name || id,
      model: getStoredLlmModel(id) || AGENT_PROVIDER_MODELS[id]?.defaultModel,
      configured: Boolean(keys[id]),
      apiKey: keys[id] || null,
      baseUrl: AGENT_PROVIDER_MODELS[id]?.defaultBaseUrl,
      isCli: false,
    })),
    ...customProviders.map((p) => ({
      providerId: p.id,
      name: p.name || p.label,
      model: getStoredLlmModel(p.id) || "",
      configured: Boolean(
        customAvailability.find((c) => c.id === p.id)?.configured,
      ),
      baseUrl: p.defaultBaseUrl || "",
      isCustom: true,
    })),
  ];

  const fallbackChain = planFallbackChain(fallbackCandidates, {
    lockedProviderId:
      preferredProvider === "auto" || !preferredProvider
        ? null
        : targetProviderId,
  });

  return {
    providerId: targetProviderId,
    providerName: meta.name,
    model,
    fallbackChain,
    ...reasoning,
    reasoningError: cliCheck?.codex?.modelsError ?? null,
    baseUrl:
      targetProviderId === PROVIDER_ID.CREDITS
        ? resolveCreditsBaseUrl(model)
        : meta.defaultBaseUrl,
    apiKey,
    configured: Boolean(apiKey),
    desktopProxy: apiKey === "desktop-proxy",
    reason,
    reasonKey,
    availableProviders,
  };
}
