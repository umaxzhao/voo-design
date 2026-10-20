/**
 * Pixel boundary verification for region-scoped editor mutations.
 *
 * This module deliberately knows nothing about the editor or React. Callers
 * provide RGBA readbacks and a selection mask, making the safety rule easy to
 * exercise in Node and reusable by hosted/editor runtimes.
 */

/** Maximum tolerated outside-pixel drift. */
export const REGION_GUARD_TOLERANCE = Object.freeze({
  outsideChangedRatio: 0.01,
  channelDelta: 2,
});

function isPixelBuffer(value) {
  return value && typeof value.length === "number";
}

function pixelData(value) {
  return value?.data ?? value;
}

/**
 * Diffs only pixels outside a selection mask.
 *
 * @param {ArrayLike<number>} before RGBA pixels
 * @param {ArrayLike<number>} after RGBA pixels
 * @param {ArrayLike<number>} mask one value per pixel, or RGBA mask data
 * @param {{ channelDelta?: number, maskThreshold?: number }} [options]
 * @returns {{ outsideChangedRatio: number, changedOutsidePixels: number, outsidePixels: number, verdict: "pass"|"violation" }}
 */
export function diffOutsideMask(before, after, mask, options = {}) {
  const beforeData = pixelData(before);
  const afterData = pixelData(after);
  const maskData = pixelData(mask);
  if (
    !isPixelBuffer(beforeData) ||
    !isPixelBuffer(afterData) ||
    !isPixelBuffer(maskData)
  ) {
    throw new TypeError(
      "Region guard requires before, after, and mask pixel buffers",
    );
  }
  if (beforeData.length !== afterData.length || beforeData.length % 4 !== 0) {
    throw new RangeError(
      "Region guard RGBA buffers must have equal pixel-aligned lengths",
    );
  }
  const pixelCount = beforeData.length / 4;
  if (maskData.length !== pixelCount && maskData.length !== pixelCount * 4) {
    throw new RangeError(
      "Region guard mask must contain one value per pixel or RGBA data",
    );
  }

  const channelDelta =
    options.channelDelta ?? REGION_GUARD_TOLERANCE.channelDelta;
  const maskThreshold = options.maskThreshold ?? 0;
  let outsidePixels = 0;
  let changedOutsidePixels = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const maskValue =
      maskData.length === pixelCount
        ? maskData[pixel]
        : maskData[pixel * 4 + 3];
    if (maskValue > maskThreshold) continue;
    outsidePixels += 1;
    const offset = pixel * 4;
    const changed = [0, 1, 2, 3].some(
      (channel) =>
        Math.abs(beforeData[offset + channel] - afterData[offset + channel]) >
        channelDelta,
    );
    if (changed) changedOutsidePixels += 1;
  }
  const outsideChangedRatio =
    outsidePixels === 0 ? 0 : changedOutsidePixels / outsidePixels;
  return {
    outsideChangedRatio,
    changedOutsidePixels,
    outsidePixels,
    verdict:
      outsideChangedRatio >
      (options.outsideChangedRatio ??
        REGION_GUARD_TOLERANCE.outsideChangedRatio)
        ? "violation"
        : "pass",
  };
}

/**
 * Verifies readbacks, degrading explicitly when a runtime cannot read pixels.
 */
export function verifyRegionBoundary(before, after, mask, options = {}) {
  if (
    before?.unavailable ||
    after?.unavailable ||
    mask?.unavailable ||
    !before ||
    !after ||
    !mask
  ) {
    return {
      outsideChangedRatio: null,
      verdict: "unverifiable",
      reason: "Pixel readback or selection mask is unavailable",
    };
  }
  return diffOutsideMask(before, after, mask, options);
}

/** Build an opaque rectangular mask when a caller supplies bounds only. */
export function rectangularRegionMask(width, height, region) {
  const mask = new Uint8Array(width * height);
  const left = Math.max(0, Math.floor(region?.x ?? 0));
  const top = Math.max(0, Math.floor(region?.y ?? 0));
  const right = Math.min(width, Math.ceil(left + (region?.width ?? 0)));
  const bottom = Math.min(height, Math.ceil(top + (region?.height ?? 0)));
  for (let y = top; y < bottom; y += 1) {
    mask.fill(255, y * width + left, y * width + right);
  }
  return mask;
}

/**
 * Wraps a region mutation with readback verification. The adapter and rollback
 * callbacks are injected by the agent loop, so this remains usable in Node.
 */
export function guardRegionMutation(execute, { createError } = {}) {
  return async function guardedRegionMutation(args, context) {
    const readPixels = context?.getCanvasPixels;
    const readMask = context?.getRegionMask ?? context?.getSelectionMask;
    const before = typeof readPixels === "function" ? await readPixels() : null;
    const mask =
      typeof readMask === "function"
        ? await readMask(args)
        : (context?.selectionMask ?? null);
    const result = await execute(args, context);
    const after = typeof readPixels === "function" ? await readPixels() : null;
    const verification = verifyRegionBoundary(
      before,
      after,
      mask,
      context?.regionGuardOptions,
    );
    if (verification.verdict === "violation") {
      const rollback = context?.rollbackChangeSet ?? context?.revertChangeSet;
      if (typeof rollback === "function") await rollback(context?.undoData);
      const error =
        createError?.(
          "REGION_BOUNDARY_VIOLATION",
          "Region mutation changed pixels outside the selected area.",
          { details: { verification } },
        ) ??
        Object.assign(
          new Error(
            "Region mutation changed pixels outside the selected area.",
          ),
          {
            code: "REGION_BOUNDARY_VIOLATION",
            details: { verification },
          },
        );
      throw error;
    }
    return { ...(result ?? {}), verification };
  };
}
