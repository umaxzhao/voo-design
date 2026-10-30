import React, { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { ArrowUp, ChevronDown, LayoutGrid, X } from "lucide-react";
import { AI_GEN_TYPES } from "./welcome_constants.js";
import { DEFAULT_DESIGN_SYSTEM_ID } from "./generation-options.js";
import WelcomePromptDialogs, {
  WelcomePromptContext,
} from "./welcome_prompt_dialogs.jsx";
import WelcomePromptTypes from "./welcome_prompt_types.jsx";
import { ProviderLogo } from "../provider_icons.jsx";
import { getModelDisplayParts } from "../agent-panel/model_catalog.js";
function getProviderLogoId(groupId) {
  if (groupId === "claude") return "claude-cli";
  if (groupId === "codex") return "cli";
  if (groupId === "antigravity") return "antigravity-cli";
  return groupId;
}
/** Shared animated rim, one real variant count, and the existing context options. */
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
}) {
  const [contextOpen, setContextOpen] = useState(false);
  const [variantsOpen, setVariantsOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [styleModalOpen, setStyleModalOpen] = useState(false);
  const [systemModalOpen, setSystemModalOpen] = useState(false);
  const [sizeModalOpen, setSizeModalOpen] = useState(false);
  const contextButtonRef = useRef(null);
  const contextMenuRef = useRef(null);
  const variantsButtonRef = useRef(null);
  const variantsMenuRef = useRef(null);
  const modelButtonRef = useRef(null);
  const modelMenuRef = useRef(null);
  const activePreset =
    AI_GEN_TYPES.find((preset) => preset.id === activePill) ?? AI_GEN_TYPES[0];
  const currentSize = size ?? {
    width: activePreset.width,
    height: activePreset.height,
  };
  const selectedModelGroup = (modelGroups ?? []).find((group) =>
    group.models.some((model) => model.id === selectedModel),
  );
  const selectedModelEntry = selectedModelGroup?.models.find(
    (model) => model.id === selectedModel,
  );
  const providerLogoId = getProviderLogoId(
    selectedModelGroup?.cliId ?? selectedModel?.split(":")[0],
  );
  const parts = selectedModelEntry
    ? getModelDisplayParts(selectedModelEntry.id, modelGroups ?? [])
    : null;
  const cleanModelName = parts
    ? `${parts.modelName}${parts.tier}`
    : selectedModelEntry?.label || t("welcome.prompt.modelLabel");
  // Outside click & Escape handlers
  useEffect(() => {
    const onPointerDown = (event) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(event.target) &&
        !contextButtonRef.current?.contains(event.target)
      ) {
        setContextOpen(false);
      }
      if (
        variantsMenuRef.current &&
        !variantsMenuRef.current.contains(event.target) &&
        !variantsButtonRef.current?.contains(event.target)
      ) {
        setVariantsOpen(false);
      }
      if (
        modelMenuRef.current &&
        !modelMenuRef.current.contains(event.target) &&
        !modelButtonRef.current?.contains(event.target)
      ) {
        setModelMenuOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setContextOpen(false);
        setVariantsOpen(false);
        setModelMenuOpen(false);
        setStyleModalOpen(false);
        setSystemModalOpen(false);
        setSizeModalOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);
  return (
    <div className="welcome-prompt-root relative w-full font-sans">
      <WelcomePromptTypes
        t={t}
        activePill={activePill}
        onSelectPill={onSelectPill}
      />
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
            placeholder={t("welcome.prompt.placeholder")}
            rows={3}
            aria-label={t("welcome.prompt.placeholder")}
            className="min-h-[84px] w-full resize-none bg-transparent px-4 pt-4 font-sans text-[15px] leading-relaxed text-neutral-100 placeholder-neutral-400 focus:outline-none"
          />
          {attachments?.length > 0 && (
            <ul
              className="flex flex-wrap gap-1.5 px-4 pb-2"
              aria-label={t("welcome.prompt.attachments")}
            >
              {attachments.map((attachment) => (
                <li
                  key={`${attachment.kind}:${attachment.name}`}
                  className="flex max-w-48 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.06] px-2 py-1 text-xs text-neutral-300"
                >
                  {attachment.kind === "image" && attachment.dataUrl ? (
                    <img
                      src={attachment.dataUrl}
                      alt=""
                      className="size-3.5 rounded-lg object-cover"
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
          <div className="flex items-center justify-between px-3 py-2">
            <WelcomePromptContext
              {...{
                t,
                contextButtonRef,
                contextMenuRef,
                contextOpen,
                setContextOpen,
                onAddAttachments,
                setStyleModalOpen,
                setSystemModalOpen,
                setSizeModalOpen,
              }}
            />
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  ref={variantsButtonRef}
                  type="button"
                  onClick={() => setVariantsOpen((o) => !o)}
                  aria-label={t("welcome.prompt.candidates")}
                  title={t("welcome.prompt.candidates")}
                  aria-expanded={variantsOpen}
                  aria-haspopup="menu"
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-mono transition-colors cursor-pointer ${
                    candidates > 1
                      ? "bg-[#E5B2FF]/15 text-[#eed0ff] font-semibold ring-1 ring-[#E5B2FF]/30"
                      : "text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200"
                  }`}
                >
                  <LayoutGrid size={13} />
                  <span>{candidates}x</span>
                </button>
                {variantsOpen && (
                  <div
                    ref={variantsMenuRef}
                    role="menu"
                    aria-label={t("welcome.prompt.candidates")}
                    className="absolute bottom-full right-0 z-50 mb-2 w-48 rounded-xl border border-white/10 bg-[#1a1a1a] p-2 shadow-panel"
                  >
                    <div className="grid grid-cols-3 gap-1.5">
                      {[1, 2, 3].map((count) => (
                        <button
                          key={count}
                          type="button"
                          onClick={() => {
                            onSelectCandidates?.(count);
                            setVariantsOpen(false);
                          }}
                          className={`flex items-center justify-center rounded-lg py-1.5 text-xs font-mono transition-colors ${
                            candidates === count
                              ? "bg-[#E5B2FF]/20 text-[#eed0ff] font-semibold ring-1 ring-[#E5B2FF]/40"
                              : "border border-white/10 text-neutral-400 hover:bg-white/[0.06] hover:text-white"
                          }`}
                          aria-label={t("welcome.prompt.candidateN", {
                            n: count,
                          })}
                        >
                          {count}x
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="relative">
                <button
                  ref={modelButtonRef}
                  type="button"
                  onClick={() =>
                    configNeeded
                      ? onOpenSettings?.()
                      : setModelMenuOpen((o) => !o)
                  }
                  aria-label={t("welcome.prompt.modelLabel")}
                  aria-haspopup="listbox"
                  aria-expanded={modelMenuOpen}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-colors cursor-pointer ${
                    configNeeded
                      ? "text-amber-400 bg-amber-400/10 hover:bg-amber-400/20"
                      : "text-neutral-300 hover:text-white hover:bg-white/[0.06]"
                  }`}
                >
                  {providerLogoId && (
                    <ProviderLogo providerId={providerLogoId} size={14} />
                  )}
                  <span className="max-w-[150px] truncate">
                    {cleanModelName}
                  </span>
                  <ChevronDown
                    size={11}
                    className="shrink-0 text-neutral-400"
                  />
                </button>
                {modelMenuOpen && (
                  <div
                    ref={modelMenuRef}
                    role="listbox"
                    aria-label={t("welcome.prompt.modelLabel")}
                    className="absolute bottom-full right-0 z-50 mb-2 max-h-72 w-64 overflow-y-auto rounded-xl border border-white/10 bg-[#1a1a1a] p-1.5 shadow-panel"
                  >
                    {(modelGroups ?? []).map((group) => (
                      <div key={group.cliId} className="flex flex-col">
                        <div className="px-2 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                          {group.name}
                        </div>
                        {group.models.map((model) => {
                          const isSelected = selectedModel === model.id;
                          const modelParts = getModelDisplayParts(
                            model.id,
                            modelGroups ?? [],
                          );
                          return (
                            <button
                              key={model.id}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              onClick={() => {
                                onSelectModel?.(model.id);
                                setModelMenuOpen(false);
                              }}
                              className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                                isSelected
                                  ? "bg-white/10 text-white font-medium"
                                  : "text-neutral-300 hover:bg-white/[0.06] hover:text-white"
                              }`}
                            >
                              <span className="truncate">
                                {`${modelParts.modelName}${modelParts.tier}` ||
                                  model.label}
                              </span>
                              {isSelected && (
                                <span className="size-1.5 rounded-full bg-[#a7ffd4]" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="submit"
                disabled={submitting}
                className={`flex size-7 shrink-0 items-center justify-center rounded-full transition-all cursor-pointer ${
                  promptText?.trim()
                    ? "bg-white text-black hover:bg-white/90 active:scale-95"
                    : "bg-white/20 text-neutral-400 opacity-60"
                }`}
                title={t("welcome.actions.createNowTitle")}
                aria-label={t("welcome.actions.createNowTitle")}
              >
                <ArrowUp size={14} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </form>
      </div>
      <WelcomePromptDialogs
        {...{
          t,
          styleModalOpen,
          setStyleModalOpen,
          styleId,
          styleOptions,
          onSelectStyle,
          systemModalOpen,
          setSystemModalOpen,
          designSystemId,
          designSystemOptions,
          onSelectDesignSystem,
          sizeModalOpen,
          setSizeModalOpen,
          currentSize,
          sizeOptions,
          onSelectSize,
        }}
      />
    </div>
  );
}
WelcomePromptComposer.propTypes = {
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
