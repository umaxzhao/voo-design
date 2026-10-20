/**
 * Tool: fill_selection — Content-aware fill of the pixel selection (local
 * Telea inpainting, no provider key needed).
 */

import { createTableEditorCommandTool } from "./editor_command.js";
import { guardRegionMutation } from "../../../agent-runtime/region-guard.js";
import { createToolError } from "./errors.js";

const tool = createTableEditorCommandTool("fill_selection", {
  presentCall: () => ({ title: "Content-aware fill selection", icon: "fill" }),
});

tool.execute = guardRegionMutation(tool.execute, {
  createError: createToolError,
});
export default tool;
