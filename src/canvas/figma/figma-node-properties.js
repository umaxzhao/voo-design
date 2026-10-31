import { normalizeCornerRadius } from "../editor/scene_model_core.js";
import { normalizeAutoLayout } from "../editor/auto-layout-values.js";

const HORIZONTAL = { MIN: "left", MAX: "right", CENTER: "center", STRETCH: "leftRight", SCALE: "scale" };
const VERTICAL = { MIN: "top", MAX: "bottom", CENTER: "center", STRETCH: "topBottom", SCALE: "scale" };
const ALIGN = { MIN: "start", MAX: "end", CENTER: "center", STRETCH: "stretch" };
// The native legacy SPACE_EVENLY distributes gaps between items. The newer
// SPACE_EVENLY_CSS explicitly includes the two outer gaps.
const DISTRIBUTE = { ...ALIGN, SPACE_BETWEEN: "space-between", SPACE_EVENLY: "space-between", SPACE_EVENLY_CSS: "space-evenly", SPACE_AROUND: "space-around" };
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

export function figmaCornerRadius(raw) {
  const fields = ["rectangleTopLeftCornerRadius", "rectangleTopRightCornerRadius", "rectangleBottomRightCornerRadius", "rectangleBottomLeftCornerRadius"];
  if (fields.some(key => Number.isFinite(raw[key]))) {
    const values = fields.map(key => finite(raw[key], finite(raw.cornerRadius)));
    return normalizeCornerRadius(Object.fromEntries(["tl", "tr", "br", "bl"].map((key, index) => [key, values[index]])));
  }
  return normalizeCornerRadius(raw.cornerRadius);
}

export function figmaAutoLayout(raw) {
  if (!["HORIZONTAL", "VERTICAL"].includes(raw.stackMode)) return null;
  const horizontal = raw.stackMode === "HORIZONTAL";
  const hug = value => typeof value === "string" && value.startsWith("RESIZE_TO_FIT") ? "hug" : "fixed";
  return normalizeAutoLayout({
    direction: horizontal ? "horizontal" : "vertical",
    gap: finite(raw.stackSpacing), crossGap: finite(raw.stackCounterSpacing, finite(raw.stackSpacing)),
    padding: { left: finite(raw.stackHorizontalPadding), top: finite(raw.stackVerticalPadding),
      right: finite(raw.stackPaddingRight, finite(raw.stackHorizontalPadding)),
      bottom: finite(raw.stackPaddingBottom, finite(raw.stackVerticalPadding)) },
    justifyContent: DISTRIBUTE[raw.stackPrimaryAlignItems] ?? "start",
    alignItems: ALIGN[raw.stackCounterAlignItems] ?? "start",
    widthMode: hug(horizontal ? raw.stackPrimarySizing : raw.stackCounterSizing),
    heightMode: hug(horizontal ? raw.stackCounterSizing : raw.stackPrimarySizing),
    wrap: raw.stackWrap === "WRAP",
  });
}

/** Preserve layout intent without reflowing the imported authored geometry. */
export function applyFigmaNodeProperties(raw, layer, { outlinedStroke = false } = {}) {
  if (raw.locked === true) layer.locked = true;
  if (raw.horizontalConstraint || raw.verticalConstraint) {
    layer.constraints = { horizontal: HORIZONTAL[raw.horizontalConstraint] ?? "left", vertical: VERTICAL[raw.verticalConstraint] ?? "top" };
  }
  if (layer.kind === "group") {
    const layout = figmaAutoLayout(raw);
    if (layout) layer.autoLayout = layout;
  }
  if (raw.stackPositioning === "ABSOLUTE") layer.layoutPosition = "absolute";
  if (raw.stackChildPrimaryGrow > 0) layer.layoutGrow = raw.stackChildPrimaryGrow;
  if (raw.stackChildAlignSelf) layer.layoutAlign = ALIGN[raw.stackChildAlignSelf] ?? "start";
  if (layer.kind !== "text" && layer.kind !== "path") layer.cornerRadius = figmaCornerRadius(raw);
  if (raw.cornerSmoothing > 0) layer.cornerSmoothing = raw.cornerSmoothing;
  // An outlined vector has already baked the stroke into its fill geometry.
  // Adding another outline would change both silhouette and opacity.
  if (!outlinedStroke) {
    if (raw.strokeAlign) layer.strokeAlign = raw.strokeAlign.toLowerCase();
    if (raw.strokeJoin) layer.strokeJoin = raw.strokeJoin.toLowerCase();
    const cap = { NONE: "butt", BUTT: "butt", ROUND: "round", SQUARE: "square" }[raw.strokeCap];
    if (cap) layer.strokeCap = cap;
    if (raw.miterLimit > 0) layer.strokeMiterLimit = raw.miterLimit;
    if (raw.dashPattern?.length) layer.strokeDash = raw.dashPattern.filter(value => Number.isFinite(value) && value >= 0);
  }
  if (layer.kind === "text") {
    if (raw.textDecoration === "UNDERLINE") layer.underline = true;
  }
  return layer;
}
