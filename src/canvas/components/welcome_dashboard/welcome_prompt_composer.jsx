import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Layers, Monitor, MoreHorizontal, Palette, Plus, Sparkles, X } from "lucide-react";
import { AI_GEN_TYPES } from "./welcome_constants.js";
import { DEFAULT_STYLE_ID } from "./generation_intent.js";

/**
 * The welcome-screen generation composer: design type + real provider model +
 * style kit + frame size + reference attachments, all on one surface. Every
 * control here is wired; nothing is decorative.
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
}) {
  const [openMenu, setOpenMenu] = useState(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const rootRef = useRef(null);
  const activePreset = AI_GEN_TYPES.find((preset) => preset.id === activePill) ?? AI_GEN_TYPES[0];
  const activeStyle = styleOptions?.find((style) => style.id === styleId);
  const styleLabel = activeStyle?.name ?? t("welcome.prompt.styleAuto");
  const sizeLabel = `${size?.width ?? activePreset.width} × ${size?.height ?? activePreset.height}`;

  useEffect(() => {
    if (!openMenu) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      setOpenMenu(null);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenu]);

  const toggle = (menu) => setOpenMenu((current) => (current === menu ? null : menu));

  return (
    <div
      ref={rootRef}
      data-mobile-options-open={advancedOpen ? "true" : "false"}
      className="welcome-prompt-root relative"
    >
      {/* Design type chips: they choose the scene guidance and the default frame. */}
      <div className="welcome-prompt-type-options">
        <div className="flex justify-center">
          <div
            className="flex items-center gap-1.5 flex-wrap justify-center"
            role="radiogroup"
            aria-label={t("welcome.prompt.generationTypeLabel")}
          >
            {AI_GEN_TYPES.map((typeItem) => {
              const Icon = typeItem.icon;
              const isSelected = activePill === typeItem.id;
              return (
                <button
                  key={typeItem.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => onSelectPill?.(typeItem.id)}
                  className={`group flex min-w-[5rem] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                    isSelected
                      ? "bg-neutral-800 text-white shadow-pop ring-1 ring-white/10"
                      : "bg-neutral-900/70 text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200"
                  }`}
                >
                  {Icon && (
                    <Icon size={13} className={`transition-colors ${isSelected ? "text-neutral-200" : "text-neutral-500 group-hover:text-neutral-300"}`} />
                  )}
                  <span className="whitespace-nowrap">{t(typeItem.label)}</span>
                </button>
              );
            })}
          </div>
        </div>
        <p className="mx-auto mt-2 max-w-3xl px-2 text-center text-[11px] leading-relaxed text-neutral-500">
          {t(activePreset.guidance)}
        </p>
      </div>

      {/* Central prompt box */}
      <form
        onSubmit={onSubmit}
        className="prompt-composer relative mt-3 min-w-0 rounded-3xl p-4 transition-all"
      >
        <div className="absolute -top-px left-1/4 right-1/4 h-px bg-white/10 pointer-events-none" />

        <textarea
          value={promptText}
          onChange={(event) => setPromptText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent?.isComposing) {
              event.preventDefault();
              onSubmit?.(event);
            }
          }}
          placeholder={t(activePreset.placeholder)}
          rows={3}
          aria-label={t("welcome.prompt.placeholder")}
          className="w-full resize-none bg-transparent text-xs text-neutral-100 placeholder-neutral-400 focus:outline-none"
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

        <div className="welcome-prompt-controls-row mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onAddAttachments?.()}
              className="flex size-7 items-center justify-center rounded-xl bg-neutral-800/60 text-neutral-400 transition-colors hover:bg-neutral-700/80 hover:text-white cursor-pointer"
              title={t("welcome.prompt.addAttachment")}
              aria-label={t("welcome.prompt.addAttachment")}
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            {/* Style kit */}
            <div className="welcome-prompt-option welcome-prompt-option-style relative">
              <button
                type="button"
                onClick={() => toggle("style")}
                aria-haspopup="listbox"
                aria-expanded={openMenu === "style"}
                aria-label={t("welcome.prompt.styleLabel")}
                className="flex max-w-40 items-center gap-1 rounded-lg bg-neutral-800/70 px-2.5 py-1 text-[11px] text-neutral-300 transition-colors hover:bg-neutral-700/80 hover:text-white"
              >
                <Palette size={12} className="shrink-0 text-neutral-400" aria-hidden="true" />
                <span className="truncate">{styleLabel}</span>
                <ChevronDown size={10} className="shrink-0" aria-hidden="true" />
              </button>
              {openMenu === "style" && (
                <div
                  role="listbox"
                  aria-label={t("welcome.prompt.styleLabel")}
                  className="absolute right-0 top-9 z-30 max-h-72 w-64 overflow-y-auto rounded-xl border border-white/10 bg-[#171717] p-1.5 shadow-panel"
                >
                  <StyleOption
                    label={t("welcome.prompt.styleAuto")}
                    hint={t("welcome.prompt.styleAutoHint")}
                    active={!styleId || styleId === DEFAULT_STYLE_ID}
                    onClick={() => {
                      onSelectStyle?.(DEFAULT_STYLE_ID);
                      setOpenMenu(null);
                    }}
                  />
                  {styleOptions?.map((style) => (
                    <StyleOption
                      key={style.id}
                      label={style.name}
                      hint={style.mood}
                      swatch={style.swatch}
                      active={styleId === style.id}
                      onClick={() => {
                        onSelectStyle?.(style.id);
                        setOpenMenu(null);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Provider model */}
            <div className="welcome-prompt-option welcome-prompt-option-model relative">
              <button
                type="button"
                onClick={() => toggle("model")}
                aria-haspopup="listbox"
                aria-expanded={openMenu === "model"}
                aria-label={t("welcome.prompt.modelLabel")}
                title={selectedModel || ""}
                className={`flex max-w-48 items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] transition-colors hover:bg-neutral-700/80 ${
                  configNeeded ? "bg-amber-500/15 text-amber-300" : "bg-neutral-800/70 text-neutral-300 hover:text-white"
                }`}
              >
                <Sparkles size={12} className="shrink-0 text-neutral-400" aria-hidden="true" />
                <span className="truncate">{modelLabel}</span>
                <ChevronDown size={10} className="shrink-0" aria-hidden="true" />
              </button>
              {openMenu === "model" && (
                <div
                  role="listbox"
                  aria-label={t("welcome.prompt.modelLabel")}
                  className="absolute right-0 top-9 z-30 max-h-72 w-64 overflow-y-auto rounded-xl border border-white/10 bg-[#171717] p-1.5 shadow-panel"
                >
                  {configNeeded && (
                    <button
                      type="button"
                      onClick={() => {
                        setOpenMenu(null);
                        onOpenSettings?.();
                      }}
                      className="mb-1 w-full rounded-lg bg-amber-500/15 px-2.5 py-2 text-left text-[11px] text-amber-300 transition-colors hover:bg-amber-500/25"
                    >
                      {t("welcome.prompt.configNeeded")}
                    </button>
                  )}
                  {(modelGroups ?? []).map((group) => (
                    <div key={group.cliId} className="flex flex-col">
                      <div className="px-2 pb-0.5 pt-1.5 font-mono text-[10px] uppercase tracking-wider text-neutral-500">
                        {group.name}
                      </div>
                      {group.models.map((model) => (
                        <button
                          key={model.id}
                          type="button"
                          role="option"
                          aria-selected={selectedModel === model.id}
                          onClick={() => {
                            onSelectModel?.(model.id);
                            setOpenMenu(null);
                          }}
                          className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-white/[0.08] ${
                            selectedModel === model.id
                              ? "bg-[#E5B2FF]/15 font-medium text-[#eed0ff]"
                              : "text-neutral-300"
                          }`}
                        >
                          <span className="truncate">{model.label}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Variant count */}
            <div className="welcome-prompt-option welcome-prompt-option-candidates relative">
              <button
                type="button"
                onClick={() => toggle("candidates")}
                aria-haspopup="listbox"
                aria-expanded={openMenu === "candidates"}
                aria-label={t("welcome.prompt.candidates")}
                title={t("welcome.prompt.candidatesHint")}
                className="flex items-center gap-1 rounded-lg bg-neutral-800/70 px-2.5 py-1 text-[11px] text-neutral-300 transition-colors hover:bg-neutral-700/80 hover:text-white"
              >
                <Layers size={12} className="shrink-0 text-neutral-400" aria-hidden="true" />
                <span className="whitespace-nowrap">{t("welcome.prompt.candidateN", { n: candidates })}</span>
              </button>
              {openMenu === "candidates" && (
                <div
                  role="listbox"
                  aria-label={t("welcome.prompt.candidates")}
                  className="absolute right-0 top-9 z-30 w-48 overflow-hidden rounded-xl border border-white/10 bg-[#171717] p-1.5 shadow-panel"
                >
                  {[1, 2, 3].map((count) => (
                    <button
                      key={count}
                      type="button"
                      role="option"
                      aria-selected={candidates === count}
                      onClick={() => {
                        onSelectCandidates?.(count);
                        setOpenMenu(null);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-white/[0.08] ${
                        candidates === count ? "bg-[#E5B2FF]/15 font-medium text-[#eed0ff]" : "text-neutral-300"
                      }`}
                    >
                      <span>{t("welcome.prompt.candidateN", { n: count })}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Frame size */}
            <div className="welcome-prompt-option welcome-prompt-option-size relative">
              <button
                type="button"
                onClick={() => toggle("size")}
                aria-haspopup="listbox"
                aria-expanded={openMenu === "size"}
                aria-label={t("welcome.prompt.sizeLabel")}
                className="flex items-center gap-1 rounded-lg bg-neutral-800/70 px-2.5 py-1 text-[11px] text-neutral-300 transition-colors hover:bg-neutral-700/80 hover:text-white"
              >
                <Monitor size={12} className="shrink-0 text-neutral-400" aria-hidden="true" />
                <span className="whitespace-nowrap font-mono">{sizeLabel}</span>
              </button>
              {openMenu === "size" && (
                <div
                  role="listbox"
                  aria-label={t("welcome.prompt.sizeLabel")}
                  className="absolute right-0 top-9 z-30 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#171717] p-1.5 shadow-panel"
                >
                  {(sizeOptions ?? []).map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      role="option"
                      aria-selected={size?.width === option.width && size?.height === option.height}
                      onClick={() => {
                        onSelectSize?.({ width: option.width, height: option.height });
                        setOpenMenu(null);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors hover:bg-white/[0.08] ${
                        size?.width === option.width && size?.height === option.height
                          ? "bg-[#E5B2FF]/15 font-medium text-[#eed0ff]"
                          : "text-neutral-300"
                      }`}
                    >
                      <span className="font-mono">{option.width} × {option.height}</span>
                      {option.id === `${activePreset.width}x${activePreset.height}` && (
                        <span className="text-[10px] text-neutral-500">{t("welcome.prompt.sizePreset")}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              className="welcome-prompt-more hidden size-9 items-center justify-center rounded-full text-neutral-400 hover:bg-white/10 hover:text-white"
              aria-label={t("welcome.actions.more")}
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((open) => !open)}
            >
              <MoreHorizontal size={17} aria-hidden="true" />
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex size-7 items-center justify-center rounded-full bg-neutral-700 text-neutral-200 transition-colors hover:bg-mint hover:text-black disabled:opacity-50 cursor-pointer"
              title={t("welcome.actions.createNowTitle")}
              aria-label={t("welcome.actions.createNowTitle")}
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function StyleOption({ label, hint, swatch, active, onClick }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={`flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.08] ${
        active ? "bg-[#E5B2FF]/15" : ""
      }`}
    >
      {swatch ? (
        <span className="mt-0.5 flex shrink-0 gap-0.5" aria-hidden="true">
          {swatch.map((color) => (
            <span key={color} className="size-2 rounded-full ring-1 ring-white/10" style={{ backgroundColor: color }} />
          ))}
        </span>
      ) : (
        <span className="mt-0.5 size-2 shrink-0 rounded-full bg-neutral-600" aria-hidden="true" />
      )}
      <span className="min-w-0">
        <span className={`block truncate text-[12px] ${active ? "text-[#eed0ff]" : "text-neutral-200"}`}>{label}</span>
        {hint && <span className="mt-0.5 block line-clamp-2 text-[10px] leading-snug text-neutral-500">{hint}</span>}
      </span>
    </button>
  );
}
