/**
 * Mask brush session, stroke rasterisation, and collaborator stroke replay.
 * Extracted from editor_mask.js.
 */

import { findNode } from "./scene_model.js";
import { toNodeLocal } from "./scene_geometry.js";
import {
  DEFAULT_MASK_BRUSH_SIZE,
  MASK_BRUSH_MAX,
  MASK_BRUSH_MIN,
} from "./editor_constants.js";

export function createMaskBrush({
  getDoc,
  maskCanvasOf,
  markMaskDirty,
  requestRender,
  notify,
  select,
  getSelectedId,
  setDraftRender = () => {},
  onStrokeFinished,
  queueMaskPersist,
}) {
  /** Active mask-brush session: { nodeId, mode, size, last, implicit }. */
  let maskEdit = null;

  /**
   * Points of the stroke being laid down, in document space.
   *
   * Collected so a finished stroke can be described rather than shipped: a
   * collaborator replays these few hundred numbers with the same brush and
   * gets the same matte, where sending the matte itself would be megabytes.
   */
  let strokePoints = null;

  /**
   * Arms the mask brush on an image node.
   *
   * While armed, pointer drags paint into the node's matte canvas instead of
   * moving nodes: `erase` rubs alpha away (`destination-out`), `restore`
   * paints opacity back (`source-over` — the matte's own colour is irrelevant
   * because the renderer only reads its alpha). A node without a matte gets a
   * fully opaque one on first paint, so the eraser works on untouched images.
   *
   * `implicit` marks an arming that came from the eraser tool rather than the
   * properties panel: it ends itself when the tool changes.
   */
  function beginMaskEdit(id, { implicit = false } = {}) {
    const node = findNode(getDoc(), id);
    if (!node || node.kind !== "image") return false;
    // Re-arming the node already being edited keeps the brush settings.
    if (maskEdit?.nodeId === id) {
      if (maskEdit.implicit !== implicit) maskEdit = { ...maskEdit, implicit };
      return true;
    }
    maskEdit = {
      nodeId: id,
      mode: "erase",
      size: DEFAULT_MASK_BRUSH_SIZE,
      last: null,
      implicit,
    };
    select(id);
    notify();
    return true;
  }

  function endMaskEdit() {
    if (!maskEdit) return;
    maskEdit = null;
    requestRender();
    notify();
  }

  function beginMaskStroke() {
    if (maskEdit) {
      maskEdit.last = null;
      strokePoints = [];
      // Draft mode while the stroke runs: frames repaint at dpr 1.
      setDraftRender(true);
    }
  }

  /** Paints one brush stamp from the previous point to `point` (doc space). */
  function paintMaskStroke(point) {
    if (!maskEdit) return;
    const node = findNode(getDoc(), maskEdit.nodeId);
    if (!node) return;
    strokePoints?.push([point.x, point.y]);
    const canvas = maskCanvasOf(node);
    if (!canvas) return;

    const scaleX = canvas.width / node.width;
    const scaleY = canvas.height / node.height;
    // Doc points go through the node's local frame first, so a stroke on a
    // rotated or sheared node hits the matte texels it visually covers. For
    // an untransformed node `toNodeLocal` is just the x/y offset.
    const local = toNodeLocal(node, point);
    const at = {
      x: local.x * scaleX,
      y: local.y * scaleY,
    };
    const from = maskEdit.last ?? at;

    const maskCtx = canvas.getContext("2d");
    maskCtx.save();
    maskCtx.globalCompositeOperation =
      maskEdit.mode === "erase" ? "destination-out" : "source-over";
    maskCtx.strokeStyle = "#ffffff";
    maskCtx.lineCap = "round";
    maskCtx.lineJoin = "round";
    maskCtx.lineWidth = maskEdit.size * ((scaleX + scaleY) / 2);
    maskCtx.beginPath();
    maskCtx.moveTo(from.x, from.y);
    maskCtx.lineTo(at.x, at.y);
    maskCtx.stroke();
    maskCtx.restore();

    maskEdit.last = at;
    markMaskDirty(node.id);
    requestRender();
  }

  /**
   * Ends the stroke and reports it.
   *
   * The description goes out before the matte is written down, so a
   * collaborator sees the paint appear while this side is still persisting it.
   */
  function finishMaskStroke() {
    if (!maskEdit) return Promise.resolve();
    // Full resolution for the frame after release.
    setDraftRender(false);
    if (strokePoints?.length) {
      onStrokeFinished?.({
        nodeId: maskEdit.nodeId,
        mode: maskEdit.mode,
        size: maskEdit.size,
        points: strokePoints,
      });
    }
    strokePoints = null;
    return queueMaskPersist(maskEdit.nodeId);
  }

  /**
   * Applies a stroke described by another canvas.
   *
   * Routed through the very same paint calls a local stroke uses: one
   * rasteriser means both sides land on the same pixels, and a second
   * implementation here would be a second thing to keep in step.
   */
  function replayMaskStroke({ nodeId, mode, size, points }) {
    if (!Array.isArray(points) || points.length === 0) return;
    // A replay borrows the local paint path but owns no session: remember the
    // selection and any in-flight mask edit, and put both back afterwards —
    // beginMaskEdit selects the node, which must not hijack what the local
    // user is looking at.
    const wasEditing = maskEdit;
    const wasSelectedId = getSelectedId?.() ?? null;
    // The target may be gone (or not an image) by the time the stroke arrives;
    // without this guard the points would land in an unrelated live session.
    if (!beginMaskEdit(nodeId, { implicit: true })) return;
    // Not via beginMaskStroke: a replay must not be reported back out, or the
    // two peers would bounce the same stroke between them for ever.
    maskEdit = {
      ...maskEdit,
      mode: mode ?? "erase",
      size: size ?? maskEdit.size,
      last: null,
    };
    points.forEach(([x, y]) => paintMaskStroke({ x, y }));
    maskEdit.last = null;
    void queueMaskPersist(nodeId);
    // A replay is not an edit session; leave the tool as the user had it.
    if (wasEditing) maskEdit = wasEditing;
    else endMaskEdit();
    if ((getSelectedId?.() ?? null) !== wasSelectedId) select(wasSelectedId);
  }

  function setMaskMode(mode) {
    if (!maskEdit) return;
    maskEdit = { ...maskEdit, mode };
    notify();
  }

  function setMaskBrushSize(size) {
    if (!maskEdit) return;
    // The panel slider and the [ ] shortcuts share these bounds.
    const clamped = Math.min(
      MASK_BRUSH_MAX,
      Math.max(MASK_BRUSH_MIN, Math.round(size)),
    );
    if (clamped === maskEdit.size) return;
    maskEdit = { ...maskEdit, size: clamped };
    notify();
  }

  return {
    getMaskEdit: () => maskEdit,
    beginMaskEdit,
    endMaskEdit,
    beginMaskStroke,
    paintMaskStroke,
    finishMaskStroke,
    replayMaskStroke,
    setMaskMode,
    setMaskBrushSize,
    onNodeRemoved(id) {
      if (maskEdit?.nodeId === id) maskEdit = null;
    },
  };
}
