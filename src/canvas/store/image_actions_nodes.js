import { imagePublicationFromArguments } from "./image-publication-bindings.js";
import { createNode, NODE_TYPE } from "../nodes/types.js";
import { dataUrlToBlob, getImageBlobMap, putImage } from "./db.js";
import { mergeBlobsAsUrls } from "./image_cache.js";
import { scheduleSave } from "./persistence.js";

/** Creating image editor nodes from files, sessions, external URLs, and assets. */
export function createImageNodesActions(set, get) {
  return {
    async addSessionImageNode(dataUrl, filename, position) {
      if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
        throw new Error("invalid-session-image");
      }

      const imageId = `img-${crypto.randomUUID()}`;
      const blob = dataUrlToBlob(dataUrl);
      await putImage(imageId, blob, imagePublicationFromArguments(arguments));
      const node = createNode(NODE_TYPE.IMAGE_EDITOR, position, {
        imageId,
        filename,
        origin: "generated",
      });
      set({
        images: mergeBlobsAsUrls(get().images, new Map([[imageId, blob]])),
        nodes: [...get().nodes, node],
      });
      scheduleSave(get);
      return node.id;
    },

    /** Stores a remote inspiration picture as a local reference on the canvas. */
    async addExternalImageNode(dataUrl, filename, position) {
      if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
        throw new Error("invalid-external-image");
      }

      const imageId = `img-${crypto.randomUUID()}`;
      const blob = dataUrlToBlob(dataUrl);
      await putImage(imageId, blob, imagePublicationFromArguments(arguments));
      const node = createNode(NODE_TYPE.IMAGE_EDITOR, position, {
        imageId,
        filename,
        origin: "local",
      });
      set({
        images: mergeBlobsAsUrls(get().images, new Map([[imageId, blob]])),
        nodes: [...get().nodes, node],
      });
      scheduleSave(get);
      return node.id;
    },

    /**
     * Places a File/Blob from outside the app (clipboard paste) on the canvas.
     * The blob is stored directly — no base64 detour.
     */
    async addImageNodeFromFile(file, filename, position) {
      const imageId = `img-${crypto.randomUUID()}`;
      await putImage(imageId, file, imagePublicationFromArguments(arguments));
      const node = createNode(NODE_TYPE.IMAGE_EDITOR, position, {
        imageId,
        filename,
        origin: "local",
      });
      set({
        images: mergeBlobsAsUrls(get().images, new Map([[imageId, file]])),
        nodes: [...get().nodes, node],
      });
      scheduleSave(get);
      return node.id;
    },

    /**
     * Places a locally dropped video on the canvas as a new video node — the
     * video counterpart of addImageNodeFromFile. The blob is stored directly
     * (no base64 detour) and becomes the node's active clip: the video node's
     * results list is what its preview reads.
     */
    async addVideoNodeFromFile(file, filename, position) {
      if (!file || !file.type?.startsWith("video/")) {
        throw new Error("invalid-video-file");
      }
      const videoId = `video-${crypto.randomUUID()}`;
      await putImage(videoId, file, imagePublicationFromArguments(arguments));
      const node = createNode(NODE_TYPE.VIDEO, position, {
        results: [videoId],
        selectedIndex: 0,
        filename,
        origin: "local",
      });
      set({
        images: mergeBlobsAsUrls(get().images, new Map([[videoId, file]])),
        nodes: [...get().nodes, node],
      });
      scheduleSave(get);
      return node.id;
    },

    /** A dropped model starts as a selected Preview; Tab converts it in place. */
    async addModelPreviewNodeFromFile(file, filename, position) {
      if (!(file instanceof Blob) || !/\.(glb|obj)$/i.test(filename)) {
        throw new TypeError("invalid-model-file");
      }
      const assetId = `model-${crypto.randomUUID()}`;
      await putImage(assetId, file, imagePublicationFromArguments(arguments));
      const node = createNode(NODE_TYPE.PREVIEW, position, {
        mediaType: "model3d",
        assetId,
        filename,
        origin: "local",
      });
      set({
        images: mergeBlobsAsUrls(get().images, new Map([[assetId, file]])),
        nodes: [
          ...get().nodes.map((existing) =>
            existing.selected ? { ...existing, selected: false } : existing,
          ),
          { ...node, selected: true },
        ],
      });
      scheduleSave(get);
      return node.id;
    },

    /**
     * Places a picture that is already in IndexedDB — an asset-library entry —
     * on the canvas. No re-encoding: the blob is reused under its existing id.
     */
    async addStoredImageNode(imageId, filename, position) {
      const loaded = await getImageBlobMap([imageId]);
      if (!loaded.has(imageId)) throw new Error("stored-image-missing");

      const node = createNode(NODE_TYPE.IMAGE_EDITOR, position, {
        imageId,
        filename,
        origin: "generated",
      });
      set({
        images: mergeBlobsAsUrls(get().images, loaded),
        nodes: [...get().nodes, node],
      });
      scheduleSave(get);
      return node.id;
    },

    addImageNodeFromAsset(sourceNodeId, imageId) {
      const source = get().nodes.find((node) => node.id === sourceNodeId);
      if (!source?.data?.results?.includes(imageId) || !get().images[imageId]) {
        throw new Error("generated image asset is unavailable");
      }

      const existing = get().nodes.find(
        (node) =>
          node.type === NODE_TYPE.IMAGE_EDITOR &&
          node.data?.imageId === imageId,
      );
      if (existing) {
        get().selectNode(existing.id);
        return existing.id;
      }

      const siblings = get().nodes.filter(
        (node) => node.data?.sourceNodeId === sourceNodeId,
      ).length;
      const sourceWidth = source.measured?.width ?? source.width ?? 280;
      const node = createNode(
        NODE_TYPE.IMAGE_EDITOR,
        {
          x: source.position.x + sourceWidth + 48,
          y: source.position.y + siblings * 32,
        },
        {
          imageId,
          filename: "",
          origin: "generated",
          sourceNodeId,
        },
      );
      set({
        nodes: [
          ...get().nodes.map((item) => ({ ...item, selected: false })),
          { ...node, selected: true },
        ],
      });
      scheduleSave(get);
      return node.id;
    },
  };
}
