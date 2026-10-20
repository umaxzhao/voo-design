import { imagePublicationFromArguments } from "./image-publication-bindings.js";
import { createNode, HANDLE, NODE_TYPE, nodeHasPort } from "../nodes/types.js";
import { dataUrlToBlob, getImageBlobMap, putImage } from "./db.js";
import { scheduleSave } from "./persistence.js";
import { mergeBlobsAsUrls } from "./image_cache.js";
import { commitWorkflowHistory } from "../undo-action-contracts.js";
import { isWorkflowReadOnly } from "./workflow_readonly.js";

/** Merging editor layers and generating reverse prompt nodes. */
export function createImageMergeActions(set, get) {
  return {
    /** Adds the full text returned by an image reverse-prompt request beside its source. */
    async addReversePromptNode(sourceNodeId, text) {
      if (isWorkflowReadOnly(get())) return null;
      if (typeof text !== "string" || !text.trim()) {
        throw new Error("empty-reverse-prompt");
      }
      const source = get().nodes.find((node) => node.id === sourceNodeId);
      if (!source) throw new Error("source-image-missing");

      let cleaned = text.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned
          .replace(/^```[a-z]*\n?/i, "")
          .replace(/\n?```$/i, "")
          .trim();
      }
      cleaned = cleaned
        .replace(/^(here is (the|a) prompt:?|prompt:?)\s*/i, "")
        .trim();

      const sourceWidth = source.measured?.width ?? source.width ?? 280;
      const node = createNode(
        NODE_TYPE.PROMPT,
        {
          x: source.position.x + sourceWidth + 48,
          y: source.position.y,
        },
        // Preserve line breaks: prompt output is user-editable and must not be
        // truncated or reconstructed from a preview after it comes back.
        { text: cleaned },
      );

      // Find any downstream nodes connected to sourceNodeId and auto-wire this new PROMPT node to them.
      const currentEdges = get().edges ?? [];
      const outgoingEdges = currentEdges.filter(
        (edge) => edge.source === sourceNodeId,
      );
      const newEdges = [...currentEdges];
      const updatedNodes = get().nodes.map((item) => ({
        ...item,
        selected: false,
      }));

      outgoingEdges.forEach((edge) => {
        const targetNodeIndex = updatedNodes.findIndex(
          (n) => n.id === edge.target,
        );
        if (targetNodeIndex >= 0) {
          const targetNode = updatedNodes[targetNodeIndex];
          if (nodeHasPort(targetNode, "target", HANDLE.TEXT)) {
            const edgeId = `edge-${node.id}-${HANDLE.TEXT}-${targetNode.id}-${HANDLE.TEXT}`;
            if (
              !newEdges.some(
                (e) =>
                  e.source === node.id &&
                  e.target === targetNode.id &&
                  e.targetHandle === HANDLE.TEXT,
              )
            ) {
              newEdges.push({
                id: edgeId,
                source: node.id,
                sourceHandle: HANDLE.TEXT,
                target: targetNode.id,
                targetHandle: HANDLE.TEXT,
                type: "default",
                animated: false,
              });
            }
            // If target node prompt is empty, also update its data.prompt
            if (
              typeof targetNode.data?.prompt === "string" &&
              !targetNode.data.prompt.trim()
            ) {
              updatedNodes[targetNodeIndex] = {
                ...targetNode,
                data: { ...targetNode.data, prompt: cleaned },
              };
            }
          }
        }
      });

      set({
        nodes: [...updatedNodes, { ...node, selected: true }],
        edges: newEdges,
      });

      // The call returns after the platform already finished. Persist this
      // creation before resolving so a sibling canvas cannot merge an older
      // document over the freshly returned reverse prompt.
      await scheduleSave(get, { immediate: true });
      return node.id;
    },

    async mergeEditorNodes(sourceNodeId, targetNodeId) {
      if (isWorkflowReadOnly(get())) return false;
      if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId)
        return false;
      const nodes = get().nodes;
      const source = nodes.find((n) => n.id === sourceNodeId);
      const target = nodes.find((n) => n.id === targetNodeId);
      if (!source || !target) return false;

      const { workflowId, workflowHistories } = get();
      // Imports, decoding and preview persistence may finish after a project
      // switch or reopen. Never apply their result to a different workspace.
      const isCurrentMerge = () => {
        const state = get();
        return (
          state.workflowId === workflowId &&
          state.workflowHistories === workflowHistories &&
          !isWorkflowReadOnly(state) &&
          state.nodes.some((node) => node.id === sourceNodeId) &&
          state.nodes.some((node) => node.id === targetNodeId)
        );
      };

      commitWorkflowHistory(get, "workflow.editor.mergeNodes");

      const [
        { createDocument, createImageNode },
        { createBitmapCache, decodeImageSource },
        { createExport },
      ] = await Promise.all([
        import("../editor/scene_model.js"),
        import("../editor/bitmap_cache.js"),
        import("../editor/editor_export.js"),
      ]);
      if (!isCurrentMerge()) return false;

      const resolveNodeImageInfo = async (node) => {
        let imageId =
          node.data?.imageId ||
          node.data?.assetId ||
          node.data?.results?.[node.data?.selectedIndex ?? 0] ||
          node.data?.results?.[0] ||
          null;

        let imageSrc = null;
        if (imageId && get().images[imageId]) {
          imageSrc = get().images[imageId];
        } else if (node.data?.url) {
          imageSrc = node.data.url;
        } else if (
          typeof imageId === "string" &&
          (imageId.startsWith("data:") ||
            imageId.startsWith("blob:") ||
            imageId.startsWith("http://") ||
            imageId.startsWith("https://"))
        ) {
          imageSrc = imageId;
        }

        if (!imageSrc && imageId) {
          try {
            const blobs = await getImageBlobMap([imageId]);
            const blob = blobs.get(imageId);
            if (blob) {
              imageSrc = URL.createObjectURL(blob);
            }
          } catch {
            // fallback
          }
        }

        let width = node.data?.width;
        let height = node.data?.height;
        if ((!width || !height) && imageSrc) {
          try {
            const img = await decodeImageSource(imageSrc);
            width = img.naturalWidth || img.width;
            height = img.naturalHeight || img.height;
          } catch {
            // fallback
          }
        }
        if (!isCurrentMerge()) return null;

        width = width || 1024;
        height = height || 1024;

        if (imageSrc && (!imageId || !get().images[imageId])) {
          try {
            let blob = null;
            if (typeof imageSrc === "string" && imageSrc.startsWith("data:")) {
              blob = dataUrlToBlob(imageSrc);
            } else {
              const res = await fetch(imageSrc);
              blob = await res.blob();
            }
            if (!isCurrentMerge()) return null;
            if (blob) {
              const newKey = `img-${crypto.randomUUID()}`;
              await putImage(
                newKey,
                blob,
                imagePublicationFromArguments(arguments),
              );
              if (!isCurrentMerge()) return null;
              const objectUrl = URL.createObjectURL(blob);
              set({
                images: { ...get().images, [newKey]: objectUrl },
                thumbnails: {
                  ...(get().thumbnails || {}),
                  [newKey]: objectUrl,
                },
              });
              imageId = newKey;
            }
          } catch {
            // fallback
          }
        }

        return { imageId, imageSrc, width, height };
      };

      const getOrCreateDoc = async (node) => {
        if (node.data?.editorDoc && Array.isArray(node.data.editorDoc.nodes)) {
          return JSON.parse(JSON.stringify(node.data.editorDoc));
        }
        const info = await resolveNodeImageInfo(node);
        if (!info || !isCurrentMerge()) return null;
        const { imageId, width, height } = info;
        const doc = createDocument(width, height);
        if (imageId) {
          doc.nodes = [
            createImageNode({
              x: 0,
              y: 0,
              width,
              height,
              imageId,
            }),
          ];
        }
        return doc;
      };

      const sourceDoc = await getOrCreateDoc(source);
      if (!sourceDoc || !isCurrentMerge()) return false;
      const targetDoc = await getOrCreateDoc(target);
      if (!targetDoc || !isCurrentMerge()) return false;

      if (
        (!targetDoc.nodes || targetDoc.nodes.length === 0) &&
        sourceDoc.nodes?.length > 0
      ) {
        targetDoc.width = sourceDoc.width;
        targetDoc.height = sourceDoc.height;
      }

      // Re-id all layers in sourceDoc so they don't collide
      const sourceLayers = (sourceDoc.nodes || []).map((layer) => ({
        ...layer,
        id: crypto.randomUUID(),
      }));

      // Combine layers: target's existing layers on the bottom, source's imported layers on top
      targetDoc.nodes = [...(targetDoc.nodes || []), ...sourceLayers];

      // Merge regions and reference images
      const mergedRegions = [
        ...(target.data?.regions || []),
        ...(source.data?.regions || []).map((r) => ({
          ...r,
          id: crypto.randomUUID(),
        })),
      ];

      const mergedReferences = [
        ...(target.data?.referenceImages || []),
        ...(source.data?.referenceImages || []),
      ];

      let newImageId = target.data?.imageId;
      try {
        const cache = createBitmapCache({});
        await cache.preload(targetDoc.nodes || []);
        if (!isCurrentMerge()) {
          cache.dispose();
          return false;
        }
        const exporter = createExport({
          getDoc: () => targetDoc,
          cache,
        });
        const compositeDataUrl = exporter.exportPng();
        if (compositeDataUrl) {
          const blob = dataUrlToBlob(compositeDataUrl);
          newImageId = `img-${crypto.randomUUID()}`;
          await putImage(
            newImageId,
            blob,
            imagePublicationFromArguments(arguments),
          );
          if (!isCurrentMerge()) {
            cache.dispose();
            return false;
          }
          set({
            images: mergeBlobsAsUrls(
              get().images,
              new Map([[newImageId, blob]]),
            ),
            thumbnails: mergeBlobsAsUrls(
              get().thumbnails || {},
              new Map([[newImageId, blob]]),
            ),
          });
        }
        cache.dispose();
      } catch (renderError) {
        console.warn(
          "Failed to render composite preview for merged editor node:",
          renderError,
        );
      }

      // Update target node data
      if (!isCurrentMerge()) return false;
      get().updateNodeData(targetNodeId, {
        width: targetDoc.width,
        height: targetDoc.height,
        imageId: newImageId,
        editorDoc: targetDoc,
        regions: mergedRegions,
        referenceImages: mergedReferences,
      });

      // Remove the absorbed source node WITHOUT a separate history entry.
      // deleteNode() calls pushHistory() itself, which would stack a second
      // snapshot (target already merged, source still present) on top of the
      // pre-merge snapshot below — so undoing would restore the source node but
      // leave the target in its merged state. Removing it here means the one
      // pushHistory() at the top is the entire undo step: undoing restores both
      // source and target to their pre-merge forms at once. A Design editor
      // source is never a group parent, so a plain filter is enough.
      set({
        nodes: get().nodes.filter((node) => node.id !== sourceNodeId),
        edges: get().edges.filter(
          (edge) =>
            edge.source !== sourceNodeId && edge.target !== sourceNodeId,
        ),
      });
      // The entry pushed at the top was pushed before the renderer was even
      // imported (a downstream failure must still leave the history entry), so
      // its automatic `after` capture ran before this change and records the
      // pre-merge graph. Re-record it now that the graph has actually moved —
      // without this, selective undo reads an empty diff and leaves the merge
      // in place instead of restoring both nodes.
      get().settleHistoryAfter("workflow.editor.mergeNodes");
      get().openImageEditor(targetNodeId);
      return true;
    },
  };
}
