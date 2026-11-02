/** Constants, channel definitions, and slider specs for adjustment controls. */

/** The levels controls: input black/white points, a gamma curve, and the
 * output black/white remap. */
export const LEVELS_SLIDERS = [
  {
    key: "black",
    labelKey: "editor.props.levelsBlack",
    min: 0,
    max: 100,
    unit: "",
  },
  {
    key: "white",
    labelKey: "editor.props.levelsWhite",
    min: 0,
    max: 100,
    unit: "",
  },
  {
    key: "gamma",
    labelKey: "editor.props.levelsGamma",
    min: 0.1,
    max: 5,
    unit: "",
    step: 0.01,
  },
  {
    key: "outBlack",
    labelKey: "editor.props.levelsOutBlack",
    min: 0,
    max: 100,
    unit: "",
  },
  {
    key: "outWhite",
    labelKey: "editor.props.levelsOutWhite",
    min: 0,
    max: 100,
    unit: "",
  },
];

/** The colour-balance tonal zones and their per-channel sliders. */
export const COLOR_BALANCE_ZONES = [
  { key: "shadows", labelKey: "editor.props.cbShadows" },
  { key: "midtones", labelKey: "editor.props.cbMidtones" },
  { key: "highlights", labelKey: "editor.props.cbHighlights" },
];

export const COLOR_BALANCE_CHANNELS = [
  { key: "cyanRed", labelKey: "editor.props.cbCyanRed" },
  { key: "magentaGreen", labelKey: "editor.props.cbMagentaGreen" },
  { key: "yellowBlue", labelKey: "editor.props.cbYellowBlue" },
];

/** The black-&-white per-hue weights, in Photoshop's slider order. */
export const BW_CHANNELS = [
  { key: "reds", labelKey: "editor.props.bwReds" },
  { key: "yellows", labelKey: "editor.props.bwYellows" },
  { key: "greens", labelKey: "editor.props.bwGreens" },
  { key: "cyans", labelKey: "editor.props.bwCyans" },
  { key: "blues", labelKey: "editor.props.bwBlues" },
  { key: "magentas", labelKey: "editor.props.bwMagentas" },
];

/** The channel-mixer output channels (gray only in monochrome mode). */
export const MIXER_CHANNELS = [
  { key: "red", labelKey: "editor.props.cmRed" },
  { key: "green", labelKey: "editor.props.cmGreen" },
  { key: "blue", labelKey: "editor.props.cmBlue" },
];

/** The four weights of one channel-mixer row. */
export const MIXER_WEIGHTS = [
  { key: "red", labelKey: "editor.props.cmRedIn" },
  { key: "green", labelKey: "editor.props.cmGreenIn" },
  { key: "blue", labelKey: "editor.props.cmBlueIn" },
  { key: "constant", labelKey: "editor.props.cmConstant" },
];

/** The selective-colour targets and their ink channels. */
export const SC_TARGETS = [
  { key: "reds", labelKey: "editor.props.scReds" },
  { key: "yellows", labelKey: "editor.props.scYellows" },
  { key: "greens", labelKey: "editor.props.scGreens" },
  { key: "cyans", labelKey: "editor.props.scCyans" },
  { key: "blues", labelKey: "editor.props.scBlues" },
  { key: "magentas", labelKey: "editor.props.scMagentas" },
  { key: "whites", labelKey: "editor.props.scWhites" },
  { key: "neutrals", labelKey: "editor.props.scNeutrals" },
  { key: "blacks", labelKey: "editor.props.scBlacks" },
];

export const SC_INKS = [
  { key: "c", labelKey: "editor.props.scCyan" },
  { key: "m", labelKey: "editor.props.scMagenta" },
  { key: "y", labelKey: "editor.props.scYellow" },
  { key: "k", labelKey: "editor.props.scBlack" },
];

export const HEX_COLOUR = /^#[0-9a-f]{6}$/i;
