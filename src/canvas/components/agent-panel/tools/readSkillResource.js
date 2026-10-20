/** Read one packaged Skill resource; never access arbitrary filesystem paths. */
import { TOOL_APPROVAL_LEVEL } from "../eventTypes.js";
import { createToolError, TOOL_ERROR_CODE } from "./errors.js";
import { listExternalSkills } from "../skill_repository.js";
import { MAX_SKILL_RESOURCE_BYTES } from "../skill_descriptors.js";

export default {
  spec: {
    name: "read_skill_resource",
    description:
      "Read one supporting file listed by use_skill. References and scripts return text; binary assets return base64 with a MIME type. This tool does not execute scripts.",
    parameters: {
      type: "object",
      properties: {
        skill: { type: "string", description: "Enabled Skill id." },
        path: {
          type: "string",
          description: "Exact relative path from use_skill.resources.",
        },
      },
      required: ["skill", "path"],
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
    const skill = (await listExternalSkills()).find(
      (item) => item.enabled !== false && item.id === args.skill,
    );
    const resource = skill?.resources?.find((item) => item.path === args.path);
    if (!resource || resource.size > MAX_SKILL_RESOURCE_BYTES) {
      throw createToolError(
        TOOL_ERROR_CODE.ARGS_INVALID,
        `Unknown Skill resource: ${args.skill}/${args.path}`,
      );
    }
    return {
      skill: skill.id,
      path: resource.path,
      mimeType: resource.mimeType,
      encoding: resource.encoding,
      size: resource.size,
      content: resource.content,
    };
  },
  presentCall(args) {
    return { title: `Read Skill file (${args.path})`, icon: "text" };
  },
  presentResult(_args, result) {
    return { title: `Loaded Skill file: ${result.path}`, status: "completed" };
  },
};
