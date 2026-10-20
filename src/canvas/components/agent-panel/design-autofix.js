/**
 * Deterministic, conservative fixes for the structured issues emitted by
 * critiqueDesign.js. This module does not touch image data or invoke a
 * renderer, so it is safe to use from tests and from iterate_design.
 */

export const DEFAULT_ALIGNMENT_TOLERANCE = 4;
export const DEFAULT_MIN_FONT_SIZE = 8;

function nodesOf(doc) {
  return Array.isArray(doc?.nodes)
    ? doc.nodes
    : Array.isArray(doc?.layers)
      ? doc.layers
      : [];
}

function nodeId(node, index) {
  return String(node?.id ?? `node_${index}`);
}

function isLocked(node) {
  return node?.locked === true || node?.isLocked === true || node?.lock === true;
}

function isText(node) {
  return node?.kind === "text" || node?.type === "text" || Boolean(node?.text);
}

function number(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function geometry(node) {
  return {
    x: number(node?.x),
    y: number(node?.y),
    width: number(node?.width ?? node?.w),
    height: number(node?.height ?? node?.h),
  };
}

function addPatch(patches, targetId, patch, issueId) {
  const existing = patches.find((entry) => entry.targetId === targetId);
  if (existing) {
    existing.patch = { ...existing.patch, ...patch };
    existing.issueIds = [...existing.issueIds, issueId];
    return;
  }
  patches.push({ targetId, patch, issueIds: [issueId] });
}

function findNode(nodes, id) {
  return nodes.find((node, index) => nodeId(node, index) === String(id));
}

function textPatch(node, doc, minFontSize) {
  const { x, y, width, height } = geometry(node);
  const canvasWidth = number(doc?.width ?? doc?.w);
  const canvasHeight = number(doc?.height ?? doc?.h);
  const overflows = x < 0 || y < 0 || x + width > canvasWidth || y + height > canvasHeight;
  if (!overflows) return {};
  const currentFontSize = number(node?.fontSize ?? node?.style?.fontSize, 16);
  const nextFontSize = Math.max(minFontSize, Math.floor(currentFontSize * 0.9));
  const nextX = Math.max(0, Math.min(x, Math.max(0, canvasWidth - width)));
  const nextY = Math.max(0, Math.min(y, Math.max(0, canvasHeight - height)));
  const nextWidth = Math.max(1, Math.min(width, canvasWidth - nextX));
  const nextHeight = Math.max(1, Math.min(height, canvasHeight - nextY));
  const patch = {};
  if (nextX !== x) patch.x = nextX;
  if (nextY !== y) patch.y = nextY;
  if (nextWidth !== width) patch.width = nextWidth;
  if (nextHeight !== height) patch.height = nextHeight;
  if (currentFontSize > minFontSize && nextFontSize < currentFontSize) {
    patch.fontSize = nextFontSize;
  }
  return patch;
}

function alignmentPatch(node, nodes, issue, tolerance) {
  const { x, y, width, height } = geometry(node);
  const edge = String(issue.id ?? "").split("_").pop();
  const peers = nodes.filter(
    (candidate) =>
      candidate !== node &&
      !isLocked(candidate) &&
      (candidate.groupId ?? candidate.parentId ?? "default_artboard") ===
        (node.groupId ?? node.parentId ?? "default_artboard"),
  );
  let best = null;
  for (const peer of peers) {
    const peerGeometry = geometry(peer);
    const candidates = {
      left: [x, peerGeometry.x],
      right: [x + width, peerGeometry.x + peerGeometry.width],
      top: [y, peerGeometry.y],
      bottom: [y + height, peerGeometry.y + peerGeometry.height],
      "center-x": [x + width / 2, peerGeometry.x + peerGeometry.width / 2],
      "center-y": [y + height / 2, peerGeometry.y + peerGeometry.height / 2],
    };
    const pair = candidates[edge];
    if (!pair) continue;
    const difference = Math.abs(pair[0] - pair[1]);
    if (difference >= 1 && difference <= tolerance && (!best || difference < best.difference)) {
      best = { target: pair[1], difference };
    }
  }
  if (!best) return {};
  if (edge === "left") return { x: best.target };
  if (edge === "right") return { x: best.target - width };
  if (edge === "top") return { y: best.target };
  if (edge === "bottom") return { y: best.target - height };
  if (edge === "center-x") return { x: best.target - width / 2 };
  if (edge === "center-y") return { y: best.target - height / 2 };
  return {};
}

/**
 * @param {Object} doc
 * @param {Array<Object>} issues Structured critiqueDesign issues.
 * @param {Object} [opts]
 * @returns {{ patches: Array<Object>, fixed: Array<Object>, skipped: Array<Object> }}
 */
export function autoFixDocument(doc, issues, opts = {}) {
  if (!doc || !Array.isArray(issues)) {
    throw new TypeError("autoFixDocument requires a document and issue array");
  }
  const nodes = nodesOf(doc);
  const tolerance = number(opts.alignmentTolerance, DEFAULT_ALIGNMENT_TOLERANCE);
  const minFontSize = number(opts.minFontSize, DEFAULT_MIN_FONT_SIZE);
  const patches = [];
  const fixed = [];
  const skipped = [];

  for (const issue of issues) {
    const rule = issue?.rule;
    const targetId = String(issue?.targetId ?? "document");
    const node = rule === "dimension_mismatch" ? null : findNode(nodes, targetId);
    if (node && isLocked(node)) {
      skipped.push({ issue, reason: "Layer is locked." });
      continue;
    }
    if (rule === "dimension_mismatch") {
      const targetWidth = number(opts.targetWidth ?? doc?.targetSpecs?.width);
      const targetHeight = number(opts.targetHeight ?? doc?.targetSpecs?.height);
      if (targetWidth > 0 && targetHeight > 0) {
        addPatch(patches, targetId, { width: targetWidth, height: targetHeight }, issue.id);
        fixed.push(issue);
      } else {
        skipped.push({ issue, reason: "Requested artboard size is missing or invalid." });
      }
      continue;
    }
    if (!node) {
      skipped.push({ issue, reason: "Target layer was not found." });
      continue;
    }
    let patch = {};
    if (rule === "text_overflow" && isText(node)) {
      patch = textPatch(node, doc, minFontSize);
    } else if (rule === "misalignment") {
      patch = alignmentPatch(node, nodes, issue, tolerance);
    } else {
      skipped.push({ issue, reason: "Issue type is outside the safe auto-fix set." });
      continue;
    }
    if (Object.keys(patch).length === 0) {
      skipped.push({ issue, reason: "No safe deterministic patch is available." });
      continue;
    }
    addPatch(patches, targetId, patch, issue.id);
    fixed.push(issue);
  }
  return { patches, fixed, skipped };
}
