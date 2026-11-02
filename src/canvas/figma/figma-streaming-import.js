/** Streaming decoding stays in a worker; public import signatures stay shared. */
import { VOO_FILE_FORMAT } from "../../../electron/voo_format.js";
import { createDocument } from "../editor/scene_doc_factory.js";
import { isFigContainer, parseFigContainer } from "./fig-kiwi.js";
import { extractFigZip } from "./fig-zip-reader.js";
import { buildTopLevel } from "./figma-scene-tree.js";
import { emitChildren, emitPageRoot } from "./figma-scene-nodes.js";
import { fontSummary, pruneFigSource, createFigmaImportContext } from "./figma-import-context.js";
import { figmaRootBounds } from "./figma-node-transform.js";
export async function figBytesToVooFileStreaming(bytes, options = {}) {
  const {
    onProgress = null,
    onHeader = null,
    onAsset = null,
    onChunk = null,
    chunkSize = 800,
  } = options;

  // 1. Unpacking stage (0% - 20%)
  if (onProgress) {
    onProgress({ stage: "unpacking", percent: 5, message: "Unpacking Figma archive..." });
  }

  let canvas = bytes;
  let images = new Map();
  let imageHashes = new Set();
  const isZip =
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04;

  if (isZip) {
    const archive = await extractFigZip(bytes, ({ current, total }) => {
      if (onProgress) {
        const pct = Math.min(20, Math.round(5 + (15 * current) / Math.max(1, total)));
        onProgress({ stage: "unpacking", percent: pct, message: `Extracting archive entry ${current}/${total}...` });
      }
    }, onAsset ? async ({ hash, bytes: imageBytes }) => {
      const buffer = imageBytes.buffer.slice(
        imageBytes.byteOffset,
        imageBytes.byteOffset + imageBytes.byteLength,
      );
      await onAsset({ assetId: `img-${hash}`, buffer });
      imageHashes.add(hash);
    } : null);
    canvas = archive.canvas;
    images = archive.images;
    imageHashes = onAsset ? imageHashes : new Set(images.keys());
  }

  if (onProgress) {
    onProgress({ stage: "unpacking", percent: 20, message: "Archive unpacked" });
  }

  // 2. Kiwi decoding stage (20% - 50%)
  if (onProgress) {
    onProgress({ stage: "kiwi", percent: 25, message: "Decoding Kiwi schema & AST..." });
  }

  if (!isFigContainer(canvas)) {
    throw new Error("Unsupported file: expected a native Figma .fig document");
  }

  const parsed = await parseFigContainer(canvas);

  if (onProgress) {
    onProgress({ stage: "kiwi", percent: 45, message: "Kiwi container decoded" });
  }

  // Yield to keep thread responsive
  await new Promise((resolve) => setTimeout(resolve, 0));

  // 3. Topology & instance indexing stage (50% - 65%)
  if (onProgress) {
    onProgress({ stage: "topology", percent: 50, message: "Indexing instances & tree hierarchy..." });
  }

  const message = parsed.message;
  const ctx = createFigmaImportContext(message, images, Boolean(onAsset), imageHashes);
  const { roots, canvases } = buildTopLevel(message);
  const byCanvas = new Map();
  for (const root of roots) {
    const key = root.canvasKey ?? "";
    byCanvas.set(key, [...(byCanvas.get(key) ?? []), root]);
  }
  const names = new Map(canvases.map((canvas) => [canvas.key, canvas.name]));
  const backgrounds = new Map(canvases.map((canvas) => [canvas.key, canvas.background]));
  const order = [...canvases.map((canvas) => canvas.key), ""];
  const activeKeys = order.filter((key) => byCanvas.has(key));

  if (activeKeys.length === 0) {
    throw new Error("figma-no-layers");
  }

  const pagesMeta = activeKeys.map((key) => {
    const canvasRoots = byCanvas.get(key) || [];
    const { minX, minY, maxX, maxY } = figmaRootBounds(canvasRoots);
    const width = Math.max(1, Math.round(maxX - minX));
    const height = Math.max(1, Math.round(maxY - minY));
    return {
      id: crypto.randomUUID(),
      key,
      label: names.get(key) || "Page 1",
      background: backgrounds.get(key) ?? "transparent",
      minX,
      minY,
      width,
      height,
      roots: canvasRoots,
    };
  });

  if (onProgress) {
    onProgress({ stage: "topology", percent: 60, message: "Page topology ready" });
  }

  // Emit PAGE_HEADER
  if (onHeader) {
    onHeader(
      pagesMeta.map((p) => ({
        id: p.id,
        name: p.label,
        bounds: { x: p.minX, y: p.minY, width: p.width, height: p.height },
      })),
    );
  }

  // 4. Node mapping & chunk streaming (65% - 95%)
  if (onProgress) {
    onProgress({ stage: "nodes", percent: 65, message: "Mapping scene nodes..." });
  }

  const pages = [];
  let totalLayerCount = 0;

  for (let pIdx = 0; pIdx < pagesMeta.length; pIdx++) {
    const meta = pagesMeta[pIdx];
    const pageNodes = [];
    emitChildren(meta.roots, -meta.minX, -meta.minY, null, pageNodes, ctx,
      (root, x, y, _parent, out, context) => emitPageRoot(root, x, y, out, context));
    totalLayerCount += pageNodes.length;

    if (pageNodes.length === 0) {
      if (onChunk) {
        onChunk({
          pageId: meta.id,
          nodes: [],
          isFirstScreen: pIdx === 0,
        });
      }
    } else {
      for (let i = 0; i < pageNodes.length; i += chunkSize) {
        const chunk = pageNodes.slice(i, i + chunkSize);
        const isFirstScreen = pIdx === 0 && i === 0;
        if (onChunk) {
          onChunk({
            pageId: meta.id,
            nodes: chunk,
            isFirstScreen,
          });
        }

        // Yield to event loop every chunk (every 500-1000 nodes)
        await new Promise((resolve) => setTimeout(resolve, 0));

        if (onProgress) {
          const pct = Math.min(
            95,
            Math.round(65 + (30 * (i + chunk.length)) / Math.max(1, pageNodes.length)),
          );
          onProgress({
            stage: "nodes",
            percent: pct,
            message: `Converting scene nodes (${totalLayerCount} layers)...`,
          });
        }
      }
    }

    const sceneDoc = createDocument(meta.width, meta.height, meta.background);
    // Figma CANVAS is an unbounded root, not an artboard frame.
    sceneDoc.isCanvasRoot = true;
    sceneDoc.nodes = pageNodes;
    if (ctx.variablesV2) sceneDoc.variablesV2 = ctx.variablesV2;
    pages.push({
      id: meta.id,
      label: meta.label,
      canvasType: "design",
      sceneDoc,
      layout: null,
      left: meta.minX,
      top: meta.minY,
    });
  }

  // 5. Finalizing VOO envelope (95% - 100%)
  if (onProgress) {
    onProgress({ stage: "nodes", percent: 98, message: "Finalizing VOO document..." });
  }

  const placed = pages.filter((page) => Number.isFinite(page.left) && Number.isFinite(page.top));
  const minLeft = Math.min(...placed.map((page) => page.left), 0);
  const minTop = Math.min(...placed.map((page) => page.top), 0);
  const editorArtboardLayouts = {};
  for (const page of pages) {
    if (!Number.isFinite(page.left) || !Number.isFinite(page.top)) continue;
    editorArtboardLayouts[page.id] = {
      x: Math.round(page.left - minLeft),
      y: Math.round(page.top - minTop),
      width: page.sceneDoc.width,
      height: page.sceneDoc.height,
    };
    delete page.left;
    delete page.top;
  }

  const document = {
    ...pages[0].sceneDoc,
    pages,
    editorArtboardLayouts,
    editorCamera: { panX: 0, panY: 0, zoom: 1 },
    editingNodeId: pages[0].id,
  };

  const vooFile = {
    format: VOO_FILE_FORMAT,
    version: 2,
    kind: "design",
    document,
    assets: ctx.assets,
  };

  const figSource = pruneFigSource({
    version: parsed.version,
    schema: parsed.schema,
    message: parsed.message,
  });

  const warnings = [...ctx.warnings].map(([msg, count]) => ({ message: msg, count }));
  const fonts = fontSummary(ctx.fonts);

  if (onProgress) {
    onProgress({ stage: "nodes", percent: 100, message: "Import complete" });
  }

  return {
    vooFile,
    layerCount: totalLayerCount,
    warnings,
    fonts,
    figSource,
  };
}
