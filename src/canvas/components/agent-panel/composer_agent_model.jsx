/**
 * Agent model selector in the composer's "more" menu.
 *
 * Places the main Agent model choice at the top of the "more" popup so users
 * can switch models mid-conversation without opening Settings. Reads and
 * writes the existing LLM config store and dispatches "ciw-agent-llm-changed"
 * for immediate bidirectional synchronization with SettingsAgent.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import {
  AGENT_PROVIDER_MODELS,
  agentModelLabel,
  getAgentProviderModels,
  getAgentProviders,
  getStoredLlmModel,
  getStoredLlmProvider,
  resolveAgentLlmConfig,
  setStoredLlmModel,
  setStoredLlmProvider,
} from "./agentLlmConfig.js";
import { PROVIDER_ID, supportsVision } from "../../../shared/providers.js";
import { useI18n } from "../../use_i18n.js";
import FlatSelect from "../flat_select.jsx";
import ModelSelect from "../model_select.jsx";
import InfoHint from "../info_hint.jsx";
import { ProviderLogo } from "../provider_icons.jsx";

/**
 * Builds normalized dropdown options from configured providers.
 * Displays platform logo and model name without redundant platform name text prefix.
 */
export function buildAgentModelOptions({
  availableProviders,
  storedProviderId,
  storedModelId,
  locale,
  t,
}) {
  const providers = getAgentProviders(locale);

  // Only list models from connected / configured providers
  const connectedProviders = availableProviders
    ? providers.filter((p) => {
        const status = availableProviders.find((ap) => ap.id === p.id);
        return Boolean(status?.configured);
      })
    : providers.filter((p) => p.id === storedProviderId);

  const options = [];
  for (const p of connectedProviders) {
    const isCredits = p.id === PROVIDER_ID.CREDITS;
    const pName = isCredits
      ? t("provider.vooCloud")
      : p.labelKey
        ? t(p.labelKey)
        : p.label || p.id;
    const pModels = getAgentProviderModels(p.id);
    for (const m of pModels) {
      const mLabel = isCredits ? m.label || m.id : agentModelLabel(p.id, m, t);
      const hasVision = supportsVision(m.id);
      options.push({
        value: `${p.id}::${m.id}`,
        label: mLabel,
        icon: (
          <ProviderLogo
            providerId={p.id}
            size={14}
            className="size-3.5 shrink-0"
          />
        ),
        providerLabel: pName,
        modelLabel: mLabel,
        hint: hasVision ? t("agent.llm.vision") : undefined,
        hasVision,
        providerId: p.id,
        modelId: m.id,
      });
    }
  }

  // Preserve stored choice if the provider is configured but the catalogue
  // doesn't enumerate this specific model id.
  if (storedProviderId && storedModelId) {
    const compound = `${storedProviderId}::${storedModelId}`;
    if (!options.some((o) => o.value === compound)) {
      const p = connectedProviders.find((cp) => cp.id === storedProviderId);
      if (p && p.id !== PROVIDER_ID.CREDITS) {
        const isCredits = p.id === PROVIDER_ID.CREDITS;
        const pName = isCredits
          ? t("provider.vooCloud")
          : p.labelKey
            ? t(p.labelKey)
            : p.label || p.id;
        const hasVision = supportsVision(storedModelId);
        options.unshift({
          value: compound,
          label: storedModelId,
          icon: (
            <ProviderLogo
              providerId={storedProviderId}
              size={14}
              className="size-3.5 shrink-0"
            />
          ),
          providerLabel: pName,
          modelLabel: storedModelId,
          hint: hasVision ? t("agent.llm.vision") : undefined,
          hasVision,
          providerId: storedProviderId,
          modelId: storedModelId,
        });
      }
    }
  }

  return options;
}

export default function ComposerAgentModel({
  llmConfig = null,
  isRunning = false,
  onOpenSettings = null,
  onCloseMenu = null,
}) {
  const { t, locale } = useI18n();

  const [storedProvider, setStoredProvider] = useState(
    () => llmConfig?.providerId || getStoredLlmProvider(),
  );
  const [storedModel, setStoredModel] = useState(() => {
    const providerId = llmConfig?.providerId || getStoredLlmProvider();
    return (
      llmConfig?.model ||
      getStoredLlmModel(providerId) ||
      AGENT_PROVIDER_MODELS[providerId]?.defaultModel ||
      ""
    );
  });
  const [viewProvider, setViewProvider] = useState(
    () => llmConfig?.providerId || getStoredLlmProvider(),
  );
  const [resolvedConfig, setResolvedConfig] = useState(llmConfig);

  useEffect(() => {
    let active = true;
    const sync = async () => {
      const p = getStoredLlmProvider();
      const m =
        getStoredLlmModel(p) || AGENT_PROVIDER_MODELS[p]?.defaultModel || "";
      setStoredProvider(p);
      setStoredModel(m);
      setViewProvider(p);
      try {
        const cfg = await resolveAgentLlmConfig();
        if (active) {
          setResolvedConfig(cfg);
        }
      } catch {
        // Storage or network error
      }
    };

    if (!llmConfig) {
      void sync();
    }

    const handleLlmChange = () => {
      void sync();
    };

    window.addEventListener("ciw-agent-llm-changed", handleLlmChange);
    window.addEventListener("storage", handleLlmChange);
    window.addEventListener("ciw-provider-config-changed", handleLlmChange);
    return () => {
      active = false;
      window.removeEventListener("ciw-agent-llm-changed", handleLlmChange);
      window.removeEventListener("storage", handleLlmChange);
      window.removeEventListener(
        "ciw-provider-config-changed",
        handleLlmChange,
      );
    };
  }, [llmConfig]);

  useEffect(() => {
    if (llmConfig) {
      setResolvedConfig(llmConfig);
      if (llmConfig.providerId) setStoredProvider(llmConfig.providerId);
      if (llmConfig.providerId) setViewProvider(llmConfig.providerId);
      if (llmConfig.model) setStoredModel(llmConfig.model);
    }
  }, [llmConfig]);

  const effectiveConfig = llmConfig || resolvedConfig;
  const options = useMemo(() => {
    return buildAgentModelOptions({
      availableProviders: effectiveConfig?.availableProviders,
      storedProviderId: storedProvider,
      storedModelId: storedModel,
      locale,
      t,
    });
  }, [
    effectiveConfig?.availableProviders,
    storedProvider,
    storedModel,
    locale,
    t,
  ]);

  const providerOptions = useMemo(() => {
    const seen = new Set();
    return options.flatMap((option) => {
      if (seen.has(option.providerId)) return [];
      seen.add(option.providerId);
      return [
        {
          value: option.providerId,
          label: option.providerLabel,
          statusDot: option.statusDot,
        },
      ];
    });
  }, [options]);
  const selectedProvider = providerOptions.some(
    (option) => option.value === viewProvider,
  )
    ? viewProvider
    : providerOptions[0]?.value || "";
  const modelOptions = useMemo(
    () =>
      options
        .filter((option) => option.providerId === selectedProvider)
        .map((option) => ({
          ...option,
          label: option.modelLabel,
          statusDot: undefined,
        })),
    [options, selectedProvider],
  );
  const currentCompoundValue = `${storedProvider}::${storedModel}`;
  const selectedModel =
    selectedProvider === storedProvider &&
    modelOptions.some((option) => option.value === currentCompoundValue)
      ? currentCompoundValue
      : "";

  const handleSelectModel = useCallback(
    (nextValue) => {
      if (!nextValue || isRunning) return;
      const separatorIndex = nextValue.indexOf("::");
      if (separatorIndex === -1) return;
      const nextPId = nextValue.slice(0, separatorIndex);
      const nextMId = nextValue.slice(separatorIndex + 2);
      setStoredLlmProvider(nextPId);
      setStoredLlmModel(nextPId, nextMId);
      setStoredProvider(nextPId);
      setStoredModel(nextMId);
    },
    [isRunning],
  );

  const handleGoToSettings = useCallback(() => {
    onCloseMenu?.();
    if (typeof onOpenSettings === "function") {
      onOpenSettings({ tab: "agent" });
    } else {
      window.dispatchEvent(
        new CustomEvent("voo:navigate-settings-tab", { detail: "agent" }),
      );
    }
  }, [onCloseMenu, onOpenSettings]);

  return (
    <div data-testid="agent-model-selector" className="pb-1">
      <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
        <InfoHint
          label={t("agent.moreMenu.agentModel")}
          text={t("agent.moreMenu.agentModelHint")}
        />
      </div>
      <div className="px-1">
        {options.length === 0 ? (
          <button
            type="button"
            data-testid="agent-model-go-to-settings"
            onClick={handleGoToSettings}
            title={t("settings.agent.noModelsConnected")}
            className="flex h-7 w-full items-center justify-between rounded-lg bg-white/[0.06] px-2 text-[10px] text-neutral-300 transition-colors hover:bg-white/[0.1] hover:text-white"
          >
            <span className="truncate">
              {t("settings.agent.noModelsConnected")}
            </span>
            <span className="shrink-0 text-neutral-400">
              {t("agent.llm.openSettings")} →
            </span>
          </button>
        ) : (
          <div
            title={
              isRunning
                ? t("agent.moreMenu.modelDisabledWhileRunning")
                : undefined
            }
          >
            <div className="flex flex-col gap-2">
              <FlatSelect
                portal
                value={selectedProvider}
                onChange={setViewProvider}
                options={providerOptions}
                label={t("agent.llm.provider")}
                disabled={isRunning}
                placeholder={t("agent.llm.provider")}
                className="w-full [&>button]:w-full"
              />
              <ModelSelect
                value={selectedModel}
                onChange={handleSelectModel}
                options={modelOptions}
                label={t("agent.llm.model")}
                disabled={isRunning}
                placeholder={t("agent.llm.model")}
                className="w-full"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

ComposerAgentModel.propTypes = {
  llmConfig: PropTypes.shape({
    providerId: PropTypes.string,
    model: PropTypes.string,
    availableProviders: PropTypes.arrayOf(
      PropTypes.shape({
        id: PropTypes.string.isRequired,
        name: PropTypes.string,
        configured: PropTypes.bool,
      }),
    ),
  }),
  isRunning: PropTypes.bool,
  onOpenSettings: PropTypes.func,
  onCloseMenu: PropTypes.func,
};
