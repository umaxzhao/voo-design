/**
 * Marquee, lasso, wand, and pixel selection pointer gestures for the editor stage.
 *
 * Extracted from editor_pointer.js and editor_pointer_selection.js.
 */

import {
  ellipseContour,
  rectContour,
  wandSelectFromBitmap,
} from "./pixel_selection.js";
import { contourBounds } from "./mask_contour.js";
import { NODE_KIND, nodeRect } from "./scene_model.js";
import { toNodeLocal } from "./scene_geometry.js";
import { commitEditorAction } from "../undo-action-contracts.js";

export function createMarqueePointerGestures({
  api,
  imageAt,
  pointInContours,
  getGesture,
  setGesture,
}) {
  const clampToImage = (point, image) => {
    const rect = nodeRect(image);
    return {
      x: Math.max(rect.x, Math.min(rect.x + rect.width, point.x)),
      y: Math.max(rect.y, Math.min(rect.y + rect.height, point.y)),
    };
  };

  /**
   * How a new selection combines with the one already on screen.
   *
   * Photoshop modifier semantics (applied at drag/click start):
   *   Shift        → union      (add to selection)
   *   Alt/Option   → subtract   (remove from selection)
   *   Shift + Alt  → intersect  (keep only the overlap)
   */
  const selectionModeOf = (event) => {
    if (event.shiftKey && event.altKey) return "intersect";
    if (event.shiftKey) return "union";
    if (event.altKey) return "subtract";
    return api.getSelectionMode?.() ?? "replace";
  };

  function startPixelMarquee(event) {
    const rawPoint = api.toDocPoint(event.clientX, event.clientY);
    const existing = api.getPixelSelection?.();
    if (
      !event.shiftKey &&
      !event.altKey &&
      existing?.contours?.length &&
      pointInContours(existing, rawPoint)
    ) {
      setGesture({
        kind: "selectionOutlineMove",
        start: rawPoint,
        base: existing,
        moved: false,
      });
      return;
    }
    const selected = api.getSelected?.();
    const host =
      imageAt(api.getDocument(), rawPoint) ??
      (selected?.kind === NODE_KIND.IMAGE &&
      !selected.locked &&
      !selected.lockImagePixels
        ? selected
        : null) ??
      api
        .getDocument()
        ?.nodes?.slice()
        ?.reverse()
        ?.find(
          (node) =>
            node.kind === NODE_KIND.IMAGE &&
            node.visible !== false &&
            !node.locked &&
            !node.lockImagePixels,
        );
    if (!host) {
      if (selectionModeOf(event) === "replace") api.clearPixelSelection();
      return;
    }
    const point = clampToImage(rawPoint, host);
    const hostId = host.id;
    const previousSelection = api.getPixelSelection?.() ?? null;
    const baseSelection =
      selectionModeOf(event) === "replace" ? null : previousSelection;
    setGesture(
      api.getMarqueeMode?.() === "lasso"
        ? {
            kind: "pixelLasso",
            hostId,
            bounds: nodeRect(host),
            points: [[point.x, point.y]],
            mode: selectionModeOf(event),
            baseSelection,
            previousSelection,
            moved: false,
          }
        : {
            kind: "pixelMarquee",
            start: point,
            hostId,
            bounds: nodeRect(host),
            mode: selectionModeOf(event),
            baseSelection,
            previousSelection,
            moved: false,
          },
    );
    if (getGesture().mode === "replace") api.clearPixelSelection();
  }

  function clickPolygonVertex(event) {
    const point = api.toDocPoint(event.clientX, event.clientY);
    const draft = api.getPolygonDraft?.();
    if (draft) {
      const zoom = api.getViewport?.()?.zoom || 1;
      const snapRadius = 16 / zoom;
      const start = draft.points[0];
      if (
        start &&
        draft.points.length >= 3 &&
        Math.hypot(point.x - start[0], point.y - start[1]) <= snapRadius
      ) {
        api.closePolygonLasso();
        return;
      }
      api.addPolygonVertex(point);
      return;
    }
    const host = imageAt(api.getDocument(), point);
    const hostId = host?.id ?? api.getSelectedId?.() ?? null;
    api.startPolygonLasso(hostId, point, selectionModeOf(event));
    setGesture(null);
  }

  function clickMagneticAnchor(event) {
    const point = api.toDocPoint(event.clientX, event.clientY);
    const draft = api.getMagneticLassoDraft?.();
    const host = draft
      ? api.getDocument()?.nodes?.find((node) => node.id === draft.nodeId)
      : imageAt(api.getDocument(), point);
    if (!host) {
      api.setRegionHint?.("editor.magneticLasso.needImage", "error");
      return;
    }
    api.clickMagneticLasso?.(host.id, point, selectionModeOf(event));
    setGesture(null);
  }

  function startWandSelect(event) {
    const point = api.toDocPoint(event.clientX, event.clientY);
    const host = imageAt(api.getDocument(), point);
    if (!host) {
      api.clearPixelSelection();
      return;
    }
    let bitmap = api.getNodeBitmap?.(host);
    let local = toNodeLocal(host, point);
    let sampleNode = host;
    const composite = api.getWandComposite?.();
    if (composite) {
      bitmap = composite.bitmap;
      sampleNode = composite.node;
      local = {
        x: point.x - composite.node.x,
        y: point.y - composite.node.y,
      };
    }
    if (!bitmap) {
      api.clearPixelSelection();
      return;
    }
    const tolerance = api.getWandTolerance?.() ?? 32;
    const contiguous = api.getWandContiguous?.() ?? true;
    const antiAlias = api.getWandAntiAlias?.() ?? true;
    const sel = wandSelectFromBitmap(bitmap, local, sampleNode, tolerance, {
      contiguous,
      antiAlias,
      sampleSize: api.getWandSampleSize?.(),
    });
    const mode = selectionModeOf(event);
    if (sel) {
      api.combinePixelSelection(
        api.getPixelSelection(),
        { ...sel, nodeId: host.id },
        mode,
      );
      const feather = api.getSelectionFeather?.() ?? 0;
      if (feather > 0) {
        api.featherPixelSelection?.(feather);
      }
      commitEditorAction("editor.pointer.selection", () =>
        api.commit?.("editor.history.entry.wand"),
      );
    } else if (mode === "replace") {
      api.clearPixelSelection();
    }
    setGesture(null);
  }

  function dragPixelLasso(event) {
    const gesture = getGesture();
    const rawPoint = api.toDocPoint(event.clientX, event.clientY);
    const point = {
      x: Math.max(
        gesture.bounds.x,
        Math.min(gesture.bounds.x + gesture.bounds.width, rawPoint.x),
      ),
      y: Math.max(
        gesture.bounds.y,
        Math.min(gesture.bounds.y + gesture.bounds.height, rawPoint.y),
      ),
    };
    const last = gesture.points[gesture.points.length - 1];
    if (Math.hypot(point.x - last[0], point.y - last[1]) < 1) return;
    gesture.points.push([point.x, point.y]);
    if (gesture.points.length < 3) return;
    gesture.moved = true;
    const contours = [gesture.points.slice()];
    const selection = {
      nodeId: gesture.hostId,
      contours,
      bounds: contourBounds(contours),
    };
    api.combinePixelSelection(
      gesture.baseSelection ?? null,
      selection,
      gesture.mode ?? "replace",
    );
  }

  function dragPixelMarquee(event) {
    const gesture = getGesture();
    gesture.moved = true;
    const rawPoint = api.toDocPoint(event.clientX, event.clientY);
    const point = {
      x: Math.max(
        gesture.bounds.x,
        Math.min(gesture.bounds.x + gesture.bounds.width, rawPoint.x),
      ),
      y: Math.max(
        gesture.bounds.y,
        Math.min(gesture.bounds.y + gesture.bounds.height, rawPoint.y),
      ),
    };
    let width = point.x - gesture.start.x;
    let height = point.y - gesture.start.y;
    const MIN_MARQUEE = 8;
    if (Math.abs(width) < 1 && Math.abs(height) < 1) {
      width =
        gesture.bounds.width >= MIN_MARQUEE
          ? MIN_MARQUEE
          : gesture.bounds.width;
      height =
        gesture.bounds.height >= MIN_MARQUEE
          ? MIN_MARQUEE
          : gesture.bounds.height;
      width = Math.min(
        width,
        gesture.bounds.x + gesture.bounds.width - gesture.start.x,
      );
      height = Math.min(
        height,
        gesture.bounds.y + gesture.bounds.height - gesture.start.y,
      );
    }
    const shiftOnly = event.shiftKey && !event.altKey;
    const altOnly = event.altKey && !event.shiftKey;
    if (shiftOnly) {
      const side = Math.max(Math.abs(width), Math.abs(height));
      width = Math.sign(width || 1) * side;
      height = Math.sign(height || 1) * side;
    }
    const anchorX = altOnly ? gesture.start.x - width : gesture.start.x;
    const anchorY = altOnly ? gesture.start.y - height : gesture.start.y;
    const rect = { x: anchorX, y: anchorY, width, height };
    const contours =
      api.getMarqueeMode?.() === "ellipse"
        ? ellipseContour(rect)
        : rectContour(rect);
    if (contours.length === 0) {
      api.clearPixelSelection();
      return;
    }
    api.combinePixelSelection(
      gesture.baseSelection ?? null,
      {
        nodeId: gesture.hostId,
        contours,
        bounds: contourBounds(contours),
      },
      gesture.mode ?? "replace",
    );
  }

  function startLassoDrag(event) {
    const point = api.toDocPoint(event.clientX, event.clientY);
    const selected = api.getSelected();
    let hit =
      selected?.kind === NODE_KIND.IMAGE
        ? selected
        : imageAt(api.getDocument(), point);
    if (!hit) {
      const anyNode = api.nodeAtPoint(point);
      if (anyNode?.kind === NODE_KIND.IMAGE) hit = anyNode;
    }
    if (!hit) return;
    api.startLasso(hit.id, point);
    setGesture({ kind: "lasso" });
  }

  function finishPixelSelection(event, finished) {
    const feather = api.getSelectionFeather?.() ?? 0;
    if (feather > 0) {
      api.featherPixelSelection?.(feather);
    }
    commitEditorAction("editor.pointer.selection", () =>
      api.commit?.(
        finished.kind === "pixelLasso"
          ? "editor.history.entry.lasso"
          : "editor.history.entry.marquee",
      ),
    );
  }

  function finishMarquee(event, finished) {
    api.setMarquee(null);
    if (!finished.moved || !finished.rect) {
      api.select(null);
      return;
    }
    api.selectWithin(finished.rect, {
      add: finished.additive ? finished.base : null,
    });
  }

  return {
    startPixelMarquee,
    dragPixelMarquee,
    clickPolygonVertex,
    clickMagneticAnchor,
    startWandSelect,
    dragPixelLasso,
    startLassoDrag,
    finishPixelSelection,
    finishMarquee,
  };
}
