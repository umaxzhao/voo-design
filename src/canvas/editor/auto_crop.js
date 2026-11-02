import { subjectBounds } from "./subject-bounds.js";
export { subjectBounds } from "./subject-bounds.js";

/**
 * Pure auto crop engine — subject-aware framing for design canvases and images.
 *
 * Given image dimensions, target aspect ratio (e.g. 1:1, 9:16, 16:9, 4:5), and
 * an optional subject alpha mask or visual saliency map, this module calculates
 * an optimal crop window { x, y, width, height, confidence, reason } that keeps
 * the subject visual center anchored to rule-of-thirds focal points.
 *
 * Constraints:
 * - Pure logic: no DOM, no Canvas API, deterministic execution.
 * - Non-destructive: outputs pixel coordinate rectangles strictly inside the image.
 * - Fallbacks: degrades to deterministic centered heuristics with explicit reasons.
 */

export const PRESET_RATIOS = Object.freeze({
  "1:1": Object.freeze({ ratioWidth: 1, ratioHeight: 1 }),
  square: Object.freeze({ ratioWidth: 1, ratioHeight: 1 }),
  "16:9": Object.freeze({ ratioWidth: 16, ratioHeight: 9 }),
  landscape: Object.freeze({ ratioWidth: 16, ratioHeight: 9 }),
  slide169: Object.freeze({ ratioWidth: 16, ratioHeight: 9 }),
  "9:16": Object.freeze({ ratioWidth: 9, ratioHeight: 16 }),
  portrait: Object.freeze({ ratioWidth: 9, ratioHeight: 16 }),
  story: Object.freeze({ ratioWidth: 9, ratioHeight: 16 }),
  reel: Object.freeze({ ratioWidth: 9, ratioHeight: 16 }),
  "4:3": Object.freeze({ ratioWidth: 4, ratioHeight: 3 }),
  "3:4": Object.freeze({ ratioWidth: 3, ratioHeight: 4 }),
  "4:5": Object.freeze({ ratioWidth: 4, ratioHeight: 5 }),
  feed: Object.freeze({ ratioWidth: 4, ratioHeight: 5 }),
  "5:4": Object.freeze({ ratioWidth: 5, ratioHeight: 4 }),
  "3:2": Object.freeze({ ratioWidth: 3, ratioHeight: 2 }),
  "2:3": Object.freeze({ ratioWidth: 2, ratioHeight: 3 }),
  "2:1": Object.freeze({ ratioWidth: 2, ratioHeight: 1 }),
  "1:2": Object.freeze({ ratioWidth: 1, ratioHeight: 2 }),
});

/**
 * Parses any ratio representation (preset ID, "W:H" string, number, or { ratioWidth, ratioHeight }).
 * Throws when ratio is non-positive, zero, NaN, or unparseable.
 */
export function parseTargetRatio(ratioSpec) {
  if (ratioSpec === null || ratioSpec === undefined) {
    throw new Error("Target ratio is required");
  }
  if (typeof ratioSpec === "number") {
    if (!Number.isFinite(ratioSpec) || ratioSpec <= 0) {
      throw new Error(`Invalid numeric ratio: ${ratioSpec}`);
    }
    return { ratioWidth: ratioSpec, ratioHeight: 1, ratio: ratioSpec };
  }
  if (typeof ratioSpec === "string") {
    const trimmed = ratioSpec.trim();
    const preset = PRESET_RATIOS[trimmed] || PRESET_RATIOS[trimmed.toLowerCase()];
    if (preset) {
      return { ratioWidth: preset.ratioWidth, ratioHeight: preset.ratioHeight, ratio: preset.ratioWidth / preset.ratioHeight };
    }
    const parts = trimmed.split(/[:/]/).map(Number);
    if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
      return { ratioWidth: parts[0], ratioHeight: parts[1], ratio: parts[0] / parts[1] };
    }
    const num = Number.parseFloat(trimmed);
    if (Number.isFinite(num) && num > 0) {
      return { ratioWidth: num, ratioHeight: 1, ratio: num };
    }
    throw new Error(`Unrecognized ratio string: "${ratioSpec}"`);
  }
  if (typeof ratioSpec === "object") {
    const rw = ratioSpec.ratioWidth ?? ratioSpec.width ?? ratioSpec.w;
    const rh = ratioSpec.ratioHeight ?? ratioSpec.height ?? ratioSpec.h;
    if (typeof rw === "number" && typeof rh === "number") {
      if (Number.isFinite(rw) && Number.isFinite(rh) && rw > 0 && rh > 0) {
        return { ratioWidth: rw, ratioHeight: rh, ratio: rw / rh };
      }
      throw new Error(`Invalid ratio object dimensions: ${rw}x${rh}`);
    }
    if (typeof ratioSpec.ratio === "number" && Number.isFinite(ratioSpec.ratio) && ratioSpec.ratio > 0) {
      return { ratioWidth: ratioSpec.ratio, ratioHeight: 1, ratio: ratioSpec.ratio };
    }
  }
  throw new Error(`Invalid target ratio specification: ${String(ratioSpec)}`);
}

/**
 * Calculates crop dimensions { width, height } matching targetRatio.
 * Subject padding expands window; if subject exceeds ratio bounds, padding
 * is reduced to zero before compromising subject completeness.
 */
export function windowForRatio(subject, imageWidth, imageHeight, targetRatio, options = {}) {
  const padding = options.padding !== undefined ? Number(options.padding) : 0.1;
  if (!Number.isFinite(padding) || padding < 0) {
    throw new TypeError("padding must be a non-negative number");
  }

  // Maximum window of targetRatio that physically fits inside the image
  let maxW;
  let maxH;
  if (imageWidth / imageHeight >= targetRatio) {
    maxH = imageHeight;
    maxW = Math.min(imageWidth, Math.round(maxH * targetRatio));
  } else {
    maxW = imageWidth;
    maxH = Math.min(imageHeight, Math.round(maxW / targetRatio));
  }

  if (!subject) {
    return { width: Math.max(1, maxW), height: Math.max(1, maxH) };
  }

  const desiredW = subject.width * (1 + 2 * padding);
  const desiredH = subject.height * (1 + 2 * padding);
  const reqW = Math.max(desiredW, desiredH * targetRatio);

  // Minimum window needed to cover raw subject without padding
  const minSubW = Math.max(subject.width, subject.height * targetRatio);
  const minSubH = minSubW / targetRatio;

  let cropW;
  let cropH;
  if (minSubW <= maxW && minSubH <= maxH) {
    cropW = Math.min(maxW, Math.max(Math.round(minSubW), Math.round(reqW)));
    cropH = Math.round(cropW / targetRatio);
    if (cropH > maxH) {
      cropH = maxH;
      cropW = Math.min(imageWidth, Math.round(cropH * targetRatio));
    }
  } else {
    cropW = maxW;
    cropH = maxH;
  }

  return {
    width: Math.max(1, Math.min(imageWidth, cropW)),
    height: Math.max(1, Math.min(imageHeight, cropH)),
  };
}

/**
 * Solves window position (x, y) considering subject centroid and Rule of Thirds.
 * Uses a piecewise continuous anchor function to guarantee strict monotonicity.
 */
export function positionCropWindow(subject, imageWidth, imageHeight, cropW, cropH, options = {}) {
  if (options.maxShift !== undefined && options.maxShift !== null) {
    const maxShift = Number(options.maxShift);
    if (!Number.isFinite(maxShift) || maxShift < 0) {
      throw new TypeError("maxShift must be a non-negative number");
    }
  }

  if (!subject) {
    return {
      x: Math.max(0, Math.min(imageWidth - cropW, Math.floor((imageWidth - cropW) / 2))),
      y: Math.max(0, Math.min(imageHeight - cropH, Math.floor((imageHeight - cropH) / 2))),
    };
  }

  const { cx, cy } = subject;
  const useRuleOfThirds = options.ruleOfThirds !== false;

  // Piecewise continuous anchor: u<=1/3 -> 1/3; u>=2/3 -> 2/3; 1/3<u<2/3 -> smooth linear connection.
  let targetX;
  if (useRuleOfThirds && imageWidth > 0) {
    const u = cx / imageWidth;
    const tx = u <= 1 / 3 ? 1 / 3 : u >= 2 / 3 ? 2 / 3 : u;
    targetX = cx - tx * cropW;
  } else {
    targetX = cx - 0.5 * cropW;
  }

  let targetY;
  if (useRuleOfThirds && imageHeight > 0) {
    const v = cy / imageHeight;
    const ty = v <= 1 / 3 ? 1 / 3 : v >= 2 / 3 ? 2 / 3 : v;
    targetY = cy - ty * cropH;
  } else {
    targetY = cy - 0.5 * cropH;
  }

  if (options.maxShift !== undefined && options.maxShift !== null) {
    const maxShift = Number(options.maxShift);
    const centerX = (imageWidth - cropW) / 2;
    const centerY = (imageHeight - cropH) / 2;
    const limitX = maxShift <= 1 ? maxShift * imageWidth : maxShift;
    const limitY = maxShift <= 1 ? maxShift * imageHeight : maxShift;
    targetX = centerX + Math.max(-limitX, Math.min(limitX, targetX - centerX));
    targetY = centerY + Math.max(-limitY, Math.min(limitY, targetY - centerY));
  }

  // Prioritize subject completeness: keep subject bounds unclipped when window fits
  if (subject.width <= cropW) {
    const minAcceptableX = Math.max(0, subject.x + subject.width - cropW);
    const maxAcceptableX = Math.min(imageWidth - cropW, subject.x);
    if (minAcceptableX <= maxAcceptableX) {
      targetX = Math.max(minAcceptableX, Math.min(maxAcceptableX, targetX));
    }
  } else {
    targetX = subject.x + (subject.width - cropW) / 2;
  }

  if (subject.height <= cropH) {
    const minAcceptableY = Math.max(0, subject.y + subject.height - cropH);
    const maxAcceptableY = Math.min(imageHeight - cropH, subject.y);
    if (minAcceptableY <= maxAcceptableY) {
      targetY = Math.max(minAcceptableY, Math.min(maxAcceptableY, targetY));
    }
  } else {
    targetY = subject.y + (subject.height - cropH) / 2;
  }

  return {
    x: Math.max(0, Math.min(imageWidth - cropW, Math.round(targetX))),
    y: Math.max(0, Math.min(imageHeight - cropH, Math.round(targetY))),
  };
}

/**
 * Normalizes resolveAutoCrop arguments into a unified structure.
 */
function normalizeCropArgs(first, second, third, fourth) {
  let width;
  let height;
  let targetRatio;
  let options;

  if (typeof first === "number") {
    width = first;
    height = second;
    targetRatio = third;
    options = fourth || {};
  } else if (first && typeof first === "object" && typeof first.width === "number" && typeof first.height === "number") {
    width = first.width;
    height = first.height;
    if (second !== undefined && (typeof second === "string" || typeof second === "number" || typeof second === "object")) {
      targetRatio = second;
      options = third || {};
    } else {
      targetRatio = first.targetRatio ?? first.ratio;
      options = second || first.options || first;
    }
  } else {
    throw new TypeError("Invalid image dimensions: width and height must be positive numbers");
  }

  const mask = options.mask ?? first?.mask;
  const saliency = options.saliency ?? first?.saliency;
  const mergedOptions = {
    ...options,
    ...(first?.padding !== undefined ? { padding: first.padding } : {}),
    ...(first?.maxShift !== undefined ? { maxShift: first.maxShift } : {}),
    ...(first?.ruleOfThirds !== undefined ? { ruleOfThirds: first.ruleOfThirds } : {}),
  };

  return { width, height, targetRatio, mask, saliency, options: mergedOptions };
}

/**
 * Primary entry point: computes optimal subject-aware auto crop window.
 *
 * @returns {{ x: number, y: number, width: number, height: number, confidence: number, reason: string }}
 */
export function resolveAutoCrop(first, second, third, fourth) {
  const { width, height, targetRatio, mask, saliency, options } = normalizeCropArgs(
    first,
    second,
    third,
    fourth,
  );

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new TypeError(`Invalid image dimensions: ${width}x${height}`);
  }

  const parsedRatio = parseTargetRatio(targetRatio);
  const pixelCount = width * height;

  if (mask !== undefined && mask !== null) {
    if (!mask.length && mask.length !== 0) {
      throw new TypeError("Mask must be an array-like buffer (Uint8ClampedArray/Float32Array)");
    }
    if (mask.length !== pixelCount) {
      throw new Error(`Mask length (${mask.length}) does not match image dimensions (${pixelCount})`);
    }
  }

  if (saliency !== undefined && saliency !== null) {
    if (!saliency.length && saliency.length !== 0) {
      throw new TypeError("Saliency must be an array-like buffer (Uint8ClampedArray/Float32Array)");
    }
    if (saliency.length !== pixelCount) {
      throw new Error(`Saliency length (${saliency.length}) does not match image dimensions (${pixelCount})`);
    }
  }

  let weights = null;
  let signalSource = "none";
  if (mask && saliency) {
    weights = new Float32Array(pixelCount);
    for (let i = 0; i < pixelCount; i += 1) weights[i] = mask[i] * 0.7 + saliency[i] * 0.3;
    signalSource = "mask_and_saliency";
  } else if (mask) {
    weights = mask;
    signalSource = "mask";
  } else if (saliency) {
    weights = saliency;
    signalSource = "saliency";
  }

  const subject = weights ? subjectBounds(weights, width, height) : null;
  let reason;
  let confidence;

  if (subject) {
    reason = signalSource === "saliency" ? "saliency_detected" : "subject_detected";
    const coverage = subject.totalWeight / (subject.maxWeight * subject.width * subject.height);
    confidence = Math.round(Math.min(1.0, Math.max(0.4, 0.5 + coverage * 0.5)) * 100) / 100;
  } else {
    reason = mask || saliency ? "fallback_empty_mask" : "fallback_missing_mask";
    confidence = 0;
  }

  const { width: cropW, height: cropH } = windowForRatio(
    subject,
    width,
    height,
    parsedRatio.ratio,
    options,
  );
  const { x, y } = positionCropWindow(subject, width, height, cropW, cropH, options);

  return { x, y, width: cropW, height: cropH, confidence, reason };
}
