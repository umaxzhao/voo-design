import {
  HANDLE,
  NODE_PORTS,
  NODE_TYPE,
  isPreviewNodeWithContent,
  nodeHasPort,
} from "./nodes/types.js";
import { NODE_TYPE_REGISTRY } from "./nodes/registry.js";

const TARGET_PORT_OFFSET = { x: 32, y: 80 };

/**
 * Output port types a node can emit, in the order they are preferred when
 * wiring a multi-select downstream node. Image first matches the common
 * "several pictures → one generate" case; group nodes have no ports at all.
 */
const SOURCE_HANDLE_PREFERENCE = [
  HANDLE.IMAGE,
  HANDLE.TEXT,
  HANDLE.VIDEO,
  HANDLE.AUDIO,
  HANDLE.MEDIA,
];

/**
 * Returns downstream node types that accept the dragged output.
 * Reads the registry live so adding a node type in one place is enough.
 * When sourceNode is provided, filters out matching node type to prevent self-connection loops.
 */
export function getQuickConnectTypes(handleId, sourceNode = null) {
  const sourceType =
    typeof sourceNode === "string" ? sourceNode : sourceNode?.type;
  const isPreview = sourceType === NODE_TYPE.PREVIEW;
  const previewMediaType = isPreview
    ? sourceNode?.data?.mediaType ||
      (sourceNode?.data?.imageId ? HANDLE.IMAGE : null)
    : null;
  const previewHasContent = isPreview
    ? isPreviewNodeWithContent(sourceNode)
    : false;

  return Object.entries(NODE_TYPE_REGISTRY)
    .filter(([type, definition]) => {
      if (definition.toolbarVisible === false) return false;
      if (sourceType && type === sourceType) return false;
      const sources = definition.quickConnect?.sources || [];
      if (sources.includes(handleId)) return true;
      if (
        handleId === HANDLE.MEDIA &&
        isPreview &&
        previewHasContent &&
        previewMediaType
      ) {
        if (sources.includes(previewMediaType)) return true;
      }
      return false;
    })
    .map(([type]) => type);
}

/** Places the new node so its first compatible input sits near the drop point. */
export function getQuickConnectNodePosition(flowPoint) {
  return {
    x: flowPoint.x + TARGET_PORT_OFFSET.x,
    y: flowPoint.y - TARGET_PORT_OFFSET.y,
  };
}

/**
 * Resolves the appropriate target handle on targetType when wired from sourceHandle.
 * Universal media sinks (Group, Batch, ImageEditor, CombineVideo, Model3D) use HANDLE.MEDIA.
 */
export function resolveTargetHandle(sourceHandle, targetType, sourceNode = null) {
  if (!targetType) return sourceHandle;
  const targetPorts = NODE_PORTS[targetType]?.target ?? [];
  if (targetType === NODE_TYPE.GROUP || targetPorts.includes(HANDLE.MEDIA)) {
    return HANDLE.MEDIA;
  }
  if (targetPorts.includes(sourceHandle)) {
    return sourceHandle;
  }
  if (
    sourceHandle === HANDLE.VIDEO &&
    targetPorts.includes(HANDLE.IMAGE) &&
    !targetPorts.includes(HANDLE.VIDEO)
  ) {
    return HANDLE.IMAGE;
  }
  if (
    sourceHandle === HANDLE.IMAGE &&
    targetPorts.includes(HANDLE.VIDEO) &&
    !targetPorts.includes(HANDLE.IMAGE)
  ) {
    return HANDLE.VIDEO;
  }
  if (sourceHandle === HANDLE.MEDIA) {
    const effectiveMediaType =
      sourceNode?.data?.mediaType ||
      (sourceNode?.data?.imageId ? HANDLE.IMAGE : null);
    if (effectiveMediaType && targetPorts.includes(effectiveMediaType)) {
      return effectiveMediaType;
    }
    if (
      effectiveMediaType === "image" &&
      targetPorts.includes(HANDLE.VIDEO)
    ) {
      return HANDLE.VIDEO;
    }
    if (
      effectiveMediaType === "video" &&
      targetPorts.includes(HANDLE.IMAGE)
    ) {
      return HANDLE.IMAGE;
    }
    if (
      (effectiveMediaType === "markdown" ||
        effectiveMediaType === "mindmap") &&
      targetPorts.includes(HANDLE.TEXT)
    ) {
      return HANDLE.TEXT;
    }
  }
  if (targetPorts.includes(HANDLE.ALL)) {
    return HANDLE.ALL;
  }
  return targetPorts[0] || sourceHandle;
}

/** Builds the connection used by typed ReactFlow ports. */
export function createQuickConnection(
  source,
  targetNodeId,
  targetType = null,
  sourceNode = null,
) {
  return {
    source: source.nodeId,
    sourceHandle: source.handleId,
    target: targetNodeId,
    targetHandle: resolveTargetHandle(source.handleId, targetType, sourceNode),
  };
}

/** Output handle types a node can emit, in preference order. */
export function nodeSourceHandles(node) {
  if (!node) return [];
  return SOURCE_HANDLE_PREFERENCE.filter((handle) =>
    nodeHasPort(node, "source", handle),
  );
}

/**
 * The source handle a node should use when feeding a target type, or null
 * when the target cannot receive anything this node emits.
 */
export function pickSourceHandle(node, targetType) {
  for (const handle of nodeSourceHandles(node)) {
    if (nodeHasPort({ type: targetType }, "target", handle)) return handle;
    if (
      targetType === NODE_TYPE.GROUP &&
      [
        HANDLE.IMAGE,
        HANDLE.VIDEO,
        HANDLE.AUDIO,
        HANDLE.MODEL_3D,
        HANDLE.MEDIA,
      ].includes(handle)
    ) {
      return handle;
    }
    if (node?.type === NODE_TYPE.PREVIEW && handle === HANDLE.MEDIA) {
      const targetPorts = NODE_PORTS[targetType]?.target ?? [];
      const mt =
        node.data?.mediaType || (node.data?.imageId ? HANDLE.IMAGE : null);
      if (
        targetPorts.includes(HANDLE.MEDIA) ||
        targetPorts.includes(HANDLE.ALL) ||
        (mt && targetPorts.includes(mt))
      ) {
        return handle;
      }
    }
  }
  return null;
}

function canWireSource(sourceNode, targetType) {
  return pickSourceHandle(sourceNode, targetType) !== null;
}

/**
 * Downstream node types that can receive an input from EVERY selected source.
 *
 * A type only qualifies when each source has at least one output port the type
 * accepts, so the one-shot wiring never leaves a selection half-connected.
 * Sources without outputs (groups, empty galleries) simply disqualify types.
 */
export function getMultiQuickConnectTypes(sourceNodes) {
  if (!sourceNodes || sourceNodes.length === 0) return [];
  const candidates = new Set();
  for (const handle of SOURCE_HANDLE_PREFERENCE) {
    for (const type of getQuickConnectTypes(handle)) candidates.add(type);
  }
  return [...candidates].filter((type) =>
    sourceNodes.every((node) => canWireSource(node, type)),
  );
}

/**
 * Builds the typed edges wiring every selected source into one new node.
 *
 * Each source connects through its preferred compatible port; sources may use
 * different handle types (an imageAsset feeds IMAGE, a prompt feeds TEXT) as
 * long as the target accepts them.
 *
 * @returns {Array<{source, sourceHandle, target, targetHandle}>} one edge per
 *   source, or null when any source cannot be wired.
 */
export function createMultiQuickConnections(
  sourceNodes,
  targetNodeId,
  targetType,
) {
  const connections = [];
  for (const node of sourceNodes) {
    const handle = pickSourceHandle(node, targetType);
    if (!handle) return null;
    connections.push({
      source: node.id,
      sourceHandle: handle,
      target: targetNodeId,
      targetHandle: resolveTargetHandle(handle, targetType, node),
    });
  }
  return connections;
}

