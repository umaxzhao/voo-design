import PropTypes from "prop-types";
import {
  AXIS_COLORS,
  projectViewAxes,
} from "../../editor/three-scene-view-axes.js";

const SIZE = 84;
const CENTER = SIZE / 2;
const REACH = 26;
const POSITIVE_RADIUS = 8;
const NEGATIVE_RADIUS = 5.5;

const css = (color) => `#${color.toString(16).padStart(6, "0")}`;

/**
 * The corner view gizmo: three coloured axis dots that turn with the camera,
 * plus grey dots for the opposite sides. Click a dot to look down that axis.
 */
export default function ThreeViewGizmo({ orientation, onSnap, t }) {
  const axes = projectViewAxes(orientation);
  return (
    <svg
      data-testid="editor-three-view-gizmo"
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="group"
      aria-label={t("editor.three.viewGizmo")}
      className="select-none"
    >
      {axes
        .filter((axis) => axis.positive)
        .map((axis) => (
          <line
            key={`line-${axis.view}`}
            x1={CENTER}
            y1={CENTER}
            x2={CENTER + axis.x * REACH}
            y2={CENTER - axis.y * REACH}
            stroke={css(AXIS_COLORS[axis.axis])}
            strokeWidth={2}
            strokeLinecap="round"
            opacity={axis.depth < -0.2 ? 0.5 : 1}
          />
        ))}
      {axes.map((axis) => {
        const label = t(`editor.three.view.${axis.view}`);
        return (
          <g
            key={axis.view}
            data-testid={`editor-three-view-${axis.view}`}
            data-depth={axis.depth.toFixed(3)}
            role="button"
            tabIndex={0}
            aria-label={label}
            className="cursor-pointer outline-none focus-visible:opacity-80"
            onClick={() => onSnap(axis.view)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              onSnap(axis.view);
            }}
          >
            <title>{label}</title>
            <circle
              cx={CENTER + axis.x * REACH}
              cy={CENTER - axis.y * REACH}
              r={axis.positive ? POSITIVE_RADIUS : NEGATIVE_RADIUS}
              fill={
                axis.positive ? css(AXIS_COLORS[axis.axis]) : "currentColor"
              }
              className={axis.positive ? "" : "text-neutral-500"}
              opacity={axis.depth < -0.2 ? 0.55 : 1}
            />
            {axis.positive ? (
              <text
                x={CENTER + axis.x * REACH}
                y={CENTER - axis.y * REACH}
                textAnchor="middle"
                dominantBaseline="central"
                className="pointer-events-none fill-black text-[9px] font-medium"
              >
                {axis.axis.toUpperCase()}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

ThreeViewGizmo.propTypes = {
  orientation: PropTypes.arrayOf(PropTypes.number).isRequired,
  onSnap: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
};
