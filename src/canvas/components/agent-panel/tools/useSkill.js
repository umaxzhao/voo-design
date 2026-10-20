/**
 * Tool: use_skill — load an installed Agent Skill's instructions.
 */

import { TOOL_APPROVAL_LEVEL } from "../eventTypes.js";
import { createToolError, TOOL_ERROR_CODE } from "./errors.js";
import { listExternalSkills } from "../skill_repository.js";

export default {
  spec: {
    name: "use_skill",
    description:
      "Load an enabled Agent Skill's SKILL.md instructions by id. Use an id from the available Skill catalog or list_skills.",
    parameters: {
      type: "object",
      properties: {
        skill: {
          type: "string",
          description: "The skill id returned by list_skills.",
        },
      },
      required: ["skill"],
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

  async execute(args) {
    const skill =
      typeof indexedDB === "undefined"
        ? null
        : (await listExternalSkills()).find(
            (item) =>
              item.enabled !== false &&
              (item.id === args.skill || item.name === args.skill),
          );
    if (!skill) {
      throw createToolError(
        TOOL_ERROR_CODE.ARGS_INVALID,
        `Unknown skill: ${args.skill}`,
        {
          missing: { skills: [args.skill] },
          suggestion: {
            tool: "list_skills",
            args: {},
            note: "Call list_skills to see the available skill ids, then retry.",
          },
        },
      );
    }
    return {
      id: skill.id,
      label: skill.labelKey ?? skill.name,
      params: skill.params ?? {},
      instructions: skill.instructions,
      resources: (skill.resources ?? []).map(
        ({ path, mimeType, encoding, size }) => ({
          path,
          mimeType,
          encoding,
          size,
        }),
      ),
    };
  },

  presentCall(args) {
    return { title: `Use skill (${args.skill})`, icon: "sparkles" };
  },

  presentResult(_args, result) {
    return { title: `Loaded skill: ${result.id}`, status: "completed" };
  },
};
