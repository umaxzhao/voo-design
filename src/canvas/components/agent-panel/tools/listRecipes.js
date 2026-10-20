/** Tool: list_workflow_recipes — list VOO node-assembly recipes. */

import { TOOL_APPROVAL_LEVEL } from "../eventTypes.js";
import { TEMPLATE_SKILLS } from "../skills.js";

export default {
  spec: {
    name: "list_workflow_recipes",
    description:
      "List built-in VOO workflow recipes for assembling nodes. Select a matching recipe and load it with use_workflow_recipe.",
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
    return {
      count: TEMPLATE_SKILLS.length,
      recipes: TEMPLATE_SKILLS.map((recipe) => ({
        id: recipe.id,
        label: recipe.labelKey,
        triggers: recipe.triggers,
      })),
    };
  },
  presentCall() {
    return { title: "List workflow recipes", icon: "sparkles" };
  },
  presentResult(_args, result) {
    return {
      title: `${result.count} recipe(s) available`,
      status: "completed",
    };
  },
};
