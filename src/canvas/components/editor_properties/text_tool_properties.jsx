/**
 * Text tool property controls for the dynamic right panel (Affinity Style).
 * Active when TOOL.TEXT is armed or when editing text.
 */

import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import { StaticSection } from "./property_section.jsx";
import ScrubField from "../scrub_field.jsx";
import { CustomFontPicker } from "../font_picker.jsx";
import {
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconItalic,
  IconUnderline,
} from "../../icons.jsx";
import {
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  TEXT_FONT_WEIGHTS,
} from "../../editor/scene_model_core.js";

const QUICK_FONT_SIZES = [12, 14, 16, 20, 24, 32, 48, 64];

export default function TextToolProperties({
  fontFamily = DEFAULT_FONT_FAMILY,
  onFontFamily,
  fontWeight = 400,
  onFontWeight,
  fontSize = DEFAULT_FONT_SIZE,
  onFontSize,
  italic = false,
  onItalic,
  underline = false,
  onUnderline,
  align = "left",
  onAlign,
  lineHeight = 1.25,
  onLineHeight,
  letterSpacing = 0,
  onLetterSpacing,
}) {
  const { t } = useI18n();

  return (
    <StaticSection title={t("editor.props.textStyle") || "文字排版"}>
      <div className="flex flex-col gap-2">
        {/* 1. Font Family Picker */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-mono text-neutral-400">
            {t("editor.props.fontFamily") || "字体"}
          </span>
          <CustomFontPicker
            value={fontFamily}
            onChange={(family) => onFontFamily?.(family)}
          />
        </div>

        {/* 2. Font Weight & Quick Align */}
        <div className="grid grid-cols-2 gap-1.5">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-mono text-neutral-400">
              {t("editor.props.fontWeight") || "字重"}
            </span>
            <select
              value={fontWeight}
              onChange={(e) => onFontWeight?.(Number(e.target.value))}
              aria-label={t("editor.props.fontWeight") || "字重"}
              className="h-7 w-full rounded-lg bg-neutral-900 border border-white/10 px-2 text-[11px] font-mono text-neutral-200 focus:outline-none focus:ring-1 focus:ring-[#a7ffd4]"
            >
              {TEXT_FONT_WEIGHTS.map((weight) => (
                <option key={weight} value={weight}>
                  {weight === 300
                    ? "Light"
                    : weight === 400
                      ? "Regular"
                      : weight === 500
                        ? "Medium"
                        : weight === 600
                          ? "SemiBold"
                          : weight === 700
                            ? "Bold"
                            : weight === 800
                              ? "ExtraBold"
                              : weight === 900
                                ? "Black"
                                : weight}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-mono text-neutral-400">
              {t("editor.props.alignment") || "对齐"}
            </span>
            <div className="flex items-center gap-1 rounded-lg bg-neutral-900 border border-white/10 p-0.5 h-7">
              {[
                { id: "left", icon: <IconAlignLeft size={13} />, label: "左对齐" },
                { id: "center", icon: <IconAlignCenter size={13} />, label: "居中" },
                { id: "right", icon: <IconAlignRight size={13} />, label: "右对齐" },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onAlign?.(item.id)}
                  aria-pressed={align === item.id}
                  title={item.label}
                  className={`flex flex-1 items-center justify-center rounded-md h-full transition-colors ${
                    align === item.id
                      ? "bg-white/20 text-white font-medium"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  {item.icon}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 3. Font Size & Quick Size Pills */}
        <div className="flex flex-col gap-1.5 pt-0.5">
          <div className="grid grid-cols-2 gap-1.5">
            <ScrubField
              prefix="T"
              suffix="px"
              min={6}
              max={288}
              step={1}
              value={Math.round(fontSize)}
              onValueChange={(val) => onFontSize?.(val)}
              ariaLabel={t("editor.props.fontSize") || "字号"}
              scrubHint={t("editor.props.dragToAdjust")}
              showRange
            />
            {/* Italic & Underline Toggles */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onItalic?.(!italic)}
                aria-pressed={italic}
                title="斜体 (Italic)"
                className={`flex h-7 flex-1 items-center justify-center rounded-lg border transition-colors ${
                  italic
                    ? "bg-[#a7ffd4]/15 border-[#a7ffd4]/40 text-[#a7ffd4]"
                    : "bg-neutral-900 border-white/10 text-neutral-400 hover:text-white"
                }`}
              >
                <IconItalic size={13} />
              </button>
              <button
                type="button"
                onClick={() => onUnderline?.(!underline)}
                aria-pressed={underline}
                title="下划线 (Underline)"
                className={`flex h-7 flex-1 items-center justify-center rounded-lg border transition-colors ${
                  underline
                    ? "bg-[#a7ffd4]/15 border-[#a7ffd4]/40 text-[#a7ffd4]"
                    : "bg-neutral-900 border-white/10 text-neutral-400 hover:text-white"
                }`}
              >
                <IconUnderline size={13} />
              </button>
            </div>
          </div>

          {/* Quick Font Size Pills */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-[9px] font-mono text-neutral-500 uppercase shrink-0 mr-0.5">
              Size
            </span>
            {QUICK_FONT_SIZES.map((sz) => {
              const isActive = Math.round(fontSize) === sz;
              return (
                <button
                  key={sz}
                  type="button"
                  onClick={() => onFontSize?.(sz)}
                  className={`h-5 min-w-[24px] px-1.5 flex items-center justify-center rounded-md text-[10px] font-mono transition-all ${
                    isActive
                      ? "bg-[#a7ffd4] text-black font-semibold shadow-pop"
                      : "bg-white/[0.06] text-neutral-400 hover:bg-white/[0.12] hover:text-neutral-200"
                  }`}
                >
                  {sz}
                </button>
              );
            })}
          </div>
        </div>

        {/* 4. Line Height & Letter Spacing */}
        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
          <ScrubField
            prefix="↕"
            suffix="%"
            min={50}
            max={300}
            step={5}
            value={Math.round(lineHeight * 100)}
            onValueChange={(val) => onLineHeight?.(val / 100)}
            ariaLabel={t("editor.props.lineHeight") || "行高"}
            scrubHint={t("editor.props.dragToAdjust")}
          />
          <ScrubField
            prefix="↔"
            suffix="%"
            min={-20}
            max={100}
            step={1}
            value={Math.round(letterSpacing * 100)}
            onValueChange={(val) => onLetterSpacing?.(val / 100)}
            ariaLabel={t("editor.props.letterSpacing") || "字距"}
            scrubHint={t("editor.props.dragToAdjust")}
          />
        </div>
      </div>
    </StaticSection>
  );
}

TextToolProperties.propTypes = {
  fontFamily: PropTypes.string,
  onFontFamily: PropTypes.func,
  fontWeight: PropTypes.number,
  onFontWeight: PropTypes.func,
  fontSize: PropTypes.number,
  onFontSize: PropTypes.func,
  italic: PropTypes.bool,
  onItalic: PropTypes.func,
  underline: PropTypes.bool,
  onUnderline: PropTypes.func,
  align: PropTypes.string,
  onAlign: PropTypes.func,
  lineHeight: PropTypes.number,
  onLineHeight: PropTypes.func,
  letterSpacing: PropTypes.number,
  onLetterSpacing: PropTypes.func,
};
