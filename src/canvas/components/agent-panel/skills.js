/**
 * Template skills — reusable node-assembly recipes for the agent.
 *
 * This facade preserves the public API while category-specific recipes live
 * in cohesive modules next to it.
 */

import { COPILOT_SKILLS } from "./skills-copilot.js";
import { DESIGN_CRAFT_SKILLS } from "./skills-design-craft.js";
import { PIPELINE_SKILLS } from "./skills-pipeline.js";
import { WORKFLOW_SKILLS } from "./skills-workflow.js";

export const TEMPLATE_SKILLS = [
  ...WORKFLOW_SKILLS,
  ...COPILOT_SKILLS,
  ...PIPELINE_SKILLS,
  ...DESIGN_CRAFT_SKILLS,
];

/** Look up a template skill by id or name. */
export function findTemplateSkill(idOrName) {
  return (
    TEMPLATE_SKILLS.find((s) => s.id === idOrName || s.name === idOrName) ??
    null
  );
}
