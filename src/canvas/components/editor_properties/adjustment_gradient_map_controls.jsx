/** Gradient map adjustment controls. */

import PropTypes from "prop-types";
import ScrubField from "../scrub_field.jsx";
import { HEX_COLOUR } from "./adjustment_controls_constants.js";

export default function AdjustmentGradientMapControls({
  adjustments,
  updateCategory,
  resetCategory,
  t,
}) {
  const stops = adjustments.gradientMap.stops ?? [];
  return (
    <div className="rounded-xl bg-[#1a1a1a] p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={adjustments.gradientMap.enabled}
            aria-label={t("editor.props.gradientMap")}
            onChange={(event) =>
              updateCategory("gradientMap", {
                enabled: event.target.checked,
              })
            }
            className="flat-check"
          />
          <span className="text-[10px] font-mono text-neutral-300">
            {t("editor.props.gradientMap")}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={adjustments.gradientMap.reverse}
            aria-label={t("editor.props.gmReverse")}
            onChange={(event) =>
              updateCategory("gradientMap", {
                reverse: event.target.checked,
              })
            }
            className="flat-check"
          />
          <span className="text-[10px] text-neutral-400">
            {t("editor.props.gmReverse")}
          </span>
        </div>
        <button
          type="button"
          onClick={() => resetCategory("gradientMap")}
          className="text-[9px] font-mono text-neutral-500 hover:text-neutral-300"
        >
          {t("editor.props.reset")}
        </button>
      </div>
      {adjustments.gradientMap.enabled ? (
        <>
          <div
            className="mt-1.5 h-3 rounded-md"
            style={{
              background: `linear-gradient(90deg, ${stops
                .map((s) => `${s.color} ${Math.round(s.location * 100)}%`)
                .join(", ")})`,
            }}
            aria-hidden="true"
          />
          <div className="mt-1.5 flex flex-col gap-1">
            {stops.map((stop, index) => (
              <div key={index} className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={HEX_COLOUR.test(stop.color) ? stop.color : "#ffffff"}
                  onChange={(event) => {
                    const next = stops.map((s, i) =>
                      i === index ? { ...s, color: event.target.value } : s,
                    );
                    updateCategory("gradientMap", { stops: next });
                  }}
                  aria-label={`${t("editor.props.gmStop")} ${index + 1}`}
                  className="h-5 w-8 cursor-pointer rounded-lg border-0 bg-transparent p-0 outline-none"
                />
                <span className="w-16 font-mono text-[9px] text-neutral-500">
                  {stop.color}
                </span>
                <div className="min-w-0 flex-1">
                  <ScrubField
                    prefix={t("editor.props.gmLocation")}
                    min={0}
                    max={100}
                    value={Math.round(stop.location * 100)}
                    onValueChange={(value) => {
                      const next = stops.map((s, i) =>
                        i === index ? { ...s, location: value / 100 } : s,
                      );
                      updateCategory("gradientMap", { stops: next });
                    }}
                    ariaLabel={`${t("editor.props.gmLocation")} ${index + 1}`}
                    scrubHint={t("editor.props.dragToAdjust")}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    updateCategory("gradientMap", {
                      stops: stops.filter((_, i) => i !== index),
                    });
                  }}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-300"
                  aria-label={t("editor.props.gmRemoveStop")}
                  title={t("editor.props.gmRemoveStop")}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              updateCategory("gradientMap", {
                stops: [...stops, { color: "#888888", location: 0.5 }],
              })
            }
            className="mt-1 text-[9px] font-mono text-neutral-400 hover:text-neutral-200"
          >
            + {t("editor.props.gmAddStop")}
          </button>
        </>
      ) : null}
    </div>
  );
}

AdjustmentGradientMapControls.propTypes = {
  adjustments: PropTypes.object.isRequired,
  updateCategory: PropTypes.func.isRequired,
  resetCategory: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
};
