import { getNodeTypeDefinition } from "./nodes/registry.js";

/**
 * Pure batch-download helpers: which media a set of nodes currently holds,
 * and a deterministic file name for each item. The actual download trigger
 * lives in download.js (DOM-side); everything here is testable without one.
 */

/**
 * Returns the original media URL when it is loaded, falling back to its
 * preview URL only while the original is unavailable.
 */
export function preferredMediaUrl(fullUrl, previewUrl) {
  return fullUrl ?? previewUrl ?? null;
}

/** The media ids a node currently holds, in display order. */
export function nodeMediaIds(node) {
  if (!node) return [];
  const data = node.data ?? {};
  const entry = getNodeTypeDefinition(node.type);
  const extract = entry?.export?.extract;
  if (!extract || extract === "none") return [];
  if (extract === "imageId") {
    return data.imageId ? [data.imageId] : [];
  }
  if (extract === "imageIds") {
    return Array.isArray(data.imageIds) ? data.imageIds : [];
  }
  if (extract === "results") {
    return Array.isArray(data.results) ? data.results : [];
  }
  return [];
}

/**
 * Collects downloadable media across nodes.
 *
 * @param {Array} nodes
 * @param {Object<string, string>} imageUrlMap - media id → full data URL
 *   (the store's `images` mirror). Items whose bytes are missing (still
 *   loading, or pruned) are skipped, never crashed on.
 * @returns {Array<{nodeId: string, url: string, name: string}>}
 */
export function collectNodeMedia(nodes, imageUrlMap = {}) {
  const entries = [];
  for (const node of nodes ?? []) {
    if (!node) continue;
    const entry = getNodeTypeDefinition(node.type);
    if (!entry?.export?.media) continue;
    nodeMediaIds(node).forEach((mediaId, index) => {
      const url = imageUrlMap[mediaId];
      if (!url) return;
      entries.push({ nodeId: node.id, url, name: mediaFileName(node, index) });
    });
  }
  return entries;
}

/**
 * A filesystem-safe base name for one media item: the node's title (or its
 * prompt/text, or the type) sanitized, plus the 1-based position within the
 * node. downloadDataUrl appends the extension from the URL's MIME type.
 */
export function mediaFileName(node, index) {
  const raw = nodeLabel(node);
  const sanitized = String(raw)
    .replace(/[\\/:*?"<>|\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${sanitized || "node"}-${index + 1}`;
}

function nodeLabel(node) {
  const data = node?.data ?? {};
  if (typeof data.title === "string" && data.title.trim()) {
    return data.title.trim();
  }
  const text = data.prompt ?? data.text ?? "";
  if (typeof text === "string" && text.trim()) return text.trim();
  return node?.type ?? "node";
}
