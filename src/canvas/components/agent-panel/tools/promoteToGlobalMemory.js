/**
 * Tool: promote_to_global_memory — Propose promoting a brand or user preference to global memory.
 *
 * Promotes a confirmed brand or user preference from the current project to
 * cross-project global memory.
 *
 * REQUIRES_APPROVAL: Must always be explicitly approved by the user.
 * The approval card MUST clearly warn the user:
 * "这会在你所有的项目中生效" / "This will take effect across ALL your projects."
 *
 * @module agent-panel/tools/promoteToGlobalMemory
 */

import { TOOL_APPROVAL_LEVEL } from "../eventTypes.js";
import {
  addBrand,
  addPreference,
  loadGlobalBrands,
  saveGlobalBrands,
  loadGlobalPreferences,
  saveGlobalPreferences,
  PREFERENCE_KINDS,
} from "../../../agent-runtime/global-memory.js";

export const GLOBAL_MEMORY_SCOPE_NOTICE =
  "这会在你所有的项目中生效 / This will take effect across ALL your projects.";

export default {
  spec: {
    name: "promote_to_global_memory",
    description:
      "Propose promoting a brand or user preference from this project to global memory. Requires explicit user approval, and will take effect across ALL your projects.",
    parameters: {
      type: "object",
      properties: {
        target: {
          type: "string",
          enum: ["brand", "preference"],
          description: "Target global memory store: 'brand' (brand library) or 'preference' (user preferences).",
        },
        brand: {
          type: "object",
          description: "Brand specification to save into the global brand library (required if target is 'brand').",
          properties: {
            name: { type: "string", description: "Brand name." },
            colors: {
              type: "array",
              description: "Brand colors [{ hex, role }].",
              items: {
                type: "object",
                properties: {
                  hex: { type: "string" },
                  role: { type: "string" },
                },
                required: ["hex"],
              },
            },
            fonts: {
              type: "array",
              description: "Brand typography [{ family, role }].",
              items: {
                type: "object",
                properties: {
                  family: { type: "string" },
                  role: { type: "string" },
                },
                required: ["family"],
              },
            },
            logoAssetId: { type: "string", description: "Asset ID of the logo." },
            safeArea: {
              type: "object",
              description: "Safe area margin in pixels.",
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
        preference: {
          type: "object",
          description: "User preference to save into global preferences (required if target is 'preference').",
          properties: {
            text: { type: "string", description: "The specific preference." },
            kind: {
              type: "string",
              enum: ["style", "workflow", "tone"],
              description: "Category of preference.",
            },
          },
          required: ["text"],
        },
        reason: {
          type: "string",
          description: "Rationale explaining why this item should apply globally across all projects.",
        },
        source: {
          type: "object",
          description: "Source metadata tracking project and step origins.",
          properties: {
            projectId: { type: "string" },
            projectName: { type: "string" },
            runId: { type: "string" },
            messageExcerpt: { type: "string" },
          },
        },
      },
      required: ["target"],
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
    const { target, brand, preference, reason, source } = args || {};

    const store = context?.getStore?.() || context?.store;
    const currentProjectId = store?.workflowId || source?.projectId || null;
    const currentProjectName = store?.name || source?.projectName || null;

    const mergedSource = {
      projectId: currentProjectId,
      projectName: currentProjectName,
      runId: source?.runId || null,
      messageExcerpt: source?.messageExcerpt || null,
    };

    if (target === "brand") {
      if (!brand || typeof brand !== "object" || !brand.name?.trim()) {
        return { ok: false, error: "Brand must have a non-empty name." };
      }

      const existingBrands = loadGlobalBrands();
      const updatedBrands = addBrand(existingBrands, {
        ...brand,
        source: mergedSource,
      });
      await saveGlobalBrands(updatedBrands);

      return {
        ok: true,
        target: "brand",
        reason: reason || null,
        brandName: brand.name.trim(),
        message: "Brand saved to global brand library.",
        scopeNotice: GLOBAL_MEMORY_SCOPE_NOTICE,
      };
    }

    if (target === "preference") {
      if (!preference || typeof preference !== "object" || !preference.text?.trim()) {
        return { ok: false, error: "Preference must have a non-empty text." };
      }

      const kind = PREFERENCE_KINDS.includes(preference.kind)
        ? preference.kind
        : "style";

      const existingPrefs = loadGlobalPreferences();
      const updatedPrefs = addPreference(existingPrefs, {
        text: preference.text.trim(),
        kind,
        source: mergedSource,
      });
      await saveGlobalPreferences(updatedPrefs);

      return {
        ok: true,
        target: "preference",
        reason: reason || null,
        preferenceText: preference.text.trim(),
        message: "Preference saved to global user preferences.",
        scopeNotice: GLOBAL_MEMORY_SCOPE_NOTICE,
      };
    }

    return { ok: false, error: `Unsupported target: ${target}` };
  },

  presentCall(args) {
    const target = args?.target;
    let title = "Promote to Global Memory";
    if (target === "brand") {
      title = `Save "${args.brand?.name || "Brand"}" to Brand Library`;
    } else if (target === "preference") {
      const snippet = args.preference?.text ? `"${args.preference.text.slice(0, 30)}"` : "";
      title = `Save to My Preferences: ${snippet}`;
    }

    return {
      title,
      description: GLOBAL_MEMORY_SCOPE_NOTICE,
      icon: target === "brand" ? "palette" : "sliders",
    };
  },

  presentResult(args, result) {
    if (!result?.ok) {
      return {
        title: "Failed to promote to global memory",
        status: "failed",
      };
    }
    return {
      title: result.target === "brand" ? "Brand saved globally" : "Preference saved globally",
      status: "completed",
    };
  },
};
