import PropTypes from "prop-types";

// Supplied glyphs normalized to a 24px icon grid with a 1.5px stroke.
const LAYOUT_GLYPHS = {
  none: {
    path: "M3.69212 3.6923H10.15368V10.15383H3.69212V3.6923ZM13.84598 7.38462H20.30753V13.84613H13.84598V7.38462ZM6.46132 14.76923H12.92288V20.30767H6.46132V14.76923Z",
  },
  vertical: {
    path: "M12.00007 10.15383V13.84613M13.84608 11.99998L12.00007 13.84613L10.15407 11.99998M6.46157 3.6923H17.53857V9.23078H6.46157V3.6923ZM6.46157 14.76923H17.53857V20.30767H6.46157V14.76923Z",
  },
  horizontal: {
    path: "M10.15358 11.99998H13.84608M11.99958 13.84613L13.84608 11.99998L11.99958 10.15383M3.69208 6.46152H9.23058V17.53848H3.69208V6.46152ZM14.76908 6.46152H20.30758V17.53848H14.76908V6.46152Z",
  },
  grid: {
    path: "M3.69208 3.6923H10.15358V10.15383H3.69208V3.6923ZM13.84608 3.6923H20.30758V10.15383H13.84608V3.6923ZM3.69208 13.84613H10.15358V20.30767H3.69208V13.84613ZM13.84608 13.84613H20.30758V20.30767H13.84608V13.84613Z",
  },
};

export default function AutoLayoutModeIcon({ mode, size = 24 }) {
  const glyph = LAYOUT_GLYPHS[mode];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-layout-mode-icon={mode}
    >
      <path d={glyph.path} />
    </svg>
  );
}

AutoLayoutModeIcon.propTypes = {
  mode: PropTypes.oneOf(["none", "vertical", "horizontal", "grid"]).isRequired,
  size: PropTypes.number,
};
