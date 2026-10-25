/**
 * Dev-handoff readouts for the Inspect panel: a CSS declaration block and a
 * Tailwind class list for one layer. Pure, so the output is testable and the
 * panel stays a view.
 */

import { codeLength, colorValue, isGradientFill } from "../codegen/model.js";

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function px(value) {
  return `${Math.round(Number(value) || 0)}px`;
}

function fillValue(node) {
  const paint =
    Array.isArray(node?.fills) && node.fills.length ? node.fills[0] : null;
  const value = paint?.fill ?? node?.fill ?? null;
  return typeof value === "string" && value !== "transparent" ? value : null;
}

function backgroundFor(node) {
  const value = fillValue(node);
  return value ? colorValue(value) : "transparent";
}

/** Plain CSS for the selected layer (absolute positioning, appearance, text). */
export function inspectCss(node) {
  if (!node) return "";
  const lines = ["position: absolute;"];
  lines.push(`left: ${px(node.x)};`);
  lines.push(`top: ${px(node.y)};`);
  lines.push(`width: ${px(node.width)};`);
  lines.push(`height: ${px(node.height)};`);
  if (node.rotation) lines.push(`transform: rotate(${Number(node.rotation)}deg);`);
  const background = backgroundFor(node);
  if (background !== "transparent" && background !== "none") {
    lines.push(`background: ${background};`);
  }
  if (node.stroke && node.stroke !== "transparent") {
    lines.push(`border: ${px(node.strokeWidth ?? 1)} solid ${colorValue(node.stroke)};`);
  }
  if (node.cornerRadius) {
    lines.push(`border-radius: ${px(node.cornerRadius)};`);
  }
  if (node.opacity != null && node.opacity !== 1) {
    lines.push(`opacity: ${Number(node.opacity)};`);
  }
  if (node.blendMode && node.blendMode !== "normal") {
    lines.push(`mix-blend-mode: ${node.blendMode};`);
  }
  if (node.kind === "text") {
    if (node.fontFamily) lines.push(`font-family: "${node.fontFamily}";`);
    if (node.fontSize) lines.push(`font-size: ${px(node.fontSize)};`);
    if (node.fontWeight) lines.push(`font-weight: ${Number(node.fontWeight)};`);
    if (node.lineHeight) lines.push(`line-height: ${Number(node.lineHeight)};`);
    if (node.letterSpacing)
      lines.push(`letter-spacing: ${px(node.letterSpacing)};`);
    if (node.textAlign) lines.push(`text-align: ${node.textAlign};`);
    if (node.fill) lines.push(`color: ${colorValue(node.fill)};`);
  }
  if (Array.isArray(node.effects) && node.effects.length) {
    const shadows = node.effects
      .filter((effect) => effect?.kind === "shadow" && effect.visible !== false)
      .map(
        (effect) =>
          `${px(effect.x ?? 0)} ${px(effect.y ?? 0)} ${px(effect.blur ?? 0)} ${px(effect.spread ?? 0)} ${colorValue(effect.colour ?? "#000000")}`,
      );
    if (shadows.length) lines.push(`box-shadow: ${shadows.join(", ")};`);
  }
  return lines.join("\n");
}

function tailwindColour(prefix, value, important = "") {
  if (!value || value === "transparent") return [];
  if (isGradientFill(value)) return [`${prefix}-gradient`];
  if (HEX.test(value)) return [`${prefix}-[${value.toUpperCase()}]`];
  return [];
}

/** Tailwind utilities for the selected layer's box, paint and typography. */
export function inspectTailwind(node, { important = "" } = {}) {
  if (!node) return "";
  const classes = [
    "absolute",
    `left-[${Math.round(Number(node.x) || 0)}px]`,
    `top-[${Math.round(Number(node.y) || 0)}px]`,
    `w-[${Math.round(Number(node.width) || 0)}px]`,
    `h-[${Math.round(Number(node.height) || 0)}px]`,
  ];
  const value = fillValue(node);
  if (value) {
    classes.push(...tailwindColour("bg", value));
    if (isGradientFill(value)) classes.push("bg-cover");
  }
  if (node.cornerRadius) classes.push(`rounded-[${Math.round(node.cornerRadius)}px]`);
  if (node.stroke && node.stroke !== "transparent") {
    const width = Math.round(Number(node.strokeWidth) || 1);
    classes.push(`border-[${width}px]`, ...tailwindColour("border", node.stroke));
  }
  if (node.opacity != null && node.opacity !== 1) classes.push(`opacity-[${node.opacity}]`);
  if (node.kind === "text") {
    if (node.fontSize) classes.push(`text-[${Math.round(node.fontSize)}px]`);
    if (node.fontWeight) classes.push(`font-[${Math.round(node.fontWeight)}]`);
    if (node.fontFamily)
      classes.push(`font-['${String(node.fontFamily).replace(/\s+/g, "_")}']`);
    if (node.letterSpacing) classes.push(`tracking-[${Math.round(node.letterSpacing)}px]`);
    if (node.textAlign === "center") classes.push("text-center");
    else if (node.textAlign === "right") classes.push("text-right");
  }
  return classes.join(" ") + important;
}

/** Formatting helpers the panel shows next to each geometry row. */
export function inspectNumber(value, suffix = "") {
  if (value == null || value === "") return "—";
  return `${Math.round(Number(value) * 100) / 100}${suffix}`;
}

export { codeLength };
