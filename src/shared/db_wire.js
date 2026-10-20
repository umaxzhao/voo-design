/**
 * Wire protocol for proxied IndexedDB operations.
 *
 * The hosted editor on voo.run cannot open the extension-origin database, so
 * the service worker executes operations on its behalf (see
 * background/external_bridge.js). Chrome message passing is JSON-only — Blobs
 * do not survive — so picture payloads cross as base64 data URLs, which is
 * already the in-memory shape the canvas uses for transport.
 *
 * The converters here work in both environments: pages have `FileReader`,
 * service workers do not, so the worker path goes through `arrayBuffer()`.
 */

/** Operation names carried by BG.DB_OP messages, one per db.js export. */
export const DB_OPS = {
  SAVE_WORKFLOW: "saveWorkflow",
  LOAD_WORKFLOW: "loadWorkflow",
  LIST_WORKFLOWS: "listWorkflows",
  LIST_WORKFLOW_SUMMARIES: "listWorkflowSummaries",
  DELETE_WORKFLOW: "deleteWorkflow",
  SAVE_WORKFLOW_EXECUTION: "saveWorkflowExecution",
  LOAD_WORKFLOW_EXECUTION: "loadWorkflowExecution",
  LIST_WORKFLOW_EXECUTIONS: "listWorkflowExecutions",
  PUT_IMAGES: "putImages",
  DELETE_IMAGES: "deleteImages",
  GET_IMAGE_BLOBS: "getImageBlobs",
  GET_IMAGE_DATA_URLS: "getImageDataUrls",
  PUT_LIBRARY_IMAGES: "putLibraryImages",
  LIST_ASSET_PAGE: "listAssetPage",
  GET_ASSET_THUMBS: "getAssetThumbs",
  LIST_ASSET_RECORDS: "listAssetRecords",
  LIST_ASSET_IDS: "listAssetIds",
  TOUCH_ASSETS: "touchAssets",
  DELETE_ASSET_RECORDS: "deleteAssetRecords",
  PRUNE_IMAGES: "pruneImages",
  PRUNE_ORPHANS: "pruneOrphans",
  IMAGE_RETENTION: "imageRetention",
  LIST_AGENT_SKILLS: "listAgentSkills",
  SAVE_AGENT_SKILL: "saveAgentSkill",
  DELETE_AGENT_SKILL: "deleteAgentSkill",
};

/** Chunked base64 encoding — `String.fromCharCode(...bytes)` blows the stack on large images. */
export function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/** Converts a base64 or encoded data URL into a typed Blob for storage. */
export function dataUrlToBlob(dataUrl) {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) {
    return new Blob([dataUrl], { type: "text/plain" });
  }
  const header = dataUrl.slice(0, commaIndex);
  const rawPayload = dataUrl.slice(commaIndex + 1);
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? "image/png";
  const isBase64 = header.includes(";base64");

  if (isBase64) {
    try {
      const binary = atob(rawPayload.trim());
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return new Blob([bytes], { type: mime });
    } catch {
      // Fallback if atob fails
      return new Blob([rawPayload], { type: mime });
    }
  }

  // Non-base64 (e.g. utf8 or urlencoded SVG)
  try {
    const decoded = decodeURIComponent(rawPayload);
    return new Blob([decoded], { type: mime });
  } catch {
    return new Blob([rawPayload], { type: mime });
  }
}

/**
 * Reads a Blob back as a data URL — the wire format the chat hosts and the
 * DB proxy both expect. `FileReader` is page-only, so service workers take
 * the `arrayBuffer()` path.
 */
export function blobToDataUrl(blob) {
  if (typeof FileReader !== "undefined") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("file-read-failed"));
      reader.readAsDataURL(blob);
    });
  }
  return blob
    .arrayBuffer()
    .then(
      (buffer) =>
        `data:${blob.type || "image/png"};base64,${bytesToBase64(buffer)}`,
    );
}
