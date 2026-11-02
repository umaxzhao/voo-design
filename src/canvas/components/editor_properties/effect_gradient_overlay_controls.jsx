/** Gradient overlay effect controls. */

import PropTypes from "prop-types";
import { Swatch, HexField } from "./colour_section.jsx";

export default function EffectGradientOverlayControls({
  current,
  title,
  setEffect,
  Field,
  t,
}) {
  const stops = current.stops ?? [];
  return (
    <div className="flex flex-col gap-2">
      <div
        className="h-4 rounded-xl border border-white/10 overflow-hidden"
        style={{
          background: `linear-gradient(90deg, ${stops
            .map((s) => `${s.color} ${Math.round(s.location * 100)}%`)
            .join(", ")})`,
        }}
        aria-hidden="true"
      />
      <div className="flex flex-col gap-1.5">
        {stops.map((stop, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <Swatch
                value={stop.color || "#ffffff"}
                onPick={(color) => {
                  const next = stops.map((s, i) =>
                    i === index ? { ...s, color } : s,
                  );
                  setEffect({ stops: next });
                }}
                ariaLabel={`${t("editor.props.gmStop")} ${index + 1}`}
              />
              <HexField
                value={stop.color || "#ffffff"}
                onCommit={(color) => {
                  const next = stops.map((s, i) =>
                    i === index ? { ...s, color } : s,
                  );
                  setEffect({ stops: next });
                }}
                ariaLabel={`${t("editor.props.gmStop")} ${index + 1}`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <Field
                prefix={t("editor.props.gmLocation")}
                min={0}
                max={100}
                value={Math.round(stop.location * 100)}
                onValueChange={(value) => {
                  const next = stops.map((s, i) =>
                    i === index ? { ...s, location: value / 100 } : s,
                  );
                  setEffect({ stops: next });
                }}
                ariaLabel={`${t("editor.props.gmLocation")} ${index + 1}`}
                scrubHint={t("editor.props.dragToAdjust")}
              />
            </div>
            <button
              type="button"
              onClick={() =>
                setEffect({ stops: stops.filter((_, i) => i !== index) })
              }
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs text-neutral-500 transition-colors hover:bg-white/10 hover:text-neutral-300"
              aria-label={t("editor.props.gmRemoveStop")}
              title={t("editor.props.gmRemoveStop")}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() =>
            setEffect({
              stops: [...stops, { color: "#888888", location: 0.5 }],
            })
          }
          className="rounded-xl bg-[#222222] px-2.5 py-1.5 text-[10px] font-mono text-neutral-300 hover:bg-[#2c2c2c] hover:text-white transition-colors"
        >
          + {t("editor.props.gmAddStop")}
        </button>
        <div className="grid grid-cols-2 gap-2 min-w-0 flex-1">
          <Field
            prefix={t("editor.props.effectGradientOverlayAngle")}
            min={0}
            max={360}
            value={Math.round(current.angle)}
            onValueChange={(value) => setEffect({ angle: value })}
            ariaLabel={`${title} angle`}
            scrubHint={t("editor.props.dragToAdjust")}
          />
          <Field
            prefix={t("editor.props.opacity")}
            min={0}
            max={100}
            value={Math.round(current.opacity)}
            onValueChange={(value) => setEffect({ opacity: value })}
            ariaLabel={`${title} opacity`}
            scrubHint={t("editor.props.dragToAdjust")}
          />
        </div>
      </div>
    </div>
  );
}

EffectGradientOverlayControls.propTypes = {
  current: PropTypes.object.isRequired,
  title: PropTypes.string.isRequired,
  setEffect: PropTypes.func.isRequired,
  Field: PropTypes.elementType.isRequired,
  t: PropTypes.func.isRequired,
};
