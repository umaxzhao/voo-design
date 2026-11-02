import PropTypes from "prop-types";
import { ICON_STROKE_WIDTH } from "../../icons.jsx";
import {
  IconGlyphSun,
  IconGlyphContrast,
  IconGlyphAperture,
  IconGlyphSunMedium,
  IconGlyphMoon,
  IconGlyphThermometer,
  IconGlyphTint,
  IconGlyphHue,
  IconGlyphSaturation,
  IconGlyphSparkle,
  IconGlyphCurves,
  IconGlyphLevels,
  IconGlyphColorBalance,
  IconGlyphPhotoFilter,
  IconGlyphChannelMixer,
  IconGlyphSelectiveColor,
  IconGlyphGradientMap,
  IconGlyphBlur,
  IconGlyphSharpen,
  IconGlyphNoise,
  IconGlyphClouds,
  IconGlyphPixelate,
  IconGlyphPosterize,
  IconGlyphSolarize,
  IconGlyphHalftone,
  IconGlyphEmboss,
  IconGlyphSepia,
  IconGlyphVignette,
  IconGlyphShadow,
  IconGlyphGlow,
  IconGlyphInnerShadow,
  IconGlyphInnerGlow,
  IconGlyphSatin,
  IconGlyphBevel,
  IconGlyphFill,
  IconGlyphGradientOverlay,
  IconGlyphStroke,
} from "../../icons.jsx";

/**
 * Glyphs for every adjustment, filter, and layer-style effect.
 *
 * The shapes are Lucide's, chosen one per kind from `icons.jsx` (the one module
 * that imports `lucide-react`) so a kind reads as what it does to the picture
 * (a sun for Brightness, a spline for Curves, a cloud for Clouds) and so the
 * whole panel shares one drawing style: 24x24, stroke-based, `currentColor`,
 * stroke weight from `ICON_STROKE_WIDTH`. The panel tints a glyph simply by
 * setting `color` on its wrapper.
 *
 * Three kinds keep a hand-drawn glyph instead (`HAND_DRAWN` below). Lucide has
 * no shape for them whose meaning a designer would read correctly, and a
 * pretty-but-wrong icon is worse than the drawing it replaces. Photoshop's own
 * idiom for Invert / Threshold / Black & White is the split-tone mark, which
 * Lucide does not ship. The rule throughout this file is recognisability first.
 *
 * One component with a lookup rather than 40 exports: every call site takes the
 * kind as data (from the catalogue), never as a hand-picked import.
 */

/** Shorthand for the parts that need to read as solid rather than outlined. */
const SOLID = { fill: "currentColor", stroke: "none" };

/** `kind` → the Lucide component that draws it. */
const GLYPHS = {
  /* ---- Tone & colour adjustments ------------------------------------- */

  brightness: IconGlyphSun,
  contrast: IconGlyphContrast,
  exposure: IconGlyphAperture,
  highlights: IconGlyphSunMedium,
  shadows: IconGlyphMoon,
  temperature: IconGlyphThermometer,
  tint: IconGlyphTint,
  hue: IconGlyphHue,
  saturation: IconGlyphSaturation,
  vibrance: IconGlyphSparkle,
  curves: IconGlyphCurves,
  levels: IconGlyphLevels,
  colorBalance: IconGlyphColorBalance,
  photoFilter: IconGlyphPhotoFilter,
  channelMixer: IconGlyphChannelMixer,
  selectiveColor: IconGlyphSelectiveColor,
  gradientMap: IconGlyphGradientMap,

  /* ---- Creative & pixel filters -------------------------------------- */

  blur: IconGlyphBlur,
  layerBlur: IconGlyphBlur,
  backgroundBlur: IconGlyphBlur,
  sharpen: IconGlyphSharpen,
  noise: IconGlyphNoise,
  clouds: IconGlyphClouds,
  pixelate: IconGlyphPixelate,
  posterize: IconGlyphPosterize,
  solarize: IconGlyphSolarize,
  halftone: IconGlyphHalftone,
  emboss: IconGlyphEmboss,
  sepia: IconGlyphSepia,
  vignette: IconGlyphVignette,

  /* ---- Layer style effects ------------------------------------------- */

  shadow: IconGlyphShadow,
  glow: IconGlyphGlow,
  innerShadow: IconGlyphInnerShadow,
  innerGlow: IconGlyphInnerGlow,
  satin: IconGlyphSatin,
  bevel: IconGlyphBevel,
  fill: IconGlyphFill,
  gradientOverlay: IconGlyphGradientOverlay,
  stroke: IconGlyphStroke,
};

/**
 * The kinds with no honest Lucide equivalent, drawn by hand on the same 24x24
 * box and 1.5-ish stroke as Lucide's own.
 *
 * They are kept for recognisability, not for looks:
 *
 * - `blackAndWhite` is the half-filled disc, Photoshop's own mark for the
 *   adjustment, and the one glyph that cannot be confused with `contrast`
 *   (which owns the same shape). Lucide's closest, `Eclipse`, reads as a
 *   celestial body or a blend mode, not "remove the colour".
 * - `invert` is the split panel, solid on one side. Lucide has no polarity
 *   glyph; `FlipHorizontal2` states the wrong operation (a geometric flip),
 *   and the layout-shaped candidates read as panels or columns.
 * - `threshold` is the histogram with the hard cut through it, which is the
 *   operation's whole meaning. Lucide's dashed circles read as blur or
 *   selection instead.
 */
const HAND_DRAWN = {
  blackAndWhite: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 0 0 18z" {...SOLID} />
    </>
  ),
  invert: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M5 5h7v14H5z" {...SOLID} />
    </>
  ),
  threshold: (
    <>
      <path d="M4 16V8M7 16v-5M10 16V6M13 16v-8M16 16v-4M19 16V9" />
      <path d="M3 19h18" />
      <path d="M12.4 3v14h-.8V3z" {...SOLID} />
    </>
  ),
};

/** The fallback: a kind the catalogue knows but this file has not drawn yet. */
const FALLBACK = <circle cx="12" cy="12" r="4" {...SOLID} />;

export default function KindIcon({
  kind,
  size = 13,
  className = "",
  strokeWidth = ICON_STROKE_WIDTH,
}) {
  const Glyph = GLYPHS[kind];
  if (Glyph) {
    return (
      <Glyph
        size={size}
        strokeWidth={strokeWidth}
        className={className}
        aria-hidden="true"
      />
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {HAND_DRAWN[kind] ?? FALLBACK}
    </svg>
  );
}

KindIcon.propTypes = {
  kind: PropTypes.string.isRequired,
  size: PropTypes.number,
  className: PropTypes.string,
  strokeWidth: PropTypes.number,
};
