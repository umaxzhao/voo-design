/**
 * Builds the MCP tool catalog from canvas tool schemas.
 * Filters out direct image/video generation tools and formats MCP definitions.
 */

import { CANVAS_TOOL_SCHEMAS } from "../../src/canvas/agent/canvas_tools.js";

const EXCLUDED_TOOLS = new Set([
  "generate_image",
  "generate_image_web",
  "update_plan",
  "get_plan",
]);

/**
 * Builds the MCP tools list from CANVAS_TOOL_SCHEMAS.
 * @returns {Array} MCP tool definitions {name, description, inputSchema}
 */
export function buildMcpTools() {
  const tools = [];

  // Add canvas tools
  for (const item of CANVAS_TOOL_SCHEMAS) {
    if (item.type === "function" && item.function) {
      const fn = item.function;
      if (!EXCLUDED_TOOLS.has(fn.name)) {
        tools.push({
          name: fn.name,
          description: fn.description || "",
          inputSchema: fn.parameters || { type: "object", properties: {} },
        });
      }
    }
  }

  // Add voo_status tool
  tools.push({
    name: "voo_status",
    description: "Get VOO connection status and a read-only live previewUrl for the same canvas/document. After creating a design, return this URL to the user so compatible clients can open it beside the conversation. Links expire when the source canvas/document changes.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  });

  return tools;
}
