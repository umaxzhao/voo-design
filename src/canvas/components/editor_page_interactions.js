import { getCanvasType } from "../editor/canvas-composition-model.js";

/** Handlers read this render's current engine and instance selection. */
export function editorPageInteractions({ mixedLayers, engine, resolveCanvas,
  onAdjustView, onOpenCanvasSource, adjustingInstanceId, onCancelAdjustView,
  onFinishAdjustView, selectedInstanceChild, onSelectInstanceChild }) {
  const openInstanceAtPoint = (event) => {
    if (!mixedLayers || !engine) return;
    const point = engine.toDocPoint(event.clientX, event.clientY);
    const hit = engine.nodeAtPoint(point);
    if (hit?.kind !== "canvasInstance") return;
    event.preventDefault();
    event.stopPropagation();
    if (getCanvasType(resolveCanvas?.(hit.sourceCanvasId)) === "3d") {
      engine.selectExactly([hit.id]);
      if (hit.instance?.overrides?.viewLocked !== true) onAdjustView?.(hit.id);
      return;
    }
    if (!onOpenCanvasSource) return;
    onOpenCanvasSource(hit.sourceCanvasId, hit.id);
  };
  const handleAdjustmentKey = (event) => {
    if (!adjustingInstanceId) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancelAdjustView?.();
    } else if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      onFinishAdjustView?.();
    }
  };
  const finishAdjustmentOutside = (event) => {
    if (
      adjustingInstanceId &&
      !event.target.closest?.(`[data-instance-id="${adjustingInstanceId}"]`)
    )
      onFinishAdjustView?.();
    releaseNestedPointerFocus(event);
  };
  const releaseNestedPointerFocus = (event) => {
    if (
      selectedInstanceChild &&
      !event.target.closest?.('[data-testid="editor-three-instance-input"]')
    ) {
      onSelectInstanceChild?.(null);
    }
  };

  return { openInstanceAtPoint, handleAdjustmentKey, finishAdjustmentOutside,
    releaseNestedPointerFocus };
}
