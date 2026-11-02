// Map CSS layout to the editor's existing editable auto-layout contract.
import { parseGap, parsePadding, toPx } from "./html_layout_utils.js";

export function cssAutoLayout(style) {
  if (!["flex", "inline-flex", "grid", "inline-grid"].includes(style.display)) return null;
  const grid = style.display.includes("grid");
  const vertical = !grid && String(style.flexDirection).startsWith("column");
  const gap = parseGap(style);
  const padding = parsePadding(style);
  for (const side of ["top", "right", "bottom", "left"]) {
    const value = style[`padding${side[0].toUpperCase()}${side.slice(1)}`];
    if (value != null) padding[side] = toPx(value, padding[side]);
  }
  const alignment = (value) => ({ "flex-start": "start", "flex-end": "end", normal: "start" })[value] ?? value ?? "start";
  return {
    direction: vertical ? "vertical" : "horizontal",
    wrap: grid || style.flexWrap === "wrap",
    gap: vertical ? gap.row : gap.col,
    crossGap: vertical ? gap.col : gap.row,
    padding,
    alignItems: alignment(style.alignItems),
    justifyContent: alignment(style.justifyContent),
    alignContent: alignment(style.alignContent),
    widthMode: "fixed",
    heightMode: "fixed",
  };
}
