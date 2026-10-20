import { EXECUTION_MODE, HANDLE, NODE_TYPE } from "./node_enums.js";
import { t } from "../../shared/i18n.js";
import {
  DEFAULT_DATA,
  EMPTY_LIST,
  stripOptionalDataDefaults,
} from "./node_factory.js";
import { applyOutputBatch } from "./output_group_schema.js";
import { NODE_TYPE_REGISTRY, REMOVED_NODE_TYPES } from "./registry.js";

/**
 * Types that were deleted outright rather than renamed, so there is nothing to
 * migrate them onto. They are declared in the node registry so any future
 * removed type lives in one place.
 */
const REMOVED_TYPES = REMOVED_NODE_TYPES;

const LEGACY_GALLERY_TYPES = new Set(["imageGallery", "gallery", "output"]);

/** Node types written by older builds, mapped onto their current names. */
const LEGACY_TYPES = Object.fromEntries(
  Object.entries(NODE_TYPE_REGISTRY).flatMap(([, definition]) =>
    Object.entries(definition.migration?.legacyMap ?? {}).map(
      ([oldType, newType]) => [oldType, newType],
    ),
  ),
);

const TRANSIENT_NODE_KEYS = new Set(["selected", "dragging", "resizing"]);

/** Removes ReactFlow interaction state while preserving position and size. */
export function stripTransientNodeState(nodes) {
  return nodes.map((node) =>
    Object.fromEntries(
      Object.entries(node).filter(([key]) => !TRANSIENT_NODE_KEYS.has(key)),
    ),
  );
}

/** The old context capsule's five fields, folded into one phrase list. */
function migrateContextFields(data) {
  const carried = ["character", "style", "scene", "camera", "constraints"]
    .map((key) => data?.[key]?.trim())
    .filter(Boolean)
    .join("\n");
  return carried ? { text: carried } : {};
}

function migratePromptCapsuleFields(data) {
  const text = [data?.phrases?.trim(), data?.extra?.trim()]
    .filter(Boolean)
    .join("\n");
  return text ? { text } : {};
}

function migratePreviewFields(node) {
  if (node.type === NODE_TYPE.COMBINE_VIDEO) {
    const assetId =
      node.data?.results?.[node.data?.selectedIndex ?? 0] ??
      node.data?.results?.[0] ??
      node.data?.assetId ??
      null;
    return {
      mediaType: "video",
      assetId,
      url: node.data?.url ?? null,
      title: node.data?.title || "",
      filename: node.data?.filename || node.data?.title || "",
    };
  }
  if (node.type === NODE_TYPE.MODEL_3D) {
    const assetId =
      node.data?.results?.[node.data?.selectedIndex ?? 0] ??
      node.data?.results?.[0] ??
      node.data?.assetId ??
      null;
    return {
      mediaType: "model3d",
      assetId,
      filename: node.data?.filename || node.data?.title || "",
      title: node.data?.title || node.data?.filename || "",
    };
  }
  return {};
}

/** Determines media type for legacy Gallery assets or fails fast. */
function determineAssetMediaType(assetId, galleryNode, nodes, edges) {
  if (typeof assetId === "string") {
    if (
      assetId.startsWith("data:video/") ||
      /\.(mp4|webm|mov|mkv|avi|m4v)($|\?)/i.test(assetId) ||
      /^(vid_|vid-|video[-_])/i.test(assetId)
    ) {
      return "video";
    }
    if (
      assetId.startsWith("data:image/") ||
      /\.(png|jpe?g|webp|gif|svg|avif|bmp)($|\?)/i.test(assetId) ||
      /^(img_|img-|image[-_])/i.test(assetId)
    ) {
      return "image";
    }
    if (
      assetId.startsWith("data:audio/") ||
      /\.(mp3|wav|ogg|m4a|aac|flac)($|\?)/i.test(assetId) ||
      /^(aud_|aud-|audio[-_])/i.test(assetId)
    ) {
      return "audio";
    }
    if (
      assetId.startsWith("data:model/") ||
      /\.(glb|gltf|obj)($|\?)/i.test(assetId) ||
      /^(model_|model-|3d[-_])/i.test(assetId)
    ) {
      return "model3d";
    }
  }

  // Check incoming edges targeting this gallery node
  const incoming = (edges ?? []).filter((e) => e.target === galleryNode.id);
  for (const edge of incoming) {
    if (edge.sourceHandle === HANDLE.VIDEO) return "video";
    if (edge.sourceHandle === HANDLE.IMAGE) return "image";
    if (edge.sourceHandle === HANDLE.AUDIO) return "audio";
    if (edge.sourceHandle === HANDLE.MODEL_3D) return "model3d";

    const sourceNode = (nodes ?? []).find((n) => n.id === edge.source);
    if (sourceNode) {
      if (
        sourceNode.type === NODE_TYPE.VIDEO ||
        sourceNode.type === NODE_TYPE.COMBINE_VIDEO ||
        sourceNode.type === NODE_TYPE.API_VIDEO
      ) {
        return "video";
      }
      if (
        sourceNode.type === NODE_TYPE.GENERATE ||
        sourceNode.type === NODE_TYPE.IMAGE_EDITOR ||
        sourceNode.type === NODE_TYPE.API_IMAGE
      ) {
        return "image";
      }
      if (sourceNode.type === NODE_TYPE.PREVIEW) {
        return sourceNode.data?.mediaType || "image";
      }
      if (sourceNode.type === NODE_TYPE.API_AUDIO) {
        return "audio";
      }
      if (sourceNode.type === NODE_TYPE.MODEL_3D) {
        return "model3d";
      }
      const entry = NODE_TYPE_REGISTRY[sourceNode.type];
      if (
        entry?.mediaKinds?.includes("video") &&
        !entry.mediaKinds.includes("image")
      ) {
        return "video";
      }
      if (
        entry?.mediaKinds?.includes("image") &&
        !entry.mediaKinds.includes("video")
      ) {
        return "image";
      }
      if (entry?.mediaKinds?.includes("audio")) {
        return "audio";
      }
      if (entry?.mediaKinds?.includes("model3d")) {
        return "model3d";
      }
    }
  }

  throw new Error(
    `Cannot determine media type for legacy Gallery asset "${assetId}" in node "${galleryNode.id}"`,
  );
}

/** Migrates a legacy Gallery node to a Group container with child candidates. */
function migrateLegacyGallery(node, nodes, edges) {
  const rawAssets = Array.isArray(node.data?.imageIds)
    ? node.data.imageIds
    : Array.isArray(node.data?.results)
      ? node.data.results
      : [];
  const assetIds = rawAssets.filter(Boolean);

  const oldWidth = Number.parseFloat(node.style?.width) || node.width || 560;
  const oldHeight = Number.parseFloat(node.style?.height) || node.height || 420;

  const groupNode = {
    ...node,
    type: NODE_TYPE.GROUP,
    position: node.position ?? { x: 0, y: 0 },
    zIndex: -1,
    style: {
      ...(node.style ?? {}),
      width: oldWidth,
      height: oldHeight,
    },
    width: oldWidth,
    height: oldHeight,
    data: {
      ...DEFAULT_DATA[NODE_TYPE.GROUP](),
      label: node.data?.label || t("node.group.defaultLabel"),
      color: node.data?.color || "#9ca3af",
      autoLayout: true,
      autoLayoutMode: "grid",
    },
  };

  if (assetIds.length === 0) {
    return [groupNode];
  }

  const incomingEdge = (edges ?? []).find((e) => e.target === node.id);
  const candidates = assetIds.map((assetId, index) => {
    const mediaType = determineAssetMediaType(assetId, node, nodes, edges);
    const candidateId = `${node.id}-candidate-${index}`;

    if (mediaType === "video") {
      return {
        id: candidateId,
        type: NODE_TYPE.COMBINE_VIDEO,
        position: { x: 0, y: 0 },
        data: {
          ...DEFAULT_DATA[NODE_TYPE.COMBINE_VIDEO](),
          title: `migrated-clip-${index + 1}`,
          results: [assetId],
          selectedIndex: 0,
        },
      };
    }

    if (mediaType === "audio") {
      return {
        id: candidateId,
        type: NODE_TYPE.API_AUDIO,
        position: { x: 0, y: 0 },
        data: {
          ...DEFAULT_DATA[NODE_TYPE.API_AUDIO](),
          results: [assetId],
        },
      };
    }

    if (mediaType === "model3d") {
      return {
        id: candidateId,
        type: NODE_TYPE.MODEL_3D,
        position: { x: 0, y: 0 },
        data: {
          ...DEFAULT_DATA[NODE_TYPE.MODEL_3D](),
          title: `migrated-model-${index + 1}`,
          results: [assetId],
          selectedIndex: 0,
        },
      };
    }

    return {
      id: candidateId,
      type: NODE_TYPE.IMAGE_EDITOR,
      position: { x: 0, y: 0 },
      data: {
        ...DEFAULT_DATA[NODE_TYPE.IMAGE_EDITOR](),
        imageId: assetId,
        filename: `migrated-${index + 1}.png`,
        origin: "gallery-migrated",
      },
    };
  });

  const batchId = `batch-migrated-${node.id}`;
  const slotId = `slot-${node.id}`;

  const batchResult = applyOutputBatch({
    group: groupNode,
    nodes: [groupNode],
    batchId,
    slotId,
    candidates,
    sourceNodeId: incomingEdge?.source ?? null,
    operation: "gallery_migration",
    outputMode: "variants",
  });

  const finalGroup = {
    ...batchResult.group,
    width: batchResult.group.style?.width ?? batchResult.group.width,
    height: batchResult.group.style?.height ?? batchResult.group.height,
  };

  return batchResult.nodes.map((n) =>
    n.id === finalGroup.id ? finalGroup : n,
  );
}

/** Upgrades a stored graph so renamed node types keep rendering. */
export function migrateNodes(nodes, edges = []) {
  if (!Array.isArray(nodes)) return [];
  const migrated = stripTransientNodeState(nodes)
    .filter(
      (node) =>
        node && typeof node === "object" && !REMOVED_TYPES.has(node.type),
    )
    .flatMap((node) => {
      if (LEGACY_GALLERY_TYPES.has(node.type)) {
        return migrateLegacyGallery(node, nodes, edges);
      }

      const type = LEGACY_TYPES[node.type] ?? node.type;
      const carried =
        node.type === "contextCapsule"
          ? migrateContextFields(node.data)
          : node.type === "promptCapsule"
            ? migratePromptCapsuleFields(node.data)
            : {};
      const createDefaultData = DEFAULT_DATA[type];
      const legacyExecution =
        node.type === NODE_TYPE.API_IMAGE || node.type === NODE_TYPE.API_VIDEO
          ? { executionMode: EXECUTION_MODE.API }
          : {};
      const previewFields =
        type === NODE_TYPE.PREVIEW ? migratePreviewFields(node) : {};
      const baseData = createDefaultData
        ? {
            ...createDefaultData(),
            ...(node.data ?? {}),
            ...carried,
            ...legacyExecution,
            ...previewFields,
          }
        : node.data
          ? {
              ...node.data,
              ...carried,
              ...legacyExecution,
              ...previewFields,
            }
          : node.data;
      const data = stripOptionalDataDefaults(baseData);
      if (data && typeof data === "object") {
        if (type === NODE_TYPE.PREVIEW) {
          if (!data.mediaType) {
            data.mediaType = data.imageId ? "image" : "image";
          }
          if (!data.assetId && data.imageId) {
            data.assetId = data.imageId;
          }
          delete data.results;
          delete data.selectedIndex;
        }
        if (
          Array.isArray(data.results) &&
          data.results.length === 0 &&
          data.results !== EMPTY_LIST
        ) {
          data.results = EMPTY_LIST;
        }
        if (
          Array.isArray(data.versions) &&
          data.versions.length === 0 &&
          data.versions !== EMPTY_LIST
        ) {
          data.versions = EMPTY_LIST;
        }
        if (
          Array.isArray(data.layoutVersions) &&
          data.layoutVersions.length === 0 &&
          data.layoutVersions !== EMPTY_LIST
        ) {
          data.layoutVersions = EMPTY_LIST;
        }
      }
      return [
        {
          ...node,
          type,
          data,
        },
      ];
    });
  return pruneAgentBindings(ensureValidParentNodes(migrated));
}

/**
 * Ensures all parentNode references point to existing nodes, and places parent
 * nodes before their child nodes so ReactFlow renders nested nodes without error.
 */
export function ensureValidParentNodes(nodes) {
  if (!Array.isArray(nodes) || nodes.length === 0) return [];
  let hasParent = false;
  for (let i = 0; i < nodes.length; i += 1) {
    if (nodes[i]?.parentNode) {
      hasParent = true;
      break;
    }
  }
  if (!hasParent) return nodes;

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const sanitized = nodes.map((n) => {
    if (n.parentNode && !nodeMap.has(n.parentNode)) {
      const copy = { ...n };
      delete copy.parentNode;
      delete copy.extent;
      return copy;
    }
    return n;
  });

  const parents = sanitized.filter((n) => !n.parentNode);
  const children = sanitized.filter((n) => Boolean(n.parentNode));
  return [...parents, ...children];
}

/**
 * Clears an Agent node's `outputGroupId` when its Group is gone or is no
 * longer a Group. The binding is plain node data (never an edge), so a stale
 * id would otherwise survive a load and point the next run at a missing sink.
 */
export function pruneAgentBindings(nodes) {
  if (!Array.isArray(nodes) || nodes.length === 0) return nodes;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  let changed = false;
  const next = nodes.map((node) => {
    if (node?.type !== NODE_TYPE.AGENT) return node;
    const binding = node.data?.outputGroupId;
    if (!binding) return node;
    if (byId.get(binding)?.type === NODE_TYPE.GROUP) return node;
    changed = true;
    return { ...node, data: { ...node.data, outputGroupId: null } };
  });
  return changed ? next : nodes;
}

/**
 * Drops edges whose endpoints are gone, which is what keeps a pruned node from
 * leaving a wire hanging in mid-air.
 * Normalizes incoming edges to Group and Agent nodes to their single inputs.
 *
 * Run this after `migrateNodes` and against its output, never against the raw
 * stored nodes.
 */
export function pruneOrphanEdges(nodes, edges) {
  const nodeMap = new Map((nodes ?? []).map((node) => [node.id, node]));
  const legacyPreviewSourceHandles = [
    HANDLE.IMAGE,
    HANDLE.VIDEO,
    HANDLE.AUDIO,
    HANDLE.MODEL_3D,
    HANDLE.HTML,
    HANDLE.SLIDES,
    HANDLE.MARKDOWN,
    HANDLE.MINDMAP,
  ];

  return (edges ?? [])
    .filter((edge) => nodeMap.has(edge.source) && nodeMap.has(edge.target))
    .map((edge) => {
      let updatedEdge = edge;
      const sourceNode = nodeMap.get(edge.source);
      if (
        sourceNode?.type === NODE_TYPE.PREVIEW &&
        updatedEdge.sourceHandle !== HANDLE.MEDIA &&
        legacyPreviewSourceHandles.includes(updatedEdge.sourceHandle)
      ) {
        updatedEdge = { ...updatedEdge, sourceHandle: HANDLE.MEDIA };
      }

      const targetNode = nodeMap.get(edge.target);
      if (
        (targetNode?.type === NODE_TYPE.GROUP ||
          targetNode?.type === NODE_TYPE.PREVIEW) &&
        updatedEdge.targetHandle !== HANDLE.MEDIA
      ) {
        updatedEdge = { ...updatedEdge, targetHandle: HANDLE.MEDIA };
      }
      if (
        targetNode?.type === NODE_TYPE.AGENT &&
        [HANDLE.TEXT, HANDLE.IMAGE, HANDLE.VIDEO, HANDLE.AUDIO].includes(
          updatedEdge.targetHandle,
        )
      ) {
        updatedEdge = { ...updatedEdge, targetHandle: HANDLE.ALL };
      }
      return updatedEdge;
    });
}
