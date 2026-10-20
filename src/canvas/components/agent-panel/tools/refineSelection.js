/**
 * Tool: refine_selection — Feather / expand / contract / smooth the pixel
 * selection in the open image editor.
 */

import { createTableEditorCommandTool } from "./editor_command.js";

export default createTableEditorCommandTool("refine_selection", {
  presentCall: (args) => ({
    title: `${args.operation} selection${args.amount ? ` by ${args.amount}` : ""}`,
    icon: "wand",
  }),
});
