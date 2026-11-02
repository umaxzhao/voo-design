/**
 * Object-URL mirror for IndexedDB image blobs.
 *
 * The store maps image id -> object URL so nodes render straight from the
 * browser's blob store instead of holding megabyte-scale base64 strings in
 * React state (every `set` would otherwise copy those strings and re-render
 * the whole tree). Transport paths (postMessage, API calls, JSON export) read
 * data URLs from IndexedDB on demand instead.
 */

/**
 * Media type per object URL. An object URL carries neither an extension nor a
 * type, so a node that renders whatever it is handed — a Gallery collects both
 * pictures and clips — has no other way to tell a video from a still.
 */
const mediaTypes = new Map();

function forget(url) {
  if (!url?.startsWith("blob:")) return;
  URL.revokeObjectURL(url);
  mediaTypes.delete(url);
}

/**
 * Merges freshly loaded blobs into the images map as object URLs, revoking
 * the URLs they replace so orphaned blobs do not accumulate.
 */
export function mergeBlobsAsUrls(currentImages, blobMap) {
  const next = { ...currentImages };
  for (const [id, blob] of blobMap) {
    forget(next[id]);
    const url = URL.createObjectURL(blob);
    if (blob.type) mediaTypes.set(url, blob.type);
    next[id] = url;
  }
  return next;
}

/** Revokes every object URL in an images map, e.g. when switching workflows. */
export function revokeImageUrls(images) {
  Object.values(images).forEach(forget);
}

/** Whether a stored media URL points at a clip rather than a still picture. */
export function isVideoUrl(url) {
  if (typeof url !== "string") return false;
  if (url.startsWith("data:")) return url.startsWith("data:video/");
  return Boolean(mediaTypes.get(url)?.startsWith("video/"));
}
