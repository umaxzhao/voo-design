import { useCallback, useEffect, useRef, useState } from "react";

/** Movement (px) that turns a press into a drag. */
const DRAG_THRESHOLD_PX = 6;
/** Hold time (ms) before a touch becomes a drag instead of a scroll. */
const TOUCH_HOLD_MS = 240;

/**
 * Resolves the insertion slot for a pointer position in a vertical page list.
 * Exported for the unit tests: the ordering rule is the only part worth
 * pinning down outside a browser.
 */
export function pageSlotAt(rows, clientY) {
  if (!rows.length) return null;
  for (const row of rows) {
    if (clientY < row.top + row.height / 2) {
      return { targetId: row.id, edge: "before" };
    }
  }
  return { targetId: rows.at(-1).id, edge: "after" };
}

/**
 * Pointer-based page reordering for the page switcher.
 *
 * HTML5 drag-and-drop never fires on touch, so a phone could not reorder
 * pages at all. This mirrors `use_layer_drag.js`: plain pointer events, an
 * insertion slot, and no pointer capture (the trailing click must not
 * re-select a row). The one touch-specific rule is the hold: a list is
 * scrollable, so a touch press only becomes a drag after `TOUCH_HOLD_MS`
 * without movement. Once armed, a non-passive `touchmove` listener keeps the
 * browser from taking the gesture back as a scroll.
 */
export default function usePageSwitcherDrag({ listRef, onDrop }) {
  const [drag, setDrag] = useState(null);
  const sessionRef = useRef(null);

  const rowsNow = useCallback(
    () =>
      Array.from(listRef.current?.querySelectorAll("[data-page-id]") ?? []).map(
        (row) => {
          const rect = row.getBoundingClientRect();
          return {
            id: row.getAttribute("data-page-id"),
            top: rect.top,
            height: rect.height,
          };
        },
      ),
    [listRef],
  );

  const finish = useCallback(
    (commit) => {
      const session = sessionRef.current;
      if (!session) return;
      sessionRef.current = null;
      window.clearTimeout(session.holdTimer);
      window.removeEventListener("pointermove", session.onMove);
      window.removeEventListener("pointerup", session.onUp);
      window.removeEventListener("pointercancel", session.onCancel);
      window.removeEventListener("touchmove", session.stopScroll, {
        passive: false,
      });
      setDrag(null);
      if (!session.armed || !session.moved) return;
      // The pointerup is followed by a click on the row underneath; after a
      // reorder that click must not also change the focused page.
      const swallow = (event) => {
        event.stopPropagation();
        event.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      window.setTimeout(
        () => window.removeEventListener("click", swallow, { capture: true }),
        0,
      );
      if (!commit) return;
      if (session.targetId && session.targetId !== session.id) {
        onDrop?.(session.id, session.targetId, session.edge);
      }
    },
    [onDrop],
  );

  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => () => finishRef.current(false), []);

  const beginRowDrag = useCallback(
    (event, id) => {
      if (event.button !== 0 || sessionRef.current) return;
      if (event.target.closest?.("[data-page-action], input")) return;

      const session = {
        id,
        startY: event.clientY,
        pointerType: event.pointerType,
        armed: false,
        moved: false,
        targetId: null,
        edge: "before",
        holdTimer: 0,
        onMove: null,
        onUp: null,
        onCancel: null,
        stopScroll: (touchEvent) => touchEvent.preventDefault(),
      };

      const arm = () => {
        if (!sessionRef.current || session.armed) return;
        session.armed = true;
        window.addEventListener("touchmove", session.stopScroll, {
          passive: false,
        });
        setDrag({ id, targetId: null, edge: "before" });
      };

      session.onMove = (moveEvent) => {
        if (moveEvent.pointerId !== event.pointerId) return;
        const deltaY = moveEvent.clientY - session.startY;
        if (!session.armed) {
          if (Math.abs(deltaY) < DRAG_THRESHOLD_PX) return;
          if (session.pointerType === "touch") {
            // Moving before the hold elapsed is a scroll, not a drag.
            window.clearTimeout(session.holdTimer);
            finishRef.current(false);
            return;
          }
          arm();
        }
        session.moved = true;
        moveEvent.preventDefault();
        const slot = pageSlotAt(rowsNow(), moveEvent.clientY);
        if (!slot) return;
        session.targetId = slot.targetId;
        session.edge = slot.edge;
        setDrag({ id, targetId: slot.targetId, edge: slot.edge });
      };
      session.onUp = () => finishRef.current(true);
      session.onCancel = () => finishRef.current(false);

      sessionRef.current = session;
      // A mouse press only becomes a drag once it moves; arming on press
      // would swallow the click that opens or renames a page.
      if (event.pointerType === "touch") {
        session.holdTimer = window.setTimeout(arm, TOUCH_HOLD_MS);
      }
      window.addEventListener("pointermove", session.onMove);
      window.addEventListener("pointerup", session.onUp);
      window.addEventListener("pointercancel", session.onCancel);
    },
    [rowsNow],
  );

  return { drag, beginRowDrag, cancelDrag: () => finish(false) };
}
