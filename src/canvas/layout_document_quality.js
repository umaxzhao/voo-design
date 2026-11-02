/** Geometry checks for the actual editable scene produced by a layout. */

const EDGE_TOLERANCE = 2;
const MAX_ISSUES = 5;

function finiteBox(node) {
  return [node.x, node.y, node.width, node.height].every((value) =>
    Number.isFinite(value),
  );
}

/**
 * Inspect painted text bounds, rather than trusting the HTML box alone.
 * A generated text layer may wrap into more lines than its declared height;
 * those lines must fit both the layer and its page before materialization.
 */
export function inspectGeneratedDocument(doc, { measureTextNode } = {}) {
  const issues = [];
  if (!doc || !Array.isArray(doc.nodes) || !doc.nodes.length) {
    return [{ rule: "empty-document", nodeId: null }];
  }
  for (const node of doc.nodes) {
    if (node.kind !== "text" || node.visible === false) continue;
    if (!finiteBox(node)) {
      issues.push({ rule: "invalid-text-box", nodeId: node.id ?? null });
      continue;
    }
    const measured = measureTextNode?.(node);
    const paintedWidth = Number.isFinite(measured?.width)
      ? measured.width
      : node.width;
    const paintedHeight = Number.isFinite(measured?.height)
      ? measured.height
      : node.height;
    if (
      node.boxWidth > 0 &&
      node.height > 0 &&
      paintedHeight > node.height + EDGE_TOLERANCE
    ) {
      issues.push({ rule: "text-box-too-short", nodeId: node.id ?? null });
    }
    if (
      node.x < -EDGE_TOLERANCE ||
      node.y < -EDGE_TOLERANCE ||
      node.x + paintedWidth > doc.width + EDGE_TOLERANCE ||
      node.y + paintedHeight > doc.height + EDGE_TOLERANCE
    ) {
      issues.push({ rule: "text-outside-page", nodeId: node.id ?? null });
    }
    if (issues.length >= MAX_ISSUES) break;
  }
  return issues.slice(0, MAX_ISSUES);
}

export function layoutQualityRetryReason(issues) {
  if (!issues.length) return null;
  return `layout-quality:${issues.map(({ rule, nodeId }) => `${rule}${nodeId ? `(${nodeId})` : ""}`).join(",")}`;
}
