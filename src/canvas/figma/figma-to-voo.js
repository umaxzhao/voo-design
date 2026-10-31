/** Native Figma parsing and public multi-page/streaming import entry points. */
import { VOO_FILE_FORMAT } from "../../../electron/voo_format.js";
import { createDocument } from "../editor/scene_doc_factory.js";
import { fontSummary, createFigmaImportContext } from "./figma-import-context.js";
import { figBytesToVooFileStreaming } from "./figma-streaming-import.js";
export { figBytesToVooFileStreaming };
export { pruneFigSource } from "./figma-import-context.js";
import { buildTopLevel } from "./figma-scene-tree.js";
import { canvasPage } from "./figma-scene-nodes.js";
/**
 * Maps a decoded message to editor pages. Returns null when the file holds no
 * mappable layers, so the caller can report an empty import instead of
 * opening a blank document.
 *
 * @param {object} message decoded Kiwi `Message` (`nodeChanges` etc.)
 * @param {Map<string, Uint8Array>} images archive images keyed by content hash
 */
export function figmaMessageToPages(message, images = new Map()) {
  const ctx = createFigmaImportContext(message, images);
  const { roots, canvases } = buildTopLevel(message);
  const byCanvas = new Map();
  for (const root of roots) {
    const key = root.canvasKey ?? "";
    byCanvas.set(key, [...(byCanvas.get(key) ?? []), root]);
  }
  const names = new Map(canvases.map((canvas) => [canvas.key, canvas.name]));
  const backgrounds = new Map(canvases.map((canvas) => [canvas.key, canvas.background]));
  const order = [...canvases.map((canvas) => canvas.key), ""];
  // One editor page per Figma canvas: its frames and loose shapes share one page.
  const pages = order
    .filter((key) => byCanvas.has(key))
    .map((key) => canvasPage(byCanvas.get(key), names.get(key) || "Page 1", ctx, backgrounds.get(key) ?? "transparent"));
  if (pages.length === 0) return null;

  const layerCount = pages.reduce((total, page) => total + page.nodes.length, 0);
  return {
    pages: pages.map((page) => ({
      ...page,
      width: Math.max(1, Math.round(page.width)),
      height: Math.max(1, Math.round(page.height)),
    })),
    assets: ctx.assets,
    layerCount,
    warnings: [...ctx.warnings].map(([message, count]) => ({ message, count })),
    fonts: fontSummary(ctx.fonts),
    variablesV2: ctx.variablesV2,
  };
}

/**
 * Parses `.fig` bytes and returns the `.voo` envelope for them. Fails fast with
 * `figma-no-layers` when the file holds nothing that maps to a layer.
 */
export async function figBytesToVooFile(bytes) {
  return figBytesToVooFileStreaming(bytes);
}

export function figmaMessageToVooFile(message, images) {
  const mapped = figmaMessageToPages(message, images);
  if (!mapped) return null;

  const pages = mapped.pages.map((page) => {
    const sceneDoc = createDocument(page.width, page.height, page.background ?? "transparent");
    // Figma CANVAS is an unbounded root, not an artboard frame.
    sceneDoc.isCanvasRoot = true;
    sceneDoc.nodes = page.nodes;
    if (mapped.variablesV2) sceneDoc.variablesV2 = mapped.variablesV2;
    return { id: crypto.randomUUID(), label: page.label, canvasType: "design", sceneDoc, layout: null, left: page.left, top: page.top };
  });
  // Keep each frame where it sat on the Figma canvas, relative to the top-left-most frame.
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

  return {
    vooFile: {
      format: VOO_FILE_FORMAT,
      version: 2,
      kind: "design",
      document,
      assets: mapped.assets,
    },
    layerCount: mapped.layerCount,
    warnings: mapped.warnings,
    fonts: mapped.fonts,
  };
}
