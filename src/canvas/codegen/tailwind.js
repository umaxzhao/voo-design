/**
 * Tailwind CSS class mapping for the code exporter.
 *
 * A serialised node hands this module a plain style plan (see `serialize.js`);
 * every utility is emitted in one fixed order so the generated class list is
 * stable across runs and diffable. Values stay arbitrary (`w-[123.5px]`) rather
 * than being snapped to the app's own design ladder: this is handoff code that
 * must reproduce the artwork pixel for pixel, not VOO chrome.
 */

import { codeLength, codeNumber } from "./model.js";

const FONT_WEIGHT_CLASS = Object.freeze({
  100: "font-thin",
  200: "font-extralight",
  300: "font-light",
  normal: "font-normal",
  400: "font-normal",
  500: "font-medium",
  600: "font-semibold",
  700: "font-bold",
  800: "font-extrabold",
  900: "font-black",
  bold: "font-bold",
});

const ALIGN_ITEMS_CLASS = Object.freeze({
  "flex-start": "items-start",
  center: "items-center",
  "flex-end": "items-end",
  stretch: "items-stretch",
});

const ALIGN_CONTENT_CLASS = Object.freeze({
  "flex-start": "content-start",
  center: "content-center",
  "flex-end": "content-end",
  "space-between": "content-between",
  "space-around": "content-around",
  "space-evenly": "content-evenly",
});

const JUSTIFY_CLASS = Object.freeze({
  "flex-start": "justify-start",
  center: "justify-center",
  "flex-end": "justify-end",
  "space-between": "justify-between",
  "space-around": "justify-around",
  "space-evenly": "justify-evenly",
});

const TEXT_ALIGN_CLASS = Object.freeze({
  left: "text-left",
  center: "text-center",
  right: "text-right",
  justify: "text-justify",
});

/** Tailwind reads `_` as a space inside an arbitrary value. */
export function arbitraryValue(value) {
  return String(value).replace(/\s+/g, "_");
}

export function colorClass(prefix, value) {
  return `${prefix}-[${arbitraryValue(value)}]`;
}

export function lengthClass(prefix, value) {
  if (value === null || value === undefined) return null;
  return `${prefix}-[${arbitraryValue(codeLength(value))}]`;
}

export function radiusClasses(radius) {
  if (!radius) return [];
  if (radius.uniform !== undefined) {
    return radius.uniform > 0 ? [lengthClass("rounded", radius.uniform)] : [];
  }
  const classes = [];
  const corners = [
    ["tl", "rounded-tl"],
    ["tr", "rounded-tr"],
    ["br", "rounded-br"],
    ["bl", "rounded-bl"],
  ];
  for (const [key, prefix] of corners) {
    const value = radius[key];
    if (value > 0) classes.push(lengthClass(prefix, value));
  }
  return classes;
}

function paddingClasses(padding) {
  const { top, right, bottom, left } = padding;
  if (top === right && right === bottom && bottom === left) {
    return top > 0 ? [lengthClass("p", top)] : [];
  }
  const classes = [];
  if (top > 0) classes.push(lengthClass("pt", top));
  if (right > 0) classes.push(lengthClass("pr", right));
  if (bottom > 0) classes.push(lengthClass("pb", bottom));
  if (left > 0) classes.push(lengthClass("pl", left));
  return classes;
}

function transformClasses(transform) {
  if (!transform) return [];
  const classes = [];
  if (transform.rotate) classes.push(lengthClass("rotate", `${codeNumber(transform.rotate)}deg`));
  if (transform.skewX) classes.push(lengthClass("skew-x", `${codeNumber(transform.skewX)}deg`));
  if (transform.scaleX !== undefined && transform.scaleX !== 1) {
    classes.push(
      transform.scaleX === -1
        ? "-scale-x-100"
        : lengthClass("scale-x", codeNumber(transform.scaleX)),
    );
  }
  if (transform.scaleY !== undefined && transform.scaleY !== 1) {
    classes.push(
      transform.scaleY === -1
        ? "-scale-y-100"
        : lengthClass("scale-y", codeNumber(transform.scaleY)),
    );
  }
  return classes;
}

function textClasses(text) {
  const classes = [];
  if (text.color) classes.push(colorClass("text", text.color));
  if (text.fontFamily) {
    classes.push(`font-[${arbitraryValue(text.fontFamily)}]`);
  }
  if (Number.isFinite(text.fontSize)) {
    classes.push(lengthClass("text", Math.max(1, text.fontSize)));
  }
  const weight = FONT_WEIGHT_CLASS[String(text.fontWeight ?? "normal")];
  if (weight) classes.push(weight);
  if (text.italic) classes.push("italic");
  if (text.underline) classes.push("underline");
  if (TEXT_ALIGN_CLASS[text.align]) classes.push(TEXT_ALIGN_CLASS[text.align]);
  if (Number.isFinite(text.lineHeight)) classes.push(`leading-[${codeNumber(text.lineHeight)}]`);
  if (Number.isFinite(text.letterSpacing) && text.letterSpacing !== 0) {
    classes.push(lengthClass("tracking", text.letterSpacing));
  }
  if (text.whiteSpace === "pre") classes.push("whitespace-pre");
  if (text.whiteSpace === "pre-wrap") classes.push("whitespace-pre-wrap");
  if (text.vertical) classes.push("[writing-mode:vertical-rl]");
  if (text.stroke) {
    classes.push(
      `[-webkit-text-stroke:${arbitraryValue(
        `${codeNumber(text.stroke.width)}px ${text.stroke.color}`,
      )}]`,
    );
  }
  if (text.shadow) {
    classes.push(`[text-shadow:${arbitraryValue(text.shadow)}]`);
  }
  return classes;
}

/**
 * The ordered Tailwind utility list for one style plan.
 *
 * `plan` is produced by `serialize.js`; see that module for the field contract.
 */
export function tailwindClasses(plan) {
  if (!plan) return [];
  const classes = [];
  if (plan.position === "absolute") classes.push("absolute");
  if (plan.position === "absolute" || plan.relative) {
    if (plan.position === "absolute") {
      if (plan.left !== null && plan.left !== undefined) {
        classes.push(lengthClass("left", plan.left));
      }
      if (plan.top !== null && plan.top !== undefined) {
        classes.push(lengthClass("top", plan.top));
      }
    }
    if (plan.relative) classes.push("relative");
  }
  if (plan.display === "flex") {
    classes.push("flex", plan.flexDirection === "column" ? "flex-col" : "flex-row");
    if (plan.flexWrap === "wrap") classes.push("flex-wrap");
    if (ALIGN_ITEMS_CLASS[plan.alignItems]) {
      classes.push(ALIGN_ITEMS_CLASS[plan.alignItems]);
    }
    if (JUSTIFY_CLASS[plan.justifyContent]) {
      classes.push(JUSTIFY_CLASS[plan.justifyContent]);
    }
    if (ALIGN_CONTENT_CLASS[plan.alignContent]) {
      classes.push(ALIGN_CONTENT_CLASS[plan.alignContent]);
    }
  }
  if (plan.grow) classes.push("flex-1");
  if (plan.selfStretch) classes.push("self-stretch");
  const mainGap = Number.isFinite(plan.gap) ? plan.gap : 0;
  const crossGap = Number.isFinite(plan.rowGap) ? plan.rowGap : null;
  if (crossGap === null || crossGap === mainGap) {
    if (mainGap > 0) classes.push(lengthClass("gap", mainGap));
  } else {
    // A wrapped frame can space its lines differently from its items.
    const column = plan.flexDirection === "column";
    const columnGap = column ? crossGap : mainGap;
    const rowGap = column ? mainGap : crossGap;
    if (columnGap > 0) classes.push(lengthClass("gap-x", columnGap));
    if (rowGap > 0) classes.push(lengthClass("gap-y", rowGap));
  }
  if (plan.padding) classes.push(...paddingClasses(plan.padding));
  if (plan.width !== null && plan.width !== undefined) {
    classes.push(lengthClass("w", plan.width));
  }
  if (plan.height !== null && plan.height !== undefined) {
    classes.push(lengthClass("h", plan.height));
  }
  if (Number.isFinite(plan.minWidth)) classes.push(lengthClass("min-w", plan.minWidth));
  if (Number.isFinite(plan.maxWidth)) classes.push(lengthClass("max-w", plan.maxWidth));
  if (Number.isFinite(plan.minHeight)) classes.push(lengthClass("min-h", plan.minHeight));
  if (Number.isFinite(plan.maxHeight)) classes.push(lengthClass("max-h", plan.maxHeight));
  if (plan.background) {
    classes.push(
      plan.background.type === "gradient"
        ? `bg-[image:${arbitraryValue(plan.background.value)}]`
        : colorClass("bg", plan.background.value),
    );
  }
  if (plan.border) {
    classes.push(
      lengthClass("border", Math.max(0, plan.border.width)),
      "border-solid",
      colorClass("border", plan.border.color),
    );
  }
  if (plan.radiusFull) classes.push("rounded-full");
  if (plan.radius) classes.push(...radiusClasses(plan.radius));
  if (plan.overflow) classes.push("overflow-hidden");
  if (plan.objectFit === "cover") classes.push("object-cover");
  if (plan.maxWidthNone) classes.push("max-w-none");
  if (plan.text) classes.push(...textClasses(plan.text));
  if (Number.isFinite(plan.opacity) && plan.opacity < 1) {
    classes.push(`opacity-[${codeNumber(Math.max(0, Math.min(1, plan.opacity)))}]`);
  }
  if (plan.transform) classes.push(...transformClasses(plan.transform));
  if (plan.mixBlendMode) classes.push(`mix-blend-${plan.mixBlendMode}`);
  if (plan.boxShadow) {
    classes.push(`shadow-[${arbitraryValue(plan.boxShadow)}]`);
  }
  return classes.filter(Boolean);
}

/** The joined class attribute for a style plan. */
export function tailwindClassName(plan) {
  return tailwindClasses(plan).join(" ");
}
