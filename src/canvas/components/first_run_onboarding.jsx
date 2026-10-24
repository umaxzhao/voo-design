import React, { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Command, Layout, MousePointer2, Sparkles } from "lucide-react";
import { useI18n } from "../use_i18n.js";
import { setLocale } from "../../shared/i18n.js";
import { setSetting } from "../../shared/settings.js";
import { getProviderStatusInfo } from "./provider_status_helpers.js";
import { finishFirstRun } from "./first_run_state.js";
import { useDesignStore } from "../../store/design_store.js";
import { COMMUNITY_TEMPLATES } from "./community_templates_data.js";
import { customModelGroups } from "../agent/agent_provider.js";
import { AGENT_SETTING } from "../agent/canvas_tools.js";
import { applyAgentModel } from "./onboarding/onboarding_agent_model.js";
import OnboardingArt from "./onboarding/onboarding_art.jsx";

const hasCommandPalette = Object.keys(import.meta.glob("./editor_command_palette.jsx")).length > 0;
const steps = ["welcome", "start", "tour", "provider"];
export const FIRST_RUN_TEMPLATES = COMMUNITY_TEMPLATES.filter(({ category }) => ["dashboard", "mobile", "slides"].includes(category));
const focusClass = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E5B2FF]";

export function syncFirstRunDialog(dialog, open) {
  if (!dialog) return;
  if (open) {
    if (!dialog.open) dialog.showModal();
  } else if (dialog.open) dialog.close();
}

export default function FirstRunOnboarding({ open, reopened = false, onClose, onStart }) {
  const dialog = useRef(null);
  const title = useRef(null);
  const createdStarter = useRef(null);
  const [step, setStep] = useState(0);
  const [starter, setStarter] = useState(reopened ? "keep" : "blank");
  const [confirmed, setConfirmed] = useState(false);
  const hasCurrentContent = useDesignStore(s => s.isDirty || s.nodes?.length > 0);
  const replacesCurrent = reopened && starter !== "keep" && hasCurrentContent;
  const [provider, setProvider] = useState("");
  const [customModel, setCustomModel] = useState("");
  const customGroups = customModelGroups();
  const [cliStatus, setCliStatus] = useState(null);
  const [error, setError] = useState(false);
  const { t, locale } = useI18n();
  useEffect(() => {
    if (open) {
      createdStarter.current = null;
      setStep(0);
      setStarter(reopened ? "keep" : "blank");
      setConfirmed(false);
      setProvider("");
      setCustomModel("");
      setError(false);
    }
  }, [open, reopened]);
  useEffect(() => { syncFirstRunDialog(dialog.current, open); }, [open]);
  useEffect(() => { if (open) title.current?.focus(); }, [step, open]);
  useEffect(() => {
    setCliStatus(null);
    if (!open || step !== 3 || !["codex", "claude"].includes(provider)) return;
    const cli = globalThis.window?.vooDesktop?.localCli;
    if (!cli?.checkStatus) return;
    let active = true;
    Promise.resolve().then(() => cli.checkStatus(provider)).then(result => {
      if (active) setCliStatus(getProviderStatusInfo(t, {
        configured: Boolean(result.installed || result.ready),
        verification: { status: result.ready ? "verified" : "untested" },
      }));
    }).catch(() => { /* The full guide offers detection and connection diagnostics. */ });
    return () => { active = false; };
  }, [open, step, provider, t]);
  const dismiss = () => { if (!reopened) finishFirstRun("dismissed"); onClose(); };
  const complete = (settings = false) => {
    if (!reopened) finishFirstRun();
    onClose();
    if (settings) window.dispatchEvent(new CustomEvent("voo:open-settings", { detail: { tab: "providers" } }));
  };
  const next = () => {
    if (step === 1 && starter !== "keep" && createdStarter.current !== starter) {
      const current = useDesignStore.getState();
      if (reopened && (current.isDirty || current.nodes?.length > 0) && !confirmed) return;
      try {
        onStart(FIRST_RUN_TEMPLATES.find(({ id }) => id === starter) ?? null);
        createdStarter.current = starter;
        setError(false);
      } catch { setError(true); return; }
    }
    if (step === 3) complete(provider === "custom" && !customModel);
    else setStep(step + 1);
  };
  if (!open) return null;
  const name = steps[step];
  return (
    <dialog ref={dialog} aria-labelledby="first-run-title" aria-describedby="first-run-description"
      onCancel={(event) => { event.preventDefault(); dismiss(); }}
      className="m-auto max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-[680px] overflow-y-auto rounded-3xl border border-white/10 bg-neutral-900 p-0 text-white shadow-panel backdrop:bg-black/75 backdrop:backdrop-blur-md lg:max-w-[960px]">
      <div className="flex flex-col lg:flex-row" data-testid="first-run-onboarding" data-step={name}>
        <OnboardingArt name="onboarding/cover.webp" className="hidden shrink-0 lg:block lg:w-1/3" />
        <div className="min-w-0 flex-1 p-6 sm:p-10">
        <div className="mb-8 flex items-center justify-between gap-3">
          <span className="text-[12px] font-semibold tracking-[0.2em] text-[#E5B2FF]">VOO DESIGN</span>
          <div role="group" className="flex gap-1 rounded-full border border-white/10 p-1" aria-label={t("firstRun.language")}>
            {[["en", "English"], ["zh", "中文"]].map(([code, label]) => (
              <button key={code} type="button" aria-pressed={locale === code}
                onClick={() => { setSetting("ciw.locale", code); void setLocale(code); }}
                className={`rounded-full px-3 py-1 text-xs ${focusClass} ${locale === code ? "bg-white/10 text-white" : "text-neutral-400 hover:text-white"}`}>{label}</button>
            ))}
          </div>
        </div>
        <ol aria-label={t("firstRun.progress")} className="mb-8 flex gap-2">
          {steps.map((id, index) => <li key={id} aria-current={index === step ? "step" : undefined} className="flex-1">
            <div className={`mb-2 h-1 rounded-full ${index <= step ? "bg-[#B2FFD6]" : "bg-white/10"}`} />
            <span className={`text-xs ${index === step ? "text-white" : "text-neutral-400"}`}>{t(`firstRun.${id}.label`)}</span>
          </li>)}
        </ol>
        <h1 ref={title} tabIndex={-1} id="first-run-title" className="text-[15px] font-semibold tracking-tight outline-none">{t(step === 0 ? "firstRun.title" : `firstRun.${name}.title`)}</h1>
        <p id="first-run-description" className="mt-3 text-[12px] leading-relaxed text-neutral-400">{t(step === 0 ? "firstRun.description" : (step === 1 && reopened ? "firstRun.start.reopenedDescription" : `firstRun.${name}.description`))}</p>
        <div className="my-7">
          {step === 0 && <div className="flex items-center gap-5 rounded-2xl border border-white/10 bg-black/20 p-6"><Sparkles size={44} className="shrink-0 text-[#E5B2FF]" aria-hidden="true" /><p className="text-[15px] text-[#B2FFD6]">{t("firstRun.eyebrow")}</p></div>}
          {step === 1 && <div role="group" aria-label={t("firstRun.start.label")} className="grid grid-cols-2 gap-3">
            {reopened && <button type="button" aria-pressed={starter === "keep"} onClick={() => { setStarter("keep"); setConfirmed(false); }} className={`rounded-2xl border p-4 text-left ${focusClass} ${starter === "keep" ? "border-[#E5B2FF] bg-[#E5B2FF]/10" : "border-white/10"}`}>{t("firstRun.keep")}</button>}
            {[null, ...FIRST_RUN_TEMPLATES].map((template) => {
              const id = template?.id ?? "blank";
              return <button type="button" key={id} aria-pressed={starter === id} onClick={() => { setStarter(id); setConfirmed(false); }} className={`rounded-2xl border p-4 text-left ${focusClass} ${starter === id ? "border-[#E5B2FF] bg-[#E5B2FF]/10" : "border-white/10 hover:bg-white/5"}`}>
                <Layout aria-hidden="true" size={28} className="mb-4 text-[#B2FFD6]" /><span className="block text-[12px] font-medium">{t(`firstRun.template.${template?.category ?? "blank"}`)}</span>
                <span className="mt-1 block text-xs text-neutral-400">{template ? `${template.width} × ${template.height}` : t("firstRun.blankHint")}</span>
              </button>;
            })}
          </div>}
          {step === 1 && replacesCurrent && <label className="mt-4 flex items-center gap-3 text-[12px] text-amber-200"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />{t("firstRun.replaceConfirm")}</label>}
          {step === 2 && <div className="space-y-3">
            {[["canvas", Layout], ["tools", MousePointer2], ["agent", Sparkles]].map(([id, Icon]) => <div key={id} className="flex gap-4 rounded-2xl border border-white/10 bg-black/20 p-4"><Icon size={30} className="shrink-0 text-[#B2FFD6]" aria-hidden="true" /><div><h2 className="text-[12px] font-semibold">{t(`firstRun.tour.${id}`)}</h2><p className="mt-1 text-[12px] text-neutral-400">{t(`firstRun.tour.${id}Hint`)}</p></div></div>)}
            {hasCommandPalette && <p className="flex gap-2 text-xs text-neutral-400"><Command size={16} aria-hidden="true" />{t("firstRun.palette")}</p>}
          </div>}
          {step === 3 && <div className="space-y-3">
            <div role="group" aria-label={t("firstRun.provider.label")} className="grid gap-3 sm:grid-cols-3">{["codex", "claude", "custom"].map((id) => <button type="button" key={id} aria-pressed={provider === id} onClick={() => { setProvider(id); if (id !== "custom") applyAgentModel(id); else if (customModel) setSetting(AGENT_SETTING.MODEL, customModel); }} className={`rounded-2xl border p-5 text-[12px] ${focusClass} ${provider === id ? "border-[#E5B2FF] bg-[#E5B2FF]/10" : "border-white/10 hover:bg-white/5"}`}>{t(`firstRun.provider.${id}`)}</button>)}</div>
            {provider === "custom" && customGroups.some(group => group.models.length > 0) && <label className="block text-[12px] text-neutral-300">{t("firstRun.provider.custom")}
              <select value={customModel} onChange={(event) => { setCustomModel(event.target.value); if (event.target.value) setSetting(AGENT_SETTING.MODEL, event.target.value); }} className={`mt-2 w-full rounded-xl border border-white/10 bg-neutral-900 p-3 ${focusClass}`}>
                <option value="">{t("firstRun.provider.configure")}</option>
                {customGroups.map(group => <optgroup key={group.cliId} label={group.name}>{group.models.map(model => <option key={model.id} value={model.id}>{model.label}</option>)}</optgroup>)}
              </select>
            </label>}
            {cliStatus && <p role="status" className={`text-xs ${cliStatus.statusClass}`}>{cliStatus.statusText}</p>}
            <p className="text-xs leading-relaxed text-neutral-400">{t("firstRun.provider.hint")}</p>
            {(provider === "codex" || provider === "claude") && <button type="button" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent("voo:open-onboarding")); }} className={`rounded-lg py-2 text-[12px] text-[#B2FFD6] ${focusClass}`}>{t("firstRun.provider.guide")}</button>}
            <button type="button" onClick={() => complete(true)} className={`rounded-lg py-2 text-[12px] text-[#B2FFD6] ${focusClass}`}>{t("firstRun.provider.settings")}</button>
          </div>}
        </div>
        {error && <p role="alert" className="mb-3 text-[12px] text-rose-300">{t("firstRun.error")}</p>}
        <div className="flex items-center gap-3">
          <button type="button" onClick={dismiss} className={`mr-auto rounded-xl py-3 text-[12px] text-neutral-400 hover:text-white ${focusClass}`}>{t("firstRun.skip")}</button>
          {step > 0 && <button type="button" onClick={() => setStep(step - 1)} className={`rounded-xl border border-white/10 px-4 py-3 text-[12px] ${focusClass}`}>{t("firstRun.back")}</button>}
          <button type="button" data-testid="first-run-next" disabled={step === 1 && replacesCurrent && !confirmed && createdStarter.current !== starter} onClick={next} className={`rounded-xl bg-[#E5B2FF] px-5 py-3 text-[12px] font-semibold text-black hover:brightness-110 ${focusClass}`}>{t(step === 3 ? (provider ? "firstRun.finish" : "firstRun.later") : "firstRun.next")}</button>
        </div>
        </div>
      </div>
    </dialog>
  );
}
FirstRunOnboarding.propTypes = { open: PropTypes.bool.isRequired, reopened: PropTypes.bool, onClose: PropTypes.func.isRequired, onStart: PropTypes.func.isRequired };
