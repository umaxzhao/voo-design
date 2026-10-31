/**
 * Selection pointer gestures for the editor stage.
 *
 * Region annotations and facade composition for pixel selection marquee gestures.
 */

import { NODE_KIND } from "./scene_model.js";
import { normaliseRect, toNodeLocal } from "./scene_geometry.js";
import { commitEditorAction } from "../undo-action-contracts.js";
import { drawingRollbackState } from "./drawing-gesture-transaction.js";
import { createMarqueePointerGestures } from "./editor_pointer_marquee.js";

export function createSelectionPointerGestures(ctx) {
  const {
    api,
    imageAt,
    getGesture,
    setGesture,
  } = ctx;

  const marquee = createMarqueePointerGestures(ctx);

  const selectionModeOf = (event) => {
    if (event.shiftKey && event.altKey) return "intersect";
    if (event.shiftKey) return "union";
    if (event.altKey) return "subtract";
    return api.getSelectionMode?.() ?? "replace";
  };

  function startRegion(event) {
    const point = api.toDocPoint(event.clientX, event.clientY);
    const host =
      api.getRegionTarget?.() === "layer"
        ? (() => {
            const selected = api.getSelected();
            return selected &&
              selected.visible &&
              selected.kind === NODE_KIND.IMAGE
              ? selected
              : null;
          })()
        : imageAt(api.getDocument(), point);
    if (!host) {
      api.setRegionHint?.("editor.region.needImage");
      return;
    }
    api.setRegionHint?.(null);

    const mode = api.getRegionMode();
    if (mode === "remove" || mode === "patch") {
      const size = api.getRemoveBrushSize?.() ?? 48;
      const removeBrushGesture = {
        kind: "removeBrush",
        hostId: host.id,
        size,
        points: [[point.x, point.y]],
      };
      setGesture(removeBrushGesture);
      api.setRemoveStroke?.({ points: removeBrushGesture.points, size });
      return;
    }
    if (mode === "object") {
      const boolMode = selectionModeOf(event);
      setGesture({
        kind: "objectStroke",
        hostId: host.id,
        intent: "select",
        points: [[point.x, point.y]],
        mode: boolMode,
        baseSelection: boolMode === "replace" ? null : api.getPixelSelection(),
      });
      return;
    }

    const drawingRollback = drawingRollbackState(api);
    const local = toNodeLocal(host, point);
    const free = mode === "free";
    const ellipse = mode === "ellipse";
    const node = api.addRegion(
      { x: local.x, y: local.y, width: 0, height: 0 },
      {
        hostId: host.id,
        shape: ellipse ? "ellipse" : undefined,
        commit: false,
      },
    );
    setGesture({
      kind: free ? "regionFree" : "region",
      id: node.id,
      start: point,
      hostId: host.id,
      localStart: local,
      free,
      ellipse,
      drawingRollback,
    });
  }

  function dragRegion(event) {
    const gesture = getGesture();
    const point = api.toDocPoint(event.clientX, event.clientY);
    const host = api
      .getDocument()
      .nodes.find((node) => node.id === gesture.hostId);
    if (!host) return;
    const local = toNodeLocal(host, point);
    const patch = normaliseRect({
      x: gesture.localStart.x,
      y: gesture.localStart.y,
      width: local.x - gesture.localStart.x,
      height: local.y - gesture.localStart.y,
    });
    if (gesture.ellipse) patch.shape = "ellipse";
    api.updateNode(gesture.id, patch, { commit: false });
  }

  function extendFreeRegion(event) {
    const gesture = getGesture();
    const point = api.toDocPoint(event.clientX, event.clientY);
    const host = api
      .getDocument()
      .nodes.find((node) => node.id === gesture.hostId);
    if (!host) return;
    const local = toNodeLocal(host, point);
    const node = api
      .getDocument()
      .nodes.find((candidate) => candidate.id === gesture.id);
    const points = node?.points ?? [gesture.localStart];
    const last = points[points.length - 1];
    if (Math.hypot(local.x - last.x, local.y - last.y) < 1) return;
    api.updateNode(
      gesture.id,
      { points: [...points, local] },
      { commit: false },
    );
  }

  function finishRegion(event, finished) {
    if (api.finishRegion(finished.id)) {
      commitEditorAction("editor.pointer.draw", () =>
        api.commit("editor.history.entry.region"),
      );
    }
  }

  return {
    ...marquee,
    startRegion,
    dragRegion,
    extendFreeRegion,
    finishRegion,
  };
}
