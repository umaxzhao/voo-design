// Clipboard bridge for HTML/CSS handoff, including persisted image assets.

import { getImageBlobMap } from "../store/db.js";
import { documentToHtml } from "./editor_html_export.js";

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function buildEditorHtml(
  doc,
  { selectedIds = null, engine = null } = {},
) {
  if (!doc) throw new Error("html-export-no-document");

  const imageIds = [
    ...new Set(
      doc.nodes.flatMap((node) => (node.imageId ? [node.imageId] : [])),
    ),
  ];
  const blobs =
    imageIds.length > 0 ? await getImageBlobMap(imageIds) : new Map();
  const sources = new Map();
  const sizes = new Map();
  await Promise.all(
    [...blobs].map(async ([imageId, blob]) => {
      const [source, bitmap] = await Promise.all([
        blobToDataUrl(blob),
        createImageBitmap(blob),
      ]);
      sources.set(imageId, source);
      sizes.set(imageId, { width: bitmap.width, height: bitmap.height });
      bitmap.close();
    }),
  );
  return documentToHtml(doc, {
    selectedIds,
    imageSourceOf: (node) => {
      const hasAdjustments = Boolean(node.adjustments && Object.keys(node.adjustments).length > 0);
      const hasMask = Boolean(node.maskId);
      if ((hasAdjustments || hasMask) && typeof engine?.exportNodePng === "function") {
        const baked = engine.exportNodePng(node.id, { uncropped: true }) ?? engine.exportNodePng(node.id);
        if (baked) return baked;
      }
      return sources.get(node.imageId) ?? node.src;
    },
    imageSizeOf: (node) => sizes.get(node.imageId) ?? null,
  });
}

export async function copyEditorHtml(engine, selectedOnly = false) {
  if (!navigator.clipboard?.writeText)
    throw new Error("html-export-no-clipboard");
  const html = await buildEditorHtml(engine.getDocument?.(), {
    selectedIds: selectedOnly ? engine.getSelectedIds?.() : null,
    engine,
  });
  await navigator.clipboard.writeText(html);
  return html;
}
