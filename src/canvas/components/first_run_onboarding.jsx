import React, { useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { ArrowUpRight, Command, Sparkles } from "lucide-react";
import { useI18n } from "../use_i18n.js";
import { setLocale } from "../../shared/i18n.js";
import { setSetting } from "../../shared/settings.js";
import { finishFirstRun } from "./first_run_state.js";

// Presence-gate the shortcut tip without loading or changing the palette.
const hasCommandPalette = Object.keys(import.meta.glob("./editor_command_palette.jsx")).length > 0;

export default function FirstRunOnboarding({ open, onClose, onStart }) {
  const dialog = useRef(null);
  const { t, locale } = useI18n();
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  const dismiss = () => {
    finishFirstRun("dismissed");
    onClose();
  };
  const start = () => {
    onStart();
    finishFirstRun();
    onClose();
  };
  if (!open) return null;
  return (
    <dialog ref={dialog} aria-labelledby="first-run-title" aria-describedby="first-run-description"
      onCancel={(event) => { event.preventDefault(); dismiss(); }}
      className="m-auto w-[calc(100%-32px)] max-w-[560px] rounded-3xl border border-white/10 bg-neutral-900 p-0 text-white shadow-2xl backdrop:bg-black/75 backdrop:backdrop-blur-md">
      <div className="p-8 sm:p-10" data-testid="first-run-onboarding">
        <div className="mb-10 flex items-center justify-between">
          <span className="text-sm font-semibold tracking-[0.2em] text-[#E5B2FF]">VOO DESIGN</span>
          <div className="flex gap-1 rounded-full border border-white/10 p-1" aria-label={t("firstRun.language")}>
            {[["en", "English"], ["zh", "中文"]].map(([code, label]) => (
              <button key={code} type="button" aria-pressed={locale === code}
                onClick={() => { setSetting("ciw.locale", code); void setLocale(code); }}
                className={`rounded-full px-3 py-1 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E5B2FF] ${locale === code ? "bg-white/10 text-white" : "text-neutral-400 hover:text-white"}`}>{label}</button>
            ))}
          </div>
        </div>
        <div className="mb-6 flex size-14 items-center justify-center rounded-2xl bg-[#E5B2FF]/10 text-[#E5B2FF]"><Sparkles size={28} aria-hidden="true" /></div>
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">{t("firstRun.eyebrow")}</p>
        <h1 id="first-run-title" className="text-3xl font-semibold tracking-tight">{t("firstRun.title")}</h1>
        <p id="first-run-description" className="mt-4 text-base leading-relaxed text-neutral-400">{t("firstRun.description")}</p>
        <div className="my-8 space-y-4 rounded-2xl border border-white/10 bg-black/20 p-5">
          {hasCommandPalette && <div className="flex gap-3"><Command size={19} className="mt-0.5 shrink-0 text-[#E5B2FF]" aria-hidden="true" /><p className="text-sm leading-relaxed text-neutral-300">{t("firstRun.palette")}</p></div>}
          <div className="flex gap-3"><Sparkles size={19} className="mt-0.5 shrink-0 text-[#B2FFD6]" aria-hidden="true" /><p className="text-sm leading-relaxed text-neutral-300">{t("firstRun.agent")}</p></div>
        </div>
        <button type="button" autoFocus onClick={start} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#E5B2FF] px-5 py-4 text-sm font-semibold text-black transition hover:bg-[#efceff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#E5B2FF]">{t("firstRun.start")}<ArrowUpRight size={18} aria-hidden="true" /></button>
        <button type="button" onClick={dismiss} className="mt-3 w-full rounded-xl py-3 text-sm text-neutral-400 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E5B2FF]">{t("firstRun.skip")}</button>
      </div>
    </dialog>
  );
}
FirstRunOnboarding.propTypes = { open: PropTypes.bool.isRequired, onClose: PropTypes.func.isRequired, onStart: PropTypes.func.isRequired };
