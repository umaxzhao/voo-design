import { imagePublicationFromArguments } from "./image-publication-bindings.js";
import { putImage } from "./db.js";
import { mergeBlobsAsUrls } from "./image_cache.js";

/** Mounting image and video media on nodes. */
export function createImageMediaActions(set, get, { pruneAfterReplace }) {
  return {
    /** Persists a video, an audio file or a single-file 3D model. */
    async ingestEditorMediaFile(file) {
      const isVideo =
        file?.type?.startsWith("video/") ||
        /\.(mp4|webm|mov|m4v)$/i.test(file?.name ?? "");
      const isAudio =
        file?.type?.startsWith("audio/") ||
        /\.(mp3|wav|m4a|ogg|oga)$/i.test(file?.name ?? "");
      const isModel =
        file?.type === "model/gltf-binary" ||
        /\.(glb|obj)$/i.test(file?.name ?? "");
      if (!(file instanceof Blob) || (!isVideo && !isAudio && !isModel))
        throw new TypeError("invalid-editor-media-file");
      const assetId = `media-${crypto.randomUUID()}`;
      await putImage(assetId, file, imagePublicationFromArguments(arguments));
      const images = mergeBlobsAsUrls(get().images, new Map([[assetId, file]]));
      set({ images });
      return { assetId, src: images[assetId] };
    },

    async setNodeImageFromFile(nodeId, file, fieldName = "imageId") {
      // A picked File is already a Blob — store it directly, no base64 detour.
      const imageId = `img-${crypto.randomUUID()}`;
      await putImage(imageId, file, imagePublicationFromArguments(arguments));
      set({
        images: mergeBlobsAsUrls(get().images, new Map([[imageId, file]])),
      });

      const patch = { [fieldName]: imageId, filename: file.name };
      if (fieldName === "imageId") patch.origin = "local";
      if (fieldName === "imageId") patch.editorDoc = null;
      get().updateNodeData(nodeId, patch);
      if (fieldName === "imageId") pruneAfterReplace();
    },

    /**
     * Stores a locally picked video on a video node. Unlike the image path
     * (one replacement imageId) a video node holds a results list, so the
     * upload is appended and becomes the active clip.
     */
    async setNodeVideoFromFile(nodeId, file) {
      if (!file || !file.type?.startsWith("video/")) {
        throw new Error("invalid-video-file");
      }
      const videoId = `video-${crypto.randomUUID()}`;
      await putImage(videoId, file, imagePublicationFromArguments(arguments));
      set({
        images: mergeBlobsAsUrls(get().images, new Map([[videoId, file]])),
      });
      const node = get().nodes.find((n) => n.id === nodeId);
      const existing = node?.data?.results ?? [];
      get().updateNodeData(nodeId, {
        results: [...existing, videoId],
        selectedIndex: existing.length,
        filename: file.name,
        origin: "local",
        status: undefined,
        stage: null,
        error: null,
      });
      return videoId;
    },

    /**
     * Imports a remote video (e.g. from the stock library) into a video
     * node's asset list, mirroring setNodeVideoFromFile for URLs. The
     * caller downloads the bytes; this action only stores and registers.
     */
    async addVideoFromUrl(nodeId, file, filename) {
      if (!file || !file.type?.startsWith("video/")) {
        throw new Error("invalid-video-file");
      }
      const node = get().nodes.find((n) => n.id === nodeId);
      const videoId = `video-${crypto.randomUUID()}`;
      await putImage(videoId, file, imagePublicationFromArguments(arguments));
      set({
        images: mergeBlobsAsUrls(get().images, new Map([[videoId, file]])),
      });

      const existing = node?.data?.results ?? [];
      get().updateNodeData(nodeId, {
        results: [...existing, videoId],
        selectedIndex: existing.length,
        filename: filename ?? file.name,
        origin: "stock",
        status: undefined,
        stage: null,
        error: null,
      });
      return videoId;
    },
  };
}
