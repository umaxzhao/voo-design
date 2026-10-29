/**
 * Pointer up and cancel gesture completion dispatcher for the editor stage.
 */

import { commitEditorAction } from "../undo-action-contracts.js";
import { absolutePathEndpoints } from "./shape_geometry.js";
import { TOOL } from "./editor_constants.js";
import { reparentMovedRoots } from "./reparent-moved-roots.js";

export function createPointerFinishDispatcher({ api, setLastBrushPoint }) {
  function finishGesture(event, finished) {
    if (!finished) return;

    if (
      finished.kind === "gradientStop" ||
      finished.kind === "gradientEndpoint" ||
      finished.kind === "gradientLine"
    ) {
      api.setGradientAdjusting?.(false);
    }

    if (finished.kind === "healing") {
      api.setRemoveStroke?.(null);
      if (finished.targetId && finished.points?.length > 0) {
        if (finished.mode === "aiRepair") {
          void api.inpaintAiRepairStroke?.(
            finished.targetId,
            finished.points,
            finished.size,
          );
        } else {
          void api.inpaintLocalStroke(
            finished.targetId,
            finished.points,
            finished.size,
            { patch: false },
          );
        }
      }
      return;
    }

    if (finished.kind === "cloneStamp") {
      api.setRemoveStroke?.(null);
      if (finished.targetId && finished.points?.length > 0) {
        void api.cloneStampStroke(
          finished.targetId,
          finished.points,
          finished.sourceAnchor,
          finished.targetAnchor,
          finished.size,
          finished.hardness,
          finished.opacity,
        );
      }
      const isAligned = api.getCloneAligned?.() ?? true;
      if (!isAligned) {
        api.setCloneSource?.({
          nodeId: finished.targetId,
          point: finished.sourceAnchor,
        });
      }
      return;
    }

    if (finished.kind === "patchLasso") {
      api.setRemoveStroke?.(null);
      if (finished.targetId && finished.points?.length >= 3) {
        api.setPatchDraft?.({
          nodeId: finished.targetId,
          points: finished.points,
          offset: { dx: 0, dy: 0 },
        });
      }
      return;
    }

    if (finished.kind === "patchDrag") {
      const currentDraft = api.getPatchDraft?.();
      const dx = currentDraft?.offset?.dx || 0;
      const dy = currentDraft?.offset?.dy || 0;
      api.clearPatchDraft?.();
      if (
        finished.targetId &&
        finished.patch?.points?.length >= 3 &&
        (Math.abs(dx) > 1 || Math.abs(dy) > 1)
      ) {
        void api.patchBlendStroke?.(
          finished.targetId,
          finished.patch.points,
          dx,
          dy,
        );
      }
      return;
    }

    if (finished.kind === "removeBrush") {
      api.setRemoveStroke?.(null);
      api.setPendingObjectStroke?.({
        nodeId: finished.hostId,
        points: finished.points,
        intent: "remove",
        size: finished.size,
      });
      return;
    }

    if (finished.kind === "objectStroke") {
      if (finished.mode === "replace") {
        api.clearPixelSelection();
      }
      if (finished.points.length >= 3) {
        api.setPendingObjectStroke?.({
          nodeId: finished.hostId,
          points: finished.points,
          intent: finished.intent,
          mode: finished.mode,
          baseSelection: finished.baseSelection,
        });
      }
      return;
    }

    if (
      finished.kind === "perspectiveCorner" ||
      finished.kind === "meshPoint" ||
      finished.kind === "puppetPin" ||
      finished.kind === "endpoint"
    ) {
      commitEditorAction("editor.pointer.transform", () => api.commit());
      return;
    }

    if (finished.kind === "arrow") {
      const node = api
        .getDocument()
        .nodes.find((candidate) => candidate.id === finished.id);
      const endpoints = node ? absolutePathEndpoints(node) : null;
      const tooShort =
        !endpoints ||
        Math.hypot(
          endpoints[1].x - endpoints[0].x,
          endpoints[1].y - endpoints[0].y,
        ) < 4;
      if (tooShort) {
        api.removeNode(finished.id);
        api.select(null);
      } else {
        api.select(finished.id);
        commitEditorAction("editor.pointer.draw", () => api.commit());
      }
      return;
    }

    if (finished.kind === "region" || finished.kind === "regionFree") {
      if (api.finishRegion(finished.id)) {
        commitEditorAction("editor.pointer.draw", () =>
          api.commit("editor.history.entry.region"),
        );
      }
      return;
    }

    if (finished.kind === "marquee") {
      api.setMarquee(null);
      if (!finished.moved || !finished.rect) {
        if (!finished.additive) api.select(null);
        return;
      }
      api.selectWithin(finished.rect, {
        add: finished.additive ? finished.base : null,
      });
      return;
    }

    if (finished.kind === "selectionMove") {
      if (!finished.moved) return;
      const point = api.toDocPoint(event.clientX, event.clientY);
      const dx = point.x - finished.start.x;
      const dy = point.y - finished.start.y;
      void api.movePixelSelection(dx, dy, finished.base);
      return;
    }

    if (finished.kind === "selectionOutlineMove") {
      return;
    }

    if (
      finished.kind === "selectionTransformMove" ||
      finished.kind === "selectionTransformResize" ||
      finished.kind === "selectionTransformRotate"
    ) {
      return;
    }

    if (finished.kind === "pixelMarquee" || finished.kind === "pixelLasso") {
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
      return;
    }

    if (finished.kind === "shape") {
      const node = api
        .getDocument()
        .nodes.find((candidate) => candidate.id === finished.id);
      const tooSmall = !node || node.width < 4 || node.height < 4;
      if (tooSmall) {
        api.removeNode(finished.id);
        api.select(null);
      } else {
        api.select(finished.id);
        commitEditorAction("editor.pointer.draw", () => api.commit());
      }
      return;
    }

    if (finished.kind === "text") {
      api.setTextDraftRect?.(null);
      api.select(finished.id);
      api.setTool(TOOL.SELECT);
      api.beginTextEdit(finished.id);
      return;
    }

    if (finished.kind === "gradient") {
      const end = api.toDocPoint(event.clientX, event.clientY);
      const startColor = api.getColor();
      const endColor = api.getBackgroundColor?.() || "#ffffff";
      void api.applyGradientSelection?.(
        finished.start,
        end,
        startColor,
        endColor,
      );
      return;
    }

    if (finished.kind === "paint") {
      if (finished.tool === TOOL.BRUSH && finished.lastPoint) {
        setLastBrushPoint(finished.lastPoint);
      }
      void api.finishPaintStroke();
      return;
    }

    if (finished.kind === "maskPaint") {
      void api.finishMaskStroke();
      return;
    }

    if (finished.kind === "lasso") {
      api.finishLasso();
      return;
    }

    if (finished.kind === "pen") {
      api.penUp();
      return;
    }
    if (finished.kind === "penEdit") {
      api.editUp();
      return;
    }
    if (finished.kind === "penBend") {
      api.bendUp();
      return;
    }
    if (finished.kind === "penLasso") {
      api.lassoUp();
      return;
    }

    if (
      finished.kind === "move" &&
      !finished.moved &&
      !finished.duplicated &&
      !event?.shiftKey &&
      finished.id
    ) {
      api.select(finished.id);
    }

    if (finished.kind === "move" && finished.moved) {
      const doc = api.getDocument();
      const reparented = reparentMovedRoots(doc, finished.origins);
      if (reparented !== doc) api.setDoc(reparented);
    }

    const changed =
      finished.kind !== "pan" &&
      (!(finished.kind === "move" && !finished.moved) || finished.duplicated);
    if (changed) {
      commitEditorAction("editor.pointer.transform", () => api.commit());
    }
  }

  return { finishGesture };
}
