import PropTypes from "prop-types";
import { useState } from "react";
import ScrubField from "../scrub_field.jsx";
import MixedField from "./mixed_field.jsx";
import { commonValue, MIXED } from "../../editor/selection_values.js";
import { CollapsibleSection, sectionRowClass } from "./property_section.jsx";
import FlatSelect from "../flat_select.jsx";
import {
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconChevronDown,
  IconItalic,
  IconUnderline,
} from "../../icons.jsx";
import {
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_TEXT_STYLE,
  TEXT_ALIGNS,
  TEXT_LETTER_SPACING_BOUNDS,
  TEXT_LINE_HEIGHT_BOUNDS,
} from "../../editor/scene_model_core.js";
import { loadEditorPanelSectionState, toggleEditorPanelSectionState } from "../editor_panel_preferences.js";
import { useI18n } from "../../use_i18n.js";
import { CustomFontPicker } from "../font_picker.jsx";

/**
 * Weight menu: one entry per meaningful face. `"400"` reads as Regular and
 * `"bold"` duplicates `"700"`, so they stay accepted by the model but are not
 * listed twice in the menu.
 */
const WEIGHT_OPTIONS = [
  "100",
  "200",
  "300",
  "normal",
  "500",
  "600",
  "700",
  "800",
  "900",
];

const ALIGN_ICONS = {
  left: IconAlignLeft,
  center: IconAlignCenter,
  right: IconAlignRight,
};

const microLabelClass =
  "text-[9px] font-mono uppercase tracking-[0.14em] text-neutral-400";

function weightOptionValue(weight) {
  const value = String(weight ?? "");
  if (value === "bold" || value === "700") return "700";
  if (value === "400" || value === "normal") return "normal";
  return WEIGHT_OPTIONS.includes(value) ? value : "normal";
}

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
          : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"
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

/**
 * A quiet row that keeps the rarely-used text controls one click away.
 *
 * The body stays mounted (so keyboard/assistive tech and the existing tests
 * still see it) but is `hidden` when folded, which removes its height from the
 * panel without re-creating the subtree every time the fold is toggled.
 */
function PanelDisclosure({
  storageKey,
  title,
  defaultOpen = false,
  children,
}) {
  const [open, setOpen] = useState(
    () => loadEditorPanelSectionState()[storageKey] ?? defaultOpen,
  );
  return (
    <div className="pt-0.5">
      <button
        type="button"
        onClick={() => setOpen(toggleEditorPanelSectionState(storageKey, open))}
        aria-expanded={open}
        title={title}
        className="flex h-6 w-full items-center gap-1.5 rounded-lg px-1 text-[9px] font-mono uppercase tracking-[0.14em] text-neutral-400 transition-colors hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
      >
        <IconChevronDown
          size={12}
          className={`shrink-0 transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
        />
        <span className="truncate">{title}</span>
      </button>
      <div hidden={!open} className="space-y-2 pt-1">
        {children}
      </div>
    </div>
  );
}

PanelDisclosure.propTypes = {
  storageKey: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  defaultOpen: PropTypes.bool,
  children: PropTypes.node,
};

/**
 * Typography for text nodes.
 *
 * The common ten controls stay on the first screen; width mode, writing
 * direction, case, paragraph spacing, baseline shift and path text live in the
 * folded "More text options" block. Sizes and spacing always show their unit
 * (px / %), so a number can no longer be read as the wrong kind of value.
 */
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
  const paragraphSpacing = object.paragraphSpacing ?? 0;
  const direction = object.direction ?? "horizontal";
  const fixedWidth = object.boxWidth > 0;

  // Multi-selection display (plan 1.9): a field whose value differs across the
  // selected text layers shows a dash instead of a misleading number.
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
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <span className={microLabelClass}>{t("editor.props.font")}</span>
          <CustomFontPicker
            value={object.fontFamily ?? DEFAULT_FONT_FAMILY}
            onChange={(nextFont) => editAndCommit({ fontFamily: nextFont })}
          />
        </div>

        {/* Size + weight share a row so the two "how big" choices read together. */}
        <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-1.5">
          {mixedFontSize ? (
            <MixedField
              label={t("editor.props.fontSize")}
              suffix="px"
              min={8}
              max={288}
              ariaLabel={t("editor.props.fontSize")}
              onValueChange={(value) => edit({ fontSize: value })}
              commitNow={commitNow}
            />
          ) : (
            <ScrubField
              prefix={
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M2.5 4v3h5v12h3V7h5V4h-13zm19 5h-9v3h3v7h3v-7h3V9z" />
                </svg>
              }
              suffix="px"
              min={8}
              max={288}
              value={object.fontSize ?? DEFAULT_FONT_SIZE}
              onValueChange={(value) => edit({ fontSize: value })}
              onCommit={commitNow}
              ariaLabel={`${t("editor.props.fontSize")} — ${t("editor.props.fontSizeHint")}`}
              scrubHint={t("editor.props.dragToAdjust")}
            />
          )}
          <select
            aria-label={t("editor.props.fontWeight")}
            title={t("editor.props.fontWeight")}
            value={weightOptionValue(fontWeight)}
            onChange={(event) => editAndCommit({ fontWeight: event.target.value })}
            className="h-7 w-full min-w-0 rounded-xl bg-neutral-800 px-1.5 text-[10px] text-neutral-200 outline-none transition-colors hover:bg-neutral-800/80 focus:ring-1 focus:ring-[#a7ffd4]/40"
            onClick={(event) => event.stopPropagation()}
          >
            {WEIGHT_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {t(`editor.props.weight.${value}`)}
              </option>
            ))}
          </select>
        </div>

        {/* Units are part of the value: % for line height, px for tracking. */}
        <div className="grid grid-cols-2 gap-1.5">
          {mixedLineHeight ? (
            <MixedField
              label={t("editor.props.lineHeight")}
              suffix="%"
              min={80}
              max={300}
              ariaLabel={t("editor.props.lineHeight")}
              onValueChange={(value) =>
                edit({ lineHeight: Number((value / 100).toFixed(2)) })
              }
              commitNow={commitNow}
            />
          ) : (
            <ScrubField
              prefix={
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <line x1="21" y1="6" x2="3" y2="6" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                  <line x1="21" y1="18" x2="7" y2="18" />
                  <polyline points="3 8 3 16" />
                  <polyline points="6 10 3 8 0 10" />
                  <polyline points="6 14 3 16 0 14" />
                </svg>
              }
              suffix="%"
              min={Math.round(TEXT_LINE_HEIGHT_BOUNDS.min * 100)}
              max={Math.round(TEXT_LINE_HEIGHT_BOUNDS.max * 100)}
              step={5}
              value={Math.round(lineHeight * 100)}
              onValueChange={(value) =>
                edit({ lineHeight: Number((value / 100).toFixed(2)) })
              }
              onCommit={commitNow}
              ariaLabel={`${t("editor.props.lineHeight")} — ${t("editor.props.lineHeightHint")}`}
              scrubHint={t("editor.props.dragToAdjust")}
            />
          )}
          {mixedLetterSpacing ? (
            <MixedField
              label={t("editor.props.letterSpacing")}
              suffix="px"
              min={TEXT_LETTER_SPACING_BOUNDS.min}
              max={TEXT_LETTER_SPACING_BOUNDS.max}
              precision={1}
              ariaLabel={t("editor.props.letterSpacing")}
              onValueChange={(value) => edit({ letterSpacing: value })}
              commitNow={commitNow}
            />
          ) : (
            <ScrubField
              prefix={
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M7 16V4M17 16V4M4 12h16" />
                  <polyline points="2 12 4 10 4 14" />
                  <polyline points="22 12 20 10 20 14" />
                </svg>
              }
              suffix="px"
              min={TEXT_LETTER_SPACING_BOUNDS.min}
              max={TEXT_LETTER_SPACING_BOUNDS.max}
              step={0.5}
              precision={1}
              value={letterSpacing}
              onValueChange={(value) => edit({ letterSpacing: value })}
              onCommit={commitNow}
              ariaLabel={`${t("editor.props.letterSpacing")} — ${t("editor.props.letterSpacingHint")}`}
              scrubHint={t("editor.props.dragToAdjust")}
            />
          )}
        </div>

        {/* Style toggles + horizontal alignment. */}
        <div className="flex gap-2">
          <div
            className="flex min-w-0 flex-1 gap-1"
            role="group"
            aria-label={t("editor.props.styleGroup")}
          >
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
          <div
            className="flex min-w-0 flex-[1.5] gap-1"
            role="group"
            aria-label={t("editor.props.alignment")}
          >
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
        </div>

        <PanelDisclosure
          storageKey={`textStyle.more.${object.kind}`}
          title={t("editor.props.moreTextOptions")}
          defaultOpen={Boolean(object.textPath)}
        >
          <div className="flex flex-col gap-1">
            <span className={microLabelClass}>{t("editor.props.widthMode")}</span>
            <div className="flex gap-1 rounded-xl bg-neutral-900 p-1">
              <ToggleButton
                active={!fixedWidth}
                onClick={() => editAndCommit({ boxWidth: 0 })}
                label={t("editor.props.autoWidth")}
              >
                <span className="text-[11px] leading-none">{t("editor.props.autoWidth")}</span>
              </ToggleButton>
              <ToggleButton
                active={fixedWidth}
                onClick={() =>
                  editAndCommit({
                    boxWidth: Math.max(8, Math.round(object.boxWidth || object.width || 100)),
                  })
                }
                label={t("editor.props.fixedWidth")}
              >
                <span className="text-[11px] leading-none">{t("editor.props.fixedWidth")}</span>
              </ToggleButton>
            </div>
            {fixedWidth ? (
              <ScrubField
                prefix={<span className="text-[10px] text-neutral-400">W</span>}
                suffix="px"
                min={8}
                max={8192}
                step={1}
                value={Math.round(object.boxWidth)}
                onValueChange={(value) => edit({ boxWidth: value })}
                onCommit={commitNow}
                ariaLabel={t("editor.props.boxWidth")}
                scrubHint={t("editor.props.dragToAdjust")}
              />
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <span className={microLabelClass}>{t("editor.props.textDirection")}</span>
            <div className="flex gap-1 rounded-xl bg-neutral-900 p-1">
              {["horizontal", "vertical"].map((value) => (
                <ToggleButton
                  key={value}
                  active={direction === value}
                  onClick={() => editAndCommit({ direction: value })}
                  label={t(`editor.props.direction.${value}`)}
                >
                  <span className="text-[10px] leading-none">
                    {t(`editor.props.direction.${value}`)}
                  </span>
                </ToggleButton>
              ))}
            </div>
          </div>

          <div className={sectionRowClass}>
            <span className="flex-1 text-left text-[11px] text-neutral-300">
              {t("editor.props.textCase")}
            </span>
            <FlatSelect
              value={object.textCase ?? "original"}
              onChange={(value) => editAndCommit({ textCase: value })}
              label={t("editor.props.textCase")}
              options={["original", "upper", "lower", "title"].map((value) => ({
                value,
                label: t(`editor.props.textCase.${value}`),
              }))}
              className="w-[104px] shrink-0"
              triggerClassName="!h-7 !w-full !rounded-xl !bg-neutral-800 !px-2 !text-[10px] !font-mono !uppercase !text-neutral-100 hover:!bg-neutral-800/80"
              widthClass="w-28"
            />
          </div>

          <ScrubField
            prefix={<span className="text-[10px] text-neutral-400">¶</span>}
            suffix="px"
            min={0}
            max={200}
            value={paragraphSpacing}
            onValueChange={(value) => edit({ paragraphSpacing: Math.round(value) })}
            onCommit={commitNow}
            ariaLabel={t("editor.props.paragraphSpacing")}
            scrubHint={t("editor.props.dragToAdjust")}
          />

          {mixedBaselineShift ? (
            <MixedField
              label={t("editor.props.baselineShift")}
              suffix="px"
              min={-100}
              max={100}
              ariaLabel={t("editor.props.baselineShift")}
              onValueChange={(value) => edit({ baselineShift: value })}
              commitNow={commitNow}
            />
          ) : (
            <ScrubField
              prefix={
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <polyline points="7 15 10 12 13 15" />
                  <polyline points="10 9 13 12 16 9" />
                </svg>
              }
              suffix="px"
              min={-100}
              max={100}
              value={object.baselineShift ?? 0}
              onValueChange={(value) => edit({ baselineShift: Math.round(value) })}
              onCommit={commitNow}
              ariaLabel={t("editor.props.baselineShift")}
              scrubHint={t("editor.props.dragToAdjust")}
            />
          )}

          {object.textPath ? (
            <div className="flex flex-col gap-2 rounded-xl bg-neutral-900 p-2">
              <span className="text-[11px] font-medium text-neutral-300">
                {t("editor.props.pathText")}
              </span>
              <div className="grid grid-cols-2 gap-2">
                <ScrubField
                  prefix={<span className="text-[10px] text-neutral-400">{t("editor.props.pathTextOffsetShort")}</span>}
                  suffix="px"
                  min={-500}
                  max={2000}
                  step={1}
                  value={object.textPath.startOffset ?? 0}
                  onValueChange={(value) =>
                    edit({
                      textPath: { ...object.textPath, startOffset: Math.round(value) },
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
                      editAndCommit({ textPath: { ...object.textPath, side: "top" } })
                    }
                    label={t("editor.props.pathTextSideTop")}
                  >
                    <span className="text-[10px]">{t("editor.props.pathTextOutside")}</span>
                  </ToggleButton>
                  <ToggleButton
                    active={object.textPath.side === "bottom"}
                    onClick={() =>
                      editAndCommit({ textPath: { ...object.textPath, side: "bottom" } })
                    }
                    label={t("editor.props.pathTextSideBottom")}
                  >
                    <span className="text-[10px]">{t("editor.props.pathTextInside")}</span>
                  </ToggleButton>
                  <ToggleButton
                    active={Boolean(object.textPath.reverse)}
                    onClick={() =>
                      editAndCommit({
                        textPath: { ...object.textPath, reverse: !object.textPath.reverse },
                      })
                    }
                    label={t("editor.props.pathTextReverse")}
                  >
                    <span className="text-[10px]">{t("editor.props.pathTextReverseShort")}</span>
                  </ToggleButton>
                </div>
              </div>
            </div>
          ) : null}
        </PanelDisclosure>
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
