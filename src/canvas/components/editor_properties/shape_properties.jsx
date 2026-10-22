/**
 * Shape and arrow tool properties: stroke weight, stroke style, and geometry options (Affinity Style).
 * Covers Rect, Ellipse, Polygon, Star, Line, Arrow.
 */

import PropTypes from "prop-types";
import { TOOL } from "../../editor/editor_constants.js";
import { useI18n } from "../../use_i18n.js";
import { StaticSection } from "./property_section.jsx";
import ScrubField from "../scrub_field.jsx";
import { ARROW_CAP } from "../../editor/shape_geometry.js";

const QUICK_STROKE_SIZES = [0, 1, 2, 4, 8, 16, 24];

export default function ShapeProperties({
  tool,
  strokeWidth = 1,
  onStrokeWidth,
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

  const sectionTitle = isArrow
    ? t("editor.tool.arrow") || "箭头工具"
    : isLine
      ? t("editor.tool.line") || "直线工具"
      : isRect
        ? t("editor.shape.rect") || "矩形工具"
        : isEllipse
          ? t("editor.shape.ellipse") || "椭圆工具"
          : isPolygon
            ? t("editor.shape.polygon") || "多边形工具"
            : isStar
              ? t("editor.shape.star") || "星形工具"
              : t("editor.shape.title") || "形状工具";

  return (
    <StaticSection title={sectionTitle}>
      <div className="flex flex-col gap-2">
        {/* 1. Stroke Weight & Quick Stroke Width Pills */}
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            {setWidth && (
              <ScrubField
                prefix={
                  <svg
                    className="w-3.5 h-3.5 text-neutral-400"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <polygon points="3,19 21,19 21,5" />
                  </svg>
                }
                suffix="px"
                min={0}
                max={100}
                value={width}
                onValueChange={(val) => setWidth(val)}
                ariaLabel={t("editor.strokeStyle.weight") || "描边粗细"}
                scrubHint={t("editor.props.dragToAdjust")}
                showRange
              />
            )}
            {/* Stroke Style: Solid vs Dashed */}
            <div className="flex items-center gap-1 rounded-lg bg-neutral-900 border border-white/10 p-0.5 h-7">
              {[
                { id: "solid", label: "实线", icon: <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="2" /> },
                { id: "dashed", label: "虚线", icon: <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="2" strokeDasharray="3 3" /> },
              ].map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => onStrokeStyle?.(style.id)}
                  title={style.label}
                  aria-pressed={strokeStyle === style.id}
                  className={`flex flex-1 items-center justify-center rounded-md h-full transition-colors ${
                    strokeStyle === style.id
                      ? "bg-white/20 text-white font-medium"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    {style.icon}
                  </svg>
                </button>
              ))}
            </div>
          </div>

          {/* Quick Stroke Width Pills */}
          {setWidth && (
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-[9px] font-mono text-neutral-500 uppercase shrink-0 mr-0.5">
                Stroke
              </span>
              {QUICK_STROKE_SIZES.map((sz) => {
                const isActive = width === sz;
                return (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setWidth(sz)}
                    className={`h-5 min-w-[24px] px-1.5 flex items-center justify-center rounded-md text-[10px] font-mono transition-all ${
                      isActive
                        ? "bg-[#a7ffd4] text-black font-semibold shadow-pop"
                        : "bg-white/[0.06] text-neutral-400 hover:bg-white/[0.12] hover:text-neutral-200"
                    }`}
                  >
                    {sz}px
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 2. Shape-Specific Geometry Options (Affinity Style) */}
        {/* For Rectangle: Corner Radius & Style */}
        {isRect && onCornerRadius && (
          <div className="flex flex-col gap-1.5 pt-0.5">
            <span className="text-[10px] font-mono text-neutral-400">
              {t("editor.props.cornerRadius") || "圆角半径"}
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <ScrubField
                prefix="⌒"
                suffix="px"
                min={0}
                max={120}
                value={Math.round(cornerRadius)}
                onValueChange={(val) => onCornerRadius(val)}
                ariaLabel={t("editor.props.cornerRadius") || "圆角"}
                scrubHint={t("editor.props.dragToAdjust")}
                showRange
              />
              <div className="flex items-center gap-1 rounded-lg bg-neutral-900 border border-white/10 p-0.5 h-7">
                {[
                  { id: "round", label: "圆角" },
                  { id: "straight", label: "切角" },
                ].map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => onCornerType?.(type.id)}
                    className={`flex flex-1 items-center justify-center rounded-md h-full text-[10px] font-mono transition-colors ${
                      cornerType === type.id
                        ? "bg-white/20 text-white font-medium"
                        : "text-neutral-400 hover:text-white"
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* For Polygon & Star: Number of Sides / Points */}
        {(isPolygon || isStar) && (
          <div className="grid grid-cols-2 gap-1.5 pt-0.5">
            {onSides && (
              <ScrubField
                prefix={isStar ? "★" : "⬡"}
                min={3}
                max={32}
                step={1}
                value={Math.round(sides)}
                onValueChange={(val) => onSides(val)}
                ariaLabel={isStar ? "角数 (Points)" : "边数 (Sides)"}
                scrubHint={t("editor.props.dragToAdjust")}
                showRange
              />
            )}
            {isStar && onStarRatio && (
              <ScrubField
                prefix="内径"
                suffix="%"
                min={10}
                max={90}
                step={1}
                value={Math.round(starRatio * 100)}
                onValueChange={(val) => onStarRatio(val / 100)}
                ariaLabel="内径比例 (Inner Radius)"
                scrubHint={t("editor.props.dragToAdjust")}
                showRange
              />
            )}
          </div>
        )}

        {/* For Arrow: Start & End Head, Arrow Size */}
        {isArrow && (
          <div className="flex flex-col gap-1.5 pt-0.5">
            <span className="text-[10px] font-mono text-neutral-400">
              箭头端点与大小
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onArrowStart?.(!arrowStart)}
                aria-pressed={arrowStart}
                className={`flex h-7 items-center justify-center rounded-lg border text-[10px] font-mono transition-colors ${
                  arrowStart
                    ? "bg-[#a7ffd4]/15 border-[#a7ffd4]/40 text-[#a7ffd4]"
                    : "bg-neutral-900 border-white/10 text-neutral-400 hover:text-white"
                }`}
              >
                起点箭头
              </button>
              <button
                type="button"
                onClick={() => onArrowEnd?.(!arrowEnd)}
                aria-pressed={arrowEnd}
                className={`flex h-7 items-center justify-center rounded-lg border text-[10px] font-mono transition-colors ${
                  arrowEnd
                    ? "bg-[#a7ffd4]/15 border-[#a7ffd4]/40 text-[#a7ffd4]"
                    : "bg-neutral-900 border-white/10 text-neutral-400 hover:text-white"
                }`}
              >
                终点箭头
              </button>
            </div>
            {onArrowSize && (
              <ScrubField
                prefix="Size"
                suffix="px"
                min={8}
                max={64}
                value={Math.round(arrowSize)}
                onValueChange={(val) => onArrowSize(val)}
                ariaLabel="箭头尺寸"
                scrubHint={t("editor.props.dragToAdjust")}
                showRange
              />
            )}
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
