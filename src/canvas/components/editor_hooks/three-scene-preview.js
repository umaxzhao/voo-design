/** Read the active 3D renderer for one editor page during Apply or eviction. */
export function captureThreeScenePreview(
  nodeId,
  root = document,
  width,
  height,
) {
  const page = [
    ...(root.querySelectorAll?.('[data-testid="editor-page"]') ?? []),
  ].find((element) => element.dataset?.nodeId === nodeId);
  const stage = [
    ...(root.querySelectorAll?.('[data-testid="editor-3d-focus-stage"]') ?? []),
  ].find((element) => element.dataset?.nodeId === nodeId);
  const canvas =
    stage?.querySelector("canvas") ||
    page?.querySelector('[data-testid="editor-3d-canvas"] canvas');
  if (canvas?.dataset.status !== "ready" || !canvas.captureThreeScenePreview) {
    throw new Error("THREE_SCENE_PREVIEW_NOT_READY");
  }
  const png = canvas.captureThreeScenePreview(width, height);
  if (!png?.startsWith("data:image/png;")) {
    throw new Error("THREE_SCENE_PREVIEW_EMPTY");
  }
  return png;
}

/** A missing WebGL frame must not prevent the document from being saved. */
export function captureThreeScenePreviewOrFallback(
  nodeId,
  fallback,
  root = document,
) {
  try {
    return captureThreeScenePreview(nodeId, root);
  } catch {
    return fallback();
  }
}
