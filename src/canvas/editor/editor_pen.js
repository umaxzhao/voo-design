/**
 * The pen tool: a bezier path drawn by clicking anchors and dragging control
 * handles, Photoshop/Figma-style.
 *
 * A click drops a straight anchor; click-drag pulls an out handle out of it
 * (the mirror in handle keeps the curve smooth). Clicking the first anchor
 * closes the path; Enter or double-click finishes it open. Finished paths are
 * ordinary pen nodes — double-clicking one re-opens it for anchor/handle
 * editing.
 *
 * The module owns only the in-flight gesture: the draft anchors while a path
 * is being drawn and the edit target while an existing pen node is being
 * reshaped. Everything it commits goes through setDoc, so history and
 * rendering stay with the engine.
 */

import {
  anchorsInRect,
  bendHandlesThrough,
  CLOSE_THRESHOLD,
  constrainAngle45,
  cubicPoint,
  cutPathPoints,
  penContourRing,
} from "./editor_pen_math.js";
import { createPenDraft } from "./editor_pen_draft.js";
import { createPenEdit } from "./editor_pen_edit.js";
import { createPenSubtools } from "./editor_pen_subtools.js";

export {
  CLOSE_THRESHOLD,
  constrainAngle45,
  cubicPoint,
  bendHandlesThrough,
  anchorsInRect,
  cutPathPoints,
  penContourRing,
};

export function createPenTools({
  getDoc,
  setDoc,
  select,
  requestRender,
  isDisposed,
  getZoom,
  notify = () => {},
}) {
  /**
   * How newly placed anchors default: "corner" leaves them bare; "smooth"
   * gives each one mirrored handles along the direction it came from, so a
   * path drawn without dragging control handles still curves.
   */
  let anchorType = "corner";
  /** "shape" (creates a filled/stroked vector shape) | "path" (creates a path/selection path) */
  let penMode = "shape";
  /**
   * Curvature / freehand handle tension: 1 is the classic Catmull-Rom third,
   * lower values flatten the curve, higher values pull it tighter.
   */
  let penCurveTension = 1;
  /**
   * The active vector-edit sub-tool: "move" (default), "lasso" (marquee
   * multi-select), "bend" (drag a segment into a curve), "cut" (split here).
   */
  let penSubTool = "move";

  const edit = createPenEdit({
    getDoc,
    setDoc,
    requestRender,
    getZoom,
    notify,
    onResetSubTool: () => {
      penSubTool = "move";
    },
  });

  const draft = createPenDraft({
    getDoc,
    setDoc,
    select,
    requestRender,
    getZoom,
    getAnchorType: () => anchorType,
    getPenMode: () => penMode,
    getEdit: edit.getRawEdit,
    getPenCurveTension: () => penCurveTension,
  });

  const subtools = createPenSubtools({
    getDoc,
    setDoc,
    requestRender,
    getZoom,
    getRawEdit: edit.getRawEdit,
    endEdit: edit.endEdit,
  });

  return {
    // Engine-core hooks.
    onDocRestored() {
      draft.clearDraft();
      edit.clearEdit();
    },
    onNodeRemoved(id) {
      edit.clearEditIfNode(id);
    },
    clear() {
      draft.clearDraft();
      edit.clearEdit();
    },

    api: {
      // Drawing.
      penDown: draft.penDown,
      penMove: draft.penMove,
      penUp: draft.penUp,
      penHover: draft.penHover,
      finishPen: draft.commitDraft,
      cancelPen: draft.cancelDraft,
      popDraftAnchor: draft.popDraftAnchor,
      // Editing.
      beginEdit: edit.beginEdit,
      endEdit: edit.endEdit,
      editDown: edit.editDown,
      editMove: edit.editMove,
      editUp: edit.editUp,
      deleteActiveAnchor: edit.deleteActiveAnchor,
      deleteSelectedAnchor: edit.deleteActiveAnchor,
      nudgeActiveAnchor: edit.nudgeActiveAnchor,
      convertActiveAnchor: edit.convertActiveAnchor,
      smoothActivePath: edit.smoothActivePath,
      breakActiveCurve: edit.breakActiveCurve,
      simplifyActivePath: edit.simplifyActivePath,
      reverseActivePath: edit.reverseActivePath,
      toggleCloseActivePath: edit.toggleCloseActivePath,
      insertionPreview: draft.insertionPreview,
      // Edit sub-tools (Figma's vector-edit toolbelt).
      bendDown: subtools.bendDown,
      bendMove: subtools.bendMove,
      bendUp: subtools.bendUp,
      lassoDown: subtools.lassoDown,
      lassoMove: subtools.lassoMove,
      lassoUp: subtools.lassoUp,
      cutAt: subtools.cutAt,
      setPenSubTool(tool) {
        penSubTool = ["lasso", "bend", "cut"].includes(tool) ? tool : "move";
      },
      getPenSubTool: () => penSubTool,
      setAnchorType(mode) {
        anchorType = mode === "smooth" ? "smooth" : "corner";
      },
      getAnchorType: () => anchorType,
      setPenCurveTension(tension) {
        penCurveTension = Math.min(
          3,
          Math.max(0.2, Number(tension) || 1),
        );
        const active = draft.getDraft();
        if (active) {
          draft.recomputeCurvatureHandles(active.anchors);
          requestRender();
        }
      },
      getPenCurveTension: () => penCurveTension,
      setPenMode(mode) {
        penMode = mode === "path" ? "path" : "shape";
      },
      getPenMode: () => penMode,
      getDraft: draft.getDraft,
      getEdit: edit.getEdit,
      isEditing: edit.isEditing,
      isDisposed,
    },
  };
}
