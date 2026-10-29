/** Shared normalization and sizing values for synchronous Auto Layout. */
const DIRECTIONS = new Set(["horizontal", "vertical"]);
const ALIGNMENTS = new Set(["start", "center", "end", "stretch"]);
const DISTRIBUTIONS = new Set([
  "start",
  "center",
  "end",
  "space-between",
  "space-around",
  "space-evenly",
]);

export function nonNegative(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

/** A nullable sizing constraint: `null` means "not set" in legacy documents. */
function optionalNonNegative(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : null;
}

/**
 * CSS `clamp()` semantics: apply the maximum first, then the minimum, so a
 * document whose min exceeds its max resolves to the min (never NaN / empty).
 */
export function clampDimension(value, min, max) {
  let size = nonNegative(value);
  if (max !== null) size = Math.min(size, max);
  if (min !== null) size = Math.max(size, min);
  return size;
}

function normalizePadding(value) {
  if (typeof value === "number") {
    const size = nonNegative(value);
    return { top: size, right: size, bottom: size, left: size };
  }
  if (Array.isArray(value)) {
    const [top = 0, right = top, bottom = top, left = right] = value;
    return {
      top: nonNegative(top),
      right: nonNegative(right),
      bottom: nonNegative(bottom),
      left: nonNegative(left),
    };
  }
  return {
    top: nonNegative(value?.top),
    right: nonNegative(value?.right),
    bottom: nonNegative(value?.bottom),
    left: nonNegative(value?.left),
  };
}

export function normalizeAutoLayout(value) {
  if (!value || !DIRECTIONS.has(value.direction)) return null;
  const gap = nonNegative(value.gap);
  return {
    direction: value.direction,
    wrap: value.wrap === true,
    gap,
    // New wrapped frames default their cross-axis gap to `gap`, so enabling
    // wrap on a legacy frame immediately looks like the frame's existing gap.
    crossGap: value.crossGap === null || value.crossGap === undefined
      ? gap
      : nonNegative(value.crossGap),
    padding: normalizePadding(value.padding),
    alignItems: ALIGNMENTS.has(value.alignItems) ? value.alignItems : "start",
    alignContent: DISTRIBUTIONS.has(value.alignContent)
      ? value.alignContent
      : "start",
    justifyContent: DISTRIBUTIONS.has(value.justifyContent)
      ? value.justifyContent
      : "start",
    widthMode: value.widthMode === "hug" ? "hug" : "fixed",
    heightMode: value.heightMode === "hug" ? "hug" : "fixed",
    minWidth: optionalNonNegative(value.minWidth),
    maxWidth: optionalNonNegative(value.maxWidth),
    minHeight: optionalNonNegative(value.minHeight),
    maxHeight: optionalNonNegative(value.maxHeight),
  };
}


/** Leading offset and extra gap for a distribution keyword. */
export function distributionOffsets(mode, free, count) {
  if (count <= 0) return { leading: 0, extra: 0 };
  switch (mode) {
    case "center":
      return { leading: free / 2, extra: 0 };
    case "end":
      return { leading: free, extra: 0 };
    case "space-between":
      return count > 1
        ? { leading: 0, extra: free / (count - 1) }
        : { leading: 0, extra: 0 };
    case "space-around":
      return { leading: free / (2 * count), extra: free / count };
    case "space-evenly":
      return {
        leading: free / (count + 1),
        extra: free / (count + 1),
      };
    default:
      return { leading: 0, extra: 0 };
  }
}

