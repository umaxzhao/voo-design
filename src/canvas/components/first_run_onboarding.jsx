import React, { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useI18n } from "../use_i18n.js";
import { setLocale } from "../../shared/i18n.js";
import { setSetting } from "../../shared/settings.js";
import { finishFirstRun } from "./first_run_state.js";
import { customModelGroups } from "../agent/custom-model-groups.js";
import { AGENT_SETTING } from "../agent/agent-settings.js";
import { applyAgentModel } from "./onboarding/onboarding_agent_model.js";
import OnboardingArt from "./onboarding/onboarding_art.jsx";
import AgentCardGrid from "./onboarding/agent_card_grid.jsx";
import CustomProviderInline from "./onboarding/custom_provider_inline.jsx";
import { useAgentDetection } from "./onboarding/use_agent_detection.js";
import FirstRunWorkspace from "./first_run_workspace.jsx";
import { CLOUD_PROVIDER_PRESETS, VOO_CLOUD_PROVIDER } from "./onboarding/cloud_provider_presets.js";
import { CLI_AGENTS, isDeepSeekHarnessAgent } from "../../shared/cli-agents.js";
import { AGENT_STATUS, cliAgentStatus, visibleCloudProviderPresets } from "./onboarding/agent_status_model.js";
import DeepSeekConnectorInline from "./onboarding/deepseek_connector_inline.jsx";
import VooCloudLoginInline from "./onboarding/voo_cloud_login_inline.jsx";
import { useUserStore } from "../store/user_store.js";
import useIsNarrow from "../use_is_narrow.js";

const steps = ["provider", "workspace"];
const focusClass = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40";

export function syncFirstRunDialog(dialog, open) {
  if (!dialog) return;
  if (open) {
    if (!dialog.open) dialog.showModal();
  } else if (dialog.open) dialog.close();
}

export default function FirstRunOnboarding({ open, reopened = false, onClose, onStart: _onStart }) {
  const dialog = useRef(null);
  const title = useRef(null);
  const contentRef = useRef(null);
  const [provider, setProvider] = useState("");
  const [stepIndex, setStepIndex] = useState(0);
  const [customModel, setCustomModel] = useState("");
  // Bumped after the inline setup stores a provider so the groups below are read again.
  const [, setCustomVersion] = useState(0);
  const refreshCustom = () => setCustomVersion(version => version + 1);
  const customGroups = customModelGroups();
  const cloudPreset = CLOUD_PROVIDER_PRESETS.find(preset => preset.id === provider);
  const [vooCloudSignedIn, setVooCloudSignedIn] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState(false);
  const isNarrow = useIsNarrow();
  const isVooCloud = provider === VOO_CLOUD_PROVIDER.id;
  const isApiProvider = !isVooCloud && (provider === "custom" || Boolean(cloudPreset));
  const detection = useAgentDetection(open && !isNarrow);
  const cloudCards = [
    { ...VOO_CLOUD_PROVIDER, configured: vooCloudSignedIn },
    ...visibleCloudProviderPresets(CLOUD_PROVIDER_PRESETS, detection).map(preset => ({ ...preset,
      configured: customGroups.some(group => group.cliId === preset.customProviderId && group.models.length > 0),
    })),
  ];
  const selectedCli = isNarrow
    ? null
    : CLI_AGENTS.find((agent) => agent.id === provider) ?? null;
  const selectedCliStatus = selectedCli ? detection.statuses?.[selectedCli.id] ?? null : null;
  const selectedCliCardStatus = selectedCli ? cliAgentStatus(selectedCli, detection) : null;
  // DeepSeek Harness installs in two pieces (app + VOO plugin): its own panel
  // reports both and is also shown once connected, because it explains how to
  // use the canvas tools from a Harness session.
  const isDeepSeekHarness = isDeepSeekHarnessAgent(selectedCli);
  const selectedCliCmd = selectedCliStatus
    ? selectedCliStatus.installed
      ? selectedCliStatus.loginCmd
      : selectedCliStatus.installCmd
    : "";
  const { t, locale } = useI18n();
  useEffect(() => {
    if (open) {
      setProvider("");
      setCustomModel("");
      setStepIndex(0);
      setCopiedCommand(false);
      setVooCloudSignedIn(Boolean(useUserStore.getState?.().user?.isLoggedIn));
    }
  }, [open]);
  useEffect(() => { syncFirstRunDialog(dialog.current, open); }, [open]);
  useEffect(() => {
    if (open) {
      title.current?.focus();
      if (contentRef.current) contentRef.current.scrollTop = 0;
    }
  }, [open]);
  const dismiss = () => { if (!reopened) finishFirstRun("dismissed"); onClose(); };
  const complete = () => { if (!reopened) finishFirstRun(); onClose(); };
  const selectCustomModel = (id) => { setCustomModel(id); setSetting(AGENT_SETTING.MODEL, id); };
  if (!open) return null;
  const name = steps[stepIndex] ?? steps[0];
  return (
    <dialog ref={dialog} aria-labelledby="first-run-title" aria-describedby="first-run-description"
      onCancel={(event) => { event.preventDefault(); dismiss(); }}
      className="m-auto w-[calc(100%-2rem)] max-w-xl border-0 bg-transparent p-0 text-neutral-100 backdrop:bg-black/70 lg:w-full lg:max-w-[960px]">
      <div data-testid="first-run-onboarding" data-step={name}
        className="relative flex h-auto max-h-[85dvh] w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-[#161616] border border-white/10 shadow-panel lg:h-[min(656px,90dvh)] lg:max-w-[960px] lg:flex-row">
        <OnboardingArt name="onboarding/cover.webp" className="hidden shrink-0 lg:block lg:h-full lg:w-1/3" />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-3 px-6 pt-5 pb-4">
            <h1 ref={title} tabIndex={-1} id="first-run-title" className="text-xs font-medium leading-relaxed text-neutral-100 outline-none">
              {t(`firstRun.${name}.title`)}
            </h1>
            <div role="group" className="ml-auto flex shrink-0 items-center gap-0.5 rounded-lg bg-white/[0.04] p-0.5" aria-label={t("firstRun.language")}>
              {[["en", "English"], ["zh", "中文"]].map(([code, label]) => (
                <button key={code} type="button" aria-pressed={locale === code}
                  onClick={() => { setSetting("ciw.locale", code); void setLocale(code); }}
                  className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${focusClass} ${locale === code ? "bg-white/[0.1] text-neutral-100" : "text-neutral-400 hover:text-neutral-200"}`}>{label}</button>
              ))}
            </div>
          </div>

          <div ref={contentRef} data-testid="onboarding-scroll-content"
            className="ui-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden px-6 pb-6 pt-2">
            <p id="first-run-description" className="text-[11px] leading-relaxed text-neutral-400">{t(`firstRun.${name}.description`)}</p>
            {name === "provider" ? (
              <div className="flex flex-col gap-3">
                <AgentCardGrid t={t} label={t("firstRun.provider.label")} selected={provider} detection={detection}
                  showCliAgents={!isNarrow}
                  cloudProviders={cloudCards}
                  customConfigured={customGroups.some(group => group.models.length > 0)}
                  onSelect={(id) => {
                    setProvider(id);
                    if (id === VOO_CLOUD_PROVIDER.id) return;
                    const preset = CLOUD_PROVIDER_PRESETS.find(entry => entry.id === id);
                    if (preset) {
                      const model = customGroups.find(group => group.cliId === preset.customProviderId)?.models[0];
                      if (model) selectCustomModel(model.id);
                    } else if (id !== "custom") {
                      setSetting("voo.agent.llmProvider", id);
                      applyAgentModel(id);
                    } else if (customModel) setSetting(AGENT_SETTING.MODEL, customModel);
                  }} />
                {selectedCli && (isDeepSeekHarness || selectedCliCardStatus !== AGENT_STATUS.CONNECTED) ? (
                  isDeepSeekHarness ? (
                    <DeepSeekConnectorInline t={t} status={selectedCliStatus} detection={detection} />
                  ) : (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-medium text-neutral-200">
                          {t("firstRun.connection.title")}
                        </p>
                        <button
                          type="button"
                          onClick={() => detection.refresh?.()}
                          className="h-7 shrink-0 rounded-lg bg-white/[0.08] px-2.5 text-[10px] text-neutral-200 transition-colors hover:bg-white/[0.14]"
                        >
                          {t("firstRun.connection.retry")}
                        </button>
                      </div>
                      <p className="mt-1 text-[10px] leading-4 text-neutral-400">
                        {selectedCliStatus?.installed
                          ? t("firstRun.connection.loginHint")
                          : t("firstRun.connection.installHint")}
                      </p>
                      {selectedCliCmd ? (
                        <div className="mt-2 flex items-center gap-2 rounded-lg bg-black/40 px-2 py-1.5">
                          <code className="min-w-0 flex-1 truncate font-mono text-[10px] text-neutral-300">
                            {selectedCliCmd}
                          </code>
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard?.writeText(selectedCliCmd);
                              setCopiedCommand(true);
                              setTimeout(() => setCopiedCommand(false), 1200);
                            }}
                            className="shrink-0 text-[10px] text-neutral-400 transition-colors hover:text-white"
                          >
                            {copiedCommand ? t("firstRun.connection.copied") : t("firstRun.connection.copy")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )
                ) : null}
                {isVooCloud ? (
                  <VooCloudLoginInline onSignedIn={() => setVooCloudSignedIn(true)} />
                ) : null}
                {isApiProvider && (
                  <CustomProviderInline key={provider} t={t} preset={cloudPreset ?? null}
                    groups={cloudPreset ? customGroups.filter(group => group.cliId === cloudPreset.customProviderId) : customGroups} selectedModel={customModel}
                    onSelectModel={selectCustomModel} onConfigured={refreshCustom} />
                )}
                {!isNarrow && provider !== "" && !isApiProvider && !isDeepSeekHarness && (
                  <button type="button" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent("voo:open-onboarding")); }}
                    className={`w-fit rounded-lg bg-white/[0.08] px-3 py-1.5 text-[11px] font-medium text-neutral-100 hover:bg-white/[0.14] transition-colors ${focusClass}`}>{t("firstRun.provider.guide")}</button>
                )}
              </div>
            ) : (
              <FirstRunWorkspace />
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#121212] px-6 py-4">
            <button type="button" onClick={dismiss}
              className={`rounded-lg px-3 py-2 text-xs text-neutral-400 hover:text-neutral-200 transition-colors disabled:opacity-40 ${focusClass}`}>{t("firstRun.skip")}</button>
            <div className="flex items-center gap-2">
              {stepIndex > 0 ? (
                <button type="button" onClick={() => setStepIndex(0)}
                  className={`rounded-lg bg-white/[0.06] px-4 py-2 text-xs font-medium text-neutral-200 transition-colors hover:bg-white/[0.12] ${focusClass}`}>
                  {t("firstRun.back")}
                </button>
              ) : null}
              <button type="button" data-testid="first-run-next"
                onClick={() => (stepIndex < steps.length - 1 ? setStepIndex(stepIndex + 1) : complete())}
                className={`rounded-lg bg-white px-5 py-2 text-xs font-medium text-black hover:bg-neutral-200 active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none ${focusClass}`}>
                {stepIndex < steps.length - 1 ? t("firstRun.next") : t("firstRun.finish")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}
FirstRunOnboarding.propTypes = { open: PropTypes.bool.isRequired, reopened: PropTypes.bool, onClose: PropTypes.func.isRequired, onStart: PropTypes.func };
