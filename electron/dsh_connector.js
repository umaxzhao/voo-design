/** Public DSH connector API; detection, resources and installation stay independent. */
export { DSH_CONNECTOR_PACKAGE, DSH_CONNECTOR_DIRNAME, DSH_CONNECTOR_RESOURCE_DIRNAME, DSH_DEFAULT_PROFILE, DSH_INSTALL_TIMEOUT_MS } from "./dsh-connector-common.js";
export { isConnectorDir, resolvePrebuiltConnectorDir, connectorPatchDirs, rewriteConnectorPatch } from "./dsh-connector-resources.js";
export { defaultUserDataDir, defaultDshHome, defaultDshAppPaths, resolveDshAppPath, readDshProfile, readDshProfiles, readDshStatus } from "./dsh-connector-detection.js";
export { findDshBinary } from "./dsh-connector-binary.js";
export { defaultRepoRoot } from "./dsh-connector-prepare.js";
export { installDshConnector } from "./dsh-connector-install.js";
