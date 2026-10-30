import React, { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import {
  ArrowUp,
  ChevronDown,
  Component,
  LayoutGrid,
  Monitor,
  Palette,
  Paperclip,
  Plus,
  X,
  Zap,
} from "lucide-react";
import { AI_GEN_TYPES } from "./welcome_constants.js";
import { DEFAULT_DESIGN_SYSTEM_ID, DEFAULT_STYLE_ID } from "./generation-options.js";
import { ProviderLogo } from "../provider_icons.jsx";
import { getModelDisplayParts } from "../agent-panel/model_catalog.js";

function getProviderLogoId(groupId) {
  if (groupId === "claude") return "claude-cli";
  if (groupId === "codex") return "cli";
  if (groupId === "antigravity") return "antigravity-cli";
  return groupId;
}

/**
 * Pen-style welcome prompt composer:
 * - Generation type pills at top (Landing page, Mobile app, Web app, Slides, Dashboard, Something else...)
 * - Prompt card with subtle ambient pink/purple aura
 * - Bottom toolbar:
 *   - Left: [+] Add to context (Add image or file, Choose a style, Design system, Canvas size)
 *   - Right: [⚡ 1x] Parallel agents, [⊞ 1x] Let it cook/Variants, [Model ⌵] Model selector, [↑] Submit
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
}) {
  const [contextOpen, setContextOpen] = useState(false);
  const [parallelOpen, setParallelOpen] = useState(false);
  const [cookOpen, setCookOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [parallelMultiplier, setParallelMultiplier] = useState(1);
  const [parallelMode, setParallelMode] = useState("split");
  const [iterateMode, setIterateMode] = useState("style");

  const [styleModalOpen, setStyleModalOpen] = useState(false);
  const [systemModalOpen, setSystemModalOpen] = useState(false);
  const [sizeModalOpen, setSizeModalOpen] = useState(false);

  const contextButtonRef = useRef(null);
  const contextMenuRef = useRef(null);
  const parallelButtonRef = useRef(null);
  const parallelMenuRef = useRef(null);
  const cookButtonRef = useRef(null);
  const cookMenuRef = useRef(null);
  const modelButtonRef = useRef(null);
  const modelMenuRef = useRef(null);

  const activePreset = AI_GEN_TYPES.find((preset) => preset.id === activePill) ?? AI_GEN_TYPES[0];
  const currentSize = size ?? { width: activePreset.width, height: activePreset.height };

  const selectedModelGroup = (modelGroups ?? []).find((group) =>
    group.models.some((model) => model.id === selectedModel),
  );
  const selectedModelEntry = selectedModelGroup?.models.find((model) => model.id === selectedModel);
  const providerLogoId = getProviderLogoId(selectedModelGroup?.cliId ?? selectedModel?.split(":")[0]);
  const parts = selectedModelEntry
    ? getModelDisplayParts(selectedModelEntry.id, modelGroups ?? [])
    : null;
  const cleanModelName = parts
    ? `${parts.modelName}${parts.tier}`
    : (selectedModelEntry?.label || "Model");

  // Outside click & Escape handlers
  useEffect(() => {
    const onPointerDown = (event) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target) && !contextButtonRef.current?.contains(event.target)) {
        setContextOpen(false);
      }
      if (parallelMenuRef.current && !parallelMenuRef.current.contains(event.target) && !parallelButtonRef.current?.contains(event.target)) {
        setParallelOpen(false);
      }
      if (cookMenuRef.current && !cookMenuRef.current.contains(event.target) && !cookButtonRef.current?.contains(event.target)) {
        setCookOpen(false);
      }
      if (modelMenuRef.current && !modelMenuRef.current.contains(event.target) && !modelButtonRef.current?.contains(event.target)) {
        setModelMenuOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setContextOpen(false);
        setParallelOpen(false);
        setCookOpen(false);
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
      {/* 1. Top Pills: Generation Type Presets (Matches Pen app) */}
      <div
        className="welcome-prompt-type-options mb-4 flex flex-wrap items-center justify-center gap-2"
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
              className={`flex h-8 items-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer select-none ${
                isSelected
                  ? "border-white/50 bg-white/10 text-white ring-1 ring-white/20"
                  : "border-white/10 bg-[#161616]/80 text-neutral-400 hover:border-white/25 hover:bg-white/[0.04] hover:text-neutral-200"
              }`}
            >
              {Icon && (
                <Icon
                  size={14}
                  className={`shrink-0 ${isSelected ? "text-white" : "text-neutral-400"}`}
                  aria-hidden="true"
                />
              )}
              <span className="whitespace-nowrap">{t(typeItem.label)}</span>
            </button>
          );
        })}
      </div>

      {/* 2. Main Prompt Box Container with Pen-style Ambient Glow */}
      <div className="relative mx-auto w-full max-w-3xl">
        <div className="welcome-prompt-glow" aria-hidden="true" />
        <form
          onSubmit={onSubmit}
          className="relative flex min-h-24 flex-col rounded-2xl border border-white/10 bg-[#141414] transition-colors focus-within:border-white/25"
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
            placeholder={t("welcome.prompt.placeholder") || "Design anything…"}
            rows={3}
            aria-label={t("welcome.prompt.placeholder") || "Design anything…"}
            className="min-h-[84px] w-full resize-none bg-transparent px-4 pt-4 font-sans text-[15px] leading-relaxed text-neutral-100 placeholder-neutral-400 focus:outline-none"
          />

          {attachments?.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 px-4 pb-2" aria-label={t("welcome.prompt.attachments")}>
              {attachments.map((attachment) => (
                <li
                  key={`${attachment.kind}:${attachment.name}`}
                  className="flex max-w-48 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.06] px-2 py-1 text-xs text-neutral-300"
                >
                  {attachment.kind === "image" && attachment.dataUrl ? (
                    <img src={attachment.dataUrl} alt="" className="size-3.5 rounded-lg object-cover" />
                  ) : (
                    <span className="size-3.5 rounded-lg bg-white/10" aria-hidden="true" />
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

          {/* 3. Bottom Toolbar */}
          <div className="flex items-center justify-between border-t border-white/[0.06] px-3 py-2">
            {/* Left: [+] Add to Context Button */}
            <div className="relative">
              <button
                ref={contextButtonRef}
                type="button"
                onClick={() => setContextOpen((o) => !o)}
                className="flex size-7 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-white cursor-pointer"
                title={t("welcome.prompt.addAttachment")}
                aria-label={t("welcome.prompt.addAttachment")}
                aria-haspopup="menu"
              >
                <Plus size={16} strokeWidth={2} />
              </button>
              {contextOpen && (
                <div
                  ref={contextMenuRef}
                  className="absolute bottom-full left-0 z-50 mb-2 w-52 rounded-xl border border-white/10 bg-[#1a1a1a] p-1.5 shadow-panel backdrop-blur-md"
                >
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                    Add to Context
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setContextOpen(false);
                      onAddAttachments?.();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-neutral-300 hover:bg-white/[0.08] hover:text-white transition-colors"
                  >
                    <Paperclip size={13} className="text-neutral-400" />
                    <span>Add image or file</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setContextOpen(false);
                      setStyleModalOpen(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-neutral-300 hover:bg-white/[0.08] hover:text-white transition-colors"
                  >
                    <Palette size={13} className="text-neutral-400" />
                    <span>Choose a style</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setContextOpen(false);
                      setSystemModalOpen(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-neutral-300 hover:bg-white/[0.08] hover:text-white transition-colors"
                  >
                    <Component size={13} className="text-neutral-400" />
                    <span>Design system</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setContextOpen(false);
                      setSizeModalOpen(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-neutral-300 hover:bg-white/[0.08] hover:text-white transition-colors"
                  >
                    <Monitor size={13} className="text-neutral-400" />
                    <span>Canvas size</span>
                  </button>
                </div>
              )}
            </div>

            {/* Right Group: ⚡ 1x  |  ⊞ 1x  |  Claude Opus 5 ⌵  |  ↑ */}
            <div className="flex items-center gap-2">
              {/* 1. Parallel agents: ⚡ 1x */}
              <div className="relative">
                <button
                  ref={parallelButtonRef}
                  type="button"
                  onClick={() => setParallelOpen((o) => !o)}
                  aria-label="Parallel agents"
                  title="Parallel agents"
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-mono text-amber-400 hover:bg-amber-400/10 transition-colors cursor-pointer"
                >
                  <Zap size={13} className="fill-amber-400 text-amber-400" />
                  <span>{parallelMultiplier}x</span>
                </button>
                {parallelOpen && (
                  <div
                    ref={parallelMenuRef}
                    className="absolute bottom-full right-0 z-50 mb-2 w-64 rounded-xl border border-white/10 bg-[#1a1a1a] p-3 shadow-panel"
                  >
                    <div className="text-xs font-semibold text-neutral-200 mb-1">Parallel agents</div>
                    <p className="text-[11px] text-neutral-400 mb-2.5">
                      Run multiple agents concurrently to explore different approaches.
                    </p>
                    <div className="grid grid-cols-4 gap-1.5 mb-2.5">
                      {[1, 2, 3, 4].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => {
                            setParallelMultiplier(n);
                            setParallelOpen(false);
                          }}
                          className={`flex items-center justify-center rounded-lg py-1.5 text-xs font-mono transition-colors ${
                            parallelMultiplier === n
                              ? "bg-amber-500/20 text-amber-300 font-semibold ring-1 ring-amber-500/40"
                              : "border border-white/10 text-neutral-400 hover:bg-white/[0.06] hover:text-white"
                          }`}
                        >
                          {n}x
                        </button>
                      ))}
                    </div>
                    <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-500 mb-1.5">
                      Agent mode
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setParallelMode("split");
                          setParallelOpen(false);
                        }}
                        className={`flex flex-col items-center justify-center rounded-lg p-2 text-center transition-colors ${
                          parallelMode === "split"
                            ? "bg-white/10 text-white ring-1 ring-white/20"
                            : "border border-white/10 text-neutral-400 hover:bg-white/[0.04]"
                        }`}
                      >
                        <span className="text-xs font-medium">Split Work</span>
                        <span className="text-[10px] text-neutral-500 mt-0.5">Different tasks</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setParallelMode("side-by-side");
                          setParallelOpen(false);
                        }}
                        className={`flex flex-col items-center justify-center rounded-lg p-2 text-center transition-colors ${
                          parallelMode === "side-by-side"
                            ? "bg-white/10 text-white ring-1 ring-white/20"
                            : "border border-white/10 text-neutral-400 hover:bg-white/[0.04]"
                        }`}
                      >
                        <span className="text-xs font-medium">Side by Side</span>
                        <span className="text-[10px] text-neutral-500 mt-0.5">Same task</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Variants / Let it cook: ⊞ 1x */}
              <div className="relative">
                <button
                  ref={cookButtonRef}
                  type="button"
                  onClick={() => setCookOpen((o) => !o)}
                  aria-label={t("welcome.prompt.candidates") || "Variants"}
                  title="Let it cook / Variants"
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-mono transition-colors cursor-pointer ${
                    candidates > 1
                      ? "bg-[#E5B2FF]/15 text-[#eed0ff] font-semibold ring-1 ring-[#E5B2FF]/30"
                      : "text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200"
                  }`}
                >
                  <LayoutGrid size={13} />
                  <span>{candidates}x</span>
                </button>
                {cookOpen && (
                  <div
                    ref={cookMenuRef}
                    className="absolute bottom-full right-0 z-50 mb-2 w-64 rounded-xl border border-white/10 bg-[#1a1a1a] p-3 shadow-panel"
                  >
                    <div className="text-xs font-semibold text-neutral-200 mb-0.5">Let it cook</div>
                    <p className="text-[11px] text-neutral-400 mb-2.5">
                      Iterate on designs automatically to generate multiple variations.
                    </p>
                    <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-500 mb-1.5">
                      Variants
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 mb-2.5">
                      {[1, 2, 3, 4].map((count) => (
                        <button
                          key={count}
                          type="button"
                          onClick={() => {
                            onSelectCandidates?.(count);
                            setCookOpen(false);
                          }}
                          className={`flex items-center justify-center rounded-lg py-1.5 text-xs font-mono transition-colors ${
                            candidates === count
                              ? "bg-[#E5B2FF]/20 text-[#eed0ff] font-semibold ring-1 ring-[#E5B2FF]/40"
                              : "border border-white/10 text-neutral-400 hover:bg-white/[0.06] hover:text-white"
                          }`}
                        >
                          {count}x
                        </button>
                      ))}
                    </div>
                    <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-500 mb-1.5">
                      Iteration mode
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setIterateMode("style");
                          if (candidates === 1) onSelectCandidates?.(2);
                          setCookOpen(false);
                        }}
                        className={`flex flex-col items-center justify-center rounded-lg p-2 text-center transition-colors ${
                          iterateMode === "style" && candidates > 1
                            ? "bg-white/10 text-white ring-1 ring-white/20"
                            : "border border-white/10 text-neutral-400 hover:bg-white/[0.04]"
                        }`}
                      >
                        <span className="text-xs font-medium">Style</span>
                        <span className="text-[10px] text-neutral-500 mt-0.5">Visual exploration</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIterateMode("layout");
                          if (candidates === 1) onSelectCandidates?.(2);
                          setCookOpen(false);
                        }}
                        className={`flex flex-col items-center justify-center rounded-lg p-2 text-center transition-colors ${
                          iterateMode === "layout" && candidates > 1
                            ? "bg-white/10 text-white ring-1 ring-white/20"
                            : "border border-white/10 text-neutral-400 hover:bg-white/[0.04]"
                        }`}
                      >
                        <span className="text-xs font-medium">Layout</span>
                        <span className="text-[10px] text-neutral-500 mt-0.5">Layout exploration</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Model Selector: Claude Opus 5 ⌵ */}
              <div className="relative">
                <button
                  ref={modelButtonRef}
                  type="button"
                  onClick={() => (configNeeded ? onOpenSettings?.() : setModelMenuOpen((o) => !o))}
                  aria-label={t("welcome.prompt.modelLabel") || "Model"}
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
                  <span className="max-w-[150px] truncate">{cleanModelName}</span>
                  <ChevronDown size={11} className="shrink-0 text-neutral-400" />
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
                          const modelParts = getModelDisplayParts(model.id, modelGroups ?? []);
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
                              <span className="truncate">{modelParts.modelName || model.label}</span>
                              {isSelected && <span className="size-1.5 rounded-full bg-[#a7ffd4]" />}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 4. Submit button: ↑ */}
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

      {/* Style Selection Modal */}
      {styleModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-[#171717] p-5 shadow-panel">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <h3 className="text-[15px] font-semibold text-neutral-100">{t("welcome.prompt.styleLabel") || "Choose a style"}</h3>
              <button
                type="button"
                onClick={() => setStyleModalOpen(false)}
                className="rounded-lg p-1 text-neutral-400 hover:text-white hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </div>
            <div className="grid max-h-[60vh] grid-cols-2 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => {
                  onSelectStyle?.(DEFAULT_STYLE_ID);
                  setStyleModalOpen(false);
                }}
                className={`flex flex-col items-center justify-center rounded-xl border border-dashed p-4 text-center transition-colors ${
                  !styleId || styleId === DEFAULT_STYLE_ID
                    ? "border-[#a7ffd4]/60 bg-[#a7ffd4]/5 text-white"
                    : "border-white/10 text-neutral-400 hover:bg-white/[0.04]"
                }`}
              >
                <span className="text-xs font-medium">{t("welcome.prompt.styleAuto")}</span>
                <span className="mt-1 text-[10px] text-neutral-500">Let the prompt decide</span>
              </button>
              {(styleOptions ?? []).map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => {
                    onSelectStyle?.(style.id);
                    setStyleModalOpen(false);
                  }}
                  className={`flex flex-col rounded-xl border p-2.5 text-left transition-colors ${
                    styleId === style.id
                      ? "border-[#a7ffd4]/60 bg-white/10 text-white ring-1 ring-[#a7ffd4]/30"
                      : "border-white/10 bg-white/[0.03] text-neutral-300 hover:border-white/20 hover:bg-white/[0.06]"
                  }`}
                >
                  {style.swatch && (
                    <div className="flex gap-1 mb-2">
                      {style.swatch.map((c, i) => (
                        <span key={i} className="size-3 rounded-full" style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  )}
                  <span className="text-xs font-medium truncate">{style.name}</span>
                  {style.mood && <span className="text-[10px] text-neutral-500 line-clamp-1 mt-0.5">{style.mood}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Design System Modal */}
      {systemModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#171717] p-5 shadow-panel">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <h3 className="text-[15px] font-semibold text-neutral-100">{t("welcome.prompt.designSystem") || "Design system"}</h3>
              <button
                type="button"
                onClick={() => setSystemModalOpen(false)}
                className="rounded-lg p-1 text-neutral-400 hover:text-white hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto">
              {(designSystemOptions ?? []).map((system) => (
                <button
                  key={system.id}
                  type="button"
                  onClick={() => {
                    onSelectDesignSystem?.(system.id);
                    setSystemModalOpen(false);
                  }}
                  className={`flex flex-col rounded-xl border p-3 text-left transition-colors ${
                    designSystemId === system.id
                      ? "border-[#a7ffd4]/60 bg-white/10 text-white ring-1 ring-[#a7ffd4]/30"
                      : "border-white/10 bg-white/[0.03] text-neutral-300 hover:border-white/20 hover:bg-white/[0.06]"
                  }`}
                >
                  <span className="text-xs font-semibold">{system.label}</span>
                  {system.description && (
                    <span className="text-[11px] text-neutral-400 mt-1">{system.description}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Canvas Size Modal */}
      {sizeModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#171717] p-5 shadow-panel">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <h3 className="text-[15px] font-semibold text-neutral-100">{t("welcome.prompt.sizeLabel") || "Canvas size"}</h3>
              <button
                type="button"
                onClick={() => setSizeModalOpen(false)}
                className="rounded-lg p-1 text-neutral-400 hover:text-white hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(sizeOptions ?? []).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    onSelectSize?.({ width: option.width, height: option.height });
                    setSizeModalOpen(false);
                  }}
                  className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition-colors ${
                    currentSize.width === option.width && currentSize.height === option.height
                      ? "border-[#a7ffd4]/60 bg-white/10 text-white ring-1 ring-[#a7ffd4]/30"
                      : "border-white/10 bg-white/[0.03] text-neutral-300 hover:border-white/20 hover:bg-white/[0.06]"
                  }`}
                >
                  <span className="font-mono text-xs">{option.width} × {option.height}</span>
                  {option.label && <span className="text-[10px] text-neutral-500 mt-0.5">{option.label}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
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
