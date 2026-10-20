import { imagePublicationFromArguments } from "./image-publication-bindings.js";
import { createNode, NODE_TYPE } from "../nodes/types.js";
import { dataUrlToBlob, putImage } from "./db.js";
import { mergeBlobsAsUrls } from "./image_cache.js";
import { scheduleSave } from "./persistence.js";

/** File import operations: .voo and .psd files. */
export function createImageImportActions(set, get) {
  return {
    /**
     * Opens a `.voo` editor file as a new node: its image bytes land in
     * IndexedDB, the node is created pointing at the document's main picture,
     * and the editor opens with the saved document.
     */
    async importVooFile(vooFile, position) {
      if (!vooFile?.document) throw new Error("invalid-voo-file");
      const { hydrateVooImages, vooMainImageId } =
        await import("./project_io.js");
      const rollback = await hydrateVooImages(
        vooFile,
        imagePublicationFromArguments(arguments),
      );
      let previewImageId = null;
      try {
        const mainImageId = vooMainImageId(vooFile.document);
        let imageId = mainImageId;
        let previewBlob = null;
        if (!imageId && vooFile.preview) {
          // A document with no image node still has a flattened preview; the
          // node needs some pixels to show and edit.
          imageId = `img-${crypto.randomUUID()}`;
          previewBlob = dataUrlToBlob(vooFile.preview);
          await putImage(
            imageId,
            previewBlob,
            imagePublicationFromArguments(arguments),
          );
          previewImageId = imageId;
        }
        if (!imageId) throw new Error("voo-no-image");
        const node = createNode(NODE_TYPE.PREVIEW, position, {
          mediaType: "image",
          assetId: imageId,
          imageId,
          editorDoc: vooFile.document,
          filename: `${vooFile.document.title ?? "document"}.voo`,
          origin: "local",
        });
        set({
          images: mergeBlobsAsUrls(
            get().images,
            previewBlob ? new Map([[imageId, previewBlob]]) : new Map(),
          ),
          nodes: [...get().nodes, node],
          editingNodeIds: [node.id],
          editingNodeId: node.id,
        });
        scheduleSave(get);
        return node.id;
      } catch (error) {
        const rollbackErrors = [];
        try {
          if (previewImageId) {
            const { deleteImage } = await import("./db.js");
            await deleteImage(previewImageId);
          }
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
        try {
          await rollback();
        } catch (rollbackError) {
          rollbackErrors.push(rollbackError);
        }
        if (rollbackErrors.length) {
          throw new AggregateError(
            [error, ...rollbackErrors],
            "asset-import-rollback-failed",
          );
        }
        throw error;
      }
    },

    /**
     * Imports a local PSD file as a new picture-editor node: the composite
     * becomes the node's main picture and each visible layer an editable
     * image node at its own position (see psd_import.js). Works in any build
     * — the bytes come straight from the dropped File, no disk needed.
     */
    async importPsdFile(arrayBuffer, position, filename = "imported.psd") {
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        throw new Error("empty-psd");
      }
      const { readPsd } = await import("ag-psd");
      const {
        collectPsdGroups,
        collectPsdLayers,
        compositeToBlob,
        layerMaskBlob,
        clippingMaskBlob,
        psdBlendMode,
        psdEffectsToEditor,
        psdAdjustmentsToEditor,
        parseCubeLut,
        applyCubeLut,
        findPatternPixels,
        bakePatternOverlay,
        psdToDocument,
      } = await import("./psd_import.js");
      const psd = readPsd(arrayBuffer);
      // The tree says which layer sits in which group; the flat layer list is
      // top-first, so reverse it to the editor's bottom-first paint order.
      const { groups, layerParent } = collectPsdGroups(psd.children);
      const flatLayers = collectPsdLayers(psd.children).reverse();

      /**
       * Bakes a colour-lookup adjustment (an embedded .cube LUT) into the
       * painted layer below it: decode the layer's blob, sample every pixel
       * through the LUT, and swap the stored blob so the imported layer
       * matches the composite it appears in.
       */
      const bakeColorLookup = async (adj, entry) => {
        if (!entry?.blob || !adj?.lut3DFileData) return;
        const lut = parseCubeLut(adj.lut3DFileData);
        if (!lut) return;
        try {
          const bitmap = await createImageBitmap(entry.blob);
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(bitmap, 0, 0);
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
          applyCubeLut(pixels.data, canvas.width, canvas.height, lut);
          ctx.putImageData(pixels, 0, 0);
          const baked = await new Promise((resolve) =>
            canvas.toBlob(resolve, "image/png"),
          );
          if (!baked) return;
          entry.blob = baked;
          await putImage(
            entry.imageId,
            baked,
            imagePublicationFromArguments(arguments),
          );
        } catch {
          // Decoding or re-encoding failed; keep the layer as imported.
        }
      };

      /**
       * Bakes a pattern overlay into a layer's blob: find the pattern's raw
       * pixels, decode the blob, tile the pattern over it through the
       * overlay's opacity, and re-encode. Unusable patterns or decode errors
       * leave the blob untouched.
       */
      const bakePatternIntoBlob = async (blob, psd, layer) => {
        const pattern = findPatternPixels(psd, layer, layer.effects);
        if (!pattern) return blob;
        const overlay = layer.effects.patternOverlay;
        try {
          const bitmap = await createImageBitmap(blob);
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(bitmap, 0, 0);
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
          bakePatternOverlay(
            pixels.data,
            canvas.width,
            canvas.height,
            pattern,
            overlay.opacity,
          );
          ctx.putImageData(pixels, 0, 0);
          const baked = await new Promise((resolve) =>
            canvas.toBlob(resolve, "image/png"),
          );
          return baked ?? blob;
        } catch {
          return blob;
        }
      };

      const layerEntries = [];
      // The ag-psd layer objects of the painted entries, parallel to
      // layerEntries, so a clipping layer can reach the layer below it.
      const paintedLayers = [];
      for (const layer of flatLayers) {
        // Hidden layers — including hidden adjustment layers — never
        // contribute to the picture.
        if (layer.hidden) continue;
        // A colour lookup layer is a fixed 3D LUT with no sliders of its
        // own: its effect is baked into the painted layer below at import,
        // so the imported layer matches the composite it appears in.
        if (layer.adjustment?.type === "color lookup") {
          await bakeColorLookup(layer.adjustment, layerEntries.at(-1));
          continue;
        }
        // An adjustment layer has no pixels of its own: its patch rides on
        // the nearest painted layer below it, then the adjustment itself is
        // not added to the document.
        const adjustment = psdAdjustmentsToEditor(layer.adjustment);
        if (adjustment) {
          const below = layerEntries.at(-1);
          if (below) {
            below.adjustment = { ...(below.adjustment ?? {}), ...adjustment };
          }
          continue;
        }
        const width = (layer.right ?? 0) - (layer.left ?? 0);
        const height = (layer.bottom ?? 0) - (layer.top ?? 0);
        if (width <= 0 || height <= 0) continue;
        let blob = await compositeToBlob(layer);
        if (!blob) continue;
        // A pattern overlay style tiles over the layer's own content. The
        // PSD's layer pixels do not carry the style (only the composite
        // does), so bake the tile in at import to keep the layer faithful.
        if (layer.effects?.patternOverlay) {
          blob = await bakePatternIntoBlob(blob, psd, layer);
          if (!blob) continue;
        }
        const imageId = `img-${crypto.randomUUID()}`;
        await putImage(imageId, blob, imagePublicationFromArguments(arguments));
        const entry = {
          name: layer.name,
          left: layer.left ?? 0,
          top: layer.top ?? 0,
          width,
          height,
          imageId,
          blob,
          blendMode: psdBlendMode(layer.blendMode),
          opacity: layer.opacity ?? 1,
          lockTransparency: layer.protected?.transparency === true,
          parentId: layerParent.get(layer) ?? null,
          effects: psdEffectsToEditor(layer.effects),
        };
        // A layer mask becomes the node's matte: white pixels carrying the
        // mask in alpha, stored like every other editor mask.
        const maskBlob = await layerMaskBlob(layer);
        if (maskBlob) {
          const maskId = `img-${crypto.randomUUID()}`;
          await putImage(
            maskId,
            maskBlob,
            imagePublicationFromArguments(arguments),
          );
          entry.maskId = maskId;
          entry.maskBlob = maskBlob;
        } else if (layer.clipping) {
          // Clipping group: the layer shows only where the painted layer
          // below it has paint. The base's alpha becomes the matte. A layer
          // with its own mask keeps it (the two would need multiplying).
          const base = paintedLayers.at(-1);
          const clipBlob = await clippingMaskBlob(layer, base);
          if (clipBlob) {
            const maskId = `img-${crypto.randomUUID()}`;
            await putImage(
              maskId,
              clipBlob,
              imagePublicationFromArguments(arguments),
            );
            entry.maskId = maskId;
            entry.maskBlob = clipBlob;
          }
        }
        layerEntries.push(entry);
        paintedLayers.push(layer);
      }
      const compositeBlob = await compositeToBlob(psd);
      const compositeId = `img-${crypto.randomUUID()}`;
      await putImage(
        compositeId,
        compositeBlob,
        imagePublicationFromArguments(arguments),
      );
      const document = psdToDocument(
        psd.width,
        psd.height,
        compositeId,
        layerEntries.map(({ adjustment, ...layer }) => ({
          ...layer,
          ...(adjustment ? { adjustments: adjustment } : {}),
        })),
        groups,
      );
      const node = createNode(NODE_TYPE.PREVIEW, position, {
        mediaType: "image",
        assetId: compositeId,
        imageId: compositeId,
        editorDoc: document,
        filename,
        origin: "local",
      });
      set({
        images: mergeBlobsAsUrls(
          get().images,
          new Map([
            [compositeId, compositeBlob],
            ...layerEntries.map((entry) => [entry.imageId, entry.blob]),
            ...layerEntries.flatMap((entry) =>
              entry.maskBlob ? [[entry.maskId, entry.maskBlob]] : [],
            ),
          ]),
        ),
        nodes: [...get().nodes, node],
        editingNodeIds: [node.id],
        editingNodeId: node.id,
      });
      scheduleSave(get);
      return node.id;
    },
  };
}
