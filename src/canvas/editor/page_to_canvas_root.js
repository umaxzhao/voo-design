import { createGroupNode } from "./scene_model_groups.js";
import { frameEditorFills } from "./frame-fills.js";

/**
 * Converts a legacy bounded project page into an unbounded page root with its
 * former page surface represented by a normal, movable Frame layer only when
 * it contains layers. Empty pages start as empty, unbounded canvases.
 */
export function promoteFixedPageToFrame(doc, frameName = "Frame") {
  if (!doc || doc.isCanvasRoot) return doc;

  const root = {
    ...doc,
    isCanvasRoot: true,
    backgroundColor: "transparent",
    // Page paint belongs to the migrated Frame, never the unbounded workspace.
    stroke: null,
    strokeWidth: 0,
    strokeHidden: true,
    strokes: [],
    nodes: [],
  };
  // New projects and empty imports share this migration. Do not materialize
  // their legacy page bounds as a user-visible, selectable default Frame.
  if (!doc.nodes?.length) return root;

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
    ...root,
    nodes: [frame, ...nodes],
  };
}
