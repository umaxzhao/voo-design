import { nodesToSvg } from "../editor/editor_svg.js";
import { expandInstancesForRaster } from "../editor/editor_export_instances.js";

/** Render document content in world coordinates, including Frames outside page bounds. */
export function projectCover(file, { preferEmbedded = true } = {}) {
  if (preferEmbedded && typeof file?.preview === "string" && file.preview.startsWith("data:image/")) return file.preview;
  const root = file?.document;
  if (!root) return null;
  const pages = root.pages ?? [];
  const focused = pages.find(page => page.id === root.editingNodeId);
  const document = focused?.sceneDoc ?? focused?.document ?? (root.nodes?.length ? root : pages[0]?.sceneDoc);
  if (!document?.nodes?.length) return null;
  const assets = file.assets ?? file.images ?? {};
  const resolveCanvas = id => {
    if (document.components?.[id]) return document.components[id];
    return pages.find(page => page.id === id || page.sceneDoc?.canvasId === id)?.sceneDoc;
  };
  const expanded = expandInstancesForRaster(document, resolveCanvas);
  const svg = nodesToSvg(expanded.nodes, {
    bitmapOf: id => assets[id] ?? null,
    maskOf: id => assets[id] ?? null,
    resolveCanvas,
    backgroundColor: "transparent",
  });
  return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null;
}

/** Keep cached covers small; never export or resize the live editing canvas. */
export async function createProjectCover(file, options) {
  const source = projectCover(file, options);
  if (!source || typeof Image === "undefined" || typeof document === "undefined") return source;
  const image = new Image();
  image.src = source;
  try {
    await image.decode();
    const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("COVER_CANVAS_UNAVAILABLE");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally { image.src = ""; }
}
