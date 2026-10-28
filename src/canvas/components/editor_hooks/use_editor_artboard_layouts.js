import { useMemo } from "react";
import { positionArtboard } from "../../editor/editor_artboard_positions.js";
import { layoutPresentationPages } from "../../presentation/presentation-document.js";
import { FREE_GUTTER, FREE_PADDING, gridArtboardLayouts, presentationRowX } from "../image_editor_helpers.js";

/** Geometry-only inputs keep unrelated document edits from refitting the camera. */
export function useEditorArtboardLayouts({
  multi, nodeIds, nodes, enginesRef, editorArtboardLayouts,
  presentationId, presentationWidth, presentationHeight,
}) {
  const savedPositionById = useMemo(() => {
    const map = new Map();
    for (const node of nodes) {
      const saved = (editorArtboardLayouts instanceof Map
        ? editorArtboardLayouts.get(node.id) : editorArtboardLayouts?.[node.id]) || node.data?.editorCanvasPosition;
      if (saved && (saved.x !== undefined || saved.y !== undefined)) map.set(node.id, saved);
    }
    return map;
  }, [nodes, editorArtboardLayouts]);
  const readySignature = nodeIds.map((id) => {
    const state = enginesRef.current.get(id);
    return state?.ready ? `${state.width}x${state.height}` : "pending";
  }).join(",");
  const positionSignature = nodeIds.map((id) => {
    const position = savedPositionById.get(id);
    return `${position?.x ?? "auto"},${position?.y ?? "auto"}`;
  }).join(";");
  // Serialise only IDs and scalar geometry, not node objects or document content.
  // The memo then reads its exact dependency rather than capturing mutable refs.
  const geometry = JSON.stringify(nodeIds.map((nodeId) => {
    const state = enginesRef.current.get(nodeId);
    const position = savedPositionById.get(nodeId);
    return { nodeId, width: state?.ready ? state.width : (presentationWidth ?? 1024),
      height: state?.ready ? state.height : (presentationHeight ?? 1024),
      savedX: position?.x, savedY: position?.y };
  }));
  const freeLayouts = useMemo(() => {
    if (!multi) return [];
    const entries = JSON.parse(geometry);
    const sizes = entries.map(({ nodeId, width, height }) => ({ nodeId, width, height }));
    const automatic = presentationId ? layoutPresentationPages(
      sizes.map((size, index) => ({ ...size, x: presentationRowX(sizes, index) })),
      { padding: FREE_PADDING, gap: FREE_GUTTER },
    ) : gridArtboardLayouts(sizes);
    return automatic.map((layout, index) => positionArtboard(layout, {
      x: entries[index].savedX, y: entries[index].savedY,
    }));
  }, [multi, geometry, presentationId]);
  const layoutById = useMemo(() => new Map(freeLayouts.map((entry) => [entry.nodeId, entry])), [freeLayouts]);
  return { freeLayouts, layoutById, readySignature, positionSignature };
}
