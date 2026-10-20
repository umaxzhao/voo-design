/**
 * Shared node/handle vocabulary, validation, migration, and factory utilities.
 *
 * Facade module re-exporting all enums, migration helpers, and node factories.
 */

export {
  AGENT_OWNERSHIP_EDGE_PREFIX,
  EXECUTION_MODE,
  GROUP_OWNERSHIP_ROLE,
  HANDLE,
  NODE_PORTS,
  NODE_TYPE,
  PLATFORM_TARGET,
  RUN_STATUS,
  isAgentGroupBinding,
  isGroupOwnershipEdge,
  nodeHasPort,
  resolveAgentGroupId,
} from "./node_enums.js";

export {
  ensureValidParentNodes,
  migrateNodes,
  pruneAgentBindings,
  pruneOrphanEdges,
  stripTransientNodeState,
} from "./node_migration.js";

export {
  createNode,
  createNodeId,
  isPreviewNodeWithContent,
  isValidConnection,
} from "./node_factory.js";
