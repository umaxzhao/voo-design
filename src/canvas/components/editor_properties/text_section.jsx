import PropTypes from "prop-types";
import ScrubField from "../scrub_field.jsx";
import MixedField from "./mixed_field.jsx";
import { commonValue, MIXED } from "../../editor/selection_values.js";
import { EditorField } from "../editor_controls.jsx";
import { CollapsibleSection } from "./property_section.jsx";
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
  DEFAULT_TEXT_STYLE,
  TEXT_ALIGNS,
  TEXT_FONT_WEIGHTS,
  TEXT_LETTER_SPACING_BOUNDS,
  TEXT_LINE_HEIGHT_BOUNDS,
} from "../../editor/scene_model_core.js";

/**
 * Weight select options: numeric weights for variable faces plus the CSS
 * keyword states legacy documents use.
 */
const WEIGHT_OPTIONS = TEXT_FONT_WEIGHTS.map((value) => ({
  value,
  labelKey: `editor.props.weight.${value}`,
}));
import { useI18n } from "../../use_i18n.js";

const ALIGN_ICONS = {
  left: IconAlignLeft,
  center: IconAlignCenter,
  right: IconAlignRight,
};

/** A pressed/unpressed style button for the weight/italic/align rows. */
function ToggleButton({ active, onClick, label, children = null }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`flex h-7 flex-1 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 ${
        active
          ? "bg-white/20 text-neutral-100"
          : "bg-neutral-800 text-neutral-500 hover:text-neutral-300"
      }`}
    >
      {children}
    </button>
  );
}

ToggleButton.propTypes = {
  active: PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
  children: PropTypes.node,
};
import { CustomFontPicker } from "../font_picker.jsx";

/** Typeface, size, weight, alignment, fill and stroke options for text nodes. */
export default function TextSection({
  object,
  edit,
  editAndCommit,
  commitNow = undefined,
  selectedNodes = [],
}) {
  const { t } = useI18n();
  const fontWeight = object.fontWeight ?? DEFAULT_TEXT_STYLE.fontWeight;
  const italic = object.italic ?? DEFAULT_TEXT_STYLE.italic;
  const align = object.align ?? DEFAULT_TEXT_STYLE.align;
  const letterSpacing =
    object.letterSpacing ?? DEFAULT_TEXT_STYLE.letterSpacing;
  const lineHeight = object.lineHeight ?? DEFAULT_TEXT_STYLE.lineHeight;

  // Multi-selection display (plan 1.9): a field whose value differs across
  // the selected text layers shows a dash instead of a misleading number.
  const mixed = (key) =>
    selectedNodes.length > 1 && commonValue(selectedNodes, key) === MIXED;
  const mixedFontSize = mixed("fontSize");
  const mixedLineHeight = mixed("lineHeight");
  const mixedLetterSpacing = mixed("letterSpacing");
  const mixedBaselineShift = mixed("baselineShift");

  return (
    <CollapsibleSection
      title={t("editor.props.textStyle")}
      defaultOpen
      storageKey={`textStyle.${object.kind}`}
    >
      {/* Typography Block */}
      <div className="flex flex-col gap-2">
        <EditorField label={t("editor.props.font")} compact>
          <CustomFontPicker
            value={object.fontFamily ?? DEFAULT_FONT_FAMILY}
            onChange={(nextFont) => editAndCommit({ fontFamily: nextFont })}
          />
        </EditorField>

        <div className="grid grid-cols-2 gap-2">
          {mixedFontSize ? (
            <MixedField label={t("editor.props.fontSize")} suffix="px" />
          ) : (
            <ScrubField
              prefix={
                <svg
                  className="w-3.5 h-3.5 text-neutral-400"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M2.5 4v3h5v12h3V7h5V4h-13zm19 5h-9v3h3v7h3v-7h3V9z" />
                </svg>
              }
              min={8}
              max={288}
              value={object.fontSize ?? DEFAULT_FONT_SIZE}
              onValueChange={(value) => edit({ fontSize: value })}
              onCommit={commitNow}
              ariaLabel={t("editor.props.fontSize")}
              scrubHint={t("editor.props.dragToAdjust")}
            />
          )}
          <div className="flex gap-1">
            <select
              aria-label={t("editor.props.fontWeight")}
              value={WEIGHT_OPTIONS.some((w) => w.value === fontWeight) ? fontWeight : "normal"}
              onChange={(event) => editAndCommit({ fontWeight: event.target.value })}
              className="h-7 min-w-0 flex-1 rounded-lg bg-neutral-800 px-1 text-[11px] text-neutral-200 outline-none"
              onClick={(event) => event.stopPropagation()}
            >
              {WEIGHT_OPTIONS.map(({ value, labelKey }) => (
                <option key={value} value={value}>
                  {t(labelKey)}
                </option>
              ))}
            </select>
            <ToggleButton
              active={italic}
              onClick={() => editAndCommit({ italic: !italic })}
              label={t("editor.props.italic")}
            >
              <IconItalic size={13} />
            </ToggleButton>
            <ToggleButton
              active={Boolean(object.underline)}
              onClick={() => editAndCommit({ underline: !object.underline })}
              label={t("editor.props.underline")}
            >
              <IconUnderline size={13} />
            </ToggleButton>
          </div>
        </div>

        {/* Box: Figma-style auto width against a fixed wrap column.
            Point text reflows to its glyphs; a box keeps its width. */}
        <div className="flex gap-1 rounded-xl bg-neutral-900 p-1">
          {[
            { boxWidth: 0, label: t("editor.props.autoWidth") },
            {
              boxWidth: Math.max(1, Math.round(object.width || 100)),
              label: t("editor.props.fixedWidth"),
            },
          ].map((option) => (
            <ToggleButton
              key={option.label}
              active={
                option.boxWidth === 0
                  ? !(object.boxWidth > 0)
                  : object.boxWidth > 0
              }
              onClick={() => editAndCommit({ boxWidth: option.boxWidth })}
              label={option.label}
            >
              <span className="text-[11px] leading-none">
                {option.label}
              </span>
            </ToggleButton>
          ))}
        </div>

        {/* Direction: horizontal / vertical */}
        <div className="flex gap-1 rounded-xl bg-neutral-900 p-1">
          {["horizontal", "vertical"].map((direction) => (
            <ToggleButton
              key={direction}
              active={(object.direction ?? "horizontal") === direction}
              onClick={() => editAndCommit({ direction })}
              label={t(`editor.props.direction.${direction}`)}
            >
              <span className="text-[11px] leading-none">
                {direction === "vertical" ? "V" : "H"}
              </span>
            </ToggleButton>
          ))}
        </div>

        {/* Alignment */}
        <div className="flex gap-1 rounded-xl bg-neutral-900 p-1">
          {TEXT_ALIGNS.map((option) => {
            const AlignIcon = ALIGN_ICONS[option];
            return (
              <ToggleButton
                key={option}
                active={align === option}
                onClick={() => editAndCommit({ align: option })}
                label={t(`editor.props.align.${option}`)}
              >
                <AlignIcon size={13} />
              </ToggleButton>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {mixedLineHeight ? (
            <MixedField label={t("editor.props.lineHeight")} />
          ) : (
            <ScrubField
              prefix={
                <svg
                  className="w-3.5 h-3.5 text-neutral-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="21" y1="6" x2="3" y2="6" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                  <line x1="21" y1="18" x2="7" y2="18" />
                  <polyline points="3 8 3 16" />
                  <polyline points="6 10 3 8 0 10" />
                  <polyline points="6 14 3 16 0 14" />
                </svg>
              }
              min={TEXT_LINE_HEIGHT_BOUNDS.min}
              max={TEXT_LINE_HEIGHT_BOUNDS.max}
              step={0.05}
              value={lineHeight}
              onValueChange={(value) =>
                edit({ lineHeight: Number(value.toFixed(2)) })
              }
              onCommit={commitNow}
              ariaLabel={t("editor.props.lineHeight")}
              scrubHint={t("editor.props.dragToAdjust")}
            />
          )}
          {mixedLetterSpacing ? (
            <MixedField label={t("editor.props.letterSpacing")} suffix="px" />
          ) : (
            <ScrubField
              prefix={
                <svg
                  className="w-3.5 h-3.5 text-neutral-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M7 16V4M17 16V4M4 12h16" />
                  <polyline points="2 12 4 10 4 14" />
                  <polyline points="22 12 20 10 20 14" />
                </svg>
              }
              suffix="px"
              min={TEXT_LETTER_SPACING_BOUNDS.min}
              max={TEXT_LETTER_SPACING_BOUNDS.max}
              step={0.5}
              value={letterSpacing}
              onValueChange={(value) =>
                edit({ letterSpacing: Number(value.toFixed(1)) })
              }
              onCommit={commitNow}
              ariaLabel={t("editor.props.letterSpacing")}
              scrubHint={t("editor.props.dragToAdjust")}
            />
          )}
          {mixedBaselineShift ? (
            <MixedField label={t("editor.props.baselineShift")} suffix="px" />
          ) : (
            <ScrubField
              prefix={
                <svg
                  className="w-3.5 h-3.5 text-neutral-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <polyline points="7 15 10 12 13 15" />
                  <polyline points="10 9 13 12 16 9" />
                </svg>
              }
              suffix="px"
              min={-100}
              max={100}
              value={object.baselineShift ?? 0}
              onValueChange={(value) =>
                edit({ baselineShift: Math.round(value) })
              }
              onCommit={commitNow}
              ariaLabel={t("editor.props.baselineShift")}
              scrubHint={t("editor.props.dragToAdjust")}
            />
          )}
        </div>

        {object.textPath && (
          <div className="flex flex-col gap-2 rounded-xl bg-neutral-900 p-2">
            <span className="text-[11px] font-medium text-neutral-300">
              {t("editor.props.pathText")}
            </span>
            <div className="grid grid-cols-2 gap-2">
              <ScrubField
                prefix={<span className="text-[10px] text-neutral-400">Offset</span>}
                suffix="px"
                min={-500}
                max={2000}
                step={1}
                value={object.textPath.startOffset ?? 0}
                onValueChange={(val) =>
                  edit({
                    textPath: { ...object.textPath, startOffset: Math.round(val) },
                  })
                }
                onCommit={commitNow}
                ariaLabel={t("editor.props.pathTextOffset")}
                scrubHint={t("editor.props.dragToAdjust")}
              />
              <div className="flex gap-1">
                <ToggleButton
                  active={(object.textPath.side ?? "top") === "top"}
                  onClick={() =>
                    editAndCommit({
                      textPath: { ...object.textPath, side: "top" },
                    })
                  }
                  label={t("editor.props.pathTextSideTop")}
                >
                  <span className="text-[10px]">Top</span>
                </ToggleButton>
                <ToggleButton
                  active={object.textPath.side === "bottom"}
                  onClick={() =>
                    editAndCommit({
                      textPath: { ...object.textPath, side: "bottom" },
                    })
                  }
                  label={t("editor.props.pathTextSideBottom")}
                >
                  <span className="text-[10px]">Btm</span>
                </ToggleButton>
                <ToggleButton
                  active={Boolean(object.textPath.reverse)}
                  onClick={() =>
                    editAndCommit({
                      textPath: {
                        ...object.textPath,
                        reverse: !object.textPath.reverse,
                      },
                    })
                  }
                  label={t("editor.props.pathTextReverse")}
                >
                  <span className="text-[10px]">Rev</span>
                </ToggleButton>
              </div>
            </div>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}

TextSection.propTypes = {
  object: PropTypes.object.isRequired,
  edit: PropTypes.func.isRequired,
  editAndCommit: PropTypes.func.isRequired,
  /** Interaction-end commit for the continuous (debounced) fields. */
  commitNow: PropTypes.func,
  /** Selected node objects when several are picked (plan 1.9). */
  selectedNodes: PropTypes.array,
};
