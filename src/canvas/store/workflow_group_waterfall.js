/**
 * Waterfall layout engine for Group containers.
 *
 * Positions members in a multi-column flow with consistent horizontal and
 * vertical gaps. Measures the actual rendered height of each node (or derives it
 * from image aspect ratios and measured dimensions) so varying card heights
 * never overlap or drift out of alignment.
 */
import { NODE_TYPE } from "../nodes/types.js";

/** Default spacing constants shared across Group auto-layout. */
export const WATERFALL_LAYOUT_DEFAULTS = Object.freeze({
  cols: 4,
  gap: 24,
  pad: 24,
  padTop: 56,
  cellW: 280,
  cellH: 360,
});

/**
 * Parses an aspect ratio specifier (e.g. "9:16", "1:1", "16:9", or numeric 0.5625)
 * into a floating point number (width / height).
 */
export function parseAspectRatio(ratio) {
  if (!ratio) return null;
  if (typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0) {
    return ratio;
  }
  if (typeof ratio === "string") {
    const parts = ratio.trim().split(":").map(Number);
    if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
      return parts[0] / parts[1];
    }
    const num = Number.parseFloat(ratio);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return null;
}

/**
 * Resolves the true visual dimensions of a node.
 * Checks live layout measurements, ReactFlow measured bounds, explicit node
 * width/height, style dimensions, image aspect ratios, and node registry
 * defaults in sequence. All sources are zoom-independent: React Flow renders
 * inside a CSS-transformed viewport, so a getBoundingClientRect() would be
 * scaled by the canvas zoom (a 380px card measures 190px at zoom 0.5) and
 * stack cards half-overlapping. offsetWidth/offsetHeight are layout pixels,
 * unaffected by the transform.
 */
export function getNodeActualSize(
  node,
  fallbackW = WATERFALL_LAYOUT_DEFAULTS.cellW,
  fallbackH = WATERFALL_LAYOUT_DEFAULTS.cellH,
) {
  if (!node) return { width: fallbackW, height: fallbackH };

  // 1. Live DOM element in LAYOUT pixels (offsetWidth/Height ignore the
  //    viewport transform; the rect does not). Never use getBoundingClientRect
  //    here — it re-introduces the zoom-scaled overlap regression.
  if (typeof document !== "undefined" && node.id) {
    const el =
      document.querySelector(`[data-id="${node.id}"]`) ||
      document.getElementById(node.id);
    if (el) {
      const width = Number(el.offsetWidth);
      const height = Number(el.offsetHeight);
      if (width > 0 && height > 0) {
        return { width: Math.round(width), height: Math.round(height) };
      }
    }
  }

  // 2. ReactFlow measured bounds
  const measuredW = Number(node.measured?.width);
  const measuredH = Number(node.measured?.height);
  if (measuredW > 0 && measuredH > 0) {
    return { width: Math.round(measuredW), height: Math.round(measuredH) };
  }

  // 3. Explicit node.width / node.height
  const nodeW = Number(node.width);
  const nodeH = Number(node.height);
  if (nodeW > 0 && nodeH > 0) {
    return { width: Math.round(nodeW), height: Math.round(nodeH) };
  }

  // 4. Node style properties
  const styleW = Number.parseFloat(node.style?.width);
  const styleH = Number.parseFloat(node.style?.height);
  if (Number.isFinite(styleW) && styleW > 0 && Number.isFinite(styleH) && styleH > 0) {
    return { width: Math.round(styleW), height: Math.round(styleH) };
  }

  const effectiveWidth = Math.round(
    (Number.isFinite(styleW) && styleW > 0)
      ? styleW
      : (nodeW > 0 ? nodeW : (measuredW > 0 ? measuredW : fallbackW)),
  );

  // 5. Image Editor / Preview nodes with aspect ratio metadata
  if (
    node.type === NODE_TYPE.IMAGE_EDITOR ||
    node.type === "imageEditor" ||
    (node.type === NODE_TYPE.PREVIEW &&
      (!node.data?.mediaType || node.data?.mediaType === "image"))
  ) {
    const rawRatio = node.data?.aspectRatio || node.data?.jimengAspectRatio;
    const ratio = parseAspectRatio(rawRatio);
    if (ratio && ratio > 0) {
      // Header shell (~36px) + image body (width / ratio) + bottom action bar (~40px)
      const hasToolbar = Boolean(
        node.data?.editDesign ||
          node.data?.prompt ||
          node.data?.imageId ||
          node.data?.assetId,
      );
      const chromeHeight = 40 + (hasToolbar ? 36 : 8);
      return {
        width: effectiveWidth,
        height: Math.round(effectiveWidth / ratio + chromeHeight),
      };
    }
  }

  // 6. Video Preview nodes
  if (
    node.type === NODE_TYPE.COMBINE_VIDEO ||
    (node.type === NODE_TYPE.PREVIEW && node.data?.mediaType === "video")
  ) {
    return {
      width: effectiveWidth,
      height: Math.round(effectiveWidth * (9 / 16) + 40),
    };
  }

  return {
    width: effectiveWidth,
    height:
      Number.isFinite(styleH) && styleH > 0
        ? Math.round(styleH)
        : nodeH > 0
          ? Math.round(nodeH)
          : measuredH > 0
            ? Math.round(measuredH)
            : fallbackH,
  };
}

/**
 * Computes a masonry/waterfall layout for all members of a Group.
 *
 * Members are placed column by column (left-to-right, then top-to-bottom).
 * Each column tracks its cumulative height independently so that taller cards
 * push subsequent cards in the same column down cleanly with consistent `gap`.
 *
 * @param {Array<object>} members - Child nodes belonging to the group.
 * @param {object} [opts] - Layout overrides.
 * @returns {{ positions: Map<string, {x: number, y: number, width: number, height: number}>, groupW: number, groupH: number, cols: number }}
 */
export function computeWaterfallLayout(members, opts = {}) {
  if (!Array.isArray(members) || members.length === 0) {
    return {
      positions: new Map(),
      groupW: 300,
      groupH: 200,
      cols: 1,
    };
  }

  const gap = Number(opts.gap) || WATERFALL_LAYOUT_DEFAULTS.gap;
  const pad = Number(opts.pad) || WATERFALL_LAYOUT_DEFAULTS.pad;
  const padTop = Number(opts.padTop) || WATERFALL_LAYOUT_DEFAULTS.padTop;
  const cellW = Number(opts.cellW) || WATERFALL_LAYOUT_DEFAULTS.cellW;
  const cellH = Number(opts.cellH) || WATERFALL_LAYOUT_DEFAULTS.cellH;

  // Determine column count: explicit opts > group width fit > member count / default 4
  let cols = Number(opts.cols);
  if (!cols || cols < 1) {
    const groupW = Number(opts.groupWidth) || 0;
    if (groupW >= 300) {
      cols = Math.max(1, Math.floor((groupW - pad * 2 + gap) / (cellW + gap)));
    } else {
      cols = Math.min(members.length, WATERFALL_LAYOUT_DEFAULTS.cols);
    }
  }

  const colX = new Array(cols);
  const colY = new Array(cols);
  for (let c = 0; c < cols; c += 1) {
    colX[c] = pad + c * (cellW + gap);
    colY[c] = padTop;
  }

  const positions = new Map();

  for (let i = 0; i < members.length; i += 1) {
    const member = members[i];
    const col = i % cols;
    const size = getNodeActualSize(member, cellW, cellH);

    const x = colX[col];
    const y = colY[col];

    positions.set(member.id, {
      x,
      y,
      width: size.width,
      height: size.height,
    });

    colY[col] += size.height + gap;
  }

  const maxBottom = Math.max(...colY) - gap;
  const groupW = cols * cellW + (cols - 1) * gap + pad * 2;
  const groupH = Math.max(160, maxBottom + pad);

  return { positions, groupW, groupH, cols };
}

/**
 * Appends a new batch of generated items below existing members in a waterfall.
 * Accurately finds the bottom-most boundary of each column so newly generated
 * nodes start with exact `gap` clearance below existing content.
 */
export function computeAppendWaterfallPositions(
  group,
  existingMembers,
  newItems,
  opts = {},
) {
  const layout = {
    ...WATERFALL_LAYOUT_DEFAULTS,
    ...(group.data?.outputLayout ?? {}),
    ...opts,
  };
  const { pad, gap, padTop = pad } = layout;
  const cellW = Number(layout.cellW) || WATERFALL_LAYOUT_DEFAULTS.cellW;
  const cellH = Number(layout.cellH) || WATERFALL_LAYOUT_DEFAULTS.cellH;

  const explicitCols = opts.cols ?? group.data?.outputLayout?.cols;
  let cols = Number(explicitCols);
  if (!cols || cols < 1) {
    const groupW = Number.parseFloat(group.style?.width) || group.width || 0;
    if (groupW >= 300) {
      cols = Math.max(1, Math.floor((groupW - pad * 2 + gap) / (cellW + gap)));
    } else {
      cols = WATERFALL_LAYOUT_DEFAULTS.cols;
    }
  }

  const colX = new Array(cols);
  const colY = new Array(cols);
  for (let c = 0; c < cols; c += 1) {
    colX[c] = pad + c * (cellW + gap);
    colY[c] = padTop;
  }

  if (Array.isArray(existingMembers) && existingMembers.length > 0) {
    for (const member of existingMembers) {
      const size = getNodeActualSize(member, cellW, cellH);
      const mx = member.position?.x ?? pad;
      const my = member.position?.y ?? padTop;
      const memberBottom = my + size.height;

      // Assign to the nearest column by X coordinate
      let closestCol = 0;
      let minDiff = Infinity;
      for (let c = 0; c < cols; c += 1) {
        const diff = Math.abs(mx - colX[c]);
        if (diff < minDiff) {
          minDiff = diff;
          closestCol = c;
        }
      }
      colY[closestCol] = Math.max(colY[closestCol], memberBottom + gap);
    }
  }

  const positions = [];
  const startIdx = existingMembers.length;
  for (let i = 0; i < newItems.length; i += 1) {
    const item = newItems[i];
    const col = (startIdx + i) % cols;
    const nodeObj = typeof item === "string" ? { type: item } : item;
    const size = getNodeActualSize(nodeObj, cellW, cellH);

    positions.push({
      x: colX[col],
      y: colY[col],
    });
    colY[col] += size.height + gap;
  }

  return positions;
}

/**
 * Sizes a Group container to tightly enclose all its members using actual member heights.
 */
export function computeGroupBounds(group, members, opts = {}) {
  const layout = {
    ...WATERFALL_LAYOUT_DEFAULTS,
    ...(group.data?.outputLayout ?? {}),
    ...opts,
  };
  const { pad = WATERFALL_LAYOUT_DEFAULTS.pad, padTop = WATERFALL_LAYOUT_DEFAULTS.padTop } = layout;
  const cellW = Number(layout.cellW) || WATERFALL_LAYOUT_DEFAULTS.cellW;
  const cellH = Number(layout.cellH) || WATERFALL_LAYOUT_DEFAULTS.cellH;

  let maxRight = pad;
  let maxBottom = padTop;
  for (const member of members) {
    const size = getNodeActualSize(member, cellW, cellH);
    const x = member.position?.x ?? 0;
    const y = member.position?.y ?? 0;
    maxRight = Math.max(maxRight, x + size.width);
    maxBottom = Math.max(maxBottom, y + size.height);
  }

  return {
    width: Math.max(300, maxRight + pad),
    height: Math.max(200, maxBottom + pad),
  };
}
