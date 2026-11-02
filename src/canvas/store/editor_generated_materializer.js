/**
 * Converts one editor-generated result envelope into a Group candidate's
 * scene document. This is a pure store-side adapter: it knows only the
 * minimal scene-document shape needed to clone a source snapshot and apply a
 * generated bitmap patch.
 *
 * It deliberately does not import scene_model or mutate the source snapshot.
 */
export function cloneAndApplyGeneratedScenePatch({
  sourceSnapshot,
  sourceSceneNodeId,
  assetId,
  scenePatch,
}) {
  if (!sourceSnapshot || typeof sourceSnapshot !== "object") {
    throw new Error("sourceSnapshot is required");
  }
  const clone = JSON.parse(JSON.stringify(sourceSnapshot));
  if (!Array.isArray(clone.nodes)) clone.nodes = [];

  const layer = clone.nodes.find((node) => node.id === sourceSceneNodeId);
  if (!layer) {
    throw new Error(
      `sourceSceneNodeId ${sourceSceneNodeId} missing in snapshot`,
    );
  }

  layer.imageId = assetId;
  delete layer.crop;

  if (scenePatch?.type === "outpaintBitmap") {
    const rect = scenePatch.nodeRect;
    layer.x = rect.x;
    layer.y = rect.y;
    layer.width = rect.width;
    layer.height = rect.height;
    clone.width += scenePatch.documentGrowth?.width ?? 0;
    clone.height += scenePatch.documentGrowth?.height ?? 0;
  }

  return clone;
}
