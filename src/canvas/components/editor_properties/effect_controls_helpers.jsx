/** Helper components and title mappings for effect controls. */

import PropTypes from "prop-types";
import { Swatch, HexField } from "./colour_section.jsx";

export function ColourRow({ label, value = null, fallback, onChange }) {
  const color = value ?? fallback;
  return (
    <div className="flex items-center gap-1.5 flex-1 min-w-0">
      <Swatch value={color} onPick={onChange} ariaLabel={label} />
      <HexField value={color} onCommit={onChange} ariaLabel={label} />
    </div>
  );
}

ColourRow.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.string,
  fallback: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};

export const TITLE_KEYS = {
  shadow: "editor.props.effectShadow",
  glow: "editor.props.effectGlow",
  innerShadow: "editor.props.effectInnerShadow",
  innerGlow: "editor.props.effectInnerGlow",
  satin: "editor.props.effectSatin",
  bevel: "editor.props.effectBevel",
  fill: "editor.props.effectFill",
  gradientOverlay: "editor.props.effectGradientOverlay",
  stroke: "editor.props.effectStroke",
};
