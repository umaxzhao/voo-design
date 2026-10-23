/** Tonal range and sponge controls for Dodge, Burn, and Sponge brush retouch tools. */

import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import { sectionRowClass } from "./property_section.jsx";

export default function BrushRetouchControls({
  isDodgeBurn = false,
  brushTonalRange = "midtones",
  onBrushTonalRange,
  brushProtectLuminosity = false,
  onBrushProtectLuminosity,
  isSponge = false,
  brushSaturating = true,
  onBrushSaturating,
}) {
  const { t } = useI18n();

  if (!isDodgeBurn && !isSponge) return null;

  const toggleClass = (active) =>
    `${sectionRowClass} justify-center px-1 text-[10px] ${
      active ? "text-white ring-1 ring-white/25" : "text-neutral-400"
    }`;

  return (
    <>
      {isDodgeBurn ? (
        <>
          <div
            className="grid grid-cols-3 gap-1"
            role="radiogroup"
            aria-label={t("editor.brushTonalRange")}
          >
            {["shadows", "midtones", "highlights"].map((range) => {
              const active = brushTonalRange === range;
              return (
                <button
                  key={range}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onBrushTonalRange?.(range)}
                  className={toggleClass(active)}
                >
                  {t(`editor.brushTonalRange.${range}`)}
                </button>
              );
            })}
          </div>
          {onBrushProtectLuminosity ? (
            <button
              type="button"
              role="switch"
              aria-checked={brushProtectLuminosity}
              onClick={() =>
                onBrushProtectLuminosity(!brushProtectLuminosity)
              }
              className={`${sectionRowClass} justify-between text-[10px] ${
                brushProtectLuminosity
                  ? "text-white ring-1 ring-[#a7ffd4]/40"
                  : "text-neutral-400"
              }`}
            >
              <span className="truncate">
                {t("editor.brushProtectLuminosity")}
              </span>
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  brushProtectLuminosity ? "bg-[#a7ffd4]" : "bg-neutral-600"
                }`}
              />
            </button>
          ) : null}
        </>
      ) : null}

      {isSponge && onBrushSaturating ? (
        <div
          className="grid grid-cols-2 gap-1"
          role="radiogroup"
          aria-label={t("editor.sponge.direction")}
        >
          {[
            { value: true, labelKey: "editor.sponge.saturate" },
            { value: false, labelKey: "editor.sponge.desaturate" },
          ].map(({ value, labelKey }) => {
            const active = brushSaturating === value;
            return (
              <button
                key={String(value)}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onBrushSaturating(value)}
                className={toggleClass(active)}
              >
                {t(labelKey)}
              </button>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

BrushRetouchControls.propTypes = {
  isDodgeBurn: PropTypes.bool,
  brushTonalRange: PropTypes.oneOf(["shadows", "midtones", "highlights"]),
  onBrushTonalRange: PropTypes.func,
  brushProtectLuminosity: PropTypes.bool,
  onBrushProtectLuminosity: PropTypes.func,
  isSponge: PropTypes.bool,
  brushSaturating: PropTypes.bool,
  onBrushSaturating: PropTypes.func,
};
