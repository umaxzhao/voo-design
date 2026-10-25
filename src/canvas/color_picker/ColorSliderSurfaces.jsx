import PropTypes from "prop-types";
import { useEffect, useRef } from "react";
import { hsvToHex } from "./color_math.js";

const clamp01 = (n) => Math.max(0, Math.min(1, n));

export function ColorSliderSurfaces({
  hsv,
  setHsv,
  activeColorHex,
  activeOpacity,
  showOpacity,
  onApplyColor,
  onApplyOpacity,
  onAddRecentColor,
  onOpacityEnd,
  onEyeDropper,
  eyeDropperTitle,
}) {
  const { h, s, v } = hsv;
  const svBoxRef = useRef(null);
  const hueSliderRef = useRef(null);
  const opacitySliderRef = useRef(null);
  const hsvRef = useRef(hsv);

  useEffect(() => {
    hsvRef.current = hsv;
  }, [hsv]);

  const startDrag = (update, e, recordRecent, onEnd) => {
    update(e.clientX, e.clientY);
    const handleMouseMove = (ev) => update(ev.clientX, ev.clientY);
    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      onEnd?.();
      if (recordRecent && onAddRecentColor) {
        const cur = hsvRef.current;
        onAddRecentColor(hsvToHex(cur.h, cur.s, cur.v));
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const handleSvMouseDown = (e) => {
    const box = svBoxRef.current;
    if (!box) return;
    startDrag(
      (clientX, clientY) => {
        const rect = box.getBoundingClientRect();
        const newS = Math.round(
          clamp01((clientX - rect.left) / rect.width) * 100,
        );
        const newV = Math.round(
          (1 - clamp01((clientY - rect.top) / rect.height)) * 100,
        );
        setHsv((prev) => {
          const next = { ...prev, s: newS, v: newV };
          hsvRef.current = next;
          onApplyColor(hsvToHex(next.h, next.s, next.v));
          return next;
        });
      },
      e,
      true,
    );
  };

  const handleHueMouseDown = (e) => {
    const slider = hueSliderRef.current;
    if (!slider) return;
    startDrag(
      (clientX) => {
        const rect = slider.getBoundingClientRect();
        const newH = Math.round(
          clamp01((clientX - rect.left) / rect.width) * 360,
        );
        setHsv((prev) => {
          const next = { ...prev, h: newH };
          hsvRef.current = next;
          onApplyColor(hsvToHex(next.h, next.s, next.v));
          return next;
        });
      },
      e,
      true,
    );
  };

  const handleOpacityMouseDown = (e) => {
    const slider = opacitySliderRef.current;
    if (!slider) return;
    startDrag(
      (clientX) => {
        const rect = slider.getBoundingClientRect();
        const newOp = Math.round(
          clamp01((clientX - rect.left) / rect.width) * 100,
        );
        onApplyOpacity(newOp);
      },
      e,
      false,
      onOpacityEnd,
    );
  };

  const pureHueHex = hsvToHex(h, 100, 100);
  const handleXPercent = s;
  const handleYPercent = 100 - v;
  const hueHandlePercent = (h / 360) * 100;
  const opacityHandlePercent = Math.max(0, Math.min(100, activeOpacity));

  return (
    <div className="flex flex-col gap-2.5">
      {/* 2D SV Box */}
      <div
        ref={svBoxRef}
        onMouseDown={handleSvMouseDown}
        style={{ backgroundColor: pureHueHex }}
        className="relative h-32 w-full cursor-crosshair overflow-hidden rounded-lg select-none"
      >
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to right, #ffffff, transparent)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to top, #000000, transparent)",
          }}
        />
        <div
          style={{
            left: `${handleXPercent}%`,
            top: `${handleYPercent}%`,
            backgroundColor: activeColorHex,
          }}
          className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_2px_rgba(0,0,0,0.6)]"
        />
      </div>

      {/* Sliders row */}
      <div className="flex items-center gap-2">
        {/* Always shown; disabled with an explanatory title where the
            browser has no EyeDropper API (rather than vanishing silently). */}
        <button
          type="button"
          onClick={onEyeDropper ?? undefined}
          disabled={!onEyeDropper}
          title={eyeDropperTitle || "Pick color from screen"}
          aria-label={eyeDropperTitle || "Pick color from screen"}
          data-testid="picker-eyedropper"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10 hover:text-white focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/5 disabled:hover:text-neutral-300"
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="m2 22 1-1h3l9-9" />
            <path d="M3 21v-3l9-9" />
            <path d="m15 6 3 3" />
            <path d="m18 3 3 3-2.5 2.5-3-3L18 3z" />
          </svg>
        </button>

        <div className="flex flex-1 flex-col gap-2">
          {/* Hue slider */}
          <div
            ref={hueSliderRef}
            onMouseDown={handleHueMouseDown}
            className="relative h-3 w-full cursor-pointer rounded-full select-none"
            style={{
              background:
                "linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
            }}
          >
            <div
              style={{ left: `${hueHandlePercent}%` }}
              className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-transparent shadow-[0_0_2px_rgba(0,0,0,0.6)]"
            />
          </div>

          {/* Opacity slider */}
          {showOpacity ? (
            <div
              ref={opacitySliderRef}
              onMouseDown={handleOpacityMouseDown}
              className="relative h-3 w-full cursor-pointer rounded-full select-none overflow-hidden"
              style={{
                background:
                  "linear-gradient(45deg, #222 25%, transparent 25%), linear-gradient(-45deg, #222 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #222 75%), linear-gradient(-45deg, transparent 75%, #222 75%)",
                backgroundSize: "8px 8px",
                backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
              }}
            >
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(to right, transparent, ${activeColorHex})`,
                }}
              />
              <div
                style={{ left: `${opacityHandlePercent}%` }}
                className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-transparent shadow-[0_0_2px_rgba(0,0,0,0.6)]"
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

ColorSliderSurfaces.propTypes = {
  hsv: PropTypes.shape({
    h: PropTypes.number.isRequired,
    s: PropTypes.number.isRequired,
    v: PropTypes.number.isRequired,
  }).isRequired,
  setHsv: PropTypes.func.isRequired,
  activeColorHex: PropTypes.string.isRequired,
  activeOpacity: PropTypes.number.isRequired,
  showOpacity: PropTypes.bool.isRequired,
  onApplyColor: PropTypes.func.isRequired,
  onApplyOpacity: PropTypes.func.isRequired,
  onAddRecentColor: PropTypes.func,
  onOpacityEnd: PropTypes.func,
  onEyeDropper: PropTypes.func,
  eyeDropperTitle: PropTypes.string,
};
