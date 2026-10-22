/**
 * Plain-CSS writer.
 *
 * Emits a stylesheet with semantic class names plus the matching HTML skeleton
 * in a trailing comment, so one download is enough to hand the design to a
 * frontend. Declarations come from the same style plan the Tailwind writer maps
 * to utilities, which keeps both outputs geometrically identical.
 */

import { codeLength, codeNumber } from "./model.js";
import { CSS_DIALECT, renderDescriptor } from "./markup.js";

function px(value) {
  return `${codeNumber(value)}px`;
}

function radiusValue(radius) {
  if (radius.uniform !== undefined) return `${codeNumber(radius.uniform)}px`;
  return `${codeNumber(radius.tl)}px ${codeNumber(radius.tr)}px ${codeNumber(
    radius.br,
  )}px ${codeNumber(radius.bl)}px`;
}

function textDeclarations(text, declarations) {
  if (text.color) declarations.push(`color:${text.color}`);
  if (text.fontFamily) declarations.push(`font-family:${text.fontFamily}`);
  if (Number.isFinite(text.fontSize)) {
    declarations.push(`font-size:${px(Math.max(1, text.fontSize))}`);
  }
  if (text.fontWeight) declarations.push(`font-weight:${text.fontWeight}`);
  if (text.italic) declarations.push("font-style:italic");
  if (text.underline) declarations.push("text-decoration:underline");
  if (text.align) declarations.push(`text-align:${text.align}`);
  if (Number.isFinite(text.lineHeight)) {
    declarations.push(`line-height:${codeNumber(text.lineHeight)}`);
  }
  if (Number.isFinite(text.letterSpacing) && text.letterSpacing !== 0) {
    declarations.push(`letter-spacing:${px(text.letterSpacing)}`);
  }
  if (text.whiteSpace) declarations.push(`white-space:${text.whiteSpace}`);
  if (text.vertical) declarations.push("writing-mode:vertical-rl");
  if (text.stroke) {
    declarations.push(
      `-webkit-text-stroke:${px(text.stroke.width)} ${text.stroke.color}`,
    );
  }
  if (text.shadow) declarations.push(`text-shadow:${text.shadow}`);
}

/**
 * The ordered CSS declarations for one style plan. The field contract lives in
 * `serialize.js`; every value here has already passed the colour/geometry gates.
 */
export function planDeclarations(plan) {
  if (!plan) return [];
  const declarations = [];
  if (plan.position === "absolute") {
    declarations.push("position:absolute");
    if (plan.left !== null && plan.left !== undefined) {
      declarations.push(`left:${codeLength(plan.left)}`);
    }
    if (plan.top !== null && plan.top !== undefined) {
      declarations.push(`top:${codeLength(plan.top)}`);
    }
  } else if (plan.position === "root" || plan.relative) {
    declarations.push("position:relative");
  }
  if (plan.display === "flex") {
    declarations.push("display:flex");
    declarations.push(
      `flex-direction:${plan.flexDirection === "column" ? "column" : "row"}`,
    );
    if (plan.alignItems) declarations.push(`align-items:${plan.alignItems}`);
    if (plan.justifyContent) {
      declarations.push(`justify-content:${plan.justifyContent}`);
    }
    if (plan.flexWrap === "wrap") declarations.push("flex-wrap:wrap");
    if (plan.alignContent) {
      declarations.push(`align-content:${plan.alignContent}`);
    }
  }
  if (plan.grow) declarations.push("flex:1 1 0%");
  if (plan.selfStretch) declarations.push("align-self:stretch");
  const mainGap = Number.isFinite(plan.gap) ? plan.gap : 0;
  const crossGap = Number.isFinite(plan.rowGap) ? plan.rowGap : null;
  if (crossGap === null || crossGap === mainGap) {
    if (mainGap > 0) declarations.push(`gap:${px(mainGap)}`);
  } else {
    const column = plan.flexDirection === "column";
    const columnGap = column ? crossGap : mainGap;
    const rowGap = column ? mainGap : crossGap;
    if (columnGap > 0) declarations.push(`column-gap:${px(columnGap)}`);
    if (rowGap > 0) declarations.push(`row-gap:${px(rowGap)}`);
  }
  if (plan.padding) {
    const { top, right, bottom, left } = plan.padding;
    if (top === right && right === bottom && bottom === left) {
      if (top > 0) declarations.push(`padding:${px(top)}`);
    } else {
      declarations.push(
        `padding:${px(top)} ${px(right)} ${px(bottom)} ${px(left)}`,
      );
    }
  }
  if (plan.width !== null && plan.width !== undefined) {
    declarations.push(`width:${codeLength(plan.width)}`);
  }
  if (plan.height !== null && plan.height !== undefined) {
    declarations.push(`height:${codeLength(plan.height)}`);
  }
  if (Number.isFinite(plan.minWidth)) declarations.push(`min-width:${px(plan.minWidth)}`);
  if (Number.isFinite(plan.maxWidth)) declarations.push(`max-width:${px(plan.maxWidth)}`);
  if (Number.isFinite(plan.minHeight)) declarations.push(`min-height:${px(plan.minHeight)}`);
  if (Number.isFinite(plan.maxHeight)) declarations.push(`max-height:${px(plan.maxHeight)}`);
  if (plan.background) {
    declarations.push(
      plan.background.type === "gradient"
        ? `background-image:${plan.background.value}`
        : `background:${plan.background.value}`,
    );
  }
  if (plan.border) {
    declarations.push(
      `border:${px(Math.max(0, plan.border.width))} solid ${plan.border.color}`,
    );
  }
  if (plan.radiusFull) declarations.push("border-radius:50%");
  else if (plan.radius) {
    declarations.push(`border-radius:${radiusValue(plan.radius)}`);
  }
  if (plan.overflow) declarations.push("overflow:hidden");
  if (plan.objectFit) declarations.push(`object-fit:${plan.objectFit}`);
  if (plan.maxWidthNone) declarations.push("max-width:none");
  if (plan.text) textDeclarations(plan.text, declarations);
  if (Number.isFinite(plan.opacity) && plan.opacity < 1) {
    declarations.push(`opacity:${codeNumber(Math.max(0, Math.min(1, plan.opacity)))}`);
  }
  if (plan.transform) {
    const transforms = [];
    if (plan.transform.rotate) {
      transforms.push(`rotate(${codeNumber(plan.transform.rotate)}deg)`);
    }
    if (plan.transform.skewX) {
      transforms.push(`skewX(${codeNumber(plan.transform.skewX)}deg)`);
    }
    if (
      plan.transform.scaleX !== undefined ||
      plan.transform.scaleY !== undefined
    ) {
      transforms.push(
        `scale(${codeNumber(plan.transform.scaleX ?? 1)}, ${codeNumber(
          plan.transform.scaleY ?? 1,
        )})`,
      );
    }
    if (transforms.length > 0) declarations.push(`transform:${transforms.join(" ")}`);
  }
  if (plan.mixBlendMode) {
    declarations.push(`mix-blend-mode:${plan.mixBlendMode}`);
  }
  if (plan.boxShadow) declarations.push(`box-shadow:${plan.boxShadow}`);
  return declarations;
}

function cssRule(descriptor) {
  const declarations = planDeclarations(descriptor.plan);
  return `.${descriptor.cssClass}{${declarations.join(";")}}`;
}

/** A stylesheet plus the HTML skeleton that consumes its class names. */
export function generateCss(renderTree) {
  const rules = [];
  const walk = (descriptor) => {
    rules.push(cssRule(descriptor));
    descriptor.children.forEach(walk);
  };
  walk(renderTree.root);
  const skeleton = renderDescriptor(renderTree.root, CSS_DIALECT, 0).replace(
    /\*\//g,
    "* /",
  );
  return [
    "/* VOO Design — exported CSS. Layout mirrors the document at 1:1. */",
    ".voo-root,.voo-root *{box-sizing:border-box}",
    ...rules,
    "",
    "/* --- HTML skeleton",
    skeleton,
    "--- */",
    "",
  ].join("\n");
}
