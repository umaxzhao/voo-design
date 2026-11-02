import PropTypes from "prop-types";
import { AI_GEN_TYPES } from "./welcome_constants.js";

// v3 = simplified icons plus a faint translucent body fill (56x40).
// Rule: one outline silhouette with translucent fill, at most two supporting strokes,
// and exactly one mint accent. Lines follow the dedicated icon color class (.welcome-type-icon).
const L = {
  stroke: "currentColor",
  strokeWidth: 1.75,
  fill: "currentColor",
  fillOpacity: 0.1,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const S = (opacity) => ({
  stroke: "currentColor",
  strokeOpacity: opacity,
  strokeWidth: 1.75,
  fill: "none",
  strokeLinecap: "round",
});

const ACCENT =
  "welcome-type-accent fill-accent-mint opacity-60 transition-opacity group-hover:opacity-100 group-aria-checked:opacity-100";
const ACCENT_LINE =
  "welcome-type-accent-line stroke-accent-mint opacity-60 transition-opacity group-hover:opacity-100 group-aria-checked:opacity-100";

const TYPE_ICONS = {
  landing: (
    <>
      <rect x="6" y="6" width="44" height="28" rx="5" {...L} />
      <path d="M6 13.5H50" {...S(0.45)} />
      <rect x="21" y="19.5" width="14" height="5.5" rx="2.75" className={ACCENT} />
    </>
  ),
  mobile: (
    <>
      <rect x="18.5" y="3.5" width="19" height="33" rx="5.5" {...L} />
      <rect x="22.5" y="10" width="11" height="9" rx="2.5" className={ACCENT} />
      <path d="M23 25.5H33" {...S(0.45)} />
    </>
  ),
  web: (
    <>
      <rect x="6" y="6" width="44" height="28" rx="5" {...L} />
      <path d="M19 6V34" {...S(0.45)} />
      <rect x="9.5" y="12" width="6" height="3.5" rx="1.75" className={ACCENT} />
      <path d="M24 14H43M24 21H38" {...S(0.45)} />
    </>
  ),
  poster: (
    <>
      <rect x="15.5" y="3.5" width="25" height="33" rx="4" {...L} />
      <circle cx="28" cy="16" r="5.5" className={ACCENT} />
      <path d="M21.5 28H34.5" {...S(0.45)} />
    </>
  ),
  slides: (
    <>
      <path d="M12 6H44" {...S(0.35)} />
      <rect x="7" y="10" width="42" height="26" rx="4" {...L} />
      <rect x="13" y="17" width="13" height="4.5" rx="2.25" className={ACCENT} />
      <path d="M13 27H30" {...S(0.45)} />
    </>
  ),
  storyboard: (
    <>
      <rect x="4" y="12" width="14.5" height="16" rx="3" {...L} />
      <rect x="20.75" y="12" width="14.5" height="16" rx="3" className={ACCENT} />
      <rect x="37.5" y="12" width="14.5" height="16" rx="3" {...L} />
    </>
  ),
  dashboard: (
    <>
      <rect x="6" y="6" width="44" height="28" rx="5" {...L} />
      <path
        d="M12 27l8-8 6 5 9-11 9 8"
        className={ACCENT_LINE}
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  other: (
    <>
      <rect
        x="6"
        y="6"
        width="44"
        height="28"
        rx="5"
        stroke="currentColor"
        strokeOpacity={0.6}
        strokeWidth={1.75}
        fill="currentColor"
        fillOpacity={0.1}
        strokeDasharray="3 3.5"
        strokeLinecap="round"
      />
      <path
        d="M28 11.5c.9 5.2 2.8 7.1 8 8.5-5.2 1.4-7.1 3.3-8 8.5-.9-5.2-2.8-7.1-8-8.5 5.2-1.4 7.1-3.3 8-8.5Z"
        className={ACCENT}
      />
    </>
  ),
};

function TypePreview({ type }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 56 40"
      width="48"
      height="34"
      className="welcome-type-icon shrink-0 transition-colors"
    >
      {TYPE_ICONS[type] ?? TYPE_ICONS.other}
    </svg>
  );
}

TypePreview.propTypes = { type: PropTypes.string.isRequired };

export default function WelcomePromptTypes({ t, activePill, onSelectPill }) {
  return (
    <div
      className="welcome-prompt-type-options mb-3 flex flex-wrap items-center justify-center gap-1"
      role="radiogroup"
      aria-label={t("welcome.prompt.generationTypeLabel")}
    >
      {AI_GEN_TYPES.map((typeItem) => {
        const isSelected = activePill === typeItem.id;
        return (
          <button
            key={typeItem.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelectPill?.(typeItem.id)}
            className={`group flex min-w-[4.75rem] flex-col items-center gap-1 rounded-xl px-2.5 py-2 text-[11px] font-medium transition-colors cursor-pointer select-none ${
              isSelected
                ? "bg-white/[0.09] text-white"
                : "bg-transparent text-neutral-500 hover:bg-white/[0.045] hover:text-neutral-200"
            }`}
          >
            <TypePreview type={typeItem.preview} />
            <span className="whitespace-nowrap">{t(typeItem.label)}</span>
          </button>
        );
      })}
    </div>
  );
}

WelcomePromptTypes.propTypes = {
  t: PropTypes.func.isRequired,
  activePill: PropTypes.string.isRequired,
  onSelectPill: PropTypes.func.isRequired,
};
