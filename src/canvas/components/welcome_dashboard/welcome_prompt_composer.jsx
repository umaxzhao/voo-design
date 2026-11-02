import React from "react";
import PropTypes from "prop-types";
import { ArrowUp, Plus, SlidersHorizontal, X } from "lucide-react";
import { AI_GEN_TYPES } from "./welcome_constants.js";
import { DEFAULT_DESIGN_SYSTEM_ID } from "./generation-options.js";
import WelcomePromptSettings from "./welcome_prompt_settings.jsx";
import WelcomeModelSelect from "./welcome_model_select.jsx";
import { PopoverScopeContext } from "../popover_scope.js";
import { useWelcomeGenerationSettings } from "./use_welcome_generation_settings.js";

/** Default composer stays focused; all advanced choices share one popover. */
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
  initialAdvancedOpen = false,
}) {
  const settings = useWelcomeGenerationSettings(initialAdvancedOpen);
  const activePreset =
    AI_GEN_TYPES.find((preset) => preset.id === activePill) ?? AI_GEN_TYPES[0];
  return (
    <div
      ref={settings.rootRef}
      data-advanced-open={settings.open ? "true" : "false"}
      className="welcome-prompt-root relative w-full font-sans"
    >
      <div className="relative mx-auto w-full max-w-3xl">
        <form
          onSubmit={onSubmit}
          className="prompt-composer relative flex min-h-24 flex-col rounded-2xl"
        >
          <textarea
            value={promptText}
            onChange={(event) => setPromptText(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent?.isComposing
              ) {
                event.preventDefault();
                onSubmit?.(event);
              }
            }}
            placeholder={t(
              activePreset.placeholder ?? "welcome.prompt.placeholder",
            )}
            rows={3}
            aria-label={t(
              activePreset.placeholder ?? "welcome.prompt.placeholder",
            )}
            className="min-h-[84px] w-full resize-none bg-transparent px-4 pt-4 font-sans text-[15px] leading-relaxed text-neutral-100 placeholder-neutral-400 focus:outline-none"
          />
          {attachments?.length > 0 && (
            <ul
              className="flex flex-wrap gap-1.5 px-4 pb-2"
              aria-label={t("welcome.prompt.attachments")}
            >
              {attachments.map((attachment) => (
                <li
                  key={attachment.id ?? `${attachment.kind}:${attachment.name}`}
                  className="flex max-w-48 items-center gap-1.5 rounded-lg bg-white/[0.06] px-2 py-1 text-xs text-neutral-300"
                >
                  {attachment.kind === "image" && attachment.dataUrl ? (
                    <img
                      src={attachment.dataUrl}
                      alt=""
                      className="size-10 rounded-lg object-cover"
                    />
                  ) : (
                    <span
                      className="size-3.5 rounded-lg bg-white/10"
                      aria-hidden="true"
                    />
                  )}
                  <span className="truncate">{attachment.name}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment?.(attachment)}
                    aria-label={t("welcome.prompt.removeAttachment")}
                    className="text-neutral-500 transition-colors hover:text-white"
                  >
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="welcome-prompt-controls-row flex min-w-0 items-center gap-2 px-3 py-2">
            <button
              type="button"
              onClick={() => onAddAttachments?.()}
              aria-label={t("welcome.prompt.addAttachment")}
              title={t("welcome.prompt.addAttachment")}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-neutral-400 transition-colors hover:bg-white/[0.1] hover:text-white"
            >
              <Plus size={14} />
            </button>
            <div className="welcome-prompt-control-actions flex min-w-0 flex-1 items-center gap-2">
              {configNeeded ? (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  aria-label={t("welcome.prompt.modelLabel")}
                  className="min-w-0 flex-1 truncate text-left text-xs text-amber-400"
                >
                  {t("welcome.prompt.modelLabel")}
                </button>
              ) : (
                <WelcomeModelSelect
                  label={t("welcome.prompt.modelLabel")}
                  modelGroups={modelGroups}
                  selectedModel={selectedModel}
                  onSelectModel={onSelectModel}
                  className="min-w-0 flex-1"
                  triggerClassName="!h-9 !max-w-full !bg-transparent !text-xs !text-neutral-300 hover:!bg-white/[0.06]"
                />
              )}
              <button
                ref={settings.triggerRef}
                type="button"
                onClick={() => settings.setOpen((open) => !open)}
                aria-label={t("welcome.prompt.settingsLabel")}
                title={t("welcome.prompt.settingsLabel")}
                aria-haspopup="dialog"
                aria-expanded={settings.open}
                className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-neutral-400 hover:bg-white/[0.1] hover:text-white"
              >
                <SlidersHorizontal size={14} strokeWidth={1.5} />
              </button>
              <button
                type="submit"
                disabled={submitting}
                title={t("welcome.actions.createNowTitle")}
                aria-label={t("welcome.actions.createNowTitle")}
                className={`flex size-9 shrink-0 items-center justify-center rounded-full transition-colors ${promptText?.trim() || attachments?.some((item) => item.kind === "image") ? "bg-white text-black hover:bg-white/90" : "bg-white/20 text-neutral-400 opacity-60"}`}
              >
                <ArrowUp size={14} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </form>
      </div>
      {settings.open && (
        <PopoverScopeContext.Provider value={settings.scope}>
          <WelcomePromptSettings
            t={t}
            panelRef={settings.panelRef}
            panelPos={settings.position}
            activePill={activePill}
            onSelectPill={onSelectPill}
            styleId={styleId}
            styleOptions={styleOptions}
            onSelectStyle={onSelectStyle}
            designSystemId={designSystemId}
            designSystemOptions={designSystemOptions}
            onSelectDesignSystem={onSelectDesignSystem}
            candidates={candidates}
            onSelectCandidates={onSelectCandidates}
            currentSize={size}
            sizeOptions={sizeOptions}
            onSelectSize={onSelectSize}
          />
        </PopoverScopeContext.Provider>
      )}
    </div>
  );
}
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
  onSubmit: PropTypes.func,
};
