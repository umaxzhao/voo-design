/**
 * Tool: repaint_selection — AI repaint of the pixel selection via the
 * configured image provider (needs a provider key; content-aware fill is the
 * key-free alternative).
 */

import { createTableEditorCommandTool } from "./editor_command.js";
import { guardRegionMutation } from "../../../agent-runtime/region-guard.js";
import { createToolError } from "./errors.js";

const tool = createTableEditorCommandTool("repaint_selection", {
  presentCall: (args) => ({
    title: `AI repaint: "${(args.prompt ?? "").slice(0, 40)}"`,
    icon: "sparkles",
  }),
});

tool.execute = guardRegionMutation(tool.execute, {
  createError: createToolError,
});
export default tool;
