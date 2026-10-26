/**
 * Structured layout QA for the design agent.
 *
 * `lintDesign` already scores a document with heuristics; the agent also needs
 * a machine-readable "what is wrong, on which layer, and how to fix it" report
 * that does not require looking at a screenshot. This module wraps the lint
 * report into stable problem kinds and adds the one check lint does not own:
 * a child that is visually clipped by a clipping parent frame.
 */
import { lintDesign } from "./design_quality/lint.js";

/** Map lint rule names onto the smaller vocabulary the agent reasons about. */
const RULE_KIND = Object.freeze({
  overflow: "overflow",
  contrast: "contrast",
  overlap: "overlap",
  offGrid: "offGrid",
  misalignment: "misalignment",
  typeScale: "typeScale",
  radii: "radii",
  purpleGradient: "gradient",
  identicalCards: "repetition",
  centerStackedHero: "composition",
  decorativeLines: "decoration",
  evenTemplateSpacing: "spacing",
  flatHierarchy: "hierarchy",
  noFocal: "hierarchy",
});

function boundsOf(node) {
  if (!node) return null;
  const x = Number(node.x);
  const y = Number(node.y);
  const width = Number(node.width);
  const height = Number(node.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function inside(inner, outer) {
  return (
    inner.x >= outer.x - 0.5 &&
    inner.y >= outer.y - 0.5 &&
    inner.x + inner.width <= outer.x + outer.width + 0.5 &&
    inner.y + inner.height <= outer.y + outer.height + 0.5
  );
}

/**
 * @param {object} doc scene document (`{ nodes, ... }`)
 * @param {object} [options]
 * @param {string} [options.rootId] restrict the review to one subtree
 * @returns {{score:number, nodeCount:number, problems:Array, summary:Record<string,number>}}
 */
export function inspectLayout(doc, { rootId } = {}) {
  const report = lintDesign(doc, { rootId });
  const problems = [];
  const seen = new Set();

  for (const issue of report.issues ?? []) {
    const kind = RULE_KIND[issue.rule] ?? issue.rule;
    const key = `${issue.rule}:${(issue.nodeIds ?? []).join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    problems.push({
      kind,
      rule: issue.rule,
      severity: issue.severity,
      layerIds: issue.nodeIds ?? [],
      message: issue.message,
      fix: issue.fix,
    });
  }

  const nodes = Array.isArray(doc?.nodes) ? doc.nodes : [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parents = new Map(nodes.map((node) => [node.id, node.parentId]));
  const inSubtree = (node) => {
    if (!rootId) return true;
    let cursor = node;
    const seen = new Set();
    while (cursor) {
      if (cursor.id === rootId) return true;
      const parentId = parents.get(cursor.id);
      if (!parentId || seen.has(parentId)) return false;
      seen.add(parentId);
      cursor = byId.get(parentId);
    }
    return false;
  };
  for (const node of nodes) {
    if (!inSubtree(node)) continue;
    if (!node?.parentId) continue;
    const parent = byId.get(node.parentId);
    if (!parent || parent.clipContent === false) continue;
    const inner = boundsOf(node);
    const outer = boundsOf(parent);
    if (!inner || !outer) continue;
    if (inside(inner, outer)) continue;
    const key = `clipContent:${node.id}:${parent.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    problems.push({
      kind: "clipped",
      rule: "clipContent",
      severity: "error",
      layerIds: [node.id, parent.id],
      message: `Layer "${node.name ?? node.id}" is clipped by its parent frame "${parent.name ?? parent.id}".`,
      fix: "Move or resize the layer to fit inside the frame, or resize the frame.",
    });
  }

  const summary = {};
  for (const problem of problems) {
    summary[problem.kind] = (summary[problem.kind] ?? 0) + 1;
  }
  summary.total = problems.length;

  return {
    score: report.score,
    nodeCount: report.metrics?.nodeCount ?? 0,
    rootId: rootId ?? null,
    problems: problems.slice(0, 40),
    summary,
  };
}
