import PropTypes from "prop-types";
import { useState } from "react";
import { hexToRgb, rgbToHex } from "./color_math.js";

export function isValidHexColor(hex) {
  const clean = (hex || "").replace("#", "").trim();
  return (clean.length === 3 || clean.length === 6) && /^[0-9a-fA-F]+$/.test(clean);
}

export function ColorChannelInputs({
  hex,
  opacity,
  onChangeHex,
  onChangeOpacity,
}) {
  const [mode, setMode] = useState("HEX");
  const rgb = hexToRgb(hex) || { r: 255, g: 255, b: 255 };
  const rawHex = (hex || "").replace("#", "");
  const [draftHex, setDraftHex] = useState(rawHex);
  const [prevHex, setPrevHex] = useState(rawHex);

  if (rawHex !== prevHex) {
    setPrevHex(rawHex);
    setDraftHex(rawHex);
  }

  const handleHexChange = (e) => {
    const val = e.target.value.trim().replace("#", "");
    if (/^[0-9a-fA-F]{0,6}$/.test(val)) {
      setDraftHex(val);
      if (val.length === 3 || val.length === 6) {
        onChangeHex(`#${val}`);
      }
    }
  };

  const handleHexBlur = () => {
    if (draftHex.length === 3 || draftHex.length === 6) {
      onChangeHex(`#${draftHex}`);
    } else {
      setDraftHex(rawHex);
    }
  };

  const handleHexKeyDown = (e) => {
    if (e.key === "Enter") {
      e.target.blur();
    }
  };

  return (
    <div className="flex items-center gap-1.5 font-mono text-[11px]">
      {/* Mode switcher button */}
      <button
        type="button"
        onClick={() => setMode((m) => (m === "HEX" ? "RGB" : "HEX"))}
        className="rounded-lg bg-white/5 px-1.5 py-1 text-neutral-400 hover:bg-white/10 hover:text-white"
      >
        {mode}
      </button>

      {mode === "HEX" ? (
        <div className="flex flex-1 items-center rounded-lg border border-white/10 bg-black/40 px-2 py-0.5 focus-within:border-white/30">
          <span className="text-neutral-500">#</span>
          <input
            type="text"
            value={draftHex}
            onChange={handleHexChange}
            onBlur={handleHexBlur}
            onKeyDown={handleHexKeyDown}
            className="w-full bg-transparent px-1 font-mono uppercase text-white outline-none"
          />
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-3 gap-1">
          {["r", "g", "b"].map((channel) => (
            <div
              key={channel}
              className="flex items-center rounded-lg border border-white/10 bg-black/40 px-1 py-0.5"
            >
              <span className="text-[9px] uppercase text-neutral-500">
                {channel}
              </span>
              <input
                type="number"
                min={0}
                max={255}
                value={rgb[channel]}
                onChange={(e) => {
                  const num = Math.max(
                    0,
                    Math.min(255, Number(e.target.value) || 0),
                  );
                  const nextRgb = { ...rgb, [channel]: num };
                  onChangeHex(rgbToHex(nextRgb));
                }}
                className="w-full bg-transparent text-center font-mono text-white outline-none"
              />
            </div>
          ))}
        </div>
      )}

      {/* Opacity input */}
      <div className="flex w-14 items-center rounded-lg border border-white/10 bg-black/40 px-1.5 py-0.5 focus-within:border-white/30">
        <input
          type="number"
          min={0}
          max={100}
          value={Math.round(opacity)}
          onChange={(e) => {
            const num = Math.max(0, Math.min(100, Number(e.target.value) || 0));
            onChangeOpacity(num);
          }}
          className="w-full bg-transparent text-right font-mono text-white outline-none"
        />
        <span className="text-neutral-500">%</span>
      </div>
    </div>
  );
}

ColorChannelInputs.propTypes = {
  hex: PropTypes.string.isRequired,
  opacity: PropTypes.number.isRequired,
  onChangeHex: PropTypes.func.isRequired,
  onChangeOpacity: PropTypes.func.isRequired,
};
