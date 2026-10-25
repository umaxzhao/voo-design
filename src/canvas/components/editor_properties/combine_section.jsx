import PropTypes from "prop-types";
import { StaticSection } from "./property_section.jsx";
import { BOOLEAN_OPERATIONS } from "../../editor/scene_model.js";
import { useI18n } from "../../use_i18n.js";
import EditorTooltip from "../editor_tooltip.jsx";

/**
 * A small diagram of each operation, drawn from two overlapping circles.
 *
 * The result of a boolean operation is a shape, so the control that picks one
 * shows shapes: two circles and the part that survives. That reads at a
 * glance where four words ("union", "subtract", "intersect", "exclude") all
 * look alike in a column.
 */
const LEFT = { cx: 8, cy: 9, r: 5.5 };
const RIGHT = { cx: 13, cy: 9, r: 5.5 };

export function OperationIcon({ operation }) {
  const clipId = `combine-clip-${operation}`;
  return (
    <svg viewBox="0 0 21 18" className="h-4 w-5" aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <circle cx={RIGHT.cx} cy={RIGHT.cy} r={RIGHT.r} />
        </clipPath>
        <mask id={`${clipId}-mask`}>
          <rect x="0" y="0" width="21" height="18" fill="#fff" />
          <circle cx={RIGHT.cx} cy={RIGHT.cy} r={RIGHT.r} fill="#000" />
        </mask>
      </defs>

      {/* The two outlines are always shown, so the diagrams read as the same
          pair of circles with a different part filled in. */}
      <circle {...circleProps(LEFT)} />
      <circle {...circleProps(RIGHT)} />

      {operation === "union" ? (
        <>
          <circle cx={LEFT.cx} cy={LEFT.cy} r={LEFT.r} fill="currentColor" />
          <circle cx={RIGHT.cx} cy={RIGHT.cy} r={RIGHT.r} fill="currentColor" />
        </>
      ) : null}
      {operation === "subtract" ? (
        <circle
          cx={LEFT.cx}
          cy={LEFT.cy}
          r={LEFT.r}
          fill="currentColor"
          mask={`url(#${clipId}-mask)`}
        />
      ) : null}
      {operation === "intersect" ? (
        <circle
          cx={LEFT.cx}
          cy={LEFT.cy}
          r={LEFT.r}
          fill="currentColor"
          clipPath={`url(#${clipId})`}
        />
      ) : null}
      {operation === "exclude" ? (
        <>
          <circle
            cx={LEFT.cx}
            cy={LEFT.cy}
            r={LEFT.r}
            fill="currentColor"
            mask={`url(#${clipId}-mask)`}
          />
          <circle cx={RIGHT.cx} cy={RIGHT.cy} r={RIGHT.r} fill="currentColor" />
          <circle
            cx={LEFT.cx}
            cy={LEFT.cy}
            r={LEFT.r}
            fill="#141414"
            clipPath={`url(#${clipId})`}
          />
        </>
      ) : null}
    </svg>
  );
}

function circleProps(circle) {
  return {
    cx: circle.cx,
    cy: circle.cy,
    r: circle.r,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1,
    opacity: 0.45,
  };
}

OperationIcon.propTypes = { operation: PropTypes.string.isRequired };

/**
 * Combines the selected shapes into one.
 *
 * Only shown when the selection is something that can actually be combined —
 * two or more unlocked shapes with an outline. A row of buttons that were
 * usually disabled would take the same space and say less.
 */
export default function CombineSection({ onCombine, currentOperation = null }) {
  const { t } = useI18n();

  return (
    <StaticSection title={t("editor.props.combine")} storageKey="combine">
      <div className="flex gap-1">
        {BOOLEAN_OPERATIONS.map((operation) => {
          const isActive = currentOperation === operation;
          return (
            <EditorTooltip
              key={operation}
              title={t(`editor.props.combine.${operation}`)}
              side="top"
              className="flex-1"
            >
              <button
                type="button"
                onClick={() => onCombine(operation)}
                aria-label={t(`editor.props.combine.${operation}`)}
                aria-pressed={isActive}
                className={`flex w-full items-center justify-center rounded-lg py-1.5 transition-colors ${
                  isActive
                    ? "bg-[#b2ffd6]/20 text-[#b2ffd6] ring-1 ring-[#b2ffd6]/50"
                    : "bg-white/[0.06] text-neutral-300 hover:bg-white/[0.12] hover:text-neutral-100"
                }`}
              >
                <OperationIcon operation={operation} />
              </button>
            </EditorTooltip>
          );
        })}
      </div>
    </StaticSection>
  );
}

CombineSection.propTypes = {
  onCombine: PropTypes.func.isRequired,
  currentOperation: PropTypes.string,
};
