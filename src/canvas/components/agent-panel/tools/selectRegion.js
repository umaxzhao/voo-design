/**
 * Tool: select_region — Create a pixel selection in the open image editor.
 */

import { createTableEditorCommandTool } from "./editor_command.js";

export default createTableEditorCommandTool("select_region", {
  presentCall: (args) => ({
    title: `Select ${args.width}×${args.height} region`,
    icon: "crop",
  }),
});
