import PropTypes from "prop-types";
import { AI_GEN_TYPES } from "./welcome_constants.js";

export default function WelcomePromptTypes({ t, activePill, onSelectPill }) {
  return (
    <>
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
              className={`flex h-8 max-sm:h-12 items-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer select-none ${
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
    </>
  );
}
WelcomePromptTypes.propTypes = {
  t: PropTypes.func.isRequired,
  activePill: PropTypes.string,
  onSelectPill: PropTypes.func,
};
