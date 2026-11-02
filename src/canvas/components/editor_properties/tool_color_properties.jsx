/** Color picker wheel and foreground/background dual-swatch selector. */

import PropTypes from "prop-types";
import { useState, useEffect } from "react";
import { useI18n } from "../../use_i18n.js";
import { StaticSection } from "./property_section.jsx";
import ColorWheel from "../../color_picker/ColorWheel.jsx";
import { IconSwap, IconPipette } from "../../icons.jsx";

export default function ToolColorProperties({
  color = "#ffffff",
  onColor,
  onPickColor,
  backgroundColor = "#000000",
  onBackgroundColor,
  swapColorsRef = null,
}) {
  const { t } = useI18n();
  const [activeSlot, setActiveSlot] = useState("fg");

  const fgColor = color;
  const bgColor = backgroundColor;
  const activeColor = activeSlot === "fg" ? fgColor : bgColor;

  const handleColorChange = (nextHex) => {
    if (activeSlot === "fg") onColor?.(nextHex);
    else onBackgroundColor?.(nextHex);
  };

  const handleSwapColors = () => {
    onColor?.(bgColor);
    onBackgroundColor?.(fgColor);
  };

  // Keep the ref (used by the global X-key shortcut) pointed at the latest swap closure.
  useEffect(() => {
    if (swapColorsRef) swapColorsRef.current = handleSwapColors;
  });

  return (
    <StaticSection title={t("editor.toolOptions.colorSection")}>
      <div className="flex flex-col items-center gap-2">
        {/* 1. Compact Color Wheel (150px) at the top */}
        <ColorWheel
          color={activeColor}
          onChange={handleColorChange}
          size={150}
        />

        {/* 2. Dual Swatch (Foreground / Background overlapping block) underneath */}
        <div className="flex w-full items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <div className="relative h-7 w-7 select-none">
              {/* Background Color Swatch (Bottom-Right) */}
              <button
                type="button"
                onClick={() => setActiveSlot("bg")}
                aria-label={t("editor.toolOptions.backgroundColor")}
                title={t("editor.toolOptions.backgroundColor")}
                className={`absolute bottom-0 right-0 h-4.5 w-4.5 rounded-full before:absolute before:-inset-1 before:content-[''] transition-transform hover:scale-105 ${
                  activeSlot === "bg"
                    ? "ring-2 ring-white ring-offset-1 ring-offset-[#141414] z-10 scale-105"
                    : "ring-1 ring-white/30 z-0"
                }`}
                style={{
                  width: "18px",
                  height: "18px",
                  backgroundColor: bgColor,
                }}
              />
              {/* Foreground Color Swatch (Top-Left) */}
              <button
                type="button"
                onClick={() => setActiveSlot("fg")}
                aria-label={t("editor.toolOptions.foregroundColor")}
                title={t("editor.toolOptions.foregroundColor")}
                className={`absolute top-0 left-0 h-4.5 w-4.5 rounded-full before:absolute before:-inset-1 before:content-[''] transition-transform hover:scale-105 ${
                  activeSlot === "fg"
                    ? "ring-2 ring-white ring-offset-1 ring-offset-[#141414] z-10 scale-105"
                    : "ring-1 ring-white/30 z-0"
                }`}
                style={{
                  width: "18px",
                  height: "18px",
                  backgroundColor: fgColor,
                }}
              />
            </div>

            {/* Swap button (X) */}
            <button
              type="button"
              onClick={handleSwapColors}
              title={t("editor.toolOptions.switchColors")}
              aria-label={t("editor.toolOptions.switchColors")}
              className="rounded-full p-1.5 text-neutral-400 hover:bg-[#262626] hover:text-white transition-colors"
            >
              <IconSwap size={12} />
            </button>
          </div>

          {/* Active Hex Code + Pipette */}
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1 rounded-xl bg-[#222222] px-2.5 py-1 text-[11px] font-mono tabular-nums text-neutral-200 uppercase">
              <span className="text-neutral-400">#</span>
              <span>{activeColor.replace("#", "")}</span>
            </div>
            {onPickColor && (
              <button
                type="button"
                onClick={onPickColor}
                title={`${t("editor.tool.dropper")} (I)`}
                aria-label={t("editor.tool.dropper")}
                className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#222222] text-neutral-400 hover:bg-[#2a2a2a] hover:text-white transition-colors"
              >
                <IconPipette size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </StaticSection>
  );
}

ToolColorProperties.propTypes = {
  color: PropTypes.string,
  onColor: PropTypes.func,
  onPickColor: PropTypes.func,
  backgroundColor: PropTypes.string,
  onBackgroundColor: PropTypes.func,
  swapColorsRef: PropTypes.shape({ current: PropTypes.func }),
};
