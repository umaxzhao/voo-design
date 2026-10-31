/** Shared readable controls for text-tool defaults and existing text layers. */
import PropTypes from "prop-types";
import { ALargeSmall, AlignLeft, AlignCenter, AlignRight, Italic, Underline, MoveVertical, MoveHorizontal } from "lucide-react";
import { commonValue, MIXED } from "../../editor/selection_values.js";
import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE, DEFAULT_TEXT_STYLE, TEXT_ALIGNS, TEXT_LINE_HEIGHT_BOUNDS, TEXT_LETTER_SPACING_BOUNDS } from "../../editor/scene_model_core.js";
import { useI18n } from "../../use_i18n.js";
import { CustomFontPicker } from "../font_picker.jsx";
import CustomSelect from "../custom_select.jsx";
import { TextField, TextMetricField, TextToggleButton, TYPE_ICON_PROPS } from "./text-typography-controls.jsx";

const WEIGHT_OPTIONS = ["100", "200", "300", "normal", "500", "600", "700", "800", "900"];
const ALIGN_ICONS = { left: AlignLeft, center: AlignCenter, right: AlignRight };
function weightOptionValue(weight) {
  const value = String(weight ?? "");
  if (value === "bold" || value === "700") return "700";
  if (value === "400" || value === "normal") return "normal";
  return WEIGHT_OPTIONS.includes(value) ? value : "normal";
}


export default function TypographyBasics({
  object,
  edit,
  editAndCommit,
  commitNow,
  selectedNodes = [],
  minFontSize = 8,
  letterSpacingBounds = TEXT_LETTER_SPACING_BOUNDS,
}) {
  const { t } = useI18n();
  const mixed = (key) => selectedNodes.length > 1 && commonValue(selectedNodes, key) === MIXED;
  const fontWeight = object.fontWeight ?? DEFAULT_TEXT_STYLE.fontWeight;
  const italic = object.italic ?? DEFAULT_TEXT_STYLE.italic;
  const align = object.align ?? DEFAULT_TEXT_STYLE.align;
  const metricProps = { onCommit: commitNow, scrubHint: t("editor.props.dragToAdjust") };
  return (
    <div className="flex flex-col gap-3">
        <TextField label={t("editor.props.font")}>
          <CustomFontPicker
            value={object.fontFamily ?? DEFAULT_FONT_FAMILY}
            onChange={(fontFamily) => editAndCommit({ fontFamily })}
          />
        </TextField>
        <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-2 max-md:grid-cols-1">
          <TextField label={t("editor.props.fontWeight")}>
            <CustomSelect
              aria-label={t("editor.props.fontWeight")}
              title={t("editor.props.fontWeight")}
              value={weightOptionValue(fontWeight)}
              onChange={(event) => editAndCommit({ fontWeight: event.target.value })}
              className="h-8 w-full min-w-0 rounded-xl bg-neutral-800 px-2 text-[11px] text-neutral-200 outline-none transition-colors max-md:h-12 hover:bg-neutral-800/80 focus:ring-1 focus:ring-[#a7ffd4]/40"
              onClick={(event) => event.stopPropagation()}
            >
              {WEIGHT_OPTIONS.map((value) => <option key={value} value={value}>{t(`editor.props.weight.${value}`)}</option>)}
            </CustomSelect>
          </TextField>
          <TextMetricField
            {...metricProps}
            label={t("editor.props.fontSize")}
            icon={ALargeSmall}
            unit="px"
            min={minFontSize}
            max={288}
            mixed={mixed("fontSize")}
            value={object.fontSize ?? DEFAULT_FONT_SIZE}
            ariaLabel={`${t("editor.props.fontSize")} — ${t("editor.props.fontSizeHint")}`}
            onChange={(value) => edit({ fontSize: value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 max-md:grid-cols-1">
          <TextMetricField
            {...metricProps}
            label={t("editor.props.lineHeight")}
            icon={MoveVertical}
            unit="%"
            step={5}
            min={Math.round(TEXT_LINE_HEIGHT_BOUNDS.min * 100)}
            max={Math.round(TEXT_LINE_HEIGHT_BOUNDS.max * 100)}
            mixed={mixed("lineHeight")}
            value={Math.round((object.lineHeight ?? DEFAULT_TEXT_STYLE.lineHeight) * 100)}
            ariaLabel={`${t("editor.props.lineHeight")} — ${t("editor.props.lineHeightHint")}`}
            onChange={(value) => edit({ lineHeight: Number((value / 100).toFixed(2)) })}
          />
          <TextMetricField
            {...metricProps}
            label={t("editor.props.letterSpacing")}
            icon={MoveHorizontal}
            unit="px"
            step={0.5}
            precision={1}
            min={letterSpacingBounds.min}
            max={letterSpacingBounds.max}
            mixed={mixed("letterSpacing")}
            value={object.letterSpacing ?? DEFAULT_TEXT_STYLE.letterSpacing}
            ariaLabel={`${t("editor.props.letterSpacing")} — ${t("editor.props.letterSpacingHint")}`}
            onChange={(value) => edit({ letterSpacing: value })}
          />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 max-md:grid-cols-1">
          <TextField label={t("editor.props.styleGroup")}>
            <div className="flex gap-1">
              <TextToggleButton
                active={italic}
                onClick={() => editAndCommit({ italic: !italic })}
                label={t("editor.props.italic")}
              ><Italic {...TYPE_ICON_PROPS} data-typography-icon="" /></TextToggleButton>
              <TextToggleButton
                active={Boolean(object.underline)}
                onClick={() => editAndCommit({ underline: !object.underline })}
                label={t("editor.props.underline")}
              ><Underline {...TYPE_ICON_PROPS} data-typography-icon="" /></TextToggleButton>
            </div>
          </TextField>
          <TextField label={t("editor.props.alignment")}>
            <div className="flex gap-1">
              {TEXT_ALIGNS.map((option) => {
                const Icon = ALIGN_ICONS[option];
                return <TextToggleButton
                  key={option}
                  active={align === option}
                  onClick={() => editAndCommit({ align: option })}
                  label={t(`editor.props.align.${option}`)}
                ><Icon {...TYPE_ICON_PROPS} data-typography-icon="" /></TextToggleButton>;
              })}
            </div>
          </TextField>
        </div>
    </div>
  );
}
TypographyBasics.propTypes = {
  object: PropTypes.object.isRequired,
  edit: PropTypes.func.isRequired,
  editAndCommit: PropTypes.func.isRequired,
  commitNow: PropTypes.func,
  selectedNodes: PropTypes.array,
  minFontSize: PropTypes.number,
  letterSpacingBounds: PropTypes.shape({ min: PropTypes.number.isRequired, max: PropTypes.number.isRequired }),
};
