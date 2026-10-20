import { useCallback } from "react";
import { useWorkflowStore } from "../../store/workflow_store.js";
import { getEditorRequestTarget } from "./editor-request-intent.js";
import {
  assignMediaTags,
  getNodeDisplayName,
  getNodeThumbnail,
} from "./agentNodeHelpers.jsx";

export function useAgentCanvasState({ t, globalBrands, globalPreferences }) {
  const getCanvasState = useCallback(() => {
    const s = useWorkflowStore.getState();
    const target = getEditorRequestTarget(s);
    const selected = target ? [] : (s.nodes || []).filter((n) => n.selected);
    return {
      editorContext: target
        ? {
            nodeId: target.nodeId,
            canvasType: target.canvasType,
            selectedLayers: target.selectedLayers,
            ready: target.ready,
          }
        : null,
      nodes: s.nodes || [],
      edges: s.edges || [],
      name: s.name || "Untitled",
      projectBrief: s.projectBrief || null,
      projectMemory: s.projectMemory || null,
      globalBrands,
      globalPreferences,
      agentDesignSystem: s.agentDesignSystem ?? "auto",
      onMemoriesUsed: (usedIds) => {
        s.touchProjectMemories?.(usedIds);
      },
      durableExecutionRecovery: s.durableExecutionRecovery,
      durableExecutionError: s.durableExecutionError,
      selectedNodes: assignMediaTags(selected, t).map(({ node: n, tag }) => {
        const thumb = getNodeThumbnail(n, s.images, s.thumbnails);
        return {
          id: n.id,
          type: n.type,
          tag,
          mediaType: n.data?.mediaType || (n.data?.imageId ? "image" : null),
          width: n.data?.width ?? n.width ?? null,
          height: n.data?.height ?? n.height ?? null,
          label: getNodeDisplayName(n, t) || n.data?.label || null,
          hasImage: Boolean(thumb),
          imageUrl: thumb || null,
          prompt: n.data?.text || n.data?.prompt || n.data?.aiPrompt || null,
          annotations: Array.isArray(n.data?.annotations)
            ? n.data.annotations
            : [],
        };
      }),
    };
  }, [t, globalBrands, globalPreferences]);

  const handleUnlinkNode = useCallback((nodeId) => {
    const store = useWorkflowStore.getState();
    store.onNodesChange?.([{ id: nodeId, type: "select", selected: false }]);
  }, []);

  const handleUnlinkAllNodes = useCallback(() => {
    const store = useWorkflowStore.getState();
    const selected = (store.nodes || []).filter((n) => n.selected);
    if (selected.length > 0) {
      store.onNodesChange?.(
        selected.map((n) => ({ id: n.id, type: "select", selected: false })),
      );
    }
  }, []);

  return {
    getCanvasState,
    handleUnlinkNode,
    handleUnlinkAllNodes,
  };
}
