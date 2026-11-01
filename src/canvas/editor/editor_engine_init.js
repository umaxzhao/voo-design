/**
 * Document initialization & lifecycle controller.
 *
 * Owns document loading, font metric loading, text node measurement,
 * and open lifecycle. Extracted from editor_engine.js.
 */

import { decodeImageSource } from "./bitmap_cache.js";
import { workPreviewSize } from "./workspace_cap.js";
import { ensureFontLoaded } from "./font_loader.js";
import {
  createDocument,
  createImageNode,
  DEFAULT_PAGE_BACKGROUND,
  deserialiseDocument,
  NODE_KIND,
  serialiseDocument,
} from "./scene_model.js";
import { ensureImagePyramid, measureText } from "./scene_renderer.js";
import { getImageBlobMap } from "../store/db.js";
import * as ops from "./doc_ops.js";
import { reflowAutoLayout } from "./scene_auto_layout.js";
import { sameAutoLayoutGeometry } from "./auto-layout-sharing.js";

export function createEngineInitController({
  ctx,
  getDoc,
  setDoc,
  setGuides,
  cache,
  hostAdapter,
  viewportTools,
  history,
  snapshotDoc,
  snapshotState,
  getAppliedSnapshot,
  setAppliedSnapshot,
  incDocVersion,
  requestRender,
  notify,
  isDisposed,
  cameraMode,
}) {
  const textMeasureSignatures = new Map();

  function textMeasureSignature(node) {
    return [
      "text" in node ? node.text : undefined,
      node.fontFamily,
      node.fontSize,
      node.fontWeight,
      // italic (not fontStyle) — the schema field; align (not textAlign).
      node.italic,
      node.lineHeight,
      node.letterSpacing,
      node.width,
      node.boxWidth,
      node.direction,
      node.stroke,
      node.strokeWidth,
    ].join("|");
  }

  function measureTextNodes(next, { force = false } = {}) {
    let current = next;
    const hasLayout = next.nodes.some(
      (node) => node.kind === NODE_KIND.GROUP && node.autoLayout,
    );
    // A fill-width text child wraps after the layout assigns its width;
    // measuring again lets a hugging parent absorb the new line count.
    for (let pass = 0; pass < 3; pass += 1) {
      let changed = false;
      const nodes = current.nodes.map((node) => {
        if (node.kind !== NODE_KIND.TEXT) return node;
        const signature = textMeasureSignature(node);
        if (!force && textMeasureSignatures.get(node.id) === signature) {
          return node;
        }
        const size = measureText(ctx, node);
        textMeasureSignatures.set(
          node.id,
          textMeasureSignature({ ...node, ...size }),
        );
        if (size.width === node.width && size.height === node.height) {
          return node;
        }
        changed = true;
        return { ...node, ...size };
      });
      const previous = current;
      current = reflowAutoLayout(changed ? { ...current, nodes } : current);
      if (!hasLayout) break;
      // Stable geometry and text need no second whole-document layout pass.
      if (!changed && (pass > 0 || sameAutoLayoutGeometry(previous.nodes, current.nodes))) break;
      force = false;
    }
    return current;
  }

  // ensureFontLoaded caches settled promises too. Keep completed requests here:
  // the font callback calls setDoc(), which queues fonts again synchronously.
  const fontLoadRequests = new Set();

  function queueFontLoads(next) {
    for (const node of next.nodes) {
      if (node.kind !== NODE_KIND.TEXT || !node.fontFamily) continue;
      if (fontLoadRequests.has(node.fontFamily)) continue;
      const wait = ensureFontLoaded(node.fontFamily);
      if (!wait) continue;
      fontLoadRequests.add(node.fontFamily);
      void wait.then((loaded) => {
        if (!loaded || isDisposed()) return;
        const wasClean = getAppliedSnapshot() === snapshotDoc();
        const measured = measureTextNodes(getDoc(), { force: true });
        setDoc(measured, { commit: false });
        if (wasClean) {
          setAppliedSnapshot(snapshotDoc());
        }
        incDocVersion?.();
        requestRender();
        notify();
      });
    }
  }

  async function open(
    {
      src,
      imageId,
      savedDoc,
      appliedDoc = null,
      previewDirty = false,
      extraLayers = [],
      fallbackSize = null,
    },
    { fitView = true } = {},
  ) {
    let doc;
    let parsedSavedDoc = savedDoc;
    if (typeof parsedSavedDoc === "string") {
      try {
        parsedSavedDoc = JSON.parse(parsedSavedDoc);
      } catch {
        parsedSavedDoc = null;
      }
    }
    const restored = ops.attachRegionsToHosts(deserialiseDocument(parsedSavedDoc));
    if (restored) {
      doc = restored;
      const restoredGuides = Array.isArray(restored.guides)
        ? restored.guides.map((guide) => ({ ...guide }))
        : [];
      doc.guides = restoredGuides;
      setGuides?.([]);
      if (src && imageId) {
        doc.nodes.forEach((node) => {
          if (
            node.kind === NODE_KIND.IMAGE &&
            node.imageId === imageId &&
            !node.src
          ) {
            node.src = src;
          }
        });
      }
    } else {
      const blankWidth = fallbackSize?.width ?? 1024;
      const blankHeight = fallbackSize?.height ?? 1024;
      doc = createDocument(blankWidth, blankHeight, DEFAULT_PAGE_BACKGROUND);
      let baseSrc = src;
      if (!baseSrc && imageId) {
        try {
          const blobs = await getImageBlobMap([imageId]);
          const blob = blobs.get(imageId);
          if (blob) {
            baseSrc = URL.createObjectURL(blob);
          }
        } catch {
          // Ignored
        }
        if (!baseSrc) {
          baseSrc = hostAdapter?.resolveImage?.(imageId) ?? null;
        }
      }
      if (baseSrc) {
        const tempUrl = !src && imageId ? baseSrc : null;
        try {
          const bitmap = await decodeImageSource(baseSrc);
          if (isDisposed()) return;
          const sourceW = bitmap.naturalWidth ?? bitmap.width;
          const sourceH = bitmap.naturalHeight ?? bitmap.height;
          const preview = workPreviewSize(sourceW, sourceH);
          if (!fallbackSize) {
            doc = createDocument(sourceW, sourceH);
          }
          let workBitmap = bitmap;
          if (preview.capped) {
            const canvas = document.createElement("canvas");
            canvas.width = preview.width;
            canvas.height = preview.height;
            canvas
              .getContext("2d")
              .drawImage(bitmap, 0, 0, preview.width, preview.height);
            workBitmap = canvas;
          }
          const base = createImageNode({
            x: 0,
            y: 0,
            width: sourceW,
            height: sourceH,
            imageId: imageId ?? null,
            src: imageId ? null : baseSrc,
            locked: false,
            ...(preview.capped ? { reducedPreview: true } : {}),
          });
          cache.put(base, workBitmap);
          ensureImagePyramid(workBitmap);
          doc = ops.addNode(doc, base);
        } catch (err) {
          console.error("Failed to decode base image for editor", err);
        } finally {
          if (tempUrl) URL.revokeObjectURL(tempUrl);
        }
      }
    }

    for (const layer of extraLayers) {
      if (!layer.src && !layer.imageId) continue;
      try {
        let layerSrc = layer.src;
        let createdUrl = null;
        if (!layerSrc && layer.imageId) {
          const blobs = await getImageBlobMap([layer.imageId]);
          const blob = blobs.get(layer.imageId);
          if (blob) {
            createdUrl = URL.createObjectURL(blob);
            layerSrc = createdUrl;
          }
        }
        if (!layerSrc) continue;
        try {
          const bitmap = await decodeImageSource(layerSrc);
          if (isDisposed()) return;
          const node = ops.makeCentredImageNode(doc, bitmap, {
            imageId: layer.imageId,
            src: layerSrc,
          });
          cache.put(node, bitmap);
          ensureImagePyramid(bitmap);
          doc = ops.addNode(doc, node);
        } finally {
          if (createdUrl) URL.revokeObjectURL(createdUrl);
        }
      } catch {
        // A missing/unreachable layer is silently skipped
      }
    }

    await cache.preload(
      doc.nodes.filter((node) => node.kind === NODE_KIND.IMAGE),
    );
    if (isDisposed()) return;
    doc = measureTextNodes(doc);
    queueFontLoads(doc);
    setDoc(doc, { commit: false });

    const openedDoc = snapshotDoc();
    history.reset(snapshotState());
    const appliedBaseline = appliedDoc
      ? typeof appliedDoc === "string"
        ? appliedDoc
        : JSON.stringify(serialiseDocument(appliedDoc))
      : previewDirty
        ? ""
        : openedDoc;
    setAppliedSnapshot(appliedBaseline);

    if (cameraMode !== "shared" && fitView) viewportTools?.zoomToFit?.();
    notify();
  }

  return {
    textMeasureSignature,
    measureTextNodes,
    queueFontLoads,
    open,
  };
}
