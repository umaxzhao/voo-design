import { useEffect, useRef } from "react";

const OPEN_DELAY_MS = 120;
const CLOSE_DELAY_MS = 220;

/**
 * Lets a mouse pointer open a toolbar tool's menu just by resting on it, so a
 * click is never needed. Only a menu the hover opened closes again when the
 * pointer leaves; a menu the user opened by clicking the chevron stays until
 * dismissed. Touch and pen keep the existing long-press / chevron behaviour.
 *
 * @param {{open: boolean, openMenu: () => void, close: () => void}} menu
 */
export function useHoverMenu({ open, openMenu, close }) {
  const timerRef = useRef(null);
  const hoverOpenedRef = useRef(false);

  const clear = () => {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  useEffect(() => {
    if (!open) hoverOpenedRef.current = false;
  }, [open]);
  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const onPointerEnter = (event) => {
    if (event.pointerType !== "mouse") return;
    clear();
    if (open) return;
    timerRef.current = window.setTimeout(() => {
      hoverOpenedRef.current = true;
      openMenu();
    }, OPEN_DELAY_MS);
  };

  const onPointerLeave = (event) => {
    if (event.pointerType !== "mouse") return;
    clear();
    if (!hoverOpenedRef.current) return;
    timerRef.current = window.setTimeout(() => {
      hoverOpenedRef.current = false;
      close();
    }, CLOSE_DELAY_MS);
  };

  /**
   * An explicit click takes over: cancels any pending hover open and keeps a
   * hover-opened menu open. Returns true when it did the latter.
   */
  const pin = () => {
    clear();
    const wasHoverOpened = hoverOpenedRef.current;
    hoverOpenedRef.current = false;
    return wasHoverOpened;
  };

  return { onPointerEnter, onPointerLeave, pin, hoverOpenedRef };
}
