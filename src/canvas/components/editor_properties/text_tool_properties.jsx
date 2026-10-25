/**
 * Text tool property controls for the dynamic right panel (Affinity Style).
 * Active when TOOL.TEXT is armed or when editing text.
 */

import PropTypes from "prop-types";
import { useI18n } from "../../use_i18n.js";
import { StaticSection, sectionRowClass } from "./property_section.jsx";
import ToolSliderField from "./tool_slider_field.jsx";
import FlatSelect from "../flat_select.jsx";
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

function fontWeightLabelKey(weight) {
  return `editor.props.weight.${weight === 400 ? "normal" : weight}`;
}

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
    <StaticSection title={t("editor.props.textStyle")}>
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-1">
          <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-neutral-400">
            {t("editor.props.fontFamily")}
          </span>
          <CustomFontPicker
            value={fontFamily}
            onChange={(family) => onFontFamily?.(family)}
          />
        </div>

        <div className="flex h-7 min-w-0 items-center gap-2">
          <span className="w-[76px] shrink-0 truncate text-[10px] font-mono uppercase tracking-wide text-neutral-500">
            {t("editor.props.fontWeight")}
          </span>
          <FlatSelect
            value={String(fontWeight) === "400" ? "normal" : String(fontWeight)}
            onChange={(value) => onFontWeight?.(value === "normal" ? 400 : Number(value))}
            label={t("editor.props.fontWeight")}
            options={TEXT_FONT_WEIGHTS.map((weight) => ({
              value: String(weight),
              label: t(fontWeightLabelKey(weight)),
            }))}
            className="min-w-0 flex-1"
            triggerClassName="!h-7 !w-full !rounded-xl !bg-neutral-800 !px-2.5 !text-[10px] !font-mono !tabular-nums !text-neutral-100 hover:!bg-neutral-800/80"
            widthClass="w-44"
          />
        </div>

        <div className="flex h-7 min-w-0 items-center gap-2">
          <span className="w-[76px] shrink-0 truncate text-[10px] font-mono uppercase tracking-wide text-neutral-500">
            {t("editor.props.alignment")}
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-1">
            {[
              {
                id: "left",
                icon: <IconAlignLeft size={13} />,
                label: t("editor.props.align.left"),
              },
              {
                id: "center",
                icon: <IconAlignCenter size={13} />,
                label: t("editor.props.align.center"),
              },
              {
                id: "right",
                icon: <IconAlignRight size={13} />,
                label: t("editor.props.align.right"),
              },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onAlign?.(item.id)}
                aria-pressed={align === item.id}
                title={item.label}
                aria-label={item.label}
                className={`${sectionRowClass} flex-1 justify-center ${
                  align === item.id
                    ? "text-white ring-1 ring-white/25"
                    : "text-neutral-400"
                }`}
              >
                {item.icon}
              </button>
            ))}
          </div>
        </div>

        <ToolSliderField
          label={t("editor.props.fontSize")}
          icon={<span className="text-[11px] leading-none">T</span>}
          min={6}
          max={288}
          step={1}
          value={Math.round(fontSize)}
          onValueChange={(val) => onFontSize?.(val)}
          suffix="px"
          ariaLabel={t("editor.props.fontSize")}
          scrubHint={t("editor.props.dragToAdjust")}
        />

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onItalic?.(!italic)}
            aria-pressed={italic}
            title={t("editor.props.italic")}
            aria-label={t("editor.props.italic")}
            className={`${sectionRowClass} justify-center ${
              italic
                ? "text-neutral-200 ring-1 ring-white/30"
                : "text-neutral-400"
            }`}
          >
            <IconItalic size={13} />
          </button>
          <button
            type="button"
            onClick={() => onUnderline?.(!underline)}
            aria-pressed={underline}
            title={t("editor.props.underline")}
            aria-label={t("editor.props.underline")}
            className={`${sectionRowClass} justify-center ${
              underline
                ? "text-neutral-200 ring-1 ring-white/30"
                : "text-neutral-400"
            }`}
          >
            <IconUnderline size={13} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1 py-0.5">
          <span className="mr-0.5 shrink-0 text-[9px] font-mono uppercase text-neutral-500">
            {t("editor.props.size")}
          </span>
          {QUICK_FONT_SIZES.map((size) => {
            const isActive = Math.round(fontSize) === size;
            return (
              <button
                key={size}
                type="button"
                onClick={() => onFontSize?.(size)}
                className={`flex h-5 min-w-[24px] items-center justify-center rounded-md px-1.5 text-[10px] font-mono transition-all ${
                  isActive
                    ? "bg-[#a7ffd4] font-semibold text-black shadow-pop"
                    : "bg-white/[0.06] text-neutral-400 hover:bg-white/[0.12] hover:text-neutral-200"
                }`}
              >
                {size}
              </button>
            );
          })}
        </div>

        <ToolSliderField
          label={t("editor.props.lineHeight")}
          icon={<span className="text-[11px] leading-none">↕</span>}
          min={50}
          max={300}
          step={5}
          value={Math.round(lineHeight * 100)}
          onValueChange={(val) => onLineHeight?.(val / 100)}
          suffix="%"
          ariaLabel={t("editor.props.lineHeight")}
          scrubHint={t("editor.props.dragToAdjust")}
        />
        <ToolSliderField
          label={t("editor.props.letterSpacing")}
          icon={<span className="text-[11px] leading-none">↔</span>}
          min={-20}
          max={100}
          step={1}
          value={Math.round(letterSpacing * 100)}
          onValueChange={(val) => onLetterSpacing?.(val / 100)}
          suffix="%"
          ariaLabel={t("editor.props.letterSpacing")}
          scrubHint={t("editor.props.dragToAdjust")}
        />
      </div>
    </StaticSection>
  );
}

TextToolProperties.propTypes = {
  fontFamily: PropTypes.string,
  onFontFamily: PropTypes.func,
  fontWeight: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
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
