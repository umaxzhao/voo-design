/** Vector editing sub-tools: bend, lasso, and cut operations. */

import * as ops from "./doc_ops.js";
import { findNode, newId } from "./scene_model.js";
import { commitEditorDocument } from "../undo-action-contracts.js";
import {
  anchorsInRect,
  bendHandlesThrough,
  cutPathPoints,
  projectOntoPath,
  segmentHitRadius,
} from "./editor_pen_math.js";

export function createPenSubtools({
  getDoc,
  setDoc,
  requestRender,
  getZoom,
  getRawEdit,
  endEdit,
}) {
  /**
   * Bend: pointer-down on a segment remembers where the drag grabbed the
   * curve (segment index and parameter t), so the drag can pull that exact
   * point around. Returns true when a segment was hit.
   */
  function bendDown(point) {
    const edit = getRawEdit();
    const node = findNode(getDoc(), edit?.nodeId);
    if (!node || node.points.length < 2) return false;
    const scaleX = node.baseWidth ? node.width / node.baseWidth : 1;
    const scaleY = node.baseHeight ? node.height / node.baseHeight : 1;
    const local = {
      x: (point.x - node.x) / scaleX,
      y: (point.y - node.y) / scaleY,
    };
    const best = projectOntoPath(node.points, local);
    if (!best || best.dist > segmentHitRadius(getZoom)) return false;
    edit.bend = { index: best.index, t: best.t };
    // As with anchor drags: the pre-bend points let an Escape mid-drag put
    // the shape back (see endEdit).
    edit.preDragPoints = node.points;
    requestRender();
    return true;
  }

  /** Pulls the grabbed curve point to the cursor; one undo step on release. */
  function bendMove(point) {
    const edit = getRawEdit();
    const node = findNode(getDoc(), edit?.nodeId);
    if (!node || !edit?.bend) return;
    const { index, t } = edit.bend;
    const scaleX = node.baseWidth ? node.width / node.baseWidth : 1;
    const scaleY = node.baseHeight ? node.height / node.baseHeight : 1;
    const a = node.points[index];
    const b = node.points[index + 1];
    if (!a || !b) return;
    const handles = bendHandlesThrough(a, b, t, {
      x: (point.x - node.x) / scaleX,
      y: (point.y - node.y) / scaleY,
    });
    if (!handles) return;
    const next = node.points.map((pt, i) => {
      if (i === index) return { ...pt, out: handles.out };
      if (i === index + 1) return { ...pt, in: handles.in };
      return pt;
    });
    setDoc(ops.updateNode(getDoc(), node.id, { ...node, points: next }), {
      commit: false,
    });
    requestRender();
  }

  function bendUp() {
    const edit = getRawEdit();
    if (!edit?.bend) return;
    edit.bend = null;
    edit.preDragPoints = null;
    // The drag wrote uncommitted frames; commit once so Undo returns to the
    // state before the gesture, the same contract editUp keeps.
    commitEditorDocument("editor.pen.change", setDoc, getDoc(), {
      commit: true,
    });
    requestRender();
  }

  /** Lasso: begins the marquee that multi-selects anchors. */
  function lassoDown(point) {
    const edit = getRawEdit();
    if (!edit) return;
    edit.lasso = { start: point, current: point };
    requestRender();
  }

  function lassoMove(point) {
    const edit = getRawEdit();
    if (!edit?.lasso) return;
    edit.lasso.current = point;
    requestRender();
  }

  function lassoUp() {
    const edit = getRawEdit();
    const node = findNode(getDoc(), edit?.nodeId);
    if (!edit?.lasso) return;
    const { start, current } = edit.lasso;
    edit.lasso = null;
    if (node) {
      const picked = anchorsInRect(node, {
        x0: Math.min(start.x, current.x),
        y0: Math.min(start.y, current.y),
        x1: Math.max(start.x, current.x),
        y1: Math.max(start.y, current.y),
      });
      if (picked.length > 0) {
        edit.selected = picked;
        edit.active = picked[0];
      }
    }
    requestRender();
  }

  /**
   * Cut: splits the path where the click lands. An open path becomes two pen
   * nodes (each half keeps the original curve's shape); a closed path opens
   * at the cut. One setDoc, so Undo restores the whole path in one step.
   * Returns true when the cut happened.
   */
  function cutAt(point) {
    const edit = getRawEdit();
    const node = findNode(getDoc(), edit?.nodeId);
    if (!node || node.points.length < 2) return false;
    const scaleX = node.baseWidth ? node.width / node.baseWidth : 1;
    const scaleY = node.baseHeight ? node.height / node.baseHeight : 1;
    const local = {
      x: (point.x - node.x) / scaleX,
      y: (point.y - node.y) / scaleY,
    };
    const best = projectOntoPath(node.points, local);
    if (!best || best.dist > segmentHitRadius(getZoom)) return false;
    const closed = node.points[node.points.length - 1]?.close === true;
    const halves = cutPathPoints(node.points, best.index, best.t, closed);
    if (closed || halves.length === 1) {
      // One open chain replaces the original node in place.
      commitEditorDocument(
        "editor.pen.change",
        setDoc,
        ops.updateNode(getDoc(), node.id, { ...node, points: halves[0] }),
      );
    } else {
      // Both halves keep the original node's box: the anchors are stored
      // relative to it, so the two new nodes need no re-normalisation.
      const second = { ...node, id: newId(), points: halves[1] };
      commitEditorDocument(
        "editor.pen.change",
        setDoc,
        ops.addNode(
          ops.updateNode(getDoc(), node.id, { ...node, points: halves[0] }),
          second,
        ),
      );
    }
    endEdit();
    return true;
  }

  return {
    bendDown,
    bendMove,
    bendUp,
    lassoDown,
    lassoMove,
    lassoUp,
    cutAt,
  };
}
