/** Pen path drafting gestures: anchor placement, curvature preview, and commit. */

import * as ops from "./doc_ops.js";
import { createPenNode, findNode } from "./scene_model.js";
import { commitEditorDocument } from "../undo-action-contracts.js";
import {
  closeRadius,
  constrainAngle45,
  distance,
  HANDLE_THRESHOLD,
  projectOntoPath,
  segmentHitRadius,
} from "./editor_pen_math.js";

export function createPenDraft({
  getDoc,
  setDoc,
  select,
  requestRender,
  getZoom,
  getAnchorType,
  getPenMode,
  getEdit,
  /** Multiplier on the derived curvature handles (1 = the classic divide-by-6). */
  getPenCurveTension = null,
}) {
  /** { anchors, activeIndex, down, dragging, current }. */
  let draft = null;

  function beginDraft(point, color, strokeWidth, toolKind = "pen") {
    draft = {
      anchors: [{ x: point.x, y: point.y, in: null, out: null, close: false }],
      activeIndex: 0,
      down: point,
      // The freeform pen captures from the press itself, like a brush
      // stroke — with dragging false here the first drag drew nothing.
      dragging: toolKind === "free_pen",
      current: null,
      color,
      strokeWidth,
      toolKind, // "pen" | "curvature_pen" | "free_pen"
    };
    requestRender();
  }

  /** The anchor currently being placed, or null. */
  function currentAnchor() {
    if (!draft) return null;
    return draft.anchors[draft.activeIndex] ?? null;
  }

  /**
   * Recomputes smooth bezier handles for curvature pen or smooth paths
   * using Catmull-Rom to Cubic Bezier conversion.
   */
  function recomputeCurvatureHandles(anchors) {
    if (!anchors || anchors.length < 2) return;
    const tension = Math.min(
      3,
      Math.max(0.2, Number(getPenCurveTension?.() ?? 1) || 1),
    );
    const n = anchors.length;
    for (let i = 0; i < n; i += 1) {
      if (anchors[i].isCorner) {
        anchors[i].in = null;
        anchors[i].out = null;
        continue;
      }
      const prev =
        anchors[i === 0 ? (anchors[n - 1].close ? n - 1 : 0) : i - 1];
      const next =
        anchors[i === n - 1 ? (anchors[n - 1].close ? 0 : n - 1) : i + 1];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const handleLen = (Math.hypot(dx, dy) / 6) * tension;
      const angle = Math.atan2(dy, dx);
      const hx = Math.cos(angle) * handleLen;
      const hy = Math.sin(angle) * handleLen;

      anchors[i].in = i === 0 && !anchors[n - 1].close ? null : [-hx, -hy];
      anchors[i].out = i === n - 1 && !anchors[n - 1].close ? null : [hx, hy];
    }
  }

  /**
   * The mirrored handle a smooth anchor gets on placement: one third of the
   * way along the segment it came from, so the curve flows through the point.
   * Corner anchors (and the very first anchor) get none.
   */
  function smoothHandleToward(previous, point) {
    if (getAnchorType() !== "smooth" || !previous) return null;
    const dx = point.x - previous.x;
    const dy = point.y - previous.y;
    return [dx / 3, dy / 3];
  }

  /** Appends an anchor to the draft and starts pulling its handle. */
  function appendAnchor(point, options) {
    const previous = draft.anchors[draft.anchors.length - 1];
    const placed =
      options?.constrain && previous
        ? constrainAngle45(previous, point)
        : point;
    const handle = smoothHandleToward(previous, placed);
    draft.anchors.push({
      x: placed.x,
      y: placed.y,
      in: handle ? [-handle[0], -handle[1]] : null,
      out: handle ? handle : null,
      close: false,
    });
    draft.activeIndex = draft.anchors.length - 1;
    draft.down = placed;
    draft.dragging = true;
    draft.current = placed;
    if (draft.toolKind === "curvature_pen") {
      recomputeCurvatureHandles(draft.anchors);
    }
    requestRender();
  }

  /**
   * Pointer-down with the pen tool.
   *
   * A click near the first anchor does NOT close immediately: it is remembered
   * as a close candidate, and pointer-up decides. Committing on pointer-down
   * made it impossible to place a final anchor near the start and drag its
   * handle out — the press alone swallowed the gesture. A drag beyond the
   * handle threshold turns the candidate into an ordinary anchor placement.
   *
   * `options.constrain` (Shift) snaps the new anchor onto the nearest 45° ray
   * from the previous one. Returns true when the path was committed — with the
   * deferred close that never happens here any more, but the contract stays
   * for the caller.
   */
  function penDown(point, color, strokeWidth, toolKind = "pen", options) {
    if (draft && draft.anchors.length > 1) {
      const first = draft.anchors[0];
      if (distance(point, first) <= closeRadius(getZoom)) {
        draft.maybeClose = true;
        draft.down = point;
        draft.current = point;
        requestRender();
        return false;
      }
    }
    if (!draft) {
      beginDraft(point, color, strokeWidth, toolKind);
    } else {
      appendAnchor(point, options);
    }
    return false;
  }

  /**
   * Pulls the current anchor's handle toward the cursor while dragging.
   *
   * `options.independent` (Alt) breaks the mirror: only the out handle is
   * written and the in handle keeps whatever it had, turning the anchor into
   * a free/corner point — the same semantics as Alt in edit mode.
   * `options.constrain` (Shift) snaps the handle direction to 45° steps while
   * keeping the cursor's distance from the anchor.
   */
  function penMove(point, options) {
    if (!draft) return;
    if (draft.maybeClose) {
      if (distance(point, draft.down) <= HANDLE_THRESHOLD) {
        // Still a close click: just track the cursor for the rubber band.
        draft.current = point;
        requestRender();
        return;
      }
      // Dragged out of the snap: the press was a final anchor near the start,
      // not a close. Place it where the press landed and pull its handle.
      draft.maybeClose = false;
      appendAnchor(draft.down, options);
    }
    if (draft.dragging) {
      if (draft.toolKind === "free_pen") {
        // Freeform pen draws continuously like pencil/brush, appending points
        const last = draft.anchors[draft.anchors.length - 1];
        if (!last || distance(last, point) >= 6) {
          draft.anchors.push({
            x: point.x,
            y: point.y,
            in: null,
            out: null,
            close: false,
          });
          draft.activeIndex = draft.anchors.length - 1;
        }
      } else if (draft.toolKind === "curvature_pen") {
        // The curvature tool has no handles to pull — its handles are
        // recomputed from the anchor positions anyway. Dragging repositions
        // the point being placed and the curve follows live.
        const anchor = currentAnchor();
        if (anchor) {
          anchor.x = point.x;
          anchor.y = point.y;
          recomputeCurvatureHandles(draft.anchors);
        }
      } else {
        const anchor = currentAnchor();
        if (anchor) {
          const steered = options?.constrain
            ? constrainAngle45(anchor, point)
            : point;
          const dx = steered.x - anchor.x;
          const dy = steered.y - anchor.y;
          if (Math.hypot(dx, dy) > HANDLE_THRESHOLD) {
            // The out handle steers the next segment; the mirrored in keeps the
            // curve smooth through this anchor — unless Alt breaks the mirror.
            anchor.out = [dx, dy];
            if (!options?.independent) anchor.in = [-dx, -dy];
          }
        }
      }
    }
    draft.current = point;
    requestRender();
  }

  function penUp() {
    if (!draft) return;
    if (draft.maybeClose) {
      // The press near the first anchor never dragged: it was a close click.
      draft.maybeClose = false;
      draft.anchors[draft.anchors.length - 1].close = true;
      if (draft.toolKind === "curvature_pen") {
        recomputeCurvatureHandles(draft.anchors);
      }
      commitDraft();
      return;
    }
    if (draft.toolKind === "free_pen") {
      // Auto smooth freeform anchors, then commit on release like a brush
      // stroke — a freehand path should not wait for Enter.
      recomputeCurvatureHandles(draft.anchors);
      commitDraft();
      return;
    }
    draft.dragging = false;
    requestRender();
  }

  /** Commits the draft as a pen node, or drops it when too small to matter. */
  function commitDraft() {
    if (!draft) return false;
    const { anchors, color, strokeWidth, toolKind } = draft;
    const usable = anchors.filter((anchor) => {
      if (anchor.x !== 0 || anchor.y !== 0 || anchors.length <= 1) return true;
      return false;
    });
    if (anchors.length < 2) {
      draft = null;
      requestRender();
      return false;
    }
    void usable;
    const node = createPenNode(anchors, color, strokeWidth);
    // A freehand doodle is a stroke, not a shape: filling its implicit
    // closure turns every open squiggle into a blob.
    if (getPenMode() === "shape" && toolKind !== "free_pen") {
      node.fill = color;
      node.fillOpacity = 0.85;
    }
    commitEditorDocument(
      "editor.pen.change",
      setDoc,
      ops.addNode(getDoc(), node),
    );
    select(node.id);
    draft = null;
    requestRender();
    return true;
  }

  function cancelDraft() {
    draft = null;
    requestRender();
  }

  /**
   * Backspace while drawing: drops the most recently placed anchor, so a
   * misclick mid-path costs one keystroke instead of the whole draft. Popping
   * the last anchor cancels the draft outright.
   */
  function popDraftAnchor() {
    if (!draft) return false;
    if (draft.anchors.length <= 1) {
      cancelDraft();
      return true;
    }
    draft.anchors.pop();
    draft.activeIndex = draft.anchors.length - 1;
    draft.down = null;
    draft.dragging = false;
    draft.maybeClose = false;
    requestRender();
    return true;
  }

  /**
   * Hover tracking for the live chrome: the rubber band's far end while a
   * draft is open, and the segment-insertion preview while editing. Called
   * from the pointer's no-gesture move branch, the same way the polygonal
   * lasso's preview is.
   */
  function penHover(point) {
    if (draft) {
      draft.current = point;
      if (draft.anchors?.length > 1) {
        const first = draft.anchors[0];
        draft.isClosing = distance(point, first) <= closeRadius(getZoom);
      } else {
        draft.isClosing = false;
      }
      requestRender();
      return;
    }
    const edit = getEdit?.();
    if (edit) {
      edit.hover = point;
      requestRender();
    }
  }

  /**
   * The doc-space point an edit-mode click would insert an anchor at, or null
   * when the hover is not near a segment. Drives the hover preview dot; the
   * insertion itself (`addAnchorAt`) repeats the same projection.
   */
  function insertionPreview() {
    const edit = getEdit?.();
    if (!edit?.hover || edit.dragging) return null;
    const node = findNode(getDoc(), edit.nodeId);
    if (!node) return null;
    const scaleX = node.baseWidth ? node.width / node.baseWidth : 1;
    const scaleY = node.baseHeight ? node.height / node.baseHeight : 1;
    const local = {
      x: (edit.hover.x - node.x) / scaleX,
      y: (edit.hover.y - node.y) / scaleY,
    };
    const best = projectOntoPath(node.points, local);
    // The same threshold addAnchorAt applies, so the dot appears exactly when
    // a click would insert.
    if (!best || best.dist > segmentHitRadius(getZoom)) return null;
    return { x: node.x + best.x * scaleX, y: node.y + best.y * scaleY };
  }

  return {
    beginDraft,
    currentAnchor,
    recomputeCurvatureHandles,
    appendAnchor,
    penDown,
    smoothHandleToward,
    penMove,
    penUp,
    commitDraft,
    cancelDraft,
    popDraftAnchor,
    penHover,
    insertionPreview,
    getDraft: () => draft,
    clearDraft: () => {
      draft = null;
    },
  };
}
