/**
 * Pure open-state helpers for the image editor.
 *
 * The engine swallows a base-image decode failure internally (it builds a
 * blank document and resolves), so the hook that drives it cannot rely on a
 * rejected promise to know the picture never landed. These helpers compare
 * what the engine was asked to open against the document it produced, and
 * are plain functions so `tests/` can drive them without a renderer.
 */

/**
 * Whether an `open(source)` that resolved actually failed to decode the
 * picture it was given.
 *
 * - No source, or a saved document, means the blank page is legitimate.
 * - A source carrying `src`/`imageId` must produce an image node carrying the
 *   same identity; otherwise the decode was skipped/failed and the user is
 *   looking at an empty canvas instead of their picture.
 *
 * @param {object|null} source - What the editor was asked to open
 *   (`{ src, imageId, savedDoc, extraLayers, fallbackSize }`).
 * @param {object|null} doc - The engine's document after a resolved open.
 * @returns {boolean} True when the source picture failed to decode.
 */
export function openDecodeFailed(source, doc) {
  if (!source) return false;
  if (source.savedDoc) return false;
  const hasSourceImage = Boolean(source.src || source.imageId);
  if (!hasSourceImage) return false;
  const nodes = doc?.nodes ?? [];
  return !nodes.some(
    (node) =>
      node.kind === "image" &&
      (source.imageId
        ? node.imageId === source.imageId
        : node.src === source.src),
  );
}

/**
 * The image layers an open document is missing, in document order.
 *
 * An OPEN document is the engine's live state: `buildEditorSource` reads the
 * node once per activation, so a layer the store writes onto `data.editorDoc`
 * while the editor is on screen — an agent generation landing in the document
 * the user is working in — is invisible until a close-and-reopen, and an apply
 * would flatten the document without it. The editor folds in what it does not
 * already carry; this decides what that is.
 *
 * Asset ids de-duplicate connected inputs. A local paint or erase replaces an
 * image's asset id while keeping its layer id, so the stable layer id also
 * prevents the saved version from being re-ingested over the edited layer.
 *
 * @param {{nodes?: Array<object>}|null} editorDoc - the node's saved document
 * @param {Iterable<string|{id?: string, imageId?: string}>} liveLayers -
 *   active layer identities and asset ids, plus pending asset ids
 * @param {Record<string, string>} [images] - asset id -> object URL
 * @returns {Array<{imageId: string, src: string|null}>} layers to append
 */
export function collectExternalImageLayers(editorDoc, liveLayers, images) {
  const knownImageIds = new Set();
  const knownLayerIds = new Set();
  for (const layer of liveLayers ?? []) {
    if (typeof layer === "string") {
      knownImageIds.add(layer);
    } else {
      if (layer?.id) knownLayerIds.add(layer.id);
      if (layer?.imageId) knownImageIds.add(layer.imageId);
    }
  }
  const layers = [];
  for (const node of editorDoc?.nodes ?? []) {
    const imageId = node?.imageId;
    if (!imageId || knownImageIds.has(imageId) || knownLayerIds.has(node.id))
      continue;
    knownImageIds.add(imageId);
    if (node.id) knownLayerIds.add(node.id);
    layers.push({ imageId, src: images?.[imageId] ?? null });
  }
  return layers;
}
