/* eslint-disable react/prop-types */
import { IconClose, ICON_STROKE_WIDTH } from "../../../icons.jsx";
import { useI18n } from "../../../use_i18n.js";
import { supportsVision } from "../../../../shared/providers.js";
import {
  agentModelLabel,
  getAgentProviderModels,
  getAgentProviders,
  getStoredLlmProvider,
} from "../agentLlmConfig.js";

export default function AgentModelMenu({
  llmConfig,
  setStoredLlmProvider,
  setStoredLlmModel,
  refreshLlmConfig,
  setModelMenuOpen,
  onOpenSettings,
}) {
  const { t, locale } = useI18n();

  return (
    <div className="absolute top-8 right-0 z-50 w-64 max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl bg-[#161616] p-2 shadow-menu border border-white/10 backdrop-blur-xl font-mono">
      <div className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">
        <span>{t("agent.llm.provider")}</span>
        <button
          type="button"
          onClick={() => setModelMenuOpen(false)}
          aria-label={t("common.close")}
          title={t("common.close")}
          className="text-neutral-500 hover:text-white transition-colors"
        >
          <IconClose size={12} strokeWidth={ICON_STROKE_WIDTH} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1 mb-2">
        {getAgentProviders(locale).map((p) => {
          const active = getStoredLlmProvider() === p.id;
          const providerStatus = llmConfig.availableProviders?.find(
            (ap) => ap.id === p.id,
          );
          const reason = providerStatus?.reasonKey
            ? t(providerStatus.reasonKey)
            : providerStatus?.reason;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setStoredLlmProvider(p.id);
                refreshLlmConfig();
              }}
              title={reason || undefined}
              className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-[10px] font-medium transition-colors ${
                active
                  ? "bg-[#E5B2FF]/20 text-[#eed0ff] font-semibold"
                  : "bg-white/[0.04] text-neutral-300 hover:bg-white/[0.08] hover:text-white"
              }`}
            >
              <span className="truncate">
                {p.labelKey ? t(p.labelKey) : p.label}
              </span>
              {p.id !== "auto" && (
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    providerStatus?.configured
                      ? "bg-[#b2ffd6]"
                      : "bg-neutral-600"
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="px-2 py-1 text-[10px] font-semibold text-neutral-500 uppercase tracking-wider border-t border-white/10 pt-2">
        {llmConfig.providerName} {t("agent.llm.model")}
      </div>
      <div className="flex flex-col gap-1 max-h-48 overflow-y-auto ui-scroll pr-0.5">
        {getAgentProviderModels(llmConfig.providerId).map((m) => {
          const isSelected = llmConfig.model === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setStoredLlmModel(llmConfig.providerId, m.id);
                refreshLlmConfig();
                setModelMenuOpen(false);
              }}
              className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors ${
                isSelected
                  ? "bg-white/15 text-white font-semibold"
                  : "text-neutral-300 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              <span className="truncate">
                {agentModelLabel(llmConfig.providerId, m, t)}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {supportsVision(m.id) && (
                  <span className="rounded-md bg-[#E5B2FF]/10 px-1.5 py-0.5 text-[9px] text-[#eed0ff]">
                    {t("agent.llm.vision")}
                  </span>
                )}
                {isSelected && (
                  <span className="text-[#b2ffd6] text-xs">✓</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {onOpenSettings && (
        <div className="border-t border-white/10 mt-2 pt-1.5">
          <button
            type="button"
            onClick={() => {
              setModelMenuOpen(false);
              onOpenSettings();
            }}
            className="w-full rounded-lg bg-white/[0.06] px-2 py-1.5 text-center text-[10px] font-medium text-neutral-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            {t("agent.llm.openSettings")}
          </button>
        </div>
      )}
    </div>
  );
}
