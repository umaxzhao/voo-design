import PropTypes from "prop-types";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  IconCheck,
  IconClose,
  IconSearch,
  IconSparkles,
} from "../../icons.jsx";
import { useI18n } from "../../use_i18n.js";
import { PROVIDER_ID, supportsVision } from "../../../shared/providers.js";
import { ProviderLogo } from "../provider_icons.jsx";
import {
  agentModelLabel,
  getAgentProviderModels,
  getAgentProviders,
  setStoredLlmModel,
  setStoredLlmProvider,
} from "./agentLlmConfig.js";

/** Featured VOO Cloud mainstream models */
const FEATURED_CREDITS_MODELS = [
  {
    id: "qwen3.8-flash",
    name: "Qwen 3.8 Flash",
    providerId: "qwen",
    badge: "NEW",
    badgeColor: "bg-[#E5B2FF]/10 text-[#eed0ff]",
    descKey: "agent.models.qwen38Desc",
  },
  {
    id: "kimi-k3",
    name: "Kimi 3",
    providerId: "moonshot",
    badge: "NEW",
    badgeColor: "bg-[#E5B2FF]/10 text-[#eed0ff]",
    descKey: "agent.models.kimi3Desc",
  },
  {
    id: "glm-5.3",
    name: "GLM 5.3",
    providerId: "zhipu",
    badge: "PREMIUM",
    badgeColor: "bg-amber-500/10 text-amber-400",
    descKey: "agent.models.glm53Desc",
  },
  {
    id: "glm-4-plus",
    name: "GLM-4 Plus",
    providerId: "zhipu",
    badge: null,
    descKey: "agent.models.glm4Desc",
  },
  {
    id: "deepseek-chat",
    name: "DeepSeek V3",
    providerId: "deepseek",
    badge: "FAST",
    badgeColor: "bg-emerald-500/10 text-emerald-400",
    descKey: "agent.models.deepseekV3Desc",
  },
  {
    id: "deepseek-reasoner",
    name: "DeepSeek R1",
    providerId: "deepseek",
    badge: "REASONING",
    badgeColor: "bg-[#E5B2FF]/10 text-[#eed0ff]",
    descKey: "agent.models.deepseekR1Desc",
  },
  {
    id: "qwen-plus",
    name: "Qwen Plus",
    providerId: "qwen",
    badge: null,
    descKey: "agent.models.qwenPlusDesc",
  },
];

export default function ModelPickerPopover({
  open,
  onClose,
  triggerRef,
  currentProviderId,
  currentModelId,
  onSelectModel,
  availableProviders = [],
}) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("");
  const popoverRef = useRef(null);

  // Close on Escape or click outside
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    const handleClickOutside = (e) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target) &&
        !triggerRef?.current?.contains(e.target)
      ) {
        onClose?.();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, onClose, triggerRef]);

  // Build connected models from non-credits or custom providers
  const otherModels = useMemo(() => {
    const providers = getAgentProviders(locale);
    const connected = availableProviders.length
      ? providers.filter((p) => {
          if (p.id === PROVIDER_ID.CREDITS) return false;
          const status = availableProviders.find((ap) => ap.id === p.id);
          return Boolean(status?.configured);
        })
      : providers.filter(
          (p) => p.id === currentProviderId && p.id !== PROVIDER_ID.CREDITS,
        );

    const list = [];
    for (const p of connected) {
      const pName = p.labelKey ? t(p.labelKey) : p.label || p.id;
      const models = getAgentProviderModels(p.id);
      for (const m of models) {
        list.push({
          providerId: p.id,
          modelId: m.id,
          name: agentModelLabel(p.id, m, t),
          providerName: pName,
          hasVision: supportsVision(m.id),
        });
      }
    }
    return list;
  }, [availableProviders, currentProviderId, locale, t]);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredFeatured = useMemo(() => {
    if (!normalizedQuery) return FEATURED_CREDITS_MODELS;
    return FEATURED_CREDITS_MODELS.filter((item) => {
      const name = item.name.toLowerCase();
      const id = item.id.toLowerCase();
      const desc = t(item.descKey).toLowerCase();
      return (
        name.includes(normalizedQuery) ||
        id.includes(normalizedQuery) ||
        desc.includes(normalizedQuery)
      );
    });
  }, [normalizedQuery, t]);

  const filteredOther = useMemo(() => {
    if (!normalizedQuery) return otherModels;
    return otherModels.filter((item) => {
      const name = item.name.toLowerCase();
      const pName = item.providerName.toLowerCase();
      const id = item.modelId.toLowerCase();
      return (
        name.includes(normalizedQuery) ||
        pName.includes(normalizedQuery) ||
        id.includes(normalizedQuery)
      );
    });
  }, [normalizedQuery, otherModels]);

  const handleSelect = (providerId, modelId) => {
    setStoredLlmProvider(providerId);
    setStoredLlmModel(modelId);
    window.dispatchEvent(new CustomEvent("ciw-agent-llm-changed"));
    onSelectModel?.(providerId, modelId);
    onClose?.();
  };

  if (!open) return null;

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={t("agent.selectModel")}
      className="absolute bottom-[calc(100%+8px)] inset-x-0 mx-auto max-w-[360px] z-50 flex max-h-[380px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 p-2 text-neutral-200 shadow-menu backdrop-blur-xl"
    >
      {/* Top Search Input */}
      <div className="relative mb-2 flex items-center rounded-xl bg-white/[0.04] px-2.5 py-1.5 focus-within:ring-1 focus-within:ring-[#E5B2FF]/60">
        <IconSearch size={13} className="shrink-0 text-neutral-400 mr-2" />
        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("agent.searchModels")}
          aria-label={t("agent.searchModels")}
          className="w-full min-w-0 bg-transparent text-[11px] text-white placeholder:text-neutral-400 focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="shrink-0 text-neutral-400 hover:text-white"
          >
            <IconClose size={12} />
          </button>
        )}
      </div>

      {/* Model List View */}
      <div className="ui-scroll flex-1 overflow-y-auto pr-0.5 space-y-3">
        {/* Featured Models Section */}
        {filteredFeatured.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-medium text-neutral-400">
              <IconSparkles size={11} className="text-[#E5B2FF]" />
              <span>{t("agent.featuredModels")}</span>
            </div>
            <div className="space-y-0.5">
              {filteredFeatured.map((model) => {
                const isSelected =
                  currentProviderId === PROVIDER_ID.CREDITS &&
                  currentModelId === model.id;
                return (
                  <button
                    key={model.id}
                    type="button"
                    onClick={() => handleSelect(PROVIDER_ID.CREDITS, model.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left transition-colors ${
                      isSelected
                        ? "bg-white/10 text-white"
                        : "hover:bg-white/[0.06] text-neutral-300 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <ProviderLogo
                        providerId={model.providerId}
                        size={16}
                        className="size-4 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-[11px] truncate">
                            {model.name}
                          </span>
                          {model.badge && (
                            <span
                              className={`rounded-md px-1.5 py-0.2 text-[9px] font-semibold tracking-wider ${model.badgeColor}`}
                            >
                              {model.badge}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-neutral-400 truncate mt-0.5">
                          {t(model.descKey)}
                        </div>
                      </div>
                    </div>
                    {isSelected && (
                      <IconCheck
                        size={14}
                        className="shrink-0 text-[#a7ffd4]"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Connected Providers / Other Models Section */}
        {filteredOther.length > 0 && (
          <div>
            <div className="px-2 py-1 text-[10px] font-medium text-neutral-400">
              {t("agent.connectedModels")}
            </div>
            <div className="space-y-0.5">
              {filteredOther.map((model) => {
                const isSelected =
                  currentProviderId === model.providerId &&
                  currentModelId === model.modelId;
                return (
                  <button
                    key={`${model.providerId}::${model.modelId}`}
                    type="button"
                    onClick={() =>
                      handleSelect(model.providerId, model.modelId)
                    }
                    className={`flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left transition-colors ${
                      isSelected
                        ? "bg-white/10 text-white"
                        : "hover:bg-white/[0.06] text-neutral-300 hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <ProviderLogo
                        providerId={model.providerId}
                        size={16}
                        className="size-4 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-[11px] truncate">
                            {model.name}
                          </span>
                          {model.hasVision && (
                            <span className="rounded-md bg-[#E5B2FF]/10 px-1.5 py-0.2 text-[9px] font-semibold text-[#eed0ff]">
                              {t("agent.llm.vision")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {isSelected && (
                      <IconCheck
                        size={14}
                        className="shrink-0 text-[#a7ffd4]"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {filteredFeatured.length === 0 && filteredOther.length === 0 && (
          <div className="py-6 text-center text-[11px] text-neutral-500">
            {t("agent.noModelsFound")}
          </div>
        )}
      </div>
    </div>
  );
}

ModelPickerPopover.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  triggerRef: PropTypes.oneOfType([
    PropTypes.func,
    PropTypes.shape({ current: PropTypes.any }),
  ]),
  currentProviderId: PropTypes.string,
  currentModelId: PropTypes.string,
  onSelectModel: PropTypes.func,
  availableProviders: PropTypes.array,
};
