/**
 * Tool: request_user_input — Ask the user a question during agent execution.
 *
 * Adapted from Codex's request_user_input handler. Pauses the agent loop
 * until the user responds.
 */

import { TOOL_APPROVAL_LEVEL } from "../eventTypes.js";

export default {
  spec: {
    name: "request_user_input",
    description:
      "Ask the user a clarifying question. The agent will wait for the answer before continuing.",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The question to ask the user.",
        },
        options: {
          type: "array",
          items: { type: "string" },
          description: "Optional list of suggested answers.",
        },
      },
      required: ["question"],
      additionalProperties: false,
    },
  },

  // This tool always needs user interaction.
  approvalLevel: TOOL_APPROVAL_LEVEL.READ_ONLY,

  /** Asks the user — does not change canvas state; each call asks anew. */
  capabilities: {
    mutates: false,
    externalData: false,
    estimatedCost: 0,
    idempotent: false,
    reversible: null,
    timeout: null,
  },

  /** A question is required. requestUserResponse is provided by the host
   *  when the loop is wired (AgentPanel passes onRequestUserInput); without
   *  it the fallback below only acknowledges the question. */
  requires: {
    args: ["question"],
  },

  async execute(args, context) {
    // The agent loop intercepts this tool specially — it pauses and waits
    // for user input via the UI. If we reach here, return the question
    // so the model sees it was acknowledged.
    if (context.requestUserResponse) {
      const response = await context.requestUserResponse(
        args.question,
        args.options,
      );
      return { userResponse: response };
    }

    // Fallback: just acknowledge the question was asked.
    return { question: args.question, awaitingResponse: true };
  },

  presentCall(args) {
    return {
      title: `Question: "${args.question}"`,
      icon: "message-circle-question",
    };
  },

  presentResult(_args, result) {
    if (result.userResponse) {
      return {
        title: `User answered: "${result.userResponse}"`,
        status: "completed",
      };
    }
    return { title: "Awaiting user response…", status: "in_progress" };
  },
};
