import { layoutCanvasSize } from "../layout_geometry.js";
import { useDesignStore } from "../../store/design_store.js";

/** Read the latest asset cache only when an engine activates or retries. */
export function buildEditorSource(nodeId, snapshot) {
  const { nodes, images } = useDesignStore.getState();
  const node = nodes.find((candidate) => candidate.id === nodeId);
  const ownImageId = node?.data?.imageId ?? null;
  // Reference layers come from the canvas itself now, not from graph edges.
  const connectedLayers = [];
  const layoutWidth = node?.data?.layoutWidth;
  const layoutHeight = node?.data?.layoutHeight;
  const hasPinnedSize =
    Number.isFinite(layoutWidth) &&
    layoutWidth > 0 &&
    Number.isFinite(layoutHeight) &&
    layoutHeight > 0;
  const snapshotDoc =
    snapshot && typeof snapshot === "object" && "doc" in snapshot
      ? snapshot.doc
      : snapshot;
  const appliedDoc =
    snapshot && typeof snapshot === "object" && "appliedDoc" in snapshot
      ? snapshot.appliedDoc
      : null;
  return {
    src: ownImageId ? (images[ownImageId] ?? null) : null,
    imageId: ownImageId,
    savedDoc: snapshotDoc ?? node?.data?.editorDoc ?? null,
    appliedDoc: appliedDoc ?? null,
    previewDirty: Boolean(node?.data?.editorPreviewDirty),
    extraLayers: connectedLayers,
    // Apply media defaults only to empty pages. A non-null fallback pins the
    // engine canvas and would otherwise override decoded image dimensions.
    fallbackSize:
      hasPinnedSize || (!ownImageId && connectedLayers.length === 0)
        ? layoutCanvasSize(node?.data)
        : null,
  };
}

