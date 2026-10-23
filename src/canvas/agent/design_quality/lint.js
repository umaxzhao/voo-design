/**
 * STUB — placeholder so the module contract and index.js re-exports resolve
 * before the full lint engine lands. The lint/critique owner will replace
 * this file verbatim: lintDesign(doc, {rootId?, kit?}) -> {score, issues, metrics}.
 */
import { DESIGN_TOKENS, nearestTypeSize, snapToGrid } from "./tokens.js";

export function lintDesign(doc, _options = {}) {
  const nodes = doc?.nodes ?? [];
  const textNodes = nodes.filter((n) => n.type === "text" || n.kind === "text");
  const fontSizes = [
    ...new Set(
      textNodes.map((n) => Number(n.fontSize)).filter((v) => Number.isFinite(v) && v > 0),
    ),
  ];
  const offScaleSizes = fontSizes.filter((size) => !DESIGN_TOKENS.typeScale.includes(size));
  const offGridValues = [];
  for (const node of nodes) {
    const layout = node.autoLayout;
    if (!layout || typeof layout !== "object") continue;
    for (const key of ["gap", "padding"]) {
      const value = Number(layout[key]);
      if (Number.isFinite(value) && value > 0 && snapToGrid(value, 4) !== value) {
        offGridValues.push(value);
      }
    }
  }
  return {
    score: 100,
    issues: [],
    metrics: {
      nodeCount: nodes.length,
      typeSizeCount: fontSizes.length,
      offGridCount: offGridValues.length,
      offScaleSizes: offScaleSizes.map((s) => [s, nearestTypeSize(s)]),
    },
  };
}
