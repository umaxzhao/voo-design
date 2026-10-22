import { getCanvasType } from "./canvas-composition-model.js";
import { NODE_KIND } from "./scene_model.js";
import { detachInstance } from "./component_extract.js";

/**
 * Replaces every component instance with its source content, so the raster and
 * SVG exporters see plain nodes. Instances are detached, not rendered, so this
 * is synchronous.
 */
export function expandInstancesForRaster(
  doc,
  resolveCanvas,
  sourcePath = new Set(),
) {
  if (typeof resolveCanvas !== "function") return doc;
  const nodes = doc.nodes.flatMap((node) => {
    if (node.kind !== NODE_KIND.CANVAS_INSTANCE || node.visible === false)
      return [node];
    const sourceId = node.sourceCanvasId;
    if (sourcePath.has(sourceId)) throw new Error("EXPORT_COMPONENT_CYCLE");
    const source = resolveCanvas(sourceId);
    if (!source) throw new Error("EXPORT_COMPONENT_SOURCE_MISSING");
    if (getCanvasType(source) === "3d")
      throw new Error("EXPORT_COMPONENT_UNSUPPORTED");
    const detached = detachInstance(
      { ...doc, nodes: [node] },
      node.id,
      source,
    ).doc;
    return expandInstancesForRaster(
      detached,
      resolveCanvas,
      new Set([...sourcePath, sourceId]),
    ).nodes;
  });
  return { ...doc, nodes };
}
