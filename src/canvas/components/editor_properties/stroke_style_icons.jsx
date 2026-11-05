import PropTypes from "prop-types";

/**
 * Vector glyphs for the stroke and pen-anchor controls. Every glyph sits on a
 * 16x16 grid, uses stroke="currentColor" and one stroke weight family, so the
 * panel reads as one set. Each glyph shows the property it sets, not a
 * neighbouring idea:
 * - strokeLinejoin: miter, round, bevel (the outer corner of a path)
 * - strokeLinecap: butt, round, square (the line end, with end guides)
 * - strokeDash: solid, dashed, dotted, custom (uneven dash lengths)
 * - pen anchor editing: corner, smooth, delete (the anchor node itself)
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
      <path
        d="M3.2 12.8 L3.2 3.2 L12.8 3.2"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinejoin={join}
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
      {/* End guides mark where the line stops; round and square caps extend past them. */}
      <path
        d="M5.5 3 V13 M10.5 3 V13"
        stroke="currentColor"
        strokeWidth="0.9"
        opacity="0.4"
      />
      <path
        d="M5.5 8 H10.5"
        stroke="currentColor"
        strokeWidth="3"
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
        <path
          d="M2 8 H14"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
      {dash === "dashed" && (
        <path
          d="M2 8 H6 M10 8 H14"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
      {dash === "dotted" && (
        <>
          <circle cx="3" cy="8" r="1.1" fill="currentColor" />
          <circle cx="8" cy="8" r="1.1" fill="currentColor" />
          <circle cx="13" cy="8" r="1.1" fill="currentColor" />
        </>
      )}
      {dash === "custom" && (
        <path
          d="M2 8 H9 M11.5 8 H13.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
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
            d="M3 12.6 L8 4 L13 12.6"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="miter"
          />
          <rect
            x="6.9"
            y="2.9"
            width="2.2"
            height="2.2"
            fill="currentColor"
            stroke="none"
          />
        </>
      )}
      {type === "smooth" && (
        <>
          <path
            d="M2.6 12.2 C4.4 4.8 11.6 4.8 13.4 12.2"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <circle cx="8" cy="8.2" r="1.3" fill="currentColor" stroke="none" />
        </>
      )}
      {type === "delete" && (
        <>
          <circle
            cx="8"
            cy="8"
            r="5.3"
            stroke="currentColor"
            strokeWidth="1.3"
          />
          <path
            d="M5.4 8 H10.6"
            stroke="currentColor"
            strokeWidth="1.4"
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
