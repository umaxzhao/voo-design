/**
 * Pure geometry for the outpaint (image extension) gesture.
 *
 * The user drags the edges or corners of the selected image's frame outward;
 * the resulting rect must always contain the original one — outpainting only
 * grows the picture. When the grown rect pokes past the page, the document
 * itself expands (nodes shift so nothing lands on negative coordinates).
 */

/** Handle ids: the four edges and the four corners. */
export const OUTPAINT_HANDLES = [
  "left",
  "right",
  "top",
  "bottom",
  "nw",
  "ne",
  "sw",
  "se",
];

const EDGE = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  nw: { x: -1, y: -1 },
  ne: { x: 1, y: -1 },
  sw: { x: -1, y: 1 },
  se: { x: 1, y: 1 },
};

/**
 * Drags one handle by (dx, dy) document pixels and returns the grown rect.
 * The result always contains `rect`: inward drags clamp at the original
 * edge, so the frame can never shrink the source image away.
 */
export function expandRectByHandle(rect, handle, dx, dy) {
  const dir = EDGE[handle];
  if (!dir) return { ...rect };
  let { x, y, width, height } = rect;
  if (dir.x < 0) {
    const next = Math.min(x + dx, x);
    width += x - next;
    x = next;
  } else if (dir.x > 0) {
    width = Math.max(width + dx, width);
  }
  if (dir.y < 0) {
    const next = Math.min(y + dy, y);
    height += y - next;
    y = next;
  } else if (dir.y > 0) {
    height = Math.max(height + dy, height);
  }
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/**
 * How the document must grow to contain `rect`. Nodes shift by
 * (shiftX, shiftY) so nothing sits on negative coordinates; when the rect
 * already fits, the size and shifts come back unchanged/zero.
 */
export function docGrowthForRect(doc, rect) {
  const shiftX = Math.max(0, -rect.x);
  const shiftY = Math.max(0, -rect.y);
  const width = Math.max(doc.width, rect.x + rect.width + shiftX);
  const height = Math.max(doc.height, rect.y + rect.height + shiftY);
  return {
    width: Math.round(width),
    height: Math.round(height),
    shiftX: Math.round(shiftX),
    shiftY: Math.round(shiftY),
  };
}

/**
 * Resolves every persistent geometry change produced by one outpaint.
 * Generation and materialisation share this result so the final node bounds
 * and document growth never get calculated by separate paths.
 */
export function outpaintPlacementForRect(doc, rect) {
  const documentGrowth = docGrowthForRect(doc, rect);
  return {
    nodeRect: {
      x: Math.round(rect.x + documentGrowth.shiftX),
      y: Math.round(rect.y + documentGrowth.shiftY),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    documentGrowth,
  };
}

/**
 * Output-canvas plan for the composite sent to the model: the original
 * bitmap keeps its pixel density, the canvas grows by the same ratio the
 * rect grew by, capped at `maxDim` on the long side.
 */
export function compositePlan(node, rect, maxDim = 2048) {
  const srcWidth = Math.max(1, node.width || 1);
  const srcHeight = Math.max(1, node.height || 1);
  const scaleX = rect.width / srcWidth;
  const scaleY = rect.height / srcHeight;
  // The bitmap's own pixels: fall back to the node box when unknown.
  const bitmapWidth = Math.max(1, node.bitmapWidth ?? srcWidth);
  const bitmapHeight = Math.max(1, node.bitmapHeight ?? srcHeight);
  let outWidth = bitmapWidth * scaleX;
  let outHeight = bitmapHeight * scaleY;
  const longest = Math.max(outWidth, outHeight);
  if (longest > maxDim) {
    const cap = maxDim / longest;
    outWidth *= cap;
    outHeight *= cap;
  }
  outWidth = Math.max(1, Math.round(outWidth));
  outHeight = Math.max(1, Math.round(outHeight));
  // Rounding the offset and the drawn size independently can leave the
  // original one pixel past the canvas edge, and the plan is consumed as a
  // strict contract (everything must fit); clamp both so the invariant holds
  // for every consumer instead of leaving each one to defensively re-clip.
  const offsetX = clampIndex(
    Math.round(((node.x - rect.x) / rect.width) * outWidth),
    0,
    outWidth - 1,
  );
  const offsetY = clampIndex(
    Math.round(((node.y - rect.y) / rect.height) * outHeight),
    0,
    outHeight - 1,
  );
  return {
    width: outWidth,
    height: outHeight,
    // Where the original image lands inside the output canvas.
    offsetX,
    offsetY,
    drawWidth: clampIndex(
      Math.round((srcWidth / rect.width) * outWidth),
      1,
      outWidth - offsetX,
    ),
    drawHeight: clampIndex(
      Math.round((srcHeight / rect.height) * outHeight),
      1,
      outHeight - offsetY,
    ),
  };
}

function clampIndex(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
