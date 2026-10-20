/**
 * Tool: select_object — AI object selection inside a rough box.
 */

import { createTableEditorCommandTool } from "./editor_command.js";

export default createTableEditorCommandTool("select_object", {
  presentCall: (args) => ({
    title: `Object select in ${Math.round(args.width)}×${Math.round(args.height)} box`,
    icon: "wand",
  }),
});
