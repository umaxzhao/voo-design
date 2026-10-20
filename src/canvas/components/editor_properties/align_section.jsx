import PropTypes from "prop-types";
import {
  ALIGN_TYPES,
  DISTRIBUTE_AXES,
  alignNodes,
  distributeNodes,
  tidyNodes,
} from "../../editor/align_ops.js";
import { StaticSection } from "./property_section.jsx";
import { useI18n } from "../../use_i18n.js";
import EditorTooltip from "../editor_tooltip.jsx";

/**
 * The alignment icons: a bar for the edge being aligned to, and two blocks
 * sitting against it.
 *
 * Drawn rather than named for the same reason the combine icons are — six
 * words in a row all look alike, and the whole point of the control is where
 * the shapes end up.
 */
/**
 * Precision Figma-style SVG icons for Alignment & Distribution.
 */
export function AlignIcon({ type }) {
  switch (type) {
    case "left":
      return (
        <svg
          viewBox="0 0 16 16"
          className="h-4 w-4"
          aria-hidden="true"
          fill="currentColor"
        >
          <rect x="2" y="2" width="1.5" height="12" rx="0.75" />
          <rect x="5.5" y="4" width="8" height="3" rx="0.5" />
          <rect x="5.5" y="9" width="5" height="3" rx="0.5" />
        </svg>
      );
    case "center":
      return (
        <svg
          viewBox="0 0 16 16"
          className="h-4 w-4"
          aria-hidden="true"
          fill="currentColor"
        >
          <rect x="7.25" y="2" width="1.5" height="12" rx="0.75" />
          <rect x="3" y="4" width="10" height="3" rx="0.5" />
          <rect x="4.5" y="9" width="7" height="3" rx="0.5" />
        </svg>
      );
    case "right":
      return (
        <svg
          viewBox="0 0 16 16"
          className="h-4 w-4"
          aria-hidden="true"
          fill="currentColor"
        >
          <rect x="12.5" y="2" width="1.5" height="12" rx="0.75" />
          <rect x="2.5" y="4" width="8" height="3" rx="0.5" />
          <rect x="5.5" y="9" width="5" height="3" rx="0.5" />
        </svg>
      );
    case "top":
      return (
        <svg
          viewBox="0 0 16 16"
          className="h-4 w-4"
          aria-hidden="true"
          fill="currentColor"
        >
          <rect x="2" y="2" width="12" height="1.5" rx="0.75" />
          <rect x="4" y="5.5" width="3" height="8" rx="0.5" />
          <rect x="9" y="5.5" width="3" height="5" rx="0.5" />
        </svg>
      );
    case "middle":
      return (
        <svg
          viewBox="0 0 16 16"
          className="h-4 w-4"
          aria-hidden="true"
          fill="currentColor"
        >
          <rect x="2" y="7.25" width="12" height="1.5" rx="0.75" />
          <rect x="4" y="3" width="3" height="10" rx="0.5" />
          <rect x="9" y="4.5" width="3" height="7" rx="0.5" />
        </svg>
      );
    case "bottom":
      return (
        <svg
          viewBox="0 0 16 16"
          className="h-4 w-4"
          aria-hidden="true"
          fill="currentColor"
        >
          <rect x="2" y="12.5" width="12" height="1.5" rx="0.75" />
          <rect x="4" y="2.5" width="3" height="8" rx="0.5" />
          <rect x="9" y="5.5" width="3" height="5" rx="0.5" />
        </svg>
      );
    default:
      return null;
  }
}

AlignIcon.propTypes = { type: PropTypes.string.isRequired };

/** Figma-style Distribute Center SVG icons. */
function DistributeIcon({ axis }) {
  if (axis === "horizontal") {
    return (
      <svg
        viewBox="0 0 16 16"
        className="h-4 w-4"
        aria-hidden="true"
        fill="currentColor"
      >
        <rect x="2" y="2" width="1.5" height="12" rx="0.75" opacity="0.6" />
        <rect x="12.5" y="2" width="1.5" height="12" rx="0.75" opacity="0.6" />
        <rect x="5.5" y="4" width="5" height="8" rx="0.5" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4"
      aria-hidden="true"
      fill="currentColor"
    >
      <rect x="2" y="2" width="12" height="1.5" rx="0.75" opacity="0.6" />
      <rect x="2" y="12.5" width="12" height="1.5" rx="0.75" opacity="0.6" />
      <rect x="4" y="5.5" width="8" height="5" rx="0.5" />
    </svg>
  );
}

DistributeIcon.propTypes = { axis: PropTypes.string.isRequired };

/** Figma-style Tidy Up / Even Spacing SVG icons with inner gap lines. */
function TidyIcon({ axis }) {
  if (axis === "horizontal") {
    return (
      <svg
        viewBox="0 0 16 16"
        className="h-4 w-4"
        aria-hidden="true"
        fill="currentColor"
      >
        <rect x="2" y="4" width="3" height="8" rx="0.5" />
        <rect x="6.5" y="4" width="3" height="8" rx="0.5" />
        <rect x="11" y="4" width="3" height="8" rx="0.5" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4"
      aria-hidden="true"
      fill="currentColor"
    >
      <rect x="4" y="2" width="8" height="3" rx="0.5" />
      <rect x="4" y="6.5" width="8" height="3" rx="0.5" />
      <rect x="4" y="11" width="8" height="3" rx="0.5" />
    </svg>
  );
}

TidyIcon.propTypes = { axis: PropTypes.string.isRequired };

function Row({ children }) {
  return <div className="flex gap-1">{children}</div>;
}

Row.propTypes = { children: PropTypes.node };

const buttonClass =
  "flex h-7 flex-1 items-center justify-center rounded-lg bg-white/[0.06] text-neutral-300 transition-colors hover:bg-white/[0.12] hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/[0.06] disabled:hover:text-neutral-300";

/**
 * Aligning and spreading a selection.
 *
 * Aligning needs two shapes; spreading needs three, since it is the shapes
 * *between* the outermost two that move. The spread buttons are shown
 * disabled rather than hidden at two, so the row does not change shape as
 * shapes are added to the selection.
 */
export default function AlignSection({ count, onLayout }) {
  const { t } = useI18n();
  const canSpread = count >= 3;

  return (
    <StaticSection title={t("editor.props.align")}>
      <Row>
        {ALIGN_TYPES.map((type) => (
          <EditorTooltip
            key={type}
            title={t(`editor.props.alignShapes.${type}`)}
            side="top"
            className="flex-1"
          >
            <button
              type="button"
              onClick={() => onLayout(alignNodes, type)}
              aria-label={t(`editor.props.alignShapes.${type}`)}
              className={`${buttonClass} w-full`}
            >
              <AlignIcon type={type} />
            </button>
          </EditorTooltip>
        ))}
      </Row>

      {count >= 2 && (
        <Row>
          {DISTRIBUTE_AXES.map((axis) => (
            <EditorTooltip
              key={`spread-${axis}`}
              title={
                canSpread
                  ? t(`editor.props.distribute.${axis}`)
                  : t("editor.props.distribute.requiresThree")
              }
              side="top"
              className="flex-1"
            >
              <button
                type="button"
                aria-disabled={!canSpread}
                aria-description={
                  canSpread ? undefined : t("editor.props.distribute.requiresThree")
                }
                onClick={() => {
                  if (canSpread) onLayout(distributeNodes, axis);
                }}
                aria-label={t(`editor.props.distribute.${axis}`)}
                className={`${buttonClass} w-full aria-disabled:cursor-not-allowed aria-disabled:opacity-30 aria-disabled:hover:bg-white/[0.06] aria-disabled:hover:text-neutral-300`}
              >
                <DistributeIcon axis={axis} />
              </button>
            </EditorTooltip>
          ))}
          {DISTRIBUTE_AXES.map((axis) => (
            <EditorTooltip
              key={`tidy-${axis}`}
              title={
                canSpread
                  ? t(`editor.props.tidy.${axis}`)
                  : t("editor.props.distribute.requiresThree")
              }
              side="top"
              className="flex-1"
            >
              <button
                type="button"
                aria-disabled={!canSpread}
                aria-description={
                  canSpread ? undefined : t("editor.props.distribute.requiresThree")
                }
                onClick={() => {
                  if (canSpread) onLayout(tidyNodes, axis);
                }}
                aria-label={t(`editor.props.tidy.${axis}`)}
                className={`${buttonClass} w-full aria-disabled:cursor-not-allowed aria-disabled:opacity-30 aria-disabled:hover:bg-white/[0.06] aria-disabled:hover:text-neutral-300`}
              >
                <TidyIcon axis={axis} />
              </button>
            </EditorTooltip>
          ))}
        </Row>
      )}
    </StaticSection>
  );
}

AlignSection.propTypes = {
  count: PropTypes.number.isRequired,
  onLayout: PropTypes.func.isRequired,
};
