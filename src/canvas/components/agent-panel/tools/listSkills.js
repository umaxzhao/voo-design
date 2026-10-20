/**
 * Tool: list_skills — list installed Agent Skills.
 */

import { TOOL_APPROVAL_LEVEL } from "../eventTypes.js";
import { listExternalSkills } from "../skill_repository.js";
import { availableSkillMetadata } from "../skill-metadata.js";

export default {
  spec: {
    name: "list_skills",
    description:
      "List enabled, installed Agent Skills imported from standard SKILL.md files. Load a matching skill with use_skill before following its instructions.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },

  approvalLevel: TOOL_APPROVAL_LEVEL.READ_ONLY,

  capabilities: {
    mutates: false,
    externalData: false,
    estimatedCost: 0,
    idempotent: true,
    reversible: null,
    timeout: 5000,
  },

  async execute() {
    const external =
      typeof indexedDB === "undefined" ? [] : await listExternalSkills();
    const skills = availableSkillMetadata(external).map((skill) => ({
      ...skill,
      label: skill.name,
    }));
    return { count: skills.length, skills };
  },

  presentCall() {
    return { title: "List skills", icon: "sparkles" };
  },

  presentResult(_args, result) {
    return { title: `${result.count} skill(s) available`, status: "completed" };
  },
};
