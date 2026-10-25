/**
 * Shape and arrow tool properties: stroke weight, stroke style, and geometry options (Affinity Style).
 * Covers Rect, Ellipse, Polygon, Star, Line, Arrow.
 */

import PropTypes from "prop-types";
import { TOOL } from "../../editor/editor_constants.js";
import { useI18n } from "../../use_i18n.js";
import {
  StaticSection,
  sectionRowClass,
  sectionTitleClass,
} from "./property_section.jsx";
import ToolSliderField from "./tool_slider_field.jsx";
import { Swatch, HexField } from "./colour_swatch.jsx";

const StrokeWidthIcon = () => (
  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="3,19 21,19 21,5" />
  </svg>
);

export default function ShapeProperties({
  tool,
  strokeWidth = 1,
  onStrokeWidth,
  strokeColor = "#FFFFFF",
  onStrokeColor,
  opacity = 1,
  onOpacity,
  brushWidth,
  onBrushWidth,
  strokeStyle = "solid",
  onStrokeStyle,
  cornerRadius = 0,
  onCornerRadius,
  cornerType = "round",
  onCornerType,
  sides = 5,
  onSides,
  starRatio = 0.5,
  onStarRatio,
  arrowStart = false,
  onArrowStart,
  arrowEnd = true,
  onArrowEnd,
  arrowSize = 24,
  onArrowSize,
}) {
  const { t } = useI18n();
  const width = Math.round(brushWidth ?? strokeWidth ?? 1);
  const setWidth = onBrushWidth ?? onStrokeWidth;

  const isRect = tool === TOOL.RECT;
  const isEllipse = tool === TOOL.ELLIPSE;
  const isPolygon = tool === TOOL.POLYGON;
  const isStar = tool === TOOL.STAR;
  const isLine = tool === TOOL.LINE;
  const isArrow = tool === TOOL.ARROW;
  // Line and Arrow are stroke-only paths: hide the fill/stroke/opacity axes
  // instead of offering controls the creation path would ignore.
  const hasPaintAxes = isRect || isEllipse || isPolygon || isStar;

  const sectionTitle = isArrow
    ? t("editor.tool.arrow")
    : isLine
      ? t("editor.tool.line")
      : isRect
        ? t("editor.shape.rect")
        : isEllipse
          ? t("editor.shape.ellipse")
          : isPolygon
            ? t("editor.shape.polygon")
            : isStar
              ? t("editor.shape.star")
              : t("editor.shape.title");

  return (
    <StaticSection title={sectionTitle}>
      <div className="flex flex-col gap-2.5">
        {setWidth ? (
          <ToolSliderField
            label={t("editor.strokeStyle.weight")}
            icon={<StrokeWidthIcon />}
            min={0}
            max={100}
            value={width}
            onValueChange={(val) => setWidth(val)}
            suffix="px"
            ariaLabel={t("editor.strokeStyle.weight")}
            scrubHint={t("editor.props.dragToAdjust")}
          />
        ) : null}

        {hasPaintAxes && onStrokeColor ? (
          <div className={sectionRowClass}>
            <span className="shrink-0 text-[9px] font-mono uppercase tracking-tight text-neutral-400">
              {t("editor.props.stroke")}
            </span>
            <Swatch
              value={strokeColor}
              onPick={(colour) => onStrokeColor(colour)}
              ariaLabel={t("editor.props.stroke")}
            />
            <HexField
              value={strokeColor}
              onCommit={(colour) => onStrokeColor(colour)}
              ariaLabel={t("editor.props.stroke")}
            />
          </div>
        ) : null}

        {hasPaintAxes && onOpacity ? (
          <ToolSliderField
            label={t("editor.props.opacity")}
            min={0}
            max={100}
            value={Math.round(opacity * 100)}
            onValueChange={(value) => onOpacity(value / 100)}
            suffix="%"
            ariaLabel={t("editor.props.opacity")}
            scrubHint={t("editor.props.dragToAdjust")}
          />
        ) : null}

        {onStrokeStyle ? (
          <div className="grid grid-cols-2 gap-1.5">
            {[
              {
                id: "solid",
                label: t("editor.strokeStyle.solid"),
                icon: (
                  <line
                    x1="3"
                    y1="12"
                    x2="21"
                    y2="12"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                ),
              },
              {
                id: "dashed",
                label: t("editor.strokeStyle.dashed"),
                icon: (
                  <line
                    x1="3"
                    y1="12"
                    x2="21"
                    y2="12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeDasharray="3 3"
                  />
                ),
              },
            ].map((style) => (
              <button
                key={style.id}
                type="button"
                onClick={() => onStrokeStyle?.(style.id)}
                title={style.label}
                aria-label={style.label}
                aria-pressed={strokeStyle === style.id}
                className={`${sectionRowClass} justify-center ${
                  strokeStyle === style.id
                    ? "text-white ring-1 ring-white/25"
                    : "text-neutral-400"
                }`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  {style.icon}
                </svg>
              </button>
            ))}
          </div>
        ) : null}

        {isRect && onCornerRadius ? (
          <div className="flex flex-col gap-1.5">
            <ToolSliderField
              label={t("editor.props.cornerRadius")}
              icon={<span className="text-[11px] leading-none">⌒</span>}
              min={0}
              max={120}
              value={Math.round(cornerRadius)}
              onValueChange={(val) => onCornerRadius(val)}
              suffix="px"
              ariaLabel={t("editor.props.cornerRadius")}
              scrubHint={t("editor.props.dragToAdjust")}
            />
            {onCornerType ? (
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: "round", label: t("editor.shape.cornerRound") },
                  { id: "straight", label: t("editor.shape.cornerStraight") },
                ].map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => onCornerType?.(type.id)}
                    aria-pressed={cornerType === type.id}
                    className={`${sectionRowClass} justify-center text-[10px] ${
                      cornerType === type.id
                        ? "text-white ring-1 ring-white/25"
                        : "text-neutral-400"
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {(isPolygon || isStar) && (
          <div className="flex flex-col gap-1.5">
            {onSides ? (
              <ToolSliderField
                label={
                  isStar ? t("editor.shape.points") : t("editor.shape.sides")
                }
                icon={
                  <span className="text-[11px] leading-none">
                    {isStar ? "★" : "⬡"}
                  </span>
                }
                min={3}
                max={32}
                value={Math.round(sides)}
                onValueChange={(val) => onSides(val)}
                ariaLabel={
                  isStar ? t("editor.shape.points") : t("editor.shape.sides")
                }
                scrubHint={t("editor.props.dragToAdjust")}
              />
            ) : null}
            {isStar && onStarRatio ? (
              <ToolSliderField
                label={t("editor.shape.ratio")}
                min={10}
                max={90}
                value={Math.round(starRatio * 100)}
                onValueChange={(val) => onStarRatio(val / 100)}
                suffix="%"
                ariaLabel={t("editor.shape.ratio")}
                scrubHint={t("editor.props.dragToAdjust")}
              />
            ) : null}
          </div>
        )}

        {isArrow && (
          <div className="flex flex-col gap-1.5">
            <span className={sectionTitleClass}>
              {t("editor.shape.arrowEnds")}
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onArrowStart?.(!arrowStart)}
                aria-pressed={arrowStart}
                className={`${sectionRowClass} justify-center text-[10px] ${
                  arrowStart
                    ? "text-[#a7ffd4] ring-1 ring-[#a7ffd4]/40"
                    : "text-neutral-400"
                }`}
              >
                {t("editor.shape.arrowStart")}
              </button>
              <button
                type="button"
                onClick={() => onArrowEnd?.(!arrowEnd)}
                aria-pressed={arrowEnd}
                className={`${sectionRowClass} justify-center text-[10px] ${
                  arrowEnd
                    ? "text-[#a7ffd4] ring-1 ring-[#a7ffd4]/40"
                    : "text-neutral-400"
                }`}
              >
                {t("editor.shape.arrowEnd")}
              </button>
            </div>
            {onArrowSize ? (
              <ToolSliderField
                label={t("editor.shape.arrowSize")}
                min={8}
                max={64}
                value={Math.round(arrowSize)}
                onValueChange={(val) => onArrowSize(val)}
                suffix="px"
                ariaLabel={t("editor.shape.arrowSize")}
                scrubHint={t("editor.props.dragToAdjust")}
              />
            ) : null}
          </div>
        )}
      </div>
    </StaticSection>
  );
}

ShapeProperties.propTypes = {
  tool: PropTypes.string,
  strokeWidth: PropTypes.number,
  onStrokeWidth: PropTypes.func,
  strokeColor: PropTypes.string,
  onStrokeColor: PropTypes.func,
  opacity: PropTypes.number,
  onOpacity: PropTypes.func,
  brushWidth: PropTypes.number,
  onBrushWidth: PropTypes.func,
  strokeStyle: PropTypes.string,
  onStrokeStyle: PropTypes.func,
  cornerRadius: PropTypes.number,
  onCornerRadius: PropTypes.func,
  cornerType: PropTypes.string,
  onCornerType: PropTypes.func,
  sides: PropTypes.number,
  onSides: PropTypes.func,
  starRatio: PropTypes.number,
  onStarRatio: PropTypes.func,
  arrowStart: PropTypes.bool,
  onArrowStart: PropTypes.func,
  arrowEnd: PropTypes.bool,
  onArrowEnd: PropTypes.func,
  arrowSize: PropTypes.number,
  onArrowSize: PropTypes.func,
};
