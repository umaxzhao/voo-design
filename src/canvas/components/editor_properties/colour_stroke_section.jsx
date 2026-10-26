/** Stroke section controls for nodes: stroke colour, opacity, align, width, and advanced styles. */

import PropTypes from "prop-types";
import { useState } from "react";
import ScrubValueInput from "./scrub_value_input.jsx";
import { commonValue, MIXED } from "../../editor/selection_values.js";
import { NODE_KIND } from "../../editor/scene_model.js";
import { STROKE_ALIGN } from "../../editor/stroke_style.js";
import { useI18n } from "../../use_i18n.js";
import {
  IconSliders,
  IconChevronDown,
  IconMinus,
} from "../../icons.jsx";
import { Paintbrush, AlignCenterHorizontal } from "lucide-react";
import StrokeStyleSection from "./stroke_style_section.jsx";
import EditorTooltip from "../editor_tooltip.jsx";
import ScrubField from "../scrub_field.jsx";
import { Swatch, HexField, HEX_COLOUR } from "./colour_swatch.jsx";
import { opacityPatch } from "../../color_picker/opacity_patch.js";
import {
  SectionAddButton,
  StaticSection,
  sectionActionClass,
  sectionRowClass,
} from "./property_section.jsx";

export function StrokeSection({
  object,
  edit,
  editAndCommit,
  commitNow = undefined,
  selectedNodes = [],
  bindings = null,
}) {
  const { t } = useI18n();
  const stroke =
    typeof object.stroke === "string" ? object.stroke : "transparent";
  const isGradient = stroke.includes("-gradient");
  const none = !HEX_COLOUR.test(stroke) && !isGradient;
  const strokeWidth = Number.isFinite(object.strokeWidth)
    ? object.strokeWidth
    : 1;
  const strokeOpacity = Math.round((object.strokeOpacity ?? 1) * 100);
  const strokeOpacityMixed =
    selectedNodes.length > 1 &&
    commonValue(selectedNodes, "strokeOpacity") === MIXED;
  const strokeWidthMixed =
    selectedNodes.length > 1 &&
    commonValue(selectedNodes, "strokeWidth") === MIXED;
  const closed =
    object.kind !== NODE_KIND.PATH ||
    object.points?.[object.points.length - 1]?.close === true;
  const strokeAlign = closed
    ? object.strokeAlign || STROKE_ALIGN.CENTER
    : STROKE_ALIGN.CENTER;

  const [showAdvanced, setShowAdvanced] = useState(false);
  const addStroke = () =>
    editAndCommit({
      stroke: "#FFFFFF",
      strokeWidth: Math.max(1, strokeWidth || 1),
    });

  return (
    <StaticSection
      title={t("editor.props.strokeLabel")}
      storageKey="stroke"
      extra={
        <SectionAddButton label={t("editor.props.addStroke")} onClick={addStroke} />
      }
    >
      {bindings?.styleName ? (
        <div className="mb-1.5 flex items-center gap-1.5 px-0.5">
          <button type="button" onClick={bindings.onDetachStyle} className="flex max-w-full items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[9px] font-mono uppercase tracking-wide text-neutral-300 hover:bg-white/[0.12]" title={bindings.styleName}>
            <span className="truncate">{bindings.styleName}</span>
            <span aria-hidden="true">×</span>
          </button>
        </div>
      ) : null}

      {none ? null : (
        <>
          {/* Row 1: Unified Pill (Swatch + Label/Hex + Opacity + Minus) */}
          <div className={sectionRowClass}>
            <Swatch
              value={none ? null : stroke}
              onPick={(colour) => editAndCommit({ stroke: colour })}
              ariaLabel={t("editor.props.stroke")}
              opacity={strokeOpacityMixed ? null : strokeOpacity}
              onOpacityChange={
                strokeOpacityMixed
                  ? null
                  : (val) => edit(opacityPatch("strokeOpacity", val))
              }
              onOpacityCommit={commitNow}
            />
            <span className="shrink-0 text-neutral-500" aria-hidden="true">
              <Paintbrush size={11} />
            </span>
            {isGradient ? (
              <span className="min-w-0 flex-1 truncate text-[11px] font-mono text-neutral-300">
                {t("editor.props.gradientLabel")}
              </span>
            ) : (
              <HexField
                value={stroke}
                onCommit={(colour) => editAndCommit({ stroke: colour })}
                ariaLabel={t("editor.props.customColour")}
              />
            )}
            <div className="flex shrink-0 items-center gap-0.5 border-l border-white/10 pl-2">
              {strokeOpacityMixed ? (
                <span
                  className="text-[11px] font-mono text-neutral-400"
                  title={t("editor.props.mixedValues")}
                >
                  —%
                </span>
              ) : (
                <>
                  <ScrubValueInput
                    min={0}
                    max={100}
                    step={1}
                    value={strokeOpacity}
                    format={(val) => `${val}`}
                    onChange={(val) => edit(opacityPatch("strokeOpacity", val))}
                    onCommit={commitNow}
                    ariaLabel={t("editor.props.opacity")}
                    scrubHint={t("editor.props.dragToAdjust")}
                    className="!w-7 !p-0 bg-transparent text-right text-[11px] font-mono text-neutral-300 outline-none"
                  />
                  <span className="text-[10px] font-mono text-neutral-400">
                    %
                  </span>
                </>
              )}
              <button
                type="button"
                onClick={() => editAndCommit({ stroke: "transparent" })}
                title={t("editor.props.removeStroke")}
                aria-label={t("editor.props.removeStroke")}
                className={`${sectionActionClass} ml-1`}
              >
                <IconMinus size={12} />
              </button>
            </div>
          </div>

          {/* Row 2: Figma-style Stroke Position dropdown + Width input + More Settings toggle */}
          <div className="flex items-center gap-1.5">
            {/* Stroke Position (Inside / Center / Outside) */}
            <div className="relative flex h-7 flex-[1.2] min-w-0 items-center rounded-xl bg-neutral-800 transition-colors hover:bg-neutral-800/80 focus-within:bg-neutral-800 focus-within:ring-1 focus-within:ring-[#a7ffd4]/40">
              <span
                className="pointer-events-none flex shrink-0 items-center pl-2.5 text-neutral-500"
                aria-hidden="true"
              >
                <AlignCenterHorizontal size={11} />
              </span>
              <select
                value={strokeAlign}
                disabled={!closed}
                onChange={(e) => editAndCommit({ strokeAlign: e.target.value })}
                className="h-full w-full min-w-0 appearance-none rounded-xl bg-transparent py-0 pl-1.5 pr-6 text-[11px] font-mono uppercase text-neutral-200 outline-none transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label={t("editor.strokeStyle.align")}
              >
                <option
                  value={STROKE_ALIGN.INSIDE}
                  className="bg-neutral-900 text-neutral-100"
                >
                  {t("editor.strokeStyle.alignInside")}
                </option>
                <option
                  value={STROKE_ALIGN.CENTER}
                  className="bg-neutral-900 text-neutral-100"
                >
                  {t("editor.strokeStyle.alignCenter")}
                </option>
                <option
                  value={STROKE_ALIGN.OUTSIDE}
                  className="bg-neutral-900 text-neutral-100"
                >
                  {t("editor.strokeStyle.alignOutside")}
                </option>
              </select>
              <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400">
                <IconChevronDown size={12} />
              </div>
            </div>

            {/* Stroke Width ScrubField */}
            <div className="flex-1 min-w-0">
              {strokeWidthMixed ? (
                <div className="flex h-7 items-center gap-1 rounded-xl bg-neutral-800 px-2.5">
                  <span className="pl-1 text-[11px] font-mono text-neutral-400">
                    —
                  </span>
                </div>
              ) : (
                <ScrubField
                  prefix={
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="text-neutral-400"
                    >
                      <line x1="2" y1="4" x2="14" y2="4" strokeWidth="1.5" />
                      <line x1="2" y1="8" x2="14" y2="8" strokeWidth="3" />
                      <line x1="2" y1="12" x2="14" y2="12" strokeWidth="1.5" />
                    </svg>
                  }
                  min={0}
                  max={256}
                  step={1}
                  value={strokeWidth}
                  onValueChange={(val) =>
                    edit({ strokeWidth: Math.max(0, Math.min(256, val)) })
                  }
                  onCommit={commitNow}
                  ariaLabel={t("editor.props.strokeWidth")}
                  scrubHint={t("editor.props.dragToAdjust")}
                />
              )}
            </div>

            {/* More Stroke Settings Toggle */}
            <EditorTooltip title={t("editor.strokeStyle.title")} side="top">
              <button
                type="button"
                onClick={() => setShowAdvanced((open) => !open)}
                className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                  showAdvanced
                    ? "bg-white text-black font-semibold"
                    : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                }`}
                aria-label={t("editor.strokeStyle.title")}
              >
                <IconSliders size={13} />
              </button>
            </EditorTooltip>
          </div>

          {showAdvanced ? (
            <StrokeStyleSection
              object={object}
              editAndCommit={editAndCommit}
              commitNow={commitNow}
            />
          ) : null}
        </>
      )}
    </StaticSection>
  );
}

StrokeSection.propTypes = {
  object: PropTypes.object.isRequired,
  edit: PropTypes.func.isRequired,
  editAndCommit: PropTypes.func.isRequired,
  /** Interaction-end commit for the continuous (debounced) fields. */
  commitNow: PropTypes.func,
  /** Selected node objects when several are picked (plan 1.9). */
  selectedNodes: PropTypes.array,
};
