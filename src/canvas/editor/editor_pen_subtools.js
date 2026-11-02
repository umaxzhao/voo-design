/** Vector editing sub-tools: bend, lasso, and cut operations. */

import * as ops from "./doc_ops.js";
import { findNode, newId } from "./scene_model.js";
import { toNodeLocal } from "./scene_geometry.js";
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
  expandPenNodeBounds = (node) => node,
  rebasePenNodeBounds = (node, points) => ({ ...node, points }),
}) {
  const scaledLocalOf = (node, point) => {
    const scaleX = node.baseWidth ? node.width / node.baseWidth : 1;
    const scaleY = node.baseHeight ? node.height / node.baseHeight : 1;
    const raw = toNodeLocal(node, point);
    return { x: raw.x / scaleX, y: raw.y / scaleY };
  };

  /**
   * Bend: pointer-down on a segment remembers where the drag grabbed the
   * curve (segment index and parameter t), so the drag can pull that exact
   * point around. Returns true when a segment was hit.
   */
  function bendDown(point) {
    const edit = getRawEdit();
    const node = findNode(getDoc(), edit?.nodeId);
    if (!node || node.points.length < 2) return false;
    const local = scaledLocalOf(node, point);
    const best = projectOntoPath(node.points, local);
    if (!best || best.dist > segmentHitRadius(getZoom)) return false;
    edit.bend = { index: best.index, t: best.t, moved: false };
    // As with anchor drags: the pre-bend points let an Escape mid-drag put
    // the shape back (see endEdit).
    edit.preDragPoints = node.points;
    edit.preDragNode = node;
    requestRender();
    return true;
  }

  /** Pulls the grabbed curve point to the cursor; one undo step on release. */
  function bendMove(point) {
    const edit = getRawEdit();
    const node = findNode(getDoc(), edit?.nodeId);
    if (!node || !edit?.bend) return;
    const { index, t } = edit.bend;
    const a = node.points[index];
    const b = node.points[index + 1];
    if (!a || !b) return;
    const handles = bendHandlesThrough(a, b, t, scaledLocalOf(node, point));
    if (!handles) return;
    const next = node.points.map((pt, i) => {
      if (i === index) return { ...pt, out: handles.out };
      if (i === index + 1) return { ...pt, in: handles.in };
      return pt;
    });
    edit.bend.moved = true;
    setDoc(ops.updateNode(getDoc(), node.id, { ...node, points: next }), {
      commit: false,
    });
    requestRender();
  }

  function bendUp() {
    const edit = getRawEdit();
    if (!edit?.bend) return;
    const moved = Boolean(edit.bend.moved);
    const nodeId = edit.nodeId;
    edit.bend = null;
    edit.preDragPoints = null;
    edit.preDragNode = null;
    // The drag wrote uncommitted frames; commit once so Undo returns to the
    // state before the gesture, the same contract editUp keeps.
    if (moved) {
      const node = findNode(getDoc(), nodeId);
      if (node) {
        const rebased = expandPenNodeBounds(node);
        setDoc(ops.updateNode(getDoc(), node.id, rebased), { commit: false });
      }
      commitEditorDocument("editor.pen.change", setDoc, getDoc(), {
        commit: true,
      });
    }
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
    const local = scaledLocalOf(node, point);
    const best = projectOntoPath(node.points, local);
    if (!best || best.dist > segmentHitRadius(getZoom)) return false;
    const closed = node.points[node.points.length - 1]?.close === true;
    const halves = cutPathPoints(node.points, best.index, best.t, closed);
    if (closed || halves.length === 1) {
      // One open chain replaces the original node in place.
      const updated = rebasePenNodeBounds(node, halves[0]);
      commitEditorDocument(
        "editor.pen.change",
        setDoc,
        ops.updateNode(getDoc(), node.id, updated),
      );
    } else {
      const first = rebasePenNodeBounds(node, halves[0]);
      const second = rebasePenNodeBounds(
        { ...node, id: newId(), locked: false },
        halves[1],
      );
      const doc = getDoc();
      const nextNodes = [];
      for (const candidate of doc.nodes) {
        if (candidate.id === node.id) {
          nextNodes.push(first, second);
        } else {
          nextNodes.push(candidate);
        }
      }
      commitEditorDocument(
        "editor.pen.change",
        setDoc,
        ops.withNodes(doc, nextNodes),
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
