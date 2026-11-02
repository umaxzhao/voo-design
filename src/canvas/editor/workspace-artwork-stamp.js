import { clippingResources, sameClippingResources } from "./clipping-chain-cache.js";
import { isImagePaint } from "./render-paint-style.js";
import { textMetricsRevision } from "./text_metrics.js";

/** Camera/selection notifications do not invalidate immutable artwork pixels. */
export function createArtworkReadApi({ getDocument, getBitmap, getPaintBitmap, getMask, getBypass }) {
  let nodes, resourceNodes, previous;
  return {
    getNodeBitmap: node => node ? getBitmap(node) : undefined,
    getNodeMask: node => node ? getMask(node) : undefined,
    getArtworkStamp() {
      const doc = getDocument();
      if (doc.timeline) return null;
      if (nodes !== doc.nodes) {
        nodes = doc.nodes;
        resourceNodes = nodes.filter(node => node.kind === "image" || node.kind === "video" ||
          node.imageId || node.src || node.maskId || isImagePaint(node.fill) ||
          node.fills?.some(paint => paint.imageId || isImagePaint(paint.fill)));
      }
      const resources = clippingResources(resourceNodes, getPaintBitmap, getMask);
      if (!resources) return null;
      // Matte tools can create a live canvas before persisting its asset id.
      for (const node of resourceNodes) {
        if (node.maskId) continue;
        const mask = getMask(node);
        resources.push(mask ?? null, mask?.__warpTextureVersion ?? 0);
      }
      const font = textMetricsRevision(), bypass = getBypass();
      if (previous?.doc === doc && previous.font === font && previous.bypass === bypass &&
          sameClippingResources(previous.resources, resources)) return previous;
      previous = { doc, font, bypass, resources };
      return previous;
    },
  };
}
