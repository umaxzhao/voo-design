import { documentToWebPage } from "../../editor/editor_web_export.js";
import { saveMediaExport } from "../../media_export.js";
import { bytesToDataUrl } from "../../../shared/media-export.js";
import { assertExportableDocument } from "./export_editor_image.js";

/** Keep the standalone runtime on the same release as the editor's Three.js. */
async function defaultRuntimeUrls() {
  const { REVISION } = await import("three");
  // Three.js packages use 0.<REVISION>.0; the import tracks the installed release.
  if (!/^\d+$/.test(REVISION)) {
    return { threeModuleUrl: null, gltfLoaderModuleUrl: null };
  }
  const cdnRoot = `https://cdn.jsdelivr.net/npm/three@0.${REVISION}.0`;
  return {
    threeModuleUrl: `${cdnRoot}/build/three.module.js`,
    gltfLoaderModuleUrl: `${cdnRoot}/examples/jsm/loaders/GLTFLoader.js`,
  };
}

/** Resolve session-scoped asset URLs before writing a portable HTML file. */
async function durableSource(source, signal, fallbackMime) {
  signal?.throwIfAborted();
  if (source instanceof Blob) {
    return bytesToDataUrl(
      new Uint8Array(await source.arrayBuffer()),
      source.type || fallbackMime,
    );
  }
  if (typeof source !== "string") return null;
  if (!source.startsWith("blob:")) return source;
  const response = await fetch(source, { signal });
  if (!response.ok) throw new Error("HTML_EXPORT_ASSET_UNAVAILABLE");
  const blob = await response.blob();
  signal?.throwIfAborted();
  return bytesToDataUrl(
    new Uint8Array(await blob.arrayBuffer()),
    blob.type || fallbackMime,
  );
}

/** Gather nested canvas assets once, and leave cycle validation to the exporter. */
async function collectSources(doc, resolveCanvas, assetSourceOf, signal, engine) {
  const sources = new Map();
  const imageSizes = new Map();
  const visited = new WeakSet();

  async function visit(sourceDoc) {
    if (!sourceDoc || visited.has(sourceDoc)) return;
    visited.add(sourceDoc);
    for (const node of sourceDoc.nodes ?? []) {
      if (["image", "video", "model3d"].includes(node.kind)) {
        let durable = null;
        if (node.kind === "image") {
          const hasAdjustments = Boolean(node.adjustments && Object.keys(node.adjustments).length > 0);
          const hasMask = Boolean(node.maskId);
          if ((hasAdjustments || hasMask) && typeof engine?.exportNodePng === "function") {
            const baked = engine.exportNodePng(node.id, { uncropped: true }) ?? engine.exportNodePng(node.id);
            if (baked) durable = baked;
          }
        }
        if (!durable) {
          const assetId = node.kind === "image" ? node.imageId : node.assetId;
          const source = (assetId ? assetSourceOf?.(assetId) : null) ?? node.src;
          const fallbackMime =
            node.kind === "model3d"
              ? "model/gltf-binary"
              : node.kind === "video"
                ? "video/mp4"
                : "image/png";
          durable = await durableSource(source, signal, fallbackMime);
        }
        sources.set(node, durable);
        if (node.kind === "image" && node.crop && durable && typeof Image !== "undefined") {
          const image = new Image();
          image.src = durable;
          await image.decode?.();
          imageSizes.set(node, { width: image.naturalWidth, height: image.naturalHeight });
        }
      }
      if (node.kind === "canvasInstance" && node.instance?.videoAssetId) {
        const source =
          assetSourceOf?.(node.instance.videoAssetId) ?? node.instance.videoSrc;
        sources.set(node, await durableSource(source, signal, "video/webm"));
      }
      if (
        node.kind === "canvasInstance" &&
        node.instance?.playbackMode !== "video" &&
        node.sourceCanvasId
      ) {
        await visit(resolveCanvas?.(node.sourceCanvasId));
      }
    }
  }

  await visit(doc);
  return { sources, imageSizes };
}

/** Encode the editable page as HTML, including local image/video/model bytes. */
export async function exportEditorWebPage({
  engine,
  name,
  title,
  resolveCanvas,
  assetSourceOf,
  threeModuleUrl,
  gltfLoaderModuleUrl,
  signal,
}) {
  signal?.throwIfAborted();
  if (engine.getSelectionTransform?.())
    await engine.applySelectionTransform?.();
  await engine.flushTransforms?.();
  await engine.flushPaints?.();
  await engine.flushMasks?.();
  signal?.throwIfAborted();
  const doc = assertExportableDocument(engine.getDocument?.());
  const { sources, imageSizes } = await collectSources(
    doc,
    resolveCanvas,
    assetSourceOf,
    signal,
    engine,
  );
  signal?.throwIfAborted();
  const sourceOf = (node) => sources.get(node) ?? node.src;
  const options = {
    title: name,
    lang: navigator.language,
    resolveCanvas,
    imageSourceOf: sourceOf,
    imageSizeOf: (node) => imageSizes.get(node) ?? null,
    videoSourceOf: sourceOf,
    modelSourceOf: sourceOf,
    threeModuleUrl,
    gltfLoaderModuleUrl,
  };
  let page = documentToWebPage(doc, options);
  if (
    page.warnings.some((warning) =>
      [
        "html-export-three-runtime-required",
        "html-export-gltf-loader-required",
      ].includes(warning),
    )
  ) {
    const defaults = await defaultRuntimeUrls();
    signal?.throwIfAborted();
    page = documentToWebPage(doc, {
      ...options,
      threeModuleUrl: threeModuleUrl ?? defaults.threeModuleUrl,
      gltfLoaderModuleUrl: gltfLoaderModuleUrl ?? defaults.gltfLoaderModuleUrl,
    });
  }
  const { html, warnings } = page;
  const missingRuntime = warnings.find((warning) =>
    [
      "html-export-three-runtime-required",
      "html-export-gltf-loader-required",
    ].includes(warning),
  );
  if (missingRuntime) throw new Error(missingRuntime);
  const dataUrl = bytesToDataUrl(new TextEncoder().encode(html), "text/html");
  const receipt = await saveMediaExport({
    dataUrl,
    name,
    format: "html",
    title,
    signal,
  });
  return receipt ? { ...receipt, warnings } : null;
}
