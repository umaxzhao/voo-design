// Connected result ingestion into image editors and Groups.
import { HANDLE, ensureValidParentNodes, NODE_TYPE } from "../nodes/types.js";
import {
  createDocument,
  createImageNode,
} from "../editor/scene_doc_factory.js";
import { scheduleSave } from "./persistence.js";
import { isWorkflowReadOnly } from "./workflow_readonly.js";
import {
  groupMemberTypeForMedia,
  memberAssetIds,
  mediaTypesFromTargetEdges,
  groupMemberPositions,
  groupExpandedForMembers,
  createGroupMemberNode,
} from "./workflow_node_shared.js";
import { reflowAutoLayoutGroups } from "./workflow_group_reflow.js";

export function createWorkflowNodeIngestionActions(set, get) {
  return {
    autoIngestResultsToDownstream(
      sourceNodeId,
      resultIds,
      targetNodeId = null,
    ) {
      if (isWorkflowReadOnly(get())) return;
      if (!Array.isArray(resultIds) || resultIds.length === 0) return;

      const edges = get().edges;
      const nodes = get().nodes;
      const sourceNode = nodes.find((n) => n.id === sourceNodeId);
      if (!sourceNode) return;

      // Find any batch nodes that have this source node wired as an input member
      const batchParentNodes = nodes.filter(
        (n) =>
          n.type === NODE_TYPE.BATCH &&
          edges.some((e) => e.source === sourceNodeId && e.target === n.id),
      );
      const allSourceIds = [sourceNodeId, ...batchParentNodes.map((b) => b.id)];

      // Batch is a scheduling pass-through: output type belongs to the
      // completed member, not the Batch's visual image/video source port.
      const outgoingEdges = edges.filter(
        (edge) =>
          allSourceIds.includes(edge.source) &&
          (!targetNodeId || edge.target === targetNodeId),
      );
      if (outgoingEdges.length === 0) return;

      const isVideoSource =
        sourceNode.type === NODE_TYPE.VIDEO ||
        sourceNode.type === NODE_TYPE.API_VIDEO ||
        sourceNode.type === NODE_TYPE.COMBINE_VIDEO;

      let hasDocChanges = false;
      const groupIngests = [];
      const updatedNodes = nodes.map((node) => {
        const targetEdges = outgoingEdges.filter((e) => e.target === node.id);
        if (targetEdges.length === 0) return node;

        // 1. Target is IMAGE_EDITOR or PREVIEW (image)
        if (
          node.type === NODE_TYPE.IMAGE_EDITOR ||
          (node.type === NODE_TYPE.PREVIEW &&
            (!node.data?.mediaType || node.data?.mediaType === "image"))
        ) {
          // If all edges from this source are strictly text or audio, or strictly video from a video node, skip image layer ingestion
          const hasImageConnection = targetEdges.some(
            (e) =>
              e.sourceHandle === HANDLE.IMAGE ||
              e.sourceHandle === HANDLE.MEDIA ||
              !e.sourceHandle ||
              (!isVideoSource &&
                e.sourceHandle !== HANDLE.TEXT &&
                e.sourceHandle !== HANDLE.AUDIO),
          );
          if (!hasImageConnection) {
            return node;
          }

          const existingDoc = node.data?.editorDoc;
          let doc = existingDoc
            ? JSON.parse(JSON.stringify(existingDoc))
            : null;
          const placement = targetEdges.find(
            (edge) => edge.data?.imagePlacement,
          )?.data?.imagePlacement;
          if (placement) {
            const selectedIndex = sourceNode.data?.selectedIndex ?? 0;
            const assetId = resultIds[selectedIndex] ?? resultIds[0];
            const linkedLayer = doc?.nodes?.find(
              (layer) => layer.sourceWorkflowNodeId === sourceNodeId,
            );
            if (linkedLayer?.imageId === assetId) return node;
            const docWidth = doc?.width || node.data?.layoutWidth || 1024;
            const docHeight = doc?.height || node.data?.layoutHeight || 1024;
            if (!doc) {
              doc = createDocument(docWidth, docHeight, "transparent");
              if (node.data?.imageId && node.data.imageId !== assetId) {
                doc.nodes.push(
                  createImageNode({
                    x: 0,
                    y: 0,
                    width: docWidth,
                    height: docHeight,
                    imageId: node.data.imageId,
                    name: "Layer 1",
                  }),
                );
              }
            }
            if (linkedLayer) {
              doc.nodes = doc.nodes.map((layer) =>
                layer.id === linkedLayer.id
                  ? { ...layer, imageId: assetId }
                  : layer,
              );
            } else {
              const newLayer = createImageNode({
                x: placement.x,
                y: placement.y,
                width: placement.width,
                height: placement.height,
                imageId: assetId,
                name: placement.name || `Layer ${doc.nodes.length + 1}`,
              });
              doc.nodes = [
                ...doc.nodes,
                { ...newLayer, sourceWorkflowNodeId: sourceNodeId },
              ];
            }
            hasDocChanges = true;
            return {
              ...node,
              data: {
                ...node.data,
                imageId:
                  linkedLayer && node.data?.imageId === linkedLayer.imageId
                    ? assetId
                    : node.data?.imageId || assetId,
                editorDoc: doc,
              },
            };
          }
          const existingLayers = doc?.nodes || [];
          const existingImageIds = new Set(
            existingLayers.filter((l) => l.imageId).map((l) => l.imageId),
          );

          const seen = new Set(existingImageIds);
          const newImageIds = [];
          for (const id of resultIds) {
            if (id && !seen.has(id)) {
              seen.add(id);
              newImageIds.push(id);
            }
          }

          if (newImageIds.length === 0) {
            return node;
          }

          const docWidth = doc?.width || node.data?.layoutWidth || 1024;
          const docHeight = doc?.height || node.data?.layoutHeight || 1024;

          if (!doc) {
            doc = createDocument(docWidth, docHeight, "transparent");
            if (
              node.data?.imageId &&
              !newImageIds.includes(node.data.imageId)
            ) {
              doc.nodes.push(
                createImageNode({
                  x: 0,
                  y: 0,
                  width: docWidth,
                  height: docHeight,
                  imageId: node.data.imageId,
                  name: "Layer 1",
                }),
              );
            }
          }

          newImageIds.forEach((assetId) => {
            const layerIndex = (doc.nodes?.length || 0) + 1;
            const newLayer = createImageNode({
              x: 0,
              y: 0,
              width: docWidth,
              height: docHeight,
              imageId: assetId,
              name: `Layer ${layerIndex}`,
            });
            doc.nodes = [...(doc.nodes || []), newLayer];
          });

          const primaryImageId =
            node.data?.imageId || newImageIds[0] || resultIds[0];
          hasDocChanges = true;
          return {
            ...node,
            data: {
              ...node.data,
              imageId: primaryImageId,
              editorDoc: doc,
            },
          };
        }

        // 2. Target is GROUP — the output becomes independent child nodes.
        // Materialisation is deferred until the other one-shot target updates
        // have been committed so the new children read the freshest node list.
        if (node.type === NODE_TYPE.GROUP) {
          for (const mediaType of mediaTypesFromTargetEdges(targetEdges)) {
            groupIngests.push({
              groupId: node.id,
              sourceNodeId,
              resultIds: [...resultIds],
              mediaType,
            });
          }
          return node;
        }

        return node;
      });

      if (hasDocChanges) {
        set({ nodes: updatedNodes });
        scheduleSave(get);
      }
      for (const ingest of groupIngests) {
        get().ingestResultsIntoGroup(ingest);
      }
    },

    /**
     * Materialises generated results into an existing Group as independent
     * child nodes. This is the only connected-output writer for Group
     * membership; manual drags write the same `parentNode` field in
     * onNodesChange, so there is no second member list to drift apart.
     */
    ingestResultsIntoGroup({ groupId, sourceNodeId, resultIds, mediaType }) {
      if (isWorkflowReadOnly(get())) return [];
      const nodeType = groupMemberTypeForMedia(mediaType);
      if (!nodeType || !Array.isArray(resultIds) || resultIds.length === 0) {
        return [];
      }
      const nodes = get().nodes;
      const group = nodes.find(
        (n) => n.id === groupId && n.type === NODE_TYPE.GROUP,
      );
      if (!group) return [];

      const existingChildren = nodes.filter((n) => n.parentNode === groupId);
      const existingAssets = new Set(
        existingChildren.flatMap((child) => memberAssetIds(child)),
      );
      const freshIds = resultIds.filter(
        (assetId) => assetId && !existingAssets.has(assetId),
      );
      if (freshIds.length === 0) return [];

      const types = freshIds.map(() => nodeType);
      const positions = groupMemberPositions(group, existingChildren, types);
      const sourceNode = nodes.find((n) => n.id === sourceNodeId);
      const aspectRatio =
        sourceNode?.data?.aspectRatio || sourceNode?.data?.jimengAspectRatio;
      const created = freshIds.map((assetId, index) =>
        createGroupMemberNode({
          assetId,
          mediaType,
          sourceNodeId,
          groupId,
          position: positions[index],
          index,
          aspectRatio,
        }),
      );

      const updatedGroup =
        group.data?.autoLayout === false
          ? groupExpandedForMembers(group, [...existingChildren, ...created])
          : group;
      const merged = ensureValidParentNodes([
        ...nodes.map((node) => (node.id === groupId ? updatedGroup : node)),
        ...created,
      ]);
      // Auto layout is the default: a generated member joins the waterfall and
      // the whole group restacks, instead of trusting pre-measure append slots.
      set({
        nodes:
          group.data?.autoLayout === false
            ? merged
            : reflowAutoLayoutGroups(merged, [groupId]),
      });
      scheduleSave(get);
      return created.map((node) => node.id);
    },

    /** Appends completed results to all directly connected downstream nodes. */
    appendResultsToGalleries(sourceNodeId, imageIds) {
      get().autoIngestResultsToDownstream(sourceNodeId, imageIds);
    },
  };
}
