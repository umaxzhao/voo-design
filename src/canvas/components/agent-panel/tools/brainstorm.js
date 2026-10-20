import { TOOL_APPROVAL_LEVEL } from "../eventTypes.js";

/**
 * Tool: brainstorm — structured multi-option ideation.
 *
 * The tool frames the brief and returns N direction skeletons plus any
 * decisions already recorded, so the model proposes fresh directions without
 * repeating rejected ones. Approved directions are turned into canvas nodes
 * with the existing create_node / update_plan tools (design-p2-agent.md §2).
 */

export default {
  spec: {
    name: "brainstorm",
    description:
      "Run a structured brainstorm: produce several creative directions for a goal, each with concept, scene, mood, how the subject appears, and storyboard notes. Consider previously recorded decisions (respect rejected ones, build on accepted ones). After the user picks directions, use create_node / update_plan to land them on the canvas.",
    parameters: {
      type: "object",
      properties: {
        goal: {
          type: "string",
          description: "What the creative work must achieve.",
        },
        audience: {
          type: "string",
          description: "Who it is for.",
        },
        constraints: {
          type: "string",
          description: "Must-haves and must-nots (tone, subject, format).",
        },
        optionCount: {
          type: "number",
          description: "How many directions to propose (2-6, default 3).",
        },
      },
      required: ["goal"],
      additionalProperties: false,
    },
  },

  approvalLevel: TOOL_APPROVAL_LEVEL.READ_ONLY,

  requires: {
    canvas: ["nodes:≥1"],
  },

  async execute(args, context) {
    const store = context.getStore?.();
    const decisions = Array.isArray(store?.brainstorm?.decisions)
      ? store.brainstorm.decisions
      : [];
    const count = Math.min(
      6,
      Math.max(2, Number.isFinite(args.optionCount) ? args.optionCount : 3),
    );
    return {
      status: "ok",
      brief: {
        goal: args.goal,
        audience: args.audience ?? "",
        constraints: args.constraints ?? "",
      },
      instruction:
        "Propose distinct creative directions. For each: a one-line concept, the scene, the mood, how the subject appears, and 2-3 storyboard notes. Mark which direction you recommend. Then ask the user to pick or merge.",
      existingDecisions: decisions,
      directions: Array.from({ length: count }, () => ({
        title: "",
        concept: "",
        scene: "",
        mood: "",
        subjectAppearance: "",
        storyboardNotes: "",
      })),
    };
  },

  presentCall(args) {
    return { title: `Brainstorm: ${args.goal ?? ""}`, icon: "idea" };
  },

  presentResult(_args, result) {
    return {
      title: `Proposed ${result.directions?.length ?? 0} direction(s)`,
      status: "completed",
    };
  },
};
