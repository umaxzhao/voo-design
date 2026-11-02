import PropTypes from "prop-types";
import { useMemo, useRef, useState } from "react";
import { useCurveDrag } from "./use_curve_drag.js";
import { createDefaultAdjustments } from "../../editor/scene_model.js";
import { evaluateMonotoneCubicSpline } from "../../editor/scene_renderer.js";
import { useI18n } from "../../use_i18n.js";

/** The graph is a square in its own coordinate space; screen size is CSS. */
const GRAPH_SIZE = 180;
/** Samples along the curve path — enough to read as smooth at 180px. */
const PATH_SAMPLES = 60;

const IDENTITY_POINTS = [
  { x: 0, y: 0 },
  { x: 1, y: 1 },
];

/** Samples a channel's spline into an SVG path in graph coordinates. */
function curvePath(points) {
  if (!points || points.length === 0) return "";
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const parts = [];
  for (let index = 0; index <= PATH_SAMPLES; index += 1) {
    const x = index / PATH_SAMPLES;
    const y = evaluateMonotoneCubicSpline(sorted, x);
    const svgX = (x * GRAPH_SIZE).toFixed(2);
    const svgY = ((1 - y) * GRAPH_SIZE).toFixed(2);
    parts.push(`${index === 0 ? "M" : "L"} ${svgX} ${svgY}`);
  }
  return parts.join(" ");
}

/**
 * The tone-curve editor.
 *
 * One channel is edited at a time; the other three stay visible as faint
 * reference curves. Paths are memoised per channel because the panel
 * re-renders on every engine notification — re-sampling four splines 61 times
 * each per frame would be pure waste.
 */
export default function ToneCurvesWidget({
  curves = null,
  onChange,
  onCommit,
}) {
  const { t } = useI18n();
  const [channel, setChannel] = useState("luminance");
  const [selectedIndex, setSelectedIndex] = useState(null);
  const svgRef = useRef(null);

  const activeCurves = curves ?? createDefaultAdjustments().curves;
  const channelPoints = activeCurves[channel] ?? IDENTITY_POINTS;

  const channels = [
    {
      key: "luminance",
      label: t("editor.curves.luminance"),
      color: "#e5e7eb",
      pointColor: "#ffffff",
    },
    {
      key: "r",
      label: t("editor.curves.red"),
      color: "#ef4444",
      pointColor: "#f87171",
    },
    {
      key: "g",
      label: t("editor.curves.green"),
      color: "#22c55e",
      pointColor: "#4ade80",
    },
    {
      key: "b",
      label: t("editor.curves.blue"),
      color: "#3b82f6",
      pointColor: "#60a5fa",
    },
  ];
  const activeConfig =
    channels.find((entry) => entry.key === channel) ?? channels[0];

  const paths = useMemo(
    () => ({
      luminance: curvePath(activeCurves.luminance),
      r: curvePath(activeCurves.r),
      g: curvePath(activeCurves.g),
      b: curvePath(activeCurves.b),
    }),
    [activeCurves.luminance, activeCurves.r, activeCurves.g, activeCurves.b],
  );

  const drag = useCurveDrag({
    svgRef,
    channel,
    activeCurves,
    channelPoints,
    onChange,
    onCommit,
    onSelectPoint: (idx) => setSelectedIndex(idx),
  });

  const selectedPoint =
    selectedIndex !== null &&
    selectedIndex >= 0 &&
    selectedIndex < channelPoints.length
      ? channelPoints[selectedIndex]
      : null;

  return (
    <div className="flex flex-col gap-2 pt-1" data-testid="tone-curves-widget">
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1">
          {channels.map((entry) => (
            <button
              key={entry.key}
              type="button"
              aria-pressed={channel === entry.key}
              onClick={() => {
                drag.clearDragState();
                setSelectedIndex(null);
                setChannel(entry.key);
              }}
              className={`rounded-lg px-1.5 py-0.5 text-[9px] font-mono transition-all ${
                channel === entry.key
                  ? "bg-[#333333] text-white ring-1 ring-white/20 font-medium"
                  : "bg-[#222222] text-neutral-400 hover:text-neutral-200"
              }`}
              style={{ color: channel === entry.key ? entry.color : undefined }}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={drag.resetChannel}
          title={t("editor.props.reset")}
          className="text-[9px] font-mono text-neutral-400 hover:text-neutral-200"
        >
          {t("editor.props.reset")}
        </button>
      </div>

      <div className="relative flex justify-center items-center bg-[#1a1a1a] p-2 rounded-xl select-none">
        <svg
          ref={svgRef}
          width={GRAPH_SIZE}
          height={GRAPH_SIZE}
          viewBox={`0 0 ${GRAPH_SIZE} ${GRAPH_SIZE}`}
          className="cursor-crosshair overflow-visible touch-none"
          onClick={(event) => {
            // Empty-space clicks insert a point; a control point is not one.
            if (event.target.tagName?.toLowerCase() !== "circle") {
              setSelectedIndex(null);
            }
            drag.onSurfaceClick(event);
          }}
        >
          <line
            x1="0"
            y1="180"
            x2="180"
            y2="0"
            stroke="#333333"
            strokeDasharray="3 3"
            strokeWidth="1"
          />
          {[45, 90, 135].map((offset) => (
            <line
              key={`v${offset}`}
              x1={offset}
              y1="0"
              x2={offset}
              y2="180"
              stroke="#262626"
              strokeDasharray="2 2"
              strokeWidth="1"
            />
          ))}
          {[45, 90, 135].map((offset) => (
            <line
              key={`h${offset}`}
              x1="0"
              y1={offset}
              x2="180"
              y2={offset}
              stroke="#262626"
              strokeDasharray="2 2"
              strokeWidth="1"
            />
          ))}

          {channels
            .filter((entry) => entry.key !== channel)
            .map((entry) =>
              paths[entry.key] ? (
                <path
                  key={entry.key}
                  d={paths[entry.key]}
                  fill="none"
                  stroke={entry.color}
                  strokeWidth="1.2"
                  opacity="0.35"
                />
              ) : null,
            )}

          <path
            d={paths[channel]}
            fill="none"
            stroke={activeConfig.color}
            strokeWidth="2"
          />

          {channelPoints.map((point, index) => (
            <circle
              key={`${channel}-${index}`}
              cx={point.x * GRAPH_SIZE}
              cy={(1 - point.y) * GRAPH_SIZE}
              r={selectedIndex === index ? 6.5 : 5}
              fill={activeConfig.pointColor}
              stroke={selectedIndex === index ? activeConfig.color : "#141414"}
              strokeWidth="1.5"
              className="cursor-grab active:cursor-grabbing hover:scale-125 transition-transform"
              tabIndex={0}
              aria-label={`${activeConfig.label} ${index + 1}`}
              onClick={(event) => {
                event.stopPropagation();
                event.currentTarget.focus({ preventScroll: true });
                setSelectedIndex(index);
              }}
              onPointerDown={(event) => drag.onPointDown(index, event)}
              onDoubleClick={(event) => drag.onPointDoubleClick(index, event)}
              onKeyDown={(event) => {
                if (event.key !== "Delete" && event.key !== "Backspace") return;
                event.preventDefault();
                event.stopPropagation();
                if (index === 0 || index === channelPoints.length - 1) return;
                drag.onPointDoubleClick(index, event);
                setSelectedIndex(null);
              }}
            />
          ))}
        </svg>
      </div>

      {selectedPoint ? (
        <div className="flex items-center justify-around rounded-lg bg-[#222222] px-2 py-1 text-[10px] font-mono text-neutral-300">
          <div className="flex items-center gap-1.5">
            <span className="text-neutral-500">
              {t("editor.curves.input")}:
            </span>
            <span className="tabular-nums font-semibold text-neutral-200">
              {Math.round(selectedPoint.x * 255)}
            </span>
          </div>
          <div className="h-3 w-px bg-white/10" />
          <div className="flex items-center gap-1.5">
            <span className="text-neutral-500">
              {t("editor.curves.output")}:
            </span>
            <span className="tabular-nums font-semibold text-neutral-200">
              {Math.round(selectedPoint.y * 255)}
            </span>
          </div>
        </div>
      ) : null}

      <p className="text-[9px] text-neutral-500 font-mono text-center">
        {t("editor.curves.hint")}
      </p>
    </div>
  );
}

ToneCurvesWidget.propTypes = {
  curves: PropTypes.object,
  onChange: PropTypes.func.isRequired,
  onCommit: PropTypes.func.isRequired,
};
