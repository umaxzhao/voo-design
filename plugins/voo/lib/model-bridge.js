/**
 * Re-export of the standalone VOO model bridge so this bundle can insert its
 * row from inside the package. The portable connector builder copies the real
 * module over this file, so an installed connector never depends on the
 * sibling `plugins/voo-model-bridge` package.
 */
export { default } from "../../voo-model-bridge/lib/model-bridge.js";
export * from "../../voo-model-bridge/lib/model-bridge.js";
