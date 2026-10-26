import PropTypes from "prop-types";

// Original paths from the supplied icon sheet; each glyph occupies a 44.3077-unit cell.
const LAYOUT_GLYPHS = {
  none: {
    offset: 0,
    path: "M5.53809 5.53845H18.4612V18.4615H5.53809V5.53845ZM25.8458 12.9231H38.7689V25.8461H25.8458V12.9231ZM11.0765 27.6923H23.9996V38.7692H11.0765V27.6923Z",
  },
  vertical: {
    offset: 144,
    path: "M166.154 18.4615V25.8461M169.846 22.1538L166.154 25.8461L162.462 22.1538M155.077 5.53845H177.231V16.6154H155.077V5.53845ZM155.077 27.6923H177.231V38.7692H155.077V27.6923Z",
  },
  horizontal: {
    offset: 288,
    path: "M306.461 22.1538H313.846M310.153 25.8461L313.846 22.1538L310.153 18.4615M293.538 11.0769H304.615V33.2308H293.538V11.0769ZM315.692 11.0769H326.769V33.2308H315.692V11.0769Z",
  },
  grid: {
    offset: 432,
    path: "M437.538 5.53845H450.461V18.4615H437.538V5.53845ZM457.846 5.53845H470.769V18.4615H457.846V5.53845ZM437.538 25.8461H450.461V38.7692H437.538V25.8461ZM457.846 25.8461H470.769V38.7692H457.846V25.8461Z",
  },
};

export default function AutoLayoutModeIcon({ mode, size = 20 }) {
  const glyph = LAYOUT_GLYPHS[mode];
  return (
    <svg
      width={size}
      height={size}
      viewBox={`${glyph.offset} 0 44.3077 44.3077`}
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
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
