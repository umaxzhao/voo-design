import { TOOL_APPROVAL_LEVEL } from "../eventTypes.js";
import { webSearch } from "../../../../shared/web_search_client.js";

/**
 * Tool: web_search — search design-inspiration sources (no API key needed).
 *
 * Queries Openverse (CC image search, works in the browser) and Behance
 * (design projects, where CORS permits). Free, no key required.
 */

export default {
  spec: {
    name: "web_search",
    description:
      "Search design-inspiration sources for visual references and trends: Openverse CC image search plus Behance design projects. Returns results with title, url and image info. Use before proposing a visual direction that depends on real-world references. If search is unavailable, say so in one line and proceed without it.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "The design search query (e.g. 'cyberpunk poster', 'minimal brand identity').",
        },
        maxResults: {
          type: "number",
          description: "Optional result count (1-8, default 5).",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },

  approvalLevel: TOOL_APPROVAL_LEVEL.READ_ONLY,

  /** Queries external design-inspiration sources; retry-safe. */
  capabilities: {
    mutates: false,
    externalData: true,
    estimatedCost: 0,
    idempotent: true,
    reversible: null,
    timeout: 30_000,
  },

  async execute(args) {
    const result = await webSearch({
      query: args.query,
      maxResults: args.maxResults,
    });
    if (!result.ok) {
      return {
        status: "unavailable",
        code: result.code,
        message:
          result.code === "EMPTY_QUERY"
            ? "A search query is required."
            : "Design search is unavailable right now — proceed without it.",
        results: [],
      };
    }
    return { status: "ok", results: result.results };
  },

  presentCall(args) {
    return { title: `Search: ${args.query ?? ""}`, icon: "search" };
  },

  presentResult(_args, result) {
    return {
      title:
        result.status === "ok"
          ? `Found ${result.results.length} result(s)`
          : result.message,
      status: result.status === "ok" ? "completed" : "failed",
    };
  },
};
