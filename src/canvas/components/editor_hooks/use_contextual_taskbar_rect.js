import { useLayoutEffect, useState } from "react";
import { boundsOfPoints, nodesBounds } from "../../editor/scene_geometry_bounds.js";
import { TOOL } from "../../editor/editor_constants.js";

/** An active edit anchors to its content, never to the unbounded page size. */
function contextualBounds(engine) {
  const transform = engine.getSelectionTransform?.();
  if (transform?.rect) return transform.rect;
  const pixels = engine.getPixelSelection?.();
  if (pixels?.contours?.length && pixels.bounds) return pixels.bounds;
  const ids = engine.getSelectedIds?.() ?? [];
  const selected = ids.map(id => engine.getNode?.(id)).filter(Boolean);
  if (!selected.length && engine.getSelected?.()) selected.push(engine.getSelected());
  if (selected.length) return nodesBounds(selected);
  const draft = engine.getPenDraft?.();
  if (draft?.anchors?.length) return boundsOfPoints(draft.anchors.map(({ x, y }) => [x, y]));
  const editing = engine.penEdit?.nodeId && engine.getNode?.(engine.penEdit.nodeId);
  if (editing) return nodesBounds([editing]);
  const tool = engine.getTool?.();
  if ([TOOL.PEN, TOOL.CURVATURE_PEN, TOOL.FREE_PEN, TOOL.MARQUEE, TOOL.LASSO].includes(tool)) {
    const doc = engine.getDocument?.();
    if (doc) return { x: 0, y: 0, width: doc.width, height: doc.height };
  }
  return null;
}

function sameRect(first, second) {
  return first === second || Boolean(first && second &&
    ["x", "y", "width", "height"].every(key => first[key] === second[key]));
}

/** Free-page coordinates are already scaled; its outer DOM follows camera pan. */
export function useContextualTaskbarRect(engine, enabled) {
  const [rect, setRect] = useState(null);
  useLayoutEffect(() => {
    if (!enabled || !engine) { setRect(null); return undefined; }
    const sync = () => {
      const bounds = contextualBounds(engine);
      const viewport = engine.getViewport();
      const next = bounds ? {
        x: bounds.x * viewport.zoom + viewport.panX,
        y: bounds.y * viewport.zoom + viewport.panY,
        width: bounds.width * viewport.zoom,
        height: bounds.height * viewport.zoom,
      } : null;
      setRect(previous => sameRect(previous, next) ? previous : next);
    };
    sync();
    return engine.subscribeRender(sync);
  }, [engine, enabled]);
  return rect;
}
