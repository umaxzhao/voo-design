/** Anchor and control-handle editing session for existing pen nodes. */

import * as ops from "./doc_ops.js";
import { findNode, NODE_KIND, penAnchorsBounds } from "./scene_model.js";
import {
  fromNodeLocal,
  toNodeLocal,
  toNodeLocalDelta,
} from "./scene_geometry.js";
import { commitEditorDocument } from "../undo-action-contracts.js";
import {
  CLOSE_THRESHOLD,
  distance,
  projectOntoPath,
  segmentHitRadius,
  splitSegment,
} from "./editor_pen_math.js";
import {
  snapHandle45,
  smartSmoothPenAnchor,
  smoothPenPoints,
  breakPenPointsAtAnchor,
  simplifyPenPoints,
  reversePenPoints,
  toggleClosePenPoints,
} from "./scene_model_paths.js";

export function createPenEdit({
  getDoc,
  setDoc,
  requestRender,
  getZoom,
  notify = () => {},
  onResetSubTool = () => {},
}) {
  /** { nodeId, active, selected, down, dragging: "anchor"|"in"|"out", ... }. */
  let edit = null;

  /** True when the document still has the node we are editing. */
  function isEditing() {
    return Boolean(edit && findNode(getDoc(), edit.nodeId));
  }

  /** Re-opens a finished pen node so its anchors and handles can be reshaped. */
  function beginEdit(nodeId) {
    const node = findNode(getDoc(), nodeId);
    if (!node || node.kind !== NODE_KIND.PATH || node.pen !== true) return;
    // A new session always starts on the move tool: a sub-tool left armed by
    // the previous session would swallow every anchor click (cut/bend/lasso
    // own the press instead), which reads as "anchors can't be selected".
    onResetSubTool();
    edit = {
      nodeId,
      active: 0,
      selected: [0],
      down: null,
      dragging: null,
      handlePointerOrigin: null,
      handleValueOrigin: null,
    };
    requestRender();
    // The sub-tool bar and the pen panel are React: every edit-session
    // transition must notify, or they keep showing for a dead session.
    notify();
  }

  function endEdit() {
    if (!edit) return;
    // A gesture cut short (Escape mid-drag) would otherwise keep its
    // uncommitted frames: the half-finished drag silently becomes the shape,
    // which reads as "the shape jumped when I pressed Escape". Restore the
    // points as they were when the drag started.
    if ((edit.dragging || edit.bend) && edit.preDragPoints) {
      const node = findNode(getDoc(), edit.nodeId);
      if (node) {
        commitEditorDocument(
          "editor.pen.change",
          setDoc,
          ops.updateNode(getDoc(), node.id, {
            ...node,
            points: edit.preDragPoints,
          }),
          { commit: false },
        );
      }
    }
    edit = null;
    onResetSubTool();
    requestRender();
    notify();
  }

  /**
   * The anchor point and handle under a doc point, for edit hit-testing.
   * Returns { anchor, handle } in node-local coordinates scaled to world.
   *
   * The grab radius is screen-constant: at low zoom a fixed doc-space
   * threshold shrinks to a few pixels, which is what made the handle dots
   * feel impossible to grab. 10 screen px, never tighter than the doc-space
   * default.
   */
  function hitTestEdit(point) {
    const node = findNode(getDoc(), edit?.nodeId);
    if (!node) return null;
    const zoom = getZoom?.() || 1;
    const grabRadius = Math.max(CLOSE_THRESHOLD, 10 / zoom);
    const scaleX = node.baseWidth ? node.width / node.baseWidth : 1;
    const scaleY = node.baseHeight ? node.height / node.baseHeight : 1;
    const world = (anchor, handle) => {
      const local = {
        x: (anchor.x + (handle ? handle[0] : 0)) * scaleX,
        y: (anchor.y + (handle ? handle[1] : 0)) * scaleY,
      };
      return fromNodeLocal(node, local);
    };
    const unrotated = (anchor, handle) => ({
      x: node.x + (anchor.x + (handle ? handle[0] : 0)) * scaleX,
      y: node.y + (anchor.y + (handle ? handle[1] : 0)) * scaleY,
    });
    let best = null;
    let bestD = Infinity;
    node.points.forEach((anchor, index) => {
      const a = world(anchor);
      const ua = unrotated(anchor);
      const da = distance(point, a);
      const dua = distance(point, ua);
      const d = Math.min(da, dua);
      if (d < bestD) {
        bestD = d;
        best = { anchor, index, handle: null, point: da <= dua ? a : ua };
      }
      for (const key of ["in", "out"]) {
        if (!anchor[key]) continue;
        const h = world(anchor, anchor[key]);
        const uh = unrotated(anchor, anchor[key]);
        const dh = distance(point, h);
        const duh = distance(point, uh);
        const hd = Math.min(dh, duh);
        if (hd < bestD) {
          bestD = hd;
          best = { anchor, index, handle: key, point: dh <= duh ? h : uh };
        }
      }
    });
    if (best && bestD <= grabRadius) return best;
    return null;
  }

  /**
   * Clicks a point on a path segment to insert an anchor there, then starts
   * dragging it — the Photoshop "add anchor" interaction. The segment is
   * split with a de Casteljau subdivision, so the curve keeps its exact shape
   * through the new point (a plain midpoint insert would flatten every curve).
   * Returns the new anchor's index, or null when nothing was hit.
   */
  function addAnchorAt(point) {
    const node = findNode(getDoc(), edit?.nodeId);
    if (!node || node.points.length < 2) return null;
    const scaleX = node.baseWidth ? node.width / node.baseWidth : 1;
    const scaleY = node.baseHeight ? node.height / node.baseHeight : 1;
    const localDoc = toNodeLocal(node, point);
    const local = {
      x: localDoc.x / scaleX,
      y: localDoc.y / scaleY,
    };

    // Project the click onto the outline. Sampling the actual bezier (rather
    // than projecting onto the chord) matters: on a strongly curved segment
    // the curve can sit tens of pixels off the straight line between anchors,
    // and a click on the curve must still hit.
    const best = projectOntoPath(node.points, local);
    if (!best || best.dist > segmentHitRadius(getZoom)) return null;

    const i = best.index;
    const { left, mid, right } = splitSegment(node.points, i, best.t);
    const points = [...node.points];
    points[i] = left;
    points.splice(i + 1, 0, mid);
    points[i + 2] = right;
    commitEditorDocument(
      "editor.pen.change",
      setDoc,
      ops.updateNode(getDoc(), node.id, { ...node, points }),
    );

    // Grab the new anchor so the click can immediately drag it into place.
    edit.active = i + 1;
    edit.selected = [i + 1];
    edit.preDragPoints = points;
    edit.down = point;
    edit.dragging = "anchor";
    edit.handlePointerOrigin = null;
    edit.handleValueOrigin = null;
    edit.handleAnchor = points[i + 1];
    requestRender();
    return i + 1;
  }

  /**
   * Pointer-down in edit mode: grab an anchor or a handle, select the anchor
   * under the point, or insert an anchor when the click lands on a segment.
   *
   * `options.convert` (Alt) turns a click on an anchor into the convert-point
   * action instead of a drag: a smooth anchor collapses to a corner, a corner
   * grows a mirrored handle pair. Returns true when a drag was started.
   */
  function editDown(point, options) {
    const node = findNode(getDoc(), edit?.nodeId);
    if (!node) return false;
    const hit = hitTestEdit(point);
    if (hit) {
      edit.active = hit.index;
      edit.handleAnchor = hit.anchor;
      if (options?.convert && !hit.handle) {
        const smooth = Boolean(hit.anchor.in || hit.anchor.out);
        convertActiveAnchor(smooth ? "corner" : "smooth");
        return false;
      }
      // Clicking an anchor inside the lasso selection keeps the group so the
      // drag moves all of them; anything else collapses the selection to it.
      if (hit.handle || !edit.selected?.includes(hit.index)) {
        edit.selected = [hit.index];
      }
      // The pre-drag points, so an Escape mid-drag can put the shape back
      // instead of keeping the half-finished drag (see endEdit).
      edit.preDragPoints = node.points;
      edit.down = point;
      edit.dragging = hit.handle ?? "anchor";
      edit.handlePointerOrigin = hit.handle ? { x: point.x, y: point.y } : null;
      edit.handleValueOrigin = hit.handle ? [...hit.anchor[hit.handle]] : null;
      requestRender();
      return true;
    }
    return addAnchorAt(point) !== null;
  }

  /**
   * Drags the active anchor or handle to `point`.
   *
   * A handle drag normally keeps the two handles mirrored — the opposite one
   * follows, so the curve stays smooth through the anchor. Holding Alt
   * (`independent`) moves only the dragged handle and breaks the mirror,
   * Photoshop's way of giving a point two independent handles.
   */
  function editMove(point, options) {
    if (!edit || !edit.dragging || !edit.down) return;
    const node = findNode(getDoc(), edit.nodeId);
    if (!node) return;
    const anchor = node.points[edit.active];
    if (!anchor) return;
    const scaleX = node.baseWidth ? node.width / node.baseWidth : 1;
    const scaleY = node.baseHeight ? node.height / node.baseHeight : 1;
    const localDelta = toNodeLocalDelta(node, {
      x: point.x - edit.down.x,
      y: point.y - edit.down.y,
    });
    const dx = localDelta.x;
    const dy = localDelta.y;
    if (edit.dragging === "anchor") {
      // A drag on a lasso-selected anchor moves the whole group.
      const picked =
        edit.selected?.length && edit.selected.includes(edit.active)
          ? new Set(edit.selected)
          : new Set([edit.active]);
      const next = node.points.map((pt, index) => {
        if (!picked.has(index)) return pt;
        return {
          ...pt,
          x: pt.x + dx / scaleX,
          y: pt.y + dy / scaleY,
        };
      });
      // Uncommitted while dragging: one undo step covers the whole gesture.
      setDoc(ops.updateNode(getDoc(), node.id, { ...node, points: next }), {
        commit: false,
      });
      edit.down = point;
      requestRender();
      return;
    }
    const handle = anchor[edit.dragging];
    // Snapping is path-dependent if each pointer event starts from the prior
    // snapped value. Keep both ends of the gesture fixed so event frequency
    // cannot change the handle's final angle.
    const handlePointerOrigin = edit.handlePointerOrigin ?? edit.down;
    const handleDelta = toNodeLocalDelta(node, {
      x: point.x - handlePointerOrigin.x,
      y: point.y - handlePointerOrigin.y,
    });
    const handleValueOrigin = edit.handleValueOrigin ?? handle;
    const rawNextHandle = handleValueOrigin
      ? [
          handleValueOrigin[0] + handleDelta.x / scaleX,
          handleValueOrigin[1] + handleDelta.y / scaleY,
        ]
      : null;
    const nextHandle =
      options?.constrain && rawNextHandle
        ? snapHandle45(rawNextHandle)
        : rawNextHandle;
    const oppositeKey = edit.dragging === "in" ? "out" : "in";
    const patch = { ...anchor, [edit.dragging]: nextHandle };
    if (!options?.independent && anchor[oppositeKey]) {
      // Mirror the pair around the anchor so the curve stays smooth.
      patch[oppositeKey] = [
        Object.is(-nextHandle[0], -0) ? 0 : -nextHandle[0] || 0,
        Object.is(-nextHandle[1], -0) ? 0 : -nextHandle[1] || 0,
      ];
    }
    const next = node.points.map((pt) => (pt === anchor ? patch : pt));
    setDoc(ops.updateNode(getDoc(), node.id, { ...node, points: next }), {
      commit: false,
    });
    edit.down = point;
    requestRender();
  }

  function editUp() {
    if (!edit) return;
    const dragging = edit.dragging;
    const nodeId = edit.nodeId;
    edit.down = null;
    edit.dragging = null;
    edit.preDragPoints = null;
    edit.handlePointerOrigin = null;
    edit.handleValueOrigin = null;
    // The drag wrote uncommitted frames; commit once so Undo returns to the
    // state before the gesture instead of stepping through every pointer move.
    if (dragging) {
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

  function expandPenNodeBounds(node) {
    const scaleX = node.baseWidth ? node.width / node.baseWidth : 1;
    const scaleY = node.baseHeight ? node.height / node.baseHeight : 1;
    let minX = 0;
    let minY = 0;
    let maxX = node.width / scaleX;
    let maxY = node.height / scaleY;
    node.points.forEach((pt) => {
      minX = Math.min(minX, pt.x);
      minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x);
      maxY = Math.max(maxY, pt.y);
    });
    if (minX >= 0 && minY >= 0 && maxX <= node.width / scaleX && maxY <= node.height / scaleY) {
      return node;
    }
    const shiftX = minX < 0 ? -minX : 0;
    const shiftY = minY < 0 ? -minY : 0;
    const newWidth = Math.max(node.width, (maxX + shiftX) * scaleX);
    const newHeight = Math.max(node.height, (maxY + shiftY) * scaleY);
    const nextPoints = (shiftX > 0 || shiftY > 0)
      ? node.points.map((pt) => ({
          ...pt,
          x: pt.x + shiftX,
          y: pt.y + shiftY,
        }))
      : node.points;

    const rotation = node.rotation ?? 0;
    const shear = node.shear ?? 0;
    let newX = node.x - shiftX * scaleX;
    let newY = node.y - shiftY * scaleY;
    if ((rotation || shear) && (shiftX > 0 || shiftY > 0 || newWidth !== node.width || newHeight !== node.height)) {
      const deltaX = node.x + node.width / 2 - (newX + newWidth / 2);
      const deltaY = node.y + node.height / 2 - (newY + newHeight / 2);
      const radians = (rotation * Math.PI) / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      const tan = Math.tan((shear * Math.PI) / 180);
      const m11 = cos;
      const m12 = cos * tan - sin;
      const m21 = sin;
      const m22 = sin * tan + cos;
      newX = newX + deltaX - (m11 * deltaX + m12 * deltaY);
      newY = newY + deltaY - (m21 * deltaX + m22 * deltaY);
    }
    return {
      ...node,
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight,
      baseWidth: newWidth,
      baseHeight: newHeight,
      points: nextPoints,
    };
  }

  function rebasePenNodeBounds(node, points) {
    const scaleX = node.baseWidth ? node.width / node.baseWidth : 1;
    const scaleY = node.baseHeight ? node.height / node.baseHeight : 1;
    const worldAnchors = points.map((anchor) => ({
      ...anchor,
      x: node.x + anchor.x * scaleX,
      y: node.y + anchor.y * scaleY,
      ...(anchor.in
        ? { in: [anchor.in[0] * scaleX, anchor.in[1] * scaleY] }
        : {}),
      ...(anchor.out
        ? { out: [anchor.out[0] * scaleX, anchor.out[1] * scaleY] }
        : {}),
    }));
    const bounds = penAnchorsBounds(worldAnchors, node.strokeWidth ?? 1);
    const rebasedPoints = worldAnchors.map((anchor) => ({
      ...anchor,
      x: anchor.x - bounds.x,
      y: anchor.y - bounds.y,
    }));
    // Rotation and shear pivot on the box center (see applyNodeTransform and trimmedNodeBox).
    // When deleting or converting anchors changes the box dimensions or origin, compensate
    // the new origin by the rotated center delta so remaining anchors stay fixed in world space.
    const rotation = node.rotation ?? 0;
    const shear = node.shear ?? 0;
    let newX = bounds.x;
    let newY = bounds.y;
    if (rotation || shear) {
      const deltaX = node.x + node.width / 2 - (bounds.x + bounds.width / 2);
      const deltaY = node.y + node.height / 2 - (bounds.y + bounds.height / 2);
      const radians = (rotation * Math.PI) / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      const tan = Math.tan((shear * Math.PI) / 180);
      const m11 = cos;
      const m12 = cos * tan - sin;
      const m21 = sin;
      const m22 = sin * tan + cos;
      newX = bounds.x + deltaX - (m11 * deltaX + m12 * deltaY);
      newY = bounds.y + deltaY - (m21 * deltaX + m22 * deltaY);
    }
    return {
      ...node,
      x: newX,
      y: newY,
      width: bounds.width,
      height: bounds.height,
      baseWidth: bounds.width,
      baseHeight: bounds.height,
      points: rebasedPoints,
    };
  }

  /** Removes the selected anchors; the path stays, one segment shorter each. */
  function deleteActiveAnchor() {
    if (!edit) return;
    const node = findNode(getDoc(), edit.nodeId);
    if (!node || node.points.length <= 2) return;
    const wanted = edit.selected?.length ? edit.selected : [edit.active];
    // A path needs at least two anchors: trim the drop set when the lasso
    // caught more than the path can lose.
    const dropping = new Set(
      wanted.slice(0, Math.max(0, node.points.length - 2)),
    );
    if (dropping.size === 0) return;
    const wasClosed = Boolean(
      node.points[node.points.length - 1]?.close === true ||
        node.points.some((p) => p.close === true),
    );
    const remaining = node.points.filter((_, index) => !dropping.has(index));
    if (wasClosed && remaining.length > 0) {
      remaining[remaining.length - 1] = {
        ...remaining[remaining.length - 1],
        close: true,
      };
    }
    const updated = rebasePenNodeBounds(node, remaining);
    commitEditorDocument(
      "editor.pen.change",
      setDoc,
      ops.updateNode(getDoc(), node.id, updated),
    );
    edit.active = Math.min(edit.active, remaining.length - 1);
    edit.selected = [edit.active];
    requestRender();
  }

  /** Nudges the selected/active anchor(s) by (dx, dy) in document space. */
  function nudgeActiveAnchor(dx, dy) {
    if (!edit || edit.active === null) return false;
    const node = findNode(getDoc(), edit.nodeId);
    if (!node || !Array.isArray(node.points)) return false;
    const scaleX = node.baseWidth ? node.width / node.baseWidth : 1;
    const scaleY = node.baseHeight ? node.height / node.baseHeight : 1;
    const picked = edit.selected?.length
      ? new Set(edit.selected)
      : new Set([edit.active]);
    const next = node.points.map((pt, index) => {
      if (!picked.has(index)) return pt;
      return {
        ...pt,
        x: pt.x + dx / scaleX,
        y: pt.y + dy / scaleY,
      };
    });
    setDoc(ops.updateNode(getDoc(), node.id, { ...node, points: next }), {
      commit: false,
    });
    requestRender();
    return true;
  }

  /**
   * Converts the active anchor between corner and smooth, Photoshop's
   * convert-point action. Corner strips both handles; smooth rebuilds a
   * mirrored pair along the segment directions (a third of the neighbour
   * distance, the same proportion pen tools use elsewhere).
   */
  function convertActiveAnchor(type) {
    if (!edit) return false;
    const node = findNode(getDoc(), edit.nodeId);
    if (!node || !node.points) return false;
    const wanted = edit.selected?.length ? edit.selected : [edit.active];
    if (wanted.length === 0) return false;

    let points = node.points.slice();
    for (const idx of wanted) {
      const anchor = points[idx];
      if (!anchor) continue;
      let patch;
      if (type === "corner") {
        patch = { ...anchor, in: null, out: null };
      } else if (type === "smart") {
        patch = smartSmoothPenAnchor(points, idx);
      } else {
        const prev = points[idx - 1];
        const next = points[idx + 1];
        const dirA = prev ? [anchor.x - prev.x, anchor.y - prev.y] : null;
        const dirB = next ? [next.x - anchor.x, next.y - anchor.y] : null;
        const dir = dirA || dirB;
        if (!dir) continue;
        const length = Math.hypot(dir[0], dir[1]) / 3;
        const hypot = Math.hypot(dir[0], dir[1]) || 1;
        const nx = (dir[0] / hypot) * length;
        const ny = (dir[1] / hypot) * length;
        const inX = Object.is(-nx, -0) ? 0 : -nx || 0;
        const inY = Object.is(-ny, -0) ? 0 : -ny || 0;
        const outX = Object.is(nx, -0) ? 0 : nx || 0;
        const outY = Object.is(ny, -0) ? 0 : ny || 0;
        patch = { ...anchor, in: [inX, inY], out: [outX, outY] };
      }
      points[idx] = patch;
    }
    const updated = rebasePenNodeBounds(node, points);
    commitEditorDocument(
      "editor.pen.change",
      setDoc,
      ops.updateNode(getDoc(), node.id, updated),
    );
    requestRender();
    return true;
  }

  function smoothActivePath(indices = null) {
    if (!edit) return false;
    const node = findNode(getDoc(), edit.nodeId);
    if (!node || !node.points || node.points.length < 3) return false;
    const targets = indices ?? (edit.selected?.length ? edit.selected : null);
    const smoothed = smoothPenPoints(node.points, targets);
    const updated = rebasePenNodeBounds(node, smoothed);
    commitEditorDocument(
      "editor.pen.change",
      setDoc,
      ops.updateNode(getDoc(), node.id, updated),
    );
    requestRender();
    return true;
  }

  function breakActiveCurve() {
    if (!edit) return false;
    const node = findNode(getDoc(), edit.nodeId);
    if (!node || !node.points || node.points.length < 2) return false;
    const res = breakPenPointsAtAnchor(node.points, edit.active);
    if (!res) return false;

    if (res.kind === "open") {
      const updated = rebasePenNodeBounds(node, res.points);
      commitEditorDocument(
        "editor.pen.change",
        setDoc,
        ops.updateNode(getDoc(), node.id, updated),
      );
      edit.active = 0;
      edit.selected = [0];
      requestRender();
      return true;
    }

    if (res.kind === "split") {
      const updatedA = rebasePenNodeBounds(node, res.paths[0]);
      const nodeB = {
        ...node,
        id: crypto.randomUUID(),
        locked: false,
      };
      const updatedB = rebasePenNodeBounds(nodeB, res.paths[1]);
      const doc = getDoc();
      const nextNodes = [];
      for (const n of doc.nodes) {
        if (n.id === node.id) {
          nextNodes.push(updatedA, updatedB);
        } else {
          nextNodes.push(n);
        }
      }
      commitEditorDocument(
        "editor.pen.change",
        setDoc,
        ops.withNodes(doc, nextNodes),
      );
      edit.active = updatedA.points.length - 1;
      edit.selected = [edit.active];
      requestRender();
      return true;
    }
    return false;
  }

  function simplifyActivePath(tolerance = 1.0) {
    if (!edit) return false;
    const node = findNode(getDoc(), edit.nodeId);
    if (!node || !node.points || node.points.length <= 2) return false;
    const simplified = simplifyPenPoints(node.points, tolerance);
    if (simplified.length === node.points.length) return false;
    const updated = rebasePenNodeBounds(node, simplified);
    commitEditorDocument(
      "editor.pen.change",
      setDoc,
      ops.updateNode(getDoc(), node.id, updated),
    );
    edit.active = Math.min(edit.active, simplified.length - 1);
    edit.selected = [edit.active];
    requestRender();
    return true;
  }

  function reverseActivePath() {
    if (!edit) return false;
    const node = findNode(getDoc(), edit.nodeId);
    if (!node || !node.points || node.points.length < 2) return false;
    const reversed = reversePenPoints(node.points);
    const updated = rebasePenNodeBounds(node, reversed);
    commitEditorDocument(
      "editor.pen.change",
      setDoc,
      ops.updateNode(getDoc(), node.id, updated),
    );
    edit.active = node.points.length - 1 - edit.active;
    edit.selected = [edit.active];
    requestRender();
    return true;
  }

  function toggleCloseActivePath() {
    if (!edit) return false;
    const node = findNode(getDoc(), edit.nodeId);
    if (!node || !node.points || node.points.length < 2) return false;
    const toggled = toggleClosePenPoints(node.points);
    const updated = rebasePenNodeBounds(node, toggled);
    commitEditorDocument(
      "editor.pen.change",
      setDoc,
      ops.updateNode(getDoc(), node.id, updated),
    );
    requestRender();
    return true;
  }

  return {
    isEditing,
    beginEdit,
    endEdit,
    hitTestEdit,
    addAnchorAt,
    editDown,
    editMove,
    editUp,
    deleteActiveAnchor,
    nudgeActiveAnchor,
    convertActiveAnchor,
    smoothActivePath,
    breakActiveCurve,
    simplifyActivePath,
    reverseActivePath,
    toggleCloseActivePath,
    getEdit: () => (isEditing() ? edit : null),
    getRawEdit: () => edit,
    clearEdit: () => {
      if (edit) {
        edit = null;
        notify();
      }
    },
    clearEditIfNode: (id) => {
      if (edit?.nodeId === id) {
        edit = null;
        notify();
      }
    },
  };
}
