/**
 * Layout and fidelity engine for HTML-to-layer conversion.
 * Coordinates pure Flex and Grid layout computation and tracks unsupported CSS warnings.
 */

import { computeFlexLayout } from "./html_flex_layout.js";
import { computeGridLayout } from "./html_grid_layout.js";
import { camelToKebab } from "./html_layout_utils.js";

export const HTML_IMPORT_WARNING = {
  IMG_WITHOUT_SRC: "img-without-src",
  INCREMENTAL_PARSE_EMPTY: "incremental-parse-empty",
  unsupportedProperty: (prop) => `unsupported-property:${prop}`,
  unsupportedValue: (prop, val) => `unsupported-value:${prop}:${val}`,
};

export function formatUnsupportedPropertyWarning(prop) {
  return `unsupported-property:${prop}`;
}

export function isUnsupportedPropertyWarning(warning) {
  return (
    typeof warning === "string" && warning.startsWith("unsupported-property:")
  );
}

const SUPPORTED_CSS_PROPERTIES = new Set([
  // Positioning & Box Model
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "zIndex",
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "margin",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "padding",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "boxSizing",
  // Pointer affordance has no visual layer equivalent in the editor.
  "cursor",
  "display",
  "visibility",
  "overflow",
  "overflowX",
  "overflowY",

  // Flexbox
  "flexDirection",
  "flexWrap",
  "flexFlow",
  "justifyContent",
  "alignItems",
  "alignContent",
  "gap",
  "rowGap",
  "columnGap",
  "flex",
  "flexGrow",
  "flexShrink",
  "flexBasis",
  "alignSelf",
  "order",

  // Grid
  "gridTemplateColumns",
  "gridTemplateRows",
  "gridAutoFlow",
  "gridAutoColumns",
  "gridAutoRows",
  "gridColumn",
  "gridColumnStart",
  "gridColumnEnd",
  "gridRow",
  "gridRowStart",
  "gridRowEnd",
  "gridGap",
  "gridRowGap",
  "gridColumnGap",
  "justifyItems",
  "justifySelf",

  // Visuals
  "background",
  "backgroundColor",
  "backgroundImage",
  "backgroundSize",
  "backgroundPosition",
  "backgroundRepeat",
  "color",
  "opacity",
  "transform",
  "transformOrigin",
  "borderRadius",
  "borderTopLeftRadius",
  "borderTopRightRadius",
  "borderBottomLeftRadius",
  "borderBottomRightRadius",
  "border",
  "borderTop",
  "borderRight",
  "borderBottom",
  "borderLeft",
  "boxShadow",
  "textShadow",

  // Typography
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "letterSpacing",
  "lineHeight",
  "textAlign",
  "textTransform",
  "textDecoration",
  "whiteSpace",
  "wordBreak",
  "wordWrap",
]);

/**
 * Checks for unsupported CSS properties and values in an inline style map.
 */
export function checkUnsupportedProperties(style, ctx) {
  if (!style || !ctx || !Array.isArray(ctx.warnings)) return;
  for (const key of Object.keys(style)) {
    if (!key) continue;
    if (!SUPPORTED_CSS_PROPERTIES.has(key)) {
      const kebab = camelToKebab(key);
      const warn = formatUnsupportedPropertyWarning(kebab);
      if (!ctx.warnings.includes(warn)) {
        ctx.warnings.push(warn);
      }
    }
  }

  // Specific unsupported values for otherwise supported properties
  if (style.position === "sticky") {
    const warn = HTML_IMPORT_WARNING.unsupportedValue("position", "sticky");
    if (!ctx.warnings.includes(warn)) ctx.warnings.push(warn);
  }
  if (style.gridTemplateAreas) {
    const warn = HTML_IMPORT_WARNING.unsupportedValue(
      "grid-template-areas",
      "areas",
    );
    if (!ctx.warnings.includes(warn)) ctx.warnings.push(warn);
  }
}

/**
 * Computes container layout if display is flex or grid.
 */
export function computeContainerLayout(
  container,
  style,
  containerBox,
  ctx,
  helpers,
) {
  checkUnsupportedProperties(style, ctx);
  const display = String(style.display || "").toLowerCase();

  if (display === "flex" || display === "inline-flex") {
    return computeFlexLayout(
      container,
      style,
      container.children,
      containerBox,
      ctx,
      helpers,
    );
  }

  if (display === "grid" || display === "inline-grid") {
    return computeGridLayout(
      container,
      style,
      container.children,
      containerBox,
      ctx,
      helpers,
    );
  }

  return null;
}
