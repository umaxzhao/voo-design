import PropTypes from "prop-types";
import { AI_GEN_TYPES } from "./welcome_constants.js";

// Each design type is a 56x40 line drawing of its format: wide browser,
// tall phone, portrait poster, stacked 16:9 slides, three storyboard frames.
// Lines follow the button text color; the single mint accent brightens when
// the type is hovered or selected.
const LINE = {
  stroke: "currentColor", strokeWidth: 1.5, fill: "none",
  strokeLinecap: "round", strokeLinejoin: "round",
};
const ACCENT = "welcome-type-accent fill-accent-mint opacity-60 transition-opacity group-hover:opacity-100 group-aria-checked:opacity-100";
const ACCENT_LINE = "welcome-type-accent-line stroke-accent-mint opacity-60 transition-opacity group-hover:opacity-100 group-aria-checked:opacity-100";
const ink = (opacity) => ({ fill: "currentColor", fillOpacity: opacity });

const TYPE_ICONS = {
  landing: (
    <>
      <rect x="4" y="5" width="48" height="30" rx="4" {...LINE} />
      <path d="M4 11.5H52" {...LINE} strokeOpacity={0.5} />
      <circle cx="8.5" cy="8.3" r="1" {...ink(0.55)} />
      <circle cx="11.8" cy="8.3" r="1" {...ink(0.55)} />
      <rect x="16" y="15.5" width="24" height="3" rx="1.5" {...ink(0.9)} />
      <rect x="19.5" y="20.5" width="17" height="2" rx="1" {...ink(0.4)} />
      <rect x="22" y="25" width="12" height="5" rx="2.5" className={ACCENT} />
    </>
  ),
  mobile: (
    <>
      <rect x="18" y="3" width="20" height="34" rx="5" {...LINE} />
      <rect x="24.5" y="5.8" width="7" height="1.6" rx="0.8" {...ink(0.55)} />
      <rect x="21.5" y="10.5" width="13" height="9" rx="2" className={ACCENT} />
      <rect x="21.5" y="22.5" width="13" height="2" rx="1" {...ink(0.5)} />
      <rect x="21.5" y="26.5" width="9" height="2" rx="1" {...ink(0.35)} />
      <circle cx="24" cy="32.5" r="1" {...ink(0.5)} />
      <circle cx="28" cy="32.5" r="1" {...ink(0.9)} />
      <circle cx="32" cy="32.5" r="1" {...ink(0.5)} />
    </>
  ),
  web: (
    <>
      <rect x="4" y="5" width="48" height="30" rx="4" {...LINE} />
      <path d="M15.5 5V35" {...LINE} strokeOpacity={0.5} />
      <rect x="7.5" y="10" width="5" height="2.4" rx="1.2" className={ACCENT} />
      <rect x="7.5" y="15" width="5" height="2" rx="1" {...ink(0.45)} />
      <rect x="7.5" y="19.5" width="5" height="2" rx="1" {...ink(0.45)} />
      <rect x="19.5" y="10" width="14" height="2.6" rx="1.3" {...ink(0.9)} />
      <rect x="19.5" y="16" width="28.5" height="3.5" rx="1.5" {...ink(0.2)} />
      <rect x="19.5" y="21.5" width="28.5" height="3.5" rx="1.5" {...ink(0.2)} />
      <rect x="19.5" y="27" width="28.5" height="3.5" rx="1.5" {...ink(0.2)} />
    </>
  ),
  poster: (
    <>
      <rect x="16" y="3" width="24" height="34" rx="3" {...LINE} />
      <circle cx="28" cy="14.5" r="6" className={ACCENT} />
      <rect x="20" y="25" width="16" height="3" rx="1.2" {...ink(0.9)} />
      <rect x="22.5" y="30.5" width="11" height="1.8" rx="0.9" {...ink(0.4)} />
    </>
  ),
  slides: (
    <>
      <path d="M9 9V7a3 3 0 0 1 3-3h36a3 3 0 0 1 3 3v20a3 3 0 0 1-3 3h-1" {...LINE} strokeOpacity={0.4} />
      <rect x="5" y="9" width="42" height="26" rx="3" {...LINE} />
      <rect x="9" y="13.5" width="14" height="2.6" rx="1.3" {...ink(0.9)} />
      <rect x="9" y="19.5" width="13" height="1.8" rx="0.9" {...ink(0.4)} />
      <rect x="9" y="23.5" width="10" height="1.8" rx="0.9" {...ink(0.4)} />
      <rect x="30" y="24" width="3.5" height="7" rx="1" className={ACCENT} fillOpacity={0.55} />
      <rect x="35" y="20" width="3.5" height="11" rx="1" className={ACCENT} fillOpacity={0.8} />
      <rect x="40" y="15.5" width="3.5" height="15.5" rx="1" className={ACCENT} />
    </>
  ),
  storyboard: (
    <>
      <rect x="3" y="7" width="15" height="11" rx="2" {...LINE} />
      <rect x="20.5" y="7" width="15" height="11" rx="2" {...LINE} />
      <rect x="38" y="7" width="15" height="11" rx="2" {...LINE} />
      <circle cx="8.5" cy="12.5" r="2" {...ink(0.5)} />
      <circle cx="28" cy="12.5" r="2.6" className={ACCENT} />
      <rect x="41.5" y="11.5" width="8" height="2.4" rx="1.2" {...ink(0.5)} />
      <rect x="3" y="21.5" width="10" height="1.8" rx="0.9" {...ink(0.35)} />
      <rect x="20.5" y="21.5" width="10" height="1.8" rx="0.9" {...ink(0.35)} />
      <rect x="38" y="21.5" width="10" height="1.8" rx="0.9" {...ink(0.35)} />
      <path d="M3 30.5H53" {...LINE} strokeOpacity={0.35} />
      <circle cx="28" cy="30.5" r="2.2" className={ACCENT} />
    </>
  ),
  dashboard: (
    <>
      <rect x="4" y="5" width="48" height="30" rx="4" {...LINE} />
      <rect x="8" y="9" width="11" height="7" rx="1.5" {...ink(0.14)} />
      <rect x="22.5" y="9" width="11" height="7" rx="1.5" {...ink(0.14)} />
      <rect x="37" y="9" width="11" height="7" rx="1.5" {...ink(0.14)} />
      <rect x="10" y="11.5" width="6" height="2" rx="1" {...ink(0.75)} />
      <rect x="24.5" y="11.5" width="5" height="2" rx="1" {...ink(0.75)} />
      <rect x="39" y="11.5" width="6.5" height="2" rx="1" {...ink(0.75)} />
      <path d="M8 31V29l6.5-4.5 6 2.5 7-6 6.5 3.5 6.5-6.5 7.5 3V31Z" className={ACCENT} fillOpacity={0.2} />
      <path
        d="M8 29l6.5-4.5 6 2.5 7-6 6.5 3.5 6.5-6.5 7.5 3"
        className={ACCENT_LINE}
        strokeWidth="1.75" fill="none" strokeLinecap="round" strokeLinejoin="round"
      />
    </>
  ),
  other: (
    <>
      <rect x="6" y="5" width="44" height="30" rx="5" {...LINE} strokeDasharray="3 3" strokeOpacity={0.6} />
      <path d="M28 11.5c.9 5.3 2.7 7.6 8 8.5-5.3.9-7.1 3.2-8 8.5-.9-5.3-2.7-7.6-8-8.5 5.3-.9 7.1-3.2 8-8.5Z" className={ACCENT} />
      <path d="M39.5 10c.35 2 1 2.65 3 3-2 .35-2.65 1-3 3-.35-2-1-2.65-3-3 2-.35 2.65-1 3-3Z" {...ink(0.6)} />
    </>
  ),
};

function TypePreview({ type }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 56 40" width="48" height="34" className="shrink-0">
      {TYPE_ICONS[type] ?? TYPE_ICONS.other}
    </svg>
  );
}

TypePreview.propTypes = { type: PropTypes.string.isRequired };

export default function WelcomePromptTypes({ t, activePill, onSelectPill }) {
  return (
    <>
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
    </>
  );
}
WelcomePromptTypes.propTypes = {
  t: PropTypes.func.isRequired,
  activePill: PropTypes.string,
  onSelectPill: PropTypes.func,
};
