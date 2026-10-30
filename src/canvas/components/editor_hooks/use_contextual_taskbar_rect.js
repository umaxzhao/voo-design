import { useLayoutEffect, useState } from "react";
import {
  boundsOfPoints,
  nodesBounds,
} from "../../editor/scene_geometry_bounds.js";
import { TOOL } from "../../editor/editor_constants.js";

/** A nested selection belongs to the outermost frame, even through groups. */
function outerFrame(engine, node) {
  let current = node;
  let frame = null;
  const visited = new Set();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.isFrame || ["frame", "artboard"].includes(current.kind))
      frame = current;
    current = current.parentId ? engine.getNode?.(current.parentId) : null;
  }
  return frame;
}

/** Keep nested editing tools below the board instead of over its artwork. */
export function contextualBounds(engine) {
  const ids = engine.getSelectedIds?.() ?? [];
  const selected = ids.map((id) => engine.getNode?.(id)).filter(Boolean);
  if (!selected.length && engine.getSelected?.())
    selected.push(engine.getSelected());
  const editing =
    engine.penEdit?.nodeId && engine.getNode?.(engine.penEdit.nodeId);
  const targets = selected.length ? selected : editing ? [editing] : [];
  const frames = targets.map((node) => outerFrame(engine, node));
  if (frames.some(Boolean)) {
    const anchors = new Map(
      targets.map((node, index) => {
        const anchor = frames[index] ?? node;
        return [anchor.id, anchor];
      }),
    );
    return nodesBounds([...anchors.values()]);
  }
  const transform = engine.getSelectionTransform?.();
  if (transform?.rect) return transform.rect;
  const pixels = engine.getPixelSelection?.();
  if (pixels?.contours?.length && pixels.bounds) return pixels.bounds;
  if (selected.length) return nodesBounds(selected);
  const draft = engine.getPenDraft?.();
  if (draft?.anchors?.length)
    return boundsOfPoints(draft.anchors.map(({ x, y }) => [x, y]));
  if (editing) return nodesBounds([editing]);
  const tool = engine.getTool?.();
  if (
    [
      TOOL.PEN,
      TOOL.CURVATURE_PEN,
      TOOL.FREE_PEN,
      TOOL.MARQUEE,
      TOOL.LASSO,
    ].includes(tool)
  ) {
    const doc = engine.getDocument?.();
    if (doc) return { x: 0, y: 0, width: doc.width, height: doc.height };
  }
  return null;
}

function sameRect(first, second) {
  return (
    first === second ||
    Boolean(
      first &&
        second &&
        ["x", "y", "width", "height"].every(
          (key) => first[key] === second[key],
        ),
    )
  );
}

/** Free-page coordinates are already scaled; its outer DOM follows camera pan. */
export function useContextualTaskbarRect(engine, enabled) {
  const [rect, setRect] = useState(null);
  useLayoutEffect(() => {
    if (!enabled || !engine) {
      setRect(null);
      return undefined;
    }
    const sync = () => {
      const bounds = contextualBounds(engine);
      const viewport = engine.getViewport();
      const next = bounds
        ? {
            x: bounds.x * viewport.zoom + viewport.panX,
            y: bounds.y * viewport.zoom + viewport.panY,
            width: bounds.width * viewport.zoom,
            height: bounds.height * viewport.zoom,
          }
        : null;
      setRect((previous) => (sameRect(previous, next) ? previous : next));
    };
    sync();
    return engine.subscribeRender(sync);
  }, [engine, enabled]);
  return rect;
}
