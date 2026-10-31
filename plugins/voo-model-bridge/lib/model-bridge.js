/** Public model bridge API; protocol translation and server lifecycle stay independent. */
import { name } from "./bridge-common.js";
import { apply } from "./bridge-plugin.js";
export { name, BRIDGE_VERSION, DEFAULT_PORT, DEFAULT_PROVIDER, DEFAULT_HOST, STATE_FILE_NAME, MAX_BODY_BYTES, MAX_PORT_ATTEMPTS, BridgeRequestError, resolveBridgeSettings, readSelection } from "./bridge-common.js";
export { messageText, toToolSchemas, toDshRequest, toDshGenerateOptions } from "./bridge-request.js";
export { mapFinishReason, createCompletionTranslator } from "./bridge-completion.js";
export { createModelBridge } from "./bridge-server.js";
export { apply } from "./bridge-plugin.js";

export default { name, apply };
