/** Shared values for the compact Auto Layout inspector. */
export const DEFAULT_AUTO_LAYOUT = {
  direction: "vertical",
  gap: 8,
  padding: 0,
  alignItems: "start",
  justifyContent: "start",
  widthMode: "fixed",
  heightMode: "hug",
};

export const DISTRIBUTIONS = [
  "start",
  "center",
  "end",
  "space-between",
  "space-around",
  "space-evenly",
];

/** Convert the visual grid position into the engine's axis-based alignment. */
export function alignmentPatch(direction, x, y) {
  const positions = ["start", "center", "end"];
  return {
    justifyContent: positions[direction === "horizontal" ? x : y],
    alignItems: positions[direction === "horizontal" ? y : x],
  };
}
