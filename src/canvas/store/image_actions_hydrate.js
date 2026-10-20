import { referencedImageIds } from "../engine/graph.js";
import { getAssetThumbMap, getImageBlobMap } from "./db.js";
import { mergeBlobsAsUrls } from "./image_cache.js";

/** Asynchronous hydration of images from storage. */
export function createImageHydrateActions(set, get) {
  /**
   * Loads thumbnails for the given ids into `state.thumbnails` (plan 4.3).
   * Missing thumbs (legacy rows, videos) are skipped — nodes fall back to the
   * full-res image for those. Never throws.
   */
  async function hydrateThumbnails(ids) {
    const missing = ids.filter((id) => id && !get().thumbnails[id]);
    if (missing.length === 0) return;
    try {
      const loaded = await getAssetThumbMap(missing);
      if (loaded.size === 0) return;
      set({ thumbnails: mergeBlobsAsUrls(get().thumbnails, loaded) });
    } catch (error) {
      // Thumbnails are an optimisation; a failed fetch keeps full-res previews.
      console.warn("thumbnail hydration failed", error);
    }
  }

  return {
    async hydrateDocumentImages(workflowId, ids) {
      try {
        const loaded = await getImageBlobMap(ids);
        if (get().workflowId !== workflowId) return;
        set({ images: mergeBlobsAsUrls(get().images, loaded) });
        await hydrateThumbnails(ids);
      } catch (error) {
        // Skeletons stay up; a failed load must not break the ready document.
        console.error("async image hydration failed", error);
      }
    },

    async hydrateImages(ids) {
      const missing = ids.filter((id) => id && !get().images[id]);
      if (missing.length === 0) return;
      const loaded = await getImageBlobMap(missing);
      set({ images: mergeBlobsAsUrls(get().images, loaded) });
      await hydrateThumbnails(ids);
    },

    async hydrateReferencedImages(nodes) {
      const ids = referencedImageIds(nodes);
      const loaded = await getImageBlobMap(ids);
      set({ images: mergeBlobsAsUrls(get().images, loaded) });
      await hydrateThumbnails(ids);
    },

    /** Hydrates thumbnails for ids whose images already landed (plan 4.3). */
    hydrateThumbnails,
  };
}
