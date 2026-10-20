/**
 * Pure layout utilities for CSS parsing in HTML import.
 */

export function toPx(value, fallback = null) {
  if (value == null || value === "" || value === "auto") return fallback;
  const num = Number.parseFloat(value);
  return Number.isFinite(num) ? num : fallback;
}

export function parsePadding(style) {
  if (style.padding != null && style.padding !== "") {
    const parts = String(style.padding)
      .trim()
      .split(/\s+/)
      .map((v) => toPx(v, 0));
    if (parts.length === 1) {
      return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
    }
    if (parts.length === 2) {
      return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
    }
    if (parts.length === 3) {
      return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
    }
    if (parts.length >= 4) {
      return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
    }
  }
  return {
    top: toPx(style.paddingTop, 0),
    right: toPx(style.paddingRight, 0),
    bottom: toPx(style.paddingBottom, 0),
    left: toPx(style.paddingLeft, 0),
  };
}

export function parseMargin(style) {
  if (style.margin != null && style.margin !== "") {
    const parts = String(style.margin)
      .trim()
      .split(/\s+/)
      .map((v) => toPx(v, 0));
    if (parts.length === 1) {
      return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
    }
    if (parts.length === 2) {
      return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
    }
    if (parts.length === 3) {
      return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
    }
    if (parts.length >= 4) {
      return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
    }
  }
  return {
    top: toPx(style.marginTop, 0),
    right: toPx(style.marginRight, 0),
    bottom: toPx(style.marginBottom, 0),
    left: toPx(style.marginLeft, 0),
  };
}

export function parseGap(style) {
  let rowGap = toPx(style.rowGap ?? style.gridRowGap);
  let colGap = toPx(style.columnGap ?? style.gridColumnGap);
  const gap = style.gap ?? style.gridGap;
  if (gap != null && gap !== "") {
    const parts = String(gap)
      .trim()
      .split(/\s+/)
      .map((v) => toPx(v, 0));
    if (parts.length === 1) {
      if (rowGap == null) rowGap = parts[0];
      if (colGap == null) colGap = parts[0];
    } else if (parts.length >= 2) {
      if (rowGap == null) rowGap = parts[0];
      if (colGap == null) colGap = parts[1];
    }
  }
  return { row: rowGap ?? 0, col: colGap ?? 0 };
}

export function camelToKebab(str) {
  return String(str).replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}
