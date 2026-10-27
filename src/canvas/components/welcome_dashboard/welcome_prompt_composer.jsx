import React, { useEffect, useRef, useState } from "react";
import { Plus, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { AI_GEN_TYPES } from "./welcome_constants.js";
import { DEFAULT_STYLE_ID } from "./generation_intent.js";

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
  modelLabel,
  modelGroups,
  selectedModel,
  onSelectModel,
  styleId,
  styleOptions,
  onSelectStyle,
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
  initialAdvancedOpen = false,
}) {
  const [advancedOpen, setAdvancedOpen] = useState(initialAdvancedOpen);
  const [panelPos, setPanelPos] = useState(null);
  const rootRef = useRef(null);
  const formRef = useRef(null);
  const panelRef = useRef(null);
  const activePreset = AI_GEN_TYPES.find((preset) => preset.id === activePill) ?? AI_GEN_TYPES[0];
  const currentSize = size ?? { width: activePreset.width, height: activePreset.height };

  useEffect(() => {
    if (!advancedOpen) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      if (panelRef.current?.contains(event.target)) return;
      setAdvancedOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setAdvancedOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [advancedOpen]);

  useEffect(() => {
    if (!advancedOpen) return undefined;
    const place = () => {
      const rect = formRef.current?.getBoundingClientRect();
      if (!rect) return;
      const isMobile = window.matchMedia("(max-width: 768px) and (hover: none) and (pointer: coarse)").matches;
      const panelWidth = isMobile ? window.innerWidth - 32 : 320;
      const panelGutter = isMobile ? 16 : 8;
      setPanelPos({
        left: Math.max(panelGutter, Math.min(rect.right - panelWidth, window.innerWidth - panelWidth - panelGutter)),
        top: Math.min(rect.bottom + 8, window.innerHeight - 260),
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [advancedOpen]);

  return (
    <div ref={rootRef} data-advanced-open={advancedOpen ? "true" : "false"} className="welcome-prompt-root relative">
      <form
        ref={formRef}
        onSubmit={onSubmit}
        className={`prompt-composer relative mt-3 min-w-0 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 transition-colors focus-within:border-white/15 ${advancedOpen ? "z-[300]" : ""}`}
      >
        <textarea
          value={promptText}
          onChange={(event) => setPromptText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent?.isComposing) {
              event.preventDefault();
              onSubmit?.(event);
            }
          }}
          placeholder={t("welcome.prompt.placeholder")}
          rows={3}
          aria-label={t("welcome.prompt.placeholder")}
          className="w-full resize-none bg-transparent text-[12px] leading-6 text-neutral-100 placeholder-neutral-400 focus:outline-none"
        />

        {attachments?.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-1.5" aria-label={t("welcome.prompt.attachments")}>
            {attachments.map((attachment) => (
              <li
                key={`${attachment.kind}:${attachment.name}`}
                className="flex max-w-48 items-center gap-1 rounded-lg bg-white/[0.06] px-2 py-1 text-[11px] text-neutral-300"
              >
                {attachment.kind === "image" && attachment.dataUrl ? (
                  <img src={attachment.dataUrl} alt="" className="size-4 rounded-lg object-cover" />
                ) : (
                  <span className="size-4 rounded-lg bg-white/10" aria-hidden="true" />
                )}
                <span className="truncate">{attachment.name}</span>
                <button
                  type="button"
                  onClick={() => onRemoveAttachment?.(attachment)}
                  aria-label={t("welcome.prompt.removeAttachment")}
                  className="text-neutral-500 transition-colors hover:text-white"
                >
                  <X size={11} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onAddAttachments?.()}
            className="flex size-7 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-white/[0.06] hover:text-white"
            title={t("welcome.prompt.addAttachment")}
            aria-label={t("welcome.prompt.addAttachment")}
          >
            <Plus size={14} />
          </button>

          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              onClick={() => (configNeeded ? onOpenSettings?.() : setAdvancedOpen((open) => !open))}
              aria-label={t("welcome.prompt.modelLabel")}
              title={selectedModel || ""}
              className={`flex max-w-[13rem] min-w-0 items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] transition-colors hover:bg-white/[0.06] ${
                configNeeded ? "text-amber-300" : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <Sparkles size={12} className="shrink-0" aria-hidden="true" />
              <span className="truncate">{modelLabel}</span>
            </button>

            <button
              type="button"
              onClick={() => setAdvancedOpen((open) => !open)}
              aria-label={t("welcome.prompt.generationTypeLabel")}
              aria-haspopup="dialog"
              aria-expanded={advancedOpen}
              className="flex size-7 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-white/[0.06] hover:text-neutral-200"
            >
              <SlidersHorizontal size={14} />
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="flex size-7 items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-mint disabled:opacity-50"
              title={t("welcome.actions.createNowTitle")}
              aria-label={t("welcome.actions.createNowTitle")}
            >
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Advanced generation settings are portalled so the panel never clips. */}
        {advancedOpen ? (
              <div
                ref={panelRef}
                role="dialog"
                aria-label={t("welcome.prompt.generationTypeLabel")}
                className="welcome-composer-settings fixed z-[250] w-80 rounded-2xl border border-white/10 bg-[#171717] p-3 shadow-panel"
                style={panelPos ?? { left: -9999, top: 0 }}
              >
          <div className="welcome-composer-settings-grid space-y-2">
            <ComposerField label={t("welcome.prompt.generationTypeLabel")}>
              <select
                value={activePill}
                onChange={(event) => onSelectPill?.(event.target.value)}
                className="composer-select appearance-none"
                aria-label={t("welcome.prompt.generationTypeLabel")}
              >
                {AI_GEN_TYPES.map((typeItem) => (
                  <option key={typeItem.id} value={typeItem.id}>{t(typeItem.label)}</option>
                ))}
              </select>
            </ComposerField>

            <ComposerField label={t("welcome.prompt.modelLabel")}>
              <select
                value={selectedModel ?? ""}
                onChange={(event) => onSelectModel?.(event.target.value)}
                className="composer-select appearance-none"
                aria-label={t("welcome.prompt.modelLabel")}
              >
                {(modelGroups ?? []).map((group) => (
                  <optgroup key={group.cliId} label={group.name}>
                    {group.models.map((model) => (
                      <option key={model.id} value={model.id}>{model.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </ComposerField>

            <ComposerField label={t("welcome.prompt.styleLabel")}>
              <select
                value={styleId ?? DEFAULT_STYLE_ID}
                onChange={(event) => onSelectStyle?.(event.target.value)}
                className="composer-select appearance-none"
                aria-label={t("welcome.prompt.styleLabel")}
              >
                <option value={DEFAULT_STYLE_ID}>{t("welcome.prompt.styleAuto")}</option>
                {(styleOptions ?? []).map((style) => (
                  <option key={style.id} value={style.id}>{style.name}</option>
                ))}
              </select>
            </ComposerField>

            <ComposerField label={t("welcome.prompt.candidates")}>
                <select
                  value={candidates}
                  onChange={(event) => onSelectCandidates?.(Number(event.target.value))}
                  className="composer-select appearance-none"
                  aria-label={t("welcome.prompt.candidates")}
                >
                  {[1, 2, 3].map((count) => (
                    <option key={count} value={count}>{t("welcome.prompt.candidateN", { n: count })}</option>
                  ))}
              </select>
            </ComposerField>
            <ComposerField label={t("welcome.prompt.sizeLabel")}>
                <select
                  value={`${currentSize.width}x${currentSize.height}`}
                  onChange={(event) => {
                    const option = sizeOptions?.find(
                      (item) => `${item.width}x${item.height}` === event.target.value,
                    );
                    if (option) onSelectSize?.({ width: option.width, height: option.height });
                  }}
                  className="composer-select appearance-none"
                  aria-label={t("welcome.prompt.sizeLabel")}
                >
                  {(sizeOptions ?? []).map((option) => (
                    <option key={option.id} value={`${option.width}x${option.height}`}>
                      {option.width} × {option.height}
                    </option>
                  ))}
              </select>
            </ComposerField>
              </div>
              </div>
        ) : null}
      </form>
    </div>
  );
}

function ComposerField({ label, children }) {
  return (
    <label className="welcome-composer-field flex items-center gap-2">
      <span className="welcome-composer-field-label w-24 shrink-0 truncate text-[10px] text-neutral-500">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}
