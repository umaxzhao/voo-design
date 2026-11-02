/**
 * Stable entry point for the design-editor command table.
 *
 * The monolithic command_table.js was split by zone:
 *   - definitions live in ./command_table/definitions*.js
 *   - implementations live in ./command_table/implementations*.js
 *   - executor/gesture dispatch live in ./command_table/executor.js
 *
 * This file re-exports the same public surface as before so existing imports
 * (tests, editor_command_bridge, tool factories) keep working unchanged.
 */
export {
  editorCommandError,
  noSelection,
  bitmapMissing,
} from "./command_table/errors.js";
export { layerDisplayName, downscaleDataUrl } from "./command_table/helpers.js";
export {
  COMMAND_DEFINITIONS,
  getCommandDefinition,
  listCommandCapabilities,
} from "./command_table/definitions.js";
export { executeEditorCommand } from "./command_table/executor.js";
export { createCommandReceipt } from "./command_table/receipt.js";
