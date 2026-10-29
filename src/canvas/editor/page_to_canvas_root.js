import { createGroupNode } from "./scene_model_groups.js";
import { frameEditorFills } from "./frame-fills.js";

/**
 * Converts a legacy bounded project page into an unbounded page root with its
 * former page surface represented by a normal, movable Frame layer.
 */
export function promoteFixedPageToFrame(doc, frameName = "Frame") {
  if (!doc || doc.isCanvasRoot) return doc;

  const frame = {
    ...createGroupNode({
      x: 0,
      y: 0,
      width: doc.width,
      height: doc.height,
    }),
    name: frameName,
    frame: true,
    isFrame: true,
    containerType: "frame",
    fill: doc.backgroundColor ?? "transparent",
    fillOpacity: doc.fillOpacity ?? 1,
    fillHidden: doc.fillHidden ?? false,
    fills: frameEditorFills(doc),
    stroke: doc.stroke ?? null,
    strokeHidden: doc.strokeHidden ?? false,
    strokes: Array.isArray(doc.strokes) ? doc.strokes : [],
    strokeWidth: doc.strokeWidth ?? 1,
    strokeOpacity: doc.strokeOpacity ?? 1,
    strokeAlign: doc.strokeAlign ?? "inside",
    strokeSides: doc.strokeSides,
    strokeCap: doc.strokeCap,
    strokeJoin: doc.strokeJoin,
    strokeDash: doc.strokeDash,
    strokeMiterLimit: doc.strokeMiterLimit,
    cornerRadius: doc.cornerRadius ?? 0,
    cornerRadii: doc.cornerRadii ?? null,
    clipContent: doc.clipContent ?? true,
    effects: doc.effects ?? [],
  };

  const nodes = (doc.nodes ?? []).map((node) =>
    node.parentId ? node : { ...node, parentId: frame.id },
  );

  return {
    ...doc,
    isCanvasRoot: true,
    backgroundColor: "transparent",
    nodes: [frame, ...nodes],
  };
}
