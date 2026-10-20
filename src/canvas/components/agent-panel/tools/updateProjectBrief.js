/**
 * Tool: update_project_brief — Propose updates to the project brief.
 *
 * Updates confirmed project specifications and brand constraints:
 * - goal, audience, brand (colors, fonts, logo, safeArea, forbidden),
 *   style, specs, references, confirmedDecisions.
 *
 * REQUIRES_APPROVAL: Must always be approved by the user before mutating
 * the project brief; never executes silently.
 *
 * @module agent-panel/tools/updateProjectBrief
 */

import { TOOL_APPROVAL_LEVEL } from "../eventTypes.js";

export default {
  spec: {
    name: "update_project_brief",
    description:
      "Propose structured updates to the current project brief (goal, audience, brand colors/fonts/safeArea/forbidden, style, output specs, references, confirmed decisions). Requires explicit user approval before changes are saved.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Explanation of why this brief update is being proposed.",
        },
        goal: {
          type: "string",
          description: "Overall project objective or campaign goal.",
        },
        audience: {
          type: "string",
          description: "Target audience description.",
        },
        style: {
          type: "string",
          description:
            "Visual style direction (e.g. 'minimalist editorial', 'dark cyberpunk').",
        },
        brand: {
          type: "object",
          description: "Brand guidelines and constraints.",
          properties: {
            colors: {
              type: "array",
              description: "Approved brand colors.",
              items: {
                type: "object",
                properties: {
                  hex: {
                    type: "string",
                    description: "Color hex code (e.g. #0055ff).",
                  },
                  role: {
                    type: "string",
                    description:
                      "Role of color (e.g. primary, accent, background).",
                  },
                },
                required: ["hex"],
              },
            },
            fonts: {
              type: "array",
              description: "Approved brand typography.",
              items: {
                type: "object",
                properties: {
                  family: { type: "string", description: "Font family name." },
                  role: {
                    type: "string",
                    description: "Role of font (e.g. heading, body, mono).",
                  },
                },
                required: ["family"],
              },
            },
            logoAssetId: {
              type: "string",
              description: "Asset ID of the approved brand logo.",
            },
            safeArea: {
              type: "object",
              description: "Safe area margin in pixels from each edge.",
              properties: {
                top: { type: "number" },
                right: { type: "number" },
                bottom: { type: "number" },
                left: { type: "number" },
              },
            },
            forbidden: {
              type: "array",
              description: "Forbidden colors, fonts, or visual elements.",
              items: { type: "string" },
            },
          },
        },
        specs: {
          type: "array",
          description: "Target output dimensions and specifications.",
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description:
                  "Format name (e.g. 'Instagram Reel', 'Poster').",
              },
              width: { type: "number", description: "Width in units." },
              height: { type: "number", description: "Height in units." },
              unit: {
                type: "string",
                description: "Unit (e.g. 'px', 'mm', 'in').",
              },
            },
            required: ["width", "height"],
          },
        },
        references: {
          type: "array",
          description: "Asset IDs of visual reference materials.",
          items: { type: "string" },
        },
        confirmedDecisions: {
          type: "array",
          description: "Logged confirmed creative decisions.",
          items: {
            type: "object",
            properties: {
              text: { type: "string", description: "Decision description." },
              source: {
                type: "string",
                description:
                  "Origin of decision ('user' | 'agent' | 'client').",
              },
              confirmedAt: {
                type: "number",
                description: "Timestamp of confirmation.",
              },
            },
            required: ["text"],
          },
        },
      },
      additionalProperties: false,
    },
  },

  approvalLevel: TOOL_APPROVAL_LEVEL.REQUIRES_APPROVAL,
  alwaysRequiresApproval: true,

  capabilities: {
    mutates: true,
    externalData: false,
    estimatedCost: 0,
    idempotent: false,
    reversible: true,
    timeout: null,
  },

  async execute(args, context) {
    const store = context?.getStore?.() || context?.store;
    if (!store || typeof store.updateProjectBrief !== "function") {
      return {
        ok: false,
        error: "Store is not available to update project brief.",
      };
    }

    const { reason, ...patch } = args || {};
    const updated = store.updateProjectBrief(patch);

    return {
      ok: true,
      reason: reason || null,
      brief: updated,
      message: "Project brief updated successfully.",
    };
  },

  presentCall(args) {
    const fields = Object.keys(args || {}).filter((k) => k !== "reason");
    const label =
      fields.length > 0
        ? `Update project brief (${fields.join(", ")})`
        : "Update project brief";
    return {
      title: label,
      icon: "file-text",
    };
  },

  presentResult(args, result) {
    if (!result?.ok) {
      return {
        title: "Failed to update project brief",
        status: "failed",
      };
    }
    return {
      title: "Project brief updated",
      status: "completed",
    };
  },
};
