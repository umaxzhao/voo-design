/** Stroke section controls for nodes: stroke colour, opacity, align, width, and advanced styles. */

import PropTypes from "prop-types";
import { useState } from "react";
import ScrubValueInput from "./scrub_value_input.jsx";
import { commonValue, MIXED } from "../../editor/selection_values.js";
import { NODE_KIND } from "../../editor/scene_model.js";
import { STROKE_ALIGN } from "../../editor/stroke_style.js";
import { useI18n } from "../../use_i18n.js";
import { IconSliders, IconMinus, IconEye, IconEyeOff } from "../../icons.jsx";
import StrokeAlignmentControl from "./stroke_alignment_control.jsx";
import StrokeStyleSection from "./stroke_style_section.jsx";
import EditorTooltip from "../editor_tooltip.jsx";
import ScrubField from "../scrub_field.jsx";
import PaintTypeMenu from "./paint_type_menu.jsx";
import {
  formatGradient,
  isCssGradient,
  parseGradient,
} from "../../color_picker/gradient_fill.js";
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
  const isGradient = isCssGradient(stroke);
  const parsedStrokeGradient = isGradient ? parseGradient(stroke) : null;
  const strokeType =
    parsedStrokeGradient && parsedStrokeGradient.type !== "solid"
      ? parsedStrokeGradient.type
      : "solid";
  const none = !HEX_COLOUR.test(stroke) && !isGradient;
  const setStrokeType = (nextType) => {
    if (nextType === "solid") {
      editAndCommit({
        stroke:
          parsedStrokeGradient?.stops?.[0]?.color ??
          (HEX_COLOUR.test(stroke) ? stroke : "#FFFFFF"),
      });
      return;
    }
    const stops = parsedStrokeGradient?.stops?.length
      ? parsedStrokeGradient.stops
      : [
          {
            color: HEX_COLOUR.test(stroke) ? stroke : "#FFFFFF",
            opacity: strokeOpacity,
            position: 0,
          },
          { color: "#FFFFFF", opacity: strokeOpacity, position: 100 },
        ];
    editAndCommit({
      stroke: formatGradient(
        nextType,
        parsedStrokeGradient?.angle ?? "135deg",
        stops,
        parsedStrokeGradient?.geometry,
      ),
    });
  };
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
  const strokeSides = object.strokeSides ?? {};
  const sideEnabled = (side) => strokeSides[side] !== false;
  const toggleSide = (side) =>
    editAndCommit({
      strokeSides: { ...strokeSides, [side]: !sideEnabled(side) },
    });
  const extraStrokes = Array.isArray(object.strokes) ? object.strokes : [];
  const patchExtraStroke = (index, patch) =>
    editAndCommit({
      strokes: extraStrokes.map((entry, at) =>
        at === index ? { ...entry, ...patch } : entry,
      ),
    });
  const removeExtraStroke = (index) =>
    editAndCommit({
      strokes: extraStrokes.filter((_, at) => at !== index),
    });
  const addExtraStroke = () =>
    editAndCommit({
      strokes: [
        ...extraStrokes,
        {
          stroke: "#FFFFFF",
          strokeWidth: 1,
          strokeOpacity: 1,
          strokeAlign: STROKE_ALIGN.CENTER,
          visible: true,
        },
      ],
    });
  const addStroke = () => {
    if (!none) {
      addExtraStroke();
      return;
    }
    editAndCommit({
      stroke: "#FFFFFF",
      strokeWidth: Math.max(1, strokeWidth || 1),
    });
  };

  return (
    <StaticSection
      title={t("editor.props.strokeLabel")}
      storageKey="stroke"
      extra={
        <SectionAddButton
          label={t("editor.props.addStroke")}
          onClick={addStroke}
        />
      }
    >
      {bindings?.styleName ? (
        <div className="mb-1.5 flex items-center gap-1.5 px-0.5">
          <button
            type="button"
            onClick={bindings.onDetachStyle}
            className="flex max-w-full items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[9px] font-mono uppercase tracking-wide text-neutral-300 hover:bg-white/[0.12]"
            title={bindings.styleName}
          >
            <span className="truncate">{bindings.styleName}</span>
            <span aria-hidden="true">×</span>
          </button>
        </div>
      ) : null}

      {none ? null : (
        <>
          {/* Row 1: Figma-style paint type + swatch + hex + opacity */}
          <div className={sectionRowClass}>
            <PaintTypeMenu
              value={strokeType}
              onChange={setStrokeType}
              label={t("editor.props.strokeType")}
              allowImage={false}
            />
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
                aria-label={t("editor.props.strokeVisibility")}
                aria-pressed={object.strokeHidden !== true}
                title={t("editor.props.strokeVisibility")}
                onClick={() =>
                  editAndCommit({ strokeHidden: object.strokeHidden !== true })
                }
                className={sectionActionClass}
              >
                {object.strokeHidden === true ? (
                  <IconEyeOff size={12} />
                ) : (
                  <IconEye size={12} />
                )}
              </button>
              <button
                type="button"
                onClick={() =>
                  editAndCommit({ stroke: "transparent", strokeHidden: false })
                }
                title={t("editor.props.removeStroke")}
                aria-label={t("editor.props.removeStroke")}
                className={sectionActionClass}
              >
                <IconMinus size={12} />
              </button>
            </div>
          </div>

          {/* Position, width and advanced controls share one aligned row. */}
          <div className="flex min-w-0 items-center gap-1.5">
            <StrokeAlignmentControl
              value={strokeAlign}
              disabled={!closed}
              onChange={(value) => editAndCommit({ strokeAlign: value })}
            />
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

          {extraStrokes.length ? (
            <div className="flex flex-col gap-1.5 pt-1">
              {extraStrokes.map((entry, index) => (
                <div className={sectionRowClass} key={`extra-stroke-${index}`}>
                  <Swatch
                    value={entry.stroke}
                    onPick={(colour) =>
                      patchExtraStroke(index, { stroke: colour })
                    }
                    ariaLabel={`${t("editor.props.stroke")} ${index + 2}`}
                  />
                  <HexField
                    value={entry.stroke}
                    onCommit={(colour) =>
                      patchExtraStroke(index, { stroke: colour })
                    }
                    ariaLabel={`${t("editor.props.stroke")} ${index + 2}`}
                  />
                  <ScrubField
                    prefix="W"
                    min={0}
                    max={256}
                    value={Math.round(entry.strokeWidth ?? 1)}
                    onValueChange={(value) =>
                      patchExtraStroke(index, { strokeWidth: value })
                    }
                    onCommit={commitNow}
                    ariaLabel={`${t("editor.props.strokeWidth")} ${index + 2}`}
                    scrubHint={t("editor.props.dragToAdjust")}
                  />
                  <button
                    type="button"
                    onClick={() => removeExtraStroke(index)}
                    title={t("editor.props.removeStroke")}
                    aria-label={t("editor.props.removeStroke")}
                    className={sectionActionClass}
                  >
                    <IconMinus size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {showAdvanced ? (
            <div className="flex flex-col gap-2">
              {object.kind !== NODE_KIND.PATH ? (
                <div className="flex items-center gap-1">
                  {[
                    ["top", "T", "editor.props.strokeSideTop"],
                    ["right", "R", "editor.props.strokeSideRight"],
                    ["bottom", "B", "editor.props.strokeSideBottom"],
                    ["left", "L", "editor.props.strokeSideLeft"],
                  ].map(([side, letter, labelKey]) => (
                    <button
                      key={side}
                      type="button"
                      aria-label={t(labelKey)}
                      aria-pressed={sideEnabled(side)}
                      onClick={() => toggleSide(side)}
                      className={`flex h-7 flex-1 items-center justify-center rounded-lg text-[10px] font-mono transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 ${
                        sideEnabled(side)
                          ? "bg-white/[0.12] text-white"
                          : "bg-neutral-800 text-neutral-500 hover:text-neutral-300"
                      }`}
                    >
                      {letter}
                    </button>
                  ))}
                </div>
              ) : null}
              <StrokeStyleSection
                object={object}
                editAndCommit={editAndCommit}
                commitNow={commitNow}
              />
            </div>
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
