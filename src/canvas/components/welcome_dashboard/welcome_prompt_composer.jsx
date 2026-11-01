import React, { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Plus, X } from "lucide-react";
import WelcomePromptSettings from "./welcome_prompt_settings.jsx";
import { AI_GEN_TYPES } from "./welcome_constants.js";
import { DEFAULT_DESIGN_SYSTEM_ID } from "./generation-options.js";
import WelcomeModelSelect from "./welcome_model_select.jsx";

/** Filled two-slider icon used for the generation settings trigger. */
function TuneIcon({
  size = 14
}) {
  return <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M17.625 9.99992H3.75C3.41848 9.99992 3.10054 9.86822 2.86612 9.6338C2.6317 9.39938 2.5 9.08144 2.5 8.74992C2.5 8.4184 2.6317 8.10046 2.86612 7.86603C3.10054 7.63161 3.41848 7.49992 3.75 7.49992H17.625C17.9119 6.08706 18.6784 4.81682 19.7947 3.90445C20.9109 2.99207 22.3083 2.49365 23.75 2.49365C25.1917 2.49365 26.5891 2.99207 27.7053 3.90445C28.8216 4.81682 29.5881 6.08706 29.875 7.49992H36.25C36.5815 7.49992 36.8995 7.63161 37.1339 7.86603C37.3683 8.10046 37.5 8.4184 37.5 8.74992C37.5 9.08144 37.3683 9.39938 37.1339 9.6338C36.8995 9.86822 36.5815 9.99992 36.25 9.99992H29.875C29.5881 11.4128 28.8216 12.683 27.7053 13.5954C26.5891 14.5078 25.1917 15.0062 23.75 15.0062C22.3083 15.0062 20.9109 14.5078 19.7947 13.5954C18.6784 12.683 17.9119 11.4128 17.625 9.99992ZM2.5 26.2499C2.5 25.9184 2.6317 25.6005 2.86612 25.366C3.10054 25.1316 3.41848 24.9999 3.75 24.9999H10.125C10.4119 23.5871 11.1784 22.3168 12.2947 21.4044C13.4109 20.4921 14.8083 19.9937 16.25 19.9937C17.6917 19.9937 19.0891 20.4921 20.2053 21.4044C21.3216 22.3168 22.0881 23.5871 22.375 24.9999H36.25C36.5815 24.9999 36.8995 25.1316 37.1339 25.366C37.3683 25.6005 37.5 25.9184 37.5 26.2499C37.5 26.5814 37.3683 26.8994 37.1339 27.1338C36.8995 27.3682 36.5815 27.4999 36.25 27.4999H22.375C22.0881 28.9128 21.3216 30.183 20.2053 31.0954C19.0891 32.0078 17.6917 32.5062 16.25 32.5062C14.8083 32.5062 13.4109 32.0078 12.2947 31.0954C11.1784 30.183 10.4119 28.9128 10.125 27.4999H3.75C3.41848 27.4999 3.10054 27.3682 2.86612 27.1338C2.6317 26.8994 2.5 26.5814 2.5 26.2499ZM27.5 8.74992C27.5 9.74448 27.1049 10.6983 26.4017 11.4016C25.6984 12.1048 24.7446 12.4999 23.75 12.4999C22.7554 12.4999 21.8016 12.1048 21.0983 11.4016C20.3951 10.6983 20 9.74448 20 8.74992C20 7.75536 20.3951 6.80153 21.0983 6.09827C21.8016 5.39501 22.7554 4.99992 23.75 4.99992C24.7446 4.99992 25.6984 5.39501 26.4017 6.09827C27.1049 6.80153 27.5 7.75536 27.5 8.74992ZM16.25 29.9999C17.2446 29.9999 18.1984 29.6048 18.9017 28.9016C19.6049 28.1983 20 27.2445 20 26.2499C20 25.2554 19.6049 24.3015 18.9017 23.5983C18.1984 22.895 17.2446 22.4999 16.25 22.4999C15.2554 22.4999 14.3016 22.895 13.5983 23.5983C12.8951 24.3015 12.5 25.2554 12.5 26.2499C12.5 27.2445 12.8951 28.1983 13.5983 28.9016C14.3016 29.6048 15.2554 29.9999 16.25 29.9999Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
  </svg>;
}

/**
 * Pen-style welcome composer: one quiet prompt surface, a model label, an
 * advanced generation popover, and send. The type/style/system/size/candidate
 * choices stay in the popover so the default surface has no chip row.
 */
export function WelcomePromptComposer({
  t,
  activePill,
  onSelectPill,
  promptText,
  setPromptText,
  modelGroups,
  selectedModel,
  onSelectModel,
  styleId,
  styleOptions,
  onSelectStyle,
  designSystemId = DEFAULT_DESIGN_SYSTEM_ID,
  designSystemOptions = [],
  onSelectDesignSystem,
  size,
  sizeOptions,
  onSelectSize,
  candidates = 1,
  onSelectCandidates,
  attachments,
  onAddAttachments,
  onRemoveAttachment,
  submitting = false,
  configNeeded = false,
  onOpenSettings,
  onSubmit,
  initialAdvancedOpen = false
}) {
  const [advancedOpen, setAdvancedOpen] = useState(initialAdvancedOpen);
  const [panelPos, setPanelPos] = useState(null);
  const rootRef = useRef(null);
  const formRef = useRef(null);
  const panelRef = useRef(null);
  const settingsTriggerRef = useRef(null);
  const activePreset = AI_GEN_TYPES.find(preset => preset.id === activePill) ?? AI_GEN_TYPES[0];
  const currentSize = size;
  useEffect(() => {
    if (!advancedOpen) return undefined;
    const onPointerDown = event => {
      if (rootRef.current?.contains(event.target)) return;
      if (panelRef.current?.contains(event.target)) return;
      if (event.target instanceof Element && event.target.closest('[role="listbox"]')) return;
      setAdvancedOpen(false);
    };
    const onKeyDown = event => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        setAdvancedOpen(false);
        settingsTriggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [advancedOpen]);
  useEffect(() => {
    if (!advancedOpen) return undefined;
    const place = () => {
      const rect = formRef.current?.getBoundingClientRect();
      if (!rect) return;
      const isMobile = window.matchMedia("(max-width: 768px) and (hover: none) and (pointer: coarse)").matches;
      const panelGutter = isMobile ? 16 : 8;
      const panelWidth = Math.min(isMobile ? window.innerWidth - 32 : 320, window.innerWidth - panelGutter * 2);
      const panelHeight = panelRef.current?.offsetHeight ?? (isMobile ? 320 : 260);
      setPanelPos({
        left: Math.max(panelGutter, Math.min(rect.right - panelWidth, window.innerWidth - panelWidth - panelGutter)),
        top: Math.max(panelGutter, Math.min(rect.bottom + 8, window.innerHeight - panelHeight - panelGutter))
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [advancedOpen]);
  return <div ref={rootRef} data-advanced-open={advancedOpen ? "true" : "false"} className="welcome-prompt-root relative w-full">
    <form ref={formRef} onSubmit={onSubmit} className={`prompt-composer relative mt-0 min-w-0 rounded-2xl p-4 transition-colors ${advancedOpen ? "z-[300]" : ""}`}>
      <textarea value={promptText} onChange={event => setPromptText(event.target.value)} onKeyDown={event => {
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent?.isComposing) {
          event.preventDefault();
          onSubmit?.(event);
        }
      }} placeholder={t(activePreset.placeholder ?? "welcome.prompt.placeholder")} rows={4} aria-label={t(activePreset.placeholder ?? "welcome.prompt.placeholder")} className="min-h-24 w-full resize-y bg-transparent text-[12px] leading-6 text-neutral-100 placeholder-neutral-400 focus:outline-none" />

      {attachments?.length > 0 && <ul className="mt-1 flex flex-wrap gap-1.5" aria-label={t("welcome.prompt.attachments")}>
        {attachments.map(attachment => <li key={attachment.id ?? `${attachment.kind}:${attachment.name}`} className="flex max-w-48 items-center gap-1 rounded-lg bg-white/[0.06] px-2 py-1 text-[11px] text-neutral-300">
          {attachment.kind === "image" && attachment.dataUrl ? <img src={attachment.dataUrl} alt="" className="size-10 rounded-lg object-cover" /> : <span className="size-4 rounded-lg bg-white/10" aria-hidden="true" />}
          <span className="truncate">{attachment.name}</span>
          <button type="button" onClick={() => onRemoveAttachment?.(attachment)} aria-label={t("welcome.prompt.removeAttachment")} className="text-neutral-500 transition-colors hover:text-white">
            <X size={11} />
          </button>
        </li>)}
      </ul>}

      <div className="welcome-prompt-controls-row mt-3 flex items-center gap-2">
        <button type="button" onClick={() => onAddAttachments?.()} className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] text-neutral-400 transition-colors hover:bg-white/[0.14] hover:text-white" title={t("welcome.prompt.addAttachment")} aria-label={t("welcome.prompt.addAttachment")}>
          <Plus size={14} />
        </button>

        <div className="welcome-prompt-control-actions flex min-w-0 flex-1 items-center gap-2">
          {configNeeded ? <button type="button" onClick={() => onOpenSettings?.()} aria-label={t("welcome.prompt.modelLabel")} className="min-w-0 flex-1 truncate text-left text-xs text-amber-300">
            {t("welcome.prompt.modelLabel")}
          </button> : <WelcomeModelSelect label={t("welcome.prompt.modelLabel")} modelGroups={modelGroups} selectedModel={selectedModel} onSelectModel={onSelectModel} />}

          <button ref={settingsTriggerRef} type="button" onClick={() => configNeeded ? onOpenSettings?.() : setAdvancedOpen(open => !open)} aria-label={t("welcome.prompt.settingsLabel")} aria-haspopup="dialog" aria-expanded={advancedOpen} className="ml-auto flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] text-neutral-400 transition-colors hover:bg-white/[0.14] hover:text-neutral-200">
            <TuneIcon size={14} />
          </button>

          <button type="submit" disabled={submitting} className="ml-auto flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-mint disabled:opacity-50" title={t("welcome.actions.createNowTitle")} aria-label={t("welcome.actions.createNowTitle")}>
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Advanced settings use viewport positioning; nested select menus use portals. */}
      {advancedOpen ? <WelcomePromptSettings {...{
        t,
        panelRef,
        panelPos,
        activePill,
        onSelectPill,
        styleId,
        styleOptions,
        onSelectStyle,
        designSystemId,
        designSystemOptions,
        onSelectDesignSystem,
        candidates,
        onSelectCandidates,
        currentSize,
        sizeOptions,
        onSelectSize
      }} /> : null}
    </form>
  </div>;
}
TuneIcon.propTypes = {
  size: PropTypes.number
};
WelcomePromptComposer.propTypes = {
  initialAdvancedOpen: PropTypes.bool,
  t: PropTypes.func.isRequired,
  activePill: PropTypes.string,
  onSelectPill: PropTypes.func,
  promptText: PropTypes.string,
  setPromptText: PropTypes.func,
  modelGroups: PropTypes.array,
  selectedModel: PropTypes.string,
  onSelectModel: PropTypes.func,
  styleId: PropTypes.string,
  styleOptions: PropTypes.array,
  onSelectStyle: PropTypes.func,
  designSystemId: PropTypes.string,
  designSystemOptions: PropTypes.array,
  onSelectDesignSystem: PropTypes.func,
  size: PropTypes.object,
  sizeOptions: PropTypes.array,
  onSelectSize: PropTypes.func,
  candidates: PropTypes.number,
  onSelectCandidates: PropTypes.func,
  attachments: PropTypes.array,
  onAddAttachments: PropTypes.func,
  onRemoveAttachment: PropTypes.func,
  submitting: PropTypes.bool,
  configNeeded: PropTypes.bool,
  onOpenSettings: PropTypes.func,
  onSubmit: PropTypes.func
};
