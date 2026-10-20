/** Tonal range and sponge controls for Dodge, Burn, and Sponge brush retouch tools. */

import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";

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

  return (
    <>
      {isDodgeBurn ? (
        <>
          <div
            className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#181818]"
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
                  className={`flex h-7 items-center justify-center rounded-lg text-[10px] font-mono transition-all ${
                    active
                      ? "bg-white text-black font-semibold"
                      : "text-neutral-400 hover:bg-[#282828] hover:text-white"
                  }`}
                >
                  {t(`editor.brushTonalRange.${range}`)}
                </button>
              );
            })}
          </div>
          {onBrushProtectLuminosity ? (
            <label className="flex items-center gap-2 rounded-xl bg-[#222222] px-3 py-1.5 cursor-pointer hover:bg-[#2a2a2a] transition-colors">
              <input
                type="checkbox"
                checked={brushProtectLuminosity}
                onChange={(e) =>
                  onBrushProtectLuminosity(e.target.checked)
                }
                className="accent-white h-3 w-3 rounded-lg"
              />
              <span className="text-[10px] font-mono text-neutral-300">
                {t("editor.brushProtectLuminosity")}
              </span>
            </label>
          ) : null}
        </>
      ) : null}

      {isSponge && onBrushSaturating ? (
        <div
          className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#181818]"
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
                className={`flex h-7 items-center justify-center rounded-lg text-[10px] font-mono transition-all ${
                  active
                    ? "bg-white text-black font-semibold"
                    : "text-neutral-400 hover:bg-[#282828] hover:text-white"
                }`}
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
