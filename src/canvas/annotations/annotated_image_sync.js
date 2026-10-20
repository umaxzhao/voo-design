// Storage side of image annotations, kept apart from the pure
// annotation_reference.js so the engine's prompt assembly never imports the
// image store.
import { dataUrlToBlob } from "../../shared/db_wire.js";
import { getImageDataUrl, putImages } from "../store/db.js";
import { renderMarkedImage } from "./annotation_reference.js";
import { computeAnnotationsHash } from "./image_annotations.js";

/**
 * Renders marked copy off the run path and stores it with putImages under a deterministic
 * derived ID. Never registers it in the asset library.
 */
export async function syncAnnotatedImage({
  nodeId,
  sourceImageId,
  annotations,
  updateNodeData,
  getImageDataUrlFn = getImageDataUrl,
  putImagesFn = putImages,
}) {
  if (!nodeId || !sourceImageId || !Array.isArray(annotations) || annotations.length === 0) {
    if (updateNodeData) {
      updateNodeData(nodeId, { annotatedImage: null });
    }
    return null;
  }

  const hash = computeAnnotationsHash(annotations);
  const derivedId = `${sourceImageId}-annotated-${hash}`;

  try {
    const dataUrl = await getImageDataUrlFn(sourceImageId);
    if (!dataUrl) return null;
    const indexedAnnotations = annotations.map((ann, i) => ({
      ...ann,
      index: i + 1,
    }));
    const markedDataUrl = await renderMarkedImage(
      dataUrl,
      indexedAnnotations,
    );
    if (!markedDataUrl) return null;
    const markedBlob = dataUrlToBlob(markedDataUrl);
    await putImagesFn([{ id: derivedId, blob: markedBlob }]);
    const annotatedImage = {
      id: derivedId,
      sourceImageId,
      annotationsHash: hash,
    };
    if (updateNodeData) {
      updateNodeData(nodeId, { annotatedImage });
    }
    return annotatedImage;
  } catch (err) {
    console.warn("Failed to sync annotated image:", err);
    return null;
  }
}
