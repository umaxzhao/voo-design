/**
 * Design-quality module surface for the design agent.
 */
export { DESIGN_TOKENS, snapToGrid, nearestTypeSize, contrastRatio } from "./tokens.js";
export { STYLE_KITS, pickStyleKit } from "./style_kits.js";
export { lintDesign } from "./lint.js";
export { formatIssuesForModel, runCritiqueLoop } from "./critique_loop.js";
export { buildDesignQualityPrompt } from "./prompt.js";
export { EXEMPLARS, pickExemplars } from "./exemplars.js";
export { SCENE_GUIDES, getSceneGuide, sceneGuidePromptBlock } from "./scene_guides.js";
