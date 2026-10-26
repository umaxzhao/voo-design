import React, { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { useI18n } from "../use_i18n.js";
import { setLocale } from "../../shared/i18n.js";
import { setSetting } from "../../shared/settings.js";
import { finishFirstRun } from "./first_run_state.js";
import { customModelGroups } from "../agent/agent_provider.js";
import { AGENT_SETTING } from "../agent/canvas_tools.js";
import { applyAgentModel } from "./onboarding/onboarding_agent_model.js";
import OnboardingArt from "./onboarding/onboarding_art.jsx";
import AgentCardGrid from "./onboarding/agent_card_grid.jsx";
import CustomProviderInline from "./onboarding/custom_provider_inline.jsx";
import { useAgentDetection } from "./onboarding/use_agent_detection.js";
import FirstRunWorkspace from "./first_run_workspace.jsx";

const steps = ["provider"];
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
  const [customModel, setCustomModel] = useState("");
  // Bumped after the inline setup stores a provider so the groups below are read again.
  const [, setCustomVersion] = useState(0);
  const refreshCustom = () => setCustomVersion(version => version + 1);
  const customGroups = customModelGroups();
  const detection = useAgentDetection(open);
  const { t, locale } = useI18n();
  useEffect(() => {
    if (open) {
      setProvider("");
      setCustomModel("");
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
  const [name] = steps;
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
            <div className="flex flex-col gap-3">
              <AgentCardGrid t={t} label={t("firstRun.provider.label")} selected={provider} detection={detection}
                customConfigured={customGroups.some(group => group.models.length > 0)}
                onSelect={(id) => { setProvider(id); if (id !== "custom") applyAgentModel(id); else if (customModel) setSetting(AGENT_SETTING.MODEL, customModel); }} />
              {provider === "custom" && (
                <CustomProviderInline t={t} groups={customGroups} selectedModel={customModel}
                  onSelectModel={selectCustomModel} onConfigured={refreshCustom} />
              )}
              {provider !== "" && provider !== "custom" && (
                <button type="button" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent("voo:open-onboarding")); }}
                  className={`w-fit rounded-lg bg-white/[0.08] px-3 py-1.5 text-[11px] font-medium text-neutral-100 hover:bg-white/[0.14] transition-colors ${focusClass}`}>{t("firstRun.provider.guide")}</button>
              )}
            </div>
            <FirstRunWorkspace />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#121212] px-6 py-4">
            <button type="button" onClick={dismiss}
              className={`rounded-lg px-3 py-2 text-xs text-neutral-400 hover:text-neutral-200 transition-colors disabled:opacity-40 ${focusClass}`}>{t("firstRun.skip")}</button>
            <div className="flex items-center gap-2">
              <button type="button" data-testid="first-run-next" onClick={complete}
                className={`rounded-lg bg-white px-5 py-2 text-xs font-medium text-black hover:bg-neutral-200 active:scale-[0.98] transition-all disabled:opacity-40 disabled:pointer-events-none ${focusClass}`}>
                {t(provider ? "firstRun.finish" : "firstRun.later")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}
FirstRunOnboarding.propTypes = { open: PropTypes.bool.isRequired, reopened: PropTypes.bool, onClose: PropTypes.func.isRequired, onStart: PropTypes.func };
