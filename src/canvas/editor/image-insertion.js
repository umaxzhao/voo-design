import { decodeImageSource } from "./bitmap_cache.js";
import { workPreviewSize } from "./workspace_cap.js";
import { ensureImagePyramid } from "./scene_renderer.js";
import { dataUrlToBlob, getImageBlobMap, putImage } from "../store/db.js";
import { commitEditorDocument } from "../undo-action-contracts.js";
import * as ops from "./doc_ops.js";
async function persistInsertedImage(source) {
  const imageId = `img-${crypto.randomUUID()}`;
  try {
    await putImage(imageId, source);
    return imageId;
  } catch (error) {
    throw new Error("imagePersistenceFailed", { cause: error });
  }
}

/** Decode off-document; commit against the latest document only after every await finishes. */
export function createImageInsertionController({
  getDoc,
  setDoc,
  cache,
  select,
  selectExactly
}) {
  async function prepareImageInsertion(source) {
    let imageId = null;
    let bitmap;
    if (typeof source === "string") {
      bitmap = await decodeImageSource(source);
      let blob = null;
      if (source.startsWith("data:")) {
        blob = dataUrlToBlob(source);
      } else if (typeof fetch === "function" && (source.startsWith("blob:") || source.startsWith("http:") || source.startsWith("https:"))) {
        try {
          const res = await fetch(source);
          if (res.ok) {
            blob = await res.blob();
          }
        } catch (error) {
          console.warn("Image source download failed; trying decoded pixels", error);
        }
      }
      if (!blob && bitmap && typeof document !== "undefined") {
        try {
          const canvas = document.createElement("canvas");
          const bw = bitmap.naturalWidth ?? bitmap.width ?? 1;
          const bh = bitmap.naturalHeight ?? bitmap.height ?? 1;
          canvas.width = bw;
          canvas.height = bh;
          canvas.getContext("2d").drawImage(bitmap, 0, 0);
          if (typeof canvas.toBlob === "function") {
            blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
          } else if (typeof canvas.toDataURL === "function") {
            blob = dataUrlToBlob(canvas.toDataURL("image/png"));
          }
        } catch (error) {
          console.warn("Image pixels could not be persisted", error);
        }
      }
      if (!blob) throw new Error("imagePersistenceUnavailable");
      imageId = await persistInsertedImage(blob);
    } else {
      bitmap = await decodeImageSource(source);
      imageId = await persistInsertedImage(source);
    }
    if (!bitmap) throw new Error("imageDecodeFailed");
    return {
      bitmap,
      imageId,
      src: source
    };
  }
  function insertPreparedImages(entries, name = "editor.layer.add", {
    selectInserted = true,
    commitOptions
  } = {}) {
    const before = getDoc();
    let next = before;
    const created = [];
    for (const {
      prepared,
      point,
      patch = {}
    } of entries) {
      const {
        bitmap,
        imageId,
        src
      } = prepared;
      const node = ops.makeCentredImageNode(next, bitmap, {
        imageId,
        src
      });
      if (point) {
        node.x = point.x - node.width / 2;
        node.y = point.y - node.height / 2;
      }
      Object.assign(node, patch);
      const preview = workPreviewSize(bitmap.naturalWidth ?? bitmap.width, bitmap.naturalHeight ?? bitmap.height);
      let workBitmap = bitmap;
      if (preview.capped) {
        const canvas = document.createElement("canvas");
        canvas.width = preview.width;
        canvas.height = preview.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("imageCanvasUnavailable");
        context.drawImage(bitmap, 0, 0, preview.width, preview.height);
        workBitmap = canvas;
        node.reducedPreview = true;
      }
      cache.put(node, workBitmap);
      ensureImagePyramid(workBitmap);
      next = ops.addNode(next, node);
      created.push(node);
    }
    if (!created.length) return [];
    commitEditorDocument(name, setDoc, next, commitOptions);
    if (selectInserted) {
      if (selectExactly) selectExactly(created.map(node => node.id));else select(created[0].id);
    }
    return created;
  }
  async function insertImage(source, point) {
    const prepared = await prepareImageInsertion(source);
    return insertPreparedImages([{
      prepared,
      point
    }])[0];
  }
  /**
   * Adds pictures the editor was not opened with to the live document.
   *
   * This is the editor's half of the ingestion contract. The store writes a
   * finished generation onto the receiving node's `editorDoc`
   * (workflow_node_ingestion_actions.js), but an OPEN document is the engine's
   * live state — `buildEditorSource` reads the node once per activation — so
   * without this the layer would stay invisible until the editor was closed
   * and reopened, and an apply would flatten the document without it.
   *
   * Additive on purpose: nothing the user has drawn is discarded and no
   * existing layer is touched, so folding in an external result can never cost
   * work in progress. Every layer that could not be placed is reported back
   * rather than dropped silently.
   *
   * @param {Array<{imageId: string, src?: string|null}>} layers
   * @returns {Promise<{added: string[], skipped: Array<{imageId: string, reason: string}>}>}
   */
  async function appendImageLayers(layers = []) {
    const doc = getDoc();
    const known = new Set(doc.nodes.filter(node => node.imageId).map(node => node.imageId));
    const fresh = [];
    const skipped = [];
    for (const layer of layers) {
      const imageId = layer?.imageId;
      if (!imageId) continue;
      if (known.has(imageId)) {
        skipped.push({
          imageId,
          reason: "alreadyPresent"
        });
        continue;
      }
      known.add(imageId);
      fresh.push({
        imageId,
        src: layer.src ?? null
      });
    }
    if (fresh.length === 0) return {
      added: [],
      skipped
    };

    // Decode everything before touching the document: a picture that fails to
    // load must leave the open document exactly as it was rather than
    // half-ingested, and its reason is reported instead of swallowed.
    const decoded = [];
    for (const layer of fresh) {
      let src = layer.src;
      let createdUrl = null;
      try {
        if (!src) {
          const blobs = await getImageBlobMap([layer.imageId]);
          const blob = blobs.get(layer.imageId);
          if (!blob) {
            skipped.push({
              imageId: layer.imageId,
              reason: "assetMissing"
            });
            continue;
          }
          createdUrl = URL.createObjectURL(blob);
          src = createdUrl;
        }
        const bitmap = await decodeImageSource(src);
        decoded.push({
          imageId: layer.imageId,
          src,
          bitmap
        });
      } catch (error) {
        skipped.push({
          imageId: layer.imageId,
          reason: error?.message ?? "decodeFailed"
        });
      } finally {
        // The decoded bitmap and its pyramid are what the document draws from,
        // so the object URL this call minted has done its job. `open()` treats
        // the connected layers it loads the same way; holding the URL would pin
        // every ingested picture in memory for the life of the page.
        if (createdUrl) URL.revokeObjectURL(createdUrl);
      }
    }
    if (decoded.length === 0) return {
      added: [],
      skipped
    };
    const latest = new Set(getDoc().nodes.map(node => node.imageId).filter(Boolean));
    const entries = [];
    for (const item of decoded) {
      if (latest.has(item.imageId)) {
        skipped.push({
          imageId: item.imageId,
          reason: "alreadyPresent"
        });
        continue;
      }
      entries.push({
        prepared: item
      });
      latest.add(item.imageId);
    }
    const nodes = insertPreparedImages(entries, "editor.layer.add", {
      selectInserted: false,
      commitOptions: {
        name: "editor.history.entry.addLayer"
      }
    });
    return {
      added: nodes.map(node => node.imageId),
      skipped
    };
  }
  return {
    insertImage,
    prepareImageInsertion,
    insertPreparedImages,
    appendImageLayers
  };
}
