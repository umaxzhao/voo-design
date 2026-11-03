/**
 * Anti-late-replacement guard for generative image operations.
 *
 * Protects against race conditions where the user deletes, replaces, or mutates
 * the target layer while a cloud API or Web-extension image generation task is in-flight.
 *
 * If the target layer is still valid (matches targetLayerId and targetImageId/src),
 * the layer is updated in-place. If the target has changed or ceased to exist,
 * the generated asset is safely inserted as a fresh layer so that generated
 * assets are never lost and wrong layers are never corrupted.
 *
 * All operations are committed through editor.commitEditorDocument to support
 * atomic single-step ⌘Z / undo/redo.
 */

/**
 * Validates whether the layer at targetLayerId still matches its original reference.
 *
 * @param {object} editor Canvas editor engine instance
 * @param {string} targetLayerId Layer ID expected to receive the image
 * @param {string|null} [targetImageId] Expected image ID
 * @param {string|null} [targetSrc] Expected image source/fill
 * @returns {boolean} True if the layer still exists and has not been swapped
 */
export function validateTargetLayer(editor, targetLayerId, targetImageId = null, targetSrc = null) {
  if (!editor || !targetLayerId) return false;
  const doc = editor.getDocument?.() || editor.getDoc?.() || null;
  const nodes = Array.isArray(doc?.nodes) ? doc.nodes : [];
  const node = editor.getNode?.(targetLayerId) || nodes.find((n) => n.id === targetLayerId) || null;
  if (!node) return false;

  // If targetImageId was tracked, verify it has not changed
  if (targetImageId && node.imageId && node.imageId !== targetImageId) {
    return false;
  }
  // If targetSrc was tracked and no imageId, verify fill or src has not changed
  if (!targetImageId && targetSrc) {
    const currentSrc = node.src || node.fill || null;
    if (currentSrc && currentSrc !== targetSrc) {
      return false;
    }
  }
  return true;
}

/**
 * Safely applies an image result with late-replacement protection and atomic undo/redo.
 *
 * @param {object} editor Canvas editor instance
 * @param {object} params Replacement parameters
 * @param {string} [params.targetLayerId] Layer ID to update if still matching
 * @param {string} [params.targetImageId] Original image ID
 * @param {string} [params.targetSrc] Original image source URL/data
 * @param {string} params.imageUrl New image URL or dataUrl
 * @param {string} [params.imageId] New image asset ID
 * @param {number} [params.width] Desired width
 * @param {number} [params.height] Desired height
 * @param {string} [params.name] Layer name
 * @returns {Promise<{ ok: boolean, action: "replaced"|"inserted", layerId: string|null }>}
 */
export async function applySafeImageResult(editor, {
  targetLayerId,
  targetImageId = null,
  targetSrc = null,
  imageUrl,
  imageId = null,
  width,
  height,
  name,
} = {}) {
  if (!editor || !imageUrl) {
    return { ok: false, action: "error", layerId: null, error: "Missing editor or imageUrl" };
  }

  const isValidTarget = targetLayerId && validateTargetLayer(editor, targetLayerId, targetImageId, targetSrc);

  if (isValidTarget) {
    // In-place replacement
    const patch = {};
    if (imageId) patch.imageId = imageId;
    if (imageUrl) {
      patch.src = imageUrl;
      patch.fill = imageUrl;
    }
    if (Number.isFinite(width) && width > 0) patch.width = width;
    if (Number.isFinite(height) && height > 0) patch.height = height;
    if (name) patch.name = name;

    editor.updateNode?.(targetLayerId, patch);
    editor.commitEditorDocument?.({ message: "AI: Regenerate image" });
    return { ok: true, action: "replaced", layerId: targetLayerId };
  }

  // Fallback: safe insertion as a fresh layer so work is never lost.
  // Metadata is applied inside the same engine operation as the insert, so the
  // whole result is ONE history entry and a single Undo removes it completely.
  const insertPatch = {};
  if (imageId) insertPatch.imageId = imageId;
  if (Number.isFinite(width) && width > 0) insertPatch.width = width;
  if (Number.isFinite(height) && height > 0) insertPatch.height = height;
  if (name) insertPatch.name = name;
  const actionName = "AI: Insert image (target modified or missing)";

  if (typeof editor.prepareImageInsertion === "function" && typeof editor.insertPreparedImages === "function") {
    const prepared = await editor.prepareImageInsertion(imageUrl);
    const [node] = editor.insertPreparedImages([{ prepared, point: null, patch: insertPatch }], actionName);
    return { ok: true, action: "inserted", layerId: node?.id || null };
  }

  // Legacy path for editors without the atomic domain operation: insert, then patch and commit.
  // This can produce two history entries and is kept only for those editors.
  const point = null; // defaults to viewport center / intelligent positioning
  let insertedNode = null;
  if (typeof editor.insertImage === "function") {
    insertedNode = await editor.insertImage(imageUrl, point);
  }

  const newLayerId = insertedNode?.id || null;
  if (newLayerId) {
    if (Object.keys(insertPatch).length > 0) {
      editor.updateNode?.(newLayerId, insertPatch);
    }
    editor.commitEditorDocument?.({ message: actionName });
  }

  return { ok: true, action: "inserted", layerId: newLayerId };
}
