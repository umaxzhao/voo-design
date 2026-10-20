/**
 * The asset library: every picture a workflow run produced, kept regardless of
 * which platform made it and regardless of whether the node that made it still
 * exists.
 *
 * This sits on top of three IndexedDB stores: `assets` holds one metadata row
 * per generated picture, `images` holds the blob, and `thumbnails` holds the
 * small preview the panel pages through. The rows are what make the
 * library independent of the graph — `pruneOrphanImages` treats a library row
 * as a reference, so deleting the node keeps the picture.
 *
 * Because nothing else bounds it, the library enforces its own size budget:
 * when the stored bytes exceed the configured cap, the least recently used
 * assets are evicted. Assets a workflow still references are never evicted —
 * dropping those would blank out nodes on the canvas.
 */

import { IMPORT_PLATFORM } from "../library_categories.js";
import {
  deleteAssetRecords,
  getAssetThumbMap,
  getImageBlobMap,
  listAssetPage,
  listAssetRecords,
  putLibraryImages,
  touchAssets,
} from "./db.js";
import { isAudioSource, isVideoSource, makeThumbnail } from "./image_thumbs.js";
import { pruneOrphanImages, workflowReferencedImageIds } from "./library.js";

/**
 * Stores generated pictures and registers them in the library.
 *
 * Every picture entry also gets a bounded thumbnail, generated here — page-
 * side, where a canvas exists — so the panel can later page through small
 * previews instead of moving every original. Video and audio get no thumbnail;
 * their previews fall back to the stored blob on read. A thumbnail that
 * cannot be generated fails the registration outright rather than poisoning
 * the batch silently.
 *
 * @param {Array<[string, string | Blob]>} entries - `[imageId, dataUrlOrBlob]`
 * @param {object} meta - `platform`, `prompt`, `nodeId`, `workflowId`, `maxBytes`
 */
export async function registerGeneratedImages(
  entries,
  meta = {},
  { getAssetRetentionNodes } = {},
) {
  if (entries.length === 0) return;
  const thumbs = [];
  for (const [id, source] of entries) {
    if (isVideoSource(source) || isAudioSource(source)) continue;
    thumbs.push([id, await makeThumbnail(source)]);
  }
  await putLibraryImages(entries, meta, thumbs);
  if (meta.maxBytes) {
    await enforceAssetBudget(meta.maxBytes, getAssetRetentionNodes?.() ?? []);
  }
}

/** Total bytes and row count currently held by the library. */
export async function assetLibraryUsage() {
  const records = await listAssetRecords();
  return {
    count: records.length,
    bytes: records.reduce((total, record) => total + (record.bytes ?? 0), 0),
  };
}

/**
 * Ids whose preview cannot come from a thumbnail — legacy rows written before
 * thumbnails existed, and video entries, which never get one. Their previews
 * fall back to the full blob.
 */
export function idsWithoutThumbs(records, thumbs) {
  return records
    .filter((record) => !thumbs.has(record.id))
    .map((record) => record.id);
}

/**
 * One newest-first page of library rows with a renderable object URL each.
 *
 * Previews come from the thumbnail store; only ids without a thumbnail fetch
 * their full blob. `total` and `bytes` describe the whole library, not just
 * the returned page, so callers can paginate and report usage accurately.
 * `video`, `audio`, and `mimeType` tell callers which media viewer to render.
 * `platform` narrows the page to one source — the material library's local
 * tab pages only user imports ("import"), never generated results.
 *
 * The caller owns the returned URLs and must hand them back to
 * `revokeAssetPreviews` when the list is replaced or unmounted.
 *
 * @returns {Promise<{assets: object[], total: number, bytes: number}>}
 */
export async function listAssets({
  offset = 0,
  limit = 24,
  platform = null,
} = {}) {
  const { records, total, bytes } = await listAssetPage({
    offset,
    limit,
    platform,
  });
  const thumbs = await getAssetThumbMap(records.map((record) => record.id));
  const fallbackIds = idsWithoutThumbs(records, thumbs);
  const fallbacks =
    fallbackIds.length > 0 ? await getImageBlobMap(fallbackIds) : new Map();
  const assets = records
    .filter((record) => thumbs.has(record.id) || fallbacks.has(record.id))
    .map((record) => {
      const blob = thumbs.get(record.id) ?? fallbacks.get(record.id);
      const mimeType = blob?.type ?? "";
      return {
        id: record.id,
        platform: record.platform ?? null,
        prompt: record.prompt ?? "",
        createdAt: record.createdAt ?? 0,
        bytes: record.bytes ?? 0,
        mimeType,
        video: mimeType.startsWith("video/"),
        audio: mimeType.startsWith("audio/"),
        previewUrl: URL.createObjectURL(blob),
      };
    });
  return { assets, total, bytes };
}

/** Releases the object URLs handed out by `listAssets`. */
export function revokeAssetPreviews(assets) {
  assets.forEach((asset) => {
    if (asset.previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(asset.previewUrl);
    }
  });
}

/** Records that these assets were just pulled onto a canvas. */
export async function markAssetsUsed(ids) {
  await touchAssets(ids);
}

/** Removes assets from the library and reclaims any blob nothing else holds. */
export async function removeAssets(ids, liveNodes = []) {
  await deleteAssetRecords(ids);
  await pruneOrphanImages(liveNodes);
}

/**
 * Evicts least-recently-used assets until the library fits its byte budget.
 *
 * User imports are source material, not generated-image cache. Both Settings
 * cleanup and automatic eviction must preserve them, even while unreferenced.
 * Workflow references are also protected. If protected assets exceed the cap,
 * the library stays over budget rather than destroying the user's work.
 *
 * @returns {Promise<{evicted: number, bytes: number}>} what was reclaimed
 */
export async function enforceAssetBudget(maxBytes, liveNodes = []) {
  const records = await listAssetRecords();
  const total = records.reduce((sum, record) => sum + (record.bytes ?? 0), 0);
  if (total <= maxBytes) return { evicted: 0, bytes: 0 };

  const referenced = await workflowReferencedImageIds(liveNodes);
  const candidates = records
    .filter(
      (record) =>
        record.platform !== IMPORT_PLATFORM && !referenced.has(record.id),
    )
    .sort((a, b) => (a.lastUsedAt ?? 0) - (b.lastUsedAt ?? 0));

  const evicting = [];
  let freed = 0;
  for (const record of candidates) {
    if (total - freed <= maxBytes) break;
    evicting.push(record.id);
    freed += record.bytes ?? 0;
  }
  if (evicting.length === 0) return { evicted: 0, bytes: 0 };

  await deleteAssetRecords(evicting);
  await pruneOrphanImages(liveNodes);
  return { evicted: evicting.length, bytes: freed };
}
