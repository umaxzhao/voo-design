/**
 * Design-skill presets for the Design node's AI layout generation.
 *
 * Facade module re-exporting all presets, geometry, and prompt builder functions.
 */

export {
  ANTI_SLOP_RULES,
  HTML_CONTRACT,
  LAYOUT_DIRECTIONS,
  LAYOUT_MEDIA,
  LAYOUT_SKILLS,
  LAYOUT_STYLES,
  layoutDirection,
  layoutMedia,
  layoutSkill,
  layoutStyle,
  skillForMedia,
} from "./layout_skills_data.js";

export {
  LAYOUT_RATIOS,
  layoutCanvasSize,
  simplifyRatio,
} from "./layout_geometry.js";

export {
  buildLayoutBrief,
  buildLayoutGenerationPrompt,
} from "./layout_prompt.js";
