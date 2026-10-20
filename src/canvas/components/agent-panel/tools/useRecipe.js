/** Tool: use_workflow_recipe — load a built-in VOO node-assembly recipe. */

import { TOOL_APPROVAL_LEVEL } from "../eventTypes.js";
import { findTemplateSkill } from "../skills.js";
import { createToolError, TOOL_ERROR_CODE } from "./errors.js";

export default {
  spec: {
    name: "use_workflow_recipe",
    description:
      "Load a built-in VOO workflow recipe by id and follow its node-assembly steps. Call list_workflow_recipes to see available ids.",
    parameters: {
      type: "object",
      properties: {
        recipe: {
          type: "string",
          description: "The recipe id returned by list_workflow_recipes.",
        },
      },
      required: ["recipe"],
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
    const recipe = findTemplateSkill(args.recipe);
    if (!recipe) {
      throw createToolError(
        TOOL_ERROR_CODE.ARGS_INVALID,
        `Unknown workflow recipe: ${args.recipe}`,
        {
          missing: { recipes: [args.recipe] },
          suggestion: {
            tool: "list_workflow_recipes",
            args: {},
            note: "Call list_workflow_recipes to see the available recipe ids, then retry.",
          },
        },
      );
    }
    return {
      id: recipe.id,
      label: recipe.labelKey ?? recipe.name,
      params: recipe.params ?? {},
      instructions: recipe.instructions,
    };
  },
  presentCall(args) {
    return { title: `Use workflow recipe (${args.recipe})`, icon: "sparkles" };
  },
  presentResult(_args, result) {
    return { title: `Loaded recipe: ${result.id}`, status: "completed" };
  },
};
