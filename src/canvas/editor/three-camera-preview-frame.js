/** Fit the export frame inside the focus stage, without changing the camera. */
export function getThreeCameraPreviewStyle(doc) {
  const width = doc?.width;
  const height = doc?.height;
  if (
    doc?.scene3d?.frame?.cameraPreview !== true ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }
  const ratio = width / height;
  if (!Number.isFinite(ratio) || ratio <= 0) return undefined;
  // Definite full width AND height defeat aspect-ratio. Container units fit
  // both axes to the actual stage, including responsive header height changes.
  return {
    width: `min(100cqw, calc(100cqh * ${ratio}))`,
    height: `min(100cqh, calc(100cqw / ${ratio}))`,
  };
}
