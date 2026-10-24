import React from "react";
import { Plus } from "lucide-react";
import { AI_GEN_TYPES } from "./welcome_constants.js";

/** AI generation preset pills and central prompt composer form. */
export function WelcomePromptComposer({
  t,
  activePill,
  setActivePill,
  promptText,
  setPromptText,
  selectedModel,
  fileInputRef,
  handlePromptSubmit,
}) {
  return (
    <>
      {/* AI Generation Preset Types Row */}
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
                onClick={() => setActivePill(typeItem.id)}
                className={`group flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                  isSelected
                    ? "bg-neutral-800 text-white shadow-pop ring-1 ring-white/10"
                    : "bg-neutral-900/70 text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200"
                }`}
              >
                {Icon && (
                  <Icon
                    size={13}
                    className={`transition-colors ${
                      isSelected
                        ? "text-neutral-200"
                        : "text-neutral-500 group-hover:text-neutral-300"
                    }`}
                  />
                )}
                <span>{t(typeItem.label)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Central Prompt Box */}
      <form onSubmit={handlePromptSubmit} className="prompt-composer relative rounded-3xl p-4 transition-all">
        <div className="absolute -top-px left-1/4 right-1/4 h-px bg-white/10 pointer-events-none" />

        <textarea
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handlePromptSubmit();
            }
          }}
          placeholder={
            (() => {
              const activePreset = AI_GEN_TYPES.find((p) => p.id === activePill) || AI_GEN_TYPES[0];
              return activePreset?.placeholder
                ? t(activePreset.placeholder)
                : t("welcome.prompt.placeholder");
            })()
          }
          rows={3}
          className="w-full resize-none bg-transparent text-xs text-neutral-100 placeholder-neutral-400 focus:outline-none"
        />

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex size-7 items-center justify-center rounded-xl bg-neutral-800/60 hover:bg-neutral-700/80 text-neutral-400 hover:text-white transition-colors cursor-pointer"
              title={t("welcome.actions.addAssetsTitle")}
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-mono">
              <span>1x</span>
            </div>

            <div className="flex items-center gap-1 text-xs text-neutral-400 bg-neutral-800/70 px-2.5 py-1 rounded-lg">
              <span>{selectedModel}</span>
            </div>

            <button
              type="submit"
              className="flex size-7 items-center justify-center rounded-full bg-neutral-700 hover:bg-mint hover:text-black text-neutral-200 transition-colors cursor-pointer"
              title={t("welcome.actions.createNowTitle")}
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
