// Public facade for structured design critique APIs.
export {
  VOO_PRINCIPLES,
  ANTI_SLOP_RULES,
  formatGuidelines,
} from "./critique-guidelines.js";
export {
  parseRgb,
  getRelativeLuminance,
  getContrastRatio,
} from "./critique-color.js";
export { getSafeMargin, resolveDocument } from "./critique-document.js";
export { evaluateDeterministicRules } from "./critique-rules.js";
export { default } from "./critique-tool.js";
