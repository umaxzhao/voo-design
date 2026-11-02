import {
  buildFrequencySeparationLayerTree,
  createFrequencySeparationPixels,
} from "./frequency_separation.js";
import { NODE_KIND } from "./scene_model.js";
import { decodeBlobToBitmap } from "./bitmap_cache.js";
import { putImage } from "../store/db.js";
import { commitEditorDocument } from "../undo-action-contracts.js";
import * as ops from "./doc_ops.js";

export function createFrequencySeparationController({ getDoc, setDoc, cache, selectExactly }) {
  return {
    async frequencySeparateSelected(nodeId, radius = 10) {
      const doc = getDoc();
      const sourceNode = doc.nodes.find((node) => node.id === nodeId);
      if (sourceNode?.kind !== NODE_KIND.IMAGE) throw new Error("editor.frequencySeparation.error.imageLayer");
      if (!Number.isFinite(radius) || radius < 1 || radius > 100) throw new RangeError("editor.frequencySeparation.error.radius");
      const source = cache.get(sourceNode);
      if (!source) throw new Error("editor.frequencySeparation.error.imageLoading");
      const width = source.naturalWidth || source.width;
      const height = source.naturalHeight || source.height;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("editor.frequencySeparation.error.readPixels");
      context.drawImage(source, 0, 0);
      const original = context.getImageData(0, 0, width, height);
      const { low, high } = createFrequencySeparationPixels(original.data, width, height, radius);
      const createPng = async (pixels) => {
        context.putImageData(new ImageData(pixels, width, height), 0, 0);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("editor.frequencySeparation.error.encode");
        const imageId = `img-${crypto.randomUUID()}`;
        await putImage(imageId, blob);
        const bitmap = await decodeBlobToBitmap(blob);
        if (!bitmap) throw new Error("editor.frequencySeparation.error.decode");
        return { imageId, bitmap };
      };
      const lowImage = await createPng(low);
      const highImage = await createPng(high);
      const { group, low: lowNode, high: highNode } = buildFrequencySeparationLayerTree(
        sourceNode,
        lowImage.imageId,
        highImage.imageId,
      );
      cache.put(lowNode, lowImage.bitmap);
      cache.put(highNode, highImage.bitmap);
      let next = { ...doc, nodes: doc.nodes.map((node) => node.id === nodeId ? { ...node, visible: false } : node) };
      next = ops.addNode(next, group);
      next = ops.addNode(next, lowNode);
      next = ops.addNode(next, highNode);
      commitEditorDocument("editor.frequencySeparation", setDoc, next);
      selectExactly?.([group.id]);
      return group.id;
    },
  };
}
