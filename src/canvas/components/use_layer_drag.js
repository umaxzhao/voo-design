import { useCallback, useEffect, useRef, useState } from "react";
import {
  allowedSlotRange,
  childSlotToRootIndex,
  insertionSlotAt,
  slotToDocTarget,
} from "../editor/layer_order.js";
import { computeDropSlot } from "../editor/layer_drag_math.js";

/** Movement that distinguishes a drag from a click, in px. */
export const DRAG_THRESHOLD_PX = 4;
/** Distance from a list edge that starts auto-scrolling, in px. */
const AUTOSCROLL_EDGE_PX = 28;
/** Auto-scroll step per animation frame, in px. */
const AUTOSCROLL_STEP_PX = 10;

/**
 * Pointer-based drag for the layers panel: reorder between rows, or drop
 * onto a row to clip into it.
 *
 * HTML5 drag-and-drop was deliberately avoided: plain pointer events give
 * the insertion indicator and edge auto-scroll for free and work with
 * touch. A press only becomes a drag past DRAG_THRESHOLD_PX, so clicking a
 * row still selects it. Pointer capture is never taken — the trailing click
 * would retarget to the row and break its buttons — so window listeners
 * track the gesture, and the click that follows a real drag is swallowed.
 *
 * While dragging, a pointer resting over a row's middle band (rather than
 * near an insertion gap) marks that row as a clip target: dropping there
 * calls `onDrop(id, null, overId)` so the caller can clip the dragged layer
 * into the target — Photoshop's drag-a-layer-onto-another gesture. Dropping
 * between rows calls `onDrop(id, docIndex)` as before.
 */
export default function useLayerDrag({ listRef, nodes, onDrop }) {
  const [drag, setDrag] = useState(null); // { id, from, slot } while active
  const [overId, setOverId] = useState(null); // row hovered as a clip target
  const sessionRef = useRef(null);

  const finish = useCallback(
    (commit) => {
      const session = sessionRef.current;
      if (!session) return;
      sessionRef.current = null;
      window.removeEventListener("pointermove", session.onMove);
      window.removeEventListener("pointerup", session.onUp);
      window.removeEventListener("pointercancel", session.onCancel);
      window.removeEventListener("keydown", session.onKey, true);
      cancelAnimationFrame(session.frame);
      setDrag(null);
      setOverId(null);
      if (session.active) {
        // The pointerup is followed by a click wherever the pointer rests;
        // after a drag that click must not select another row.
        const swallow = (event) => {
          event.stopPropagation();
          event.preventDefault();
        };
        window.addEventListener("click", swallow, {
          capture: true,
          once: true,
        });
        setTimeout(
          () => window.removeEventListener("click", swallow, { capture: true }),
          0,
        );
      }
      if (!session.active || !commit) return;
      // Dropped on a row: clip the dragged layer into it. Dropped between
      // rows: the ordinary reorder.
      if (session.overId && session.overId !== session.id) {
        onDrop?.(session.id, null, session.overId, session.scope);
        return;
      }
      if (session.isChild && session.scope === "siblings") {
        const target = slotToDocTarget(
          session.siblingNodes.length,
          session.siblingFrom,
          session.slot,
        );
        if (target !== session.siblingDocIndex)
          onDrop?.(session.id, target, null, "siblings");
        return;
      }
      // A group member dropped on a root slot maps straight to a root-plane
      // index — it was never a top-level row, so nothing in the top list
      // lifts out. A top-level row keeps the ordinary reorder math.
      const target = session.isChild
        ? childSlotToRootIndex(nodes.length, session.slot)
        : slotToDocTarget(nodes.length, session.from, session.slot);
      if (target !== session.fromDocIndex)
        onDrop?.(session.id, target, null, "root");
    },
    [nodes.length, onDrop],
  );

  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => () => finishRef.current(false), []);

  /**
   * Attach to a row's onPointerDown. `opts` carries the row: `{ node,
   * position, isChild, range }`. `position` is the row's display position;
   * a group member is `isChild` and is never in the top-level `nodes` list,
   * so its caller supplies `range` (the whole root slot span) and the drop
   * lands on a root-plane index instead of a doc index.
   */
  const beginRowDrag = useCallback(
    (event, opts) => {
      if (event.button !== 0 || sessionRef.current) return;
      // Buttons inside the row keep their own gestures.
      if (event.target.closest("[data-no-drag]")) return;
      const {
        node,
        position,
        isChild = false,
        range,
        parentId = null,
        siblingNodes = [],
      } = opts;
      if (!node || node.locked) return;
      const slotRange = isChild ? range : allowedSlotRange(nodes, node.id);
      if (!slotRange) return;
      const fromDocIndex = isChild ? -1 : nodes.length - 1 - position;

      const session = {
        id: node.id,
        isChild,
        parentId,
        siblingNodes,
        siblingFrom: position,
        siblingDocIndex: siblingNodes.findIndex(
          (candidate) => candidate.id === node.id,
        ),
        scope: "root",
        from: position,
        fromDocIndex,
        startX: event.clientX,
        startY: event.clientY,
        pointerY: event.clientY,
        active: false,
        slot: position,
        range: slotRange,
        overId: null,
        frame: 0,
      };

      const measure = () => {
        const list = listRef.current;
        if (!list) return;
        const rows = Array.from(list.querySelectorAll("[data-layer-row]"));
        const allRects = rows.map((row) => {
          const rect = row.getBoundingClientRect();
          return {
            top: rect.top,
            height: rect.height,
            id: row.getAttribute("data-layer-row-id"),
            position: row.hasAttribute("data-layer-row-position")
              ? Number(row.getAttribute("data-layer-row-position")) : undefined,
            parentId: row.getAttribute("data-layer-parent-id") || null,
          };
        });
        const siblingRects = session.isChild
          ? allRects.filter((row) => row.parentId === session.parentId)
          : [];
        const siblingTop = siblingRects[0]?.top;
        const lastSibling = siblingRects.at(-1);
        const siblingBottom = lastSibling
          ? lastSibling.top + lastSibling.height
          : -Infinity;
        const insideSiblingPlane =
          session.isChild &&
          siblingRects.length > 0 &&
          session.pointerY >= siblingTop - 4 &&
          session.pointerY <= siblingBottom + 4;
        session.scope = insideSiblingPlane ? "siblings" : "root";
        const rects = insideSiblingPlane
          ? siblingRects
          : allRects.filter((row) => row.parentId === null);
        const activeRange = insideSiblingPlane
          ? allowedSlotRange(session.siblingNodes, session.id)
          : session.range;
        const raw = insertionSlotAt(rects, session.pointerY);
        // The slot range is resolved per-row into `session.range`. Pass it
        // explicitly (never a closed-over `opts.range`, which is undefined for
        // a top-level row) so a mis-wiring throws at the pure layer.
        const slot = computeDropSlot(activeRange, raw);
        if (slot !== session.slot) {
          session.slot = slot;
          setDrag({ id: session.id, from: session.from, slot });
        }
        // A pointer over a row's middle area marks that row as a clip target.
        // The band is the row height minus generous edge margins, so a drop
        // near a gap still reorders instead of clipping by surprise, while a
        // drop anywhere on the row body (not just its centre line) clips.
        let over = null;
        for (const row of rects) {
          if (insideSiblingPlane && row.parentId === session.parentId) continue;
          const inset = Math.min(10, row.height * 0.25);
          if (
            session.pointerY >= row.top + inset &&
            session.pointerY <= row.top + row.height - inset &&
            row.id !== session.id
          ) {
            over = row.id;
            break;
          }
        }
        if (over !== session.overId) {
          session.overId = over;
          setOverId(over);
        }
      };

      const tick = () => {
        const list = listRef.current;
        if (list) {
          const rect = list.getBoundingClientRect();
          if (session.pointerY < rect.top + AUTOSCROLL_EDGE_PX) {
            list.scrollTop -= AUTOSCROLL_STEP_PX;
          } else if (session.pointerY > rect.bottom - AUTOSCROLL_EDGE_PX) {
            list.scrollTop += AUTOSCROLL_STEP_PX;
          }
          measure();
        }
        session.frame = requestAnimationFrame(tick);
      };

      session.onMove = (moveEvent) => {
        session.pointerY = moveEvent.clientY;
        if (!session.active) {
          const dist = Math.hypot(
            moveEvent.clientX - session.startX,
            moveEvent.clientY - session.startY,
          );
          if (dist < DRAG_THRESHOLD_PX) return;
          session.active = true;
          setDrag({ id: session.id, from: session.from, slot: session.slot });
          session.frame = requestAnimationFrame(tick);
          return;
        }
        measure();
      };
      session.onUp = () => finishRef.current(true);
      session.onCancel = () => finishRef.current(false);
      session.onKey = (keyEvent) => {
        if (keyEvent.key !== "Escape") return;
        keyEvent.stopPropagation();
        finishRef.current(false);
      };

      sessionRef.current = session;
      window.addEventListener("pointermove", session.onMove);
      window.addEventListener("pointerup", session.onUp);
      window.addEventListener("pointercancel", session.onCancel);
      window.addEventListener("keydown", session.onKey, true);
    },
    [nodes, listRef],
  );

  return {
    dragId: drag?.id ?? null,
    slot: drag?.slot ?? null,
    overId,
    beginRowDrag,
  };
}
