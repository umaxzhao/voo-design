import PropTypes from "prop-types";

/**
 * Custom vector icons for the stroke properties panel:
 * - strokeLinejoin: miter, round, bevel
 * - strokeLinecap: butt, round, square
 * - strokeDash: solid, dashed, dotted, custom
 * - pen anchor editing: corner, smooth, delete
 *
 * Each glyph is authored on a 16x16 icon grid using stroke="currentColor".
 */

export function StrokeJoinIcon({ join, size = 15 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      data-stroke-join={join}
    >
      {/* Light dashed baseline indicating the inner corner axes */}
      <path
        d="M 4 13.5 L 4 4 L 13.5 4"
        stroke="currentColor"
        strokeWidth="0.75"
        strokeDasharray="1.5 1.5"
        opacity="0.3"
      />
      {/* Heavy stroke showing the geometric corner join */}
      <path
        d="M 4 13.5 L 4 4 L 13.5 4"
        stroke="currentColor"
        strokeWidth="2.75"
        strokeLinejoin={join}
        strokeLinecap="butt"
      />
    </svg>
  );
}

StrokeJoinIcon.propTypes = {
  join: PropTypes.oneOf(["miter", "round", "bevel"]).isRequired,
  size: PropTypes.number,
};

export function StrokeCapIcon({ cap, size = 15 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      data-stroke-cap={cap}
    >
      {/* Reference line marking the anchor endpoint position at x=10 */}
      <line
        x1="10"
        y1="2.5"
        x2="10"
        y2="13.5"
        stroke="currentColor"
        strokeWidth="1"
        strokeDasharray="1.5 1.5"
        opacity="0.35"
      />
      {/* Reference anchor point */}
      <circle cx="10" cy="8" r="0.8" fill="currentColor" opacity="0.6" />
      {/* The stroked line: butt stops at x=10; round / square extend past it */}
      <line
        x1="2.5"
        y1="8"
        x2="10"
        y2="8"
        stroke="currentColor"
        strokeWidth="3.25"
        strokeLinecap={cap}
      />
    </svg>
  );
}

StrokeCapIcon.propTypes = {
  cap: PropTypes.oneOf(["butt", "round", "square"]).isRequired,
  size: PropTypes.number,
};

export function StrokeDashIcon({ dash, size = 15 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      data-stroke-dash={dash}
    >
      {dash === "solid" && (
        <line
          x1="2"
          y1="8"
          x2="14"
          y2="8"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
      {dash === "dashed" && (
        <>
          <line
            x1="2"
            y1="8"
            x2="6.5"
            y2="8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <line
            x1="9.5"
            y1="8"
            x2="14"
            y2="8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      )}
      {dash === "dotted" && (
        <>
          <circle cx="3" cy="8" r="1.35" fill="currentColor" />
          <circle cx="8" cy="8" r="1.35" fill="currentColor" />
          <circle cx="13" cy="8" r="1.35" fill="currentColor" />
        </>
      )}
      {dash === "custom" && (
        <>
          <line
            x1="2"
            y1="8"
            x2="6"
            y2="8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="8.5" cy="8" r="1.2" fill="currentColor" />
          <line
            x1="11"
            y1="8"
            x2="14"
            y2="8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}

StrokeDashIcon.propTypes = {
  dash: PropTypes.oneOf(["solid", "dashed", "dotted", "custom"]).isRequired,
  size: PropTypes.number,
};

export function PenAnchorIcon({ type, size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      data-pen-anchor={type}
    >
      {type === "corner" && (
        <>
          <path
            d="M 2.5 13 L 8 4.5 L 13.5 13"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="miter"
          />
          <rect
            x="6.5"
            y="3"
            width="3"
            height="3"
            fill="currentColor"
            stroke="none"
          />
        </>
      )}
      {type === "smooth" && (
        <>
          <path
            d="M 2.5 12.5 C 4.5 5.5, 11.5 5.5, 13.5 12.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <line
            x1="3"
            y1="6.8"
            x2="13"
            y2="6.8"
            stroke="currentColor"
            strokeWidth="0.8"
            strokeDasharray="1 1"
            opacity="0.65"
          />
          <circle cx="3" cy="6.8" r="1" fill="currentColor" />
          <circle cx="13" cy="6.8" r="1" fill="currentColor" />
          <rect
            x="6.5"
            y="5.3"
            width="3"
            height="3"
            fill="currentColor"
            stroke="none"
          />
        </>
      )}
      {type === "delete" && (
        <>
          <rect
            x="3"
            y="4.5"
            width="5.5"
            height="5.5"
            rx="0.75"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <line
            x1="10.5"
            y1="7.25"
            x2="14.5"
            y2="7.25"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}

PenAnchorIcon.propTypes = {
  type: PropTypes.oneOf(["corner", "smooth", "delete"]).isRequired,
  size: PropTypes.number,
};
