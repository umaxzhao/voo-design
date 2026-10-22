/** Stroke section controls for nodes: stroke colour, opacity, align, width, and advanced styles. */

import PropTypes from "prop-types";
import { useState } from "react";
import ScrubValueInput from "./scrub_value_input.jsx";
import { commonValue, MIXED } from "../../editor/selection_values.js";
import { NODE_KIND } from "../../editor/scene_model.js";
import { STROKE_ALIGN } from "../../editor/stroke_style.js";
import { useI18n } from "../../use_i18n.js";
import { IconSliders, IconChevronDown, IconMinus } from "../../icons.jsx";
import StrokeStyleSection from "./stroke_style_section.jsx";
import EditorTooltip from "../editor_tooltip.jsx";
import ScrubField from "../scrub_field.jsx";
import { Swatch, HexField, HEX_COLOUR } from "./colour_swatch.jsx";

export function StrokeSection({
  object,
  edit,
  editAndCommit,
  commitNow = undefined,
  selectedNodes = [],
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

  return (
    <div className="flex flex-col gap-1.5 pt-2 pb-1 border-t border-white/10 mt-2.5">
      {/* Header */}
      <div className="flex items-center justify-between px-0.5 select-none">
        <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-neutral-400 font-medium">
          {t("editor.props.strokeLabel")}
        </span>
        {none ? (
          <button
            type="button"
            onClick={() =>
              editAndCommit({
                stroke: "#FFFFFF",
                strokeWidth: Math.max(1, strokeWidth || 1),
              })
            }
            title={t("editor.props.stroke")}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-white/[0.08] hover:text-white text-xs font-mono outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
          >
            ＋
          </button>
        ) : null}
      </div>

      {none ? (
        <button
          type="button"
          onClick={() =>
            editAndCommit({
              stroke: "#FFFFFF",
              strokeWidth: Math.max(1, strokeWidth || 1),
            })
          }
          className="flex h-7 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/10 text-[11px] font-mono text-neutral-400 hover:border-white/20 hover:text-white transition-colors cursor-pointer"
        >
          <span>＋</span>
          <span>{t("editor.props.stroke")}</span>
        </button>
      ) : (
        <>
          {/* Row 1: Unified Pill (Swatch + Label/Hex + Opacity + Minus) */}
          <div className="flex h-7 items-center rounded-lg bg-neutral-800 px-2 gap-2 hover:bg-neutral-800/80 transition-colors">
            <Swatch
              value={none ? null : stroke}
              onPick={(colour) => editAndCommit({ stroke: colour })}
              ariaLabel={t("editor.props.stroke")}
            />
            {isGradient ? (
              <span className="min-w-0 flex-1 text-[11px] font-mono text-neutral-300 truncate">
                {t("editor.props.gradientLabel")}
              </span>
            ) : (
              <HexField
                value={stroke}
                onCommit={(colour) => editAndCommit({ stroke: colour })}
                ariaLabel={t("editor.props.customColour")}
              />
            )}
            <div className="flex items-center gap-0.5 border-l border-white/10 pl-2 shrink-0">
              {strokeOpacityMixed ? (
                <span
                  className="text-[11px] font-mono text-neutral-500"
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
                    onChange={(val) =>
                      edit({
                        strokeOpacity: Math.max(0, Math.min(1, val / 100)),
                      })
                    }
                    onCommit={commitNow}
                    ariaLabel={t("editor.props.opacity")}
                    scrubHint={t("editor.props.dragToAdjust")}
                    className="!w-7 !p-0 bg-transparent text-right text-[11px] font-mono text-neutral-300 outline-none"
                  />
                  <span className="text-[10px] font-mono text-neutral-500">
                    %
                  </span>
                </>
              )}
              <button
                type="button"
                onClick={() => editAndCommit({ stroke: "transparent" })}
                title={t("node.delete")}
                className="ml-1 flex h-6 w-6 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/[0.08] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
              >
                <IconMinus size={12} />
              </button>
            </div>
          </div>

          {/* Row 2: Figma-style Stroke Position dropdown + Width input + More Settings toggle */}
          <div className="flex items-center gap-1.5 pt-0.5">
            {/* Stroke Position (Inside / Center / Outside) */}
            <div className="relative flex-[1.2] min-w-0">
              <select
                value={strokeAlign}
                disabled={!closed}
                onChange={(e) => editAndCommit({ strokeAlign: e.target.value })}
                className="h-7 w-full appearance-none rounded-xl bg-neutral-800 px-2.5 pr-6 text-[11px] font-mono text-neutral-200 outline-none hover:bg-neutral-800/80 focus:ring-1 focus:ring-[#a7ffd4]/40 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
                <div className="flex items-center rounded-lg bg-neutral-800 px-2 py-1 gap-1">
                  <span className="text-[11px] font-mono text-neutral-500 pl-1">
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
                  className="!rounded-lg"
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
    </div>
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
