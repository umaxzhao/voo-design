/**
 * Tool: search_templates — discover VOO design templates by keyword.
 *
 * Adapted from OpenDesign's prompt-template catalogue: generation is grounded
 * in reusable, structured templates instead of ad-hoc prompts. This tool
 * searches VOO's own template sets (media presets, styles, compositions,
 * skills) so the agent can pick the right one before generating.
 */

import { TOOL_APPROVAL_LEVEL } from "../eventTypes.js";
import { DESIGN_SYSTEMS, designSystemColors } from "../../../design_systems.js";

function toEntries(record) {
  return Object.entries(record).map(([id, value]) => ({ id, ...value }));
}

export default {
  spec: {
    name: "search_templates",
    description:
      "Search VOO's design catalogue by keyword (e.g. 'poster', 'fitness', 'dashboard', 'social'). Returns media presets, legacy styles, composition directions, layout skills, and artifact design systems with semantic tokens. Use a design system before generating a layout.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Keyword to match against template names and descriptions.",
        },
        kind: {
          type: "string",
          enum: ["media", "style", "direction", "skill", "designSystem"],
          description:
            "Optional filter: media presets, styles, composition directions, skills, or design systems.",
        },
        limit: {
          type: "number",
          description: "Maximum results per kind (default 5).",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },

  approvalLevel: TOOL_APPROVAL_LEVEL.READ_ONLY,

  async execute(args, _context) {
    // Catalog discovery loads full presets only when the tool is executed.
    const { LAYOUT_MEDIA, LAYOUT_STYLES, LAYOUT_DIRECTIONS, LAYOUT_SKILLS } =
      await import("../../../layout_skills_data.js");
    const q = args.query.toLowerCase().trim();
    const limit = args.limit || 5;
    const kind = args.kind || null;

    const matches = (entry) =>
      !q ||
      entry.id.toLowerCase().includes(q) ||
      String(entry.brief ?? entry.descKey ?? entry.layout ?? "")
        .toLowerCase()
        .includes(q) ||
      String(entry.labelKey ?? "")
        .toLowerCase()
        .includes(q) ||
      entry.keywords?.some((keyword) => keyword.toLowerCase().includes(q));

    const result = {};

    if (!kind || kind === "media") {
      result.media = toEntries(LAYOUT_MEDIA)
        .filter(matches)
        .slice(0, limit)
        .map(({ id, labelKey, width, height, brief }) => ({
          id,
          labelKey,
          width,
          height,
          brief,
        }));
    }

    if (!kind || kind === "style") {
      result.styles = toEntries(LAYOUT_STYLES)
        .filter(matches)
        .slice(0, limit)
        .map(({ id, labelKey, brief, palette }) => ({
          id,
          labelKey,
          brief,
          palette: palette ?? null,
        }));
    }

    if (!kind || kind === "direction") {
      result.directions = toEntries(LAYOUT_DIRECTIONS)
        .filter(matches)
        .slice(0, limit)
        .map(({ id, labelKey, brief }) => ({ id, labelKey, brief }));
    }

    if (!kind || kind === "skill") {
      result.skills = toEntries(LAYOUT_SKILLS)
        .filter(matches)
        .slice(0, limit)
        .map(({ id, labelKey, descKey, media, layout }) => ({
          id,
          labelKey,
          descKey,
          media,
          layout,
        }));
    }

    if (!kind || kind === "designSystem") {
      result.designSystems = toEntries(DESIGN_SYSTEMS)
        .filter(matches)
        .slice(0, limit)
        .map(({ id, labelKey, descriptionKey, keywords }) => ({
          id,
          labelKey,
          descriptionKey,
          keywords,
          colors: designSystemColors(DESIGN_SYSTEMS[id]),
        }));
    }

    const total = Object.values(result).reduce((n, arr) => n + arr.length, 0);
    return { query: args.query, count: total, templates: result };
  },

  presentCall(args) {
    return { title: `Search templates: "${args.query}"`, icon: "layout-grid" };
  },

  presentResult(_args, result) {
    return { title: `${result.count} template(s) found`, status: "completed" };
  },
};
